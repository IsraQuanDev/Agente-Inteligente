// services/product/src/__tests__/product.test.js
'use strict';

const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));
jest.mock('ioredis', () => jest.fn(() => ({
  get:   jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
  del:   jest.fn().mockResolvedValue(1),
})));
jest.mock('@aws-sdk/client-s3', () => ({ S3Client: jest.fn(() => ({})), PutObjectCommand: jest.fn() }));
jest.mock('aws-xray-sdk', () => ({
  config: jest.fn(), plugins: { ECSPlugin: {} },
  express: { openSegment: () => (_q,_r,n)=>n(), closeSegment: ()=>(_e,_q,_r,n)=>n&&n() },
}));

process.env.S3_BUCKET = 'test-bucket';

const request = require('supertest');
const app     = require('../index');

const AUTH = { 'x-jwt-subject': 'admin-uuid', 'x-jwt-email': 'admin@test.com' };

const SAMPLE_PRODUCT = {
  id: 'prod-001', name: 'Headphones', description: 'Noise cancelling',
  price: '299.99', stock: 50, category: 'electronics', sku: 'HP-001',
  image_url: null, created_at: new Date(),
};

describe('GET /health', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});

describe('GET /', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns product list with pagination', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [SAMPLE_PRODUCT] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });
    const res = await request(app).get('/').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('filters by category', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });
    const res = await request(app).get('/').set(AUTH).query({ category: 'clothing' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('GET /:id', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 404 for unknown product', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/nonexistent').set(AUTH);
    expect(res.status).toBe(404);
  });

  it('returns product by id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_PRODUCT] });
    const res = await request(app).get('/prod-001').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.sku).toBe('HP-001');
  });
});

describe('POST /', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 400 when required fields missing', async () => {
    const res = await request(app).post('/').set(AUTH).send({ name: 'No price' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('creates product and returns 201', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...SAMPLE_PRODUCT, id: 'new-uuid' }] });
    const res = await request(app).post('/').set(AUTH).send({
      name: 'Headphones', price: 299.99, sku: 'HP-NEW', stock: 10,
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });
});

describe('PATCH /:id/stock', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 400 for missing operation', async () => {
    const res = await request(app).patch('/prod-001/stock').set(AUTH).send({ quantity: 5 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid operation', async () => {
    const res = await request(app).patch('/prod-001/stock').set(AUTH)
      .send({ quantity: 5, operation: 'multiply' });
    expect(res.status).toBe(400);
  });

  it('adds stock correctly', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'prod-001', stock: 55 }] });
    const res = await request(app).patch('/prod-001/stock').set(AUTH)
      .send({ quantity: 5, operation: 'add' });
    expect(res.status).toBe(200);
    expect(res.body.stock).toBe(55);
  });
});
