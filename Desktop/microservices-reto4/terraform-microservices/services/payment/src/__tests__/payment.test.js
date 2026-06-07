// services/payment/src/__tests__/payment.test.js
'use strict';

const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn(() => ({ send: jest.fn().mockResolvedValue({}) })),
  PublishCommand: jest.fn(),
}));
jest.mock('aws-xray-sdk', () => ({
  config: jest.fn(), plugins: { ECSPlugin: {} },
  express: { openSegment:()=>(_q,_r,n)=>n(), closeSegment:()=>(_e,_q,_r,n)=>n&&n() },
}));

process.env.SNS_TOPIC_ARN = 'arn:aws:sns:us-east-1:000:test';

const request = require('supertest');
const app     = require('../index');

const AUTH = { 'x-jwt-subject': 'user-uuid-001' };

describe('GET /health', () => {
  it('returns 200', async () => {
    expect((await request(app).get('/health')).status).toBe(200);
  });
});

describe('POST /intent', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 400 when orderId missing', async () => {
    const res = await request(app).post('/intent').set(AUTH).send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/intent').send({ orderId: 'x' });
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown order', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/intent').set(AUTH).send({ orderId: 'bad-id' });
    expect(res.status).toBe(404);
  });

  it('creates payment intent for valid order', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'order-001', total: '99.99', status: 'PENDING' }] })
      .mockResolvedValueOnce({ rows: [] }); // INSERT payment

    const res = await request(app).post('/intent').set(AUTH)
      .send({ orderId: 'order-001', currency: 'usd' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('paymentId');
    expect(res.body).toHaveProperty('clientSecret');
    expect(res.body.status).toBe('PENDING');
  });

  it('returns 422 for cancelled order', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'order-001', total: '99.99', status: 'CANCELLED' }] });
    const res = await request(app).post('/intent').set(AUTH).send({ orderId: 'order-001' });
    expect(res.status).toBe(422);
  });
});

describe('GET /:id', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 404 for unknown payment', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/pay-999').set(AUTH);
    expect(res.status).toBe(404);
  });

  it('returns payment details', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'pay-001', order_id: 'order-001',
        amount: '99.99', currency: 'usd',
        status: 'COMPLETED', created_at: new Date(), updated_at: null,
      }],
    });
    const res = await request(app).get('/pay-001').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETED');
  });
});

describe('POST /:id/confirm', () => {
  beforeEach(() => mockQuery.mockReset());

  it('confirms payment and transitions order', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'pay-001', order_id: 'order-001', stripe_intent_id: 'pi_test', status: 'PENDING', amount: '99.99' }] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE payment
      .mockResolvedValueOnce({ rows: [] }); // UPDATE order

    const res = await request(app).post('/pay-001/confirm').set(AUTH)
      .send({ paymentMethodId: 'pm_card_visa' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETED');
  });

  it('returns 422 when already completed', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'pay-001', status: 'COMPLETED', stripe_intent_id: 'pi_test', amount: '99.99' }] });
    const res = await request(app).post('/pay-001/confirm').set(AUTH)
      .send({ paymentMethodId: 'pm_card_visa' });
    expect(res.status).toBe(422);
  });
});
