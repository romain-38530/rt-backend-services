# SYMPHONI.A WebSocket API

API WebSocket temps réel pour SYMPHONI.A, gérant tous les événements du cycle de vie des commandes de transport.

## Vue d'ensemble

Ce service fournit une communication bidirectionnelle en temps réel entre le backend et le frontend via Socket.io. Il gère:

- **Événements de commandes** (création, mise à jour, annulation)
- **Tracking GPS en temps réel** (position, ETA, géofencing)
- **Notifications instantanées** (acceptation transporteur, incidents)
- **Gestion de rendez-vous** (proposition, confirmation)
- **Documents et OCR** (upload, validation)
- **Scoring transporteurs** (mise à jour scores)

## Installation

```bash
cd /c/Users/rtard/rt-backend-services/services/websocket-api
npm install
```

## Configuration

Copiez `.env.example` vers `.env` et configurez:

```env
PORT=3010
NODE_ENV=production
JWT_SECRET=votre-secret-jwt
MONGODB_URI=mongodb+srv://...
ALLOWED_ORIGINS=https://app.symphonia.com,http://localhost:3000
HEARTBEAT_INTERVAL=30000
CONNECTION_TIMEOUT=60000
```

## Démarrage

```bash
# Mode production
npm start

# Mode développement avec auto-reload
npm run dev
```

## Architecture

### Structure des fichiers

```
websocket-api/
├── index.js              # Serveur principal Socket.io
├── src/
│   ├── auth.js          # Authentification JWT
│   └── events.js        # Gestionnaires d'événements
├── package.json
├── .env.example
└── README.md
```

### Authentification

Toutes les connexions WebSocket nécessitent un JWT valide:

```javascript
import io from 'socket.io-client';

const socket = io('https://websocket.symphonia.com', {
  auth: {
    token: 'votre-jwt-token'
  }
});
```

### Rooms (Salles)

Les utilisateurs sont automatiquement ajoutés aux rooms suivantes:

- `user:{userId}` - Room personnelle de l'utilisateur
- `org:{organizationId}` - Room de l'organisation
- `carrier:{organizationId}` - Room du transporteur (si applicable)

Les utilisateurs peuvent rejoindre des rooms supplémentaires:

```javascript
socket.emit('join-room', 'order:12345', (response) => {
  console.log('Joined order room:', response);
});
```

## Événements disponibles

### Événements de commande

- `order.created` - Nouvelle commande créée
- `order.updated` - Commande mise à jour
- `order.cancelled` - Commande annulée
- `order.closed` - Commande terminée

### Événements de détection de ligne

- `lane.detected` - Ligne de transport détectée
- `lane.analysis.complete` - Analyse de ligne terminée

### Événements de dispatch chain

- `dispatch.chain.generated` - Chaîne de dispatch générée
- `carrier.selected` - Transporteur sélectionné
- `order.sent.to.carrier` - Commande envoyée au transporteur
- `carrier.accepted` - Transporteur a accepté
- `carrier.refused` - Transporteur a refusé
- `carrier.timeout` - Timeout de réponse transporteur

### Événements de tracking

- `tracking.started` - Tracking démarré
- `tracking.location.update` - Mise à jour position GPS
- `tracking.eta.update` - Mise à jour ETA
- `order.arrived.pickup` - Arrivé au point d'enlèvement
- `order.departed.pickup` - Parti du point d'enlèvement
- `order.arrived.delivery` - Arrivé au point de livraison
- `order.loaded` - Marchandise chargée
- `order.delivered` - Marchandise livrée

### Événements de géofencing

- `geofence.entered` - Entrée dans une zone
- `geofence.exited` - Sortie d'une zone
- `geofence.alert` - Alerte géofencing

### Événements de rendez-vous

- `rdv.requested` - RDV demandé
- `rdv.proposed` - RDV proposé
- `rdv.confirmed` - RDV confirmé
- `rdv.cancelled` - RDV annulé
- `rdv.rescheduled` - RDV replanifié

### Événements de documents

- `documents.uploaded` - Documents uploadés
- `document.ocr.started` - OCR démarré
- `document.ocr.complete` - OCR terminé
- `document.validated` - Document validé
- `document.rejected` - Document rejeté

### Événements de scoring

- `carrier.scored` - Transporteur noté
- `score.updated` - Score mis à jour

### Événements d'incidents

- `incident.reported` - Incident signalé
- `incident.resolved` - Incident résolu
- `delay.reported` - Retard signalé

## Utilisation côté client

### Installation

```bash
npm install socket.io-client
```

### Connexion

```javascript
import { io } from 'socket.io-client';

const socket = io('https://websocket.symphonia.com', {
  auth: {
    token: localStorage.getItem('jwtToken')
  },
  transports: ['websocket', 'polling']
});

// Confirmation de connexion
socket.on('connection.status', (data) => {
  console.log('Connected:', data);
});

// Gestion des erreurs de connexion
socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});
```

### S'abonner aux événements d'une commande

```javascript
// S'abonner
socket.emit('subscribe-order', '12345', (response) => {
  if (response.success) {
    console.log('Subscribed to order 12345');
  }
});

// Écouter les événements
socket.on('order.updated', (data) => {
  console.log('Order updated:', data);
  // Mettre à jour l'UI
});

socket.on('tracking.location.update', (data) => {
  console.log('New GPS position:', data.location);
  // Mettre à jour la carte
});

socket.on('carrier.accepted', (data) => {
  console.log('Carrier accepted order:', data);
  // Afficher notification
});
```

### Heartbeat (maintenir la connexion)

```javascript
setInterval(() => {
  socket.emit('heartbeat', { clientTime: Date.now() }, (response) => {
    const latency = Date.now() - response.timestamp;
    console.log('Latency:', latency, 'ms');
  });
}, 30000);
```

## API REST

Le serveur WebSocket expose également une API REST pour les autres services backend.

### POST /api/v1/emit

Émettre un événement vers les clients connectés:

```bash
curl -X POST https://websocket.symphonia.com/api/v1/emit \
  -H "Content-Type: application/json" \
  -d '{
    "eventName": "order.created",
    "data": {
      "orderId": "12345",
      "status": "pending"
    },
    "target": {
      "type": "organization",
      "id": "org-456"
    }
  }'
```

Types de target:
- `user` - Émettre vers un utilisateur spécifique
- `organization` - Émettre vers une organisation
- `order` - Émettre vers tous les abonnés d'une commande
- `room` - Émettre vers une room spécifique
- Omis - Broadcast global

### GET /health

Vérifier l'état du service:

```bash
curl https://websocket.symphonia.com/health
```

Réponse:
```json
{
  "status": "healthy",
  "service": "websocket-api",
  "version": "1.0.0",
  "timestamp": "2024-11-26T18:30:00.000Z",
  "connections": {
    "active": 45,
    "mongodb": "connected"
  },
  "uptime": 3600
}
```

### GET /stats

Statistiques du serveur:

```bash
curl https://websocket.symphonia.com/stats
```

### GET /api/v1/events

Liste de tous les événements disponibles:

```bash
curl https://websocket.symphonia.com/api/v1/events
```

## Intégration avec les autres services

Les autres services backend peuvent émettre des événements via Socket.io client ou l'API REST.

### Exemple avec Socket.io client

```javascript
const io = require('socket.io-client');

// Dans votre service backend
const websocketClient = io(process.env.WEBSOCKET_URL, {
  auth: { token: process.env.WEBSOCKET_INTERNAL_TOKEN }
});

// Émettre un événement
function notifyOrderCreated(orderId, orderData) {
  websocketClient.emit('emit-event', {
    eventName: 'order.created',
    target: { type: 'organization', id: orderData.organizationId },
    data: { orderId, ...orderData }
  });
}
```

### Exemple avec API REST

```javascript
const axios = require('axios');

async function notifyOrderCreated(orderId, orderData) {
  await axios.post(`${process.env.WEBSOCKET_URL}/api/v1/emit`, {
    eventName: 'order.created',
    target: { type: 'organization', id: orderData.organizationId },
    data: { orderId, ...orderData }
  });
}
```

## Déploiement AWS Elastic Beanstalk

### Prérequis

```bash
npm install -g eb
eb init
```

### Configuration

Créer `.ebextensions/nodecommand.config`:

```yaml
option_settings:
  aws:elasticbeanstalk:container:nodejs:
    NodeCommand: "npm start"
  aws:elasticbeanstalk:application:environment:
    PORT: 8080
```

### Déploiement

```bash
zip -r deploy.zip . -x "*.git*" "node_modules/*"
eb deploy
```

## Monitoring

### Logs

```bash
# Logs en temps réel
tail -f /var/log/nodejs/nodejs.log

# Logs d'erreurs
tail -f /var/log/nodejs/nodejs-error.log
```

### Métriques

- Nombre de connexions actives
- Nombre de rooms actives
- Latence moyenne
- Mémoire utilisée
- Uptime

## Tests

```bash
npm test
```

## Sécurité

- ✅ Authentification JWT obligatoire
- ✅ Validation des permissions par room
- ✅ CORS configuré pour domaines autorisés
- ✅ Timeouts et heartbeat pour éviter les connexions zombies
- ✅ Rate limiting (à configurer si nécessaire)

## Support

Pour toute question ou problème, contactez l'équipe SYMPHONI.A.

## Licence

MIT
