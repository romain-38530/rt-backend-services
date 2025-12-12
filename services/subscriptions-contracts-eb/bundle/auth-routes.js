// Authentication Routes - JWT Authentication System
// RT Backend Services - Version 1.0.0

const express = require('express');
const bcrypt = require('bcrypt');
const { ObjectId } = require('mongodb');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  authenticateToken
} = require('./auth-middleware');

const SALT_ROUNDS = 10;

function createAuthRoutes(mongoClient, mongoConnected) {
  const router = express.Router();

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
  router.post('/register', checkMongoDB, async (req, res) => {
    try {
      const { email, password, companyName, role = 'carrier', metadata = {} } = req.body;

      // Validation des champs requis
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'Email and password are required'
          }
        });
      }

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

      // Stocker le refresh token dans la DB
      await db.collection('refresh_tokens').insertOne({
        userId,
        token: refreshToken,
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
   *
   * Body: {
   *   email: "user@example.com",
   *   password: "securePassword123"
   * }
   */
  router.post('/login', checkMongoDB, async (req, res) => {
    try {
      const { email, password } = req.body;

      // Validation
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_CREDENTIALS',
            message: 'Email and password are required'
          }
        });
      }

      const db = mongoClient.db();

      // Chercher l'utilisateur
      const user = await db.collection('users').findOne({ email: email.toLowerCase() });
      if (!user) {
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
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password'
          }
        });
      }

      // Mettre à jour la date de dernière connexion
      const now = new Date();
      await db.collection('users').updateOne(
        { _id: user._id },
        { $set: { lastLoginAt: now } }
      );

      // Générer les tokens JWT
      const tokenPayload = {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        companyName: user.companyName
      };

      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken({ userId: user._id.toString() });

      // Stocker le refresh token dans la DB
      await db.collection('refresh_tokens').insertOne({
        userId: user._id.toString(),
        token: refreshToken,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 jours
      });

      // Ne pas renvoyer le mot de passe
      delete user.password;

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user,
          tokens: {
            accessToken,
            refreshToken,
            expiresIn: '1h'
          }
        }
      });
    } catch (error) {
      console.error('Error during login:', error);
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
   * POST /api/auth/refresh
   * Rafraîchir le token d'accès avec un refresh token
   *
   * Body: {
   *   refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   * }
   */
  router.post('/refresh', checkMongoDB, async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'REFRESH_TOKEN_MISSING',
            message: 'Refresh token is required'
          }
        });
      }

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

      // Vérifier que le refresh token existe dans la DB
      const storedToken = await db.collection('refresh_tokens').findOne({
        userId: decoded.userId,
        token: refreshToken
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
  router.post('/logout', checkMongoDB, async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'REFRESH_TOKEN_MISSING',
            message: 'Refresh token is required'
          }
        });
      }

      const db = mongoClient.db();

      // Supprimer le refresh token de la DB
      const result = await db.collection('refresh_tokens').deleteOne({ token: refreshToken });

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
  router.put('/change-password', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'Current password and new password are required'
          }
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'WEAK_PASSWORD',
            message: 'New password must be at least 8 characters long'
          }
        });
      }

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

  return router;
}

module.exports = createAuthRoutes;
