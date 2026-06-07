// services/order/src/__tests__/order.test.js
'use strict';

const mockQuery  = jest.fn();
const mockConnect = jest.fn();
const mockRelease = jest.fn();
const mockClientQuery = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    query:   mockQuery,
    connect: mockConnect,
  })),
}));

jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient:          jest.fn(() => ({ send: jest.fn().mockResolvedValue({}) })),
  SendMessageCommand: jest.fn(),
}));
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient:      jest.fn(() => ({ send: jest.fn().mockResolvedValue({}) })),
  PublishCommand: jest.fn(),
}));
jest.mock('aws-xray-sdk', () => ({
  config: jest.fn(), plugins: { ECSPlugin: {} },
  express: { openSegment: ()=>(_q,_r,n)=>n(), closeSegment:()=>(_e,_q,_r,n)=>n&&n() },
}));

process.env.ORDER_QUEUE_URL = 'http://localhost:4566/000000000000/test-order-queue';
process.env.SNS_TOPIC_ARN   = 'arn:aws:sns:us-east-1:000000000000:test-events';

const request = require('supertest');
const app     = require('../index');

const AUTH = { 'x-jwt-subject': 'user-uuid-001' };

describe('GET /health', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});

describe('GET /', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(401);
  });

  it('returns order list for authenticated user', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'order-001', status: 'PENDING', total: '99.99',
        created_at: new Date(), updated_at: null,
        items: [{ productId: 'prod-001', quantity: 1, unitPrice: '99.99' }],
      }],
    });
    const res = await request(app).get('/').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
  });
});

describe('GET /:id', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 404 for unknown order', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/nonexistent').set(AUTH);
    expect(res.status).toBe(404);
  });

  it('returns order details', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'order-001', user_id: 'user-uuid-001', status: 'PENDING',
        total: '99.99', shipping_address: {}, created_at: new Date(),
        items: [],
      }],
    });
    const res = await request(app).get('/order-001').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('order-001');
  });
});

describe('POST /', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClientQuery.mockReset();
    mockConnect.mockResolvedValue({
      query:   mockClientQuery,
      release: mockRelease,
    });
  });

  it('returns 400 when items empty', async () => {
    const res = await request(app).post('/').set(AUTH).send({ items: [] });
    expect(res.status).toBe(400);
  });

  it('creates order with valid items', async () => {
    // SELECT products
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })  // BEGIN
      .mockResolvedValueOnce({              // SELECT products
        rows: [{ id: 'prod-001', price: '49.99', stock: 10, name: 'Widget' }],
      })
      .mockResolvedValueOnce({ rows: [] })  // INSERT order
      .mockResolvedValueOnce({ rows: [] })  // INSERT order_items
      .mockResolvedValueOnce({ rows: [] })  // UPDATE stock
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app).post('/').set(AUTH).send({
      items: [{ productId: 'prod-001', quantity: 2 }],
      shippingAddress: { street: 'Test St', city: 'León', country: 'MX' },
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.status).toBe('PENDING');
    expect(parseFloat(res.body.total)).toBeCloseTo(99.98, 1);
  });

  it('returns 404 when product not found', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })  // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // SELECT products → empty

    const res = await request(app).post('/').set(AUTH).send({
      items: [{ productId: 'nonexistent', quantity: 1 }],
    });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /:id/cancel', () => {
  beforeEach(() => mockQuery.mockReset());

  it('cancels a PENDING order', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'order-001', status: 'PENDING' }] })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    const res = await request(app).patch('/order-001/cancel')
      .set(AUTH).send({ reason: 'Changed mind' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });

  it('returns 422 when order already delivered', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'order-001', status: 'DELIVERED' }] });
    const res = await request(app).patch('/order-001/cancel').set(AUTH);
    expect(res.status).toBe(422);
  });
});
