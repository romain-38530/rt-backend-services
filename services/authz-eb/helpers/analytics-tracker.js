/**
 * Analytics Tracker Helper
 * Helper pour tracker les evenements du funnel Affret.IA
 */

const axios = require('axios');

const AFFRET_IA_API_URL = process.env.AFFRET_IA_API_URL || 'http://localhost:3017';

/**
 * Tracker une etape du funnel
 */
async function trackStep(data) {
  try {
    const tracking = {
      carrierId: data.carrierId,
      carrierEmail: data.carrierEmail,
      companyName: data.companyName,
      step: data.step,
      metadata: data.metadata || {},
      source: data.source || 'api',
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      sessionId: data.sessionId,
      blocker: data.blocker || { blocked: false },
      campaign: data.campaign,
      referrer: data.referrer,
      utm: data.utm,
      timeSpent: data.timeSpent
    };

    // Envoyer a la collection MongoDB directement
    // (Necessite que le module soit connecte a la meme DB)
    if (global.db) {
      await global.db.collection('affretia_trial_tracking').insertOne({
        ...tracking,
        createdAt: new Date()
      });
      console.log(`[ANALYTICS] Tracked step: ${data.step} for carrier ${data.carrierId}`);
    } else {
      console.warn('[ANALYTICS] Database not available, skipping tracking');
    }

  } catch (error) {
    console.error('[ANALYTICS] Error tracking step:', error.message);
    // Ne pas faire echouer la requete principale si le tracking echoue
  }
}

/**
 * Tracker le debut du trial
 */
async function trackTrialStart(carrier, req = {}) {
  return trackStep({
    carrierId: carrier._id || carrier.carrierId,
    carrierEmail: carrier.email,
    companyName: carrier.company,
    step: 'trial_start',
    source: 'web',
    ipAddress: req.ip,
    userAgent: req.headers?.['user-agent'],
    metadata: {
      registrationSource: carrier.source || 'direct',
      country: carrier.address?.country,
      city: carrier.address?.city
    }
  });
}

/**
 * Tracker l'upload d'un document
 */
async function trackDocumentUpload(carrier, document, req = {}) {
  const isComplete = checkDocumentsComplete(carrier.documents || []);

  return trackStep({
    carrierId: carrier._id || carrier.carrierId,
    carrierEmail: carrier.email,
    companyName: carrier.company,
    step: 'document_upload',
    source: 'web',
    ipAddress: req.ip,
    userAgent: req.headers?.['user-agent'],
    metadata: {
      documentType: document.type,
      documentStatus: document.status || 'pending',
      allDocumentsComplete: isComplete
    },
    blocker: !isComplete ? {
      blocked: true,
      type: 'missing_documents',
      reason: 'Not all required documents uploaded',
      resolved: false
    } : { blocked: false }
  });
}

/**
 * Tracker la completion des informations
 */
async function trackInfoComplete(carrier, req = {}) {
  const requiredFields = ['company', 'email', 'phone', 'siret', 'address'];
  const fieldsCompleted = requiredFields.filter(field => {
    if (field === 'address') {
      return carrier.address?.street && carrier.address?.city && carrier.address?.postalCode;
    }
    return carrier[field];
  });

  const completionRate = Math.round((fieldsCompleted.length / requiredFields.length) * 100);
  const isComplete = completionRate === 100;

  return trackStep({
    carrierId: carrier._id || carrier.carrierId,
    carrierEmail: carrier.email,
    companyName: carrier.company,
    step: 'info_complete',
    source: 'web',
    ipAddress: req.ip,
    userAgent: req.headers?.['user-agent'],
    metadata: {
      fieldsCompleted,
      completionRate
    },
    blocker: !isComplete ? {
      blocked: true,
      type: 'incomplete_profile',
      reason: 'Profile not 100% complete',
      details: { completionRate, missingFields: requiredFields.filter(f => !fieldsCompleted.includes(f)) },
      resolved: false
    } : { blocked: false }
  });
}

/**
 * Tracker la connexion TMS
 */
async function trackTMSConnect(carrier, connection, req = {}) {
  const isSuccess = connection.status === 'active';

  return trackStep({
    carrierId: carrier._id || carrier.carrierId,
    carrierEmail: carrier.email,
    companyName: carrier.company,
    step: 'tms_connect',
    source: 'api',
    ipAddress: req.ip,
    userAgent: req.headers?.['user-agent'],
    metadata: {
      tmsProvider: connection.provider,
      tmsConnectionId: connection._id,
      connectionStatus: connection.status
    },
    blocker: !isSuccess ? {
      blocked: true,
      type: 'tms_connection_failed',
      reason: `TMS connection failed: ${connection.status}`,
      details: connection.lastError,
      resolved: false
    } : { blocked: false }
  });
}

/**
 * Tracker le premier affret
 */
async function trackFirstAffret(carrier, affret, req = {}) {
  return trackStep({
    carrierId: carrier._id || carrier.carrierId,
    carrierEmail: carrier.email,
    companyName: carrier.company,
    step: 'first_affret',
    source: 'api',
    ipAddress: req.ip,
    userAgent: req.headers?.['user-agent'],
    metadata: {
      affretId: affret._id || affret.id,
      affretValue: affret.amount || affret.value
    }
  });
}

/**
 * Tracker la conversion
 */
async function trackConversion(carrier, subscription, req = {}) {
  return trackStep({
    carrierId: carrier._id || carrier.carrierId,
    carrierEmail: carrier.email,
    companyName: carrier.company,
    step: 'conversion',
    source: 'api',
    ipAddress: req.ip,
    userAgent: req.headers?.['user-agent'],
    metadata: {
      subscriptionPlan: subscription.plan,
      subscriptionAmount: subscription.amount
    }
  });
}

/**
 * Verifier si tous les documents requis sont uploades
 */
function checkDocumentsComplete(documents) {
  const requiredTypes = ['kbis', 'insurance', 'license'];
  const uploadedTypes = documents
    .filter(doc => doc.status === 'validated' || doc.status === 'pending')
    .map(doc => doc.type);

  return requiredTypes.every(type => uploadedTypes.includes(type));
}

/**
 * Resoudre un blocker
 */
async function resolveBlocker(carrierId, step) {
  try {
    if (global.db) {
      await global.db.collection('affretia_trial_tracking').updateMany(
        {
          carrierId,
          step,
          'blocker.blocked': true,
          'blocker.resolved': false
        },
        {
          $set: {
            'blocker.resolved': true,
            'blocker.resolvedAt': new Date()
          }
        }
      );
      console.log(`[ANALYTICS] Resolved blockers for carrier ${carrierId} at step ${step}`);
    }
  } catch (error) {
    console.error('[ANALYTICS] Error resolving blocker:', error.message);
  }
}

module.exports = {
  trackStep,
  trackTrialStart,
  trackDocumentUpload,
  trackInfoComplete,
  trackTMSConnect,
  trackFirstAffret,
  trackConversion,
  resolveBlocker
};
