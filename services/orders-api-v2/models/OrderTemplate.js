/**
 * Modèle pour les templates de commandes récurrentes
 */

const mongoose = require('mongoose');

const orderTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,

  organizationId: {
    type: String,
    required: true,
    index: true
  },
  createdBy: {
    type: String,
    required: true
  },

  // Données du template (même structure qu'une commande)
  templateData: {
    pickup: mongoose.Schema.Types.Mixed,
    delivery: mongoose.Schema.Types.Mixed,
    cargo: mongoose.Schema.Types.Mixed,
    transportType: String,
    vehicleType: String,
    services: mongoose.Schema.Types.Mixed,
    pickupInstructions: String,
    deliveryInstructions: String,
    specialInstructions: String
  },

  // Récurrence
  recurrence: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'manual'],
      default: 'manual'
    },
    dayOfWeek: Number, // 0-6 (dimanche-samedi)
    dayOfMonth: Number, // 1-31
    time: String, // HH:mm
    advanceDays: { type: Number, default: 0 } // Créer la commande X jours à l'avance
  },

  // Planification
  isActive: {
    type: Boolean,
    default: true
  },
  nextExecutionDate: Date,
  lastExecutionDate: Date,

  // Statistiques
  stats: {
    totalCreated: { type: Number, default: 0 },
    lastOrderId: String
  }

}, {
  timestamps: true
});

orderTemplateSchema.index({ organizationId: 1, isActive: 1 });
orderTemplateSchema.index({ nextExecutionDate: 1 });

const OrderTemplate = mongoose.model('OrderTemplate', orderTemplateSchema);

module.exports = OrderTemplate;
