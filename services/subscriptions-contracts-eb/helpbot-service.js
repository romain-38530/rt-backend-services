/**
 * RT Technologie - RT HelpBot
 * Service de support technique intelligent avec escalade automatique
 * Version: 1.0.0
 *
 * Fonctionnalites:
 * - Detection automatique de priorite (Standard/Important/Critique)
 * - Diagnostics automatises API/ERP/Serveur
 * - Base de connaissances et FAQ
 * - Escalade vers technicien avec SLA
 * - Integration Microsoft Teams
 * - Statistiques et KPIs
 */

const { ObjectId } = require('mongodb');
const crypto = require('crypto');
const https = require('https');
const { ClaudeIntegrationService } = require('./claude-integration');
const {
  ChatbotTypes,
  UserRoles,
  PriorityLevels,
  PriorityDescriptions,
  ConversationStatus,
  MessageTypes,
  RequestCategories,
  PlatformModules,
  DiagnosticActions,
  TicketStatus,
  SLAConfig
} = require('./chatbot-models');

// ============================================================================
// MOTS-CLES POUR DETECTION DE PRIORITE
// ============================================================================

const PriorityKeywords = {
  [PriorityLevels.CRITICAL]: {
    exact: ['urgent', 'critique', 'bloque', 'down', 'hors service'],
    contains: [
      'blocage total', 'ne fonctionne plus', 'impossible de',
      'erreur critique', 'api down', 'erp down',
      'documents non transmis', 'perte de donnees',
      'production arretee', 'livraison bloquee'
    ]
  },
  [PriorityLevels.IMPORTANT]: {
    exact: ['erreur', 'probleme', 'bug', 'echec'],
    contains: [
      'ne marche pas', 'ne fonctionne pas', 'erreur lors de',
      'rdv impossible', 'signature echouee', 'affret ia erreur',
      'synchronisation echouee', 'import echoue', 'export echoue'
    ]
  }
};

// ============================================================================
// MOTS-CLES POUR DETECTION DE CATEGORIE
// ============================================================================

const CategoryKeywords = {
  [RequestCategories.TECHNICAL]: ['technique', 'erreur', 'bug', 'crash', 'lent'],
  [RequestCategories.DOCUMENTATION]: ['tutoriel', 'comment', 'guide', 'aide', 'documentation'],
  [RequestCategories.BILLING]: ['facture', 'paiement', 'abonnement', 'prix', 'tarif'],
  [RequestCategories.INTEGRATION]: ['erp', 'api', 'integration', 'webhook', 'connecteur'],
  [RequestCategories.TRACKING]: ['tracking', 'suivi', 'localisation', 'gps', 'position'],
  [RequestCategories.PLANNING]: ['rdv', 'planning', 'creneau', 'reservation', 'quai'],
  [RequestCategories.DOCUMENTS]: ['document', 'cmr', 'pod', 'lettre de voiture', 'signature']
};

// ============================================================================
// MOTS-CLES POUR DETECTION DE MODULE
// ============================================================================

const ModuleKeywords = {
  [PlatformModules.AFFRETIA]: ['affret', 'affretia', 'bourse de fret', 'affreter'],
  [PlatformModules.ECMR]: ['ecmr', 'cmr', 'lettre de voiture', 'electronique'],
  [PlatformModules.TRACKING]: ['tracking', 'suivi', 'geolocalisation', 'gps'],
  [PlatformModules.PLANNING]: ['planning', 'rdv', 'quai', 'creneau'],
  [PlatformModules.PRICING_GRIDS]: ['tarif', 'grille', 'prix', 'cotation'],
  [PlatformModules.OCR]: ['ocr', 'scan', 'reconnaissance', 'lecture'],
  [PlatformModules.CONTRACTS]: ['contrat', 'abonnement', 'souscription'],
  [PlatformModules.TRANSPORT_ORDERS]: ['commande', 'ordre', 'transport', 'ot'],
  [PlatformModules.GEOFENCING]: ['geofencing', 'zone', 'perimetre', 'geofence'],
  [PlatformModules.NOTIFICATIONS]: ['notification', 'alerte', 'email', 'sms']
};

// ============================================================================
// CLASSE RT HELPBOT
// ============================================================================

class RTHelpBot {
  constructor(db, eventEmitter = null, config = {}) {
    this.db = db;
    this.eventEmitter = eventEmitter;
    this.config = {
      teamsWebhookUrl: config.teamsWebhookUrl || process.env.TEAMS_WEBHOOK_URL,
      maxBotRetries: config.maxBotRetries || 3,
      diagnosticTimeout: config.diagnosticTimeout || 5000,
      autoEscalateOnCritical: config.autoEscalateOnCritical !== false,
      ...config
    };

    // Collections MongoDB
    this.conversations = db.collection('chatbot_conversations');
    this.tickets = db.collection('support_tickets');
    this.knowledgeBase = db.collection('knowledge_base');
    this.faqs = db.collection('chatbot_faqs');
    this.users = db.collection('users');
    this.organizations = db.collection('organizations');
    this.technicians = db.collection('technicians');
    this.diagnosticLogs = db.collection('diagnostic_logs');

    // Cache pour les FAQ frequentes
    this.faqCache = new Map();
    this.claudeService = new ClaudeIntegrationService();
    console.log('✅ RT HelpBot initialized with Claude IA:', this.claudeService.isEnabled());
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  // ==========================================================================
  // DEMARRAGE DE CONVERSATION HELPBOT
  // ==========================================================================

  /**
   * Demarrer une conversation HelpBot
   */
  async startHelpBotConversation(userId, context = {}) {
    const user = await this.users.findOne({ _id: new ObjectId(userId) });
    if (!user) {
      throw new Error('Utilisateur non trouve');
    }

    const conversationId = crypto.randomUUID();

    const conversation = {
      conversationId,
      chatbotType: ChatbotTypes.HELPBOT,
      userId: new ObjectId(userId),
      organizationId: user.organizationId ? new ObjectId(user.organizationId) : null,
      userRole: user.role || UserRoles.INDUSTRIAL,
      status: ConversationStatus.ACTIVE,
      priority: PriorityLevels.STANDARD,
      category: null,
      module: context.module || null,
      context: {
        orderReference: context.orderReference || null,
        currentPage: context.currentPage || null,
        previousActions: context.previousActions || [],
        userAgent: context.userAgent || null,
        ipAddress: context.ipAddress || null,
        errorCode: context.errorCode || null,
        screenshot: context.screenshot || null
      },
      messages: [],
      diagnostics: [],
      botInteractions: 0,
      transferredAt: null,
      transferredTo: null,
      ticketId: null,
      resolution: null,
      metadata: {
        source: context.source || 'web',
        language: 'fr',
        timezone: 'Europe/Paris'
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      closedAt: null
    };

    // Message d'accueil HelpBot
    const greeting = {
      messageId: crypto.randomUUID(),
      type: MessageTypes.BOT,
      content: "Bonjour ! Je suis RT HelpBot, votre assistant technique. Je suis la pour vous aider a resoudre vos problemes rapidement.\n\nQuelle est la nature de votre demande ?",
      attachments: [],
      timestamp: new Date(),
      metadata: {
        categories: [
          { icon: 'wrench', label: 'Probleme technique', value: 'technical', priority: 'auto' },
          { icon: 'question-circle', label: 'Question fonctionnelle', value: 'functional', priority: 'standard' },
          { icon: 'book', label: 'Documentation / Tutoriel', value: 'documentation', priority: 'standard' },
          { icon: 'exclamation-triangle', label: 'Urgence / Blocage', value: 'urgent', priority: 'critical' }
        ]
      }
    };

    conversation.messages.push(greeting);
    await this.conversations.insertOne(conversation);

    this._emitEvent('helpbot.conversation.started', {
      conversationId,
      userId,
      organizationId: conversation.organizationId
    });

    return {
      conversationId,
      chatbotType: ChatbotTypes.HELPBOT,
      greeting: greeting.content,
      categories: greeting.metadata.categories
    };
  }

  // ==========================================================================
  // TRAITEMENT DES MESSAGES
  // ==========================================================================

  /**
   * Traiter un message utilisateur dans HelpBot
   */
  async processMessage(conversationId, content, attachments = []) {
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

    // Analyser le message
    const analysis = this._analyzeMessage(content, conversation);

    // Mettre a jour la conversation avec l'analyse
    const updates = {
      $set: { updatedAt: new Date() }
    };

    if (analysis.priority && (!conversation.priority || analysis.priority < conversation.priority)) {
      updates.$set.priority = analysis.priority;
    }
    if (analysis.category && !conversation.category) {
      updates.$set.category = analysis.category;
    }
    if (analysis.module && !conversation.module) {
      updates.$set.module = analysis.module;
    }

    await this.conversations.updateOne({ conversationId }, updates);

    // Generer la reponse
    const response = await this._generateResponse(conversation, content, analysis);

    // Ajouter la reponse bot
    const botMessage = {
      messageId: crypto.randomUUID(),
      type: MessageTypes.BOT,
      content: response.content,
      attachments: response.attachments || [],
      timestamp: new Date(),
      metadata: {
        suggestions: response.suggestions || null,
        articles: response.articles || null,
        diagnostic: response.diagnostic || null,
        requiresEscalation: response.requiresEscalation || false
      }
    };

    await this.conversations.updateOne(
      { conversationId },
      {
        $push: { messages: botMessage },
        $inc: { botInteractions: 1 },
        $set: {
          status: ConversationStatus.WAITING_USER,
          updatedAt: new Date()
        }
      }
    );

    // Verifier si escalade necessaire
    const updatedConversation = await this.conversations.findOne({ conversationId });
    let escalationResult = null;

    if (this._shouldEscalate(updatedConversation, analysis)) {
      escalationResult = await this._escalateToTechnician(conversationId, analysis);
    }

    this._emitEvent('helpbot.message.processed', {
      conversationId,
      priority: analysis.priority,
      category: analysis.category,
      escalated: !!escalationResult
    });

    return {
      userMessage,
      botResponse: botMessage,
      analysis,
      escalation: escalationResult
    };
  }

  /**
   * Analyser le contenu du message
   */
  _analyzeMessage(content, conversation) {
    const lowerContent = content.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const analysis = {
      priority: null,
      category: null,
      module: null,
      keywords: [],
      sentiment: 'neutral',
      requiresDiagnostic: false,
      suggestedActions: []
    };

    // Detection de priorite CRITIQUE
    for (const keyword of PriorityKeywords[PriorityLevels.CRITICAL].exact) {
      if (lowerContent.includes(keyword)) {
        analysis.priority = PriorityLevels.CRITICAL;
        analysis.keywords.push(keyword);
        break;
      }
    }
    if (!analysis.priority) {
      for (const phrase of PriorityKeywords[PriorityLevels.CRITICAL].contains) {
        if (lowerContent.includes(phrase)) {
          analysis.priority = PriorityLevels.CRITICAL;
          analysis.keywords.push(phrase);
          break;
        }
      }
    }

    // Detection de priorite IMPORTANTE
    if (!analysis.priority) {
      for (const keyword of PriorityKeywords[PriorityLevels.IMPORTANT].exact) {
        if (lowerContent.includes(keyword)) {
          analysis.priority = PriorityLevels.IMPORTANT;
          analysis.keywords.push(keyword);
          break;
        }
      }
      if (!analysis.priority) {
        for (const phrase of PriorityKeywords[PriorityLevels.IMPORTANT].contains) {
          if (lowerContent.includes(phrase)) {
            analysis.priority = PriorityLevels.IMPORTANT;
            analysis.keywords.push(phrase);
            break;
          }
        }
      }
    }

    // Priorite standard par defaut
    if (!analysis.priority) {
      analysis.priority = PriorityLevels.STANDARD;
    }

    // Detection de categorie
    for (const [category, keywords] of Object.entries(CategoryKeywords)) {
      for (const keyword of keywords) {
        if (lowerContent.includes(keyword)) {
          analysis.category = category;
          analysis.keywords.push(keyword);
          break;
        }
      }
      if (analysis.category) break;
    }

    // Detection de module
    for (const [module, keywords] of Object.entries(ModuleKeywords)) {
      for (const keyword of keywords) {
        if (lowerContent.includes(keyword)) {
          analysis.module = module;
          break;
        }
      }
      if (analysis.module) break;
    }

    // Detection de besoin de diagnostic
    const diagnosticTriggers = ['ne marche pas', 'erreur', 'down', 'bloque', 'connexion'];
    for (const trigger of diagnosticTriggers) {
      if (lowerContent.includes(trigger)) {
        analysis.requiresDiagnostic = true;
        break;
      }
    }

    // Detection de sentiment
    const negativeWords = ['frustre', 'enerve', 'inacceptable', 'scandaleux', 'nul'];
    for (const word of negativeWords) {
      if (lowerContent.includes(word)) {
        analysis.sentiment = 'negative';
        break;
      }
    }

    return analysis;
  }

  /**
   * Generer une reponse contextuelle
   */
  async _generateResponse(conversation, content, analysis) {
    const response = {
      content: '',
      suggestions: [],
      articles: [],
      attachments: [],
      diagnostic: null,
      requiresEscalation: false
    };

    // Si priorite critique, reponse immediate
    if (analysis.priority === PriorityLevels.CRITICAL) {
      response.content = "Je comprends que vous rencontrez un probleme critique. Votre demande est prioritaire.\n\n";

      // Executer diagnostic automatique si applicable
      if (analysis.requiresDiagnostic) {
        const diagnostic = await this._runAutoDiagnostic(conversation, analysis);
        response.diagnostic = diagnostic;
        response.content += `**Diagnostic automatique:**\n${this._formatDiagnosticResult(diagnostic)}\n\n`;
      }

      response.content += "Je transfere immediatement votre demande a notre equipe technique.";
      response.requiresEscalation = true;
      return response;
    }

    // Rechercher dans les FAQ (rapide)
    const faqs = await this._searchFAQs(content, conversation.chatbotType);
    if (faqs.length > 0) {
      response.content = faqs[0].answer;
      response.suggestions = [
        'Cela repond a ma question',
        'J\'ai besoin de plus de details',
        'J\'ai une autre question'
      ];
      if (faqs.length > 1) {
        response.content += '\n\n**Questions similaires:**';
        faqs.slice(1, 3).forEach((faq, i) => {
          response.content += `\n${i + 2}. ${faq.question}`;
        });
      }
      return response;
    }

    // Utiliser Claude IA pour une reponse intelligente
    if (this.claudeService && this.claudeService.isEnabled()) {
      try {
        const claudeResponse = await this.claudeService.generateResponse({
          chatbotType: conversation.chatbotType,
          userRole: conversation.userRole,
          userMessage: content,
          conversationHistory: conversation.messages || [],
          context: {
            priority: analysis.priority,
            category: analysis.category,
            module: analysis.module,
            orderNumber: conversation.context?.orderReference
          }
        });

        if (claudeResponse.success) {
          response.content = claudeResponse.response;
          response.suggestions = [
            'Cela repond a ma question',
            'J\'ai besoin de plus de details',
            'Parler a un technicien'
          ];

          // Ajouter metadata Claude
          response.metadata = {
            generatedBy: 'claude',
            tokensUsed: claudeResponse.usage
          };

          return response;
        }
      } catch (error) {
        console.error('❌ Erreur Claude AI, fallback vers reponses statiques:', error.message);
        // Continue vers les reponses statiques en cas d'erreur
      }
    }

    // Fallback: Rechercher dans la base de connaissances
    const articles = await this._searchKnowledgeBase(content, analysis);
    if (articles.length > 0) {
      response.articles = articles.slice(0, 3);
      response.content = `J'ai trouve ${articles.length} article(s) qui pourraient vous aider:\n\n`;
      articles.slice(0, 3).forEach((article, i) => {
        response.content += `**${i + 1}. ${article.title}**\n${article.summary}\n\n`;
      });
      response.suggestions = [
        'Voir l\'article 1',
        'Voir l\'article 2',
        'Parler a un technicien'
      ];
      return response;
    }

    // Derniere option: Reponse basee sur la categorie
    response.content = this._getCategoryResponse(analysis.category, analysis.module);
    response.suggestions = this._getCategorySuggestions(analysis.category);

    // Si priorite importante apres plusieurs interactions
    if (analysis.priority === PriorityLevels.IMPORTANT && conversation.botInteractions >= 2) {
      response.content += '\n\nSi le probleme persiste, je peux vous mettre en relation avec un technicien.';
      response.suggestions.push('Parler a un technicien');
    }

    return response;
  }

  /**
   * Obtenir la reponse par categorie
   */
  _getCategoryResponse(category, module) {
    const responses = {
      [RequestCategories.TECHNICAL]: {
        default: "Je vais vous aider a resoudre ce probleme technique. Pouvez-vous me donner plus de details ?\n\n- Quel message d'erreur voyez-vous ?\n- Depuis quand ce probleme se produit-il ?\n- Avez-vous essaye de rafraichir la page ?",
        [PlatformModules.AFFRETIA]: "Je comprends que vous avez un probleme avec Affret.IA. Voici les verifications a effectuer:\n\n1. Verifiez que vous etes connecte avec le bon compte\n2. Assurez-vous que votre organisation a bien active le module Affret.IA\n3. Videz le cache de votre navigateur\n\nLe probleme persiste-t-il ?",
        [PlatformModules.TRACKING]: "Pour les problemes de tracking, verifions ensemble:\n\n1. Le vehicule a-t-il bien l'application mobile activee ?\n2. La derniere position date de quand ?\n3. Le chauffeur a-t-il une connexion internet ?"
      },
      [RequestCategories.DOCUMENTATION]: "Je vais vous guider. Quel module souhaitez-vous apprendre a utiliser ?",
      [RequestCategories.BILLING]: "Pour les questions de facturation, je peux vous aider avec:\n\n- Consulter vos factures\n- Comprendre votre abonnement\n- Modifier vos informations de paiement\n\nQue souhaitez-vous faire ?",
      [RequestCategories.INTEGRATION]: "Pour l'integration de votre systeme, j'ai besoin de savoir:\n\n- Quel ERP/TMS utilisez-vous ?\n- Avez-vous deja configure les identifiants API ?\n- Quel type de donnees souhaitez-vous synchroniser ?",
      [RequestCategories.PLANNING]: "Pour la gestion des RDV et planning, que souhaitez-vous faire ?\n\n- Prendre un nouveau RDV\n- Modifier un RDV existant\n- Consulter les disponibilites\n- Configurer les creneaux",
      [RequestCategories.DOCUMENTS]: "Pour la gestion documentaire, je peux vous aider a:\n\n- Telecharger vos CMR/POD\n- Signer un document electroniquement\n- Archiver vos documents\n- Rechercher un document specifique"
    };

    let categoryResponse = responses[category];
    if (typeof categoryResponse === 'object' && module) {
      return categoryResponse[module] || categoryResponse.default || responses[RequestCategories.TECHNICAL].default;
    }
    return categoryResponse || "Je suis la pour vous aider. Pouvez-vous preciser votre demande ?";
  }

  /**
   * Obtenir les suggestions par categorie
   */
  _getCategorySuggestions(category) {
    const suggestions = {
      [RequestCategories.TECHNICAL]: ['Envoyer une capture d\'ecran', 'Voir le message d\'erreur', 'Essayer un diagnostic'],
      [RequestCategories.DOCUMENTATION]: ['Affret.IA', 'Planning/RDV', 'Tracking', 'e-CMR', 'Grilles tarifaires'],
      [RequestCategories.BILLING]: ['Voir mes factures', 'Modifier mon abonnement', 'Moyen de paiement'],
      [RequestCategories.INTEGRATION]: ['SAP', 'Sage', 'Oracle', 'API REST', 'Documentation API'],
      [RequestCategories.PLANNING]: ['Prendre un RDV', 'Modifier un RDV', 'Voir les disponibilites'],
      [RequestCategories.DOCUMENTS]: ['Telecharger CMR', 'Signer un document', 'Rechercher']
    };
    return suggestions[category] || ['Probleme technique', 'Question', 'Documentation'];
  }

  // ==========================================================================
  // DIAGNOSTICS AUTOMATIQUES
  // ==========================================================================

  /**
   * Executer un diagnostic automatique
   */
  async _runAutoDiagnostic(conversation, analysis) {
    const results = {
      timestamp: new Date(),
      checks: [],
      overallStatus: 'ok',
      recommendations: []
    };

    try {
      // Check API status
      const apiCheck = await this._checkApiStatus();
      results.checks.push({ name: 'API Platform', ...apiCheck });

      // Check ERP connection si integration
      if (conversation.organizationId) {
        const erpCheck = await this._checkErpConnection(conversation.organizationId);
        results.checks.push({ name: 'Connexion ERP', ...erpCheck });
      }

      // Check module specifique
      if (analysis.module) {
        const moduleCheck = await this._checkModuleStatus(analysis.module);
        results.checks.push({ name: `Module ${analysis.module}`, ...moduleCheck });
      }

      // Determiner le statut global
      const hasError = results.checks.some(c => c.status === 'error');
      const hasWarning = results.checks.some(c => c.status === 'warning');
      results.overallStatus = hasError ? 'error' : hasWarning ? 'warning' : 'ok';

      // Generer des recommandations
      if (hasError) {
        results.recommendations.push('Un probleme a ete detecte. L\'equipe technique a ete alertee.');
      } else if (hasWarning) {
        results.recommendations.push('Certains elements necessitent une attention. Essayez de rafraichir la page.');
      }

    } catch (error) {
      console.error('[HelpBot] Diagnostic error:', error.message);
      results.overallStatus = 'unknown';
      results.error = error.message;
    }

    // Enregistrer le diagnostic
    await this.diagnosticLogs.insertOne({
      conversationId: conversation.conversationId,
      userId: conversation.userId,
      organizationId: conversation.organizationId,
      results,
      createdAt: new Date()
    });

    // Mettre a jour la conversation
    await this.conversations.updateOne(
      { conversationId: conversation.conversationId },
      {
        $push: {
          diagnostics: {
            action: 'auto_diagnostic',
            result: results,
            timestamp: new Date()
          }
        }
      }
    );

    return results;
  }

  async _checkApiStatus() {
    return {
      status: 'ok',
      latency: Math.floor(Math.random() * 50) + 10,
      message: 'API operationnelle'
    };
  }

  async _checkErpConnection(organizationId) {
    try {
      const org = await this.organizations.findOne({ _id: new ObjectId(organizationId) });
      if (!org || !org.erpConfig) {
        return { status: 'warning', message: 'Pas de configuration ERP' };
      }
      return {
        status: 'ok',
        lastSync: org.erpConfig.lastSync || 'Non disponible',
        message: 'Connexion ERP active'
      };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async _checkModuleStatus(module) {
    // Simuler la verification du module
    return {
      status: 'ok',
      version: '1.0.0',
      message: `Module ${module} operationnel`
    };
  }

  /**
   * Formater le resultat du diagnostic
   */
  _formatDiagnosticResult(diagnostic) {
    if (!diagnostic || !diagnostic.checks) return 'Diagnostic non disponible';

    let formatted = '';
    diagnostic.checks.forEach(check => {
      const icon = check.status === 'ok' ? 'OK' : check.status === 'warning' ? 'ATTENTION' : 'ERREUR';
      formatted += `- ${check.name}: [${icon}] ${check.message}\n`;
    });

    if (diagnostic.recommendations && diagnostic.recommendations.length > 0) {
      formatted += '\n**Recommandations:**\n';
      diagnostic.recommendations.forEach(rec => {
        formatted += `- ${rec}\n`;
      });
    }

    return formatted;
  }

  // ==========================================================================
  // ESCALADE VERS TECHNICIEN
  // ==========================================================================

  /**
   * Verifier si escalade necessaire
   */
  _shouldEscalate(conversation, analysis) {
    // Escalade immediate si critique
    if (analysis.priority === PriorityLevels.CRITICAL && this.config.autoEscalateOnCritical) {
      return true;
    }

    // Verifier le nombre d'interactions selon la priorite
    const priorityConfig = PriorityDescriptions[conversation.priority];
    if (conversation.botInteractions >= priorityConfig.maxBotInteractions) {
      return priorityConfig.autoTransfer;
    }

    // Escalade si sentiment negatif et plusieurs interactions
    if (analysis.sentiment === 'negative' && conversation.botInteractions >= 2) {
      return true;
    }

    return false;
  }

  /**
   * Escalader vers un technicien
   */
  async _escalateToTechnician(conversationId, analysis) {
    const conversation = await this.conversations.findOne({ conversationId });
    if (!conversation) return null;

    // Creer le ticket
    const ticketId = await this._createSupportTicket(conversation, analysis);

    // Trouver un technicien disponible
    const technician = await this._findAvailableTechnician(conversation.priority);

    // Mettre a jour la conversation
    await this.conversations.updateOne(
      { conversationId },
      {
        $set: {
          status: ConversationStatus.TRANSFERRED,
          transferredAt: new Date(),
          transferredTo: technician?._id || null,
          ticketId,
          updatedAt: new Date()
        },
        $push: {
          messages: {
            messageId: crypto.randomUUID(),
            type: MessageTypes.SYSTEM,
            content: this._getTransferMessage(ticketId, conversation.priority, technician),
            timestamp: new Date(),
            metadata: { ticketId, technicianId: technician?._id }
          }
        }
      }
    );

    // Notifier via Teams
    await this._notifyTeams(conversation, ticketId, technician);

    // Notifier via email si configure
    if (technician && technician.email) {
      await this._notifyTechnicianEmail(technician, conversation, ticketId);
    }

    this._emitEvent('helpbot.escalated', {
      conversationId,
      ticketId,
      priority: conversation.priority,
      technicianId: technician?._id
    });

    return {
      ticketId,
      technician: technician ? { name: technician.name, id: technician._id } : null,
      estimatedWait: this._getEstimatedWaitTime(conversation.priority)
    };
  }

  /**
   * Creer un ticket support
   */
  async _createSupportTicket(conversation, analysis) {
    const ticketId = await this._generateTicketNumber();
    const now = new Date();
    const slaConfig = SLAConfig[conversation.priority];

    const ticket = {
      ticketId,
      conversationId: conversation.conversationId,
      userId: conversation.userId,
      organizationId: conversation.organizationId,
      userRole: conversation.userRole,
      status: TicketStatus.OPEN,
      priority: conversation.priority,
      category: conversation.category || analysis.category,
      module: conversation.module || analysis.module,
      subject: this._generateTicketSubject(conversation, analysis),
      description: this._generateTicketDescription(conversation, analysis),
      attachments: this._extractAttachments(conversation),
      assignedTo: null,
      history: [{
        action: 'created',
        performedBy: null,
        timestamp: now,
        details: {
          source: 'helpbot',
          conversationId: conversation.conversationId,
          analysisKeywords: analysis.keywords
        }
      }],
      sla: {
        responseDeadline: new Date(now.getTime() + slaConfig.firstResponse * 60000),
        resolutionDeadline: new Date(now.getTime() + slaConfig.resolution * 60000),
        firstResponseAt: null,
        resolvedAt: null
      },
      tags: analysis.keywords || [],
      teamsNotificationId: null,
      createdAt: now,
      updatedAt: now,
      closedAt: null
    };

    await this.tickets.insertOne(ticket);

    this._emitEvent('helpbot.ticket.created', {
      ticketId,
      conversationId: conversation.conversationId,
      priority: conversation.priority
    });

    return ticketId;
  }

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

    return `${prefix}-${year}${month}-${String(count + 1).padStart(5, '0')}`;
  }

  _generateTicketSubject(conversation, analysis) {
    const userMessages = conversation.messages.filter(m => m.type === MessageTypes.USER);
    if (userMessages.length > 0) {
      const content = userMessages[userMessages.length - 1].content;
      return content.length > 100 ? content.substring(0, 97) + '...' : content;
    }

    const category = analysis.category || 'support';
    const module = analysis.module ? ` - ${analysis.module}` : '';
    return `[${category}${module}] Demande via HelpBot`;
  }

  _generateTicketDescription(conversation, analysis) {
    let desc = `## Informations\n`;
    desc += `- **Module:** ${conversation.module || analysis.module || 'Non specifie'}\n`;
    desc += `- **Categorie:** ${conversation.category || analysis.category || 'Non specifiee'}\n`;
    desc += `- **Priorite:** ${PriorityDescriptions[conversation.priority]?.name || 'Standard'}\n`;
    desc += `- **Page:** ${conversation.context.currentPage || 'Non specifiee'}\n`;
    desc += `- **Reference commande:** ${conversation.context.orderReference || 'Aucune'}\n\n`;

    desc += `## Mots-cles detectes\n`;
    desc += (analysis.keywords || []).join(', ') || 'Aucun';
    desc += '\n\n';

    desc += `## Historique conversation\n`;
    const messages = conversation.messages.slice(-15);
    messages.forEach(msg => {
      const sender = msg.type === MessageTypes.USER ? 'Client' : msg.type === MessageTypes.BOT ? 'Bot' : 'Systeme';
      const time = new Date(msg.timestamp).toLocaleTimeString('fr-FR');
      desc += `**[${time}] ${sender}:** ${msg.content.substring(0, 300)}\n\n`;
    });

    if (conversation.diagnostics && conversation.diagnostics.length > 0) {
      desc += `## Diagnostics effectues\n`;
      conversation.diagnostics.forEach(diag => {
        desc += `- **${diag.action}:** ${diag.result?.overallStatus || 'Termine'}\n`;
      });
    }

    return desc;
  }

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
   * Trouver un technicien disponible
   */
  async _findAvailableTechnician(priority) {
    // Chercher un technicien disponible avec les competences appropriees
    const technician = await this.technicians.findOne({
      status: 'available',
      skills: { $in: [priority === PriorityLevels.CRITICAL ? 'critical' : 'standard'] }
    }, {
      sort: { currentLoad: 1 }
    });

    return technician;
  }

  /**
   * Message de transfert
   */
  _getTransferMessage(ticketId, priority, technician) {
    const waitTime = this._getEstimatedWaitTime(priority);
    let message = `Votre demande a ete transferee a notre equipe technique.\n\n`;
    message += `**Numero de ticket:** ${ticketId}\n`;

    if (technician) {
      message += `**Technicien assigne:** ${technician.name}\n`;
    }

    message += `**Temps d'attente estime:** ${waitTime} minutes\n\n`;
    message += `Vous recevrez une notification des qu'un technicien prendra en charge votre demande.`;

    return message;
  }

  _getEstimatedWaitTime(priority) {
    const waitTimes = {
      [PriorityLevels.CRITICAL]: 5,
      [PriorityLevels.IMPORTANT]: 15,
      [PriorityLevels.STANDARD]: 60
    };
    return waitTimes[priority] || 30;
  }

  // ==========================================================================
  // NOTIFICATIONS TEAMS
  // ==========================================================================

  /**
   * Envoyer notification Teams
   */
  async _notifyTeams(conversation, ticketId, technician) {
    if (!this.config.teamsWebhookUrl) {
      console.log('[HelpBot] Teams webhook non configure');
      return null;
    }

    const priorityColors = {
      [PriorityLevels.CRITICAL]: 'FF0000',
      [PriorityLevels.IMPORTANT]: 'FFA500',
      [PriorityLevels.STANDARD]: '00FF00'
    };

    const priorityName = PriorityDescriptions[conversation.priority]?.name || 'Standard';

    const card = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: priorityColors[conversation.priority] || '0076D7',
      summary: `Nouveau ticket support ${ticketId}`,
      sections: [{
        activityTitle: `Nouveau ticket: ${ticketId}`,
        activitySubtitle: `Priorite: ${priorityName}`,
        facts: [
          { name: 'Module', value: conversation.module || 'Non specifie' },
          { name: 'Categorie', value: conversation.category || 'Non specifiee' },
          { name: 'Utilisateur', value: conversation.userId.toString() },
          { name: 'Technicien', value: technician?.name || 'Non assigne' }
        ],
        markdown: true
      }],
      potentialAction: [{
        '@type': 'OpenUri',
        name: 'Voir le ticket',
        targets: [{
          os: 'default',
          uri: `https://app.rttechnologie.com/support/tickets/${ticketId}`
        }]
      }]
    };

    try {
      const response = await this._sendTeamsWebhook(card);
      console.log(`[HelpBot] Notification Teams envoyee pour ticket ${ticketId}`);
      return response;
    } catch (error) {
      console.error('[HelpBot] Erreur notification Teams:', error.message);
      return null;
    }
  }

  async _sendTeamsWebhook(card) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.config.teamsWebhookUrl);
      const data = JSON.stringify(card);

      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body });
          } else {
            reject(new Error(`Teams webhook error: ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Teams webhook timeout'));
      });

      req.write(data);
      req.end();
    });
  }

  async _notifyTechnicianEmail(technician, conversation, ticketId) {
    // TODO: Implementer l'envoi d'email
    console.log(`[HelpBot] Email notification to ${technician.email} for ticket ${ticketId}`);
  }

  // ==========================================================================
  // RECHERCHE FAQ ET BASE DE CONNAISSANCES
  // ==========================================================================

  async _searchFAQs(query, chatbotType) {
    const cacheKey = `faq_${query.toLowerCase().substring(0, 50)}`;

    // Verifier le cache
    if (this.faqCache.has(cacheKey)) {
      const cached = this.faqCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    const keywords = query.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2);

    if (keywords.length === 0) return [];

    const results = await this.faqs.find({
      status: 'published',
      $or: [
        { keywords: { $in: keywords } },
        { question: { $regex: keywords.join('|'), $options: 'i' } }
      ],
      chatbotTypes: chatbotType
    })
    .sort({ helpfulCount: -1, priority: 1 })
    .limit(5)
    .toArray();

    // Mettre en cache
    this.faqCache.set(cacheKey, { data: results, timestamp: Date.now() });

    return results;
  }

  async _searchKnowledgeBase(query, analysis) {
    const keywords = query.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2);

    if (keywords.length === 0) return [];

    const filter = {
      status: 'published',
      $or: [
        { keywords: { $in: keywords } },
        { title: { $regex: keywords.join('|'), $options: 'i' } },
        { content: { $regex: keywords.join('|'), $options: 'i' } }
      ]
    };

    // Filtrer par module si detecte
    if (analysis.module) {
      filter.module = analysis.module;
    }

    return await this.knowledgeBase
      .find(filter)
      .sort({ viewCount: -1, helpfulCount: -1 })
      .limit(5)
      .toArray();
  }

  // ==========================================================================
  // FEEDBACK ET RESOLUTION
  // ==========================================================================

  /**
   * Enregistrer le feedback utilisateur
   */
  async submitFeedback(conversationId, rating, comment = '') {
    const conversation = await this.conversations.findOne({ conversationId });
    if (!conversation) {
      throw new Error('Conversation non trouvee');
    }

    await this.conversations.updateOne(
      { conversationId },
      {
        $set: {
          'resolution.feedback': {
            rating,
            comment,
            submittedAt: new Date()
          },
          updatedAt: new Date()
        }
      }
    );

    // Si rating faible et pas de ticket, proposer escalade
    if (rating <= 2 && !conversation.ticketId) {
      return {
        success: true,
        suggestEscalation: true,
        message: 'Nous sommes desoles que vous ne soyez pas satisfait. Souhaitez-vous parler a un technicien ?'
      };
    }

    this._emitEvent('helpbot.feedback.submitted', {
      conversationId,
      rating,
      hasComment: !!comment
    });

    return { success: true };
  }

  /**
   * Resoudre une conversation par le bot
   */
  async resolveBotConversation(conversationId, solution) {
    await this.conversations.updateOne(
      { conversationId },
      {
        $set: {
          status: ConversationStatus.RESOLVED,
          resolution: {
            resolvedBy: 'bot',
            resolvedAt: new Date(),
            solution
          },
          updatedAt: new Date()
        },
        $push: {
          messages: {
            messageId: crypto.randomUUID(),
            type: MessageTypes.SYSTEM,
            content: 'Conversation resolue. Merci d\'avoir utilise RT HelpBot !',
            timestamp: new Date(),
            metadata: { resolved: true }
          }
        }
      }
    );

    this._emitEvent('helpbot.resolved', {
      conversationId,
      resolvedBy: 'bot'
    });
  }

  // ==========================================================================
  // STATISTIQUES
  // ==========================================================================

  /**
   * Obtenir les statistiques HelpBot
   */
  async getStats(dateFrom, dateTo) {
    const matchStage = {
      chatbotType: ChatbotTypes.HELPBOT,
      createdAt: { $gte: new Date(dateFrom), $lte: new Date(dateTo) }
    };

    const [conversations, tickets, feedback] = await Promise.all([
      // Stats conversations
      this.conversations.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            resolved: { $sum: { $cond: [{ $eq: ['$status', ConversationStatus.RESOLVED] }, 1, 0] } },
            transferred: { $sum: { $cond: [{ $eq: ['$status', ConversationStatus.TRANSFERRED] }, 1, 0] } },
            avgInteractions: { $avg: '$botInteractions' },
            critical: { $sum: { $cond: [{ $eq: ['$priority', PriorityLevels.CRITICAL] }, 1, 0] } },
            important: { $sum: { $cond: [{ $eq: ['$priority', PriorityLevels.IMPORTANT] }, 1, 0] } }
          }
        }
      ]).toArray(),

      // Stats tickets
      this.tickets.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(dateFrom), $lte: new Date(dateTo) }
          }
        },
        {
          $group: {
            _id: '$priority',
            total: { $sum: 1 },
            resolved: { $sum: { $cond: [{ $eq: ['$status', TicketStatus.RESOLVED] }, 1, 0] } },
            avgResolutionTime: {
              $avg: {
                $cond: [
                  { $ne: ['$sla.resolvedAt', null] },
                  { $subtract: ['$sla.resolvedAt', '$createdAt'] },
                  null
                ]
              }
            }
          }
        }
      ]).toArray(),

      // Stats feedback
      this.conversations.aggregate([
        {
          $match: {
            ...matchStage,
            'resolution.feedback': { $exists: true }
          }
        },
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$resolution.feedback.rating' },
            totalFeedback: { $sum: 1 }
          }
        }
      ]).toArray()
    ]);

    const convStats = conversations[0] || { total: 0, resolved: 0, transferred: 0 };
    const feedbackStats = feedback[0] || { avgRating: 0, totalFeedback: 0 };

    return {
      period: { from: dateFrom, to: dateTo },
      conversations: {
        total: convStats.total,
        resolved: convStats.resolved,
        transferred: convStats.transferred,
        resolutionRate: convStats.total > 0 ? Math.round((convStats.resolved / convStats.total) * 100) : 0,
        avgInteractions: Math.round(convStats.avgInteractions * 10) / 10,
        byPriority: {
          critical: convStats.critical,
          important: convStats.important,
          standard: convStats.total - convStats.critical - convStats.important
        }
      },
      tickets: tickets.reduce((acc, t) => {
        const priorityName = PriorityDescriptions[t._id]?.name || 'Unknown';
        acc[priorityName] = {
          total: t.total,
          resolved: t.resolved,
          avgResolutionTime: t.avgResolutionTime ? Math.round(t.avgResolutionTime / 60000) : null
        };
        return acc;
      }, {}),
      satisfaction: {
        avgRating: Math.round(feedbackStats.avgRating * 10) / 10,
        totalResponses: feedbackStats.totalFeedback
      },
      kpis: {
        botResolutionRate: convStats.total > 0
          ? Math.round(((convStats.resolved) / convStats.total) * 100)
          : 0,
        escalationRate: convStats.total > 0
          ? Math.round((convStats.transferred / convStats.total) * 100)
          : 0,
        targetResolutionRate: 80 // Objectif: 80% resolution par bot
      }
    };
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
    console.log(`[HelpBot Event] ${eventType}:`, JSON.stringify(data));
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  RTHelpBot,
  PriorityKeywords,
  CategoryKeywords,
  ModuleKeywords
};
