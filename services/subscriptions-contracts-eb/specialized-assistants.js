/**
 * RT Technologie - Assistants Specialises
 * 7 chatbots metiers pour chaque type d'utilisateur
 * Version: 1.0.0
 *
 * Assistants:
 * 1. Planif'IA - Industriels
 * 2. Routier - Transporteurs
 * 3. Quai & WMS - Logisticiens
 * 4. Livraisons - Destinataires
 * 5. Expedition - Fournisseurs
 * 6. Freight IA - Transitaires
 * 7. Copilote Chauffeur - Conducteurs (mobile)
 */

const { ObjectId } = require('mongodb');
const { ClaudeIntegrationService } = require('./claude-integration');
const crypto = require('crypto');
const {
  ChatbotTypes,
  UserRoles,
  PriorityLevels,
  ConversationStatus,
  MessageTypes,
  PlatformModules,
  ChatbotGreetings,
  RoleToChatbot
} = require('./chatbot-models');

// ============================================================================
// CLASSE DE BASE POUR LES ASSISTANTS
// ============================================================================

class BaseAssistant {
  constructor(db, eventEmitter = null, chatbotType) {
    this.db = db;
    this.eventEmitter = eventEmitter;
    this.chatbotType = chatbotType;
    this.conversations = db.collection('chatbot_conversations');
    this.users = db.collection('users');
    this.organizations = db.collection('organizations');
    this.claudeService = new ClaudeIntegrationService();
  }

  /**
   * Demarrer une conversation
   */
  async startConversation(userId, context = {}) {
    const user = await this.users.findOne({ _id: new ObjectId(userId) });
    if (!user) throw new Error('Utilisateur non trouve');

    const conversationId = crypto.randomUUID();
    const greeting = ChatbotGreetings[this.chatbotType];

    const conversation = {
      conversationId,
      chatbotType: this.chatbotType,
      userId: new ObjectId(userId),
      organizationId: user.organizationId ? new ObjectId(user.organizationId) : null,
      userRole: user.role,
      status: ConversationStatus.ACTIVE,
      priority: PriorityLevels.STANDARD,
      category: null,
      module: context.module || null,
      context: {
        orderReference: context.orderReference || null,
        currentPage: context.currentPage || null,
        previousActions: context.previousActions || [],
        userAgent: context.userAgent || null
      },
      messages: [{
        messageId: crypto.randomUUID(),
        type: MessageTypes.BOT,
        content: greeting.greeting,
        timestamp: new Date(),
        metadata: { suggestions: greeting.suggestions }
      }],
      diagnostics: [],
      botInteractions: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.conversations.insertOne(conversation);

    this._emitEvent(`${this.chatbotType}.started`, { conversationId, userId });

    return {
      conversationId,
      chatbotType: this.chatbotType,
      greeting: greeting.greeting,
      suggestions: greeting.suggestions
    };
  }

  /**
   * Envoyer un message
   */
  async sendMessage(conversationId, content, attachments = []) {
    const conversation = await this.conversations.findOne({ conversationId });
    if (!conversation) throw new Error('Conversation non trouvee');

    const userMessage = {
      messageId: crypto.randomUUID(),
      type: MessageTypes.USER,
      content,
      attachments,
      timestamp: new Date()
    };

    await this.conversations.updateOne(
      { conversationId },
      {
        $push: { messages: userMessage },
        $set: { status: ConversationStatus.WAITING_BOT, updatedAt: new Date() }
      }
    );

    // Generer reponse specifique a l'assistant
    const response = await this._generateResponse(conversation, content);

    const botMessage = {
      messageId: crypto.randomUUID(),
      type: MessageTypes.BOT,
      content: response.content,
      timestamp: new Date(),
      metadata: {
        suggestions: response.suggestions,
        actions: response.actions,
        data: response.data
      }
    };

    await this.conversations.updateOne(
      { conversationId },
      {
        $push: { messages: botMessage },
        $inc: { botInteractions: 1 },
        $set: { status: ConversationStatus.WAITING_USER, updatedAt: new Date() }
      }
    );

    return { userMessage, botResponse: botMessage };
  }

  async _generateResponse(conversation, content) {
    // A surcharger dans les classes enfants
    return {
      content: "Je suis la pour vous aider.",
      suggestions: []
    };
  }

  _emitEvent(eventType, data) {
    if (this.eventEmitter) {
      this.eventEmitter.emit(eventType, { event: eventType, timestamp: new Date(), data });
    }
    console.log(`[${this.chatbotType}] ${eventType}:`, JSON.stringify(data));
  }
}

// ============================================================================
// 1. PLANIF'IA - ASSISTANT INDUSTRIELS
// ============================================================================

class PlanifIAAssistant extends BaseAssistant {
  constructor(db, eventEmitter = null) {
    super(db, eventEmitter, ChatbotTypes.PLANIF_IA);
    this.transportOrders = db.collection('transport_orders');
    this.carriers = db.collection('carriers');
    this.erpConnections = db.collection('erp_connections');
    this.affretRequests = db.collection('affret_requests');
  }

  async _generateResponse(conversation, content) {
    const lowerContent = content.toLowerCase();

    // Detection des intentions
    if (this._matchIntent(lowerContent, ['erp', 'connecter', 'integration', 'synchroniser'])) {
      return await this._handleErpQuery(conversation);
    }
    if (this._matchIntent(lowerContent, ['affret', 'bourse', 'fret', 'affreter'])) {
      return await this._handleAffretIA(conversation, content);
    }
    if (this._matchIntent(lowerContent, ['transporteur', 'reference', 'liste'])) {
      return await this._handleCarrierManagement(conversation);
    }
    if (this._matchIntent(lowerContent, ['commande', 'ordre', 'transport', 'creer'])) {
      return await this._handleTransportOrder(conversation, content);
    }
    if (this._matchIntent(lowerContent, ['suivi', 'tracking', 'ou en est'])) {
      return await this._handleTracking(conversation, content);
    }

    return this._getDefaultResponse();
  }

  _matchIntent(content, keywords) {
    return keywords.some(k => content.includes(k));
  }

  async _handleErpQuery(conversation) {
    const erpConfig = await this.erpConnections.findOne({
      organizationId: conversation.organizationId
    });

    if (erpConfig) {
      return {
        content: `Votre ERP **${erpConfig.erpType}** est connecte.\n\n` +
          `- Derniere synchronisation: ${erpConfig.lastSync ? new Date(erpConfig.lastSync).toLocaleString('fr-FR') : 'Jamais'}\n` +
          `- Statut: ${erpConfig.status || 'Actif'}\n\n` +
          `Que souhaitez-vous faire ?`,
        suggestions: ['Forcer une synchronisation', 'Voir les erreurs', 'Modifier la configuration', 'Deconnecter'],
        data: { erpType: erpConfig.erpType, status: erpConfig.status }
      };
    }

    return {
      content: "Vous n'avez pas encore connecte d'ERP. Voici les systemes supportes:\n\n" +
        "- SAP (S/4HANA, Business One)\n" +
        "- Oracle (ERP Cloud, NetSuite)\n" +
        "- Sage (X3, 100c)\n" +
        "- Microsoft Dynamics 365\n\n" +
        "Quel ERP souhaitez-vous integrer ?",
      suggestions: ['SAP', 'Oracle', 'Sage', 'Microsoft Dynamics', 'Autre ERP'],
      actions: [{ type: 'erp_setup', label: 'Configurer ERP' }]
    };
  }

  async _handleAffretIA(conversation, content) {
    // Verifier si l'organisation a acces a Affret.IA
    const org = await this.organizations.findOne({ _id: conversation.organizationId });

    if (!org?.modules?.includes('affretia')) {
      return {
        content: "Le module **Affret.IA** n'est pas active pour votre organisation.\n\n" +
          "Affret.IA vous permet de:\n" +
          "- Publier automatiquement vos besoins sur la bourse de fret\n" +
          "- Recevoir des offres de transporteurs qualifies\n" +
          "- Utiliser l'IA pour matcher le meilleur transporteur\n\n" +
          "Souhaitez-vous activer ce module ?",
        suggestions: ['Activer Affret.IA', 'En savoir plus', 'Voir les tarifs'],
        actions: [{ type: 'module_activate', module: 'affretia' }]
      };
    }

    // Chercher les demandes en cours
    const activeRequests = await this.affretRequests.countDocuments({
      organizationId: conversation.organizationId,
      status: { $in: ['pending', 'in_progress'] }
    });

    return {
      content: `**Affret.IA** est actif.\n\n` +
        `Vous avez actuellement **${activeRequests}** demande(s) d'affretement en cours.\n\n` +
        `Que souhaitez-vous faire ?`,
      suggestions: ['Nouvelle demande d\'affretement', 'Voir mes demandes', 'Offres recues', 'Parametres Affret.IA'],
      data: { activeRequests }
    };
  }

  async _handleCarrierManagement(conversation) {
    const carriers = await this.carriers.find({
      referencedBy: conversation.organizationId
    }).limit(10).toArray();

    if (carriers.length === 0) {
      return {
        content: "Vous n'avez pas encore reference de transporteurs.\n\n" +
          "Le referencement vous permet de:\n" +
          "- Inviter vos transporteurs habituels\n" +
          "- Gerer les grilles tarifaires\n" +
          "- Suivre les performances\n\n" +
          "Comment souhaitez-vous proceder ?",
        suggestions: ['Inviter un transporteur', 'Importer liste Excel', 'Trouver transporteurs'],
        actions: [{ type: 'carrier_invite' }]
      };
    }

    let content = `Vous avez **${carriers.length}** transporteur(s) reference(s):\n\n`;
    carriers.slice(0, 5).forEach((c, i) => {
      content += `${i + 1}. **${c.name}** - ${c.status || 'Actif'}\n`;
    });

    if (carriers.length > 5) {
      content += `\n... et ${carriers.length - 5} autres.`;
    }

    return {
      content,
      suggestions: ['Voir tous mes transporteurs', 'Inviter un nouveau', 'Gerer les grilles tarifaires', 'Evaluations'],
      data: { carrierCount: carriers.length }
    };
  }

  async _handleTransportOrder(conversation, content) {
    // Extraire reference si mentionnee
    const refMatch = content.match(/(?:ot|ref|commande)[:\s]*([A-Z0-9-]+)/i);

    if (refMatch) {
      const order = await this.transportOrders.findOne({
        reference: refMatch[1].toUpperCase(),
        shipper: conversation.organizationId
      });

      if (order) {
        return {
          content: `**Commande ${order.reference}**\n\n` +
            `- Statut: ${order.status}\n` +
            `- Origine: ${order.origin?.city || 'Non definie'}\n` +
            `- Destination: ${order.destination?.city || 'Non definie'}\n` +
            `- Date enlevement: ${order.pickupDate ? new Date(order.pickupDate).toLocaleDateString('fr-FR') : 'A definir'}\n` +
            `- Transporteur: ${order.carrier?.name || 'Non assigne'}\n`,
          suggestions: ['Modifier', 'Annuler', 'Contacter transporteur', 'Voir le tracking'],
          data: { order }
        };
      }
    }

    return {
      content: "Je peux vous aider a creer ou gerer vos ordres de transport.\n\n" +
        "Pour creer une nouvelle commande, j'ai besoin de:\n" +
        "- Lieu d'enlevement\n" +
        "- Lieu de livraison\n" +
        "- Date souhaitee\n" +
        "- Type de marchandise\n\n" +
        "Souhaitez-vous commencer ?",
      suggestions: ['Creer une commande', 'Voir mes commandes', 'Commandes en cours', 'Historique'],
      actions: [{ type: 'create_order' }]
    };
  }

  async _handleTracking(conversation, content) {
    const activeOrders = await this.transportOrders.find({
      shipper: conversation.organizationId,
      status: { $in: ['in_transit', 'loading', 'unloading'] }
    }).limit(5).toArray();

    if (activeOrders.length === 0) {
      return {
        content: "Vous n'avez pas de transport en cours actuellement.",
        suggestions: ['Voir l\'historique', 'Creer une commande']
      };
    }

    let content_response = `**${activeOrders.length}** transport(s) en cours:\n\n`;
    activeOrders.forEach((o, i) => {
      content_response += `${i + 1}. **${o.reference}** - ${o.status}\n`;
      content_response += `   ${o.origin?.city} -> ${o.destination?.city}\n`;
    });

    return {
      content: content_response,
      suggestions: ['Voir sur la carte', 'Details premier transport', 'Alertes tracking'],
      data: { orders: activeOrders.map(o => ({ ref: o.reference, status: o.status })) }
    };
  }

  _getDefaultResponse() {
    return {
      content: "Je suis l'assistant **Planif'IA** pour les industriels.\n\n" +
        "Je peux vous aider avec:\n" +
        "- **ERP**: Connecter et synchroniser votre systeme\n" +
        "- **Affret.IA**: Trouver des transporteurs rapidement\n" +
        "- **Transporteurs**: Gerer vos references\n" +
        "- **Commandes**: Creer et suivre vos transports\n\n" +
        "Que souhaitez-vous faire ?",
      suggestions: ['Connecter mon ERP', 'Activer Affret.IA', 'Gerer mes transporteurs', 'Creer une commande']
    };
  }
}

// ============================================================================
// 2. ROUTIER - ASSISTANT TRANSPORTEURS
// ============================================================================

class RoutierAssistant extends BaseAssistant {
  constructor(db, eventEmitter = null) {
    super(db, eventEmitter, ChatbotTypes.ROUTIER);
    this.pricingGrids = db.collection('pricing_grids');
    this.rdvs = db.collection('rdvs');
    this.pods = db.collection('pods');
    this.vehicles = db.collection('vehicles');
  }

  async _generateResponse(conversation, content) {
    const lowerContent = content.toLowerCase();

    if (this._matchIntent(lowerContent, ['grille', 'tarif', 'prix', 'cotation'])) {
      return await this._handlePricingGrids(conversation);
    }
    if (this._matchIntent(lowerContent, ['rdv', 'rendez-vous', 'creneau', 'reservation'])) {
      return await this._handleRdvBooking(conversation, content);
    }
    if (this._matchIntent(lowerContent, ['tracking', 'suivi', 'gps', 'position'])) {
      return await this._handleTrackingConfig(conversation);
    }
    if (this._matchIntent(lowerContent, ['pod', 'preuve', 'livraison', 'deposer'])) {
      return await this._handlePodDeposit(conversation);
    }
    if (this._matchIntent(lowerContent, ['vehicule', 'camion', 'flotte'])) {
      return await this._handleFleetManagement(conversation);
    }

    return this._getDefaultResponse();
  }

  _matchIntent(content, keywords) {
    return keywords.some(k => content.includes(k));
  }

  async _handlePricingGrids(conversation) {
    const grids = await this.pricingGrids.find({
      carrierId: conversation.organizationId
    }).toArray();

    if (grids.length === 0) {
      return {
        content: "Vous n'avez pas encore configure de grilles tarifaires.\n\n" +
          "Les grilles tarifaires permettent:\n" +
          "- Cotation automatique pour vos clients\n" +
          "- Integration avec Affret.IA\n" +
          "- Reponse instantanee aux appels d'offres\n\n" +
          "Souhaitez-vous creer votre premiere grille ?",
        suggestions: ['Creer une grille', 'Importer Excel', 'En savoir plus'],
        actions: [{ type: 'create_pricing_grid' }]
      };
    }

    let content_resp = `Vous avez **${grids.length}** grille(s) tarifaire(s):\n\n`;
    grids.slice(0, 5).forEach((g, i) => {
      content_resp += `${i + 1}. **${g.name}** - ${g.type || 'Standard'}\n`;
    });

    return {
      content: content_resp,
      suggestions: ['Modifier une grille', 'Ajouter une grille', 'Voir les statistiques'],
      data: { gridCount: grids.length }
    };
  }

  async _handleRdvBooking(conversation, content) {
    // Chercher les RDV du jour
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayRdvs = await this.rdvs.find({
      carrierId: conversation.organizationId,
      date: { $gte: today, $lt: tomorrow }
    }).toArray();

    return {
      content: `**RDV du jour:** ${todayRdvs.length} reservation(s)\n\n` +
        (todayRdvs.length > 0
          ? todayRdvs.map((r, i) =>
            `${i + 1}. ${new Date(r.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} - ${r.location || 'Site'} (${r.status})`
          ).join('\n')
          : 'Aucun RDV prevu aujourd\'hui') +
        '\n\nQue souhaitez-vous faire ?',
      suggestions: ['Prendre un nouveau RDV', 'RDV de la semaine', 'Modifier un RDV', 'Annuler un RDV'],
      data: { todayRdvs: todayRdvs.length }
    };
  }

  async _handleTrackingConfig(conversation) {
    const vehicles = await this.vehicles.find({
      organizationId: conversation.organizationId,
      trackingEnabled: true
    }).countDocuments();

    return {
      content: `**Tracking IA** active sur **${vehicles}** vehicule(s).\n\n` +
        "Le tracking intelligent permet:\n" +
        "- Geolocalisation temps reel\n" +
        "- ETA predictive avec IA\n" +
        "- Alertes automatiques clients\n" +
        "- Historique des trajets\n\n" +
        "Que souhaitez-vous configurer ?",
      suggestions: ['Voir ma flotte', 'Activer tracking', 'Configurer alertes', 'Voir les trajets'],
      data: { trackedVehicles: vehicles }
    };
  }

  async _handlePodDeposit(conversation) {
    const pendingPods = await this.pods.countDocuments({
      carrierId: conversation.organizationId,
      status: 'pending'
    });

    return {
      content: `Vous avez **${pendingPods}** POD(s) en attente de depot.\n\n` +
        "Pour deposer un POD:\n" +
        "1. Photographiez le bon de livraison signe\n" +
        "2. Scannez le code-barres ou entrez la reference\n" +
        "3. Validez le depot\n\n" +
        "L'OCR extraira automatiquement les informations.",
      suggestions: ['Deposer un POD', 'PODs en attente', 'Historique PODs', 'Aide OCR'],
      actions: [{ type: 'pod_upload' }]
    };
  }

  async _handleFleetManagement(conversation) {
    const vehicles = await this.vehicles.find({
      organizationId: conversation.organizationId
    }).toArray();

    if (vehicles.length === 0) {
      return {
        content: "Vous n'avez pas encore enregistre de vehicules.\n\n" +
          "L'enregistrement permet:\n" +
          "- Tracking GPS de votre flotte\n" +
          "- Gestion des documents vehicules\n" +
          "- Attribution automatique aux missions",
        suggestions: ['Ajouter un vehicule', 'Importer ma flotte'],
        actions: [{ type: 'add_vehicle' }]
      };
    }

    let content_resp = `**Ma flotte:** ${vehicles.length} vehicule(s)\n\n`;
    vehicles.slice(0, 5).forEach((v, i) => {
      content_resp += `${i + 1}. **${v.plate}** - ${v.type || 'PL'} (${v.status || 'Disponible'})\n`;
    });

    return {
      content: content_resp,
      suggestions: ['Voir tous', 'Ajouter vehicule', 'Documents a renouveler', 'Disponibilites'],
      data: { vehicleCount: vehicles.length }
    };
  }

  _getDefaultResponse() {
    return {
      content: "Je suis l'assistant **Routier** pour les transporteurs.\n\n" +
        "Je peux vous aider avec:\n" +
        "- **Grilles tarifaires**: Configurer vos prix\n" +
        "- **RDV**: Reserver des creneaux\n" +
        "- **Tracking IA**: Suivi intelligent\n" +
        "- **POD**: Deposer vos preuves de livraison\n" +
        "- **Flotte**: Gerer vos vehicules\n\n" +
        "Que souhaitez-vous faire ?",
      suggestions: ['Mes grilles tarifaires', 'Prendre un RDV', 'Activer le tracking', 'Deposer un POD']
    };
  }
}

// ============================================================================
// 3. QUAI & WMS - ASSISTANT LOGISTICIENS
// ============================================================================

class QuaiWMSAssistant extends BaseAssistant {
  constructor(db, eventEmitter = null) {
    super(db, eventEmitter, ChatbotTypes.QUAI_WMS);
    this.docks = db.collection('docks');
    this.timeSlots = db.collection('time_slots');
    this.checkins = db.collection('driver_checkins');
    this.wmsConfigs = db.collection('wms_configs');
  }

  async _generateResponse(conversation, content) {
    const lowerContent = content.toLowerCase();

    if (this._matchIntent(lowerContent, ['planning', 'quai', 'occupation'])) {
      return await this._handleDockPlanning(conversation);
    }
    if (this._matchIntent(lowerContent, ['creneau', 'slot', 'configurer', 'horaire'])) {
      return await this._handleTimeSlotConfig(conversation);
    }
    if (this._matchIntent(lowerContent, ['chauffeur', 'portail', 'arrivee', 'check'])) {
      return await this._handleDriverPortal(conversation);
    }
    if (this._matchIntent(lowerContent, ['wms', 'integration', 'stock'])) {
      return await this._handleWMSIntegration(conversation);
    }

    return this._getDefaultResponse();
  }

  _matchIntent(content, keywords) {
    return keywords.some(k => content.includes(k));
  }

  async _handleDockPlanning(conversation) {
    const docks = await this.docks.find({
      siteId: conversation.organizationId
    }).toArray();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayBookings = await this.timeSlots.countDocuments({
      siteId: conversation.organizationId,
      date: { $gte: today, $lt: tomorrow },
      status: 'booked'
    });

    return {
      content: `**Planning Quais - Aujourd'hui**\n\n` +
        `- Quais actifs: ${docks.length}\n` +
        `- RDV reserves: ${todayBookings}\n\n` +
        `Occupation: ${docks.length > 0 ? Math.round((todayBookings / (docks.length * 10)) * 100) : 0}%\n\n` +
        "Que souhaitez-vous faire ?",
      suggestions: ['Voir planning visuel', 'Gerer les quais', 'Ajouter RDV manuel', 'Rapports'],
      data: { docks: docks.length, todayBookings }
    };
  }

  async _handleTimeSlotConfig(conversation) {
    return {
      content: "**Configuration des creneaux**\n\n" +
        "Vous pouvez configurer:\n" +
        "- Duree des creneaux (15/30/60 min)\n" +
        "- Horaires d'ouverture par quai\n" +
        "- Creneaux bloques/fermes\n" +
        "- Capacite par creneau\n\n" +
        "Que souhaitez-vous modifier ?",
      suggestions: ['Duree des creneaux', 'Horaires', 'Bloquer des creneaux', 'Parametres avances'],
      actions: [{ type: 'config_time_slots' }]
    };
  }

  async _handleDriverPortal(conversation) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const checkins = await this.checkins.find({
      siteId: conversation.organizationId,
      checkinTime: { $gte: today, $lt: tomorrow }
    }).toArray();

    const waiting = checkins.filter(c => c.status === 'waiting').length;
    const inProgress = checkins.filter(c => c.status === 'in_progress').length;

    return {
      content: `**Portail Chauffeurs - Temps reel**\n\n` +
        `- En attente: ${waiting}\n` +
        `- En cours de chargement: ${inProgress}\n` +
        `- Total passages: ${checkins.length}\n\n` +
        "Actions possibles:",
      suggestions: ['Voir file d\'attente', 'Appeler prochain', 'Gerer les quais', 'Notifications'],
      data: { waiting, inProgress, total: checkins.length }
    };
  }

  async _handleWMSIntegration(conversation) {
    const wmsConfig = await this.wmsConfigs.findOne({
      organizationId: conversation.organizationId
    });

    if (!wmsConfig) {
      return {
        content: "**Integration WMS**\n\n" +
          "Connectez votre WMS pour:\n" +
          "- Synchronisation temps reel des stocks\n" +
          "- Preparation automatique des quais\n" +
          "- Mise a jour des statuts\n\n" +
          "WMS supportes: SAP WM, Manhattan, Reflex, HighJump, et autres via API.",
        suggestions: ['Configurer WMS', 'Liste des WMS supportes', 'Documentation API'],
        actions: [{ type: 'wms_setup' }]
      };
    }

    return {
      content: `**WMS connecte:** ${wmsConfig.wmsType}\n\n` +
        `- Derniere synchro: ${wmsConfig.lastSync ? new Date(wmsConfig.lastSync).toLocaleString('fr-FR') : 'Jamais'}\n` +
        `- Statut: ${wmsConfig.status || 'Actif'}`,
      suggestions: ['Forcer synchro', 'Voir les erreurs', 'Modifier config', 'Deconnecter'],
      data: { wmsType: wmsConfig.wmsType }
    };
  }

  _getDefaultResponse() {
    return {
      content: "Je suis l'assistant **Quai & WMS** pour les logisticiens.\n\n" +
        "Je peux vous aider avec:\n" +
        "- **Planning quais**: Visualiser l'occupation\n" +
        "- **Creneaux**: Configurer les disponibilites\n" +
        "- **Portail chauffeur**: Gerer les arrivees\n" +
        "- **WMS**: Integration systeme\n\n" +
        "Que souhaitez-vous faire ?",
      suggestions: ['Voir le planning', 'Configurer creneaux', 'Portail chauffeur', 'Integration WMS']
    };
  }
}

// ============================================================================
// 4. LIVRAISONS - ASSISTANT DESTINATAIRES
// ============================================================================

class LivraisonsAssistant extends BaseAssistant {
  constructor(db, eventEmitter = null) {
    super(db, eventEmitter, ChatbotTypes.LIVRAISONS);
    this.deliveries = db.collection('deliveries');
    this.rdvs = db.collection('rdvs');
    this.documents = db.collection('documents');
  }

  async _generateResponse(conversation, content) {
    const lowerContent = content.toLowerCase();

    if (this._matchIntent(lowerContent, ['rdv', 'planifier', 'livraison', 'creneau'])) {
      return await this._handleDeliveryRdv(conversation);
    }
    if (this._matchIntent(lowerContent, ['document', 'cmr', 'bon', 'consulter'])) {
      return await this._handleDocuments(conversation);
    }
    if (this._matchIntent(lowerContent, ['suivi', 'ou en est', 'tracking', 'position'])) {
      return await this._handleTracking(conversation);
    }
    if (this._matchIntent(lowerContent, ['valider', 'confirmer', 'reception'])) {
      return await this._handleValidation(conversation);
    }

    return this._getDefaultResponse();
  }

  _matchIntent(content, keywords) {
    return keywords.some(k => content.includes(k));
  }

  async _handleDeliveryRdv(conversation) {
    const pendingDeliveries = await this.deliveries.find({
      recipientId: conversation.organizationId,
      status: 'pending_rdv'
    }).limit(5).toArray();

    if (pendingDeliveries.length === 0) {
      return {
        content: "Aucune livraison en attente de RDV.\n\n" +
          "Vos prochaines livraisons planifiees seront affichees ici.",
        suggestions: ['Voir mes livraisons', 'Modifier un RDV', 'Historique']
      };
    }

    let content_resp = `**${pendingDeliveries.length}** livraison(s) en attente de RDV:\n\n`;
    pendingDeliveries.forEach((d, i) => {
      content_resp += `${i + 1}. **${d.reference}** - ${d.shipper || 'Expediteur'}\n`;
      content_resp += `   ${d.estimatedWeight || '?'} kg - ${d.palettes || '?'} palettes\n`;
    });

    return {
      content: content_resp + '\nSouhaitez-vous planifier un RDV ?',
      suggestions: ['Planifier RDV livraison 1', 'Voir les disponibilites', 'Refuser une livraison'],
      actions: [{ type: 'schedule_rdv', deliveries: pendingDeliveries.map(d => d.reference) }]
    };
  }

  async _handleDocuments(conversation) {
    const recentDocs = await this.documents.find({
      recipientId: conversation.organizationId
    }).sort({ createdAt: -1 }).limit(5).toArray();

    if (recentDocs.length === 0) {
      return {
        content: "Aucun document disponible pour le moment.\n\n" +
          "Vos CMR, bons de livraison et POD apparaitront ici apres reception.",
        suggestions: ['Rechercher un document', 'Mes livraisons']
      };
    }

    let content_resp = "**Documents recents:**\n\n";
    recentDocs.forEach((d, i) => {
      content_resp += `${i + 1}. **${d.type}** - ${d.reference}\n`;
      content_resp += `   ${new Date(d.createdAt).toLocaleDateString('fr-FR')}\n`;
    });

    return {
      content: content_resp,
      suggestions: ['Telecharger tout', 'Rechercher', 'Filtrer par date'],
      data: { docCount: recentDocs.length }
    };
  }

  async _handleTracking(conversation) {
    const inTransit = await this.deliveries.find({
      recipientId: conversation.organizationId,
      status: 'in_transit'
    }).toArray();

    if (inTransit.length === 0) {
      return {
        content: "Aucune livraison en cours actuellement.\n\n" +
          "Le suivi temps reel sera disponible des qu'un transport sera en route.",
        suggestions: ['Livraisons planifiees', 'Historique']
      };
    }

    let content_resp = `**${inTransit.length}** livraison(s) en cours:\n\n`;
    inTransit.forEach((d, i) => {
      content_resp += `${i + 1}. **${d.reference}**\n`;
      content_resp += `   ETA: ${d.eta ? new Date(d.eta).toLocaleString('fr-FR') : 'Calcul en cours...'}\n`;
    });

    return {
      content: content_resp,
      suggestions: ['Voir sur la carte', 'Alertes SMS', 'Contacter transporteur'],
      data: { inTransit: inTransit.length }
    };
  }

  async _handleValidation(conversation) {
    const toValidate = await this.deliveries.find({
      recipientId: conversation.organizationId,
      status: 'delivered',
      validated: false
    }).limit(5).toArray();

    if (toValidate.length === 0) {
      return {
        content: "Aucune livraison en attente de validation.\n\n" +
          "Toutes vos receptions ont ete confirmees.",
        suggestions: ['Historique', 'Signaler un probleme']
      };
    }

    let content_resp = `**${toValidate.length}** livraison(s) a valider:\n\n`;
    toValidate.forEach((d, i) => {
      content_resp += `${i + 1}. **${d.reference}** - Livre le ${new Date(d.deliveredAt).toLocaleDateString('fr-FR')}\n`;
    });

    return {
      content: content_resp + '\nSouhaitez-vous valider ces receptions ?',
      suggestions: ['Tout valider', 'Valider avec reserves', 'Signaler anomalie'],
      actions: [{ type: 'validate_delivery' }]
    };
  }

  _getDefaultResponse() {
    return {
      content: "Je suis l'assistant **Livraisons** pour les destinataires.\n\n" +
        "Je peux vous aider avec:\n" +
        "- **RDV**: Planifier vos receptions\n" +
        "- **Documents**: Consulter CMR et POD\n" +
        "- **Suivi**: Tracking temps reel\n" +
        "- **Validation**: Confirmer vos receptions\n\n" +
        "Que souhaitez-vous faire ?",
      suggestions: ['Planifier un RDV', 'Mes documents', 'Suivi temps reel', 'Valider reception']
    };
  }
}

// ============================================================================
// 5. EXPEDITION - ASSISTANT FOURNISSEURS
// ============================================================================

class ExpeditionAssistant extends BaseAssistant {
  constructor(db, eventEmitter = null) {
    super(db, eventEmitter, ChatbotTypes.EXPEDITION);
    this.shipments = db.collection('shipments');
    this.pickups = db.collection('pickups');
    this.carriers = db.collection('carriers');
  }

  async _generateResponse(conversation, content) {
    const lowerContent = content.toLowerCase();

    if (this._matchIntent(lowerContent, ['expedition', 'creer', 'nouvelle', 'envoyer'])) {
      return await this._handleCreateShipment(conversation);
    }
    if (this._matchIntent(lowerContent, ['prise en charge', 'enlevement', 'pickup'])) {
      return await this._handlePickupTracking(conversation);
    }
    if (this._matchIntent(lowerContent, ['transporteur', 'contacter', 'joindre'])) {
      return await this._handleCarrierContact(conversation);
    }
    if (this._matchIntent(lowerContent, ['document', 'etiquette', 'bordereau'])) {
      return await this._handleDocuments(conversation);
    }

    return this._getDefaultResponse();
  }

  _matchIntent(content, keywords) {
    return keywords.some(k => content.includes(k));
  }

  async _handleCreateShipment(conversation) {
    return {
      content: "**Creer une expedition**\n\n" +
        "Pour creer votre expedition, j'ai besoin de:\n\n" +
        "1. **Destinataire** (nom, adresse)\n" +
        "2. **Marchandise** (poids, dimensions, nb colis)\n" +
        "3. **Date d'enlevement souhaitee**\n" +
        "4. **Instructions particulieres** (optionnel)\n\n" +
        "Commencez par me donner l'adresse de destination.",
      suggestions: ['Repeter derniere expedition', 'Carnet d\'adresses', 'Expedition groupee'],
      actions: [{ type: 'create_shipment' }]
    };
  }

  async _handlePickupTracking(conversation) {
    const pendingPickups = await this.pickups.find({
      supplierId: conversation.organizationId,
      status: { $in: ['scheduled', 'in_progress'] }
    }).limit(5).toArray();

    if (pendingPickups.length === 0) {
      return {
        content: "Aucune prise en charge planifiee.\n\n" +
          "Creez une expedition pour programmer un enlevement.",
        suggestions: ['Creer une expedition', 'Historique des enlevements']
      };
    }

    let content_resp = `**${pendingPickups.length}** enlevement(s) prevu(s):\n\n`;
    pendingPickups.forEach((p, i) => {
      content_resp += `${i + 1}. **${p.reference}** - ${p.status === 'scheduled' ? 'Prevu' : 'En cours'}\n`;
      content_resp += `   ${new Date(p.scheduledDate).toLocaleDateString('fr-FR')} ${p.timeSlot || ''}\n`;
    });

    return {
      content: content_resp,
      suggestions: ['Details premier', 'Modifier horaire', 'Annuler enlevement'],
      data: { pickups: pendingPickups.length }
    };
  }

  async _handleCarrierContact(conversation) {
    const activeShipments = await this.shipments.find({
      supplierId: conversation.organizationId,
      status: { $in: ['in_transit', 'pickup_scheduled'] }
    }).limit(3).toArray();

    if (activeShipments.length === 0) {
      return {
        content: "Aucune expedition active.\n\n" +
          "Les coordonnees du transporteur seront disponibles une fois l'expedition en cours.",
        suggestions: ['Creer une expedition', 'Historique']
      };
    }

    let content_resp = "**Transporteurs de vos expeditions actives:**\n\n";
    activeShipments.forEach((s, i) => {
      content_resp += `${i + 1}. Expedition **${s.reference}**\n`;
      content_resp += `   Transporteur: ${s.carrier?.name || 'Non assigne'}\n`;
      if (s.carrier?.phone) {
        content_resp += `   Tel: ${s.carrier.phone}\n`;
      }
    });

    return {
      content: content_resp,
      suggestions: ['Appeler transporteur 1', 'Envoyer message', 'Signaler probleme']
    };
  }

  async _handleDocuments(conversation) {
    return {
      content: "**Documents d'expedition**\n\n" +
        "Je peux generer pour vous:\n" +
        "- Etiquettes d'expedition\n" +
        "- Bordereau d'envoi\n" +
        "- Liste de colisage\n" +
        "- CMR pre-rempli\n\n" +
        "Pour quelle expedition ?",
      suggestions: ['Derniere expedition', 'Rechercher par ref', 'Modeles personnalises'],
      actions: [{ type: 'generate_docs' }]
    };
  }

  _getDefaultResponse() {
    return {
      content: "Je suis l'assistant **Expedition** pour les fournisseurs.\n\n" +
        "Je peux vous aider avec:\n" +
        "- **Creer**: Nouvelle expedition\n" +
        "- **Suivre**: Vos prises en charge\n" +
        "- **Contacter**: Vos transporteurs\n" +
        "- **Documents**: Etiquettes et bordereaux\n\n" +
        "Que souhaitez-vous faire ?",
      suggestions: ['Creer expedition', 'Suivre enlevements', 'Contacter transporteur', 'Documents']
    };
  }
}

// ============================================================================
// 6. FREIGHT IA - ASSISTANT TRANSITAIRES
// ============================================================================

class FreightIAAssistant extends BaseAssistant {
  constructor(db, eventEmitter = null) {
    super(db, eventEmitter, ChatbotTypes.FREIGHT_IA);
    this.freightOffers = db.collection('freight_offers');
    this.routings = db.collection('routings');
    this.partnerCarriers = db.collection('partner_carriers');
  }

  async _generateResponse(conversation, content) {
    const lowerContent = content.toLowerCase();

    if (this._matchIntent(lowerContent, ['import', 'export', 'offre', 'cotation'])) {
      return await this._handleImportExport(conversation);
    }
    if (this._matchIntent(lowerContent, ['pre-acheminement', 'pré', 'collecte'])) {
      return await this._handlePreRouting(conversation);
    }
    if (this._matchIntent(lowerContent, ['post-acheminement', 'post', 'distribution'])) {
      return await this._handlePostRouting(conversation);
    }
    if (this._matchIntent(lowerContent, ['transporteur', 'partenaire', 'integration'])) {
      return await this._handleCarrierIntegration(conversation);
    }

    return this._getDefaultResponse();
  }

  _matchIntent(content, keywords) {
    return keywords.some(k => content.includes(k));
  }

  async _handleImportExport(conversation) {
    const activeOffers = await this.freightOffers.find({
      forwarderId: conversation.organizationId,
      status: 'active'
    }).limit(5).toArray();

    return {
      content: `**Offres Import/Export actives:** ${activeOffers.length}\n\n` +
        "Je peux vous aider a:\n" +
        "- Creer une cotation rapide\n" +
        "- Rechercher les meilleurs tarifs\n" +
        "- Comparer les delais\n\n" +
        "Quel type d'operation ?",
      suggestions: ['Cotation Import', 'Cotation Export', 'Mes offres actives', 'Historique'],
      data: { activeOffers: activeOffers.length }
    };
  }

  async _handlePreRouting(conversation) {
    return {
      content: "**Pre-acheminement**\n\n" +
        "Organisez la collecte vers le port/aeroport:\n\n" +
        "- **Origine**: Point de chargement\n" +
        "- **Destination**: Terminal de depart\n" +
        "- **Date limite**: Pour connexion maritime/aerienne\n\n" +
        "Indiquez-moi les details de votre collecte.",
      suggestions: ['Nouvelle collecte', 'Tarifs en cours', 'Transporteurs disponibles'],
      actions: [{ type: 'create_prerouting' }]
    };
  }

  async _handlePostRouting(conversation) {
    return {
      content: "**Post-acheminement**\n\n" +
        "Organisez la distribution depuis le terminal:\n\n" +
        "- **Origine**: Terminal d'arrivee\n" +
        "- **Destination**: Point de livraison final\n" +
        "- **Date arrivee**: Pour planification\n\n" +
        "Indiquez-moi les details de la distribution.",
      suggestions: ['Nouvelle distribution', 'Tarifs en cours', 'Planning livraisons'],
      actions: [{ type: 'create_postrouting' }]
    };
  }

  async _handleCarrierIntegration(conversation) {
    const partners = await this.partnerCarriers.find({
      forwarderId: conversation.organizationId
    }).toArray();

    return {
      content: `**Transporteurs partenaires:** ${partners.length}\n\n` +
        "Integrez vos transporteurs pour:\n" +
        "- Cotation automatique\n" +
        "- Suivi unifie\n" +
        "- Facturation consolidee\n\n" +
        "Que souhaitez-vous faire ?",
      suggestions: ['Ajouter partenaire', 'Gerer tarifs', 'Voir performances', 'Invitations en cours'],
      data: { partners: partners.length }
    };
  }

  _getDefaultResponse() {
    return {
      content: "Je suis l'assistant **Freight IA** pour les transitaires.\n\n" +
        "Je peux vous aider avec:\n" +
        "- **Import/Export**: Offres et cotations\n" +
        "- **Pre-acheminement**: Collectes\n" +
        "- **Post-acheminement**: Distribution\n" +
        "- **Partenaires**: Integration transporteurs\n\n" +
        "Que souhaitez-vous faire ?",
      suggestions: ['Offre Import/Export', 'Pre-acheminement', 'Post-acheminement', 'Mes partenaires']
    };
  }
}

// ============================================================================
// 7. COPILOTE CHAUFFEUR - ASSISTANT MOBILE CONDUCTEURS
// ============================================================================

class CopiloteChauffeurAssistant extends BaseAssistant {
  constructor(db, eventEmitter = null) {
    super(db, eventEmitter, ChatbotTypes.COPILOTE_CHAUFFEUR);
    this.missions = db.collection('driver_missions');
    this.statuses = db.collection('mission_statuses');
    this.signatures = db.collection('signatures');
    this.driverDocs = db.collection('driver_documents');
  }

  async _generateResponse(conversation, content) {
    const lowerContent = content.toLowerCase();

    if (this._matchIntent(lowerContent, ['mission', 'activer', 'demarrer', 'commencer'])) {
      return await this._handleMissionActivation(conversation);
    }
    if (this._matchIntent(lowerContent, ['statut', 'mettre a jour', 'position', 'eta'])) {
      return await this._handleStatusUpdate(conversation);
    }
    if (this._matchIntent(lowerContent, ['document', 'photo', 'deposer', 'cmr'])) {
      return await this._handleDocumentDeposit(conversation);
    }
    if (this._matchIntent(lowerContent, ['signer', 'signature', 'electronique'])) {
      return await this._handleSignature(conversation);
    }
    if (this._matchIntent(lowerContent, ['probleme', 'incident', 'retard'])) {
      return await this._handleIncident(conversation);
    }

    return this._getDefaultResponse();
  }

  _matchIntent(content, keywords) {
    return keywords.some(k => content.includes(k));
  }

  async _handleMissionActivation(conversation) {
    const missions = await this.missions.find({
      driverId: conversation.userId,
      status: { $in: ['assigned', 'pending'] }
    }).sort({ scheduledDate: 1 }).limit(3).toArray();

    if (missions.length === 0) {
      return {
        content: "Aucune mission assignee.\n\n" +
          "Vos prochaines missions apparaitront ici.",
        suggestions: ['Rafraichir', 'Contacter dispatch']
      };
    }

    let content_resp = `**${missions.length}** mission(s) a effectuer:\n\n`;
    missions.forEach((m, i) => {
      content_resp += `${i + 1}. **${m.reference}**\n`;
      content_resp += `   ${m.pickupAddress || 'Depart'} -> ${m.deliveryAddress || 'Arrivee'}\n`;
      content_resp += `   ${m.scheduledDate ? new Date(m.scheduledDate).toLocaleString('fr-FR') : 'A confirmer'}\n\n`;
    });

    return {
      content: content_resp + "Quelle mission souhaitez-vous activer ?",
      suggestions: ['Activer mission 1', 'Voir details', 'Contacter client'],
      actions: [{ type: 'activate_mission', missions: missions.map(m => m.reference) }]
    };
  }

  async _handleStatusUpdate(conversation) {
    const activeMission = await this.missions.findOne({
      driverId: conversation.userId,
      status: 'in_progress'
    });

    if (!activeMission) {
      return {
        content: "Aucune mission active.\n\n" +
          "Activez d'abord une mission pour mettre a jour le statut.",
        suggestions: ['Mes missions', 'Activer mission']
      };
    }

    return {
      content: `**Mission active:** ${activeMission.reference}\n\n` +
        "Quel est votre statut actuel ?",
      suggestions: [
        'En route vers chargement',
        'Arrive au chargement',
        'Chargement en cours',
        'En route vers livraison',
        'Arrive a livraison',
        'Dechargement en cours',
        'Mission terminee'
      ],
      actions: [{ type: 'update_status', missionId: activeMission._id }]
    };
  }

  async _handleDocumentDeposit(conversation) {
    return {
      content: "**Deposer un document**\n\n" +
        "Types de documents:\n" +
        "- CMR / Lettre de voiture\n" +
        "- Bon de livraison signe\n" +
        "- Photo marchandise\n" +
        "- Reserves / Anomalies\n\n" +
        "Prenez une photo ou selectionnez un fichier.",
      suggestions: ['Prendre photo', 'Galerie', 'Scanner code-barres'],
      actions: [{ type: 'upload_document' }]
    };
  }

  async _handleSignature(conversation) {
    const activeMission = await this.missions.findOne({
      driverId: conversation.userId,
      status: 'in_progress'
    });

    if (!activeMission) {
      return {
        content: "Aucune mission active.\n\n" +
          "La signature electronique est disponible une fois arrive a destination.",
        suggestions: ['Mes missions']
      };
    }

    return {
      content: `**Signature electronique**\n\n` +
        `Mission: ${activeMission.reference}\n` +
        `Client: ${activeMission.recipientName || 'Destinataire'}\n\n` +
        "Le client peut signer directement sur votre appareil.\n" +
        "Appuyez sur 'Commencer signature' quand pret.",
      suggestions: ['Commencer signature', 'Signature differee', 'Probleme de signature'],
      actions: [{ type: 'start_signature', missionId: activeMission._id }]
    };
  }

  async _handleIncident(conversation) {
    return {
      content: "**Signaler un incident**\n\n" +
        "Type d'incident:\n" +
        "- Retard prevu\n" +
        "- Probleme vehicule\n" +
        "- Marchandise endommagee\n" +
        "- Client absent\n" +
        "- Autre probleme\n\n" +
        "Quel type d'incident ?",
      suggestions: ['Retard', 'Probleme vehicule', 'Marchandise', 'Client absent', 'Autre'],
      actions: [{ type: 'report_incident' }]
    };
  }

  _getDefaultResponse() {
    return {
      content: "Je suis votre **Copilote Chauffeur**.\n\n" +
        "Je peux vous aider avec:\n" +
        "- **Mission**: Activer et suivre\n" +
        "- **Statut**: Mettre a jour votre position\n" +
        "- **Documents**: Deposer CMR/photos\n" +
        "- **Signature**: Faire signer le client\n" +
        "- **Incidents**: Signaler un probleme\n\n" +
        "Que souhaitez-vous faire ?",
      suggestions: ['Ma mission', 'Mettre a jour statut', 'Deposer document', 'Faire signer']
    };
  }
}

// ============================================================================
// FACTORY - CREATION D'ASSISTANTS
// ============================================================================

class AssistantFactory {
  static create(db, eventEmitter, chatbotType) {
    switch (chatbotType) {
      case ChatbotTypes.PLANIF_IA:
        return new PlanifIAAssistant(db, eventEmitter);
      case ChatbotTypes.ROUTIER:
        return new RoutierAssistant(db, eventEmitter);
      case ChatbotTypes.QUAI_WMS:
        return new QuaiWMSAssistant(db, eventEmitter);
      case ChatbotTypes.LIVRAISONS:
        return new LivraisonsAssistant(db, eventEmitter);
      case ChatbotTypes.EXPEDITION:
        return new ExpeditionAssistant(db, eventEmitter);
      case ChatbotTypes.FREIGHT_IA:
        return new FreightIAAssistant(db, eventEmitter);
      case ChatbotTypes.COPILOTE_CHAUFFEUR:
        return new CopiloteChauffeurAssistant(db, eventEmitter);
      default:
        throw new Error(`Type de chatbot inconnu: ${chatbotType}`);
    }
  }

  static createForUser(db, eventEmitter, userRole) {
    const chatbotType = RoleToChatbot[userRole];
    if (!chatbotType) {
      throw new Error(`Role utilisateur inconnu: ${userRole}`);
    }
    return AssistantFactory.create(db, eventEmitter, chatbotType);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  BaseAssistant,
  PlanifIAAssistant,
  RoutierAssistant,
  QuaiWMSAssistant,
  LivraisonsAssistant,
  ExpeditionAssistant,
  FreightIAAssistant,
  CopiloteChauffeurAssistant,
  AssistantFactory
};
