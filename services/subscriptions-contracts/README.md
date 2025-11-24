# Service Subscriptions-Contracts

Service unifié pour la gestion des abonnements et la signature électronique de contrats.

## 🎯 Fonctionnalités

### Gestion des Abonnements
- ✅ Plans d'abonnement (BASIC, PRO, ENTERPRISE, CUSTOM)
- ✅ Périodes d'essai configurables
- ✅ Facturation flexible (mensuelle, trimestrielle, annuelle)
- ✅ Gestion des paiements (Stripe, PayPal, virement bancaire, carte)
- ✅ Suivi de l'utilisation et des limites (API calls, users, véhicules, storage)
- ✅ Renouvellement automatique des abonnements
- ✅ Gestion des factures et historique des paiements

### Gestion des Contrats
- ✅ Modèles de contrats réutilisables avec variables
- ✅ Signature électronique multi-parties
- ✅ Workflows de signature (séquentiel ou parallèle)
- ✅ 3 types de signatures (Simple, Advanced, Qualified eIDAS)
- ✅ Audit trail complet avec géolocalisation et IP
- ✅ Génération de PDF
- ✅ Notifications email automatiques
- ✅ Gestion des refus de signature

## 📋 Structure du Projet

```
services/subscriptions-contracts/
├── src/
│   ├── controllers/           # Contrôleurs HTTP
│   │   ├── subscription.controller.ts
│   │   └── contract.controller.ts
│   ├── services/             # Logique métier
│   │   ├── subscription.service.ts
│   │   └── contract.service.ts
│   ├── repositories/         # Accès données MongoDB
│   │   ├── subscription.repository.ts
│   │   └── contract.repository.ts
│   ├── routes/               # Routes Express
│   │   ├── subscription.routes.ts
│   │   └── contract.routes.ts
│   ├── middleware/           # Middlewares
│   │   └── error.middleware.ts
│   └── index.ts              # Point d'entrée
├── package.json
├── tsconfig.json
└── .env.example
```

## 🔌 API Endpoints

### Subscriptions (16 endpoints)

**Plans**
- `POST /api/plans` - Créer un plan
- `GET /api/plans` - Lister les plans
- `GET /api/plans/:id` - Détails d'un plan
- `PUT /api/plans/:id` - Modifier un plan
- `DELETE /api/plans/:id` - Désactiver un plan

**Abonnements**
- `POST /api/subscriptions` - Créer un abonnement
- `GET /api/subscriptions/:id` - Détails abonnement
- `GET /api/subscriptions/user/:userId/active` - Abonnement actif d'un user
- `PUT /api/subscriptions/:id` - Modifier abonnement
- `POST /api/subscriptions/:id/cancel` - Annuler abonnement
- `POST /api/subscriptions/:id/renew` - Renouveler abonnement

**Factures**
- `POST /api/invoices` - Créer une facture
- `GET /api/invoices/:id` - Détails facture
- `POST /api/invoices/:id/pay` - Marquer comme payée

**Usage**
- `POST /api/usage` - Mettre à jour l'usage
- `GET /api/usage/:subscriptionId/limits` - Vérifier les limites

### Contracts (14 endpoints)

**Templates**
- `POST /api/templates` - Créer un modèle
- `GET /api/templates` - Lister les modèles
- `GET /api/templates/:id` - Détails modèle
- `PUT /api/templates/:id` - Modifier modèle
- `DELETE /api/templates/:id` - Désactiver modèle

**Contrats**
- `POST /api/contracts` - Créer un contrat
- `GET /api/contracts/:id` - Détails contrat
- `GET /api/contracts/user/:userId` - Contrats d'un user
- `PUT /api/contracts/:id` - Modifier contrat
- `POST /api/contracts/:id/send` - Envoyer pour signatures
- `POST /api/contracts/:id/cancel` - Annuler contrat

**Signatures**
- `GET /api/contracts/:contractId/signatures` - Liste des signatures
- `POST /api/signatures/:signatureId/sign` - Signer
- `POST /api/signatures/:signatureId/decline` - Refuser

## ⚙️ Configuration

Créer un fichier `.env`:

```env
# Server
PORT=3005
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb+srv://user:password@host/rt-subscriptions-contracts

# CORS
CORS_ORIGIN=*

# JWT
JWT_SECRET=your-secret-key

# Email (Nodemailer)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@domain.com
EMAIL_PASSWORD=your-password
EMAIL_FROM=noreply@rt-technologies.com

# AWS S3 (pour documents)
AWS_REGION=eu-west-3
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_S3_BUCKET=rt-contracts-documents
```

## 🚀 Démarrage

### Installation
```bash
pnpm install
```

### Développement
```bash
pnpm dev
```

### Build
```bash
pnpm build
```

### Production
```bash
pnpm start
```

## 📊 Collections MongoDB

Le service utilise les collections suivantes:

- `subscription_plans` - Plans d'abonnement
- `subscriptions` - Abonnements actifs/historiques
- `invoices` - Factures générées
- `payments` - Historique des paiements
- `usage` - Suivi de l'utilisation
- `contract_templates` - Modèles de contrats
- `contracts` - Contrats créés
- `signatures` - Signatures électroniques
- `signing_workflows` - Workflows de signature
- `contract_audit_logs` - Logs d'audit des contrats

## 🔐 Sécurité

- Helmet pour les headers HTTP sécurisés
- CORS configuré
- Rate limiting (100 req/15min par IP)
- Validation Zod sur tous les inputs
- Audit trail complet pour les contrats
- Géolocalisation et IP tracking des signatures

## 📝 Types Principaux

### SubscriptionPlanType
- BASIC
- PRO
- ENTERPRISE
- CUSTOM

### SubscriptionStatus
- TRIAL
- ACTIVE
- PAST_DUE
- CANCELLED
- EXPIRED
- SUSPENDED

### BillingInterval
- MONTHLY
- QUARTERLY
- YEARLY

### ContractType
- ECMR (Electronic Consignment Note)
- TRANSPORT
- SERVICE
- NDA
- CUSTOM

### SignatureType
- SIMPLE - Signature électronique simple
- ADVANCED - Signature électronique avancée
- QUALIFIED - Signature électronique qualifiée (eIDAS)

## 🔧 TODO - Corrections TypeScript à finaliser

1. Ajouter `TRIALING` dans `SubscriptionStatus` (packages/contracts)
2. Corriger les types BaseEntity (id vs _id MongoDB)
3. Ajouter propriétés manquantes dans types (isActive, invoiceNumber, etc.)
4. Corriger types Payment (status COMPLETED, processedAt)
5. Corriger types Usage (periodStart, periodEnd)

## 📚 Documentation API

Une fois déployé, la documentation interactive Swagger sera disponible à:
`http://localhost:3005/api-docs`

## 🎓 Exemples d'utilisation

### Créer un abonnement avec essai

```bash
POST /api/subscriptions
{
  "userId": "user123",
  "planId": "plan_pro",
  "billingInterval": "MONTHLY",
  "startTrial": true
}
```

### Créer un contrat de transport

```bash
POST /api/contracts
{
  "title": "Contrat de Transport Paris-Lyon",
  "type": "TRANSPORT",
  "parties": [
    {
      "type": "COMPANY",
      "name": "Entreprise A",
      "email": "contact@entreprisea.com",
      "role": "SENDER",
      "signatureRequired": true,
      "signatureOrder": 1
    },
    {
      "type": "COMPANY",
      "name": "Transporteur B",
      "email": "contact@transportb.com",
      "role": "CARRIER",
      "signatureRequired": true,
      "signatureOrder": 2
    }
  ],
  "content": "<h1>Contrat de Transport</h1>...",
  "effectiveDate": "2025-12-01",
  "isSequentialSigning": true
}
```

### Signer un document

```bash
POST /api/signatures/:signatureId/sign
{
  "signatureData": "data:image/png;base64,iVBOR...",
  "geolocation": {
    "latitude": 48.8566,
    "longitude": 2.3522
  }
}
```

## 📞 Support

Pour toute question, contactez l'équipe RT Technologies.
