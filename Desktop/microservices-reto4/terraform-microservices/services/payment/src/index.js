// services/payment/src/index.js
'use strict';

const express  = require('express');
const { Pool } = require('pg');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { SNSClient, PublishCommand }     = require('@aws-sdk/client-sns');
const { v4: uuidv4 } = require('uuid');
const AWSXRay  = require('aws-xray-sdk');

AWSXRay.config([AWSXRay.plugins.ECSPlugin]);
const app = express();
app.use(express.json());
app.use(AWSXRay.express.openSegment('payment-service'));

const pool = new Pool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'microservicesdb',
  port:     parseInt(process.env.DB_PORT || '5432'),
  ssl:      { rejectUnauthorized: false },
  max: 10,
});

const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

// ── Stripe client ──────────────────────────────
// In production, use the real stripe npm package:
// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// Here we mock to keep the demo self-contained.
const stripe = {
  paymentIntents: {
    create: async ({ amount, currency, metadata }) => ({
      id:            `pi_${uuidv4().replace(/-/g,'')}`,
      client_secret: `pi_secret_${uuidv4()}`,
      status:        'requires_payment_method',
      amount,
      currency,
    }),
    confirm: async (id, { payment_method }) => ({
      id,
      status: 'succeeded',
    }),
    retrieve: async (id) => ({ id, status: 'succeeded' }),
  },
  refunds: {
    create: async ({ payment_intent, amount }) => ({
      id:     `re_${uuidv4().replace(/-/g,'')}`,
      amount,
      status: 'succeeded',
    }),
  },
};

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

// ── Health ─────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'payment-service', ts: new Date().toISOString() })
);

// POST /payments/intent — create payment intent
app.post('/intent', requireAuth, async (req, res) => {
  const { orderId, currency = 'usd' } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId required' });

  // Fetch order total
  const orderResult = await pool.query(
    'SELECT id,total,status FROM orders WHERE id=$1 AND user_id=$2',
    [orderId, req.userId]
  );
  if (!orderResult.rows.length) return res.status(404).json({ error: 'Order not found' });
  const order = orderResult.rows[0];
  if (order.status === 'CANCELLED')
    return res.status(422).json({ error: 'Cannot pay for a cancelled order' });

  const amountCents = Math.round(parseFloat(order.total) * 100);

  const intent = await stripe.paymentIntents.create({
    amount:   amountCents,
    currency,
    metadata: { orderId, userId: req.userId },
  });

  const paymentId = uuidv4();
  await pool.query(
    `INSERT INTO payments(id,order_id,user_id,stripe_intent_id,amount,currency,status,created_at)
     VALUES($1,$2,$3,$4,$5,$6,'PENDING',NOW())`,
    [paymentId, orderId, req.userId, intent.id, order.total, currency]
  );

  return res.status(201).json({
    paymentId,
    orderId,
    amount:       order.total,
    currency,
    clientSecret: intent.client_secret,
    status:       'PENDING',
  });
});

// POST /payments/:id/confirm
app.post('/:id/confirm', requireAuth, async (req, res) => {
  const { paymentMethodId } = req.body;
  const result = await pool.query(
    'SELECT * FROM payments WHERE id=$1 AND user_id=$2',
    [req.params.id, req.userId]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Payment not found' });
  const payment = result.rows[0];

  if (payment.status === 'COMPLETED')
    return res.status(422).json({ error: 'Payment already completed' });

  try {
    const confirmed = await stripe.paymentIntents.confirm(payment.stripe_intent_id, {
      payment_method: paymentMethodId,
    });

    const newStatus = confirmed.status === 'succeeded' ? 'COMPLETED' : 'FAILED';

    await pool.query(
      'UPDATE payments SET status=$1, updated_at=NOW() WHERE id=$2',
      [newStatus, payment.id]
    );

    if (newStatus === 'COMPLETED') {
      // Update order to CONFIRMED
      await pool.query(
        "UPDATE orders SET status='CONFIRMED', updated_at=NOW() WHERE id=$1",
        [payment.order_id]
      );
      await publishEvent('PAYMENT_COMPLETED', {
        paymentId: payment.id, orderId: payment.order_id,
        userId: req.userId, amount: payment.amount,
      });
    }

    return res.json({ paymentId: payment.id, status: newStatus, orderId: payment.order_id });
  } catch (err) {
    await pool.query("UPDATE payments SET status='FAILED' WHERE id=$1", [payment.id]);
    console.error('payment confirm error', err);
    return res.status(500).json({ error: 'Payment processing failed' });
  }
});

// GET /payments/:id
app.get('/:id', requireAuth, async (req, res) => {
  const result = await pool.query(
    'SELECT id,order_id,amount,currency,status,created_at,updated_at FROM payments WHERE id=$1 AND user_id=$2',
    [req.params.id, req.userId]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Payment not found' });
  return res.json(result.rows[0]);
});

// POST /payments/:id/refund  (admin)
app.post('/:id/refund', requireAuth, async (req, res) => {
  const { amount, reason } = req.body;
  const result = await pool.query(
    'SELECT * FROM payments WHERE id=$1',
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Payment not found' });
  const payment = result.rows[0];

  if (payment.status !== 'COMPLETED')
    return res.status(422).json({ error: 'Can only refund completed payments' });

  const refundAmountCents = Math.round((amount || parseFloat(payment.amount)) * 100);

  const refund = await stripe.refunds.create({
    payment_intent: payment.stripe_intent_id,
    amount:         refundAmountCents,
  });

  const refundId = uuidv4();
  await pool.query(
    `INSERT INTO refunds(id,payment_id,stripe_refund_id,amount,reason,status,created_at)
     VALUES($1,$2,$3,$4,$5,'COMPLETED',NOW())`,
    [refundId, payment.id, refund.id, amount || payment.amount, reason]
  );

  await pool.query("UPDATE payments SET status='REFUNDED', updated_at=NOW() WHERE id=$1", [payment.id]);
  await publishEvent('PAYMENT_REFUNDED', { paymentId: payment.id, refundId, orderId: payment.order_id, amount });

  return res.json({ refundId, paymentId: payment.id, amount, status: 'COMPLETED' });
});

app.use(AWSXRay.express.closeSegment());

const PORT = parseInt(process.env.PORT || '8084');
app.listen(PORT, () => console.log(`payment-service listening on :${PORT}`));
module.exports = app;
