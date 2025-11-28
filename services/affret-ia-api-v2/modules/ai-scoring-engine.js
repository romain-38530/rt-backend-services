/**
 * AFFRET.IA - Moteur de Scoring Intelligent
 *
 * Algorithme de scoring multi-criteres:
 * - Score Prix: 40%
 * - Score Qualite: 60%
 *   - Historique performances: 25%
 *   - Ponctualite: 15%
 *   - Taux acceptation: 10%
 *   - Reactivite: 5%
 *   - Capacite: 5%
 */

const axios = require('axios');

class AIScoringEngine {
  constructor(config = {}) {
    this.config = {
      scoringApiUrl: config.scoringApiUrl || process.env.SCORING_API_URL,
      carriersApiUrl: config.carriersApiUrl || process.env.CARRIERS_API_URL,
      ...config
    };

    // Pondérations par défaut (peuvent être personnalisées)
    this.weights = {
      price: 0.40,
      quality: 0.60,
      qualityBreakdown: {
        historicalPerformance: 0.25,
        punctuality: 0.15,
        acceptanceRate: 0.10,
        reactivity: 0.05,
        capacity: 0.05
      }
    };
  }

  /**
   * Analyse la complexité d'une commande
   * Retourne un score de 0 (simple) à 100 (très complexe)
   */
  async analyzeOrderComplexity(order) {
    let complexity = 0;
    const factors = [];

    // Distance (0-30 points)
    if (order.distance) {
      if (order.distance > 1000) {
        complexity += 30;
        factors.push({ factor: 'distance', value: order.distance, points: 30 });
      } else if (order.distance > 500) {
        complexity += 20;
        factors.push({ factor: 'distance', value: order.distance, points: 20 });
      } else if (order.distance > 200) {
        complexity += 10;
        factors.push({ factor: 'distance', value: order.distance, points: 10 });
      } else {
        complexity += 5;
        factors.push({ factor: 'distance', value: order.distance, points: 5 });
      }
    }

    // Poids / Volume (0-20 points)
    const weight = order.cargo?.weight?.value || 0;
    const volume = order.cargo?.volume?.value || 0;

    if (weight > 15000 || volume > 60) {
      complexity += 20;
      factors.push({ factor: 'weight_volume', value: { weight, volume }, points: 20 });
    } else if (weight > 8000 || volume > 30) {
      complexity += 15;
      factors.push({ factor: 'weight_volume', value: { weight, volume }, points: 15 });
    } else if (weight > 3000 || volume > 10) {
      complexity += 10;
      factors.push({ factor: 'weight_volume', value: { weight, volume }, points: 10 });
    } else {
      complexity += 5;
      factors.push({ factor: 'weight_volume', value: { weight, volume }, points: 5 });
    }

    // Contraintes spéciales (0-30 points)
    const constraints = order.constraints || [];
    let constraintsScore = 0;

    if (order.cargo?.hazardous) {
      constraintsScore += 15;
      factors.push({ factor: 'hazardous', points: 15 });
    }
    if (order.cargo?.temperature) {
      constraintsScore += 10;
      factors.push({ factor: 'temperature_controlled', points: 10 });
    }
    if (order.services?.adr) {
      constraintsScore += 10;
      factors.push({ factor: 'adr', points: 10 });
    }
    if (constraints.includes('RDV') || order.pickupTimeSlot || order.deliveryTimeSlot) {
      constraintsScore += 8;
      factors.push({ factor: 'time_slot', points: 8 });
    }
    if (order.services?.insurance && order.services.insuranceValue > 50000) {
      constraintsScore += 7;
      factors.push({ factor: 'high_value', value: order.services.insuranceValue, points: 7 });
    }

    complexity += Math.min(30, constraintsScore);

    // Délai serré (0-20 points)
    if (order.pickupDate) {
      const pickupDate = new Date(order.pickupDate);
      const now = new Date();
      const hoursUntilPickup = (pickupDate - now) / (1000 * 60 * 60);

      if (hoursUntilPickup < 24) {
        complexity += 20;
        factors.push({ factor: 'urgent', value: `${Math.round(hoursUntilPickup)}h`, points: 20 });
      } else if (hoursUntilPickup < 48) {
        complexity += 15;
        factors.push({ factor: 'urgent', value: `${Math.round(hoursUntilPickup)}h`, points: 15 });
      } else if (hoursUntilPickup < 72) {
        complexity += 10;
        factors.push({ factor: 'short_notice', value: `${Math.round(hoursUntilPickup)}h`, points: 10 });
      }
    }

    return {
      complexity: Math.min(100, complexity),
      factors,
      category: this.getComplexityCategory(Math.min(100, complexity))
    };
  }

  getComplexityCategory(score) {
    if (score >= 80) return 'très_complexe';
    if (score >= 60) return 'complexe';
    if (score >= 40) return 'modéré';
    if (score >= 20) return 'simple';
    return 'très_simple';
  }

  /**
   * Calcule le score Prix (0-100)
   * 100 si prix <= estimation, décroît si supérieur
   */
  calculatePriceScore(proposedPrice, estimatedPrice) {
    if (!estimatedPrice || estimatedPrice === 0) {
      // Si pas d'estimation, on ne peut pas scorer
      return 50;
    }

    const ratio = proposedPrice / estimatedPrice;

    if (ratio <= 1.0) {
      // Prix inférieur ou égal à l'estimation: excellent
      // Bonus pour prix inférieur
      const discount = (1 - ratio) * 100;
      return Math.min(100, 100 + (discount * 0.5));
    } else {
      // Prix supérieur à l'estimation
      const excess = (ratio - 1) * 100; // % au-dessus

      if (excess <= 5) {
        // Jusqu'à +5%: score élevé
        return 100 - (excess * 2); // 90-100
      } else if (excess <= 15) {
        // +5% à +15%: acceptable
        return 90 - ((excess - 5) * 4); // 50-90
      } else if (excess <= 30) {
        // +15% à +30%: faible
        return 50 - ((excess - 15) * 2); // 20-50
      } else {
        // Au-delà de +30%: très faible
        return Math.max(0, 20 - ((excess - 30) * 0.67));
      }
    }
  }

  /**
   * Récupère le score qualité d'un transporteur
   */
  async getCarrierQualityScore(carrierId) {
    try {
      if (!this.config.scoringApiUrl) {
        console.warn('[AI SCORING] No scoring API URL configured');
        return this.getDefaultQualityScore();
      }

      const response = await axios.get(
        `${this.config.scoringApiUrl}/api/v1/carriers/${carrierId}/score`,
        { timeout: 5000 }
      );

      const data = response.data.data;

      if (!data || !data.averageScores) {
        return this.getDefaultQualityScore();
      }

      // Calcul du score qualité basé sur les critères
      const scores = data.averageScores;

      const qualityScore = {
        overall: scores.overall || 50,
        breakdown: {
          historicalPerformance: scores.overall || 50,
          punctuality: ((scores.punctualityPickup || 50) + (scores.punctualityDelivery || 50)) / 2,
          acceptanceRate: this.estimateAcceptanceRate(data),
          reactivity: scores.trackingReactivity || 50,
          capacity: 50 // À calculer depuis carriers API
        }
      };

      return qualityScore;

    } catch (error) {
      console.warn(`[AI SCORING] Error fetching carrier ${carrierId} score:`, error.message);
      return this.getDefaultQualityScore();
    }
  }

  /**
   * Score qualité par défaut si pas de données
   */
  getDefaultQualityScore() {
    return {
      overall: 50,
      breakdown: {
        historicalPerformance: 50,
        punctuality: 50,
        acceptanceRate: 50,
        reactivity: 50,
        capacity: 50
      }
    };
  }

  /**
   * Estime le taux d'acceptation d'un transporteur
   */
  estimateAcceptanceRate(carrierData) {
    // Si disponible dans les stats
    if (carrierData.stats?.acceptanceRate) {
      return carrierData.stats.acceptanceRate;
    }

    // Sinon estimation basée sur le nombre de transports
    const totalTransports = carrierData.stats?.totalTransports || 0;

    if (totalTransports === 0) return 30; // Nouveau transporteur: score faible
    if (totalTransports < 10) return 50;
    if (totalTransports < 50) return 65;
    if (totalTransports < 100) return 75;
    return 85; // Transporteur expérimenté
  }

  /**
   * Calcule le score qualité composite
   */
  calculateQualityScore(qualityData) {
    const breakdown = qualityData.breakdown;
    const weights = this.weights.qualityBreakdown;

    const weightedScore =
      (breakdown.historicalPerformance * weights.historicalPerformance) +
      (breakdown.punctuality * weights.punctuality) +
      (breakdown.acceptanceRate * weights.acceptanceRate) +
      (breakdown.reactivity * weights.reactivity) +
      (breakdown.capacity * weights.capacity);

    // Le poids total des composants qualité est 0.60 (60%)
    // Donc on normalise sur 100
    return weightedScore / (weights.historicalPerformance + weights.punctuality +
                           weights.acceptanceRate + weights.reactivity + weights.capacity) * 100;
  }

  /**
   * Calcule le score global d'une proposition
   * @returns {Object} { priceScore, qualityScore, overall, breakdown }
   */
  async calculateProposalScore(proposal, estimatedPrice) {
    // Score Prix (40%)
    const priceScore = this.calculatePriceScore(proposal.proposedPrice, estimatedPrice);

    // Score Qualité (60%)
    const qualityData = await this.getCarrierQualityScore(proposal.carrierId);
    const qualityScore = this.calculateQualityScore(qualityData);

    // Score Global
    const overallScore = (priceScore * this.weights.price) + (qualityScore * this.weights.quality);

    return {
      priceScore: Math.round(priceScore * 100) / 100,
      qualityScore: Math.round(qualityScore * 100) / 100,
      overall: Math.round(overallScore * 100) / 100,
      breakdown: qualityData.breakdown,
      weights: this.weights
    };
  }

  /**
   * Génère une shortlist intelligente de transporteurs
   */
  async generateShortlist(order, availableCarriers, maxCarriers = 10) {
    const shortlist = [];

    for (const carrier of availableCarriers) {
      // Calculer score de correspondance
      const matchScore = await this.calculateMatchScore(order, carrier);

      // Estimer le prix
      const estimatedPrice = await this.estimatePrice(order, carrier);

      shortlist.push({
        carrierId: carrier.carrierId,
        carrierName: carrier.carrierName,
        matchScore,
        estimatedPrice,
        capacity: carrier.capacity || false,
        distance: carrier.distance || 0,
        reason: this.generateSelectionReason(matchScore, carrier),
        contactEmail: carrier.contactEmail,
        contactPhone: carrier.contactPhone
      });
    }

    // Trier par matchScore décroissant
    shortlist.sort((a, b) => b.matchScore - a.matchScore);

    // Prendre les N meilleurs
    return shortlist.slice(0, maxCarriers);
  }

  /**
   * Calcule le score de correspondance transporteur/commande
   */
  async calculateMatchScore(order, carrier) {
    let score = 0;

    // Score qualité transporteur (40%)
    const qualityData = await this.getCarrierQualityScore(carrier.carrierId);
    score += (qualityData.overall / 100) * 40;

    // Distance (20%)
    if (carrier.distance !== undefined) {
      const distanceScore = Math.max(0, 100 - (carrier.distance / 10));
      score += (distanceScore / 100) * 20;
    } else {
      score += 20; // Si pas de distance, score neutre
    }

    // Capacité disponible (15%)
    score += carrier.capacity ? 15 : 5;

    // Type véhicule correspondant (10%)
    if (order.vehicleType && carrier.vehicleType === order.vehicleType) {
      score += 10;
    } else if (carrier.vehicleType) {
      score += 5; // Véhicule différent mais disponible
    }

    // Spécialisations (10%)
    let specializationScore = 0;

    if (order.cargo?.hazardous && carrier.capabilities?.adr) {
      specializationScore += 5;
    }
    if (order.cargo?.temperature && carrier.capabilities?.temperatureControlled) {
      specializationScore += 5;
    }
    if (order.services?.tailgate && carrier.capabilities?.tailgate) {
      specializationScore += 3;
    }

    score += Math.min(10, specializationScore);

    // Zone géographique (5%)
    if (carrier.zones && this.isInZone(order, carrier.zones)) {
      score += 5;
    } else {
      score += 2;
    }

    return Math.round(score * 100) / 100;
  }

  /**
   * Estime le prix pour un transporteur donné
   */
  async estimatePrice(order, carrier) {
    // Logique d'estimation de prix
    // Peut appeler un service de pricing externe

    const basePrice = 300; // Prix de base
    const distanceFactor = (carrier.distance || 100) * 0.8; // 0.80€/km
    const weightFactor = ((order.cargo?.weight?.value || 500) / 100) * 5; // 5€ par 100kg

    let price = basePrice + distanceFactor + weightFactor;

    // Ajustements
    if (order.cargo?.hazardous) price *= 1.20;
    if (order.cargo?.temperature) price *= 1.15;
    if (order.services?.insurance) price *= 1.10;

    return Math.round(price * 100) / 100;
  }

  /**
   * Génère une raison de sélection
   */
  generateSelectionReason(matchScore, carrier) {
    if (matchScore >= 90) {
      return `Excellent candidat - Score ${matchScore}/100`;
    } else if (matchScore >= 80) {
      return `Très bon candidat - Expérience confirmée`;
    } else if (matchScore >= 70) {
      return `Bon candidat - Profil adapté`;
    } else if (matchScore >= 60) {
      return `Candidat acceptable - Capacité disponible`;
    } else {
      return `Candidat de secours`;
    }
  }

  /**
   * Vérifie si la commande est dans la zone du transporteur
   */
  isInZone(order, zones) {
    // Simplifié - à améliorer avec vraie logique géographique
    if (!zones || zones.length === 0) return true;

    const pickupCode = order.pickup?.postalCode?.substring(0, 2);
    const deliveryCode = order.delivery?.postalCode?.substring(0, 2);

    return zones.some(zone => {
      return zone.includes(pickupCode) || zone.includes(deliveryCode);
    });
  }

  /**
   * Détermine si une proposition peut être acceptée automatiquement
   */
  canAutoAccept(proposalScore, estimatedPrice, proposedPrice, settings = {}) {
    const maxPriceIncrease = settings.maxPriceIncrease || 15;
    const minQualityScore = settings.minQualityScore || 70;
    const minOverallScore = settings.minOverallScore || 75;

    // Vérifier l'écart de prix
    const priceRatio = (proposedPrice / estimatedPrice - 1) * 100;

    if (priceRatio > maxPriceIncrease) {
      return { canAccept: false, reason: `Prix trop élevé (+${priceRatio.toFixed(1)}%)` };
    }

    // Vérifier le score qualité
    if (proposalScore.qualityScore < minQualityScore) {
      return { canAccept: false, reason: `Score qualité insuffisant (${proposalScore.qualityScore}/100)` };
    }

    // Vérifier le score global
    if (proposalScore.overall < minOverallScore) {
      return { canAccept: false, reason: `Score global insuffisant (${proposalScore.overall}/100)` };
    }

    return {
      canAccept: true,
      reason: `Acceptation auto - Prix: ${proposalScore.priceScore}/100, Qualité: ${proposalScore.qualityScore}/100, Global: ${proposalScore.overall}/100`
    };
  }

  /**
   * Génère une contre-proposition intelligente
   */
  generateCounterOffer(proposedPrice, estimatedPrice, settings = {}) {
    const maxIncrease = settings.maxPriceIncrease || 15;
    const maxAllowedPrice = estimatedPrice * (1 + maxIncrease / 100);

    if (proposedPrice <= estimatedPrice) {
      // Proposition déjà bonne
      return null;
    }

    if (proposedPrice > maxAllowedPrice) {
      // Trop cher, contre-proposer au maximum acceptable
      return {
        counterPrice: Math.round(maxAllowedPrice * 100) / 100,
        message: `Votre proposition dépasse notre budget. Nous pouvons accepter jusqu'à ${maxAllowedPrice.toFixed(2)}€.`
      };
    }

    // Dans la fourchette mais au-dessus de l'estimation
    // Contre-proposer à mi-chemin
    const counterPrice = (estimatedPrice + proposedPrice) / 2;

    return {
      counterPrice: Math.round(counterPrice * 100) / 100,
      message: `Nous pouvons vous proposer ${counterPrice.toFixed(2)}€ pour cette prestation.`
    };
  }
}

module.exports = AIScoringEngine;
