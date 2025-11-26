# Scripts de Configuration des Services Externes

## Vue d'ensemble

Ce dossier contient tous les scripts pour la configuration, la maintenance et le monitoring des services externes de RT SYMPHONI.A.

## Scripts Principaux

### 1. setup-external-services-interactive.js

**Script principal de configuration interactive**

```bash
node setup-external-services-interactive.js
```

Fonctionnalités:
- Configuration guidée TomTom, AWS Textract, Google Vision
- Validation en temps réel des credentials
- Génération automatique du fichier .env
- Tests de connexion intégrés

---

### 2. create-aws-textract-user.sh

**Automatisation de la création d'un IAM User AWS pour Textract**

```bash
bash create-aws-textract-user.sh
```

Prérequis:
- AWS CLI installé et configuré
- Permissions IAM admin

Actions:
- Crée un IAM User `rt-symphonia-textract-user`
- Crée une politique IAM avec permissions minimales
- Génère les Access Keys
- Affiche et sauvegarde les credentials

---

### 3. rotate-api-keys.js

**Rotation automatique des API Keys**

```bash
node rotate-api-keys.js
```

Fonctionnalités:
- Vérification de l'âge des clés (recommandation: 90 jours)
- Rotation guidée pour chaque service
- Historique des rotations
- Alertes si rotation requise

Menu:
1. Vérifier le statut de toutes les clés
2. Rotation TomTom API Key
3. Rotation AWS Access Keys
4. Rotation Google Service Account
5. Rotation automatique (tous les services requis)
6. Quitter

---

### 4. monitor-quotas.js

**Monitoring des quotas et limites**

```bash
node monitor-quotas.js
```

Fonctionnalités:
- Suivi en temps réel de l'usage
- Calcul des quotas restants
- Barres de progression visuelles
- Alertes automatiques
- Export JSON des métriques

Surveille:
- TomTom: quotas quotidien (2,500) et mensuel (75,000)
- AWS Textract: quota mensuel configuré
- Google Vision: quota mensuel et Free Tier (1,000)

---

### 5. budget-alerts.js

**Alertes de dépassement de budget**

```bash
node budget-alerts.js
```

Fonctionnalités:
- Calcul des coûts en temps réel
- Comparaison avec le budget défini
- Alertes par niveaux (warning 75%, critical 90%, exceeded 100%)
- Envoi de webhooks (Slack, Discord)
- Recommandations d'optimisation

Configuration:
```javascript
const CONFIG = {
  budgets: {
    monthly: 70.0,        // Budget total
    tomtom: 0.0,          // Free Tier
    aws_textract: 46.0,
    google_vision: 1.50
  }
};
```

---

## Automatisation avec Cron

### Linux/Mac

```bash
# Éditer crontab
crontab -e

# Monitoring quotidien des quotas (8h)
0 8 * * * cd /chemin/vers/rt-backend-services && node scripts/monitor-quotas.js >> logs/quota-monitoring.log 2>&1

# Vérification budget quotidienne (18h)
0 18 * * * cd /chemin/vers/rt-backend-services && node scripts/budget-alerts.js >> logs/budget-alerts.log 2>&1

# Vérification rotation des clés (hebdomadaire, lundi 10h)
0 10 * * 1 cd /chemin/vers/rt-backend-services && node scripts/rotate-api-keys.js >> logs/key-rotation.log 2>&1
```

### Windows Task Scheduler

1. Ouvrir "Planificateur de tâches"
2. Créer une tâche de base
3. Déclencheur: Quotidien / Hebdomadaire
4. Action: Démarrer un programme
   - Programme: `node.exe`
   - Arguments: `C:\chemin\vers\rt-backend-services\scripts\monitor-quotas.js`

---

## Fichiers Générés

Les scripts créent et utilisent ces fichiers:

| Fichier                       | Description                              |
|-------------------------------|------------------------------------------|
| `.env.external`               | Configuration des services externes      |
| `.setup-state.json`           | État de configuration (services/tests)   |
| `.last-rotation.json`         | Historique des rotations de clés         |
| `.quota-usage.json`           | Tracking de l'usage des quotas           |
| `.quota-alerts.json`          | Historique des alertes de quotas         |
| `.budget-alerts.json`         | Historique des alertes de budget         |
| `quota-report-*.json`         | Rapports exportés (monitoring)           |
| `budget-report-*.json`        | Rapports exportés (budget)               |
| `aws-textract-credentials-*.txt` | Backup credentials AWS                |

**IMPORTANT:** Ces fichiers contiennent des données sensibles. Assurez-vous qu'ils sont dans `.gitignore`.

---

## Webhooks et Notifications

### Configuration Slack

```bash
# Dans .env ou variable d'environnement
BUDGET_ALERT_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### Configuration Discord

```bash
BUDGET_ALERT_WEBHOOK=https://discord.com/api/webhooks/YOUR/WEBHOOK/URL
```

Le webhook sera appelé automatiquement par `budget-alerts.js` en cas de dépassement.

Format du payload:
```json
{
  "level": "critical",
  "service": "aws_textract",
  "message": "Budget aws_textract à 95.3%",
  "cost": "43.87€",
  "budget": "46.00€",
  "percent": "95.3%",
  "timestamp": "2025-11-26T10:30:00.000Z"
}
```

---

## Dépannage

### Script ne démarre pas

**Problème:** `node: command not found`

**Solution:**
```bash
# Vérifier Node.js
node --version

# Si non installé
# Linux/Mac avec nvm
nvm install 20

# Windows
# Télécharger depuis: https://nodejs.org/
```

---

### Permissions refusées (Linux/Mac)

**Problème:** `Permission denied`

**Solution:**
```bash
chmod +x scripts/*.js
chmod +x scripts/*.sh
```

---

### AWS CLI non configuré

**Problème:** `Unable to locate credentials`

**Solution:**
```bash
# Configurer AWS CLI
aws configure

# Ou utiliser des variables d'environnement
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_REGION=eu-central-1
```

---

### Erreur "Cannot find module"

**Problème:** Dépendances manquantes

**Solution:**
```bash
# Depuis le root du projet
pnpm install
# ou
npm install
```

---

## Développement

### Ajouter un nouveau service

1. Créer un nouveau monitor dans le script de monitoring
2. Ajouter la configuration de budget
3. Créer un guide dans `../guides/`
4. Ajouter au script interactif

### Tester les scripts

```bash
# Mode debug
DEBUG=true node scripts/monitor-quotas.js

# Avec données de test
node scripts/monitor-quotas.js --test-data

# Sans webhook
BUDGET_ALERT_WEBHOOK= node scripts/budget-alerts.js
```

---

## Sécurité

### Bonnes Pratiques

- ✅ Ne JAMAIS committer les fichiers `.env*`, `.*json` avec credentials
- ✅ Utiliser `.gitignore` pour exclure les fichiers sensibles
- ✅ Rotation des clés tous les 90 jours maximum
- ✅ Permissions minimales pour les IAM Users
- ✅ Monitoring actif des coûts et quotas
- ✅ Alertes configurées pour les dépassements

### Fichiers à Exclure de Git

Ajoutez dans `.gitignore`:
```
# Configuration sensible
.env*
!.env.example

# État et logs
.setup-state.json
.last-rotation.json
.quota-usage.json
.quota-alerts.json
.budget-alerts.json
*-report-*.json
aws-textract-credentials-*.txt

# Logs
logs/
*.log
```

---

## Support

### Documentation Complète

- [Configuration Automatisée](../CONFIGURATION_EXTERNE_AUTOMATISEE.md)
- [Guide TomTom](../guides/TOMTOM_SETUP_GUIDE.md)
- [Guide AWS Textract](../guides/AWS_TEXTRACT_SETUP_GUIDE.md)
- [Guide Google Vision](../guides/GOOGLE_VISION_SETUP_GUIDE.md)

### Aide

- Email: support@rt-symphonia.com
- Issues: https://github.com/votre-org/rt-backend-services/issues

---

*Maintenu par l'équipe RT SYMPHONI.A*
*Dernière mise à jour: 2025-11-26*
