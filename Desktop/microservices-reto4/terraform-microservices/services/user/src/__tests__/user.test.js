// services/user/src/__tests__/user.test.js
'use strict';

const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));
jest.mock('ioredis', () => jest.fn(() => ({
  get:   jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
  del:   jest.fn().mockResolvedValue(1),
})));
jest.mock('aws-xray-sdk', () => ({
  config: jest.fn(), plugins: { ECSPlugin: {} }, captureHTTPs: (m) => m,
  express: { openSegment: () => (_q, _r, n) => n(), closeSegment: () => (_e, _q, _r, n) => n && n() },
}));

const request = require('supertest');
const app     = require('../index');

const AUTH_HEADERS = {
  'x-jwt-subject': 'user-uuid-001',
  'x-jwt-email':   'john@test.com',
};

describe('GET /health', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('user-service');
  });
});

describe('GET /me', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 401 without auth headers', async () => {
    const res = await request(app).get('/me');
    expect(res.status).toBe(401);
  });

  it('returns 404 when user not found in DB', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/me').set(AUTH_HEADERS);
    expect(res.status).toBe(404);
  });

  it('returns user profile', async () => {
    const fakeUser = {
      id: 'user-uuid-001', email: 'john@test.com',
      first_name: 'John', last_name: 'Doe',
      phone: null, avatar_url: null,
      created_at: new Date().toISOString(), updated_at: null,
    };
    mockQuery.mockResolvedValueOnce({ rows: [fakeUser] });
    const res = await request(app).get('/me').set(AUTH_HEADERS);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user-uuid-001');
    expect(res.body.email).toBe('john@test.com');
    expect(res.body).toHaveProperty('firstName');
  });
});

describe('PUT /me', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 401 without auth', async () => {
    const res = await request(app).put('/me').send({ firstName: 'Jane' });
    expect(res.status).toBe(401);
  });

  it('updates profile and returns updated data', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'user-uuid-001', email: 'john@test.com',
        first_name: 'Jane', last_name: 'Smith',
        phone: '+52123', updated_at: new Date().toISOString(),
      }],
    });
    const res = await request(app).put('/me')
      .set(AUTH_HEADERS)
      .send({ firstName: 'Jane', lastName: 'Smith', phone: '+52123' });
    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Jane');
  });
});

describe('GET /', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns paginated user list', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'a@b.com', first_name: 'A', last_name: 'B', created_at: new Date() }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });
    const res = await request(app).get('/').set(AUTH_HEADERS).query({ page: 1, limit: 10 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
