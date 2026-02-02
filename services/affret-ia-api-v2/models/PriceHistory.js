/**
 * Modèle PriceHistory - Historique des prix de transport
 * Utilisé pour référenciel de négociation basé sur prix marché
 */

const mongoose = require('mongoose');

const priceHistorySchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    index: true
  },

  carrierId: {
    type: String,
    required: true,
    index: true
  },

  carrierName: {
    type: String,
    required: true
  },

  // Route
  route: {
    from: {
      city: String,
      postalCode: { type: String, required: true, index: true }
    },
    to: {
      city: String,
      postalCode: { type: String, required: true, index: true }
    }
  },

  // Prix
  price: {
    proposed: { type: Number, required: true }, // Prix initialement proposé
    final: { type: Number, required: true },    // Prix final après négociation
    marketAverage: Number,                      // Prix moyen du marché au moment de la transaction
    currency: { type: String, default: 'EUR' }
  },

  // Détails transport
  transport: {
    vehicleType: {
      type: String,
      enum: ['VUL', '12T', '19T', 'SEMI', 'PORTEUR', 'OTHER'],
      required: true
    },
    weight: Number,        // kg
    volume: Number,        // m3
    palettes: Number,
    distance: Number       // km
  },

  // Négociation
  negotiation: {
    rounds: { type: Number, default: 0 },
    method: {
      type: String,
      enum: ['auto', 'manual', 'direct'],
      default: 'auto'
    },
    deviation: Number  // % d'écart par rapport au prix moyen
  },

  // Données Dashdoc
  dashdocImport: {
    imported: { type: Boolean, default: false },
    transportId: String,
    importedAt: Date,
    source: {
      type: String,
      enum: ['dashdoc', 'manual', 'api'],
      default: 'api'
    }
  },

  // Métadonnées
  organizationId: {
    type: String,
    required: true,
    index: true
  },

  status: {
    type: String,
    enum: ['completed', 'cancelled', 'pending'],
    default: 'completed'
  },

  completedAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Index composites pour recherches optimisées
priceHistorySchema.index({ 'route.from.postalCode': 1, 'route.to.postalCode': 1, completedAt: -1 });
priceHistorySchema.index({ organizationId: 1, completedAt: -1 });
priceHistorySchema.index({ carrierId: 1, completedAt: -1 });
priceHistorySchema.index({ 'transport.vehicleType': 1, completedAt: -1 });

// Méthodes statiques

/**
 * Récupérer l'historique des prix pour une ligne
 */
priceHistorySchema.statics.getRouteHistory = async function(fromPostalCode, toPostalCode, options = {}) {
  const {
    period = 'last_6_months',
    vehicleType = null,
    organizationId = null,
    limit = 100
  } = options;

  // Calculer date de début selon période
  const startDate = new Date();
  switch (period) {
    case 'last_month':
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case 'last_3_months':
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case 'last_6_months':
      startDate.setMonth(startDate.getMonth() - 6);
      break;
    case 'last_year':
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    default:
      startDate.setMonth(startDate.getMonth() - 6);
  }

  const query = {
    'route.from.postalCode': fromPostalCode,
    'route.to.postalCode': toPostalCode,
    status: 'completed',
    completedAt: { $gte: startDate }
  };

  if (vehicleType) {
    query['transport.vehicleType'] = vehicleType;
  }

  if (organizationId) {
    query.organizationId = organizationId;
  }

  return this.find(query)
    .sort({ completedAt: -1 })
    .limit(limit)
    .lean();
};

/**
 * Calculer le prix moyen pour une ligne
 */
priceHistorySchema.statics.getAveragePrice = async function(fromPostalCode, toPostalCode, options = {}) {
  const history = await this.getRouteHistory(fromPostalCode, toPostalCode, options);

  if (history.length === 0) {
    return {
      averagePrice: 0,
      count: 0,
      minPrice: 0,
      maxPrice: 0,
      stdDeviation: 0
    };
  }

  const prices = history.map(h => h.price.final);
  const sum = prices.reduce((acc, price) => acc + price, 0);
  const avg = sum / prices.length;

  // Écart-type
  const variance = prices.reduce((acc, price) => acc + Math.pow(price - avg, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);

  return {
    averagePrice: Math.round(avg),
    count: history.length,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    stdDeviation: Math.round(stdDev),
    history: history.slice(0, 10) // Dernières 10 transactions
  };
};

/**
 * Obtenir les transporteurs et leurs prix moyens pour une ligne
 */
priceHistorySchema.statics.getCarrierAverages = async function(fromPostalCode, toPostalCode, options = {}) {
  const history = await this.getRouteHistory(fromPostalCode, toPostalCode, options);

  // Grouper par transporteur
  const carrierStats = {};

  history.forEach(record => {
    if (!carrierStats[record.carrierId]) {
      carrierStats[record.carrierId] = {
        carrierId: record.carrierId,
        carrierName: record.carrierName,
        prices: [],
        totalTransports: 0
      };
    }

    carrierStats[record.carrierId].prices.push(record.price.final);
    carrierStats[record.carrierId].totalTransports++;
  });

  // Calculer moyennes
  return Object.values(carrierStats).map(carrier => {
    const avg = carrier.prices.reduce((a, b) => a + b, 0) / carrier.prices.length;
    return {
      carrierId: carrier.carrierId,
      carrierName: carrier.carrierName,
      avgPrice: Math.round(avg),
      totalTransports: carrier.totalTransports,
      minPrice: Math.min(...carrier.prices),
      maxPrice: Math.max(...carrier.prices)
    };
  }).sort((a, b) => a.avgPrice - b.avgPrice);
};

/**
 * Enregistrer un nouveau prix
 */
priceHistorySchema.statics.recordPrice = async function(data) {
  const record = new this({
    orderId: data.orderId,
    carrierId: data.carrierId,
    carrierName: data.carrierName,
    route: {
      from: {
        city: data.route.fromCity,
        postalCode: data.route.from
      },
      to: {
        city: data.route.toCity,
        postalCode: data.route.to
      }
    },
    price: {
      proposed: data.proposedPrice || data.finalPrice,
      final: data.finalPrice,
      marketAverage: data.marketAverage || 0
    },
    transport: {
      vehicleType: data.vehicleType,
      weight: data.weight,
      volume: data.volume,
      palettes: data.palettes,
      distance: data.distance
    },
    negotiation: {
      rounds: data.negotiationRounds || 0,
      method: data.negotiationMethod || 'auto',
      deviation: data.marketAverage ?
        ((data.finalPrice - data.marketAverage) / data.marketAverage * 100) : 0
    },
    organizationId: data.organizationId,
    status: data.status || 'completed',
    completedAt: data.completedAt || new Date()
  });

  await record.save();
  return record;
};

module.exports = mongoose.model('PriceHistory', priceHistorySchema);
