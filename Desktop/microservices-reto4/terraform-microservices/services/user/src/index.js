// services/user/src/index.js
'use strict';

const express  = require('express');
const { Pool } = require('pg');
const redis    = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const AWSXRay  = require('aws-xray-sdk');

AWSXRay.config([AWSXRay.plugins.ECSPlugin]);
const app = express();
app.use(express.json());
app.use(AWSXRay.express.openSegment('user-service'));

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

// ── Middleware: extract userId from API GW headers ──
const requireAuth = (req, res, next) => {
  const userId = req.headers['x-jwt-subject'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = userId;
  req.userEmail = req.headers['x-jwt-email'];
  next();
};

// ── Health ─────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'user-service', ts: new Date().toISOString() })
);

// GET /users/me
app.get('/me', requireAuth, async (req, res) => {
  const cacheKey = `user:${req.userId}`;
  const cached   = await cache.get(cacheKey);
  if (cached) return res.json(JSON.parse(cached));

  const result = await pool.query(
    'SELECT id,email,first_name,last_name,phone,avatar_url,created_at,updated_at FROM users WHERE id=$1',
    [req.userId]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'User not found' });

  const user = result.rows[0];
  const dto  = {
    id:        user.id,
    email:     user.email,
    firstName: user.first_name,
    lastName:  user.last_name,
    phone:     user.phone,
    avatarUrl: user.avatar_url,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };

  await cache.setex(cacheKey, 300, JSON.stringify(dto));
  return res.json(dto);
});

// PUT /users/me
app.put('/me', requireAuth, async (req, res) => {
  const { firstName, lastName, phone } = req.body;
  const result = await pool.query(
    `UPDATE users
     SET first_name=$1, last_name=$2, phone=$3, updated_at=NOW()
     WHERE id=$4
     RETURNING id,email,first_name,last_name,phone,updated_at`,
    [firstName, lastName, phone, req.userId]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'User not found' });

  await cache.del(`user:${req.userId}`);

  const u = result.rows[0];
  return res.json({
    id: u.id, email: u.email,
    firstName: u.first_name, lastName: u.last_name,
    phone: u.phone, updatedAt: u.updated_at,
  });
});

// DELETE /users/me  (soft delete)
app.delete('/me', requireAuth, async (req, res) => {
  await pool.query(
    'UPDATE users SET deleted_at=NOW() WHERE id=$1',
    [req.userId]
  );
  await cache.del(`user:${req.userId}`);
  return res.json({ message: 'Account scheduled for deletion' });
});

// GET /users/:id  (admin scope — check role claim)
app.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    'SELECT id,email,first_name,last_name,created_at FROM users WHERE id=$1 AND deleted_at IS NULL',
    [id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'User not found' });

  const u = result.rows[0];
  return res.json({ id: u.id, email: u.email, firstName: u.first_name, lastName: u.last_name, createdAt: u.created_at });
});

// GET /users?page&limit  (admin)
app.get('/', requireAuth, async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page  || '1'));
  const limit = Math.min(100, parseInt(req.query.limit || '20'));
  const offset = (page - 1) * limit;

  const [rows, count] = await Promise.all([
    pool.query(
      'SELECT id,email,first_name,last_name,created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    ),
    pool.query('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL'),
  ]);

  return res.json({
    data:  rows.rows.map(u => ({ id: u.id, email: u.email, firstName: u.first_name, lastName: u.last_name, createdAt: u.created_at })),
    total: parseInt(count.rows[0].count),
    page,
    limit,
  });
});

app.use(AWSXRay.express.closeSegment());

const PORT = parseInt(process.env.PORT || '8081');
app.listen(PORT, () => console.log(`user-service listening on :${PORT}`));
module.exports = app;
