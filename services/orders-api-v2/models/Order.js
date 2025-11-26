/**
 * Modèle MongoDB pour les commandes de transport
 */

const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  name: { type: String, required: true },
  street: { type: String, required: true },
  city: { type: String, required: true },
  postalCode: { type: String, required: true },
  country: { type: String, required: true, default: 'France' },
  contact: {
    name: String,
    phone: String,
    email: String
  },
  coordinates: {
    latitude: Number,
    longitude: Number
  },
  accessInstructions: String
});

const orderSchema = new mongoose.Schema({
  // Identifiants
  orderNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  externalReference: {
    type: String,
    index: true
  },

  // Organisation
  organizationId: {
    type: String,
    required: true,
    index: true
  },
  createdBy: {
    type: String,
    required: true
  },

  // Statut
  status: {
    type: String,
    enum: [
      'draft',
      'pending',
      'lane_analysis',
      'dispatch_chain_created',
      'sent_to_carrier',
      'accepted',
      'refused',
      'in_transit',
      'pickup_completed',
      'delivery_in_progress',
      'delivered',
      'cancelled',
      'closed'
    ],
    default: 'pending',
    index: true
  },

  // Adresses
  pickup: {
    type: addressSchema,
    required: true
  },
  delivery: {
    type: addressSchema,
    required: true
  },

  // Dates et horaires
  pickupDate: {
    type: Date,
    required: true,
    index: true
  },
  pickupTimeSlot: {
    start: String,
    end: String
  },
  deliveryDate: {
    type: Date,
    required: true,
    index: true
  },
  deliveryTimeSlot: {
    start: String,
    end: String
  },

  // Marchandise
  cargo: {
    type: {
      type: String,
      enum: ['palette', 'colis', 'vrac', 'container', 'autre'],
      required: true
    },
    quantity: {
      type: Number,
      required: true
    },
    weight: {
      value: Number,
      unit: { type: String, default: 'kg' }
    },
    volume: {
      value: Number,
      unit: { type: String, default: 'm3' }
    },
    description: String,
    palletType: String,
    stackable: { type: Boolean, default: true },
    hazardous: { type: Boolean, default: false },
    hazardousClass: String,
    temperature: {
      min: Number,
      max: Number,
      unit: { type: String, default: '°C' }
    }
  },

  // Type de transport
  transportType: {
    type: String,
    enum: ['express', 'standard', 'economy', 'scheduled'],
    default: 'standard'
  },
  vehicleType: {
    type: String,
    enum: ['VUL', '12T', '19T', 'semi', 'autre']
  },

  // Services additionnels
  services: {
    tailgate: { type: Boolean, default: false },
    palletJack: { type: Boolean, default: false },
    insurance: { type: Boolean, default: false },
    insuranceValue: Number,
    adr: { type: Boolean, default: false },
    temperature_controlled: { type: Boolean, default: false }
  },

  // Instructions
  pickupInstructions: String,
  deliveryInstructions: String,
  specialInstructions: String,

  // Prix
  pricing: {
    estimated: Number,
    final: Number,
    currency: { type: String, default: 'EUR' },
    breakdown: {
      base: Number,
      fuel: Number,
      services: Number,
      taxes: Number
    }
  },

  // Lane matching
  laneId: {
    type: String,
    index: true
  },
  laneScore: Number,

  // Dispatch chain
  dispatchChain: [{
    carrierId: String,
    carrierName: String,
    priority: Number,
    score: Number,
    price: Number,
    sentAt: Date,
    respondedAt: Date,
    response: {
      type: String,
      enum: ['accepted', 'refused', 'timeout', 'negotiation']
    },
    refusalReason: String,
    negotiationPrice: Number
  }],

  // Transporteur assigné
  assignedCarrier: {
    carrierId: String,
    carrierName: String,
    driverName: String,
    driverPhone: String,
    vehiclePlate: String,
    acceptedAt: Date,
    acceptedPrice: Number
  },

  // Tracking
  tracking: {
    isActive: { type: Boolean, default: false },
    deviceId: String,
    currentLocation: {
      latitude: Number,
      longitude: Number,
      timestamp: Date
    },
    eta: {
      pickup: Date,
      delivery: Date
    },
    events: [{
      type: String,
      timestamp: Date,
      location: {
        latitude: Number,
        longitude: Number
      },
      description: String
    }]
  },

  // Rendez-vous
  appointments: {
    pickup: {
      requested: Date,
      proposed: Date,
      confirmed: Date,
      status: {
        type: String,
        enum: ['pending', 'proposed', 'confirmed', 'cancelled']
      }
    },
    delivery: {
      requested: Date,
      proposed: Date,
      confirmed: Date,
      status: {
        type: String,
        enum: ['pending', 'proposed', 'confirmed', 'cancelled']
      }
    }
  },

  // Documents
  documents: [{
    type: {
      type: String,
      enum: ['CMR', 'BL', 'POD', 'invoice', 'other']
    },
    url: String,
    uploadedAt: Date,
    uploadedBy: String,
    ocrData: mongoose.Schema.Types.Mixed,
    validated: { type: Boolean, default: false }
  }],

  // Incidents
  incidents: [{
    type: {
      type: String,
      enum: ['delay', 'damage', 'lost', 'refused_delivery', 'other']
    },
    reportedAt: Date,
    reportedBy: String,
    description: String,
    resolved: { type: Boolean, default: false },
    resolvedAt: Date,
    resolution: String
  }],

  // Template (pour commandes récurrentes)
  isTemplate: { type: Boolean, default: false },
  templateName: String,
  recurrence: {
    enabled: { type: Boolean, default: false },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly']
    },
    dayOfWeek: Number,
    dayOfMonth: Number,
    nextScheduledDate: Date
  },

  // Métadonnées
  metadata: {
    importSource: String,
    importedAt: Date,
    duplicateOf: String,
    tags: [String],
    customFields: mongoose.Schema.Types.Mixed
  }

}, {
  timestamps: true
});

// Index composites
orderSchema.index({ organizationId: 1, status: 1 });
orderSchema.index({ organizationId: 1, pickupDate: 1 });
orderSchema.index({ organizationId: 1, createdAt: -1 });
orderSchema.index({ 'assignedCarrier.carrierId': 1 });
orderSchema.index({ isTemplate: 1 });

// Méthodes d'instance
orderSchema.methods.toSafeObject = function() {
  const obj = this.toObject();
  return obj;
};

// Méthodes statiques
orderSchema.statics.findByOrganization = function(organizationId, filters = {}) {
  return this.find({ organizationId, ...filters });
};

orderSchema.statics.findActiveOrders = function(organizationId) {
  return this.find({
    organizationId,
    status: { $in: ['pending', 'accepted', 'in_transit', 'pickup_completed'] }
  }).sort({ pickupDate: 1 });
};

orderSchema.statics.generateOrderNumber = async function() {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');

  // Trouver le dernier numéro de commande du mois
  const prefix = `ORD${year}${month}`;
  const lastOrder = await this.findOne({
    orderNumber: new RegExp(`^${prefix}`)
  }).sort({ orderNumber: -1 });

  let sequence = 1;
  if (lastOrder) {
    const lastSequence = parseInt(lastOrder.orderNumber.slice(-4));
    sequence = lastSequence + 1;
  }

  return `${prefix}${sequence.toString().padStart(4, '0')}`;
};

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
