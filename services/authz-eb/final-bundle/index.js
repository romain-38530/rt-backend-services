// RT Authentication API with Express and MongoDB
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient, ObjectId } = require('mongodb');
const fetch = require('node-fetch');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { setupCarrierRoutes } = require('./carriers');
const { sendClientOnboardingConfirmationEmail } = require('./email');

const JWT_SECRET = process.env.JWT_SECRET || 'RtProd2026KeyAuth0MainToken123456XY';

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

// Try VIES API (EU official, free)
async function tryVIES(countryCode, vatNumber, timeout) {
  const apiUrl = process.env.VAT_API_URL || 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${apiUrl}/${countryCode}/vat/${vatNumber}`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'RT-VAT-Validation/2.0.0'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`VIES API returned status ${response.status}`);
    }

    const data = await response.json();

    if (data.isValid === undefined) {
      throw new Error('VIES API returned invalid response');
    }

    return {
      success: true,
      valid: data.isValid === true,
      countryCode,
      vatNumber,
      requestDate: data.requestDate || new Date().toISOString(),
      name: data.name || '---',
      address: data.address || '---',
      source: 'VIES'
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw new Error(`VIES failed: ${error.message}`);
  }
}

// Try AbstractAPI (paid, reliable)
async function tryAbstractAPI(countryCode, vatNumber, timeout) {
  const apiKey = process.env.ABSTRACT_API_KEY || '136de56bb0ed40daaa31e07b69f80e81';
  const apiUrl = 'https://vat.abstractapi.com/v1/validate';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const vatNumberFull = `${countryCode}${vatNumber}`;
    const response = await fetch(`${apiUrl}?api_key=${apiKey}&vat_number=${vatNumberFull}`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'RT-VAT-Validation/2.0.0'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`AbstractAPI returned status ${response.status}`);
    }

    const data = await response.json();

    if (data.valid === undefined) {
      throw new Error('AbstractAPI returned invalid response');
    }

    return {
      success: true,
      valid: data.valid === true,
      countryCode,
      vatNumber,
      requestDate: new Date().toISOString(),
      name: data.company?.name || '---',
      address: data.company?.address || '---',
      source: 'AbstractAPI'
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw new Error(`AbstractAPI failed: ${error.message}`);
  }
}

// Try APILayer (paid, has price calculation too)
async function tryAPILayer(countryCode, vatNumber, timeout) {
  const apiKey = process.env.APILAYER_API_KEY || '5e2e36738393d1a68e0ce772852cbaff';
  const apiUrl = 'http://apilayer.net/api/validate';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const vatNumberFull = `${countryCode}${vatNumber}`;
    const response = await fetch(`${apiUrl}?access_key=${apiKey}&vat_number=${vatNumberFull}`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'RT-VAT-Validation/2.0.0'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`APILayer returned status ${response.status}`);
    }

    const data = await response.json();

    if (!data.success || data.valid === undefined) {
      throw new Error('APILayer returned invalid response');
    }

    return {
      success: true,
      valid: data.valid === true,
      countryCode,
      vatNumber,
      requestDate: new Date().toISOString(),
      name: data.company_name || '---',
      address: data.company_address || '---',
      source: 'APILayer'
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw new Error(`APILayer failed: ${error.message}`);
  }
}

// INSEE SIRENE API enrichment for French companies
// Using recherche-entreprises.api.gouv.fr (free, no auth required)
async function enrichWithINSEE(siren) {
  const timeout = 8000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // API Recherche Entreprises (gratuite, sans authentification)
    const response = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${siren}&mtm_campaign=rt-symphonia`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'RT-VAT-Validation/2.0.0'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`INSEE API returned status ${response.status} for SIREN ${siren}`);
      return null;
    }

    const data = await response.json();

    // Trouver l'entreprise correspondante
    const results = data.results || [];
    const entreprise = results.find(r => r.siren === siren) || results[0];

    if (!entreprise) {
      console.log(`INSEE API: No entreprise found for SIREN ${siren}`);
      return null;
    }

    // Mapping des catégories juridiques
    const categoriesJuridiques = {
      '1000': 'Entrepreneur individuel',
      '5498': 'EURL',
      '5499': 'SARL',
      '5505': 'SA à conseil d\'administration',
      '5510': 'SA à directoire',
      '5710': 'SAS',
      '5720': 'SASU',
      '5800': 'Société européenne',
      '6540': 'SCI',
      '6541': 'SCI de construction-vente',
      '6542': 'SCI d\'attribution',
      '6543': 'SCI d\'investissement',
      '6544': 'SCPI',
      '6599': 'Autres sociétés civiles'
    };

    // Récupérer le siège social
    const siege = entreprise.siege || {};
    const siret = siege.siret || null;

    const categorieJuridique = entreprise.nature_juridique;
    const formeJuridique = categoriesJuridiques[categorieJuridique] ||
      entreprise.nature_juridique_libelle ||
      (categorieJuridique?.startsWith('54') ? 'SARL' :
       categorieJuridique?.startsWith('57') ? 'SAS' :
       categorieJuridique?.startsWith('55') ? 'SA' : null);

    console.log(`INSEE enrichment success for SIREN ${siren}: ${formeJuridique}, SIRET: ${siret}`);

    return {
      siren: entreprise.siren,
      siret: siret,
      formeJuridique: formeJuridique,
      categorieJuridique: categorieJuridique,
      dateCreation: entreprise.date_creation,
      trancheEffectifs: entreprise.tranche_effectif_salarie,
      denominationUsuelle: entreprise.nom_raison_sociale,
      activitePrincipale: siege.activite_principale,
      economieSocialeETSolidaire: entreprise.economie_sociale_solidaire
    };
  } catch (error) {
    clearTimeout(timeoutId);
    console.log(`INSEE enrichment failed for SIREN ${siren}: ${error.message}`);
    return null;
  }
}

// Parse address to extract postal code and city
function parseAddress(address) {
  if (!address) return { address: '', postalCode: '', city: '' };

  // Format typique: "123 RUE EXEMPLE\n75001 PARIS"
  const lines = address.split('\n');
  if (lines.length >= 2) {
    const lastLine = lines[lines.length - 1];
    const match = lastLine.match(/^(\d{5})\s+(.+)$/);
    if (match) {
      return {
        address: lines.slice(0, -1).join(', '),
        postalCode: match[1],
        city: match[2]
      };
    }
  }

  // Essayer de trouver le code postal dans la chaîne
  const cpMatch = address.match(/(\d{5})\s+([A-Z\s\-]+)$/);
  if (cpMatch) {
    const idx = address.indexOf(cpMatch[0]);
    return {
      address: address.substring(0, idx).trim().replace(/\n/g, ', '),
      postalCode: cpMatch[1],
      city: cpMatch[2].trim()
    };
  }

  return { address: address.replace(/\n/g, ', '), postalCode: '', city: '' };
}

// Main validation function with fallback system
async function validateVATWithVIES(countryCode, vatNumber) {
  const cacheKey = `${countryCode}${vatNumber}`;

  // Check cache
  const cached = vatCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.response;
  }

  const timeout = parseInt(process.env.VAT_API_TIMEOUT || '10000');
  const errors = [];

  // Try APIs in order: VIES (free) -> AbstractAPI -> APILayer
  const apis = [
    { name: 'VIES', fn: tryVIES },
    { name: 'AbstractAPI', fn: tryAbstractAPI },
    { name: 'APILayer', fn: tryAPILayer }
  ];

  for (const api of apis) {
    try {
      const result = await api.fn(countryCode, vatNumber, timeout);

      // Cache successful response
      if (result.valid) {
        vatCache.set(cacheKey, {
          response: result,
          timestamp: Date.now()
        });
      }

      return result;
    } catch (error) {
      errors.push(`${api.name}: ${error.message}`);
      // Continue to next API
    }
  }

  // All APIs failed
  return {
    success: false,
    valid: false,
    countryCode,
    vatNumber,
    requestDate: new Date().toISOString(),
    errorCode: 'ALL_APIS_FAILED',
    errorMessage: errors.join(' | '),
    source: 'none'
  };
}

// Middleware
app.use(helmet());

// CORS configuration - Allow Amplify domains and main domains
const allowedOrigins = [
  'https://main.df8cnylp3pqka.amplifyapp.com',
  'https://www.symphonia-controltower.com',
  'https://symphonia-controltower.com',
  'https://industrie.symphonia-controltower.com',
  'https://fournisseur.symphonia-controltower.com',
  'https://destinataire.symphonia-controltower.com',
  'https://transporteur.symphonia-controltower.com',
  'https://www.rt-technologie.com',
  'https://rttechnologie.com',
  'http://localhost:3000', // Local development
  'http://localhost:3001',
  'http://localhost:5173', // Vite dev server
  'http://localhost:5174'
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

    // Check if origin matches *.symphonia-controltower.com pattern
    if (origin.match(/^https:\/\/.*\.symphonia-controltower\.com$/) || origin === 'https://symphonia-controltower.com') {
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

// URL rewriting middleware for /api/v1/* routes
app.use((req, res, next) => {
  // Rewrite /api/v1/authz/* to /* and /api/v1/auth/* to /*
  if (req.url.startsWith('/api/v1/authz/')) {
    req.url = req.url.replace('/api/v1/authz', '');
  } else if (req.url.startsWith('/api/v1/auth/')) {
    req.url = req.url.replace('/api/v1/auth', '');
  } else if (req.url.startsWith('/api/v1/')) {
    req.url = req.url.replace('/api/v1/', '/');
  }
  next();
});

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
    message: 'RT Authentication API with VAT Validation & Carrier Management',
    version: '3.1.0',
    features: [
      'Express',
      'MongoDB',
      'CORS',
      'Helmet',
      'User Authentication (JWT)',
      'VAT Validation (Multi-API Fallback: VIES -> AbstractAPI -> APILayer)',
      'Price Calculation',
      'Carrier Management System (SYMPHONI.A)',
      'Document Vigilance System',
      'Dynamic Scoring Algorithm',
      'Dispatch Chain Management'
    ],
    endpoints: [
      'GET /health',
      'GET /',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/auth/me',
      'POST /api/vat/validate-format',
      'POST /api/vat/validate',
      'POST /api/vat/calculate-price',
      'POST /api/onboarding/submit',
      'POST /api/carriers/invite',
      'POST /api/carriers/onboard',
      'GET /api/carriers',
      'GET /api/carriers/:carrierId',
      'POST /api/carriers/:carrierId/documents',
      'PUT /api/carriers/:carrierId/documents/:documentId/verify',
      'POST /api/carriers/:carrierId/pricing-grids',
      'POST /api/carriers/:carrierId/calculate-score',
      'POST /api/dispatch-chains'
    ]
  });
});

// ==================== AUTHENTICATION ROUTES ====================

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, portal, companyName, phone } = req.body;

    if (!email || !password || !portal) {
      return res.status(400).json({ message: 'Email, password, and portal are required' });
    }

    // Validate portal value
    const validPortals = ['industry', 'transporter', 'recipient', 'supplier', 'forwarder', 'logistician', 'backoffice'];
    if (!validPortals.includes(portal)) {
      return res.status(400).json({
        message: `Invalid portal. Must be one of: ${validPortals.join(', ')}`
      });
    }

    if (!mongoConnected || !db) {
      return res.status(503).json({ message: 'Database not connected' });
    }

    // Check if user already exists
    const existingUser = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = {
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      name: name || null,
      portal,
      role: 'user',
      companyName: companyName || null,
      phone: phone || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('users').insertOne(newUser);

    // Generate JWT token
    const token = jwt.sign(
      { userId: result.insertedId, email: newUser.email, role: newUser.role, portal: newUser.portal },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: result.insertedId,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        portal: newUser.portal
      }
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    if (!mongoConnected || !db) {
      return res.status(503).json({ message: 'Database not connected' });
    }

    // Find user by email
    const user = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role, portal: user.portal },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        portal: user.portal,
        companyName: user.companyName,
        organization: user.organization,
        modules: user.modules || {},
        subscription: user.subscription || null,
        accountType: user.accountType,
        accountStatus: user.accountStatus
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

// Get current user
app.get('/api/auth/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    if (!mongoConnected || !db) {
      return res.status(503).json({ message: 'Database not connected' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(decoded.userId) },
      { projection: { password: 0 } }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        portal: user.portal,
        companyName: user.companyName,
        organization: user.organization,
        modules: user.modules || {},
        subscription: user.subscription || null,
        accountType: user.accountType,
        accountStatus: user.accountStatus
      }
    });

  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
});

// Admin endpoint to update user subscription (protected)
app.post('/api/admin/users/subscription', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    if (!mongoConnected || !db) {
      return res.status(503).json({ message: 'Database not connected' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const adminUser = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });

    // Only allow admin users (r.tardy@rt-groupe.com or admin role)
    if (!adminUser || (adminUser.email !== 'r.tardy@rt-groupe.com' && adminUser.role !== 'admin')) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { emails, subscription, carrierId, carrierName } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ message: 'emails array is required' });
    }

    const results = { updated: 0, notFound: 0, errors: [] };

    for (const email of emails) {
      try {
        const updateData = { updatedAt: new Date() };
        if (subscription) updateData.subscription = subscription;
        if (carrierId) updateData.carrierId = carrierId;
        if (carrierName) {
          updateData.carrierName = carrierName;
          updateData.companyName = carrierName;
        }

        const result = await db.collection('users').updateOne(
          { email: email.toLowerCase() },
          { $set: updateData }
        );

        if (result.matchedCount > 0) results.updated++;
        else results.notFound++;
      } catch (e) {
        results.errors.push({ email, error: e.message });
      }
    }

    res.json({ success: true, message: `Updated ${results.updated} users`, results });
  } catch (error) {
    console.error('Admin subscription update error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== END AUTHENTICATION ROUTES ====================

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

    // Préparer la réponse de base
    const response = {
      success: true,
      valid: viesResult.valid,
      countryCode: viesResult.countryCode,
      vatNumber: viesResult.vatNumber,
      requestDate: viesResult.requestDate,
      companyName: viesResult.name,
      companyAddress: viesResult.address,
      source: viesResult.source,
      errorCode: viesResult.errorCode,
      errorMessage: viesResult.errorMessage
    };

    // Pour les entreprises françaises valides, enrichir avec l'API INSEE
    if (viesResult.valid && parsed.countryCode === 'FR') {
      try {
        // Le SIREN est composé des 9 derniers chiffres du numéro de TVA (après les 2 chiffres de clé)
        const siren = parsed.vatNumber.substring(2); // Enlever les 2 premiers chiffres (clé)

        const inseeData = await enrichWithINSEE(siren);

        if (inseeData) {
          response.siren = inseeData.siren;
          response.siret = inseeData.siret;
          response.legalForm = inseeData.formeJuridique;
          response.categorieJuridique = inseeData.categorieJuridique;
          response.dateCreation = inseeData.dateCreation;
          response.activitePrincipale = inseeData.activitePrincipale;
        }

        // Parser l'adresse pour extraire code postal et ville
        const parsedAddr = parseAddress(viesResult.address);
        response.streetAddress = parsedAddr.address;
        response.postalCode = parsedAddr.postalCode;
        response.city = parsedAddr.city;

      } catch (enrichError) {
        console.log('INSEE enrichment error:', enrichError.message);
        // Continue sans enrichissement
      }
    }

    res.json(response);

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

// Check if VAT number is already registered
app.get('/api/vat/check-registered/:vatNumber', async (req, res) => {
  try {
    const { vatNumber } = req.params;

    if (!vatNumber || vatNumber.length < 5) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'vatNumber is required' }
      });
    }

    if (!mongoConnected || !db) {
      // Si pas de connexion DB, on ne peut pas vérifier - on laisse passer
      return res.json({ success: true, registered: false });
    }

    // Chercher dans onboarding_requests
    const existing = await db.collection('onboarding_requests').findOne({
      vatNumber: vatNumber.toUpperCase().replace(/[\s\-\.]/g, '')
    });

    res.json({
      success: true,
      registered: !!existing,
      message: existing
        ? `Cette entreprise (TVA: ${vatNumber}) est déjà enregistrée dans notre système.`
        : null
    });

  } catch (error) {
    console.error('Check registered error:', error);
    res.json({ success: true, registered: false }); // En cas d'erreur, on laisse passer
  }
});

// Price calculation with VAT
app.post('/api/vat/calculate-price', async (req, res) => {
  try {
    const { amount, countryCode } = req.body;

    if (!amount || typeof amount !== 'number') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'amount is required and must be a number'
        }
      });
    }

    if (!countryCode || typeof countryCode !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'countryCode is required and must be a string'
        }
      });
    }

    const apiKey = process.env.APILAYER_API_KEY || '5e2e36738393d1a68e0ce772852cbaff';
    const apiUrl = 'http://apilayer.net/api/price';
    const timeout = parseInt(process.env.PRICE_API_TIMEOUT || '10000');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${apiUrl}?access_key=${apiKey}&amount=${amount}&country_code=${countryCode}`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'RT-VAT-Validation/2.0.0'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: `Price API returned status ${response.status}`
          }
        });
      }

      const data = await response.json();

      if (!data.success) {
        return res.json({
          success: false,
          error: {
            code: data.error?.code || 'API_ERROR',
            message: data.error?.type || 'Unknown error from Price API'
          }
        });
      }

      res.json({
        success: true,
        countryCode: data.country_code,
        countryName: data.country_name,
        priceExclVat: data.price_excl_vat,
        priceInclVat: data.price_incl_vat,
        vatRate: data.vat_rate
      });

    } catch (error) {
      return res.json({
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error.message
        }
      });
    }

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

// Onboarding endpoint
app.post('/api/onboarding/submit', async (req, res) => {
  try {
    const { email, companyName, siret, vatNumber, phone, address, subscriptionType, paymentMethod, source } = req.body;

    // Validate required fields
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'email is required and must be a string'
        }
      });
    }

    if (!companyName || typeof companyName !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'companyName is required and must be a string'
        }
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_EMAIL',
          message: 'Invalid email format'
        }
      });
    }

    // Check if MongoDB is connected
    if (!mongoConnected || !db) {
      console.log('MongoDB not available for onboarding request:', email);
      return res.status(503).json({
        success: false,
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database connection is not available'
        }
      });
    }

    // Prepare onboarding document
    const onboardingRequest = {
      email: email.toLowerCase().trim(),
      companyName: companyName.trim(),
      siret: siret ? siret.trim() : null,
      vatNumber: vatNumber ? vatNumber.trim() : null,
      phone: phone ? phone.trim() : null,
      address: address || null,
      subscriptionType: subscriptionType || null,
      paymentMethod: paymentMethod || 'card', // 'card', 'sepa', 'invoice'
      source: source || 'WEB',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null,
      userAgent: req.headers['user-agent'] || null
    };

    console.log('Received onboarding request from:', email, '- Company:', companyName);

    // Insert into MongoDB
    try {
      const collection = db.collection('onboarding_requests');
      const result = await collection.insertOne(onboardingRequest);

      console.log('Onboarding request saved successfully:', result.insertedId);

      // Envoyer l'email de confirmation (non-bloquant)
      sendClientOnboardingConfirmationEmail(
        onboardingRequest.email,
        onboardingRequest.companyName,
        result.insertedId.toString(),
        {
          paymentMethod: onboardingRequest.paymentMethod,
          subscriptionType: onboardingRequest.subscriptionType
        }
      ).then(emailResult => {
        if (emailResult.success) {
          console.log('Confirmation email sent to:', onboardingRequest.email);
        } else {
          console.warn('Failed to send confirmation email:', emailResult.error);
        }
      }).catch(emailError => {
        console.error('Email sending error:', emailError.message);
      });

      // Return success response
      res.status(201).json({
        success: true,
        message: 'Onboarding request submitted successfully',
        requestId: result.insertedId.toString(),
        email: onboardingRequest.email,
        companyName: onboardingRequest.companyName,
        status: 'pending',
        createdAt: onboardingRequest.createdAt
      });

    } catch (dbError) {
      console.error('MongoDB insert error:', dbError);

      // Check if it's a duplicate key error
      if (dbError.code === 11000) {
        // Déterminer quel champ est en double
        const duplicateField = dbError.keyValue;
        let errorMessage = 'An onboarding request already exists';

        if (duplicateField && duplicateField.vatNumber) {
          errorMessage = `Cette entreprise (TVA: ${duplicateField.vatNumber}) est déjà enregistrée dans notre système`;
        } else if (duplicateField && duplicateField.email) {
          errorMessage = `Cette adresse email (${duplicateField.email}) est déjà enregistrée dans notre système`;
        }

        return res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_REQUEST',
            message: errorMessage,
            field: duplicateField ? Object.keys(duplicateField)[0] : 'unknown'
          }
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to save onboarding request'
        }
      });
    }

  } catch (error) {
    console.error('Onboarding endpoint error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    });
  }
});

// ==================== STRIPE PAYMENT ROUTES ====================

// Stripe configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_API_URL = 'https://api.stripe.com/v1';

// Price IDs for subscription products
const STRIPE_PRICES = {
  affret_ia: process.env.STRIPE_PRICE_AFFRET_IA || 'price_1SoX3KRzJcFnHbQGYOYq21al',
  pack_industrie: process.env.STRIPE_PRICE_PACK_INDUSTRIE || 'price_1SoX3KRzJcFnHbQGuBkHkP0r',
  tms_connection: process.env.STRIPE_PRICE_TMS_CONNECTION || 'price_1SoX3LRzJcFnHbQG8x6z12Ni',
  transporteur_premium: process.env.STRIPE_PRICE_TRANSPORTEUR_PREMIUM || 'price_1SoX3LRzJcFnHbQGTransPrem',
  industriel_standard: process.env.STRIPE_PRICE_INDUSTRIEL_STANDARD || 'price_1SoX3LRzJcFnHbQGIndStd'
};

// Helper function to make Stripe API requests
async function stripeRequest(method, endpoint, data = null) {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('Stripe API key not configured');
  }

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  };

  if (data) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        if (typeof value === 'object') {
          for (const [subKey, subValue] of Object.entries(value)) {
            params.append(`${key}[${subKey}]`, subValue);
          }
        } else {
          params.append(key, value);
        }
      }
    }
    options.body = params.toString();
  }

  const response = await fetch(`${STRIPE_API_URL}${endpoint}`, options);
  const result = await response.json();

  if (!response.ok) {
    const error = new Error(result.error?.message || 'Stripe API error');
    error.code = result.error?.code;
    error.type = result.error?.type;
    throw error;
  }

  return result;
}

// Create or get Stripe customer for user
async function getOrCreateStripeCustomer(user) {
  if (!db) throw new Error('Database not connected');

  // Check if user already has a Stripe customer ID
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  // Create new Stripe customer
  const customer = await stripeRequest('POST', '/customers', {
    email: user.email,
    name: user.name || user.companyName || user.email,
    metadata: {
      userId: user._id.toString(),
      portal: user.portal,
      companyName: user.companyName || ''
    }
  });

  // Save customer ID to user
  await db.collection('users').updateOne(
    { _id: user._id },
    { $set: { stripeCustomerId: customer.id, updatedAt: new Date() } }
  );

  return customer.id;
}

// POST /api/stripe/create-checkout-session - Create checkout session for subscription
app.post('/api/stripe/create-checkout-session', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!STRIPE_SECRET_KEY) {
      return res.status(503).json({ success: false, message: 'Stripe not configured' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { priceId, successUrl, cancelUrl } = req.body;

    if (!priceId) {
      return res.status(400).json({ success: false, message: 'priceId is required' });
    }

    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(user);

    // Create checkout session
    const session = await stripeRequest('POST', '/checkout/sessions', {
      customer: customerId,
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': 1,
      success_url: successUrl || 'https://transporteur.symphonia-controltower.com/subscription/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl || 'https://transporteur.symphonia-controltower.com/subscription/cancel',
      'metadata[userId]': user._id.toString(),
      'metadata[email]': user.email,
      'subscription_data[metadata][userId]': user._id.toString()
    });

    // Log checkout session creation
    await db.collection('stripe_events').insertOne({
      type: 'checkout_session_created',
      userId: user._id,
      sessionId: session.id,
      priceId,
      createdAt: new Date()
    });

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/stripe/create-session - Create setup intent for card registration
app.post('/api/stripe/create-session', async (req, res) => {
  try {
    const { email, requestId } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'email is required' });
    }

    if (!STRIPE_SECRET_KEY) {
      return res.status(503).json({ success: false, message: 'Stripe not configured' });
    }

    // Check if there's an onboarding request
    let user = null;
    if (requestId && db) {
      try {
        const request = await db.collection('onboarding_requests').findOne({
          _id: new ObjectId(requestId)
        });
        if (request) {
          user = { email: request.email, companyName: request.companyName };
        }
      } catch (e) {
        // Ignore invalid requestId
      }
    }

    // Create or find customer by email
    let customer;
    const existingCustomers = await stripeRequest('GET', `/customers?email=${encodeURIComponent(email)}&limit=1`);

    if (existingCustomers.data && existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripeRequest('POST', '/customers', {
        email,
        name: user?.companyName || email,
        metadata: { requestId: requestId || '', source: 'setup_intent' }
      });
    }

    // Create setup intent
    const setupIntent = await stripeRequest('POST', '/setup_intents', {
      customer: customer.id,
      'payment_method_types[0]': 'card',
      'payment_method_types[1]': 'sepa_debit',
      'metadata[email]': email,
      'metadata[requestId]': requestId || ''
    });

    res.json({
      success: true,
      clientSecret: setupIntent.client_secret,
      customerId: customer.id
    });

  } catch (error) {
    console.error('Stripe setup intent error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/stripe/subscription-status - Get current user's subscription status
app.get('/api/stripe/subscription-status', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Return subscription from user document
    res.json({
      success: true,
      subscription: user.subscription || null,
      stripeCustomerId: user.stripeCustomerId || null,
      stripeSubscriptionId: user.stripeSubscriptionId || null
    });

  } catch (error) {
    console.error('Subscription status error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/stripe/invoices - List invoices for current user
app.get('/api/stripe/invoices', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!STRIPE_SECRET_KEY) {
      return res.status(503).json({ success: false, message: 'Stripe not configured' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
    if (!user || !user.stripeCustomerId) {
      return res.json({ success: true, invoices: [] });
    }

    const invoices = await stripeRequest('GET', `/invoices?customer=${user.stripeCustomerId}&limit=20`);

    res.json({
      success: true,
      invoices: invoices.data.map(inv => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amount: inv.amount_due / 100,
        currency: inv.currency,
        created: new Date(inv.created * 1000).toISOString(),
        pdfUrl: inv.invoice_pdf,
        hostedUrl: inv.hosted_invoice_url
      }))
    });

  } catch (error) {
    console.error('Invoices list error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/stripe/webhooks - Stripe webhook handler
app.post('/api/stripe/webhooks', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    let event;
    const sig = req.headers['stripe-signature'];

    // Verify webhook signature if secret is configured
    if (STRIPE_WEBHOOK_SECRET && sig) {
      const crypto = require('crypto');
      const payload = req.body;
      const timestamp = sig.split(',').find(s => s.startsWith('t='))?.split('=')[1];
      const signatures = sig.split(',').filter(s => s.startsWith('v1=')).map(s => s.split('=')[1]);

      const signedPayload = `${timestamp}.${payload}`;
      const expectedSig = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET)
        .update(signedPayload)
        .digest('hex');

      if (!signatures.includes(expectedSig)) {
        console.error('Webhook signature verification failed');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }

    event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    console.log('Stripe webhook received:', event.type);

    // Log event
    if (db) {
      await db.collection('stripe_events').insertOne({
        eventId: event.id,
        type: event.type,
        data: event.data.object,
        createdAt: new Date()
      });
    }

    // Handle event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;

        if (userId && db) {
          // Update user subscription status
          await db.collection('users').updateOne(
            { _id: new ObjectId(userId) },
            {
              $set: {
                stripeSubscriptionId: session.subscription,
                stripeCustomerId: session.customer,
                'subscription.status': 'active',
                'subscription.subscriptionStatus': 'active',
                'subscription.stripeSessionId': session.id,
                updatedAt: new Date()
              }
            }
          );
          console.log('User subscription activated:', userId);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;

        if (userId && db) {
          const status = subscription.status === 'active' ? 'active' :
                        subscription.status === 'trialing' ? 'trial' :
                        subscription.status === 'past_due' ? 'past_due' : subscription.status;

          await db.collection('users').updateOne(
            { _id: new ObjectId(userId) },
            {
              $set: {
                stripeSubscriptionId: subscription.id,
                'subscription.status': status,
                'subscription.subscriptionStatus': status,
                'subscription.currentPeriodStart': new Date(subscription.current_period_start * 1000),
                'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000),
                updatedAt: new Date()
              }
            }
          );
          console.log('User subscription updated:', userId, status);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;

        if (userId && db) {
          await db.collection('users').updateOne(
            { _id: new ObjectId(userId) },
            {
              $set: {
                'subscription.status': 'cancelled',
                'subscription.subscriptionStatus': 'cancelled',
                'subscription.cancelledAt': new Date(),
                updatedAt: new Date()
              }
            }
          );
          console.log('User subscription cancelled:', userId);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        console.log('Payment succeeded for invoice:', invoice.id);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        if (db) {
          // Find user by customer ID and update status
          await db.collection('users').updateOne(
            { stripeCustomerId: customerId },
            {
              $set: {
                'subscription.status': 'past_due',
                'subscription.subscriptionStatus': 'past_due',
                'subscription.lastPaymentFailure': new Date(),
                updatedAt: new Date()
              }
            }
          );
          console.log('Payment failed for customer:', customerId);
        }
        break;
      }
    }

    res.json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/checkout/create-session - Alternative endpoint for checkout
app.post('/api/checkout/create-session', async (req, res) => {
  // Redirect to main stripe endpoint
  req.url = '/api/stripe/create-checkout-session';
  app.handle(req, res);
});

// ==================== END STRIPE PAYMENT ROUTES ====================

// Start server
async function startServer() {
  await connectMongoDB();

  // Setup carrier management routes after MongoDB connection
  if (mongoConnected && db) {
    setupCarrierRoutes(app, db);
    console.log('✓ Carrier management routes configured');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log('RT Authentication API listening on port ' + PORT);
    console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
    console.log('MongoDB: ' + (mongoConnected ? 'Connected' : 'Not connected'));
    console.log('VAT Validation: Enabled (' + Object.keys(VAT_PATTERNS).length + ' EU countries)');
  });
}

startServer();
