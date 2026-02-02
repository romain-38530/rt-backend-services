/**
 * Service de Pricing - Gestion des prix et intégration Dashdoc
 * Permet de récupérer historique, calculer prix moyens, et importer depuis Dashdoc
 */

const axios = require('axios');
const PriceHistory = require('../models/PriceHistory');

class PricingService {
  constructor() {
    this.dashdocApiUrl = process.env.DASHDOC_API_URL || 'https://api.dashdoc.com/api/v4';
    this.dashdocApiKey = process.env.DASHDOC_API_KEY;
  }

  /**
   * Extrait le prix payé au sous-traitant depuis un transport Dashdoc
   * IMPORTANT: Utilise charter.price ou subcontracting.price (PAS pricing.invoicing_amount)
   */
  extractCarrierPrice(transport) {
    // Priorité 1: charter.price
    if (transport.charter?.price) {
      return {
        price: transport.charter.price,
        currency: transport.charter.currency || 'EUR',
        source: 'charter.price',
        found: true
      };
    }

    // Priorité 2: charter.purchase_price
    if (transport.charter?.purchase_price) {
      return {
        price: transport.charter.purchase_price,
        currency: transport.charter.currency || 'EUR',
        source: 'charter.purchase_price',
        found: true
      };
    }

    // Priorité 3: subcontracting.price
    if (transport.subcontracting?.price) {
      return {
        price: transport.subcontracting.price,
        currency: transport.subcontracting.currency || 'EUR',
        source: 'subcontracting.price',
        found: true
      };
    }

    // Priorité 4: subcontracting.purchase_price
    if (transport.subcontracting?.purchase_price) {
      return {
        price: transport.subcontracting.purchase_price,
        currency: transport.subcontracting.currency || 'EUR',
        source: 'subcontracting.purchase_price',
        found: true
      };
    }

    // Priorité 5: pricing.carrier_price (au cas où)
    if (transport.pricing?.carrier_price) {
      return {
        price: transport.pricing.carrier_price,
        currency: transport.pricing.currency || 'EUR',
        source: 'pricing.carrier_price',
        found: true
      };
    }

    // Fallback: pricing.invoicing_amount (avec warning)
    if (transport.pricing?.invoicing_amount) {
      console.warn(`⚠️ [DASHDOC] Transport ${transport.uid}: Utilisation de invoicing_amount car pas de prix sous-traitant trouvé`);
      return {
        price: transport.pricing.invoicing_amount,
        currency: transport.pricing.currency || 'EUR',
        source: 'pricing.invoicing_amount (FALLBACK)',
        found: false
      };
    }

    // Aucun prix trouvé
    return {
      price: null,
      currency: 'EUR',
      source: 'none',
      found: false
    };
  }

  /**
   * Extrait les informations du transporteur sous-traitant
   */
  extractCarrierInfo(transport) {
    // Priorité: charter > subcontracting > carrier
    if (transport.charter?.carrier) {
      return {
        pk: transport.charter.carrier.pk,
        name: transport.charter.carrier.name || 'Transporteur',
        source: 'charter'
      };
    }

    if (transport.subcontracting?.carrier) {
      return {
        pk: transport.subcontracting.carrier.pk,
        name: transport.subcontracting.carrier.name || 'Transporteur',
        source: 'subcontracting'
      };
    }

    if (transport.carrier) {
      return {
        pk: transport.carrier.pk,
        name: transport.carrier.name || 'Transporteur',
        source: 'carrier'
      };
    }

    return null;
  }

  /**
   * Récupérer l'historique des prix pour une ligne
   */
  async getPriceHistory(fromPostalCode, toPostalCode, options = {}) {
    try {
      const stats = await PriceHistory.getAveragePrice(fromPostalCode, toPostalCode, options);

      return {
        success: true,
        route: {
          from: fromPostalCode,
          to: toPostalCode
        },
        averagePrice: stats.averagePrice,
        priceRange: {
          min: stats.minPrice,
          max: stats.maxPrice,
          stdDeviation: stats.stdDeviation
        },
        transactionCount: stats.count,
        history: stats.history,
        period: options.period || 'last_6_months'
      };
    } catch (error) {
      console.error('[PRICING SERVICE] Erreur récupération historique:', error);
      throw error;
    }
  }

  /**
   * Récupérer les sous-traitants préférés avec leurs prix moyens
   */
  async getPreferredSubcontractors(organizationId, options = {}) {
    try {
      const {
        fromPostalCode = null,
        toPostalCode = null,
        minTransports = 3  // Minimum de transports réalisés
      } = options;

      // Query de base
      const query = {
        organizationId,
        status: 'completed'
      };

      // Si ligne spécifiée
      if (fromPostalCode && toPostalCode) {
        query['route.from.postalCode'] = fromPostalCode;
        query['route.to.postalCode'] = toPostalCode;
      }

      // Agrégation pour grouper par transporteur
      const carriers = await PriceHistory.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$carrierId',
            carrierName: { $first: '$carrierName' },
            totalTransports: { $sum: 1 },
            avgPrice: { $avg: '$price.final' },
            minPrice: { $min: '$price.final' },
            maxPrice: { $max: '$price.final' },
            lastTransport: { $max: '$completedAt' },
            routes: {
              $addToSet: {
                from: '$route.from.postalCode',
                to: '$route.to.postalCode'
              }
            }
          }
        },
        {
          $match: {
            totalTransports: { $gte: minTransports }
          }
        },
        {
          $sort: { totalTransports: -1, avgPrice: 1 }
        },
        {
          $limit: 50
        }
      ]);

      return {
        success: true,
        subcontractors: carriers.map(c => ({
          carrierId: c._id,
          carrierName: c.carrierName,
          totalTransports: c.totalTransports,
          avgPrice: Math.round(c.avgPrice),
          priceRange: {
            min: c.minPrice,
            max: c.maxPrice
          },
          lastTransport: c.lastTransport,
          routesCovered: c.routes.length,
          isPreferred: c.totalTransports >= minTransports
        })),
        count: carriers.length
      };
    } catch (error) {
      console.error('[PRICING SERVICE] Erreur récupération sous-traitants:', error);
      throw error;
    }
  }

  /**
   * Enregistrer un nouveau prix négocié
   */
  async recordPrice(data) {
    try {
      const record = await PriceHistory.recordPrice({
        orderId: data.orderId,
        carrierId: data.carrierId,
        carrierName: data.carrierName,
        route: {
          from: data.route.from,
          to: data.route.to,
          fromCity: data.route.fromCity,
          toCity: data.route.toCity
        },
        proposedPrice: data.proposedPrice,
        finalPrice: data.price || data.finalPrice,
        marketAverage: data.marketAverage,
        vehicleType: data.vehicleType,
        weight: data.weight,
        volume: data.volume,
        palettes: data.palettes,
        distance: data.distance,
        negotiationRounds: data.negotiationRounds,
        negotiationMethod: data.negotiationMethod || 'auto',
        organizationId: data.organizationId,
        status: data.status || 'completed',
        completedAt: data.completedAt || new Date()
      });

      console.log(`[PRICING SERVICE] Prix enregistré: ${record.price.final}€ pour ${record.carrierId}`);

      return {
        success: true,
        priceId: record._id,
        price: record.price.final,
        deviation: record.negotiation.deviation
      };
    } catch (error) {
      console.error('[PRICING SERVICE] Erreur enregistrement prix:', error);
      throw error;
    }
  }

  /**
   * Importer les données de prix depuis Dashdoc
   */
  async importFromDashdoc(options = {}) {
    try {
      if (!this.dashdocApiKey) {
        throw new Error('DASHDOC_API_KEY non configuré');
      }

      const {
        startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000), // 6 mois par défaut
        endDate = new Date(),
        organizationId = null,
        dryRun = false
      } = options;

      console.log(`[PRICING SERVICE] Import Dashdoc depuis ${startDate.toISOString()}...`);

      // Appel API Dashdoc - Récupérer les transports complétés
      const response = await axios.get(`${this.dashdocApiUrl}/transports/`, {
        headers: {
          'Authorization': `Bearer ${this.dashdocApiKey}`,
          'Content-Type': 'application/json'
        },
        params: {
          status: 'done',
          is_subcontracted: true,  // ✅ Filtre uniquement les sous-traitances
          created_after: startDate.toISOString(),
          created_before: endDate.toISOString(),
          page_size: 100
        }
      });

      const transports = response.data.results || [];
      console.log(`[PRICING SERVICE] ${transports.length} transports sous-traités récupérés depuis Dashdoc`);

      let imported = 0;
      let skipped = 0;
      const errors = [];

      for (const transport of transports) {
        try {
          // Extraire adresses
          const pickupAddress = transport.origin?.address;
          const deliveryAddress = transport.destination?.address;

          // Extraire prix SOUS-TRAITANT (pas client)
          const carrierPricing = this.extractCarrierPrice(transport);

          // Extraire infos transporteur
          const carrierInfo = this.extractCarrierInfo(transport);

          // Valider données minimales
          if (!pickupAddress?.postcode ||
              !deliveryAddress?.postcode ||
              !carrierInfo ||
              !carrierPricing.found ||
              !carrierPricing.price) {
            skipped++;
            if (!carrierPricing.found) {
              console.log(`⚠️ Transport ${transport.uid} ignoré: pas de prix sous-traitant (charter/subcontracting)`);
            }
            continue;
          }

          // Si dry-run, juste logger
          if (options.dryRun) {
            console.log(`[DRY RUN] ${transport.uid}: ${pickupAddress.postcode}→${deliveryAddress.postcode}, ${carrierPricing.price}€ (${carrierPricing.source})`);
            imported++;
            continue;
          }

          // Vérifier si déjà importé
          const existing = await PriceHistory.findOne({
            'dashdocImport.transportId': transport.uid
          });

          if (existing) {
            skipped++;
            continue;
          }

          // Créer l'enregistrement avec prix SOUS-TRAITANT
          await PriceHistory.create({
            orderId: `DASHDOC-${transport.uid}`,
            carrierId: `dashdoc-${carrierInfo.pk}`,
            carrierName: carrierInfo.name,
            route: {
              from: {
                city: pickupAddress.city,
                postalCode: pickupAddress.postcode
              },
              to: {
                city: deliveryAddress.city,
                postalCode: deliveryAddress.postcode
              }
            },
            price: {
              proposed: carrierPricing.price,  // ✅ Prix sous-traitant
              final: carrierPricing.price,      // ✅ Prix sous-traitant
              marketAverage: 0,
              currency: carrierPricing.currency
            },
            transport: {
              vehicleType: this.mapDashdocVehicleType(transport.vehicle_type),
              weight: transport.weight_kg || 0,
              volume: transport.volume_m3 || 0,
              palettes: transport.pallets_count || 0,
              distance: transport.distance_km || 0
            },
            negotiation: {
              rounds: 0,
              method: 'manual',
              deviation: 0
            },
            dashdocImport: {
              imported: true,
              transportId: transport.uid,
              importedAt: new Date(),
              source: 'dashdoc',
              priceSource: carrierPricing.source,  // ✅ Tracer d'où vient le prix
              carrierSource: carrierInfo.source
            },
            organizationId: organizationId || 'dashdoc-import',
            status: 'completed',
            completedAt: new Date(transport.delivery_date || transport.created)
          });

          imported++;

        } catch (itemError) {
          console.error(`[PRICING SERVICE] Erreur import transport ${transport.uid}:`, itemError.message);
          errors.push({
            transportId: transport.uid,
            error: itemError.message
          });
        }
      }

      console.log(`[PRICING SERVICE] Import terminé: ${imported} importés, ${skipped} ignorés`);

      return {
        success: true,
        message: dryRun ?
          `DRY RUN - ${imported} transports sous-traités seraient importés` :
          `${imported} prix sous-traitants importés depuis Dashdoc`,
        imported,
        skipped,
        errors: errors.length,
        errorDetails: errors.length > 0 ? errors : undefined,
        message: `${imported} prix importés depuis Dashdoc`
      };

    } catch (error) {
      console.error('[PRICING SERVICE] Erreur import Dashdoc:', error);
      throw error;
    }
  }

  /**
   * Mapper les types de véhicules Dashdoc vers nos types
   */
  mapDashdocVehicleType(dashdocType) {
    const mapping = {
      'van': 'VUL',
      'truck_12t': '12T',
      'truck_19t': '19T',
      'semi_trailer': 'SEMI',
      'trailer': 'SEMI',
      'truck': '19T'
    };

    return mapping[dashdocType] || 'OTHER';
  }

  /**
   * Calculer le prix cible de négociation basé sur le marché
   */
  async calculateTargetPrice(fromPostalCode, toPostalCode, options = {}) {
    try {
      const history = await this.getPriceHistory(fromPostalCode, toPostalCode, options);

      if (history.transactionCount === 0) {
        // Pas d'historique, utiliser estimation
        return {
          success: true,
          targetPrice: 0,
          hasHistory: false,
          message: 'Aucun historique disponible'
        };
      }

      const avgPrice = history.averagePrice;
      const stdDev = history.priceRange.stdDeviation;

      // Fourchette acceptable: prix moyen ± 10%
      const minAcceptable = Math.round(avgPrice * 0.9);
      const maxAcceptable = Math.round(avgPrice * 1.1);

      return {
        success: true,
        targetPrice: avgPrice,
        priceRange: {
          min: minAcceptable,
          max: maxAcceptable,
          stdDeviation: stdDev
        },
        hasHistory: true,
        transactionCount: history.transactionCount,
        confidence: this.calculateConfidenceScore(history.transactionCount, stdDev, avgPrice)
      };

    } catch (error) {
      console.error('[PRICING SERVICE] Erreur calcul prix cible:', error);
      throw error;
    }
  }

  /**
   * Calculer un score de confiance basé sur l'historique
   */
  calculateConfidenceScore(count, stdDev, avgPrice) {
    // Score basé sur:
    // 1. Nombre de transactions (max 50 points)
    const countScore = Math.min(count * 5, 50);

    // 2. Consistance des prix - coefficient de variation (max 50 points)
    const cv = avgPrice > 0 ? (stdDev / avgPrice) : 1;
    const consistencyScore = Math.max(0, 50 - (cv * 100));

    const total = countScore + consistencyScore;

    if (total >= 80) return 'high';
    if (total >= 50) return 'medium';
    return 'low';
  }

  /**
   * Rechercher des transporteurs disponibles pour une ligne
   * (Scraping simulé - à remplacer par vraie recherche)
   */
  async searchAvailableCarriers(route, requirements = {}) {
    try {
      const {
        minScore = 70,
        vehicleTypes = ['VUL', '12T', '19T', 'SEMI'],
        maxDistance = 50,
        priceReference = 0,
        prioritizeSubcontractors = true
      } = requirements;

      console.log(`[PRICING SERVICE] Recherche transporteurs pour ${route.from} → ${route.to}`);

      // Récupérer sous-traitants si priorisation activée
      let subcontractors = [];
      if (prioritizeSubcontractors && requirements.organizationId) {
        const subcontractorsResult = await this.getPreferredSubcontractors(
          requirements.organizationId,
          {
            fromPostalCode: route.from,
            toPostalCode: route.to
          }
        );
        subcontractors = subcontractorsResult.subcontractors || [];
      }

      // TODO: Implémenter vraie recherche dans base transporteurs
      // Pour l'instant, retourner simulation
      const simulatedCarriers = this.generateSimulatedCarriers(6, priceReference);

      // Marquer les sous-traitants
      const carriersWithPreference = simulatedCarriers.map(carrier => {
        const isPreferred = subcontractors.some(sub => sub.carrierId === carrier.carrierId);
        return {
          ...carrier,
          isPreferred,
          historicalAvgPrice: isPreferred ?
            subcontractors.find(sub => sub.carrierId === carrier.carrierId)?.avgPrice : null
        };
      });

      // Trier: sous-traitants d'abord, puis par score
      carriersWithPreference.sort((a, b) => {
        if (a.isPreferred && !b.isPreferred) return -1;
        if (!a.isPreferred && b.isPreferred) return 1;
        return b.score - a.score;
      });

      return {
        success: true,
        carriers: carriersWithPreference,
        count: carriersWithPreference.length,
        preferredCount: carriersWithPreference.filter(c => c.isPreferred).length
      };

    } catch (error) {
      console.error('[PRICING SERVICE] Erreur recherche transporteurs:', error);
      throw error;
    }
  }

  /**
   * Générer des transporteurs simulés (pour tests)
   */
  generateSimulatedCarriers(count, priceReference) {
    const carriers = [];
    const names = [
      'TransExpress Premium',
      'LogiFast Transport',
      'CargoExpert',
      'RapidRoute',
      'EuroFreight',
      'SpeedTransport'
    ];

    for (let i = 0; i < count; i++) {
      carriers.push({
        carrierId: `simulated-carrier-${i + 1}`,
        name: names[i] || `Transporteur ${i + 1}`,
        score: Math.floor(Math.random() * 30) + 70, // 70-100
        distance: Math.floor(Math.random() * 40) + 10, // 10-50 km
        vehicleTypes: ['VUL', '12T', '19T', 'SEMI'],
        availableNow: Math.random() > 0.3,
        estimatedPrice: priceReference > 0 ?
          Math.floor(priceReference * (0.9 + Math.random() * 0.2)) : // ±10% du prix référence
          Math.floor(Math.random() * 200) + 300 // 300-500€
      });
    }

    return carriers;
  }
}

module.exports = new PricingService();
