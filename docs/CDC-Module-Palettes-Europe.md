# Cahier des Charges - Module Economie Circulaire Palettes Europe

## SYMPHONI.A - RT Technologie
**Version:** 1.0
**Date:** 26 Decembre 2025
**Statut:** A valider

---

## 1. CONTEXTE ET OBJECTIFS

### 1.1 Contexte
Le module Economie Circulaire Palettes Europe vise a digitaliser et automatiser la gestion des flux de palettes entre les differents acteurs de la supply chain : industriels, transporteurs et logisticiens.

### 1.2 Problematique actuelle
- Suivi manuel des palettes (papier, Excel)
- Litiges frequents sur les quantites
- Dettes/credits difficiles a reconcilier
- Pas de tracabilite en temps reel
- Perte financiere estimee a 15-20% du parc palettes

### 1.3 Objectifs
1. **Digitaliser** les echanges de palettes via des cheques-palette numeriques
2. **Tracer** chaque mouvement avec geolocalisation et horodatage certifie
3. **Automatiser** le matching entre transporteurs et sites de restitution
4. **Securiser** les transactions avec signatures cryptographiques Ed25519
5. **Reduire** les litiges de 80% grace aux preuves numeriques

---

## 2. PERIMETRE FONCTIONNEL

### 2.1 Acteurs du systeme

| Acteur | Role | Fonctionnalites principales |
|--------|------|----------------------------|
| **Industriel** | Donneur d'ordre | Dashboard, demandes recuperation/restitution, validation litiges |
| **Transporteur** | Executant | Emission cheques, depot palettes, matching IA, gestion dettes |
| **Logisticien** | Receptionnaire | Reception cheques, gestion sites, quotas, resolution litiges |
| **Admin** | Superviseur | Configuration, rapports globaux, mediation |

### 2.2 Modules fonctionnels

#### Module 1: Cheques-Palette Numeriques
- Generation de cheques avec QR code unique
- Types de palettes: EURO_EPAL, EURO_EPAL_2, DEMI_PALETTE, PALETTE_PERDUE
- Cycle de vie: EMIS → EN_TRANSIT → DEPOSE → RECU (ou LITIGE)
- Signature electronique Ed25519 a chaque etape
- Preuves photographiques georeferncees

#### Module 2: Grand Livre (Ledger)
- Solde en temps reel par type de palette
- Historique complet des mouvements
- Credits (receptions) et debits (emissions)
- Corrections manuelles (admin)
- Export comptable CSV/PDF

#### Module 3: Sites de Restitution
- Creation et gestion des sites
- Quotas journaliers/hebdomadaires
- Horaires d'ouverture
- Geofencing (rayon de validation)
- Priorites (interne, reseau, public)

#### Module 4: Matching IA
- Recherche des meilleurs sites de restitution
- Criteres: distance, quotas, horaires, historique
- Score de matching multicritere
- Top 3 suggestions avec justification

#### Module 5: Workflow Litiges
- Types: quantite_incorrecte, palettes_abimees, non_conformite, non_reception
- Preuves: photos, documents, commentaires
- Proposition de resolution
- Validation bilaterale
- Escalade si desaccord
- SLA: 48h pour resolution

#### Module 6: Notifications & Webhooks
- Evenements: cheque.emis, cheque.depose, cheque.recu, litige.ouvert, etc.
- Webhooks configurables par entreprise
- Retry automatique (3 tentatives)
- Historique des notifications

---

## 3. SPECIFICATIONS TECHNIQUES

### 3.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  web-industry   │ web-transporter │     web-logistician         │
│   (Industriel)  │  (Transporteur) │      (Logisticien)          │
└────────┬────────┴────────┬────────┴────────────┬────────────────┘
         │                 │                      │
         └─────────────────┼──────────────────────┘
                           │ HTTPS
                           ▼
              ┌────────────────────────┐
              │      CloudFront        │
              │  d2o4ng8nutcmou.cf.net │
              └───────────┬────────────┘
                          │
                          ▼
         ┌────────────────────────────────────┐
         │     palettes-circular-api          │
         │   (Elastic Beanstalk eu-central-1) │
         │                                    │
         │  - Express.js + Node.js 18         │
         │  - MongoDB Atlas                   │
         │  - JWT Authentication              │
         │  - Ed25519 Signatures              │
         └────────────────┬───────────────────┘
                          │
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │ MongoDB  │   │  Redis   │   │   S3     │
    │  Atlas   │   │ (cache)  │   │ (photos) │
    └──────────┘   └──────────┘   └──────────┘
```

### 3.2 Stack technique

| Composant | Technologie | Version |
|-----------|-------------|---------|
| Backend API | Node.js + Express | 18.x |
| Base de donnees | MongoDB Atlas | 7.x |
| Cache | Redis | 7.x |
| Authentification | JWT | - |
| Cryptographie | TweetNaCl (Ed25519) | 1.x |
| QR Codes | qrcode | 1.5.x |
| Geolocalisation | geolib | 3.x |
| Images | sharp | 0.33.x |
| Frontend | Next.js + React | 14.x |
| UI Components | Tailwind CSS | 3.x |
| Hebergement | AWS Elastic Beanstalk | - |
| CDN | AWS CloudFront | - |

### 3.3 Collections MongoDB

```javascript
// PalletCompany - Entreprises du reseau
{
  companyId: "COMP-XXXXXXXX",
  name: "Transport Express Lyon",
  type: "transporteur|industriel|logisticien",
  siret: "12345678901234",
  address: { street, city, postalCode, country, coordinates },
  contact: { email, phone, contactName },
  subscription: { active, plan, startDate, endDate, pricePerMonth },
  publicKey: "base64...", // Cle publique Ed25519
  createdAt, updatedAt
}

// PalletSite - Sites de restitution
{
  siteId: "SITE-XXXXXXXX",
  companyId: "COMP-XXXXXXXX",
  name: "Entrepot Lyon Sud",
  type: "entrepot|usine|plateforme|quai",
  address: { street, city, postalCode, country, coordinates },
  quota: { dailyMax, currentDaily, lastResetDate },
  openingHours: { monday: { open, close, available }, ... },
  priority: "internal|network|public",
  acceptsExternalPalettes: true,
  preferredZones: ["69", "38"],
  active: true
}

// PalletCheque - Cheques-palette
{
  chequeId: "CHQ-XXXXXXXXXXXX",
  qrCode: "data:image/png;base64,...",
  orderId: "ORD-123456",
  palletType: "EURO_EPAL",
  quantity: 33,
  transporterId: "COMP-TRANS001",
  transporterName: "Transport Express",
  vehiclePlate: "AB-123-CD",
  driverName: "Jean Dupont",
  destinationSiteId: "SITE-LOG001",
  destinationSiteName: "Entrepot Lyon",
  originCoordinates: { latitude, longitude },
  destinationCoordinates: { latitude, longitude },
  status: "EMIS|EN_TRANSIT|DEPOSE|RECU|LITIGE|ANNULE",
  timestamps: { emittedAt, depositedAt, receivedAt, disputedAt },
  signatures: {
    emitter: { signature, publicKey, timestamp },
    depositor: { signature, publicKey, timestamp, geolocation },
    receiver: { signature, publicKey, timestamp, geolocation }
  },
  photos: [{ type, base64, timestamp, geolocation }],
  matchingInfo: { matchedBySuggestion, suggestionRank, distanceKm, matchingScore },
  auditTrail: [{ action, performedBy, timestamp, details }]
}

// PalletLedger - Grand livre
{
  ledgerId: "LED-XXXXXXXX",
  companyId: "COMP-XXXXXXXX",
  balances: {
    EURO_EPAL: 150,      // Positif = credit
    EURO_EPAL_2: -20,    // Negatif = dette
    DEMI_PALETTE: 0,
    PALETTE_PERDUE: 5
  },
  adjustments: [{ date, type, palletType, quantity, reason, chequeId, performedBy }],
  lastUpdated
}

// PalletDispute - Litiges
{
  disputeId: "DISP-XXXXXXXX",
  chequeId: "CHQ-XXXXXXXXXXXX",
  initiatorId, initiatorType,
  respondentId, respondentType,
  type: "quantite_incorrecte|palettes_abimees|non_conformite|non_reception|autre",
  description: "...",
  claimedQuantity: 33,
  actualQuantity: 30,
  evidence: [{ type, url, base64, description, uploadedBy, timestamp, geolocation }],
  status: "ouvert|en_cours|proposition_emise|valide_initiateur|valide_respondent|resolu|escalade|ferme",
  resolution: { type, adjustedQuantity, description, validatedByInitiator, validatedByRespondent, validatedAt, resolvedBy },
  timeline: [{ action, performedBy, timestamp, details }],
  slaDeadline,
  priority: "low|medium|high|critical"
}
```

### 3.4 API Endpoints

#### Authentification
| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | /api/auth/login | Connexion |
| POST | /api/auth/refresh | Rafraichir token |

#### Companies
| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | /api/palettes/companies | Creer entreprise |
| GET | /api/palettes/companies/:id | Details entreprise |
| POST | /api/palettes/companies/:id/subscribe | Activer abonnement |

#### Sites
| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | /api/palettes/sites | Creer site |
| GET | /api/palettes/sites | Lister sites |
| GET | /api/palettes/sites/:id | Details site |
| PUT | /api/palettes/sites/:id/quota | Modifier quotas |

#### Matching IA
| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | /api/palettes/matching/find-sites | Trouver meilleurs sites |

#### Cheques-Palette
| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | /api/palettes/cheques | Emettre cheque |
| GET | /api/palettes/cheques | Lister cheques |
| GET | /api/palettes/cheques/:id | Details cheque |
| POST | /api/palettes/cheques/:id/deposit | Deposer cheque |
| POST | /api/palettes/cheques/:id/receive | Valider reception |
| POST | /api/palettes/cheques/scan | Scanner QR code |

#### Ledger
| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | /api/palettes/ledger/:companyId | Solde entreprise |
| GET | /api/palettes/ledger/:companyId/history | Historique mouvements |
| POST | /api/palettes/ledger/:companyId/adjust | Correction manuelle (admin) |

#### Litiges
| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | /api/palettes/disputes | Ouvrir litige |
| GET | /api/palettes/disputes | Lister litiges |
| GET | /api/palettes/disputes/:id | Details litige |
| POST | /api/palettes/disputes/:id/evidence | Ajouter preuve |
| POST | /api/palettes/disputes/:id/propose | Proposer resolution |
| POST | /api/palettes/disputes/:id/validate | Valider resolution |

#### Statistiques & Export
| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | /api/palettes/stats | Statistiques globales |
| GET | /api/palettes/export/:type | Export CSV/JSON |

#### Webhooks
| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | /api/palettes/webhooks | Creer webhook |
| GET | /api/palettes/webhooks | Lister webhooks |
| PUT | /api/palettes/webhooks/:id | Modifier webhook |
| DELETE | /api/palettes/webhooks/:id | Supprimer webhook |
| POST | /api/palettes/webhooks/:id/test | Tester webhook |

---

## 4. INTERFACES UTILISATEUR

### 4.1 Portail Industriel (web-industry)

#### Dashboard
- Balance totale (credit/dette net)
- Cheques ce mois
- Litiges actifs
- Demandes en cours
- Graphique soldes par type de palette

#### Onglet Demandes
- Formulaire nouvelle demande (recuperation/restitution)
- Liste des demandes avec statut
- Actions: annuler, modifier

#### Onglet Grand Livre
- Tableau des soldes par type
- Historique des mouvements (tableau paginé)
- Filtres: date, type, palette

#### Onglet Litiges
- Liste des litiges en cours
- Formulaire ouverture litige
- Actions: accepter/refuser resolution

#### Onglet Rapports
- Export PDF/Excel/CSV
- Filtres temporels
- Statistiques agregees

#### Onglet Scanner
- Scanner QR code camera
- Affichage details cheque scanne

#### Onglet Carte
- Carte interactive des sites
- Filtres par disponibilite

### 4.2 Portail Transporteur (web-transporter)

#### Dashboard
- Solde palettes (dettes)
- Cheques emis ce mois
- Suggestions sites proches

#### Onglet Emettre Cheque
- Formulaire emission
- Selection commande liee
- Selection site destination (ou matching IA)
- Generation QR code

#### Onglet Mes Cheques
- Liste cheques avec statuts
- Actions: deposer, voir details
- Export PDF/CSV

#### Onglet Matching IA
- Recherche sites par position GPS
- Parametres: rayon, quantite, type palette
- Resultats avec scores

#### Onglet Grand Livre
- Soldes et historique

#### Onglet Litiges
- Litiges ou je suis implique
- Reponse aux contestations

### 4.3 Portail Logisticien (web-logistician)

#### Dashboard
- Cheques en attente de reception
- Statistiques sites
- Quotas du jour

#### Onglet Reception
- Scanner QR code
- Saisie quantite recue
- Validation avec geolocation
- Detection automatique ecarts → litige

#### Onglet Mes Sites
- Liste des sites geres
- Creation nouveau site
- Modification quotas/horaires
- Activation/desactivation

#### Onglet Grand Livre
- Soldes et credits

#### Onglet Litiges
- Litiges sur mes sites
- Proposition resolution
- Ajout preuves

#### Onglet Statistiques
- KPIs par site
- Taux de litiges
- Volume par periode

---

## 5. REGLES METIER

### 5.1 Emission de cheque
- Transporteur doit avoir un compte actif
- Quantite > 0
- Site destination doit exister et etre actif
- Quota site suffisant
- Un cheque = une dette pour le transporteur

### 5.2 Depot de cheque
- Statut cheque = EMIS ou EN_TRANSIT
- Geolocation obligatoire (warning si > 1km du site)
- Photo optionnelle mais recommandee
- Signature electronique

### 5.3 Reception de cheque
- Statut cheque = DEPOSE
- Geolocation obligatoire (stricte: < 500m du site)
- Quantite recue saisie
- Si ecart quantite → litige automatique
- Reception = credit pour le logisticien

### 5.4 Litiges
- Ouverture par initiateur (receveur ou emetteur)
- SLA 48h pour premiere reponse
- Proposition de resolution (ajustement quantite)
- Validation bilaterale requise
- Si refus → escalade admin
- Resolution → ajustement ledger automatique

### 5.5 Quotas sites
- Reset automatique chaque jour a 00:00 (Europe/Paris)
- Alerte a 80% de capacite
- Blocage si quota atteint

---

## 6. SECURITE

### 6.1 Authentification
- JWT avec expiration 24h
- Refresh token 7 jours
- Rate limiting: 100 req/min par IP

### 6.2 Signatures Ed25519
- Chaque entreprise possede une paire de cles
- Signature des donnees critiques (emission, depot, reception)
- Verification possible par tous

### 6.3 Geofencing
- Validation GPS pour depot/reception
- Tolerance configurable par site
- Avertissements loggues dans audit trail

### 6.4 Donnees
- Chiffrement TLS en transit
- MongoDB Atlas avec chiffrement au repos
- Retention des logs: 2 ans
- RGPD: droit a l'oubli, export donnees

---

## 7. INTERCONNEXIONS

### 7.1 Modules internes SYMPHONI.A

| Module | Type | Description |
|--------|------|-------------|
| core-orders | Bidirectionnel | Lien commande ↔ cheque palette |
| billing-api | Sortant | Facturation des operations palettes |
| kpi-api | Sortant | Stats palettes dans KPIs transporteurs |
| authz-eb | Entrant | Authentification centralisee |
| notifications | Sortant | Emails sur evenements palettes |

### 7.2 Integrations externes (futures)
- Interpal / GS1 (standardisation codes palettes)
- ERP clients (SAP, Oracle, etc.)
- Bourses de palettes tierces

---

## 8. PLAN DE DEPLOIEMENT

### Phase 1: Correction urgente (J+1)
- [ ] Corriger CloudFront → pointer vers rt-palettes-circular-prod
- [ ] Tester connexion depuis les 3 frontends
- [ ] Valider health checks

### Phase 2: Donnees de demo (J+3)
- [ ] Creer 5 entreprises de test (2 transporteurs, 2 industriels, 1 logisticien)
- [ ] Creer 10 sites de restitution (Lyon, Paris, Marseille, etc.)
- [ ] Generer 50 cheques-palette de demonstration
- [ ] Simuler 5 litiges avec resolutions

### Phase 3: Tests integration (J+7)
- [ ] Tests API complets (Postman/Jest)
- [ ] Tests E2E frontends (Cypress)
- [ ] Tests de charge (100 req/s)
- [ ] Audit securite

### Phase 4: Documentation (J+10)
- [ ] Documentation API (Swagger/OpenAPI)
- [ ] Guide utilisateur par role
- [ ] Videos tutorielles

### Phase 5: Formation & Rollout (J+15)
- [ ] Formation equipe support
- [ ] Deploiement pilote (3 clients)
- [ ] Collecte feedback
- [ ] Ajustements

### Phase 6: Production (J+30)
- [ ] Deploiement general
- [ ] Monitoring 24/7
- [ ] Support niveau 2

---

## 9. METRIQUES DE SUCCES

| KPI | Objectif | Mesure |
|-----|----------|--------|
| Taux digitalisation | 90% | % cheques numeriques vs papier |
| Reduction litiges | -80% | Nb litiges / nb cheques |
| Temps resolution litige | < 48h | Moyenne jours ouverture→fermeture |
| Adoption utilisateurs | 85% | % utilisateurs actifs / inscrits |
| Satisfaction | > 4.5/5 | NPS enquetes |

---

## 10. BUDGET & TARIFICATION

### 10.1 Abonnement
- **199 EUR/mois** par entreprise
- Inclus: cheques illimites, support email
- Option premium: API webhooks, rapports avances

### 10.2 Couts infrastructure (estimes)
| Poste | Cout mensuel |
|-------|--------------|
| Elastic Beanstalk (2x t3.medium) | 80 EUR |
| MongoDB Atlas (M10) | 60 EUR |
| CloudFront | 20 EUR |
| S3 (photos) | 10 EUR |
| **Total** | **170 EUR** |

---

## 11. ANNEXES

### A. Glossaire
- **Cheque-palette**: Document numerique attestant un mouvement de palettes
- **Ledger**: Grand livre comptable des dettes/credits palettes
- **Geofencing**: Validation de position GPS dans un perimetre defini
- **Ed25519**: Algorithme de signature electronique

### B. Contacts
- Chef de projet: [A definir]
- Lead technique: [A definir]
- Support: support@symphonia-controltower.com

### C. Historique des versions
| Version | Date | Auteur | Modifications |
|---------|------|--------|---------------|
| 1.0 | 26/12/2025 | Claude Code | Creation initiale |

---

*Document genere automatiquement - RT Technologie SYMPHONI.A*
