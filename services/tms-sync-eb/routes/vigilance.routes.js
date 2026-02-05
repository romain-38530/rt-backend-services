/**
 * Routes API Vigilance
 * Gestion des scores de vigilance pour les transporteurs
 *
 * ARCHITECTURE DATA LAKE:
 * - Lecture des carriers depuis MongoDB Data Lake (dashdoc_companies)
 * - Enrichissement avec données Dashdoc (activité, transports, etc.)
 * - Calcul du score de vigilance basé sur critères légaux + performance
 */

const express = require('express');
const router = express.Router();
const VigilanceService = require('../services/vigilance.service');

// Instances (seront initialisées dans index.js)
let db = null;
let vigilanceService = null;
let datalakeReaders = null;

/**
 * Initialiser le service avec la base de données et Data Lake readers
 */
function setDatabase(database, readers = null) {
  db = database;
  datalakeReaders = readers;
  // Initialiser VigilanceService avec les Data Lake readers
  vigilanceService = new VigilanceService(db, readers);
  console.log('[VIGILANCE] Service initialized with Data Lake support');
}

// ==================== CALCUL VIGILANCE CARRIER ====================

/**
 * GET /api/v1/vigilance/carriers/:carrierId
 * Obtenir le score de vigilance d'un transporteur
 *
 * Params:
 * - carrierId: ID du carrier (ObjectId MongoDB ou dashdoc-{pk})
 * - source: 'local' ou 'datalake' (optionnel, défaut: auto)
 */
router.get('/carriers/:carrierId', async (req, res) => {
  try {
    const { carrierId } = req.params;
    const { source = 'auto' } = req.query;

    if (!vigilanceService) {
      return res.status(503).json({
        success: false,
        error: 'Vigilance service not initialized'
      });
    }

    let vigilance;

    // Si c'est un ID Dashdoc (dashdoc-xxx), chercher dans le Data Lake
    if (carrierId.startsWith('dashdoc-') && datalakeReaders?.carriers) {
      const dashdocPk = parseInt(carrierId.replace('dashdoc-', ''));
      const carrier = await datalakeReaders.carriers.getByPk(dashdocPk);

      if (!carrier) {
        return res.status(404).json({
          success: false,
          error: 'Carrier not found in Data Lake'
        });
      }

      // Calculer vigilance avec données Dashdoc enrichies
      vigilance = await calculateDatalakeVigilance(carrier);
    } else {
      // Utiliser le service vigilance standard pour les carriers locaux
      vigilance = await vigilanceService.calculateVigilanceScore(carrierId);
    }

    res.json({
      success: true,
      data: vigilance
    });

  } catch (error) {
    console.error('[VIGILANCE] Error getting carrier vigilance:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v1/vigilance/carriers/:carrierId/update
 * Mettre à jour le score de vigilance d'un transporteur
 */
router.post('/carriers/:carrierId/update', async (req, res) => {
  try {
    const { carrierId } = req.params;

    if (!vigilanceService) {
      return res.status(503).json({
        success: false,
        error: 'Vigilance service not initialized'
      });
    }

    const result = await vigilanceService.updateCarrierVigilance(carrierId);

    res.json({
      success: result.success,
      data: result.vigilance,
      error: result.error
    });

  } catch (error) {
    console.error('[VIGILANCE] Error updating carrier vigilance:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== VIGILANCE DATA LAKE ====================

/**
 * GET /api/v1/vigilance/datalake/carriers
 * Obtenir tous les carriers du Data Lake avec leur score de vigilance
 *
 * Query params:
 * - connectionId: ID de connexion TMS pour multi-tenant (optionnel)
 * - minScore: Score minimum (optionnel)
 * - level: Filtrer par niveau (N1_premium, N1_referenced, active, etc.)
 * - limit: Nombre max de résultats (défaut: 100)
 */
router.get('/datalake/carriers', async (req, res) => {
  try {
    if (!datalakeReaders?.carriers) {
      return res.status(503).json({
        success: false,
        error: 'Data Lake not configured'
      });
    }

    const {
      connectionId = null,
      minScore,
      level,
      limit = 100
    } = req.query;

    // Récupérer carriers avec stats depuis Data Lake
    const carriers = await datalakeReaders.carriers.getCarriersWithStats(
      connectionId,
      { limit: parseInt(limit) }
    );

    // Calculer vigilance pour chaque carrier
    const carriersWithVigilance = await Promise.all(
      carriers.map(async (carrier) => {
        const vigilance = await calculateDatalakeVigilance(carrier);
        return {
          ...carrier,
          vigilance
        };
      })
    );

    // Filtrer si nécessaire
    let filtered = carriersWithVigilance;

    if (minScore) {
      filtered = filtered.filter(c => c.vigilance.score >= parseInt(minScore));
    }

    if (level) {
      filtered = filtered.filter(c => c.vigilance.levelCode === level);
    }

    // Trier par score descendant
    filtered.sort((a, b) => b.vigilance.score - a.vigilance.score);

    res.json({
      success: true,
      data: filtered,
      count: filtered.length,
      source: 'datalake'
    });

  } catch (error) {
    console.error('[VIGILANCE] Error getting datalake carriers:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/vigilance/datalake/stats
 * Statistiques globales de vigilance depuis le Data Lake
 */
router.get('/datalake/stats', async (req, res) => {
  try {
    if (!datalakeReaders?.carriers) {
      return res.status(503).json({
        success: false,
        error: 'Data Lake not configured'
      });
    }

    const { connectionId = null } = req.query;

    // Récupérer stats globales
    const globalStats = await datalakeReaders.carriers.getGlobalStats(connectionId);

    // Récupérer carriers avec stats pour calcul vigilance
    const carriers = await datalakeReaders.carriers.getCarriersWithStats(connectionId, { limit: 500 });

    // Calculer distribution des scores
    const stats = {
      total: globalStats.totalCarriers,
      verified: globalStats.verifiedCarriers,
      withSiret: globalStats.withSiret,
      withEmail: globalStats.withEmail,
      byLevel: {
        N1_premium: 0,
        N1_referenced: 0,
        active: 0,
        N2_guest: 0,
        observation: 0
      },
      byScoreRange: {
        excellent: 0,  // 90-100
        good: 0,       // 75-89
        medium: 0,     // 50-74
        low: 0,        // 25-49
        poor: 0        // 0-24
      },
      averageScore: 0
    };

    let totalScore = 0;

    for (const carrier of carriers) {
      const vigilance = await calculateDatalakeVigilance(carrier);
      const score = vigilance.score;
      totalScore += score;

      // Par niveau
      if (stats.byLevel[vigilance.levelCode] !== undefined) {
        stats.byLevel[vigilance.levelCode]++;
      }

      // Par plage de score
      if (score >= 90) stats.byScoreRange.excellent++;
      else if (score >= 75) stats.byScoreRange.good++;
      else if (score >= 50) stats.byScoreRange.medium++;
      else if (score >= 25) stats.byScoreRange.low++;
      else stats.byScoreRange.poor++;
    }

    stats.averageScore = carriers.length > 0
      ? Math.round(totalScore / carriers.length)
      : 0;

    res.json({
      success: true,
      data: stats,
      source: 'datalake'
    });

  } catch (error) {
    console.error('[VIGILANCE] Error getting datalake stats:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== BATCH OPERATIONS ====================

/**
 * POST /api/v1/vigilance/update-all
 * Mettre à jour la vigilance de tous les carriers locaux
 */
router.post('/update-all', async (req, res) => {
  try {
    if (!vigilanceService) {
      return res.status(503).json({
        success: false,
        error: 'Vigilance service not initialized'
      });
    }

    const result = await vigilanceService.updateAllVigilanceScores();

    res.json({
      success: result.success,
      data: {
        updated: result.updated,
        failed: result.failed,
        total: result.total
      },
      errors: result.errors
    });

  } catch (error) {
    console.error('[VIGILANCE] Error updating all vigilance:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/vigilance/stats
 * Statistiques globales de vigilance (carriers locaux)
 */
router.get('/stats', async (req, res) => {
  try {
    if (!vigilanceService) {
      return res.status(503).json({
        success: false,
        error: 'Vigilance service not initialized'
      });
    }

    const stats = await vigilanceService.getVigilanceStats();

    res.json({
      success: true,
      data: stats,
      source: 'local'
    });

  } catch (error) {
    console.error('[VIGILANCE] Error getting stats:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== HELPERS ====================

/**
 * Calculer le score de vigilance pour un carrier du Data Lake Dashdoc
 * @param {Object} carrier - Carrier depuis le Data Lake avec stats
 * @returns {Object} Score de vigilance avec détails
 */
async function calculateDatalakeVigilance(carrier) {
  let score = 100;
  const checks = [];

  // ========== 1. DOCUMENTS LÉGAUX (30 points max) ==========

  // SIRET (10 points)
  if (!carrier.siret || (carrier.siret && carrier.siret.length !== 14)) {
    score -= 10;
    checks.push({
      type: 'siret',
      status: carrier.siret ? 'invalid' : 'missing',
      impact: -10,
      message: carrier.siret ? 'SIRET invalide' : 'SIRET manquant'
    });
  } else {
    checks.push({
      type: 'siret',
      status: 'valid',
      impact: 0,
      value: carrier.siret,
      message: 'SIRET valide'
    });
  }

  // TVA (10 points)
  if (!carrier.vatNumber) {
    score -= 10;
    checks.push({
      type: 'vat',
      status: 'missing',
      impact: -10,
      message: 'Numéro de TVA manquant'
    });
  } else {
    checks.push({
      type: 'vat',
      status: 'valid',
      impact: 0,
      value: carrier.vatNumber,
      message: 'TVA valide'
    });
  }

  // Vérification (10 points)
  if (!carrier.isVerified) {
    score -= 10;
    checks.push({
      type: 'verified',
      status: 'not_verified',
      impact: -10,
      message: 'Transporteur non vérifié dans Dashdoc'
    });
  } else {
    checks.push({
      type: 'verified',
      status: 'verified',
      impact: 0,
      message: 'Transporteur vérifié dans Dashdoc'
    });
  }

  // ========== 2. ACTIVITÉ / PERFORMANCE (40 points max) ==========

  const stats = carrier.stats || {};
  const totalOrders = stats.totalOrders || 0;
  const completedOrders = stats.completedOrders || 0;
  const completionRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;

  // Taux de complétion (20 points)
  if (completionRate < 50) {
    score -= 20;
    checks.push({
      type: 'completionRate',
      status: 'very_low',
      value: Math.round(completionRate),
      impact: -20,
      message: `Taux de complétion très faible (${Math.round(completionRate)}%)`
    });
  } else if (completionRate < 70) {
    score -= 15;
    checks.push({
      type: 'completionRate',
      status: 'low',
      value: Math.round(completionRate),
      impact: -15,
      message: `Taux de complétion faible (${Math.round(completionRate)}%)`
    });
  } else if (completionRate < 85) {
    score -= 8;
    checks.push({
      type: 'completionRate',
      status: 'medium',
      value: Math.round(completionRate),
      impact: -8,
      message: `Taux de complétion moyen (${Math.round(completionRate)}%)`
    });
  } else {
    checks.push({
      type: 'completionRate',
      status: 'good',
      value: Math.round(completionRate),
      impact: 0,
      message: `Bon taux de complétion (${Math.round(completionRate)}%)`
    });
  }

  // Volume de commandes (20 points)
  if (totalOrders === 0) {
    score -= 20;
    checks.push({
      type: 'orderVolume',
      status: 'none',
      value: 0,
      impact: -20,
      message: 'Aucune commande enregistrée'
    });
  } else if (totalOrders < 5) {
    score -= 15;
    checks.push({
      type: 'orderVolume',
      status: 'very_low',
      value: totalOrders,
      impact: -15,
      message: `Volume très faible (${totalOrders} commandes)`
    });
  } else if (totalOrders < 20) {
    score -= 8;
    checks.push({
      type: 'orderVolume',
      status: 'low',
      value: totalOrders,
      impact: -8,
      message: `Volume faible (${totalOrders} commandes)`
    });
  } else {
    checks.push({
      type: 'orderVolume',
      status: 'good',
      value: totalOrders,
      impact: 0,
      message: `Bon volume (${totalOrders} commandes)`
    });
  }

  // ========== 3. ACTIVITÉ RÉCENTE (20 points max) ==========

  const lastOrderAt = stats.lastOrderAt ? new Date(stats.lastOrderAt) : null;

  if (lastOrderAt) {
    const daysSinceLastOrder = Math.floor((Date.now() - lastOrderAt.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceLastOrder > 180) {
      score -= 20;
      checks.push({
        type: 'activity',
        status: 'very_inactive',
        days: daysSinceLastOrder,
        impact: -20,
        message: `Inactif depuis ${daysSinceLastOrder} jours (>6 mois)`
      });
    } else if (daysSinceLastOrder > 90) {
      score -= 12;
      checks.push({
        type: 'activity',
        status: 'inactive',
        days: daysSinceLastOrder,
        impact: -12,
        message: `Inactif depuis ${daysSinceLastOrder} jours (>3 mois)`
      });
    } else if (daysSinceLastOrder > 30) {
      score -= 5;
      checks.push({
        type: 'activity',
        status: 'low',
        days: daysSinceLastOrder,
        impact: -5,
        message: `Activité faible (${daysSinceLastOrder} jours)`
      });
    } else {
      checks.push({
        type: 'activity',
        status: 'active',
        days: daysSinceLastOrder,
        impact: 0,
        message: `Actif (${daysSinceLastOrder} jours)`
      });
    }
  } else {
    score -= 20;
    checks.push({
      type: 'activity',
      status: 'none',
      impact: -20,
      message: 'Aucune activité enregistrée'
    });
  }

  // ========== 4. CONTACT (10 points max) ==========

  if (!carrier.email && !carrier.phone_number) {
    score -= 10;
    checks.push({
      type: 'contact',
      status: 'missing',
      impact: -10,
      message: 'Aucun contact (email/téléphone)'
    });
  } else if (!carrier.email || !carrier.phone_number) {
    score -= 5;
    checks.push({
      type: 'contact',
      status: 'partial',
      impact: -5,
      message: 'Contact partiel (email ou téléphone manquant)'
    });
  } else {
    checks.push({
      type: 'contact',
      status: 'complete',
      impact: 0,
      message: 'Contact complet'
    });
  }

  // ========== DÉTERMINER LE NIVEAU ==========

  score = Math.max(0, Math.min(100, score));

  let level = 'N2-Invité';
  let levelCode = 'N2_guest';

  if (score >= 95) {
    level = 'N1-Premium';
    levelCode = 'N1_premium';
  } else if (score >= 85) {
    level = 'N1-Référence';
    levelCode = 'N1_referenced';
  } else if (score >= 70) {
    level = 'Actif';
    levelCode = 'active';
  } else if (score >= 50) {
    level = 'N2-Invité';
    levelCode = 'N2_guest';
  } else {
    level = 'En Observation';
    levelCode = 'observation';
  }

  return {
    score: Math.round(score),
    level,
    levelCode,
    checks,
    summary: {
      legal: checks.filter(c => ['siret', 'vat', 'verified'].includes(c.type)),
      performance: checks.filter(c => ['completionRate', 'orderVolume'].includes(c.type)),
      activity: checks.filter(c => c.type === 'activity'),
      contact: checks.filter(c => c.type === 'contact')
    },
    calculatedAt: new Date(),
    carrierId: `dashdoc-${carrier.dashdocPk}`,
    carrierName: carrier.name || carrier.legalName,
    source: 'datalake'
  };
}

module.exports = router;
module.exports.setDatabase = setDatabase;
