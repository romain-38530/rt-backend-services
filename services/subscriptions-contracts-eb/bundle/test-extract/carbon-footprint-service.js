/**
 * Carbon Footprint Service - Calcul Émissions CO2
 * SYMPHONI.A - RT Technologie
 *
 * Conformité réglementaire française:
 * - Article L229-25 Code de l'environnement
 * - Décret 2022-1336 (information émissions CO2)
 * - Méthodologie ADEME
 *
 * @version 1.0.0
 */

const { ObjectId } = require('mongodb');

// ============================================
// FACTEURS D'ÉMISSION (gCO2/km)
// ============================================

// Source: Base Carbone ADEME 2023
const EMISSION_FACTORS = {
  // Poids lourds par tonnage
  trucks: {
    // Articulé 40T (tracteur + semi)
    articulated_40t: {
      diesel: { laden: 973, empty: 550, average: 762 },
      lng: { laden: 780, empty: 440, average: 610 },
      electric: { laden: 150, empty: 90, average: 120 },
      hydrogen: { laden: 200, empty: 120, average: 160 }
    },
    // Porteur 19T
    rigid_19t: {
      diesel: { laden: 621, empty: 420, average: 521 },
      lng: { laden: 497, empty: 336, average: 417 },
      electric: { laden: 95, empty: 65, average: 80 },
      hydrogen: { laden: 130, empty: 90, average: 110 }
    },
    // Porteur 12T
    rigid_12t: {
      diesel: { laden: 480, empty: 340, average: 410 },
      electric: { laden: 70, empty: 50, average: 60 }
    },
    // Porteur 7.5T
    rigid_7_5t: {
      diesel: { laden: 350, empty: 260, average: 305 },
      electric: { laden: 55, empty: 40, average: 48 }
    },
    // Utilitaire 3.5T
    van_3_5t: {
      diesel: { laden: 230, empty: 180, average: 205 },
      electric: { laden: 35, empty: 28, average: 32 }
    }
  },

  // Facteurs par type de marchandise (coefficient correcteur)
  cargoType: {
    general: 1.0,
    refrigerated: 1.25, // +25% pour le froid
    hazardous: 1.1,     // +10% pour ADR
    bulk: 0.9,          // -10% pour vrac
    livestock: 1.15,    // +15% pour animaux vivants
    high_value: 1.05    // +5% pour valeur élevée (sécurité)
  },

  // Facteurs géographiques
  geography: {
    urban: 1.2,         // +20% en zone urbaine
    highway: 0.85,      // -15% sur autoroute
    mountain: 1.3,      // +30% en zone montagneuse
    mixed: 1.0          // Standard
  },

  // Bien-à-la-source (scope 3)
  wellToTank: {
    diesel: 0.24,       // +24% pour production carburant
    lng: 0.15,
    electric: 0.05,     // Mix électrique français
    hydrogen_green: 0.1,
    hydrogen_grey: 0.8
  }
};

// Labels environnementaux
const ENVIRONMENTAL_LABELS = {
  A: { maxEmissions: 100, description: 'Très faible impact' },
  B: { maxEmissions: 200, description: 'Faible impact' },
  C: { maxEmissions: 400, description: 'Impact modéré' },
  D: { maxEmissions: 600, description: 'Impact significatif' },
  E: { maxEmissions: 800, description: 'Impact élevé' },
  F: { maxEmissions: Infinity, description: 'Impact très élevé' }
};

// ============================================
// SERVICE PRINCIPAL
// ============================================

/**
 * Créer le service de calcul d'empreinte carbone
 * @param {MongoClient} mongoClient
 * @returns {Object} Service
 */
function createCarbonFootprintService(mongoClient) {
  const getDb = () => mongoClient.db();

  // ============================================
  // CALCUL DES ÉMISSIONS
  // ============================================

  /**
   * Calculer les émissions CO2 pour un transport
   * @param {Object} params - Paramètres du transport
   * @returns {Object} Résultat du calcul
   */
  function calculateEmissions(params) {
    const {
      vehicleType = 'articulated_40t',
      fuelType = 'diesel',
      distance, // km
      loadFactor = 0.75, // 0-1, taux de chargement
      cargoType = 'general',
      routeType = 'mixed',
      returnEmpty = false,
      includeWellToTank = true
    } = params;

    // Récupérer le facteur d'émission de base
    const vehicleFactors = EMISSION_FACTORS.trucks[vehicleType];
    if (!vehicleFactors) {
      throw new Error(`Unknown vehicle type: ${vehicleType}`);
    }

    const fuelFactors = vehicleFactors[fuelType];
    if (!fuelFactors) {
      throw new Error(`Unknown fuel type: ${fuelType} for vehicle ${vehicleType}`);
    }

    // Calculer le facteur d'émission interpolé selon le chargement
    let baseEmission;
    if (loadFactor <= 0) {
      baseEmission = fuelFactors.empty;
    } else if (loadFactor >= 1) {
      baseEmission = fuelFactors.laden;
    } else {
      // Interpolation linéaire
      baseEmission = fuelFactors.empty + (fuelFactors.laden - fuelFactors.empty) * loadFactor;
    }

    // Appliquer les coefficients correcteurs
    const cargoCoefficient = EMISSION_FACTORS.cargoType[cargoType] || 1.0;
    const geoCoefficient = EMISSION_FACTORS.geography[routeType] || 1.0;

    // Émissions Tank-to-Wheel (TTW)
    let ttw = baseEmission * cargoCoefficient * geoCoefficient * distance;

    // Ajouter le retour à vide si applicable
    let returnTTW = 0;
    if (returnEmpty) {
      returnTTW = fuelFactors.empty * geoCoefficient * distance;
      ttw += returnTTW;
    }

    // Émissions Well-to-Tank (WTT) - Scope 3 upstream
    let wtt = 0;
    if (includeWellToTank) {
      const wttFactor = EMISSION_FACTORS.wellToTank[fuelType] || 0.24;
      wtt = ttw * wttFactor;
    }

    // Total Well-to-Wheel (WTW)
    const totalEmissions = ttw + wtt;

    // Calculer l'intensité (gCO2/t.km si poids fourni)
    let intensity = null;
    if (params.cargoWeight) {
      intensity = totalEmissions / (distance * params.cargoWeight);
    }

    // Déterminer le label environnemental
    const emissionPerKm = totalEmissions / (returnEmpty ? distance * 2 : distance);
    const label = getEnvironmentalLabel(emissionPerKm);

    return {
      // Paramètres d'entrée
      input: {
        vehicleType,
        fuelType,
        distance,
        loadFactor,
        cargoType,
        routeType,
        returnEmpty,
        cargoWeight: params.cargoWeight
      },

      // Émissions détaillées (grammes CO2)
      emissions: {
        tankToWheel: Math.round(ttw),
        wellToTank: Math.round(wtt),
        total: Math.round(totalEmissions),
        returnTrip: returnEmpty ? Math.round(returnTTW) : 0
      },

      // Conversion en kg
      emissionsKg: {
        tankToWheel: (ttw / 1000).toFixed(2),
        wellToTank: (wtt / 1000).toFixed(2),
        total: (totalEmissions / 1000).toFixed(2)
      },

      // Métriques
      metrics: {
        emissionPerKm: emissionPerKm.toFixed(2),
        intensity: intensity ? intensity.toFixed(2) : null,
        label,
        labelDescription: ENVIRONMENTAL_LABELS[label].description
      },

      // Méthodologie
      methodology: {
        standard: 'ADEME Base Carbone 2023',
        scope: includeWellToTank ? 'Well-to-Wheel (WTW)' : 'Tank-to-Wheel (TTW)',
        regulation: 'Article L229-25 Code environnement'
      },

      calculatedAt: new Date()
    };
  }

  /**
   * Obtenir le label environnemental
   */
  function getEnvironmentalLabel(emissionPerKm) {
    for (const [label, config] of Object.entries(ENVIRONMENTAL_LABELS)) {
      if (emissionPerKm <= config.maxEmissions) {
        return label;
      }
    }
    return 'F';
  }

  // ============================================
  // CALCUL POUR ORDRE DE TRANSPORT
  // ============================================

  /**
   * Calculer et enregistrer les émissions pour un ordre de transport
   * @param {string} orderId - ID de l'ordre de transport
   * @returns {Object} Résultat enregistré
   */
  async function calculateForOrder(orderId) {
    const db = getDb();
    const ordersCollection = db.collection('transport_orders');
    const emissionsCollection = db.collection('carbon_emissions');

    // Récupérer l'ordre de transport
    const order = await ordersCollection.findOne({ _id: new ObjectId(orderId) });
    if (!order) {
      throw new Error('Transport order not found');
    }

    // Extraire les paramètres
    const params = {
      vehicleType: mapVehicleType(order.vehicleType),
      fuelType: order.fuelType || 'diesel',
      distance: order.distance || order.estimatedDistance,
      loadFactor: order.loadFactor || 0.75,
      cargoType: mapCargoType(order.cargoType || order.goodsType),
      routeType: order.routeType || 'mixed',
      returnEmpty: order.returnEmpty || false,
      cargoWeight: order.weight || order.cargoWeight
    };

    // Calculer les émissions
    const result = calculateEmissions(params);

    // Enregistrer dans la base
    const emissionRecord = {
      _id: new ObjectId(),
      orderId: new ObjectId(orderId),
      industrielId: order.industrielId,
      carrierId: order.carrierId,
      ...result,
      createdAt: new Date()
    };

    await emissionsCollection.insertOne(emissionRecord);

    // Mettre à jour l'ordre avec le résumé des émissions
    await ordersCollection.updateOne(
      { _id: new ObjectId(orderId) },
      {
        $set: {
          carbonFootprint: {
            totalKg: parseFloat(result.emissionsKg.total),
            label: result.metrics.label,
            calculatedAt: result.calculatedAt
          }
        }
      }
    );

    return emissionRecord;
  }

  /**
   * Mapper le type de véhicule
   */
  function mapVehicleType(type) {
    const mapping = {
      'semi': 'articulated_40t',
      'semi-remorque': 'articulated_40t',
      'articulated': 'articulated_40t',
      'porteur_19t': 'rigid_19t',
      'rigid_19t': 'rigid_19t',
      'porteur_12t': 'rigid_12t',
      'rigid_12t': 'rigid_12t',
      'porteur': 'rigid_19t',
      'van': 'van_3_5t',
      'vl': 'van_3_5t',
      'utilitaire': 'van_3_5t'
    };
    return mapping[type?.toLowerCase()] || 'articulated_40t';
  }

  /**
   * Mapper le type de cargo
   */
  function mapCargoType(type) {
    const mapping = {
      'general': 'general',
      'frigo': 'refrigerated',
      'refrigerated': 'refrigerated',
      'cold': 'refrigerated',
      'adr': 'hazardous',
      'dangerous': 'hazardous',
      'hazardous': 'hazardous',
      'bulk': 'bulk',
      'vrac': 'bulk',
      'livestock': 'livestock',
      'animaux': 'livestock'
    };
    return mapping[type?.toLowerCase()] || 'general';
  }

  // ============================================
  // RAPPORTS
  // ============================================

  /**
   * Générer un rapport d'émissions pour une période
   * @param {string} industrielId - ID de l'industriel
   * @param {Date} startDate - Date de début
   * @param {Date} endDate - Date de fin
   */
  async function generateEmissionsReport(industrielId, startDate, endDate) {
    const db = getDb();
    const collection = db.collection('carbon_emissions');

    const emissions = await collection.find({
      industrielId: new ObjectId(industrielId),
      createdAt: { $gte: startDate, $lte: endDate }
    }).toArray();

    // Calculer les totaux
    const totals = {
      totalEmissionsKg: 0,
      totalDistance: 0,
      numberOfTransports: emissions.length,
      byFuelType: {},
      byVehicleType: {},
      byLabel: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 }
    };

    emissions.forEach(e => {
      totals.totalEmissionsKg += parseFloat(e.emissionsKg?.total || 0);
      totals.totalDistance += e.input?.distance || 0;

      // Par type de carburant
      const fuel = e.input?.fuelType || 'diesel';
      if (!totals.byFuelType[fuel]) {
        totals.byFuelType[fuel] = { count: 0, emissionsKg: 0 };
      }
      totals.byFuelType[fuel].count++;
      totals.byFuelType[fuel].emissionsKg += parseFloat(e.emissionsKg?.total || 0);

      // Par type de véhicule
      const vehicle = e.input?.vehicleType || 'unknown';
      if (!totals.byVehicleType[vehicle]) {
        totals.byVehicleType[vehicle] = { count: 0, emissionsKg: 0 };
      }
      totals.byVehicleType[vehicle].count++;
      totals.byVehicleType[vehicle].emissionsKg += parseFloat(e.emissionsKg?.total || 0);

      // Par label
      const label = e.metrics?.label || 'F';
      totals.byLabel[label]++;
    });

    // Calculer les moyennes et métriques
    const averageEmissionPerKm = totals.totalDistance > 0
      ? (totals.totalEmissionsKg * 1000 / totals.totalDistance).toFixed(2)
      : 0;

    // Équivalences
    const equivalences = {
      // 1 arbre absorbe ~25kg CO2/an
      treesEquivalent: Math.round(totals.totalEmissionsKg / 25),
      // 1 voiture émet ~4.6t CO2/an
      carsEquivalent: (totals.totalEmissionsKg / 4600).toFixed(2),
      // 1 vol Paris-NY émet ~1t CO2
      flightsEquivalent: (totals.totalEmissionsKg / 1000).toFixed(2)
    };

    return {
      industrielId,
      period: { start: startDate, end: endDate },
      summary: {
        totalEmissionsKg: totals.totalEmissionsKg.toFixed(2),
        totalEmissionsTons: (totals.totalEmissionsKg / 1000).toFixed(3),
        totalDistanceKm: totals.totalDistance,
        numberOfTransports: totals.numberOfTransports,
        averageEmissionPerKm: `${averageEmissionPerKm} gCO2/km`
      },
      breakdown: {
        byFuelType: totals.byFuelType,
        byVehicleType: totals.byVehicleType,
        byLabel: totals.byLabel
      },
      equivalences,
      recommendations: generateRecommendations(totals),
      methodology: {
        standard: 'ADEME Base Carbone 2023',
        regulation: 'Article L229-25 Code environnement, Décret 2022-1336'
      },
      generatedAt: new Date()
    };
  }

  /**
   * Générer des recommandations de réduction
   */
  function generateRecommendations(totals) {
    const recommendations = [];

    // Analyser les types de carburant
    const dieselShare = totals.byFuelType.diesel
      ? (totals.byFuelType.diesel.emissionsKg / totals.totalEmissionsKg) * 100
      : 0;

    if (dieselShare > 80) {
      recommendations.push({
        type: 'FUEL_TRANSITION',
        priority: 'high',
        impact: '15-30% reduction',
        description: 'Transition vers des carburants alternatifs (GNL, électrique) pour réduire les émissions',
        potentialSavingsKg: (totals.totalEmissionsKg * 0.2).toFixed(0)
      });
    }

    // Analyser les labels
    const poorLabels = totals.byLabel.E + totals.byLabel.F;
    const totalTransports = totals.numberOfTransports;

    if (poorLabels > totalTransports * 0.3) {
      recommendations.push({
        type: 'FLEET_OPTIMIZATION',
        priority: 'medium',
        impact: '10-20% reduction',
        description: 'Optimiser le chargement et utiliser des véhicules adaptés au tonnage',
        potentialSavingsKg: (totals.totalEmissionsKg * 0.15).toFixed(0)
      });
    }

    // Recommandation systématique
    recommendations.push({
      type: 'ROUTE_OPTIMIZATION',
      priority: 'medium',
      impact: '5-10% reduction',
      description: 'Optimiser les itinéraires et regrouper les livraisons',
      potentialSavingsKg: (totals.totalEmissionsKg * 0.07).toFixed(0)
    });

    return recommendations;
  }

  // ============================================
  // COMPARAISON ET BENCHMARK
  // ============================================

  /**
   * Comparer différentes options de transport
   * @param {Array} options - Options à comparer
   */
  function compareOptions(options) {
    const results = options.map(opt => ({
      option: opt.name || 'Option',
      ...calculateEmissions(opt)
    }));

    // Trier par émissions totales
    results.sort((a, b) => a.emissions.total - b.emissions.total);

    // Calculer les économies potentielles
    const baseline = results[results.length - 1].emissions.total;
    results.forEach(r => {
      r.savingsVsWorst = {
        grams: baseline - r.emissions.total,
        percent: ((baseline - r.emissions.total) / baseline * 100).toFixed(1)
      };
    });

    return {
      bestOption: results[0].option,
      worstOption: results[results.length - 1].option,
      potentialSavings: {
        grams: baseline - results[0].emissions.total,
        percent: ((baseline - results[0].emissions.total) / baseline * 100).toFixed(1)
      },
      options: results
    };
  }

  // ============================================
  // RETURN SERVICE
  // ============================================

  return {
    // Configuration
    EMISSION_FACTORS,
    ENVIRONMENTAL_LABELS,

    // Calcul
    calculateEmissions,
    calculateForOrder,
    getEnvironmentalLabel,

    // Rapports
    generateEmissionsReport,

    // Comparaison
    compareOptions
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  EMISSION_FACTORS,
  ENVIRONMENTAL_LABELS,
  createCarbonFootprintService
};
