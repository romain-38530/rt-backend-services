#!/bin/bash
SERVICE_NAME=$1
SERVICE_LABEL=$2
DB_NAME=$3

if [ -z "$SERVICE_NAME" ] || [ -z "$SERVICE_LABEL" ] || [ -z "$DB_NAME" ]; then
  echo "Usage: ./create-eb-service.sh <service-name> <service-label> <db-name>"
  exit 1
fi

SERVICE_DIR="services/${SERVICE_NAME}-eb"
mkdir -p "$SERVICE_DIR"

# Create package.json
cat > "$SERVICE_DIR/package.json" << EOF
{
    "name": "rt-${SERVICE_NAME}-api",
    "version": "1.0.0",
    "description": "RT ${SERVICE_LABEL} API",
    "main": "index.js",
    "scripts": {
        "start": "node index.js"
    },
    "dependencies": {
        "express": "^4.18.2",
        "cors": "^2.8.5",
        "helmet": "^7.1.0",
        "mongodb": "^6.3.0"
    }
}
EOF

# Create index.js
cat > "$SERVICE_DIR/index.js" << 'EOF'
// RT SERVICE_LABEL API with Express and MongoDB
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
  origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') || true,
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    service: 'SERVICE_NAME',
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
    message: 'RT SERVICE_LABEL API',
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
    console.log('RT SERVICE_LABEL API listening on port ' + PORT);
    console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
    console.log('MongoDB: ' + (mongoConnected ? 'Connected' : 'Not connected'));
  });
}

startServer();
EOF

sed -i "s/SERVICE_NAME/${SERVICE_NAME}/g" "$SERVICE_DIR/index.js"
sed -i "s/SERVICE_LABEL/${SERVICE_LABEL}/g" "$SERVICE_DIR/index.js"

# Create Procfile
echo "web: node index.js" > "$SERVICE_DIR/Procfile"

echo "✓ Created $SERVICE_DIR"
