# TODO - SYMPHONI.A

Liste des tâches à venir, organisées par priorité et timeline.

**Dernière mise à jour:** 26 novembre 2025

---

## 🔥 Priorité Haute (Court Terme - 1-2 mois)

### 1. Configuration Services Externes

#### TomTom Telematics API (Tracking Premium)
- [ ] Créer compte TomTom Telematics
- [ ] Obtenir API Key
- [ ] Configurer variable `TOMTOM_API_KEY` dans AWS EB
- [ ] Tester tracking GPS temps réel
- [ ] Documenter coût réel (4€/véhicule/mois)
- [ ] Valider avec 5 véhicules test

**Estimation:** 1 semaine
**Impact:** Débloquer l'offre Premium 4€/véhicule/mois
**Responsable:** DevOps + Backend Lead

---

#### AWS Textract (OCR)
- [ ] Créer utilisateur IAM AWS
- [ ] Configurer permissions Textract
- [ ] Obtenir credentials (Access Key + Secret)
- [ ] Configurer variables dans AWS EB:
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `AWS_REGION=eu-central-1`
- [ ] Tester extraction sur 10 documents POD réels
- [ ] Valider coût mensuel (58€ pour 10k pages)
- [ ] Configurer alertes dépassement budget

**Estimation:** 3 jours
**Impact:** OCR automatique des documents
**Responsable:** DevOps
**Doc:** [CONFIGURATION_OCR_AWS_GOOGLE.md](CONFIGURATION_OCR_AWS_GOOGLE.md)

---

#### Google Vision API (OCR Fallback - Optionnel)
- [ ] Créer projet Google Cloud
- [ ] Activer Vision API
- [ ] Créer service account
- [ ] Télécharger JSON credentials
- [ ] Configurer variables dans AWS EB
- [ ] Tester fallback AWS → Google

**Estimation:** 2 jours
**Impact:** Redondance OCR
**Responsable:** DevOps

---

### 2. Tests & Qualité

#### Tests End-to-End
- [ ] Créer suite tests E2E avec Playwright/Cypress
- [ ] Tester workflow complet:
  1. Créer commande
  2. Assigner transporteur
  3. Démarrer tracking
  4. Upload documents
  5. Extraction OCR
  6. Clôture commande
- [ ] Automatiser tests dans CI/CD
- [ ] Target: 80%+ coverage

**Estimation:** 2 semaines
**Impact:** Qualité et fiabilité
**Responsable:** QA Engineer + Backend Lead

---

#### Tests de Charge
- [ ] Tester API avec 100+ requêtes/s
- [ ] Tester MongoDB avec 10k+ commandes
- [ ] Tester WebSocket avec 500+ connexions simultanées
- [ ] Identifier bottlenecks
- [ ] Optimiser queries MongoDB (indexes)
- [ ] Configurer auto-scaling AWS EB

**Estimation:** 1 semaine
**Impact:** Performance production
**Responsable:** DevOps + Backend Lead

---

### 3. Monitoring & Alertes

#### CloudWatch Alertes
- [ ] Configurer alertes:
  - CPU > 80% pendant 5 min
  - Memory > 90%
  - Erreurs API > 5%
  - Response time > 1s
  - MongoDB connexion perdue
- [ ] Configurer SNS pour notifications email
- [ ] Tester alertes manuellement

**Estimation:** 2 jours
**Impact:** Détection proactive problèmes
**Responsable:** DevOps

---

#### Dashboard Monitoring
- [ ] Intégrer Datadog ou New Relic
- [ ] Configurer métriques business:
  - Nombre commandes/jour
  - Temps moyen de livraison
  - Taux de ponctualité
  - Score moyen transporteurs
- [ ] Créer dashboard temps réel
- [ ] Configurer alertes business

**Estimation:** 3 jours
**Impact:** Visibilité métier
**Responsable:** DevOps + Product Manager

---

### 4. Sécurité

#### Rate Limiting
- [ ] Implémenter rate limiting avec `express-rate-limit`
- [ ] Configuration par endpoint:
  - 100 req/min pour lecture
  - 20 req/min pour écriture
  - 5 req/min pour upload documents
- [ ] Tester avec tests de charge
- [ ] Documenter limites dans API docs

**Estimation:** 2 jours
**Impact:** Protection contre abus
**Responsable:** Backend Lead

---

#### CORS Configuration
- [ ] Configurer CORS pour production
- [ ] Whitelist domaines frontend autorisés
- [ ] Bloquer autres origines
- [ ] Tester depuis frontend Next.js

**Estimation:** 1 jour
**Impact:** Sécurité API
**Responsable:** Backend Lead

---

#### Webhook Signatures
- [ ] Implémenter signature HMAC SHA-256 pour webhooks
- [ ] Générer secrets webhook par client
- [ ] Documenter vérification signature côté client
- [ ] Ajouter dans [DOCUMENTATION_WEBHOOKS_EVENTS.md](DOCUMENTATION_WEBHOOKS_EVENTS.md)

**Estimation:** 3 jours
**Impact:** Sécurité webhooks
**Responsable:** Backend Lead

---

## 📱 Priorité Moyenne (Moyen Terme - 3-6 mois)

### 1. Application Mobile React Native (8 semaines)

**Objectif:** Tracking Smartphone 150€/mois

#### Phase 1: Setup & Authentification (2 semaines)
- [ ] Initialiser projet React Native (Expo ou bare)
- [ ] Configurer navigation (React Navigation)
- [ ] Implémenter authentification JWT
- [ ] Écrans: Login, Register, Forgot Password
- [ ] Intégration API authz-eb
- [ ] Tests iOS + Android

**Specs:** [TRACKING_SMARTPHONE_SPECS.md](services/subscriptions-contracts-eb/TRACKING_SMARTPHONE_SPECS.md)

---

#### Phase 2: GPS Tracking + Cartes (2 semaines)
- [ ] Intégrer React Native Maps
- [ ] Implémenter GPS background tracking (30s intervals)
- [ ] QR Code pairing transporteur/commande
- [ ] Affichage position temps réel sur carte
- [ ] Geofencing mobile (notifications)
- [ ] Tests batterie et consommation data

---

#### Phase 3: Documents + Photos (2 semaines)
- [ ] Appareil photo intégré
- [ ] Upload photos documents (BL, CMR, POD)
- [ ] Signature digitale sur écran
- [ ] OCR client-side (optionnel)
- [ ] Mode offline avec sync automatique
- [ ] Galerie documents uploadés

---

#### Phase 4: Tests & Stores (2 semaines)
- [ ] Tests E2E avec Detox
- [ ] Tests sur 10+ appareils réels
- [ ] Optimisations performance
- [ ] Soumission App Store (iOS)
- [ ] Soumission Play Store (Android)
- [ ] Beta testing avec 20 transporteurs

**Estimation totale:** 8 semaines (2 mois)
**Équipe:** 1 dev mobile full-time + 1 designer
**Impact:** Débloquer offre 150€/mois

---

### 2. Dashboard Web Temps Réel (10 semaines)

**Objectif:** Interface industriels pour suivi commandes

#### Phase 1: MVP (4 semaines)
- [ ] Setup Next.js 14 + TypeScript + Tailwind
- [ ] Authentification et routing
- [ ] Page Home avec KPIs basiques
- [ ] Liste commandes avec filtres
- [ ] Détail commande complète
- [ ] Intégration API avec [GUIDE_INTEGRATION_FRONTEND.md](GUIDE_INTEGRATION_FRONTEND.md)

---

#### Phase 2: Temps Réel (2 semaines)
- [ ] Setup serveur WebSocket (Socket.IO)
- [ ] Client WebSocket dans Next.js
- [ ] Carte Mapbox avec tracking GPS temps réel
- [ ] Notifications push navigateur
- [ ] Timeline événements live

---

#### Phase 3: Analytics (2 semaines)
- [ ] Charts avec Recharts
- [ ] KPIs de performance
- [ ] Rapports exportables (PDF, Excel)
- [ ] Filtres avancés et recherche
- [ ] Dashboard transporteurs

---

#### Phase 4: Mobile & Polish (2 semaines)
- [ ] Responsive design mobile
- [ ] PWA configuration
- [ ] Notifications push mobile
- [ ] Mode offline basique
- [ ] Tests utilisateurs
- [ ] Déploiement Vercel/AWS

**Estimation totale:** 10 semaines (2.5 mois)
**Équipe:** 1 dev frontend full-time + 1 designer + 1 dev backend
**Impact:** Interface clé pour clients
**Specs:** [DASHBOARD_MONITORING_SPECS.md](DASHBOARD_MONITORING_SPECS.md)

---

### 3. WebSocket Server Backend

- [ ] Implémenter serveur Socket.IO dans index.js
- [ ] Authentification JWT pour WebSocket
- [ ] Rooms par utilisateur/company/commande
- [ ] Broadcasting événements temps réel
- [ ] Tests de charge 500+ connexions
- [ ] Monitoring connexions actives
- [ ] Heartbeat ping/pong automatique
- [ ] Documentation complète

**Estimation:** 1 semaine
**Impact:** Temps réel dashboard
**Responsable:** Backend Lead
**Doc:** [DOCUMENTATION_WEBHOOKS_EVENTS.md](DOCUMENTATION_WEBHOOKS_EVENTS.md) (code prêt)

---

## 🚀 Priorité Basse (Long Terme - 6-12 mois)

### 1. Machine Learning & IA

#### Prédiction des Retards
- [ ] Collecter données historiques (6 mois minimum)
- [ ] Features: météo, traffic, transporteur, lane, jour/heure
- [ ] Entraîner modèle ML (scikit-learn ou TensorFlow)
- [ ] API prédiction: `POST /api/orders/:id/predict-delay`
- [ ] Intégrer dans dashboard (badge "Risque retard: 75%")
- [ ] Re-entraîner modèle mensuellement

**Estimation:** 6 semaines
**Équipe:** 1 data scientist + 1 backend dev

---

#### Recommandation Transporteurs
- [ ] Algorithme de scoring avancé
- [ ] Prise en compte historique + disponibilité + prix
- [ ] `GET /api/orders/:id/recommended-carriers`
- [ ] Machine learning pour optimisation matching

**Estimation:** 4 semaines

---

#### Chatbot Support Client
- [ ] Intégration ChatGPT API ou open-source (Rasa)
- [ ] Base de connaissances (FAQ, docs)
- [ ] Widget chat sur dashboard
- [ ] Escalade vers support humain

**Estimation:** 6 semaines

---

### 2. Intégrations ERP

#### SAP Integration
- [ ] Étude API SAP (RFC, OData, SOAP)
- [ ] Connecteur bidirectionnel
- [ ] Sync commandes SAP → SYMPHONI.A
- [ ] Sync statuts SYMPHONI.A → SAP
- [ ] Tests avec client pilote

**Estimation:** 8 semaines
**Impact:** Clients grands comptes

---

#### Sage Integration
- [ ] Connecteur Sage 100/X3
- [ ] Import/export commandes
- [ ] Sync factures

**Estimation:** 6 semaines

---

### 3. Expansion Internationale

#### Multi-langues
- [ ] Internationalisation (i18n)
- [ ] Traductions: FR, EN, DE, ES, IT
- [ ] Détection langue navigateur
- [ ] Sélecteur langue UI

**Estimation:** 3 semaines

---

#### Conformité Pays
- [ ] Étude réglementations transport par pays
- [ ] Adaptation workflows
- [ ] Support douanes (Brexit, Suisse)
- [ ] Multi-devises

**Estimation:** 8 semaines

---

### 4. API Publique & Marketplace

#### API Publique v1
- [ ] Documentation OpenAPI/Swagger
- [ ] Gestion API Keys
- [ ] Rate limiting par client
- [ ] Portail développeurs
- [ ] SDKs (Node.js, Python, PHP)

**Estimation:** 6 semaines

---

#### Marketplace Transporteurs
- [ ] Plateforme mise en relation
- [ ] Système enchères
- [ ] Notation et avis
- [ ] Paiement intégré (Stripe)

**Estimation:** 12 semaines

---

## 📝 Backlog (Sans Priority)

### Améliorations Backend
- [ ] Migration TypeScript (depuis JavaScript)
- [ ] Implémenter GraphQL API (alternative REST)
- [ ] Microservices architecture (découpage services)
- [ ] Redis caching pour performance
- [ ] Elasticsearch pour recherche full-text
- [ ] Queue jobs (Bull/BullMQ) pour tâches async
- [ ] Versioning API (v1, v2)

### Améliorations DevOps
- [ ] CI/CD complet (GitHub Actions)
- [ ] Tests automatisés dans pipeline
- [ ] Blue/Green deployments
- [ ] Feature flags (LaunchDarkly)
- [ ] Disaster recovery plan
- [ ] Backup automatique MongoDB (daily)

### Documentation
- [ ] Postman collection complète
- [ ] Tutoriels vidéo
- [ ] Documentation utilisateur final
- [ ] API reference interactive (Swagger UI)
- [ ] Blog technique

### Conformité & Legal
- [ ] CGU/CGV complètes
- [ ] Politique confidentialité (RGPD)
- [ ] Contrats type transporteurs
- [ ] Audit sécurité externe
- [ ] Certification ISO 27001 (optionnel)

---

## 🎯 OKRs (Objectives & Key Results)

### Q1 2026

**Objective 1:** Lancer les offres commerciales complètes

**Key Results:**
- [ ] 100% configuration services externes (TomTom, AWS Textract)
- [ ] App mobile React Native en production (iOS + Android)
- [ ] Dashboard web déployé avec 90%+ satisfaction utilisateurs
- [ ] 50 premiers clients payants actifs

---

**Objective 2:** Garantir qualité et fiabilité

**Key Results:**
- [ ] 80%+ test coverage backend
- [ ] 99.5%+ uptime API
- [ ] < 200ms response time moyenne
- [ ] 0 incidents critiques production

---

**Objective 3:** Optimiser les coûts

**Key Results:**
- [ ] Réduire coûts infra de 20% (optimisation AWS)
- [ ] Marge brute > 85% par client
- [ ] Auto-scaling configuré pour pics de charge

---

### Q2 2026

**Objective 1:** Expansion et croissance

**Key Results:**
- [ ] 200 clients actifs
- [ ] 50k€/mois de revenus récurrents
- [ ] 3 intégrations ERP en production
- [ ] Expansion 2 nouveaux pays européens

---

**Objective 2:** Innovation produit

**Key Results:**
- [ ] ML prédiction retards avec 80%+ précision
- [ ] API publique lancée avec 20 développeurs actifs
- [ ] 2 features majeures demandées par clients livrées

---

## 📊 Métriques de Succès

| Métrique | Actuel | Q1 2026 | Q2 2026 |
|----------|--------|---------|---------|
| **Clients Actifs** | 0 | 50 | 200 |
| **Revenus/mois** | 0€ | 8,300€ | 50,000€ |
| **Commandes/jour** | 0 | 50 | 500 |
| **Uptime API** | 99.5% | 99.9% | 99.95% |
| **Response Time** | 200ms | < 150ms | < 100ms |
| **Test Coverage** | 0% | 80% | 90% |
| **NPS Score** | N/A | 40+ | 50+ |

---

## 🏷️ Labels pour Issues GitHub

Créer ces labels dans le repo:

- `priority: high` (rouge) - Urgent, bloquant
- `priority: medium` (orange) - Important
- `priority: low` (jaune) - Nice to have
- `type: bug` (rouge foncé) - Correction
- `type: feature` (vert) - Nouvelle fonctionnalité
- `type: enhancement` (bleu) - Amélioration
- `type: documentation` (gris) - Documentation
- `type: technical-debt` (marron) - Dette technique
- `area: backend` - Backend Node.js
- `area: frontend` - Frontend Next.js
- `area: mobile` - App mobile React Native
- `area: devops` - Infrastructure AWS
- `area: security` - Sécurité
- `status: in-progress` - En cours
- `status: blocked` - Bloqué
- `status: ready-for-review` - Prêt pour review

---

## 📞 Contacts & Responsabilités

| Domaine | Responsable | Contact |
|---------|-------------|---------|
| **Backend Node.js** | [Backend Lead] | backend-lead@symphonia.com |
| **Frontend Next.js** | [Frontend Lead] | frontend-lead@symphonia.com |
| **Mobile React Native** | [Mobile Lead] | mobile-lead@symphonia.com |
| **DevOps AWS** | [DevOps Lead] | devops@symphonia.com |
| **Product Management** | [PM] | pm@symphonia.com |
| **QA** | [QA Lead] | qa@symphonia.com |

---

**Dernière mise à jour:** 26 novembre 2025

🤖 Generated with [Claude Code](https://claude.com/claude-code)
