# Démarrage Rapide - Configuration Services Externes

**Temps estimé: 30 minutes**

---

## Étape 1: Prérequis (5 minutes)

### Vérifier Node.js

```bash
node --version
# Requis: v20.x.x ou supérieur
```

Si non installé: https://nodejs.org/

### Installer les Dépendances

```bash
cd rt-backend-services
pnpm install
# ou
npm install
```

### Comptes Nécessaires

- [ ] Compte TomTom Developer (gratuit)
- [ ] Compte AWS (carte bancaire requise)
- [ ] Compte Google Cloud (carte bancaire requise)

**Budget mensuel estimé: 47-67€**

---

## Étape 2: Lancer le Configurateur (20 minutes)

```bash
node scripts/setup-external-services-interactive.js
```

### Suivez le guide interactif:

1. **TomTom Telematics API** (~10 min)
   - Créer compte sur https://developer.tomtom.com/
   - Créer une application
   - Copier l'API Key
   - Coller dans le script
   - ✅ Validation automatique

2. **AWS Textract OCR** (~15 min)
   - Créer compte AWS (si pas déjà fait)
   - Option A: Automatique avec `bash scripts/create-aws-textract-user.sh`
   - Option B: Manuel via console AWS
   - Copier Access Key ID et Secret
   - ✅ Validation automatique

3. **Google Vision API** (~10 min - Optionnel)
   - Créer projet Google Cloud
   - Activer Vision API
   - Créer Service Account
   - Télécharger fichier JSON
   - ✅ Validation automatique

---

## Étape 3: Tests (5 minutes)

Le script lance automatiquement les tests après chaque configuration.

**Ou manuellement:**

```bash
# Test TomTom
cd services/subscriptions-contracts-eb
node scripts/test-tomtom-connection.js

# Test AWS Textract
node scripts/test-textract-ocr.js

# Test Google Vision
node scripts/test-google-vision-ocr.js

# Tous les tests
node scripts/validate-all-external-services.js
```

**Résultat attendu:**
```
🎉 TOUS LES TESTS SONT PASSÉS !
✅ TomTom Telematics API est opérationnel
✅ AWS Textract OCR est opérationnel
✅ Google Vision API est opérationnel
```

---

## Étape 4: Vérification Finale

### Fichier .env.external Généré

```bash
cat .env.external
```

Contenu attendu:
```bash
# TomTom
TOMTOM_API_KEY=ZQ9AaXfe1bDR3egvxV0I5owWAl9q2JBU
TOMTOM_TRACKING_API_URL=https://api.tomtom.com/tracking/1

# AWS Textract
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLE
AWS_REGION=eu-central-1
OCR_PROVIDER=AWS_TEXTRACT

# Google Vision
GOOGLE_APPLICATION_CREDENTIALS=/path/to/google-credentials.json
OCR_ENABLE_FALLBACK=true
```

### État de Configuration

```bash
cat .setup-state.json
```

Tous les services doivent être `configured: true` et `tested: true`.

---

## Étape 5: Déploiement (Optionnel)

### Déployer sur AWS Elastic Beanstalk

```bash
# Configurer les variables d'environnement
eb setenv \
  TOMTOM_API_KEY=your-key \
  AWS_ACCESS_KEY_ID=your-key-id \
  AWS_SECRET_ACCESS_KEY=your-secret \
  AWS_REGION=eu-central-1 \
  OCR_PROVIDER=AWS_TEXTRACT \
  OCR_ENABLE_FALLBACK=true

# Déployer
eb deploy
```

### Vérifier le déploiement

```bash
eb logs | grep -E '(TomTom|AWS Textract|Google Vision)'
```

---

## Monitoring (Post-Configuration)

### Configurer les Cron Jobs

**Linux/Mac:**

```bash
crontab -e

# Ajouter:
0 8 * * * cd /chemin/vers/rt-backend-services && node scripts/monitor-quotas.js
0 18 * * * cd /chemin/vers/rt-backend-services && node scripts/budget-alerts.js
```

**Windows Task Scheduler:**

Créer 2 tâches quotidiennes:
- 8h: `node scripts/monitor-quotas.js`
- 18h: `node scripts/budget-alerts.js`

---

## Troubleshooting Rapide

### Script ne démarre pas

```bash
# Vérifier Node.js
node --version

# Réinstaller dépendances
rm -rf node_modules
pnpm install
```

### Tests échouent

```bash
# Vérifier les credentials
cat .env.external

# Vérifier la connexion Internet
ping api.tomtom.com
ping textract.eu-central-1.amazonaws.com
```

### AWS CLI non configuré

```bash
# Installer AWS CLI
# Linux/Mac
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Windows
# Télécharger: https://awscli.amazonaws.com/AWSCLIV2.msi

# Configurer
aws configure
```

---

## Prochaines Étapes

1. **Rotation des Clés** (tous les 90 jours)
   ```bash
   node scripts/rotate-api-keys.js
   ```

2. **Monitoring Quotas** (quotidien)
   ```bash
   node scripts/monitor-quotas.js
   ```

3. **Alertes Budget** (quotidien)
   ```bash
   node scripts/budget-alerts.js
   ```

4. **Documentation Complète**
   - [Configuration Détaillée](CONFIGURATION_EXTERNE_AUTOMATISEE.md)
   - [Guide TomTom](guides/TOMTOM_SETUP_GUIDE.md)
   - [Guide AWS](guides/AWS_TEXTRACT_SETUP_GUIDE.md)
   - [Guide Google](guides/GOOGLE_VISION_SETUP_GUIDE.md)

---

## Coûts Estimés

| Service       | Coût Mensuel | Free Tier            |
|---------------|--------------|----------------------|
| TomTom        | 0-20€        | 75,000 req/mois      |
| AWS Textract  | ~46€         | 1,000 pages (12 mois)|
| Google Vision | ~1.40€       | 1,000 pages/mois     |
| **TOTAL**     | **47-67€**   |                      |

---

## Support

**Documentation:** [CONFIGURATION_EXTERNE_AUTOMATISEE.md](CONFIGURATION_EXTERNE_AUTOMATISEE.md)

**Scripts:** [scripts/README.md](scripts/README.md)

**Aide:** support@rt-symphonia.com

---

✅ **Configuration terminée !**

Vous êtes prêt à utiliser les services externes dans RT SYMPHONI.A.

---

*Guide de démarrage rapide - RT SYMPHONI.A Team*
*Dernière mise à jour: 2025-11-26*
