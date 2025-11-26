/**
 * RT Technologie - Routes API Chatbots
 * Endpoints pour la Suite Chatbots intelligents
 * Version: 1.0.0
 */

const express = require('express');
const { ObjectId } = require('mongodb');
const { ChatbotService } = require('./chatbot-service');
const { RTHelpBot } = require('./helpbot-service');
const { AssistantFactory } = require('./specialized-assistants');
const {
  ChatbotTypes,
  UserRoles,
  PriorityLevels,
  ConversationStatus,
  TicketStatus,
  RoleToChatbot
} = require('./chatbot-models');

/**
 * Creer le router des chatbots
 */
function createChatbotRoutes(db, eventEmitter = null) {
  const router = express.Router();

  // Initialiser les services
  const chatbotService = new ChatbotService(db, eventEmitter);
  const helpBot = new RTHelpBot(db, eventEmitter);

  // Cache des assistants specialises
  const assistantCache = new Map();

  /**
   * Obtenir ou creer un assistant specialise
   */
  function getAssistant(chatbotType) {
    if (!assistantCache.has(chatbotType)) {
      const assistant = AssistantFactory.create(db, eventEmitter, chatbotType);
      assistantCache.set(chatbotType, assistant);
    }
    return assistantCache.get(chatbotType);
  }

  // ==========================================================================
  // MIDDLEWARE D'AUTHENTIFICATION
  // ==========================================================================

  const authenticateUser = async (req, res, next) => {
    try {
      // Recuperer le token d'authentification
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token d\'authentification requis' });
      }

      const token = authHeader.split(' ')[1];

      // Verifier le token (a adapter selon votre systeme d'auth)
      const sessions = db.collection('sessions');
      const session = await sessions.findOne({ token, expiresAt: { $gt: new Date() } });

      if (!session) {
        return res.status(401).json({ error: 'Session invalide ou expiree' });
      }

      // Recuperer l'utilisateur
      const users = db.collection('users');
      const user = await users.findOne({ _id: new ObjectId(session.userId) });

      if (!user) {
        return res.status(401).json({ error: 'Utilisateur non trouve' });
      }

      req.user = user;
      req.userId = user._id.toString();
      req.userRole = user.role;
      req.organizationId = user.organizationId;

      next();
    } catch (error) {
      console.error('[Chatbot Auth Error]', error.message);
      res.status(500).json({ error: 'Erreur d\'authentification' });
    }
  };

  // Middleware optionnel pour les routes publiques
  const optionalAuth = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        await authenticateUser(req, res, next);
      } else {
        next();
      }
    } catch (error) {
      next();
    }
  };

  // ==========================================================================
  // ROUTES CONVERSATIONS
  // ==========================================================================

  /**
   * POST /api/chatbot/conversations
   * Demarrer une nouvelle conversation
   */
  router.post('/conversations', authenticateUser, async (req, res) => {
    try {
      const { chatbotType, context } = req.body;

      // Determiner le type de chatbot
      let finalChatbotType = chatbotType;
      if (!finalChatbotType) {
        finalChatbotType = RoleToChatbot[req.userRole] || ChatbotTypes.HELPBOT;
      }

      let result;

      // Router vers le bon service
      if (finalChatbotType === ChatbotTypes.HELPBOT) {
        result = await helpBot.startHelpBotConversation(req.userId, {
          ...context,
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip
        });
      } else {
        const assistant = getAssistant(finalChatbotType);
        result = await assistant.startConversation(req.userId, {
          ...context,
          userAgent: req.headers['user-agent']
        });
      }

      res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('[Chatbot] Error starting conversation:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/chatbot/conversations
   * Lister les conversations de l'utilisateur
   */
  router.get('/conversations', authenticateUser, async (req, res) => {
    try {
      const { status, chatbotType, limit, skip } = req.query;

      const conversations = await chatbotService.listUserConversations(req.userId, {
        status,
        chatbotType,
        limit: parseInt(limit) || 20,
        skip: parseInt(skip) || 0
      });

      res.json({
        success: true,
        data: conversations,
        count: conversations.length
      });
    } catch (error) {
      console.error('[Chatbot] Error listing conversations:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/chatbot/conversations/:conversationId
   * Obtenir une conversation
   */
  router.get('/conversations/:conversationId', authenticateUser, async (req, res) => {
    try {
      const conversation = await chatbotService.getConversation(req.params.conversationId);

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation non trouvee' });
      }

      // Verifier que l'utilisateur a acces a cette conversation
      if (conversation.userId.toString() !== req.userId) {
        return res.status(403).json({ error: 'Acces non autorise' });
      }

      res.json({
        success: true,
        data: conversation
      });
    } catch (error) {
      console.error('[Chatbot] Error getting conversation:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/chatbot/conversations/:conversationId/messages
   * Envoyer un message dans une conversation
   */
  router.post('/conversations/:conversationId/messages', authenticateUser, async (req, res) => {
    try {
      const { conversationId } = req.params;
      const { content, attachments } = req.body;

      if (!content || content.trim() === '') {
        return res.status(400).json({ error: 'Contenu du message requis' });
      }

      // Recuperer la conversation pour determiner le type
      const conversation = await chatbotService.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation non trouvee' });
      }

      // Verifier l'acces
      if (conversation.userId.toString() !== req.userId) {
        return res.status(403).json({ error: 'Acces non autorise' });
      }

      let result;

      // Router vers le bon service
      if (conversation.chatbotType === ChatbotTypes.HELPBOT) {
        result = await helpBot.processMessage(conversationId, content, attachments || []);
      } else {
        const assistant = getAssistant(conversation.chatbotType);
        result = await assistant.sendMessage(conversationId, content, attachments || []);
      }

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('[Chatbot] Error sending message:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/chatbot/conversations/:conversationId/close
   * Fermer une conversation
   */
  router.post('/conversations/:conversationId/close', authenticateUser, async (req, res) => {
    try {
      const { conversationId } = req.params;
      const { feedback } = req.body;

      const conversations = db.collection('chatbot_conversations');
      const conversation = await conversations.findOne({ conversationId });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation non trouvee' });
      }

      if (conversation.userId.toString() !== req.userId) {
        return res.status(403).json({ error: 'Acces non autorise' });
      }

      await conversations.updateOne(
        { conversationId },
        {
          $set: {
            status: ConversationStatus.CLOSED,
            closedAt: new Date(),
            updatedAt: new Date(),
            'resolution.feedback': feedback
          }
        }
      );

      res.json({
        success: true,
        message: 'Conversation fermee'
      });
    } catch (error) {
      console.error('[Chatbot] Error closing conversation:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/chatbot/conversations/:conversationId/feedback
   * Soumettre un feedback
   */
  router.post('/conversations/:conversationId/feedback', authenticateUser, async (req, res) => {
    try {
      const { conversationId } = req.params;
      const { rating, comment } = req.body;

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Note entre 1 et 5 requise' });
      }

      const result = await helpBot.submitFeedback(conversationId, rating, comment);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('[Chatbot] Error submitting feedback:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/chatbot/conversations/:conversationId/escalate
   * Demander une escalade vers un technicien
   */
  router.post('/conversations/:conversationId/escalate', authenticateUser, async (req, res) => {
    try {
      const { conversationId } = req.params;
      const { reason } = req.body;

      const conversation = await chatbotService.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation non trouvee' });
      }

      if (conversation.userId.toString() !== req.userId) {
        return res.status(403).json({ error: 'Acces non autorise' });
      }

      // Forcer l'escalade
      const result = await helpBot._escalateToTechnician(conversationId, {
        priority: PriorityLevels.IMPORTANT,
        category: conversation.category,
        keywords: [reason || 'escalade manuelle']
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('[Chatbot] Error escalating:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================================================
  // ROUTES DIAGNOSTICS
  // ==========================================================================

  /**
   * POST /api/chatbot/conversations/:conversationId/diagnostic
   * Executer un diagnostic
   */
  router.post('/conversations/:conversationId/diagnostic', authenticateUser, async (req, res) => {
    try {
      const { conversationId } = req.params;
      const { action } = req.body;

      if (!action) {
        return res.status(400).json({ error: 'Action de diagnostic requise' });
      }

      const result = await chatbotService.runDiagnostic(conversationId, action);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('[Chatbot] Error running diagnostic:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================================================
  // ROUTES TICKETS
  // ==========================================================================

  /**
   * GET /api/chatbot/tickets
   * Lister les tickets de l'utilisateur
   */
  router.get('/tickets', authenticateUser, async (req, res) => {
    try {
      const { status, priority, limit, skip } = req.query;

      const tickets = await chatbotService.listTickets({
        userId: req.userId,
        status,
        priority: priority ? parseInt(priority) : undefined,
        limit: parseInt(limit) || 50,
        skip: parseInt(skip) || 0
      });

      res.json({
        success: true,
        data: tickets,
        count: tickets.length
      });
    } catch (error) {
      console.error('[Chatbot] Error listing tickets:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/chatbot/tickets/:ticketId
   * Obtenir un ticket
   */
  router.get('/tickets/:ticketId', authenticateUser, async (req, res) => {
    try {
      const ticket = await chatbotService.getTicket(req.params.ticketId);

      if (!ticket) {
        return res.status(404).json({ error: 'Ticket non trouve' });
      }

      // Verifier l'acces
      if (ticket.userId.toString() !== req.userId && req.userRole !== UserRoles.TECHNICIAN) {
        return res.status(403).json({ error: 'Acces non autorise' });
      }

      res.json({
        success: true,
        data: ticket
      });
    } catch (error) {
      console.error('[Chatbot] Error getting ticket:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================================================
  // ROUTES TECHNICIENS
  // ==========================================================================

  /**
   * Middleware technicien
   */
  const technicianOnly = (req, res, next) => {
    if (req.userRole !== UserRoles.TECHNICIAN && req.userRole !== UserRoles.ADMIN) {
      return res.status(403).json({ error: 'Acces reserve aux techniciens' });
    }
    next();
  };

  /**
   * GET /api/chatbot/technician/tickets
   * Lister tous les tickets (techniciens)
   */
  router.get('/technician/tickets', authenticateUser, technicianOnly, async (req, res) => {
    try {
      const { status, priority, assignedTo, limit, skip } = req.query;

      const tickets = await chatbotService.listTickets({
        status,
        priority: priority ? parseInt(priority) : undefined,
        assignedTo: assignedTo || undefined,
        limit: parseInt(limit) || 50,
        skip: parseInt(skip) || 0
      });

      res.json({
        success: true,
        data: tickets,
        count: tickets.length
      });
    } catch (error) {
      console.error('[Chatbot] Error listing technician tickets:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/chatbot/technician/tickets/:ticketId/assign
   * Assigner un ticket a un technicien
   */
  router.post('/technician/tickets/:ticketId/assign', authenticateUser, technicianOnly, async (req, res) => {
    try {
      const { ticketId } = req.params;
      const { technicianId } = req.body;

      const assignTo = technicianId || req.userId;
      const ticket = await chatbotService.assignTicket(ticketId, assignTo);

      res.json({
        success: true,
        data: ticket
      });
    } catch (error) {
      console.error('[Chatbot] Error assigning ticket:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/chatbot/technician/tickets/:ticketId/resolve
   * Resoudre un ticket
   */
  router.post('/technician/tickets/:ticketId/resolve', authenticateUser, technicianOnly, async (req, res) => {
    try {
      const { ticketId } = req.params;
      const { resolution } = req.body;

      if (!resolution) {
        return res.status(400).json({ error: 'Resolution requise' });
      }

      const ticket = await chatbotService.resolveTicket(ticketId, req.userId, resolution);

      res.json({
        success: true,
        data: ticket
      });
    } catch (error) {
      console.error('[Chatbot] Error resolving ticket:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/chatbot/technician/tickets/:ticketId/close
   * Fermer un ticket
   */
  router.post('/technician/tickets/:ticketId/close', authenticateUser, technicianOnly, async (req, res) => {
    try {
      const { ticketId } = req.params;

      const ticket = await chatbotService.closeTicket(ticketId, req.userId);

      res.json({
        success: true,
        data: ticket
      });
    } catch (error) {
      console.error('[Chatbot] Error closing ticket:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/chatbot/technician/conversations/:conversationId/reply
   * Repondre a une conversation en tant que technicien
   */
  router.post('/technician/conversations/:conversationId/reply', authenticateUser, technicianOnly, async (req, res) => {
    try {
      const { conversationId } = req.params;
      const { content, attachments } = req.body;

      if (!content) {
        return res.status(400).json({ error: 'Contenu requis' });
      }

      const conversations = db.collection('chatbot_conversations');
      const conversation = await conversations.findOne({ conversationId });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation non trouvee' });
      }

      const crypto = require('crypto');
      const techMessage = {
        messageId: crypto.randomUUID(),
        type: 'technician',
        content,
        attachments: attachments || [],
        timestamp: new Date(),
        metadata: {
          technicianId: req.userId,
          technicianName: req.user.name || 'Technicien'
        }
      };

      await conversations.updateOne(
        { conversationId },
        {
          $push: { messages: techMessage },
          $set: {
            status: ConversationStatus.WAITING_USER,
            updatedAt: new Date()
          }
        }
      );

      // Emettre evenement WebSocket
      if (eventEmitter) {
        eventEmitter.emit('chatbot.technician.reply', {
          conversationId,
          userId: conversation.userId,
          message: techMessage
        });
      }

      res.json({
        success: true,
        data: techMessage
      });
    } catch (error) {
      console.error('[Chatbot] Error technician reply:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================================================
  // ROUTES BASE DE CONNAISSANCES
  // ==========================================================================

  /**
   * GET /api/chatbot/knowledge
   * Rechercher dans la base de connaissances
   */
  router.get('/knowledge', optionalAuth, async (req, res) => {
    try {
      const { q, category, module, limit } = req.query;

      const knowledgeBase = db.collection('knowledge_base');

      const filter = { status: 'published' };
      if (category) filter.category = category;
      if (module) filter.module = module;

      let query = filter;
      if (q) {
        query = {
          ...filter,
          $or: [
            { title: { $regex: q, $options: 'i' } },
            { keywords: { $in: q.toLowerCase().split(' ') } },
            { content: { $regex: q, $options: 'i' } }
          ]
        };
      }

      const articles = await knowledgeBase
        .find(query)
        .sort({ viewCount: -1 })
        .limit(parseInt(limit) || 10)
        .toArray();

      res.json({
        success: true,
        data: articles,
        count: articles.length
      });
    } catch (error) {
      console.error('[Chatbot] Error searching knowledge:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/chatbot/knowledge/:articleId
   * Obtenir un article
   */
  router.get('/knowledge/:articleId', optionalAuth, async (req, res) => {
    try {
      const knowledgeBase = db.collection('knowledge_base');

      const article = await knowledgeBase.findOne({ articleId: req.params.articleId });

      if (!article) {
        return res.status(404).json({ error: 'Article non trouve' });
      }

      // Incrementer le compteur de vues
      await knowledgeBase.updateOne(
        { articleId: req.params.articleId },
        { $inc: { viewCount: 1 } }
      );

      res.json({
        success: true,
        data: article
      });
    } catch (error) {
      console.error('[Chatbot] Error getting article:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/chatbot/knowledge/:articleId/helpful
   * Marquer un article comme utile ou non
   */
  router.post('/knowledge/:articleId/helpful', authenticateUser, async (req, res) => {
    try {
      const { helpful } = req.body;
      const knowledgeBase = db.collection('knowledge_base');

      const update = helpful
        ? { $inc: { helpfulCount: 1 } }
        : { $inc: { notHelpfulCount: 1 } };

      await knowledgeBase.updateOne(
        { articleId: req.params.articleId },
        update
      );

      res.json({ success: true });
    } catch (error) {
      console.error('[Chatbot] Error updating helpful:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/chatbot/knowledge (Admin)
   * Creer un article
   */
  router.post('/knowledge', authenticateUser, technicianOnly, async (req, res) => {
    try {
      const article = await chatbotService.addKnowledgeArticle(req.body, req.userId);

      res.status(201).json({
        success: true,
        data: article
      });
    } catch (error) {
      console.error('[Chatbot] Error creating article:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================================================
  // ROUTES FAQ
  // ==========================================================================

  /**
   * GET /api/chatbot/faq
   * Lister les FAQ
   */
  router.get('/faq', optionalAuth, async (req, res) => {
    try {
      const { category, module, limit } = req.query;

      const faqs = db.collection('chatbot_faqs');

      const filter = { status: 'published' };
      if (category) filter.category = category;
      if (module) filter.module = module;

      const results = await faqs
        .find(filter)
        .sort({ priority: 1, helpfulCount: -1 })
        .limit(parseInt(limit) || 20)
        .toArray();

      res.json({
        success: true,
        data: results,
        count: results.length
      });
    } catch (error) {
      console.error('[Chatbot] Error listing FAQ:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/chatbot/faq (Admin)
   * Creer une FAQ
   */
  router.post('/faq', authenticateUser, technicianOnly, async (req, res) => {
    try {
      const faq = await chatbotService.addFAQ(req.body);

      res.status(201).json({
        success: true,
        data: faq
      });
    } catch (error) {
      console.error('[Chatbot] Error creating FAQ:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================================================
  // ROUTES STATISTIQUES
  // ==========================================================================

  /**
   * GET /api/chatbot/stats
   * Obtenir les statistiques (admin/technicien)
   */
  router.get('/stats', authenticateUser, technicianOnly, async (req, res) => {
    try {
      const { from, to } = req.query;

      const dateFrom = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 jours
      const dateTo = to || new Date();

      const stats = await helpBot.getStats(dateFrom, dateTo);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('[Chatbot] Error getting stats:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/chatbot/stats/dashboard
   * Dashboard temps reel
   */
  router.get('/stats/dashboard', authenticateUser, technicianOnly, async (req, res) => {
    try {
      const conversations = db.collection('chatbot_conversations');
      const tickets = db.collection('support_tickets');

      const now = new Date();
      const todayStart = new Date(now.setHours(0, 0, 0, 0));

      const [activeConversations, openTickets, todayStats] = await Promise.all([
        // Conversations actives
        conversations.countDocuments({
          status: { $in: [ConversationStatus.ACTIVE, ConversationStatus.WAITING_USER, ConversationStatus.WAITING_BOT] }
        }),

        // Tickets ouverts par priorite
        tickets.aggregate([
          { $match: { status: { $in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] } } },
          { $group: { _id: '$priority', count: { $sum: 1 } } }
        ]).toArray(),

        // Stats du jour
        conversations.aggregate([
          { $match: { createdAt: { $gte: todayStart } } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              resolved: { $sum: { $cond: [{ $eq: ['$status', ConversationStatus.RESOLVED] }, 1, 0] } }
            }
          }
        ]).toArray()
      ]);

      res.json({
        success: true,
        data: {
          realtime: {
            activeConversations,
            openTickets: openTickets.reduce((acc, t) => {
              acc[t._id] = t.count;
              return acc;
            }, {}),
            totalOpenTickets: openTickets.reduce((sum, t) => sum + t.count, 0)
          },
          today: todayStats[0] || { total: 0, resolved: 0 }
        }
      });
    } catch (error) {
      console.error('[Chatbot] Error getting dashboard:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================================================
  // ROUTES CONFIGURATION
  // ==========================================================================

  /**
   * GET /api/chatbot/config
   * Obtenir la configuration du chatbot pour l'utilisateur
   */
  router.get('/config', authenticateUser, async (req, res) => {
    try {
      const chatbotType = RoleToChatbot[req.userRole] || ChatbotTypes.HELPBOT;

      res.json({
        success: true,
        data: {
          chatbotType,
          userRole: req.userRole,
          availableChatbots: Object.values(ChatbotTypes),
          features: {
            helpbot: true,
            diagnostics: true,
            ticketing: true,
            knowledgeBase: true,
            faq: true
          }
        }
      });
    } catch (error) {
      console.error('[Chatbot] Error getting config:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================================================
  // HEALTH CHECK
  // ==========================================================================

  /**
   * GET /api/chatbot/health
   * Verification de sante
   */
  router.get('/health', async (req, res) => {
    try {
      // Verifier la connexion DB
      await db.command({ ping: 1 });

      res.json({
        status: 'healthy',
        service: 'chatbot',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        error: error.message
      });
    }
  });

  return router;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = { createChatbotRoutes };
