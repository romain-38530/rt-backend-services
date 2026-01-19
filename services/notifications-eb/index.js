/**
 * SYMPHONI.A Notifications API v2
 * Gestion des notifications multi-canal (app, email, SMS)
 * Deployed on AWS Elastic Beanstalk
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient, ObjectId } = require('mongodb');
const Mailgun = require('mailgun.js');
const formData = require('form-data');

const app = express();
const PORT = process.env.PORT || 8080;

// MongoDB connection
let db = null;
let mongoClient = null;
let mongoConnected = false;

// Mailgun client
const mailgun = new Mailgun(formData);
let mg = null;

// Initialize Mailgun
function initMailgun() {
  if (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN) {
    console.log('⚠️  Mailgun not configured');
    return false;
  }

  mg = mailgun.client({
    username: 'api',
    key: process.env.MAILGUN_API_KEY
  });
  console.log('✓ Mailgun initialized');
  return true;
}

// Connect to MongoDB
async function connectMongoDB() {
  if (!process.env.MONGODB_URI) {
    console.log('⚠️  MongoDB URI not configured');
    return false;
  }

  try {
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db();
    mongoConnected = true;

    // Create indexes
    await db.collection('notifications').createIndex({ userId: 1, read: 1 });
    await db.collection('notifications').createIndex({ createdAt: -1 });
    await db.collection('notifications').createIndex({ organizationId: 1 });

    console.log('✓ Connected to MongoDB');
    return true;
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error.message);
    mongoConnected = false;
    return false;
  }
}

// Send email via Mailgun
async function sendEmail(to, subject, body, html) {
  if (!mg) {
    return { success: false, error: 'Mailgun not initialized' };
  }

  try {
    const messageData = {
      from: process.env.EMAIL_FROM || 'SYMPHONI.A <noreply@rt-technologie.com>',
      to: Array.isArray(to) ? to : [to],
      subject: subject,
      text: body,
      html: html || body
    };

    const response = await mg.messages.create(
      process.env.MAILGUN_DOMAIN || 'rt-technologie.com',
      messageData
    );

    return { success: true, messageId: response.id };
  } catch (error) {
    console.error('Mailgun send error:', error);
    return { success: false, error: error.message };
  }
}

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') || true,
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    service: 'notifications',
    timestamp: new Date().toISOString(),
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    version: '2.0.0',
    features: ['express', 'cors', 'helmet', 'mongodb', 'mailgun'],
    mongodb: {
      configured: !!process.env.MONGODB_URI,
      connected: mongoConnected
    },
    mailgun: {
      configured: !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN),
      domain: process.env.MAILGUN_DOMAIN || 'not set'
    }
  };

  if (mongoConnected && mongoClient) {
    try {
      await mongoClient.db().admin().ping();
      health.mongodb.status = 'active';
    } catch (error) {
      health.mongodb.status = 'error';
      health.mongodb.error = error.message;
    }
  } else {
    health.mongodb.status = 'not connected';
  }

  const statusCode = mongoConnected ? 200 : 503;
  res.status(statusCode).json(health);
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'SYMPHONI.A Notifications API',
    version: '2.0.0',
    features: ['Express', 'MongoDB', 'Mailgun', 'CORS', 'Helmet'],
    endpoints: [
      'GET /health',
      'GET /api/v1/notifications',
      'GET /api/v1/notifications/unread-count',
      'PUT /api/v1/notifications/:id/read',
      'PUT /api/v1/notifications/mark-all-read',
      'POST /api/v1/notifications/send',
      'POST /api/v1/notifications/broadcast',
      'DELETE /api/v1/notifications/:id'
    ]
  });
});

// ==================== V1 API ROUTES ====================

// GET /api/v1/notifications - Get user notifications
app.get('/api/v1/notifications', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ success: false, error: 'MongoDB not available' });
  }

  try {
    const { userId, read, type, limit = 50, page = 1 } = req.query;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const filters = { userId };
    if (read !== undefined) filters.read = read === 'true';
    if (type) filters.type = type;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [notifications, total, unreadCount] = await Promise.all([
      db.collection('notifications')
        .find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      db.collection('notifications').countDocuments(filters),
      db.collection('notifications').countDocuments({ userId, read: false })
    ]);

    res.json({
      success: true,
      data: notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      unreadCount
    });
  } catch (error) {
    console.error('[ERROR] Get notifications:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/notifications/unread-count - Get unread count
app.get('/api/v1/notifications/unread-count', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ success: false, error: 'MongoDB not available' });
  }

  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const count = await db.collection('notifications').countDocuments({ userId, read: false });

    res.json({ success: true, count });
  } catch (error) {
    console.error('[ERROR] Get unread count:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/notifications/:id/read - Mark as read
app.put('/api/v1/notifications/:id/read', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ success: false, error: 'MongoDB not available' });
  }

  try {
    let filter;
    try {
      filter = { _id: new ObjectId(req.params.id) };
    } catch (e) {
      filter = { _id: req.params.id };
    }

    const result = await db.collection('notifications').findOneAndUpdate(
      filter,
      { $set: { read: true, readAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!result.value && !result) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({ success: true, data: result.value || result });
  } catch (error) {
    console.error('[ERROR] Mark as read:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/notifications/mark-all-read - Mark all as read
app.put('/api/v1/notifications/mark-all-read', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ success: false, error: 'MongoDB not available' });
  }

  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const result = await db.collection('notifications').updateMany(
      { userId, read: false },
      { $set: { read: true, readAt: new Date() } }
    );

    res.json({
      success: true,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('[ERROR] Mark all as read:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/notifications/:id - Delete notification
app.delete('/api/v1/notifications/:id', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ success: false, error: 'MongoDB not available' });
  }

  try {
    let filter;
    try {
      filter = { _id: new ObjectId(req.params.id) };
    } catch (e) {
      filter = { _id: req.params.id };
    }

    const result = await db.collection('notifications').deleteOne(filter);

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error('[ERROR] Delete notification:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/notifications/send - Send notification (internal API)
app.post('/api/v1/notifications/send', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ success: false, error: 'MongoDB not available' });
  }

  try {
    const {
      userId,
      organizationId,
      type,
      title,
      message,
      priority = 'normal',
      channels = { app: true, email: false, sms: false },
      data,
      actionUrl,
      userEmail,
      userPhone
    } = req.body;

    if (!userId || !type || !title || !message) {
      return res.status(400).json({
        success: false,
        error: 'userId, type, title, and message are required'
      });
    }

    // Create notification document
    const notification = {
      userId,
      organizationId,
      type,
      title,
      message,
      priority,
      channels,
      data,
      actionUrl,
      read: false,
      status: {
        app: { sent: channels.app, sentAt: channels.app ? new Date() : null },
        email: { sent: false },
        sms: { sent: false }
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Send via email if requested
    if (channels.email && userEmail) {
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">SYMPHONI.A</h1>
          </div>
          <div style="background: #fff; padding: 30px; border: 1px solid #eee; border-top: none;">
            <h2 style="color: #333; margin-top: 0;">${title}</h2>
            <p style="color: #666; line-height: 1.6;">${message}</p>
            ${actionUrl ? `
              <p style="margin-top: 20px;">
                <a href="${actionUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
                  Voir les détails
                </a>
              </p>
            ` : ''}
          </div>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 0 0 10px 10px; text-align: center;">
            <p style="color: #999; font-size: 12px; margin: 0;">
              Notification automatique SYMPHONI.A - Ne pas répondre à cet email
            </p>
          </div>
        </div>
      `;

      const emailResult = await sendEmail(userEmail, title, message, htmlContent);
      notification.status.email = {
        sent: emailResult.success,
        sentAt: emailResult.success ? new Date() : null,
        error: emailResult.error || null,
        messageId: emailResult.messageId || null
      };
    }

    // Insert into MongoDB
    const result = await db.collection('notifications').insertOne(notification);
    notification._id = result.insertedId;

    res.status(201).json({
      success: true,
      data: notification
    });
  } catch (error) {
    console.error('[ERROR] Send notification:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/notifications/broadcast - Broadcast to multiple users
app.post('/api/v1/notifications/broadcast', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ success: false, error: 'MongoDB not available' });
  }

  try {
    const {
      organizationId,
      userIds,
      type,
      title,
      message,
      priority = 'normal',
      channels = { app: true, email: false, sms: false }
    } = req.body;

    if (!userIds || userIds.length === 0) {
      return res.status(400).json({ success: false, error: 'userIds is required' });
    }

    if (!type || !title || !message) {
      return res.status(400).json({ success: false, error: 'type, title, and message are required' });
    }

    const now = new Date();
    const notifications = userIds.map(userId => ({
      userId,
      organizationId,
      type,
      title,
      message,
      priority,
      channels,
      read: false,
      status: {
        app: { sent: true, sentAt: now },
        email: { sent: false },
        sms: { sent: false }
      },
      createdAt: now,
      updatedAt: now
    }));

    const result = await db.collection('notifications').insertMany(notifications);

    res.status(201).json({
      success: true,
      count: result.insertedCount,
      insertedIds: result.insertedIds
    });
  } catch (error) {
    console.error('[ERROR] Broadcast notifications:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== RELANCE RULES ROUTES ====================

// GET /api/v1/relance-rules - Get all relance rules for a carrier
app.get('/api/v1/relance-rules', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ success: false, error: 'MongoDB not available' });
  }

  try {
    const { carrierId } = req.query;

    if (!carrierId) {
      return res.status(400).json({ success: false, error: 'carrierId is required' });
    }

    const rules = await db.collection('relance_rules')
      .find({ carrierId })
      .sort({ createdAt: 1 })
      .toArray();

    res.json({
      success: true,
      data: rules
    });
  } catch (error) {
    console.error('[ERROR] Get relance rules:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/relance-rules/:id - Get single relance rule
app.get('/api/v1/relance-rules/:id', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ success: false, error: 'MongoDB not available' });
  }

  try {
    let filter;
    try {
      filter = { _id: new ObjectId(req.params.id) };
    } catch (e) {
      filter = { _id: req.params.id };
    }

    const rule = await db.collection('relance_rules').findOne(filter);

    if (!rule) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    res.json({ success: true, data: rule });
  } catch (error) {
    console.error('[ERROR] Get relance rule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/relance-rules - Create a new relance rule
app.post('/api/v1/relance-rules', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ success: false, error: 'MongoDB not available' });
  }

  try {
    const {
      carrierId,
      name,
      type, // 'chargement' or 'livraison'
      triggerMinutesBefore,
      enabled = true,
      notificationChannels = ['email'],
      message
    } = req.body;

    if (!carrierId || !name || !type || triggerMinutesBefore === undefined || !message) {
      return res.status(400).json({
        success: false,
        error: 'carrierId, name, type, triggerMinutesBefore, and message are required'
      });
    }

    if (!['chargement', 'livraison'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'type must be "chargement" or "livraison"'
      });
    }

    const rule = {
      carrierId,
      name,
      type,
      triggerMinutesBefore: parseInt(triggerMinutesBefore),
      enabled,
      notificationChannels,
      message,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('relance_rules').insertOne(rule);
    rule._id = result.insertedId;

    res.status(201).json({
      success: true,
      data: rule
    });
  } catch (error) {
    console.error('[ERROR] Create relance rule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/relance-rules/:id - Update a relance rule
app.put('/api/v1/relance-rules/:id', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ success: false, error: 'MongoDB not available' });
  }

  try {
    const {
      name,
      type,
      triggerMinutesBefore,
      enabled,
      notificationChannels,
      message
    } = req.body;

    const updateData = { updatedAt: new Date() };

    if (name !== undefined) updateData.name = name;
    if (type !== undefined) {
      if (!['chargement', 'livraison'].includes(type)) {
        return res.status(400).json({
          success: false,
          error: 'type must be "chargement" or "livraison"'
        });
      }
      updateData.type = type;
    }
    if (triggerMinutesBefore !== undefined) updateData.triggerMinutesBefore = parseInt(triggerMinutesBefore);
    if (enabled !== undefined) updateData.enabled = enabled;
    if (notificationChannels !== undefined) updateData.notificationChannels = notificationChannels;
    if (message !== undefined) updateData.message = message;

    let filter;
    try {
      filter = { _id: new ObjectId(req.params.id) };
    } catch (e) {
      filter = { _id: req.params.id };
    }

    const result = await db.collection('relance_rules').findOneAndUpdate(
      filter,
      { $set: updateData },
      { returnDocument: 'after' }
    );

    if (!result.value && !result) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    res.json({
      success: true,
      data: result.value || result
    });
  } catch (error) {
    console.error('[ERROR] Update relance rule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/v1/relance-rules/:id/toggle - Toggle enabled status
app.patch('/api/v1/relance-rules/:id/toggle', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ success: false, error: 'MongoDB not available' });
  }

  try {
    let filter;
    try {
      filter = { _id: new ObjectId(req.params.id) };
    } catch (e) {
      filter = { _id: req.params.id };
    }

    // First get current state
    const rule = await db.collection('relance_rules').findOne(filter);
    if (!rule) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    // Toggle enabled
    const result = await db.collection('relance_rules').findOneAndUpdate(
      filter,
      { $set: { enabled: !rule.enabled, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    res.json({
      success: true,
      data: result.value || result
    });
  } catch (error) {
    console.error('[ERROR] Toggle relance rule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/relance-rules/:id - Delete a relance rule
app.delete('/api/v1/relance-rules/:id', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ success: false, error: 'MongoDB not available' });
  }

  try {
    let filter;
    try {
      filter = { _id: new ObjectId(req.params.id) };
    } catch (e) {
      filter = { _id: req.params.id };
    }

    const result = await db.collection('relance_rules').deleteOne(filter);

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    res.json({ success: true, message: 'Rule deleted' });
  } catch (error) {
    console.error('[ERROR] Delete relance rule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/relance-rules/init-defaults - Initialize default rules for a carrier
app.post('/api/v1/relance-rules/init-defaults', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ success: false, error: 'MongoDB not available' });
  }

  try {
    const { carrierId } = req.body;

    if (!carrierId) {
      return res.status(400).json({ success: false, error: 'carrierId is required' });
    }

    // Check if carrier already has rules
    const existingRules = await db.collection('relance_rules').countDocuments({ carrierId });
    if (existingRules > 0) {
      return res.status(400).json({
        success: false,
        error: 'Carrier already has relance rules configured'
      });
    }

    // Create default rules
    const now = new Date();
    const defaultRules = [
      {
        carrierId,
        name: 'Rappel chargement J-1',
        type: 'chargement',
        triggerMinutesBefore: 1440, // 24h
        enabled: true,
        notificationChannels: ['email'],
        message: 'Rappel: Chargement prevu demain a {heure} chez {client}',
        createdAt: now,
        updatedAt: now
      },
      {
        carrierId,
        name: 'Rappel chargement H-2',
        type: 'chargement',
        triggerMinutesBefore: 120, // 2h
        enabled: true,
        notificationChannels: ['sms', 'push'],
        message: 'Chargement dans 2h chez {client} - {adresse}',
        createdAt: now,
        updatedAt: now
      },
      {
        carrierId,
        name: 'Rappel livraison J-1',
        type: 'livraison',
        triggerMinutesBefore: 1440,
        enabled: true,
        notificationChannels: ['email'],
        message: 'Rappel: Livraison prevue demain a {heure} - {client}',
        createdAt: now,
        updatedAt: now
      },
      {
        carrierId,
        name: 'Rappel livraison H-1',
        type: 'livraison',
        triggerMinutesBefore: 60,
        enabled: true,
        notificationChannels: ['sms', 'push'],
        message: 'Livraison dans 1h - {client}, {adresse}',
        createdAt: now,
        updatedAt: now
      }
    ];

    const result = await db.collection('relance_rules').insertMany(defaultRules);

    res.status(201).json({
      success: true,
      data: defaultRules.map((rule, index) => ({
        ...rule,
        _id: result.insertedIds[index]
      })),
      count: result.insertedCount
    });
  } catch (error) {
    console.error('[ERROR] Init default rules:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== LEGACY ROUTES (backward compatibility) ====================

// GET /api/notifications - Legacy route
app.get('/api/notifications', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'MongoDB not available' });
  }

  try {
    const { userId, limit = 20 } = req.query;

    // userId is required to ensure users only see their own notifications
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const filter = { userId };

    const notifications = await db
      .collection('notifications')
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .toArray();

    res.json({
      notifications,
      count: notifications.length
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications', message: error.message });
  }
});

// POST /api/notifications/email - Legacy email route
app.post('/api/notifications/email', async (req, res) => {
  const { to, subject, body } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, body' });
  }

  if (!mg) {
    return res.status(503).json({ error: 'Mailgun not configured' });
  }

  const result = await sendEmail(to, subject, body);

  if (mongoConnected && db) {
    try {
      await db.collection('notifications').insertOne({
        type: 'email',
        to,
        subject,
        body,
        status: result.success ? 'sent' : 'failed',
        messageId: result.messageId,
        error: result.error,
        createdAt: new Date()
      });
    } catch (error) {
      console.error('Failed to store notification in DB:', error);
    }
  }

  if (result.success) {
    res.json({ success: true, message: 'Email sent successfully', messageId: result.messageId });
  } else {
    res.status(500).json({ success: false, error: result.error });
  }
});

// Start server
async function startServer() {
  initMailgun();
  await connectMongoDB();

  app.listen(PORT, '0.0.0.0', () => {
    console.log('============================================');
    console.log('  SYMPHONI.A Notifications API v2.0.0');
    console.log('============================================');
    console.log(`  Port: ${PORT}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  MongoDB: ${mongoConnected ? 'Connected' : 'Not connected'}`);
    console.log(`  Mailgun: ${mg ? 'Ready' : 'Not configured'}`);
    console.log('============================================');
  });
}

startServer();
