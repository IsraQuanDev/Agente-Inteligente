// services/product/src/index.js
'use strict';

const express   = require('express');
const { Pool }  = require('pg');
const redis     = require('ioredis');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const AWSXRay   = require('aws-xray-sdk');

AWSXRay.config([AWSXRay.plugins.ECSPlugin]);
const app = express();
app.use(express.json());
app.use(AWSXRay.express.openSegment('product-service'));

const pool = new Pool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'microservicesdb',
  port:     parseInt(process.env.DB_PORT || '5432'),
  ssl:      { rejectUnauthorized: false },
  max: 10,
});

const cache = new redis({
  host:      process.env.REDIS_HOST,
  port:      parseInt(process.env.REDIS_PORT || '6379'),
  tls:       {},
  retryStrategy: (t) => Math.min(t * 100, 3000),
});

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const S3_BUCKET = process.env.S3_BUCKET;

const requireAuth = (req, _res, next) => {
  req.userId = req.headers['x-jwt-subject'];
  next();
};

// ── Health ─────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'product-service', ts: new Date().toISOString() })
);

// GET /products — list with pagination + filter
app.get('/', requireAuth, async (req, res) => {
  const { page = 1, limit = 20, category, search, minPrice, maxPrice } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const cacheKey = `products:${JSON.stringify(req.query)}`;
  const cached   = await cache.get(cacheKey);
  if (cached) return res.json(JSON.parse(cached));

  let where = ['deleted_at IS NULL'];
  const params = [];

  if (category) { params.push(category); where.push(`category=$${params.length}`); }
  if (search)   { params.push(`%${search}%`); where.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length})`); }
  if (minPrice) { params.push(minPrice); where.push(`price >= $${params.length}`); }
  if (maxPrice) { params.push(maxPrice); where.push(`price <= $${params.length}`); }

  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(parseInt(limit), offset);

  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT id,name,description,price,stock,category,sku,image_url,created_at
       FROM products ${whereSQL}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    ),
    pool.query(`SELECT COUNT(*) FROM products ${whereSQL}`, params.slice(0, -2)),
  ]);

  const payload = { data: rows.rows, total: parseInt(count.rows[0].count), page: parseInt(page), limit: parseInt(limit) };
  await cache.setex(cacheKey, 60, JSON.stringify(payload));
  return res.json(payload);
});

// GET /products/:id
app.get('/:id', requireAuth, async (req, res) => {
  const cached = await cache.get(`product:${req.params.id}`);
  if (cached) return res.json(JSON.parse(cached));

  const result = await pool.query(
    'SELECT * FROM products WHERE id=$1 AND deleted_at IS NULL',
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Product not found' });

  await cache.setex(`product:${req.params.id}`, 300, JSON.stringify(result.rows[0]));
  return res.json(result.rows[0]);
});

// POST /products
app.post('/', requireAuth, async (req, res) => {
  const { name, description, price, stock, category, sku } = req.body;
  if (!name || !price || !sku) return res.status(400).json({ error: 'name, price and sku are required' });

  const id = uuidv4();
  const result = await pool.query(
    `INSERT INTO products(id,name,description,price,stock,category,sku,created_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
    [id, name, description, price, stock || 0, category, sku]
  );

  await cache.del('products:*');
  return res.status(201).json(result.rows[0]);
});

// PUT /products/:id
app.put('/:id', requireAuth, async (req, res) => {
  const { name, description, price, category } = req.body;
  const result = await pool.query(
    `UPDATE products SET name=$1,description=$2,price=$3,category=$4,updated_at=NOW()
     WHERE id=$5 AND deleted_at IS NULL RETURNING *`,
    [name, description, price, category, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Product not found' });

  await cache.del(`product:${req.params.id}`);
  return res.json(result.rows[0]);
});

// PATCH /products/:id/stock
app.patch('/:id/stock', requireAuth, async (req, res) => {
  const { quantity, operation } = req.body;  // operation: 'add' | 'subtract' | 'set'
  if (!quantity || !operation) return res.status(400).json({ error: 'quantity and operation required' });

  let stockSQL;
  if (operation === 'add')      stockSQL = `stock + ${parseInt(quantity)}`;
  else if (operation === 'subtract') stockSQL = `GREATEST(0, stock - ${parseInt(quantity)})`;
  else if (operation === 'set') stockSQL = `${parseInt(quantity)}`;
  else return res.status(400).json({ error: 'operation must be add|subtract|set' });

  const result = await pool.query(
    `UPDATE products SET stock=${stockSQL}, updated_at=NOW() WHERE id=$1 RETURNING id,stock`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Product not found' });

  await cache.del(`product:${req.params.id}`);
  return res.json(result.rows[0]);
});

// DELETE /products/:id  (soft)
app.delete('/:id', requireAuth, async (req, res) => {
  await pool.query('UPDATE products SET deleted_at=NOW() WHERE id=$1', [req.params.id]);
  await cache.del(`product:${req.params.id}`);
  return res.json({ message: 'Product deleted' });
});

app.use(AWSXRay.express.closeSegment());

const PORT = parseInt(process.env.PORT || '8082');
app.listen(PORT, () => console.log(`product-service listening on :${PORT}`));
module.exports = app;
