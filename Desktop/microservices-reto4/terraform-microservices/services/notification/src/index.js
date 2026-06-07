// services/notification/src/index.js
'use strict';

const express = require('express');
const { Pool } = require('pg');
const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require('@aws-sdk/client-sqs');
const {
  SESClient,
  SendEmailCommand,
} = require('@aws-sdk/client-ses');
const { v4: uuidv4 } = require('uuid');
const AWSXRay = require('aws-xray-sdk');

AWSXRay.config([AWSXRay.plugins.ECSPlugin]);
const app = express();
app.use(express.json());
app.use(AWSXRay.express.openSegment('notification-service'));

const pool = new Pool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'microservicesdb',
  port:     parseInt(process.env.DB_PORT || '5432'),
  ssl:      { rejectUnauthorized: false },
  max: 5,
});

const sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });

const NOTIFICATION_QUEUE_URL = process.env.NOTIFICATION_QUEUE_URL;
const SES_FROM_EMAIL         = process.env.SES_FROM_EMAIL || 'noreply@example.com';

const requireAuth = (req, res, next) => {
  req.userId = req.headers['x-jwt-subject'];
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  next();
};

// ── Email templates ─────────────────────────────
const templates = {
  PAYMENT_COMPLETED: (data) => ({
    subject: `✅ Payment confirmed — Order #${data.orderId}`,
    body:    `Your payment of $${data.amount} has been received. Order #${data.orderId} is now being processed.`,
  }),
  ORDER_SHIPPED: (data) => ({
    subject: `📦 Your order #${data.orderId} has shipped!`,
    body:    `Good news! Your order is on its way. Tracking: ${data.trackingNumber || 'N/A'}`,
  }),
  USER_REGISTERED: (data) => ({
    subject: `👋 Welcome to the platform!`,
    body:    `Hi ${data.firstName}, thanks for registering. Start shopping at ${data.siteUrl || 'our platform'}.`,
  }),
  ORDER_CANCELLED: (data) => ({
    subject: `❌ Order #${data.orderId} cancelled`,
    body:    `Your order #${data.orderId} has been cancelled. Reason: ${data.reason || 'N/A'}`,
  }),
};

// ── SQS Consumer (long-polling loop) ───────────
const processMessages = async () => {
  while (true) {
    try {
      const { Messages } = await sqsClient.send(new ReceiveMessageCommand({
        QueueUrl:            NOTIFICATION_QUEUE_URL,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds:     20,  // long-polling
        VisibilityTimeout:   30,
      }));

      if (!Messages?.length) continue;

      for (const msg of Messages) {
        try {
          const body  = JSON.parse(msg.Body);
          const event = JSON.parse(body.Message || msg.Body);
          console.log(`Processing event: ${event.eventType}`, event);

          await handleEvent(event);

          await sqsClient.send(new DeleteMessageCommand({
            QueueUrl:      NOTIFICATION_QUEUE_URL,
            ReceiptHandle: msg.ReceiptHandle,
          }));
        } catch (err) {
          console.error('Error processing message', err, msg.Body);
        }
      }
    } catch (err) {
      console.error('SQS receive error', err);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
};

const handleEvent = async (event) => {
  const { eventType, userId } = event;

  // Fetch user email
  let userEmail = null;
  if (userId) {
    const result = await pool.query('SELECT email FROM users WHERE id=$1', [userId]);
    userEmail = result.rows[0]?.email;
  }

  // Build notification record
  const tmpl = templates[eventType];
  if (!tmpl) {
    console.log(`No template for event: ${eventType}`);
    return;
  }
  const { subject, body } = tmpl(event);

  // Save to DB
  await pool.query(
    `INSERT INTO notifications(id,user_id,type,subject,body,read,created_at)
     VALUES($1,$2,$3,$4,$5,false,NOW())`,
    [uuidv4(), userId, eventType, subject, body]
  );

  // Send email if user has email notifications enabled
  if (userEmail) {
    const prefResult = await pool.query(
      'SELECT email_notifications FROM user_preferences WHERE user_id=$1',
      [userId]
    );
    const emailEnabled = prefResult.rows[0]?.email_notifications ?? true;

    if (emailEnabled) {
      await sesClient.send(new SendEmailCommand({
        Source:      SES_FROM_EMAIL,
        Destination: { ToAddresses: [userEmail] },
        Message: {
          Subject: { Data: subject },
          Body:    { Text: { Data: body } },
        },
      }));
      console.log(`Email sent to ${userEmail} for event ${eventType}`);
    }
  }
};

// ── HTTP Routes ──────────────────────────────────

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'notification-service', ts: new Date().toISOString() })
);

// GET /notifications
app.get('/', requireAuth, async (req, res) => {
  const { unread, page = 1, limit = 20 } = req.query;
  const offset  = (parseInt(page) - 1) * parseInt(limit);
  const params  = [req.userId];
  let whereExtra = '';
  if (unread === 'true') whereExtra = 'AND read=false';

  const result = await pool.query(
    `SELECT id,type,subject,body,read,created_at
     FROM notifications
     WHERE user_id=$1 ${whereExtra}
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [...params, parseInt(limit), offset]
  );

  const count = await pool.query(
    `SELECT COUNT(*) FROM notifications WHERE user_id=$1 ${whereExtra}`,
    params
  );

  return res.json({ data: result.rows, total: parseInt(count.rows[0].count), page: parseInt(page) });
});

// PATCH /notifications/mark-read
app.patch('/mark-read', requireAuth, async (req, res) => {
  const { ids } = req.body;
  if (!ids?.length) return res.status(400).json({ error: 'ids array required' });

  await pool.query(
    'UPDATE notifications SET read=true WHERE id = ANY($1) AND user_id=$2',
    [ids, req.userId]
  );
  return res.json({ message: `${ids.length} notifications marked as read` });
});

// PUT /notifications/preferences
app.put('/preferences', requireAuth, async (req, res) => {
  const { email, push, orderUpdates, promotions } = req.body;
  await pool.query(
    `INSERT INTO user_preferences(user_id,email_notifications,push_notifications,order_updates,promotions,updated_at)
     VALUES($1,$2,$3,$4,$5,NOW())
     ON CONFLICT(user_id) DO UPDATE
     SET email_notifications=$2, push_notifications=$3, order_updates=$4, promotions=$5, updated_at=NOW()`,
    [req.userId, email ?? true, push ?? true, orderUpdates ?? true, promotions ?? false]
  );
  return res.json({ message: 'Preferences updated' });
});

app.use(AWSXRay.express.closeSegment());

// Start HTTP server and SQS consumer
const PORT = parseInt(process.env.PORT || '8085');
app.listen(PORT, () => {
  console.log(`notification-service HTTP on :${PORT}`);
  processMessages().catch(console.error);
});

module.exports = app;
