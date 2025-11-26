# Système de Référencement des Transporteurs - SYMPHONI.A

## 📋 Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture](#architecture)
3. [Niveaux de statut](#niveaux-de-statut)
4. [Modes de référencement](#modes-de-référencement)
5. [Système de vigilance](#système-de-vigilance)
6. [Système de scoring](#système-de-scoring)
7. [Chaîne d'affectation](#chaîne-daffectation)
8. [API Endpoints](#api-endpoints)
9. [Événements du cycle de vie](#événements-du-cycle-de-vie)
10. [Scripts d'administration](#scripts-dadministration)

---

## 🎯 Vue d'ensemble

Le système de référencement des transporteurs permet de gérer l'ensemble du cycle de vie des transporteurs dans SYMPHONI.A, de l'invitation initiale jusqu'au statut premium.

### Fonctionnalités principales

- ✅ Invitation et onboarding des transporteurs
- ✅ Gestion des documents de vigilance (Kbis, URSSAF, assurance, etc.)
- ✅ Vérification automatique des dates d'expiration
- ✅ Alertes automatiques (J-30, J-15, J-7)
- ✅ Blocage automatique en cas de documents expirés
- ✅ Gestion des grilles tarifaires
- ✅ Chaîne d'affectation pour l'attribution automatique
- ✅ Système de scoring dynamique
- ✅ Upgrade vers le réseau Premium

---

## 🏗️ Architecture

### Collections MongoDB

Le système utilise 5 collections principales :

#### 1. `carriers` - Transporteurs

```javascript
{
  _id: ObjectId,
  email: String (unique),
  companyName: String,
  siret: String (unique),
  vatNumber: String (unique),
  phone: String,
  address: String,
  status: 'guest' | 'referenced' | 'premium',  // Niveau 2, 1, 1+
  referenceMode: 'direct' | 'automatic' | 'premium',
  invitedBy: String,  // ID de l'industriel qui a invité
  invitedAt: Date,
  onboardedAt: Date,
  vigilanceStatus: 'compliant' | 'warning' | 'blocked',
  score: Number,
  isInDispatchChain: Boolean,
  isBlocked: Boolean,
  blockedReason: String,
  blockedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

#### 2. `carrier_documents` - Documents de vigilance

```javascript
{
  _id: ObjectId,
  carrierId: ObjectId,
  documentType: 'kbis' | 'urssaf' | 'insurance' | 'license' | 'rib' | 'id_card',
  fileName: String,
  fileUrl: String,
  uploadedAt: Date,
  verifiedAt: Date,
  verifiedBy: String,
  status: 'pending' | 'verified' | 'rejected' | 'expired',
  expiryDate: Date,
  ocrData: Object  // Données extraites par OCR
}
```

#### 3. `pricing_grids` - Grilles tarifaires

```javascript
{
  _id: ObjectId,
  carrierId: ObjectId,
  fileName: String,
  fileUrl: String,
  uploadedAt: Date,
  verifiedAt: Date,
  status: 'pending' | 'active' | 'rejected',
  routes: Array  // Détails des routes et tarifs
}
```

#### 4. `dispatch_chains` - Chaînes d'affectation

```javascript
{
  _id: ObjectId,
  industrialId: String (unique),
  carriers: [ObjectId],  // Liste ordonnée de transporteurs
  createdAt: Date,
  updatedAt: Date
}
```

#### 5. `carrier_events` - Historique des événements

```javascript
{
  _id: ObjectId,
  carrierId: ObjectId,
  eventType: String,  // carrier.invited, carrier.onboarded, etc.
  eventData: Object,
  triggeredBy: String,
  timestamp: Date
}
```

---

## 📊 Niveaux de statut

### Niveau 2 - Transporteur invité (Guest)

**Statut:** `guest`

- ❌ Accès limité à la plateforme
- ❌ Pas encore référencé
- ❌ Ne peut pas recevoir d'affectations
- ⏳ En attente de compléter son onboarding
- ⏳ Documents non fournis ou non vérifiés

**Transition vers Niveau 1:**
- Upload et vérification de tous les documents obligatoires :
  - Kbis
  - Attestation URSSAF
  - Assurance transport
  - Licence de transport

### Niveau 1 - Transporteur référencé (Referenced)

**Statut:** `referenced`

- ✅ Accès complet à la plateforme
- ✅ Peut recevoir des affectations
- ✅ Tous les documents vérifiés
- ✅ Peut uploader une grille tarifaire
- ✅ Peut être ajouté à une chaîne d'affectation
- 📊 Score dynamique calculé

**Transition vers Niveau 1+:**
- Score élevé
- Historique de performance
- Validation par l'équipe
- Accès au réseau Premium

### Niveau 1+ - Transporteur prioritaire (Premium)

**Statut:** `premium`

- 🌟 Accès prioritaire aux affectations
- 🌟 Tarifs négociés préférentiels
- 🌟 Support dédié
- 🌟 Visibilité accrue

---

## 🔄 Modes de référencement

### 1. Référencement Direct

**Mode:** `direct`

Un industriel invite directement un transporteur :
```http
POST /api/carriers/invite
{
  "email": "transport@example.com",
  "companyName": "Transport Express",
  "invitedBy": "industrial123",
  "referenceMode": "direct"
}
```

### 2. Référencement Automatique (Affret.IA)

**Mode:** `automatic`

Le système Affret.IA référence automatiquement un transporteur basé sur :
- Algorithme de matching
- Disponibilité
- Zone géographique
- Capacité

### 3. Référencement Premium

**Mode:** `premium`

Réservé aux transporteurs du réseau Premium :
- Validation manuelle
- Critères de qualité stricts
- Accès prioritaire

---

## 🚨 Système de vigilance

### Documents obligatoires

| Document | Type | Expiration | Alertes |
|----------|------|------------|---------|
| Kbis | `kbis` | Oui | J-30, J-15, J-7 |
| URSSAF | `urssaf` | Oui | J-30, J-15, J-7 |
| Assurance | `insurance` | Oui | J-30, J-15, J-7 |
| Licence transport | `license` | Oui | J-30, J-15, J-7 |
| RIB | `rib` | Non | - |
| Pièce d'identité | `id_card` | Oui | J-30, J-15, J-7 |

### Statuts de vigilance

#### `compliant` - Conforme ✅
- Tous les documents sont valides
- Aucune date d'expiration dans les 30 jours
- Transporteur actif

#### `warning` - Avertissement ⚠️
- Un ou plusieurs documents expirent dans les 30 jours
- Alertes envoyées automatiquement
- Transporteur toujours actif

#### `blocked` - Bloqué 🚫
- Un ou plusieurs documents expirés
- Transporteur bloqué automatiquement
- Ne peut plus recevoir d'affectations

### Cycle d'alertes

```
Document expire le 01/04/2025

┌─────────────────────────────────────────────────┐
│ J-30 (02/03/2025)                               │
│ └─> 📧 Email à l'administrateur du transporteur │
├─────────────────────────────────────────────────┤
│ J-15 (17/03/2025)                               │
│ └─> 📧 Email + 🔔 Push notification             │
├─────────────────────────────────────────────────┤
│ J-7 (25/03/2025)                                │
│ └─> 🔔 Push + 📱 SMS urgence                    │
├─────────────────────────────────────────────────┤
│ J-0 (01/04/2025)                                │
│ └─> 🚫 Blocage automatique                      │
└─────────────────────────────────────────────────┘
```

### CRON de vigilance

Exécution quotidienne recommandée :

```bash
# Exécution manuelle
node scripts/vigilance-cron.js

# Configuration cron (tous les jours à 6h00)
0 6 * * * cd /path/to/authz-eb && node scripts/vigilance-cron.js
```

Le script effectue automatiquement :
- ✅ Vérification des documents expirés
- ✅ Blocage automatique si nécessaire
- ✅ Envoi des alertes J-30, J-15, J-7
- ✅ Mise à jour des statuts de vigilance
- ✅ Recalcul des scores

---

## 📊 Système de scoring

### Calcul du score

Le score est calculé dynamiquement selon les critères suivants :

```javascript
Score = Base + Bonifications - Pénalités

Base:
  • +20 points par document vérifié (max 120)

Bonifications:
  • +50 points si dans la chaîne d'affectation
  • +30 points si grille tarifaire active
  • +1 point par jour depuis l'onboarding

Pénalités:
  • -100 points si bloqué
```

### Exemple de calcul

```
Transporteur XYZ:
  ✓ 6 documents vérifiés: 6 × 20 = 120 points
  ✓ Dans la chaîne d'affectation: +50 points
  ✓ Grille tarifaire active: +30 points
  ✓ Onboardé depuis 45 jours: +45 points
  ──────────────────────────────────────
  Score total: 245 points
```

### Recalcul automatique

Le score est recalculé automatiquement lors de :
- Upload d'un document
- Vérification d'un document
- Ajout/Retrait de la chaîne d'affectation
- Upload d'une grille tarifaire
- Blocage/Déblocage
- CRON quotidien

---

## 🔗 Chaîne d'affectation

La chaîne d'affectation définit l'ordre de priorité des transporteurs pour l'attribution automatique des missions.

### Création/Mise à jour

```http
POST /api/dispatch-chains
{
  "industrialId": "industrial123",
  "carrierIds": [
    "carrier_premium_1",
    "carrier_premium_2",
    "carrier_referenced_1",
    "carrier_referenced_2"
  ]
}
```

### Ordre de priorité

1. **Transporteurs Premium** (Niveau 1+)
   - Triés par score décroissant

2. **Transporteurs Référencés** (Niveau 1)
   - Triés par score décroissant

3. **Fallback vers Affret.IA**
   - Si aucun transporteur disponible

---

## 🔌 API Endpoints

### 1. Invitation de transporteur

```http
POST /api/carriers/invite

Body:
{
  "email": "transport@example.com",
  "companyName": "Transport Express",
  "siret": "12345678901234",
  "vatNumber": "FR12345678901",
  "phone": "+33123456789",
  "address": "123 Rue du Transport, 75001 Paris",
  "invitedBy": "industrial123",
  "referenceMode": "direct"
}

Response 201:
{
  "success": true,
  "message": "Transporteur invité avec succès",
  "carrierId": "673abc123...",
  "status": "guest"
}
```

### 2. Onboarding de transporteur

```http
POST /api/carriers/onboard

Body:
{
  "carrierId": "673abc123..."
}

Response 200:
{
  "success": true,
  "message": "Transporteur onboardé avec succès",
  "status": "referenced",
  "score": 120
}
```

### 3. Upload de document

```http
POST /api/carriers/:carrierId/documents

Body:
{
  "documentType": "kbis",
  "fileName": "kbis-2025.pdf",
  "fileUrl": "https://s3.../kbis-2025.pdf",
  "expiryDate": "2026-12-31"
}

Response 201:
{
  "success": true,
  "message": "Document uploadé avec succès",
  "documentId": "673xyz789...",
  "status": "pending"
}
```

### 4. Vérification de document

```http
PUT /api/carriers/:carrierId/documents/:documentId/verify

Body:
{
  "status": "verified",
  "verifiedBy": "admin@symphonia.com",
  "ocrData": {
    "companyName": "Transport Express",
    "siret": "12345678901234"
  }
}

Response 200:
{
  "success": true,
  "message": "Document vérifié",
  "vigilanceStatus": "compliant"
}
```

### 5. Upload de grille tarifaire

```http
POST /api/carriers/:carrierId/pricing-grids

Body:
{
  "fileName": "grille-2025.xlsx",
  "fileUrl": "https://s3.../grille-2025.xlsx",
  "routes": [
    {
      "origin": "Paris",
      "destination": "Lyon",
      "pricePerKm": 1.5
    }
  ]
}

Response 201:
{
  "success": true,
  "message": "Grille tarifaire uploadée",
  "gridId": "673grid456..."
}
```

### 6. Consultation d'un transporteur

```http
GET /api/carriers/:carrierId

Response 200:
{
  "success": true,
  "carrier": {
    "_id": "673abc123...",
    "email": "transport@example.com",
    "companyName": "Transport Express",
    "status": "referenced",
    "vigilanceStatus": "compliant",
    "score": 245,
    "isInDispatchChain": true,
    "isBlocked": false,
    "documents": [...],
    "pricingGrids": [...]
  }
}
```

### 7. Liste des transporteurs

```http
GET /api/carriers?status=referenced&vigilanceStatus=compliant

Response 200:
{
  "success": true,
  "carriers": [...],
  "count": 15
}
```

### 8. Calcul de score

```http
POST /api/carriers/:carrierId/calculate-score

Response 200:
{
  "success": true,
  "score": 245
}
```

### 9. Gestion de la chaîne d'affectation

```http
POST /api/dispatch-chains

Body:
{
  "industrialId": "industrial123",
  "carrierIds": ["carrier1", "carrier2", "carrier3"]
}

Response 200:
{
  "success": true,
  "message": "Chaîne d'affectation mise à jour"
}
```

---

## 📅 Événements du cycle de vie

Le système enregistre tous les événements importants dans la collection `carrier_events` :

### Types d'événements

| Événement | Code | Description |
|-----------|------|-------------|
| Invitation | `carrier.invited` | Transporteur invité par un industriel |
| Onboarding | `carrier.onboarded` | Passage de Niveau 2 à Niveau 1 |
| Vigilance vérifiée | `carrier.vigilance.verified` | Document vérifié |
| Grille uploadée | `carrier.grid.uploaded` | Grille tarifaire uploadée |
| Ajout dispatch | `carrier.set.in.dispatchchain` | Ajouté à une chaîne d'affectation |
| Blocage | `carrier.blocked` | Transporteur bloqué |
| Déblocage | `carrier.unblocked` | Transporteur débloqué |
| Score calculé | `carrier.scored` | Score recalculé |
| Upgrade Premium | `carrier.upgraded.premium` | Passage en Niveau 1+ |

### Exemple d'événement

```javascript
{
  "_id": ObjectId("..."),
  "carrierId": ObjectId("..."),
  "eventType": "carrier.onboarded",
  "eventData": {
    "status": "referenced",
    "score": 120
  },
  "triggeredBy": "SYSTEM",
  "timestamp": ISODate("2025-11-26T10:00:00Z")
}
```

---

## 🛠️ Scripts d'administration

### 1. Configuration des index MongoDB

```bash
node scripts/setup-carrier-indexes.js
```

Crée tous les index nécessaires pour les 5 collections du système.

### 2. CRON de vigilance quotidien

```bash
node scripts/vigilance-cron.js
```

À exécuter quotidiennement (recommandé : 6h00 du matin) :
- Vérifie les documents expirés
- Bloque automatiquement les transporteurs
- Envoie les alertes J-30, J-15, J-7
- Met à jour les statuts de vigilance
- Recalcule les scores

### Configuration cron suggérée

```bash
# Vigilance quotidienne à 6h00
0 6 * * * cd /opt/authz-eb && node scripts/vigilance-cron.js >> /var/log/vigilance-cron.log 2>&1

# Recalcul des scores toutes les 6 heures
0 */6 * * * cd /opt/authz-eb && node scripts/recalculate-scores.js >> /var/log/scores-cron.log 2>&1
```

---

## 📝 Notes de déploiement

### 1. Variables d'environnement

Aucune variable supplémentaire requise. Le système utilise la connexion MongoDB existante.

### 2. Fichiers à déployer

```
authz-eb/
├── index.js (modifié)
├── carriers.js (nouveau)
├── package.json
├── Procfile
└── scripts/
    ├── setup-carrier-indexes.js (nouveau)
    └── vigilance-cron.js (nouveau)
```

### 3. Migration

1. Déployer le nouveau code
2. Exécuter le script de création des index :
   ```bash
   node scripts/setup-carrier-indexes.js
   ```
3. Configurer le CRON de vigilance quotidien

### 4. Compatibilité

Le système est 100% compatible avec l'API existante. Tous les anciens endpoints fonctionnent normalement.

---

## 🎉 Résultat

Le système de référencement des transporteurs est maintenant complet et opérationnel !

**Version:** 3.0.0
**Date de déploiement:** 26 Novembre 2025
**Développé par:** Claude Code

---

## 📞 Support

Pour toute question ou problème :
- Consulter les logs de l'application
- Vérifier le statut de santé : `GET /health`
- Consulter les événements dans `carrier_events`
