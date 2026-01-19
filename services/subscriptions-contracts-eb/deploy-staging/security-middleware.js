// ============================================================================
// SYMPHONI.A - Security Middleware
// ============================================================================
// Middleware pour la sécurité de l'API:
// - Rate limiting
// - CORS configuration
// - Helmet security headers
// - Request validation
// - IP whitelisting (optional)
// ============================================================================

const rateLimit = require('express-rate-limit');
const cors = require('cors');
const helmet = require('helmet');

// ============================================================================
// Rate Limiting Configuration
// ============================================================================

/**
 * General rate limiter pour toutes les routes
 * 100 requêtes par 15 minutes par IP
 */
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    }
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/';
  }
});

/**
 * Strict rate limiter pour les routes sensibles
 * 20 requêtes par 15 minutes par IP
 */
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests to this endpoint, please try again later.',
      retryAfter: '15 minutes'
    }
  }
});

/**
 * Upload rate limiter pour les uploads de fichiers
 * 10 uploads par heure par IP
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'TOO_MANY_UPLOADS',
      message: 'Too many file uploads, please try again later.',
      retryAfter: '1 hour'
    }
  }
});

/**
 * Authentication rate limiter pour les tentatives de login
 * 5 tentatives par 15 minutes par IP
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'TOO_MANY_AUTH_ATTEMPTS',
      message: 'Too many authentication attempts, please try again later.',
      retryAfter: '15 minutes'
    }
  },
  skipSuccessfulRequests: true // Only count failed attempts
});

// ============================================================================
// CORS Configuration
// ============================================================================

/**
 * CORS configuration - SÉCURISÉE
 * Permet les requêtes depuis les domaines autorisés uniquement.
 * SECURITY FIX: Le bypass a été corrigé - les origines non autorisées sont rejetées.
 */
const corsOptions = {
  origin: function (origin, callback) {
    // Liste des origines autorisées
    const allowedOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
      : [
          // Development
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:3002',
          'http://localhost:3003',
          // Production - SYMPHONI.A portals
          'https://industrie.symphonia-controltower.com',
          'https://industry.symphonia-controltower.com',
          'https://carrier.symphonia-controltower.com',
          'https://transporteur.symphonia-controltower.com',
          'https://admin.symphonia-controltower.com',
          'https://recipient.symphonia-controltower.com',
          'https://destinataire.symphonia-controltower.com',
          'https://supplier.symphonia-controltower.com',
          'https://fournisseur.symphonia-controltower.com',
          'https://logisticien.symphonia-controltower.com',
          'https://symphonia-controltower.com',
          'https://www.symphonia-controltower.com',
          // Amplify domains
          'https://main.d3k4ximjf1cdqf.amplifyapp.com',
          'https://main.d2hfwey35xd9r9.amplifyapp.com',
          'https://main.d1h6dwv7w3s7hf.amplifyapp.com',
          'https://main.d3s1ysyzrjtwkq.amplifyapp.com',
          'https://main.d2m7d79woxw4sk.amplifyapp.com'
        ];

    // En production, exiger un header Origin
    if (!origin) {
      if (process.env.NODE_ENV === 'production') {
        // Bloquer les requêtes sans Origin en production (sauf si explicitement autorisé)
        if (process.env.CORS_ALLOW_NO_ORIGIN === 'true') {
          return callback(null, true);
        }
        console.warn('[SECURITY] CORS blocked request without Origin header in production');
        return callback(new Error('Origin header required'), false);
      }
      // En développement, autoriser les requêtes sans Origin (Postman, curl)
      return callback(null, true);
    }

    // Vérifier si l'origine est autorisée
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      // SECURITY FIX: Rejeter les origines non autorisées (correction du bypass)
      console.warn(`[SECURITY] CORS blocked request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-API-Key',
    'X-CSRF-Token',
    'Accept'
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'Retry-After'
  ],
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 204
};

// ============================================================================
// Helmet Security Headers
// ============================================================================

/**
 * Helmet configuration pour sécuriser les headers HTTP
 */
const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true
};

// ============================================================================
// IP Whitelisting Middleware (Optional)
// ============================================================================

/**
 * Middleware pour whitelist des IPs autorisées
 * À utiliser pour des routes admin ou sensibles
 */
function ipWhitelist(allowedIPs = []) {
  return function (req, res, next) {
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                     req.headers['x-real-ip'] ||
                     req.socket.remoteAddress ||
                     req.connection.remoteAddress;

    console.log(`Request from IP: ${clientIP}`);

    if (allowedIPs.length === 0) {
      // No whitelist configured, allow all
      return next();
    }

    if (allowedIPs.includes(clientIP)) {
      next();
    } else {
      console.warn(`Blocked request from unauthorized IP: ${clientIP}`);
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied from your IP address'
        }
      });
    }
  };
}

// ============================================================================
// Request Size Limiter
// ============================================================================

/**
 * Middleware pour limiter la taille des requêtes
 */
function requestSizeLimiter(maxSize = '10mb') {
  return function (req, res, next) {
    const contentLength = req.headers['content-length'];

    if (contentLength) {
      const maxBytes = parseInt(maxSize) * 1024 * 1024; // Convert MB to bytes

      if (parseInt(contentLength) > maxBytes) {
        return res.status(413).json({
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: `Request body too large. Maximum size: ${maxSize}`
          }
        });
      }
    }

    next();
  };
}

// ============================================================================
// Request Logger Middleware
// ============================================================================

/**
 * Middleware pour logger les requêtes
 */
function requestLogger(req, res, next) {
  const start = Date.now();

  // Log request
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.path} - ` +
      `${res.statusCode} - ${duration}ms`
    );
  });

  next();
}

// ============================================================================
// API Key Validation Middleware (Optional)
// ============================================================================

/**
 * Middleware pour valider les API keys
 * À utiliser pour les routes qui nécessitent une API key
 */
function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      error: {
        code: 'API_KEY_MISSING',
        message: 'API key is required. Include X-API-Key header.'
      }
    });
  }

  // Valider l'API key (à implémenter selon vos besoins)
  const validApiKeys = (process.env.API_KEYS || '').split(',');

  if (!validApiKeys.includes(apiKey)) {
    return res.status(401).json({
      error: {
        code: 'API_KEY_INVALID',
        message: 'Invalid API key'
      }
    });
  }

  next();
}

// ============================================================================
// Sanitize Input Middleware
// ============================================================================

/**
 * Middleware pour sanitizer les inputs
 * Prévention XSS et injection
 */
function sanitizeInput(req, res, next) {
  // Sanitize body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query params
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  next();
}

function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const sanitized = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];

      if (typeof value === 'string') {
        // Remove dangerous characters
        sanitized[key] = value
          .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
          .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '') // Remove iframe tags
          .replace(/javascript:/gi, '') // Remove javascript: protocol
          .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // Remove event handlers
          .trim();
      } else if (typeof value === 'object') {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
  }

  return sanitized;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Rate limiters
  generalLimiter,
  strictLimiter,
  uploadLimiter,
  authLimiter,

  // CORS
  corsOptions,
  cors: cors(corsOptions),

  // Helmet
  helmetOptions,
  helmet: helmet(helmetOptions),

  // Other middlewares
  ipWhitelist,
  requestSizeLimiter,
  requestLogger,
  validateApiKey,
  sanitizeInput
};
