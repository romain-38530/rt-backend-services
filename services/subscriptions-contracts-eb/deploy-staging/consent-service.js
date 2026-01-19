/**
 * Consent Service - Gestion du Consentement RGPD
 * SYMPHONI.A - RT Technologie
 *
 * Implémente l'Article 7 du RGPD
 * - Collecte du consentement
 * - Historique horodaté
 * - Révocation
 * - Versioning des documents légaux
 *
 * @version 1.0.0
 */

const { ObjectId } = require('mongodb');

// ============================================
// TYPES DE CONSENTEMENT
// ============================================

const ConsentType = {
  // Obligatoires
  TERMS_OF_SERVICE: 'terms_of_service',           // CGU
  PRIVACY_POLICY: 'privacy_policy',               // Politique confidentialité
  DATA_PROCESSING: 'data_processing',             // Traitement données

  // Optionnels
  MARKETING_EMAIL: 'marketing_email',             // Emails marketing
  MARKETING_SMS: 'marketing_sms',                 // SMS marketing
  ANALYTICS: 'analytics',                         // Analytics/Cookies
  THIRD_PARTY_SHARING: 'third_party_sharing',     // Partage tiers
  GPS_TRACKING: 'gps_tracking',                   // Tracking GPS
  NEWSLETTER: 'newsletter',                       // Newsletter
  PROFILING: 'profiling'                          // Profilage
};

// Configuration des consentements
const CONSENT_CONFIG = {
  [ConsentType.TERMS_OF_SERVICE]: {
    required: true,
    label: 'Conditions Générales d\'Utilisation',
    description: 'J\'accepte les conditions générales d\'utilisation de SYMPHONI.A',
    documentUrl: '/legal/cgu',
    currentVersion: '2.0.0'
  },
  [ConsentType.PRIVACY_POLICY]: {
    required: true,
    label: 'Politique de Confidentialité',
    description: 'J\'ai lu et j\'accepte la politique de confidentialité',
    documentUrl: '/legal/privacy-policy',
    currentVersion: '2.0.0'
  },
  [ConsentType.DATA_PROCESSING]: {
    required: true,
    label: 'Traitement des Données',
    description: 'J\'autorise le traitement de mes données personnelles aux fins décrites dans la politique de confidentialité',
    documentUrl: '/legal/data-processing',
    currentVersion: '1.0.0'
  },
  [ConsentType.MARKETING_EMAIL]: {
    required: false,
    label: 'Communications Marketing par Email',
    description: 'J\'accepte de recevoir des communications marketing par email',
    documentUrl: null,
    currentVersion: null
  },
  [ConsentType.MARKETING_SMS]: {
    required: false,
    label: 'Communications Marketing par SMS',
    description: 'J\'accepte de recevoir des communications marketing par SMS',
    documentUrl: null,
    currentVersion: null
  },
  [ConsentType.ANALYTICS]: {
    required: false,
    label: 'Cookies Analytics',
    description: 'J\'accepte l\'utilisation de cookies à des fins d\'analyse',
    documentUrl: '/legal/cookies',
    currentVersion: '1.0.0'
  },
  [ConsentType.THIRD_PARTY_SHARING]: {
    required: false,
    label: 'Partage avec des Tiers',
    description: 'J\'autorise le partage de mes données avec des partenaires tiers',
    documentUrl: '/legal/third-party',
    currentVersion: '1.0.0'
  },
  [ConsentType.GPS_TRACKING]: {
    required: false, // Requis pour utiliser le tracking, mais optionnel globalement
    label: 'Tracking GPS',
    description: 'J\'autorise le suivi de ma position GPS pour les fonctionnalités de tracking',
    documentUrl: '/legal/gps-tracking',
    currentVersion: '1.0.0',
    requiredForFeature: 'tracking'
  },
  [ConsentType.NEWSLETTER]: {
    required: false,
    label: 'Newsletter',
    description: 'J\'accepte de recevoir la newsletter SYMPHONI.A',
    documentUrl: null,
    currentVersion: null
  },
  [ConsentType.PROFILING]: {
    required: false,
    label: 'Profilage',
    description: 'J\'autorise l\'analyse de mon comportement pour personnaliser mon expérience',
    documentUrl: '/legal/profiling',
    currentVersion: '1.0.0'
  }
};

// ============================================
// SERVICE PRINCIPAL
// ============================================

/**
 * Créer le service de consentement
 * @param {MongoClient} mongoClient
 * @returns {Object} Service de consentement
 */
function createConsentService(mongoClient) {
  const getDb = () => mongoClient.db();

  /**
   * Obtenir tous les types de consentement disponibles
   */
  function getConsentTypes() {
    return Object.entries(CONSENT_CONFIG).map(([type, config]) => ({
      type,
      ...config
    }));
  }

  /**
   * Obtenir les consentements requis
   */
  function getRequiredConsents() {
    return Object.entries(CONSENT_CONFIG)
      .filter(([, config]) => config.required)
      .map(([type, config]) => ({ type, ...config }));
  }

  /**
   * Accorder un consentement
   * @param {string} userId - ID de l'utilisateur
   * @param {string} consentType - Type de consentement
   * @param {Object} metadata - Métadonnées (IP, userAgent, etc.)
   * @returns {Promise<Object>}
   */
  async function grantConsent(userId, consentType, metadata = {}) {
    const db = getDb();
    const collection = db.collection('consents');

    // Valider le type de consentement
    if (!CONSENT_CONFIG[consentType]) {
      return {
        success: false,
        error: 'INVALID_CONSENT_TYPE',
        message: `Type de consentement invalide: ${consentType}`
      };
    }

    const config = CONSENT_CONFIG[consentType];
    const now = new Date();

    // Chercher un consentement existant
    const existing = await collection.findOne({
      userId: new ObjectId(userId),
      consentType
    });

    const historyEntry = {
      action: 'granted',
      timestamp: now,
      ipAddress: metadata.ipAddress || null,
      userAgent: metadata.userAgent || null,
      version: config.currentVersion,
      source: metadata.source || 'unknown'
    };

    if (existing) {
      // Mise à jour
      await collection.updateOne(
        { _id: existing._id },
        {
          $set: {
            granted: true,
            version: config.currentVersion,
            grantedAt: now,
            revokedAt: null,
            updatedAt: now
          },
          $push: { history: historyEntry }
        }
      );
    } else {
      // Création
      await collection.insertOne({
        _id: new ObjectId(),
        userId: new ObjectId(userId),
        consentType,
        granted: true,
        version: config.currentVersion,
        grantedAt: now,
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
        history: [historyEntry]
      });
    }

    return {
      success: true,
      consentType,
      granted: true,
      version: config.currentVersion,
      grantedAt: now
    };
  }

  /**
   * Révoquer un consentement
   * @param {string} userId - ID de l'utilisateur
   * @param {string} consentType - Type de consentement
   * @param {Object} metadata - Métadonnées
   * @returns {Promise<Object>}
   */
  async function revokeConsent(userId, consentType, metadata = {}) {
    const db = getDb();
    const collection = db.collection('consents');

    // Vérifier si c'est un consentement obligatoire
    const config = CONSENT_CONFIG[consentType];
    if (!config) {
      return {
        success: false,
        error: 'INVALID_CONSENT_TYPE'
      };
    }

    if (config.required) {
      return {
        success: false,
        error: 'CANNOT_REVOKE_REQUIRED_CONSENT',
        message: 'Ce consentement est obligatoire pour utiliser le service. Vous pouvez demander la suppression de votre compte si vous ne souhaitez plus l\'accepter.'
      };
    }

    const now = new Date();
    const historyEntry = {
      action: 'revoked',
      timestamp: now,
      ipAddress: metadata.ipAddress || null,
      userAgent: metadata.userAgent || null,
      source: metadata.source || 'unknown'
    };

    const result = await collection.updateOne(
      {
        userId: new ObjectId(userId),
        consentType,
        granted: true
      },
      {
        $set: {
          granted: false,
          revokedAt: now,
          updatedAt: now
        },
        $push: { history: historyEntry }
      }
    );

    if (result.matchedCount === 0) {
      return {
        success: false,
        error: 'CONSENT_NOT_FOUND',
        message: 'Consentement non trouvé ou déjà révoqué'
      };
    }

    return {
      success: true,
      consentType,
      granted: false,
      revokedAt: now
    };
  }

  /**
   * Accorder plusieurs consentements en une fois
   * @param {string} userId - ID de l'utilisateur
   * @param {Object} consents - { type: boolean, ... }
   * @param {Object} metadata - Métadonnées
   * @returns {Promise<Object>}
   */
  async function grantBulkConsents(userId, consents, metadata = {}) {
    const results = [];

    for (const [type, granted] of Object.entries(consents)) {
      if (granted) {
        const result = await grantConsent(userId, type, metadata);
        results.push(result);
      }
    }

    // Vérifier que tous les consentements obligatoires sont accordés
    const requiredConsents = getRequiredConsents();
    const missingRequired = requiredConsents.filter(rc =>
      !consents[rc.type]
    );

    if (missingRequired.length > 0) {
      return {
        success: false,
        error: 'MISSING_REQUIRED_CONSENTS',
        message: 'Certains consentements obligatoires sont manquants',
        missing: missingRequired.map(c => c.type)
      };
    }

    return {
      success: true,
      results
    };
  }

  /**
   * Obtenir les consentements d'un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<Array>}
   */
  async function getUserConsents(userId) {
    const db = getDb();
    const collection = db.collection('consents');

    const consents = await collection
      .find({ userId: new ObjectId(userId) })
      .toArray();

    // Enrichir avec la configuration
    return consents.map(consent => ({
      ...consent,
      config: CONSENT_CONFIG[consent.consentType]
    }));
  }

  /**
   * Vérifier si un utilisateur a donné un consentement spécifique
   * @param {string} userId - ID de l'utilisateur
   * @param {string} consentType - Type de consentement
   * @returns {Promise<boolean>}
   */
  async function hasConsent(userId, consentType) {
    const db = getDb();
    const collection = db.collection('consents');

    const consent = await collection.findOne({
      userId: new ObjectId(userId),
      consentType,
      granted: true
    });

    return !!consent;
  }

  /**
   * Vérifier si l'utilisateur a tous les consentements requis
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<Object>}
   */
  async function hasAllRequiredConsents(userId) {
    const requiredTypes = Object.entries(CONSENT_CONFIG)
      .filter(([, config]) => config.required)
      .map(([type]) => type);

    const db = getDb();
    const collection = db.collection('consents');

    const grantedConsents = await collection
      .find({
        userId: new ObjectId(userId),
        consentType: { $in: requiredTypes },
        granted: true
      })
      .toArray();

    const grantedTypes = grantedConsents.map(c => c.consentType);
    const missingTypes = requiredTypes.filter(t => !grantedTypes.includes(t));

    return {
      valid: missingTypes.length === 0,
      missing: missingTypes,
      granted: grantedTypes
    };
  }

  /**
   * Vérifier si une nouvelle version des documents nécessite un nouveau consentement
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<Array>}
   */
  async function checkConsentVersions(userId) {
    const db = getDb();
    const collection = db.collection('consents');

    const userConsents = await collection
      .find({
        userId: new ObjectId(userId),
        granted: true
      })
      .toArray();

    const outdated = [];

    for (const consent of userConsents) {
      const config = CONSENT_CONFIG[consent.consentType];
      if (config && config.currentVersion && consent.version !== config.currentVersion) {
        outdated.push({
          type: consent.consentType,
          currentVersion: consent.version,
          requiredVersion: config.currentVersion,
          label: config.label
        });
      }
    }

    return outdated;
  }

  /**
   * Obtenir l'historique des consentements pour audit
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<Array>}
   */
  async function getConsentHistory(userId) {
    const db = getDb();
    const collection = db.collection('consents');

    const consents = await collection
      .find({ userId: new ObjectId(userId) })
      .toArray();

    // Aplatir l'historique
    const history = [];
    for (const consent of consents) {
      for (const entry of consent.history || []) {
        history.push({
          consentType: consent.consentType,
          label: CONSENT_CONFIG[consent.consentType]?.label,
          ...entry
        });
      }
    }

    // Trier par date décroissante
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return history;
  }

  /**
   * Exporter les preuves de consentement pour un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<Object>}
   */
  async function exportConsentProof(userId) {
    const consents = await getUserConsents(userId);

    return {
      exportDate: new Date().toISOString(),
      userId,
      consents: consents.map(c => ({
        type: c.consentType,
        label: c.config?.label,
        granted: c.granted,
        version: c.version,
        grantedAt: c.grantedAt,
        revokedAt: c.revokedAt,
        history: c.history
      }))
    };
  }

  /**
   * Middleware pour vérifier le consentement avant une action
   * @param {string} requiredConsent - Type de consentement requis
   */
  function requireConsentMiddleware(requiredConsent) {
    return async (req, res, next) => {
      if (!req.user || !req.user.userId) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentification requise' }
        });
      }

      const hasUserConsent = await hasConsent(req.user.userId, requiredConsent);

      if (!hasUserConsent) {
        const config = CONSENT_CONFIG[requiredConsent];
        return res.status(403).json({
          success: false,
          error: {
            code: 'CONSENT_REQUIRED',
            message: `Votre consentement est requis pour cette fonctionnalité`,
            consentType: requiredConsent,
            label: config?.label,
            description: config?.description,
            documentUrl: config?.documentUrl
          }
        });
      }

      next();
    };
  }

  return {
    // Types
    ConsentType,
    CONSENT_CONFIG,

    // Gestion des consentements
    getConsentTypes,
    getRequiredConsents,
    grantConsent,
    revokeConsent,
    grantBulkConsents,

    // Requêtes
    getUserConsents,
    hasConsent,
    hasAllRequiredConsents,
    checkConsentVersions,

    // Audit
    getConsentHistory,
    exportConsentProof,

    // Middleware
    requireConsentMiddleware
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  ConsentType,
  CONSENT_CONFIG,
  createConsentService
};
