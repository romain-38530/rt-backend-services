// RT Notifications API with Express, MongoDB, and Mailgun
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient } = require('mongodb');
const Mailgun = require('mailgun.js');
const formData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

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
    console.log('✓ Connected to MongoDB');
    return true;
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error.message);
    mongoConnected = false;
    return false;
  }
}

// Send email via Mailgun
async function sendEmail(to, subject, body) {
  if (!mg) {
    return { success: false, error: 'Mailgun not initialized' };
  }

  try {
    const messageData = {
      from: process.env.EMAIL_FROM || 'RT Notifications <noreply@rt-technologie.com>',
      to: Array.isArray(to) ? to : [to],
      subject: subject,
      text: body
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
    version: '1.0.0',
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

  // Try to ping MongoDB if connected
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
    message: 'RT Notifications API',
    version: '1.0.0',
    features: ['Express', 'MongoDB', 'Mailgun', 'CORS', 'Helmet'],
    endpoints: [
      'GET /health',
      'GET /',
      'GET /api/notifications',
      'POST /api/notifications/email'
    ]
  });
});

// Get notifications
app.get('/api/notifications', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({
      error: 'MongoDB not available'
    });
  }

  try {
    const notifications = await db
      .collection('notifications')
      .find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    res.json({
      notifications,
      count: notifications.length
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      error: 'Failed to fetch notifications',
      message: error.message
    });
  }
});

// Send email notification
app.post('/api/notifications/email', async (req, res) => {
  const { to, subject, body } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({
      error: 'Missing required fields: to, subject, body'
    });
  }

  if (!mg) {
    return res.status(503).json({
      error: 'Mailgun not configured'
    });
  }

  // Send email via Mailgun
  const result = await sendEmail(to, subject, body);

  // Store in MongoDB if connected
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
    res.json({
      success: true,
      message: 'Email sent successfully',
      messageId: result.messageId
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error
    });
  }
});

// Start server
async function startServer() {
  // Initialize Mailgun
  const mailgunReady = initMailgun();
  
  // Try to connect to MongoDB (non-blocking)
  await connectMongoDB();

  // Start Express server regardless of MongoDB status
  app.listen(PORT, '0.0.0.0', () => {
    console.log('RT Notifications API listening on port ' + PORT);
    console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
    console.log('Features: Express, MongoDB, Mailgun, CORS, Helmet');
    console.log('MongoDB: ' + (mongoConnected ? 'Connected' : 'Not connected'));
    console.log('Mailgun: ' + (mailgunReady ? 'Ready' : 'Not configured'));
  });
}

startServer();
