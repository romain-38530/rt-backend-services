# État du Système de Signature Électronique

**Date:** 24 novembre 2025
**Version:** 1.0.0
**Services:** subscriptions-contracts-eb

---

## 📋 Vue d'Ensemble

Le système de signature électronique est **partiellement implémenté** avec les bases fonctionnelles pour les contrats généraux et les e-CMR.

---

## ✅ Ce qui est Implémenté

### 1. Infrastructure de Base

**Endpoint de Signature:**
```
POST /api/signatures/:id/sign
```

**Données Capturées:**
- ✅ `signatureData` - Image/données de la signature (base64)
- ✅ `ipAddress` - Adresse IP du signataire
- ✅ `geolocation` - Coordonnées GPS (latitude/longitude)
- ✅ `signedAt` - Timestamp de la signature
- ✅ `status` - Statut de la signature (PENDING/SIGNED/DECLINED)

### 2. Types de Contrats Supportés

```typescript
export type ContractType =
  | 'ECMR'       // ✅ e-CMR (Lettre de voiture électronique)
  | 'TRANSPORT'  // ✅ Contrat de transport général
  | 'SERVICE'    // ✅ Contrat de service
  | 'NDA'        // ✅ Accord de confidentialité
  | 'CUSTOM';    // ✅ Contrat personnalisé
```

### 3. Types de Signature

```typescript
export type SignatureType =
  | 'SIMPLE'     // ✅ Signature simple
  | 'ADVANCED'   // ⚠️ Signature avancée (non implémenté)
  | 'QUALIFIED'; // ⚠️ Signature qualifiée (non implémenté)
```

### 4. Workflow de Contrat

**Statuts:**
```typescript
export type ContractStatus =
  | 'DRAFT'                // ✅ Brouillon
  | 'PENDING_SIGNATURES'   // ✅ En attente de signatures
  | 'SIGNED'               // ✅ Signé
  | 'CANCELLED'            // ✅ Annulé
  | 'EXPIRED';             // ✅ Expiré
```

**Endpoints Disponibles:**
- ✅ `POST /api/contracts` - Créer un contrat
- ✅ `GET /api/contracts/:id` - Récupérer un contrat
- ✅ `POST /api/contracts/:id/send` - Envoyer pour signatures
- ✅ `POST /api/signatures/:id/sign` - Signer un document

### 5. Parties au Contrat

```typescript
export interface ContractParty {
  type: 'INDIVIDUAL' | 'COMPANY';
  name: string;
  email: string;
  role: string; // Ex: SENDER, CARRIER, RECIPIENT
  signatureRequired: boolean;
  signedAt?: string;
  signatureId?: string;
}
```

---

## ⚠️ Ce qui Manque pour e-CMR Complet

### 1. Conformité Réglementaire e-CMR

Pour être conforme au **Protocole e-CMR** (Convention CMR Article 4), il faut ajouter:

#### Données Obligatoires e-CMR
- ❌ Lieu et date de prise en charge
- ❌ Lieu et date de livraison
- ❌ Nom et adresse de l'expéditeur
- ❌ Nom et adresse du destinataire
- ❌ Nom et adresse du transporteur
- ❌ Nature et poids de la marchandise
- ❌ Nombre de colis
- ❌ Marques et numéros des colis
- ❌ Instructions spéciales pour le transport
- ❌ Réserves éventuelles

#### Signatures Requises e-CMR
- ⚠️ Signature de l'expéditeur (implémenté mais pas validé)
- ⚠️ Signature du transporteur (implémenté mais pas validé)
- ⚠️ Signature du destinataire (implémenté mais pas validé)

### 2. Signature Électronique Avancée/Qualifiée

Pour la conformité légale (eIDAS), il faut:

- ❌ **Certificat numérique** - Intégration d'un PSC (Prestataire de Service de Confiance)
- ❌ **Horodatage qualifié** - Timestamp certifié
- ❌ **Scellement** - Hash cryptographique du document
- ❌ **Vérification d'identité** - KYC (Know Your Customer)
- ❌ **Archivage légal** - Conservation pendant 10 ans minimum

**PSC Recommandés:**
- DocuSign
- Adobe Sign
- Yousign (France)
- Universign (France)
- Lex Community

### 3. Fonctionnalités e-CMR Spécifiques

#### Workflow e-CMR Complet
```
1. Création CMR par l'expéditeur
2. Signature expéditeur
3. Prise en charge par le transporteur
4. Signature transporteur (départ)
5. Transport avec suivi GPS
6. Livraison
7. Signature destinataire (réception)
8. Génération PDF archivable
9. Archivage légal (10 ans)
```

#### Fonctionnalités à Ajouter
- ❌ **Modèle e-CMR standard** - Template avec tous les champs requis
- ❌ **Validation des champs obligatoires** - Vérification conformité
- ❌ **Photos de marchandise** - Capture et stockage
- ❌ **Suivi GPS en temps réel** - Intégration avec géolocalisation
- ❌ **Réserves/anomalies** - Signalement de problèmes
- ❌ **Génération PDF conforme** - PDF/A-3 avec signatures
- ❌ **QR Code** - Vérification rapide du document
- ❌ **API de vérification** - Endpoint pour vérifier l'authenticité

### 4. Sécurité et Traçabilité

- ❌ **Blockchain** - Ancrage dans une blockchain pour immuabilité
- ❌ **Audit trail complet** - Historique de toutes les actions
- ❌ **Chiffrement des données** - Données sensibles chiffrées
- ❌ **Backup automatique** - Sauvegarde redondante

---

## 🚀 Plan d'Implémentation Complet e-CMR

### Phase 1: Modèle e-CMR (1-2 semaines)
```javascript
// Ajouter à index.js
const eCMRTemplate = {
  type: 'ECMR',
  sections: {
    shipper: {
      name: { required: true },
      address: { required: true },
      contact: { required: true }
    },
    carrier: {
      name: { required: true },
      vehicleRegistration: { required: true },
      driverName: { required: true }
    },
    consignee: {
      name: { required: true },
      address: { required: true },
      deliveryDate: { required: true }
    },
    goods: {
      description: { required: true },
      weight: { required: true },
      packages: { required: true },
      dangerousGoods: { required: false }
    },
    instructions: {
      specialInstructions: { required: false },
      paymentTerms: { required: true }
    }
  }
};
```

### Phase 2: Intégration PSC (2-3 semaines)

**Option 1: Yousign (Recommandé pour France)**
```javascript
const yousign = require('@yousign/yousign-api');

async function signWithYousign(contractId, signerEmail) {
  const client = new yousign.Client(process.env.YOUSIGN_API_KEY);

  const procedure = await client.procedures.create({
    name: `e-CMR ${contractId}`,
    description: 'Signature e-CMR conforme',
    members: [
      {
        email: signerEmail,
        type: 'signer'
      }
    ]
  });

  return procedure.id;
}
```

**Coût:** ~1-2€ par signature (Yousign)

### Phase 3: Génération PDF/A-3 (1 semaine)

```javascript
const PDFDocument = require('pdfkit');
const { createHash } = require('crypto');

async function generateECMRPdf(contract) {
  const doc = new PDFDocument({ pdfVersion: '1.7', subset: 'PDF/A-3' });

  // Générer PDF avec toutes les données e-CMR
  doc.fontSize(16).text('e-CMR Electronic Consignment Note', { align: 'center' });

  // Ajouter QR code pour vérification
  const qrData = {
    contractId: contract._id,
    hash: createHash('sha256').update(JSON.stringify(contract)).digest('hex')
  };

  // Générer QR code...

  return doc;
}
```

### Phase 4: Archivage Légal (1 semaine)

**Option 1: AWS S3 Glacier (Recommandé)**
```javascript
const AWS = require('aws-sdk');
const glacier = new AWS.Glacier();

async function archiveECMR(contractId, pdfBuffer) {
  const params = {
    vaultName: 'rt-ecmr-archive',
    body: pdfBuffer,
    archiveDescription: `e-CMR ${contractId}`
  };

  const result = await glacier.uploadArchive(params).promise();

  // Stocker archiveId dans MongoDB
  await db.collection('contracts').updateOne(
    { _id: contractId },
    { $set: { archiveId: result.archiveId, archivedAt: new Date() } }
  );

  return result.archiveId;
}
```

**Coût:** ~0.004$/GB/mois (très économique)

---

## 💰 Coûts Estimés

| Service | Coût Mensuel | Description |
|---------|--------------|-------------|
| **Yousign** | 1-2€ × nb signatures | Signature électronique qualifiée |
| **AWS S3 Glacier** | 0.004$/GB/mois | Archivage légal (10 ans) |
| **Horodatage** | Inclus dans Yousign | Timestamp certifié |
| **MongoDB Atlas** | Gratuit (M0) ou 25$/mois (M10) | Base de données |
| **CloudFront** | ~5-20$/mois | CDN HTTPS |
| **Total estimé** | **50-100€/mois** | Pour 50-100 e-CMR/mois |

---

## 📊 État Actuel vs e-CMR Complet

| Fonctionnalité | Actuel | e-CMR Requis | Priorité |
|----------------|--------|--------------|----------|
| Signature simple | ✅ Oui | ✅ Oui | 🟢 OK |
| Signature qualifiée | ❌ Non | ✅ Oui | 🔴 Haute |
| Géolocalisation | ✅ Oui | ✅ Oui | 🟢 OK |
| Timestamp | ✅ Oui | ✅ Oui (qualifié) | 🟡 Moyenne |
| Champs e-CMR obligatoires | ❌ Non | ✅ Oui | 🔴 Haute |
| Génération PDF/A | ❌ Non | ✅ Oui | 🔴 Haute |
| Archivage 10 ans | ❌ Non | ✅ Oui | 🟡 Moyenne |
| Vérification QR Code | ❌ Non | ✅ Recommandé | 🟡 Moyenne |
| Suivi GPS temps réel | ❌ Non | ✅ Recommandé | 🟡 Moyenne |
| Photos marchandise | ❌ Non | ✅ Recommandé | 🟢 Basse |

---

## 🎯 Recommandations

### Pour Usage Immédiat (Contrats Généraux)
✅ **Le système actuel est suffisant** pour:
- Contrats de service
- NDA (accords de confidentialité)
- Contrats de transport simples (non e-CMR)

### Pour e-CMR Conforme
⚠️ **Il faut impléémenter** (priorité haute):
1. Modèle e-CMR avec tous les champs obligatoires
2. Intégration PSC (Yousign ou DocuSign)
3. Génération PDF/A-3 avec QR code
4. Archivage S3 Glacier (10 ans)

**Temps estimé:** 4-6 semaines de développement
**Coût développement:** 15-25K€ (freelance) ou 30-50K€ (agence)

### Alternative Rapide
**Utiliser une solution e-CMR existante:**
- **e-CMR.com** - Solution complète clé en main
- **Transporeon** - Plateforme transport + e-CMR
- **FreightHub** - Transport numérique avec e-CMR

**Coût:** 20-50€/mois par utilisateur

---

## 📚 Ressources

### Documentation Légale
- [Protocole e-CMR (2008)](https://unece.org/fileadmin/DAM/trans/conventn/e-CMR-Protocol-f.pdf)
- [Règlement eIDAS](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX%3A32014R0910)
- [Convention CMR (1956)](https://unece.org/fileadmin/DAM/trans/conventn/cmr_f.pdf)

### PSC Conformes eIDAS
- [Yousign](https://yousign.com/) - France, certifié eIDAS
- [DocuSign](https://www.docusign.com/) - International
- [Universign](https://www.universign.com/) - France

### Solutions e-CMR Existantes
- [e-CMR.com](https://www.e-cmr.com/)
- [Transporeon](https://www.transporeon.com/)

---

## 🎯 Résumé

### Pour l'Instant
- ✅ **Signature simple fonctionnelle** pour contrats généraux
- ✅ **Infrastructure MongoDB + HTTPS** prête
- ⚠️ **Pas conforme e-CMR légal** (manque signature qualifiée et champs obligatoires)

### Pour e-CMR Complet
- 🔴 **4-6 semaines de développement** nécessaires
- 💰 **50-100€/mois** de coûts opérationnels
- 📋 **Intégration PSC obligatoire** (Yousign/DocuSign)
- 📦 **Archivage légal 10 ans** requis

**Recommandation:** Commencer avec les contrats généraux maintenant, planifier e-CMR complet pour Q1 2026.

---

**Créé le:** 24 novembre 2025
**Mainteneur:** RT Technologies
**Version:** 1.0.0
