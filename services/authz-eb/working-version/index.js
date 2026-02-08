// RT Authentication API with Express and MongoDB
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient, ObjectId } = require('mongodb');
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

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
    version: '3.0.0',
    features: ['Express', 'MongoDB', 'CORS', 'Helmet', 'VAT Validation', 'SubUsers'],
    endpoints: [
      'GET /health',
      'GET /',
      'POST /api/vat/validate-format',
      'POST /api/vat/validate',
      'GET /api/subusers',
      'POST /api/subusers',
      'PUT /api/subusers/:id',
      'DELETE /api/subusers/:id'
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

// ===========================================
// Authentication Middleware
// ===========================================
const authenticateUser = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      portal: decoded.portal
    };
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// ===========================================
// SubUser Plan Limits
// ===========================================
const SUBUSER_LIMITS = {
  trial: 1,
  starter: 2,
  pro: 10,
  enterprise: -1
};

async function getUserPlan(userId) {
  try {
    if (!db) return 'starter';
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user) return 'trial';
    if (user.role === 'super_admin' || user.role === 'admin') return 'enterprise';
    if (user.role === 'manager') return 'pro';
    return 'starter';
  } catch (error) {
    return 'starter';
  }
}

async function getSubUserLimitInfo(parentUserId) {
  const plan = await getUserPlan(parentUserId);
  const maxAllowed = SUBUSER_LIMITS[plan];
  const currentCount = await db.collection('subusers').countDocuments({
    parentUserId: new ObjectId(parentUserId),
    status: { $ne: 'inactive' }
  });

  if (maxAllowed === -1) {
    return { allowed: true, currentCount, maxAllowed: -1, plan, remaining: -1 };
  }

  return {
    allowed: currentCount < maxAllowed,
    currentCount,
    maxAllowed,
    plan,
    remaining: Math.max(0, maxAllowed - currentCount)
  };
}

// ===========================================
// SubUsers Routes
// ===========================================

// GET /api/subusers - List subusers
app.get('/api/subusers', authenticateUser, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not connected' });
    }
    const userId = req.user.id;
    const subUsers = await db.collection('subusers')
      .find({ parentUserId: new ObjectId(userId) })
      .project({ password: 0, activationToken: 0 })
      .sort({ createdAt: -1 })
      .toArray();

    const limitInfo = await getSubUserLimitInfo(userId);

    res.json({
      success: true,
      data: {
        subUsers: subUsers.map(u => ({
          id: u._id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          accessLevel: u.accessLevel,
          universes: u.universes || [],
          status: u.status,
          invitedAt: u.invitedAt
        })),
        limit: {
          current: limitInfo.currentCount,
          max: limitInfo.maxAllowed,
          remaining: limitInfo.remaining,
          plan: limitInfo.plan,
          canAdd: limitInfo.allowed
        }
      }
    });
  } catch (error) {
    console.error('Error fetching subusers:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la recuperation des membres' });
  }
});

// POST /api/subusers - Create subuser
app.post('/api/subusers', authenticateUser, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not connected' });
    }
    const userId = req.user.id;
    const { email, firstName, lastName, accessLevel, universes, phone } = req.body;

    if (!email || !firstName || !lastName) {
      return res.status(400).json({ success: false, error: 'Email, prenom et nom sont requis' });
    }

    const limitInfo = await getSubUserLimitInfo(userId);
    if (!limitInfo.allowed) {
      return res.status(403).json({
        success: false,
        error: 'Limite de membres atteinte pour votre plan',
        limit: { current: limitInfo.currentCount, max: limitInfo.maxAllowed, plan: limitInfo.plan }
      });
    }

    const existingUser = await db.collection('users').findOne({ email: email.toLowerCase() });
    const existingSubUser = await db.collection('subusers').findOne({ email: email.toLowerCase() });
    if (existingUser || existingSubUser) {
      return res.status(409).json({ success: false, error: 'Cet email est deja utilise' });
    }

    const validAccessLevels = ['admin', 'editor', 'reader'];
    const level = validAccessLevels.includes(accessLevel) ? accessLevel : 'reader';
    const validUniverses = ['industry', 'logistician', 'transporter', 'forwarder', 'supplier', 'recipient'];
    const selectedUniverses = Array.isArray(universes)
      ? universes.filter(u => validUniverses.includes(u))
      : validUniverses;

    const activationToken = crypto.randomBytes(32).toString('hex');
    const subUser = {
      parentUserId: new ObjectId(userId),
      email: email.toLowerCase(),
      firstName,
      lastName,
      phone: phone || null,
      accessLevel: level,
      universes: selectedUniverses,
      status: 'pending',
      activationToken,
      invitedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('subusers').insertOne(subUser);
    console.log('SubUser created:', { subUserId: result.insertedId, email, parentUserId: userId });

    res.status(201).json({
      success: true,
      message: 'Invitation envoyee',
      data: {
        id: result.insertedId,
        email: subUser.email,
        firstName: subUser.firstName,
        lastName: subUser.lastName,
        accessLevel: subUser.accessLevel,
        universes: subUser.universes,
        status: subUser.status,
        invitedAt: subUser.invitedAt
      }
    });
  } catch (error) {
    console.error('Error creating subuser:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la creation du membre' });
  }
});

// GET /api/subusers/:id - Get single subuser
app.get('/api/subusers/:id', authenticateUser, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not connected' });
    }
    const { id } = req.params;
    const userId = req.user.id;

    const subUser = await db.collection('subusers').findOne({
      _id: new ObjectId(id),
      parentUserId: new ObjectId(userId)
    }, { projection: { password: 0, activationToken: 0 } });

    if (!subUser) {
      return res.status(404).json({ success: false, error: 'Membre non trouve' });
    }

    res.json({
      success: true,
      data: {
        id: subUser._id,
        email: subUser.email,
        firstName: subUser.firstName,
        lastName: subUser.lastName,
        accessLevel: subUser.accessLevel,
        universes: subUser.universes || [],
        status: subUser.status,
        invitedAt: subUser.invitedAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur lors de la recuperation du membre' });
  }
});

// PUT /api/subusers/:id - Update subuser
app.put('/api/subusers/:id', authenticateUser, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not connected' });
    }
    const { id } = req.params;
    const userId = req.user.id;
    const { firstName, lastName, accessLevel, universes, phone, status } = req.body;

    const subUser = await db.collection('subusers').findOne({
      _id: new ObjectId(id),
      parentUserId: new ObjectId(userId)
    });

    if (!subUser) {
      return res.status(404).json({ success: false, error: 'Membre non trouve' });
    }

    const updates = { updatedAt: new Date() };
    if (firstName) updates.firstName = firstName;
    if (lastName) updates.lastName = lastName;
    if (phone !== undefined) updates.phone = phone;

    const validAccessLevels = ['admin', 'editor', 'reader'];
    if (accessLevel && validAccessLevels.includes(accessLevel)) {
      updates.accessLevel = accessLevel;
    }

    const validUniverses = ['industry', 'logistician', 'transporter', 'forwarder', 'supplier', 'recipient'];
    if (Array.isArray(universes)) {
      updates.universes = universes.filter(u => validUniverses.includes(u));
    }

    if (status && ['active', 'inactive'].includes(status)) {
      updates.status = status;
    }

    await db.collection('subusers').updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    const updated = await db.collection('subusers').findOne({ _id: new ObjectId(id) });

    res.json({
      success: true,
      message: 'Membre mis a jour',
      data: {
        id: updated._id,
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
        accessLevel: updated.accessLevel,
        universes: updated.universes || [],
        status: updated.status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur lors de la mise a jour du membre' });
  }
});

// DELETE /api/subusers/:id - Delete subuser
app.delete('/api/subusers/:id', authenticateUser, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not connected' });
    }
    const { id } = req.params;
    const userId = req.user.id;

    const result = await db.collection('subusers').findOneAndDelete({
      _id: new ObjectId(id),
      parentUserId: new ObjectId(userId)
    });

    if (!result) {
      return res.status(404).json({ success: false, error: 'Membre non trouve' });
    }

    res.json({ success: true, message: 'Membre supprime' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur lors de la suppression du membre' });
  }
});

// POST /api/subusers/:id/resend-invite - Resend invitation
app.post('/api/subusers/:id/resend-invite', authenticateUser, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not connected' });
    }
    const { id } = req.params;
    const userId = req.user.id;

    const subUser = await db.collection('subusers').findOne({
      _id: new ObjectId(id),
      parentUserId: new ObjectId(userId),
      status: 'pending'
    });

    if (!subUser) {
      return res.status(404).json({ success: false, error: 'Membre non trouve ou deja active' });
    }

    const activationToken = crypto.randomBytes(32).toString('hex');
    await db.collection('subusers').updateOne(
      { _id: new ObjectId(id) },
      { $set: { activationToken, invitedAt: new Date(), updatedAt: new Date() } }
    );

    res.json({ success: true, message: 'Invitation renvoyee' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur lors du renvoi de l\'invitation' });
  }
});

// GET /api/subusers/limit/info - Get limit info
app.get('/api/subusers/limit/info', authenticateUser, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not connected' });
    }
    const limitInfo = await getSubUserLimitInfo(req.user.id);
    res.json({
      success: true,
      data: {
        current: limitInfo.currentCount,
        max: limitInfo.maxAllowed,
        remaining: limitInfo.remaining,
        plan: limitInfo.plan,
        canAdd: limitInfo.allowed
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur lors de la recuperation des limites' });
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
    console.log('SubUsers API: Enabled');
  });
}

startServer();
