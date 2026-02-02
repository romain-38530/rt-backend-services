// RT Authentication API with Express and MongoDB
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient, ObjectId } = require('mongodb');
const fetch = require('node-fetch');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { setupCarrierRoutes, checkAndSendVigilanceAlerts } = require('./carriers');
const { sendClientOnboardingConfirmationEmail } = require('./email');
const { setupSubUsersRoutes } = require('./subusers');
const cron = require('node-cron');

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
      'POST /auth/admin/login',
      'POST /api/auth/admin/login',
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

// Reset password (admin only - secured by secret)
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, newPassword, adminSecret } = req.body;
    const expectedSecret = process.env.ADMIN_RESET_SECRET || 'symphonia-admin-reset-2026';
    if (adminSecret !== expectedSecret) {
      return res.status(403).json({ message: 'Invalid admin secret' });
    }
    if (!email || !newPassword) {
      return res.status(400).json({ message: 'Email and newPassword are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    if (!mongoConnected || !db) {
      return res.status(503).json({ message: 'Database not connected' });
    }
    const user = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { password: hashedPassword, updatedAt: new Date() } }
    );
    console.log('[Auth] Password reset for user:', email);
    res.status(200).json({
      message: 'Password reset successfully',
      user: { id: user._id, email: user.email, name: user.name, portal: user.portal }
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

// Admin Login - endpoint for backoffice-admin (both /auth and /api/auth paths)
// Accepts either 'password' or 'adminKey' for flexibility
const adminLoginHandler = async (req, res) => {
  try {
    console.log('Admin login request body:', JSON.stringify(req.body));
    const { email, password, adminKey } = req.body || {};
    const credential = password || adminKey;

    if (!email || !credential) {
      return res.status(400).json({ success: false, error: 'Email et cle admin requis' });
    }

    if (!mongoConnected || !db) {
      return res.status(503).json({ success: false, error: 'Base de données non connectée' });
    }

    // First try admin_keys collection (simple admin key auth)
    const adminKeyDoc = await db.collection('admin_keys').findOne({
      email: email.toLowerCase(),
      active: true
    });

    if (adminKeyDoc && adminKeyDoc.key === credential) {
      const token = jwt.sign(
        { userId: adminKeyDoc._id, email: adminKeyDoc.email, role: 'admin', roles: ['admin', 'super_admin'], portal: 'admin' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.status(200).json({
        success: true,
        token,
        accessToken: token,
        user: {
          id: adminKeyDoc._id,
          email: adminKeyDoc.email,
          role: 'admin',
          accountType: 'admin'
        }
      });
    }

    // Then try users collection with admin role
    const user = await db.collection('users').findOne({
      email: email.toLowerCase(),
      $or: [
        { role: 'admin' },
        { role: 'superadmin' },
        { accountType: 'admin' },
        { portal: 'admin' }
      ]
    });

    if (user) {
      const isPasswordValid = await bcrypt.compare(credential, user.password);
      if (isPasswordValid) {
        const token = jwt.sign(
          { userId: user._id, email: user.email, role: user.role || 'admin', roles: [user.role || 'admin', 'super_admin'], portal: 'admin' },
          JWT_SECRET,
          { expiresIn: '7d' }
        );

        return res.status(200).json({
          success: true,
          token,
          accessToken: token,
          user: {
            id: user._id,
            email: user.email,
            name: user.name || user.firstName,
            role: user.role || 'admin',
            accountType: user.accountType || 'admin'
          }
        });
      }
    }

    return res.status(401).json({ success: false, error: 'Identifiants invalides ou accès non autorisé' });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, error: error.message || 'Erreur serveur' });
  }
};

// Register both paths for admin login
app.post('/auth/admin/login', adminLoginHandler);
app.post('/api/auth/admin/login', adminLoginHandler);

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

// Manual vigilance check endpoint (for testing/admin)
app.post('/api/vigilance/run-check', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ success: false, error: 'Database not connected' });
  }

  try {
    console.log('[API] Manual vigilance check triggered');
    const alerts = await checkAndSendVigilanceAlerts(db);
    res.json({
      success: true,
      alertsCount: alerts.length,
      alerts: alerts.map(a => ({
        carrierId: a.carrierId,
        documentType: a.documentType,
        daysUntilExpiry: a.daysUntilExpiry
      }))
    });
  } catch (error) {
    console.error('[API] Vigilance check error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
async function startServer() {
  await connectMongoDB();

  // Setup carrier management routes after MongoDB connection
  if (mongoConnected && db) {
    setupCarrierRoutes(app, db);
    setupSubUsersRoutes(app, db, jwt, JWT_SECRET);
    console.log('✓ Carrier management routes configured');

    // Cron job: Alertes de vigilance quotidiennes a 8h00 (heure Paris)
    // Verifie les documents expirant a J-30, J-15, J-7 et envoie des emails
    cron.schedule('0 8 * * *', async () => {
      console.log('[CRON] Running daily vigilance alerts check...');
      try {
        const alerts = await checkAndSendVigilanceAlerts(db);
        console.log(`[CRON] Vigilance check complete: ${alerts.length} alerts sent`);
      } catch (error) {
        console.error('[CRON] Error during vigilance check:', error.message);
      }
    }, {
      timezone: 'Europe/Paris'
    });
    console.log('✓ Vigilance alerts cron job scheduled (daily at 8:00 AM Paris)');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log('RT Authentication API listening on port ' + PORT);
    console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
    console.log('MongoDB: ' + (mongoConnected ? 'Connected' : 'Not connected'));
    console.log('VAT Validation: Enabled (' + Object.keys(VAT_PATTERNS).length + ' EU countries)');
  });
}

startServer();
