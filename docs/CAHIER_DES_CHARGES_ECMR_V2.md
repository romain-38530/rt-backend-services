# CAHIER DES CHARGES - MODULE e-CMR v2.0

## SYMPHONI.A - RT Technologie
**Version :** 2.0
**Date :** 21 décembre 2025
**Statut :** En attente de validation
**Priorité globale :** HAUTE

---

## 1. CONTEXTE ET OBJECTIFS

### 1.1 Contexte
Le module e-CMR (lettre de voiture électronique) de SYMPHONI.A permet la gestion dématérialisée des CMR conformément au protocole e-CMR de la Convention CMR. L'audit réalisé a révélé des incohérences majeures entre les différents portails et des fonctionnalités manquantes.

### 1.2 Objectifs
- Harmoniser l'expérience e-CMR sur tous les portails (Industry, Transporter, Forwarder, Logistician, Recipient)
- Corriger les incohérences techniques (URLs API, nomenclature)
- Créer les interconnexions manquantes entre modules
- Assurer la conformité eIDAS pour la valeur probante des signatures
- Améliorer l'expérience utilisateur globale

### 1.3 Périmètre
| Portail | Inclus | Rôle e-CMR |
|---------|--------|------------|
| web-industry | ✅ | Expéditeur (Shipper) |
| web-transporter | ✅ | Transporteur (Carrier) |
| web-forwarder | ✅ | Commissionnaire |
| web-logistician | ✅ | Logisticien |
| web-recipient | ✅ | Destinataire (Consignee) |

---

## 2. CORRECTIONS CRITIQUES

### 2.1 Harmonisation URLs API PDF

**Problème identifié :**
```
web-industry    : /api/ecmr/{id}/pdf      (sans /v1/)
web-transporter : /api/v1/ecmr/{id}/pdf   (avec /v1/)
```

**Solution :**
Standardiser toutes les URLs sur `/api/v1/ecmr/{id}/pdf`

**Fichiers à modifier :**

| Fichier | Modification |
|---------|--------------|
| `apps/web-industry/lib/api.ts` | Ligne ~344 : changer `/api/ecmr/` en `/api/v1/ecmr/` |
| `apps/web-forwarder/lib/api.ts` | Vérifier et corriger si nécessaire |
| `apps/web-logistician/lib/api.ts` | Vérifier et corriger si nécessaire |
| `apps/web-recipient/lib/api.ts` | Vérifier et corriger si nécessaire |

**Critère de validation :**
- Téléchargement PDF fonctionnel sur tous les portails
- Test sur 3 e-CMR différents par portail

---

### 2.2 Unification de la nomenclature des parties

**Problème identifié :**
```
web-industry    : party: 'shipper' | 'carrier' | 'consignee'
web-transporter : type: 'driver' | 'sender' | 'recipient'
```

**Solution :**
Adopter la nomenclature CMR internationale : `shipper`, `carrier`, `consignee`

**Mapping de migration :**
| Ancien terme | Nouveau terme | Rôle |
|--------------|---------------|------|
| sender | shipper | Expéditeur |
| driver | carrier | Transporteur/Chauffeur |
| recipient | consignee | Destinataire |

**Fichiers à modifier :**

| Fichier | Modifications |
|---------|---------------|
| `apps/web-transporter/lib/api.ts` | Fonction `ecmrApi.sign()` |
| `services/ecmr-signature-api/index.js` | Accepter les deux nomenclatures (rétrocompatibilité) |

**Code backend à ajouter :**
```javascript
// Mapping pour rétrocompatibilité
const partyMapping = {
  'driver': 'carrier',
  'sender': 'shipper',
  'recipient': 'consignee'
};
const normalizedParty = partyMapping[party] || party;
```

---

### 2.3 Création lien Orders → e-CMR

**Problème identifié :**
Aucune création automatique d'e-CMR lors de la création d'une commande.

**Solution :**
Ajouter un champ `ecmrId` dans le schéma Order et créer automatiquement un e-CMR draft.

**Fichiers à modifier :**

| Fichier | Modifications |
|---------|---------------|
| `services/orders-api-v2/index.js` | Ajouter champ `ecmrId` au schéma, appel API e-CMR à la création |

**Schéma Order modifié :**
```javascript
const orderSchema = new mongoose.Schema({
  // ... champs existants ...

  // Lien e-CMR
  ecmr: {
    ecmrId: { type: String, index: true },
    status: { type: String, enum: ['none', 'draft', 'pending', 'completed'] },
    createdAt: Date,
    completedAt: Date
  }
});
```

**Logique de création automatique :**
```javascript
// À la création d'une commande
async function createOrder(orderData) {
  const order = await Order.create(orderData);

  // Créer e-CMR draft automatiquement
  if (orderData.createEcmr !== false) {
    const ecmrResponse = await axios.post(`${ECMR_API_URL}/api/v1/ecmr`, {
      orderId: order.orderId,
      shipper: {
        name: orderData.shipper?.name,
        address: orderData.pickup?.address
      },
      consignee: {
        name: orderData.consignee?.name,
        address: orderData.delivery?.address
      },
      goods: {
        description: orderData.goods?.description,
        weight: orderData.goods?.weight,
        packages: orderData.goods?.packages
      },
      pickup: orderData.pickup,
      delivery: orderData.delivery
    });

    order.ecmr = {
      ecmrId: ecmrResponse.data.ecmrId,
      status: 'draft',
      createdAt: new Date()
    };
    await order.save();
  }

  return order;
}
```

---

## 3. REFONTE DES PORTAILS SECONDAIRES

### 3.1 Page e-CMR web-transporter (Priorité HAUTE)

**État actuel :** 160 lignes, affichage liste simple sans actions

**Fonctionnalités à implémenter :**

| Fonctionnalité | Priorité | Description |
|----------------|----------|-------------|
| Canvas signature | HAUTE | Identique à web-industry |
| Modal détails | HAUTE | Affichage complet des informations |
| Filtres | MOYENNE | Tous / En attente / Signés |
| Téléchargement PDF | HAUTE | Bouton par e-CMR |
| Réservations | HAUTE | Ajout de réserves avec photos |
| Géolocalisation | MOYENNE | Capture position GPS à la signature |

**Structure de la page :**
```
┌─────────────────────────────────────────────────┐
│ Header : Logo + "e-CMR Digital" + Badge Portail │
├─────────────────────────────────────────────────┤
│ Filtres : [Tous] [En attente] [Signés]          │
├─────────────────────────────────────────────────┤
│ Liste e-CMR :                                   │
│ ┌─────────────────────────────────────────────┐ │
│ │ CMR-2025-001 | Transport A | En attente    │ │
│ │ [Voir] [Signer] [PDF]                       │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │ CMR-2025-002 | Transport B | Signé         │ │
│ │ [Voir] [PDF]                                │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘

Modal Signature :
┌─────────────────────────────────────────────────┐
│ Signer l'e-CMR : CMR-2025-001                   │
├─────────────────────────────────────────────────┤
│ Réserves (optionnel) :                          │
│ [ ] Colis endommagé                             │
│ [ ] Manquant                                    │
│ [ ] Autre : _______________                     │
│ [+ Ajouter photo]                               │
├─────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐ │
│ │                                             │ │
│ │         Zone de signature canvas            │ │
│ │                                             │ │
│ └─────────────────────────────────────────────┘ │
│ [Effacer]                                       │
├─────────────────────────────────────────────────┤
│ [Annuler]              [Valider et signer]      │
└─────────────────────────────────────────────────┘
```

**Estimation :** ~800-1000 lignes de code

---

### 3.2 Page e-CMR web-forwarder

**Fonctionnalités spécifiques commissionnaire :**
- Vue consolidée de tous les e-CMR (multi-transporteurs)
- Pas de signature directe (rôle coordinateur)
- Export batch PDF
- Tableau de bord statistiques

---

### 3.3 Page e-CMR web-logistician

**Fonctionnalités spécifiques logisticien :**
- Signature en tant que représentant expéditeur
- Gestion des réservations à réception
- Validation des marchandises

---

### 3.4 Page e-CMR web-recipient

**Fonctionnalités spécifiques destinataire :**
- Signature finale (consignee)
- Déclaration de réserves obligatoire si dommages
- Confirmation de réception

---

## 4. AMÉLIORATIONS BACKEND

### 4.1 Webhook notifications temps réel

**Objectif :** Notifier les parties concernées lors des événements e-CMR

**Événements à notifier :**
| Événement | Destinataires | Canal |
|-----------|---------------|-------|
| e-CMR créé | Shipper, Carrier | Email, WebSocket |
| Signature shipper | Carrier | Email, SMS, WebSocket |
| Signature carrier | Consignee | Email, SMS, WebSocket |
| Signature consignee | All parties | Email, WebSocket |
| Réserve ajoutée | All parties | Email, WebSocket |
| Litige ouvert | All parties | Email |

**Intégration WebSocket :**
```javascript
// À ajouter dans ecmr-signature-api/index.js
const io = require('socket.io')(server);

io.on('connection', (socket) => {
  socket.on('subscribe-ecmr', (ecmrId) => {
    socket.join(`ecmr-${ecmrId}`);
  });
});

// Lors d'une signature
async function emitSignatureEvent(ecmrId, party, data) {
  io.to(`ecmr-${ecmrId}`).emit('signature-added', {
    ecmrId,
    party,
    timestamp: new Date(),
    ...data
  });
}
```

---

### 4.2 Conformité eIDAS niveau avancé

**Exigences :**
| Critère | État actuel | Action requise |
|---------|-------------|----------------|
| Identification unique du signataire | ⚠️ Partiel | Ajouter vérification email/téléphone |
| Lien exclusif avec signataire | ✅ OK | Hash SHA-256 en place |
| Contrôle exclusif du signataire | ⚠️ Partiel | Ajouter OTP/2FA |
| Détection modification ultérieure | ✅ OK | Hash document en place |
| Horodatage qualifié | ❌ Manquant | Intégrer TSA (Time Stamping Authority) |

**Intégration TSA :**
```javascript
const { createTimestamp } = require('rfc3161-client');

async function addQualifiedTimestamp(documentHash) {
  const tsaUrl = process.env.TSA_URL || 'https://freetsa.org/tsr';
  const timestamp = await createTimestamp(documentHash, tsaUrl);
  return timestamp;
}
```

---

### 4.3 Archivage légal 10 ans

**Politique de rétention :**
```javascript
// MongoDB TTL index - NE PAS APPLIQUER sur collection ecmr
// Les e-CMR doivent être conservés 10 ans minimum

// Script de vérification archivage
const archiveCheck = {
  collection: 'ecmr',
  retentionYears: 10,
  archiveStorage: 'S3 Glacier Deep Archive',
  complianceCheck: 'quarterly'
};
```

**Architecture archivage :**
```
┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐
│  MongoDB    │ -> │  S3 Standard│ -> │ S3 Glacier Deep     │
│  (actif)    │    │  (1 an)     │    │ Archive (10 ans)    │
└─────────────┘    └─────────────┘    └─────────────────────┘
```

---

## 5. INTERCONNEXIONS MODULES

### 5.1 e-CMR ↔ Billing

**État actuel :** Billing vérifie présence e-CMR (`docs.ecmr.present`)

**Améliorations :**
- Bloquer facturation si e-CMR incomplet
- Ajouter lien direct vers e-CMR dans facture
- Inclure PDF e-CMR dans export comptable

**Code à ajouter dans billing-api :**
```javascript
// Vérification avant validation facture
async function validateInvoiceDocuments(invoiceId) {
  const invoice = await Invoice.findById(invoiceId);
  const orders = await Order.find({ _id: { $in: invoice.orderIds } });

  const missingEcmr = orders.filter(o =>
    !o.ecmr?.ecmrId || o.ecmr?.status !== 'completed'
  );

  if (missingEcmr.length > 0) {
    return {
      valid: false,
      reason: 'ECMR_INCOMPLETE',
      orders: missingEcmr.map(o => o.orderId)
    };
  }

  return { valid: true };
}
```

---

### 5.2 e-CMR ↔ Tracking

**Objectif :** Mettre à jour le statut tracking lors des signatures e-CMR

**Événements de synchronisation :**
| Signature e-CMR | Statut Tracking |
|-----------------|-----------------|
| Shipper signé | `picked_up` |
| Carrier signé | `in_transit` |
| Consignee signé | `delivered` |

**Webhook tracking :**
```javascript
// Dans ecmr-signature-api après signature
async function syncWithTracking(ecmrId, party) {
  const ecmr = await ECMR.findById(ecmrId);

  const statusMap = {
    'shipper': 'picked_up',
    'carrier': 'in_transit',
    'consignee': 'delivered'
  };

  await axios.post(`${TRACKING_API}/api/v1/tracking/event`, {
    orderId: ecmr.orderId,
    event: statusMap[party],
    timestamp: new Date(),
    source: 'ecmr',
    ecmrId: ecmr.ecmrId
  });
}
```

---

### 5.3 e-CMR ↔ Documents

**Objectif :** Stocker les PDF e-CMR dans le module Documents

**Flux :**
```
Signature complète → Génération PDF → Upload Documents API → Lien dans e-CMR
```

---

### 5.4 e-CMR ↔ Planning (Borne Chauffeur)

**Objectif :** Permettre signature e-CMR depuis la borne chauffeur

**Flux check-in :**
```
1. Chauffeur arrive sur site
2. Check-in via borne/app
3. Affichage e-CMR à signer
4. Signature sur tablette/mobile
5. Validation et départ
```

---

## 6. TESTS ET VALIDATION

### 6.1 Tests unitaires

| Module | Fichier test | Couverture cible |
|--------|--------------|------------------|
| ecmr-signature-api | `tests/ecmr.test.js` | 80% |
| Orders → e-CMR | `tests/orders-ecmr.test.js` | 90% |
| Signature workflow | `tests/signature-flow.test.js` | 95% |

### 6.2 Tests d'intégration

| Scénario | Portails impliqués | Critère de succès |
|----------|-------------------|-------------------|
| Création commande + e-CMR | Industry | e-CMR draft créé automatiquement |
| Workflow 3 signatures | Industry → Transporter → Recipient | Statut completed |
| PDF multi-portails | Tous | Téléchargement OK sur tous |
| Réserves avec photos | Transporter | Photo uploadée et visible |

### 6.3 Tests de charge

| Métrique | Objectif |
|----------|----------|
| Signatures simultanées | 100/minute |
| Génération PDF | < 3 secondes |
| Liste e-CMR (1000 items) | < 500ms |

---

## 7. PLANNING INDICATIF

### Phase 1 : Corrections critiques
- Harmonisation URLs API
- Unification nomenclature
- Tests de non-régression

### Phase 2 : Lien Orders ↔ e-CMR
- Modification schéma Orders
- Création automatique e-CMR
- Tests intégration

### Phase 3 : Refonte portails
- web-transporter complet
- web-forwarder
- web-logistician
- web-recipient

### Phase 4 : Interconnexions
- Billing ↔ e-CMR
- Tracking ↔ e-CMR
- Planning ↔ e-CMR

### Phase 5 : Conformité et archivage
- eIDAS niveau avancé
- Horodatage qualifié
- Archivage S3 Glacier

---

## 8. LIVRABLES

| Livrable | Format | Destinataire |
|----------|--------|--------------|
| Code source modifié | Git branch `feature/ecmr-v2` | Dev team |
| Documentation API | OpenAPI 3.0 | Dev team |
| Guide utilisateur | PDF/Web | Utilisateurs finaux |
| Rapport de tests | Markdown | QA team |
| Changelog | CHANGELOG.md | Tous |

---

## 9. CRITÈRES D'ACCEPTATION

### Fonctionnels
- [ ] Signature fonctionnelle sur 5 portails
- [ ] PDF téléchargeable sur tous les portails
- [ ] e-CMR créé automatiquement avec commande
- [ ] Workflow 3 signatures complet
- [ ] Réserves avec photos fonctionnelles

### Techniques
- [ ] Aucune erreur console en production
- [ ] Temps de réponse API < 500ms (P95)
- [ ] Couverture tests > 80%
- [ ] 0 vulnérabilité critique (OWASP)

### Conformité
- [ ] Hash SHA-256 sur toutes les signatures
- [ ] Audit trail complet
- [ ] Horodatage sur chaque action
- [ ] Archivage 10 ans configuré

---

## 10. ANNEXES

### A. Schéma base de données e-CMR

```javascript
const ecmrSchema = {
  ecmrId: String,           // Unique, format: ECMR-YYYY-XXXXX
  orderId: String,          // Lien vers commande
  status: String,           // draft|pending_shipper|pending_carrier|in_transit|pending_consignee|completed|disputed|cancelled

  shipper: {
    name: String,
    address: String,
    signedAt: Date,
    signedBy: String,
    signatureImage: String, // Base64 PNG
    signatureHash: String,  // SHA-256
    signatureIp: String
  },

  carrier: {
    name: String,
    carrierId: String,
    driverName: String,
    vehiclePlate: String,
    signedAt: Date,
    signedBy: String,
    signatureImage: String,
    signatureHash: String
  },

  consignee: {
    name: String,
    address: String,
    signedAt: Date,
    signedBy: String,
    signatureImage: String,
    signatureHash: String
  },

  goods: {
    description: String,
    quantity: Number,
    weight: Number,
    volume: Number,
    packages: Number,
    dangerousGoods: Boolean
  },

  pickup: {
    address: String,
    scheduledDate: Date,
    actualDate: Date
  },

  delivery: {
    address: String,
    scheduledDate: Date,
    actualDate: Date
  },

  reservations: [{
    type: String,           // damage|missing|other
    description: String,
    createdBy: String,
    createdAt: Date,
    photos: [String]        // URLs S3
  }],

  compliance: {
    eidasCompliant: Boolean,
    documentHash: String,
    qualifiedTimestamp: String,
    auditTrail: [{
      action: String,
      actor: String,
      timestamp: Date,
      details: Object,
      ip: String
    }]
  }
};
```

### B. Endpoints API e-CMR v2

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/v1/ecmr` | Créer e-CMR |
| GET | `/api/v1/ecmr` | Lister e-CMR |
| GET | `/api/v1/ecmr/:id` | Détail e-CMR |
| PUT | `/api/v1/ecmr/:id` | Modifier e-CMR |
| POST | `/api/v1/ecmr/:id/sign` | Signer e-CMR |
| POST | `/api/v1/ecmr/:id/validate` | Valider signatures |
| GET | `/api/v1/ecmr/:id/pdf` | Télécharger PDF |
| GET | `/api/v1/ecmr/:id/history` | Historique/Audit |
| POST | `/api/v1/ecmr/:id/reservation` | Ajouter réserve |
| POST | `/api/v1/ecmr/:id/dispute` | Ouvrir litige |
| POST | `/api/v1/ecmr/:id/request-signature` | Demander signature |
| GET | `/api/v1/ecmr/stats` | Statistiques |
| GET | `/api/v1/ecmr/pending` | e-CMR en attente |

### C. Variables d'environnement

```bash
# e-CMR API
ECMR_API_URL=https://d28q05cx5hmg9q.cloudfront.net
ECMR_MONGODB_URI=mongodb+srv://...
ECMR_JWT_SECRET=xxx

# Intégrations
ORDERS_API_URL=https://dh9acecfz0wg0.cloudfront.net/api/v1
TRACKING_API_URL=https://d2mn43ccfvt3ub.cloudfront.net/api
BILLING_API_URL=https://d1ciol606nbfs0.cloudfront.net/api
DOCUMENTS_API_URL=https://d8987l284s9q4.cloudfront.net/api

# eIDAS
TSA_URL=https://freetsa.org/tsr
EIDAS_PROVIDER=yousign

# Archivage
S3_ARCHIVE_BUCKET=symphonia-ecmr-archive
S3_ARCHIVE_REGION=eu-west-3
```

---

**Document rédigé par :** Claude Code (Audit automatisé)
**Validé par :** _En attente de validation_
**Date de validation :** _À compléter_
