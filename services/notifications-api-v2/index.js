/**
 * SYMPHONI.A Notifications API v2
 * Gestion des notifications multi-canal (app, email, SMS)
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const io = require('socket.io-client');
const sgMail = require('@sendgrid/mail');
const twilio = require('twilio');

const app = express();
const PORT = process.env.PORT || 3015;

app.use(cors());
app.use(express.json());

// WebSocket
let websocket = null;
if (process.env.WEBSOCKET_URL) {
  websocket = io(process.env.WEBSOCKET_URL);
}

// SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Twilio
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// Notification Schema
const notificationSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  organizationId: { type: String, index: true },
  type: {
    type: String,
    enum: [
      'order_created', 'order_updated', 'order_cancelled',
      'carrier_accepted', 'carrier_refused', 'carrier_timeout',
      'tracking_update', 'eta_update', 'geofence_alert',
      'rdv_proposed', 'rdv_confirmed', 'rdv_cancelled',
      'document_uploaded', 'document_validated',
      'incident_reported', 'delay_reported',
      'score_updated', 'system', 'other'
    ],
    required: true
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  channels: {
    app: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    sms: { type: Boolean, default: false }
  },
  status: {
    app: { sent: Boolean, sentAt: Date },
    email: { sent: Boolean, sentAt: Date, error: String },
    sms: { sent: Boolean, sentAt: Date, error: String }
  },
  read: { type: Boolean, default: false },
  readAt: Date,
  data: mongoose.Schema.Types.Mixed,
  actionUrl: String,
  expiresAt: Date
}, { timestamps: true });

notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Notification = mongoose.model('Notification', notificationSchema);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('[MONGODB] Connected'))
  .catch(err => console.error('[MONGODB] Error:', err));

// ==================== HELPER FUNCTIONS ====================

async function sendEmailNotification(notification, userEmail) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('[EMAIL] SendGrid not configured');
    return false;
  }

  try {
    const msg = {
      to: userEmail,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject: notification.title,
      text: notification.message,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>${notification.title}</h2>
          <p>${notification.message}</p>
          ${notification.actionUrl ? `<p><a href="${notification.actionUrl}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Voir les détails</a></p>` : ''}
          <p style="color: #666; font-size: 12px; margin-top: 20px;">Notification SYMPHONI.A</p>
        </div>
      `
    };

    await sgMail.send(msg);
    return true;
  } catch (error) {
    console.error('[EMAIL] Error:', error);
    return false;
  }
}

async function sendSMSNotification(notification, phoneNumber) {
  if (!twilioClient) {
    console.warn('[SMS] Twilio not configured');
    return false;
  }

  try {
    await twilioClient.messages.create({
      body: `${notification.title}: ${notification.message}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });
    return true;
  } catch (error) {
    console.error('[SMS] Error:', error);
    return false;
  }
}

function emitWebSocketNotification(notification) {
  if (websocket?.connected) {
    websocket.emit('emit-event', {
      eventName: 'notification.created',
      target: { type: 'user', id: notification.userId },
      data: notification
    });
  }
}

// ==================== ROUTES ====================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'notifications-api-v2',
    version: '2.0.0',
    sendgrid: !!process.env.SENDGRID_API_KEY,
    twilio: !!twilioClient
  });
});

// GET /api/v1/notifications - Get user notifications
app.get('/api/v1/notifications', async (req, res) => {
  try {
    const { userId, read, type, limit = 50, page = 1 } = req.query;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const filters = { userId };
    if (read !== undefined) filters.read = read === 'true';
    if (type) filters.type = type;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Notification.countDocuments(filters),
      Notification.countDocuments({ userId, read: false })
    ]);

    res.json({
      success: true,
      data: notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      unreadCount
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/notifications/unread-count - Get unread count
app.get('/api/v1/notifications/unread-count', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const count = await Notification.countDocuments({ userId, read: false });

    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/notifications/:id/read - Mark as read
app.put('/api/v1/notifications/:id/read', async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      {
        read: true,
        readAt: new Date()
      },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/notifications/mark-all-read - Mark all as read
app.put('/api/v1/notifications/mark-all-read', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const result = await Notification.updateMany(
      { userId, read: false },
      { read: true, readAt: new Date() }
    );

    res.json({
      success: true,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/notifications/:id - Delete notification
app.delete('/api/v1/notifications/:id', async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/notifications/send - Send notification (internal API)
app.post('/api/v1/notifications/send', async (req, res) => {
  try {
    const {
      userId,
      organizationId,
      type,
      title,
      message,
      priority = 'normal',
      channels = { app: true, email: false, sms: false },
      data,
      actionUrl,
      userEmail,
      userPhone
    } = req.body;

    if (!userId || !type || !title || !message) {
      return res.status(400).json({
        success: false,
        error: 'userId, type, title, and message are required'
      });
    }

    // Create notification
    const notification = new Notification({
      userId,
      organizationId,
      type,
      title,
      message,
      priority,
      channels,
      data,
      actionUrl,
      status: {
        app: { sent: false },
        email: { sent: false },
        sms: { sent: false }
      }
    });

    // Send via app (WebSocket)
    if (channels.app) {
      emitWebSocketNotification(notification);
      notification.status.app = { sent: true, sentAt: new Date() };
    }

    // Send via email
    if (channels.email && userEmail) {
      const emailSent = await sendEmailNotification(notification, userEmail);
      notification.status.email = {
        sent: emailSent,
        sentAt: emailSent ? new Date() : null,
        error: emailSent ? null : 'Failed to send email'
      };
    }

    // Send via SMS
    if (channels.sms && userPhone) {
      const smsSent = await sendSMSNotification(notification, userPhone);
      notification.status.sms = {
        sent: smsSent,
        sentAt: smsSent ? new Date() : null,
        error: smsSent ? null : 'Failed to send SMS'
      };
    }

    await notification.save();

    res.status(201).json({
      success: true,
      data: notification
    });
  } catch (error) {
    console.error('[ERROR] Send notification:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/notifications/broadcast - Broadcast to organization
app.post('/api/v1/notifications/broadcast', async (req, res) => {
  try {
    const { organizationId, userIds, type, title, message, priority, channels } = req.body;

    if (!userIds || userIds.length === 0) {
      return res.status(400).json({ success: false, error: 'userIds is required' });
    }

    const notifications = [];

    for (const userId of userIds) {
      const notification = new Notification({
        userId,
        organizationId,
        type,
        title,
        message,
        priority,
        channels: channels || { app: true, email: false, sms: false },
        status: {
          app: { sent: true, sentAt: new Date() },
          email: { sent: false },
          sms: { sent: false }
        }
      });

      await notification.save();
      emitWebSocketNotification(notification);
      notifications.push(notification);
    }

    res.status(201).json({
      success: true,
      count: notifications.length,
      data: notifications
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`[NOTIFICATIONS API v2] Running on port ${PORT}`);
});

module.exports = app;
