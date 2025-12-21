# CAHIER DES CHARGES - MODULE NOTIFICATIONS v2.0

## SYMPHONI.A - RT Technologie
**Version :** 2.0
**Date :** 21 décembre 2025
**Statut :** En attente de validation
**Priorité globale :** CRITIQUE

---

## 1. CONTEXTE ET OBJECTIFS

### 1.1 Contexte
Le module Notifications de SYMPHONI.A gère la communication multi-canal avec les utilisateurs. L'audit a révélé un bug critique empêchant le chargement des notifications et des lacunes dans les interconnexions entre modules.

### 1.2 Problèmes identifiés
| Problème | Sévérité | Impact |
|----------|----------|--------|
| `fetchNotifications()` jamais appelée | CRITIQUE | Page bloquée à 100% |
| `userId` non passé à l'API | CRITIQUE | API retourne erreur 400 |
| URL `read-all` incorrecte | HAUTE | Marquer tout lu ne fonctionne pas |
| CloudFront ne répond pas | HAUTE | API inaccessible en prod |
| Orders API non connecté | MOYENNE | Pas de notifs sur commandes |
| Tracking API non connecté | MOYENNE | Pas de notifs sur tracking |

### 1.3 Objectifs
- Corriger les bugs critiques frontend
- Harmoniser les URLs API frontend/backend
- Connecter tous les modules émetteurs de notifications
- Implémenter un système de préférences utilisateur
- Assurer la délivrabilité email/SMS
- Mettre en place le temps réel via WebSocket

### 1.4 Périmètre
| Portail | Notifications |
|---------|---------------|
| web-industry | Commandes, RDV, Documents, Facturation, Alertes |
| web-transporter | Missions, Tracking, Documents, Paiements |
| web-forwarder | Commandes, Transporteurs, Documents |
| web-logistician | Planning, Stocks, Mouvements |
| web-recipient | Livraisons, ETAs, Documents |

---

## 2. ARCHITECTURE TECHNIQUE

### 2.1 Architecture globale

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        MODULES ÉMETTEURS                                 │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────────────┤
│ Orders API  │ Tracking    │ Billing     │ e-CMR       │ Pricing Grids   │
│   v2        │   API       │   API       │   API       │     API         │
└──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┴────────┬────────┘
       │             │             │             │               │
       └─────────────┴─────────────┴─────────────┴───────────────┘
                                   │
                                   ▼
       ┌───────────────────────────────────────────────────────┐
       │              NOTIFICATIONS API v2                      │
       │  ┌─────────────────────────────────────────────────┐  │
       │  │  POST /api/v1/notifications/send                │  │
       │  │  - Reçoit les événements des modules            │  │
       │  │  - Détermine les canaux (app/email/sms)         │  │
       │  │  - Enregistre en base                           │  │
       │  │  - Distribue aux canaux                         │  │
       │  └─────────────────────────────────────────────────┘  │
       └───────────────────────────────────────────────────────┘
                    │              │              │
         ┌──────────┘              │              └──────────┐
         ▼                         ▼                         ▼
   ┌───────────┐           ┌───────────────┐           ┌───────────┐
   │  MongoDB  │           │  WebSocket    │           │  External │
   │  Storage  │           │  (Temps réel) │           │  Services │
   │           │           │               │           │           │
   │ - notifs  │           │ Socket.io     │           │ SendGrid  │
   │ - prefs   │           │ emit to user  │           │ Twilio    │
   │ - history │           │               │           │           │
   └───────────┘           └───────────────┘           └───────────┘
         │                         │                         │
         └─────────────────────────┴─────────────────────────┘
                                   │
                                   ▼
       ┌───────────────────────────────────────────────────────┐
       │                    FRONTENDS                           │
       │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │
       │  │Industry │ │Transport│ │Forwarder│ │Recipient│     │
       │  │  Page   │ │  Page   │ │  Page   │ │  Page   │     │
       │  └─────────┘ └─────────┘ └─────────┘ └─────────┘     │
       └───────────────────────────────────────────────────────┘
```

### 2.2 Base de données MongoDB

#### Collection `notifications`
```javascript
const notificationSchema = {
  _id: ObjectId,

  // Destinataire
  userId: { type: String, required: true, index: true },
  organizationId: { type: String, index: true },

  // Type et contenu
  type: {
    type: String,
    enum: [
      // Commandes
      'order_created', 'order_updated', 'order_cancelled', 'order_assigned',
      // Transporteurs
      'carrier_accepted', 'carrier_refused', 'carrier_timeout', 'carrier_quote_received',
      // Tracking
      'tracking_update', 'eta_update', 'geofence_entry', 'geofence_exit', 'delay_detected',
      // RDV / Planning
      'rdv_proposed', 'rdv_confirmed', 'rdv_cancelled', 'rdv_reminder',
      // Documents
      'document_uploaded', 'document_validated', 'document_rejected', 'ecmr_signature_required',
      // Facturation
      'invoice_generated', 'invoice_paid', 'invoice_overdue', 'prefacturation_ready',
      // Incidents
      'incident_reported', 'incident_resolved', 'claim_opened', 'claim_closed',
      // Scoring
      'score_updated', 'score_alert',
      // Pricing
      'pricing_request_received', 'pricing_proposal_received', 'pricing_accepted', 'pricing_rejected',
      // Système
      'system', 'maintenance', 'security_alert', 'welcome', 'account_update'
    ],
    required: true
  },

  // Contenu
  title: { type: String, required: true, maxLength: 200 },
  message: { type: String, required: true, maxLength: 1000 },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },

  // Canaux d'envoi
  channels: {
    app: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    sms: { type: Boolean, default: false },
    push: { type: Boolean, default: false }
  },

  // Statut d'envoi par canal
  deliveryStatus: {
    app: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      readAt: Date
    },
    email: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      messageId: String,
      opened: Boolean,
      openedAt: Date,
      clicked: Boolean,
      error: String
    },
    sms: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      messageId: String,
      delivered: Boolean,
      deliveredAt: Date,
      error: String
    },
    push: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      error: String
    }
  },

  // Lecture
  read: { type: Boolean, default: false, index: true },
  readAt: Date,

  // Données contextuelles
  data: {
    orderId: String,
    trackingId: String,
    documentId: String,
    invoiceId: String,
    carrierId: String,
    ecmrId: String,
    proposalId: String,
    // Données additionnelles libres
    metadata: mongoose.Schema.Types.Mixed
  },

  // Action
  actionUrl: String,
  actionLabel: String,

  // Expiration
  expiresAt: { type: Date, index: true },

  // Timestamps
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: Date
};

// Index composites pour performance
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ organizationId: 1, type: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL auto-delete
```

#### Collection `notification_preferences`
```javascript
const preferenceSchema = {
  _id: ObjectId,
  userId: { type: String, required: true, unique: true },
  organizationId: String,

  // Préférences globales
  globalEnabled: { type: Boolean, default: true },
  quietHours: {
    enabled: { type: Boolean, default: false },
    start: { type: String, default: '22:00' }, // HH:mm
    end: { type: String, default: '07:00' }
  },

  // Préférences par type de notification
  preferences: {
    // Commandes
    order_created: { app: true, email: true, sms: false },
    order_updated: { app: true, email: false, sms: false },
    order_cancelled: { app: true, email: true, sms: true },

    // Transporteurs
    carrier_accepted: { app: true, email: true, sms: false },
    carrier_refused: { app: true, email: true, sms: false },
    carrier_quote_received: { app: true, email: true, sms: false },

    // Tracking
    tracking_update: { app: true, email: false, sms: false },
    eta_update: { app: true, email: false, sms: false },
    delay_detected: { app: true, email: true, sms: true },

    // RDV
    rdv_proposed: { app: true, email: true, sms: false },
    rdv_confirmed: { app: true, email: true, sms: true },
    rdv_reminder: { app: true, email: true, sms: true },

    // Documents
    document_uploaded: { app: true, email: false, sms: false },
    ecmr_signature_required: { app: true, email: true, sms: true },

    // Facturation
    invoice_generated: { app: true, email: true, sms: false },
    invoice_overdue: { app: true, email: true, sms: true },

    // Incidents
    incident_reported: { app: true, email: true, sms: true },

    // Système
    system: { app: true, email: false, sms: false },
    security_alert: { app: true, email: true, sms: true }
  },

  // Contacts
  emailAddress: String,
  phoneNumber: String,
  pushToken: String,

  // Langue
  language: { type: String, default: 'fr' },

  createdAt: { type: Date, default: Date.now },
  updatedAt: Date
};
```

#### Collection `notification_templates`
```javascript
const templateSchema = {
  _id: ObjectId,
  type: { type: String, required: true, unique: true },

  // Templates par langue
  templates: {
    fr: {
      title: String,
      message: String,
      email: {
        subject: String,
        htmlTemplate: String,
        textTemplate: String
      },
      sms: {
        template: String  // Max 160 chars
      }
    },
    en: {
      title: String,
      message: String,
      email: {
        subject: String,
        htmlTemplate: String,
        textTemplate: String
      },
      sms: {
        template: String
      }
    }
  },

  // Variables disponibles
  variables: [String],  // ['orderId', 'carrierName', 'eta', ...]

  // Priorité par défaut
  defaultPriority: { type: String, default: 'normal' },

  // Canaux par défaut
  defaultChannels: {
    app: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    sms: { type: Boolean, default: false }
  },

  active: { type: Boolean, default: true },
  createdAt: Date,
  updatedAt: Date
};
```

---

## 3. CORRECTIONS FRONTEND

### 3.1 Bug critique - Appel fetchNotifications

**Fichier:** `apps/web-industry/pages/notifications.tsx`

```typescript
// AVANT (ligne 90-94) - BUG
useEffect(() => {
  if (!mounted) return;
  if (!isAuthenticated()) { router.push('/login'); return; }
  // Load data  <-- COMMENTAIRE SANS CODE
}, [mounted]);

// APRÈS - CORRIGÉ
useEffect(() => {
  if (!mounted) return;
  if (!isAuthenticated()) {
    router.push('/login');
    return;
  }
  fetchNotifications();  // <-- APPEL AJOUTÉ
}, [mounted]);
```

### 3.2 Correction API - Ajouter userId

**Fichier:** `apps/web-industry/lib/api.ts`

```typescript
// AVANT (ligne 690-697)
export const notificationsApi = {
  list: async (filters?: { read?: boolean; type?: string }) => {
    const params = new URLSearchParams(filters as any);
    const res = await fetch(`${API_CONFIG.NOTIFICATIONS_API}/api/v1/notifications?${params}`, {
      headers: getAuthHeaders()
    });
    return res.json();
  },

// APRÈS - CORRIGÉ
export const notificationsApi = {
  list: async (filters?: { read?: boolean; type?: string }) => {
    const userId = getUserId();
    if (!userId) {
      console.error('userId required for notifications');
      return { success: false, data: [], unreadCount: 0 };
    }
    const params = new URLSearchParams({ userId, ...filters as Record<string, string> });
    const res = await fetch(`${API_CONFIG.NOTIFICATIONS_API}/api/v1/notifications?${params}`, {
      headers: getAuthHeaders()
    });
    return res.json();
  },
```

### 3.3 Correction URL mark-all-read

```typescript
// AVANT
markAllAsRead: async () => {
  const res = await fetch(`${API_CONFIG.NOTIFICATIONS_API}/api/v1/notifications/read-all`, {
    method: 'PUT',
    headers: getAuthHeaders()
  });
  return res.json();
},

// APRÈS - CORRIGÉ
markAllAsRead: async () => {
  const userId = getUserId();
  const res = await fetch(`${API_CONFIG.NOTIFICATIONS_API}/api/v1/notifications/mark-all-read`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ userId })
  });
  return res.json();
},
```

### 3.4 Ajouter fonction getUserId

```typescript
// À ajouter dans lib/api.ts ou lib/auth.ts
export function getUserId(): string | null {
  if (typeof window === 'undefined') return null;
  const user = localStorage.getItem('user');
  if (!user) return null;
  try {
    const parsed = JSON.parse(user);
    return parsed.id || parsed._id || parsed.userId || null;
  } catch {
    return null;
  }
}
```

### 3.5 Ajouter fonction getUnreadCount

```typescript
// À ajouter dans notificationsApi
getUnreadCount: async () => {
  const userId = getUserId();
  if (!userId) return { success: false, count: 0 };
  const res = await fetch(`${API_CONFIG.NOTIFICATIONS_API}/api/v1/notifications/unread-count?userId=${userId}`, {
    headers: getAuthHeaders()
  });
  return res.json();
},
```

---

## 4. AMÉLIORATIONS BACKEND

### 4.1 Nouveau endpoint - Préférences utilisateur

```javascript
// GET /api/v1/notifications/preferences
app.get('/api/v1/notifications/preferences', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    let preferences = await NotificationPreference.findOne({ userId });

    // Créer préférences par défaut si inexistantes
    if (!preferences) {
      preferences = new NotificationPreference({
        userId,
        globalEnabled: true,
        preferences: getDefaultPreferences()
      });
      await preferences.save();
    }

    res.json({ success: true, data: preferences });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/notifications/preferences
app.put('/api/v1/notifications/preferences', async (req, res) => {
  try {
    const { userId, preferences, quietHours, emailAddress, phoneNumber } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const updated = await NotificationPreference.findOneAndUpdate(
      { userId },
      {
        preferences,
        quietHours,
        emailAddress,
        phoneNumber,
        updatedAt: new Date()
      },
      { new: true, upsert: true }
    );

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

### 4.2 Amélioration envoi avec préférences

```javascript
// POST /api/v1/notifications/send - Version améliorée
app.post('/api/v1/notifications/send', async (req, res) => {
  try {
    const {
      userId,
      organizationId,
      type,
      title,
      message,
      priority = 'normal',
      data,
      actionUrl,
      forceChannels  // Pour forcer certains canaux même si désactivés
    } = req.body;

    // Validation
    if (!userId || !type || !title || !message) {
      return res.status(400).json({
        success: false,
        error: 'userId, type, title, and message are required'
      });
    }

    // Récupérer préférences utilisateur
    const preferences = await NotificationPreference.findOne({ userId });

    // Vérifier si notifications globalement activées
    if (preferences && !preferences.globalEnabled && priority !== 'urgent') {
      return res.json({
        success: true,
        skipped: true,
        reason: 'notifications_disabled'
      });
    }

    // Vérifier heures de silence (sauf urgent)
    if (preferences?.quietHours?.enabled && priority !== 'urgent') {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const { start, end } = preferences.quietHours;

      if (isInQuietHours(currentTime, start, end)) {
        // Stocker pour envoi différé
        return res.json({
          success: true,
          deferred: true,
          reason: 'quiet_hours',
          scheduledFor: end
        });
      }
    }

    // Déterminer canaux selon préférences
    let channels = { app: true, email: false, sms: false };

    if (forceChannels) {
      channels = forceChannels;
    } else if (preferences?.preferences?.[type]) {
      channels = preferences.preferences[type];
    }

    // Créer notification
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
      deliveryStatus: {
        app: { sent: false },
        email: { sent: false },
        sms: { sent: false }
      }
    });

    // Envoyer via app (WebSocket)
    if (channels.app) {
      emitWebSocketNotification(notification);
      notification.deliveryStatus.app = { sent: true, sentAt: new Date() };
    }

    // Envoyer via email
    if (channels.email) {
      const emailAddress = preferences?.emailAddress || req.body.userEmail;
      if (emailAddress) {
        const emailResult = await sendEmailNotification(notification, emailAddress, type);
        notification.deliveryStatus.email = {
          sent: emailResult.success,
          sentAt: emailResult.success ? new Date() : null,
          messageId: emailResult.messageId,
          error: emailResult.error
        };
      }
    }

    // Envoyer via SMS
    if (channels.sms) {
      const phoneNumber = preferences?.phoneNumber || req.body.userPhone;
      if (phoneNumber) {
        const smsResult = await sendSMSNotification(notification, phoneNumber);
        notification.deliveryStatus.sms = {
          sent: smsResult.success,
          sentAt: smsResult.success ? new Date() : null,
          messageId: smsResult.messageId,
          error: smsResult.error
        };
      }
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
```

### 4.3 Templates email HTML

```javascript
// Email templates par type
const EMAIL_TEMPLATES = {
  order_created: {
    subject: 'Nouvelle commande #{orderId}',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; }
          .header { background: linear-gradient(135deg, #1a1a2e, #16213e); padding: 30px; text-align: center; }
          .header img { height: 40px; }
          .header h1 { color: white; margin: 20px 0 0; font-size: 24px; }
          .content { padding: 30px; }
          .order-box { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .order-id { font-size: 24px; font-weight: bold; color: #1a1a2e; }
          .btn { display: inline-block; background: #667eea; color: white; padding: 12px 30px;
                 text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
          .footer { background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>SYMPHONI.A</h1>
          </div>
          <div class="content">
            <h2>Nouvelle commande reçue</h2>
            <div class="order-box">
              <div class="order-id">{{orderId}}</div>
              <p><strong>Expéditeur:</strong> {{shipperName}}</p>
              <p><strong>Destinataire:</strong> {{consigneeName}}</p>
              <p><strong>Date enlèvement:</strong> {{pickupDate}}</p>
              <p><strong>Date livraison:</strong> {{deliveryDate}}</p>
            </div>
            <a href="{{actionUrl}}" class="btn">Voir la commande</a>
          </div>
          <div class="footer">
            <p>SYMPHONI.A - Control Tower</p>
            <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
          </div>
        </div>
      </body>
      </html>
    `
  },

  carrier_quote_received: {
    subject: 'Nouvelle proposition tarifaire reçue',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; }
          .header { background: linear-gradient(135deg, #1a1a2e, #16213e); padding: 30px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .quote-box { background: linear-gradient(135deg, #667eea22, #764ba222);
                       border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #667eea; }
          .price { font-size: 32px; font-weight: bold; color: #667eea; }
          .carrier { font-size: 18px; color: #333; margin-top: 10px; }
          .btn { display: inline-block; background: #10B981; color: white; padding: 12px 30px;
                 text-decoration: none; border-radius: 8px; font-weight: 600; margin: 10px 5px; }
          .btn-secondary { background: #6B7280; }
          .footer { background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>SYMPHONI.A</h1>
          </div>
          <div class="content">
            <h2>Nouvelle proposition tarifaire</h2>
            <p>Vous avez reçu une proposition pour votre demande de transport.</p>
            <div class="quote-box">
              <div class="price">{{price}} EUR</div>
              <div class="carrier">{{carrierName}}</div>
              <p><strong>Trajet:</strong> {{origin}} → {{destination}}</p>
              <p><strong>Validité:</strong> {{validUntil}}</p>
            </div>
            <a href="{{acceptUrl}}" class="btn">Accepter</a>
            <a href="{{actionUrl}}" class="btn btn-secondary">Voir les détails</a>
          </div>
          <div class="footer">
            <p>SYMPHONI.A - Control Tower</p>
          </div>
        </div>
      </body>
      </html>
    `
  },

  ecmr_signature_required: {
    subject: 'Signature e-CMR requise - {{ecmrId}}',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; }
          .header { background: linear-gradient(135deg, #1a1a2e, #16213e); padding: 30px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .alert-box { background: #FEF3C7; border-radius: 8px; padding: 20px; margin: 20px 0;
                       border-left: 4px solid #F59E0B; }
          .ecmr-id { font-size: 20px; font-weight: bold; color: #1a1a2e; }
          .btn { display: inline-block; background: #10B981; color: white; padding: 14px 40px;
                 text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0;
                 font-size: 16px; }
          .footer { background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>SYMPHONI.A - e-CMR</h1>
          </div>
          <div class="content">
            <h2>Votre signature est requise</h2>
            <div class="alert-box">
              <p>Un e-CMR nécessite votre signature électronique.</p>
            </div>
            <p><strong>Document:</strong> <span class="ecmr-id">{{ecmrId}}</span></p>
            <p><strong>Commande:</strong> {{orderId}}</p>
            <p><strong>Expéditeur:</strong> {{shipperName}}</p>
            <p><strong>Destinataire:</strong> {{consigneeName}}</p>
            <p><strong>Marchandises:</strong> {{goodsDescription}}</p>
            <a href="{{actionUrl}}" class="btn">Signer maintenant</a>
            <p style="font-size: 12px; color: #666; margin-top: 20px;">
              Cette signature électronique a valeur légale conformément au règlement eIDAS.
            </p>
          </div>
          <div class="footer">
            <p>SYMPHONI.A - Control Tower</p>
          </div>
        </div>
      </body>
      </html>
    `
  },

  delay_detected: {
    subject: '⚠️ Retard détecté - Commande {{orderId}}',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; }
          .header { background: #EF4444; padding: 30px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .alert-box { background: #FEE2E2; border-radius: 8px; padding: 20px; margin: 20px 0;
                       border-left: 4px solid #EF4444; }
          .delay-time { font-size: 28px; font-weight: bold; color: #EF4444; }
          .btn { display: inline-block; background: #1a1a2e; color: white; padding: 12px 30px;
                 text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
          .footer { background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ ALERTE RETARD</h1>
          </div>
          <div class="content">
            <h2>Retard détecté sur livraison</h2>
            <div class="alert-box">
              <p><strong>Commande:</strong> {{orderId}}</p>
              <p><strong>Retard estimé:</strong></p>
              <div class="delay-time">{{delayMinutes}} minutes</div>
              <p><strong>Nouvelle ETA:</strong> {{newEta}}</p>
            </div>
            <p><strong>Cause:</strong> {{delayReason}}</p>
            <p><strong>Transporteur:</strong> {{carrierName}}</p>
            <a href="{{actionUrl}}" class="btn">Voir le tracking</a>
          </div>
          <div class="footer">
            <p>SYMPHONI.A - Control Tower</p>
          </div>
        </div>
      </body>
      </html>
    `
  },

  invoice_overdue: {
    subject: '🔴 Facture en retard de paiement - {{invoiceId}}',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; }
          .header { background: #DC2626; padding: 30px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .invoice-box { background: #FEE2E2; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .amount { font-size: 32px; font-weight: bold; color: #DC2626; }
          .overdue { color: #DC2626; font-weight: bold; }
          .btn { display: inline-block; background: #10B981; color: white; padding: 14px 40px;
                 text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
          .footer { background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>FACTURE EN RETARD</h1>
          </div>
          <div class="content">
            <h2>Rappel de paiement</h2>
            <div class="invoice-box">
              <p><strong>Facture:</strong> {{invoiceId}}</p>
              <div class="amount">{{amount}} EUR</div>
              <p><strong>Échéance:</strong> <span class="overdue">{{dueDate}}</span></p>
              <p><strong>Retard:</strong> <span class="overdue">{{daysOverdue}} jours</span></p>
            </div>
            <a href="{{actionUrl}}" class="btn">Payer maintenant</a>
            <p style="font-size: 12px; color: #666; margin-top: 20px;">
              Pour toute question, contactez notre service comptabilité.
            </p>
          </div>
          <div class="footer">
            <p>SYMPHONI.A - Control Tower</p>
          </div>
        </div>
      </body>
      </html>
    `
  }
};

// Fonction pour appliquer template
function applyTemplate(templateKey, data) {
  const template = EMAIL_TEMPLATES[templateKey];
  if (!template) return null;

  let subject = template.subject;
  let html = template.html;

  // Remplacer les variables {{variable}}
  Object.entries(data).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    subject = subject.replace(regex, value || '');
    html = html.replace(regex, value || '');
  });

  return { subject, html };
}
```

---

## 5. INTERCONNEXIONS MODULES

### 5.1 Intégration Orders API

**Fichier:** `services/orders-api-v2/index.js`

```javascript
const axios = require('axios');

const NOTIFICATIONS_API = process.env.NOTIFICATIONS_API_URL || 'http://localhost:3015';

// Fonction helper pour envoyer notification
async function sendOrderNotification(type, order, additionalData = {}) {
  try {
    await axios.post(`${NOTIFICATIONS_API}/api/v1/notifications/send`, {
      userId: order.createdBy || order.industrialId,
      organizationId: order.organizationId,
      type,
      title: getNotificationTitle(type, order),
      message: getNotificationMessage(type, order),
      priority: getNotificationPriority(type),
      data: {
        orderId: order.orderId,
        ...additionalData
      },
      actionUrl: `${process.env.FRONTEND_URL}/orders/${order.orderId}`
    });
  } catch (error) {
    console.error('[NOTIFICATION] Error sending:', error.message);
  }
}

// Helpers pour générer titre/message
function getNotificationTitle(type, order) {
  const titles = {
    'order_created': `Nouvelle commande ${order.orderId}`,
    'order_updated': `Commande ${order.orderId} mise à jour`,
    'order_cancelled': `Commande ${order.orderId} annulée`,
    'order_assigned': `Commande ${order.orderId} assignée`,
    'carrier_accepted': `Transporteur confirmé - ${order.orderId}`,
    'carrier_refused': `Transporteur refusé - ${order.orderId}`
  };
  return titles[type] || `Notification commande ${order.orderId}`;
}

function getNotificationMessage(type, order) {
  const messages = {
    'order_created': `Commande créée: ${order.shipper?.name} → ${order.consignee?.name}`,
    'order_updated': `La commande a été modifiée`,
    'order_cancelled': `La commande a été annulée`,
    'order_assigned': `Transporteur ${order.carrier?.name} assigné`,
    'carrier_accepted': `${order.carrier?.name} a accepté la mission`,
    'carrier_refused': `${order.carrier?.name} a refusé la mission`
  };
  return messages[type] || 'Mise à jour de votre commande';
}

function getNotificationPriority(type) {
  const priorities = {
    'order_cancelled': 'high',
    'carrier_refused': 'high',
    'order_created': 'normal',
    'order_updated': 'low'
  };
  return priorities[type] || 'normal';
}

// Utilisation dans les routes
// POST /api/v1/orders - Après création
await sendOrderNotification('order_created', newOrder);

// PUT /api/v1/orders/:id - Après modification
await sendOrderNotification('order_updated', updatedOrder);

// POST /api/v1/orders/:id/assign - Après assignation
await sendOrderNotification('order_assigned', order, { carrierId: carrier.id });

// POST /api/v1/orders/:id/cancel - Après annulation
await sendOrderNotification('order_cancelled', order, { reason: cancelReason });
```

### 5.2 Intégration Tracking API

```javascript
// services/tracking-api/index.js

async function sendTrackingNotification(type, tracking, order) {
  try {
    await axios.post(`${NOTIFICATIONS_API}/api/v1/notifications/send`, {
      userId: order.industrialId,
      type,
      title: getTrackingTitle(type, tracking),
      message: getTrackingMessage(type, tracking),
      priority: type === 'delay_detected' ? 'urgent' : 'normal',
      data: {
        orderId: order.orderId,
        trackingId: tracking.trackingId,
        metadata: {
          currentLocation: tracking.currentLocation,
          eta: tracking.eta
        }
      },
      actionUrl: `${FRONTEND_URL}/tracking/${tracking.trackingId}`
    });
  } catch (error) {
    console.error('[NOTIFICATION] Tracking error:', error.message);
  }
}

// Événements tracking
// - tracking_update: Position mise à jour
// - eta_update: ETA modifié
// - geofence_entry: Entrée zone géographique
// - geofence_exit: Sortie zone géographique
// - delay_detected: Retard détecté
```

### 5.3 Intégration e-CMR API

```javascript
// services/ecmr-signature-api/index.js

async function sendEcmrNotification(type, ecmr, recipientUserId) {
  try {
    await axios.post(`${NOTIFICATIONS_API}/api/v1/notifications/send`, {
      userId: recipientUserId,
      type,
      title: getEcmrTitle(type, ecmr),
      message: getEcmrMessage(type, ecmr),
      priority: type === 'ecmr_signature_required' ? 'high' : 'normal',
      channels: { app: true, email: true, sms: type === 'ecmr_signature_required' },
      data: {
        ecmrId: ecmr.ecmrId,
        orderId: ecmr.orderId
      },
      actionUrl: `${FRONTEND_URL}/ecmr?sign=${ecmr.ecmrId}`
    });
  } catch (error) {
    console.error('[NOTIFICATION] eCMR error:', error.message);
  }
}

// Événements e-CMR
// - ecmr_created: e-CMR créé
// - ecmr_signature_required: Signature requise
// - ecmr_signed: e-CMR signé par une partie
// - ecmr_completed: e-CMR complet (3 signatures)
```

### 5.4 Intégration Billing API

```javascript
// Déjà partiellement implémenté dans billing-api/index.js
// Améliorer avec appel à notifications-api

async function sendBillingNotification(type, data, userId) {
  try {
    await axios.post(`${NOTIFICATIONS_API}/api/v1/notifications/send`, {
      userId,
      type,
      title: getBillingTitle(type, data),
      message: getBillingMessage(type, data),
      priority: type === 'invoice_overdue' ? 'urgent' : 'normal',
      channels: {
        app: true,
        email: true,
        sms: type === 'invoice_overdue'
      },
      data: {
        invoiceId: data.invoiceId,
        prefacturationId: data.prefacturationId
      },
      actionUrl: `${FRONTEND_URL}/billing/${data.invoiceId || data.prefacturationId}`
    });
  } catch (error) {
    console.error('[NOTIFICATION] Billing error:', error.message);
  }
}
```

---

## 6. CONFIGURATION CLOUDFRONT

### 6.1 Vérification distribution

```bash
# Vérifier la distribution CloudFront pour notifications
aws cloudfront list-distributions --query "DistributionList.Items[?contains(Comment, 'notification') || contains(Origins.Items[0].DomainName, 'notification')].[Id,DomainName,Origins.Items[0].DomainName]"
```

### 6.2 Configuration requise

```yaml
# Distribution CloudFront pour notifications-api
Distribution:
  DomainName: d2t9age53em7o5.cloudfront.net
  Origin:
    DomainName: rt-notifications-api-prod.eu-central-1.elasticbeanstalk.com
    Protocol: HTTPS
  Behaviors:
    - PathPattern: /api/*
      AllowedMethods: [GET, HEAD, OPTIONS, PUT, POST, DELETE]
      CachedMethods: [GET, HEAD]
      CachePolicyId: CachingDisabled  # Pas de cache pour API
      OriginRequestPolicyId: AllViewer
      ViewerProtocolPolicy: https-only
    - PathPattern: /health
      AllowedMethods: [GET, HEAD]
      ViewerProtocolPolicy: https-only
```

---

## 7. TESTS ET VALIDATION

### 7.1 Tests unitaires

| Test | Description |
|------|-------------|
| `test_notification_creation` | Créer notification et vérifier en base |
| `test_notification_list` | Lister notifications avec filtres |
| `test_mark_as_read` | Marquer comme lu |
| `test_mark_all_read` | Marquer toutes comme lues |
| `test_preferences_crud` | CRUD préférences utilisateur |
| `test_email_sending` | Envoi email via SendGrid |
| `test_sms_sending` | Envoi SMS via Twilio |
| `test_websocket_emission` | Émission WebSocket |
| `test_quiet_hours` | Respect heures de silence |

### 7.2 Tests d'intégration

| Scénario | Modules impliqués |
|----------|-------------------|
| Création commande | Orders → Notifications → Frontend |
| Retard tracking | Tracking → Notifications → Email + SMS |
| Signature e-CMR | e-CMR → Notifications → Email |
| Facture en retard | Billing → Notifications → Email + SMS |
| Proposition tarifaire | Pricing → Notifications → Email |

### 7.3 Critères d'acceptation

- [ ] Page notifications charge les données
- [ ] Notifications temps réel via WebSocket
- [ ] Emails envoyés et reçus (vérifier inbox)
- [ ] SMS envoyés (vérifier téléphone)
- [ ] Préférences utilisateur respectées
- [ ] Heures de silence respectées
- [ ] Badge non-lues dans header
- [ ] Mark all read fonctionne
- [ ] Filtres par type fonctionnent

---

## 8. PLANNING DE MISE EN OEUVRE

### Phase 1 : Corrections critiques (Priorité URGENTE)
1. Fix `fetchNotifications()` dans notifications.tsx
2. Ajouter `userId` dans appels API
3. Corriger URL `mark-all-read`
4. Vérifier/réparer CloudFront

### Phase 2 : Améliorations backend
1. Ajouter endpoints préférences
2. Implémenter templates email
3. Ajouter heures de silence
4. Améliorer logs et monitoring

### Phase 3 : Interconnexions
1. Intégrer Orders API
2. Intégrer Tracking API
3. Intégrer e-CMR API
4. Améliorer Billing API

### Phase 4 : Frontend complet
1. Page préférences notifications
2. Badge temps réel dans header
3. Filtres avancés
4. Pagination

---

## 9. VARIABLES D'ENVIRONNEMENT

```bash
# Notifications API
MONGODB_URI=mongodb+srv://...
PORT=3015

# WebSocket
WEBSOCKET_URL=wss://d2aodzk1jwptdr.cloudfront.net

# SendGrid (Email)
SENDGRID_API_KEY=SG.xxx
SENDGRID_FROM_EMAIL=notifications@symphonia-controltower.com
SENDGRID_FROM_NAME=SYMPHONI.A

# Twilio (SMS)
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+33xxx

# Frontend URLs (pour liens dans emails)
FRONTEND_INDUSTRY_URL=https://industrie.symphonia-controltower.com
FRONTEND_TRANSPORTER_URL=https://transporter.symphonia-controltower.com

# Interconnexions
ORDERS_API_URL=https://dh9acecfz0wg0.cloudfront.net/api/v1
TRACKING_API_URL=https://d2mn43ccfvt3ub.cloudfront.net/api
ECMR_API_URL=https://d28q05cx5hmg9q.cloudfront.net/api/v1
BILLING_API_URL=https://d1ciol606nbfs0.cloudfront.net/api
```

---

## 10. ANNEXES

### A. Schéma des flux de notifications

```
                    ┌─────────────────────┐
                    │   ÉVÉNEMENT SOURCE  │
                    │ (Order, Tracking,   │
                    │  eCMR, Billing...)  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  POST /send         │
                    │  Notifications API  │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
     ┌────────────┐   ┌────────────┐   ┌────────────┐
     │  MongoDB   │   │  WebSocket │   │  External  │
     │  (store)   │   │  (realtime)│   │  (email/   │
     │            │   │            │   │   sms)     │
     └────────────┘   └─────┬──────┘   └─────┬──────┘
                            │                │
                            ▼                ▼
                    ┌────────────┐   ┌────────────┐
                    │  Frontend  │   │  User      │
                    │  (badge,   │   │  (inbox,   │
                    │   toast)   │   │   phone)   │
                    └────────────┘   └────────────┘
```

### B. API Endpoints complets

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/v1/notifications` | Liste notifications |
| GET | `/api/v1/notifications/unread-count` | Compte non lues |
| GET | `/api/v1/notifications/:id` | Détail notification |
| PUT | `/api/v1/notifications/:id/read` | Marquer comme lue |
| PUT | `/api/v1/notifications/mark-all-read` | Marquer toutes lues |
| DELETE | `/api/v1/notifications/:id` | Supprimer |
| POST | `/api/v1/notifications/send` | Envoyer (interne) |
| POST | `/api/v1/notifications/broadcast` | Broadcast |
| GET | `/api/v1/notifications/preferences` | Préférences user |
| PUT | `/api/v1/notifications/preferences` | Modifier préférences |
| GET | `/health` | Health check |

---

**Document rédigé par :** Claude Code (Audit automatisé)
**Validé par :** _En attente de validation_
**Date de validation :** _À compléter_
