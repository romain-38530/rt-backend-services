/**
 * GDPR Service - Gestion des droits RGPD
 * SYMPHONI.A - RT Technologie
 *
 * Implémente:
 * - Droit à l'effacement (Article 17)
 * - Droit à la portabilité (Article 20)
 * - Politique de rétention
 *
 * @version 1.0.0
 */

const { ObjectId } = require('mongodb');
const crypto = require('crypto');

// ============================================
// CONFIGURATION RGPD
// ============================================

const GDPR_CONFIG = {
  // Délai de rétractation avant suppression effective
  deletionGracePeriodDays: 7,

  // Durée de validité du lien d'export
  exportLinkValidityHours: 24,

  // Limite d'exports par utilisateur
  maxExportsPerWeek: 1,

  // Email du DPO
  dpoEmail: process.env.DPO_EMAIL || 'dpo@symphonia-controltower.com',

  // Données à conserver pour obligations légales (anonymisées)
  legalRetentionYears: {
    invoices: 10,      // Obligations fiscales
    ecmr: 10,          // Documents de transport
    auditLogs: 5       // Journaux d'audit
  }
};

// Collections contenant des données personnelles
const PII_COLLECTIONS = {
  users: {
    piiFields: ['email', 'phone', 'firstName', 'lastName', 'address', 'passwordHash', 'twoFactorSecret'],
    anonymize: {
      email: (id) => `deleted_${id}@anonymized.local`,
      phone: null,
      firstName: 'Utilisateur',
      lastName: 'Supprimé',
      address: null,
      passwordHash: null,
      twoFactorSecret: null
    }
  },
  carriers: {
    piiFields: ['contact.email', 'contact.phone', 'contact.name', 'bankDetails'],
    anonymize: {
      'contact.email': (id) => `deleted_carrier_${id}@anonymized.local`,
      'contact.phone': null,
      'contact.name': 'Transporteur Supprimé',
      bankDetails: null
    }
  },
  logisticians: {
    piiFields: ['email', 'phone', 'contacts', 'bankDetails'],
    anonymize: {
      email: (id) => `deleted_logistician_${id}@anonymized.local`,
      phone: null,
      contacts: [],
      bankDetails: null
    }
  },
  transport_orders: {
    piiFields: ['driverPhone', 'driverEmail', 'driverName', 'consignee.contact', 'sender.contact'],
    anonymize: {
      driverPhone: null,
      driverEmail: null,
      driverName: 'Chauffeur Anonyme',
      'consignee.contact': 'Contact Anonymisé',
      'sender.contact': 'Contact Anonymisé'
    }
  },
  ecmr: {
    piiFields: ['sender.email', 'sender.contact', 'consignee.email', 'consignee.contact', 'signatures'],
    anonymize: {
      'sender.email': null,
      'sender.contact': 'Contact Anonymisé',
      'consignee.email': null,
      'consignee.contact': 'Contact Anonymisé'
      // signatures conservées pour validité légale mais emails masqués
    }
  },
  chatbot_conversations: {
    piiFields: ['userEmail', 'messages'],
    action: 'delete' // Suppression complète après 1 an
  },
  tracking_positions: {
    piiFields: ['driverEmail', 'driverPhone'],
    action: 'delete' // Déjà supprimées après 30 jours
  },
  email_verifications: {
    action: 'delete'
  },
  refresh_tokens: {
    action: 'delete'
  },
  '2fa_sessions': {
    action: 'delete'
  }
};

// ============================================
// SERVICE PRINCIPAL
// ============================================

/**
 * Créer le service GDPR
 * @param {MongoClient} mongoClient
 * @returns {Object} Service GDPR
 */
function createGDPRService(mongoClient) {
  const getDb = () => mongoClient.db();

  // ============================================
  // DROIT À L'EFFACEMENT (Article 17)
  // ============================================

  /**
   * Créer une demande de suppression
   * @param {string} userId - ID de l'utilisateur
   * @param {Object} options - Options de suppression
   * @returns {Promise<Object>} Demande créée
   */
  async function createDeletionRequest(userId, options = {}) {
    const db = getDb();
    const collection = db.collection('gdpr_deletion_requests');

    // Vérifier qu'il n'y a pas de demande en cours
    const existingRequest = await collection.findOne({
      userId: new ObjectId(userId),
      status: { $in: ['pending', 'scheduled'] }
    });

    if (existingRequest) {
      return {
        success: false,
        error: 'DELETION_REQUEST_EXISTS',
        message: 'Une demande de suppression est déjà en cours',
        existingRequest: {
          id: existingRequest._id.toString(),
          status: existingRequest.status,
          scheduledAt: existingRequest.scheduledAt
        }
      };
    }

    const now = new Date();
    const scheduledDeletionDate = new Date(
      now.getTime() + GDPR_CONFIG.deletionGracePeriodDays * 24 * 60 * 60 * 1000
    );

    const request = {
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      reason: options.reason || 'Non spécifié',
      status: 'scheduled',
      createdAt: now,
      scheduledAt: scheduledDeletionDate,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      confirmedAt: null,
      executedAt: null,
      cancelledAt: null,
      auditLog: [{
        action: 'REQUEST_CREATED',
        timestamp: now,
        details: { reason: options.reason }
      }]
    };

    await collection.insertOne(request);

    return {
      success: true,
      requestId: request._id.toString(),
      scheduledAt: scheduledDeletionDate,
      gracePeriodDays: GDPR_CONFIG.deletionGracePeriodDays,
      message: `Votre demande de suppression sera exécutée le ${scheduledDeletionDate.toLocaleDateString('fr-FR')}. Vous pouvez annuler cette demande avant cette date.`
    };
  }

  /**
   * Annuler une demande de suppression
   */
  async function cancelDeletionRequest(requestId, userId) {
    const db = getDb();
    const collection = db.collection('gdpr_deletion_requests');

    const request = await collection.findOne({
      _id: new ObjectId(requestId),
      userId: new ObjectId(userId),
      status: 'scheduled'
    });

    if (!request) {
      return {
        success: false,
        error: 'REQUEST_NOT_FOUND',
        message: 'Demande de suppression non trouvée ou déjà exécutée'
      };
    }

    await collection.updateOne(
      { _id: new ObjectId(requestId) },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date()
        },
        $push: {
          auditLog: {
            action: 'REQUEST_CANCELLED',
            timestamp: new Date()
          }
        }
      }
    );

    return {
      success: true,
      message: 'Demande de suppression annulée avec succès'
    };
  }

  /**
   * Exécuter la suppression des données
   */
  async function executeDeletion(userId, requestId = null) {
    const db = getDb();
    const userIdObj = new ObjectId(userId);
    const anonymizationId = crypto.randomBytes(8).toString('hex');

    const results = {
      userId,
      executedAt: new Date(),
      collections: {},
      errors: []
    };

    // 1. Récupérer les infos utilisateur avant suppression (pour audit)
    const user = await db.collection('users').findOne({ _id: userIdObj });
    if (!user) {
      return {
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'Utilisateur non trouvé'
      };
    }

    // 2. Traiter chaque collection
    for (const [collectionName, config] of Object.entries(PII_COLLECTIONS)) {
      try {
        const collection = db.collection(collectionName);

        if (config.action === 'delete') {
          // Suppression complète
          const deleteResult = await collection.deleteMany({
            $or: [
              { userId: userIdObj },
              { userId: userId }
            ]
          });
          results.collections[collectionName] = {
            action: 'deleted',
            count: deleteResult.deletedCount
          };
        } else if (config.anonymize) {
          // Anonymisation
          const updateFields = {};
          for (const [field, value] of Object.entries(config.anonymize)) {
            if (typeof value === 'function') {
              updateFields[field] = value(anonymizationId);
            } else {
              updateFields[field] = value;
            }
          }

          // Marquer comme anonymisé
          updateFields['_gdpr'] = {
            anonymized: true,
            anonymizedAt: new Date(),
            originalUserId: userId
          };

          const updateResult = await collection.updateMany(
            {
              $or: [
                { userId: userIdObj },
                { userId: userId },
                { _id: userIdObj }
              ]
            },
            { $set: updateFields }
          );

          results.collections[collectionName] = {
            action: 'anonymized',
            count: updateResult.modifiedCount
          };
        }
      } catch (error) {
        results.errors.push({
          collection: collectionName,
          error: error.message
        });
      }
    }

    // 3. Traitement spécial pour les factures (conservation légale)
    try {
      const invoicesResult = await db.collection('invoices').updateMany(
        { userId: userIdObj },
        {
          $set: {
            customerEmail: `anonymized_${anonymizationId}@deleted.local`,
            customerName: 'Client Supprimé',
            customerPhone: null,
            customerAddress: 'Adresse Supprimée',
            '_gdpr': {
              anonymized: true,
              anonymizedAt: new Date(),
              retainUntil: new Date(Date.now() + GDPR_CONFIG.legalRetentionYears.invoices * 365 * 24 * 60 * 60 * 1000)
            }
          }
        }
      );
      results.collections['invoices'] = {
        action: 'anonymized_retained',
        count: invoicesResult.modifiedCount,
        retainedUntil: new Date(Date.now() + GDPR_CONFIG.legalRetentionYears.invoices * 365 * 24 * 60 * 60 * 1000)
      };
    } catch (error) {
      results.errors.push({ collection: 'invoices', error: error.message });
    }

    // 4. Traitement spécial pour les e-CMR (conservation légale)
    try {
      const ecmrResult = await db.collection('ecmr').updateMany(
        {
          $or: [
            { 'sender.userId': userIdObj },
            { 'consignee.userId': userIdObj },
            { 'carrier.userId': userIdObj }
          ]
        },
        {
          $set: {
            'sender.contact': 'Contact Anonymisé',
            'sender.email': null,
            'consignee.contact': 'Contact Anonymisé',
            'consignee.email': null,
            '_gdpr': {
              anonymized: true,
              anonymizedAt: new Date(),
              retainUntil: new Date(Date.now() + GDPR_CONFIG.legalRetentionYears.ecmr * 365 * 24 * 60 * 60 * 1000)
            }
          }
        }
      );
      results.collections['ecmr'] = {
        action: 'anonymized_retained',
        count: ecmrResult.modifiedCount,
        retainedUntil: new Date(Date.now() + GDPR_CONFIG.legalRetentionYears.ecmr * 365 * 24 * 60 * 60 * 1000)
      };
    } catch (error) {
      results.errors.push({ collection: 'ecmr', error: error.message });
    }

    // 5. Créer l'entrée d'audit
    await db.collection('gdpr_audit_log').insertOne({
      _id: new ObjectId(),
      type: 'DELETION',
      userId: userId,
      userEmail: user.email, // Conservé pour audit
      executedAt: new Date(),
      results: results,
      retainUntil: new Date(Date.now() + GDPR_CONFIG.legalRetentionYears.auditLogs * 365 * 24 * 60 * 60 * 1000)
    });

    // 6. Mettre à jour la demande si elle existe
    if (requestId) {
      await db.collection('gdpr_deletion_requests').updateOne(
        { _id: new ObjectId(requestId) },
        {
          $set: {
            status: 'executed',
            executedAt: new Date(),
            results: results
          },
          $push: {
            auditLog: {
              action: 'DELETION_EXECUTED',
              timestamp: new Date(),
              results: results
            }
          }
        }
      );
    }

    return {
      success: results.errors.length === 0,
      results,
      errors: results.errors
    };
  }

  /**
   * Traiter les demandes de suppression programmées
   * (À appeler via scheduled job)
   */
  async function processScheduledDeletions() {
    const db = getDb();
    const collection = db.collection('gdpr_deletion_requests');

    const pendingRequests = await collection.find({
      status: 'scheduled',
      scheduledAt: { $lte: new Date() }
    }).toArray();

    const results = [];

    for (const request of pendingRequests) {
      try {
        const deletionResult = await executeDeletion(
          request.userId.toString(),
          request._id.toString()
        );
        results.push({
          requestId: request._id.toString(),
          userId: request.userId.toString(),
          success: deletionResult.success,
          errors: deletionResult.errors
        });
      } catch (error) {
        results.push({
          requestId: request._id.toString(),
          userId: request.userId.toString(),
          success: false,
          error: error.message
        });

        // Marquer comme échouée
        await collection.updateOne(
          { _id: request._id },
          {
            $set: { status: 'failed' },
            $push: {
              auditLog: {
                action: 'DELETION_FAILED',
                timestamp: new Date(),
                error: error.message
              }
            }
          }
        );
      }
    }

    return {
      processed: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      details: results
    };
  }

  // ============================================
  // DROIT À LA PORTABILITÉ (Article 20)
  // ============================================

  /**
   * Créer une demande d'export
   */
  async function createExportRequest(userId, options = {}) {
    const db = getDb();
    const collection = db.collection('gdpr_export_requests');

    // Vérifier la limite hebdomadaire
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentExports = await collection.countDocuments({
      userId: new ObjectId(userId),
      status: 'completed',
      completedAt: { $gte: oneWeekAgo }
    });

    if (recentExports >= GDPR_CONFIG.maxExportsPerWeek) {
      return {
        success: false,
        error: 'EXPORT_LIMIT_REACHED',
        message: `Limite de ${GDPR_CONFIG.maxExportsPerWeek} export(s) par semaine atteinte`
      };
    }

    const request = {
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      format: options.format || 'json',
      status: 'pending',
      createdAt: new Date(),
      ipAddress: options.ipAddress,
      completedAt: null,
      downloadUrl: null,
      downloadExpires: null,
      downloadCount: 0
    };

    await collection.insertOne(request);

    // Lancer l'export en arrière-plan
    setImmediate(() => {
      processExport(request._id.toString(), userId).catch(err => {
        console.error('[GDPR] Export error:', err);
      });
    });

    return {
      success: true,
      requestId: request._id.toString(),
      message: 'Export en cours de préparation. Vous recevrez un email lorsque celui-ci sera prêt.'
    };
  }

  /**
   * Traiter un export
   */
  async function processExport(requestId, userId) {
    const db = getDb();
    const userIdObj = new ObjectId(userId);

    try {
      // Collecter toutes les données
      const exportData = {
        exportDate: new Date().toISOString(),
        dataController: {
          name: 'RT Technologie - SYMPHONI.A',
          address: 'France',
          dpo: GDPR_CONFIG.dpoEmail
        },
        userData: {},
        activityData: {},
        trackingData: {}
      };

      // Profil utilisateur
      const user = await db.collection('users').findOne(
        { _id: userIdObj },
        { projection: { passwordHash: 0, twoFactorSecret: 0 } }
      );
      exportData.userData.profile = user;

      // Consentements
      exportData.userData.consents = await db.collection('consents')
        .find({ userId: userIdObj })
        .toArray();

      // Commandes de transport
      exportData.activityData.transportOrders = await db.collection('transport_orders')
        .find({ $or: [{ industrialId: userIdObj }, { carrierId: userIdObj }] })
        .project({ _id: 1, reference: 1, status: 1, createdAt: 1, pickupAddress: 1, deliveryAddress: 1 })
        .toArray();

      // e-CMR
      exportData.activityData.ecmrs = await db.collection('ecmr')
        .find({
          $or: [
            { 'sender.userId': userIdObj },
            { 'consignee.userId': userIdObj },
            { 'carrier.userId': userIdObj }
          ]
        })
        .project({ _id: 1, cmrNumber: 1, status: 1, createdAt: 1 })
        .toArray();

      // Factures
      exportData.activityData.invoices = await db.collection('invoices')
        .find({ userId: userIdObj })
        .project({ _id: 1, invoiceNumber: 1, amount: 1, status: 1, createdAt: 1 })
        .toArray();

      // Conversations chatbot (résumé)
      exportData.activityData.chatbotConversations = await db.collection('chatbot_conversations')
        .find({ userId: userIdObj })
        .project({ _id: 1, createdAt: 1, status: 1, messageCount: { $size: '$messages' } })
        .toArray();

      // Positions de tracking (30 derniers jours)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      exportData.trackingData.positions = await db.collection('tracking_positions')
        .find({
          userId: userIdObj,
          timestamp: { $gte: thirtyDaysAgo }
        })
        .project({ _id: 0, latitude: 1, longitude: 1, timestamp: 1 })
        .toArray();

      // Événements de géofencing
      exportData.trackingData.geofenceEvents = await db.collection('geofence_events')
        .find({ userId: userIdObj })
        .project({ _id: 1, type: 1, zoneName: 1, timestamp: 1 })
        .limit(100)
        .toArray();

      // Générer le fichier JSON
      const exportJson = JSON.stringify(exportData, null, 2);

      // Générer un token de téléchargement sécurisé
      const downloadToken = crypto.randomBytes(32).toString('hex');
      const downloadExpires = new Date(Date.now() + GDPR_CONFIG.exportLinkValidityHours * 60 * 60 * 1000);

      // Stocker le fichier en base (pour simplicité, en prod utiliser S3)
      await db.collection('gdpr_exports').insertOne({
        _id: new ObjectId(),
        requestId: new ObjectId(requestId),
        userId: userIdObj,
        data: exportJson,
        downloadToken: crypto.createHash('sha256').update(downloadToken).digest('hex'),
        createdAt: new Date(),
        expiresAt: downloadExpires
      });

      // Mettre à jour la demande
      const downloadUrl = `/api/gdpr/export/download/${requestId}?token=${downloadToken}`;

      await db.collection('gdpr_export_requests').updateOne(
        { _id: new ObjectId(requestId) },
        {
          $set: {
            status: 'completed',
            completedAt: new Date(),
            downloadUrl: downloadUrl,
            downloadExpires: downloadExpires,
            fileSize: Buffer.byteLength(exportJson, 'utf8')
          }
        }
      );

      return { success: true, downloadUrl };
    } catch (error) {
      console.error('[GDPR] Export processing error:', error);

      await db.collection('gdpr_export_requests').updateOne(
        { _id: new ObjectId(requestId) },
        {
          $set: {
            status: 'failed',
            error: error.message
          }
        }
      );

      throw error;
    }
  }

  /**
   * Télécharger un export
   */
  async function downloadExport(requestId, token, userId) {
    const db = getDb();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const exportDoc = await db.collection('gdpr_exports').findOne({
      requestId: new ObjectId(requestId),
      userId: new ObjectId(userId),
      downloadToken: tokenHash,
      expiresAt: { $gt: new Date() }
    });

    if (!exportDoc) {
      return {
        success: false,
        error: 'EXPORT_NOT_FOUND',
        message: 'Export non trouvé ou lien expiré'
      };
    }

    // Incrémenter le compteur de téléchargements
    await db.collection('gdpr_export_requests').updateOne(
      { _id: new ObjectId(requestId) },
      { $inc: { downloadCount: 1 } }
    );

    return {
      success: true,
      data: exportDoc.data,
      filename: `symphonia_export_${new Date().toISOString().split('T')[0]}.json`
    };
  }

  /**
   * Obtenir le statut d'un export
   */
  async function getExportStatus(requestId, userId) {
    const db = getDb();

    const request = await db.collection('gdpr_export_requests').findOne({
      _id: new ObjectId(requestId),
      userId: new ObjectId(userId)
    });

    if (!request) {
      return {
        success: false,
        error: 'REQUEST_NOT_FOUND'
      };
    }

    return {
      success: true,
      status: request.status,
      createdAt: request.createdAt,
      completedAt: request.completedAt,
      downloadUrl: request.status === 'completed' ? request.downloadUrl : null,
      downloadExpires: request.downloadExpires,
      downloadCount: request.downloadCount
    };
  }

  // ============================================
  // POLITIQUE DE RÉTENTION
  // ============================================

  const RETENTION_POLICY = {
    tracking_positions: { duration: 30, unit: 'days', action: 'delete' },
    sessions: { duration: 24, unit: 'hours', action: 'delete' },
    email_verifications: { duration: 24, unit: 'hours', action: 'delete' },
    revoked_tokens: { duration: 7, unit: 'days', action: 'delete' },
    chatbot_conversations: { duration: 1, unit: 'years', action: 'anonymize' },
    transport_orders: { duration: 5, unit: 'years', action: 'anonymize' },
    invoices: { duration: 10, unit: 'years', action: 'archive' },
    ecmr: { duration: 10, unit: 'years', action: 'archive' },
    audit_logs: { duration: 5, unit: 'years', action: 'archive' },
    webhook_deliveries: { duration: 30, unit: 'days', action: 'delete' },
    gdpr_exports: { duration: 7, unit: 'days', action: 'delete' }
  };

  /**
   * Appliquer la politique de rétention
   * (À appeler quotidiennement via scheduled job)
   */
  async function applyRetentionPolicy() {
    const db = getDb();
    const results = {};

    for (const [collectionName, policy] of Object.entries(RETENTION_POLICY)) {
      try {
        const collection = db.collection(collectionName);

        // Calculer la date limite
        let cutoffDate;
        const now = Date.now();
        switch (policy.unit) {
          case 'hours':
            cutoffDate = new Date(now - policy.duration * 60 * 60 * 1000);
            break;
          case 'days':
            cutoffDate = new Date(now - policy.duration * 24 * 60 * 60 * 1000);
            break;
          case 'years':
            cutoffDate = new Date(now - policy.duration * 365 * 24 * 60 * 60 * 1000);
            break;
          default:
            continue;
        }

        // Champ de date à utiliser
        const dateField = collectionName === 'gdpr_exports' ? 'expiresAt' : 'createdAt';

        if (policy.action === 'delete') {
          const result = await collection.deleteMany({
            [dateField]: { $lt: cutoffDate }
          });
          results[collectionName] = { action: 'deleted', count: result.deletedCount };
        } else if (policy.action === 'anonymize') {
          // Anonymiser les anciennes données
          const result = await collection.updateMany(
            {
              [dateField]: { $lt: cutoffDate },
              '_gdpr.anonymized': { $ne: true }
            },
            {
              $set: {
                '_gdpr': {
                  anonymized: true,
                  anonymizedAt: new Date(),
                  reason: 'retention_policy'
                }
              },
              $unset: {
                userEmail: '',
                userName: '',
                // Autres champs PII selon la collection
              }
            }
          );
          results[collectionName] = { action: 'anonymized', count: result.modifiedCount };
        } else if (policy.action === 'archive') {
          // Marquer comme archivé (pas de modification, juste tracking)
          const result = await collection.updateMany(
            {
              [dateField]: { $lt: cutoffDate },
              '_gdpr.archived': { $ne: true }
            },
            {
              $set: {
                '_gdpr.archived': true,
                '_gdpr.archivedAt': new Date()
              }
            }
          );
          results[collectionName] = { action: 'archived', count: result.modifiedCount };
        }
      } catch (error) {
        results[collectionName] = { error: error.message };
      }
    }

    // Log de l'exécution
    await db.collection('gdpr_audit_log').insertOne({
      _id: new ObjectId(),
      type: 'RETENTION_POLICY',
      executedAt: new Date(),
      results
    });

    return results;
  }

  // ============================================
  // UTILITAIRES
  // ============================================

  /**
   * Obtenir les demandes de suppression d'un utilisateur
   */
  async function getDeletionRequests(userId) {
    const db = getDb();
    return db.collection('gdpr_deletion_requests')
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .toArray();
  }

  /**
   * Obtenir les demandes d'export d'un utilisateur
   */
  async function getExportRequests(userId) {
    const db = getDb();
    return db.collection('gdpr_export_requests')
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
  }

  return {
    // Configuration
    GDPR_CONFIG,
    RETENTION_POLICY,

    // Droit à l'effacement
    createDeletionRequest,
    cancelDeletionRequest,
    executeDeletion,
    processScheduledDeletions,
    getDeletionRequests,

    // Droit à la portabilité
    createExportRequest,
    processExport,
    downloadExport,
    getExportStatus,
    getExportRequests,

    // Rétention
    applyRetentionPolicy
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  GDPR_CONFIG,
  PII_COLLECTIONS,
  createGDPRService
};
