/**
 * RT Technologie - Systeme de Ticketing
 * Gestion avancee des tickets support avec SLA et escalade
 * Version: 1.0.0
 */

const { ObjectId } = require('mongodb');
const crypto = require('crypto');
const https = require('https');
const {
  PriorityLevels,
  PriorityDescriptions,
  TicketStatus,
  SLAConfig
} = require('./chatbot-models');

// ============================================================================
// SERVICE DE TICKETING
// ============================================================================

class TicketingService {
  constructor(db, eventEmitter = null, config = {}) {
    this.db = db;
    this.eventEmitter = eventEmitter;
    this.config = {
      teamsWebhookUrl: config.teamsWebhookUrl || process.env.TEAMS_WEBHOOK_URL,
      slackWebhookUrl: config.slackWebhookUrl || process.env.SLACK_WEBHOOK_URL,
      emailNotifications: config.emailNotifications !== false,
      autoAssignment: config.autoAssignment !== false,
      slaCheckInterval: config.slaCheckInterval || 5 * 60 * 1000, // 5 minutes
      ...config
    };

    // Collections
    this.tickets = db.collection('support_tickets');
    this.conversations = db.collection('chatbot_conversations');
    this.technicians = db.collection('technicians');
    this.users = db.collection('users');
    this.slaBreaches = db.collection('sla_breaches');
    this.ticketMetrics = db.collection('ticket_metrics');

    // Timer pour verification SLA
    this.slaCheckTimer = null;
  }

  // ==========================================================================
  // DEMARRAGE/ARRET DU SERVICE
  // ==========================================================================

  /**
   * Demarrer la surveillance SLA
   */
  startSLAMonitoring() {
    if (this.slaCheckTimer) return;

    console.log('[Ticketing] Demarrage surveillance SLA');
    this.slaCheckTimer = setInterval(() => {
      this._checkSLABreaches();
    }, this.config.slaCheckInterval);

    // Premiere verification immediate
    this._checkSLABreaches();
  }

  /**
   * Arreter la surveillance SLA
   */
  stopSLAMonitoring() {
    if (this.slaCheckTimer) {
      clearInterval(this.slaCheckTimer);
      this.slaCheckTimer = null;
      console.log('[Ticketing] Surveillance SLA arretee');
    }
  }

  // ==========================================================================
  // CREATION DE TICKETS
  // ==========================================================================

  /**
   * Creer un nouveau ticket
   */
  async createTicket(data) {
    const ticketId = await this._generateTicketId();
    const now = new Date();
    const priority = data.priority || PriorityLevels.STANDARD;
    const slaConfig = SLAConfig[priority];

    const ticket = {
      ticketId,
      source: data.source || 'manual', // chatbot, manual, email, api
      conversationId: data.conversationId || null,
      userId: data.userId ? new ObjectId(data.userId) : null,
      organizationId: data.organizationId ? new ObjectId(data.organizationId) : null,
      userRole: data.userRole || null,
      contactEmail: data.contactEmail || null,
      contactPhone: data.contactPhone || null,

      // Classification
      status: TicketStatus.OPEN,
      priority,
      category: data.category || null,
      subcategory: data.subcategory || null,
      module: data.module || null,
      tags: data.tags || [],

      // Contenu
      subject: data.subject || 'Demande support',
      description: data.description || '',
      attachments: data.attachments || [],

      // Assignment
      assignedTo: null,
      assignedTeam: data.team || 'support',
      escalatedTo: null,
      escalationLevel: 0,

      // SLA
      sla: {
        responseDeadline: new Date(now.getTime() + slaConfig.firstResponse * 60000),
        resolutionDeadline: new Date(now.getTime() + slaConfig.resolution * 60000),
        firstResponseAt: null,
        resolvedAt: null,
        breached: false,
        breachType: null
      },

      // Historique
      history: [{
        action: 'created',
        performedBy: data.createdBy ? new ObjectId(data.createdBy) : null,
        timestamp: now,
        details: { source: data.source }
      }],

      // Commentaires internes
      internalNotes: [],

      // Metriques
      metrics: {
        responseTime: null,
        resolutionTime: null,
        reopenCount: 0,
        escalationCount: 0,
        messageCount: 0
      },

      // Notifications
      teamsNotificationId: null,
      slackNotificationId: null,
      lastNotificationAt: null,

      // Timestamps
      createdAt: now,
      updatedAt: now,
      firstResponseAt: null,
      resolvedAt: null,
      closedAt: null
    };

    await this.tickets.insertOne(ticket);

    // Auto-assignment si active
    if (this.config.autoAssignment) {
      await this._autoAssignTicket(ticketId);
    }

    // Notifications
    await this._sendNewTicketNotifications(ticket);

    // Event
    this._emitEvent('ticket.created', {
      ticketId,
      priority,
      source: data.source
    });

    return ticket;
  }

  /**
   * Generer un ID de ticket
   */
  async _generateTicketId() {
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
   * Lister les tickets avec filtres
   */
  async listTickets(filters = {}) {
    const query = {};

    if (filters.status) {
      query.status = Array.isArray(filters.status) ? { $in: filters.status } : filters.status;
    }
    if (filters.priority) {
      query.priority = filters.priority;
    }
    if (filters.assignedTo) {
      query.assignedTo = new ObjectId(filters.assignedTo);
    }
    if (filters.userId) {
      query.userId = new ObjectId(filters.userId);
    }
    if (filters.organizationId) {
      query.organizationId = new ObjectId(filters.organizationId);
    }
    if (filters.category) {
      query.category = filters.category;
    }
    if (filters.module) {
      query.module = filters.module;
    }
    if (filters.tags && filters.tags.length > 0) {
      query.tags = { $in: filters.tags };
    }
    if (filters.search) {
      query.$or = [
        { subject: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } },
        { ticketId: { $regex: filters.search, $options: 'i' } }
      ];
    }
    if (filters.slaBreached) {
      query['sla.breached'] = true;
    }
    if (filters.dateFrom) {
      query.createdAt = { $gte: new Date(filters.dateFrom) };
    }
    if (filters.dateTo) {
      query.createdAt = { ...query.createdAt, $lte: new Date(filters.dateTo) };
    }

    const sort = {};
    sort[filters.sortBy || 'createdAt'] = filters.sortOrder === 'asc' ? 1 : -1;

    // Priorite critique en premier par defaut
    if (!filters.sortBy) {
      sort.priority = 1;
    }

    return await this.tickets
      .find(query)
      .sort(sort)
      .skip(filters.skip || 0)
      .limit(filters.limit || 50)
      .toArray();
  }

  /**
   * Mettre a jour un ticket
   */
  async updateTicket(ticketId, updates, performedBy) {
    const ticket = await this.tickets.findOne({ ticketId });
    if (!ticket) throw new Error('Ticket non trouve');

    const allowedUpdates = ['subject', 'description', 'category', 'subcategory', 'module', 'tags', 'priority'];
    const filteredUpdates = {};

    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        filteredUpdates[key] = updates[key];
      }
    }

    filteredUpdates.updatedAt = new Date();

    // Recalculer SLA si priorite changee
    if (updates.priority && updates.priority !== ticket.priority) {
      const slaConfig = SLAConfig[updates.priority];
      if (!ticket.sla.firstResponseAt) {
        filteredUpdates['sla.responseDeadline'] = new Date(Date.now() + slaConfig.firstResponse * 60000);
      }
      if (!ticket.sla.resolvedAt) {
        filteredUpdates['sla.resolutionDeadline'] = new Date(Date.now() + slaConfig.resolution * 60000);
      }
    }

    await this.tickets.updateOne(
      { ticketId },
      {
        $set: filteredUpdates,
        $push: {
          history: {
            action: 'updated',
            performedBy: performedBy ? new ObjectId(performedBy) : null,
            timestamp: new Date(),
            details: { changes: Object.keys(filteredUpdates) }
          }
        }
      }
    );

    this._emitEvent('ticket.updated', { ticketId });

    return await this.getTicket(ticketId);
  }

  /**
   * Assigner un ticket
   */
  async assignTicket(ticketId, technicianId, assignedBy) {
    const ticket = await this.tickets.findOne({ ticketId });
    if (!ticket) throw new Error('Ticket non trouve');

    const now = new Date();
    const isFirstResponse = !ticket.sla.firstResponseAt;

    const updates = {
      assignedTo: new ObjectId(technicianId),
      status: TicketStatus.IN_PROGRESS,
      updatedAt: now
    };

    if (isFirstResponse) {
      updates['sla.firstResponseAt'] = now;
      updates['metrics.responseTime'] = now - ticket.createdAt;
    }

    await this.tickets.updateOne(
      { ticketId },
      {
        $set: updates,
        $push: {
          history: {
            action: 'assigned',
            performedBy: assignedBy ? new ObjectId(assignedBy) : null,
            timestamp: now,
            details: { technicianId }
          }
        }
      }
    );

    // Notifier le technicien
    await this._notifyTechnicianAssignment(ticketId, technicianId);

    this._emitEvent('ticket.assigned', { ticketId, technicianId });

    return await this.getTicket(ticketId);
  }

  /**
   * Auto-assignment intelligent
   */
  async _autoAssignTicket(ticketId) {
    const ticket = await this.tickets.findOne({ ticketId });
    if (!ticket || ticket.assignedTo) return;

    // Trouver le meilleur technicien
    const technicians = await this.technicians.find({
      status: 'available',
      teams: ticket.assignedTeam
    }).toArray();

    if (technicians.length === 0) return;

    // Algorithme de selection:
    // 1. Competences matching
    // 2. Charge actuelle
    // 3. Performances passees

    let bestTechnician = null;
    let bestScore = -1;

    for (const tech of technicians) {
      let score = 100;

      // Competences
      if (tech.skills && ticket.category && tech.skills.includes(ticket.category)) {
        score += 20;
      }
      if (tech.modules && ticket.module && tech.modules.includes(ticket.module)) {
        score += 15;
      }

      // Charge actuelle (moins = mieux)
      const currentLoad = await this.tickets.countDocuments({
        assignedTo: tech._id,
        status: { $in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] }
      });
      score -= currentLoad * 5;

      // Priorite critique = technicien senior
      if (ticket.priority === PriorityLevels.CRITICAL && tech.level === 'senior') {
        score += 30;
      }

      if (score > bestScore) {
        bestScore = score;
        bestTechnician = tech;
      }
    }

    if (bestTechnician) {
      await this.assignTicket(ticketId, bestTechnician._id.toString(), null);
    }
  }

  /**
   * Escalader un ticket
   */
  async escalateTicket(ticketId, reason, escalatedBy) {
    const ticket = await this.tickets.findOne({ ticketId });
    if (!ticket) throw new Error('Ticket non trouve');

    const now = new Date();
    const newEscalationLevel = ticket.escalationLevel + 1;

    // Determiner la nouvelle equipe/technicien
    let escalatedTo = null;
    let escalatedTeam = ticket.assignedTeam;

    if (newEscalationLevel === 1) {
      escalatedTeam = 'support_l2';
    } else if (newEscalationLevel === 2) {
      escalatedTeam = 'engineering';
    } else if (newEscalationLevel >= 3) {
      escalatedTeam = 'management';
    }

    // Trouver un technicien niveau superieur
    const supervisor = await this.technicians.findOne({
      teams: escalatedTeam,
      level: { $in: ['senior', 'lead', 'manager'] },
      status: 'available'
    });

    if (supervisor) {
      escalatedTo = supervisor._id;
    }

    await this.tickets.updateOne(
      { ticketId },
      {
        $set: {
          escalationLevel: newEscalationLevel,
          escalatedTo,
          assignedTeam: escalatedTeam,
          status: TicketStatus.IN_PROGRESS,
          updatedAt: now
        },
        $inc: { 'metrics.escalationCount': 1 },
        $push: {
          history: {
            action: 'escalated',
            performedBy: escalatedBy ? new ObjectId(escalatedBy) : null,
            timestamp: now,
            details: { reason, level: newEscalationLevel, team: escalatedTeam }
          }
        }
      }
    );

    // Notifications d'escalade
    await this._sendEscalationNotifications(ticketId, reason, newEscalationLevel);

    this._emitEvent('ticket.escalated', { ticketId, level: newEscalationLevel, reason });

    return await this.getTicket(ticketId);
  }

  /**
   * Resoudre un ticket
   */
  async resolveTicket(ticketId, resolution, resolvedBy) {
    const ticket = await this.tickets.findOne({ ticketId });
    if (!ticket) throw new Error('Ticket non trouve');

    const now = new Date();

    await this.tickets.updateOne(
      { ticketId },
      {
        $set: {
          status: TicketStatus.RESOLVED,
          'sla.resolvedAt': now,
          'metrics.resolutionTime': now - ticket.createdAt,
          resolvedAt: now,
          updatedAt: now
        },
        $push: {
          history: {
            action: 'resolved',
            performedBy: resolvedBy ? new ObjectId(resolvedBy) : null,
            timestamp: now,
            details: { resolution }
          }
        }
      }
    );

    // Mettre a jour la conversation associee si existe
    if (ticket.conversationId) {
      await this.conversations.updateOne(
        { conversationId: ticket.conversationId },
        {
          $set: {
            status: 'resolved',
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

    // Enregistrer les metriques
    await this._recordMetrics(ticket, 'resolved');

    this._emitEvent('ticket.resolved', { ticketId, resolvedBy });

    return await this.getTicket(ticketId);
  }

  /**
   * Fermer un ticket
   */
  async closeTicket(ticketId, closedBy, feedback = null) {
    const ticket = await this.tickets.findOne({ ticketId });
    if (!ticket) throw new Error('Ticket non trouve');

    const now = new Date();

    await this.tickets.updateOne(
      { ticketId },
      {
        $set: {
          status: TicketStatus.CLOSED,
          closedAt: now,
          updatedAt: now,
          feedback: feedback
        },
        $push: {
          history: {
            action: 'closed',
            performedBy: closedBy ? new ObjectId(closedBy) : null,
            timestamp: now,
            details: { feedback }
          }
        }
      }
    );

    this._emitEvent('ticket.closed', { ticketId });

    return await this.getTicket(ticketId);
  }

  /**
   * Rouvrir un ticket
   */
  async reopenTicket(ticketId, reason, reopenedBy) {
    const ticket = await this.tickets.findOne({ ticketId });
    if (!ticket) throw new Error('Ticket non trouve');

    const now = new Date();

    // Recalculer SLA
    const slaConfig = SLAConfig[ticket.priority];

    await this.tickets.updateOne(
      { ticketId },
      {
        $set: {
          status: TicketStatus.REOPENED,
          'sla.resolutionDeadline': new Date(now.getTime() + slaConfig.resolution * 60000),
          'sla.resolvedAt': null,
          resolvedAt: null,
          closedAt: null,
          updatedAt: now
        },
        $inc: { 'metrics.reopenCount': 1 },
        $push: {
          history: {
            action: 'reopened',
            performedBy: reopenedBy ? new ObjectId(reopenedBy) : null,
            timestamp: now,
            details: { reason }
          }
        }
      }
    );

    // Re-notification
    await this._sendReopenNotifications(ticketId, reason);

    this._emitEvent('ticket.reopened', { ticketId, reason });

    return await this.getTicket(ticketId);
  }

  // ==========================================================================
  // COMMENTAIRES ET NOTES
  // ==========================================================================

  /**
   * Ajouter un commentaire
   */
  async addComment(ticketId, content, authorId, isInternal = false) {
    const ticket = await this.tickets.findOne({ ticketId });
    if (!ticket) throw new Error('Ticket non trouve');

    const comment = {
      commentId: crypto.randomUUID(),
      content,
      authorId: authorId ? new ObjectId(authorId) : null,
      isInternal,
      createdAt: new Date()
    };

    const updateField = isInternal ? 'internalNotes' : 'history';

    await this.tickets.updateOne(
      { ticketId },
      {
        $push: isInternal
          ? { internalNotes: comment }
          : {
            history: {
              action: 'comment',
              performedBy: authorId ? new ObjectId(authorId) : null,
              timestamp: new Date(),
              details: { content }
            }
          },
        $inc: { 'metrics.messageCount': 1 },
        $set: { updatedAt: new Date() }
      }
    );

    // Notifier si commentaire public
    if (!isInternal && ticket.userId) {
      await this._notifyUserComment(ticketId, content);
    }

    this._emitEvent('ticket.comment.added', { ticketId, isInternal });

    return comment;
  }

  // ==========================================================================
  // SURVEILLANCE SLA
  // ==========================================================================

  /**
   * Verifier les violations SLA
   */
  async _checkSLABreaches() {
    const now = new Date();

    // Tickets avec SLA response depasse
    const responseBreaches = await this.tickets.find({
      status: { $in: [TicketStatus.OPEN] },
      'sla.firstResponseAt': null,
      'sla.responseDeadline': { $lt: now },
      'sla.breached': { $ne: true }
    }).toArray();

    for (const ticket of responseBreaches) {
      await this._handleSLABreach(ticket, 'response');
    }

    // Tickets avec SLA resolution depasse
    const resolutionBreaches = await this.tickets.find({
      status: { $in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.WAITING_USER] },
      'sla.resolvedAt': null,
      'sla.resolutionDeadline': { $lt: now },
      'sla.breached': { $ne: true }
    }).toArray();

    for (const ticket of resolutionBreaches) {
      await this._handleSLABreach(ticket, 'resolution');
    }

    // Tickets proches de la deadline (alerte)
    const warningThreshold = 15 * 60 * 1000; // 15 minutes
    const nearDeadline = await this.tickets.find({
      status: { $in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
      'sla.breached': { $ne: true },
      $or: [
        {
          'sla.firstResponseAt': null,
          'sla.responseDeadline': { $lt: new Date(now.getTime() + warningThreshold), $gt: now }
        },
        {
          'sla.resolvedAt': null,
          'sla.resolutionDeadline': { $lt: new Date(now.getTime() + warningThreshold), $gt: now }
        }
      ]
    }).toArray();

    for (const ticket of nearDeadline) {
      await this._sendSLAWarning(ticket);
    }
  }

  /**
   * Gerer une violation SLA
   */
  async _handleSLABreach(ticket, breachType) {
    const now = new Date();

    // Marquer le ticket comme ayant viole le SLA
    await this.tickets.updateOne(
      { ticketId: ticket.ticketId },
      {
        $set: {
          'sla.breached': true,
          'sla.breachType': breachType,
          updatedAt: now
        },
        $push: {
          history: {
            action: 'sla_breach',
            performedBy: null,
            timestamp: now,
            details: { breachType }
          }
        }
      }
    );

    // Enregistrer la violation
    await this.slaBreaches.insertOne({
      ticketId: ticket.ticketId,
      breachType,
      priority: ticket.priority,
      deadline: breachType === 'response' ? ticket.sla.responseDeadline : ticket.sla.resolutionDeadline,
      breachedAt: now,
      assignedTo: ticket.assignedTo,
      organizationId: ticket.organizationId
    });

    // Escalade automatique si critique
    if (ticket.priority === PriorityLevels.CRITICAL) {
      await this.escalateTicket(ticket.ticketId, `SLA ${breachType} depasse`, null);
    }

    // Notifications d'alerte
    await this._sendSLABreachNotifications(ticket, breachType);

    this._emitEvent('ticket.sla.breach', {
      ticketId: ticket.ticketId,
      breachType,
      priority: ticket.priority
    });
  }

  // ==========================================================================
  // NOTIFICATIONS
  // ==========================================================================

  /**
   * Envoyer notifications nouveau ticket
   */
  async _sendNewTicketNotifications(ticket) {
    // Teams
    if (this.config.teamsWebhookUrl) {
      await this._sendTeamsNotification({
        type: 'new_ticket',
        ticket
      });
    }

    // Slack
    if (this.config.slackWebhookUrl) {
      await this._sendSlackNotification({
        type: 'new_ticket',
        ticket
      });
    }

    console.log(`[Ticketing] Notifications envoyees pour ticket ${ticket.ticketId}`);
  }

  /**
   * Notification Teams
   */
  async _sendTeamsNotification(data) {
    if (!this.config.teamsWebhookUrl) return;

    const colors = {
      [PriorityLevels.CRITICAL]: 'FF0000',
      [PriorityLevels.IMPORTANT]: 'FFA500',
      [PriorityLevels.STANDARD]: '00FF00'
    };

    let title, text;

    switch (data.type) {
      case 'new_ticket':
        title = `Nouveau ticket: ${data.ticket.ticketId}`;
        text = `Priorite: ${PriorityDescriptions[data.ticket.priority]?.name || 'Standard'}\n${data.ticket.subject}`;
        break;
      case 'sla_breach':
        title = `ALERTE SLA: ${data.ticket.ticketId}`;
        text = `SLA ${data.breachType} depasse!`;
        break;
      case 'escalation':
        title = `Escalade: ${data.ticket.ticketId}`;
        text = `Niveau ${data.level}: ${data.reason}`;
        break;
      default:
        return;
    }

    const card = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: colors[data.ticket?.priority] || '0076D7',
      summary: title,
      sections: [{
        activityTitle: title,
        activitySubtitle: text,
        markdown: true
      }]
    };

    try {
      await this._sendWebhook(this.config.teamsWebhookUrl, card);
    } catch (error) {
      console.error('[Ticketing] Teams notification error:', error.message);
    }
  }

  /**
   * Notification Slack
   */
  async _sendSlackNotification(data) {
    if (!this.config.slackWebhookUrl) return;

    const emojis = {
      [PriorityLevels.CRITICAL]: ':rotating_light:',
      [PriorityLevels.IMPORTANT]: ':warning:',
      [PriorityLevels.STANDARD]: ':information_source:'
    };

    let text;

    switch (data.type) {
      case 'new_ticket':
        text = `${emojis[data.ticket.priority]} *Nouveau ticket* ${data.ticket.ticketId}\n${data.ticket.subject}`;
        break;
      case 'sla_breach':
        text = `:alarm_clock: *SLA Breach* ${data.ticket.ticketId} - ${data.breachType}`;
        break;
      default:
        return;
    }

    try {
      await this._sendWebhook(this.config.slackWebhookUrl, { text });
    } catch (error) {
      console.error('[Ticketing] Slack notification error:', error.message);
    }
  }

  async _sendWebhook(url, payload) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const data = JSON.stringify(payload);

      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = https.request(options, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Webhook error: ${res.statusCode}`));
        }
      });

      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Webhook timeout'));
      });

      req.write(data);
      req.end();
    });
  }

  async _notifyTechnicianAssignment(ticketId, technicianId) {
    console.log(`[Ticketing] Notification technicien ${technicianId} pour ticket ${ticketId}`);
  }

  async _sendEscalationNotifications(ticketId, reason, level) {
    const ticket = await this.getTicket(ticketId);
    await this._sendTeamsNotification({ type: 'escalation', ticket, reason, level });
  }

  async _sendReopenNotifications(ticketId, reason) {
    console.log(`[Ticketing] Notification reouverture ticket ${ticketId}: ${reason}`);
  }

  async _sendSLAWarning(ticket) {
    console.log(`[Ticketing] Alerte SLA proche pour ticket ${ticket.ticketId}`);
  }

  async _sendSLABreachNotifications(ticket, breachType) {
    await this._sendTeamsNotification({ type: 'sla_breach', ticket, breachType });
  }

  async _notifyUserComment(ticketId, content) {
    console.log(`[Ticketing] Notification utilisateur pour commentaire sur ticket ${ticketId}`);
  }

  // ==========================================================================
  // METRIQUES
  // ==========================================================================

  /**
   * Enregistrer les metriques
   */
  async _recordMetrics(ticket, action) {
    const metric = {
      ticketId: ticket.ticketId,
      action,
      priority: ticket.priority,
      category: ticket.category,
      module: ticket.module,
      responseTime: ticket.metrics.responseTime,
      resolutionTime: ticket.metrics.resolutionTime,
      escalationCount: ticket.metrics.escalationCount,
      reopenCount: ticket.metrics.reopenCount,
      slaBreached: ticket.sla.breached,
      timestamp: new Date()
    };

    await this.ticketMetrics.insertOne(metric);
  }

  /**
   * Obtenir les statistiques
   */
  async getStats(dateFrom, dateTo) {
    const match = {
      createdAt: { $gte: new Date(dateFrom), $lte: new Date(dateTo) }
    };

    const [overview, byPriority, byCategory, slaStats] = await Promise.all([
      // Vue d'ensemble
      this.tickets.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            open: { $sum: { $cond: [{ $eq: ['$status', TicketStatus.OPEN] }, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $eq: ['$status', TicketStatus.IN_PROGRESS] }, 1, 0] } },
            resolved: { $sum: { $cond: [{ $eq: ['$status', TicketStatus.RESOLVED] }, 1, 0] } },
            closed: { $sum: { $cond: [{ $eq: ['$status', TicketStatus.CLOSED] }, 1, 0] } },
            avgResponseTime: { $avg: '$metrics.responseTime' },
            avgResolutionTime: { $avg: '$metrics.resolutionTime' }
          }
        }
      ]).toArray(),

      // Par priorite
      this.tickets.aggregate([
        { $match: match },
        { $group: { _id: '$priority', count: { $sum: 1 } } }
      ]).toArray(),

      // Par categorie
      this.tickets.aggregate([
        { $match: match },
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]).toArray(),

      // SLA
      this.tickets.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            breached: { $sum: { $cond: ['$sla.breached', 1, 0] } }
          }
        }
      ]).toArray()
    ]);

    return {
      period: { from: dateFrom, to: dateTo },
      overview: overview[0] || {},
      byPriority: byPriority.reduce((acc, p) => { acc[p._id] = p.count; return acc; }, {}),
      byCategory: byCategory.reduce((acc, c) => { acc[c._id || 'unknown'] = c.count; return acc; }, {}),
      sla: {
        total: slaStats[0]?.total || 0,
        breached: slaStats[0]?.breached || 0,
        complianceRate: slaStats[0]?.total
          ? Math.round(((slaStats[0].total - slaStats[0].breached) / slaStats[0].total) * 100)
          : 100
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
    console.log(`[Ticketing Event] ${eventType}:`, JSON.stringify(data));
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = { TicketingService };
