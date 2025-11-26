# Spécifications Application Mobile Chauffeur
## RT SYMPHONI.A - Tracking Smartphone (150€/mois)

**Version:** 1.0.0
**Date:** 26 Novembre 2025
**Budget estimé:** ~15 000€
**Durée développement:** 8 semaines

---

## 1. Vue d'ensemble

Application React Native pour les chauffeurs permettant le tracking GPS en temps réel, la gestion des missions, et la capture de preuves de livraison.

### 1.1 Objectifs
- Tracking GPS temps réel (alternative économique au GPS TomTom 4€/véhicule)
- Gestion des missions de transport
- Capture POD (Preuve de Livraison)
- Communication avec le dispatch
- Notifications push

### 1.2 Plateformes cibles
- iOS 14+
- Android 10+

---

## 2. Architecture technique

### 2.1 Stack technologique
```
Frontend:
- React Native 0.73+
- TypeScript
- React Navigation 6
- Redux Toolkit
- React Native Maps
- Expo (optional for faster development)

Backend:
- API REST existante (RT SYMPHONI.A v1.7.0)
- WebSocket pour temps réel
- JWT Authentication
```

### 2.2 Structure du projet
```
/src
├── /api           # Appels API et configuration
├── /components    # Composants réutilisables
├── /screens       # Écrans de l'application
│   ├── /auth      # Login, Register
│   ├── /missions  # Liste et détails missions
│   ├── /tracking  # Tracking en cours
│   ├── /delivery  # POD et signatures
│   └── /settings  # Paramètres
├── /services      # Services (GPS, notifications)
├── /store         # Redux store
├── /utils         # Utilitaires
└── /types         # Types TypeScript
```

---

## 3. Fonctionnalités

### 3.1 Authentification
| Fonctionnalité | Description | Priorité |
|----------------|-------------|----------|
| Login | Connexion par email/mot de passe | P0 |
| Remember me | Persistence du token | P0 |
| Logout | Déconnexion sécurisée | P0 |
| Mot de passe oublié | Reset par email | P1 |
| Biométrie | Face ID / Touch ID | P2 |

### 3.2 Missions
| Fonctionnalité | Description | Priorité |
|----------------|-------------|----------|
| Liste missions | Missions du jour avec statuts | P0 |
| Détails mission | Adresses, marchandises, instructions | P0 |
| Accepter/Refuser | Réponse aux affectations | P0 |
| Navigation | Ouverture GPS externe (Waze, Maps) | P0 |
| Historique | Missions passées | P1 |

### 3.3 Tracking GPS
| Fonctionnalité | Description | Priorité |
|----------------|-------------|----------|
| Démarrer tracking | Activation GPS avec consentement | P0 |
| Position temps réel | Envoi toutes les 30s en mouvement | P0 |
| Mode économie | Envoi toutes les 5min à l'arrêt | P0 |
| Background tracking | Tracking même app en arrière-plan | P0 |
| Affichage carte | Visualisation trajet sur carte | P1 |

### 3.4 Statuts de mission
| Fonctionnalité | Description | Priorité |
|----------------|-------------|----------|
| En route chargement | Départ vers point de pickup | P0 |
| Arrivé chargement | Entrée dans zone géofence | P0 |
| Chargé | Confirmation chargement | P0 |
| En route livraison | Départ vers destination | P0 |
| Arrivé livraison | Entrée dans zone géofence | P0 |
| Livré | Confirmation livraison | P0 |

### 3.5 Preuve de livraison (POD)
| Fonctionnalité | Description | Priorité |
|----------------|-------------|----------|
| Signature digitale | Capture signature destinataire | P0 |
| Photo marchandise | Photo avant/après livraison | P0 |
| Scan CMR | Photo du CMR signé | P0 |
| Remarques | Commentaires texte/audio | P1 |
| Géolocalisation | Position de la signature | P0 |

### 3.6 Notifications
| Fonctionnalité | Description | Priorité |
|----------------|-------------|----------|
| Push notifications | Alertes nouvelles missions | P0 |
| Alertes retard | Notification si retard détecté | P0 |
| Messages dispatch | Communication directe | P1 |

---

## 4. API Endpoints utilisés

### 4.1 Authentification
```
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
```

### 4.2 Missions
```
GET  /api/driver/missions
GET  /api/driver/missions/:id
POST /api/driver/missions/:id/accept
POST /api/driver/missions/:id/refuse
POST /api/driver/missions/:id/status
```

### 4.3 Tracking
```
POST /api/transport-orders/:orderId/tracking/position
POST /api/transport-orders/tracking/start/:token
POST /api/transport-orders/tracking/stop/:token
GET  /api/transport-orders/:orderId/tracking/history
```

### 4.4 POD
```
POST /api/transport-orders/:orderId/documents
POST /api/transport-orders/:orderId/signature
POST /api/transport-orders/:orderId/complete
```

---

## 5. Écrans et wireframes

### 5.1 Écran de connexion
```
┌─────────────────────────┐
│                         │
│    [Logo SYMPHONI.A]    │
│                         │
│  ┌───────────────────┐  │
│  │ Email             │  │
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │ Mot de passe      │  │
│  └───────────────────┘  │
│                         │
│  ☐ Se souvenir de moi   │
│                         │
│  ┌───────────────────┐  │
│  │    CONNEXION      │  │
│  └───────────────────┘  │
│                         │
│  Mot de passe oublié ?  │
│                         │
└─────────────────────────┘
```

### 5.2 Liste des missions
```
┌─────────────────────────┐
│ ☰  Mes Missions   🔔    │
├─────────────────────────┤
│ Aujourd'hui             │
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ 🟢 CMD-2024-001     │ │
│ │ Paris → Lyon        │ │
│ │ 08:00 - 14:00       │ │
│ │ En cours            │ │
│ └─────────────────────┘ │
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ 🟡 CMD-2024-002     │ │
│ │ Lyon → Marseille    │ │
│ │ 15:00 - 20:00       │ │
│ │ À venir             │ │
│ └─────────────────────┘ │
├─────────────────────────┤
│                         │
│  [ + Nouvelle mission ] │
│                         │
└─────────────────────────┘
```

### 5.3 Tracking en cours
```
┌─────────────────────────┐
│ ← CMD-2024-001    ⚙️    │
├─────────────────────────┤
│                         │
│   ┌─────────────────┐   │
│   │                 │   │
│   │   [CARTE GPS]   │   │
│   │                 │   │
│   │    📍 ────────  │   │
│   │         🏭      │   │
│   └─────────────────┘   │
│                         │
│ ETA: 14h32 (retard 15m) │
│ Distance: 45 km         │
│                         │
├─────────────────────────┤
│ Destination:            │
│ Entrepôt Lyon Sud       │
│ 123 Rue de l'Industrie  │
│                         │
│ ┌─────────────────────┐ │
│ │ 🧭 NAVIGUER        │ │
│ └─────────────────────┘ │
│                         │
│ ┌─────────────────────┐ │
│ │ ✅ ARRIVÉ          │ │
│ └─────────────────────┘ │
│                         │
└─────────────────────────┘
```

### 5.4 POD - Signature
```
┌─────────────────────────┐
│ ← Preuve de livraison   │
├─────────────────────────┤
│                         │
│ Destinataire:           │
│ ┌───────────────────┐   │
│ │ Nom et prénom     │   │
│ └───────────────────┘   │
│                         │
│ Signature:              │
│ ┌───────────────────┐   │
│ │                   │   │
│ │   [Zone signature]│   │
│ │                   │   │
│ │   ~~~~~~~~~~~~~   │   │
│ │                   │   │
│ └───────────────────┘   │
│ [Effacer]               │
│                         │
│ Remarques:              │
│ ┌───────────────────┐   │
│ │ RAS               │   │
│ └───────────────────┘   │
│                         │
│ ┌─────────────────────┐ │
│ │ 📷 PHOTO           │ │
│ └─────────────────────┘ │
│                         │
│ ┌─────────────────────┐ │
│ │ ✅ VALIDER POD     │ │
│ └─────────────────────┘ │
│                         │
└─────────────────────────┘
```

---

## 6. Tracking GPS - Détails techniques

### 6.1 Configuration GPS
```javascript
const trackingConfig = {
  // Mode actif (véhicule en mouvement)
  activeMode: {
    interval: 30000,        // 30 secondes
    distanceFilter: 50,     // 50 mètres minimum
    accuracy: 'high'
  },

  // Mode économie (véhicule à l'arrêt)
  idleMode: {
    interval: 300000,       // 5 minutes
    distanceFilter: 100,    // 100 mètres
    accuracy: 'balanced'
  },

  // Détection arrêt
  idleDetection: {
    speedThreshold: 5,      // km/h
    timeThreshold: 120000   // 2 minutes
  }
};
```

### 6.2 Format position
```typescript
interface TrackingPosition {
  orderId: string;
  token: string;
  position: {
    lat: number;
    lng: number;
    accuracy: number;
    altitude?: number;
    speed?: number;
    heading?: number;
  };
  timestamp: string;
  batteryLevel?: number;
  networkType?: string;
}
```

### 6.3 Background tracking
```javascript
// Configuration React Native Background Geolocation
BackgroundGeolocation.configure({
  desiredAccuracy: BackgroundGeolocation.HIGH_ACCURACY,
  stationaryRadius: 50,
  distanceFilter: 50,
  notificationTitle: 'SYMPHONI.A Tracking',
  notificationText: 'Tracking actif',
  startOnBoot: false,
  stopOnTerminate: false,
  locationProvider: BackgroundGeolocation.ACTIVITY_PROVIDER,
  interval: 30000,
  fastestInterval: 10000,
  activitiesInterval: 10000,
  stopOnStillActivity: false,
});
```

---

## 7. Sécurité

### 7.1 Stockage sécurisé
- Tokens JWT stockés dans Keychain (iOS) / Keystore (Android)
- Données sensibles chiffrées
- Pas de stockage en clair

### 7.2 Communications
- HTTPS obligatoire
- Certificate pinning
- Refresh token rotation

### 7.3 Permissions
```
iOS:
- Location (Always)
- Camera
- Push Notifications

Android:
- ACCESS_FINE_LOCATION
- ACCESS_BACKGROUND_LOCATION
- CAMERA
- FOREGROUND_SERVICE
```

---

## 8. Planning de développement

### Phase 1 - Setup & Auth (Semaine 1-2)
- [ ] Configuration projet React Native
- [ ] Écrans d'authentification
- [ ] Intégration API auth
- [ ] Stockage sécurisé tokens

### Phase 2 - Missions (Semaine 3-4)
- [ ] Liste des missions
- [ ] Détails mission
- [ ] Acceptation/Refus
- [ ] Navigation externe

### Phase 3 - Tracking (Semaine 5-6)
- [ ] Service GPS
- [ ] Background tracking
- [ ] Affichage carte
- [ ] Envoi positions API

### Phase 4 - POD & Finitions (Semaine 7-8)
- [ ] Capture signature
- [ ] Photo documents
- [ ] Notifications push
- [ ] Tests et corrections

---

## 9. Coûts estimés

| Poste | Coût |
|-------|------|
| Développement (8 semaines × 1500€/sem) | 12 000€ |
| Design UI/UX | 1 500€ |
| Tests et QA | 1 000€ |
| Publication stores | 500€ |
| **Total** | **15 000€** |

### Coûts récurrents
| Service | Coût/mois |
|---------|-----------|
| Apple Developer | 8€ |
| Google Play Developer | 2€ (unique) |
| Firebase (push) | Gratuit (quota) |
| **Total mensuel** | **~10€** |

---

## 10. Alternative: PWA

Une alternative plus économique serait une Progressive Web App:

| Critère | App Native | PWA |
|---------|-----------|-----|
| Coût développement | 15 000€ | 5 000€ |
| Background GPS | ✅ | ⚠️ Limité |
| Push notifications | ✅ | ✅ |
| Offline | ✅ | ✅ |
| Installation | Store | URL |
| Performance | ⭐⭐⭐ | ⭐⭐ |

**Recommandation:** Si le budget est contraint, commencer par une PWA puis migrer vers natif si nécessaire.

---

## 11. Conclusion

L'application mobile chauffeur est le dernier élément pour atteindre 100% de conformité avec le cahier des charges. Elle permet:

1. **Tracking économique** - Alternative au GPS TomTom (150€/mois vs 4€/véhicule/mois)
2. **POD digitalisée** - Fin du papier, signatures électroniques
3. **Communication temps réel** - Notifications et alertes instantanées
4. **Meilleure visibilité** - Suivi précis pour les industriels

Le développement peut être externalisé ou réalisé en interne selon les ressources disponibles.
