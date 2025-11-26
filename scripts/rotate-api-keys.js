#!/usr/bin/env node
// ============================================================================
// RT SYMPHONI.A - Script de Rotation des API Keys
// ============================================================================
// Version: 1.0.0
// Date: 2025-11-26
// Description: Automatise la rotation des credentials pour tous les services
//              externes (TomTom, AWS, Google Vision)
// ============================================================================

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  rotationIntervalDays: 90,
  warningDays: 14,
  lastRotationFile: path.join(__dirname, '..', '.last-rotation.json')
};

// Couleurs
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m'
};

// ============================================================================
// Utilitaires
// ============================================================================

const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ️  ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  header: (msg) => {
    console.log(`\n${colors.bright}${colors.cyan}${msg}${colors.reset}`);
    console.log(colors.cyan + '─'.repeat(msg.length) + colors.reset);
  }
};

function promptUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${colors.yellow}${question}${colors.reset} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function confirm(question) {
  const answer = await promptUser(`${question} (o/N)`);
  return answer.toLowerCase() === 'o' || answer.toLowerCase() === 'oui';
}

// ============================================================================
// Gestion de l'Historique de Rotation
// ============================================================================

class RotationHistory {
  constructor() {
    this.history = this.load();
  }

  load() {
    try {
      if (fs.existsSync(CONFIG.lastRotationFile)) {
        const data = fs.readFileSync(CONFIG.lastRotationFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      log.warning('Impossible de charger l\'historique de rotation');
    }

    return {
      tomtom: { lastRotation: null, keyAge: null },
      aws: { lastRotation: null, keyAge: null },
      google: { lastRotation: null, keyAge: null }
    };
  }

  save() {
    try {
      fs.writeFileSync(
        CONFIG.lastRotationFile,
        JSON.stringify(this.history, null, 2)
      );
      log.success('Historique de rotation sauvegardé');
    } catch (error) {
      log.error('Impossible de sauvegarder l\'historique: ' + error.message);
    }
  }

  updateRotation(service) {
    this.history[service] = {
      lastRotation: new Date().toISOString(),
      keyAge: 0
    };
    this.save();
  }

  getDaysSinceRotation(service) {
    const lastRotation = this.history[service]?.lastRotation;
    if (!lastRotation) return null;

    const lastDate = new Date(lastRotation);
    const now = new Date();
    const diffTime = Math.abs(now - lastDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  }

  needsRotation(service) {
    const days = this.getDaysSinceRotation(service);
    if (days === null) return true;
    return days >= CONFIG.rotationIntervalDays;
  }

  showWarning(service) {
    const days = this.getDaysSinceRotation(service);
    if (days === null) return false;

    const daysUntilRotation = CONFIG.rotationIntervalDays - days;
    return daysUntilRotation <= CONFIG.warningDays && daysUntilRotation > 0;
  }
}

// ============================================================================
// Rotation TomTom API Key
// ============================================================================

class TomTomRotator {
  async checkStatus() {
    log.header('TomTom API Key - Statut');

    const history = new RotationHistory();
    const days = history.getDaysSinceRotation('tomtom');

    if (days === null) {
      log.warning('Aucune rotation enregistrée');
      log.info('Recommandation: Effectuer une rotation maintenant');
      return { needsRotation: true, days: null };
    }

    log.info(`Dernière rotation: il y a ${days} jours`);

    if (days >= CONFIG.rotationIntervalDays) {
      log.error(`Rotation requise ! (> ${CONFIG.rotationIntervalDays} jours)`);
      return { needsRotation: true, days };
    } else if (days >= CONFIG.rotationIntervalDays - CONFIG.warningDays) {
      const remaining = CONFIG.rotationIntervalDays - days;
      log.warning(`Rotation recommandée dans ${remaining} jours`);
      return { needsRotation: false, days, warning: true };
    } else {
      log.success('API Key à jour');
      const remaining = CONFIG.rotationIntervalDays - days;
      log.info(`Prochaine rotation dans ${remaining} jours`);
      return { needsRotation: false, days };
    }
  }

  async rotate() {
    log.header('Rotation TomTom API Key');

    log.info('Étapes à suivre:');
    console.log('  1. Visitez: https://developer.tomtom.com/user/me/apps');
    console.log('  2. Sélectionnez votre application "RT SYMPHONI.A"');
    console.log('  3. Dans la section "Consumer Key (API Key)"');
    console.log('  4. Cliquez sur "Regenerate key"');
    console.log('  5. Copiez la nouvelle clé');

    const proceed = await confirm('\nAvez-vous généré une nouvelle clé ?');
    if (!proceed) {
      log.warning('Rotation annulée');
      return false;
    }

    const newKey = await promptUser('Entrez la nouvelle API Key');

    if (!newKey || newKey.length < 20) {
      log.error('API Key invalide');
      return false;
    }

    // Sauvegarder dans l'historique
    const history = new RotationHistory();
    history.updateRotation('tomtom');

    log.success('TomTom API Key mise à jour dans l\'historique');
    log.warning('N\'oubliez pas de mettre à jour .env.external-services !');
    log.info(`TOMTOM_API_KEY=${newKey}`);

    return true;
  }
}

// ============================================================================
// Rotation AWS Access Keys
// ============================================================================

class AWSRotator {
  async checkStatus() {
    log.header('AWS Access Keys - Statut');

    const history = new RotationHistory();
    const days = history.getDaysSinceRotation('aws');

    if (days === null) {
      log.warning('Aucune rotation enregistrée');
      log.info('Recommandation: Effectuer une rotation maintenant');
      return { needsRotation: true, days: null };
    }

    log.info(`Dernière rotation: il y a ${days} jours`);

    if (days >= CONFIG.rotationIntervalDays) {
      log.error(`Rotation requise ! (> ${CONFIG.rotationIntervalDays} jours)`);
      return { needsRotation: true, days };
    } else if (days >= CONFIG.rotationIntervalDays - CONFIG.warningDays) {
      const remaining = CONFIG.rotationIntervalDays - days;
      log.warning(`Rotation recommandée dans ${remaining} jours`);
      return { needsRotation: false, days, warning: true };
    } else {
      log.success('Access Keys à jour');
      const remaining = CONFIG.rotationIntervalDays - days;
      log.info(`Prochaine rotation dans ${remaining} jours`);
      return { needsRotation: false, days };
    }
  }

  async rotate() {
    log.header('Rotation AWS Access Keys');

    log.info('Méthode 1: Automatique (AWS CLI requis)');
    log.info('Méthode 2: Manuel (Console AWS)');

    const method = await promptUser('Choisissez la méthode (1/2)');

    if (method === '1') {
      return await this.rotateAutomatic();
    } else {
      return await this.rotateManual();
    }
  }

  async rotateAutomatic() {
    log.header('Rotation Automatique AWS');

    // Vérifier AWS CLI
    try {
      await this.execCommand('aws', ['--version']);
      log.success('AWS CLI disponible');
    } catch (error) {
      log.error('AWS CLI non disponible');
      log.info('Utilisez la méthode manuelle (option 2)');
      return false;
    }

    const userName = 'rt-symphonia-textract-user';

    log.info('Étapes:');
    console.log('  1. Lister les Access Keys actuelles');
    console.log('  2. Créer une nouvelle Access Key');
    console.log('  3. Tester la nouvelle clé');
    console.log('  4. Supprimer l\'ancienne clé');

    const proceed = await confirm('\nContinuer ?');
    if (!proceed) {
      log.warning('Rotation annulée');
      return false;
    }

    try {
      // Lister les clés existantes
      log.info('Listing des Access Keys...');
      const listResult = await this.execCommand('aws', [
        'iam',
        'list-access-keys',
        '--user-name',
        userName,
        '--output',
        'json'
      ]);

      const keys = JSON.parse(listResult);
      const oldKeyId = keys.AccessKeyMetadata[0]?.AccessKeyId;

      if (!oldKeyId) {
        log.error('Aucune Access Key trouvée');
        return false;
      }

      log.info(`Ancienne Access Key: ${oldKeyId}`);

      // Créer une nouvelle clé
      log.info('Création d\'une nouvelle Access Key...');
      const createResult = await this.execCommand('aws', [
        'iam',
        'create-access-key',
        '--user-name',
        userName,
        '--output',
        'json'
      ]);

      const newKey = JSON.parse(createResult);
      const newKeyId = newKey.AccessKey.AccessKeyId;
      const newSecret = newKey.AccessKey.SecretAccessKey;

      log.success('Nouvelle Access Key créée !');
      console.log(`\n${colors.green}Access Key ID: ${newKeyId}${colors.reset}`);
      console.log(`${colors.green}Secret Access Key: ${newSecret}${colors.reset}\n`);

      log.warning('Copiez ces credentials maintenant !');

      const tested = await confirm('Avez-vous testé la nouvelle clé ?');
      if (!tested) {
        log.warning('Testez la clé avant de supprimer l\'ancienne !');
        log.info('Commande de test:');
        console.log(`  export AWS_ACCESS_KEY_ID=${newKeyId}`);
        console.log(`  export AWS_SECRET_ACCESS_KEY=${newSecret}`);
        console.log('  aws sts get-caller-identity');
        return false;
      }

      // Supprimer l'ancienne clé
      const deleteOld = await confirm('Supprimer l\'ancienne Access Key ?');
      if (deleteOld) {
        await this.execCommand('aws', [
          'iam',
          'delete-access-key',
          '--user-name',
          userName,
          '--access-key-id',
          oldKeyId
        ]);

        log.success('Ancienne Access Key supprimée');
      }

      // Sauvegarder dans l'historique
      const history = new RotationHistory();
      history.updateRotation('aws');

      log.success('Rotation AWS terminée avec succès');
      return true;
    } catch (error) {
      log.error('Erreur durant la rotation: ' + error.message);
      return false;
    }
  }

  async rotateManual() {
    log.header('Rotation Manuelle AWS');

    log.info('Étapes à suivre:');
    console.log('  1. Visitez: https://console.aws.amazon.com/iam/');
    console.log('  2. Cliquez sur "Users" → "rt-symphonia-textract-user"');
    console.log('  3. Onglet "Security credentials"');
    console.log('  4. Section "Access keys"');
    console.log('  5. Cliquez sur "Create access key"');
    console.log('  6. Téléchargez le CSV avec les nouvelles credentials');
    console.log('  7. Testez les nouvelles credentials');
    console.log('  8. Supprimez l\'ancienne Access Key');

    const proceed = await confirm('\nAvez-vous créé une nouvelle Access Key ?');
    if (!proceed) {
      log.warning('Rotation annulée');
      return false;
    }

    const newKeyId = await promptUser('Entrez la nouvelle Access Key ID');
    const newSecret = await promptUser('Entrez la nouvelle Secret Access Key');

    if (!newKeyId || !newSecret) {
      log.error('Credentials invalides');
      return false;
    }

    log.success('Nouvelles credentials enregistrées');
    log.warning('N\'oubliez pas de:');
    console.log('  1. Mettre à jour .env.external-services');
    console.log('  2. Tester la connexion');
    console.log('  3. Supprimer l\'ancienne Access Key');

    // Sauvegarder dans l'historique
    const history = new RotationHistory();
    history.updateRotation('aws');

    return true;
  }

  execCommand(command, args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => (stdout += data));
      proc.stderr.on('data', (data) => (stderr += data));

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || 'Command failed'));
        }
      });

      proc.on('error', reject);
    });
  }
}

// ============================================================================
// Rotation Google Service Account
// ============================================================================

class GoogleRotator {
  async checkStatus() {
    log.header('Google Service Account - Statut');

    const history = new RotationHistory();
    const days = history.getDaysSinceRotation('google');

    if (days === null) {
      log.warning('Aucune rotation enregistrée');
      log.info('Recommandation: Effectuer une rotation maintenant');
      return { needsRotation: true, days: null };
    }

    log.info(`Dernière rotation: il y a ${days} jours`);

    if (days >= CONFIG.rotationIntervalDays) {
      log.error(`Rotation requise ! (> ${CONFIG.rotationIntervalDays} jours)`);
      return { needsRotation: true, days };
    } else if (days >= CONFIG.rotationIntervalDays - CONFIG.warningDays) {
      const remaining = CONFIG.rotationIntervalDays - days;
      log.warning(`Rotation recommandée dans ${remaining} jours`);
      return { needsRotation: false, days, warning: true };
    } else {
      log.success('Service Account à jour');
      const remaining = CONFIG.rotationIntervalDays - days;
      log.info(`Prochaine rotation dans ${remaining} jours`);
      return { needsRotation: false, days };
    }
  }

  async rotate() {
    log.header('Rotation Google Service Account');

    log.info('Étapes à suivre:');
    console.log('  1. Visitez: https://console.cloud.google.com/');
    console.log('  2. Sélectionnez votre projet "rt-symphonia-ocr"');
    console.log('  3. Menu → IAM & Admin → Service Accounts');
    console.log('  4. Trouvez "rt-symphonia-vision-sa"');
    console.log('  5. Cliquez sur ⋮ → Manage keys');
    console.log('  6. Add Key → Create new key → JSON');
    console.log('  7. Téléchargez le nouveau fichier JSON');
    console.log('  8. Supprimez l\'ancienne clé');

    const proceed = await confirm('\nAvez-vous créé une nouvelle clé ?');
    if (!proceed) {
      log.warning('Rotation annulée');
      return false;
    }

    const newKeyPath = await promptUser('Entrez le chemin du nouveau fichier JSON');

    if (!fs.existsSync(newKeyPath)) {
      log.error('Fichier introuvable: ' + newKeyPath);
      return false;
    }

    try {
      // Valider le fichier JSON
      const content = fs.readFileSync(newKeyPath, 'utf8');
      const creds = JSON.parse(content);

      const requiredFields = ['type', 'project_id', 'private_key_id', 'private_key', 'client_email'];
      const missingFields = requiredFields.filter((field) => !creds[field]);

      if (missingFields.length > 0) {
        log.error('Champs manquants: ' + missingFields.join(', '));
        return false;
      }

      log.success('Fichier JSON valide');
      log.info('Project: ' + creds.project_id);
      log.info('Email: ' + creds.client_email);

      // Sauvegarder dans l'historique
      const history = new RotationHistory();
      history.updateRotation('google');

      log.success('Rotation Google terminée avec succès');
      log.warning('N\'oubliez pas de mettre à jour GOOGLE_APPLICATION_CREDENTIALS !');

      return true;
    } catch (error) {
      log.error('Erreur de validation: ' + error.message);
      return false;
    }
  }
}

// ============================================================================
// Application Principale
// ============================================================================

class RotationApp {
  constructor() {
    this.tomtom = new TomTomRotator();
    this.aws = new AWSRotator();
    this.google = new GoogleRotator();
  }

  async showMenu() {
    console.log('\n' + colors.bright + colors.cyan + '╔══════════════════════════════════════════════════════════════╗' + colors.reset);
    console.log(colors.bright + colors.cyan + '║  RT SYMPHONI.A - Rotation des API Keys                      ║' + colors.reset);
    console.log(colors.bright + colors.cyan + '╚══════════════════════════════════════════════════════════════╝' + colors.reset);

    console.log('\nOptions:');
    console.log('  1. Vérifier le statut de toutes les clés');
    console.log('  2. Rotation TomTom API Key');
    console.log('  3. Rotation AWS Access Keys');
    console.log('  4. Rotation Google Service Account');
    console.log('  5. Rotation automatique (tous les services requis)');
    console.log('  6. Quitter');

    const choice = await promptUser('\nVotre choix');
    return parseInt(choice);
  }

  async checkAllStatus() {
    log.header('Vérification de Toutes les Clés');

    await this.tomtom.checkStatus();
    console.log();
    await this.aws.checkStatus();
    console.log();
    await this.google.checkStatus();
  }

  async rotateAll() {
    log.header('Rotation Automatique de Tous les Services');

    const history = new RotationHistory();
    const services = ['tomtom', 'aws', 'google'];
    const toRotate = services.filter((s) => history.needsRotation(s));

    if (toRotate.length === 0) {
      log.success('Aucune rotation requise !');
      return;
    }

    log.warning(`Services nécessitant une rotation: ${toRotate.join(', ')}`);

    for (const service of toRotate) {
      console.log();
      if (service === 'tomtom') await this.tomtom.rotate();
      if (service === 'aws') await this.aws.rotate();
      if (service === 'google') await this.google.rotate();
    }

    log.success('Rotation automatique terminée');
  }

  async run() {
    while (true) {
      const choice = await this.showMenu();

      switch (choice) {
        case 1:
          await this.checkAllStatus();
          break;
        case 2:
          await this.tomtom.rotate();
          break;
        case 3:
          await this.aws.rotate();
          break;
        case 4:
          await this.google.rotate();
          break;
        case 5:
          await this.rotateAll();
          break;
        case 6:
          log.info('Au revoir !');
          process.exit(0);
        default:
          log.error('Choix invalide');
      }

      await promptUser('\nAppuyez sur Entrée pour continuer...');
    }
  }
}

// ============================================================================
// Point d'Entrée
// ============================================================================

const app = new RotationApp();
app.run().catch((error) => {
  log.error('Erreur fatale: ' + error.message);
  console.error(error);
  process.exit(1);
});
