# 🔐 Guide Authentication JWT

**Service:** Subscriptions-Contracts
**Version:** 1.0.0
**Status:** À implémenter

---

## 🎯 Objectif

Sécuriser les endpoints API avec un système d'authentication JWT (JSON Web Token).

---

## 📋 Pourquoi JWT?

- ✅ **Stateless** - Pas besoin de stocker les sessions
- ✅ **Scalable** - Fonctionne avec plusieurs serveurs
- ✅ **Standard** - Supporté partout
- ✅ **Sécurisé** - Tokens signés et vérifiables

---

## 🔧 Installation

### 1. Installer les Dépendances

```bash
cd services/subscriptions-contracts-eb
npm install jsonwebtoken bcrypt
npm install --save-dev @types/jsonwebtoken @types/bcrypt
```

### 2. Configurer Variables d'Environnement

```bash
eb setenv JWT_SECRET="votre-secret-super-securise-genere-aleatoirement" JWT_EXPIRES_IN="7d"
```

---

## 💻 Implémentation

### 1. Créer le Middleware d'Authentication

Créer `auth.middleware.js`:

```javascript
const jwt = require('jsonwebtoken');

/**
 * Middleware d'authentication JWT
 * Vérifie le token dans le header Authorization
 */
function authMiddleware(req, res, next) {
  try {
    // Récupérer le token du header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Authentication token required',
        },
      });
    }

    // Extraire le token
    const token = authHeader.substring(7); // Enlever "Bearer "

    // Vérifier et décoder le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Ajouter les infos utilisateur à la requête
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Authentication token expired',
        },
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid authentication token',
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
}

/**
 * Middleware optionnel - N'échoue pas si pas de token
 */
function optionalAuthMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role,
      };
    }

    next();
  } catch (error) {
    // Ignore les erreurs, passe au suivant
    next();
  }
}

/**
 * Middleware de vérification de rôle
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        },
      });
    }

    next();
  };
}

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  requireRole,
};
```

### 2. Créer Endpoints d'Authentication

Ajouter dans `index.js`:

```javascript
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { authMiddleware, requireRole } = require('./auth.middleware');

// ==================== AUTHENTICATION ====================

// Inscription
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Email, password and name required',
        },
      });
    }

    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: { code: 'DB_NOT_CONNECTED', message: 'Database not available' },
      });
    }

    const db = mongoClient.db();

    // Vérifier si l'utilisateur existe
    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'USER_EXISTS',
          message: 'User with this email already exists',
        },
      });
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Créer l'utilisateur
    const user = {
      email,
      password: hashedPassword,
      name,
      role: 'user', // ou 'admin'
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection('users').insertOne(user);

    // Générer un token
    const token = jwt.sign(
      {
        userId: result.insertedId.toString(),
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: result.insertedId,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

// Connexion
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Email and password required',
        },
      });
    }

    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: { code: 'DB_NOT_CONNECTED', message: 'Database not available' },
      });
    }

    const db = mongoClient.db();

    // Trouver l'utilisateur
    const user = await db.collection('users').findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    // Vérifier le mot de passe
    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    // Générer un token
    const token = jwt.sign(
      {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

// Refresh token
app.post('/api/auth/refresh', authMiddleware, (req, res) => {
  try {
    // Générer un nouveau token
    const token = jwt.sign(
      {
        userId: req.user.id,
        email: req.user.email,
        role: req.user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      data: { token },
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

// Profil utilisateur
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: { code: 'DB_NOT_CONNECTED', message: 'Database not available' },
      });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db();

    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.user.id) },
      { projection: { password: 0 } }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});
```

### 3. Protéger les Endpoints Existants

Modifier les endpoints pour ajouter l'authentication:

```javascript
// Exemple: Protéger les plans (seuls les admins peuvent créer)
app.post('/api/plans', authMiddleware, requireRole('admin'), async (req, res) => {
  // ... code existant
});

// Exemple: Les abonnements nécessitent authentication
app.post('/api/subscriptions', authMiddleware, async (req, res) => {
  // Utiliser req.user.id au lieu de req.body.userId
  const userId = req.user.id;

  // ... reste du code
});

// Exemple: Seul le propriétaire peut annuler son abonnement
app.post('/api/subscriptions/:id/cancel', authMiddleware, async (req, res) => {
  const subscription = await db.collection('subscriptions').findOne({
    _id: new ObjectId(req.params.id),
  });

  if (!subscription) {
    return res.status(404).json({ ... });
  }

  // Vérifier que l'utilisateur est le propriétaire
  if (subscription.userId !== req.user.id) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'You can only cancel your own subscriptions',
      },
    });
  }

  // ... reste du code
});
```

---

## 🧪 Tests

### 1. Inscription
```bash
curl -X POST https://dgze8l03lwl5h.cloudfront.net/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!",
    "name": "Test User"
  }'
```

**Réponse:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "674...",
      "email": "test@example.com",
      "name": "Test User",
      "role": "user"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 2. Connexion
```bash
curl -X POST https://dgze8l03lwl5h.cloudfront.net/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!"
  }'
```

### 3. Accéder à un Endpoint Protégé
```bash
# Sauvegarder le token
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Utiliser le token
curl -X POST https://dgze8l03lwl5h.cloudfront.net/api/subscriptions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "planId": "plan_pro",
    "billingInterval": "MONTHLY",
    "startTrial": true
  }'
```

### 4. Profil Utilisateur
```bash
curl https://dgze8l03lwl5h.cloudfront.net/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🎨 Intégration Frontend

### 1. Stocker le Token

```typescript
// src/lib/auth.ts
export function setAuthToken(token: string) {
  localStorage.setItem('auth_token', token);
}

export function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function removeAuthToken() {
  localStorage.removeItem('auth_token');
}
```

### 2. Intercepteur Fetch

```typescript
// src/lib/api.ts
async function authenticatedFetch(url: string, options: RequestInit = {}) {
  const token = getAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Si 401, rediriger vers login
  if (response.status === 401) {
    removeAuthToken();
    window.location.href = '/login';
    throw new Error('Authentication required');
  }

  return response;
}
```

### 3. Hook React

```typescript
// src/hooks/useAuth.ts
import { useState, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const token = getAuthToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await authenticatedFetch(
          'https://dgze8l03lwl5h.cloudfront.net/api/auth/me'
        );
        const data = await response.json();

        if (data.success) {
          setUser(data.data);
        }
      } catch (error) {
        console.error('Load user error:', error);
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await fetch(
      'https://dgze8l03lwl5h.cloudfront.net/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }
    );

    const data = await response.json();

    if (data.success) {
      setAuthToken(data.data.token);
      setUser(data.data.user);
      return data.data.user;
    }

    throw new Error(data.error.message);
  };

  const logout = () => {
    removeAuthToken();
    setUser(null);
  };

  return { user, loading, login, logout };
}
```

---

## 🔐 Sécurité Best Practices

### 1. Générer un Secret Fort

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 2. HTTPS Obligatoire

Ne jamais envoyer de tokens sur HTTP non sécurisé.

### 3. Expiration Raisonnable

- **Access Token:** 7 jours (ou moins)
- **Refresh Token:** 30 jours

### 4. Validation Côté Serveur

Toujours valider les données côté serveur, jamais faire confiance au client.

### 5. Rate Limiting

Limiter les tentatives de connexion:

```javascript
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 tentatives max
  message: 'Too many login attempts, please try again later',
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  // ...
});
```

---

## ✅ Checklist Implémentation

- [ ] Dépendances installées (jsonwebtoken, bcrypt)
- [ ] Variables JWT_SECRET et JWT_EXPIRES_IN configurées
- [ ] Middleware auth créé
- [ ] Endpoints /api/auth/* créés
- [ ] Endpoints existants protégés
- [ ] Tests effectués (register, login, protected endpoints)
- [ ] Frontend intégré (token storage, interceptors)
- [ ] Rate limiting ajouté
- [ ] Documentation API mise à jour
- [ ] HTTPS vérifié actif

---

**Dernière mise à jour:** 24 novembre 2025
**Version:** 1.0.0
