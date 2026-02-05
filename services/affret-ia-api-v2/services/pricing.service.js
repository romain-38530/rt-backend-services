/**
 * Service de Pricing - Gestion des prix et intégration Dashdoc
 * Permet de récupérer historique, calculer prix moyens, et importer depuis Data Lake
 *
 * ARCHITECTURE DATA LAKE:
 * - Les données sont lues depuis MongoDB (Data Lake) au lieu d'appels API directs
 * - Le Data Lake est synchronisé toutes les 25 secondes par tms-sync-eb
 */

const axios = require('axios');
const PriceHistory = require('../models/PriceHistory');

class PricingService {
  constructor() {
    // Data Lake connection (initialisé via setDatalakeConnection)
    this.datalakeDb = null;
    this.datalakeReaders = null;

    // Legacy API config (conservé pour fallback)
    this.dashdocApiUrl = process.env.DASHDOC_API_URL || 'https://api.dashdoc.eu/api/v4';
    this.dashdocApiKey = process.env.DASHDOC_API_KEY;
  }

  /**
   * Configurer la connexion au Data Lake
   * @param {Db} db - Instance MongoDB
   * @param {Object} readers - Readers du Data Lake (depuis tms-sync-eb)
   */
  setDatalakeConnection(db, readers) {
    this.datalakeDb = db;
    this.datalakeReaders = readers;
    console.log('[PRICING SERVICE] Data Lake connection configured');
  }

  /**
   * Extrait le prix payé au sous-traitant depuis un transport Dashdoc
   * ⚠️ NOUVELLE STRUCTURE: Prix au niveau racine du transport
   * Structure Dashdoc: les prix sont dans agreed_price_total, effective_price_total, etc.
   */
  extractCarrierPrice(transport) {
    // Priorité 1: purchase_cost_total (coût d'achat = prix sous-traitant)
    if (transport.purchase_cost_total) {
      return {
        price: parseFloat(transport.purchase_cost_total),
        currency: transport.currency || 'EUR',
        source: 'purchase_cost_total',
        found: true
      };
    }

    // Priorité 2: agreed_price_total (prix convenu)
    if (transport.agreed_price_total) {
      return {
        price: parseFloat(transport.agreed_price_total),
        currency: transport.currency || 'EUR',
        source: 'agreed_price_total',
        found: true
      };
    }

    // Priorité 3: effective_price_total (prix effectif)
    if (transport.effective_price_total) {
      return {
        price: parseFloat(transport.effective_price_total),
        currency: transport.currency || 'EUR',
        source: 'effective_price_total',
        found: true
      };
    }

    // Priorité 4: pricing_total_price (prix de tarification)
    if (transport.pricing_total_price) {
      return {
        price: parseFloat(transport.pricing_total_price),
        currency: transport.currency || 'EUR',
        source: 'pricing_total_price',
        found: true
      };
    }

    // Priorité 5: quotation_total_price (prix de devis)
    if (transport.quotation_total_price) {
      return {
        price: parseFloat(transport.quotation_total_price),
        currency: transport.currency || 'EUR',
        source: 'quotation_total_price',
        found: true
      };
    }

    // Fallback: invoiced_price_total (prix facturé)
    if (transport.invoiced_price_total) {
      console.warn(`⚠️ [DASHDOC] Transport ${transport.uid}: Utilisation de invoiced_price_total car pas de prix sous-traitant trouvé`);
      return {
        price: parseFloat(transport.invoiced_price_total),
        currency: transport.currency || 'EUR',
        source: 'invoiced_price_total (FALLBACK)',
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
   * ⚠️ NOUVELLE STRUCTURE: Contact dans deliveries[0].tracking_contacts[0].contact + carrier_address
   */
  extractCarrierInfo(transport) {
    let carrierData = null;
    let contactData = null;
    let source = null;

    // Priorité 1: carrier_address (infos complètes de l'entreprise)
    if (transport.carrier_address?.company) {
      carrierData = {
        pk: transport.carrier_address.company.pk,
        name: transport.carrier_address.company.name || transport.carrier_address.name,
        siren: transport.carrier_address.company.siren || transport.carrier_address.company.trade_number,
        phone: transport.carrier_address.company.phone_number,
        email: transport.carrier_address.company.email || null,
        address: {
          address: transport.carrier_address.address,
          city: transport.carrier_address.city,
          postalCode: transport.carrier_address.postcode,
          country: transport.carrier_address.country || 'FR'
        }
      };
      source = 'carrier_address';
    }

    // Priorité 2: deliveries[0].tracking_contacts[0].contact (contact du transporteur)
    if (transport.deliveries && transport.deliveries.length > 0) {
      const delivery = transport.deliveries[0];

      if (delivery.tracking_contacts && delivery.tracking_contacts.length > 0) {
        const trackingContact = delivery.tracking_contacts.find(tc => tc.role === 'carrier');

        if (trackingContact?.contact) {
          contactData = {
            email: trackingContact.contact.email,
            phone: trackingContact.contact.phone_number,
            firstName: trackingContact.contact.first_name,
            lastName: trackingContact.contact.last_name
          };

          // Si on n'a pas trouvé carrier_address, utiliser les infos de tracking_contact
          if (!carrierData && trackingContact.contact.company) {
            carrierData = {
              pk: trackingContact.contact.company.pk,
              name: trackingContact.contact.company.name,
              siren: trackingContact.contact.company.trade_number,
              phone: trackingContact.contact.company.phone_number,
              email: trackingContact.contact.email,
              address: null
            };
            source = 'tracking_contacts';
          }
        }
      }
    }

    if (!carrierData) {
      return null;
    }

    // Fusionner les données carrier + contact
    return {
      pk: carrierData.pk,
      name: carrierData.name || 'Transporteur',
      email: contactData?.email || carrierData.email || null,
      phone: contactData?.phone || carrierData.phone || null,
      siren: carrierData.siren || null,
      address: carrierData.address || null,
      contact: contactData ? {
        firstName: contactData.firstName,
        lastName: contactData.lastName,
        email: contactData.email,
        phone: contactData.phone
      } : null,
      source: source
    };
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
      // ⚠️ IMPORTANT: On garde le prix le plus BAS + sa date pour négociation
      const carriers = await PriceHistory.aggregate([
        { $match: query },
        {
          $sort: { 'price.final': 1 }  // Trier par prix croissant pour avoir le min en premier
        },
        {
          $group: {
            _id: '$carrierId',
            carrierName: { $first: '$carrierName' },
            carrierEmail: { $first: '$carrierEmail' },      // ✅ Contact
            carrierPhone: { $first: '$carrierPhone' },      // ✅ Contact
            carrierSiren: { $first: '$carrierSiren' },
            totalTransports: { $sum: 1 },
            avgPrice: { $avg: '$price.final' },
            minPrice: { $min: '$price.final' },
            minPriceDate: { $first: '$completedAt' },       // ✅ Date du prix le plus bas
            minPriceOrderId: { $first: '$orderId' },        // ✅ Référence commande
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
          carrierEmail: c.carrierEmail,        // ✅ Contact
          carrierPhone: c.carrierPhone,        // ✅ Contact
          carrierSiren: c.carrierSiren,
          totalTransports: c.totalTransports,
          avgPrice: Math.round(c.avgPrice),
          minPrice: c.minPrice,                // ✅ Prix le plus BAS
          minPriceDate: c.minPriceDate,        // ✅ Date du prix le plus bas
          minPriceOrderId: c.minPriceOrderId,  // ✅ Référence commande
          priceRange: {
            min: c.minPrice,
            max: c.maxPrice
          },
          lastTransport: c.lastTransport,
          routesCovered: c.routes.length,
          isPreferred: c.totalTransports >= minTransports,
          negotiationArgument: `A déjà fait cette route ${c.totalTransports} fois, dont une à ${c.minPrice}€ le ${new Date(c.minPriceDate).toLocaleDateString('fr-FR')}`
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
   * ⚠️ ARCHITECTURE DATA LAKE: Lecture depuis MongoDB au lieu d'appels API directs
   */
  async importFromDashdoc(options = {}) {
    try {
      const {
        startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000), // 6 mois par défaut
        endDate = new Date(),
        organizationId = null,
        connectionId = null,
        dryRun = false
      } = options;

      console.log(`[PRICING SERVICE] Import Dashdoc depuis ${startDate.toISOString()}...`);

      let transports = [];

      // ✅ DATA LAKE: Lire depuis MongoDB (dashdoc_transports)
      if (this.datalakeDb) {
        console.log('[PRICING SERVICE] Lecture depuis Data Lake MongoDB...');

        const query = {
          'createdAt': { $gte: startDate, $lte: endDate },
          '_rawData.business_status': 'orders'  // Affrètements uniquement (dans _rawData)
        };

        // Filtre multi-tenant si connectionId fourni
        if (connectionId) {
          query.connectionId = connectionId;
        }

        const transportsCollection = this.datalakeDb.collection('dashdoc_transports');
        transports = await transportsCollection.find(query)
          .sort({ createdAt: -1 })
          .limit(1000)
          .toArray();

        // Extraire les données brutes Dashdoc depuis _rawData
        transports = transports.map(t => t._rawData || t);

        console.log(`[PRICING SERVICE] ✅ ${transports.length} transports lus depuis Data Lake`);
      } else {
        // ⚠️ ARCHITECTURE DATA LAKE OBLIGATOIRE
        // Pas de fallback API direct - toutes les lectures passent par le Data Lake MongoDB
        // Le Data Lake est synchronisé par tms-sync-eb (seul service autorisé à appeler Dashdoc)
        console.error('[PRICING SERVICE] ❌ ERREUR: Data Lake non configuré!');
        console.error('[PRICING SERVICE] Les lectures Dashdoc DOIVENT passer par le Data Lake MongoDB');
        console.error('[PRICING SERVICE] Vérifiez que MongoDB est connecté et que tms-sync-eb synchronise les données');
        throw new Error('Data Lake non configuré. Les appels API directs à Dashdoc sont désactivés pour respecter le rate limiting.');
      }
      console.log(`[PRICING SERVICE] ${transports.length} transports sous-traités à traiter`);

      let imported = 0;
      let skipped = 0;
      const errors = [];

      for (const transport of transports) {
        try {
          // ⚠️ NOUVELLE STRUCTURE: Les données sont dans deliveries[0]
          const delivery = transport.deliveries && transport.deliveries.length > 0 ? transport.deliveries[0] : null;

          if (!delivery) {
            skipped++;
            console.log(`⚠️ Transport ${transport.uid} ignoré: pas de delivery`);
            continue;
          }

          // Extraire adresses depuis deliveries[0].origin et deliveries[0].destination
          const pickupAddress = delivery.origin?.address;
          const deliveryAddress = delivery.destination?.address;

          // Extraire cargo depuis deliveries[0].loads[0]
          const loads = delivery.loads && delivery.loads.length > 0 ? delivery.loads[0] : null;

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
              console.log(`⚠️ Transport ${transport.uid} ignoré: pas de prix sous-traitant`);
            } else if (!pickupAddress?.postcode) {
              console.log(`⚠️ Transport ${transport.uid} ignoré: pas d'adresse pickup`);
            } else if (!deliveryAddress?.postcode) {
              console.log(`⚠️ Transport ${transport.uid} ignoré: pas d'adresse delivery`);
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

          // Créer l'enregistrement avec prix SOUS-TRAITANT + infos contact
          await PriceHistory.create({
            orderId: `DASHDOC-${transport.uid}`,
            carrierId: `dashdoc-${carrierInfo.pk}`,
            carrierName: carrierInfo.name,
            carrierEmail: carrierInfo.email,        // ✅ Contact pour Affret.IA
            carrierPhone: carrierInfo.phone,        // ✅ Contact pour Affret.IA
            carrierSiren: carrierInfo.siren,        // ✅ Identifiant entreprise
            carrierContact: carrierInfo.contact,    // ✅ Nom + prénom contact
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
              vehicleType: this.mapDashdocVehicleType(transport.requested_vehicle || ''),
              weight: loads?.weight || 0,              // ✅ Depuis deliveries[0].loads[0].weight
              volume: loads?.volume || 0,              // ✅ Depuis deliveries[0].loads[0].volume
              palettes: loads?.quantity || 0,          // ✅ Depuis deliveries[0].loads[0].quantity
              distance: transport.estimated_distance || 0
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
              carrierSource: carrierInfo.source,
              carrierAddress: carrierInfo.address  // ✅ Adresse transporteur
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
   * Obtenir le meilleur prix historique d'un transporteur sur une route
   * ⚠️ ARGUMENT DE NÉGOCIATION: "Vous avez fait cette route à X€ le DD/MM/YYYY"
   */
  async getBestCarrierPrice(carrierId, fromPostalCode, toPostalCode, organizationId) {
    try {
      // Chercher tous les transports de ce carrier sur cette route
      const history = await PriceHistory.find({
        carrierId,
        organizationId,
        'route.from.postalCode': fromPostalCode,
        'route.to.postalCode': toPostalCode,
        status: 'completed'
      })
      .sort({ 'price.final': 1 })  // Trier par prix croissant
      .limit(10)  // Garder les 10 meilleurs prix
      .select('price.final completedAt orderId route');

      if (!history || history.length === 0) {
        return {
          found: false,
          message: 'Aucun historique avec ce transporteur sur cette route'
        };
      }

      const bestPrice = history[0];  // Le moins cher

      return {
        found: true,
        bestPrice: bestPrice.price.final,
        bestPriceDate: bestPrice.completedAt,
        bestPriceOrderId: bestPrice.orderId,
        totalTransports: history.length,
        allPrices: history.map(h => ({
          price: h.price.final,
          date: h.completedAt,
          orderId: h.orderId
        })),
        negotiationArgument: `Vous avez réalisé ${history.length} fois cette route, dont une à ${bestPrice.price.final}€ le ${new Date(bestPrice.completedAt).toLocaleDateString('fr-FR')}`
      };

    } catch (error) {
      console.error('[PRICING SERVICE] Erreur récupération meilleur prix carrier:', error);
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
   * ⚠️ ARCHITECTURE DATA LAKE: Utilise les carriers du Data Lake + historique local
   */
  async searchAvailableCarriers(route, requirements = {}) {
    try {
      const {
        minScore = 70,
        vehicleTypes = ['VUL', '12T', '19T', 'SEMI'],
        maxDistance = 50,
        priceReference = 0,
        prioritizeSubcontractors = true,
        connectionId = null
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

      // ✅ NOUVEAU: Utiliser Data Lake pour récupérer les carriers si disponible
      let carriers = [];
      if (this.datalakeReaders?.carriers) {
        console.log('[PRICING SERVICE] Lecture carriers depuis Data Lake...');
        try {
          const datalakeCarriers = await this.datalakeReaders.carriers.search(
            route.from.substring(0, 2), // Recherche par département
            connectionId,
            { limit: 20 }
          );

          carriers = datalakeCarriers.map(carrier => ({
            carrierId: `dashdoc-${carrier.pk}`,
            name: carrier.name || 'Transporteur',
            email: carrier.email || carrier.invoicing_address?.email,
            phone: carrier.phone_number || carrier.invoicing_address?.phone_number,
            siren: carrier.siren || carrier.trade_number,
            score: 80, // Score par défaut
            vehicleTypes: ['VUL', '12T', '19T', 'SEMI'],
            availableNow: true,
            estimatedPrice: priceReference > 0 ? priceReference : 400,
            source: 'datalake'
          }));

          console.log(`[PRICING SERVICE] ${carriers.length} carriers trouvés dans Data Lake`);
        } catch (err) {
          console.warn('[PRICING SERVICE] Erreur lecture Data Lake carriers:', err.message);
        }
      }

      // Fallback: simulation si aucun carrier trouvé
      if (carriers.length === 0) {
        carriers = this.generateSimulatedCarriers(6, priceReference);
      }

      // Marquer les sous-traitants avec leur MEILLEUR prix historique + date
      const carriersWithPreference = carriers.map(carrier => {
        const preferred = subcontractors.find(sub => sub.carrierId === carrier.carrierId);
        const isPreferred = !!preferred;

        return {
          ...carrier,
          isPreferred,
          historical: isPreferred ? {
            avgPrice: preferred.avgPrice,
            minPrice: preferred.minPrice,          // ✅ Prix le plus BAS
            minPriceDate: preferred.minPriceDate,  // ✅ Date de ce prix
            minPriceOrderId: preferred.minPriceOrderId,
            totalTransports: preferred.totalTransports,
            negotiationArgument: `A déjà fait cette route ${preferred.totalTransports} fois, dont une à ${preferred.minPrice}€ le ${new Date(preferred.minPriceDate).toLocaleDateString('fr-FR')}`
          } : null
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
