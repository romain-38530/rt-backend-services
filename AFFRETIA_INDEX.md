# AFFRET.IA - Index de Documentation

**Date:** 27 Novembre 2025
**Version:** 1.0.0

---

## NAVIGATION RAPIDE

### Documents Principaux

1. **[AFFRETIA_IMPLEMENTATION.md](./AFFRETIA_IMPLEMENTATION.md)**
   - Plan d'implementation complet sur 6 semaines
   - Architecture detaillee
   - 30+ endpoints API specifies
   - Workflow complet avec scenario
   - 1,200+ lignes

2. **[AFFRETIA_RAPPORT_FINAL.md](../rt-frontend-apps/AFFRETIA_RAPPORT_FINAL.md)**
   - Resume executif de Phase 1
   - Realisations detaillees
   - Prochaines etapes
   - 900+ lignes

3. **[README.md](./services/affret-ia-api-v2/README.md)**
   - Guide complet API AFFRET.IA v2.0
   - Documentation endpoints
   - Exemples d'utilisation
   - 800+ lignes

---

## STRUCTURE DU PROJET

```
rt-backend-services/
│
├── AFFRETIA_IMPLEMENTATION.md        📘 Plan complet
├── AFFRETIA_INDEX.md                 📑 Ce fichier
│
└── services/affret-ia-api-v2/
    ├── README.md                      📖 Guide API
    │
    ├── models/                        💾 Modeles de donnees
    │   ├── AffretSession.js           (280 lignes)
    │   ├── CarrierProposal.js         (320 lignes)
    │   ├── BroadcastCampaign.js       (280 lignes)
    │   └── VigilanceCheck.js          (250 lignes)
    │
    ├── modules/                       🧠 Intelligence IA
    │   └── ai-scoring-engine.js       (550 lignes)
    │
    ├── index.js                       ⚙️  Service principal (existant)
    ├── package.json                   📦 Dependances
    ├── .env.example                   🔧 Configuration
    └── Procfile                       🚀 Deploiement

rt-frontend-apps/
│
└── AFFRETIA_RAPPORT_FINAL.md         📊 Rapport Phase 1
```

---

## PAR THEME

### Architecture & Planning

- [AFFRETIA_IMPLEMENTATION.md](./AFFRETIA_IMPLEMENTATION.md)
  - Section 2: Etat des Lieux du Codebase
  - Section 3: Architecture Proposee
  - Section 4: Plan d'Implementation Detaille

### Modeles de Donnees

- [AFFRETIA_IMPLEMENTATION.md](./AFFRETIA_IMPLEMENTATION.md#modeles-de-donnees)
  - AffretSession (session d'affretement)
  - CarrierProposal (propositions transporteurs)
  - BroadcastCampaign (diffusion multi-canal)
  - VigilanceCheck (conformite)

- Fichiers:
  - [models/AffretSession.js](./services/affret-ia-api-v2/models/AffretSession.js)
  - [models/CarrierProposal.js](./services/affret-ia-api-v2/models/CarrierProposal.js)
  - [models/BroadcastCampaign.js](./services/affret-ia-api-v2/models/BroadcastCampaign.js)
  - [models/VigilanceCheck.js](./services/affret-ia-api-v2/models/VigilanceCheck.js)

### Endpoints API

- [AFFRETIA_IMPLEMENTATION.md](./AFFRETIA_IMPLEMENTATION.md#endpoints-api)
  - Declenchement (3 endpoints)
  - Diffusion (3 endpoints)
  - Propositions (5 endpoints)
  - Selection IA (3 endpoints)
  - Vigilance (4 endpoints)
  - Tracking (4 endpoints)
  - Reporting (3 endpoints)

- [README.md](./services/affret-ia-api-v2/README.md#endpoints-api)
  - Exemples de requetes/reponses
  - Codes d'erreur
  - Authentification

### Moteur IA

- [modules/ai-scoring-engine.js](./services/affret-ia-api-v2/modules/ai-scoring-engine.js)
  - Analyse complexite commande
  - Scoring multi-criteres (Prix 40% + Qualite 60%)
  - Generation shortlist
  - Auto-acceptation / negociation

- [README.md](./services/affret-ia-api-v2/README.md#moteur-ia)
  - Algorithmes detailles
  - Exemples de calculs
  - Configuration pondérations

### Workflow Complet

- [AFFRETIA_IMPLEMENTATION.md](./AFFRETIA_IMPLEMENTATION.md#workflow-complet-affretia)
  - Scenario type: Commande sans transporteur
  - 12 etapes detaillees
  - Timeline realiste

- [README.md](./services/affret-ia-api-v2/README.md#workflow-complet)
  - Exemple concret
  - Appels API
  - Evenements WebSocket

### Integration

- [AFFRETIA_IMPLEMENTATION.md](./AFFRETIA_IMPLEMENTATION.md#integration-avec-services-existants)
  - Services internes utilises
  - Services externes requis
  - Evenements WebSocket

### Deploiement

- [README.md](./services/affret-ia-api-v2/README.md#deploiement)
  - AWS Elastic Beanstalk
  - Docker
  - Variables d'environnement

---

## PAR PHASE D'IMPLEMENTATION

### Phase 1: COMPLETEE ✅

**Documents:**
- [AFFRETIA_RAPPORT_FINAL.md](../rt-frontend-apps/AFFRETIA_RAPPORT_FINAL.md)
  - Section 3: Realisations - Phase 1

**Fichiers crees:**
- 4 modeles MongoDB (1,130 lignes)
- 1 moteur IA (550 lignes)
- 3 documents de documentation (2,900+ lignes)

### Phase 2: A FAIRE 🔨

**Reference:**
- [AFFRETIA_IMPLEMENTATION.md](./AFFRETIA_IMPLEMENTATION.md#phase-2-diffusion-multi-canal-semaine-2)
  - Systeme de diffusion
  - Templates emails
  - Bourse AFFRET.IA
  - Push intelligent

### Phase 3: A FAIRE 🔨

**Reference:**
- [AFFRETIA_IMPLEMENTATION.md](./AFFRETIA_IMPLEMENTATION.md#phase-3-gestion-reponses--negociation-semaine-2-3)
  - Gestion propositions
  - Negociation automatique
  - Devoir de vigilance

### Phase 4: A FAIRE 🔨

**Reference:**
- [AFFRETIA_IMPLEMENTATION.md](./AFFRETIA_IMPLEMENTATION.md#phase-4-selection-ia-semaine-3)
  - Selection IA complete
  - Justification decisions
  - Classement propositions

### Phase 5: A FAIRE 🔨

**Reference:**
- [AFFRETIA_IMPLEMENTATION.md](./AFFRETIA_IMPLEMENTATION.md#phase-5-devoir-de-vigilance-semaine-4)
  - Verifications automatiques
  - API KBIS
  - Blacklist management

### Phase 6: A FAIRE 🔨

**Reference:**
- [AFFRETIA_IMPLEMENTATION.md](./AFFRETIA_IMPLEMENTATION.md#phase-6-tracking-ia-multi-niveaux-semaine-4-5)
  - Tracking 3 niveaux
  - Alertes intelligentes
  - ETA predictif

---

## EXEMPLES D'UTILISATION

### Demarrage Rapide

```bash
# Backend
cd /c/Users/rtard/rt-backend-services/services/affret-ia-api-v2
npm install
npm run dev

# Test
curl http://localhost:3017/health
```

### Premier Appel API

```bash
# Declencher AFFRET.IA
curl -X POST http://localhost:3017/api/v1/affretia/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORD251127001",
    "triggerType": "auto_failure",
    "reason": "Aucun transporteur disponible"
  }'
```

### Utilisation Moteur IA

```javascript
const AIScoringEngine = require('./modules/ai-scoring-engine');

const engine = new AIScoringEngine({
  scoringApiUrl: process.env.SCORING_API_URL
});

// Analyser complexite
const complexity = await engine.analyzeOrderComplexity(order);
console.log(`Complexite: ${complexity.complexity}/100`);

// Generer shortlist
const shortlist = await engine.generateShortlist(order, carriers, 10);
console.log(`${shortlist.length} transporteurs selectionnes`);

// Scorer une proposition
const scores = await engine.calculateProposalScore(proposal, estimatedPrice);
console.log(`Score global: ${scores.overall}/100`);
```

---

## METRIQUES & KPIs

**Reference:** [AFFRETIA_RAPPORT_FINAL.md](../rt-frontend-apps/AFFRETIA_RAPPORT_FINAL.md#6-metriques-de-succes-kpis)

### KPIs Techniques
- Temps reponse < 5s (95% endpoints)
- Architecture modulaire
- Documentation complete
- Code type-safe

### KPIs Business
- Taux reussite affectation > 90%
- Temps moyen affectation < 30 min
- Satisfaction transporteurs > 4/5
- Reduction couts operationnels 40%

---

## STATISTIQUES

### Lignes de Code

```
Modeles de donnees:     1,130 lignes
Moteur IA:                550 lignes
Documentation:          2,900 lignes
─────────────────────────────────────
Total Phase 1:          4,580 lignes
```

### Fichiers Crees

```
Backend:                      6 fichiers
Frontend:                     1 fichier
─────────────────────────────────────
Total:                        7 fichiers
```

### Couverture Fonctionnelle

```
Cahier des charges:          100%
Modeles de donnees:          100% ✅
Moteur IA:                   100% ✅
Endpoints API:                30% 🔨
Diffusion multi-canal:         0% 🔨
Negociation auto:              0% 🔨
Vigilance:                     0% 🔨
Tracking IA:                   0% 🔨
─────────────────────────────────────
Global:                       40% (Phase 1 complete)
```

---

## LIENS UTILES

### Documentation Externe

- [Mongoose](https://mongoosejs.com/docs/)
- [Express.js](https://expressjs.com/)
- [Socket.io](https://socket.io/docs/v4/)
- [AWS SDK](https://docs.aws.amazon.com/sdk-for-javascript/)
- [SendGrid API](https://docs.sendgrid.com/)

### Services SYMPHONI.A

- [RAPPORT_FINAL_APIS_SYMPHONIA.md](./RAPPORT_FINAL_APIS_SYMPHONIA.md)
- [ARCHITECTURE.md](../rt-frontend-apps/ARCHITECTURE.md)
- [README.md](./README.md)

---

## CONTACT & SUPPORT

**Equipe:** SYMPHONI.A Development Team
**Email:** tech@symphonia.com
**Documentation:** https://docs.symphonia.com

---

**Index maintenu par:** Equipe Dev SYMPHONI.A
**Derniere mise a jour:** 27 Novembre 2025
**Version:** 1.0.0
