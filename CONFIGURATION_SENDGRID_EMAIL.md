# CONFIGURATION SENDGRID - Email Tracking Basic

## 📧 Vue d'ensemble

Le service de **Tracking Basic** (50€/mois) utilise SendGrid pour envoyer des emails avec liens cliquables aux transporteurs. Cette configuration est **ESSENTIELLE** pour rendre le service opérationnel.

**Service concerné:** `tracking-basic-service.js` (v1.6.1)

---

## 🔑 Étape 1: Créer un Compte SendGrid

### 1.1 Inscription

1. Aller sur [https://sendgrid.com/](https://sendgrid.com/)
2. Cliquer sur "Start for Free"
3. Créer un compte avec l'email de l'entreprise
4. Vérifier l'email de confirmation

### 1.2 Plan recommandé

**Plan Essentials:**
- **Prix:** $19.95/mois (ou Free tier: 100 emails/jour)
- **Emails/mois:** 50,000
- **Support:** Email
- **Idéal pour:** Phase de lancement

**Pour SYMPHONI.A:**
- Si 10 commandes/jour avec tracking email → ~300 emails/mois
- Le plan Free (100/jour) est suffisant pour commencer
- Upgrade vers Essentials quand volume > 3,000 emails/mois

---

## 🔐 Étape 2: Créer une API Key

### 2.1 Dans le Dashboard SendGrid

1. Aller dans **Settings** → **API Keys**
2. Cliquer sur **Create API Key**
3. Configurer:
   - **Name:** `SYMPHONIA-Tracking-Email-Production`
   - **Permissions:** **Full Access** (ou "Mail Send" minimum)
4. Copier la clé (elle ne sera affichée qu'une fois !)

**Format de la clé:**
```
SG.xxxxxxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

### 2.2 Sécuriser la clé

⚠️ **IMPORTANT:** Ne JAMAIS commiter la clé dans Git !

---

## ☁️ Étape 3: Configurer AWS Elastic Beanstalk

### 3.1 Via AWS Console

1. Aller dans **Elastic Beanstalk**
2. Sélectionner l'environnement: `rt-subscriptions-api-prod`
3. Aller dans **Configuration** → **Software**
4. Ajouter les variables d'environnement:

| Variable | Valeur | Description |
|----------|--------|-------------|
| `SENDGRID_API_KEY` | `SG.xxxxxxxx...` | API Key SendGrid |
| `SENDGRID_FROM_EMAIL` | `noreply@rt-backend.com` | Email expéditeur |
| `SENDGRID_FROM_NAME` | `SYMPHONI.A Transport` | Nom expéditeur |
| `TRACKING_EMAIL_BASE_URL` | `https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com` | URL base des liens |

5. Cliquer sur **Apply**

### 3.2 Via AWS CLI

```bash
cd "c:\Users\rtard\rt-backend-services"

# Configurer les variables d'environnement
aws elasticbeanstalk update-environment \
  --environment-name rt-subscriptions-api-prod \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=SENDGRID_API_KEY,Value="SG.xxxxxxxx..." \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=SENDGRID_FROM_EMAIL,Value="noreply@rt-backend.com" \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=SENDGRID_FROM_NAME,Value="SYMPHONI.A Transport" \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=TRACKING_EMAIL_BASE_URL,Value="https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com" \
  --region eu-central-1

echo "✅ Variables d'environnement configurées"
```

**Temps de redémarrage:** ~1-2 minutes

---

## 📧 Étape 4: Vérifier l'Email Expéditeur

### 4.1 Vérification du domaine (Recommandé)

**Option 1 : Domaine personnalisé (Professionnel)**

1. Dans SendGrid, aller dans **Settings** → **Sender Authentication**
2. Cliquer sur **Authenticate Your Domain**
3. Entrer votre domaine: `rt-backend.com`
4. SendGrid génère des enregistrements DNS (CNAME, TXT)
5. Ajouter ces enregistrements dans votre DNS (OVH, Cloudflare, etc.)
6. Attendre validation (~15 min à 24h)

**Enregistrements DNS typiques:**
```
Type: CNAME
Host: em1234.rt-backend.com
Value: u1234567.wl123.sendgrid.net

Type: CNAME
Host: s1._domainkey.rt-backend.com
Value: s1.domainkey.u1234567.wl123.sendgrid.net

Type: CNAME
Host: s2._domainkey.rt-backend.com
Value: s2.domainkey.u1234567.wl123.sendgrid.net
```

**Option 2 : Email unique (Test/Développement)**

1. Dans SendGrid, aller dans **Settings** → **Sender Authentication**
2. Cliquer sur **Verify a Single Sender**
3. Remplir le formulaire:
   - From Name: `SYMPHONI.A Transport`
   - From Email: `noreply@rt-backend.com`
   - Reply To: `support@rt-backend.com`
   - Company Address: Adresse de l'entreprise
4. Vérifier l'email envoyé à `noreply@rt-backend.com`

---

## 🧪 Étape 5: Tester l'Envoi d'Email

### 5.1 Test via API

```bash
# Test endpoint d'envoi d'email de tracking
curl -X POST https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/api/transport-orders/673cfc580b68ebd4aecbe87f/tracking/email/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "carrierEmail": "transporteur@example.com",
    "carrierName": "Transport Express SA"
  }'
```

**Réponse attendue (200 OK):**
```json
{
  "success": true,
  "message": "Tracking email sent successfully",
  "emailSent": true,
  "carrierEmail": "transporteur@example.com",
  "orderId": "673cfc580b68ebd4aecbe87f",
  "trackingToken": "eyJkYXRhIjp7Im9yZGVySWQiOiI2NzNjZmM1ODA...",
  "expiresAt": "2025-11-26T22:00:00.000Z"
}
```

### 5.2 Vérifier les Logs SendGrid

1. Dans SendGrid Dashboard, aller dans **Activity**
2. Filtrer par date/email
3. Vérifier le statut:
   - ✅ **Delivered** = Email bien reçu
   - ⚠️ **Processed** = En cours d'envoi
   - ❌ **Bounced** = Email invalide
   - ❌ **Dropped** = Bloqué par SendGrid

### 5.3 Contenu de l'Email

L'email envoyé contient :

**Sujet:** "🚚 Suivi de votre transport - Commande #CMD-20251125-001"

**Corps (HTML):**
```html
<h2>Bonjour Transport Express SA,</h2>

<p>Veuillez suivre l'état de votre transport en cliquant sur les liens ci-dessous :</p>

<h3>📍 Mettre à jour le statut :</h3>
<ul>
  <li><a href="https://...">🚚 Je suis en route vers le chargement</a></li>
  <li><a href="https://...">📍 Je suis arrivé au point de chargement</a></li>
  <li><a href="https://...">📦 Chargement en cours</a></li>
  <li><a href="https://...">✅ Chargé - En route vers livraison</a></li>
  <li><a href="https://...">🚚 En route vers la livraison</a></li>
  <li><a href="https://...">📍 Arrivé au point de livraison</a></li>
  <li><a href="https://...">✅ Livraison effectuée</a></li>
</ul>

<h3>📄 Déposer un document :</h3>
<ul>
  <li><a href="https://...">📄 Déposer le Bon de Livraison (BL)</a></li>
  <li><a href="https://...">📋 Déposer le CMR</a></li>
  <li><a href="https://...">✅ Déposer le POD signé</a></li>
</ul>

<p>Référence commande: CMD-20251125-001</p>
<p>Ces liens expirent dans 24 heures.</p>
```

**Tous les liens contiennent un token sécurisé SHA-256.**

---

## 🔒 Étape 6: Sécurité & Bonnes Pratiques

### 6.1 Protection des Tokens

Le code `tracking-basic-service.js` utilise déjà:
- ✅ SHA-256 pour signer les tokens
- ✅ Expiration 24h automatique
- ✅ Anti-replay (usage unique)
- ✅ Nonce pour unicité

**Variable SECRET_KEY:** Déjà générée automatiquement

### 6.2 Rate Limiting SendGrid

SendGrid limite le nombre d'emails:
- **Free:** 100 emails/jour
- **Essentials:** 50,000 emails/mois

**Pour éviter les dépassements:**
```javascript
// Déjà implémenté dans tracking-basic-service.js
// Vérification avant envoi
if (emailsSentToday >= dailyLimit) {
  return { success: false, error: 'Daily email limit reached' };
}
```

### 6.3 Gestion des Bounces

Configurer un webhook SendGrid pour les bounces:

1. Dans SendGrid: **Settings** → **Mail Settings** → **Event Webhook**
2. URL: `https://rt-subscriptions-api-prod.../api/webhooks/sendgrid`
3. Événements à tracker:
   - ✅ Delivered
   - ✅ Bounced
   - ✅ Opened (optionnel)
   - ✅ Clicked (optionnel)

---

## 📊 Étape 7: Monitoring & Analytics

### 7.1 Dashboard SendGrid

Suivre dans le dashboard:
- **Nombre d'emails envoyés** (daily/monthly)
- **Taux de délivrabilité** (doit être > 95%)
- **Taux d'ouverture** (tracking optionnel)
- **Taux de clic** sur les liens

### 7.2 Logs CloudWatch

Les emails sont loggés dans CloudWatch:
```
Group: /aws/elasticbeanstalk/rt-subscriptions-api-prod/
Filter: "Tracking email sent"
```

**Exemple de log:**
```
2025-11-25T22:00:00.000Z INFO Tracking email sent successfully
  orderId: 673cfc580b68ebd4aecbe87f
  carrierEmail: transporteur@example.com
  messageId: <msg-1234567890@sendgrid.net>
```

### 7.3 Métriques à surveiller

| Métrique | Cible | Action si dépassée |
|----------|-------|-------------------|
| Taux de bounce | < 5% | Vérifier qualité des emails |
| Temps de délivrance | < 5 min | Vérifier SendGrid status |
| Emails/jour | < 90 (Free) | Upgrade plan |
| Taux d'ouverture | > 40% | Améliorer sujet email |

---

## 🚀 Étape 8: Déploiement & Redémarrage

### 8.1 Vérifier la Configuration

```bash
# Vérifier que les variables sont bien configurées
aws elasticbeanstalk describe-configuration-settings \
  --environment-name rt-subscriptions-api-prod \
  --application-name rt-subscriptions-api \
  --region eu-central-1 \
  --query 'ConfigurationSettings[0].OptionSettings[?Namespace==`aws:elasticbeanstalk:application:environment`]'

# Chercher SENDGRID_API_KEY
```

### 8.2 Redémarrer l'Application

Les variables d'environnement nécessitent un redémarrage:

```bash
aws elasticbeanstalk restart-app-server \
  --environment-name rt-subscriptions-api-prod \
  --region eu-central-1

echo "⏳ Redémarrage en cours (1-2 minutes)..."
sleep 120

# Vérifier le statut
aws elasticbeanstalk describe-environments \
  --environment-names rt-subscriptions-api-prod \
  --region eu-central-1 \
  --query 'Environments[0].[Status,Health]' \
  --output table
```

**Résultat attendu:** `Ready | Green`

---

## ✅ Checklist Finale

- [ ] Compte SendGrid créé et vérifié
- [ ] API Key générée et sauvegardée (coffre-fort)
- [ ] Domaine ou email expéditeur vérifié
- [ ] Variables d'environnement configurées dans AWS EB
- [ ] Application redémarrée
- [ ] Statut environnement = Green
- [ ] Test d'envoi d'email réussi
- [ ] Email bien reçu par le transporteur
- [ ] Liens cliquables fonctionnels
- [ ] Webhook SendGrid configuré (optionnel)
- [ ] Monitoring configuré (CloudWatch + SendGrid)

---

## 🐛 Dépannage

### Problème 1: "API Key invalid"

**Cause:** La clé API est incorrecte ou expirée

**Solution:**
1. Vérifier la clé dans SendGrid Dashboard
2. Régénérer une nouvelle clé
3. Mettre à jour AWS EB
4. Redémarrer l'application

### Problème 2: "Sender email not verified"

**Cause:** L'email expéditeur n'est pas vérifié

**Solution:**
1. Aller dans SendGrid → Sender Authentication
2. Vérifier le domaine ou l'email unique
3. Attendre la validation
4. Réessayer l'envoi

### Problème 3: Email non reçu

**Causes possibles:**
- Spam folder du destinataire
- Email invalide
- Bounce (email inexistant)

**Solution:**
1. Vérifier dans SendGrid Activity
2. Vérifier les logs CloudWatch
3. Tester avec un autre email
4. Vérifier que le domaine n'est pas blacklisté

### Problème 4: "SENDGRID_API_KEY not found"

**Cause:** Variable d'environnement non configurée

**Solution:**
```bash
# Vérifier les variables
aws elasticbeanstalk describe-configuration-settings \
  --environment-name rt-subscriptions-api-prod \
  --region eu-central-1 | grep SENDGRID

# Si vide, reconfigurer
aws elasticbeanstalk update-environment --environment-name rt-subscriptions-api-prod ...
```

---

## 📚 Ressources

- [Documentation SendGrid](https://docs.sendgrid.com/)
- [SendGrid Node.js Library](https://github.com/sendgrid/sendgrid-nodejs)
- [AWS EB Environment Variables](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/environments-cfg-softwaresettings.html)
- [Code source: tracking-basic-service.js](./services/subscriptions-contracts-eb/tracking-basic-service.js)

---

## 💰 Coûts Estimés

| Plan | Prix/mois | Emails inclus | Coût par email supplémentaire |
|------|-----------|---------------|-------------------------------|
| **Free** | 0€ | 100/jour (~3,000/mois) | N/A |
| **Essentials** | ~18€ | 50,000 | 0.00036€ |
| **Pro** | ~81€ | 100,000 | 0.00027€ |

**Pour SYMPHONI.A:**
- **Estimé:** 10 commandes/jour × 1 email = 10 emails/jour = 300/mois
- **Plan recommandé:** Free (largement suffisant)
- **Coût:** 0€/mois

---

**Configuration créée le:** 25 novembre 2025
**Par:** Claude Code (Anthropic)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
