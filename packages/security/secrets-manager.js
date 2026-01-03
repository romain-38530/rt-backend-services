/**
 * AWS Secrets Manager Integration
 * SYMPHONI.A - RT Technologie
 *
 * Service centralisé pour la gestion sécurisée des secrets.
 * Utilise AWS Secrets Manager en production avec cache local.
 *
 * @version 1.0.0
 * @security CRITICAL - Ce module gère tous les secrets de l'application
 */

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

// Configuration
const CONFIG = {
  region: process.env.AWS_REGION || 'eu-west-1',
  secretId: process.env.AWS_SECRETS_MANAGER_SECRET_ID || 'prod/symphonia/secrets',
  cacheTTL: 5 * 60 * 1000, // 5 minutes
  maxRetries: 3,
  retryDelay: 1000
};

// Cache local des secrets
let secretsCache = null;
let cacheTimestamp = 0;

/**
 * Client AWS Secrets Manager (lazy initialization)
 */
let secretsClient = null;

function getSecretsClient() {
  if (!secretsClient) {
    secretsClient = new SecretsManagerClient({
      region: CONFIG.region,
      maxAttempts: CONFIG.maxRetries
    });
  }
  return secretsClient;
}

/**
 * Charge les secrets depuis AWS Secrets Manager
 * @returns {Promise<Object>} Secrets parsés
 */
async function loadSecretsFromAWS() {
  const client = getSecretsClient();

  const command = new GetSecretValueCommand({
    SecretId: CONFIG.secretId
  });

  const response = await client.send(command);

  if (!response.SecretString) {
    throw new Error('Secret value is empty');
  }

  return JSON.parse(response.SecretString);
}

/**
 * Récupère les secrets avec cache
 * @returns {Promise<Object>} Secrets
 */
async function getSecrets() {
  const now = Date.now();

  // Vérifier si le cache est valide
  if (secretsCache && (now - cacheTimestamp) < CONFIG.cacheTTL) {
    return secretsCache;
  }

  // En production, charger depuis AWS
  if (process.env.NODE_ENV === 'production') {
    try {
      secretsCache = await loadSecretsFromAWS();
      cacheTimestamp = now;
      console.log('[SecretsManager] Secrets loaded from AWS Secrets Manager');
      return secretsCache;
    } catch (error) {
      console.error('[SecretsManager] Failed to load secrets from AWS:', error.message);

      // Utiliser le cache expiré si disponible
      if (secretsCache) {
        console.warn('[SecretsManager] Using expired cache as fallback');
        return secretsCache;
      }

      throw error;
    }
  }

  // En développement, utiliser les variables d'environnement
  return getSecretsFromEnv();
}

/**
 * Récupère les secrets depuis les variables d'environnement (développement)
 * @returns {Object} Secrets
 */
function getSecretsFromEnv() {
  return {
    // MongoDB
    MONGODB_URI: process.env.MONGODB_URI,
    MONGODB_DB_NAME: process.env.MONGODB_DB_NAME,

    // JWT
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,

    // Stripe
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,

    // OVH
    OVH_APP_KEY: process.env.OVH_APP_KEY,
    OVH_APP_SECRET: process.env.OVH_APP_SECRET,
    OVH_CONSUMER_KEY: process.env.OVH_CONSUMER_KEY,

    // Email
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    SES_FROM_EMAIL: process.env.SES_FROM_EMAIL,

    // APIs externes
    TOMTOM_API_KEY: process.env.TOMTOM_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    YOUSIGN_API_KEY: process.env.YOUSIGN_API_KEY,

    // AWS (si pas d'IAM role)
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY
  };
}

/**
 * Récupère un secret spécifique
 * @param {string} key - Nom du secret
 * @returns {Promise<string|null>} Valeur du secret
 */
async function getSecret(key) {
  const secrets = await getSecrets();
  return secrets[key] || null;
}

/**
 * Valide que les secrets requis sont présents
 * @param {string[]} requiredSecrets - Liste des secrets requis
 * @throws {Error} Si un secret requis est manquant
 */
async function validateRequiredSecrets(requiredSecrets) {
  const secrets = await getSecrets();
  const missing = [];

  for (const key of requiredSecrets) {
    if (!secrets[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required secrets: ${missing.join(', ')}`);
  }

  console.log(`[SecretsManager] All ${requiredSecrets.length} required secrets validated`);
}

/**
 * Valide la force des secrets JWT
 * @throws {Error} Si les secrets JWT sont trop faibles
 */
async function validateJWTSecrets() {
  const secrets = await getSecrets();

  const jwtSecret = secrets.JWT_SECRET;
  const jwtRefreshSecret = secrets.JWT_REFRESH_SECRET;

  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  if (!jwtRefreshSecret || jwtRefreshSecret.length < 32) {
    throw new Error('JWT_REFRESH_SECRET must be at least 32 characters long');
  }

  // Vérifier que ce ne sont pas des valeurs par défaut
  const defaultSecrets = [
    'your-secret-key-change-in-production',
    'your-refresh-secret-change-in-production',
    'dev-secret-jwt-key-change-in-production',
    'secret',
    'changeme'
  ];

  if (defaultSecrets.some(ds => jwtSecret.toLowerCase().includes(ds.toLowerCase()))) {
    throw new Error('JWT_SECRET contains a default/weak value');
  }

  if (defaultSecrets.some(ds => jwtRefreshSecret.toLowerCase().includes(ds.toLowerCase()))) {
    throw new Error('JWT_REFRESH_SECRET contains a default/weak value');
  }

  console.log('[SecretsManager] JWT secrets validated successfully');
}

/**
 * Efface le cache des secrets
 */
function clearCache() {
  secretsCache = null;
  cacheTimestamp = 0;
  console.log('[SecretsManager] Cache cleared');
}

/**
 * Vérifie l'état de santé du service
 * @returns {Promise<Object>} État de santé
 */
async function healthCheck() {
  try {
    const secrets = await getSecrets();
    const secretCount = Object.keys(secrets).filter(k => secrets[k]).length;

    return {
      status: 'healthy',
      source: process.env.NODE_ENV === 'production' ? 'aws-secrets-manager' : 'environment',
      secretsLoaded: secretCount,
      cacheAge: secretsCache ? Math.round((Date.now() - cacheTimestamp) / 1000) : null,
      cacheTTL: Math.round(CONFIG.cacheTTL / 1000)
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

// Classe SecretsManager pour usage avancé
class SecretsManager {
  constructor(config = {}) {
    this.config = { ...CONFIG, ...config };
    this.cache = null;
    this.cacheTimestamp = 0;
  }

  async getSecret(key) {
    return getSecret(key);
  }

  async getSecrets() {
    return getSecrets();
  }

  async validate(requiredSecrets) {
    return validateRequiredSecrets(requiredSecrets);
  }

  clearCache() {
    clearCache();
  }

  async healthCheck() {
    return healthCheck();
  }
}

module.exports = {
  SecretsManager,
  getSecret,
  getSecrets,
  validateRequiredSecrets,
  validateJWTSecrets,
  clearCache,
  healthCheck
};
