# Système d'Envoi d'Emails SYMPHONI.A - Résumé

**Date:** 26 Novembre 2025
**Version:** v3.1.0 (avec emails OVH)
**Statut:** ✅ **PRÊT POUR DÉPLOIEMENT**

---

## 📧 Vue d'ensemble

Le système d'envoi d'emails automatiques a été intégré au système de gestion des transporteurs SYMPHONI.A. Tous les emails sont envoyés via le serveur SMTP OVH.

---

## ✅ Fonctionnalités implémentées

### 1. Email d'invitation transporteur
**Quand:** Lors de l'invitation d'un nouveau transporteur (Niveau 2 - Guest)
**Déclencheur:** `POST /api/carriers/invite`
**Template:** Email avec dégradé bleu/violet
**Contenu:**
- Message de bienvenue
- Présentation de SYMPHONI.A
- Avantages du réseau
- Lien d'onboarding
- CTA: "Compléter mon inscription"

**Fichier:** email.js - fonction `sendCarrierInvitationEmail()`

### 2. Email d'onboarding réussi
**Quand:** Lors du passage au statut Référencé (Niveau 2 → Niveau 1)
**Déclencheur:** `POST /api/carriers/onboard`
**Template:** Email avec dégradé vert
**Contenu:**
- Félicitations
- Affichage du score initial
- Liste des nouvelles possibilités
- Conseils pour augmenter le score

**Fichier:** email.js - fonction `sendOnboardingSuccessEmail()`

### 3. Emails d'alerte de vigilance
**Quand:** 30, 15 et 7 jours avant expiration d'un document
**Déclencheur:** CRON quotidien (6h00 UTC)
**Templates:** 3 niveaux d'urgence avec couleurs différentes
- **J-30:** Bleu - Rappel simple
- **J-15:** Orange - Important
- **J-7:** Rouge - URGENT

**Contenu:**
- Type de document concerné
- Date d'expiration
- Jours restants
- Actions requises
- Lien vers upload de document

**Fichier:** email.js - fonction `sendVigilanceAlertEmail()`

### 4. Email de blocage automatique
**Quand:** Lorsqu'un document expire (J-0) et que le transporteur est bloqué
**Déclencheur:** CRON quotidien ou blocage manuel
**Template:** Email rouge avec alerte forte
**Contenu:**
- Notification du blocage
- Raison du blocage (document expiré)
- Conséquences (pas d'affectations, score pénalisé)
- Étapes pour régulariser
- Lien vers espace documents

**Fichier:** email.js - fonction `sendCarrierBlockedEmail()`

### 5. Email de déblocage
**Quand:** Lorsqu'un transporteur régularise sa situation
**Déclencheur:** Déblocage manuel après vérification des documents
**Template:** Email vert positif
**Contenu:**
- Félicitations pour la régularisation
- Confirmation du déblocage
- Rappel des fonctionnalités disponibles
- Conseils pour éviter un nouveau blocage

**Fichier:** email.js - fonction `sendCarrierUnblockedEmail()`

---

## 📁 Fichiers créés

### 1. **email.js** (400+ lignes)
Module principal d'envoi d'emails

**Fonctionnalités:**
- Configuration SMTP OVH avec nodemailer
- 5 fonctions d'envoi d'emails
- Templates HTML responsive
- Gestion des erreurs
- Test de connexion SMTP

**Exports:**
```javascript
{
  sendEmail,
  sendCarrierInvitationEmail,
  sendOnboardingSuccessEmail,
  sendVigilanceAlertEmail,
  sendCarrierBlockedEmail,
  sendCarrierUnblockedEmail,
  testSMTPConnection
}
```

### 2. **OVH_EMAIL_CONFIGURATION.md** (500+ lignes)
Documentation complète de configuration

**Contenu:**
- Configuration du compte email OVH
- Paramètres SMTP détaillés
- Configuration des variables d'environnement
- Guide de déploiement Elastic Beanstalk
- Tests et troubleshooting
- Checklist de déploiement
- Configuration DNS (SPF, DKIM, DMARC)

### 3. **scripts/test-smtp.js** (150+ lignes)
Script de test automatisé

**Tests:**
- Vérification des variables d'environnement
- Test de connexion SMTP
- Envoi d'un email de test
- Rapport complet des résultats

**Usage:**
```bash
node scripts/test-smtp.js [email-destinataire]
```

---

## 🔧 Fichiers modifiés

### 1. **package.json**
Ajout de la dépendance:
```json
"nodemailer": "^6.9.7"
```

### 2. **.env.example**
Ajout des variables SMTP:
```bash
SMTP_HOST=ssl0.ovh.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@symphonia.com
SMTP_PASSWORD=your-email-password
SMTP_FROM=noreply@symphonia.com
FRONTEND_URL=https://symphonia.com
```

### 3. **carriers.js**
Intégration des emails dans les workflows:

- **Ligne 5-11:** Import du module email
- **Ligne 275-281:** Envoi emails d'alertes vigilance (J-30/J-15/J-7)
- **Ligne 189-191:** Envoi email de blocage
- **Ligne 218-220:** Envoi email de déblocage
- **Ligne 362:** Envoi email d'invitation
- **Ligne 476:** Envoi email d'onboarding

---

## 🎨 Templates d'emails

Tous les emails utilisent:
- **Design:** HTML responsive avec CSS inline
- **Largeur max:** 600px
- **Police:** Arial, sans-serif
- **Couleurs:** Dégradés selon le type d'email
- **Structure:**
  - Header avec logo/titre
  - Content area avec message
  - Call-to-action (CTA) button
  - Footer avec informations

### Couleurs par type

| Type | Couleur principale | Dégradé |
|------|-------------------|---------|
| Invitation | Bleu/Violet | #667eea → #764ba2 |
| Onboarding | Vert | #10b981 → #059669 |
| Alerte J-30 | Bleu | #3b82f6 |
| Alerte J-15 | Orange | #f59e0b |
| Alerte J-7 | Rouge | #ef4444 |
| Blocage | Rouge | #ef4444 |
| Déblocage | Vert | #10b981 → #059669 |

---

## 🚀 Configuration OVH requise

### Serveur SMTP OVH
```
Serveur: ssl0.ovh.net
Port: 587 (STARTTLS) ou 465 (SSL/TLS)
Authentification: email@symphonia.com + mot de passe
```

### Variables d'environnement Elastic Beanstalk

À configurer dans **Configuration → Software → Environment properties**:

```
SMTP_HOST = ssl0.ovh.net
SMTP_PORT = 587
SMTP_SECURE = false
SMTP_USER = noreply@symphonia.com
SMTP_PASSWORD = [votre-mot-de-passe-ovh]
SMTP_FROM = noreply@symphonia.com
FRONTEND_URL = https://main.df8cnylp3pqka.amplifyapp.com
```

---

## 🧪 Tests à effectuer

### 1. Test local (avant déploiement)

```bash
# Installer les dépendances
npm install

# Créer un fichier .env avec les variables SMTP

# Tester la connexion SMTP
node scripts/test-smtp.js votre-email@test.com
```

### 2. Test d'invitation

```bash
curl -X POST http://localhost:3001/api/carriers/invite \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "companyName": "Test Transport",
    "siret": "12345678901234",
    "invitedBy": "admin",
    "referenceMode": "direct"
  }'
```

### 3. Test en production

```bash
curl -X POST http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/carriers/invite \
  -H "Content-Type: application/json" \
  -d @test-carrier-invite.json
```

---

## 📊 Intégration avec le système de vigilance

Le CRON quotidien (`scripts/vigilance-cron.js`) envoie automatiquement les emails:

### Alertes envoyées chaque jour à 6h00 UTC

```javascript
// Pour chaque document expirant dans 30, 15 ou 7 jours
if (daysUntilExpiry === 30 || daysUntilExpiry === 15 || daysUntilExpiry === 7) {
  // Récupérer les infos du transporteur
  const carrier = await db.collection('carriers').findOne({ _id: doc.carrierId });

  // Envoyer l'email d'alerte
  await sendVigilanceAlertEmail(
    carrier.email,
    carrier.companyName,
    doc.documentType,
    daysUntilExpiry,
    doc.expiryDate
  );
}
```

### Blocages automatiques à J-0

```javascript
// Pour chaque document expiré
const carrier = await db.collection('carriers').findOne({ _id: carrierId });

// Bloquer le transporteur
await blockCarrier(db, carrierId, reason);

// → Envoie automatiquement l'email de blocage
```

---

## 🔍 Monitoring et logs

### Logs d'envoi d'emails

Les emails génèrent des logs dans la console:

**Succès:**
```
✓ Email envoyé: <1234567890.abcd@smtp.ovh.net>
```

**Échec:**
```
✗ Erreur envoi email: Authentication failed
```

**SMTP non configuré:**
```
📧 Email non envoyé (SMTP non configuré): { to: 'test@example.com', subject: '...' }
```

### Vérifier les logs EB

```bash
aws elasticbeanstalk retrieve-environment-info \
  --environment-name rt-authz-api-prod \
  --info-type tail \
  --region eu-central-1
```

### Vérifier les logs CRON

```bash
# Sur l'instance EC2
sudo tail -f /var/log/vigilance-cron.log
```

---

## 🌐 Configuration DNS recommandée

Pour éviter que les emails arrivent en spam:

### 1. SPF (Sender Policy Framework)

Ajoutez un enregistrement TXT:
```
Nom: @
Type: TXT
Valeur: v=spf1 include:mx.ovh.net ~all
```

### 2. DKIM (DomainKeys Identified Mail)

Activez DKIM dans votre espace client OVH:
1. Aller dans Emails
2. Sélectionner le domaine
3. Activer DKIM
4. Copier les enregistrements DNS fournis

### 3. DMARC (Domain-based Message Authentication)

Ajoutez un enregistrement TXT:
```
Nom: _dmarc
Type: TXT
Valeur: v=DMARC1; p=quarantine; rua=mailto:admin@symphonia.com
```

---

## 📋 Checklist de déploiement v3.1.0

### Pré-déploiement
- [ ] Compte email OVH créé (noreply@symphonia.com)
- [ ] Mot de passe email sécurisé
- [ ] Test SMTP local réussi
- [ ] npm install exécuté
- [ ] Variables d'environnement préparées

### Déploiement
- [ ] Package v3.1.0 créé
- [ ] Upload sur S3 réussi
- [ ] Version créée dans EB
- [ ] Variables SMTP configurées dans EB
- [ ] Déploiement lancé
- [ ] Health check OK

### Post-déploiement
- [ ] Test d'invitation réussi
- [ ] Email reçu dans la boîte de réception (pas spam)
- [ ] SPF configuré dans DNS
- [ ] DKIM activé sur OVH
- [ ] DMARC configuré dans DNS
- [ ] Tests des 5 types d'emails effectués
- [ ] Logs vérifiés
- [ ] Documentation mise à jour

---

## 🎯 Résumé des modifications

| Composant | Action | Statut |
|-----------|--------|--------|
| email.js | Créé | ✅ |
| package.json | Modifié (nodemailer ajouté) | ✅ |
| .env.example | Modifié (variables SMTP) | ✅ |
| carriers.js | Modifié (intégration emails) | ✅ |
| OVH_EMAIL_CONFIGURATION.md | Créé | ✅ |
| scripts/test-smtp.js | Créé | ✅ |
| EMAIL_SYSTEM_SUMMARY.md | Créé (ce fichier) | ✅ |

**Total:**
- **Nouveaux fichiers:** 3
- **Fichiers modifiés:** 3
- **Lignes de code ajoutées:** ~1000+
- **Templates d'emails:** 5

---

## 🔄 Workflow complet

```
1. Invitation transporteur
   ↓
   📧 Email d'invitation envoyé

2. Transporteur upload documents
   ↓
   (Aucun email)

3. Admin vérifie documents
   ↓
   (Aucun email)

4. Onboarding réussi (4 docs vérifiés)
   ↓
   📧 Email d'onboarding envoyé (avec score)

5. CRON quotidien (6h00 UTC)
   ↓
   Pour chaque document:
   - Si J-30: 📧 Email rappel bleu
   - Si J-15: 📧 Email important orange
   - Si J-7: 📧 Email urgent rouge
   - Si J-0: 📧 Email blocage + 🚫 Blocage automatique

6. Transporteur upload nouveau document
   ↓
   Admin vérifie et débloque
   ↓
   📧 Email de déblocage envoyé
```

---

## 🛠️ Commandes de déploiement

### Installation locale
```bash
npm install
```

### Test local
```bash
node scripts/test-smtp.js votre-email@test.com
```

### Créer le package
```bash
python create-deployment-package-v3.py
```

### Déployer sur S3
```bash
aws s3 cp authz-eb-v3.0.0-carrier-system.zip ^
  s3://elasticbeanstalk-eu-central-1-004843574253/authz-eb-v3.1.0-with-emails.zip ^
  --region eu-central-1
```

### Créer la version EB
```bash
aws elasticbeanstalk create-application-version ^
  --application-name rt-authz-api ^
  --version-label v3.1.0-with-emails ^
  --source-bundle S3Bucket=elasticbeanstalk-eu-central-1-004843574253,S3Key=authz-eb-v3.1.0-with-emails.zip ^
  --region eu-central-1
```

### Déployer
```bash
aws elasticbeanstalk update-environment ^
  --application-name rt-authz-api ^
  --environment-name rt-authz-api-prod ^
  --version-label v3.1.0-with-emails ^
  --region eu-central-1
```

---

## ✅ Conclusion

Le système d'envoi d'emails OVH est **complet et prêt pour la production**.

**Prochaines étapes:**

1. Configurer les identifiants OVH dans Elastic Beanstalk
2. Déployer la version v3.1.0
3. Tester avec un transporteur réel
4. Configurer les DNS (SPF, DKIM, DMARC)
5. Monitorer les emails envoyés

**Support:**
- Documentation: [OVH_EMAIL_CONFIGURATION.md](OVH_EMAIL_CONFIGURATION.md)
- Test: `node scripts/test-smtp.js`
- Module: [email.js](email.js)

---

**Version:** v3.1.0
**Date:** 26 Novembre 2025
**Développé par:** Claude Code
**Statut:** ✅ **READY FOR PRODUCTION**
