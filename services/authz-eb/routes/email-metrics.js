/**
 * Routes Email Metrics
 *
 * Features:
 * - Stats globales emails (sent, delivered, bounced, failed)
 * - Timeline des envois (par jour/heure)
 * - Breakdown par type d'email
 * - Liste des emails échoués avec retry
 * - Integration avec AWS SES pour tracking
 *
 * Collection MongoDB: email_logs
 */

const { ObjectId } = require('mongodb');

/**
 * Types d'emails supportés
 */
const EMAIL_TYPES = {
  INVITATION: 'invitation',
  ONBOARDING: 'onboarding',
  DOCUMENT_EXPIRY: 'document_expiry',
  VIGILANCE_ALERT: 'vigilance_alert',
  NOTIFICATION: 'notification',
  INVOICE: 'invoice',
  ALERT: 'alert',
  BLOCKED: 'blocked'
};

/**
 * Statuts d'email
 */
const EMAIL_STATUS = {
  SENT: 'sent',
  DELIVERED: 'delivered',
  BOUNCED: 'bounced',
  FAILED: 'failed'
};

/**
 * Setup email metrics routes
 */
function setupEmailMetricsRoutes(app, db) {
  /**
   * GET /api/email-metrics/stats
   * Statistiques globales des emails
   */
  app.get('/api/email-metrics/stats', async (req, res) => {
    try {
      const { dateFrom, dateTo, emailType } = req.query;

      // Construire la query
      const match = {};

      if (dateFrom || dateTo) {
        match.sentAt = {};
        if (dateFrom) match.sentAt.$gte = new Date(dateFrom);
        if (dateTo) match.sentAt.$lte = new Date(dateTo);
      }

      if (emailType) {
        match.type = emailType;
      }

      // Stats globales
      const stats = await db.collection('email_logs').aggregate([
        { $match: match },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]).toArray();

      const totalEmails = stats.reduce((sum, s) => sum + s.count, 0);
      const sent = stats.find(s => s._id === EMAIL_STATUS.SENT)?.count || 0;
      const delivered = stats.find(s => s._id === EMAIL_STATUS.DELIVERED)?.count || 0;
      const bounced = stats.find(s => s._id === EMAIL_STATUS.BOUNCED)?.count || 0;
      const failed = stats.find(s => s._id === EMAIL_STATUS.FAILED)?.count || 0;

      // Calculer les rates
      const deliveryRate = totalEmails > 0 ? ((delivered / totalEmails) * 100).toFixed(2) : 0;
      const bounceRate = totalEmails > 0 ? ((bounced / totalEmails) * 100).toFixed(2) : 0;

      // Stats par type
      const byType = await db.collection('email_logs').aggregate([
        { $match: match },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            sent: {
              $sum: { $cond: [{ $eq: ['$status', EMAIL_STATUS.SENT] }, 1, 0] }
            },
            delivered: {
              $sum: { $cond: [{ $eq: ['$status', EMAIL_STATUS.DELIVERED] }, 1, 0] }
            },
            failed: {
              $sum: { $cond: [{ $eq: ['$status', EMAIL_STATUS.FAILED] }, 1, 0] }
            }
          }
        },
        { $sort: { count: -1 } }
      ]).toArray();

      res.json({
        success: true,
        period: {
          from: dateFrom ? new Date(dateFrom).toISOString() : null,
          to: dateTo ? new Date(dateTo).toISOString() : null
        },
        stats: {
          totalEmails,
          sent,
          delivered,
          bounced,
          failed,
          deliveryRate: parseFloat(deliveryRate),
          bounceRate: parseFloat(bounceRate),
          // Simulated open/click rates (AWS SES ne fournit pas ces métriques par défaut)
          openRate: 0,
          clickRate: 0
        },
        byType
      });

    } catch (error) {
      console.error('[EMAIL METRICS STATS] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/email-metrics/timeline
   * Timeline des envois d'emails
   */
  app.get('/api/email-metrics/timeline', async (req, res) => {
    try {
      const { interval = 'day', dateFrom, dateTo, emailType } = req.query;

      // Construire la query
      const match = {};

      if (dateFrom || dateTo) {
        match.sentAt = {};
        if (dateFrom) match.sentAt.$gte = new Date(dateFrom);
        if (dateTo) match.sentAt.$lte = new Date(dateTo);
      }

      if (emailType) {
        match.type = emailType;
      }

      // Format de date selon l'intervalle
      let dateFormat;
      if (interval === 'hour') {
        dateFormat = {
          year: { $year: '$sentAt' },
          month: { $month: '$sentAt' },
          day: { $dayOfMonth: '$sentAt' },
          hour: { $hour: '$sentAt' }
        };
      } else {
        dateFormat = {
          year: { $year: '$sentAt' },
          month: { $month: '$sentAt' },
          day: { $dayOfMonth: '$sentAt' }
        };
      }

      const timeline = await db.collection('email_logs').aggregate([
        { $match: match },
        {
          $group: {
            _id: dateFormat,
            sent: {
              $sum: { $cond: [{ $eq: ['$status', EMAIL_STATUS.SENT] }, 1, 0] }
            },
            delivered: {
              $sum: { $cond: [{ $eq: ['$status', EMAIL_STATUS.DELIVERED] }, 1, 0] }
            },
            bounced: {
              $sum: { $cond: [{ $eq: ['$status', EMAIL_STATUS.BOUNCED] }, 1, 0] }
            },
            failed: {
              $sum: { $cond: [{ $eq: ['$status', EMAIL_STATUS.FAILED] }, 1, 0] }
            },
            total: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
      ]).toArray();

      // Formater les dates
      const formatted = timeline.map(item => {
        const { year, month, day, hour } = item._id;
        const date = hour !== undefined
          ? new Date(year, month - 1, day, hour)
          : new Date(year, month - 1, day);

        return {
          date: date.toISOString(),
          sent: item.sent,
          delivered: item.delivered,
          bounced: item.bounced,
          failed: item.failed,
          total: item.total
        };
      });

      res.json({
        success: true,
        interval,
        count: formatted.length,
        timeline: formatted
      });

    } catch (error) {
      console.error('[EMAIL METRICS TIMELINE] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/email-metrics/by-type
   * Breakdown des emails par type
   */
  app.get('/api/email-metrics/by-type', async (req, res) => {
    try {
      const { dateFrom, dateTo } = req.query;

      const match = {};

      if (dateFrom || dateTo) {
        match.sentAt = {};
        if (dateFrom) match.sentAt.$gte = new Date(dateFrom);
        if (dateTo) match.sentAt.$lte = new Date(dateTo);
      }

      const byType = await db.collection('email_logs').aggregate([
        { $match: match },
        {
          $group: {
            _id: '$type',
            total: { $sum: 1 },
            sent: {
              $sum: { $cond: [{ $eq: ['$status', EMAIL_STATUS.SENT] }, 1, 0] }
            },
            delivered: {
              $sum: { $cond: [{ $eq: ['$status', EMAIL_STATUS.DELIVERED] }, 1, 0] }
            },
            bounced: {
              $sum: { $cond: [{ $eq: ['$status', EMAIL_STATUS.BOUNCED] }, 1, 0] }
            },
            failed: {
              $sum: { $cond: [{ $eq: ['$status', EMAIL_STATUS.FAILED] }, 1, 0] }
            }
          }
        },
        { $sort: { total: -1 } }
      ]).toArray();

      res.json({
        success: true,
        count: byType.length,
        byType: byType.map(item => ({
          type: item._id,
          total: item.total,
          sent: item.sent,
          delivered: item.delivered,
          bounced: item.bounced,
          failed: item.failed,
          deliveryRate: item.total > 0 ? ((item.delivered / item.total) * 100).toFixed(2) : 0
        }))
      });

    } catch (error) {
      console.error('[EMAIL METRICS BY TYPE] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/email-metrics/failed
   * Liste des emails échoués
   */
  app.get('/api/email-metrics/failed', async (req, res) => {
    try {
      const { limit = 50, skip = 0 } = req.query;

      const failed = await db.collection('email_logs')
        .find({
          $or: [
            { status: EMAIL_STATUS.FAILED },
            { status: EMAIL_STATUS.BOUNCED }
          ]
        })
        .sort({ sentAt: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .toArray();

      const total = await db.collection('email_logs').countDocuments({
        $or: [
          { status: EMAIL_STATUS.FAILED },
          { status: EMAIL_STATUS.BOUNCED }
        ]
      });

      res.json({
        success: true,
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        failed: failed.map(email => ({
          id: email._id.toString(),
          emailId: email.emailId,
          type: email.type,
          to: email.to,
          subject: email.subject,
          status: email.status,
          errorMessage: email.errorMessage,
          sentAt: email.sentAt,
          retryCount: email.retryCount || 0,
          carrierId: email.carrierId
        }))
      });

    } catch (error) {
      console.error('[EMAIL METRICS FAILED] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/email-metrics/retry/:emailId
   * Réessayer d'envoyer un email échoué
   */
  app.post('/api/email-metrics/retry/:emailId', async (req, res) => {
    try {
      const { emailId } = req.params;

      const emailLog = await db.collection('email_logs').findOne({
        _id: new ObjectId(emailId)
      });

      if (!emailLog) {
        return res.status(404).json({
          success: false,
          error: 'Email log not found'
        });
      }

      if (emailLog.status === EMAIL_STATUS.DELIVERED) {
        return res.status(400).json({
          success: false,
          error: 'Email already delivered, cannot retry'
        });
      }

      // Récupérer la fonction d'envoi d'email appropriée
      const emailService = require('../email');

      let result;
      switch (emailLog.type) {
        case EMAIL_TYPES.INVITATION:
          // Appeler sendCarrierInvitationEmail
          result = await emailService.sendCarrierInvitationEmail(
            emailLog.to,
            emailLog.metadata?.companyName || 'Transporteur',
            emailLog.metadata?.invitationToken || ''
          );
          break;

        case EMAIL_TYPES.ONBOARDING:
          result = await emailService.sendClientOnboardingConfirmationEmail(
            emailLog.to,
            emailLog.metadata?.companyName || 'Client',
            emailLog.metadata?.requestId || '',
            emailLog.metadata?.options || {}
          );
          break;

        default:
          return res.status(400).json({
            success: false,
            error: `Retry not supported for email type: ${emailLog.type}`
          });
      }

      // Mettre à jour le log
      if (result.success) {
        await db.collection('email_logs').updateOne(
          { _id: new ObjectId(emailId) },
          {
            $set: {
              status: EMAIL_STATUS.SENT,
              sentAt: new Date(),
              errorMessage: null,
              retryCount: (emailLog.retryCount || 0) + 1
            }
          }
        );

        res.json({
          success: true,
          message: 'Email resent successfully',
          emailId: emailLog.emailId
        });
      } else {
        await db.collection('email_logs').updateOne(
          { _id: new ObjectId(emailId) },
          {
            $set: {
              errorMessage: result.error,
              retryCount: (emailLog.retryCount || 0) + 1
            }
          }
        );

        res.status(500).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      console.error('[EMAIL METRICS RETRY] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  console.log('✓ Email metrics routes configured');
}

/**
 * Logger un envoi d'email
 * À appeler depuis email.js après chaque envoi
 */
async function logEmailSent(db, emailData) {
  try {
    const emailLog = {
      emailId: emailData.emailId || null,
      type: emailData.type,
      to: emailData.to,
      subject: emailData.subject,
      carrierId: emailData.carrierId ? new ObjectId(emailData.carrierId) : null,
      status: emailData.success ? EMAIL_STATUS.SENT : EMAIL_STATUS.FAILED,
      sentAt: new Date(),
      deliveredAt: null,
      errorMessage: emailData.error || null,
      retryCount: 0,
      metadata: emailData.metadata || {}
    };

    await db.collection('email_logs').insertOne(emailLog);

    return { success: true, logId: emailLog._id };
  } catch (error) {
    console.error('[EMAIL LOG] Error logging email:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  setupEmailMetricsRoutes,
  logEmailSent,
  EMAIL_TYPES,
  EMAIL_STATUS
};
