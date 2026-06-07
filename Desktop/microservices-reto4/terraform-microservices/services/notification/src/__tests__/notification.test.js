// services/notification/src/__tests__/notification.test.js
'use strict';

const mockQuery = jest.fn();
const mockSQSSend = jest.fn().mockResolvedValue({
  Messages: [], // prevent long-polling loop in tests
});
const mockSESSend = jest.fn().mockResolvedValue({});

jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));
jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient:              jest.fn(() => ({ send: mockSQSSend })),
  ReceiveMessageCommand:  jest.fn(),
  DeleteMessageCommand:   jest.fn(),
}));
jest.mock('@aws-sdk/client-ses', () => ({
  SESClient:        jest.fn(() => ({ send: mockSESSend })),
  SendEmailCommand: jest.fn(),
}));
jest.mock('aws-xray-sdk', () => ({
  config: jest.fn(), plugins: { ECSPlugin: {} },
  express: { openSegment:()=>(_q,_r,n)=>n(), closeSegment:()=>(_e,_q,_r,n)=>n&&n() },
}));

process.env.NOTIFICATION_QUEUE_URL = 'http://localhost:4566/queue';
process.env.SES_FROM_EMAIL         = 'noreply@test.com';

const request = require('supertest');
const app     = require('../index');

const AUTH = { 'x-jwt-subject': 'user-uuid-001' };

describe('GET /health', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('notification-service');
  });
});

describe('GET /', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 401 without auth', async () => {
    expect((await request(app).get('/')).status).toBe(401);
  });

  it('returns notification list', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'n1', type: 'PAYMENT_COMPLETED', subject: 'Paid', body: 'Done', read: false, created_at: new Date() }],
      })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const res = await request(app).get('/').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('filters unread notifications', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const res = await request(app).get('/').set(AUTH).query({ unread: 'true' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('PATCH /mark-read', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 400 when ids missing', async () => {
    const res = await request(app).patch('/mark-read').set(AUTH).send({});
    expect(res.status).toBe(400);
  });

  it('marks notifications as read', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).patch('/mark-read').set(AUTH)
      .send({ ids: ['n1', 'n2'] });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/2 notifications/i);
  });
});

describe('PUT /preferences', () => {
  beforeEach(() => mockQuery.mockReset());

  it('upserts preferences', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put('/preferences').set(AUTH)
      .send({ email: true, push: false, orderUpdates: true, promotions: false });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated/i);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT'),
      expect.arrayContaining(['user-uuid-001', true, false, true, false])
    );
  });
});
