# DOCUMENTATION WEBHOOKS & ÉVÉNEMENTS - SYMPHONI.A

## 📋 Vue d'Ensemble

Le système SYMPHONI.A génère plus de **20 types d'événements** en temps réel pour suivre l'intégralité du cycle de vie d'une commande de transport. Cette documentation couvre:

- Les 20+ types d'événements disponibles
- La configuration des webhooks pour recevoir les événements
- L'intégration WebSocket pour le temps réel
- Les schémas de payload et exemples
- La sécurité et la vérification des signatures
- Les patterns d'intégration avec Next.js/React

**Environnement:** Production
**Base URL:** `https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com`

---

## 🎯 Types d'Événements (20+ events)

### 1. Événements de Commande

| Événement | Description | Fréquence |
|-----------|-------------|-----------|
| `order.created` | Nouvelle commande créée | Par commande |
| `order.updated` | Commande modifiée | À chaque modification |
| `order.assigned` | Transporteur assigné | 1x par assignation |
| `order.cancelled` | Commande annulée | Rare |
| `order.closed` | Commande clôturée | 1x en fin de cycle |

### 2. Événements de Tracking

| Événement | Description | Fréquence |
|-----------|-------------|-----------|
| `tracking.started` | Tracking GPS démarré | 1x au début |
| `tracking.updated` | Position GPS mise à jour | Toutes les 30s-5min |
| `tracking.stopped` | Tracking arrêté | 1x à la fin |
| `tracking.email_sent` | Email de tracking envoyé | 1x (Tracking Basic) |
| `tracking.status_updated` | Statut mis à jour via email | 0-7x par commande |

### 3. Événements de Geofencing

| Événement | Description | Fréquence |
|-----------|-------------|-----------|
| `geofence.entered` | Entrée dans une zone | 2-4x par commande |
| `geofence.exited` | Sortie d'une zone | 2-4x par commande |
| `geofence.approaching` | Approche d'une zone (2km) | 2-4x par commande |

### 4. Événements de Documents

| Événement | Description | Fréquence |
|-----------|-------------|-----------|
| `document.uploaded` | Document uploadé | 1-5x par commande |
| `document.validated` | Document validé | 1-5x par commande |
| `document.ocr_completed` | OCR terminé | 1-3x par commande |
| `document.ocr_failed` | OCR échoué | Rare |

### 5. Événements de RDV

| Événement | Description | Fréquence |
|-----------|-------------|-----------|
| `rdv.requested` | RDV demandé | 0-2x par commande |
| `rdv.confirmed` | RDV confirmé | 0-2x par commande |
| `rdv.cancelled` | RDV annulé | Rare |

### 6. Événements d'ETA

| Événement | Description | Fréquence |
|-----------|-------------|-----------|
| `eta.updated` | ETA recalculé | Toutes les 5-30min |
| `eta.delay_detected` | Retard détecté | Si retard > 30min |
| `eta.on_time` | Livraison dans les temps | 1x par commande |

### 7. Événements de Dispatch

| Événement | Description | Fréquence |
|-----------|-------------|-----------|
| `dispatch.chain_started` | Chaîne de dispatch lancée | 1x par commande |
| `dispatch.carrier_notified` | Transporteur notifié | 1-5x par chaîne |
| `dispatch.carrier_accepted` | Offre acceptée | 1x par commande |
| `dispatch.carrier_rejected` | Offre refusée | 0-4x par chaîne |
| `dispatch.escalated` | Escaladé vers Affret.IA | Si échec |

### 8. Événements de Scoring

| Événement | Description | Fréquence |
|-----------|-------------|-----------|
| `carrier.scored` | Score transporteur calculé | 1x en fin |
| `carrier.rating_updated` | Note transporteur MAJ | 1x en fin |

---

## 🔗 Architecture Webhooks

### Schéma de Communication

```
SYMPHONI.A Backend                    Frontend/Client
      │                                     │
      │  1. Événement généré                │
      │  (order.created)                    │
      │                                     │
      │  2. POST /webhook-endpoint ────────▶│
      │     (with signature)                │
      │                                     │
      │◀──── 3. 200 OK ─────────────────────│
      │                                     │
      │  4. Si échec: Retry (3x)           │
      │     - Retry #1: après 5s            │
      │     - Retry #2: après 15s           │
      │     - Retry #3: après 60s           │
```

### Format du Payload

Tous les événements suivent ce format:

```json
{
  "id": "evt_673d1a2b45c6e7f8a9b0c1d2",
  "type": "order.created",
  "timestamp": "2025-11-25T22:30:00.000Z",
  "version": "1.6.0",
  "data": {
    // Données spécifiques à l'événement
  },
  "metadata": {
    "orderId": "673cfc580b68ebd4aecbe87f",
    "userId": "user_12345",
    "source": "API",
    "environment": "production"
  },
  "signature": "sha256=a7b8c9d0e1f2..." // Pour vérification
}
```

---

## 🛠️ Configuration des Webhooks

### 1. Créer un Endpoint dans Next.js

**Fichier:** `app/api/webhooks/symphonia/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Secret partagé avec SYMPHONI.A
const WEBHOOK_SECRET = process.env.SYMPHONIA_WEBHOOK_SECRET!;

// Fonction de vérification de signature
function verifySignature(payload: string, signature: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  return signature === `sha256=${expectedSignature}`;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Récupérer le payload brut
    const rawPayload = await request.text();

    // 2. Vérifier la signature
    const signature = request.headers.get('x-symphonia-signature') || '';

    if (!verifySignature(rawPayload, signature)) {
      console.error('⚠️ Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // 3. Parser le JSON
    const event = JSON.parse(rawPayload);

    // 4. Logger l'événement
    console.log(`📨 Webhook received: ${event.type}`, {
      id: event.id,
      orderId: event.metadata?.orderId,
      timestamp: event.timestamp
    });

    // 5. Router vers le bon handler
    await handleWebhookEvent(event);

    // 6. Répondre rapidement (< 5s)
    return NextResponse.json({ received: true, eventId: event.id });

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handler principal des événements
async function handleWebhookEvent(event: any) {
  switch (event.type) {
    case 'order.created':
      await handleOrderCreated(event);
      break;

    case 'tracking.updated':
      await handleTrackingUpdated(event);
      break;

    case 'geofence.entered':
      await handleGeofenceEntered(event);
      break;

    case 'document.uploaded':
      await handleDocumentUploaded(event);
      break;

    case 'eta.delay_detected':
      await handleDelayDetected(event);
      break;

    case 'order.closed':
      await handleOrderClosed(event);
      break;

    default:
      console.log(`ℹ️ Unhandled event type: ${event.type}`);
  }
}
```

### 2. Enregistrer votre Webhook

**Endpoint backend:** `POST /api/webhooks/register`

```bash
curl -X POST https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/api/webhooks/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "url": "https://votre-app.com/api/webhooks/symphonia",
    "events": [
      "order.created",
      "order.updated",
      "tracking.updated",
      "geofence.entered",
      "document.uploaded",
      "eta.delay_detected",
      "order.closed"
    ],
    "secret": "your-webhook-secret-key",
    "active": true
  }'
```

**Réponse:**
```json
{
  "success": true,
  "webhookId": "wh_673d1a2b45c6e7f8a9b0c1d2",
  "url": "https://votre-app.com/api/webhooks/symphonia",
  "events": ["order.created", "tracking.updated", ...],
  "status": "active",
  "createdAt": "2025-11-25T22:30:00.000Z"
}
```

---

## 📦 Schémas de Payload par Événement

### order.created

```json
{
  "id": "evt_001",
  "type": "order.created",
  "timestamp": "2025-11-25T10:00:00.000Z",
  "version": "1.6.0",
  "data": {
    "order": {
      "_id": "673cfc580b68ebd4aecbe87f",
      "reference": "CMD-20251125-001",
      "status": "created",
      "pickupLocation": {
        "address": "123 Rue de la Paix, 75001 Paris",
        "coordinates": [48.8566, 2.3522]
      },
      "deliveryLocation": {
        "address": "456 Avenue de Lyon, 69002 Lyon",
        "coordinates": [45.7640, 4.8357]
      },
      "goods": {
        "description": "Palettes électronique",
        "weight": 1500,
        "volume": 12,
        "quantity": 20
      },
      "pricing": {
        "basePrice": 450.00,
        "totalPrice": 540.00,
        "currency": "EUR"
      },
      "createdAt": "2025-11-25T10:00:00.000Z"
    }
  },
  "metadata": {
    "orderId": "673cfc580b68ebd4aecbe87f",
    "userId": "user_12345",
    "source": "WEB_APP"
  }
}
```

### tracking.updated (GPS Premium)

```json
{
  "id": "evt_002",
  "type": "tracking.updated",
  "timestamp": "2025-11-25T14:30:45.000Z",
  "version": "1.6.0",
  "data": {
    "orderId": "673cfc580b68ebd4aecbe87f",
    "position": {
      "latitude": 47.2184,
      "longitude": 6.0239,
      "accuracy": 15,
      "speed": 85,
      "heading": 180,
      "altitude": 320
    },
    "tracking": {
      "provider": "TOMTOM",
      "deviceId": "TT-DEVICE-12345",
      "timestamp": "2025-11-25T14:30:45.000Z"
    },
    "route": {
      "distanceRemaining": 145000,
      "durationRemaining": 7200,
      "eta": "2025-11-25T16:30:00.000Z"
    },
    "status": "en_route_to_delivery"
  },
  "metadata": {
    "orderId": "673cfc580b68ebd4aecbe87f",
    "subscriptionTier": "PREMIUM"
  }
}
```

### geofence.entered

```json
{
  "id": "evt_003",
  "type": "geofence.entered",
  "timestamp": "2025-11-25T15:55:30.000Z",
  "version": "1.6.0",
  "data": {
    "orderId": "673cfc580b68ebd4aecbe87f",
    "geofence": {
      "id": "gf_001",
      "name": "Zone de livraison - Lyon",
      "type": "delivery",
      "radius": 500,
      "center": {
        "latitude": 45.7640,
        "longitude": 4.8357
      }
    },
    "position": {
      "latitude": 45.7655,
      "longitude": 4.8340,
      "accuracy": 20
    },
    "notification": {
      "sent": true,
      "channels": ["EMAIL", "SMS", "WEBHOOK"]
    }
  },
  "metadata": {
    "orderId": "673cfc580b68ebd4aecbe87f",
    "eventType": "geofence_entry"
  }
}
```

### document.uploaded

```json
{
  "id": "evt_004",
  "type": "document.uploaded",
  "timestamp": "2025-11-25T16:30:00.000Z",
  "version": "1.6.0",
  "data": {
    "orderId": "673cfc580b68ebd4aecbe87f",
    "document": {
      "id": "doc_12345",
      "type": "POD",
      "filename": "POD_CMD-20251125-001_signed.pdf",
      "size": 245678,
      "mimeType": "application/pdf",
      "url": "https://s3.eu-central-1.amazonaws.com/...",
      "uploadedBy": "CARRIER",
      "uploadMethod": "EMAIL_LINK"
    },
    "ocr": {
      "scheduled": true,
      "provider": "AWS_TEXTRACT",
      "estimatedTime": 15
    }
  },
  "metadata": {
    "orderId": "673cfc580b68ebd4aecbe87f",
    "documentType": "POD"
  }
}
```

### document.ocr_completed

```json
{
  "id": "evt_005",
  "type": "document.ocr_completed",
  "timestamp": "2025-11-25T16:30:20.000Z",
  "version": "1.6.0",
  "data": {
    "orderId": "673cfc580b68ebd4aecbe87f",
    "documentId": "doc_12345",
    "ocr": {
      "provider": "AWS_TEXTRACT",
      "processingTime": 18.5,
      "confidence": 0.95,
      "extractedFields": {
        "podNumber": "POD-2025-001234",
        "deliveryDate": "2025-11-25",
        "recipientName": "Jean Dupont",
        "signature": {
          "detected": true,
          "confidence": 0.98,
          "boundingBox": {
            "x": 450,
            "y": 1200,
            "width": 200,
            "height": 80
          }
        },
        "quantities": [
          { "item": "Palette 1", "quantity": 20, "received": 20 }
        ],
        "remarks": null
      }
    }
  },
  "metadata": {
    "orderId": "673cfc580b68ebd4aecbe87f",
    "documentType": "POD"
  }
}
```

### eta.delay_detected

```json
{
  "id": "evt_006",
  "type": "eta.delay_detected",
  "timestamp": "2025-11-25T15:00:00.000Z",
  "version": "1.6.0",
  "data": {
    "orderId": "673cfc580b68ebd4aecbe87f",
    "delay": {
      "severity": "WARNING",
      "delayMinutes": 45,
      "originalETA": "2025-11-25T16:00:00.000Z",
      "newETA": "2025-11-25T16:45:00.000Z",
      "reason": "TRAFFIC_JAM",
      "location": {
        "latitude": 47.2184,
        "longitude": 6.0239,
        "city": "Besançon"
      }
    },
    "notifications": {
      "customerNotified": true,
      "carrierNotified": true,
      "channels": ["EMAIL", "SMS"]
    }
  },
  "metadata": {
    "orderId": "673cfc580b68ebd4aecbe87f",
    "alertType": "DELAY_WARNING"
  }
}
```

### order.closed

```json
{
  "id": "evt_007",
  "type": "order.closed",
  "timestamp": "2025-11-25T17:00:00.000Z",
  "version": "1.6.0",
  "data": {
    "orderId": "673cfc580b68ebd4aecbe87f",
    "closure": {
      "closedAt": "2025-11-25T17:00:00.000Z",
      "closedBy": "SYSTEM_AUTO",
      "reason": "DELIVERY_COMPLETED",
      "checklist": {
        "documentsValidated": true,
        "podReceived": true,
        "cmrSigned": true,
        "paymentProcessed": true,
        "carrierScored": true
      }
    },
    "scoring": {
      "carrierScore": 92,
      "breakdown": {
        "punctuality": 25,
        "communication": 18,
        "documentCompliance": 24,
        "customerFeedback": 25
      }
    },
    "stats": {
      "totalDistance": 465000,
      "totalDuration": 28800,
      "averageSpeed": 58.1,
      "fuelConsumed": 135,
      "co2Emissions": 355
    }
  },
  "metadata": {
    "orderId": "673cfc580b68ebd4aecbe87f",
    "finalStatus": "COMPLETED"
  }
}
```

---

## 🔒 Sécurité des Webhooks

### 1. Vérification de Signature HMAC SHA-256

**Backend (SYMPHONI.A):**
```javascript
const crypto = require('crypto');

function signPayload(payload, secret) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return `sha256=${signature}`;
}

// Headers envoyés
headers['X-Symphonia-Signature'] = signPayload(eventPayload, webhookSecret);
headers['X-Symphonia-Event-Type'] = event.type;
headers['X-Symphonia-Event-Id'] = event.id;
headers['X-Symphonia-Timestamp'] = event.timestamp;
```

**Frontend (Vérification):**
```typescript
import crypto from 'crypto';

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const receivedSignature = signature.replace('sha256=', '');

  // Comparaison constante pour éviter timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(receivedSignature)
  );
}

// Utilisation
const isValid = verifyWebhookSignature(
  rawPayload,
  request.headers.get('x-symphonia-signature')!,
  process.env.SYMPHONIA_WEBHOOK_SECRET!
);

if (!isValid) {
  return new Response('Invalid signature', { status: 401 });
}
```

### 2. Protection contre Replay Attacks

```typescript
const WEBHOOK_TOLERANCE = 5 * 60 * 1000; // 5 minutes

function validateTimestamp(timestamp: string): boolean {
  const eventTime = new Date(timestamp).getTime();
  const now = Date.now();

  const diff = Math.abs(now - eventTime);

  if (diff > WEBHOOK_TOLERANCE) {
    console.warn('⚠️ Webhook timestamp too old:', {
      timestamp,
      diff: `${Math.round(diff / 1000)}s`
    });
    return false;
  }

  return true;
}

// Stockage des événements déjà traités (Redis)
const processedEvents = new Set();

async function checkEventDuplicate(eventId: string): Promise<boolean> {
  if (processedEvents.has(eventId)) {
    console.warn('⚠️ Duplicate event detected:', eventId);
    return true;
  }

  processedEvents.add(eventId);

  // Expiration après 10 minutes
  setTimeout(() => processedEvents.delete(eventId), 10 * 60 * 1000);

  return false;
}
```

### 3. Liste Blanche IP (Optionnel)

```typescript
const SYMPHONIA_IPS = [
  '63.180.56.79',      // rt-subscriptions-api-prod
  '18.157.128.45',     // rt-authz-api-prod
  // Ajoutez les IPs autorisées
];

function isAllowedIP(ip: string): boolean {
  return SYMPHONIA_IPS.includes(ip);
}

// Middleware Next.js
export async function POST(request: NextRequest) {
  const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                   request.headers.get('x-real-ip') ||
                   'unknown';

  if (!isAllowedIP(clientIP)) {
    console.warn('⚠️ Unauthorized IP:', clientIP);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Continuer le traitement...
}
```

---

## 🔄 Retry Mechanism

### Stratégie de Retry (Backend)

Le backend SYMPHONI.A tente de renvoyer les webhooks en cas d'échec:

```
Tentative 1: Immédiat
Tentative 2: +5 secondes (si échec)
Tentative 3: +15 secondes (si échec)
Tentative 4: +60 secondes (si échec)
Tentative 5: +300 secondes (si échec)
```

**Codes HTTP déclenchant un retry:**
- `408` Request Timeout
- `429` Too Many Requests
- `500` Internal Server Error
- `502` Bad Gateway
- `503` Service Unavailable
- `504` Gateway Timeout

**Codes HTTP sans retry:**
- `200` OK
- `201` Created
- `400` Bad Request (signature invalide, payload malformé)
- `401` Unauthorized
- `403` Forbidden
- `404` Not Found

### Headers de Retry

Lors d'un retry, le backend ajoute ces headers:

```
X-Symphonia-Retry-Count: 2
X-Symphonia-Original-Timestamp: 2025-11-25T10:00:00.000Z
X-Symphonia-Retry-Reason: connection_timeout
```

### Gestion côté Frontend

```typescript
// Accepter les retries avec idempotence
export async function POST(request: NextRequest) {
  const eventId = request.headers.get('x-symphonia-event-id')!;
  const retryCount = parseInt(
    request.headers.get('x-symphonia-retry-count') || '0'
  );

  // Vérifier si déjà traité (idempotence)
  const alreadyProcessed = await checkEventProcessed(eventId);

  if (alreadyProcessed) {
    console.log(`✅ Event ${eventId} already processed, skipping`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Logger les retries
  if (retryCount > 0) {
    console.log(`🔄 Retry #${retryCount} for event ${eventId}`);
  }

  // Traiter l'événement
  await handleWebhookEvent(event);

  // Marquer comme traité
  await markEventProcessed(eventId);

  return NextResponse.json({ received: true });
}
```

---

## 🌐 WebSocket pour Temps Réel

### Architecture WebSocket

Pour les mises à jour ultra-rapides (tracking GPS, ETA, etc.), utilisez WebSocket:

```
Client Frontend                    WebSocket Server (SYMPHONI.A)
       │                                     │
       │  1. ws://... + JWT ────────────────▶│
       │                                     │
       │◀──── 2. Connected ──────────────────│
       │                                     │
       │◀──── 3. tracking.updated ───────────│ (toutes les 30s)
       │◀──── 4. eta.updated ────────────────│ (toutes les 5min)
       │◀──── 5. geofence.entered ───────────│ (événement)
       │                                     │
       │  6. ping ───────────────────────────▶│
       │◀──── 7. pong ───────────────────────│
```

### Connexion WebSocket

**Fichier:** `hooks/useWebSocketTracking.ts`

```typescript
import { useEffect, useState, useRef } from 'react';

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

export function useWebSocketTracking(orderId: string, token: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    // URL WebSocket avec authentification
    const wsUrl = `wss://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/ws/tracking/${orderId}?token=${token}`;

    // Connexion
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('✅ WebSocket connected');
      setIsConnected(true);
      setError(null);
    };

    ws.current.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        console.log('📨 WebSocket message:', message.type);
        setLastMessage(message);
      } catch (err) {
        console.error('❌ Failed to parse WebSocket message:', err);
      }
    };

    ws.current.onerror = (event) => {
      console.error('❌ WebSocket error:', event);
      setError('WebSocket connection error');
    };

    ws.current.onclose = (event) => {
      console.log('🔌 WebSocket disconnected:', event.code, event.reason);
      setIsConnected(false);

      // Reconnexion automatique après 5s
      if (event.code !== 1000) {
        setTimeout(() => {
          console.log('🔄 Attempting to reconnect...');
          // Réinitialiser la connexion
        }, 5000);
      }
    };

    // Heartbeat ping toutes les 30s
    const pingInterval = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    // Cleanup
    return () => {
      clearInterval(pingInterval);
      ws.current?.close(1000, 'Component unmounted');
    };
  }, [orderId, token]);

  return { isConnected, lastMessage, error };
}
```

### Utilisation dans un Composant

```typescript
'use client';

import { useWebSocketTracking } from '@/hooks/useWebSocketTracking';
import { useEffect, useState } from 'react';

export default function LiveTrackingMap({ orderId }: { orderId: string }) {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [eta, setEta] = useState<string | null>(null);

  const { isConnected, lastMessage, error } = useWebSocketTracking(
    orderId,
    localStorage.getItem('token')!
  );

  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case 'tracking.updated':
        setPosition({
          lat: lastMessage.data.position.latitude,
          lng: lastMessage.data.position.longitude
        });
        setEta(lastMessage.data.route.eta);
        break;

      case 'eta.updated':
        setEta(lastMessage.data.newETA);
        break;

      case 'geofence.entered':
        // Afficher une notification
        console.log('🎯 Geofence entered:', lastMessage.data.geofence.name);
        break;
    }
  }, [lastMessage]);

  return (
    <div className="relative h-screen">
      {/* Statut connexion */}
      <div className="absolute top-4 right-4 z-10 bg-white rounded-lg shadow-lg p-3">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm font-medium">
            {isConnected ? 'Connecté' : 'Déconnecté'}
          </span>
        </div>
        {eta && (
          <div className="mt-2 text-xs text-gray-600">
            ETA: {new Date(eta).toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Carte avec position en temps réel */}
      {position && (
        <Map center={position} zoom={14}>
          <Marker position={position} icon="truck" />
        </Map>
      )}

      {error && (
        <div className="absolute bottom-4 left-4 bg-red-100 text-red-800 p-3 rounded-lg">
          {error}
        </div>
      )}
    </div>
  );
}
```

---

## 📊 Handlers d'Événements

### Pattern de Traitement Asynchrone

```typescript
// handlers/orderHandlers.ts

import { db } from '@/lib/database';
import { sendNotification } from '@/lib/notifications';

export async function handleOrderCreated(event: any) {
  const { order } = event.data;

  try {
    // 1. Stocker dans la base de données locale
    await db.orders.create({
      id: order._id,
      reference: order.reference,
      status: order.status,
      pickupAddress: order.pickupLocation.address,
      deliveryAddress: order.deliveryLocation.address,
      createdAt: new Date(order.createdAt),
      syncedAt: new Date()
    });

    // 2. Envoyer notification à l'utilisateur
    await sendNotification({
      userId: event.metadata.userId,
      type: 'ORDER_CREATED',
      title: 'Nouvelle commande créée',
      message: `Commande ${order.reference} créée avec succès`,
      data: { orderId: order._id }
    });

    // 3. Déclencher des actions métier
    await triggerBusinessLogic('order_created', order);

    console.log('✅ Order created event processed:', order._id);
  } catch (error) {
    console.error('❌ Error processing order.created:', error);
    // Logger pour retry manuel
    await db.failedWebhooks.create({
      eventId: event.id,
      eventType: event.type,
      error: error.message,
      payload: event,
      createdAt: new Date()
    });
  }
}

export async function handleTrackingUpdated(event: any) {
  const { orderId, position, route } = event.data;

  try {
    // Mettre à jour en temps réel via WebSocket côté client
    // (si vous avez un serveur WebSocket Next.js)
    await broadcastToClients(`order:${orderId}`, {
      type: 'position_update',
      position,
      eta: route.eta
    });

    // Stocker la dernière position
    await db.orders.update(orderId, {
      lastPosition: position,
      lastETA: route.eta,
      updatedAt: new Date()
    });

    console.log('✅ Tracking updated:', orderId);
  } catch (error) {
    console.error('❌ Error processing tracking.updated:', error);
  }
}

export async function handleGeofenceEntered(event: any) {
  const { orderId, geofence } = event.data;

  try {
    // Notification push temps réel
    await sendNotification({
      orderId,
      type: 'GEOFENCE_ALERT',
      title: `🎯 ${geofence.name}`,
      message: `Le transporteur est entré dans la zone ${geofence.name}`,
      priority: 'HIGH',
      channels: ['PUSH', 'EMAIL']
    });

    // Mettre à jour le statut
    await db.orders.update(orderId, {
      currentGeofence: geofence.id,
      geofenceEnteredAt: new Date()
    });

    console.log('✅ Geofence entered:', geofence.name);
  } catch (error) {
    console.error('❌ Error processing geofence.entered:', error);
  }
}

export async function handleDelayDetected(event: any) {
  const { orderId, delay } = event.data;

  try {
    // Alerte immédiate pour les retards
    await sendNotification({
      orderId,
      type: 'DELAY_ALERT',
      title: '⚠️ Retard détecté',
      message: `Retard de ${delay.delayMinutes} minutes. Nouvelle ETA: ${delay.newETA}`,
      priority: 'URGENT',
      channels: ['PUSH', 'EMAIL', 'SMS']
    });

    // Logger pour analytics
    await db.delays.create({
      orderId,
      severity: delay.severity,
      delayMinutes: delay.delayMinutes,
      reason: delay.reason,
      location: delay.location,
      detectedAt: new Date()
    });

    console.log('⚠️ Delay detected:', delay.delayMinutes, 'min');
  } catch (error) {
    console.error('❌ Error processing delay.detected:', error);
  }
}

export async function handleDocumentUploaded(event: any) {
  const { orderId, document } = event.data;

  try {
    // Notification de document reçu
    await sendNotification({
      orderId,
      type: 'DOCUMENT_RECEIVED',
      title: `📄 ${document.type} reçu`,
      message: `Le document ${document.type} a été uploadé`,
      data: { documentId: document.id }
    });

    // Si OCR programmé, attendre les résultats
    if (document.ocr?.scheduled) {
      console.log('⏳ OCR scheduled for document:', document.id);
    }

    console.log('✅ Document uploaded:', document.filename);
  } catch (error) {
    console.error('❌ Error processing document.uploaded:', error);
  }
}

export async function handleOrderClosed(event: any) {
  const { orderId, closure, scoring } = event.data;

  try {
    // Marquer la commande comme complétée
    await db.orders.update(orderId, {
      status: 'COMPLETED',
      closedAt: new Date(closure.closedAt),
      carrierScore: scoring.carrierScore,
      finalChecklist: closure.checklist
    });

    // Notification de clôture
    await sendNotification({
      orderId,
      type: 'ORDER_COMPLETED',
      title: '✅ Commande terminée',
      message: `La commande a été clôturée avec succès. Score transporteur: ${scoring.carrierScore}/100`,
      priority: 'NORMAL'
    });

    // Déclencher facturation si applicable
    await triggerInvoicing(orderId, event.data);

    console.log('✅ Order closed:', orderId, 'Score:', scoring.carrierScore);
  } catch (error) {
    console.error('❌ Error processing order.closed:', error);
  }
}
```

---

## 🧪 Tests & Debugging

### 1. Tester votre Endpoint Webhook

**Utiliser ngrok pour exposer localhost:**

```bash
# Installer ngrok
npm install -g ngrok

# Exposer le port 3000
ngrok http 3000

# Copier l'URL (ex: https://abc123.ngrok.io)
# Enregistrer: https://abc123.ngrok.io/api/webhooks/symphonia
```

### 2. Simuler un Événement (Testing)

```bash
# Script de test: test-webhook.sh

curl -X POST http://localhost:3000/api/webhooks/symphonia \
  -H "Content-Type: application/json" \
  -H "X-Symphonia-Signature: sha256=$(echo -n '{\"id\":\"test\",\"type\":\"order.created\"}' | openssl dgst -sha256 -hmac 'your-secret' | cut -d' ' -f2)" \
  -H "X-Symphonia-Event-Type: order.created" \
  -H "X-Symphonia-Event-Id: evt_test_001" \
  -d '{
    "id": "evt_test_001",
    "type": "order.created",
    "timestamp": "2025-11-25T10:00:00.000Z",
    "version": "1.6.0",
    "data": {
      "order": {
        "_id": "test123",
        "reference": "TEST-001",
        "status": "created"
      }
    },
    "metadata": {
      "orderId": "test123"
    }
  }'
```

### 3. Logs de Debugging

```typescript
// Ajouter des logs détaillés

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  console.log(`[${requestId}] 📥 Webhook received`, {
    headers: Object.fromEntries(request.headers),
    timestamp: new Date().toISOString()
  });

  try {
    const rawPayload = await request.text();

    console.log(`[${requestId}] 📝 Payload size: ${rawPayload.length} bytes`);

    const event = JSON.parse(rawPayload);

    console.log(`[${requestId}] 📨 Event details`, {
      id: event.id,
      type: event.type,
      orderId: event.metadata?.orderId
    });

    await handleWebhookEvent(event);

    console.log(`[${requestId}] ✅ Webhook processed successfully`);

    return NextResponse.json({ received: true, requestId });

  } catch (error) {
    console.error(`[${requestId}] ❌ Error:`, error);
    return NextResponse.json(
      { error: 'Internal error', requestId },
      { status: 500 }
    );
  }
}
```

### 4. Dashboard de Monitoring

Créez une page admin pour monitorer les webhooks:

```typescript
// app/admin/webhooks/page.tsx

export default async function WebhooksPage() {
  const failedWebhooks = await db.failedWebhooks.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Webhooks Monitoring</h1>

      <div className="bg-white rounded-lg shadow">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="p-4 text-left">Event ID</th>
              <th className="p-4 text-left">Type</th>
              <th className="p-4 text-left">Order ID</th>
              <th className="p-4 text-left">Error</th>
              <th className="p-4 text-left">Timestamp</th>
              <th className="p-4 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {failedWebhooks.map((webhook) => (
              <tr key={webhook.id} className="border-b hover:bg-gray-50">
                <td className="p-4 font-mono text-sm">{webhook.eventId}</td>
                <td className="p-4">{webhook.eventType}</td>
                <td className="p-4">{webhook.payload.metadata?.orderId}</td>
                <td className="p-4 text-red-600 text-sm">{webhook.error}</td>
                <td className="p-4 text-sm text-gray-600">
                  {new Date(webhook.createdAt).toLocaleString()}
                </td>
                <td className="p-4">
                  <button
                    onClick={() => retryWebhook(webhook.id)}
                    className="text-blue-600 hover:underline"
                  >
                    Retry
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

## 📚 Exemples d'Intégration Complète

### Cas d'Usage: Suivi d'une Commande en Temps Réel

```typescript
// components/OrderTracking.tsx

'use client';

import { useState, useEffect } from 'react';
import { useWebSocketTracking } from '@/hooks/useWebSocketTracking';
import { getOrder } from '@/lib/api/orders';

interface TrackingEvent {
  type: string;
  timestamp: string;
  description: string;
  location?: string;
}

export default function OrderTracking({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<any>(null);
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);

  const { isConnected, lastMessage } = useWebSocketTracking(
    orderId,
    localStorage.getItem('token')!
  );

  // Charger la commande initiale
  useEffect(() => {
    getOrder(orderId).then(setOrder);
  }, [orderId]);

  // Traiter les événements WebSocket
  useEffect(() => {
    if (!lastMessage) return;

    const newEvent: TrackingEvent = {
      type: lastMessage.type,
      timestamp: lastMessage.timestamp,
      description: getEventDescription(lastMessage),
      location: getEventLocation(lastMessage)
    };

    setEvents((prev) => [newEvent, ...prev]);

    // Mettre à jour la position si tracking GPS
    if (lastMessage.type === 'tracking.updated') {
      setPosition({
        lat: lastMessage.data.position.latitude,
        lng: lastMessage.data.position.longitude
      });
    }
  }, [lastMessage]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Carte en temps réel */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-xl font-bold mb-4">Position Temps Réel</h2>
        <div className="relative h-96">
          {position ? (
            <Map center={position} zoom={12}>
              <Marker position={position} icon="truck" />
              <Route
                from={order?.pickupLocation.coordinates}
                to={order?.deliveryLocation.coordinates}
              />
            </Map>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              En attente du tracking GPS...
            </div>
          )}

          {/* Indicateur connexion */}
          <div className="absolute top-2 right-2 bg-white rounded-full px-3 py-1 shadow">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className="text-xs">{isConnected ? 'Live' : 'Offline'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline des événements */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-xl font-bold mb-4">Historique des Événements</h2>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {events.map((event, index) => (
            <div key={index} className="flex gap-3 pb-3 border-b last:border-0">
              <div className="flex-shrink-0">
                <EventIcon type={event.type} />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{event.description}</p>
                {event.location && (
                  <p className="text-xs text-gray-600 mt-1">{event.location}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(event.timestamp).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getEventDescription(message: any): string {
  switch (message.type) {
    case 'order.created':
      return 'Commande créée';
    case 'tracking.started':
      return 'Tracking GPS démarré';
    case 'tracking.updated':
      return 'Position mise à jour';
    case 'geofence.entered':
      return `Entrée dans ${message.data.geofence.name}`;
    case 'document.uploaded':
      return `Document ${message.data.document.type} reçu`;
    case 'eta.delay_detected':
      return `Retard détecté: +${message.data.delay.delayMinutes} min`;
    case 'order.closed':
      return 'Commande clôturée';
    default:
      return message.type;
  }
}
```

---

## ✅ Checklist d'Intégration

### Configuration Backend
- [ ] Webhook secret généré et sécurisé
- [ ] Endpoint webhook enregistré dans SYMPHONI.A
- [ ] Types d'événements sélectionnés
- [ ] Signature HMAC SHA-256 configurée
- [ ] Retry mechanism testé

### Configuration Frontend
- [ ] Route API `/api/webhooks/symphonia` créée
- [ ] Vérification de signature implémentée
- [ ] Protection replay attacks ajoutée
- [ ] Handlers d'événements créés
- [ ] Stockage des événements échoués
- [ ] Logs de debugging activés

### WebSocket (Optionnel)
- [ ] Hook `useWebSocketTracking` implémenté
- [ ] Reconnexion automatique configurée
- [ ] Heartbeat ping/pong actif
- [ ] Handlers de messages créés

### Tests
- [ ] Test avec ngrok effectué
- [ ] Simulation d'événements validée
- [ ] Dashboard de monitoring créé
- [ ] Alertes configurées pour échecs

### Production
- [ ] Variables d'environnement configurées
- [ ] Liste blanche IP activée (optionnel)
- [ ] Monitoring CloudWatch/Datadog configuré
- [ ] Documentation équipe complétée

---

## 📞 Support & Ressources

### Endpoints de Configuration

```bash
# Enregistrer un webhook
POST /api/webhooks/register

# Liste des webhooks
GET /api/webhooks

# Mettre à jour un webhook
PUT /api/webhooks/:webhookId

# Supprimer un webhook
DELETE /api/webhooks/:webhookId

# Historique des webhooks envoyés
GET /api/webhooks/:webhookId/deliveries

# Retry manuel d'un webhook
POST /api/webhooks/deliveries/:deliveryId/retry
```

### Documentation Associée

- [GUIDE_INTEGRATION_FRONTEND.md](./GUIDE_INTEGRATION_FRONTEND.md) - Guide complet d'intégration Next.js
- [DEPLOYMENT_V1.6.0_COMPLETE.md](./DEPLOYMENT_V1.6.0_COMPLETE.md) - Détails du déploiement
- [CONFIGURATION_OCR_AWS_GOOGLE.md](./CONFIGURATION_OCR_AWS_GOOGLE.md) - Configuration OCR

---

**Version:** 1.6.0
**Créé le:** 25 novembre 2025
**Par:** Claude Code (Anthropic)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
