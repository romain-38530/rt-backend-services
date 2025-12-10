// RT Chatbot API with Express and MongoDB
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
let db = null;
let mongoClient = null;
let mongoConnected = false;

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

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    'https://industry.symphonia-controltower.com',
    'https://transporter.symphonia-controltower.com',
    'https://logisticien.symphonia-controltower.com',
    'https://industrie.symphonia-controltower.com',
    'https://transporteur.symphonia-controltower.com',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

// Route alias: /api/v1/chatbot/* -> /api/chatbot/*
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/v1/chatbot')) {
    req.url = req.originalUrl.replace('/api/v1/chatbot', '/api/chatbot');
  }
  next();
});

// ========== Chatbot API Routes ==========

// Health check for chatbot API
app.get('/api/chatbot/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'chatbot-api',
    timestamp: new Date().toISOString(),
    mongodb: mongoConnected ? 'connected' : 'not connected'
  });
});

// Get conversations for user
app.get('/api/chatbot/conversations', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const userId = req.headers['x-user-id'] || 'anonymous';
    const conversations = await db.collection('conversations')
      .find({ userId })
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray();

    res.json({ data: conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Create new conversation
app.post('/api/chatbot/conversations', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const userId = req.headers['x-user-id'] || 'anonymous';
    const { title } = req.body;

    const conversation = {
      userId,
      title: title || 'Nouvelle conversation',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('conversations').insertOne(conversation);
    conversation._id = result.insertedId;

    res.status(201).json({ data: conversation });
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Get messages for conversation
app.get('/api/chatbot/conversations/:conversationId/messages', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const { conversationId } = req.params;
    const messages = await db.collection('messages')
      .find({ conversationId })
      .sort({ createdAt: 1 })
      .toArray();

    res.json({ data: messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send message
app.post('/api/chatbot/messages', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const { conversationId, content, role } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const message = {
      conversationId: conversationId || null,
      content,
      role: role || 'user',
      createdAt: new Date()
    };

    const result = await db.collection('messages').insertOne(message);
    message._id = result.insertedId;

    // Update conversation timestamp
    if (conversationId) {
      await db.collection('conversations').updateOne(
        { _id: conversationId },
        { $set: { updatedAt: new Date() } }
      );
    }

    // TODO: Generate AI response here
    const aiResponse = {
      conversationId: conversationId || null,
      content: 'Je suis l\'assistant SYMPHONI.A. Je suis en cours de configuration.',
      role: 'assistant',
      createdAt: new Date()
    };

    await db.collection('messages').insertOne(aiResponse);

    res.status(201).json({
      data: {
        userMessage: message,
        assistantMessage: aiResponse
      }
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Alias routes for /api/v1/chatbot/*
app.get('/api/v1/chatbot/health', (req, res) => res.redirect(307, '/api/chatbot/health'));

// Health check
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    service: 'chatbot',
    timestamp: new Date().toISOString(),
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    features: ['express', 'cors', 'helmet', 'mongodb'],
    mongodb: {
      configured: !!process.env.MONGODB_URI,
      connected: mongoConnected
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
    message: 'RT Chatbot API',
    version: '1.0.0',
    features: ['Express', 'MongoDB', 'CORS', 'Helmet'],
    endpoints: [
      'GET /health',
      'GET /'
    ]
  });
});

// Start server
async function startServer() {
  await connectMongoDB();

  app.listen(PORT, '0.0.0.0', () => {
    console.log('RT Chatbot API listening on port ' + PORT);
    console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
    console.log('MongoDB: ' + (mongoConnected ? 'Connected' : 'Not connected'));
  });
}

startServer();
