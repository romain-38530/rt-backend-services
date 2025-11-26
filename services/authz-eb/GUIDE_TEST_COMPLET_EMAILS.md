# 🧪 Guide de Test Complet - Système d'Emails SYMPHONI.A

**Date:** 26 Novembre 2025
**Version:** v3.1.0-with-emails
**Status:** Prêt pour tests complets

---

## 📋 Vue d'ensemble des Tests

Ce guide vous permet de tester les **5 types d'emails** du système SYMPHONI.A.

| # | Type d'Email | Déclencheur | Status Test |
|---|--------------|-------------|-------------|
| 1 | Invitation | POST /api/carriers/invite | ✅ Testé (26/11/2025) |
| 2 | Onboarding | Passage Niveau 2 → 1 | ⏳ À tester |
| 3 | Alerte J-30 | CRON quotidien | ⏳ À tester |
| 4 | Alerte J-15 | CRON quotidien | ⏳ À tester |
| 5 | Alerte J-7 | CRON quotidien | ⏳ À tester |
| 6 | Blocage | Document expiré | ⏳ À tester |
| 7 | Déblocage | Régularisation | ⏳ À tester |

---

## ✅ Test 1 : Email d'Invitation (EFFECTUÉ)

### Résultat du Test
- **Date:** 26 Novembre 2025 - 15:40 UTC
- **Status:** ✅ Envoyé avec succès
- **Transporteur créé:** ID `69271f576cee93659f5b27cf`
- **Email destinataire:** rtardieu@symphonia.com
- **Réponse API:** `{"success": true, "message": "Transporteur invité avec succès"}`

### Détails du Transporteur de Test
```json
{
  "_id": "69271f576cee93659f5b27cf",
  "email": "rtardieu@symphonia.com",
  "companyName": "Test Transport SYMPHONI.A",
  "siret": "12345678901234",
  "status": "guest",
  "referenceMode": "direct",
  "invitedBy": "Admin SYMPHONI.A",
  "invitedAt": "2025-11-26T15:40:07.655Z",
  "vigilanceStatus": "blocked",
  "score": 0,
  "isBlocked": true,
  "blockedReason": "Aucun document fourni"
}
```

### Email Attendu
- **Sujet:** 🚚 Invitation SYMPHONI.A - Rejoignez notre réseau de transporteurs
- **Design:** Dégradé bleu/violet (#667eea → #764ba2)
- **Contenu:**
  - Message de bienvenue personnalisé
  - Présentation de SYMPHONI.A
  - Avantages du réseau
  - Lien vers onboarding frontend
  - CTA "Compléter mon inscription"

### ✅ Vérification
- [ ] Email reçu dans la boîte de réception
- [ ] Email PAS dans les SPAM
- [ ] Design correct (dégradé bleu/violet)
- [ ] Texte personnalisé avec "Test Transport SYMPHONI.A"
- [ ] Lien d'onboarding fonctionne
- [ ] Affichage correct sur mobile

---

## 🟢 Test 2 : Email d'Onboarding Réussi

### Prérequis
- Avoir un transporteur invité (statut "guest")
- Le transporteur doit uploader 4 documents
- Les documents doivent être vérifiés et approuvés par un admin

### Étapes pour Tester

#### 2.1 Utiliser le Transporteur de Test Existant
```bash
# ID du transporteur : 69271f576cee93659f5b27cf
# Email : rtardieu@symphonia.com
```

#### 2.2 Uploader des Documents de Test

Vous devez uploader 4 documents via le frontend ou l'API :

**Documents requis:**
1. **KBIS** (moins de 3 mois)
2. **Assurance RC** (valide)
3. **Licence de Transport** (valide)
4. **Carte Grise** (valide)

**Via l'API (si disponible):**
```bash
# Upload document KBIS
curl -X POST http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/carriers/69271f576cee93659f5b27cf/documents \
  -H "Content-Type: application/json" \
  -d '{
    "documentType": "kbis",
    "documentUrl": "https://example.com/documents/kbis.pdf",
    "expiryDate": "2026-02-15"
  }'

# Répéter pour les 3 autres documents
```

**Via le Frontend:**
1. Allez sur le lien d'onboarding reçu par email
2. Connectez-vous ou créez le compte
3. Uploadez les 4 documents requis

#### 2.3 Vérifier et Approuver les Documents

Via l'interface admin ou l'API :

```bash
# Approuver chaque document
curl -X PATCH http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/carriers/69271f576cee93659f5b27cf/documents/{documentId}/verify \
  -H "Content-Type: application/json" \
  -d '{"status": "verified"}'
```

#### 2.4 Déclencher l'Onboarding

Une fois les 4 documents vérifiés, déclencher l'onboarding :

```bash
curl -X POST http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/carriers/69271f576cee93659f5b27cf/onboard \
  -H "Content-Type: application/json"
```

### Email Attendu
- **Sujet:** 🎉 Félicitations - Vous êtes maintenant Référencé sur SYMPHONI.A
- **Design:** Dégradé vert (#10b981 → #059669)
- **Contenu:**
  - Félicitations
  - Affichage du score initial (calculé)
  - Liste des nouvelles possibilités
  - Conseils pour augmenter le score
  - Lien vers le dashboard

### ✅ Vérification
- [ ] Email reçu après l'onboarding
- [ ] Design correct (dégradé vert)
- [ ] Score affiché correctement
- [ ] Conseils personnalisés présents
- [ ] Lien vers dashboard fonctionne

---

## 🔵 Test 3 : Email d'Alerte Vigilance J-30

### Prérequis
- Avoir un transporteur avec statut "referenced" (Niveau 1)
- Le transporteur doit avoir un document qui expire dans 30 jours

### Étapes pour Tester

#### 3.1 Créer un Transporteur avec Document Expirant dans 30 Jours

```bash
# 1. Créer un nouveau transporteur
curl -X POST http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/carriers/invite \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test-j30@example.com",
    "companyName": "Test Vigilance J-30",
    "siret": "98765432109876",
    "invitedBy": "Admin Test",
    "referenceMode": "direct"
  }'

# 2. Récupérer l'ID du transporteur créé (ex: 69271f586cee93659f5b27d0)

# 3. Ajouter un document expirant dans 30 jours
# Date d'expiration = Aujourd'hui + 30 jours = 26 Décembre 2025
curl -X POST http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/carriers/69271f586cee93659f5b27d0/documents \
  -H "Content-Type: application/json" \
  -d '{
    "documentType": "insurance",
    "documentUrl": "https://example.com/insurance.pdf",
    "expiryDate": "2025-12-26"
  }'

# 4. Vérifier le document et faire l'onboarding
```

#### 3.2 Déclencher le CRON Manuellement (optionnel)

Si vous ne voulez pas attendre 6h00 UTC le lendemain :

```bash
# Sur le serveur EB, exécuter le script CRON manuellement
# (Nécessite SSH sur l'instance EC2)
node scripts/vigilance-cron.js
```

#### 3.3 Ou Attendre le CRON Automatique

Le CRON s'exécute automatiquement tous les jours à **6h00 UTC**.

Le lendemain 27 Novembre 2025 à 6h00 UTC, il enverra l'email J-30.

### Email Attendu
- **Sujet:** 📋 Rappel - Document expirant dans 30 jours
- **Design:** Couleur bleue (#3b82f6)
- **Contenu:**
  - Type de document (Assurance RC)
  - Date d'expiration (26 Décembre 2025)
  - Jours restants (30)
  - Actions requises
  - Lien vers upload de document
  - CTA "Mettre à jour mon document"

### ✅ Vérification
- [ ] Email reçu le lendemain à 6h00 UTC
- [ ] Design correct (bleu)
- [ ] Informations du document correctes
- [ ] Lien d'upload fonctionne

---

## 🟠 Test 4 : Email d'Alerte Vigilance J-15

### Similaire au Test 3

Créez un transporteur avec un document expirant dans **15 jours** :
- Date d'expiration : **11 Décembre 2025**
- Le CRON enverra l'email J-15 le lendemain

### Email Attendu
- **Sujet:** ⚠️ Important - Document expirant dans 15 jours
- **Design:** Couleur orange (#f59e0b)
- **Contenu:** Même structure que J-30, mais ton plus urgent

---

## 🔴 Test 5 : Email d'Alerte Vigilance J-7

### Similaire au Test 3

Créez un transporteur avec un document expirant dans **7 jours** :
- Date d'expiration : **3 Décembre 2025**
- Le CRON enverra l'email J-7 le lendemain

### Email Attendu
- **Sujet:** 🚨 URGENT - Document expirant dans 7 jours
- **Design:** Couleur rouge (#ef4444)
- **Contenu:** Même structure, mais ton URGENT

---

## 🚫 Test 6 : Email de Blocage Automatique

### Prérequis
- Avoir un transporteur avec un document expiré

### Étapes pour Tester

#### 6.1 Créer un Transporteur avec Document Expiré

```bash
# 1. Créer un transporteur
curl -X POST http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/carriers/invite \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test-blocage@example.com",
    "companyName": "Test Blocage",
    "siret": "11122233344455",
    "invitedBy": "Admin Test",
    "referenceMode": "direct"
  }'

# 2. Ajouter un document DÉJÀ EXPIRÉ
# Date d'expiration = 20 Novembre 2025 (passée)
curl -X POST http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/carriers/{ID}/documents \
  -H "Content-Type: application/json" \
  -d '{
    "documentType": "kbis",
    "documentUrl": "https://example.com/kbis-expired.pdf",
    "expiryDate": "2025-11-20"
  }'

# 3. Faire l'onboarding (si nécessaire)

# 4. Bloquer le transporteur manuellement OU attendre le CRON
```

#### 6.2 Bloquer Manuellement

```bash
curl -X POST http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/carriers/{ID}/block \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Document KBIS expiré le 20/11/2025"
  }'
```

### Email Attendu
- **Sujet:** 🚫 COMPTE BLOQUÉ - Document expiré
- **Design:** Rouge avec alerte forte (#ef4444)
- **Contenu:**
  - Notification du blocage
  - Raison (document expiré)
  - Conséquences (pas d'affectations)
  - Étapes pour régulariser
  - Lien vers espace documents
  - CTA "Régulariser ma situation"

### ✅ Vérification
- [ ] Email reçu immédiatement après le blocage
- [ ] Design rouge avec alerte
- [ ] Raison du blocage claire
- [ ] Instructions de régularisation présentes

---

## ✅ Test 7 : Email de Déblocage

### Prérequis
- Avoir un transporteur bloqué (utiliser celui du Test 6)

### Étapes pour Tester

#### 7.1 Uploader un Nouveau Document Valide

```bash
# Upload d'un document KBIS valide
curl -X POST http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/carriers/{ID}/documents \
  -H "Content-Type: application/json" \
  -d '{
    "documentType": "kbis",
    "documentUrl": "https://example.com/kbis-valide.pdf",
    "expiryDate": "2026-02-20"
  }'
```

#### 7.2 Vérifier le Document

```bash
# Vérifier le document uploadé
curl -X PATCH http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/carriers/{ID}/documents/{docId}/verify \
  -H "Content-Type: application/json" \
  -d '{"status": "verified"}'
```

#### 7.3 Débloquer le Transporteur

```bash
curl -X POST http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/carriers/{ID}/unblock \
  -H "Content-Type: application/json"
```

### Email Attendu
- **Sujet:** ✅ Félicitations - Votre compte a été débloqué
- **Design:** Dégradé vert (#10b981 → #059669)
- **Contenu:**
  - Félicitations pour la régularisation
  - Confirmation du déblocage
  - Rappel des fonctionnalités disponibles
  - Conseils pour éviter un nouveau blocage
  - Lien vers dashboard

### ✅ Vérification
- [ ] Email reçu immédiatement après le déblocage
- [ ] Design vert positif
- [ ] Message de félicitations
- [ ] Conseils présents

---

## 📊 Script de Test Automatisé (Optionnel)

Je peux créer un script qui teste automatiquement tous les scénarios :

```javascript
// scripts/test-all-emails.js
const {
  sendCarrierInvitationEmail,
  sendOnboardingSuccessEmail,
  sendVigilanceAlertEmail,
  sendCarrierBlockedEmail,
  sendCarrierUnblockedEmail
} = require('../email');

async function testAllEmails(testEmail) {
  console.log('🧪 Test de tous les types d\'emails\n');

  // Test 1: Invitation
  console.log('1️⃣ Test email d\'invitation...');
  await sendCarrierInvitationEmail(testEmail, 'Test Transport', 'Admin');

  // Test 2: Onboarding
  console.log('2️⃣ Test email d\'onboarding...');
  await sendOnboardingSuccessEmail(testEmail, 'Test Transport', 85);

  // Test 3: Alerte J-30
  console.log('3️⃣ Test email alerte J-30...');
  await sendVigilanceAlertEmail(testEmail, 'Test Transport', 'kbis', 30, '2025-12-26');

  // Test 4: Alerte J-15
  console.log('4️⃣ Test email alerte J-15...');
  await sendVigilanceAlertEmail(testEmail, 'Test Transport', 'insurance', 15, '2025-12-11');

  // Test 5: Alerte J-7
  console.log('5️⃣ Test email alerte J-7...');
  await sendVigilanceAlertEmail(testEmail, 'Test Transport', 'license', 7, '2025-12-03');

  // Test 6: Blocage
  console.log('6️⃣ Test email de blocage...');
  await sendCarrierBlockedEmail(testEmail, 'Test Transport', 'Document KBIS expiré');

  // Test 7: Déblocage
  console.log('7️⃣ Test email de déblocage...');
  await sendCarrierUnblockedEmail(testEmail, 'Test Transport');

  console.log('\n✅ Tous les emails de test ont été envoyés!');
  console.log(`📬 Vérifiez votre boîte: ${testEmail}`);
}

// Usage: node scripts/test-all-emails.js rtardieu@symphonia.com
testAllEmails(process.argv[2] || 'test@example.com');
```

**Pour l'utiliser:**
```bash
node scripts/test-all-emails.js rtardieu@symphonia.com
```

---

## 🌐 Configuration DNS pour Améliorer la Délivrabilité

### Problème: Emails arrivent en SPAM

Si les emails arrivent systématiquement en SPAM, configurez les DNS :

### 1. SPF (Sender Policy Framework)

**Zone DNS symphonia.com - Enregistrement TXT:**
```
Nom: @
Type: TXT
Valeur: v=spf1 include:mx.ovh.net ~all
TTL: 3600
```

### 2. DKIM (DomainKeys Identified Mail)

**Via l'espace client OVH:**

1. Connectez-vous sur https://www.ovh.com/manager/
2. Allez dans **Emails**
3. Sélectionnez **symphonia.com**
4. Cliquez sur **DKIM**
5. Cliquez sur **Activer**
6. OVH vous donne 2-3 enregistrements DNS à ajouter :

```
Nom: default._domainkey
Type: TXT
Valeur: v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC...
```

7. Ajoutez ces enregistrements dans votre zone DNS

### 3. DMARC (Domain-based Message Authentication)

**Zone DNS symphonia.com - Enregistrement TXT:**
```
Nom: _dmarc
Type: TXT
Valeur: v=DMARC1; p=quarantine; rua=mailto:admin@symphonia.com; ruf=mailto:admin@symphonia.com; pct=100
TTL: 3600
```

### 4. Reverse DNS (PTR)

Vérifiez que l'IP d'envoi d'OVH a un reverse DNS correctement configuré.

```bash
# Vérifier le reverse DNS
nslookup ssl0.ovh.net
```

### Impact Attendu

Après configuration DNS :
- ✅ 90-95% des emails arrivent en boîte de réception
- ✅ Taux de spam réduit significativement
- ✅ Meilleure réputation d'expéditeur
- ✅ Conformité avec les standards email

**Délai de propagation:** 24-48h pour les DNS

---

## 📋 Checklist Complète des Tests

### Phase 1 : Tests Basiques
- [x] Test 1 : Email d'invitation ✅ (26/11/2025)
- [ ] Vérification réception email invitation
- [ ] Test 2 : Email d'onboarding
- [ ] Vérification réception email onboarding

### Phase 2 : Tests Alertes Vigilance
- [ ] Test 3 : Email alerte J-30
- [ ] Test 4 : Email alerte J-15
- [ ] Test 5 : Email alerte J-7
- [ ] Vérification CRON quotidien (6h00 UTC)

### Phase 3 : Tests Blocage/Déblocage
- [ ] Test 6 : Email de blocage
- [ ] Test 7 : Email de déblocage

### Phase 4 : Configuration DNS
- [ ] Configuration SPF
- [ ] Configuration DKIM (activation OVH)
- [ ] Configuration DMARC
- [ ] Vérification propagation DNS (24-48h)
- [ ] Test final après config DNS

### Phase 5 : Tests en Production Réelle
- [ ] Premier transporteur réel invité
- [ ] Premier onboarding réel
- [ ] Premières alertes réelles
- [ ] Monitoring des retours transporteurs

---

## 📞 Support et Documentation

### Documentation Technique
- [email.js](email.js) - Module d'envoi d'emails
- [OVH_EMAIL_CONFIGURATION.md](OVH_EMAIL_CONFIGURATION.md) - Config OVH
- [EMAIL_SYSTEM_SUMMARY.md](EMAIL_SYSTEM_SUMMARY.md) - Documentation complète

### Logs et Monitoring
```bash
# Logs AWS CloudWatch
aws logs tail /aws/elasticbeanstalk/rt-authz-api-prod/var/log/nodejs/nodejs.log --region eu-central-1 --follow

# Logs CRON (sur instance EC2)
sudo tail -f /var/log/vigilance-cron.log
```

### API Endpoints
- **Health:** http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/health
- **Invite:** POST /api/carriers/invite
- **Onboard:** POST /api/carriers/{id}/onboard
- **Block:** POST /api/carriers/{id}/block
- **Unblock:** POST /api/carriers/{id}/unblock

---

## 🎯 Prochaines Étapes Recommandées

1. **Vérifier la réception de l'email d'invitation de test** (rtardieu@symphonia.com)
2. **Tester l'email d'onboarding** avec le transporteur de test
3. **Configurer les DNS** (SPF, DKIM, DMARC) pour éviter le spam
4. **Créer des transporteurs de test** pour les alertes J-30, J-15, J-7
5. **Tester le cycle complet** : invitation → onboarding → alertes → blocage → déblocage
6. **Monitorer les logs** pendant les premiers envois
7. **Ajuster les templates** si nécessaire selon les retours

---

**Version:** v3.1.0-with-emails
**Date:** 26 Novembre 2025
**Status:** ✅ Système opérationnel - Tests en cours
**Premier test effectué:** Email d'invitation ✅

---

Bonne chance pour les tests ! 🚀
