# ✅ RT Backend Services - Déploiement Complet

**Date:** 24 novembre 2025
**Status:** 🟢 100% Opérationnel
**Version:** 2.3.0 (e-CMR + Account Types actifs)

---

## 🎉 Résumé

Les **2 services backend** ont été déployés avec succès en production avec **HTTPS actif**!

### Service 1: Authz-EB (Validation TVA + Prix)
- **URL:** https://d2i50a1vlg138w.cloudfront.net
- **CloudFront:** E8GKHGYOIP84
- **Status:** 🟢 Opérationnel

### Service 2: Subscriptions-Contracts + e-CMR + Account Types
- **URL:** https://dgze8l03lwl5h.cloudfront.net
- **CloudFront:** E1H1CDV902R49R
- **MongoDB Atlas:** 🟢 Connecté et opérationnel (stagingrt.v2jnoh2.mongodb.net)
- **Status:** 🟢 100% Opérationnel
- **Features:**
  - ✅ Subscriptions Management
  - ✅ Contracts & E-Signatures
  - ✅ **e-CMR (Electronic Consignment Note)**
  - ✅ **Account Types Management** 🆕
- **Collections MongoDB:**
  - `subscription_plans` - Plans d'abonnement
  - `subscriptions` - Abonnements actifs
  - `contracts` - Contrats standards
  - `ecmr` - e-CMR (Electronic Consignment Note)
  - `users` - Comptes utilisateurs avec types 🆕

---

## 🚛 e-CMR (Electronic Consignment Note) - NOUVEAU

### 📦 Fonctionnalités Déployées (v2.2.3)

**Conforme à:**
- Convention CMR (1956)
- Protocole e-CMR (2008)

**Endpoints API disponibles:**

#### CRUD Operations
```bash
GET    /api/ecmr                    # Liste tous les e-CMR
POST   /api/ecmr                    # Créer un e-CMR
GET    /api/ecmr/:id                # Récupérer un e-CMR
PUT    /api/ecmr/:id                # Mettre à jour un e-CMR
DELETE /api/ecmr/:id                # Supprimer un e-CMR (DRAFT uniquement)
```

#### Workflow & Signatures
```bash
POST   /api/ecmr/:id/validate       # Valider avant signatures
POST   /api/ecmr/:id/sign/:party    # Signer (sender/carrierPickup/consignee)
POST   /api/ecmr/:id/remarks        # Ajouter des réserves (loading/delivery)
POST   /api/ecmr/:id/tracking       # Mettre à jour position GPS
GET    /api/ecmr/:cmrNumber/verify  # Vérifier authenticité
GET    /api/ecmr/transport-order/:orderId  # Tous les e-CMR d'une commande
```

### 🔄 Workflow e-CMR

1. **DRAFT** → Création et saisie des informations
2. **PENDING_SIGNATURES** → Validation et envoi pour signatures
3. **IN_TRANSIT** → Transporteur a signé, marchandise en transit
4. **DELIVERED** → Livraison effectuée
5. **SIGNED** → Toutes les signatures complètes

### 📋 Données e-CMR

**Parties:**
- Expéditeur (Sender) avec coordonnées complètes
- Transporteur (Carrier) avec véhicule et conducteur
- Destinataire (Consignee)

**Marchandises:**
- Description détaillée
- Poids (brut/net/volume)
- Conditionnement (nombre de colis, type)
- Marchandises dangereuses (ADR)
- Photos de chargement/livraison

**Signatures électroniques:**
- Signature expéditeur
- Signature transporteur (prise en charge)
- Signature destinataire (livraison)
- Géolocalisation et horodatage
- Support signatures qualifiées (Yousign - à activer)

**Suivi GPS:**
- Position en temps réel
- Historique des positions
- Timestamps

### 📄 Modules Implémentés

```
services/subscriptions-contracts-eb/
├── ecmr-models.js       # Modèles de données conformes CMR
├── ecmr-routes.js       # API REST (12 endpoints)
├── ecmr-pdf.js          # Génération PDF/A + QR Code
├── ecmr-archive.js      # Archivage S3/Glacier (10 ans)
└── ecmr-yousign.js      # Signatures qualifiées (prêt à activer)
```

### 🔧 Configuration Optionnelle

**Signatures qualifiées Yousign:**
```bash
YOUSIGN_API_KEY=votre_cle_api
YOUSIGN_ENV=production
YOUSIGN_WEBHOOK_URL=https://dgze8l03lwl5h.cloudfront.net/api/webhooks/yousign
```

**Archivage S3/Glacier:**
```bash
AWS_S3_BUCKET_ECMR=votre-bucket-ecmr
AWS_GLACIER_VAULT_ECMR=votre-vault-ecmr
ECMR_ARCHIVE_ENABLED=true
```

### ✅ Tests de Production

```bash
# Test création e-CMR
curl -X POST https://dgze8l03lwl5h.cloudfront.net/api/ecmr \
  -H "Content-Type: application/json" \
  -d '{"createdBy":"test@example.com"}'

# Test liste e-CMR
curl https://dgze8l03lwl5h.cloudfront.net/api/ecmr

# Status: ✅ Tous les tests passés
```

---

## 👥 Account Types Management - NOUVEAU

### 📦 Fonctionnalités Déployées (v2.3.0)

**6 types de compte disponibles:**

#### Types Créables (Sélection Initiale)
1. **TRANSPORTEUR** 🚛
   - Transport routier de marchandises
   - Features: Gestion conducteurs, véhicules, GPS, e-CMR
   - Prix: 49€/mois + 5€/conducteur + 3€/véhicule
   - Peut évoluer vers: COMMISSIONNAIRE

2. **EXPEDITEUR** 📦
   - Entreprise expéditrice de marchandises
   - Features: Expéditions, devis, suivi, e-CMR
   - Prix: 29€/mois + 1.5€/expédition
   - Peut évoluer vers: PLATEFORME_LOGISTIQUE

3. **PLATEFORME_LOGISTIQUE** 🏭
   - Gestion entrepôt et logistique
   - Features: Entrepôt, inventaire, coordination, API
   - Prix: 199€/mois + 50€/entrepôt
   - Pas d'évolution (type final)

4. **COMMISSIONNAIRE** 💼
   - Organisation et coordination de transports
   - Features: Multi-clients, sous-traitants, API
   - Prix: 299€/mois + 2€/commande + 5% commission
   - Peut évoluer vers: COMMISSIONNAIRE_AGRÉÉ

#### Types Accessibles par Évolution Uniquement
5. **COMMISSIONNAIRE_AGRÉÉ** 🛡️
   - Commissionnaire avec agrément douane
   - Features: Douane, import/export, white-label
   - Prix: 599€/mois + 1.5€/commande + 15€/déclaration douane
   - Conditions: 3 ans en COMMISSIONNAIRE + agrément douane

6. **DOUANE** 🏛️
   - Administration douanière (accès réservé)
   - Features: Audit, contrôles, accès complet

### 🔄 Workflow Account Types

1. **Sélection Initiale** → Utilisateur choisit parmi les 4 types créables
2. **Validation Documents** → Upload des documents requis
3. **Activation** → Compte activé (statut ACTIVE)
4. **Demande d'Évolution** → Après durée minimale + conditions remplies
5. **Approbation** → Admin valide l'évolution
6. **Nouveau Type Activé** → Accès aux nouvelles fonctionnalités

### 📋 Endpoints API

```bash
# Configuration
GET    /api/account/types                      # Liste tous les types
GET    /api/account/types?creatableOnly=true   # Types créables uniquement

# Gestion de compte
POST   /api/account/select-type                # Sélection initiale
GET    /api/account/current/:userId            # Compte actuel avec config
GET    /api/account/upgrade-options/:userId    # Options d'évolution disponibles

# Workflow d'évolution
POST   /api/account/upgrade                    # Demander une évolution
POST   /api/account/upgrade/approve            # Approuver (admin)
POST   /api/account/upgrade/reject             # Rejeter (admin)
```

### 🔧 Règles d'Évolution

**TRANSPORTEUR → COMMISSIONNAIRE:**
- ✅ Minimum 2 ans comme Transporteur
- ✅ Licence commissionnaire
- ✅ Garantie financière 50 000€
- ✅ Assurance RC Pro spécifique
- ⏱️ Approbation: 7 jours

**EXPEDITEUR → PLATEFORME_LOGISTIQUE:**
- ✅ Minimum 1 an comme Expéditeur
- ✅ Licence exploitation entrepôt
- ✅ Assurance marchandises stockées
- ✅ Capacité stockage min 500m²
- ⏱️ Approbation: 5 jours

**COMMISSIONNAIRE → COMMISSIONNAIRE_AGRÉÉ:**
- ✅ Minimum 3 ans comme Commissionnaire
- ✅ Agrément douane officiel
- ✅ Garantie financière 150 000€
- ✅ Formation spécialisée douane
- ✅ CA minimum 500 000€/an
- ⏱️ Approbation: 14 jours (approbation externe requise)

### 📄 Modules Implémentés

```
services/subscriptions-contracts-eb/
├── account-types-models.js  # Configuration des 6 types + règles
├── account-types-routes.js  # API REST (7 endpoints)
```

### ✅ Tests de Production

```bash
# Test liste types créables
curl https://dgze8l03lwl5h.cloudfront.net/api/account/types?creatableOnly=true

# Test sélection type
curl -X POST https://dgze8l03lwl5h.cloudfront.net/api/account/select-type \
  -H "Content-Type: application/json" \
  -d '{"userId":"user123","email":"test@example.com","companyName":"Test SARL","accountType":"TRANSPORTEUR"}'

# Test compte actuel
curl https://dgze8l03lwl5h.cloudfront.net/api/account/current/user123

# Test options évolution
curl https://dgze8l03lwl5h.cloudfront.net/api/account/upgrade-options/user123

# Status: ✅ Tous les tests passés
```

### 🎯 Intégration Frontend

Le frontend dispose déjà de tous les composants prêts:
- `src/types/account.ts` - Types TypeScript
- `src/hooks/useAccountTypes.ts` - Hook sélection
- `src/hooks/useAccountUpgrade.ts` - Hook évolution
- `src/app/account/select-type/page.tsx` - Page sélection
- `src/app/account/upgrade/page.tsx` - Page évolution

**Configuration requise:**
```env
NEXT_PUBLIC_ACCOUNT_API_URL=https://dgze8l03lwl5h.cloudfront.net
```

---

## 📁 Documentation Créée

1. FRONTEND_INTEGRATION.md - Guide complet
2. QUICK_REFERENCE.md - Référence rapide
3. SERVICES_SUMMARY.md - Résumé détaillé
4. frontend-types.ts - Types TypeScript
5. frontend-utils.ts - Fonctions utilitaires
6. services/authz-eb/CLOUDFRONT_CONFIG.md
7. services/subscriptions-contracts-eb/CLOUDFRONT_CONFIG.md
8. services/subscriptions-contracts-eb/ECMR_COMPLETE_GUIDE.md 🆕
9. services/subscriptions-contracts-eb/ELECTRONIC_SIGNATURE_STATUS.md 🆕
10. services/*/test-https.ps1 - Tests automatisés

---

## ✅ Tout est Prêt pour le Frontend!

**Mainteneur:** RT Technologies

**Dernière mise à jour:** 24 novembre 2025 - Déploiement Account Types v2.3.0
