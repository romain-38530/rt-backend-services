/**
 * Webhook Routes
 * Webhooks bidirectionnels pour notifications temps réel
 */

import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { authenticateLogistician } from '../index.js';
import { notifyLogistician } from '../index.js';
import crypto from 'crypto';

const router = Router();

// Types d'événements supportés
const EVENT_TYPES = {
  // Ordres
  'order.created': 'Nouvel ordre créé',
  'order.updated': 'Ordre mis à jour',
  'order.confirmed': 'Ordre confirmé',
  'order.cancelled': 'Ordre annulé',
  'order.completed': 'Ordre terminé',

  // RDV
  'rdv.requested': 'Demande de RDV',
  'rdv.confirmed': 'RDV confirmé',
  'rdv.modified': 'RDV modifié',
  'rdv.cancelled': 'RDV annulé',
  'rdv.completed': 'RDV terminé',
  'rdv.driver_arrived': 'Chauffeur arrivé',

  // eCMR
  'ecmr.created': 'eCMR créé',
  'ecmr.signed': 'eCMR signé',
  'ecmr.completed': 'eCMR complété',
  'ecmr.rejected': 'eCMR rejeté',

  // Capacité
  'capacity.warning': 'Alerte capacité warning',
  'capacity.critical': 'Alerte capacité critique',
  'capacity.resolved': 'Alerte capacité résolue',

  // Tracking
  'tracking.driver_approaching': 'Chauffeur en approche',
  'tracking.eta_updated': 'ETA mis à jour',

  // Facturation
  'invoice.created': 'Facture créée',
  'invoice.paid': 'Facture payée',
  'invoice.overdue': 'Facture en retard',

  // ICPE
  'icpe.declaration_due': 'Déclaration ICPE à faire',
  'icpe.threshold_warning': 'Seuil ICPE approchant'
};

// ===========================================
// GET /api/logisticians/:id/webhooks
// Liste des webhooks configurés
// ===========================================
router.get('/:id/webhooks', authenticateLogistician, async (req, res) => {
  try {
    const logisticianId = req.params.id;
    const db = req.db;

    const webhooks = await db.collection('logistician_webhooks')
      .find({
        logisticianId: new ObjectId(logisticianId),
        deletedAt: null
      })
      .toArray();

    res.json({
      webhooks: webhooks.map(w => ({
        id: w._id,
        url: w.url,
        events: w.events,
        active: w.active,
        description: w.description,
        lastTriggered: w.lastTriggered,
        failureCount: w.failureCount || 0,
        createdAt: w.createdAt
      })),
      availableEvents: EVENT_TYPES
    });

  } catch (error) {
    console.error('[WEBHOOK] List webhooks error:', error);
    res.status(500).json({ error: 'Erreur récupération webhooks' });
  }
});

// ===========================================
// POST /api/logisticians/:id/webhooks
// Créer un webhook
// ===========================================
router.post('/:id/webhooks', authenticateLogistician, async (req, res) => {
  try {
    const logisticianId = req.params.id;
    const { url, events, description } = req.body;
    const db = req.db;

    // Validation
    if (!url || !isValidUrl(url)) {
      return res.status(400).json({ error: 'URL invalide' });
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'Au moins un événement requis' });
    }

    // Valider événements
    const invalidEvents = events.filter(e => !EVENT_TYPES[e]);
    if (invalidEvents.length > 0) {
      return res.status(400).json({
        error: 'Événements invalides',
        invalid: invalidEvents,
        valid: Object.keys(EVENT_TYPES)
      });
    }

    // Vérifier limite (max 10 webhooks par logisticien)
    const count = await db.collection('logistician_webhooks').countDocuments({
      logisticianId: new ObjectId(logisticianId),
      deletedAt: null
    });

    if (count >= 10) {
      return res.status(400).json({ error: 'Limite de 10 webhooks atteinte' });
    }

    // Générer secret pour signature
    const secret = crypto.randomBytes(32).toString('hex');

    const webhook = {
      logisticianId: new ObjectId(logisticianId),
      url,
      events,
      description: description || '',
      secret,
      active: true,
      failureCount: 0,
      lastTriggered: null,
      createdAt: new Date(),
      createdBy: req.user.userId,
      deletedAt: null
    };

    const result = await db.collection('logistician_webhooks').insertOne(webhook);

    res.status(201).json({
      message: 'Webhook créé',
      webhook: {
        id: result.insertedId,
        url,
        events,
        secret, // Affiché une seule fois
        active: true
      }
    });

  } catch (error) {
    console.error('[WEBHOOK] Create webhook error:', error);
    res.status(500).json({ error: 'Erreur création webhook' });
  }
});

// ===========================================
// PUT /api/logisticians/:id/webhooks/:webhookId
// Modifier un webhook
// ===========================================
router.put('/:id/webhooks/:webhookId', authenticateLogistician, async (req, res) => {
  try {
    const { id: logisticianId, webhookId } = req.params;
    const { url, events, description, active } = req.body;
    const db = req.db;

    const webhook = await db.collection('logistician_webhooks').findOne({
      _id: new ObjectId(webhookId),
      logisticianId: new ObjectId(logisticianId),
      deletedAt: null
    });

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook non trouvé' });
    }

    const updateData = { updatedAt: new Date() };

    if (url) {
      if (!isValidUrl(url)) {
        return res.status(400).json({ error: 'URL invalide' });
      }
      updateData.url = url;
    }

    if (events) {
      const invalidEvents = events.filter(e => !EVENT_TYPES[e]);
      if (invalidEvents.length > 0) {
        return res.status(400).json({ error: 'Événements invalides', invalid: invalidEvents });
      }
      updateData.events = events;
    }

    if (description !== undefined) updateData.description = description;
    if (active !== undefined) updateData.active = active;

    await db.collection('logistician_webhooks').updateOne(
      { _id: new ObjectId(webhookId) },
      { $set: updateData }
    );

    res.json({ message: 'Webhook mis à jour' });

  } catch (error) {
    console.error('[WEBHOOK] Update webhook error:', error);
    res.status(500).json({ error: 'Erreur mise à jour webhook' });
  }
});

// ===========================================
// DELETE /api/logisticians/:id/webhooks/:webhookId
// Supprimer un webhook
// ===========================================
router.delete('/:id/webhooks/:webhookId', authenticateLogistician, async (req, res) => {
  try {
    const { id: logisticianId, webhookId } = req.params;
    const db = req.db;

    const result = await db.collection('logistician_webhooks').updateOne(
      {
        _id: new ObjectId(webhookId),
        logisticianId: new ObjectId(logisticianId)
      },
      {
        $set: {
          deletedAt: new Date(),
          deletedBy: req.user.userId
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Webhook non trouvé' });
    }

    res.json({ message: 'Webhook supprimé' });

  } catch (error) {
    console.error('[WEBHOOK] Delete webhook error:', error);
    res.status(500).json({ error: 'Erreur suppression webhook' });
  }
});

// ===========================================
// POST /api/logisticians/:id/webhooks/:webhookId/test
// Tester un webhook
// ===========================================
router.post('/:id/webhooks/:webhookId/test', authenticateLogistician, async (req, res) => {
  try {
    const { id: logisticianId, webhookId } = req.params;
    const db = req.db;

    const webhook = await db.collection('logistician_webhooks').findOne({
      _id: new ObjectId(webhookId),
      logisticianId: new ObjectId(logisticianId),
      deletedAt: null
    });

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook non trouvé' });
    }

    // Envoyer événement test
    const testEvent = {
      id: `test_${Date.now()}`,
      type: 'webhook.test',
      data: {
        message: 'Ceci est un test de webhook',
        timestamp: new Date().toISOString()
      },
      logisticianId: logisticianId
    };

    const result = await sendWebhook(webhook, testEvent);

    // Log test
    await db.collection('webhook_deliveries').insertOne({
      webhookId: new ObjectId(webhookId),
      logisticianId: new ObjectId(logisticianId),
      eventType: 'webhook.test',
      eventId: testEvent.id,
      url: webhook.url,
      status: result.success ? 'success' : 'failed',
      statusCode: result.statusCode,
      responseTime: result.responseTime,
      error: result.error,
      createdAt: new Date()
    });

    if (result.success) {
      res.json({
        message: 'Test réussi',
        statusCode: result.statusCode,
        responseTime: result.responseTime
      });
    } else {
      res.status(400).json({
        error: 'Test échoué',
        details: result.error,
        statusCode: result.statusCode
      });
    }

  } catch (error) {
    console.error('[WEBHOOK] Test webhook error:', error);
    res.status(500).json({ error: 'Erreur test webhook' });
  }
});

// ===========================================
// POST /api/logisticians/:id/webhooks/:webhookId/rotate-secret
// Régénérer le secret
// ===========================================
router.post('/:id/webhooks/:webhookId/rotate-secret', authenticateLogistician, async (req, res) => {
  try {
    const { id: logisticianId, webhookId } = req.params;
    const db = req.db;

    const webhook = await db.collection('logistician_webhooks').findOne({
      _id: new ObjectId(webhookId),
      logisticianId: new ObjectId(logisticianId),
      deletedAt: null
    });

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook non trouvé' });
    }

    const newSecret = crypto.randomBytes(32).toString('hex');

    await db.collection('logistician_webhooks').updateOne(
      { _id: new ObjectId(webhookId) },
      {
        $set: {
          secret: newSecret,
          updatedAt: new Date()
        }
      }
    );

    res.json({
      message: 'Secret régénéré',
      secret: newSecret // Affiché une seule fois
    });

  } catch (error) {
    console.error('[WEBHOOK] Rotate secret error:', error);
    res.status(500).json({ error: 'Erreur régénération secret' });
  }
});

// ===========================================
// GET /api/logisticians/:id/webhooks/:webhookId/deliveries
// Historique des livraisons webhook
// ===========================================
router.get('/:id/webhooks/:webhookId/deliveries', authenticateLogistician, async (req, res) => {
  try {
    const { id: logisticianId, webhookId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    const db = req.db;

    const deliveries = await db.collection('webhook_deliveries')
      .find({
        webhookId: new ObjectId(webhookId),
        logisticianId: new ObjectId(logisticianId)
      })
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(Math.min(parseInt(limit), 100))
      .toArray();

    const total = await db.collection('webhook_deliveries').countDocuments({
      webhookId: new ObjectId(webhookId),
      logisticianId: new ObjectId(logisticianId)
    });

    res.json({
      deliveries: deliveries.map(d => ({
        id: d._id,
        eventType: d.eventType,
        eventId: d.eventId,
        status: d.status,
        statusCode: d.statusCode,
        responseTime: d.responseTime,
        error: d.error,
        createdAt: d.createdAt
      })),
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('[WEBHOOK] Get deliveries error:', error);
    res.status(500).json({ error: 'Erreur récupération historique' });
  }
});

// ===========================================
// POST /api/webhooks/events/publish (Internal)
// Publier un événement (appelé par autres services)
// ===========================================
router.post('/events/publish', async (req, res) => {
  try {
    const { eventType, logisticianId, data, sourceService } = req.body;
    const db = req.db;

    // Validation basique (en prod, ajouter authentification service-to-service)
    if (!eventType || !logisticianId) {
      return res.status(400).json({ error: 'eventType et logisticianId requis' });
    }

    // Créer événement
    const event = {
      id: `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      type: eventType,
      data: data || {},
      logisticianId: logisticianId,
      sourceService: sourceService || 'unknown',
      timestamp: new Date().toISOString()
    };

    // Sauvegarder événement
    await db.collection('webhook_events').insertOne({
      ...event,
      createdAt: new Date()
    });

    // Notifier via WebSocket
    notifyLogistician(logisticianId, {
      type: eventType,
      data: event.data,
      timestamp: event.timestamp
    });

    // Trouver webhooks abonnés
    const webhooks = await db.collection('logistician_webhooks')
      .find({
        logisticianId: new ObjectId(logisticianId),
        events: eventType,
        active: true,
        deletedAt: null
      })
      .toArray();

    // Envoyer webhooks de manière asynchrone
    const deliveryPromises = webhooks.map(webhook =>
      deliverWebhook(db, webhook, event)
    );

    // Ne pas attendre les livraisons
    Promise.allSettled(deliveryPromises).then(results => {
      console.log(`[WEBHOOK] Event ${eventType} delivered to ${results.length} webhooks`);
    });

    res.json({
      message: 'Événement publié',
      eventId: event.id,
      webhooksTriggered: webhooks.length
    });

  } catch (error) {
    console.error('[WEBHOOK] Publish event error:', error);
    res.status(500).json({ error: 'Erreur publication événement' });
  }
});

// ===========================================
// GET /api/logisticians/:id/events
// Historique des événements
// ===========================================
router.get('/:id/events', authenticateLogistician, async (req, res) => {
  try {
    const logisticianId = req.params.id;
    const { type, limit = 50, offset = 0 } = req.query;
    const db = req.db;

    const query = { logisticianId: logisticianId };
    if (type) query.type = type;

    const events = await db.collection('webhook_events')
      .find(query)
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(Math.min(parseInt(limit), 100))
      .toArray();

    const total = await db.collection('webhook_events').countDocuments(query);

    res.json({
      events: events.map(e => ({
        id: e.id,
        type: e.type,
        data: e.data,
        sourceService: e.sourceService,
        timestamp: e.timestamp,
        createdAt: e.createdAt
      })),
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('[WEBHOOK] Get events error:', error);
    res.status(500).json({ error: 'Erreur récupération événements' });
  }
});

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

async function sendWebhook(webhook, event) {
  const startTime = Date.now();

  try {
    // Créer signature
    const payload = JSON.stringify(event);
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(payload)
      .digest('hex');

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Event': event.type,
        'X-Webhook-Id': event.id,
        'User-Agent': 'SYMPHONIA-Webhook/1.0'
      },
      body: payload,
      signal: AbortSignal.timeout(30000) // 30s timeout
    });

    const responseTime = Date.now() - startTime;

    return {
      success: response.ok,
      statusCode: response.status,
      responseTime
    };

  } catch (error) {
    return {
      success: false,
      statusCode: 0,
      responseTime: Date.now() - startTime,
      error: error.message
    };
  }
}

async function deliverWebhook(db, webhook, event) {
  const result = await sendWebhook(webhook, event);

  // Enregistrer livraison
  await db.collection('webhook_deliveries').insertOne({
    webhookId: webhook._id,
    logisticianId: webhook.logisticianId,
    eventType: event.type,
    eventId: event.id,
    url: webhook.url,
    status: result.success ? 'success' : 'failed',
    statusCode: result.statusCode,
    responseTime: result.responseTime,
    error: result.error,
    createdAt: new Date()
  });

  // Mettre à jour webhook
  const updateData = {
    lastTriggered: new Date()
  };

  if (result.success) {
    updateData.failureCount = 0;
  } else {
    // Incrémenter compteur d'échecs
    await db.collection('logistician_webhooks').updateOne(
      { _id: webhook._id },
      {
        $inc: { failureCount: 1 },
        $set: { lastTriggered: new Date() }
      }
    );

    // Désactiver si trop d'échecs
    const updated = await db.collection('logistician_webhooks').findOne({ _id: webhook._id });
    if (updated.failureCount >= 10) {
      await db.collection('logistician_webhooks').updateOne(
        { _id: webhook._id },
        {
          $set: {
            active: false,
            deactivatedReason: 'Trop d\'échecs consécutifs'
          }
        }
      );

      // Notifier
      notifyLogistician(webhook.logisticianId.toString(), {
        type: 'webhook.disabled',
        webhookId: webhook._id.toString(),
        url: webhook.url,
        reason: 'Trop d\'échecs consécutifs'
      });
    }

    return;
  }

  await db.collection('logistician_webhooks').updateOne(
    { _id: webhook._id },
    { $set: updateData }
  );
}

export default router;
