# 🚀 Configuration DNS Automatique via API OVH

**Domaine:** symphonia-controltower.com
**Méthode:** Configuration automatique via API OVH (sans interface web)

---

## 🎯 Avantages de l'API OVH

✅ **Automatique** - Pas besoin de l'interface web OVH Manager
✅ **Rapide** - Configuration en 1 seule commande
✅ **Fiable** - Moins d'erreurs de saisie
✅ **Vérification** - Vérifie automatiquement la configuration

---

## 📋 Prérequis

### 1. Installer le Package NPM `ovh`

```bash
cd c:\Users\rtard\rt-backend-services\services\authz-eb
npm install ovh --save-dev
```

**Note:** Si l'installation échoue à cause des workspaces, installez globalement :
```bash
npm install -g ovh
```

---

### 2. Obtenir vos Credentials API OVH

#### Étape A : Créer une Application OVH

1. Allez sur : https://eu.api.ovh.com/createApp/

2. Remplissez le formulaire :
   - **Application name:** SYMPHONIA DNS Manager
   - **Application description:** Configuration DNS automatique pour emails
   - Cliquez sur **Create keys**

3. **Sauvegardez** les credentials générés :
   - `Application Key` (ex: `aBcDeFgHiJkLmNoP`)
   - `Application Secret` (ex: `1234567890abcdef`)

#### Étape B : Obtenir un Consumer Key

Le Consumer Key autorise votre application à modifier les DNS.

**Méthode 1 : Script automatique (recommandé)**

Créez un fichier `get-consumer-key.js` :

```javascript
const ovh = require('ovh');

const api = ovh({
  endpoint: 'ovh-eu',
  appKey: 'VOTRE_APPLICATION_KEY',
  appSecret: 'VOTRE_APPLICATION_SECRET'
});

api.request('POST', '/auth/credential', {
  accessRules: [
    { method: 'GET', path: '/domain/zone/*' },
    { method: 'POST', path: '/domain/zone/*' },
    { method: 'PUT', path: '/domain/zone/*' },
    { method: 'DELETE', path: '/domain/zone/*' },
    { method: 'GET', path: '/email/domain/*' },
    { method: 'POST', path: '/email/domain/*' }
  ]
}, (error, credential) => {
  if (error) {
    console.error('Erreur:', error);
  } else {
    console.log('Consumer Key:', credential.consumerKey);
    console.log('Validez sur:', credential.validationUrl);
  }
});
```

Exécutez :
```bash
node get-consumer-key.js
```

Ouvrez l'URL affichée et cliquez sur **Valider** pour autoriser l'application.

**Méthode 2 : Manuel**

1. Utilisez cet outil : https://eu.api.ovh.com/createToken/
2. Cochez les permissions :
   - GET/POST/PUT/DELETE `/domain/zone/*`
   - GET/POST `/email/domain/*`
3. Validité : **Unlimited**
4. Cliquez sur **Create keys**
5. Sauvegardez le `Consumer Key` généré

---

### 3. Configurer les Credentials

**Option A : Variables d'environnement**

Ajoutez dans votre `.env` :

```bash
# API OVH
OVH_ENDPOINT=ovh-eu
OVH_APP_KEY=VOTRE_APPLICATION_KEY
OVH_APP_SECRET=VOTRE_APPLICATION_SECRET
OVH_CONSUMER_KEY=VOTRE_CONSUMER_KEY
```

**Option B : Fichier .ovhrc**

Copiez `.ovhrc.example` en `.ovhrc` et remplissez :

```ini
endpoint=ovh-eu
appKey=VOTRE_APPLICATION_KEY
appSecret=VOTRE_APPLICATION_SECRET
consumerKey=VOTRE_CONSUMER_KEY
```

**⚠️ N'oubliez pas** d'ajouter `.ovhrc` dans `.gitignore` !

---

## 🚀 Utilisation

### Configuration Automatique Complète

Une fois les credentials configurés, lancez :

```bash
node scripts/configurer-dns-auto.js
```

**Ce script va automatiquement :**

1. ✅ Configurer SPF (`v=spf1 include:mx.ovh.net ~all`)
2. ✅ Activer DKIM sur le service email OVH
3. ✅ Configurer DMARC (`v=DMARC1; p=quarantine; rua=mailto:admin@...`)
4. ✅ Rafraîchir la zone DNS
5. ✅ Vérifier la configuration

**Exemple de sortie :**

```
═══════════════════════════════════════════════════════════
  CONFIGURATION AUTOMATIQUE DNS VIA API OVH
═══════════════════════════════════════════════════════════

Domaine : symphonia-controltower.com

ℹ Connexion à l'API OVH...
✓ Connecté à l'API OVH

▶ Étape 1/3 : Configuration SPF

ℹ Configuration de SPF en cours...
ℹ Ajout du nouvel enregistrement SPF...
ℹ Rafraîchissement de la zone DNS...
✓ SPF configuré avec succès !
ℹ Valeur: v=spf1 include:mx.ovh.net ~all

▶ Étape 2/3 : Configuration DKIM

ℹ Activation DKIM sur les emails OVH...
✓ DKIM activé avec succès !
⚠ DKIM prend 24-48h pour être complètement actif

▶ Étape 3/3 : Configuration DMARC

ℹ Configuration de DMARC en cours...
ℹ Ajout du nouvel enregistrement DMARC...
ℹ Rafraîchissement de la zone DNS...
✓ DMARC configuré avec succès !
ℹ Valeur: v=DMARC1; p=quarantine; rua=mailto:admin@symphonia-controltower.com; pct=100

═══════════════════════════════════════════════════════════
              VÉRIFICATION DE LA CONFIGURATION
═══════════════════════════════════════════════════════════

Vérification des enregistrements DNS...

ℹ Vérification SPF...
✓ SPF configuré et actif
ℹ Vérification DMARC...
✓ DMARC configuré et actif

Score DNS : 2/2 (DKIM nécessite 24-48h)

✓ Configuration DNS réussie !

Prochaines étapes :
  1. Attendre 24-48h pour activation complète de DKIM
  2. Vérifier avec: node scripts/verifier-dns.js
  3. Tester avec: node scripts/test-systeme-complet.js --send-test-email

✓ Configuration terminée !
```

---

## ✅ Vérification

### Immédiatement après configuration

```bash
# Vérification DNS automatique
node scripts/verifier-dns.js

# Test système complet
node scripts/test-systeme-complet.js
```

### Après 24-48h

Vérifier que DKIM est actif :

```bash
node scripts/verifier-dns.js
```

Résultat attendu :
```
Score: 3/3 configurations valides
✅ SPF:   Configuré
✅ DKIM:  Configuré (sélecteur: default)
✅ DMARC: Configuré
```

---

## 🔧 Fonctionnalités du Script

### Détection Automatique

Le script détecte :
- Si SPF est déjà configuré → Ne le recrée pas
- Si DKIM est déjà activé → Ne le réactive pas
- Si DMARC est déjà configuré → Ne le recrée pas
- Anciens enregistrements SPF/DMARC → Les supprime avant d'ajouter les nouveaux

### Gestion des Erreurs

Le script gère :
- Credentials API manquants → Message d'erreur explicite
- Service email inexistant → Instructions pour le créer
- Zone DNS introuvable → Erreur avec domaine
- Propagation DNS lente → Avertissements appropriés

### Rafraîchissement Zone DNS

Le script rafraîchit automatiquement la zone DNS après chaque modification
pour accélérer la propagation.

---

## 🆘 Problèmes Courants

### Erreur : Credentials OVH API manquants

**Symptôme :**
```
✗ Credentials OVH API manquants !

Vous devez définir ces variables d'environnement :
  - OVH_ENDPOINT (ex: ovh-eu)
  - OVH_APP_KEY
  - OVH_APP_SECRET
  - OVH_CONSUMER_KEY
```

**Solution :**
1. Créez vos credentials sur https://eu.api.ovh.com/createApp/
2. Ajoutez-les dans `.env` ou `.ovhrc`
3. Relancez le script

---

### Erreur : Zone DNS non trouvée

**Symptôme :**
```
✗ Erreur configuration SPF: Zone DNS non trouvée pour symphonia-controltower.com
```

**Solution :**
1. Vérifiez que le domaine est bien dans votre compte OVH
2. Vérifiez que vous avez accès à la gestion DNS
3. Vérifiez les permissions du Consumer Key

---

### Erreur : Service email non trouvé (DKIM)

**Symptôme :**
```
⚠ Service email non trouvé pour ce domaine
ℹ Vous devez d'abord configurer un service email OVH
```

**Solution :**

**Option 1 : Créer un service email**
1. OVH Manager → Web Cloud → Emails
2. Commander un service email pour symphonia-controltower.com

**Option 2 : Activer DKIM manuellement**
1. OVH Manager → Web Cloud → Emails
2. Cliquez sur symphonia-controltower.com
3. Onglet DKIM → Activer

---

### DKIM prend trop de temps

**Symptôme :**
DKIM toujours pas actif après 48h

**Solution :**
1. Vérifiez le statut dans OVH Manager → Emails → DKIM
2. Si "En cours" depuis >48h, contactez le support OVH
3. Si DNS externe, vérifiez que les enregistrements sont bien ajoutés

---

## 📚 Documentation API OVH

- **API Console :** https://eu.api.ovh.com/console/
- **Documentation :** https://docs.ovh.com/fr/api/
- **Guide DKIM :** https://docs.ovh.com/fr/emails/activer-dkim/
- **Gestion DNS :** https://docs.ovh.com/fr/domains/editer-ma-zone-dns/

---

## 🔐 Sécurité

### Protéger vos Credentials

✅ **À FAIRE :**
- Sauvegarder les credentials dans un gestionnaire de mots de passe
- Ajouter `.ovhrc` dans `.gitignore`
- Utiliser des variables d'environnement en production
- Limiter les permissions du Consumer Key au minimum nécessaire

❌ **NE PAS FAIRE :**
- Committer `.ovhrc` dans Git
- Partager les credentials par email/chat
- Donner des permissions trop larges au Consumer Key
- Utiliser "Unlimited" validity si pas nécessaire

---

## 📊 Comparaison : API vs Interface Web

| Critère | API Automatique | Interface Web Manuelle |
|---------|----------------|------------------------|
| **Temps** | 30 secondes | 20 minutes |
| **Erreurs** | Aucune (automatique) | Risque de fautes de frappe |
| **Répétable** | Oui (script) | Non (manuel à chaque fois) |
| **Vérification** | Automatique | Manuelle |
| **Multi-domaines** | Facile | Fastidieux |
| **Prérequis** | Credentials API | Accès OVH Manager |

**Recommandation :** API automatique si vous gérez plusieurs domaines ou voulez automatiser.

---

## 🎯 Prochaines Étapes

Une fois les DNS configurés avec l'API :

1. **Attendre la propagation** (24-48h pour DKIM)

2. **Vérifier :**
   ```bash
   node scripts/verifier-dns.js
   ```

3. **Tester le système :**
   ```bash
   node scripts/test-systeme-complet.js --send-test-email
   ```

4. **Inviter un premier transporteur :**
   ```bash
   curl -X POST http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/carriers/invite \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@example.com",
       "companyName": "Transport Test",
       "siret": "12345678901234",
       "invitedBy": "Admin",
       "referenceMode": "direct"
     }'
   ```

5. **Suivre votre progression :**
   ```bash
   cat TABLEAU_BORD_PROGRESSION.md
   ```

---

**Version:** v3.1.0-with-emails
**Date:** 26 Novembre 2025
**Domaine:** symphonia-controltower.com

---

🚀 **Configurez vos DNS en 30 secondes avec l'API OVH !**

```bash
node scripts/configurer-dns-auto.js
```
