// Authentication Routes - JWT Authentication System
// RT Backend Services - Version 3.0.0 - Two-Factor Authentication
// SECURITY: Authentification à deux facteurs (2FA) par email

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  authenticateToken
} = require('./auth-middleware');

// Security Enhancements v2.5.0 + SEC-012
const { RateLimiterManager, ProgressiveIPBlocker } = require('./rate-limiter-middleware');
const { createEmailVerificationService } = require('./email-verification-service');

// Two-Factor Authentication v3.0.0
const { TwoFactorAuthService } = require('./two-factor-auth-service');

// AWS SES Email Service pour l'envoi des codes 2FA
const { createAWSSESEmailService } = require('./aws-ses-email-service');

// Validation Joi v3.0.0 - SEC-006
const { validate } = require('./validation-middleware');
const { authSchemas } = require('./validation-schemas');

const SALT_ROUNDS = 10;

function createAuthRoutes(mongoClient, mongoConnected) {
  const router = express.Router();

  // Security Services v2.5.0 + SEC-012
  let rateLimiterManager = null;
  let emailVerificationService = null;
  let twoFactorAuthService = null;
  let sesEmailService = null;
  let progressiveIPBlocker = null;

  // Initialiser les services de sécurité quand MongoDB est connecté
  const initSecurityServices = async () => {
    if (mongoConnected && mongoClient) {
      try {
        const db = mongoClient.db();
        rateLimiterManager = new RateLimiterManager(db);
        emailVerificationService = createEmailVerificationService(db);

        // Initialiser AWS SES Email Service
        sesEmailService = createAWSSESEmailService();
        console.log('[AUTH] AWS SES Email Service initialized');

        // Fonction d'envoi d'email pour le 2FA utilisant le template OTP
        const send2FAEmail = async (options) => {
          const { to, subject, html, text } = options;
          // Utiliser sendEmail directement avec le HTML généré par le service 2FA
          return sesEmailService.sendEmail({
            to,
            subject,
            html,
            text,
            senderType: 'notifications'
          });
        };

        // Initialiser le service 2FA avec la fonction d'envoi d'email AWS SES
        twoFactorAuthService = new TwoFactorAuthService(db, send2FAEmail);

        // SEC-012: Initialiser le blocage progressif par IP
        progressiveIPBlocker = new ProgressiveIPBlocker(mongoClient);
        console.log('[AUTH] Security services initialized (rate limiting, OTP, 2FA with AWS SES, progressive IP blocking)');
      } catch (error) {
        console.error('[AUTH] Failed to initialize security services:', error.message);
      }
    }
  };
  initSecurityServices();

  // Middleware pour vérifier la connexion MongoDB
  const checkMongoDB = (req, res, next) => {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available'
        }
      });
    }
    next();
  };

  // Middleware Rate Limiting pour register
  const rateLimitRegister = async (req, res, next) => {
    if (!rateLimiterManager) return next();
    try {
      const key = req.ip || req.connection.remoteAddress;
      await rateLimiterManager.consume('auth:register', key);
      next();
    } catch (rateLimiterRes) {
      const retryAfter = Math.ceil(rateLimiterRes.msBeforeNext / 1000);
      res.set('Retry-After', retryAfter);
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many registration attempts. Please try again later.',
          retryAfter
        }
      });
    }
  };

  // Middleware Rate Limiting pour login
  const rateLimitLogin = async (req, res, next) => {
    if (!rateLimiterManager) return next();
    try {
      const key = req.ip || req.connection.remoteAddress;
      await rateLimiterManager.consume('auth:login', key);
      next();
    } catch (rateLimiterRes) {
      const retryAfter = Math.ceil(rateLimiterRes.msBeforeNext / 1000);
      res.set('Retry-After', retryAfter);
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many login attempts. Please try again later.',
          retryAfter
        }
      });
    }
  };

  // SEC-012: Middleware de blocage progressif par IP
  const progressiveBlock = async (req, res, next) => {
    if (!progressiveIPBlocker) return next();
    try {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const blockStatus = await progressiveIPBlocker.isBlocked(ip);

      if (blockStatus.blocked) {
        res.set('Retry-After', blockStatus.retryAfter);
        return res.status(429).json({
          success: false,
          error: {
            code: 'IP_BLOCKED',
            message: `Your IP is temporarily blocked due to multiple failed attempts. Try again in ${Math.ceil(blockStatus.retryAfter / 60)} minutes.`,
            retryAfter: blockStatus.retryAfter
          }
        });
      }

      // Helpers pour enregistrer échecs/succès
      req.recordAuthFailure = () => progressiveIPBlocker.recordFailure(ip, req.path);
      req.resetAuthFailures = () => progressiveIPBlocker.resetFailures(ip);
      next();
    } catch (err) {
      console.error('[ProgressiveBlock] Error:', err);
      next(); // Ne pas bloquer en cas d'erreur
    }
  };

  // ==================== ENDPOINTS D'AUTHENTIFICATION ====================

  /**
   * POST /api/auth/register
   * Inscription d'un nouvel utilisateur
   *
   * Body: {
   *   email: "user@example.com",
   *   password: "securePassword123",
   *   companyName: "My Company",
   *   role: "carrier" | "industrial" | "admin",
   *   metadata: { ... }
   * }
   */
  router.post('/register', rateLimitRegister, validate(authSchemas.register), checkMongoDB, async (req, res) => {
    try {
      // Données validées et sanitisées par Joi
      const { email, password, companyName, role = 'carrier', metadata = {} } = req.body;

      // Valider le format de l'email
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

      // Valider la force du mot de passe
      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'WEAK_PASSWORD',
            message: 'Password must be at least 8 characters long'
          }
        });
      }

      // Valider le rôle
      const validRoles = ['carrier', 'industrial', 'admin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ROLE',
            message: 'Invalid role. Must be: carrier, industrial, or admin',
            validRoles
          }
        });
      }

      const db = mongoClient.db();

      // Vérifier si l'email existe déjà
      const existingUser = await db.collection('users').findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'EMAIL_EXISTS',
            message: 'An account with this email already exists'
          }
        });
      }

      // Hasher le mot de passe
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      // Créer l'utilisateur
      const now = new Date();
      const newUser = {
        email: email.toLowerCase(),
        password: hashedPassword,
        companyName: companyName || null,
        role,
        metadata,
        isActive: true,
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null
      };

      const result = await db.collection('users').insertOne(newUser);
      const userId = result.insertedId.toString();

      // Générer les tokens JWT
      const tokenPayload = {
        userId,
        email: newUser.email,
        role: newUser.role,
        companyName: newUser.companyName
      };

      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken({ userId });

      // Hasher le refresh token avant stockage (sécurité)
      const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

      // Stocker le refresh token hashé dans la DB
      await db.collection('refresh_tokens').insertOne({
        userId,
        tokenHash: refreshTokenHash,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 jours
      });

      // Ne pas renvoyer le mot de passe
      delete newUser.password;

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: {
            ...newUser,
            _id: userId
          },
          tokens: {
            accessToken,
            refreshToken,
            expiresIn: '1h'
          }
        }
      });
    } catch (error) {
      console.error('Error during registration:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * POST /api/auth/login
   * Connexion d'un utilisateur existant
   * SECURITY: Avec authentification à deux facteurs (2FA)
   *
   * Body: {
   *   email: "user@example.com",
   *   password: "securePassword123"
   * }
   *
   * Response (si 2FA activé):
   * {
   *   success: true,
   *   requires2FA: true,
   *   sessionId: "...",
   *   message: "Code de vérification envoyé par email"
   * }
   */
  router.post('/login', progressiveBlock, rateLimitLogin, validate(authSchemas.login), checkMongoDB, async (req, res) => {
    try {
      // Données validées et sanitisées par Joi
      const { email, password } = req.body;

      const db = mongoClient.db();

      // Chercher l'utilisateur
      const user = await db.collection('users').findOne({ email: email.toLowerCase() });
      if (!user) {
        // SEC-012: Enregistrer l'échec
        if (req.recordAuthFailure) await req.recordAuthFailure();
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password'
          }
        });
      }

      // Vérifier si le compte est actif
      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ACCOUNT_DISABLED',
            message: 'This account has been disabled'
          }
        });
      }

      // Vérifier le mot de passe
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        // SEC-012: Enregistrer l'échec
        if (req.recordAuthFailure) await req.recordAuthFailure();
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password'
          }
        });
      }

      // SEC-012: Réinitialiser les échecs après succès
      if (req.resetAuthFailures) await req.resetAuthFailures();

      // Mettre à jour la date de dernière connexion
      const now = new Date();
      await db.collection('users').updateOne(
        { _id: user._id },
        { $set: { lastLoginAt: now } }
      );

      // ============================================================
      // AUTHENTIFICATION À DEUX FACTEURS (2FA)
      // ============================================================
      // Vérifier si le 2FA est activé pour cet utilisateur
      if (twoFactorAuthService && twoFactorAuthService.is2FAEnabled(user)) {
        // Initier le processus 2FA
        const twoFAResult = await twoFactorAuthService.initiate2FA(user, {
          ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
          userAgent: req.headers['user-agent']
        });

        if (!twoFAResult.success) {
          return res.status(twoFAResult.error.code === '2FA_BLOCKED' ? 429 : 400).json({
            success: false,
            error: twoFAResult.error
          });
        }

        // Retourner la session 2FA (pas encore de token)
        return res.json({
          success: true,
          requires2FA: true,
          message: twoFAResult.message,
          data: {
            sessionId: twoFAResult.data.sessionId,
            email: twoFAResult.data.email,
            expiresIn: twoFAResult.data.expiresIn,
            // En dev uniquement
            ...(process.env.NODE_ENV !== 'production' && twoFAResult.data._devOTP && { _devOTP: twoFAResult.data._devOTP })
          }
        });
      }

      // ============================================================
      // CONNEXION SANS 2FA (fallback)
      // ============================================================
      // Générer les tokens JWT directement si 2FA non activé
      const tokenPayload = {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        companyName: user.companyName
      };

      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken({ userId: user._id.toString() });

      // Hasher le refresh token avant stockage (sécurité améliorée)
      const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

      // Stocker le refresh token hashé dans la DB
      await db.collection('refresh_tokens').insertOne({
        userId: user._id.toString(),
        tokenHash: refreshTokenHash,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 jours
      });

      // Ne pas renvoyer le mot de passe
      delete user.password;

      res.json({
        success: true,
        requires2FA: false,
        message: 'Login successful',
        data: {
          user,
          tokens: {
            accessToken,
            refreshToken,
            expiresIn: '15m'
          }
        }
      });
    } catch (error) {
      console.error('Error during login:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: process.env.NODE_ENV === 'production' ? 'An error occurred' : error.message
        }
      });
    }
  });

  /**
   * POST /api/auth/verify-2fa
   * Vérifier le code 2FA et obtenir les tokens d'accès
   *
   * Body: {
   *   sessionId: "...",
   *   code: "123456"
   * }
   */
  router.post('/verify-2fa', rateLimitLogin, checkMongoDB, async (req, res) => {
    try {
      const { sessionId, code } = req.body;

      // Validation
      if (!sessionId || !code) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'Session ID and verification code are required'
          }
        });
      }

      if (!twoFactorAuthService) {
        return res.status(503).json({
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: '2FA service not available'
          }
        });
      }

      // Vérifier le code 2FA
      const verifyResult = await twoFactorAuthService.verify2FA(sessionId, code, {
        ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress
      });

      if (!verifyResult.success) {
        return res.status(400).json({
          success: false,
          error: verifyResult.error,
          remainingAttempts: verifyResult.remainingAttempts
        });
      }

      // 2FA réussi - Générer les tokens JWT
      const { userPayload } = verifyResult.data;
      const now = new Date();

      const accessToken = generateAccessToken(userPayload);
      const refreshToken = generateRefreshToken({ userId: userPayload.userId });

      // Hasher le refresh token avant stockage
      const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

      const db = mongoClient.db();

      // Stocker le refresh token hashé dans la DB
      await db.collection('refresh_tokens').insertOne({
        userId: userPayload.userId,
        tokenHash: refreshTokenHash,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 jours
      });

      // Récupérer les infos utilisateur complètes
      const user = await db.collection('users').findOne(
        { _id: new ObjectId(userPayload.userId) },
        { projection: { password: 0 } }
      );

      res.json({
        success: true,
        message: 'Authentication successful',
        data: {
          user,
          tokens: {
            accessToken,
            refreshToken,
            expiresIn: '15m'
          }
        }
      });
    } catch (error) {
      console.error('Error during 2FA verification:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: process.env.NODE_ENV === 'production' ? 'An error occurred' : error.message
        }
      });
    }
  });

  /**
   * POST /api/auth/resend-2fa
   * Renvoyer un nouveau code 2FA
   *
   * Body: {
   *   sessionId: "..."
   * }
   */
  router.post('/resend-2fa', rateLimitRegister, checkMongoDB, async (req, res) => {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_SESSION_ID',
            message: 'Session ID is required'
          }
        });
      }

      if (!twoFactorAuthService) {
        return res.status(503).json({
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: '2FA service not available'
          }
        });
      }

      const resendResult = await twoFactorAuthService.resendOTP(sessionId);

      if (!resendResult.success) {
        const statusCode = resendResult.error.code === '2FA_COOLDOWN' ? 429 : 400;
        return res.status(statusCode).json({
          success: false,
          error: resendResult.error
        });
      }

      res.json({
        success: true,
        message: resendResult.message,
        data: {
          email: resendResult.data.email,
          expiresIn: resendResult.data.expiresIn,
          ...(process.env.NODE_ENV !== 'production' && resendResult.data._devOTP && { _devOTP: resendResult.data._devOTP })
        }
      });
    } catch (error) {
      console.error('Error resending 2FA code:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: process.env.NODE_ENV === 'production' ? 'An error occurred' : error.message
        }
      });
    }
  });

  /**
   * POST /api/auth/refresh
   * Rafraîchir le token d'accès avec un refresh token
   *
   * Body: {
   *   refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   * }
   */
  router.post('/refresh', validate(authSchemas.refresh), checkMongoDB, async (req, res) => {
    try {
      // Données validées par Joi
      const { refreshToken } = req.body;

      // Vérifier le refresh token
      let decoded;
      try {
        decoded = verifyRefreshToken(refreshToken);
      } catch (error) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INVALID_REFRESH_TOKEN',
            message: 'Invalid or expired refresh token'
          }
        });
      }

      const db = mongoClient.db();

      // Hasher le refresh token pour comparaison sécurisée
      const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

      // Vérifier que le refresh token existe dans la DB (par hash)
      const storedToken = await db.collection('refresh_tokens').findOne({
        userId: decoded.userId,
        tokenHash: refreshTokenHash
      });

      if (!storedToken) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'REFRESH_TOKEN_REVOKED',
            message: 'Refresh token has been revoked'
          }
        });
      }

      // Vérifier que le token n'a pas expiré
      if (storedToken.expiresAt < new Date()) {
        // Supprimer le token expiré
        await db.collection('refresh_tokens').deleteOne({ _id: storedToken._id });
        return res.status(403).json({
          success: false,
          error: {
            code: 'REFRESH_TOKEN_EXPIRED',
            message: 'Refresh token has expired'
          }
        });
      }

      // Récupérer les informations utilisateur
      const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
      if (!user || !user.isActive) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found or disabled'
          }
        });
      }

      // Générer un nouveau access token
      const tokenPayload = {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        companyName: user.companyName
      };

      const newAccessToken = generateAccessToken(tokenPayload);

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: newAccessToken,
          expiresIn: '1h'
        }
      });
    } catch (error) {
      console.error('Error refreshing token:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * POST /api/auth/logout
   * Déconnexion - Révoque le refresh token
   *
   * Body: {
   *   refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   * }
   */
  router.post('/logout', validate(authSchemas.logout), checkMongoDB, async (req, res) => {
    try {
      // Données validées par Joi
      const { refreshToken } = req.body;

      const db = mongoClient.db();

      // SECURITY FIX: Hasher le token avant recherche (les tokens sont stockés hashés)
      const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

      // Supprimer le refresh token de la DB
      const result = await db.collection('refresh_tokens').deleteOne({ tokenHash: refreshTokenHash });

      if (result.deletedCount === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'REFRESH_TOKEN_NOT_FOUND',
            message: 'Refresh token not found'
          }
        });
      }

      res.json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      console.error('Error during logout:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * GET /api/auth/me
   * Récupérer les informations de l'utilisateur connecté
   * Nécessite un token JWT valide
   */
  router.get('/me', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();

      const user = await db.collection('users').findOne(
        { _id: new ObjectId(req.user.userId) },
        { projection: { password: 0 } } // Exclure le mot de passe
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          }
        });
      }

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      console.error('Error fetching user info:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * PUT /api/auth/change-password
   * Changer le mot de passe de l'utilisateur connecté
   *
   * Body: {
   *   currentPassword: "oldPassword123",
   *   newPassword: "newSecurePassword456"
   * }
   */
  router.put('/change-password', authenticateToken, validate(authSchemas.changePassword), checkMongoDB, async (req, res) => {
    try {
      // Données validées par Joi (password 12+ chars, complexité vérifiée)
      const { currentPassword, newPassword } = req.body;

      const db = mongoClient.db();
      const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          }
        });
      }

      // Vérifier le mot de passe actuel
      const passwordMatch = await bcrypt.compare(currentPassword, user.password);
      if (!passwordMatch) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_PASSWORD',
            message: 'Current password is incorrect'
          }
        });
      }

      // Hasher le nouveau mot de passe
      const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

      // Mettre à jour le mot de passe
      await db.collection('users').updateOne(
        { _id: user._id },
        {
          $set: {
            password: hashedPassword,
            updatedAt: new Date()
          }
        }
      );

      // Révoquer tous les refresh tokens existants pour forcer une nouvelle connexion
      await db.collection('refresh_tokens').deleteMany({ userId: req.user.userId });

      res.json({
        success: true,
        message: 'Password changed successfully. Please login again with your new password.'
      });
    } catch (error) {
      console.error('Error changing password:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // ==================== EMAIL VERIFICATION (OTP) ====================

  /**
   * POST /api/auth/send-otp
   * Envoyer un code OTP pour vérification d'email
   *
   * Body: {
   *   email: "user@example.com"
   * }
   */
  router.post('/send-otp', rateLimitRegister, validate(authSchemas.sendOtp), checkMongoDB, async (req, res) => {
    try {
      // Données validées par Joi
      const { email } = req.body;

      if (!emailVerificationService) {
        return res.status(503).json({
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Email verification service not available'
          }
        });
      }

      const result = await emailVerificationService.sendOTP(email);

      if (!result.success) {
        return res.status(result.cooldownRemaining ? 429 : 500).json({
          success: false,
          error: {
            code: result.cooldownRemaining ? 'COOLDOWN_ACTIVE' : 'SEND_FAILED',
            message: result.error,
            cooldownRemaining: result.cooldownRemaining
          }
        });
      }

      res.json({
        success: true,
        message: 'OTP sent successfully',
        data: {
          email: result.email,
          expiresIn: result.expiresIn
        }
      });
    } catch (error) {
      console.error('Error sending OTP:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * POST /api/auth/verify-otp
   * Vérifier un code OTP
   *
   * Body: {
   *   email: "user@example.com",
   *   otp: "123456"
   * }
   */
  router.post('/verify-otp', rateLimitLogin, validate(authSchemas.verifyOtp), checkMongoDB, async (req, res) => {
    try {
      // Données validées par Joi
      const { email, otp } = req.body;

      if (!emailVerificationService) {
        return res.status(503).json({
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Email verification service not available'
          }
        });
      }

      const result = await emailVerificationService.verifyOTP(email, otp);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VERIFICATION_FAILED',
            message: result.error,
            attemptsRemaining: result.attemptsRemaining
          }
        });
      }

      // Marquer l'email comme vérifié dans la collection users
      const db = mongoClient.db();
      await db.collection('users').updateOne(
        { email: email.toLowerCase() },
        { $set: { emailVerified: true, emailVerifiedAt: new Date() } }
      );

      res.json({
        success: true,
        message: 'Email verified successfully',
        data: {
          email: result.email,
          verified: true
        }
      });
    } catch (error) {
      console.error('Error verifying OTP:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  return router;
}

module.exports = createAuthRoutes;
