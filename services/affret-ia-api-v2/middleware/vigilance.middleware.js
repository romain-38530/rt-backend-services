/**
 * Middleware de verification Vigilance pour AFFRET.IA
 * Verifie la conformite d'un transporteur avant assignation
 */

const VigilanceCheck = require('../models/VigilanceCheck');

/**
 * Verifie si un transporteur est conforme pour assignation
 * @param {string} carrierId - ID du transporteur
 * @param {string} carrierName - Nom du transporteur (pour messages)
 * @returns {Object} { isCompliant, reason, warnings, details }
 */
async function checkCarrierCompliance(carrierId, carrierName = 'Transporteur') {
  const result = {
    isCompliant: true,
    reason: null,
    warnings: [],
    details: {
      carrierId,
      carrierName,
      checkedAt: new Date()
    }
  };

  try {
    const vigilanceCheck = await VigilanceCheck.findOne({ carrierId });

    if (!vigilanceCheck) {
      // Pas de check existant = ok par defaut mais avec warning
      result.warnings.push({
        type: 'no_vigilance_record',
        message: 'Aucun enregistrement de vigilance trouve pour ce transporteur'
      });
      return result;
    }

    // 1. Verifier blacklist
    if (vigilanceCheck.checks?.blacklist?.listed === true) {
      result.isCompliant = false;
      result.reason = 'CARRIER_BLACKLISTED';
      result.details.blacklist = {
        reason: vigilanceCheck.checks.blacklist.reason,
        severity: vigilanceCheck.checks.blacklist.severity,
        addedAt: vigilanceCheck.checks.blacklist.addedAt
      };
      return result;
    }

    // 2. Verifier documents expires
    const now = new Date();
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const expiredDocs = [];
    const expiringDocs = [];

    const requiredDocs = ['kbis', 'insurance', 'license'];

    requiredDocs.forEach(docType => {
      const doc = vigilanceCheck.checks?.[docType];
      if (doc?.expiryDate) {
        const expiryDate = new Date(doc.expiryDate);
        if (expiryDate < now) {
          expiredDocs.push({
            type: docType,
            expiryDate: doc.expiryDate,
            expiredSince: Math.floor((now - expiryDate) / (1000 * 60 * 60 * 24)) + ' jours'
          });
        } else if (expiryDate < in30Days) {
          expiringDocs.push({
            type: docType,
            expiryDate: doc.expiryDate,
            daysRemaining: Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24))
          });
        }
      }
    });

    // Documents expires = bloquant
    if (expiredDocs.length > 0) {
      result.isCompliant = false;
      result.reason = 'DOCUMENTS_EXPIRED';
      result.details.expiredDocs = expiredDocs;
      return result;
    }

    // Documents expirant bientot = warning
    if (expiringDocs.length > 0) {
      result.warnings.push({
        type: 'documents_expiring',
        message: `${expiringDocs.length} document(s) expire(nt) dans les 30 prochains jours`,
        documents: expiringDocs
      });
    }

    // 3. Verifier score de conformite
    if (vigilanceCheck.complianceScore !== undefined && vigilanceCheck.complianceScore < 50) {
      result.warnings.push({
        type: 'low_compliance_score',
        message: `Score de conformite faible: ${vigilanceCheck.complianceScore}/100`,
        score: vigilanceCheck.complianceScore
      });
    }

    // 4. Verifier statut global
    if (vigilanceCheck.overallStatus === 'non_compliant') {
      result.isCompliant = false;
      result.reason = 'NON_COMPLIANT';
      result.details.overallStatus = vigilanceCheck.overallStatus;
      return result;
    }

    // Ajouter les infos de conformite
    result.details.complianceScore = vigilanceCheck.complianceScore;
    result.details.overallStatus = vigilanceCheck.overallStatus;
    result.details.lastChecked = vigilanceCheck.updatedAt;

  } catch (error) {
    console.error('[VIGILANCE MIDDLEWARE] Error checking compliance:', error);
    result.warnings.push({
      type: 'check_error',
      message: 'Erreur lors de la verification: ' + error.message
    });
  }

  return result;
}

/**
 * Middleware Express pour verifier la vigilance avant assignation
 */
function requireVigilanceCheck(req, res, next) {
  // Ce middleware sera appele avant l'assignation
  // Il extrait carrierId du body ou de la session
  const { carrierId, skipVigilance } = req.body;

  if (skipVigilance === true) {
    // Permet de bypasser pour les admins
    console.warn('[VIGILANCE] Check skipped by request');
    return next();
  }

  if (!carrierId) {
    // Pas de carrierId direct, on laisse passer
    // Le controller gerera la verification avec la session
    return next();
  }

  checkCarrierCompliance(carrierId)
    .then(result => {
      req.vigilanceCheck = result;

      if (!result.isCompliant) {
        return res.status(403).json({
          success: false,
          error: result.reason,
          message: `Verification vigilance echouee: ${result.reason}`,
          details: result.details
        });
      }

      next();
    })
    .catch(error => {
      console.error('[VIGILANCE MIDDLEWARE] Error:', error);
      // En cas d'erreur, on laisse passer avec un warning
      req.vigilanceCheck = {
        isCompliant: true,
        warnings: [{ type: 'check_error', message: error.message }]
      };
      next();
    });
}

/**
 * Verifie la vigilance de plusieurs transporteurs en batch
 */
async function checkMultipleCarriersCompliance(carrierIds) {
  const results = {};

  for (const carrierId of carrierIds) {
    results[carrierId] = await checkCarrierCompliance(carrierId);
  }

  return results;
}

/**
 * Filtre une liste de transporteurs en ne gardant que les conformes
 */
async function filterCompliantCarriers(carriers) {
  const compliantCarriers = [];
  const blockedCarriers = [];

  for (const carrier of carriers) {
    const carrierId = carrier.carrierId || carrier._id;
    const result = await checkCarrierCompliance(carrierId, carrier.carrierName || carrier.name);

    if (result.isCompliant) {
      compliantCarriers.push({
        ...carrier,
        vigilance: {
          compliant: true,
          warnings: result.warnings,
          score: result.details.complianceScore
        }
      });
    } else {
      blockedCarriers.push({
        carrierId,
        carrierName: carrier.carrierName || carrier.name,
        reason: result.reason,
        details: result.details
      });
    }
  }

  return { compliantCarriers, blockedCarriers };
}

module.exports = {
  checkCarrierCompliance,
  requireVigilanceCheck,
  checkMultipleCarriersCompliance,
  filterCompliantCarriers
};
