# Index des Scripts - authz-eb

## Scripts d'Invitation Transporteurs (Jour 12)

### Script Principal

**invite-test-carriers.cjs** ⭐
- **Description**: Script complet pour créer des transporteurs de test de A à Z
- **Usage**: `node scripts/invite-test-carriers.cjs`
- **Workflow**: Création → Upload documents → Vérification → Calcul score → Rapport JSON
- **Documentation**: [README-invite-test-carriers.md](./README-invite-test-carriers.md)
- **Exemples**: [EXEMPLE-RAPPORT.md](./EXEMPLE-RAPPORT.md)

### Script de Test

**test-invite-script.cjs**
- **Description**: Vérifie que la configuration est correcte avant d'exécuter le script principal
- **Usage**: `node scripts/test-invite-script.cjs`
- **Vérifie**: Variables env, MongoDB, API, dépendances Node, AWS S3

## Scripts de Test Emails

### test-all-emails.js
- **Description**: Test de tous les types d'emails SYMPHONI.A
- **Usage**: `node scripts/test-all-emails.js`
- **Emails testés**: Invitation, onboarding, premium, documents, etc.

### test-email-direct.js
- **Description**: Test d'envoi d'email direct
- **Usage**: `node scripts/test-email-direct.js`

### test-smtp.js
- **Description**: Test de la connexion SMTP OVH
- **Usage**: `node scripts/test-smtp.js`

### test-email-metrics.cjs
- **Description**: Test des métriques d'emails
- **Usage**: `node scripts/test-email-metrics.cjs`

## Scripts de Test Système

### test-systeme-complet.js
- **Description**: Test complet du système (DNS, SMTP, API, MongoDB)
- **Usage**: `node scripts/test-systeme-complet.js [--send-test-email]`

### test-webhooks.cjs
- **Description**: Test du système de webhooks carriers
- **Usage**: `node scripts/test-webhooks.cjs`

### test-document-expiry-alerts.cjs
- **Description**: Test des alertes d'expiration de documents
- **Usage**: `node scripts/test-document-expiry-alerts.cjs`

## Scripts de Configuration

### setup-mongodb-unique-indexes.js
- **Description**: Configure les index MongoDB avec contraintes uniques
- **Usage**: `node scripts/setup-mongodb-unique-indexes.js`

### setup-carrier-indexes.js
- **Description**: Configure les index pour la collection carriers
- **Usage**: `node scripts/setup-carrier-indexes.js`

### setup-email-logs-indexes.cjs
- **Description**: Configure les index pour les logs d'emails
- **Usage**: `node scripts/setup-email-logs-indexes.cjs`

## Scripts DNS

### verifier-dns.js
- **Description**: Vérifie la configuration DNS (SPF, DKIM, DMARC)
- **Usage**: `node scripts/verifier-dns.js`

### assistant-dns.js
- **Description**: Assistant pour configurer le DNS
- **Usage**: `node scripts/assistant-dns.js`

### configurer-dns-auto.js
- **Description**: Configuration automatique du DNS via API OVH
- **Usage**: `node scripts/configurer-dns-auto.js`

### configurer-dns-simple.js
- **Description**: Configuration DNS simplifiée
- **Usage**: `node scripts/configurer-dns-simple.js`

### corriger-spf.js
- **Description**: Correction de l'enregistrement SPF
- **Usage**: `node scripts/corriger-spf.js`

## Scripts OVH

### get-consumer-key.js
- **Description**: Obtenir une clé consommateur OVH
- **Usage**: `node scripts/get-consumer-key.js`

### get-consumer-key-simple.js
- **Description**: Version simplifiée pour obtenir la clé OVH
- **Usage**: `node scripts/get-consumer-key-simple.js`

### configure-smtp-ovh.cjs
- **Description**: Configurer SMTP avec OVH
- **Usage**: `node scripts/configure-smtp-ovh.cjs`

## Scripts Utilitaires

### create-demo-accounts.cjs
- **Description**: Créer des comptes de démonstration
- **Usage**: `node scripts/create-demo-accounts.cjs`

### demo-scenario-complet.cjs
- **Description**: Scénario de démonstration complet
- **Usage**: `node scripts/demo-scenario-complet.cjs`

### cleanup-vat-duplicates.js
- **Description**: Nettoyer les doublons de TVA
- **Usage**: `node scripts/cleanup-vat-duplicates.js`

### vigilance-cron.js
- **Description**: Job cron pour vérifier la vigilance des transporteurs
- **Usage**: `node scripts/vigilance-cron.js`

## Scripts d'Activation

### activate-modules.cjs
- **Description**: Activer les modules du système
- **Usage**: `node scripts/activate-modules.cjs`

## Ordre d'Exécution Recommandé

### Configuration Initiale

1. **Setup MongoDB**
   ```bash
   node scripts/setup-mongodb-unique-indexes.js
   node scripts/setup-carrier-indexes.js
   node scripts/setup-email-logs-indexes.cjs
   ```

2. **Configuration DNS/Email**
   ```bash
   node scripts/verifier-dns.js
   node scripts/test-smtp.js
   ```

3. **Test Système**
   ```bash
   node scripts/test-systeme-complet.js --send-test-email
   ```

### Création de Transporteurs Test

1. **Vérifier la configuration**
   ```bash
   node scripts/test-invite-script.cjs
   ```

2. **Créer les transporteurs**
   ```bash
   node scripts/invite-test-carriers.cjs
   ```

3. **Vérifier les résultats**
   - Consulter le rapport JSON généré
   - Vérifier dans MongoDB
   - Vérifier les documents S3

### Tests Quotidiens

```bash
# Test emails
node scripts/test-all-emails.js

# Test webhooks
node scripts/test-webhooks.cjs

# Test expiration documents
node scripts/test-document-expiry-alerts.cjs
```

## Variables d'Environnement Requises

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/rt-authz

# API
API_URL=http://localhost:3001
PORT=3001

# AWS
AWS_REGION=eu-central-1
S3_DOCUMENTS_BUCKET=rt-carrier-documents

# SMTP
SMTP_HOST=ssl0.ovh.net
SMTP_PORT=587
SMTP_USER=noreply@symphonia-controltower.com
SMTP_PASSWORD=your-password
SMTP_FROM=noreply@symphonia-controltower.com

# Frontend
FRONTEND_URL=https://symphonia.com
```

## Documentation Associée

- [README-invite-test-carriers.md](./README-invite-test-carriers.md) - Guide du script d'invitation
- [EXEMPLE-RAPPORT.md](./EXEMPLE-RAPPORT.md) - Exemples de rapports générés
- [../README.md](../README.md) - Documentation principale
- [../CARRIER_SYSTEM_DOCUMENTATION.md](../CARRIER_SYSTEM_DOCUMENTATION.md) - Documentation système carriers
- [../GUIDE_TEST_COMPLET_EMAILS.md](../GUIDE_TEST_COMPLET_EMAILS.md) - Guide test emails

## Dépendances Communes

Tous les scripts nécessitent :

```json
{
  "dependencies": {
    "dotenv": "^16.0.0",
    "mongodb": "^6.0.0",
    "node-fetch": "^2.6.7"
  }
}
```

Certains scripts nécessitent aussi :

```json
{
  "dependencies": {
    "nodemailer": "^6.9.0",
    "@aws-sdk/client-s3": "^3.0.0",
    "@aws-sdk/s3-request-presigner": "^3.0.0",
    "@aws-sdk/client-textract": "^3.0.0",
    "@aws-sdk/client-sns": "^3.0.0"
  }
}
```

## Support et Débogage

### Logs

La plupart des scripts génèrent des logs détaillés dans la console avec :
- ✅ Succès (vert)
- ❌ Erreurs (rouge)
- ⚠️ Avertissements (jaune)
- ℹ️ Informations (bleu)

### Rapports

Les scripts génèrent des rapports dans :
- `scripts/invite-report-*.json` - Rapports d'invitation
- `scripts/*-logs-*.txt` - Logs d'exécution

### Problèmes Courants

1. **MongoDB non accessible**
   - Vérifier MONGODB_URI
   - Vérifier que MongoDB est démarré

2. **API non accessible**
   - Vérifier que l'API est démarrée
   - Vérifier API_URL

3. **Erreurs AWS**
   - Vérifier credentials AWS
   - Vérifier permissions IAM
   - Vérifier que le bucket S3 existe

4. **Erreurs SMTP**
   - Vérifier SMTP_USER et SMTP_PASSWORD
   - Vérifier la configuration DNS

## Maintenance

### Mise à Jour des Scripts

Les scripts sont versionés avec le projet. Pour mettre à jour :

```bash
git pull origin main
npm install  # Mettre à jour les dépendances
```

### Nettoyage

Pour nettoyer les carriers de test :

```bash
# Se connecter à MongoDB
mongo rt-authz

# Supprimer les carriers de test
db.carriers.deleteMany({ email: { $regex: /^(test|demo).*@example\.com$/ } })
db.carrier_documents.deleteMany({ /* carriers supprimés */ })
```

---

**Dernière mise à jour**: 2024-01-15 (Jour 12)
**Mainteneur**: SYMPHONI.A Team
