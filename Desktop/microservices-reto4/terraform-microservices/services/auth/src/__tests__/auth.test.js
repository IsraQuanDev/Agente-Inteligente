// services/auth/src/__tests__/auth.test.js
'use strict';

// ── Mocks must be declared BEFORE require('../index') ──
jest.mock('ioredis', () => {
  const store = {};
  return jest.fn().mockImplementation(() => ({
    setex: jest.fn((k, _ttl, v) => { store[k] = v; return Promise.resolve('OK'); }),
    get:   jest.fn((k)           => Promise.resolve(store[k] || null)),
    del:   jest.fn((k)           => { delete store[k]; return Promise.resolve(1); }),
    multi: jest.fn(() => ({
      incr:   jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec:   jest.fn().mockResolvedValue([]),
    })),
  }));
});

const mockQuery = jest.fn();
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({ query: mockQuery })),
}));

jest.mock('aws-xray-sdk', () => ({
  config: jest.fn(),
  plugins: { ECSPlugin: {} },
  captureHTTPs: (m) => m,
  express: {
    openSegment:  () => (_req, _res, next) => next(),
    closeSegment: () => (_err, _req, _res, next) => { if (next) next(); },
  },
}));

process.env.JWT_SECRET  = 'test-secret-32-chars-long-enough!';
process.env.JWT_ISSUER  = 'http://test-issuer';
process.env.JWT_EXPIRES_IN = '3600';

const request = require('supertest');
const app     = require('../index');

const HASHED_PASSWORD = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN.0/m67lAqsJz2v5.0PW'; // Admin123!

// ──────────────────────────────────────────────
describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('auth-service');
  });
});

// ──────────────────────────────────────────────
describe('POST /register', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 400 when email missing', async () => {
    const res = await request(app).post('/register')
      .send({ password: 'Test1234!' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('returns 409 when email already exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-uuid' }] });
    const res = await request(app).post('/register')
      .send({ email: 'exists@test.com', password: 'Test1234!' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already/i);
  });

  it('creates user and returns tokens', async () => {
    // check existing (empty) → insert
    mockQuery
      .mockResolvedValueOnce({ rows: [] })           // SELECT — no conflict
      .mockResolvedValueOnce({ rows: [] });           // INSERT

    const res = await request(app).post('/register')
      .send({ email: 'new@test.com', password: 'Test1234!', firstName: 'John', lastName: 'Doe' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.email).toBe('new@test.com');
  });
});

// ──────────────────────────────────────────────
describe('POST /login', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 401 for wrong password', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'uuid-1', email: 'user@test.com', password_hash: HASHED_PASSWORD,
               first_name: 'John', last_name: 'Doe' }],
    });
    const res = await request(app).post('/login')
      .send({ email: 'user@test.com', password: 'WrongPass!' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('returns tokens for correct credentials', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'uuid-1', email: 'user@test.com', password_hash: HASHED_PASSWORD,
               first_name: 'John', last_name: 'Doe' }],
    });
    const res = await request(app).post('/login')
      .send({ email: 'user@test.com', password: 'Admin123!' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.id).toBe('uuid-1');
  });

  it('returns 400 when body is empty', async () => {
    const res = await request(app).post('/login').send({});
    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────
describe('POST /refresh', () => {
  it('returns 400 when refreshToken missing', async () => {
    const res = await request(app).post('/refresh').send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 for unknown token', async () => {
    // redis.get returns null → invalid
    const res = await request(app).post('/refresh')
      .send({ refreshToken: 'nonexistent-token' });
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────
describe('GET /validate', () => {
  it('returns 401 when X-JWT-Subject header missing', async () => {
    const res = await request(app).get('/validate');
    expect(res.status).toBe(401);
  });

  it('returns valid:true when header present', async () => {
    const res = await request(app).get('/validate')
      .set('X-JWT-Subject', 'user-uuid-123')
      .set('X-JWT-Email',   'user@test.com');
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.userId).toBe('user-uuid-123');
  });
});

// ──────────────────────────────────────────────
describe('POST /logout', () => {
  it('returns 200 even without token', async () => {
    const res = await request(app).post('/logout').send({});
    expect(res.status).toBe(200);
  });

  it('returns 200 and removes refresh token', async () => {
    const res = await request(app).post('/logout')
      .send({ refreshToken: 'some-token' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/logged out/i);
  });
});
