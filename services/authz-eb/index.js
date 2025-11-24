// RT Authentication API with Express and MongoDB
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient } = require('mongodb');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// VAT Patterns for EU countries
const VAT_PATTERNS = {
  AT: /^U\d{8}$/,
  BE: /^\d{10}$/,
  BG: /^\d{9,10}$/,
  CY: /^\d{8}[A-Z]$/,
  CZ: /^\d{8,10}$/,
  DE: /^\d{9}$/,
  DK: /^\d{8}$/,
  EE: /^\d{9}$/,
  EL: /^\d{9}$/,
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^\d{8}$/,
  FR: /^[A-Z0-9]{2}\d{9}$/,
  HR: /^\d{11}$/,
  HU: /^\d{8}$/,
  IE: /^[A-Z0-9]{7,8}$/,
  IT: /^\d{11}$/,
  LT: /^(\d{9}|\d{12})$/,
  LU: /^\d{8}$/,
  LV: /^\d{11}$/,
  MT: /^\d{8}$/,
  NL: /^\d{9}B\d{2}$/,
  PL: /^\d{10}$/,
  PT: /^\d{9}$/,
  RO: /^\d{2,10}$/,
  SE: /^\d{12}$/,
  SI: /^\d{8}$/,
  SK: /^\d{10}$/,
};

// MongoDB connection
let db = null;
let mongoClient = null;
let mongoConnected = false;

// VAT validation cache
const vatCache = new Map();
const CACHE_TTL = 3600000; // 1 hour

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

// VAT validation functions
function parseVATNumber(fullVatNumber) {
  const cleaned = fullVatNumber.toUpperCase().replace(/[\s\-\.]/g, '');

  if (cleaned.length < 3) {
    return null;
  }

  const countryCode = cleaned.substring(0, 2);
  const vatNumber = cleaned.substring(2);

  if (!VAT_PATTERNS[countryCode]) {
    return null;
  }

  return { countryCode, vatNumber };
}

function validateVATFormat(countryCode, vatNumber) {
  const pattern = VAT_PATTERNS[countryCode];
  if (!pattern) {
    return false;
  }
  return pattern.test(vatNumber);
}

async function validateVATWithVIES(countryCode, vatNumber) {
  const cacheKey = `${countryCode}${vatNumber}`;

  // Check cache
  const cached = vatCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.response;
  }

  const apiUrl = process.env.VAT_API_URL || 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms';
  const timeout = parseInt(process.env.VAT_API_TIMEOUT || '10000');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${apiUrl}/${countryCode}/vat/${vatNumber}`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'RT-VAT-Validation/2.0.0'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        valid: false,
        countryCode,
        vatNumber,
        requestDate: new Date().toISOString(),
        errorCode: `HTTP_${response.status}`,
        errorMessage: `VIES API returned status ${response.status}`
      };
    }

    const data = await response.json();

    const result = {
      valid: data.isValid === true, // VIES REST API uses isValid, not valid
      countryCode,
      vatNumber,
      requestDate: data.requestDate || new Date().toISOString(),
      name: data.name || '---',
      address: data.address || '---'
    };

    // Cache successful response
    if (result.valid) {
      vatCache.set(cacheKey, {
        response: result,
        timestamp: Date.now()
      });
    }

    return result;

  } catch (error) {
    return {
      valid: false,
      countryCode,
      vatNumber,
      requestDate: new Date().toISOString(),
      errorCode: 'NETWORK_ERROR',
      errorMessage: error.message
    };
  }
}

// Middleware
app.use(helmet());

// CORS configuration - Allow Amplify domains and main domains
const allowedOrigins = [
  'https://main.df8cnylp3pqka.amplifyapp.com',
  'https://www.rt-technologie.com',
  'https://rttechnologie.com',
  'http://localhost:3000', // Local development
  'http://localhost:3001'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Check if origin matches *.amplifyapp.com pattern
    if (origin.match(/^https:\/\/.*\.amplifyapp\.com$/)) {
      return callback(null, true);
    }

    // Also check environment variable for additional origins
    const envOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',') || [];
    if (envOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    service: 'authz',
    timestamp: new Date().toISOString(),
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    version: '2.0.0',
    features: ['express', 'cors', 'helmet', 'mongodb', 'vat-validation'],
    mongodb: {
      configured: !!process.env.MONGODB_URI,
      connected: mongoConnected
    },
    vat: {
      apiUrl: process.env.VAT_API_URL || 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms',
      cacheSize: vatCache.size,
      supportedCountries: Object.keys(VAT_PATTERNS).length
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
    message: 'RT Authentication API with VAT Validation',
    version: '2.0.0',
    features: ['Express', 'MongoDB', 'CORS', 'Helmet', 'VAT Validation'],
    endpoints: [
      'GET /health',
      'GET /',
      'POST /api/vat/validate-format',
      'POST /api/vat/validate'
    ]
  });
});

// VAT validation endpoints
app.post('/api/vat/validate-format', (req, res) => {
  try {
    const { vatNumber } = req.body;

    if (!vatNumber || typeof vatNumber !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'vatNumber is required and must be a string'
        }
      });
    }

    const parsed = parseVATNumber(vatNumber);

    if (!parsed) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: 'Invalid VAT number format'
      });
    }

    const formatValid = validateVATFormat(parsed.countryCode, parsed.vatNumber);

    res.json({
      success: true,
      valid: formatValid,
      countryCode: parsed.countryCode,
      vatNumber: parsed.vatNumber,
      fullVatNumber: `${parsed.countryCode}${parsed.vatNumber}`
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    });
  }
});

app.post('/api/vat/validate', async (req, res) => {
  try {
    const { vatNumber } = req.body;

    if (!vatNumber || typeof vatNumber !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'vatNumber is required and must be a string'
        }
      });
    }

    const parsed = parseVATNumber(vatNumber);

    if (!parsed) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: 'Invalid VAT number format'
      });
    }

    const formatValid = validateVATFormat(parsed.countryCode, parsed.vatNumber);

    if (!formatValid) {
      return res.json({
        success: true,
        valid: false,
        countryCode: parsed.countryCode,
        vatNumber: parsed.vatNumber,
        message: 'VAT number format is invalid'
      });
    }

    const viesResult = await validateVATWithVIES(parsed.countryCode, parsed.vatNumber);

    res.json({
      success: true,
      valid: viesResult.valid,
      countryCode: viesResult.countryCode,
      vatNumber: viesResult.vatNumber,
      requestDate: viesResult.requestDate,
      companyName: viesResult.name,
      companyAddress: viesResult.address,
      errorCode: viesResult.errorCode,
      errorMessage: viesResult.errorMessage
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    });
  }
});

// Start server
async function startServer() {
  await connectMongoDB();

  app.listen(PORT, '0.0.0.0', () => {
    console.log('RT Authentication API listening on port ' + PORT);
    console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
    console.log('MongoDB: ' + (mongoConnected ? 'Connected' : 'Not connected'));
    console.log('VAT Validation: Enabled (' + Object.keys(VAT_PATTERNS).length + ' EU countries)');
  });
}

startServer();
