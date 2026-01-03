/**
 * Security Package - Main Entry Point
 * SYMPHONI.A - RT Technologie
 *
 * Ce package regroupe tous les utilitaires de sécurité pour la plateforme.
 *
 * @version 1.0.0
 */

// Secrets Manager
const {
  SecretsManager,
  getSecret,
  getSecrets,
  validateRequiredSecrets,
  validateJWTSecrets,
  clearCache: clearSecretsCache,
  healthCheck: secretsHealthCheck
} = require('./secrets-manager');

// Validation Schemas
const {
  commonSchemas,
  authSchemas,
  carrierSchemas,
  logisticianSchemas,
  orderSchemas,
  chatbotSchemas,
  stripeSchemas,
  paramSchemas,
  Joi
} = require('./validation-schemas');

// Validation Middleware
const {
  validate,
  validateBody,
  validateParams,
  validateQuery,
  escapeRegex,
  sanitizeMongoQuery,
  sanitizeMongoDocument,
  sanitizeXSS,
  sanitizeObject,
  sanitizeInputMiddleware,
  createValidationError,
  containsInjectionPatterns
} = require('./validation-middleware');

// Password Validator
const {
  PasswordValidator,
  validatePassword,
  isPasswordValid,
  getPasswordRequirements
} = require('./password-validator');

// ============================================================================
// EXPORTS GROUPÉS
// ============================================================================

module.exports = {
  // -------------------------------------------------------------------------
  // SECRETS MANAGER
  // -------------------------------------------------------------------------
  SecretsManager,
  getSecret,
  getSecrets,
  validateRequiredSecrets,
  validateJWTSecrets,
  clearSecretsCache,
  secretsHealthCheck,

  // -------------------------------------------------------------------------
  // VALIDATION SCHEMAS
  // -------------------------------------------------------------------------
  schemas: {
    common: commonSchemas,
    auth: authSchemas,
    carrier: carrierSchemas,
    logistician: logisticianSchemas,
    order: orderSchemas,
    chatbot: chatbotSchemas,
    stripe: stripeSchemas,
    params: paramSchemas
  },
  commonSchemas,
  authSchemas,
  carrierSchemas,
  logisticianSchemas,
  orderSchemas,
  chatbotSchemas,
  stripeSchemas,
  paramSchemas,
  Joi,

  // -------------------------------------------------------------------------
  // VALIDATION MIDDLEWARE
  // -------------------------------------------------------------------------
  validate,
  validateBody,
  validateParams,
  validateQuery,
  sanitizeInputMiddleware,

  // -------------------------------------------------------------------------
  // SANITIZATION
  // -------------------------------------------------------------------------
  escapeRegex,
  sanitizeMongoQuery,
  sanitizeMongoDocument,
  sanitizeXSS,
  sanitizeObject,
  createValidationError,
  containsInjectionPatterns,

  // -------------------------------------------------------------------------
  // PASSWORD VALIDATION
  // -------------------------------------------------------------------------
  PasswordValidator,
  validatePassword,
  isPasswordValid,
  getPasswordRequirements
};
