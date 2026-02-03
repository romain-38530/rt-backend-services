# Configuration AWS SES pour Envoi des Emails

## Vue d'Ensemble

AWS Simple Email Service (SES) remplace SMTP/nodemailer pour l'envoi des emails d'invitation transporteurs.

**Avantages** :
- ✅ **99% deliverability** (meilleur taux de réception)
- ✅ **Coût réduit** : $0.10 par 1000 emails
- ✅ **Scalabilité** : jusqu'à 50 000 emails/jour
- ✅ **Statistiques détaillées** : ouvertures, clics, bounces
- ✅ **Réputation email** : IP dédiée AWS
- ✅ **Pas de serveur SMTP** à gérer

---

## Prérequis

### 1. Compte AWS

- Accès à AWS Console : https://console.aws.amazon.com
- Région recommandée : **eu-west-3** (Paris) ou **eu-west-1** (Irlande)

### 2. Vérifier le Domaine

AWS SES nécessite de vérifier que vous êtes propriétaire du domaine d'envoi.

---

## Configuration Étape par Étape

### Étape 1 : Vérifier le Domaine dans SES

1. **Accéder à AWS SES Console**
   ```
   https://console.aws.amazon.com/ses/home?region=eu-west-3
   ```

2. **Aller dans "Verified identities"**
   - Cliquer sur "Create identity"
   - Sélectionner "Domain"
   - Entrer : `symphonia.com`
   - Cocher "Generate DKIM settings"
   - Cliquer sur "Create identity"

3. **Configurer les enregistrements DNS**

   AWS SES va générer 3 types d'enregistrements à ajouter dans votre DNS :

   #### A. DKIM (Authentification)
   ```dns
   Type: CNAME
   Name: xxx._domainkey.symphonia.com
   Value: xxx.dkim.amazonses.com

   Type: CNAME
   Name: yyy._domainkey.symphonia.com
   Value: yyy.dkim.amazonses.com

   Type: CNAME
   Name: zzz._domainkey.symphonia.com
   Value: zzz.dkim.amazonses.com
   ```

   #### B. SPF (Prévention spam)
   ```dns
   Type: TXT
   Name: symphonia.com
   Value: "v=spf1 include:amazonses.com ~all"
   ```

   #### C. DMARC (Politique email)
   ```dns
   Type: TXT
   Name: _dmarc.symphonia.com
   Value: "v=DMARC1; p=none; rua=mailto:dmarc@symphonia.com"
   ```

4. **Attendre la vérification**
   - Validation DNS : **24-48 heures**
   - Status "Verified" apparaîtra dans SES Console

---

### Étape 2 : Sortir du Mode Sandbox

**Mode Sandbox** : Limitations initiales AWS SES
- ❌ Seulement 200 emails/jour
- ❌ Seulement vers adresses vérifiées
- ❌ Ne peut pas envoyer à des destinataires non vérifiés

**Mode Production** : Sans limitations
- ✅ 50 000 emails/jour (augmentable)
- ✅ Envoi vers n'importe quelle adresse
- ✅ Statistiques complètes

#### Demander la Sortie du Sandbox

1. **Aller dans "Account dashboard"**
   ```
   https://console.aws.amazon.com/ses/home?region=eu-west-3#/account
   ```

2. **Cliquer sur "Request production access"**

3. **Remplir le formulaire**

   **Mail type** : Transactional

   **Website URL** : https://symphonia.com

   **Use case description** (exemple) :
   ```
   SYMPHONI.A is a B2B transport marketplace platform connecting shippers
   with carriers in France. We need to send transactional emails to:

   1. Carrier invitations (TYPE 1): Emails to carriers already in our
      partner database (Dashdoc integration) with their historical pricing
      and routes. Personalized invitations to join our platform.

   2. Carrier acquisition (TYPE 2): Marketing emails to new carriers
      showing available transport orders on their usual routes.

   Expected volume:
   - Initial campaign: 84 carriers
   - Monthly: ~100-200 emails
   - Growth: 500-1000 emails/month within 6 months

   Email types:
   - Transactional invitations
   - Order notifications
   - Platform updates

   Compliance:
   - GDPR compliant
   - Unsubscribe link in every email
   - Legitimate business relationship (B2B)

   Recipients: Professional carriers (B2B) with existing business
   relationship through our partner Dashdoc.
   ```

   **Compliance** :
   - ✅ "I have a process to handle bounces and complaints"
   - ✅ "I comply with AWS Acceptable Use Policy"

4. **Soumettre**
   - Délai de réponse : **24 heures** (souvent plus rapide)
   - AWS Support vérifiera manuellement

---

### Étape 3 : Créer des Credentials IAM

1. **Aller dans IAM Console**
   ```
   https://console.aws.amazon.com/iam/home?region=eu-west-3#/users
   ```

2. **Créer un utilisateur**
   - Nom : `symphonia-ses-user`
   - Accès : "Programmatic access"

3. **Attacher la politique SES**
   - Sélectionner "Attach policies directly"
   - Chercher et cocher : `AmazonSESFullAccess`

4. **Récupérer les credentials**
   ```
   AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
   AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

   ⚠️ **SAUVEGARDER** ces credentials immédiatement (pas de seconde chance)

---

### Étape 4 : Configurer l'Application

#### Variables d'Environnement AWS EB

```bash
# AWS SES Configuration
eb setenv AWS_REGION=eu-west-3
eb setenv AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
eb setenv AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Email Configuration
eb setenv SES_FROM_EMAIL=affretia@symphonia.com
eb setenv SES_FROM_NAME="SYMPHONI.A - Affret.IA"

# Déployer
eb deploy
```

#### Fichier .env (Local)

```bash
# AWS SES
AWS_REGION=eu-west-3
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Email
SES_FROM_EMAIL=affretia@symphonia.com
SES_FROM_NAME=SYMPHONI.A - Affret.IA

# Autres configs existantes
DASHDOC_API_URL=https://api.dashdoc.eu/api/v4
DASHDOC_API_KEY=8321c7a8f7fe8f75192fa15a6c883a11758e0084
FRONTEND_URL=https://symphonia.com
```

---

### Étape 5 : Installer le SDK AWS

```bash
cd services/affret-ia-api-v2
npm install @aws-sdk/client-ses
```

---

## Tests

### Test 1 : Envoyer un Email de Test

```javascript
const AwsSesEmailService = require('./services/aws-ses-email.service');

// Test simple
await AwsSesEmailService.sendEmail({
  to: 'votre-email@test.com',
  subject: 'Test AWS SES',
  html: '<h1>Hello from AWS SES!</h1>'
});
```

### Test 2 : Vérifier le Quota

```bash
# Créer script test-ses-quota.js
const AwsSesEmailService = require('./services/aws-ses-email.service');

async function testQuota() {
  const quota = await AwsSesEmailService.getSendQuota();
  console.log('Quota AWS SES:');
  console.log(`  Max 24h: ${quota.max24HourSend} emails`);
  console.log(`  Max rate: ${quota.maxSendRate} emails/sec`);
  console.log(`  Envoyés: ${quota.sentLast24Hours} emails`);
  console.log(`  Restant: ${quota.remaining} emails`);
}

testQuota();
```

### Test 3 : Campagne Dry-Run

```bash
# Tester campagne sans envoyer
curl -X POST http://localhost:3000/api/v1/dashdoc-invitations/campaign \
  -H "Content-Type: application/json" \
  -d '{
    "type": "known",
    "maxInvitations": 5,
    "dryRun": true
  }'
```

---

## Monitoring

### Dashboard AWS SES

Accéder aux statistiques :
```
https://console.aws.amazon.com/ses/home?region=eu-west-3#/account-dashboard
```

**Métriques disponibles** :
- ✅ **Sends** : Emails envoyés
- ✅ **Deliveries** : Emails délivrés
- ✅ **Opens** : Emails ouverts (avec tracking)
- ✅ **Clicks** : Liens cliqués
- ✅ **Bounces** : Emails rejetés (hard bounce = adresse invalide)
- ✅ **Complaints** : Signalements spam

### CloudWatch Alarms

Créer des alertes pour :
1. **Bounce rate > 5%** → Vérifier qualité des emails
2. **Complaint rate > 0.1%** → Vérifier contenu emails
3. **Quota utilisé > 80%** → Demander augmentation

---

## Coûts

### Tarification AWS SES (Région eu-west-3)

| Service | Coût |
|---------|------|
| **Emails envoyés** | $0.10 par 1000 emails |
| **Emails reçus** | $0.10 par 1000 emails |
| **Attachments** | $0.12 par GB |
| **IP dédiée** | $24.95/mois (optionnel) |

### Estimation pour Campagne

**Campagne initiale** : 84 emails
- Coût : $0.0084 (moins de 1 centime)

**Mensuel** : 200 emails
- Coût : $0.02/mois

**Croissance 6 mois** : 1000 emails/mois
- Coût : $0.10/mois

**Annuel** (12 000 emails) :
- Coût : **$1.20/an** 💰

---

## Bonnes Pratiques

### 1. Gestion des Bounces

```javascript
// Automatiser la suppression des emails invalides
async function handleBounce(emailAddress) {
  // Marquer comme invalide dans DB
  await PriceHistory.updateMany(
    { carrierEmail: emailAddress },
    { $set: { 'emailStatus': 'bounced' } }
  );
}
```

### 2. Gestion des Complaints

```javascript
// Si un transporteur signale comme spam
async function handleComplaint(emailAddress) {
  // Blacklister immédiatement
  await PriceHistory.updateMany(
    { carrierEmail: emailAddress },
    { $set: { 'emailStatus': 'unsubscribed' } }
  );
}
```

### 3. Rate Limiting

```javascript
// Respecter le rate limit (14 emails/sec en production)
const DELAY_BETWEEN_EMAILS = 2000; // 2 secondes

await runInvitationCampaign({
  maxInvitations: 84,
  delayBetweenEmails: DELAY_BETWEEN_EMAILS
});
```

---

## Troubleshooting

### Problème : Emails non reçus

**Causes possibles** :
1. Mode Sandbox actif → Demander sortie sandbox
2. Domaine non vérifié → Vérifier DNS DKIM/SPF
3. Email destinataire invalide → Vérifier bounce rate

**Solution** :
```bash
# Vérifier status domaine
aws ses get-identity-verification-attributes \
  --region eu-west-3 \
  --identities symphonia.com

# Vérifier quota
aws ses get-send-quota --region eu-west-3
```

---

### Problème : Credentials invalides

**Erreur** :
```
UnrecognizedClientException: The security token included in the request is invalid
```

**Solution** :
1. Vérifier `AWS_ACCESS_KEY_ID` et `AWS_SECRET_ACCESS_KEY`
2. Vérifier que l'utilisateur IAM a la politique `AmazonSESFullAccess`
3. Vérifier que les credentials ne sont pas expirés

---

### Problème : Bounce rate élevé

**Bounce rate > 5%** = Réputation email dégradée

**Actions** :
1. Vérifier qualité des adresses emails
2. Nettoyer la liste (retirer emails invalides)
3. Utiliser validation email avant envoi

```javascript
// Valider email avant envoi
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
```

---

## Checklist de Lancement

### Avant Production

- [ ] Domaine `symphonia.com` vérifié dans SES
- [ ] DNS DKIM/SPF/DMARC configurés
- [ ] Sortie du mode Sandbox approuvée
- [ ] Credentials IAM créés avec politique SES
- [ ] Variables d'environnement configurées sur AWS EB
- [ ] SDK `@aws-sdk/client-ses` installé
- [ ] Test envoi email réussi
- [ ] Quota vérifié (> 84 emails)

### Après Lancement

- [ ] Monitoring bounce rate (< 5%)
- [ ] Monitoring complaint rate (< 0.1%)
- [ ] Vérifier délivrabilité (> 95%)
- [ ] Configurer alertes CloudWatch
- [ ] Tracker taux d'ouverture emails

---

## Support

**Documentation AWS SES** :
- https://docs.aws.amazon.com/ses/

**Augmenter le quota** :
- https://console.aws.amazon.com/support/home#/case/create?issueType=service-limit-increase

**Status AWS** :
- https://status.aws.amazon.com/

---

**Configuration AWS SES - Prête pour Production** 🚀

---

**Auteur** : Claude Sonnet 4.5
**Date** : 2026-02-03
**Version** : 1.0
