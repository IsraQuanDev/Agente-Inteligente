// services/auth/src/index.js
'use strict';

const express    = require('express');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const redis      = require('ioredis');
const { Pool }   = require('pg');
const AWSXRay    = require('aws-xray-sdk');

// ── Tracer setup ─────────────────────────────
AWSXRay.config([AWSXRay.plugins.ECSPlugin]);
const http  = AWSXRay.captureHTTPs(require('http'));
const https = AWSXRay.captureHTTPs(require('https'));

const app = express();
app.use(express.json());
app.use(AWSXRay.express.openSegment('auth-service'));

// ── DB / Redis clients ────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME     || 'microservicesdb',
  port:     parseInt(process.env.DB_PORT || '5432'),
  ssl:      { rejectUnauthorized: false },
  max: 10,
});

const redisClient = new redis({
  host:      process.env.REDIS_HOST,
  port:      parseInt(process.env.REDIS_PORT || '6379'),
  tls:       {},
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

const JWT_SECRET   = process.env.JWT_SECRET;
const JWT_ISSUER   = process.env.JWT_ISSUER;
const JWT_EXPIRES  = parseInt(process.env.JWT_EXPIRES_IN || '3600');
const REFRESH_TTL  = 7 * 24 * 3600; // 7 days

// ── Helpers ────────────────────────────────────
const signAccess = (payload) =>
  jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES,
    issuer:    JWT_ISSUER,
    algorithm: 'HS256',
  });

const signRefresh = () => uuidv4();

const storeRefresh = async (token, userId) => {
  await redisClient.setex(`refresh:${token}`, REFRESH_TTL, userId);
};

// ── Routes ──────────────────────────────────────

// Health check (no auth)
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'auth-service', ts: new Date().toISOString() })
);

// POST /auth/register
app.post('/register', async (req, res) => {
  const { email, password, firstName, lastName } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  try {
    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email already registered' });

    const hash   = await bcrypt.hash(password, 12);
    const userId = uuidv4();
    await pool.query(
      'INSERT INTO users(id,email,password_hash,first_name,last_name,created_at) VALUES($1,$2,$3,$4,$5,NOW())',
      [userId, email, hash, firstName, lastName]
    );

    const accessToken  = signAccess({ sub: userId, email });
    const refreshToken = signRefresh();
    await storeRefresh(refreshToken, userId);

    return res.status(201).json({
      user:         { id: userId, email, firstName, lastName },
      accessToken,
      refreshToken,
      expiresIn:    JWT_EXPIRES,
    });
  } catch (err) {
    console.error('register error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  // Rate limit: max 10 failed attempts per 15 min
  const failKey = `login_fail:${email}`;
  const fails   = await redisClient.get(failKey);
  if (parseInt(fails || '0') >= 10)
    return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });

  try {
    const result = await pool.query(
      'SELECT id,email,password_hash,first_name,last_name FROM users WHERE email=$1',
      [email]
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      await redisClient.multi()
        .incr(failKey)
        .expire(failKey, 900)
        .exec();
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await redisClient.del(failKey);

    const accessToken  = signAccess({ sub: user.id, email: user.email });
    const refreshToken = signRefresh();
    await storeRefresh(refreshToken, user.id);

    return res.json({
      user:         { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name },
      accessToken,
      refreshToken,
      expiresIn:    JWT_EXPIRES,
    });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/refresh
app.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

  const userId = await redisClient.get(`refresh:${refreshToken}`);
  if (!userId)   return res.status(401).json({ error: 'Invalid or expired refresh token' });

  const result = await pool.query('SELECT id,email FROM users WHERE id=$1', [userId]);
  const user   = result.rows[0];
  if (!user)    return res.status(401).json({ error: 'User not found' });

  // Rotate refresh token
  await redisClient.del(`refresh:${refreshToken}`);
  const newAccess  = signAccess({ sub: user.id, email: user.email });
  const newRefresh = signRefresh();
  await storeRefresh(newRefresh, user.id);

  return res.json({ accessToken: newAccess, refreshToken: newRefresh, expiresIn: JWT_EXPIRES });
});

// GET /auth/validate  — requires JWT (injected by API GW as X-JWT-Subject)
app.get('/validate', (req, res) => {
  const sub   = req.headers['x-jwt-subject'];
  const email = req.headers['x-jwt-email'];
  if (!sub) return res.status(401).json({ error: 'Missing JWT claims' });
  return res.json({ valid: true, userId: sub, email });
});

// POST /auth/logout
app.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) await redisClient.del(`refresh:${refreshToken}`);
  return res.json({ message: 'Logged out successfully' });
});

app.use(AWSXRay.express.closeSegment());

// ── Start ──────────────────────────────────────
const PORT = parseInt(process.env.PORT || '8080');
app.listen(PORT, () => console.log(`auth-service listening on :${PORT}`));

module.exports = app; // for tests
