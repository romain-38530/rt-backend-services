/**
 * Vigilance Service
 * Service de calcul et de gestion des scores de vigilance pour les transporteurs
 *
 * Critères de calcul du score (100 points maximum):
 * - Documents légaux (30%) : SIRET, TVA, Licence
 * - Performance (40%) : Taux de ponctualité, qualité de service
 * - Activité récente (20%) : Date dernière commande, fréquence
 * - Volume de commandes (10%) : Nombre total de commandes
 */

const { ObjectId } = require('mongodb');

class VigilanceService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Calculer le score de vigilance d'un transporteur
   * @param {string|ObjectId} carrierId - ID du carrier
   * @returns {Object} Score de vigilance avec détails
   */
  async calculateVigilanceScore(carrierId) {
    // Récupérer le carrier
    const carrier = await this.db.collection('carriers').findOne({
      _id: new ObjectId(carrierId)
    });

    if (!carrier) {
      throw new Error('Carrier not found');
    }

    let score = 100;
    const checks = [];

    // ========== 1. DOCUMENTS LÉGAUX (30 points max) ==========

    // SIRET (10 points)
    if (!carrier.siret || carrier.siret.length !== 14) {
      score -= 10;
      checks.push({
        type: 'siret',
        status: 'missing',
        impact: -10,
        message: 'SIRET manquant ou invalide'
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

    // Licence de transport (10 points)
    if (!carrier.licenseNumber) {
      score -= 10;
      checks.push({
        type: 'license',
        status: 'missing',
        impact: -10,
        message: 'Licence de transport manquante'
      });
    } else {
      checks.push({
        type: 'license',
        status: 'valid',
        impact: 0,
        value: carrier.licenseNumber,
        message: 'Licence valide'
      });
    }

    // ========== 2. PERFORMANCE (40 points max) ==========

    // Taux de ponctualité / Score de qualité
    const onTimeRate = carrier.score || carrier.onTimeRate || 0;

    if (onTimeRate < 50) {
      score -= 40;
      checks.push({
        type: 'onTimeRate',
        status: 'very_low',
        value: onTimeRate,
        impact: -40,
        message: `Taux de qualité très faible (${onTimeRate}%)`
      });
    } else if (onTimeRate < 70) {
      score -= 30;
      checks.push({
        type: 'onTimeRate',
        status: 'low',
        value: onTimeRate,
        impact: -30,
        message: `Taux de qualité faible (${onTimeRate}%)`
      });
    } else if (onTimeRate < 85) {
      score -= 15;
      checks.push({
        type: 'onTimeRate',
        status: 'medium',
        value: onTimeRate,
        impact: -15,
        message: `Taux de qualité moyen (${onTimeRate}%)`
      });
    } else if (onTimeRate < 95) {
      score -= 5;
      checks.push({
        type: 'onTimeRate',
        status: 'good',
        value: onTimeRate,
        impact: -5,
        message: `Bon taux de qualité (${onTimeRate}%)`
      });
    } else {
      checks.push({
        type: 'onTimeRate',
        status: 'excellent',
        value: onTimeRate,
        impact: 0,
        message: `Excellent taux de qualité (${onTimeRate}%)`
      });
    }

    // ========== 3. ACTIVITÉ RÉCENTE (20 points max) ==========

    const lastOrderDate = carrier.lastOrderAt ? new Date(carrier.lastOrderAt) : null;

    if (lastOrderDate) {
      const daysSinceLastOrder = Math.floor((Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceLastOrder > 180) {
        // > 6 mois
        score -= 20;
        checks.push({
          type: 'activity',
          status: 'very_inactive',
          days: daysSinceLastOrder,
          impact: -20,
          message: `Aucune activité depuis ${daysSinceLastOrder} jours`
        });
      } else if (daysSinceLastOrder > 90) {
        // > 3 mois
        score -= 15;
        checks.push({
          type: 'activity',
          status: 'inactive',
          days: daysSinceLastOrder,
          impact: -15,
          message: `Inactif depuis ${daysSinceLastOrder} jours`
        });
      } else if (daysSinceLastOrder > 30) {
        // > 1 mois
        score -= 8;
        checks.push({
          type: 'activity',
          status: 'low',
          days: daysSinceLastOrder,
          impact: -8,
          message: `Faible activité (${daysSinceLastOrder} jours)`
        });
      } else if (daysSinceLastOrder > 7) {
        // > 1 semaine
        score -= 3;
        checks.push({
          type: 'activity',
          status: 'moderate',
          days: daysSinceLastOrder,
          impact: -3,
          message: `Activité modérée (${daysSinceLastOrder} jours)`
        });
      } else {
        checks.push({
          type: 'activity',
          status: 'active',
          days: daysSinceLastOrder,
          impact: 0,
          message: `Actif récemment (${daysSinceLastOrder} jours)`
        });
      }
    } else {
      score -= 20;
      checks.push({
        type: 'activity',
        status: 'none',
        impact: -20,
        message: 'Aucune commande enregistrée'
      });
    }

    // ========== 4. VOLUME DE COMMANDES (10 points max) ==========

    const totalOrders = carrier.totalOrders || 0;

    if (totalOrders === 0) {
      score -= 10;
      checks.push({
        type: 'volume',
        status: 'none',
        value: 0,
        impact: -10,
        message: 'Aucune commande enregistrée'
      });
    } else if (totalOrders < 5) {
      score -= 8;
      checks.push({
        type: 'volume',
        status: 'very_low',
        value: totalOrders,
        impact: -8,
        message: `Volume très faible (${totalOrders} commandes)`
      });
    } else if (totalOrders < 20) {
      score -= 5;
      checks.push({
        type: 'volume',
        status: 'low',
        value: totalOrders,
        impact: -5,
        message: `Volume faible (${totalOrders} commandes)`
      });
    } else if (totalOrders < 50) {
      score -= 2;
      checks.push({
        type: 'volume',
        status: 'moderate',
        value: totalOrders,
        impact: -2,
        message: `Volume modéré (${totalOrders} commandes)`
      });
    } else {
      checks.push({
        type: 'volume',
        status: 'good',
        value: totalOrders,
        impact: 0,
        message: `Bon volume (${totalOrders} commandes)`
      });
    }

    // ========== DÉTERMINER LE NIVEAU ==========

    score = Math.max(0, Math.min(100, score)); // Entre 0 et 100

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

    // ========== RETOURNER LE RÉSULTAT ==========

    return {
      score: Math.round(score),
      level,
      levelCode,
      checks,
      summary: {
        legal: checks.filter(c => ['siret', 'vat', 'license'].includes(c.type)),
        performance: checks.filter(c => c.type === 'onTimeRate'),
        activity: checks.filter(c => c.type === 'activity'),
        volume: checks.filter(c => c.type === 'volume')
      },
      calculatedAt: new Date(),
      carrierId: carrier._id.toString(),
      carrierName: carrier.companyName || carrier.legalName
    };
  }

  /**
   * Mettre à jour la vigilance d'un carrier spécifique
   * @param {string|ObjectId} carrierId - ID du carrier
   * @returns {Object} Résultat de la mise à jour
   */
  async updateCarrierVigilance(carrierId) {
    try {
      const vigilance = await this.calculateVigilanceScore(carrierId);

      await this.db.collection('carriers').updateOne(
        { _id: new ObjectId(carrierId) },
        {
          $set: {
            vigilance,
            vigilanceScore: vigilance.score,
            vigilanceLevel: vigilance.levelCode,
            vigilanceUpdatedAt: new Date()
          }
        }
      );

      return { success: true, vigilance };
    } catch (error) {
      console.error(`Error updating vigilance for carrier ${carrierId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Mettre à jour la vigilance de tous les carriers
   * @returns {Object} Statistiques de la mise à jour
   */
  async updateAllVigilanceScores() {
    const carriers = await this.db.collection('carriers').find({}).toArray();

    let updated = 0;
    let failed = 0;
    const errors = [];

    console.log(`[VIGILANCE] Starting update for ${carriers.length} carriers...`);

    for (const carrier of carriers) {
      try {
        const vigilance = await this.calculateVigilanceScore(carrier._id);

        await this.db.collection('carriers').updateOne(
          { _id: carrier._id },
          {
            $set: {
              vigilance,
              vigilanceScore: vigilance.score,
              vigilanceLevel: vigilance.levelCode,
              vigilanceUpdatedAt: new Date()
            }
          }
        );

        updated++;
        console.log(`[VIGILANCE] ✓ ${carrier.companyName}: ${vigilance.score}% (${vigilance.level})`);
      } catch (error) {
        failed++;
        errors.push({
          carrierId: carrier._id.toString(),
          name: carrier.companyName,
          error: error.message
        });
        console.error(`[VIGILANCE] ✗ ${carrier.companyName}: ${error.message}`);
      }
    }

    console.log(`[VIGILANCE] Update complete: ${updated} updated, ${failed} failed`);

    return {
      success: true,
      updated,
      failed,
      total: carriers.length,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Obtenir les statistiques de vigilance globales
   * @returns {Object} Statistiques
   */
  async getVigilanceStats() {
    const carriers = await this.db.collection('carriers').find({}).toArray();

    const stats = {
      total: carriers.length,
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
      averageScore: 0,
      withVigilance: 0,
      withoutVigilance: 0
    };

    let totalScore = 0;

    carriers.forEach(carrier => {
      if (carrier.vigilance && carrier.vigilanceScore !== undefined) {
        stats.withVigilance++;

        // Par niveau
        const level = carrier.vigilanceLevel || 'N2_guest';
        if (stats.byLevel[level] !== undefined) {
          stats.byLevel[level]++;
        }

        // Par plage de score
        const score = carrier.vigilanceScore;
        totalScore += score;

        if (score >= 90) stats.byScoreRange.excellent++;
        else if (score >= 75) stats.byScoreRange.good++;
        else if (score >= 50) stats.byScoreRange.medium++;
        else if (score >= 25) stats.byScoreRange.low++;
        else stats.byScoreRange.poor++;
      } else {
        stats.withoutVigilance++;
      }
    });

    stats.averageScore = stats.withVigilance > 0
      ? Math.round(totalScore / stats.withVigilance)
      : 0;

    return stats;
  }
}

module.exports = VigilanceService;
