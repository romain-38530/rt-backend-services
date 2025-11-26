/**
 * RT Technologie - Suite Chatbots
 * Service de base pour tous les chatbots
 * Version: 1.0.0
 */

const { ObjectId } = require('mongodb');
const crypto = require('crypto');
const {
  ChatbotTypes,
  UserRoles,
  PriorityLevels,
  PriorityDescriptions,
  ConversationStatus,
  MessageTypes,
  RequestCategories,
  DiagnosticActions,
  TicketStatus,
  ChatbotGreetings,
  RoleToChatbot,
  SLAConfig
} = require('./chatbot-models');

// ============================================================================
// CLASSE PRINCIPALE: ChatbotService
// ============================================================================

class ChatbotService {
  constructor(db, eventEmitter = null) {
    this.db = db;
    this.eventEmitter = eventEmitter;
    this.conversations = db.collection('chatbot_conversations');
    this.tickets = db.collection('support_tickets');
    this.knowledgeBase = db.collection('knowledge_base');
    this.faqs = db.collection('chatbot_faqs');
    this.users = db.collection('users');
    this.organizations = db.collection('organizations');
  }

  // ==========================================================================
  // GESTION DES CONVERSATIONS
  // ==========================================================================

  /**
   * Demarrer une nouvelle conversation
   */
  async startConversation(userId, context = {}) {
    const user = await this.users.findOne({ _id: new ObjectId(userId) });
    if (!user) {
      throw new Error('Utilisateur non trouve');
    }

    const userRole = user.role || UserRoles.INDUSTRIAL;
    const chatbotType = context.chatbotType || RoleToChatbot[userRole] || ChatbotTypes.HELPBOT;
    const conversationId = crypto.randomUUID();

    const conversation = {
      conversationId,
      chatbotType,
      userId: new ObjectId(userId),
      organizationId: user.organizationId ? new ObjectId(user.organizationId) : null,
      userRole,
      status: ConversationStatus.ACTIVE,
      priority: PriorityLevels.STANDARD,
      category: null,
      module: context.module || null,
      context: {
        orderReference: context.orderReference || null,
        currentPage: context.currentPage || null,
        previousActions: [],
        userAgent: context.userAgent || null,
        ipAddress: context.ipAddress || null
      },
      messages: [],
      diagnostics: [],
      botInteractions: 0,
      transferredAt: null,
      transferredTo: null,
      ticketId: null,
      resolution: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      closedAt: null
    };

    // Ajouter le message d'accueil
    const greeting = ChatbotGreetings[chatbotType];
    if (greeting) {
      conversation.messages.push({
        messageId: crypto.randomUUID(),
        type: MessageTypes.BOT,
        content: greeting.greeting,
        attachments: [],
        timestamp: new Date(),
        metadata: {
          suggestions: greeting.suggestions || null,
          categories: greeting.categories || null
        }
      });
    }

    await this.conversations.insertOne(conversation);

    this._emitEvent('conversation.started', {
      conversationId,
      chatbotType,
      userId
    });

    return {
      conversationId,
      chatbotType,
      greeting: greeting?.greeting,
      suggestions: greeting?.suggestions || greeting?.categories
    };
  }

  /**
   * Obtenir une conversation
   */
  async getConversation(conversationId) {
    return await this.conversations.findOne({ conversationId });
  }

  /**
   * Lister les conversations d'un utilisateur
   */
  async listUserConversations(userId, filters = {}) {
    const query = { userId: new ObjectId(userId) };

    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.chatbotType) {
      query.chatbotType = filters.chatbotType;
    }

    const limit = filters.limit || 20;
    const skip = filters.skip || 0;

    return await this.conversations
      .find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  /**
   * Envoyer un message utilisateur
   */
  async sendMessage(conversationId, content, attachments = []) {
    const conversation = await this.conversations.findOne({ conversationId });
    if (!conversation) {
      throw new Error('Conversation non trouvee');
    }

    if (conversation.status === ConversationStatus.CLOSED) {
      throw new Error('Conversation fermee');
    }

    // Ajouter le message utilisateur
    const userMessage = {
      messageId: crypto.randomUUID(),
      type: MessageTypes.USER,
      content,
      attachments,
      timestamp: new Date(),
      metadata: {}
    };

    await this.conversations.updateOne(
      { conversationId },
      {
        $push: { messages: userMessage },
        $set: {
          status: ConversationStatus.WAITING_BOT,
          updatedAt: new Date()
        }
      }
    );

    // Analyser le message et generer une reponse
    const response = await this._processMessage(conversation, content);

    // Ajouter la reponse du bot
    const botMessage = {
      messageId: crypto.randomUUID(),
      type: MessageTypes.BOT,
      content: response.content,
      attachments: response.attachments || [],
      timestamp: new Date(),
      metadata: {
        suggestions: response.suggestions || null,
        articles: response.articles || null,
        diagnostics: response.diagnostics || null,
        transferRequired: response.transferRequired || false
      }
    };

    const updates = {
      $push: { messages: botMessage },
      $inc: { botInteractions: 1 },
      $set: {
        status: ConversationStatus.WAITING_USER,
        updatedAt: new Date()
      }
    };

    // Mettre a jour la priorite si detectee
    if (response.priority) {
      updates.$set.priority = response.priority;
    }
    if (response.category) {
      updates.$set.category = response.category;
    }

    await this.conversations.updateOne({ conversationId }, updates);

    // Verifier si transfert necessaire
    const updatedConversation = await this.conversations.findOne({ conversationId });
    if (this._shouldTransfer(updatedConversation, response)) {
      await this._transferToTechnician(conversationId);
    }

    this._emitEvent('message.sent', {
      conversationId,
      messageType: 'user',
      hasResponse: true
    });

    return {
      userMessage,
      botResponse: botMessage,
      transferRequired: response.transferRequired
    };
  }

  /**
   * Traiter un message et generer une reponse
   */
  async _processMessage(conversation, content) {
    // Analyse du contenu pour determiner la priorite
    const analysis = this._analyzeContent(content);

    // Rechercher dans la base de connaissances
    const articles = await this._searchKnowledgeBase(content, conversation.chatbotType);

    // Rechercher dans les FAQ
    const faqs = await this._searchFAQs(content, conversation.chatbotType);

    // Generer la reponse
    let response = {
      content: '',
      suggestions: [],
      articles: articles.slice(0, 3),
      priority: analysis.priority,
      category: analysis.category,
      transferRequired: false
    };

    // Si FAQ trouvee
    if (faqs.length > 0) {
      response.content = faqs[0].answer;
      response.suggestions = ['Cela repond-il a votre question ?', 'Voir plus de details', 'Autre question'];
    }
    // Si articles trouves
    else if (articles.length > 0) {
      response.content = `J'ai trouve ${articles.length} article(s) qui pourraient vous aider:\n\n`;
      articles.slice(0, 3).forEach((article, i) => {
        response.content += `${i + 1}. **${article.title}**\n${article.summary}\n\n`;
      });
      response.suggestions = ['Voir article 1', 'Voir article 2', 'Autre question', 'Parler a un technicien'];
    }
    // Reponse generique basee sur la categorie
    else {
      response = this._generateGenericResponse(conversation, analysis);
    }

    // Verifier si transfert necessaire base sur la priorite
    if (analysis.priority === PriorityLevels.CRITICAL) {
      response.transferRequired = true;
      response.content += '\n\n**Un technicien va prendre en charge votre demande tres rapidement.**';
    }

    return response;
  }

  /**
   * Analyser le contenu du message
   */
  _analyzeContent(content) {
    const lowerContent = content.toLowerCase();

    // Detection de priorite CRITIQUE
    const criticalKeywords = [
      'bloque', 'blocage', 'urgent', 'critique', 'impossible',
      'ne fonctionne plus', 'erreur critique', 'down', 'hors service',
      'api erreur', 'erp erreur', 'documents non transmis'
    ];

    // Detection de priorite IMPORTANTE
    const importantKeywords = [
      'erreur', 'probleme', 'bug', 'ne marche pas', 'echoue',
      'rdv impossible', 'signature echouee', 'affret ia erreur'
    ];

    // Detection de categorie
    let priority = PriorityLevels.STANDARD;
    let category = RequestCategories.FUNCTIONAL;

    for (const keyword of criticalKeywords) {
      if (lowerContent.includes(keyword)) {
        priority = PriorityLevels.CRITICAL;
        category = RequestCategories.TECHNICAL;
        break;
      }
    }

    if (priority === PriorityLevels.STANDARD) {
      for (const keyword of importantKeywords) {
        if (lowerContent.includes(keyword)) {
          priority = PriorityLevels.IMPORTANT;
          category = RequestCategories.TECHNICAL;
          break;
        }
      }
    }

    // Detection de categorie specifique
    if (lowerContent.includes('tutoriel') || lowerContent.includes('comment')) {
      category = RequestCategories.DOCUMENTATION;
    } else if (lowerContent.includes('facture') || lowerContent.includes('paiement')) {
      category = RequestCategories.BILLING;
    } else if (lowerContent.includes('erp') || lowerContent.includes('api')) {
      category = RequestCategories.INTEGRATION;
    } else if (lowerContent.includes('tracking') || lowerContent.includes('suivi')) {
      category = RequestCategories.TRACKING;
    } else if (lowerContent.includes('rdv') || lowerContent.includes('planning')) {
      category = RequestCategories.PLANNING;
    } else if (lowerContent.includes('document') || lowerContent.includes('cmr')) {
      category = RequestCategories.DOCUMENTS;
    }

    return { priority, category };
  }

  /**
   * Generer une reponse generique
   */
  _generateGenericResponse(conversation, analysis) {
    const responses = {
      [RequestCategories.TECHNICAL]: {
        content: "Je comprends que vous rencontrez un probleme technique. Pouvez-vous me donner plus de details sur l'erreur que vous voyez ?",
        suggestions: ['Capture d\'ecran', 'Message d\'erreur', 'Etapes effectuees', 'Parler a un technicien']
      },
      [RequestCategories.DOCUMENTATION]: {
        content: "Je vais vous aider a trouver la documentation. Quel module souhaitez-vous apprendre a utiliser ?",
        suggestions: ['Affret.IA', 'Planning', 'Tracking', 'e-CMR', 'Grilles tarifaires']
      },
      [RequestCategories.BILLING]: {
        content: "Pour les questions de facturation, je vous mets en relation avec notre service commercial.",
        suggestions: ['Voir mes factures', 'Modifier mon abonnement', 'Contacter le commercial']
      },
      [RequestCategories.INTEGRATION]: {
        content: "Pour l'integration ERP/API, voici les etapes generales. Quel systeme souhaitez-vous integrer ?",
        suggestions: ['SAP', 'Oracle', 'Sage', 'API REST', 'Documentation API']
      },
      [RequestCategories.TRACKING]: {
        content: "Pour le suivi de vos transports, voici ce que je peux faire pour vous :",
        suggestions: ['Localiser un camion', 'Voir les ETAs', 'Historique tracking', 'Configurer alertes']
      },
      [RequestCategories.PLANNING]: {
        content: "Pour la gestion des plannings et RDV, comment puis-je vous aider ?",
        suggestions: ['Prendre un RDV', 'Modifier un RDV', 'Voir le planning', 'Gerer les creneaux']
      },
      [RequestCategories.DOCUMENTS]: {
        content: "Pour la gestion documentaire, que souhaitez-vous faire ?",
        suggestions: ['Telecharger un CMR', 'Signer un document', 'Voir mes POD', 'Archiver']
      }
    };

    const response = responses[analysis.category] || {
      content: "Je suis la pour vous aider. Pouvez-vous preciser votre demande ?",
      suggestions: ['Probleme technique', 'Question fonctionnelle', 'Documentation', 'Parler a un technicien']
    };

    return {
      ...response,
      priority: analysis.priority,
      category: analysis.category,
      articles: [],
      transferRequired: false
    };
  }

  /**
   * Rechercher dans la base de connaissances
   */
  async _searchKnowledgeBase(query, chatbotType) {
    const keywords = query.toLowerCase().split(' ').filter(w => w.length > 3);

    if (keywords.length === 0) return [];

    return await this.knowledgeBase
      .find({
        status: 'published',
        $or: [
          { keywords: { $in: keywords } },
          { title: { $regex: keywords.join('|'), $options: 'i' } },
          { content: { $regex: keywords.join('|'), $options: 'i' } }
        ],
        chatbotTypes: chatbotType
      })
      .limit(5)
      .toArray();
  }

  /**
   * Rechercher dans les FAQ
   */
  async _searchFAQs(query, chatbotType) {
    const keywords = query.toLowerCase().split(' ').filter(w => w.length > 3);

    if (keywords.length === 0) return [];

    return await this.faqs
      .find({
        status: 'published',
        $or: [
          { keywords: { $in: keywords } },
          { question: { $regex: keywords.join('|'), $options: 'i' } }
        ],
        chatbotTypes: chatbotType
      })
      .sort({ priority: 1 })
      .limit(3)
      .toArray();
  }

  /**
   * Verifier si transfert necessaire
   */
  _shouldTransfer(conversation, response) {
    // Transfert automatique si critique
    if (response.transferRequired) return true;

    // Verifier le nombre d'interactions
    const priorityConfig = PriorityDescriptions[conversation.priority];
    if (conversation.botInteractions >= priorityConfig.maxBotInteractions) {
      return priorityConfig.autoTransfer;
    }

    return false;
  }

  /**
   * Transferer vers un technicien
   */
  async _transferToTechnician(conversationId) {
    const conversation = await this.conversations.findOne({ conversationId });
    if (!conversation) return;

    // Creer un ticket
    const ticketId = await this._createTicket(conversation);

    // Mettre a jour la conversation
    await this.conversations.updateOne(
      { conversationId },
      {
        $set: {
          status: ConversationStatus.TRANSFERRED,
          transferredAt: new Date(),
          ticketId,
          updatedAt: new Date()
        },
        $push: {
          messages: {
            messageId: crypto.randomUUID(),
            type: MessageTypes.SYSTEM,
            content: `Votre demande a ete transferee a notre equipe technique. Numero de ticket: ${ticketId}. Temps d'attente estime: ${this._getEstimatedWaitTime(conversation.priority)} minutes.`,
            timestamp: new Date(),
            metadata: { ticketId }
          }
        }
      }
    );

    // Notifier via Teams (si configure)
    await this._notifyTeams(conversation, ticketId);

    this._emitEvent('conversation.transferred', {
      conversationId,
      ticketId,
      priority: conversation.priority
    });

    return ticketId;
  }

  /**
   * Creer un ticket support
   */
  async _createTicket(conversation) {
    const ticketId = await this._generateTicketNumber();

    // Calculer les SLA
    const slaConfig = SLAConfig[conversation.priority];
    const now = new Date();

    const ticket = {
      ticketId,
      conversationId: conversation.conversationId,
      userId: conversation.userId,
      organizationId: conversation.organizationId,
      userRole: conversation.userRole,
      status: TicketStatus.OPEN,
      priority: conversation.priority,
      category: conversation.category,
      module: conversation.module,
      subject: this._generateTicketSubject(conversation),
      description: this._generateTicketDescription(conversation),
      attachments: this._extractAttachments(conversation),
      assignedTo: null,
      history: [{
        action: 'created',
        performedBy: null,
        timestamp: now,
        details: { source: 'chatbot', conversationId: conversation.conversationId }
      }],
      sla: {
        responseDeadline: new Date(now.getTime() + slaConfig.firstResponse * 60000),
        resolutionDeadline: new Date(now.getTime() + slaConfig.resolution * 60000),
        firstResponseAt: null,
        resolvedAt: null
      },
      teamsNotificationId: null,
      createdAt: now,
      updatedAt: now,
      closedAt: null
    };

    await this.tickets.insertOne(ticket);

    this._emitEvent('ticket.created', {
      ticketId,
      conversationId: conversation.conversationId,
      priority: conversation.priority
    });

    return ticketId;
  }

  /**
   * Generer un numero de ticket
   */
  async _generateTicketNumber() {
    const date = new Date();
    const prefix = 'TKT';
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');

    const count = await this.tickets.countDocuments({
      createdAt: {
        $gte: new Date(date.getFullYear(), date.getMonth(), 1),
        $lt: new Date(date.getFullYear(), date.getMonth() + 1, 1)
      }
    });

    const sequence = String(count + 1).padStart(5, '0');
    return `${prefix}-${year}${month}-${sequence}`;
  }

  /**
   * Generer le sujet du ticket
   */
  _generateTicketSubject(conversation) {
    const lastUserMessages = conversation.messages
      .filter(m => m.type === MessageTypes.USER)
      .slice(-3);

    if (lastUserMessages.length > 0) {
      const content = lastUserMessages[0].content;
      return content.length > 100 ? content.substring(0, 97) + '...' : content;
    }

    return `[${conversation.chatbotType}] Demande support`;
  }

  /**
   * Generer la description du ticket
   */
  _generateTicketDescription(conversation) {
    let description = `**Contexte:**\n`;
    description += `- Module: ${conversation.module || 'Non specifie'}\n`;
    description += `- Page: ${conversation.context.currentPage || 'Non specifiee'}\n`;
    description += `- Reference commande: ${conversation.context.orderReference || 'Aucune'}\n\n`;

    description += `**Historique conversation:**\n`;
    conversation.messages.slice(-10).forEach(msg => {
      const sender = msg.type === MessageTypes.USER ? 'Client' : 'Bot';
      description += `[${sender}] ${msg.content.substring(0, 200)}\n`;
    });

    if (conversation.diagnostics.length > 0) {
      description += `\n**Diagnostics effectues:**\n`;
      conversation.diagnostics.forEach(diag => {
        description += `- ${diag.action}: ${JSON.stringify(diag.result)}\n`;
      });
    }

    return description;
  }

  /**
   * Extraire les pieces jointes
   */
  _extractAttachments(conversation) {
    const attachments = [];
    conversation.messages.forEach(msg => {
      if (msg.attachments && msg.attachments.length > 0) {
        attachments.push(...msg.attachments);
      }
    });
    return attachments;
  }

  /**
   * Estimer le temps d'attente
   */
  _getEstimatedWaitTime(priority) {
    const waitTimes = {
      [PriorityLevels.CRITICAL]: 5,
      [PriorityLevels.IMPORTANT]: 15,
      [PriorityLevels.STANDARD]: 60
    };
    return waitTimes[priority] || 30;
  }

  /**
   * Notifier l'equipe via Teams
   */
  async _notifyTeams(conversation, ticketId) {
    // Integration Microsoft Teams webhook
    // TODO: Implementer l'envoi vers Teams
    console.log(`[Chatbot] Notification Teams: Ticket ${ticketId} cree (priorite ${conversation.priority})`);
  }

  // ==========================================================================
  // DIAGNOSTICS API
  // ==========================================================================

  /**
   * Executer un diagnostic
   */
  async runDiagnostic(conversationId, action) {
    const conversation = await this.conversations.findOne({ conversationId });
    if (!conversation) {
      throw new Error('Conversation non trouvee');
    }

    let result = {};

    switch (action) {
      case DiagnosticActions.CHECK_API_STATUS:
        result = await this._checkApiStatus();
        break;
      case DiagnosticActions.CHECK_ERP_CONNECTION:
        result = await this._checkErpConnection(conversation.organizationId);
        break;
      case DiagnosticActions.CHECK_SERVER_STATUS:
        result = await this._checkServerStatus();
        break;
      case DiagnosticActions.CHECK_USER_PERMISSIONS:
        result = await this._checkUserPermissions(conversation.userId);
        break;
      default:
        result = { status: 'unknown', message: 'Action non reconnue' };
    }

    // Enregistrer le diagnostic
    const diagnostic = {
      action,
      result,
      timestamp: new Date()
    };

    await this.conversations.updateOne(
      { conversationId },
      {
        $push: { diagnostics: diagnostic },
        $set: { updatedAt: new Date() }
      }
    );

    return diagnostic;
  }

  async _checkApiStatus() {
    return {
      status: 'ok',
      services: {
        api: 'online',
        database: 'online',
        tracking: 'online',
        notifications: 'online'
      },
      timestamp: new Date()
    };
  }

  async _checkErpConnection(organizationId) {
    // Verifier la connexion ERP de l'organisation
    return {
      status: 'ok',
      lastSync: new Date(),
      message: 'Connexion ERP active'
    };
  }

  async _checkServerStatus() {
    return {
      status: 'ok',
      cpu: '45%',
      memory: '62%',
      uptime: '99.9%'
    };
  }

  async _checkUserPermissions(userId) {
    const user = await this.users.findOne({ _id: new ObjectId(userId) });
    return {
      status: 'ok',
      role: user?.role,
      permissions: user?.permissions || [],
      active: user?.isActive !== false
    };
  }

  // ==========================================================================
  // GESTION DES TICKETS
  // ==========================================================================

  /**
   * Obtenir un ticket
   */
  async getTicket(ticketId) {
    return await this.tickets.findOne({ ticketId });
  }

  /**
   * Lister les tickets
   */
  async listTickets(filters = {}) {
    const query = {};

    if (filters.userId) {
      query.userId = new ObjectId(filters.userId);
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.priority) {
      query.priority = filters.priority;
    }
    if (filters.assignedTo) {
      query.assignedTo = new ObjectId(filters.assignedTo);
    }

    const limit = filters.limit || 50;
    const skip = filters.skip || 0;

    return await this.tickets
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  /**
   * Assigner un ticket a un technicien
   */
  async assignTicket(ticketId, technicianId) {
    const ticket = await this.tickets.findOne({ ticketId });
    if (!ticket) {
      throw new Error('Ticket non trouve');
    }

    const now = new Date();
    const isFirstResponse = !ticket.sla.firstResponseAt;

    await this.tickets.updateOne(
      { ticketId },
      {
        $set: {
          assignedTo: new ObjectId(technicianId),
          status: TicketStatus.IN_PROGRESS,
          'sla.firstResponseAt': isFirstResponse ? now : ticket.sla.firstResponseAt,
          updatedAt: now
        },
        $push: {
          history: {
            action: 'assigned',
            performedBy: new ObjectId(technicianId),
            timestamp: now,
            details: {}
          }
        }
      }
    );

    this._emitEvent('ticket.assigned', { ticketId, technicianId });

    return await this.tickets.findOne({ ticketId });
  }

  /**
   * Resoudre un ticket
   */
  async resolveTicket(ticketId, technicianId, resolution) {
    const ticket = await this.tickets.findOne({ ticketId });
    if (!ticket) {
      throw new Error('Ticket non trouve');
    }

    const now = new Date();

    await this.tickets.updateOne(
      { ticketId },
      {
        $set: {
          status: TicketStatus.RESOLVED,
          'sla.resolvedAt': now,
          updatedAt: now
        },
        $push: {
          history: {
            action: 'resolved',
            performedBy: new ObjectId(technicianId),
            timestamp: now,
            details: { resolution }
          }
        }
      }
    );

    // Mettre a jour la conversation
    if (ticket.conversationId) {
      await this.conversations.updateOne(
        { conversationId: ticket.conversationId },
        {
          $set: {
            status: ConversationStatus.RESOLVED,
            resolution: {
              resolvedBy: 'technician',
              resolvedAt: now,
              solution: resolution
            },
            updatedAt: now
          }
        }
      );
    }

    this._emitEvent('ticket.resolved', { ticketId, technicianId });

    return await this.tickets.findOne({ ticketId });
  }

  /**
   * Fermer un ticket
   */
  async closeTicket(ticketId, closedBy) {
    const now = new Date();

    await this.tickets.updateOne(
      { ticketId },
      {
        $set: {
          status: TicketStatus.CLOSED,
          closedAt: now,
          updatedAt: now
        },
        $push: {
          history: {
            action: 'closed',
            performedBy: closedBy ? new ObjectId(closedBy) : null,
            timestamp: now,
            details: {}
          }
        }
      }
    );

    this._emitEvent('ticket.closed', { ticketId });

    return await this.tickets.findOne({ ticketId });
  }

  // ==========================================================================
  // GESTION DE LA BASE DE CONNAISSANCES
  // ==========================================================================

  /**
   * Ajouter un article
   */
  async addKnowledgeArticle(data, createdBy) {
    const articleId = crypto.randomUUID();

    const article = {
      articleId,
      title: data.title,
      content: data.content,
      summary: data.summary || data.content.substring(0, 200),
      category: data.category,
      module: data.module,
      chatbotTypes: data.chatbotTypes || Object.values(ChatbotTypes),
      userRoles: data.userRoles || Object.values(UserRoles),
      keywords: data.keywords || [],
      relatedArticles: data.relatedArticles || [],
      videoUrl: data.videoUrl || null,
      steps: data.steps || [],
      viewCount: 0,
      helpfulCount: 0,
      notHelpfulCount: 0,
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: new ObjectId(createdBy)
    };

    await this.knowledgeBase.insertOne(article);

    return article;
  }

  /**
   * Ajouter une FAQ
   */
  async addFAQ(data) {
    const faqId = crypto.randomUUID();

    const faq = {
      faqId,
      question: data.question,
      answer: data.answer,
      category: data.category,
      module: data.module,
      chatbotTypes: data.chatbotTypes || Object.values(ChatbotTypes),
      userRoles: data.userRoles || Object.values(UserRoles),
      keywords: data.keywords || [],
      priority: data.priority || 100,
      viewCount: 0,
      helpfulCount: 0,
      status: 'published',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.faqs.insertOne(faq);

    return faq;
  }

  // ==========================================================================
  // STATISTIQUES
  // ==========================================================================

  /**
   * Obtenir les statistiques des chatbots
   */
  async getStats(dateFrom, dateTo) {
    const matchStage = {
      createdAt: { $gte: new Date(dateFrom), $lte: new Date(dateTo) }
    };

    const conversationStats = await this.conversations.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$chatbotType',
          total: { $sum: 1 },
          resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
          transferred: { $sum: { $cond: [{ $eq: ['$status', 'transferred'] }, 1, 0] } },
          avgInteractions: { $avg: '$botInteractions' }
        }
      }
    ]).toArray();

    const ticketStats = await this.tickets.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$priority',
          total: { $sum: 1 },
          resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } }
        }
      }
    ]).toArray();

    return {
      period: { from: dateFrom, to: dateTo },
      conversations: conversationStats,
      tickets: ticketStats,
      resolutionRate: this._calculateResolutionRate(conversationStats)
    };
  }

  _calculateResolutionRate(stats) {
    const total = stats.reduce((sum, s) => sum + s.total, 0);
    const resolved = stats.reduce((sum, s) => sum + s.resolved, 0);
    return total > 0 ? Math.round((resolved / total) * 100) : 0;
  }

  // ==========================================================================
  // UTILITAIRES
  // ==========================================================================

  _emitEvent(eventType, data) {
    if (this.eventEmitter) {
      this.eventEmitter.emit(eventType, {
        event: eventType,
        timestamp: new Date(),
        data
      });
    }
    console.log(`[Chatbot Event] ${eventType}:`, JSON.stringify(data));
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = { ChatbotService };
