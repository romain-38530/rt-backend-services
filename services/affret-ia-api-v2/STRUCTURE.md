# AFFRET.IA API v2 - Structure du Projet

**Date:** 28 Novembre 2025
**Version:** 2.0.0

---

## Arborescence Complète

```
affret-ia-api-v2/
│
├── index.js                           [485 lignes] ✅ Serveur Express principal
│
├── package.json                       [21 lignes]  ✅ Configuration npm
├── .env.example                       [32 lignes]  ✅ Variables d'environnement
│
├── routes/
│   └── affretia.routes.js            [150 lignes] ✅ Définition des routes API (20+ routes)
│
├── controllers/
│   └── affretia.controller.js        [1000+ lignes] ✅ Logique métier (20+ endpoints)
│
├── services/
│   ├── broadcast.service.js          [550 lignes] ✅ Diffusion multi-canal
│   └── negotiation.service.js        [450 lignes] ✅ Négociation automatique
│
├── models/
│   ├── AffretSession.js              [315 lignes] ✅ Modèle Session
│   ├── CarrierProposal.js            [348 lignes] ✅ Modèle Proposition
│   ├── BroadcastCampaign.js          [350 lignes] ✅ Modèle Campagne
│   └── VigilanceCheck.js             [363 lignes] ✅ Modèle Vigilance
│
├── modules/
│   └── ai-scoring-engine.js          [502 lignes] ✅ Moteur de scoring IA
│
├── test-endpoints.http               [350 lignes] ✅ Tests HTTP (28 requêtes)
├── test-quick.js                     [250 lignes] ✅ Script de tests rapides
│
├── README.md                         [799 lignes] ✅ Documentation principale
├── IMPLEMENTATION_PHASE2.md          [800 lignes] ✅ Documentation Phase 2
└── STRUCTURE.md                      [Ce fichier] ✅ Structure du projet

Total: ~6200+ lignes de code
```

---

## Détail des Fichiers

### Fichiers Principaux

#### `index.js` (485 lignes)
- Serveur Express principal
- Configuration WebSocket
- Routes anciennes (compatibilité)
- Connexion MongoDB
- Import des nouvelles routes AFFRET.IA

#### `package.json` (21 lignes)
- Configuration npm
- Dépendances: express, mongoose, axios, socket.io-client
- Scripts: start, dev, test

#### `.env.example` (32 lignes)
- Template des variables d'environnement
- Configuration service
- URLs des services internes
- Paramètres AFFRET.IA

---

### Routes & Controller

#### `routes/affretia.routes.js` (150 lignes)
**20+ routes organisées par modules:**

**Session Management (3 routes)**
- POST /api/v1/affretia/trigger
- GET /api/v1/affretia/session/:id
- GET /api/v1/affretia/sessions

**Analyse IA (1 route)**
- POST /api/v1/affretia/analyze

**Diffusion (1 route)**
- POST /api/v1/affretia/broadcast

**Bourse Publique (2 routes)**
- GET /api/v1/affretia/bourse
- POST /api/v1/affretia/bourse/submit

**Propositions (5 routes)**
- POST /api/v1/affretia/response
- GET /api/v1/affretia/proposals/:sessionId
- PUT /api/v1/affretia/proposals/:id/accept
- PUT /api/v1/affretia/proposals/:id/reject
- POST /api/v1/affretia/proposals/:id/negotiate

**Sélection (2 routes)**
- POST /api/v1/affretia/select
- GET /api/v1/affretia/ranking/:sessionId

**Assignation (1 route)**
- POST /api/v1/affretia/assign

**Vigilance (2 routes)**
- POST /api/v1/affretia/vigilance/check
- GET /api/v1/affretia/vigilance/:carrierId

**Stats (2 routes)**
- GET /api/v1/affretia/stats
- GET /api/v1/affretia/stats/:organizationId

#### `controllers/affretia.controller.js` (1000+ lignes)
**20+ fonctions de controller:**

| Fonction | Lignes | Description |
|----------|--------|-------------|
| triggerAffretIA | ~60 | Déclencher une session |
| getSession | ~30 | Détails d'une session |
| getSessions | ~40 | Liste des sessions |
| analyzeOrder | ~100 | Analyse IA |
| broadcastToCarriers | ~80 | Diffusion multi-canal |
| getBourseOffers | ~80 | Consulter la bourse |
| submitBourseProposal | ~80 | Soumettre via bourse |
| recordCarrierResponse | ~70 | Enregistrer réponse |
| getProposals | ~30 | Liste propositions |
| acceptProposal | ~30 | Accepter proposition |
| rejectProposal | ~30 | Rejeter proposition |
| negotiateProposal | ~40 | Négocier |
| selectBestCarrier | ~80 | Sélection IA |
| getRanking | ~20 | Classement |
| assignCarrier | ~70 | Assigner mission |
| checkVigilance | ~80 | Vérifier vigilance |
| getVigilanceStatus | ~30 | Statut vigilance |
| getStats | ~80 | Stats globales |
| getOrganizationStats | ~30 | Stats organisation |

---

### Services

#### `services/broadcast.service.js` (550 lignes)
**Classe BroadcastService:**

| Méthode | Lignes | Description |
|---------|--------|-------------|
| createBroadcastCampaign | ~60 | Créer campagne |
| executeBroadcast | ~80 | Exécuter diffusion |
| sendEmailBroadcast | ~70 | Envoyer emails |
| publishToBourse | ~40 | Publier bourse |
| sendPushNotifications | ~60 | Envoyer push |
| generateEmailContent | ~100 | Template email |
| generatePushContent | ~20 | Template push |
| determinePreferredChannel | ~15 | Canal préféré |
| sendReminder | ~40 | Envoyer relance |

**Fonctionnalités:**
- Diffusion multi-canal (Email, Bourse, Push)
- Templates HTML/Text personnalisés
- Tracking (envois, ouvertures, clicks, réponses)
- Relances automatiques

#### `services/negotiation.service.js` (450 lignes)
**Classe NegotiationService:**

| Méthode | Lignes | Description |
|---------|--------|-------------|
| evaluateProposal | ~80 | Évaluer proposition |
| respondToCounterOffer | ~100 | Répondre contre-offre |
| checkTimeouts | ~50 | Vérifier timeouts |
| acceptManually | ~40 | Acceptation manuelle |
| rejectManually | ~40 | Rejet manuel |
| negotiateManually | ~50 | Négociation manuelle |

**Fonctionnalités:**
- Évaluation automatique (scores)
- Auto-acceptation / Auto-rejet
- Génération contre-propositions
- Gestion tours de négociation
- Detection timeouts

---

### Modèles MongoDB

#### `models/AffretSession.js` (315 lignes)
**Schéma principal de session:**
- sessionId (AFFRET-YYYYMMDD-XXXX)
- orderId, organizationId
- trigger (type, reason, triggeredBy)
- status (analyzing, broadcasting, assigned, etc.)
- analysis (complexity, estimatedPrice, shortlist)
- broadcast (channels, recipients, campaign)
- selection (carrier, price, scores)
- metrics (duration, responseTime, etc.)
- timeline (événements)

**Méthodes:**
- generateSessionId()
- addTimelineEvent()
- updateMetrics()
- canNegotiate()
- getSessionStats()

#### `models/CarrierProposal.js` (348 lignes)
**Schéma de proposition:**
- sessionId, carrierId
- proposedPrice, priceBreakdown
- vehicleType, driver info
- services (tailgate, insurance, etc.)
- status (pending, accepted, rejected, etc.)
- scores (price, quality, overall)
- negotiationHistory
- vigilanceCheck

**Méthodes:**
- calculateScores()
- addNegotiation()
- canNegotiate()
- accept() / reject() / timeout()
- getBestProposal()
- getRanking()

#### `models/BroadcastCampaign.js` (350 lignes)
**Schéma de campagne:**
- campaignId, sessionId
- channels (email, bourse, push)
- recipients (avec tracking)
- stats (sent, delivered, opened, responded)
- reminders
- boursePublication

**Méthodes:**
- updateStats()
- markRecipientSent/Delivered/Opened/Responded()
- addReminder()
- getEngagementRate()
- getCampaignPerformance()

#### `models/VigilanceCheck.js` (363 lignes)
**Schéma de vigilance:**
- carrierId
- checks (kbis, insurance, license, blacklist)
- overallStatus (compliant, warning, non_compliant)
- complianceScore (0-100)
- alerts
- checkHistory

**Méthodes:**
- calculateComplianceScore()
- updateOverallStatus()
- addAlert() / resolveAlert()
- isCompliant() / canOperate()
- findExpiringSoon()
- getComplianceStats()

---

### Modules IA

#### `modules/ai-scoring-engine.js` (502 lignes)
**Classe AIScoringEngine:**

| Méthode | Lignes | Description |
|---------|--------|-------------|
| analyzeOrderComplexity | ~90 | Analyse complexité |
| calculatePriceScore | ~30 | Score prix |
| getCarrierQualityScore | ~40 | Score qualité |
| calculateQualityScore | ~15 | Calcul qualité |
| calculateProposalScore | ~20 | Score proposition |
| generateShortlist | ~30 | Générer shortlist |
| calculateMatchScore | ~50 | Score de match |
| estimatePrice | ~20 | Estimer prix |
| canAutoAccept | ~30 | Acceptation auto |
| generateCounterOffer | ~25 | Contre-proposition |

**Algorithmes:**
- Complexité: Distance + Poids + Contraintes + Délai
- Score Prix: 40% (dégressif si > estimation)
- Score Qualité: 60% (5 critères pondérés)
- Auto-acceptation: Prix <= estimation + seuils qualité
- Auto-rejet: Prix > +15%
- Négociation: Prix entre estimation et +15%

---

### Tests & Documentation

#### `test-endpoints.http` (350 lignes)
**28 requêtes de test HTTP:**
- 1 Health check
- 4 Session management
- 1 Analyse IA
- 2 Diffusion
- 3 Bourse publique
- 6 Propositions
- 4 Sélection
- 1 Assignation
- 3 Vigilance
- 3 Statistiques

**Format:** REST Client (VS Code)

#### `test-quick.js` (250 lignes)
**Script de tests automatiques:**
- 7 tests principaux
- Affichage coloré
- Rapport de résultats
- Usage: `npm test`

#### `README.md` (799 lignes)
**Documentation principale:**
- Vue d'ensemble
- Fonctionnalités
- Architecture
- Installation
- Configuration
- Endpoints API
- Workflow complet
- Modèles de données
- Déploiement

#### `IMPLEMENTATION_PHASE2.md` (800 lignes)
**Documentation Phase 2:**
- Résumé implémentation
- Fichiers créés
- Endpoints détaillés
- Algorithmes IA
- Workflow automatique
- Intégration services
- Tests et validation
- Prochaines étapes

---

## Statistiques du Projet

### Lignes de Code

| Catégorie | Fichiers | Lignes | % |
|-----------|----------|--------|---|
| Routes & Controllers | 2 | ~1150 | 19% |
| Services | 2 | ~1000 | 16% |
| Modèles | 4 | ~1376 | 22% |
| Modules IA | 1 | ~502 | 8% |
| Tests | 2 | ~600 | 10% |
| Documentation | 3 | ~1600 | 26% |
| **Total** | **14** | **~6200+** | **100%** |

### Endpoints API

| Type | Nombre |
|------|--------|
| POST | 11 |
| GET | 9 |
| PUT | 2 |
| **Total** | **22** |

### Fonctionnalités

| Module | Fonctionnalités |
|--------|-----------------|
| Session Management | 3 endpoints |
| Analyse IA | 1 endpoint + moteur IA |
| Diffusion | 1 endpoint + 3 canaux |
| Bourse | 2 endpoints publics |
| Propositions | 5 endpoints |
| Sélection | 2 endpoints + algorithmes |
| Assignation | 1 endpoint |
| Vigilance | 2 endpoints + vérifications |
| Stats | 2 endpoints + analytics |

---

## Dépendances

### Production

```json
{
  "express": "^4.18.2",
  "mongoose": "^8.0.3",
  "cors": "^2.8.5",
  "dotenv": "^16.3.1",
  "axios": "^1.6.2",
  "socket.io-client": "^4.7.2"
}
```

### Développement

```json
{
  "nodemon": "^3.0.2"
}
```

---

## Workflow de Développement

### Démarrage Local

```bash
# Installer les dépendances
npm install

# Configurer l'environnement
cp .env.example .env
# Éditer .env avec les bonnes valeurs

# Démarrer en mode développement
npm run dev

# Tester
npm test
```

### Tests

```bash
# Tests rapides
npm test

# Tests HTTP (VS Code + REST Client)
# Ouvrir test-endpoints.http et cliquer sur "Send Request"
```

### Déploiement

```bash
# Déployer sur AWS Elastic Beanstalk
eb deploy

# Vérifier le health
curl http://rt-affret-ia-api-prod-v2.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/health
```

---

## Intégrations

### Services Internes

| Service | Port | Utilisation |
|---------|------|-------------|
| WebSocket | 3010 | Événements temps réel |
| Orders API | 3011 | Gestion commandes |
| Carriers API | 3012 | Recherche transporteurs |
| Notifications API | 3015 | Envoi notifications |
| Scoring API | 3016 | Scores transporteurs |
| Pricing API | 3014 | Calcul tarifs |

### Services Externes

| Service | Utilisation |
|---------|-------------|
| SendGrid | Envoi emails |
| MongoDB Atlas | Base de données |
| AWS Elastic Beanstalk | Hébergement |

---

## Événements WebSocket

### Émis par AFFRET.IA

```javascript
'affret.session.created'          // Session créée
'affret.analysis.completed'       // Analyse terminée
'affret.broadcast.completed'      // Diffusion terminée
'affret.proposal.received'        // Proposition reçue
'affret.carrier.selected'         // Transporteur sélectionné
'carrier.assigned'                // Mission assignée
```

---

## Configuration Recommandée

### Variables Critiques

```env
# Prix et négociation
AFFRET_MAX_PRICE_INCREASE=15      # % max au-dessus estimation
AFFRET_AUTO_ACCEPT_THRESHOLD=0    # Acceptation auto si <= estimation
AFFRET_NEGOTIATION_MAX_ROUNDS=3   # Max 3 tours de négociation

# Délais
AFFRET_RESPONSE_TIMEOUT=24        # Timeout 24h

# Shortlist
AFFRET_SHORTLIST_SIZE=10          # 10 transporteurs max
```

### URLs Production

```env
SERVICE_URL=http://rt-affret-ia-api-prod-v2.eba-quc9udpr.eu-central-1.elasticbeanstalk.com
BOURSE_BASE_URL=https://bourse.affretia.com
```

---

## Maintenance

### Logs à Surveiller

- Connexions MongoDB
- Erreurs d'appels API
- Timeouts de négociation
- Échecs de diffusion
- Scores de conformité faibles

### Métriques à Monitorer

- Nombre de sessions / jour
- Taux de succès
- Temps moyen de résolution
- Prix moyen négocié
- Taux de conformité

---

**Structure validée le:** 28 Novembre 2025
**Version:** 2.0.0
**Status:** ✅ Production Ready
