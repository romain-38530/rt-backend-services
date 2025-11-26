# Configuration des Emails OVH pour SYMPHONI.A

**Date:** 26 Novembre 2025
**Version:** v3.1.0 (avec emails)

---

## 📧 Vue d'ensemble

Le système SYMPHONI.A envoie automatiquement 5 types d'emails via le serveur SMTP OVH:

1. **Email d'invitation** - Quand un transporteur est invité
2. **Email d'onboarding** - Quand un transporteur passe Niveau 2 → Niveau 1
3. **Emails d'alerte de vigilance** - J-30, J-15, J-7 avant expiration
4. **Email de blocage** - Quand un transporteur est bloqué automatiquement
5. **Email de déblocage** - Quand un transporteur est régularisé

---

## 🔧 Étape 1: Configuration du compte email OVH

### 1.1 Créer une adresse email dédiée

Connectez-vous à votre espace client OVH et créez une adresse email dédiée:

```
Adresse recommandée: noreply@symphonia.com
ou
Adresse alternative: contact@symphonia.com
```

**⚠️ Important:** Utilisez une adresse email dédiée pour les emails automatiques, pas votre adresse personnelle.

### 1.2 Paramètres SMTP OVH

OVH fournit ces serveurs SMTP selon votre offre:

| Serveur | Port | SSL/TLS |
|---------|------|---------|
| ssl0.ovh.net | 587 | STARTTLS |
| ssl0.ovh.net | 465 | SSL/TLS |

**Configuration recommandée:**
- **Serveur:** ssl0.ovh.net
- **Port:** 587
- **Sécurité:** STARTTLS
- **Authentification:** Identifiant email + mot de passe

### 1.3 Tester la connexion SMTP

Vous pouvez tester avec un client email comme Thunderbird ou Outlook:

```
Serveur entrant (IMAP): ssl0.ovh.net (port 993, SSL)
Serveur sortant (SMTP): ssl0.ovh.net (port 587, STARTTLS)
Identifiant: noreply@symphonia.com
Mot de passe: [votre mot de passe]
```

---

## 🔑 Étape 2: Configurer les clés API OVH (Optionnel)

D'après votre capture d'écran, vous avez créé une application OVH avec ces clés:

```
Application name: symphonia
Application description: api Symphonia
Application key: ed9d52f0f9666bcf
Application secret: e310afd76f33ae5aa5b92fd0636952f7
Consumer Key: ab3abd0d8ead07b78823e019afa83561
```

**Note:** Ces clés API sont pour l'API OVHcloud (gestion des services). Pour l'envoi d'emails SMTP simple, vous n'avez besoin QUE des identifiants email (email + mot de passe).

Les clés API sont utiles si vous voulez:
- Créer/gérer des adresses emails automatiquement
- Gérer les redirections
- Configurer des alias
- Utiliser l'API Mail OVH

**Pour ce projet, nous utilisons uniquement SMTP (pas l'API).**

---

## ⚙️ Étape 3: Configuration des variables d'environnement

### 3.1 Fichier .env local (développement)

Créez un fichier `.env` dans le dossier `authz-eb`:

```bash
# MongoDB
MONGODB_URI=mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-auth

# JWT
JWT_SECRET=your-secret-key-change-in-production

# CORS
CORS_ORIGIN=https://main.df8cnylp3pqka.amplifyapp.com

# Configuration SMTP OVH
SMTP_HOST=ssl0.ovh.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@symphonia.com
SMTP_PASSWORD=votre-mot-de-passe-email-ovh
SMTP_FROM=noreply@symphonia.com

# URL frontend pour les liens dans les emails
FRONTEND_URL=https://main.df8cnylp3pqka.amplifyapp.com
```

**⚠️ Sécurité:** Ne commitez JAMAIS le fichier `.env` dans Git!

### 3.2 Configuration Elastic Beanstalk (Production)

#### Option A: Via la console AWS

1. Connectez-vous à AWS Console
2. Allez dans Elastic Beanstalk
3. Sélectionnez l'environnement `rt-authz-api-prod`
4. Allez dans **Configuration** → **Software**
5. Cliquez sur **Edit**
6. Dans **Environment properties**, ajoutez:

```
SMTP_HOST = ssl0.ovh.net
SMTP_PORT = 587
SMTP_SECURE = false
SMTP_USER = noreply@symphonia.com
SMTP_PASSWORD = [votre-mot-de-passe]
SMTP_FROM = noreply@symphonia.com
FRONTEND_URL = https://main.df8cnylp3pqka.amplifyapp.com
```

7. Cliquez sur **Apply**

#### Option B: Via AWS CLI

```bash
aws elasticbeanstalk update-environment \
  --application-name rt-authz-api \
  --environment-name rt-authz-api-prod \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=SMTP_HOST,Value=ssl0.ovh.net \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=SMTP_PORT,Value=587 \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=SMTP_SECURE,Value=false \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=SMTP_USER,Value=noreply@symphonia.com \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=SMTP_PASSWORD,Value=VOTRE_MOT_DE_PASSE \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=SMTP_FROM,Value=noreply@symphonia.com \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=FRONTEND_URL,Value=https://main.df8cnylp3pqka.amplifyapp.com \
  --region eu-central-1
```

---

## 🧪 Étape 4: Tester l'envoi d'emails

### 4.1 Test de connexion SMTP

Créez un script de test `test-smtp.js`:

```javascript
const { testSMTPConnection } = require('./email');

async function test() {
  console.log('Test de connexion SMTP OVH...\n');

  const result = await testSMTPConnection();

  if (result.success) {
    console.log('✅ Connexion SMTP réussie!');
  } else {
    console.error('❌ Erreur:', result.error);
  }
}

test();
```

Exécuter:

```bash
node test-smtp.js
```

### 4.2 Test d'envoi d'email simple

```javascript
const { sendEmail } = require('./email');

async function test() {
  const result = await sendEmail({
    to: 'votre-email@test.com',
    subject: 'Test SYMPHONI.A',
    html: '<h1>Email de test</h1><p>Si vous recevez ceci, la configuration fonctionne!</p>'
  });

  console.log(result);
}

test();
```

### 4.3 Test d'invitation transporteur

```bash
# Via l'API
curl -X POST http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/carriers/invite \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "companyName": "Test Transport",
    "siret": "12345678901234",
    "invitedBy": "admin",
    "referenceMode": "direct"
  }'
```

Vous devriez recevoir un email d'invitation à l'adresse `test@example.com`.

---

## 📊 Étape 5: Vérifier les emails envoyés

### 5.1 Dans les logs Elastic Beanstalk

```bash
# Voir les logs en temps réel
aws elasticbeanstalk retrieve-environment-info \
  --environment-name rt-authz-api-prod \
  --info-type tail \
  --region eu-central-1
```

Recherchez dans les logs:

```
✓ Email envoyé: <message-id>
```

ou en cas d'erreur:

```
✗ Erreur envoi email: [message d'erreur]
```

### 5.2 Dans les logs CRON

```bash
# Sur l'instance EC2
sudo tail -f /var/log/vigilance-cron.log
```

Recherchez:

```
📧 J-30 (2 emails):
  • Transport Express - Document kbis
✓ Email envoyé: <message-id>
```

---

## 🔥 Dépannage (Troubleshooting)

### Problème 1: "SMTP not configured"

**Symptôme:** Les logs montrent:
```
📧 Email non envoyé (SMTP non configuré)
```

**Solution:**
- Vérifiez que les variables d'environnement sont configurées
- Sur EB, vérifiez dans Configuration → Software → Environment properties
- Redémarrez l'environnement après avoir ajouté les variables

### Problème 2: "Authentication failed"

**Symptôme:**
```
✗ Erreur connexion SMTP: Invalid login
```

**Solutions:**
1. Vérifiez que l'email et le mot de passe sont corrects
2. Testez la connexion depuis un client email (Thunderbird, Outlook)
3. Vérifiez que le compte email n'est pas bloqué/suspendu
4. Assurez-vous que SMTP est activé pour ce compte sur OVH

### Problème 3: "Connection timeout"

**Symptôme:**
```
✗ Erreur connexion SMTP: Connection timeout
```

**Solutions:**
1. Vérifiez que le port 587 est ouvert dans les security groups AWS
2. Essayez avec le port 465 et `SMTP_SECURE=true`
3. Vérifiez que ssl0.ovh.net est accessible depuis votre réseau

### Problème 4: "Relay access denied"

**Symptôme:**
```
✗ Erreur envoi email: Relay access denied
```

**Solutions:**
1. Utilisez l'adresse email OVH complète comme `SMTP_USER`
2. Assurez-vous que `SMTP_FROM` correspond à `SMTP_USER`
3. Vérifiez que l'authentification SMTP est bien activée

### Problème 5: Emails arrivent en spam

**Solutions:**
1. **Configurer SPF:** Ajoutez un enregistrement DNS TXT:
   ```
   v=spf1 include:mx.ovh.net ~all
   ```

2. **Configurer DKIM:** Activez DKIM dans votre espace client OVH

3. **Configurer DMARC:** Ajoutez un enregistrement DNS TXT:
   ```
   v=DMARC1; p=quarantine; rua=mailto:admin@symphonia.com
   ```

4. **Reverse DNS (PTR):** Assurez-vous que votre IP a un reverse DNS configuré

---

## 📋 Checklist de déploiement

Avant de déployer en production, vérifiez:

- [ ] Compte email OVH créé et fonctionnel
- [ ] Variables d'environnement configurées sur Elastic Beanstalk
- [ ] Test SMTP réussi
- [ ] Test d'envoi d'email réussi
- [ ] SPF configuré dans les DNS
- [ ] DKIM activé sur OVH
- [ ] DMARC configuré dans les DNS
- [ ] Templates d'emails testés et validés
- [ ] Liens dans les emails pointent vers le bon domaine frontend

---

## 📄 Résumé des fichiers créés/modifiés

### Nouveaux fichiers

1. **email.js** - Module d'envoi d'emails avec nodemailer
   - 5 types d'emails (invitation, onboarding, alertes, blocage, déblocage)
   - Templates HTML responsive
   - Gestion des erreurs

### Fichiers modifiés

1. **package.json** - Ajout de `nodemailer@^6.9.7`

2. **.env.example** - Ajout des variables SMTP:
   ```
   SMTP_HOST, SMTP_PORT, SMTP_SECURE,
   SMTP_USER, SMTP_PASSWORD, SMTP_FROM,
   FRONTEND_URL
   ```

3. **carriers.js** - Intégration des emails:
   - Ligne 5-11: Import des fonctions email
   - Ligne 362: Email d'invitation
   - Ligne 476: Email d'onboarding
   - Ligne 275-281: Emails d'alertes vigilance
   - Ligne 189-191: Email de blocage
   - Ligne 218-220: Email de déblocage

---

## 🚀 Déploiement de la version v3.1.0

### 1. Installer nodemailer

```bash
cd c:\Users\rtard\rt-backend-services\services\authz-eb
npm install
```

### 2. Créer le package de déploiement

```bash
python create-deployment-package-v3.py
```

### 3. Uploader sur S3

```bash
aws s3 cp authz-eb-v3.0.0-carrier-system.zip ^
  s3://elasticbeanstalk-eu-central-1-004843574253/authz-eb-v3.1.0-with-emails.zip ^
  --region eu-central-1
```

### 4. Créer la version

```bash
aws elasticbeanstalk create-application-version ^
  --application-name rt-authz-api ^
  --version-label v3.1.0-with-emails ^
  --source-bundle S3Bucket=elasticbeanstalk-eu-central-1-004843574253,S3Key=authz-eb-v3.1.0-with-emails.zip ^
  --region eu-central-1
```

### 5. Configurer les variables d'environnement

(Voir Étape 3.2 ci-dessus)

### 6. Déployer

```bash
aws elasticbeanstalk update-environment ^
  --application-name rt-authz-api ^
  --environment-name rt-authz-api-prod ^
  --version-label v3.1.0-with-emails ^
  --region eu-central-1
```

### 7. Vérifier

```bash
# Health check
curl http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/health

# Test d'invitation (enverra un email)
curl -X POST http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/carriers/invite \
  -H "Content-Type: application/json" \
  -d @test-carrier-invite.json
```

---

## 📧 Exemples d'emails

### Email d'invitation

**Sujet:** 🚚 Invitation SYMPHONI.A - Rejoignez notre réseau de transporteurs

**Aperçu:** Email avec dégradé bleu/violet, logo, CTA "Compléter mon inscription"

### Email d'onboarding

**Sujet:** 🎉 Félicitations - Vous êtes maintenant Référencé sur SYMPHONI.A

**Aperçu:** Email avec dégradé vert, affichage du score, liste des avantages

### Email d'alerte J-30

**Sujet:** Rappel - Document expirant dans 30 jours

**Aperçu:** Email avec couleur bleue, détails du document, CTA "Mettre à jour"

### Email d'alerte J-7

**Sujet:** URGENT - Document expirant dans 7 jours

**Aperçu:** Email avec couleur rouge, alerte forte, CTA urgence

### Email de blocage

**Sujet:** 🚫 COMPTE BLOQUÉ - Document expiré

**Aperçu:** Email rouge, explications, CTA "Régulariser ma situation"

---

## 🎯 Conclusion

La configuration des emails OVH est maintenant complète. Le système SYMPHONI.A envoie automatiquement des emails à chaque étape du cycle de vie des transporteurs.

**Prochaines étapes recommandées:**

1. Configurer les DNS (SPF, DKIM, DMARC)
2. Tester tous les scénarios d'envoi
3. Personnaliser les templates HTML si nécessaire
4. Configurer un système de monitoring des emails
5. Mettre en place un système de gestion des bounces

**Support:**
- Documentation nodemailer: https://nodemailer.com/
- Support OVH SMTP: https://docs.ovh.com/fr/emails/
- Votre fichier de configuration: `.env`

---

**Version:** v3.1.0
**Date:** 26 Novembre 2025
**Statut:** ✅ Configuration complète
