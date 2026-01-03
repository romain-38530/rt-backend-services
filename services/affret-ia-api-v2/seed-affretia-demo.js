/**
 * Script de seed pour AFFRET.IA v2
 * Cree des sessions de demo avec propositions de transporteurs
 *
 * Usage: node seed-affretia-demo.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Configuration MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-affretia?retryWrites=true&w=majority&appName=StagingRT';

// Schemas inline (pour execution standalone)
const affretSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  orderId: { type: String, required: true, index: true },
  organizationId: { type: String, required: true, index: true },
  trigger: {
    type: { type: String, enum: ['auto_failure', 'technical_incapacity', 'manual'], required: true },
    reason: String,
    triggeredBy: String,
    triggeredAt: { type: Date, default: Date.now }
  },
  status: { type: String, enum: ['analyzing', 'shortlist_created', 'broadcasting', 'awaiting_responses', 'negotiating', 'selecting', 'assigned', 'failed', 'cancelled'], default: 'analyzing', index: true },
  analysis: {
    complexity: { type: Number, min: 0, max: 100 },
    constraints: [String],
    estimatedPrice: Number,
    suggestedCarriers: Number,
    analyzedAt: Date,
    criteria: { distance: Number, weight: Number, volume: Number, vehicleType: String, specialRequirements: [String] }
  },
  shortlist: [{ carrierId: String, carrierName: String, matchScore: Number, estimatedPrice: Number, capacity: Boolean, distance: Number, reason: String, contactEmail: String, contactPhone: String }],
  broadcast: {
    channels: [{ type: { type: String, enum: ['email', 'bourse', 'push'] }, sentAt: Date, recipients: Number, status: String, messageId: String }],
    totalRecipients: Number, startedAt: Date, completedAt: Date, campaignId: String
  },
  proposalsReceived: { type: Number, default: 0 },
  proposalsAccepted: { type: Number, default: 0 },
  proposalsRejected: { type: Number, default: 0 },
  proposalsNegotiated: { type: Number, default: 0 },
  proposalsTimeout: { type: Number, default: 0 },
  selection: { carrierId: String, carrierName: String, proposalId: String, finalPrice: Number, selectionReason: String, priceScore: Number, qualityScore: Number, overallScore: Number, selectedAt: Date, selectedBy: { type: String, enum: ['ai', 'manual'] }, userId: String },
  timeline: [{ event: String, timestamp: { type: Date, default: Date.now }, data: mongoose.Schema.Types.Mixed, userId: String }],
  metrics: { totalDuration: Number, analysisTime: Number, broadcastTime: Number, responseTime: Number, selectionTime: Number, avgResponseTime: Number },
  negotiationSettings: { maxPriceIncrease: { type: Number, default: 15 }, autoAcceptThreshold: { type: Number, default: 0 }, timeout: { type: Number, default: 24 } },
  notes: String,
  cancelledReason: String,
  failureReason: String
}, { timestamps: true });

const carrierProposalSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  orderId: { type: String, required: true, index: true },
  carrierId: { type: String, required: true, index: true },
  carrierName: String,
  proposedPrice: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'EUR' },
  priceBreakdown: { base: Number, fuel: Number, services: Number, taxes: Number, discount: Number },
  vehicleType: String,
  vehiclePlate: String,
  vehicleCapacity: { pallets: Number, weight: Number, volume: Number },
  driverName: String,
  driverPhone: String,
  driverEmail: String,
  estimatedPickupDate: Date,
  estimatedPickupTime: String,
  estimatedDeliveryDate: Date,
  estimatedDeliveryTime: String,
  services: { tailgate: Boolean, palletJack: Boolean, insurance: Boolean, insuranceValue: Number, adr: Boolean, temperatureControlled: Boolean, tracking: { type: String, enum: ['basic', 'intermediate', 'premium'] } },
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'negotiating', 'timeout', 'withdrawn'], default: 'pending', index: true },
  scores: { price: { type: Number, min: 0, max: 100 }, quality: { type: Number, min: 0, max: 100 }, overall: { type: Number, min: 0, max: 100 }, details: { historicalPerformance: Number, punctuality: Number, acceptanceRate: Number, reactivity: Number, capacity: Number } },
  submittedAt: { type: Date, default: Date.now, index: true },
  respondedAt: Date,
  response: { status: String, reason: String, respondedBy: String, respondedByName: String },
  negotiationHistory: [{ proposedPrice: Number, counterPrice: Number, proposedBy: { type: String, enum: ['carrier', 'ai', 'user'] }, timestamp: { type: Date, default: Date.now }, message: String, status: { type: String, enum: ['pending', 'accepted', 'rejected', 'countered'] } }],
  currentNegotiationRound: { type: Number, default: 0 },
  maxNegotiationRounds: { type: Number, default: 3 },
  vigilanceCheck: { kbis: { valid: Boolean, checkedAt: Date, expiryDate: Date, details: String }, insurance: { valid: Boolean, checkedAt: Date, expiryDate: Date, provider: String, policyNumber: String }, license: { valid: Boolean, checkedAt: Date, licenseNumber: String, expiryDate: Date }, blacklist: { clean: Boolean, checkedAt: Date, reason: String }, overall: Boolean },
  source: { type: String, enum: ['email', 'bourse', 'push', 'manual', 'api'], default: 'api' },
  conditions: String,
  validUntil: Date,
  notes: String,
  internalNotes: String
}, { timestamps: true });

// Donnees de demo
const carriers = [
  { id: 'CARRIER-001', name: 'TransExpress France', email: 'contact@transexpress.fr', phone: '+33 1 42 00 11 22', score: 92 },
  { id: 'CARRIER-002', name: 'Europaletttes SARL', email: 'dispatch@europalettes.com', phone: '+33 4 91 22 33 44', score: 88 },
  { id: 'CARRIER-003', name: 'Rapido Transport', email: 'afretement@rapido.fr', phone: '+33 3 88 44 55 66', score: 85 },
  { id: 'CARRIER-004', name: 'LogiFret Express', email: 'logistics@logifret.fr', phone: '+33 2 40 55 66 77', score: 78 },
  { id: 'CARRIER-005', name: 'NordTrans SA', email: 'nord@nordtrans.fr', phone: '+33 3 20 66 77 88', score: 82 },
  { id: 'CARRIER-006', name: 'SudFret Mediterranee', email: 'contact@sudfret.com', phone: '+33 4 93 77 88 99', score: 75 },
  { id: 'CARRIER-007', name: 'Atlantic Logistics', email: 'atlantic@atlog.fr', phone: '+33 5 56 88 99 00', score: 80 },
  { id: 'CARRIER-008', name: 'Express Alsace', email: 'alsace@expressalsace.fr', phone: '+33 3 89 99 00 11', score: 86 }
];

const orders = [
  { id: 'ORD-2024-DEMO-101', from: 'Paris (75)', to: 'Lyon (69)', weight: 12000, pallets: 24, distance: 465, type: 'standard' },
  { id: 'ORD-2024-DEMO-102', from: 'Marseille (13)', to: 'Bordeaux (33)', weight: 8500, pallets: 18, distance: 645, type: 'frigorifique' },
  { id: 'ORD-2024-DEMO-103', from: 'Lille (59)', to: 'Toulouse (31)', weight: 15000, pallets: 33, distance: 890, type: 'standard' },
  { id: 'ORD-2024-DEMO-104', from: 'Strasbourg (67)', to: 'Nantes (44)', weight: 6000, pallets: 12, distance: 780, type: 'express' },
  { id: 'ORD-2024-DEMO-105', from: 'Nice (06)', to: 'Rennes (35)', weight: 9500, pallets: 20, distance: 1050, type: 'standard' }
];

// Generateur de dates
const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const addHours = (date, hours) => {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
};

// Seed function
async function seedAffretIA() {
  console.log('\n=== AFFRET.IA Demo Seed ===\n');

  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully!\n');

    // Register models
    const AffretSession = mongoose.models.AffretSession || mongoose.model('AffretSession', affretSessionSchema);
    const CarrierProposal = mongoose.models.CarrierProposal || mongoose.model('CarrierProposal', carrierProposalSchema);

    // Clear existing demo data
    console.log('Clearing existing demo data...');
    await AffretSession.deleteMany({ organizationId: { $regex: /^demo-/ } });
    await CarrierProposal.deleteMany({ orderId: { $regex: /^ORD-2024-DEMO/ } });
    console.log('Cleared!\n');

    // Create demo sessions
    const sessions = [];
    const proposals = [];
    const now = new Date();

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      const sessionId = `AFFRET-${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}-${(1001 + i).toString().padStart(4, '0')}`;

      // Determine session status
      const statuses = ['awaiting_responses', 'negotiating', 'assigned', 'selecting', 'broadcasting'];
      const status = statuses[i % statuses.length];

      // Calculate estimated price
      const baseRate = 1.2; // EUR per km
      const weightSurcharge = order.weight > 10000 ? 1.15 : 1;
      const estimatedPrice = Math.round(order.distance * baseRate * weightSurcharge);

      // Create session
      const session = {
        sessionId,
        orderId: order.id,
        organizationId: 'demo-industrie-org',
        trigger: {
          type: i % 3 === 0 ? 'manual' : (i % 3 === 1 ? 'auto_failure' : 'technical_incapacity'),
          reason: `Demo - Transport ${order.from} vers ${order.to}`,
          triggeredBy: 'demo-user',
          triggeredAt: addHours(now, -24 + (i * 4))
        },
        status,
        analysis: {
          complexity: 30 + (i * 10),
          constraints: order.type === 'frigorifique' ? ['Temperature controlee', 'Chaine du froid'] :
                       order.type === 'express' ? ['Delai urgent', 'Express 24h'] : [],
          estimatedPrice,
          suggestedCarriers: 5,
          analyzedAt: addHours(now, -23 + (i * 4)),
          criteria: {
            distance: order.distance,
            weight: order.weight,
            volume: Math.round(order.pallets * 1.2),
            vehicleType: order.pallets > 25 ? 'semi' : 'porteur',
            specialRequirements: order.type !== 'standard' ? [order.type] : []
          }
        },
        shortlist: carriers.slice(0, 5).map((c, idx) => ({
          carrierId: c.id,
          carrierName: c.name,
          matchScore: 95 - (idx * 3),
          estimatedPrice: Math.round(estimatedPrice * (1 + (idx * 0.05))),
          capacity: true,
          distance: 50 + (idx * 20),
          reason: idx === 0 ? 'Meilleur score global' : `Score ${95 - (idx * 3)}%`,
          contactEmail: c.email,
          contactPhone: c.phone
        })),
        broadcast: {
          channels: [
            { type: 'email', sentAt: addHours(now, -22 + (i * 4)), recipients: 5, status: 'sent', messageId: `MSG-EMAIL-${sessionId}` },
            { type: 'bourse', sentAt: addHours(now, -22 + (i * 4)), recipients: 50, status: 'published', messageId: `MSG-BOURSE-${sessionId}` }
          ],
          totalRecipients: 55,
          startedAt: addHours(now, -22 + (i * 4)),
          completedAt: addHours(now, -21.5 + (i * 4)),
          campaignId: `CAMP-${sessionId}`
        },
        proposalsReceived: 3 + (i % 3),
        proposalsAccepted: status === 'assigned' ? 1 : 0,
        proposalsRejected: status === 'assigned' ? 1 + (i % 2) : 0,
        proposalsNegotiated: status === 'negotiating' ? 2 : 0,
        proposalsTimeout: 0,
        timeline: [
          { event: 'session_created', timestamp: addHours(now, -24 + (i * 4)), data: { triggerType: 'manual' } },
          { event: 'analysis_completed', timestamp: addHours(now, -23 + (i * 4)), data: { complexity: 30 + (i * 10) } },
          { event: 'shortlist_generated', timestamp: addHours(now, -22.5 + (i * 4)), data: { count: 5 } },
          { event: 'broadcast_started', timestamp: addHours(now, -22 + (i * 4)), data: { channels: ['email', 'bourse'] } },
          { event: 'broadcast_completed', timestamp: addHours(now, -21.5 + (i * 4)), data: { totalRecipients: 55 } }
        ],
        metrics: {
          totalDuration: status === 'assigned' ? 18 * 3600 * 1000 : null,
          analysisTime: 3 * 60 * 1000,
          broadcastTime: 30 * 60 * 1000,
          responseTime: 2 * 3600 * 1000,
          avgResponseTime: 4 * 3600 * 1000
        },
        negotiationSettings: {
          maxPriceIncrease: 15,
          autoAcceptThreshold: 0,
          timeout: 24
        }
      };

      // Add selection if assigned
      if (status === 'assigned') {
        session.selection = {
          carrierId: carriers[0].id,
          carrierName: carriers[0].name,
          proposalId: `PROP-${sessionId}-001`,
          finalPrice: Math.round(estimatedPrice * 1.05),
          selectionReason: 'Meilleur rapport qualite/prix',
          priceScore: 92,
          qualityScore: 88,
          overallScore: 90,
          selectedAt: addHours(now, -6 + (i * 4)),
          selectedBy: 'ai'
        };
        session.timeline.push({
          event: 'carrier_assigned',
          timestamp: addHours(now, -6 + (i * 4)),
          data: { carrierId: carriers[0].id, carrierName: carriers[0].name }
        });
      }

      sessions.push(session);

      // Create proposals for this session
      const numProposals = 3 + (i % 3);
      for (let j = 0; j < numProposals; j++) {
        const carrier = carriers[j];
        const proposedPrice = Math.round(estimatedPrice * (0.95 + (j * 0.08)));
        const priceScore = Math.max(0, 100 - Math.max(0, ((proposedPrice / estimatedPrice) - 1) * 100 * 2));
        const overallScore = (priceScore * 0.4) + (carrier.score * 0.6);

        const proposal = {
          sessionId,
          orderId: order.id,
          carrierId: carrier.id,
          carrierName: carrier.name,
          proposedPrice,
          currency: 'EUR',
          priceBreakdown: {
            base: Math.round(proposedPrice * 0.7),
            fuel: Math.round(proposedPrice * 0.15),
            services: Math.round(proposedPrice * 0.1),
            taxes: Math.round(proposedPrice * 0.05),
            discount: j === 0 ? Math.round(proposedPrice * 0.02) : 0
          },
          vehicleType: order.pallets > 25 ? 'Semi-remorque' : 'Porteur 19T',
          vehiclePlate: `AB-${100 + j}-CD`,
          vehicleCapacity: {
            pallets: order.pallets > 25 ? 33 : 20,
            weight: order.pallets > 25 ? 25000 : 12000,
            volume: order.pallets > 25 ? 90 : 50
          },
          driverName: ['Jean Dupont', 'Pierre Martin', 'Marc Bernard', 'Paul Durand', 'Luc Moreau'][j],
          driverPhone: `+33 6 ${10 + j}${20 + j} ${30 + j}${40 + j} ${50 + j}${60 + j}`,
          driverEmail: `driver${j+1}@${carrier.name.toLowerCase().replace(/\s+/g, '')}.fr`,
          estimatedPickupDate: addDays(now, 1),
          estimatedPickupTime: `${8 + j}:00`,
          estimatedDeliveryDate: addDays(now, 2),
          estimatedDeliveryTime: `${14 + j}:00`,
          services: {
            tailgate: j === 0,
            palletJack: true,
            insurance: true,
            insuranceValue: 50000,
            adr: false,
            temperatureControlled: order.type === 'frigorifique',
            tracking: ['premium', 'intermediate', 'basic'][j % 3]
          },
          status: status === 'assigned' ? (j === 0 ? 'accepted' : 'rejected') :
                  status === 'negotiating' ? (j < 2 ? 'negotiating' : 'pending') : 'pending',
          scores: {
            price: Math.round(priceScore * 100) / 100,
            quality: carrier.score,
            overall: Math.round(overallScore * 100) / 100,
            details: {
              historicalPerformance: carrier.score,
              punctuality: carrier.score - 2 + (j * 2),
              acceptanceRate: 85 + (j * 3),
              reactivity: 90 - (j * 5),
              capacity: 100
            }
          },
          submittedAt: addHours(now, -20 + (i * 4) + (j * 0.5)),
          source: j === 0 ? 'email' : 'bourse',
          vigilanceCheck: {
            kbis: { valid: true, checkedAt: addHours(now, -20 + (i * 4)), expiryDate: addDays(now, 180) },
            insurance: { valid: true, checkedAt: addHours(now, -20 + (i * 4)), expiryDate: addDays(now, 365), provider: 'AXA', policyNumber: `POL-${1000 + j}` },
            license: { valid: true, checkedAt: addHours(now, -20 + (i * 4)), licenseNumber: `LIC-${2000 + j}`, expiryDate: addDays(now, 730) },
            blacklist: { clean: true, checkedAt: addHours(now, -20 + (i * 4)) },
            overall: true
          },
          validUntil: addDays(now, 3),
          conditions: j === 0 ? 'Prix valable 48h' : null
        };

        // Add negotiation history for negotiating proposals
        if (proposal.status === 'negotiating') {
          proposal.negotiationHistory = [
            {
              proposedPrice: Math.round(proposedPrice * 1.1),
              counterPrice: Math.round(proposedPrice * 1.03),
              proposedBy: 'carrier',
              timestamp: addHours(now, -18 + (i * 4)),
              message: 'Prix initial',
              status: 'countered'
            },
            {
              proposedPrice: Math.round(proposedPrice * 1.03),
              counterPrice: proposedPrice,
              proposedBy: 'ai',
              timestamp: addHours(now, -16 + (i * 4)),
              message: 'Contre-proposition automatique',
              status: 'pending'
            }
          ];
          proposal.currentNegotiationRound = 2;
        }

        // Add response for accepted/rejected
        if (proposal.status === 'accepted') {
          proposal.respondedAt = addHours(now, -6 + (i * 4));
          proposal.response = { status: 'accepted', reason: 'Meilleur rapport qualite/prix', respondedBy: 'ai', respondedByName: 'AFFRET.IA' };
        } else if (proposal.status === 'rejected') {
          proposal.respondedAt = addHours(now, -6 + (i * 4));
          proposal.response = { status: 'rejected', reason: 'Prix trop eleve ou delai non respecte', respondedBy: 'ai', respondedByName: 'AFFRET.IA' };
        }

        proposals.push(proposal);
      }
    }

    // Insert data
    console.log(`Inserting ${sessions.length} demo sessions...`);
    await AffretSession.insertMany(sessions);
    console.log(`Inserted ${sessions.length} sessions!`);

    console.log(`Inserting ${proposals.length} demo proposals...`);
    await CarrierProposal.insertMany(proposals);
    console.log(`Inserted ${proposals.length} proposals!\n`);

    // Summary
    console.log('=== Seed Summary ===');
    console.log(`Sessions created: ${sessions.length}`);
    console.log(`Proposals created: ${proposals.length}`);
    console.log(`Organization: demo-industrie-org`);
    console.log('\nSession statuses:');
    const statusCounts = {};
    sessions.forEach(s => { statusCounts[s.status] = (statusCounts[s.status] || 0) + 1; });
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  - ${status}: ${count}`);
    });

    console.log('\n=== Seed Complete ===\n');

  } catch (error) {
    console.error('Seed error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run seed
seedAffretIA();
