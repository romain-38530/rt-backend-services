# Système d'Invitation Transporteurs Dashdoc → Symphonia

## Vue d'Ensemble

Ce système permet d'inviter automatiquement les transporteurs identifiés dans Dashdoc à rejoindre SYMPHONI.A, en leur proposant :
- **Leurs historiques de routes réalisées**
- **Les prix qu'ils ont déjà pratiqués avec dates**
- **Un accès privilégié aux offres sur leurs routes**

## Types d'Invitations

### TYPE 1 : Transporteur Connu avec Historique

**Cible** : Transporteurs présents dans Dashdoc (avec historique complet) mais **PAS encore inscrits** sur Symphonia.

**Contenu de l'email** :
- ✅ Personnalisation avec nom + contact
- ✅ Nombre total de transports réalisés
- ✅ Top 5 routes récentes avec prix et dates
- ✅ Prix moyen pratiqué
- ✅ Argument de négociation : "Vous avez réalisé cette route à 450€ le 15/01/2025"
- ✅ Lien vers inscription/connexion Symphonia

**Couloir d'intégration** :
1. Si **totalement inconnu** → Processus d'inscription Vigilance (upload documents, scoring)
2. Si **déjà connu** (email/SIREN dans base) → Lien direct vers espace transporteur

**Exemple** :
```
Bonjour Mohamed SOLTANI,

Nous avons analysé vos 47 transports réalisés et identifié plusieurs
opportunités sur vos routes habituelles.

Vos Routes Principales:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Saint-Georges (38790) → Saint-Quentin (38070)
12€ • Réalisé le 02/02/2026

Marseille (13000) → Lyon (69000)
420€ • Réalisé le 28/01/2026

Pourquoi rejoindre SYMPHONI.A ?
✅ Accès prioritaire aux offres sur vos routes habituelles
✅ Négociation intelligente basée sur vos prix historiques
✅ Zéro commission sur les 10 premiers transports
✅ Paiement garanti sous 30 jours

[Accéder à mon espace SYMPHONI.A]
```

---

### TYPE 2 : Conquête Pure

**Cible** : Transporteurs **non connus** dans Symphonia, mais détectés comme actifs sur des routes où nous avons des offres disponibles.

**Contenu de l'email** :
- ✅ Personnalisation avec nom entreprise
- ✅ Liste des offres disponibles sur leurs routes
- ✅ Offre de lancement : 10 transports sans commission
- ✅ Présentation Affret.IA (matching automatique)
- ✅ Lien d'inscription Vigilance

**Couloir d'intégration** :
- **Toujours** → Processus d'inscription Vigilance complet

**Exemple** :
```
Bonjour MENIER TRANSPORTS,

Nous avons détecté que vous réalisez régulièrement des transports sur
des routes où nous avons actuellement 5 offres disponibles.

Offres Disponibles sur Vos Routes:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[URGENT] [Chargement 05/02/2026]
Lyon (69000) → Paris (75000)
850€ • 28 palettes • 19000 kg

💰 Offre de Lancement Exclusive:
• 10 premiers transports SANS COMMISSION
• Accès immédiat aux offres sur vos routes
• Paiement garanti sous 30 jours
• Aucun engagement, aucun abonnement

[Créer mon compte gratuitement]
```

---

## Architecture Technique

### Service Principal

**Fichier** : `services/dashdoc-carrier-invitation.service.js`

**Méthodes Principales** :

```javascript
// 1. Identifier carriers Dashdoc non présents dans Symphonia
await DashdocCarrierInvitationService.identifyDashdocCarriersNotInSymphonia();

// 2. Envoyer invitation TYPE 1 (transporteur connu)
await DashdocCarrierInvitationService.sendInvitationToKnownCarrier(
  carrierData,
  { dryRun: false }
);

// 3. Envoyer invitation TYPE 2 (conquête)
await DashdocCarrierInvitationService.sendConquestEmailToCarrier(
  carrierData,
  availableOrders,
  { dryRun: false }
);

// 4. Campagne massive
await DashdocCarrierInvitationService.runInvitationCampaign({
  type: 'known',
  maxInvitations: 100,
  delayBetweenEmails: 2000,
  dryRun: false
});
```

---

### Routes API

**Fichier** : `routes/dashdoc-invitations.routes.js`

#### GET /api/v1/dashdoc-invitations/carriers/not-in-symphonia

Identifier les transporteurs Dashdoc qui ne sont pas dans Symphonia.

**Réponse** :
```json
{
  "success": true,
  "total": 150,
  "notInSymphonia": 87,
  "carriers": [
    {
      "_id": "dashdoc-3991213",
      "carrierName": "MENIER TRANSPORTS",
      "carrierEmail": "elbad69@hotmail.fr",
      "carrierPhone": "+33678378662",
      "totalTransports": 47,
      "routes": [
        {
          "from": "38790",
          "fromCity": "Saint-Georges",
          "to": "38070",
          "toCity": "Saint-Quentin",
          "price": 12,
          "date": "2026-02-02T..."
        }
      ],
      "avgPrice": 384.5
    }
  ]
}
```

---

#### POST /api/v1/dashdoc-invitations/send-known-carrier

Envoyer une invitation TYPE 1 à un transporteur spécifique.

**Body** :
```json
{
  "carrierId": "dashdoc-3991213",
  "dryRun": false
}
```

**Réponse** :
```json
{
  "success": true,
  "carrierEmail": "elbad69@hotmail.fr",
  "invitationToken": "eyJjYXJyaWVySWQiOiJkYXNoZG9jLTM5OTEyMTMi...",
  "invitationUrl": "https://symphonia.com/invitation/dashdoc/eyJjYXJy..."
}
```

---

#### POST /api/v1/dashdoc-invitations/send-conquest

Envoyer un email TYPE 2 (conquête).

**Body** :
```json
{
  "carrierId": "dashdoc-3991213",
  "availableOrders": [
    {
      "orderId": "ORDER-123",
      "pickup": { "city": "Lyon", "postalCode": "69000" },
      "delivery": { "city": "Paris", "postalCode": "75000" },
      "pickupDate": "2026-02-05T08:00:00Z",
      "estimatedPrice": 850,
      "cargo": { "palettes": 28, "weight": 19000 }
    }
  ],
  "dryRun": false
}
```

---

#### POST /api/v1/dashdoc-invitations/campaign

Lancer une campagne d'invitation massive.

**Body** :
```json
{
  "type": "known",
  "maxInvitations": 100,
  "delayBetweenEmails": 2000,
  "dryRun": false
}
```

**Réponse** :
```json
{
  "success": true,
  "total": 100,
  "sent": 87,
  "failed": 3,
  "noEmail": 10,
  "errors": [
    {
      "carrier": "TRANSPORT XYZ",
      "error": "SMTP connection failed"
    }
  ]
}
```

---

#### GET /api/v1/dashdoc-invitations/preview/:carrierId?type=known

Prévisualiser l'email pour un transporteur (retourne HTML brut).

**Paramètres** :
- `carrierId` : ID du carrier (ex: `dashdoc-3991213`)
- `type` : `known` ou `conquest`

**Réponse** : HTML brut pour visualisation dans navigateur

---

## Token d'Invitation

### Structure

```javascript
{
  "carrierId": "dashdoc-3991213",
  "carrierName": "MENIER TRANSPORTS",
  "carrierEmail": "elbad69@hotmail.fr",
  "carrierSiren": "89823001600021",
  "source": "dashdoc",
  "expiresAt": "2026-03-05T..." // 30 jours
}
```

### Encodage

- **Format** : base64url (compatible URL)
- **Validité** : 30 jours
- **Usage** : Pré-remplir formulaire d'inscription avec données connues

---

## Configuration

### Variables d'Environnement

```bash
# Dashdoc API
DASHDOC_API_URL=https://api.dashdoc.eu/api/v4
DASHDOC_API_KEY=8321c7a8f7fe8f75192fa15a6c883a11758e0084

# Symphonia Services
SYMPHONIA_AUTHZ_URL=https://symphonia-authz-prod.eba-nwzuqemk.eu-west-3.elasticbeanstalk.com/api/v1
FRONTEND_URL=https://symphonia.com

# SMTP Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=affretia@symphonia.com
SMTP_PASS=your_smtp_password

# MongoDB
MONGODB_URI=mongodb://localhost:27017/affret-ia
```

---

## Processus d'Invitation

### Étape 1 : Import Dashdoc

```bash
# Importer les 8371 affrètements Dashdoc
curl -X POST http://localhost:3000/api/v1/pricing/import-dashdoc \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}'
```

**Résultat** : Base PriceHistory peuplée avec historiques transporteurs

---

### Étape 2 : Identification

```bash
# Identifier carriers non présents dans Symphonia
curl http://localhost:3000/api/v1/dashdoc-invitations/carriers/not-in-symphonia
```

**Résultat** : Liste des 87 carriers à inviter

---

### Étape 3 : Test Preview

```bash
# Prévisualiser email pour un carrier
curl http://localhost:3000/api/v1/dashdoc-invitations/preview/dashdoc-3991213?type=known > preview.html

# Ouvrir dans navigateur
open preview.html
```

---

### Étape 4 : Test Dry-Run

```bash
# Tester envoi sans vraiment envoyer
curl -X POST http://localhost:3000/api/v1/dashdoc-invitations/send-known-carrier \
  -H "Content-Type: application/json" \
  -d '{
    "carrierId": "dashdoc-3991213",
    "dryRun": true
  }'
```

---

### Étape 5 : Campagne Test

```bash
# Envoyer 10 invitations en test
curl -X POST http://localhost:3000/api/v1/dashdoc-invitations/campaign \
  -H "Content-Type: application/json" \
  -d '{
    "type": "known",
    "maxInvitations": 10,
    "delayBetweenEmails": 3000,
    "dryRun": false
  }'
```

---

### Étape 6 : Campagne Complète

```bash
# Envoyer toutes les invitations (87 carriers)
curl -X POST http://localhost:3000/api/v1/dashdoc-invitations/campaign \
  -H "Content-Type: application/json" \
  -d '{
    "type": "known",
    "maxInvitations": 87,
    "delayBetweenEmails": 2000,
    "dryRun": false
  }'
```

**Durée estimée** : 87 × 2s = ~3 minutes

---

## Suivi et Métriques

### Métriques à Tracker

| Métrique | Description |
|----------|-------------|
| **Emails envoyés** | Nombre d'invitations envoyées avec succès |
| **Taux d'ouverture** | % d'emails ouverts (via tracking pixel) |
| **Taux de clic** | % de clics sur lien invitation |
| **Taux d'inscription** | % de transporteurs qui créent un compte |
| **Taux d'activation** | % de transporteurs qui réalisent un transport |

### Logs

```javascript
// Exemple de log
[DASHDOC INVITATION] Démarrage campagne known...
[DASHDOC INVITATION] 87 invitations à envoyer
[DASHDOC INVITATION] Envoi invitation à MENIER TRANSPORTS (elbad69@hotmail.fr)
✅ [DASHDOC INVITATION] Email envoyé à elbad69@hotmail.fr
[DASHDOC INVITATION] Campagne terminée:
  ✅ 84 emails envoyés
  ⚠️ 2 sans email
  ❌ 1 erreurs
```

---

## Tests

### Exécuter les Tests

```bash
cd services/affret-ia-api-v2
node scripts/test-dashdoc-invitations.js
```

**Ce test valide** :
1. ✅ Connexion MongoDB
2. ✅ Identification carriers non présents
3. ✅ Génération token invitation
4. ✅ Génération email TYPE 1 (transporteur connu)
5. ✅ Génération email TYPE 2 (conquête)
6. ✅ Envoi dry-run
7. ✅ Statistiques globales

**Résultat attendu** :
```
✅ Tous les tests ont réussi !

📊 Statistiques:
   Total carriers Dashdoc: 150
   À inviter: 87 (58.0%)
   Avec email: 84 (96.6%)
   Sans email: 3
   Transports total: 4127
   Moyenne transports/carrier: 47.4

💡 Potentiel:
   Carriers invitables immédiatement: 84
   Si 10% acceptent: 8 nouveaux transporteurs
   Si 20% acceptent: 16 nouveaux transporteurs
   Si 30% acceptent: 25 nouveaux transporteurs
```

---

## Sécurité

### Protection Anti-Spam

- ✅ Délai minimum de 2s entre emails
- ✅ Limite de 100 invitations par campagne (configurable)
- ✅ Token d'invitation avec expiration 30 jours
- ✅ Validation email avant envoi

### RGPD

- ✅ Lien de désinscription dans chaque email
- ✅ Consentement implicite (relation commerciale existante via Dashdoc)
- ✅ Données personnelles limitées (email, nom, historique transports)
- ✅ Suppression automatique des tokens expirés

---

## Roadmap

### Phase 1 : MVP (Actuel)
- ✅ Import Dashdoc
- ✅ Identification carriers
- ✅ Email TYPE 1 (transporteur connu)
- ✅ Email TYPE 2 (conquête)
- ✅ Campagne massive

### Phase 2 : Tracking
- [ ] Tracking pixel ouverture email
- [ ] Tracking clics sur liens
- [ ] Dashboard métriques temps réel

### Phase 3 : Optimisation
- [ ] A/B testing templates email
- [ ] Segmentation avancée (par région, taille flotte, etc.)
- [ ] Relances automatiques après 7 jours

### Phase 4 : Intelligence
- [ ] Score de propension à accepter (ML)
- [ ] Personnalisation dynamique du contenu
- [ ] Meilleur moment d'envoi (jour/heure)

---

## FAQ

**Q: Combien de transporteurs peuvent être invités ?**
R: Tous les transporteurs Dashdoc avec email (estimé ~87 sur 150 soit 58%).

**Q: Quel est le taux de conversion attendu ?**
R: Estimation conservative : 10-15% créent un compte, 5-10% réalisent un transport.

**Q: Comment éviter le spam ?**
R: Délai de 2s entre emails + limite configurable + liste de désinscription.

**Q: Que se passe-t-il si un transporteur est déjà inscrit ?**
R: Le service vérifie d'abord via Symphonia Authz API et ne l'invite pas.

**Q: Les prix historiques sont-ils visibles par le transporteur ?**
R: Oui, dans l'email TYPE 1 pour montrer qu'on connaît leur historique.

---

**Auteur** : Claude Sonnet 4.5
**Date** : 2026-02-03
**Version** : 1.0 - MVP
