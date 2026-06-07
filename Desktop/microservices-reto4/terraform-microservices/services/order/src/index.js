// services/order/src/index.js
'use strict';

const express   = require('express');
const { Pool }  = require('pg');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { SNSClient, PublishCommand }     = require('@aws-sdk/client-sns');
const { v4: uuidv4 } = require('uuid');
const AWSXRay   = require('aws-xray-sdk');

AWSXRay.config([AWSXRay.plugins.ECSPlugin]);
const app = express();
app.use(express.json());
app.use(AWSXRay.express.openSegment('order-service'));

const pool = new Pool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'microservicesdb',
  port:     parseInt(process.env.DB_PORT || '5432'),
  ssl:      { rejectUnauthorized: false },
  max: 10,
});

const sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });

const ORDER_QUEUE_URL = process.env.ORDER_QUEUE_URL;
const SNS_TOPIC_ARN   = process.env.SNS_TOPIC_ARN;

const requireAuth = (req, res, next) => {
  req.userId = req.headers['x-jwt-subject'];
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  next();
};

const publishEvent = async (eventType, payload) => {
  await snsClient.send(new PublishCommand({
    TopicArn: SNS_TOPIC_ARN,
    Message:  JSON.stringify({ eventType, ...payload, ts: new Date().toISOString() }),
    MessageAttributes: {
      eventType: { DataType: 'String', StringValue: eventType },
    },
  }));
};

// ── Order status machine ───────────────────────
const VALID_TRANSITIONS = {
  PENDING:    ['CONFIRMED', 'CANCELLED'],
  CONFIRMED:  ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED:    ['DELIVERED'],
  DELIVERED:  [],
  CANCELLED:  [],
};

// ── Health ─────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'order-service', ts: new Date().toISOString() })
);

// POST /orders — create a new order
app.post('/', requireAuth, async (req, res) => {
  const { items, shippingAddress } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'items is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Calculate total from product service (internal HTTP call or DB join)
    const productIds = items.map(i => i.productId);
    const products   = await client.query(
      'SELECT id,price,stock,name FROM products WHERE id = ANY($1) AND deleted_at IS NULL',
      [productIds]
    );

    const productMap = {};
    products.rows.forEach(p => { productMap[p.id] = p; });

    let total = 0;
    for (const item of items) {
      const p = productMap[item.productId];
      if (!p) throw Object.assign(new Error(`Product ${item.productId} not found`), { status: 404 });
      if (p.stock < item.quantity)
        throw Object.assign(new Error(`Insufficient stock for ${p.name}`), { status: 422 });
      total += parseFloat(p.price) * item.quantity;
    }

    const orderId = uuidv4();
    await client.query(
      `INSERT INTO orders(id,user_id,status,total,shipping_address,created_at)
       VALUES($1,$2,'PENDING',$3,$4,NOW())`,
      [orderId, req.userId, total, JSON.stringify(shippingAddress)]
    );

    for (const item of items) {
      const p = productMap[item.productId];
      await client.query(
        `INSERT INTO order_items(id,order_id,product_id,quantity,unit_price)
         VALUES($1,$2,$3,$4,$5)`,
        [uuidv4(), orderId, item.productId, item.quantity, p.price]
      );
      // Reserve stock
      await client.query(
        'UPDATE products SET stock=stock-$1 WHERE id=$2',
        [item.quantity, item.productId]
      );
    }

    await client.query('COMMIT');

    // Publish event to SNS
    await publishEvent('ORDER_CREATED', {
      orderId, userId: req.userId, total,
      items: items.map(i => ({ productId: i.productId, quantity: i.quantity, price: productMap[i.productId].price })),
    });

    return res.status(201).json({ id: orderId, userId: req.userId, status: 'PENDING', total, shippingAddress, items });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('create order error', err);
    return res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  } finally {
    client.release();
  }
});

// GET /orders — list user orders
app.get('/', requireAuth, async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  let where = ['o.user_id=$1', 'o.deleted_at IS NULL'];
  const params = [req.userId];

  if (status && status !== 'all') { params.push(status.toUpperCase()); where.push(`o.status=$${params.length}`); }
  params.push(parseInt(limit), offset);

  const result = await pool.query(
    `SELECT o.id,o.status,o.total,o.created_at,o.updated_at,
            json_agg(json_build_object('productId',oi.product_id,'quantity',oi.quantity,'unitPrice',oi.unit_price)) AS items
     FROM orders o
     JOIN order_items oi ON oi.order_id=o.id
     WHERE ${where.join(' AND ')}
     GROUP BY o.id
     ORDER BY o.created_at DESC
     LIMIT $${params.length-1} OFFSET $${params.length}`,
    params
  );

  return res.json({ data: result.rows, page: parseInt(page), limit: parseInt(limit) });
});

// GET /orders/:id
app.get('/:id', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT o.*,
            json_agg(json_build_object('productId',oi.product_id,'quantity',oi.quantity,'unitPrice',oi.unit_price)) AS items
     FROM orders o
     JOIN order_items oi ON oi.order_id=o.id
     WHERE o.id=$1 AND o.user_id=$2
     GROUP BY o.id`,
    [req.params.id, req.userId]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Order not found' });
  return res.json(result.rows[0]);
});

// PATCH /orders/:id/cancel
app.patch('/:id/cancel', requireAuth, async (req, res) => {
  const result = await pool.query(
    'SELECT id,status FROM orders WHERE id=$1 AND user_id=$2',
    [req.params.id, req.userId]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Order not found' });

  const order = result.rows[0];
  if (!VALID_TRANSITIONS[order.status]?.includes('CANCELLED'))
    return res.status(422).json({ error: `Cannot cancel order in status ${order.status}` });

  await pool.query(
    "UPDATE orders SET status='CANCELLED', updated_at=NOW() WHERE id=$1",
    [req.params.id]
  );

  await publishEvent('ORDER_CANCELLED', { orderId: req.params.id, userId: req.userId, reason: req.body.reason });

  return res.json({ id: req.params.id, status: 'CANCELLED' });
});

// PATCH /orders/:id/status  (admin)
app.patch('/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  const result = await pool.query('SELECT id,status FROM orders WHERE id=$1', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Order not found' });

  const current = result.rows[0].status;
  if (!VALID_TRANSITIONS[current]?.includes(status.toUpperCase()))
    return res.status(422).json({ error: `Invalid transition from ${current} to ${status}` });

  await pool.query(
    'UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2',
    [status.toUpperCase(), req.params.id]
  );
  await publishEvent('ORDER_UPDATED', { orderId: req.params.id, previousStatus: current, newStatus: status.toUpperCase() });
  return res.json({ id: req.params.id, status: status.toUpperCase() });
});

app.use(AWSXRay.express.closeSegment());

const PORT = parseInt(process.env.PORT || '8083');
app.listen(PORT, () => console.log(`order-service listening on :${PORT}`));
module.exports = app;
