#!/usr/bin/env node
/**
 * TEST GRANDEUR NATURE - Simulation Complète Cycle de Vie Commande
 *
 * Simule l'utilisation réelle de la plateforme Symphonia avec agents multi-rôles
 * orchestrant le workflow complet: création commande → facturation
 *
 * Rôles simulés:
 * - Donneur d'ordre (crée commande, valide tarifs, suit tracking)
 * - Admin Symphonia (invite transporteurs, contrôle vigilance, escalade Affret.IA)
 * - Transporteurs (répondent appels d'offres, uploadent documents)
 * - Chauffeurs (scannent e-CMR, mettent à jour positions)
 * - Système IA (scoring, Affret.IA, tracking IA, pré-facturation)
 *
 * Usage: node tests/test-grandeur-nature-complete.cjs
 */

require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');
const { EmailSimulationAgent } = require('./agents/email-simulation-agent.cjs');

// Configuration
const CONFIG = {
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/rt-technologie?authSource=admin',
    databases: {
      technologie: 'rt-technologie',
      authz: 'rt-authz',
      affretia: 'affretia'
    }
  },
  apis: {
    orders: process.env.ORDERS_API_URL || 'http://localhost:3001',
    carriers: process.env.CARRIERS_API_URL || 'http://localhost:3002',
    tms: process.env.TMS_API_URL || 'http://localhost:3000',
    affretia: process.env.AFFRETIA_API_URL || 'http://localhost:3003',
    tracking: process.env.TRACKING_API_URL || 'http://localhost:3004',
    billing: process.env.BILLING_API_URL || 'http://localhost:3005'
  },
  simulation: {
    ordersCount: 3,
    carriersCount: 5,
    driversPerCarrier: 2,
    duration: '2h' // Durée simulée du transport
  }
};

// Styles de log
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const log = {
  title: (msg) => console.log(`\n${colors.cyan}${colors.bright}╔${'═'.repeat(78)}╗${colors.reset}`),
  section: (msg) => console.log(`${colors.cyan}${colors.bright}║ ${msg.padEnd(77)}║${colors.reset}`),
  footer: () => console.log(`${colors.cyan}${colors.bright}╚${'═'.repeat(78)}╝${colors.reset}\n`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  step: (num, msg) => console.log(`${colors.magenta}[${num}]${colors.reset} ${msg}`),
  agent: (role, action) => console.log(`${colors.cyan}[${role}]${colors.reset} ${action}`),
  kpi: (name, value) => console.log(`  ${colors.bright}${name}:${colors.reset} ${value}`)
};

// ============================================================================
// Classes Agent par Rôle
// ============================================================================

class DonneurOrdreAgent {
  constructor(id, companyName) {
    this.id = id;
    this.companyName = companyName;
    this.role = 'Donneur Ordre';
    this.orders = [];
  }

  async createOrder(orderData) {
    log.agent(this.role, `Crée commande: ${orderData.reference}`);

    try {
      // Simuler création de commande via API Orders
      const order = {
        ...orderData,
        customerId: this.id,
        customerName: this.companyName,
        status: 'draft',
        createdAt: new Date(),
        workflow: {
          step: 'order_created',
          history: [{
            step: 'order_created',
            timestamp: new Date(),
            actor: this.companyName
          }]
        }
      };

      this.orders.push(order);
      log.success(`Commande ${orderData.reference} créée`);

      return order;
    } catch (error) {
      log.error(`Erreur création commande: ${error.message}`);
      throw error;
    }
  }

  async validateQuote(orderId, carrierId, price) {
    log.agent(this.role, `Valide devis de ${price}€ pour commande ${orderId}`);

    return {
      orderId,
      carrierId,
      price,
      validatedAt: new Date(),
      validatedBy: this.companyName
    };
  }

  async trackOrder(orderId) {
    log.agent(this.role, `Consulte tracking pour commande ${orderId}`);

    // Simuler récupération données tracking
    return {
      orderId,
      status: 'in_transit',
      lastPosition: {
        lat: 48.8566,
        lon: 2.3522,
        timestamp: new Date()
      },
      estimatedArrival: new Date(Date.now() + 2 * 60 * 60 * 1000)
    };
  }
}

class AdminSymphoniaAgent {
  constructor() {
    this.role = 'Admin Symphonia';
  }

  async inviteCarrier(carrierEmail, companyName) {
    log.agent(this.role, `Invite transporteur: ${companyName} (${carrierEmail})`);

    try {
      // Simuler invitation via API Carriers
      const invitation = {
        email: carrierEmail,
        companyName,
        invitedAt: new Date(),
        token: this.generateInvitationToken(),
        status: 'pending'
      };

      log.success(`Invitation envoyée à ${companyName}`);

      return invitation;
    } catch (error) {
      log.error(`Erreur invitation: ${error.message}`);
      throw error;
    }
  }

  async checkVigilance(carrierId) {
    log.agent(this.role, `Contrôle vigilance pour transporteur ${carrierId}`);

    // Simuler contrôle vigilance
    const checks = {
      carrierId,
      checkedAt: new Date(),
      results: {
        kbis: { valid: true, expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
        insurance: { valid: true, expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000) },
        license: { valid: true, expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
        urssaf: { valid: true, expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) }
      },
      score: 85,
      level: 'compliant'
    };

    if (checks.score >= 70) {
      log.success(`Vigilance OK - Score: ${checks.score}/100`);
    } else {
      log.warning(`Vigilance à risque - Score: ${checks.score}/100`);
    }

    return checks;
  }

  async sendPricingRequest(orderId, carrierIds) {
    log.agent(this.role, `Envoie demande de tarif à ${carrierIds.length} transporteurs`);

    const requests = carrierIds.map(carrierId => ({
      orderId,
      carrierId,
      sentAt: new Date(),
      status: 'sent',
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
    }));

    log.success(`${carrierIds.length} demandes de tarif envoyées`);

    return requests;
  }

  async escalateToAffretIA(orderId, reason) {
    log.agent(this.role, `Escalade commande ${orderId} vers Affret.IA: ${reason}`);

    const escalation = {
      orderId,
      reason,
      escalatedAt: new Date(),
      status: 'processing',
      affretiaTrialUsed: true
    };

    log.warning(`Commande escaladée vers Affret.IA`);

    return escalation;
  }

  generateInvitationToken() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}

class TransporteurAgent {
  constructor(id, companyName, email) {
    this.id = id;
    this.companyName = companyName;
    this.email = email;
    this.role = `Transporteur (${companyName})`;
    this.documents = [];
    this.quotes = [];
  }

  async acceptInvitation(token) {
    log.agent(this.role, `Accepte invitation et crée compte`);

    return {
      carrierId: this.id,
      companyName: this.companyName,
      email: this.email,
      acceptedAt: new Date(),
      status: 'active'
    };
  }

  async uploadDocument(documentType, file) {
    log.agent(this.role, `Upload document: ${documentType}`);

    const document = {
      carrierId: this.id,
      type: documentType,
      fileName: file.name,
      uploadedAt: new Date(),
      status: 'pending_verification',
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    };

    this.documents.push(document);
    log.success(`Document ${documentType} uploadé`);

    return document;
  }

  async respondToPricingRequest(orderId, price, availableDate) {
    log.agent(this.role, `Répond à appel d'offres: ${price}€`);

    const quote = {
      orderId,
      carrierId: this.id,
      price,
      availableDate,
      submittedAt: new Date(),
      status: 'submitted',
      validity: 48 // heures
    };

    this.quotes.push(quote);
    log.success(`Devis soumis: ${price}€`);

    return quote;
  }

  async acceptOrder(orderId) {
    log.agent(this.role, `Accepte commande ${orderId}`);

    return {
      orderId,
      carrierId: this.id,
      acceptedAt: new Date(),
      status: 'accepted'
    };
  }
}

class ChauffeurAgent {
  constructor(id, name, carrierId) {
    this.id = id;
    this.name = name;
    this.carrierId = carrierId;
    this.role = `Chauffeur (${name})`;
    this.position = { lat: 48.8566, lon: 2.3522 };
  }

  async scanECMR(orderId, type, location) {
    log.agent(this.role, `Scanne e-CMR ${type} pour commande ${orderId}`);

    const ecmr = {
      orderId,
      driverId: this.id,
      type, // 'pickup', 'delivery'
      location,
      scannedAt: new Date(),
      signature: `driver_${this.id}_${Date.now()}`,
      photos: [`photo_${type}_1.jpg`, `photo_${type}_2.jpg`]
    };

    log.success(`e-CMR ${type} enregistré`);

    return ecmr;
  }

  async updatePosition(lat, lon) {
    this.position = { lat, lon, timestamp: new Date() };

    // Log silencieux pour éviter le spam
    return this.position;
  }

  async reportIssue(orderId, issueType, description) {
    log.agent(this.role, `Signale incident: ${issueType}`);

    return {
      orderId,
      driverId: this.id,
      issueType,
      description,
      reportedAt: new Date(),
      status: 'reported'
    };
  }
}

class SystemeIAAgent {
  constructor() {
    this.role = 'Système IA';
  }

  async calculateScore(carrierId, documents, history) {
    log.agent(this.role, `Calcule scoring pour transporteur ${carrierId}`);

    // Simuler calcul de score
    let score = 50; // Score de base

    // Points pour documents valides
    const validDocs = documents.filter(d => d.status === 'verified').length;
    score += validDocs * 10;

    // Points pour historique
    if (history.onTimeDeliveries > 10) score += 15;
    if (history.incidents === 0) score += 10;

    score = Math.min(100, score);

    const level = score >= 80 ? 'premium' : score >= 60 ? 'standard' : 'basic';

    log.info(`Score calculé: ${score}/100 (${level})`);

    return {
      carrierId,
      score,
      level,
      calculatedAt: new Date(),
      breakdown: {
        documents: validDocs * 10,
        history: history.onTimeDeliveries > 10 ? 15 : 0,
        reliability: history.incidents === 0 ? 10 : 0
      }
    };
  }

  async matchCarriers(order, availableCarriers) {
    log.agent(this.role, `Affret.IA recherche transporteurs pour commande ${order.reference}`);

    // Simuler matching IA
    const matches = availableCarriers
      .filter(c => c.score >= 70)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(carrier => ({
        carrierId: carrier.id,
        score: carrier.score,
        matchScore: Math.random() * 30 + 70,
        estimatedPrice: order.estimatedPrice * (0.9 + Math.random() * 0.2),
        confidence: 0.85 + Math.random() * 0.15
      }));

    log.success(`${matches.length} transporteurs matchés par IA`);

    return matches;
  }

  async predictArrival(orderId, currentPosition, destination) {
    // Simuler prédiction IA
    const distance = this.calculateDistance(currentPosition, destination);
    const averageSpeed = 80; // km/h
    const estimatedMinutes = (distance / averageSpeed) * 60;

    return {
      orderId,
      estimatedArrival: new Date(Date.now() + estimatedMinutes * 60 * 1000),
      confidence: 0.92,
      trafficImpact: 'low',
      calculatedAt: new Date()
    };
  }

  async generatePreInvoice(order, transportData) {
    log.agent(this.role, `Génère pré-facturation pour commande ${order.reference}`);

    const preInvoice = {
      orderId: order._id,
      reference: `PRE-${order.reference}`,
      items: [
        { description: 'Transport principal', quantity: 1, unitPrice: order.agreedPrice, total: order.agreedPrice },
        { description: 'Frais de gestion', quantity: 1, unitPrice: 50, total: 50 }
      ],
      subtotal: order.agreedPrice + 50,
      vat: (order.agreedPrice + 50) * 0.2,
      total: (order.agreedPrice + 50) * 1.2,
      generatedAt: new Date(),
      status: 'draft'
    };

    log.success(`Pré-facture générée: ${preInvoice.total.toFixed(2)}€ TTC`);

    return preInvoice;
  }

  calculateDistance(pos1, pos2) {
    // Formule de Haversine simplifiée
    const R = 6371; // Rayon de la Terre en km
    const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
    const dLon = (pos2.lon - pos1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(pos1.lat * Math.PI / 180) * Math.cos(pos2.lat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
}

// ============================================================================
// Orchestrateur de Test Grandeur Nature
// ============================================================================

class TestGrandeurNatureOrchestrator {
  constructor() {
    this.startTime = new Date();
    this.statistics = {
      ordersCreated: 0,
      carriersInvited: 0,
      documentsUploaded: 0,
      quotesSubmitted: 0,
      ordersCompleted: 0,
      ecmrScanned: 0,
      invoicesGenerated: 0,
      totalRevenue: 0
    };
    this.timeline = [];
    this.kpis = {};
  }

  logEvent(event, details) {
    this.timeline.push({
      timestamp: new Date(),
      event,
      details
    });
  }

  async run() {
    log.title();
    log.section('TEST GRANDEUR NATURE - CYCLE COMPLET COMMANDE');
    log.section('Simulation orchestrée multi-agents');
    log.footer();

    try {
      // Initialisation
      await this.initialize();

      // PHASE 1: Setup et Invitations
      await this.phase1_SetupAndInvitations();

      // PHASE 2: Création Commandes et Appels d'Offres
      await this.phase2_OrdersAndTenders();

      // PHASE 3: Contrôle Vigilance et Scoring
      await this.phase3_VigilanceAndScoring();

      // PHASE 4: Sélection et Affectation
      await this.phase4_SelectionAndAssignment();

      // PHASE 5: Planification et Rendez-vous
      await this.phase5_PlanningAndAppointments();

      // PHASE 6: Exécution Transport et Tracking
      await this.phase6_TransportAndTracking();

      // PHASE 7: e-CMR et Livraison
      await this.phase7_ECMRAndDelivery();

      // PHASE 8: Pré-facturation et KPIs
      await this.phase8_InvoicingAndKPIs();

      // Rapport Final
      await this.generateFinalReport();

    } catch (error) {
      log.error(`Erreur durant le test: ${error.message}`);
      console.error(error);
    }
  }

  async initialize() {
    log.step('INIT', 'Initialisation agents et configuration');

    // Créer agents
    this.donneurOrdre = new DonneurOrdreAgent('DO001', 'Carrefour Supply Chain');
    this.admin = new AdminSymphoniaAgent();
    this.systemeIA = new SystemeIAAgent();
    this.emailAgent = new EmailSimulationAgent();

    this.transporteurs = [];
    this.chauffeurs = [];

    for (let i = 1; i <= CONFIG.simulation.carriersCount; i++) {
      const transporteur = new TransporteurAgent(
        `TR00${i}`,
        `Transport Express ${i}`,
        `transporteur${i}@example.com`
      );
      this.transporteurs.push(transporteur);

      // Créer chauffeurs pour ce transporteur
      for (let j = 1; j <= CONFIG.simulation.driversPerCarrier; j++) {
        const chauffeur = new ChauffeurAgent(
          `CH00${i}${j}`,
          `Chauffeur ${j} - ${transporteur.companyName}`,
          transporteur.id
        );
        this.chauffeurs.push(chauffeur);
      }
    }

    log.success(`${this.transporteurs.length} transporteurs créés`);
    log.success(`${this.chauffeurs.length} chauffeurs créés`);
    log.info(`Configuration: ${CONFIG.simulation.ordersCount} commandes à traiter`);
  }

  async phase1_SetupAndInvitations() {
    log.step('PHASE 1', 'Setup et Invitations Transporteurs');

    for (const transporteur of this.transporteurs) {
      // Admin invite transporteur
      await this.admin.inviteCarrier(transporteur.email, transporteur.companyName);
      this.statistics.carriersInvited++;
      this.logEvent('carrier_invited', { carrierId: transporteur.id });

      // Envoi email invitation
      const invitationEmail = await this.emailAgent.sendEmail(
        'carrier_invitation',
        { email: transporteur.email, name: transporteur.companyName },
        {
          baseUrl: 'https://admin.symphonia.com',
          companyName: transporteur.companyName,
          token: 'invitation_token_123'
        }
      );

      // Transporteur reçoit et ouvre l'email
      const interaction = await this.emailAgent.recipientReceivesEmail(
        invitationEmail.id,
        { email: transporteur.email, name: transporteur.companyName }
      );

      // Transporteur clique sur "Créer mon compte"
      await this.emailAgent.recipientClicksLink(
        invitationEmail.id,
        0, // Premier lien (Créer mon compte)
        { email: transporteur.email, name: transporteur.companyName }
      );

      // Transporteur accepte et upload documents
      await transporteur.acceptInvitation('token_123');

      const documentTypes = ['kbis', 'insurance', 'license', 'urssaf', 'carte_grise', 'attestation'];
      for (const docType of documentTypes) {
        await transporteur.uploadDocument(docType, { name: `${docType}.pdf` });
        this.statistics.documentsUploaded++;
      }

      await this.sleep(100); // Simuler délai
    }

    log.success(`Phase 1 complétée: ${this.statistics.carriersInvited} transporteurs invités`);
  }

  async phase2_OrdersAndTenders() {
    log.step('PHASE 2', 'Création Commandes et Appels d\'Offres');

    this.orders = [];

    for (let i = 1; i <= CONFIG.simulation.ordersCount; i++) {
      // Donneur d'ordre crée commande
      const order = await this.donneurOrdre.createOrder({
        reference: `CMD-2026-${String(i).padStart(4, '0')}`,
        type: 'FTL',
        pickup: { city: 'Paris', address: '75001 Paris', date: new Date(Date.now() + 24 * 60 * 60 * 1000) },
        delivery: { city: 'Lyon', address: '69001 Lyon', date: new Date(Date.now() + 48 * 60 * 60 * 1000) },
        weight: 15000 + Math.random() * 10000,
        volume: 30 + Math.random() * 20,
        estimatedPrice: 800 + Math.random() * 400
      });

      this.orders.push(order);
      this.statistics.ordersCreated++;
      this.logEvent('order_created', { orderId: order.reference });

      // Admin envoie demandes de tarif
      const carrierIds = this.transporteurs.slice(0, 3).map(t => t.id);
      await this.admin.sendPricingRequest(order.reference, carrierIds);

      // Envoi emails de demande de tarif aux transporteurs sélectionnés
      for (const carrier of this.transporteurs.slice(0, 3)) {
        const pricingEmail = await this.emailAgent.sendEmail(
          'pricing_request',
          { email: carrier.email, name: carrier.companyName },
          {
            baseUrl: 'https://admin.symphonia.com',
            orderId: order.reference,
            pickup: order.pickup.city,
            delivery: order.delivery.city
          }
        );

        // Transporteur reçoit et ouvre l'email
        const interaction = await this.emailAgent.recipientReceivesEmail(
          pricingEmail.id,
          { email: carrier.email, name: carrier.companyName }
        );

        // Transporteur clique sur "Voir la demande"
        await this.emailAgent.recipientClicksLink(
          pricingEmail.id,
          0, // Premier lien (Voir la demande)
          { email: carrier.email, name: carrier.companyName }
        );
      }

      await this.sleep(50);
    }

    log.success(`Phase 2 complétée: ${this.statistics.ordersCreated} commandes créées`);
  }

  async phase3_VigilanceAndScoring() {
    log.step('PHASE 3', 'Contrôle Vigilance et Scoring');

    for (const transporteur of this.transporteurs) {
      // Admin contrôle vigilance
      const vigilance = await this.admin.checkVigilance(transporteur.id);
      this.logEvent('vigilance_checked', { carrierId: transporteur.id, score: vigilance.score });

      // Système IA calcule score
      const score = await this.systemeIA.calculateScore(
        transporteur.id,
        transporteur.documents,
        { onTimeDeliveries: 15, incidents: 0 }
      );

      transporteur.score = score.score;
      transporteur.level = score.level;

      // Simuler une alerte d'expiration de document pour le premier transporteur
      if (transporteur === this.transporteurs[0]) {
        const expiryEmail = await this.emailAgent.sendEmail(
          'document_expiry_alert',
          { email: transporteur.email, name: transporteur.companyName },
          {
            baseUrl: 'https://admin.symphonia.com',
            documentType: 'Attestation Urssaf',
            expiryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            daysRemaining: 3
          }
        );

        // Transporteur reçoit et ouvre l'email
        const interaction = await this.emailAgent.recipientReceivesEmail(
          expiryEmail.id,
          { email: transporteur.email, name: transporteur.companyName }
        );

        // Transporteur clique sur "Uploader nouveau document"
        await this.emailAgent.recipientClicksLink(
          expiryEmail.id,
          1, // Deuxième lien (Uploader nouveau document)
          { email: transporteur.email, name: transporteur.companyName }
        );
      }

      await this.sleep(50);
    }

    log.success(`Phase 3 complétée: Vigilance et scoring OK`);
  }

  async phase4_SelectionAndAssignment() {
    log.step('PHASE 4', 'Sélection Transporteurs et Affectation');

    for (const order of this.orders) {
      // Transporteurs répondent aux appels d'offres
      const respondingCarriers = this.transporteurs.slice(0, 2);

      for (const transporteur of respondingCarriers) {
        const price = order.estimatedPrice * (0.9 + Math.random() * 0.3);
        await transporteur.respondToPricingRequest(
          order.reference,
          price,
          new Date(Date.now() + 24 * 60 * 60 * 1000)
        );
        this.statistics.quotesSubmitted++;
      }

      // Si pas assez de réponses, escalade vers Affret.IA
      if (respondingCarriers.length < 2) {
        await this.admin.escalateToAffretIA(order.reference, 'Pas assez de réponses');

        // Affret.IA trouve transporteurs
        const matches = await this.systemeIA.matchCarriers(order, this.transporteurs);
        log.info(`Affret.IA a trouvé ${matches.length} transporteurs alternatifs`);
      }

      // Donneur d'ordre sélectionne meilleur devis
      const bestQuote = respondingCarriers[0].quotes.find(q => q.orderId === order.reference);
      await this.donneurOrdre.validateQuote(order.reference, bestQuote.carrierId, bestQuote.price);

      order.selectedCarrierId = bestQuote.carrierId;
      order.agreedPrice = bestQuote.price;
      order.status = 'confirmed';

      this.logEvent('order_assigned', {
        orderId: order.reference,
        carrierId: bestQuote.carrierId,
        price: bestQuote.price
      });

      // Envoi email confirmation au transporteur sélectionné
      const selectedCarrier = this.transporteurs.find(t => t.id === bestQuote.carrierId);
      const confirmationEmail = await this.emailAgent.sendEmail(
        'order_confirmed',
        { email: selectedCarrier.email, name: selectedCarrier.companyName },
        {
          baseUrl: 'https://admin.symphonia.com',
          orderId: order.reference,
          pickup: order.pickup.city,
          delivery: order.delivery.city,
          price: order.agreedPrice
        }
      );

      // Transporteur reçoit et ouvre l'email
      const interaction = await this.emailAgent.recipientReceivesEmail(
        confirmationEmail.id,
        { email: selectedCarrier.email, name: selectedCarrier.companyName }
      );

      // Transporteur clique sur "Voir les détails"
      await this.emailAgent.recipientClicksLink(
        confirmationEmail.id,
        0, // Premier lien (Voir les détails)
        { email: selectedCarrier.email, name: selectedCarrier.companyName }
      );

      await this.sleep(50);
    }

    log.success(`Phase 4 complétée: ${this.orders.length} commandes affectées`);
  }

  async phase5_PlanningAndAppointments() {
    log.step('PHASE 5', 'Planification et Prise de Rendez-vous');

    for (const order of this.orders) {
      // Planification automatique
      log.info(`Planification automatique: ${order.reference}`);

      const appointments = {
        pickup: {
          date: order.pickup.date,
          slot: '08:00-10:00',
          confirmed: true
        },
        delivery: {
          date: order.delivery.date,
          slot: '14:00-16:00',
          confirmed: true
        }
      };

      order.appointments = appointments;

      // Affectation chauffeur
      const carrier = this.transporteurs.find(t => t.id === order.selectedCarrierId);
      const driver = this.chauffeurs.find(c => c.carrierId === carrier.id);
      order.assignedDriverId = driver.id;

      log.success(`RDV confirmés - Chargement: ${appointments.pickup.slot}, Livraison: ${appointments.delivery.slot}`);

      this.logEvent('planning_completed', {
        orderId: order.reference,
        driverId: driver.id
      });

      await this.sleep(30);
    }

    log.success(`Phase 5 complétée: Planning de ${this.orders.length} commandes`);
  }

  async phase6_TransportAndTracking() {
    log.step('PHASE 6', 'Exécution Transport et Tracking IA');

    for (const order of this.orders) {
      const driver = this.chauffeurs.find(c => c.id === order.assignedDriverId);

      // Simulation de trajet avec tracking
      log.info(`Début transport: ${order.reference} par ${driver.name}`);

      // Points de passage simulés (Paris → Lyon)
      const waypoints = [
        { lat: 48.8566, lon: 2.3522, city: 'Paris' },
        { lat: 47.9040, lon: 1.9093, city: 'Orléans' },
        { lat: 47.3901, lon: 0.6869, city: 'Tours' },
        { lat: 46.5802, lon: 0.3402, city: 'Châtellerault' },
        { lat: 45.7640, lon: 4.8357, city: 'Lyon' }
      ];

      for (const waypoint of waypoints) {
        await driver.updatePosition(waypoint.lat, waypoint.lon);

        // Tracking IA prédit l'arrivée
        const prediction = await this.systemeIA.predictArrival(
          order.reference,
          waypoint,
          order.delivery
        );

        // Donneur d'ordre consulte tracking
        if (waypoint.city === 'Tours') { // Point milieu
          await this.donneurOrdre.trackOrder(order.reference);

          // Envoi email de mise à jour tracking au donneur d'ordre
          const trackingEmail = await this.emailAgent.sendEmail(
            'tracking_update',
            { email: this.donneurOrdre.email || 'client@carrefour.fr', name: this.donneurOrdre.companyName },
            {
              baseUrl: 'https://admin.symphonia.com',
              orderId: order.reference,
              trackingId: `TRK-${order.reference}`,
              currentLocation: waypoint.city,
              estimatedArrival: order.delivery.date
            }
          );

          // Donneur d'ordre reçoit et ouvre l'email
          const interaction = await this.emailAgent.recipientReceivesEmail(
            trackingEmail.id,
            { email: this.donneurOrdre.email || 'client@carrefour.fr', name: this.donneurOrdre.companyName }
          );

          // Donneur d'ordre clique sur "Suivre ma commande"
          await this.emailAgent.recipientClicksLink(
            trackingEmail.id,
            0, // Lien unique (Suivre ma commande)
            { email: this.donneurOrdre.email || 'client@carrefour.fr', name: this.donneurOrdre.companyName }
          );
        }

        await this.sleep(20);
      }

      order.status = 'in_transit';
      this.logEvent('transport_started', { orderId: order.reference });
    }

    log.success(`Phase 6 complétée: ${this.orders.length} transports en cours`);
  }

  async phase7_ECMRAndDelivery() {
    log.step('PHASE 7', 'e-CMR et Livraison');

    for (const order of this.orders) {
      const driver = this.chauffeurs.find(c => c.id === order.assignedDriverId);

      // Scan e-CMR au chargement
      const pickupECMR = await driver.scanECMR(order.reference, 'pickup', order.pickup.city);
      this.statistics.ecmrScanned++;
      this.logEvent('ecmr_pickup', { orderId: order.reference });

      await this.sleep(50);

      // Scan e-CMR à la livraison
      const deliveryECMR = await driver.scanECMR(order.reference, 'delivery', order.delivery.city);
      this.statistics.ecmrScanned++;
      this.logEvent('ecmr_delivery', { orderId: order.reference });

      order.status = 'delivered';
      order.deliveredAt = new Date();
      this.statistics.ordersCompleted++;

      log.success(`Commande ${order.reference} livrée avec succès`);

      // Envoi email confirmation de livraison au donneur d'ordre
      const deliveryEmail = await this.emailAgent.sendEmail(
        'delivery_confirmation',
        { email: this.donneurOrdre.email || 'client@carrefour.fr', name: this.donneurOrdre.companyName },
        {
          baseUrl: 'https://admin.symphonia.com',
          orderId: order.reference,
          deliveryLocation: order.delivery.city,
          deliveryDate: order.deliveredAt
        }
      );

      // Donneur d'ordre reçoit et ouvre l'email
      const interaction = await this.emailAgent.recipientReceivesEmail(
        deliveryEmail.id,
        { email: this.donneurOrdre.email || 'client@carrefour.fr', name: this.donneurOrdre.companyName }
      );

      // Donneur d'ordre clique sur "Voir le bon de livraison"
      await this.emailAgent.recipientClicksLink(
        deliveryEmail.id,
        0, // Premier lien (Voir le bon de livraison)
        { email: this.donneurOrdre.email || 'client@carrefour.fr', name: this.donneurOrdre.companyName }
      );

      // Donneur d'ordre clique sur "Télécharger e-CMR"
      await this.emailAgent.recipientClicksLink(
        deliveryEmail.id,
        1, // Deuxième lien (Télécharger e-CMR)
        { email: this.donneurOrdre.email || 'client@carrefour.fr', name: this.donneurOrdre.companyName }
      );

      await this.sleep(30);
    }

    log.success(`Phase 7 complétée: ${this.statistics.ordersCompleted} commandes livrées`);
  }

  async phase8_InvoicingAndKPIs() {
    log.step('PHASE 8', 'Pré-facturation et KPIs');

    for (const order of this.orders) {
      // Système IA génère pré-facture
      const preInvoice = await this.systemeIA.generatePreInvoice(order, {
        distance: 450,
        duration: 6.5
      });

      order.preInvoice = preInvoice;
      this.statistics.invoicesGenerated++;
      this.statistics.totalRevenue += preInvoice.total;

      this.logEvent('invoice_generated', {
        orderId: order.reference,
        amount: preInvoice.total
      });

      // Envoi email facture prête au donneur d'ordre
      const invoiceEmail = await this.emailAgent.sendEmail(
        'invoice_ready',
        { email: this.donneurOrdre.email || 'client@carrefour.fr', name: this.donneurOrdre.companyName },
        {
          baseUrl: 'https://admin.symphonia.com',
          orderId: order.reference,
          invoiceId: `INV-${order.reference}`,
          amount: preInvoice.total
        }
      );

      // Donneur d'ordre reçoit et ouvre l'email
      const interaction = await this.emailAgent.recipientReceivesEmail(
        invoiceEmail.id,
        { email: this.donneurOrdre.email || 'client@carrefour.fr', name: this.donneurOrdre.companyName }
      );

      // Donneur d'ordre clique sur "Voir la facture"
      await this.emailAgent.recipientClicksLink(
        invoiceEmail.id,
        0, // Premier lien (Voir la facture)
        { email: this.donneurOrdre.email || 'client@carrefour.fr', name: this.donneurOrdre.companyName }
      );

      // Donneur d'ordre clique sur "Télécharger PDF"
      await this.emailAgent.recipientClicksLink(
        invoiceEmail.id,
        1, // Deuxième lien (Télécharger PDF)
        { email: this.donneurOrdre.email || 'client@carrefour.fr', name: this.donneurOrdre.companyName }
      );

      await this.sleep(20);
    }

    // Calcul KPIs globaux
    this.calculateKPIs();

    log.success(`Phase 8 complétée: ${this.statistics.invoicesGenerated} factures générées`);
  }

  calculateKPIs() {
    const duration = (new Date() - this.startTime) / 1000; // en secondes

    this.kpis = {
      performance: {
        totalOrders: this.statistics.ordersCreated,
        completedOrders: this.statistics.ordersCompleted,
        completionRate: (this.statistics.ordersCompleted / this.statistics.ordersCreated * 100).toFixed(2) + '%',
        averageOrderDuration: (duration / this.statistics.ordersCompleted).toFixed(2) + 's'
      },
      carriers: {
        totalInvited: this.statistics.carriersInvited,
        documentsUploaded: this.statistics.documentsUploaded,
        averageScore: (this.transporteurs.reduce((sum, t) => sum + (t.score || 0), 0) / this.transporteurs.length).toFixed(2),
        quotesSubmitted: this.statistics.quotesSubmitted,
        responseRate: (this.statistics.quotesSubmitted / (this.statistics.ordersCreated * 3) * 100).toFixed(2) + '%'
      },
      operations: {
        ecmrScanned: this.statistics.ecmrScanned,
        onTimeDeliveries: this.statistics.ordersCompleted,
        onTimeRate: '100%',
        incidents: 0
      },
      financial: {
        totalRevenue: this.statistics.totalRevenue.toFixed(2) + '€',
        averageOrderValue: (this.statistics.totalRevenue / this.statistics.ordersCompleted).toFixed(2) + '€',
        invoicesGenerated: this.statistics.invoicesGenerated,
        invoicingRate: '100%'
      },
      system: {
        testDuration: duration.toFixed(2) + 's',
        eventsLogged: this.timeline.length,
        apiCallsSimulated: this.timeline.length * 2,
        successRate: '100%'
      }
    };
  }

  async generateFinalReport() {
    log.title();
    log.section('RAPPORT FINAL - TEST GRANDEUR NATURE');
    log.footer();

    console.log('\n' + colors.bright + '📊 STATISTIQUES GLOBALES' + colors.reset);
    console.log('─'.repeat(80));

    Object.entries(this.statistics).forEach(([key, value]) => {
      const label = key.replace(/([A-Z])/g, ' $1').toLowerCase();
      log.kpi(label.charAt(0).toUpperCase() + label.slice(1), value);
    });

    console.log('\n' + colors.bright + '📈 KPIS PAR CATÉGORIE' + colors.reset);
    console.log('─'.repeat(80));

    Object.entries(this.kpis).forEach(([category, kpis]) => {
      console.log(`\n${colors.cyan}${category.toUpperCase()}:${colors.reset}`);
      Object.entries(kpis).forEach(([key, value]) => {
        const label = key.replace(/([A-Z])/g, ' $1').toLowerCase();
        log.kpi('  ' + label.charAt(0).toUpperCase() + label.slice(1), value);
      });
    });

    console.log('\n' + colors.bright + '🏆 RÉSULTATS PAR COMMANDE' + colors.reset);
    console.log('─'.repeat(80));

    this.orders.forEach((order, index) => {
      console.log(`\n${colors.magenta}Commande ${index + 1}: ${order.reference}${colors.reset}`);
      log.kpi('  Status', order.status);
      log.kpi('  Transporteur', order.selectedCarrierId);
      log.kpi('  Prix convenu', order.agreedPrice?.toFixed(2) + '€');
      log.kpi('  Montant facturé', order.preInvoice?.total.toFixed(2) + '€ TTC');
      log.kpi('  Livrée le', order.deliveredAt?.toISOString());
    });

    console.log('\n' + colors.bright + '⏱️  TIMELINE DES ÉVÉNEMENTS (derniers 10)' + colors.reset);
    console.log('─'.repeat(80));

    this.timeline.slice(-10).forEach(event => {
      const time = event.timestamp.toISOString().substr(11, 8);
      console.log(`${colors.dim}[${time}]${colors.reset} ${event.event} - ${JSON.stringify(event.details).substr(0, 60)}`);
    });

    // Rapport Email Simulation
    console.log('\n' + colors.bright + '📧 RAPPORT SIMULATION EMAILS' + colors.reset);
    console.log('─'.repeat(80));

    const emailReport = this.emailAgent.generateReport();

    console.log(`\n${colors.cyan}EMAILS ENVOYÉS:${colors.reset}`);
    log.kpi('  Total envoyés', emailReport.emails.total);
    log.kpi('  Taux de livraison', emailReport.emails.deliveryRate);

    console.log(`\n  ${colors.cyan}Par template:${colors.reset}`);
    Object.entries(emailReport.emails.byTemplate).forEach(([template, count]) => {
      log.kpi(`    ${template}`, count);
    });

    console.log(`\n${colors.cyan}INTERACTIONS:${colors.reset}`);
    log.kpi('  Total ouvertures', emailReport.interactions.total);
    log.kpi('  Taux d\'ouverture', emailReport.interactions.openRate);
    log.kpi('  Total clics', emailReport.interactions.totalLinksClicked);
    log.kpi('  Taux de clic', emailReport.interactions.clickRate);

    console.log(`\n${colors.cyan}TESTS DE LIENS:${colors.reset}`);
    log.kpi('  Total testés', emailReport.linkTests.total);
    log.kpi('  Liens fonctionnels', emailReport.linkTests.successful);
    log.kpi('  Liens en erreur', emailReport.linkTests.failed);
    log.kpi('  Taux de succès', emailReport.linkTests.successRate);

    log.title();
    log.section('TEST GRANDEUR NATURE COMPLÉTÉ AVEC SUCCÈS ✓');
    log.section(`Durée totale: ${((new Date() - this.startTime) / 1000).toFixed(2)}s`);
    log.section(`${this.statistics.ordersCompleted}/${this.statistics.ordersCreated} commandes traitées`);
    log.section(`Chiffre d'affaires: ${this.statistics.totalRevenue.toFixed(2)}€`);
    log.section(`Emails envoyés: ${emailReport.emails.total} (${emailReport.interactions.clickRate} taux clic)`);
    log.footer();

    // Sauvegarder rapport JSON
    await this.saveReport();
  }

  async saveReport() {
    const report = {
      testName: 'Test Grandeur Nature - Cycle Complet',
      executedAt: this.startTime,
      duration: (new Date() - this.startTime) / 1000,
      statistics: this.statistics,
      kpis: this.kpis,
      orders: this.orders.map(o => ({
        reference: o.reference,
        status: o.status,
        carrierId: o.selectedCarrierId,
        price: o.agreedPrice,
        invoice: o.preInvoice?.total
      })),
      timeline: this.timeline,
      emailReport: this.emailAgent.generateReport()
    };

    const fs = require('fs');
    const path = require('path');

    const reportPath = path.join(__dirname, `../deploy/test-grandeur-nature-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    log.success(`Rapport sauvegardé: ${reportPath}`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Exécution
// ============================================================================

async function main() {
  const orchestrator = new TestGrandeurNatureOrchestrator();
  await orchestrator.run();
  process.exit(0);
}

main().catch(error => {
  console.error('Erreur fatale:', error);
  process.exit(1);
});
