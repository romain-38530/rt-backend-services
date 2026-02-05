/**
 * Dashdoc Webhooks v2 Routes
 * Receives real-time events from Dashdoc instead of polling
 *
 * Documentation: https://developer.dashdoc.com/docs/webhooks/webhooks-v2
 *
 * Event Types handled:
 * - transport.created, transport.updated, transport.amended
 * - transport.deleted, transport.restored, transport.cancelled
 * - transport.assigned, transport.confirmed, transport.declined
 * - transport.departed, transport.on_loading_site, transport.on_unloading_site
 * - transport.done, transport.verified, transport.invoiced
 * - document.added
 *
 * Configuration in Dashdoc:
 * 1. Go to Account Settings > API > Webhooks
 * 2. Add webhook URL: https://dn8zbjfd06ewt.cloudfront.net/api/v1/webhooks/dashdoc
 * 3. Add Authorization header: Bearer <WEBHOOK_SECRET>
 * 4. Select events: transport.* and document.added
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Webhook secret for validation (set in environment)
const WEBHOOK_SECRET = process.env.DASHDOC_WEBHOOK_SECRET || 'dashdoc-webhook-secret-symphonia-2026';

/**
 * Validate webhook authorization
 */
function validateWebhookAuth(req) {
  const authHeader = req.headers.authorization;

  // If no secret configured, skip validation (development mode)
  if (!WEBHOOK_SECRET || WEBHOOK_SECRET === 'dashdoc-webhook-secret-symphonia-2026') {
    console.log('[WEBHOOK] Warning: Using default webhook secret - configure DASHDOC_WEBHOOK_SECRET in production');
    return true;
  }

  if (!authHeader) {
    return false;
  }

  // Check Bearer token
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return token === WEBHOOK_SECRET;
  }

  return false;
}

/**
 * POST /api/v1/webhooks/dashdoc
 * Main webhook endpoint for all Dashdoc events
 */
router.post('/dashdoc', async (req, res) => {
  const startTime = Date.now();

  try {
    // Validate authorization
    if (!validateWebhookAuth(req)) {
      console.log('[WEBHOOK] Unauthorized webhook request');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = req.body;
    const eventType = payload.type || 'unknown';
    const version = payload.version || 'v1';

    console.log(`[WEBHOOK] Received event: ${eventType} (version: ${version})`);

    // Get database connection from app
    const db = req.app.locals.datalakeDb;
    if (!db) {
      console.error('[WEBHOOK] Data Lake database not connected');
      return res.status(503).json({ error: 'Database not available' });
    }

    // Process the event
    const result = await processWebhookEvent(db, payload);

    const duration = Date.now() - startTime;
    console.log(`[WEBHOOK] Processed ${eventType} in ${duration}ms - ${result.action}`);

    // Always return 200 quickly to avoid Dashdoc retries
    res.status(200).json({
      success: true,
      event: eventType,
      action: result.action,
      transportUid: result.transportUid,
      duration: duration
    });

  } catch (error) {
    console.error('[WEBHOOK] Error processing webhook:', error.message);

    // Return 200 anyway to prevent retries for processing errors
    // Dashdoc will retry on 4xx/5xx errors
    res.status(200).json({
      success: false,
      error: error.message,
      note: 'Event acknowledged but processing failed'
    });
  }
});

/**
 * Process webhook event and update Data Lake
 */
async function processWebhookEvent(db, payload) {
  const eventType = payload.type || '';
  const transportData = payload.data;
  const eventData = payload.event;

  // Extract transport UID
  let transportUid = null;
  if (transportData && transportData.uid) {
    transportUid = transportData.uid;
  } else if (eventData && eventData.transport) {
    transportUid = eventData.transport.uid || eventData.transport;
  }

  const collection = db.collection('dashdoc_transports');

  // Handle different event types
  switch (eventType) {
    case 'transport.created':
    case 'transport.updated':
    case 'transport.amended':
    case 'transport.restored':
      // Full transport data available - upsert to Data Lake
      if (transportData) {
        await upsertTransport(collection, transportData);
        return { action: 'upserted', transportUid };
      }
      return { action: 'skipped_no_data', transportUid };

    case 'transport.deleted':
      // Mark as deleted in Data Lake (soft delete)
      if (transportUid) {
        await collection.updateOne(
          { dashdocUid: transportUid },
          {
            $set: {
              'status': 'deleted',
              'deletedAt': new Date(),
              'syncedAt': new Date()
            }
          }
        );
        return { action: 'marked_deleted', transportUid };
      }
      return { action: 'skipped_no_uid', transportUid };

    case 'transport.cancelled':
      // Update status to cancelled
      if (transportUid) {
        await collection.updateOne(
          { dashdocUid: transportUid },
          {
            $set: {
              'status': 'cancelled',
              'cancelledAt': new Date(),
              'syncedAt': new Date()
            }
          }
        );
        // Also upsert full data if available
        if (transportData) {
          await upsertTransport(collection, transportData);
        }
        return { action: 'cancelled', transportUid };
      }
      return { action: 'skipped_no_uid', transportUid };

    case 'transport.assigned':
    case 'transport.confirmed':
    case 'transport.declined':
    case 'transport.acknowledged':
      // Carrier assignment events - update if we have data
      if (transportData) {
        await upsertTransport(collection, transportData);
        return { action: `${eventType.split('.')[1]}`, transportUid };
      } else if (transportUid && eventData) {
        // Partial update from event data
        await updateTransportStatus(collection, transportUid, eventType, eventData);
        return { action: `status_updated`, transportUid };
      }
      return { action: 'skipped', transportUid };

    case 'transport.departed':
    case 'transport.on_loading_site':
    case 'transport.loading_complete':
    case 'transport.on_unloading_site':
    case 'transport.unloading_complete':
    case 'transport.on_the_way':
    case 'transport.done':
    case 'transport.verified':
    case 'transport.invoiced':
    case 'transport.paid':
      // Status change events
      if (transportData) {
        await upsertTransport(collection, transportData);
        return { action: `status_${eventType.split('.')[1]}`, transportUid };
      } else if (transportUid) {
        await updateTransportStatus(collection, transportUid, eventType, eventData);
        return { action: `status_updated`, transportUid };
      }
      return { action: 'skipped', transportUid };

    case 'document.added':
      // Document added to transport
      console.log(`[WEBHOOK] Document added event - transport: ${transportUid}`);
      if (transportUid) {
        await collection.updateOne(
          { dashdocUid: transportUid },
          {
            $set: {
              'hasNewDocuments': true,
              'lastDocumentAt': new Date(),
              'syncedAt': new Date()
            }
          }
        );
        return { action: 'document_flagged', transportUid };
      }
      return { action: 'skipped', transportUid };

    default:
      console.log(`[WEBHOOK] Unhandled event type: ${eventType}`);
      return { action: 'ignored', transportUid };
  }
}

/**
 * Upsert transport to Data Lake
 */
async function upsertTransport(collection, transportData) {
  const uid = transportData.uid;
  if (!uid) {
    console.log('[WEBHOOK] Cannot upsert transport without UID');
    return;
  }

  // Map transport data to our schema
  const document = {
    dashdocUid: uid,
    _rawData: transportData,
    status: mapTransportStatus(transportData),

    // Extract key fields for querying
    shipper: transportData.shipper ? {
      name: transportData.shipper.name,
      pk: transportData.shipper.pk
    } : null,

    carrier: transportData.carrier ? {
      name: transportData.carrier.name,
      pk: transportData.carrier.pk,
      externalId: String(transportData.carrier.pk)
    } : null,

    // Pickup info
    pickup: extractActivityInfo(transportData, 'loading'),

    // Delivery info
    delivery: extractActivityInfo(transportData, 'unloading'),

    // Pricing
    pricing: {
      agreedPrice: transportData.agreed_price,
      invoicedPrice: transportData.invoiced_price,
      currency: 'EUR'
    },

    // Timestamps
    createdAt: transportData.created ? new Date(transportData.created) : null,
    updatedAt: transportData.updated ? new Date(transportData.updated) : new Date(),
    syncedAt: new Date(),
    syncSource: 'webhook',

    // Checksum for change detection
    checksum: generateChecksum(transportData)
  };

  await collection.updateOne(
    { dashdocUid: uid },
    { $set: document },
    { upsert: true }
  );
}

/**
 * Update transport status from event data
 */
async function updateTransportStatus(collection, transportUid, eventType, eventData) {
  const status = eventType.split('.')[1];

  const update = {
    $set: {
      status: status,
      syncedAt: new Date(),
      lastEventType: eventType,
      lastEventAt: new Date()
    }
  };

  // Add event-specific data if available
  if (eventData) {
    update.$push = {
      events: {
        type: eventType,
        data: eventData,
        receivedAt: new Date()
      }
    };
  }

  await collection.updateOne(
    { dashdocUid: transportUid },
    update
  );
}

/**
 * Extract activity info (pickup/delivery) from transport
 */
function extractActivityInfo(transport, type) {
  const deliveries = transport.deliveries || [];

  for (const delivery of deliveries) {
    const activities = type === 'loading'
      ? (delivery.origin ? [delivery.origin] : [])
      : (delivery.destination ? [delivery.destination] : []);

    for (const activity of activities) {
      if (activity) {
        return {
          address: activity.address ? {
            city: activity.address.city,
            postcode: activity.address.postcode,
            country: activity.address.country
          } : null,
          scheduledAt: activity.slots && activity.slots[0]
            ? activity.slots[0].start
            : null,
          company: activity.address?.company?.name
        };
      }
    }
  }

  return null;
}

/**
 * Map Dashdoc transport status to our status
 */
function mapTransportStatus(transport) {
  if (transport.global_status) {
    return transport.global_status.toLowerCase();
  }
  if (transport.status) {
    return transport.status.toLowerCase();
  }
  return 'unknown';
}

/**
 * Generate checksum for change detection
 */
function generateChecksum(data) {
  const str = JSON.stringify(data);
  return crypto.createHash('md5').update(str).digest('hex').substring(0, 16);
}

/**
 * GET /api/v1/webhooks/dashdoc/health
 * Health check for webhook endpoint
 */
router.get('/dashdoc/health', (req, res) => {
  res.json({
    success: true,
    service: 'Dashdoc Webhooks',
    status: 'ready',
    timestamp: new Date().toISOString(),
    endpoints: {
      webhook: 'POST /api/v1/webhooks/dashdoc',
      health: 'GET /api/v1/webhooks/dashdoc/health'
    },
    configuration: {
      secretConfigured: WEBHOOK_SECRET !== 'dashdoc-webhook-secret-symphonia-2026',
      supportedEvents: [
        'transport.created', 'transport.updated', 'transport.cancelled',
        'transport.assigned', 'transport.departed', 'transport.done',
        'document.added'
      ]
    }
  });
});

module.exports = router;
