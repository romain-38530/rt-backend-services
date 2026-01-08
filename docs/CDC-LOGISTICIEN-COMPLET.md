# CAHIER DES CHARGES - UNIVERS LOGISTICIEN SYMPHONI.A

## Version 1.0 - Janvier 2025

---

# TABLE DES MATIERES

1. [Contexte et Objectifs](#1-contexte-et-objectifs)
2. [Architecture Technique](#2-architecture-technique)
3. [Module 1: Integration Stripe](#3-module-1-integration-stripe)
4. [Module 2: Gestion Sub-Utilisateurs](#4-module-2-gestion-sub-utilisateurs)
5. [Module 3: Webhooks Bidirectionnels](#5-module-3-webhooks-bidirectionnels)
6. [Module 4: Alertes Capacite Entrepot](#6-module-4-alertes-capacite-entrepot)
7. [Module 5: Tracking Logisticien](#7-module-5-tracking-logisticien)
8. [Module 6: Facturation Complete](#8-module-6-facturation-complete)
9. [Module 7: Compliance DREAL](#9-module-7-compliance-dreal)
10. [Interactions Inter-Modules](#10-interactions-inter-modules)
11. [Tests et Validation](#11-tests-et-validation)
12. [Planning et Priorites](#12-planning-et-priorites)

---

# 1. CONTEXTE ET OBJECTIFS

## 1.1 Situation Actuelle

L'univers logisticien SYMPHONI.A est actuellement **fonctionnel a 75%** avec:

### Modules Operationnels
- Invitation et onboarding (3 etapes)
- Gestion documents vigilance avec OCR Textract
- Systeme ICPE complet (rubriques, declarations, alertes)
- Gestion RDV et planning quai
- Signature e-CMR
- Delegation 3PL/4PL
- Authentification portail JWT

### Modules a Completer
- Integration paiement Stripe (options payantes)
- Gestion des sub-utilisateurs (equipe)
- Webhooks bidirectionnels (notifications temps reel)
- Alertes capacite entrepot
- Visibilite tracking cote logisticien
- Facturation et prefacturation complete
- Rapports compliance DREAL

## 1.2 Objectifs

1. **Completer les APIs manquantes** pour atteindre 100% de fonctionnalite
2. **Interconnecter les modules** pour une experience utilisateur fluide
3. **Automatiser les processus** (alertes, facturation, compliance)
4. **Securiser les transactions** (Stripe, audit trail)

## 1.3 Perimetre

| Univers | Interactions |
|---------|--------------|
| Logisticien | Principal |
| Industriel | Delegations, commandes, alertes ICPE |
| Transporteur | RDV, tracking, e-CMR |
| Chauffeur | Approche entrepot, signature |

---

# 2. ARCHITECTURE TECHNIQUE

## 2.1 Stack Technologique

```
Backend:
- Node.js 18+ avec ES Modules
- Express.js
- MongoDB Atlas
- AWS (S3, Textract, SES, SNS)
- Stripe (paiements)
- JWT (authentification)

Frontend:
- React 18
- TypeScript
- TailwindCSS
- React Query

Infrastructure:
- AWS Elastic Beanstalk
- CloudFront CDN
- Route 53 DNS
```

## 2.2 Structure des Services

```
services/
├── subscriptions-contracts-eb/     # Service principal logisticien
│   ├── logisticien-routes.js       # API logisticien (2375 lignes)
│   ├── logisticien-portal-routes.js
│   ├── logistics-delegation-routes.js
│   ├── icpe-routes.js
│   ├── planning-routes.js
│   └── stripe-routes.js            # A completer
├── authz-eb/                       # Authentification
├── tracking-api/                   # GPS et tracking
├── ecmr-api/                       # e-CMR
└── notifications-api/              # Notifications push/email
```

## 2.3 Collections MongoDB

```javascript
// Base: rt-technologie
db.logisticians                    // Comptes logisticiens
db.logistician_documents           // Documents vigilance
db.icpe_volume_declarations        // Declarations ICPE hebdo
db.logistician_vigilance_alerts    // Alertes vigilance/ICPE
db.logistician_events              // Audit trail
db.logistics_partners              // Partenaires 3PL/4PL
db.site_plannings                  // Planning quai
db.planning_slots                  // Creneaux disponibles
db.rdv                             // Rendez-vous
db.warehouse_capacity_alerts       // NOUVEAU: Alertes capacite
db.logistician_team_members        // NOUVEAU: Sub-utilisateurs
db.logistician_subscriptions       // NOUVEAU: Abonnements Stripe
db.logistician_invoices            // NOUVEAU: Factures
db.dreal_reports                   // NOUVEAU: Rapports DREAL
```

---

# 3. MODULE 1: INTEGRATION STRIPE

## 3.1 Contexte

Les options payantes (Bourse Stockage 150EUR/mois, Borne Accueil 100EUR/mois) ont leur structure en place mais l'integration Stripe est incomplete (TODO lignes 2041 et 2101).

## 3.2 Specifications Fonctionnelles

### 3.2.1 Abonnements Disponibles

| Option | Prix | Facturation | Description |
|--------|------|-------------|-------------|
| Base Logisticien | 300 EUR/mois | Mensuelle | Acces portail + ICPE |
| Bourse Stockage | +150 EUR/mois | Mensuelle | Place de marche stockage |
| Borne Accueil | +100 EUR/mois | Mensuelle | Borne chauffeur digitale |

### 3.2.2 Flux de Paiement

```
1. Logisticien clique "Activer Bourse Stockage"
2. API cree session Stripe Checkout
3. Redirect vers page Stripe
4. Paiement CB/SEPA
5. Webhook Stripe -> API confirmation
6. Activation option + notification email
7. Facturation mensuelle automatique
```

## 3.3 Specifications Techniques

### 3.3.1 Nouvelles Routes API

```javascript
// POST /api/logisticians/:id/subscribe/checkout
// Cree une session Stripe Checkout
{
  "option": "bourse_stockage" | "borne_accueil",
  "successUrl": "https://...",
  "cancelUrl": "https://..."
}
// Response: { checkoutUrl: "https://checkout.stripe.com/..." }

// POST /api/stripe/webhook
// Webhook Stripe pour confirmation paiement
// Headers: stripe-signature
// Events: checkout.session.completed, invoice.paid, invoice.payment_failed

// GET /api/logisticians/:id/subscriptions
// Liste les abonnements actifs
// Response: { subscriptions: [...], totalMonthly: 450 }

// DELETE /api/logisticians/:id/subscriptions/:subscriptionId
// Annuler un abonnement (fin de periode)
```

### 3.3.2 Schema MongoDB

```javascript
// Collection: logistician_subscriptions
{
  _id: ObjectId,
  logisticianId: ObjectId,
  stripeCustomerId: "cus_xxx",
  stripeSubscriptionId: "sub_xxx",
  option: "bourse_stockage" | "borne_accueil",
  status: "active" | "past_due" | "canceled" | "trialing",
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  cancelAtPeriodEnd: Boolean,
  priceAmount: 15000, // centimes
  currency: "eur",
  createdAt: Date,
  updatedAt: Date
}
```

### 3.3.3 Configuration Stripe

```javascript
// Variables d'environnement
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_BOURSE_STOCKAGE=price_xxx  // 150 EUR/mois
STRIPE_PRICE_BORNE_ACCUEIL=price_xxx    // 100 EUR/mois
```

### 3.3.4 Implementation

```javascript
// services/subscriptions-contracts-eb/stripe-logistician-routes.js

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// POST /api/logisticians/:id/subscribe/checkout
router.post('/:id/subscribe/checkout', authenticateLogistician, async (req, res) => {
  const { option, successUrl, cancelUrl } = req.body;
  const logisticianId = req.params.id;

  // Verifier logisticien existe et actif
  const logistician = await db.collection('logisticians').findOne({
    _id: new ObjectId(logisticianId),
    status: 'active'
  });

  if (!logistician) {
    return res.status(404).json({ error: 'Logisticien non trouve' });
  }

  // Creer/recuperer client Stripe
  let customerId = logistician.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: logistician.email,
      name: logistician.companyName,
      metadata: { logisticianId: logisticianId }
    });
    customerId = customer.id;
    await db.collection('logisticians').updateOne(
      { _id: new ObjectId(logisticianId) },
      { $set: { stripeCustomerId: customerId } }
    );
  }

  // Determiner le prix
  const priceId = option === 'bourse_stockage'
    ? process.env.STRIPE_PRICE_BOURSE_STOCKAGE
    : process.env.STRIPE_PRICE_BORNE_ACCUEIL;

  // Creer session checkout
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card', 'sepa_debit'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      logisticianId: logisticianId,
      option: option
    }
  });

  res.json({ checkoutUrl: session.url });
});

// POST /api/stripe/webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const { logisticianId, option } = session.metadata;

      // Enregistrer abonnement
      await db.collection('logistician_subscriptions').insertOne({
        logisticianId: new ObjectId(logisticianId),
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        option: option,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        priceAmount: option === 'bourse_stockage' ? 15000 : 10000,
        currency: 'eur',
        createdAt: new Date()
      });

      // Activer option sur logisticien
      const updateField = option === 'bourse_stockage'
        ? 'options.bourseStockage'
        : 'options.borneAccueil';
      await db.collection('logisticians').updateOne(
        { _id: new ObjectId(logisticianId) },
        { $set: { [updateField]: { active: true, activatedAt: new Date() } } }
      );

      // Envoyer email confirmation
      await sendSubscriptionConfirmationEmail(logisticianId, option);

      // Log audit
      await logEvent('subscription.activated', logisticianId, { option });
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object;
      // Creer facture interne
      await createInternalInvoice(invoice);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      // Notifier logisticien
      await notifyPaymentFailed(invoice);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      // Desactiver option
      await deactivateSubscription(subscription.id);
      break;
    }
  }

  res.json({ received: true });
});
```

## 3.4 Tests

```javascript
// Tests unitaires
describe('Stripe Integration', () => {
  it('should create checkout session for bourse_stockage', async () => {
    const res = await request(app)
      .post('/api/logisticians/123/subscribe/checkout')
      .send({ option: 'bourse_stockage', successUrl: '...', cancelUrl: '...' });
    expect(res.status).toBe(200);
    expect(res.body.checkoutUrl).toContain('checkout.stripe.com');
  });

  it('should handle webhook checkout.session.completed', async () => {
    const payload = { /* mock event */ };
    const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test' });
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', sig)
      .send(payload);
    expect(res.status).toBe(200);
  });
});
```

## 3.5 Criteres de Validation

- [ ] Session Checkout creee avec succes
- [ ] Paiement CB fonctionne
- [ ] Paiement SEPA fonctionne
- [ ] Webhook confirme l'abonnement
- [ ] Option activee sur le compte logisticien
- [ ] Email confirmation envoye
- [ ] Facture mensuelle automatique
- [ ] Annulation fonctionne (fin de periode)
- [ ] Gestion echec paiement

---

# 4. MODULE 2: GESTION SUB-UTILISATEURS

## 4.1 Contexte

Les logisticiens doivent pouvoir ajouter des collaborateurs avec differents niveaux d'acces (viewer, editor, admin).

## 4.2 Specifications Fonctionnelles

### 4.2.1 Roles et Permissions

| Role | Permissions |
|------|-------------|
| **viewer** | Lecture seule (commandes, RDV, e-CMR, ICPE) |
| **editor** | Lecture + Modification (confirmer RDV, signer e-CMR) |
| **admin** | Tout + Gestion equipe + Options payantes |

### 4.2.2 Flux d'Invitation

```
1. Admin logisticien invite collaborateur (email + role)
2. Email invitation avec lien magic link
3. Collaborateur clique et cree son mot de passe
4. Compte active avec permissions du role
```

### 4.2.3 Limites

| Plan | Nombre max collaborateurs |
|------|---------------------------|
| Base | 3 inclus |
| Pro | 10 inclus |
| Enterprise | Illimite |

## 4.3 Specifications Techniques

### 4.3.1 Routes API

```javascript
// GET /api/logisticians/:id/team
// Liste les membres de l'equipe
// Response: { members: [...], maxMembers: 10, currentCount: 3 }

// POST /api/logisticians/:id/team/invite
// Inviter un collaborateur
{
  "email": "collaborateur@entreprise.fr",
  "firstName": "Jean",
  "lastName": "Dupont",
  "role": "editor",
  "warehouses": ["warehouse_id_1", "warehouse_id_2"] // optionnel, tous si vide
}

// GET /api/logisticians/team/invitation/:token
// Verifier token d'invitation
// Response: { valid: true, email: "...", logisticianName: "...", role: "..." }

// POST /api/logisticians/team/invitation/:token/accept
// Accepter invitation et creer compte
{
  "password": "********",
  "phone": "+33612345678"
}

// PUT /api/logisticians/:id/team/:memberId
// Modifier role/permissions d'un membre
{
  "role": "admin",
  "warehouses": ["warehouse_id_1"]
}

// DELETE /api/logisticians/:id/team/:memberId
// Retirer un membre de l'equipe

// POST /api/logisticians/:id/team/:memberId/resend-invitation
// Renvoyer email d'invitation
```

### 4.3.2 Schema MongoDB

```javascript
// Collection: logistician_team_members
{
  _id: ObjectId,
  logisticianId: ObjectId,           // Organisation parente
  userId: ObjectId,                   // Ref vers users (rt-auth)
  email: "collaborateur@entreprise.fr",
  firstName: "Jean",
  lastName: "Dupont",
  role: "viewer" | "editor" | "admin",
  permissions: [
    "orders.read",
    "orders.write",
    "rdv.read",
    "rdv.write",
    "ecmr.read",
    "ecmr.sign",
    "icpe.read",
    "icpe.declare",
    "team.manage",
    "billing.manage"
  ],
  warehouses: [ObjectId],            // Entrepots accessibles (vide = tous)
  status: "invited" | "active" | "suspended",
  invitationToken: "xxx",
  invitationExpiry: Date,
  lastLogin: Date,
  createdAt: Date,
  createdBy: ObjectId,
  updatedAt: Date
}
```

### 4.3.3 Permissions par Role

```javascript
const ROLE_PERMISSIONS = {
  viewer: [
    'orders.read',
    'rdv.read',
    'ecmr.read',
    'icpe.read',
    'tracking.read'
  ],
  editor: [
    'orders.read',
    'orders.write',
    'rdv.read',
    'rdv.write',
    'ecmr.read',
    'ecmr.sign',
    'icpe.read',
    'icpe.declare',
    'tracking.read'
  ],
  admin: [
    'orders.read',
    'orders.write',
    'rdv.read',
    'rdv.write',
    'ecmr.read',
    'ecmr.sign',
    'icpe.read',
    'icpe.declare',
    'tracking.read',
    'team.manage',
    'billing.manage',
    'settings.manage'
  ]
};
```

### 4.3.4 Implementation

```javascript
// services/subscriptions-contracts-eb/logistician-team-routes.js

import { Router } from 'express';
import { ObjectId } from 'mongodb';
import crypto from 'crypto';

const router = Router();

// Middleware verification admin
const requireAdmin = async (req, res, next) => {
  const member = await db.collection('logistician_team_members').findOne({
    userId: new ObjectId(req.user.id),
    logisticianId: new ObjectId(req.params.id)
  });

  if (!member || member.role !== 'admin') {
    return res.status(403).json({ error: 'Acces admin requis' });
  }
  next();
};

// GET /api/logisticians/:id/team
router.get('/:id/team', authenticateLogistician, async (req, res) => {
  const logisticianId = req.params.id;

  const members = await db.collection('logistician_team_members')
    .find({ logisticianId: new ObjectId(logisticianId) })
    .project({ invitationToken: 0 })
    .toArray();

  const logistician = await db.collection('logisticians').findOne({
    _id: new ObjectId(logisticianId)
  });

  const maxMembers = getMaxMembersByPlan(logistician.subscription?.plan || 'base');

  res.json({
    members,
    maxMembers,
    currentCount: members.length
  });
});

// POST /api/logisticians/:id/team/invite
router.post('/:id/team/invite', authenticateLogistician, requireAdmin, async (req, res) => {
  const { email, firstName, lastName, role, warehouses } = req.body;
  const logisticianId = req.params.id;

  // Verifier limite
  const currentCount = await db.collection('logistician_team_members')
    .countDocuments({ logisticianId: new ObjectId(logisticianId) });

  const logistician = await db.collection('logisticians').findOne({
    _id: new ObjectId(logisticianId)
  });

  const maxMembers = getMaxMembersByPlan(logistician.subscription?.plan || 'base');

  if (currentCount >= maxMembers) {
    return res.status(400).json({
      error: 'Limite collaborateurs atteinte',
      maxMembers,
      currentCount
    });
  }

  // Verifier email pas deja utilise
  const existing = await db.collection('logistician_team_members').findOne({
    logisticianId: new ObjectId(logisticianId),
    email: email.toLowerCase()
  });

  if (existing) {
    return res.status(400).json({ error: 'Email deja utilise' });
  }

  // Generer token invitation
  const invitationToken = crypto.randomBytes(32).toString('hex');
  const invitationExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

  // Creer membre
  const member = {
    logisticianId: new ObjectId(logisticianId),
    email: email.toLowerCase(),
    firstName,
    lastName,
    role,
    permissions: ROLE_PERMISSIONS[role],
    warehouses: warehouses?.map(id => new ObjectId(id)) || [],
    status: 'invited',
    invitationToken,
    invitationExpiry,
    createdAt: new Date(),
    createdBy: new ObjectId(req.user.id)
  };

  await db.collection('logistician_team_members').insertOne(member);

  // Envoyer email invitation
  const invitationUrl = `${process.env.LOGISTICIAN_PORTAL_URL}/invitation/${invitationToken}`;
  await sendTeamInvitationEmail({
    to: email,
    firstName,
    logisticianName: logistician.companyName,
    role,
    invitationUrl
  });

  // Log audit
  await logEvent('team.member_invited', logisticianId, { email, role });

  res.status(201).json({
    message: 'Invitation envoyee',
    memberId: member._id
  });
});

// POST /api/logisticians/team/invitation/:token/accept
router.post('/team/invitation/:token/accept', async (req, res) => {
  const { token } = req.params;
  const { password, phone } = req.body;

  // Trouver invitation
  const member = await db.collection('logistician_team_members').findOne({
    invitationToken: token,
    status: 'invited',
    invitationExpiry: { $gt: new Date() }
  });

  if (!member) {
    return res.status(404).json({ error: 'Invitation invalide ou expiree' });
  }

  // Creer user dans rt-auth
  const authDb = client.db('rt-auth');
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await authDb.collection('users').insertOne({
    email: member.email,
    password: hashedPassword,
    name: `${member.firstName} ${member.lastName}`,
    phone,
    role: 'user',
    portal: 'logistician',
    createdAt: new Date()
  });

  // Mettre a jour membre
  await db.collection('logistician_team_members').updateOne(
    { _id: member._id },
    {
      $set: {
        userId: user.insertedId,
        status: 'active',
        updatedAt: new Date()
      },
      $unset: {
        invitationToken: '',
        invitationExpiry: ''
      }
    }
  );

  // Log audit
  await logEvent('team.member_activated', member.logisticianId, {
    memberId: member._id,
    email: member.email
  });

  res.json({ message: 'Compte active' });
});

// DELETE /api/logisticians/:id/team/:memberId
router.delete('/:id/team/:memberId', authenticateLogistician, requireAdmin, async (req, res) => {
  const { id, memberId } = req.params;

  // Ne pas permettre de se supprimer soi-meme
  const member = await db.collection('logistician_team_members').findOne({
    _id: new ObjectId(memberId)
  });

  if (member?.userId?.equals(new ObjectId(req.user.id))) {
    return res.status(400).json({ error: 'Impossible de vous supprimer vous-meme' });
  }

  // Supprimer membre
  await db.collection('logistician_team_members').deleteOne({
    _id: new ObjectId(memberId),
    logisticianId: new ObjectId(id)
  });

  // Desactiver user dans rt-auth si existe
  if (member?.userId) {
    const authDb = client.db('rt-auth');
    await authDb.collection('users').updateOne(
      { _id: member.userId },
      { $set: { isActive: false } }
    );
  }

  // Log audit
  await logEvent('team.member_removed', id, { memberId, email: member?.email });

  res.json({ message: 'Membre supprime' });
});

function getMaxMembersByPlan(plan) {
  switch (plan) {
    case 'enterprise': return 999;
    case 'pro': return 10;
    default: return 3;
  }
}

export default router;
```

## 4.4 Criteres de Validation

- [ ] Admin peut inviter un collaborateur
- [ ] Email invitation envoye avec lien valide
- [ ] Collaborateur peut accepter et creer son compte
- [ ] Permissions respectees selon le role
- [ ] Limite par plan respectee
- [ ] Admin peut modifier le role d'un membre
- [ ] Admin peut supprimer un membre
- [ ] Audit trail de toutes les actions

---

# 5. MODULE 3: WEBHOOKS BIDIRECTIONNELS

## 5.1 Contexte

Les notifications temps reel entre modules sont essentielles pour une bonne UX. Actuellement, les webhooks sont partiels.

## 5.2 Specifications Fonctionnelles

### 5.2.1 Events a Propager

| Event | Source | Destinations | Description |
|-------|--------|--------------|-------------|
| `rdv.refused` | Logisticien | Transporteur, Industriel | RDV refuse |
| `rdv.alternative_proposed` | Logisticien | Transporteur | Creneau alternatif propose |
| `rdv.confirmed` | Logisticien | Transporteur, Industriel | RDV confirme |
| `icpe.alert_critical` | Logisticien | Industriel | Seuil ICPE critique (>90%) |
| `icpe.non_compliant` | Logisticien | Industriel | Logisticien non conforme |
| `capacity.warning` | Logisticien | Industriel | Capacite entrepot >80% |
| `capacity.full` | Logisticien | Industriel | Entrepot sature |
| `ecmr.signed` | Logisticien | Transporteur, Industriel | e-CMR signe |
| `driver.approaching` | Transporteur | Logisticien | Chauffeur a <30min |
| `driver.arrived` | Transporteur | Logisticien | Chauffeur arrive |

### 5.2.2 Canaux de Notification

| Canal | Usage |
|-------|-------|
| WebSocket | Temps reel dans l'app |
| Push notification | Mobile |
| Email | Recapitulatif, alertes critiques |
| SMS | Alertes urgentes (optionnel) |

## 5.3 Specifications Techniques

### 5.3.1 Architecture Event-Driven

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Service A  │────>│  Event Bus  │────>│  Service B  │
│ (Logisticien)│     │   (SNS)     │     │(Transporteur)│
└─────────────┘     └─────────────┘     └─────────────┘
                          │
                          v
                    ┌─────────────┐
                    │  WebSocket  │
                    │   Server    │
                    └─────────────┘
```

### 5.3.2 Format des Events

```javascript
{
  eventId: "evt_xxx",
  eventType: "rdv.refused",
  timestamp: "2025-01-08T14:30:00Z",
  source: {
    service: "logistician-portal",
    userId: "user_xxx",
    organizationId: "org_xxx"
  },
  data: {
    rdvId: "rdv_xxx",
    orderId: "order_xxx",
    reason: "Quai indisponible",
    alternativeSlots: [
      { date: "2025-01-09", timeSlot: "08:00-10:00" },
      { date: "2025-01-09", timeSlot: "14:00-16:00" }
    ]
  },
  recipients: [
    { type: "transporter", id: "transporter_xxx" },
    { type: "industry", id: "industry_xxx" }
  ]
}
```

### 5.3.3 Implementation Event Bus (AWS SNS + SQS)

```javascript
// services/common/event-bus.js

import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';

const snsClient = new SNSClient({ region: process.env.AWS_REGION });
const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

// Publier un event
export async function publishEvent(eventType, data, recipients) {
  const event = {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    eventType,
    timestamp: new Date().toISOString(),
    source: {
      service: process.env.SERVICE_NAME,
      version: process.env.SERVICE_VERSION
    },
    data,
    recipients
  };

  await snsClient.send(new PublishCommand({
    TopicArn: process.env.SNS_EVENTS_TOPIC_ARN,
    Message: JSON.stringify(event),
    MessageAttributes: {
      eventType: { DataType: 'String', StringValue: eventType }
    }
  }));

  // Log pour audit
  await db.collection('event_logs').insertOne({
    ...event,
    status: 'published'
  });

  return event.eventId;
}

// Consumer pour logisticien
export async function processLogisticianEvents() {
  const { Messages } = await sqsClient.send(new ReceiveMessageCommand({
    QueueUrl: process.env.SQS_LOGISTICIAN_QUEUE_URL,
    MaxNumberOfMessages: 10,
    WaitTimeSeconds: 20
  }));

  for (const message of Messages || []) {
    const event = JSON.parse(message.Body);

    switch (event.eventType) {
      case 'driver.approaching':
        await handleDriverApproaching(event.data);
        break;
      case 'driver.arrived':
        await handleDriverArrived(event.data);
        break;
      case 'order.created':
        await handleNewOrder(event.data);
        break;
    }

    // Supprimer message traite
    await sqsClient.send(new DeleteMessageCommand({
      QueueUrl: process.env.SQS_LOGISTICIAN_QUEUE_URL,
      ReceiptHandle: message.ReceiptHandle
    }));
  }
}
```

### 5.3.4 WebSocket Server

```javascript
// services/websocket-server/index.js

import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';

const wss = new WebSocketServer({ port: 8080 });
const clients = new Map(); // userId -> WebSocket

wss.on('connection', (ws, req) => {
  // Authentifier via token dans query string
  const token = new URL(req.url, 'http://localhost').searchParams.get('token');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    // Enregistrer client
    clients.set(userId, ws);

    ws.on('close', () => {
      clients.delete(userId);
    });

    ws.on('message', (data) => {
      // Traiter messages entrants (ping, etc.)
    });

  } catch (err) {
    ws.close(4001, 'Unauthorized');
  }
});

// Fonction pour envoyer notification a un user
export function notifyUser(userId, event) {
  const ws = clients.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

// Fonction pour notifier une organisation
export async function notifyOrganization(orgId, orgType, event) {
  // Trouver tous les users de cette org
  const members = await db.collection('logistician_team_members').find({
    logisticianId: new ObjectId(orgId),
    status: 'active'
  }).toArray();

  for (const member of members) {
    notifyUser(member.userId.toString(), event);
  }
}
```

### 5.3.5 Integration dans les Routes Existantes

```javascript
// Modification de logisticien-portal-routes.js

// POST /logistician-portal/rdv/:rdvId/refuse
router.post('/rdv/:rdvId/refuse', authenticateLogistician, async (req, res) => {
  const { rdvId } = req.params;
  const { reason, alternativeSlots } = req.body;

  // Mettre a jour RDV
  const rdv = await db.collection('rdv').findOneAndUpdate(
    { _id: new ObjectId(rdvId) },
    {
      $set: {
        status: 'refused',
        refusedReason: reason,
        alternativeSlots,
        refusedAt: new Date(),
        refusedBy: new ObjectId(req.user.id)
      }
    },
    { returnDocument: 'after' }
  );

  // NOUVEAU: Publier event
  await publishEvent('rdv.refused', {
    rdvId,
    orderId: rdv.value.orderId,
    reason,
    alternativeSlots,
    warehouseId: rdv.value.warehouseId
  }, [
    { type: 'transporter', id: rdv.value.carrierId },
    { type: 'industry', id: rdv.value.shipperId }
  ]);

  // NOUVEAU: Notification temps reel
  await notifyOrganization(rdv.value.carrierId, 'transporter', {
    type: 'rdv.refused',
    title: 'RDV refuse',
    message: `Votre RDV du ${formatDate(rdv.value.date)} a ete refuse: ${reason}`,
    data: { rdvId, alternativeSlots }
  });

  res.json({ message: 'RDV refuse', rdv: rdv.value });
});
```

## 5.4 Criteres de Validation

- [ ] Event publie quand RDV refuse
- [ ] Event publie quand alternative proposee
- [ ] Transporteur recoit notification temps reel
- [ ] Industriel recoit notification pour alertes ICPE
- [ ] Email envoye pour alertes critiques
- [ ] Logisticien recoit alert "chauffeur en approche"
- [ ] Audit trail de tous les events

---

# 6. MODULE 4: ALERTES CAPACITE ENTREPOT

## 6.1 Contexte

Les logisticiens doivent etre alertes quand leur capacite de stockage approche des seuils critiques, et les industriels doivent etre informes pour adapter leurs envois.

## 6.2 Specifications Fonctionnelles

### 6.2.1 Seuils d'Alerte

| Niveau | Seuil | Action |
|--------|-------|--------|
| Info | 60% | Notification logisticien |
| Warning | 80% | Notification logisticien + industriels |
| Critical | 95% | Blocage nouvelles commandes + alert tous |
| Full | 100% | Blocage total + alert urgente |

### 6.2.2 Calcul de Capacite

```
Capacite utilisee = Stock actuel + Commandes en transit (ETA < 48h)
Capacite disponible = Capacite max - Capacite utilisee
Pourcentage = (Capacite utilisee / Capacite max) * 100
```

### 6.2.3 Donnees Prises en Compte

- Surface entrepot (m2)
- Nombre emplacements palettes
- Stock actuel (palettes)
- Commandes en transit destination entrepot
- Reservations futures (<7 jours)

## 6.3 Specifications Techniques

### 6.3.1 Routes API

```javascript
// GET /api/logisticians/:id/warehouses/:warehouseId/capacity
// Capacite temps reel d'un entrepot
// Response: {
//   warehouseId, warehouseName,
//   maxCapacity: 500, // palettes
//   currentStock: 350,
//   inTransit: 45,
//   reserved: 20,
//   totalUsed: 415,
//   available: 85,
//   percentage: 83,
//   alertLevel: "warning",
//   alerts: [...]
// }

// GET /api/logisticians/:id/capacity/dashboard
// Dashboard capacite tous entrepots
// Response: { warehouses: [...], globalPercentage: 75, criticalWarehouses: 1 }

// POST /api/logisticians/:id/warehouses/:warehouseId/capacity/adjust
// Ajuster capacite manuellement (inventaire)
{
  "currentStock": 340,
  "reason": "Inventaire physique",
  "adjustedBy": "user_id"
}

// GET /api/logisticians/:id/capacity/forecast
// Prevision capacite 7 jours
// Response: { forecast: [{ date, projected, alertLevel }, ...] }
```

### 6.3.2 Schema MongoDB

```javascript
// Collection: warehouse_capacity
{
  _id: ObjectId,
  warehouseId: ObjectId,
  logisticianId: ObjectId,
  maxCapacity: 500,           // palettes max
  currentStock: 350,          // palettes actuelles
  lastStockUpdate: Date,
  lastStockUpdateBy: ObjectId,
  lastStockUpdateReason: String,
  settings: {
    infoThreshold: 60,
    warningThreshold: 80,
    criticalThreshold: 95,
    autoBlockAtCritical: true
  },
  createdAt: Date,
  updatedAt: Date
}

// Collection: warehouse_capacity_alerts
{
  _id: ObjectId,
  warehouseId: ObjectId,
  logisticianId: ObjectId,
  level: "info" | "warning" | "critical" | "full",
  percentage: 83,
  currentStock: 415,
  maxCapacity: 500,
  triggeredAt: Date,
  resolvedAt: Date,
  notifiedUsers: [ObjectId],
  notifiedIndustrials: [ObjectId]
}

// Collection: warehouse_capacity_history
{
  _id: ObjectId,
  warehouseId: ObjectId,
  date: Date,
  stock: 350,
  inTransit: 45,
  percentage: 79,
  createdAt: Date
}
```

### 6.3.3 Service de Calcul

```javascript
// services/subscriptions-contracts-eb/warehouse-capacity-service.js

export async function calculateWarehouseCapacity(warehouseId) {
  const warehouse = await db.collection('warehouse_capacity').findOne({
    warehouseId: new ObjectId(warehouseId)
  });

  if (!warehouse) {
    throw new Error('Warehouse capacity not configured');
  }

  // Stock actuel
  const currentStock = warehouse.currentStock;

  // Commandes en transit (destination = cet entrepot, ETA < 48h)
  const inTransitOrders = await db.collection('orders').find({
    'delivery.warehouseId': new ObjectId(warehouseId),
    status: 'in_transit',
    'tracking.eta': { $lt: new Date(Date.now() + 48 * 60 * 60 * 1000) }
  }).toArray();

  const inTransit = inTransitOrders.reduce((sum, order) => {
    return sum + (order.goods?.pallets || 0);
  }, 0);

  // Reservations futures (RDV confirmes < 7 jours)
  const reservations = await db.collection('rdv').find({
    warehouseId: new ObjectId(warehouseId),
    type: 'reception',
    status: 'confirmed',
    date: {
      $gte: new Date(),
      $lt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  }).toArray();

  const reserved = reservations.reduce((sum, rdv) => {
    return sum + (rdv.goods?.pallets || 0);
  }, 0);

  // Calculs
  const totalUsed = currentStock + inTransit;
  const available = Math.max(0, warehouse.maxCapacity - totalUsed);
  const percentage = Math.round((totalUsed / warehouse.maxCapacity) * 100);

  // Determiner niveau alerte
  let alertLevel = 'ok';
  if (percentage >= 100) alertLevel = 'full';
  else if (percentage >= warehouse.settings.criticalThreshold) alertLevel = 'critical';
  else if (percentage >= warehouse.settings.warningThreshold) alertLevel = 'warning';
  else if (percentage >= warehouse.settings.infoThreshold) alertLevel = 'info';

  return {
    warehouseId,
    maxCapacity: warehouse.maxCapacity,
    currentStock,
    inTransit,
    reserved,
    totalUsed,
    available,
    percentage,
    alertLevel,
    settings: warehouse.settings
  };
}

// Verifier et generer alertes si necessaire
export async function checkAndCreateCapacityAlerts() {
  const warehouses = await db.collection('warehouse_capacity').find({}).toArray();

  for (const warehouse of warehouses) {
    const capacity = await calculateWarehouseCapacity(warehouse.warehouseId);

    // Verifier si alert necessaire
    if (capacity.alertLevel !== 'ok') {
      // Verifier si alert deja existe (non resolue)
      const existingAlert = await db.collection('warehouse_capacity_alerts').findOne({
        warehouseId: warehouse.warehouseId,
        level: capacity.alertLevel,
        resolvedAt: null
      });

      if (!existingAlert) {
        // Creer nouvelle alert
        const alert = {
          warehouseId: warehouse.warehouseId,
          logisticianId: warehouse.logisticianId,
          level: capacity.alertLevel,
          percentage: capacity.percentage,
          currentStock: capacity.totalUsed,
          maxCapacity: capacity.maxCapacity,
          triggeredAt: new Date(),
          notifiedUsers: [],
          notifiedIndustrials: []
        };

        await db.collection('warehouse_capacity_alerts').insertOne(alert);

        // Notifier logisticien
        await notifyLogisticianCapacityAlert(warehouse.logisticianId, alert);

        // Si warning ou plus, notifier industriels
        if (['warning', 'critical', 'full'].includes(capacity.alertLevel)) {
          await notifyIndustrialsCapacityAlert(warehouse.logisticianId, warehouse.warehouseId, alert);
        }

        // Si critical, bloquer nouvelles commandes
        if (capacity.alertLevel === 'critical' && warehouse.settings.autoBlockAtCritical) {
          await blockNewOrdersToWarehouse(warehouse.warehouseId);
        }
      }
    } else {
      // Resoudre alertes existantes
      await db.collection('warehouse_capacity_alerts').updateMany(
        { warehouseId: warehouse.warehouseId, resolvedAt: null },
        { $set: { resolvedAt: new Date() } }
      );
    }

    // Enregistrer historique
    await db.collection('warehouse_capacity_history').insertOne({
      warehouseId: warehouse.warehouseId,
      date: new Date(),
      stock: capacity.currentStock,
      inTransit: capacity.inTransit,
      percentage: capacity.percentage,
      createdAt: new Date()
    });
  }
}

// Cron job: executer toutes les heures
// 0 * * * * node -e "require('./warehouse-capacity-service').checkAndCreateCapacityAlerts()"
```

### 6.3.4 Routes API Implementation

```javascript
// services/subscriptions-contracts-eb/warehouse-capacity-routes.js

import { Router } from 'express';
import { calculateWarehouseCapacity } from './warehouse-capacity-service.js';

const router = Router();

// GET /api/logisticians/:id/warehouses/:warehouseId/capacity
router.get('/:id/warehouses/:warehouseId/capacity', authenticateLogistician, async (req, res) => {
  const { warehouseId } = req.params;

  try {
    const capacity = await calculateWarehouseCapacity(warehouseId);

    // Recuperer alertes actives
    const alerts = await db.collection('warehouse_capacity_alerts')
      .find({ warehouseId: new ObjectId(warehouseId), resolvedAt: null })
      .sort({ triggeredAt: -1 })
      .toArray();

    res.json({ ...capacity, alerts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/logisticians/:id/capacity/dashboard
router.get('/:id/capacity/dashboard', authenticateLogistician, async (req, res) => {
  const logisticianId = req.params.id;

  const warehouses = await db.collection('warehouse_capacity')
    .find({ logisticianId: new ObjectId(logisticianId) })
    .toArray();

  const results = await Promise.all(
    warehouses.map(w => calculateWarehouseCapacity(w.warehouseId))
  );

  const criticalWarehouses = results.filter(r =>
    ['critical', 'full'].includes(r.alertLevel)
  ).length;

  const totalUsed = results.reduce((sum, r) => sum + r.totalUsed, 0);
  const totalMax = results.reduce((sum, r) => sum + r.maxCapacity, 0);
  const globalPercentage = Math.round((totalUsed / totalMax) * 100);

  res.json({
    warehouses: results,
    globalPercentage,
    criticalWarehouses,
    totalUsed,
    totalMax
  });
});

// POST /api/logisticians/:id/warehouses/:warehouseId/capacity/adjust
router.post('/:id/warehouses/:warehouseId/capacity/adjust', authenticateLogistician, async (req, res) => {
  const { warehouseId } = req.params;
  const { currentStock, reason } = req.body;

  await db.collection('warehouse_capacity').updateOne(
    { warehouseId: new ObjectId(warehouseId) },
    {
      $set: {
        currentStock,
        lastStockUpdate: new Date(),
        lastStockUpdateBy: new ObjectId(req.user.id),
        lastStockUpdateReason: reason,
        updatedAt: new Date()
      }
    }
  );

  // Recalculer et verifier alertes
  await checkAndCreateCapacityAlerts();

  // Log audit
  await logEvent('capacity.adjusted', req.params.id, { warehouseId, currentStock, reason });

  res.json({ message: 'Capacite ajustee' });
});

// GET /api/logisticians/:id/capacity/forecast
router.get('/:id/capacity/forecast', authenticateLogistician, async (req, res) => {
  const logisticianId = req.params.id;

  const warehouses = await db.collection('warehouse_capacity')
    .find({ logisticianId: new ObjectId(logisticianId) })
    .toArray();

  const forecast = [];

  for (let day = 0; day < 7; day++) {
    const date = new Date(Date.now() + day * 24 * 60 * 60 * 1000);
    date.setHours(0, 0, 0, 0);

    let totalProjected = 0;
    let totalMax = 0;

    for (const warehouse of warehouses) {
      // Stock actuel
      let projected = warehouse.currentStock;

      // + Arrivees prevues ce jour
      const arrivals = await db.collection('rdv').find({
        warehouseId: warehouse.warehouseId,
        type: 'reception',
        status: 'confirmed',
        date: {
          $gte: date,
          $lt: new Date(date.getTime() + 24 * 60 * 60 * 1000)
        }
      }).toArray();

      projected += arrivals.reduce((sum, rdv) => sum + (rdv.goods?.pallets || 0), 0);

      // - Expeditions prevues ce jour
      const expeditions = await db.collection('rdv').find({
        warehouseId: warehouse.warehouseId,
        type: 'expedition',
        status: 'confirmed',
        date: {
          $gte: date,
          $lt: new Date(date.getTime() + 24 * 60 * 60 * 1000)
        }
      }).toArray();

      projected -= expeditions.reduce((sum, rdv) => sum + (rdv.goods?.pallets || 0), 0);

      totalProjected += Math.max(0, projected);
      totalMax += warehouse.maxCapacity;
    }

    const percentage = Math.round((totalProjected / totalMax) * 100);
    let alertLevel = 'ok';
    if (percentage >= 95) alertLevel = 'critical';
    else if (percentage >= 80) alertLevel = 'warning';
    else if (percentage >= 60) alertLevel = 'info';

    forecast.push({
      date: date.toISOString().split('T')[0],
      projected: totalProjected,
      maxCapacity: totalMax,
      percentage,
      alertLevel
    });
  }

  res.json({ forecast });
});

export default router;
```

## 6.4 Criteres de Validation

- [ ] Calcul capacite temps reel correct
- [ ] Alertes generees aux bons seuils
- [ ] Logisticien notifie a tous les niveaux
- [ ] Industriels notifies a partir de warning
- [ ] Blocage auto a critical si configure
- [ ] Ajustement manuel fonctionne
- [ ] Prevision 7 jours coherente
- [ ] Historique enregistre

---

# 7. MODULE 5: TRACKING LOGISTICIEN

## 7.1 Contexte

Les logisticiens ont besoin de visibilite sur les chauffeurs en approche pour preparer la reception.

## 7.2 Specifications Fonctionnelles

### 7.2.1 Visibilite Limitee

Le logisticien voit UNIQUEMENT:
- Chauffeurs avec RDV confirme dans son entrepot
- Position dans un rayon de 50km de l'entrepot
- ETA calculee

### 7.2.2 Alertes Approche

| Distance | Temps estime | Action |
|----------|--------------|--------|
| 50 km | ~45 min | Notification "En approche" |
| 20 km | ~20 min | Notification "Arrivee imminente" |
| 2 km | ~5 min | Notification "Presque arrive" |
| Arrive | 0 min | Notification "Chauffeur arrive" + Check-in auto |

## 7.3 Specifications Techniques

### 7.3.1 Routes API

```javascript
// GET /api/logisticians/:id/tracking/incoming
// Liste chauffeurs en approche
// Response: {
//   drivers: [{
//     rdvId, driverName, vehiclePlate, carrierName,
//     currentPosition: { lat, lng, updatedAt },
//     distanceKm: 35,
//     etaMinutes: 40,
//     rdvTime: "10:00-12:00",
//     status: "approaching" | "imminent" | "arrived"
//   }]
// }

// GET /api/logisticians/:id/tracking/driver/:rdvId
// Detail position d'un chauffeur specifique
// Response: { position, route, eta, rdv }

// WebSocket: /ws/logistician/:logisticianId/tracking
// Stream temps reel des positions
```

### 7.3.2 Implementation

```javascript
// services/subscriptions-contracts-eb/logistician-tracking-routes.js

import { Router } from 'express';
import { calculateDistance, calculateETA } from './geo-utils.js';

const router = Router();

// GET /api/logisticians/:id/tracking/incoming
router.get('/:id/tracking/incoming', authenticateLogistician, async (req, res) => {
  const logisticianId = req.params.id;

  // Recuperer entrepots du logisticien
  const logistician = await db.collection('logisticians').findOne({
    _id: new ObjectId(logisticianId)
  });

  const warehouseIds = logistician.warehouses.map(w => w.warehouseId);

  // RDV confirmes aujourd'hui/demain
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);

  const rdvs = await db.collection('rdv').find({
    warehouseId: { $in: warehouseIds },
    status: 'confirmed',
    type: 'reception',
    date: { $gte: today, $lt: tomorrow }
  }).toArray();

  const drivers = [];

  for (const rdv of rdvs) {
    // Recuperer derniere position du chauffeur
    const position = await db.collection('tracking_positions').findOne(
      {
        orderId: rdv.orderId,
        timestamp: { $gte: new Date(Date.now() - 30 * 60 * 1000) } // <30 min
      },
      { sort: { timestamp: -1 } }
    );

    if (!position) continue;

    // Recuperer coordonnees entrepot
    const warehouse = logistician.warehouses.find(
      w => w.warehouseId.equals(rdv.warehouseId)
    );

    if (!warehouse?.coordinates) continue;

    // Calculer distance
    const distanceKm = calculateDistance(
      position.lat, position.lng,
      warehouse.coordinates.lat, warehouse.coordinates.lng
    );

    // Limiter a 50km
    if (distanceKm > 50) continue;

    // Calculer ETA
    const etaMinutes = calculateETA(distanceKm);

    // Determiner statut
    let status = 'approaching';
    if (distanceKm <= 2) status = 'arrived';
    else if (distanceKm <= 20) status = 'imminent';

    // Recuperer infos transporteur
    const order = await db.collection('orders').findOne({ _id: rdv.orderId });

    drivers.push({
      rdvId: rdv._id,
      orderId: rdv.orderId,
      orderNumber: order?.orderNumber,
      driverName: rdv.driverName,
      vehiclePlate: rdv.vehiclePlate,
      carrierName: order?.carrierName,
      currentPosition: {
        lat: position.lat,
        lng: position.lng,
        updatedAt: position.timestamp
      },
      distanceKm: Math.round(distanceKm * 10) / 10,
      etaMinutes,
      rdvDate: rdv.date,
      rdvTime: rdv.timeSlot,
      warehouseName: warehouse.name,
      status,
      goods: rdv.goods
    });
  }

  // Trier par ETA
  drivers.sort((a, b) => a.etaMinutes - b.etaMinutes);

  res.json({ drivers });
});

// Utility functions
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Rayon Terre en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function calculateETA(distanceKm) {
  // Vitesse moyenne 50 km/h en zone peri-urbaine
  return Math.round(distanceKm / 50 * 60);
}

export default router;
```

### 7.3.3 Alertes Approche (Event-Driven)

```javascript
// services/tracking-api/approach-detector.js

// Executee quand nouvelle position recue
export async function checkApproachAlerts(position) {
  const { orderId, lat, lng } = position;

  // Trouver RDV associe
  const rdv = await db.collection('rdv').findOne({
    orderId: new ObjectId(orderId),
    status: 'confirmed'
  });

  if (!rdv) return;

  // Recuperer entrepot
  const logistician = await db.collection('logisticians').findOne({
    'warehouses.warehouseId': rdv.warehouseId
  });

  const warehouse = logistician?.warehouses.find(
    w => w.warehouseId.equals(rdv.warehouseId)
  );

  if (!warehouse?.coordinates) return;

  const distance = calculateDistance(
    lat, lng,
    warehouse.coordinates.lat, warehouse.coordinates.lng
  );

  // Determiner si alert necessaire
  const alertThresholds = [
    { distance: 50, type: 'approaching', message: 'Chauffeur en approche' },
    { distance: 20, type: 'imminent', message: 'Arrivee imminente' },
    { distance: 2, type: 'arrived', message: 'Chauffeur arrive' }
  ];

  for (const threshold of alertThresholds) {
    if (distance <= threshold.distance) {
      // Verifier si alert deja envoyee
      const existingAlert = await db.collection('approach_alerts').findOne({
        rdvId: rdv._id,
        type: threshold.type
      });

      if (!existingAlert) {
        // Creer alert
        await db.collection('approach_alerts').insertOne({
          rdvId: rdv._id,
          orderId,
          logisticianId: logistician._id,
          warehouseId: rdv.warehouseId,
          type: threshold.type,
          distance,
          createdAt: new Date()
        });

        // Publier event
        await publishEvent(`driver.${threshold.type}`, {
          rdvId: rdv._id,
          orderId,
          driverName: rdv.driverName,
          vehiclePlate: rdv.vehiclePlate,
          distance,
          warehouseName: warehouse.name
        }, [
          { type: 'logistician', id: logistician._id }
        ]);

        // Si arrive, mettre a jour statut RDV
        if (threshold.type === 'arrived') {
          await db.collection('rdv').updateOne(
            { _id: rdv._id },
            { $set: { status: 'driver_arrived', arrivedAt: new Date() } }
          );
        }
      }

      break; // Une seule alert par position
    }
  }
}
```

## 7.4 Criteres de Validation

- [ ] Liste chauffeurs en approche correcte
- [ ] Distance calculee avec precision
- [ ] ETA coherente
- [ ] Alert "approaching" a 50km
- [ ] Alert "imminent" a 20km
- [ ] Alert "arrived" a 2km
- [ ] Notification temps reel WebSocket
- [ ] Check-in auto a l'arrivee

---

# 8. MODULE 6: FACTURATION COMPLETE

## 8.1 Contexte

La facturation doit etre automatisee: prefactures generees a partir des e-CMR, factures emises, paiements suivis.

## 8.2 Specifications Fonctionnelles

### 8.2.1 Flux de Facturation

```
1. e-CMR signe (livraison completee)
2. Generation prefacture automatique
3. Validation prefacture par industriel
4. Generation facture
5. Envoi facture (email + portail)
6. Suivi paiement
7. Relances automatiques
```

### 8.2.2 Types de Factures

| Type | Emetteur | Destinataire |
|------|----------|--------------|
| Transport | Transporteur | Industriel |
| Logistique | Logisticien | Industriel |
| Options | SYMPHONI.A | Logisticien |

## 8.3 Specifications Techniques

### 8.3.1 Routes API

```javascript
// === PREFACTURES ===

// GET /api/logisticians/:id/prefactures
// Liste prefactures du logisticien
// Query: ?status=pending_validation&month=2025-01

// POST /api/logisticians/:id/prefactures/generate
// Generer prefacture pour une periode
{
  "delegationId": "xxx",
  "period": { "start": "2025-01-01", "end": "2025-01-31" }
}

// GET /api/logisticians/:id/prefactures/:prefactureId
// Detail prefacture avec lignes

// PUT /api/logisticians/:id/prefactures/:prefactureId
// Modifier prefacture (avant validation)

// POST /api/logisticians/:id/prefactures/:prefactureId/validate
// Valider prefacture -> genere facture

// POST /api/logisticians/:id/prefactures/:prefactureId/dispute
// Contester prefacture
{
  "reason": "Quantite incorrecte",
  "lines": [{ "lineId": "xxx", "contestedAmount": 100, "comment": "..." }]
}

// === FACTURES ===

// GET /api/logisticians/:id/invoices
// Liste factures emises/recues
// Query: ?type=logistique&status=pending&month=2025-01

// GET /api/logisticians/:id/invoices/:invoiceId
// Detail facture

// GET /api/logisticians/:id/invoices/:invoiceId/pdf
// Telecharger PDF

// POST /api/logisticians/:id/invoices/:invoiceId/send
// Envoyer facture par email

// === PAIEMENTS ===

// GET /api/logisticians/:id/payments
// Historique paiements

// POST /api/logisticians/:id/invoices/:invoiceId/payment
// Enregistrer paiement recu
{
  "amount": 8533.80,
  "method": "virement",
  "reference": "VIR-2025-001",
  "paidAt": "2025-01-15"
}

// === STATS ===

// GET /api/logisticians/:id/billing/stats
// Statistiques facturation
// Response: {
//   currentMonth: { invoiced: 25000, paid: 20000, pending: 5000 },
//   avgPaymentDays: 12,
//   overdueAmount: 3500
// }
```

### 8.3.2 Schema MongoDB

```javascript
// Collection: logistician_invoices
{
  _id: ObjectId,
  invoiceNumber: "FAC-LOG-2025-0001",
  type: "logistique",
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled",

  // Emetteur
  issuerId: ObjectId,
  issuerType: "logistician",
  issuerName: "LogiStock Entrepots",
  issuerSiret: "44444444444444",
  issuerVat: "FR44444444444",
  issuerAddress: {...},

  // Destinataire
  recipientId: ObjectId,
  recipientType: "industry",
  recipientName: "ACME Industries",
  recipientSiret: "12345678901234",
  recipientVat: "FR12345678901",
  recipientAddress: {...},

  // Delegation/Contrat
  delegationId: ObjectId,
  period: { start: Date, end: Date },

  // Lignes
  lines: [
    {
      _id: ObjectId,
      description: "Stockage palettes (85 palettes x 31 jours)",
      quantity: 2635,
      unit: "palette-jour",
      unitPrice: 2.5,
      vatRate: 20,
      amountHT: 6587.5,
      amountTTC: 7905
    }
  ],

  // Totaux
  subtotalHT: 7111.5,
  vatAmount: 1422.3,
  totalTTC: 8533.8,
  currency: "EUR",

  // Dates
  issueDate: Date,
  dueDate: Date,
  sentAt: Date,
  paidAt: Date,

  // Paiement
  paymentMethod: "virement",
  paymentReference: "VIR-2025-001",

  // Documents
  pdfUrl: "/invoices/FAC-LOG-2025-0001.pdf",
  prefactureId: ObjectId,

  // Metadata
  createdAt: Date,
  createdBy: ObjectId,
  updatedAt: Date
}

// Collection: logistician_prefactures
{
  _id: ObjectId,
  prefactureNumber: "PRE-LOG-2025-0001",
  status: "draft" | "pending_validation" | "validated" | "disputed" | "invoiced",

  logisticianId: ObjectId,
  industryId: ObjectId,
  delegationId: ObjectId,
  period: { start: Date, end: Date },

  lines: [...],

  subtotalHT: Number,
  vatAmount: Number,
  totalTTC: Number,

  // Validation
  validatedAt: Date,
  validatedBy: ObjectId,

  // Contestation
  dispute: {
    reason: String,
    lines: [{lineId, contestedAmount, comment}],
    createdAt: Date,
    resolvedAt: Date
  },

  invoiceId: ObjectId, // Ref vers facture generee

  createdAt: Date,
  createdBy: ObjectId
}
```

### 8.3.3 Generation Automatique Prefacture

```javascript
// services/subscriptions-contracts-eb/billing-service.js

export async function generateLogisticsPrefacture(delegationId, period) {
  const delegation = await db.collection('delegations').findOne({
    _id: new ObjectId(delegationId)
  });

  if (!delegation) throw new Error('Delegation not found');

  const { start, end } = period;
  const lines = [];

  // 1. Calculer stockage
  const stockHistory = await db.collection('warehouse_capacity_history').find({
    warehouseId: delegation.warehouse.warehouseId,
    date: { $gte: new Date(start), $lte: new Date(end) }
  }).toArray();

  const avgPallets = stockHistory.reduce((sum, h) => sum + h.stock, 0) / stockHistory.length;
  const days = Math.ceil((new Date(end) - new Date(start)) / (24 * 60 * 60 * 1000));
  const paletteDays = Math.round(avgPallets * days);

  lines.push({
    _id: new ObjectId(),
    description: `Stockage palettes (${Math.round(avgPallets)} palettes x ${days} jours)`,
    quantity: paletteDays,
    unit: 'palette-jour',
    unitPrice: delegation.pricing.storagePerPallet,
    vatRate: 20,
    amountHT: paletteDays * delegation.pricing.storagePerPallet
  });

  // 2. Calculer manutention entree
  const receptions = await db.collection('rdv').countDocuments({
    warehouseId: delegation.warehouse.warehouseId,
    type: 'reception',
    status: 'completed',
    date: { $gte: new Date(start), $lte: new Date(end) }
  });

  if (receptions > 0) {
    lines.push({
      _id: new ObjectId(),
      description: 'Manutention entree',
      quantity: receptions,
      unit: 'operation',
      unitPrice: delegation.pricing.handlingIn,
      vatRate: 20,
      amountHT: receptions * delegation.pricing.handlingIn
    });
  }

  // 3. Calculer manutention sortie
  const expeditions = await db.collection('rdv').countDocuments({
    warehouseId: delegation.warehouse.warehouseId,
    type: 'expedition',
    status: 'completed',
    date: { $gte: new Date(start), $lte: new Date(end) }
  });

  if (expeditions > 0) {
    lines.push({
      _id: new ObjectId(),
      description: 'Manutention sortie',
      quantity: expeditions,
      unit: 'operation',
      unitPrice: delegation.pricing.handlingOut,
      vatRate: 20,
      amountHT: expeditions * delegation.pricing.handlingOut
    });
  }

  // 4. Calculer picking (si applicable)
  if (delegation.pricing.pickingPerLine) {
    const pickingLines = await db.collection('picking_orders').aggregate([
      {
        $match: {
          warehouseId: delegation.warehouse.warehouseId,
          completedAt: { $gte: new Date(start), $lte: new Date(end) }
        }
      },
      {
        $group: { _id: null, totalLines: { $sum: '$linesCount' } }
      }
    ]).toArray();

    const totalPickingLines = pickingLines[0]?.totalLines || 0;

    if (totalPickingLines > 0) {
      lines.push({
        _id: new ObjectId(),
        description: 'Picking (lignes)',
        quantity: totalPickingLines,
        unit: 'ligne',
        unitPrice: delegation.pricing.pickingPerLine,
        vatRate: 20,
        amountHT: totalPickingLines * delegation.pricing.pickingPerLine
      });
    }
  }

  // Calculer totaux
  const subtotalHT = lines.reduce((sum, l) => sum + l.amountHT, 0);
  const vatAmount = subtotalHT * 0.2;
  const totalTTC = subtotalHT + vatAmount;

  // Generer numero
  const lastPrefacture = await db.collection('logistician_prefactures')
    .findOne({}, { sort: { createdAt: -1 } });
  const lastNum = lastPrefacture
    ? parseInt(lastPrefacture.prefactureNumber.split('-').pop())
    : 0;
  const prefactureNumber = `PRE-LOG-2025-${String(lastNum + 1).padStart(4, '0')}`;

  // Creer prefacture
  const prefacture = {
    prefactureNumber,
    status: 'pending_validation',
    logisticianId: delegation.logisticianId,
    logisticianName: delegation.logisticianName,
    industryId: delegation.industryId,
    industryName: delegation.industryName,
    delegationId: delegation._id,
    period: { start: new Date(start), end: new Date(end) },
    lines,
    subtotalHT: Math.round(subtotalHT * 100) / 100,
    vatAmount: Math.round(vatAmount * 100) / 100,
    totalTTC: Math.round(totalTTC * 100) / 100,
    currency: 'EUR',
    createdAt: new Date()
  };

  await db.collection('logistician_prefactures').insertOne(prefacture);

  // Notifier industriel
  await publishEvent('prefacture.created', {
    prefactureId: prefacture._id,
    prefactureNumber,
    totalTTC,
    period
  }, [
    { type: 'industry', id: delegation.industryId }
  ]);

  return prefacture;
}

// Cron: generer prefactures le 1er de chaque mois
// 0 0 1 * * node -e "require('./billing-service').generateMonthlyPrefactures()"
```

## 8.4 Criteres de Validation

- [ ] Prefacture generee automatiquement
- [ ] Calculs stockage corrects
- [ ] Calculs manutention corrects
- [ ] Validation par industriel fonctionne
- [ ] Facture generee apres validation
- [ ] PDF facture genere
- [ ] Email envoi fonctionne
- [ ] Enregistrement paiement fonctionne
- [ ] Stats facturation correctes
- [ ] Relances automatiques

---

# 9. MODULE 7: COMPLIANCE DREAL

## 9.1 Contexte

Les logisticiens ICPE doivent transmettre des rapports periodiques a la DREAL.

## 9.2 Specifications Fonctionnelles

### 9.2.1 Rapports Obligatoires

| Rapport | Frequence | Contenu |
|---------|-----------|---------|
| Declaration annuelle | Annuel | Volumes par rubrique |
| Bilan exploitation | Annuel | Incidents, mesures |
| Declaration triennale | 3 ans | Renouvellement autorisation |

### 9.2.2 Alertes

- 60 jours avant echeance declaration
- 30 jours avant echeance (rappel)
- 7 jours avant echeance (urgent)

## 9.3 Specifications Techniques

### 9.3.1 Routes API

```javascript
// GET /api/logisticians/:id/dreal/reports
// Liste rapports DREAL

// POST /api/logisticians/:id/dreal/reports/generate
// Generer rapport annuel
{
  "type": "declaration_annuelle",
  "year": 2024,
  "warehouseId": "xxx"
}

// GET /api/logisticians/:id/dreal/reports/:reportId/pdf
// Telecharger PDF rapport

// GET /api/logisticians/:id/dreal/deadlines
// Echeances a venir

// POST /api/logisticians/:id/dreal/reports/:reportId/submit
// Marquer comme soumis a la DREAL
```

### 9.3.2 Schema MongoDB

```javascript
// Collection: dreal_reports
{
  _id: ObjectId,
  type: "declaration_annuelle" | "bilan_exploitation" | "declaration_triennale",
  year: 2024,
  logisticianId: ObjectId,
  warehouseId: ObjectId,
  icpeNumber: "ICPE-69-2024-001",

  status: "draft" | "generated" | "submitted" | "validated",

  data: {
    // Pour declaration annuelle
    volumes: [
      { rubrique: "1510", quantity: 45000, unit: "m3" },
      { rubrique: "2662", quantity: 15000, unit: "kg" }
    ],
    incidents: [],
    measures: []
  },

  pdfUrl: "/dreal/reports/...",

  submittedAt: Date,
  submittedBy: ObjectId,
  validatedAt: Date,

  deadline: Date,

  createdAt: Date
}

// Collection: dreal_deadlines
{
  _id: ObjectId,
  logisticianId: ObjectId,
  warehouseId: ObjectId,
  type: "declaration_annuelle",
  deadline: Date,
  status: "upcoming" | "due" | "overdue" | "completed",
  notificationsSent: [
    { type: "60_days", sentAt: Date },
    { type: "30_days", sentAt: Date }
  ]
}
```

## 9.4 Criteres de Validation

- [ ] Rapport annuel genere avec bonnes donnees
- [ ] PDF conforme format DREAL
- [ ] Alertes envoyees aux bonnes echeances
- [ ] Historique rapports consultable
- [ ] Marquage soumission fonctionne

---

# 10. INTERACTIONS INTER-MODULES

## 10.1 Matrice d'Interactions

```
                    LOGISTICIEN  INDUSTRIEL  TRANSPORTEUR  CHAUFFEUR
LOGISTICIEN              -           ←→            ←→          ←
INDUSTRIEL              ←→            -            ←→          ←
TRANSPORTEUR            ←→           ←→             -          ←→
CHAUFFEUR                →            →            ←→           -

←→ = bidirectionnel
← = reçoit
→ = envoie
```

## 10.2 Events par Module

### 10.2.1 Module RDV

| Event | Source | Destinations |
|-------|--------|--------------|
| rdv.requested | Transporteur | Logisticien |
| rdv.confirmed | Logisticien | Transporteur, Industriel |
| rdv.refused | Logisticien | Transporteur |
| rdv.alternative_proposed | Logisticien | Transporteur |
| rdv.cancelled | Transporteur/Logisticien | Autre partie |

### 10.2.2 Module ICPE

| Event | Source | Destinations |
|-------|--------|--------------|
| icpe.alert_warning | Logisticien | Industriel |
| icpe.alert_critical | Logisticien | Industriel |
| icpe.non_compliant | Logisticien | Industriel |
| icpe.compliant_again | Logisticien | Industriel |

### 10.2.3 Module Capacite

| Event | Source | Destinations |
|-------|--------|--------------|
| capacity.warning | Logisticien | Industriel |
| capacity.critical | Logisticien | Industriel |
| capacity.full | Logisticien | Industriel |
| capacity.available | Logisticien | Industriel |

### 10.2.4 Module Tracking

| Event | Source | Destinations |
|-------|--------|--------------|
| driver.approaching | Transporteur | Logisticien |
| driver.imminent | Transporteur | Logisticien |
| driver.arrived | Transporteur | Logisticien |
| driver.departed | Transporteur | Logisticien |

### 10.2.5 Module e-CMR

| Event | Source | Destinations |
|-------|--------|--------------|
| ecmr.created | Transporteur | Logisticien, Industriel |
| ecmr.signed_pickup | Chauffeur | Logisticien, Industriel |
| ecmr.signed_delivery | Logisticien | Transporteur, Industriel |
| ecmr.completed | Systeme | Tous |

### 10.2.6 Module Facturation

| Event | Source | Destinations |
|-------|--------|--------------|
| prefacture.created | Logisticien | Industriel |
| prefacture.disputed | Industriel | Logisticien |
| prefacture.validated | Industriel | Logisticien |
| invoice.sent | Logisticien | Industriel |
| invoice.paid | Industriel | Logisticien |
| invoice.overdue | Systeme | Logisticien, Industriel |

## 10.3 Implementation Event Router

```javascript
// services/common/event-router.js

const eventRoutes = {
  // RDV
  'rdv.confirmed': ['transporter', 'industry'],
  'rdv.refused': ['transporter'],
  'rdv.alternative_proposed': ['transporter'],

  // ICPE
  'icpe.alert_warning': ['industry'],
  'icpe.alert_critical': ['industry'],
  'icpe.non_compliant': ['industry'],

  // Capacite
  'capacity.warning': ['industry'],
  'capacity.critical': ['industry'],
  'capacity.full': ['industry'],

  // Tracking
  'driver.approaching': ['logistician'],
  'driver.imminent': ['logistician'],
  'driver.arrived': ['logistician'],

  // e-CMR
  'ecmr.signed_delivery': ['transporter', 'industry'],
  'ecmr.completed': ['transporter', 'industry', 'logistician'],

  // Facturation
  'prefacture.created': ['industry'],
  'prefacture.validated': ['logistician'],
  'invoice.sent': ['industry'],
  'invoice.overdue': ['logistician', 'industry']
};

export function getRecipientTypes(eventType) {
  return eventRoutes[eventType] || [];
}
```

---

# 11. TESTS ET VALIDATION

## 11.1 Tests Unitaires

Chaque module doit avoir une couverture minimale de 80%.

```javascript
// Exemple structure tests
tests/
├── unit/
│   ├── stripe-integration.test.js
│   ├── team-management.test.js
│   ├── webhook-events.test.js
│   ├── capacity-alerts.test.js
│   ├── tracking.test.js
│   └── billing.test.js
├── integration/
│   ├── logistician-flow.test.js
│   ├── rdv-workflow.test.js
│   └── billing-workflow.test.js
└── e2e/
    └── logistician-portal.test.js
```

## 11.2 Tests d'Integration

| Scenario | Modules Impliques |
|----------|-------------------|
| Onboarding complet | Auth, Logisticien, Documents |
| Cycle RDV complet | RDV, Notifications, Tracking |
| Cycle facturation | Prefacture, Facture, Paiement |
| Alerte capacite | Capacite, Notifications, Commandes |

## 11.3 Criteres d'Acceptation

- [ ] Tous les tests unitaires passent
- [ ] Tous les tests d'integration passent
- [ ] Performance: temps reponse API < 500ms
- [ ] Securite: audit OWASP passe
- [ ] Documentation API a jour (Swagger)

---

# 12. PLANNING ET PRIORITES

## 12.1 Phase 1: Critique (Semaines 1-2)

| Module | Effort | Priorite |
|--------|--------|----------|
| Integration Stripe | 3 jours | P0 |
| Webhooks bidirectionnels | 3 jours | P0 |
| Alertes capacite | 2 jours | P0 |

**Livrable**: Options payantes fonctionnelles, notifications temps reel

## 12.2 Phase 2: Haute (Semaines 3-4)

| Module | Effort | Priorite |
|--------|--------|----------|
| Gestion sub-utilisateurs | 3 jours | P1 |
| Tracking logisticien | 2 jours | P1 |
| Facturation complete | 4 jours | P1 |

**Livrable**: Gestion equipe, visibilite tracking, facturation auto

## 12.3 Phase 3: Moyenne (Semaines 5-6)

| Module | Effort | Priorite |
|--------|--------|----------|
| Compliance DREAL | 3 jours | P2 |
| Analytics avances | 2 jours | P2 |
| Optimisations perf | 2 jours | P2 |

**Livrable**: Rapports DREAL, dashboards avances

## 12.4 Ressources Necessaires

| Role | Temps |
|------|-------|
| Backend Developer | 6 semaines |
| Frontend Developer | 4 semaines |
| QA Engineer | 2 semaines |
| DevOps | 1 semaine |

---

# ANNEXES

## A. Variables d'Environnement

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_BOURSE_STOCKAGE=price_xxx
STRIPE_PRICE_BORNE_ACCUEIL=price_xxx

# AWS
AWS_REGION=eu-west-3
SNS_EVENTS_TOPIC_ARN=arn:aws:sns:...
SQS_LOGISTICIAN_QUEUE_URL=https://sqs...

# WebSocket
WEBSOCKET_SERVER_URL=wss://ws.symphonia.com

# URLs
LOGISTICIAN_PORTAL_URL=https://logistician.symphonia-controltower.com
```

## B. Codes d'Erreur API

| Code | Message | Description |
|------|---------|-------------|
| LOG001 | Logisticien non trouve | ID invalide |
| LOG002 | Acces refuse | Permissions insuffisantes |
| LOG003 | Limite collaborateurs | Plan atteint |
| CAP001 | Entrepot sature | Capacite 100% |
| STR001 | Paiement echoue | Erreur Stripe |
| RDV001 | Creneau indisponible | Slot deja pris |

## C. Format Webhook Stripe

```javascript
{
  id: "evt_xxx",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_xxx",
      customer: "cus_xxx",
      subscription: "sub_xxx",
      metadata: {
        logisticianId: "xxx",
        option: "bourse_stockage"
      }
    }
  }
}
```

---

**Document cree le**: 8 Janvier 2025
**Version**: 1.0
**Auteur**: SYMPHONI.A Development Team
