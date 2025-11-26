# DASHBOARD MONITORING TEMPS RÉEL - SYMPHONI.A

## 📋 Vue d'Ensemble

Le dashboard de monitoring SYMPHONI.A est une interface web temps réel permettant aux industriels de suivre l'ensemble de leurs commandes de transport, d'analyser les performances et de détecter les problèmes en temps réel.

**Objectifs:**
- Visibilité complète sur toutes les commandes actives
- Suivi GPS en temps réel sur une carte interactive
- Alertes instantanées pour les retards et incidents
- Analytics et KPIs de performance
- Gestion des transporteurs et scoring
- Archivage et conformité légale

**Technologies recommandées:**
- **Frontend:** Next.js 14 + TypeScript + Tailwind CSS
- **Maps:** Mapbox GL JS ou Google Maps API
- **Charts:** Chart.js ou Recharts
- **Temps réel:** WebSocket + React Query
- **State Management:** Zustand ou Jotai
- **Notifications:** React Hot Toast + Push API

---

## 🎯 Utilisateurs Cibles

### 1. Industriel / Donneur d'ordre
**Besoins:**
- Vue d'ensemble de toutes ses commandes
- Suivi temps réel des livraisons
- Alertes de retards
- Statistiques de performance

### 2. Transporteur
**Besoins:**
- Ses commandes assignées
- Mise à jour des statuts
- Upload de documents
- Historique de ses scores

### 3. Administrateur SYMPHONI.A
**Besoins:**
- Vue globale de la plateforme
- Gestion des utilisateurs
- Monitoring système
- Analytics avancés

---

## 🏗️ Architecture du Dashboard

### Structure des Pages

```
Dashboard SYMPHONI.A
│
├── 🏠 Home / Vue d'ensemble
│   ├── KPIs globaux (commandes actives, retards, taux de complétion)
│   ├── Carte interactive avec toutes les commandes
│   ├── Alertes récentes
│   └── Activité récente
│
├── 📦 Commandes
│   ├── Liste des commandes (filtres, recherche, tri)
│   ├── Détail d'une commande
│   │   ├── Informations générales
│   │   ├── Tracking GPS temps réel
│   │   ├── Timeline des événements
│   │   ├── Documents attachés
│   │   ├── RDV et ETA
│   │   └── Scoring transporteur
│   └── Créer une nouvelle commande
│
├── 🗺️ Carte Temps Réel
│   ├── Toutes les commandes actives sur la carte
│   ├── Filtres (statut, transporteur, date)
│   ├── Clusters pour grandes quantités
│   ├── Info-bulles au survol
│   └── Geofences visibles
│
├── 📊 Analytics
│   ├── Performance globale
│   │   ├── Taux de ponctualité
│   │   ├── Temps moyen de livraison
│   │   ├── Taux de complétion
│   │   └── Évolution mensuelle
│   ├── Performance par transporteur
│   │   ├── Scores moyens
│   │   ├── Nombre de livraisons
│   │   ├── Incidents
│   │   └── Comparatif
│   └── Analytics industrielles
│       ├── Volumes par lane
│       ├── Coûts moyens
│       ├── Tendances saisonnières
│       └── Prévisions
│
├── 🚚 Transporteurs
│   ├── Liste des transporteurs
│   ├── Profil transporteur
│   │   ├── Informations générales
│   │   ├── Score global
│   │   ├── Historique des livraisons
│   │   ├── Statistiques de performance
│   │   └── Lanes préférées
│   └── Gestion des transporteurs (admin)
│
├── 📄 Documents
│   ├── Tous les documents (BL, CMR, POD)
│   ├── Filtres par type, date, commande
│   ├── Aperçu et téléchargement
│   ├── Résultats OCR
│   └── Validation des documents
│
├── 🔔 Alertes & Notifications
│   ├── Centre de notifications
│   ├── Alertes actives
│   ├── Historique des alertes
│   └── Configuration des alertes
│
├── ⚙️ Paramètres
│   ├── Profil utilisateur
│   ├── Configuration des webhooks
│   ├── Intégrations (ERP, TMS)
│   ├── Gestion d'équipe
│   └── Préférences de notifications
│
└── 📚 Aide & Support
    ├── Documentation API
    ├── Guides d'utilisation
    ├── Contact support
    └── Changelog
```

---

## 📊 KPIs & Métriques Principales

### 1. Métriques Globales (Home)

| KPI | Description | Calcul | Visualisation |
|-----|-------------|--------|---------------|
| **Commandes Actives** | Nombre de commandes en cours | Count(status IN [created, assigned, in_transit]) | Nombre + évolution 24h |
| **Retards en Cours** | Commandes avec retard > 30min | Count(delay > 30min) | Nombre + pourcentage |
| **Taux de Complétion** | % de commandes livrées à temps | (OnTime / Total) × 100 | Jauge circulaire |
| **Score Moyen Transporteurs** | Score moyen sur 30 jours | AVG(carrier_score) | Étoiles sur 5 |
| **Revenus du Mois** | Revenus générés ce mois | SUM(order.totalPrice) | Montant + évolution |

### 2. Métriques de Performance

| KPI | Description | Seuil Cible |
|-----|-------------|-------------|
| **Ponctualité** | % livraisons à l'heure | > 90% |
| **Temps Moyen de Livraison** | Durée moyenne pickup → delivery | < 24h (moyenne) |
| **Délai Moyen POD** | Temps entre livraison et upload POD | < 2h |
| **Taux d'Incidents** | % commandes avec incidents | < 5% |
| **Taux de Documents Valides** | % documents validés du 1er coup | > 95% |
| **Temps de Réponse Dispatch** | Temps avant acceptation transporteur | < 30min |

### 3. Métriques par Statut

```typescript
interface OrderStatusMetrics {
  created: number;           // Créées, non assignées
  assigned: number;          // Assignées, pas encore en route
  pickup_pending: number;    // En route vers chargement
  loading: number;           // En cours de chargement
  in_transit: number;        // En route vers livraison
  delivery_pending: number;  // Arrivé au point de livraison
  delivered: number;         // Livrées, POD en attente
  completed: number;         // Complétées et clôturées
  cancelled: number;         // Annulées
  delayed: number;           // Retardées (overlay)
}
```

---

## 🎨 Wireframes & Layouts

### Page 1: Home / Vue d'Ensemble

```
┌────────────────────────────────────────────────────────────────┐
│ SYMPHONI.A                    🔔 (3)  👤 Jean Dupont          │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📊 KPIs du Jour                                               │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐    │
│  │ Actives  │ Retards  │ Complét. │ Score    │ Revenus  │    │
│  │   24     │   2      │  92%     │ 4.5⭐    │ 12,450€  │    │
│  │  +3↗     │  -1↘     │  +2%↗    │  -0.2↘   │  +890€↗  │    │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘    │
│                                                                 │
│  🗺️ Carte Temps Réel                      📋 Alertes Actives │
│  ┌─────────────────────────────────┐      ┌─────────────────┐│
│  │         [CARTE INTERACTIVE]      │      │ ⚠️ Retard 45min││
│  │                                  │      │ CMD-20251125-... ││
│  │  🚚 (markers pour chaque         │      │                 ││
│  │      commande active)            │      │ 📄 POD manquant││
│  │                                  │      │ CMD-20251124-... ││
│  │  Légende:                        │      │                 ││
│  │  🟢 À l'heure  🟠 Léger retard   │      │ 🎯 Arrivé zone ││
│  │  🔴 Retard     ⚫ Hors ligne     │      │ CMD-20251125-... ││
│  └─────────────────────────────────┘      └─────────────────┘│
│                                                                 │
│  📈 Performance 30 Derniers Jours          🚚 Top Transporteu. │
│  ┌─────────────────────────────────┐      ┌─────────────────┐│
│  │  [GRAPHIQUE LIGNE]              │      │ 1. Express SA   ││
│  │  Ponctualité / Incidents /      │      │    Score: 95    ││
│  │  Volume commandes               │      │ 2. Trans Europe ││
│  │                                  │      │    Score: 92    ││
│  │  [PÉRIODE: 7j 30j 90j Année]   │      │ 3. Logistique+  ││
│  └─────────────────────────────────┘      │    Score: 88    ││
│                                            └─────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

### Page 2: Détail Commande

```
┌────────────────────────────────────────────────────────────────┐
│ ← Retour  |  Commande CMD-20251125-001                        │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🏷️ Informations Générales                                     │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Statut: 🚚 En route vers livraison                       │ │
│  │ Référence: CMD-20251125-001                              │ │
│  │ Transporteur: Express SA (Score: 95/100)                 │ │
│  │ Créée le: 25/11/2025 10:00                               │ │
│  │ ETA: 25/11/2025 16:30 (dans 2h 15min)                    │ │
│  │                                                           │ │
│  │ 📍 Chargement                    📍 Livraison            │ │
│  │ 123 Rue de la Paix              456 Ave de Lyon          │ │
│  │ 75001 Paris                      69002 Lyon              │ │
│  │ ✅ Chargé à 11:30                ⏳ Attendu 16:30        │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  🗺️ Tracking GPS Temps Réel         📋 Timeline Événements   │
│  ┌────────────────────────────┐     ┌────────────────────────┐│
│  │  [CARTE AVEC ROUTE]        │     │ 14:30 Position MAJ     ││
│  │                            │     │       📍 Besançon      ││
│  │  🏁 Paris ----🚚---> Lyon  │     │                        ││
│  │                            │     │ 11:30 ✅ Chargé        ││
│  │  Vitesse: 85 km/h          │     │                        ││
│  │  Distance restante: 145km  │     │ 10:45 📍 Arrivé        ││
│  │  Dernier signal: Il y a 30s│     │       chargement       ││
│  │                            │     │                        ││
│  │  🎯 Geofences:             │     │ 10:15 🚚 En route      ││
│  │  ✅ Zone chargement        │     │                        ││
│  │  ⏳ Zone livraison (145km) │     │ 10:00 📦 Créée         ││
│  └────────────────────────────┘     └────────────────────────┘│
│                                                                 │
│  📄 Documents (3)                    ⚙️ Actions               │
│  ┌────────────────────────────┐     ┌────────────────────────┐│
│  │ ✅ BL signé                │     │ [Contacter transport.] ││
│  │    Upload: 11:35           │     │ [Modifier ETA]         ││
│  │    OCR: 100% validé        │     │ [Signaler incident]    ││
│  │                            │     │ [Télécharger rapport]  ││
│  │ ✅ CMR signé               │     │ [Clôturer commande]    ││
│  │    Upload: 11:40           │     └────────────────────────┘│
│  │                            │                                 │
│  │ ⏳ POD - En attente        │                                 │
│  │    Attendu: À la livraison │                                 │
│  └────────────────────────────┘                                 │
└────────────────────────────────────────────────────────────────┘
```

### Page 3: Carte Temps Réel

```
┌────────────────────────────────────────────────────────────────┐
│ 🗺️ Carte Temps Réel - 24 commandes actives                    │
├────────────────────────────────────────────────────────────────┤
│  🔍 Recherche   │ Filtres: [Tous] [Retards] [Actives]  🔄     │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │              [CARTE PLEIN ÉCRAN INTERACTIVE]             │ │
│  │                                                           │ │
│  │  Markers:                                                │ │
│  │  🟢 Commande à l'heure                                   │ │
│  │  🟠 Commande avec léger retard (< 30min)                │ │
│  │  🔴 Commande en retard (> 30min)                        │ │
│  │  ⚫ Hors ligne (pas de signal GPS)                      │ │
│  │                                                           │ │
│  │  Clusters:                                               │ │
│  │  (24) = 24 commandes dans cette zone                    │ │
│  │                                                           │ │
│  │  Info-bulle au survol:                                   │ │
│  │  ┌─────────────────────┐                                │ │
│  │  │ CMD-20251125-001    │                                │ │
│  │  │ 🚚 Express SA       │                                │ │
│  │  │ Paris → Lyon        │                                │ │
│  │  │ ETA: 16:30 (2h)     │                                │ │
│  │  │ [Voir détails]      │                                │ │
│  │  └─────────────────────┘                                │ │
│  │                                                           │ │
│  │  Geofences:                                              │ │
│  │  ○ Zones de chargement (bleues)                         │ │
│  │  ○ Zones de livraison (vertes)                          │ │
│  │                                                           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Légende:                    Statistiques:                     │
│  🟢 À l'heure: 18            Vitesse moyenne: 72 km/h          │
│  🟠 Léger retard: 4          Distance totale: 12,450 km        │
│  🔴 Retard: 2                Commandes suivies: 24             │
│  ⚫ Hors ligne: 0            Dernière MAJ: Il y a 15s          │
└────────────────────────────────────────────────────────────────┘
```

### Page 4: Analytics & Rapports

```
┌────────────────────────────────────────────────────────────────┐
│ 📊 Analytics & Performance                                     │
├────────────────────────────────────────────────────────────────┤
│  Période: [Cette semaine ▼]  Du: [01/11] Au: [25/11]  [Export]│
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📈 Performance Globale                                        │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Taux de Ponctualité                                     │ │
│  │  ████████████████░░░░ 92%  (Cible: 90%)  ✅              │ │
│  │                                                           │ │
│  │  Temps Moyen de Livraison                                │ │
│  │  18h 30min  (-2h vs mois dernier)  ↘                    │ │
│  │                                                           │ │
│  │  Taux de Complétion Documents                            │ │
│  │  ████████████████████ 97%  (Cible: 95%)  ✅              │ │
│  │                                                           │ │
│  │  Score Moyen Transporteurs                               │ │
│  │  ⭐⭐⭐⭐⭐ 4.5/5.0  (+0.3 vs mois dernier)  ↗            │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  📊 Évolution Mensuelle                                        │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  [GRAPHIQUE MULTI-LIGNES]                                │ │
│  │  Lignes:                                                  │ │
│  │  🟢 Commandes complétées                                 │ │
│  │  🟠 Commandes en retard                                  │ │
│  │  🔴 Incidents                                            │ │
│  │                                                           │ │
│  │  Jan  Fév  Mar  Avr  Mai  Jun  Jul  Aoû  Sep  Oct  Nov  │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  🚚 Top Transporteurs (Score)   📍 Top Lanes (Volume)         │
│  ┌───────────────────────────┐  ┌──────────────────────────┐ │
│  │ 1. Express SA       95    │  │ 1. Paris → Lyon    145   │ │
│  │ 2. Trans Europe     92    │  │ 2. Lyon → Marseille 98   │ │
│  │ 3. Logistique Plus  88    │  │ 3. Lille → Paris    87   │ │
│  │ 4. Fast Delivery    85    │  │ 4. Toulouse → Nice  76   │ │
│  │ 5. Euro Transport   82    │  │ 5. Paris → Bruxelles 65  │ │
│  └───────────────────────────┘  └──────────────────────────┘ │
│                                                                 │
│  💰 Analyse Financière                                         │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Revenus Totaux: 145,230€ (+12% vs mois dernier)        │ │
│  │  Coût Moyen par Commande: 450€                           │ │
│  │  Marge Moyenne: 35%                                      │ │
│  │                                                           │ │
│  │  [GRAPHIQUE BARRES - Revenus par mois]                   │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

---

## 🔔 Système d'Alertes

### Types d'Alertes

| Type | Gravité | Trigger | Action |
|------|---------|---------|--------|
| **Retard Détecté** | ⚠️ WARNING | delay > 30min | Email + Notification |
| **Retard Critique** | 🔴 CRITICAL | delay > 60min | Email + SMS + Appel |
| **Hors Ligne** | ⚠️ WARNING | no_signal > 15min | Notification |
| **Geofence Entré** | ℹ️ INFO | geofence_entered | Notification |
| **Document Manquant** | ⚠️ WARNING | 2h après livraison | Email |
| **Incident Signalé** | 🔴 CRITICAL | carrier_report | Email + SMS |
| **POD Reçu** | ✅ SUCCESS | pod_uploaded | Notification |
| **Commande Clôturée** | ✅ SUCCESS | order_closed | Email |

### Configuration des Alertes

```typescript
interface AlertConfig {
  id: string;
  name: string;
  type: 'delay' | 'offline' | 'geofence' | 'document' | 'incident';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  enabled: boolean;
  conditions: {
    field: string;
    operator: '>' | '<' | '==' | '!=';
    value: any;
  }[];
  channels: ('EMAIL' | 'SMS' | 'PUSH' | 'WEBHOOK')[];
  recipients: string[];
  schedule?: {
    // Ne pas notifier en dehors de ces horaires
    startHour: number;
    endHour: number;
    days: number[]; // 0-6 (Dimanche-Samedi)
  };
}

// Exemple: Alerte retard critique
const criticalDelayAlert: AlertConfig = {
  id: 'alert_001',
  name: 'Retard Critique > 60min',
  type: 'delay',
  severity: 'CRITICAL',
  enabled: true,
  conditions: [
    { field: 'delay.minutes', operator: '>', value: 60 }
  ],
  channels: ['EMAIL', 'SMS', 'PUSH'],
  recipients: ['operations@company.com', '+33612345678'],
  schedule: {
    startHour: 6,
    endHour: 22,
    days: [1, 2, 3, 4, 5] // Lun-Ven uniquement
  }
};
```

### UI Centre de Notifications

```
┌────────────────────────────────────────────────────────────────┐
│ 🔔 Notifications (12)                    [Marquer tout lu]     │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🔴 CRITIQUE - Il y a 5min                                     │
│  Retard de 75 minutes détecté                                  │
│  Commande CMD-20251125-003 - Transport Express                 │
│  [Voir détails]  [Ignorer]                                     │
│  ─────────────────────────────────────────────────────────────│
│                                                                 │
│  ⚠️ ALERTE - Il y a 15min                                     │
│  Document POD manquant                                         │
│  Commande CMD-20251124-089 - Livraison effectuée il y a 2h    │
│  [Rappeler transporteur]  [Ignorer]                            │
│  ─────────────────────────────────────────────────────────────│
│                                                                 │
│  ℹ️ INFO - Il y a 1h                                           │
│  Transporteur entré dans zone de livraison                     │
│  Commande CMD-20251125-001 - Zone Lyon Centre                  │
│  [Voir sur carte]  [OK]                                        │
│  ─────────────────────────────────────────────────────────────│
│                                                                 │
│  ✅ SUCCÈS - Il y a 2h                                         │
│  Commande complétée avec succès                                │
│  Commande CMD-20251124-075 - Score transporteur: 95/100        │
│  [Voir rapport]  [OK]                                          │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## 🔌 Architecture Temps Réel

### WebSocket Connection Flow

```
1. Frontend se connecte au WebSocket Server
   ws://api.symphonia.com/ws?token=JWT_TOKEN

2. Serveur authentifie et associe le socket à l'utilisateur
   userId = verify(JWT_TOKEN)

3. Serveur rejoint les rooms correspondantes
   socket.join(`user:${userId}`)
   socket.join(`company:${companyId}`)

4. Backend émet des événements vers les rooms
   io.to(`company:${companyId}`).emit('tracking.updated', data)

5. Frontend reçoit et met à jour l'UI
   socket.on('tracking.updated', (data) => updateMap(data))
```

### Implémentation WebSocket Server (Backend)

```javascript
// websocket-server.js

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

function setupWebSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL,
      credentials: true
    },
    path: '/ws',
    transports: ['websocket', 'polling']
  });

  // Middleware d'authentification
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.companyId = decoded.companyId;
      socket.role = decoded.role;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  // Connexion
  io.on('connection', (socket) => {
    console.log(`✅ WebSocket connected: ${socket.userId}`);

    // Rejoindre les rooms
    socket.join(`user:${socket.userId}`);
    socket.join(`company:${socket.companyId}`);

    // Envoyer les données initiales
    socket.emit('connected', {
      userId: socket.userId,
      timestamp: new Date().toISOString()
    });

    // Heartbeat
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    // S'abonner à des commandes spécifiques
    socket.on('subscribe:order', (orderId) => {
      socket.join(`order:${orderId}`);
      console.log(`📦 Subscribed to order ${orderId}`);
    });

    // Se désabonner
    socket.on('unsubscribe:order', (orderId) => {
      socket.leave(`order:${orderId}`);
      console.log(`📦 Unsubscribed from order ${orderId}`);
    });

    // Déconnexion
    socket.on('disconnect', () => {
      console.log(`🔌 WebSocket disconnected: ${socket.userId}`);
    });
  });

  return io;
}

// Fonction pour émettre des événements
function emitTrackingUpdate(io, orderId, data) {
  io.to(`order:${orderId}`).emit('tracking.updated', {
    orderId,
    ...data,
    timestamp: new Date().toISOString()
  });
}

function emitDelayAlert(io, companyId, data) {
  io.to(`company:${companyId}`).emit('delay.detected', {
    ...data,
    timestamp: new Date().toISOString()
  });
}

module.exports = { setupWebSocketServer, emitTrackingUpdate, emitDelayAlert };
```

### Implémentation WebSocket Client (Frontend)

```typescript
// hooks/useRealtimeDashboard.ts

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface RealtimeEvent {
  type: string;
  data: any;
  timestamp: string;
}

export function useRealtimeDashboard() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    // Connexion WebSocket
    const socketInstance = io(process.env.NEXT_PUBLIC_WS_URL!, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    socketInstance.on('connect', () => {
      console.log('✅ WebSocket connected');
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('🔌 WebSocket disconnected');
      setIsConnected(false);
    });

    socketInstance.on('connected', (data) => {
      console.log('🎉 Connected to dashboard:', data);
    });

    // Événements tracking
    socketInstance.on('tracking.updated', (data) => {
      console.log('📍 Tracking update:', data);
      setEvents((prev) => [
        { type: 'tracking.updated', data, timestamp: data.timestamp },
        ...prev.slice(0, 99) // Garder seulement les 100 derniers
      ]);
    });

    // Alertes retard
    socketInstance.on('delay.detected', (data) => {
      console.log('⚠️ Delay detected:', data);
      setEvents((prev) => [
        { type: 'delay.detected', data, timestamp: data.timestamp },
        ...prev.slice(0, 99)
      ]);
      // Afficher notification push
      showNotification('Retard détecté', data);
    });

    // Geofences
    socketInstance.on('geofence.entered', (data) => {
      console.log('🎯 Geofence entered:', data);
      setEvents((prev) => [
        { type: 'geofence.entered', data, timestamp: data.timestamp },
        ...prev.slice(0, 99)
      ]);
    });

    // Documents
    socketInstance.on('document.uploaded', (data) => {
      console.log('📄 Document uploaded:', data);
      setEvents((prev) => [
        { type: 'document.uploaded', data, timestamp: data.timestamp },
        ...prev.slice(0, 99)
      ]);
    });

    // Commandes
    socketInstance.on('order.updated', (data) => {
      console.log('📦 Order updated:', data);
      setEvents((prev) => [
        { type: 'order.updated', data, timestamp: data.timestamp },
        ...prev.slice(0, 99)
      ]);
    });

    // Heartbeat
    const pingInterval = setInterval(() => {
      if (socketInstance.connected) {
        socketInstance.emit('ping');
      }
    }, 30000);

    setSocket(socketInstance);

    return () => {
      clearInterval(pingInterval);
      socketInstance.close();
    };
  }, []);

  // Fonctions helper
  const subscribeToOrder = (orderId: string) => {
    socket?.emit('subscribe:order', orderId);
  };

  const unsubscribeFromOrder = (orderId: string) => {
    socket?.emit('unsubscribe:order', orderId);
  };

  return {
    isConnected,
    events,
    subscribeToOrder,
    unsubscribeFromOrder
  };
}

function showNotification(title: string, data: any) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body: data.message || JSON.stringify(data),
      icon: '/logo.png',
      tag: data.orderId
    });
  }
}
```

---

## 📱 Responsive Design

### Breakpoints

```css
/* Mobile First */
- xs: 0-639px      (Mobile)
- sm: 640-767px    (Large mobile)
- md: 768-1023px   (Tablet)
- lg: 1024-1279px  (Desktop)
- xl: 1280-1535px  (Large desktop)
- 2xl: 1536px+     (Ultra-wide)
```

### Adaptations Mobile

**Navigation:**
- Hamburger menu sur mobile
- Bottom navigation bar avec icônes principales
- Swipe gestures pour navigation rapide

**Carte:**
- Plein écran sur mobile
- Boutons flottants pour filtres
- Geolocation automatique

**Tableaux:**
- Cards verticales au lieu de tableaux
- Scroll horizontal si nécessaire
- Actions via swipe (swipe left = delete)

**Notifications:**
- Toast notifications en haut
- Vibrations pour alertes critiques
- Badge counter sur icône

---

## 🔐 Sécurité & Permissions

### Rôles Utilisateurs

| Rôle | Permissions |
|------|-------------|
| **ADMIN** | Accès complet, gestion utilisateurs, configuration système |
| **INDUSTRIEL** | Créer commandes, voir ses commandes, analytics, gérer transporteurs |
| **TRANSPORTEUR** | Voir commandes assignées, mettre à jour statuts, uploader documents |
| **VIEWER** | Vue lecture seule, pas de modifications |

### Matrice des Permissions

| Action | Admin | Industriel | Transporteur | Viewer |
|--------|-------|------------|--------------|--------|
| Voir dashboard global | ✅ | ✅ | ❌ | ✅ |
| Créer commande | ✅ | ✅ | ❌ | ❌ |
| Assigner transporteur | ✅ | ✅ | ❌ | ❌ |
| Mettre à jour tracking | ✅ | ✅ | ✅ | ❌ |
| Uploader documents | ✅ | ✅ | ✅ | ❌ |
| Voir analytics | ✅ | ✅ | ❌ | ✅ |
| Gérer utilisateurs | ✅ | ❌ | ❌ | ❌ |
| Configurer webhooks | ✅ | ✅ | ❌ | ❌ |

---

## 📊 APIs Nécessaires

### Nouveaux Endpoints à Créer

```bash
# Dashboard KPIs
GET /api/dashboard/kpis
GET /api/dashboard/active-orders
GET /api/dashboard/alerts
GET /api/dashboard/recent-activity

# Analytics
GET /api/analytics/performance
GET /api/analytics/carriers-ranking
GET /api/analytics/lanes-stats
GET /api/analytics/financial

# Alertes
GET /api/alerts
POST /api/alerts/config
PUT /api/alerts/config/:alertId
DELETE /api/alerts/config/:alertId
POST /api/alerts/:alertId/acknowledge

# Notifications
GET /api/notifications
PUT /api/notifications/:id/read
PUT /api/notifications/mark-all-read
POST /api/notifications/preferences

# Map Data
GET /api/map/active-orders
GET /api/map/clusters
```

### Exemples de Réponses

**GET /api/dashboard/kpis**
```json
{
  "activeOrders": {
    "count": 24,
    "change24h": 3,
    "percentChange": 14.3
  },
  "delays": {
    "count": 2,
    "percentage": 8.3,
    "change24h": -1
  },
  "completionRate": {
    "percentage": 92.0,
    "change": 2.0,
    "target": 90.0
  },
  "averageCarrierScore": {
    "score": 4.5,
    "change": -0.2,
    "total": 5.0
  },
  "monthRevenue": {
    "amount": 12450.00,
    "currency": "EUR",
    "change": 890.00,
    "percentChange": 7.7
  },
  "updatedAt": "2025-11-25T14:30:00.000Z"
}
```

**GET /api/dashboard/active-orders**
```json
{
  "orders": [
    {
      "id": "673cfc580b68ebd4aecbe87f",
      "reference": "CMD-20251125-001",
      "status": "in_transit",
      "carrier": {
        "id": "carrier_001",
        "name": "Express SA",
        "score": 95
      },
      "position": {
        "latitude": 47.2184,
        "longitude": 6.0239,
        "timestamp": "2025-11-25T14:30:45.000Z"
      },
      "eta": "2025-11-25T16:30:00.000Z",
      "delay": null,
      "alerts": []
    }
  ],
  "total": 24,
  "updatedAt": "2025-11-25T14:30:50.000Z"
}
```

---

## 🚀 Plan d'Implémentation

### Phase 1: MVP (4 semaines)

**Semaine 1-2:**
- ✅ Setup Next.js 14 + TypeScript + Tailwind
- ✅ Authentification et routing
- ✅ Page Home avec KPIs basiques
- ✅ Liste des commandes avec filtres
- ✅ Détail d'une commande

**Semaine 3-4:**
- ✅ Intégration carte Mapbox
- ✅ Tracking GPS temps réel (polling)
- ✅ Timeline des événements
- ✅ Upload de documents
- ✅ Centre de notifications basique

### Phase 2: Temps Réel (2 semaines)

**Semaine 5:**
- ✅ WebSocket server setup
- ✅ WebSocket client integration
- ✅ Mise à jour carte temps réel
- ✅ Notifications push

**Semaine 6:**
- ✅ Système d'alertes configurable
- ✅ Dashboard temps réel complet
- ✅ Tests de charge WebSocket

### Phase 3: Analytics (2 semaines)

**Semaine 7:**
- ✅ Charts et graphiques
- ✅ KPIs de performance
- ✅ Rapports exportables
- ✅ Filtres avancés

**Semaine 8:**
- ✅ Analytics par transporteur
- ✅ Analytics par lane
- ✅ Prédictions et tendances
- ✅ Dashboard admin

### Phase 4: Mobile & Polish (2 semaines)

**Semaine 9:**
- ✅ Responsive design mobile
- ✅ PWA configuration
- ✅ Notifications push mobile
- ✅ Offline mode basique

**Semaine 10:**
- ✅ Tests utilisateurs
- ✅ Optimisations performances
- ✅ Documentation
- ✅ Déploiement production

---

## 📚 Technologies Recommandées

### Frontend Stack

```json
{
  "framework": "Next.js 14.2",
  "language": "TypeScript 5.3",
  "styling": "Tailwind CSS 3.4",
  "maps": "Mapbox GL JS 3.0",
  "charts": "Recharts 2.10",
  "state": "Zustand 4.5",
  "forms": "React Hook Form 7.49",
  "http": "Axios 1.6",
  "websocket": "Socket.IO Client 4.6",
  "notifications": "React Hot Toast 2.4",
  "icons": "Lucide React 0.300",
  "tables": "TanStack Table 8.11",
  "dates": "date-fns 3.0"
}
```

### Installation

```bash
npx create-next-app@latest symphonia-dashboard --typescript --tailwind --app

cd symphonia-dashboard

npm install \
  mapbox-gl \
  recharts \
  zustand \
  react-hook-form \
  axios \
  socket.io-client \
  react-hot-toast \
  lucide-react \
  @tanstack/react-table \
  date-fns \
  zod
```

---

## ✅ Checklist de Déploiement

### Backend
- [ ] WebSocket server configuré
- [ ] Nouveaux endpoints API créés
- [ ] Système d'alertes implémenté
- [ ] Rate limiting configuré
- [ ] CORS configuré pour production
- [ ] Variables d'environnement définies

### Frontend
- [ ] Build production optimisé
- [ ] Variables d'environnement configurées
- [ ] CDN Mapbox configuré
- [ ] PWA manifest créé
- [ ] Service Worker configuré
- [ ] SEO meta tags ajoutés

### Infrastructure
- [ ] Domaine configuré (dashboard.symphonia.com)
- [ ] SSL/TLS certificat
- [ ] CDN configuré (Cloudflare/AWS CloudFront)
- [ ] Monitoring configuré (Datadog/New Relic)
- [ ] Logs centralisés (CloudWatch/Loggly)
- [ ] Backup automatique

### Tests
- [ ] Tests unitaires (> 80% coverage)
- [ ] Tests E2E (Playwright/Cypress)
- [ ] Tests de charge WebSocket
- [ ] Tests cross-browser
- [ ] Tests mobile (iOS/Android)
- [ ] Tests accessibilité (WCAG 2.1)

---

## 📞 Support & Maintenance

### Monitoring

**Métriques à surveiller:**
- Nombre d'utilisateurs connectés (WebSocket)
- Temps de réponse API (< 200ms)
- Taux d'erreur (< 1%)
- Utilisation CPU/RAM
- Latence WebSocket (< 50ms)
- Taux de reconnexion WebSocket

**Alertes à configurer:**
- API down (> 1min)
- WebSocket down (> 30s)
- Erreur rate > 5%
- Response time > 1s
- Memory usage > 90%

### Documentation Utilisateur

- [ ] Guide de démarrage rapide
- [ ] Tutoriels vidéo
- [ ] FAQ
- [ ] Raccourcis clavier
- [ ] Glossaire des termes

---

**Version:** 1.0
**Créé le:** 25 novembre 2025
**Par:** Claude Code (Anthropic)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
