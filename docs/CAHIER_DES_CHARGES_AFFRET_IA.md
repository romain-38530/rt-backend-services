# CAHIER DES CHARGES - MODULE AFFRET IA
## Mise a niveau complete du systeme d'affretement intelligent

**Version:** 1.0
**Date:** 26 Decembre 2025
**Statut:** A implementer

---

## TABLE DES MATIERES

1. [Resume Executif](#1-resume-executif)
2. [Etat des Lieux](#2-etat-des-lieux)
3. [Objectifs](#3-objectifs)
4. [Specifications Techniques](#4-specifications-techniques)
5. [Plan d'Implementation](#5-plan-dimplementation)
6. [Tests et Validation](#6-tests-et-validation)
7. [Deploiement](#7-deploiement)

---

## 1. RESUME EXECUTIF

### 1.1 Contexte
Le module AFFRET IA est un systeme d'affretement intelligent permettant de mettre en relation automatiquement les industriels ayant des besoins de transport avec les transporteurs disponibles. Le systeme utilise l'IA pour analyser les commandes, scorer les transporteurs et optimiser les attributions.

### 1.2 Probleme Actuel
- Version minimale deployee (5 endpoints sur 38+ disponibles)
- Base de donnees vide (aucune donnee de production)
- 4 APIs critiques non connectees (Vigilance, Notifications, Carriers, Pricing)
- Systeme d'email broadcast non fonctionnel
- 5/7 univers sans implementation frontend

### 1.3 Solution Proposee
Deploiement complet de la version AFFRET IA v2 avec toutes les interconnections et fonctionnalites.

---

## 2. ETAT DES LIEUX

### 2.1 Infrastructure Actuelle

| Composant | Etat | Details |
|-----------|------|---------|
| EB Environment | OK | rt-affret-ia-api-prod-v4, Health: Green |
| CloudFront | OK | d393yiia4ig3bw.cloudfront.net |
| MongoDB | OK | rt-affretia, Connected |
| Version deployee | KO | v2.2-health (minimale) |

### 2.2 Endpoints Disponibles vs Deployes

| Categorie | Deployes | Disponibles (v2) |
|-----------|----------|------------------|
| Session Management | 0 | 3 |
| AI Analysis | 0 | 1 |
| Broadcasting | 0 | 2 |
| Proposals | 0 | 7 |
| Selection | 0 | 3 |
| Assignment | 0 | 1 |
| Vigilance | 0 | 2 |
| Tracking | 0 | 9 |
| Blacklist | 0 | 4 |
| Statistics | 0 | 3 |
| Basic (actuels) | 5 | - |
| **TOTAL** | **5** | **38+** |

### 2.3 Frontend par Univers

| Univers | Page | Etat |
|---------|------|------|
| web-industry | affret-ia.tsx | Existe |
| web-transporter | bourse.tsx | Existe |
| web-transporter | mes-propositions.tsx | Existe |
| web-logistician | - | Manquant |
| web-forwarder | - | Manquant |
| web-recipient | - | Non requis |
| web-supplier | - | Non requis |

### 2.4 Interconnections

| Service | URL | Connecte |
|---------|-----|----------|
| Orders API | rt-orders-api-prod | Oui |
| Scoring API | rt-scoring-api-prod | Oui |
| WebSocket API | rt-websocket-api-prod | Oui |
| Vigilance API | rt-vigilance-api-prod | Non |
| Notifications API | rt-notifications-api-prod | Non |
| Carriers API | ? | Non |
| Pricing API | ? | Non |

---

## 3. OBJECTIFS

### 3.1 Objectifs Fonctionnels

#### OF-01: Workflow Complet AFFRET IA
- Declenchement automatique/manuel pour commandes sans transporteur
- Analyse IA de la complexite de commande
- Generation de shortlist des meilleurs transporteurs
- Diffusion multi-canal (email, bourse, push)
- Reception et scoring des propositions
- Negociation automatique (max 3 rounds, +15% max)
- Selection IA du meilleur transporteur
- Attribution et notification

#### OF-02: Bourse de Fret Publique
- Publication d'offres sur la bourse
- Consultation par tous les transporteurs
- Soumission de propositions
- Suivi des propositions en temps reel

#### OF-03: Systeme de Vigilance
- Verification conformite transporteur (KBIS, assurance, licence)
- Alertes avant expiration documents
- Blocage automatique si non-conforme
- Blacklist des transporteurs

#### OF-04: Tracking Multi-niveau
- Niveau Basic: Mise a jour manuelle du statut
- Niveau Intermediate: Geolocalisation toutes les 2h + geofencing
- Niveau Premium: GPS temps reel (5min) + ETA predictive + alertes ML

#### OF-05: Systeme d'Emails
- Broadcast campagnes vers shortlist transporteurs
- Notifications assignation
- Alertes vigilance (J-30, J-15, J-7)
- Templates HTML responsive

### 3.2 Objectifs Techniques

#### OT-01: Deployer AFFRET IA v2 Complet
- Deployer index.js avec tous les 38+ endpoints
- Deployer tous les modeles MongoDB
- Deployer tous les services (broadcast, negotiation, tracking)
- Deployer le moteur de scoring IA

#### OT-02: Configurer les Variables d'Environnement
```
NOTIFICATIONS_API_URL=http://rt-notifications-api-prod.eba-usjgee8u.eu-central-1.elasticbeanstalk.com
VIGILANCE_API_URL=http://rt-vigilance-api-prod.eba-kmvyig6m.eu-central-1.elasticbeanstalk.com
CARRIERS_API_URL=<a determiner>
PRICING_API_URL=<a determiner>
SENDGRID_API_KEY=<a configurer>
SENDGRID_FROM_EMAIL=affret@symphonia-controltower.com
BOURSE_BASE_URL=https://bourse.symphonia-controltower.com
AFFRET_MAX_PRICE_INCREASE=15
AFFRET_AUTO_ACCEPT_THRESHOLD=0
AFFRET_NEGOTIATION_MAX_ROUNDS=3
AFFRET_RESPONSE_TIMEOUT=24
AFFRET_SHORTLIST_SIZE=10
TOMTOM_API_KEY=<pour tracking premium>
```

#### OT-03: Creer Pages Frontend Manquantes
- web-logistician/pages/affret-ia.tsx
- web-forwarder/pages/affret-ia.tsx

#### OT-04: Implementer Temps Reel
- Connexion WebSocket pour notifications live
- Mise a jour automatique des propositions
- Alertes en temps reel

---

## 4. SPECIFICATIONS TECHNIQUES

### 4.1 Architecture Backend

```
┌─────────────────────────────────────────────────────────────────┐
│                    AFFRET IA API v2 (Port 8080)                  │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Routes    │  │ Controllers │  │  Services   │              │
│  │  /api/v1/   │→ │  affretia   │→ │  broadcast  │              │
│  │  affretia/* │  │  .controller│  │  negotiation│              │
│  └─────────────┘  └─────────────┘  │  tracking   │              │
│                                     └─────────────┘              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Models    │  │  Modules    │  │  Middleware │              │
│  │ AffretSession│ │ ai-scoring  │  │  auth       │              │
│  │ Proposal    │  │ engine.js   │  │  validation │              │
│  │ Campaign    │  └─────────────┘  └─────────────┘              │
│  │ Tracking    │                                                 │
│  │ Vigilance   │                                                 │
│  └─────────────┘                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  MongoDB     │   │External APIs │   │  Providers   │
│  Atlas       │   │ Orders       │   │  SendGrid    │
│              │   │ Scoring      │   │  Mailgun     │
│ Collections: │   │ Vigilance    │   │  TomTom      │
│ - sessions   │   │ Notifications│   │  WebSocket   │
│ - proposals  │   │ Carriers     │   └──────────────┘
│ - campaigns  │   │ Pricing      │
│ - tracking   │   └──────────────┘
│ - vigilance  │
└──────────────┘
```

### 4.2 Modeles de Donnees

#### AffretSession
```javascript
{
  sessionId: String,          // AFFRET-YYYYMMDD-XXXX
  orderId: String,
  organizationId: String,
  status: Enum,               // analyzing → shortlist_created → broadcasting →
                              // awaiting_responses → negotiating → selecting →
                              // assigned → failed → cancelled
  analysis: {
    complexityScore: Number,  // 0-100
    constraints: [String],
    estimatedPrice: Number,
    suggestedVehicleTypes: [String],
    suggestedCarriers: Number
  },
  shortlist: [{
    carrierId: String,
    carrierName: String,
    matchScore: Number,
    distance: Number,
    estimatedPrice: Number
  }],
  broadcast: {
    channels: {
      email: { sent: Boolean, sentAt: Date, recipients: Number },
      bourse: { published: Boolean, publishedAt: Date },
      push: { sent: Boolean, sentAt: Date, recipients: Number }
    },
    campaignId: String
  },
  selection: {
    selectedCarrierId: String,
    selectedCarrierName: String,
    finalPrice: Number,
    selectionMethod: Enum,    // best_score, best_price, balanced, manual
    selectionDate: Date
  },
  negotiationSettings: {
    maxPriceIncrease: Number, // default 15%
    autoAcceptThreshold: Number,
    negotiationMaxRounds: Number,
    responseTimeout: Number   // heures
  },
  metrics: {
    analysisTime: Number,
    broadcastTime: Number,
    responseTime: Number,
    totalDuration: Number
  },
  timeline: [{
    event: String,
    timestamp: Date,
    details: Object
  }]
}
```

#### CarrierProposal
```javascript
{
  proposalId: String,
  sessionId: String,
  carrierId: String,
  carrierName: String,
  proposedPrice: Number,
  currency: String,
  priceBreakdown: {
    basePrice: Number,
    fuelSurcharge: Number,
    tolls: Number,
    otherCharges: Number
  },
  vehicleType: String,
  vehicleCapacity: Number,
  driverInfo: {
    name: String,
    phone: String,
    licenseType: String
  },
  estimatedPickupDate: Date,
  estimatedDeliveryDate: Date,
  services: {
    tailgate: Boolean,
    palletJack: Boolean,
    insurance: Boolean,
    adr: Boolean,
    temperatureControl: Boolean,
    trackingLevel: Enum      // basic, intermediate, premium
  },
  status: Enum,              // pending → accepted/rejected/negotiating/timeout/withdrawn
  scores: {
    price: Number,           // 0-100
    quality: Number,         // 0-100
    overall: Number          // 0-100
  },
  negotiationHistory: [{
    round: Number,
    proposedPrice: Number,
    counterPrice: Number,
    status: String,
    timestamp: Date
  }],
  vigilanceCheck: {
    kbis: { status: String, validUntil: Date },
    insurance: { status: String, validUntil: Date },
    license: { status: String, validUntil: Date },
    blacklist: { status: String }
  },
  source: Enum               // email, bourse, push, manual, api
}
```

### 4.3 API Endpoints Complets

#### Session Management
```
POST   /api/v1/affretia/trigger              # Declencher AFFRET.IA
GET    /api/v1/affretia/session/:id          # Details session
GET    /api/v1/affretia/sessions             # Liste sessions (filtres)
```

#### AI Analysis
```
POST   /api/v1/affretia/analyze              # Analyser commande + shortlist
```

#### Broadcasting
```
POST   /api/v1/affretia/broadcast            # Diffusion multi-canal
GET    /api/v1/affretia/bourse               # Offres publiques bourse
POST   /api/v1/affretia/bourse/submit        # Soumettre proposition bourse
```

#### Proposals & Negotiation
```
POST   /api/v1/affretia/response             # Enregistrer reponse transporteur
GET    /api/v1/affretia/proposals/:sessionId # Liste propositions
PUT    /api/v1/affretia/proposals/:id/accept # Accepter proposition
PUT    /api/v1/affretia/proposals/:id/reject # Rejeter proposition
POST   /api/v1/affretia/proposals/:id/negotiate # Negocier
GET    /api/v1/affretia/proposals/:id/history   # Historique negociation
```

#### Selection & Ranking
```
POST   /api/v1/affretia/select               # Selection IA
GET    /api/v1/affretia/ranking/:sessionId   # Ranking propositions
GET    /api/v1/affretia/decision/:sessionId  # Recommandation IA
```

#### Assignment
```
POST   /api/v1/affretia/assign               # Attribuer transporteur
```

#### Vigilance
```
POST   /api/v1/affretia/vigilance/check      # Verifier conformite
GET    /api/v1/affretia/vigilance/:carrierId # Statut conformite
```

#### Tracking
```
GET    /api/v1/affretia/tracking/levels      # Options niveaux tracking
POST   /api/v1/affretia/tracking/configure   # Configurer tracking
GET    /api/v1/affretia/tracking/eta/:orderId # ETA predictive
GET    /api/v1/affretia/tracking/:orderId    # Info tracking
POST   /api/v1/affretia/tracking/:id/position # Maj position GPS
PUT    /api/v1/affretia/tracking/:id/status  # Maj statut manuel
GET    /api/v1/affretia/tracking/:id/alerts  # Alertes tracking
PUT    /api/v1/affretia/tracking/alerts/:id/acknowledge # Acquitter alerte
PUT    /api/v1/affretia/tracking/alerts/:id/resolve     # Resoudre alerte
```

#### Blacklist
```
GET    /api/v1/affretia/blacklist            # Liste blacklist
POST   /api/v1/affretia/blacklist            # Ajouter blacklist
DELETE /api/v1/affretia/blacklist/:carrierId # Retirer blacklist
GET    /api/v1/affretia/blacklist/:carrierId # Verifier blacklist
```

#### Statistics
```
GET    /api/v1/affretia/stats                # Stats globales
GET    /api/v1/affretia/stats/:orgId         # Stats organisation
GET    /api/v1/affretia/campaigns/:id        # Details campagne
```

### 4.4 Algorithme de Scoring IA

#### Poids des Criteres
```
Score Global = (Score Prix * 40%) + (Score Qualite * 60%)

Score Prix (0-100):
- Prix <= Estime: 100 points
- Prix > Estime: Penalite lineaire jusqu'a +30%
- Bonus si prix < estime

Score Qualite (0-100):
- Performance historique: 25%
- Ponctualite: 15%
- Taux d'acceptation: 10%
- Reactivite: 5%
- Capacite: 5%
```

#### Complexite Commande (0-100)
```
Distance:      0-30 points (>1000km=30, >500km=20, >200km=10, sinon=5)
Poids/Volume:  0-20 points
Contraintes:   0-30 points (ADR, temperature, creneaux, haute valeur)
Urgence:       0-20 points (<24h=20, <48h=15, <72h=10)

Categories: tres_simple (0-20), simple (21-40), modere (41-60),
            complexe (61-80), tres_complexe (81-100)
```

#### Auto-acceptation
```
Conditions pour auto-accepter:
- Prix <= prix max autorise (estime + 15%)
- Score qualite >= 70
- Score global >= 75
```

### 4.5 Templates Email

#### Template Broadcast Campagne
```html
Sujet: [AFFRET.IA] Nouvelle opportunite transport - {route}

Corps:
- Logo SYMPHONI.A
- Titre: Opportunite de transport
- Details: Origine → Destination
- Marchandise: Type, poids, volume, palettes
- Vehicule requis: Type
- Date enlevement: JJ/MM/AAAA HH:MM
- Date livraison: JJ/MM/AAAA HH:MM
- Prix indicatif: XXX EUR (negociable: Oui/Non)
- CTA: "Faire une proposition"
- Lien vers bourse
- Footer: Mentions legales, desinscription
```

---

## 5. PLAN D'IMPLEMENTATION

### Phase 1: Backend (Priorite Haute)

#### Tache 1.1: Deployer AFFRET IA v2
**Duree estimee:** 2h
**Responsable:** DevOps

Actions:
1. Creer package zip depuis services/affret-ia-api-v2/
2. Upload S3
3. Creer nouvelle version EB
4. Deployer sur rt-affret-ia-api-prod-v4
5. Verifier health check

```bash
# Commandes
cd services/affret-ia-api-v2
zip -r deploy-v2.0.0-full.zip . -x "node_modules/*" -x ".git/*"
aws s3 cp deploy-v2.0.0-full.zip s3://elasticbeanstalk-eu-central-1-004843574253/affret-ia-api/
aws elasticbeanstalk create-application-version \
  --application-name rt-affret-ia-api \
  --version-label "v2.0.0-full" \
  --source-bundle S3Bucket=elasticbeanstalk-eu-central-1-004843574253,S3Key=affret-ia-api/deploy-v2.0.0-full.zip \
  --region eu-central-1
aws elasticbeanstalk update-environment \
  --environment-name rt-affret-ia-api-prod-v4 \
  --version-label "v2.0.0-full" \
  --region eu-central-1
```

#### Tache 1.2: Configurer Variables Environnement
**Duree estimee:** 30min
**Responsable:** DevOps

```bash
aws elasticbeanstalk update-environment \
  --environment-name rt-affret-ia-api-prod-v4 \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=NOTIFICATIONS_API_URL,Value=http://rt-notifications-api-prod.eba-usjgee8u.eu-central-1.elasticbeanstalk.com \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=VIGILANCE_API_URL,Value=http://rt-vigilance-api-prod.eba-kmvyig6m.eu-central-1.elasticbeanstalk.com \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=SENDGRID_API_KEY,Value=<API_KEY> \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=SENDGRID_FROM_EMAIL,Value=affret@symphonia-controltower.com \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=AFFRET_MAX_PRICE_INCREASE,Value=15 \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=AFFRET_SHORTLIST_SIZE,Value=10 \
  --region eu-central-1
```

#### Tache 1.3: Creer Donnees de Test
**Duree estimee:** 1h
**Responsable:** Dev Backend

Creer script seed-affretia.js:
- 5 sessions de test avec differents statuts
- 20 propositions de transporteurs
- 3 campagnes broadcast
- Donnees vigilance pour 10 transporteurs

#### Tache 1.4: Tests API
**Duree estimee:** 2h
**Responsable:** QA

Tests a executer:
- [ ] POST /trigger - Creer session
- [ ] POST /analyze - Analyser commande
- [ ] POST /broadcast - Diffuser offre
- [ ] POST /response - Recevoir proposition
- [ ] POST /select - Selectionner transporteur
- [ ] POST /assign - Attribuer commande
- [ ] GET /bourse - Verifier bourse publique

---

### Phase 2: Emails (Priorite Haute)

#### Tache 2.1: Configurer SendGrid
**Duree estimee:** 1h
**Responsable:** DevOps

Actions:
1. Creer compte SendGrid (si pas existant)
2. Verifier domaine expediteur
3. Generer API Key
4. Configurer dans EB

#### Tache 2.2: Tester Broadcast Email
**Duree estimee:** 30min
**Responsable:** QA

Actions:
1. Declencher session AFFRET.IA
2. Verifier reception email shortlist
3. Valider template HTML
4. Tester liens CTA

---

### Phase 3: Frontend (Priorite Moyenne)

#### Tache 3.1: Mettre a Jour web-industry/affret-ia.tsx
**Duree estimee:** 2h
**Responsable:** Dev Frontend

Actions:
1. Supprimer valeurs hardcodees (org-demo, user-demo)
2. Connecter aux vrais endpoints v2
3. Ajouter WebSocket pour temps reel
4. Tester flux complet

#### Tache 3.2: Mettre a Jour web-transporter/bourse.tsx
**Duree estimee:** 1h
**Responsable:** Dev Frontend

Actions:
1. Supprimer mock data fallback
2. Connecter au vrai endpoint /bourse
3. Ajouter refresh automatique

#### Tache 3.3: Creer web-logistician/affret-ia.tsx
**Duree estimee:** 3h
**Responsable:** Dev Frontend

Fonctionnalites:
- Vue des sessions en cours
- Suivi des attributions
- Dashboard statistiques
- Alertes temps reel

#### Tache 3.4: Creer web-forwarder/affret-ia.tsx
**Duree estimee:** 3h
**Responsable:** Dev Frontend

Fonctionnalites:
- Declenchement sessions pour clients
- Vue consolidee multi-clients
- Reporting

---

### Phase 4: Interconnections (Priorite Moyenne)

#### Tache 4.1: Connecter Vigilance API
**Duree estimee:** 1h
**Responsable:** Dev Backend

Actions:
1. Ajouter VIGILANCE_API_URL en env
2. Implementer appels dans affretia.controller.js
3. Tester verification conformite avant attribution

#### Tache 4.2: Connecter Notifications API
**Duree estimee:** 1h
**Responsable:** Dev Backend

Actions:
1. Ajouter NOTIFICATIONS_API_URL en env
2. Implementer notifications assignation
3. Tester envoi push/email

#### Tache 4.3: Implementer WebSocket Temps Reel
**Duree estimee:** 2h
**Responsable:** Dev Backend

Events a emettre:
- affret.session.created
- affret.proposal.received
- affret.proposal.accepted
- affret.carrier.assigned
- affret.tracking.update

---

### Phase 5: Tracking IA (Priorite Basse)

#### Tache 5.1: Implementer Tracking Basic
**Duree estimee:** 2h

Fonctionnalites:
- Mise a jour manuelle statut
- Historique evenements

#### Tache 5.2: Implementer Tracking Intermediate
**Duree estimee:** 4h

Fonctionnalites:
- Geolocalisation toutes les 2h
- Geofencing (rayon 200m)
- Alertes deviation

#### Tache 5.3: Implementer Tracking Premium
**Duree estimee:** 6h

Fonctionnalites:
- GPS temps reel (5min)
- ETA predictive (TomTom API)
- Alertes ML (retard, deviation, vitesse)
- Calcul CO2

---

## 6. TESTS ET VALIDATION

### 6.1 Tests Unitaires

| Module | Tests | Couverture Cible |
|--------|-------|------------------|
| ai-scoring-engine | Score prix, Score qualite, Complexite | 90% |
| broadcast.service | Email, Bourse, Push | 85% |
| negotiation.service | Auto-accept, Counter-offer | 90% |
| tracking.service | Positions, Alertes, ETA | 85% |

### 6.2 Tests d'Integration

| Flux | Description | Criteres Succes |
|------|-------------|-----------------|
| E2E Session | Trigger → Assign | Session statut = assigned |
| Broadcast | Trigger → Email recu | Email delivre < 5min |
| Negotiation | Proposition → Counter → Accept | Max 3 rounds |
| Vigilance | Check → Block si non-conforme | Statut correct |

### 6.3 Tests de Performance

| Metrique | Seuil |
|----------|-------|
| Temps reponse API | < 500ms (P95) |
| Temps analyse IA | < 2s |
| Temps broadcast | < 10s |
| Connexions simultanees | 100+ |

### 6.4 Tests de Securite

- [ ] Authentification JWT sur tous endpoints
- [ ] Validation input (Joi/Zod)
- [ ] Rate limiting
- [ ] Pas de fuite donnees sensibles

---

## 7. DEPLOIEMENT

### 7.1 Checklist Pre-deploiement

- [ ] Code review complete
- [ ] Tests passes (unit + integration)
- [ ] Variables environnement configurees
- [ ] Backup base de donnees
- [ ] Rollback plan prepare

### 7.2 Procedure Deploiement

```bash
# 1. Preparer package
cd services/affret-ia-api-v2
npm ci --production
zip -r deploy-v2.0.0.zip . -x "node_modules/.cache/*"

# 2. Upload et deployer
aws s3 cp deploy-v2.0.0.zip s3://elasticbeanstalk-eu-central-1-004843574253/affret-ia-api/
aws elasticbeanstalk create-application-version --application-name rt-affret-ia-api --version-label "v2.0.0" --source-bundle S3Bucket=elasticbeanstalk-eu-central-1-004843574253,S3Key=affret-ia-api/deploy-v2.0.0.zip --region eu-central-1
aws elasticbeanstalk update-environment --environment-name rt-affret-ia-api-prod-v4 --version-label "v2.0.0" --region eu-central-1

# 3. Verifier
curl https://d393yiia4ig3bw.cloudfront.net/health
curl https://d393yiia4ig3bw.cloudfront.net/api/v1/affretia/health

# 4. Smoke tests
curl -X POST https://d393yiia4ig3bw.cloudfront.net/api/v1/affretia/trigger -H "Content-Type: application/json" -d '{"orderId": "TEST-001"}'
```

### 7.3 Rollback

```bash
# En cas de probleme
aws elasticbeanstalk update-environment --environment-name rt-affret-ia-api-prod-v4 --version-label "v2.2-health" --region eu-central-1
```

### 7.4 Monitoring Post-deploiement

- CloudWatch Logs: Erreurs, latence
- CloudWatch Alarms: CPU > 80%, Erreurs > 10/min
- MongoDB Atlas: Performance queries
- SendGrid Dashboard: Deliverabilite emails

---

## ANNEXES

### A. Estimation Effort Total

| Phase | Effort | Priorite |
|-------|--------|----------|
| Phase 1: Backend | 6h | Haute |
| Phase 2: Emails | 1.5h | Haute |
| Phase 3: Frontend | 9h | Moyenne |
| Phase 4: Interconnections | 4h | Moyenne |
| Phase 5: Tracking IA | 12h | Basse |
| **TOTAL** | **32.5h** | - |

### B. Risques et Mitigations

| Risque | Impact | Probabilite | Mitigation |
|--------|--------|-------------|------------|
| SendGrid non configure | Haut | Moyen | Fallback Mailgun |
| API externes down | Moyen | Faible | Circuit breaker |
| Surcharge MongoDB | Moyen | Faible | Indexes optimises |
| Regression frontend | Moyen | Moyen | Tests E2E |

### C. Contacts

| Role | Nom | Email |
|------|-----|-------|
| Product Owner | - | - |
| Tech Lead | - | - |
| DevOps | - | - |
| QA Lead | - | - |

---

**Document cree le:** 26 Decembre 2025
**Derniere mise a jour:** 26 Decembre 2025
**Version:** 1.0
