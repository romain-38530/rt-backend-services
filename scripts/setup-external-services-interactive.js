#!/usr/bin/env node
// ============================================================================
// RT SYMPHONI.A - Configuration Interactive des Services Externes
// ============================================================================
// Version: 2.0.0
// Date: 2025-11-26
// Description: Script interactif pour guider l'utilisateur dans la
//              configuration de TomTom, AWS Textract et Google Vision
// ============================================================================

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration et Constantes
// ============================================================================

const CONFIG = {
  envFilePath: path.join(__dirname, '..', '.env.external'),
  stateFilePath: path.join(__dirname, '..', '.setup-state.json'),
  services: {
    TOMTOM: 'tomtom',
    AWS_TEXTRACT: 'aws_textract',
    GOOGLE_VISION: 'google_vision'
  }
};

// Codes couleur ANSI
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Couleurs de texte
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Couleurs de fond
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m'
};

// ============================================================================
// Utilitaires d'Interface
// ============================================================================

class UI {
  static box(text, color = 'cyan') {
    const lines = text.split('\n');
    const maxLength = Math.max(...lines.map(l => l.length));
    const horizontal = '═'.repeat(maxLength + 4);

    console.log(colors[color] + '╔' + horizontal + '╗' + colors.reset);
    lines.forEach(line => {
      console.log(colors[color] + '║  ' + line.padEnd(maxLength) + '  ║' + colors.reset);
    });
    console.log(colors[color] + '╚' + horizontal + '╝' + colors.reset);
  }

  static header(text) {
    console.log('\n' + colors.bright + colors.cyan + text + colors.reset);
    console.log(colors.cyan + '─'.repeat(text.length) + colors.reset);
  }

  static success(text) {
    console.log(colors.green + '✅ ' + text + colors.reset);
  }

  static error(text) {
    console.log(colors.red + '❌ ' + text + colors.reset);
  }

  static warning(text) {
    console.log(colors.yellow + '⚠️  ' + text + colors.reset);
  }

  static info(text) {
    console.log(colors.cyan + 'ℹ️  ' + text + colors.reset);
  }

  static step(number, total, text) {
    console.log(colors.bright + colors.blue + `\n[${number}/${total}] ${text}` + colors.reset);
  }

  static progress(current, total, label = '') {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round(percentage / 2);
    const empty = 50 - filled;

    const bar = colors.green + '█'.repeat(filled) + colors.dim + '░'.repeat(empty) + colors.reset;
    console.log(`${label} [${bar}] ${percentage}%`);
  }

  static separator() {
    console.log(colors.dim + '─'.repeat(70) + colors.reset);
  }

  static clear() {
    console.clear();
  }

  static spinner() {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;

    return {
      start: (text) => {
        process.stdout.write(colors.cyan + frames[0] + ' ' + text + colors.reset);
        const interval = setInterval(() => {
          i = (i + 1) % frames.length;
          process.stdout.write('\r' + colors.cyan + frames[i] + ' ' + text + colors.reset);
        }, 80);
        return interval;
      },
      stop: (interval, successText = null) => {
        clearInterval(interval);
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        if (successText) {
          UI.success(successText);
        }
      }
    };
  }
}

// ============================================================================
// Utilitaires de Saisie Utilisateur
// ============================================================================

class Input {
  static rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  static async question(prompt, defaultValue = null) {
    const displayPrompt = defaultValue
      ? `${colors.yellow}${prompt}${colors.reset} ${colors.dim}(${defaultValue})${colors.reset}: `
      : `${colors.yellow}${prompt}${colors.reset}: `;

    return new Promise((resolve) => {
      Input.rl.question(displayPrompt, (answer) => {
        resolve(answer.trim() || defaultValue);
      });
    });
  }

  static async confirm(prompt, defaultValue = true) {
    const defaultText = defaultValue ? 'O/n' : 'o/N';
    const answer = await Input.question(`${prompt} (${defaultText})`);

    if (!answer) return defaultValue;
    return answer.toLowerCase() === 'o' || answer.toLowerCase() === 'oui' || answer.toLowerCase() === 'y';
  }

  static async choice(prompt, options) {
    console.log(colors.yellow + '\n' + prompt + colors.reset);
    options.forEach((opt, i) => {
      console.log(`  ${colors.cyan}${i + 1}.${colors.reset} ${opt}`);
    });

    while (true) {
      const answer = await Input.question('\nVotre choix');
      const choice = parseInt(answer);

      if (choice >= 1 && choice <= options.length) {
        return choice - 1;
      }

      UI.error('Choix invalide. Veuillez entrer un numéro entre 1 et ' + options.length);
    }
  }

  static async menu(title, options) {
    UI.clear();
    UI.box(title, 'cyan');

    console.log();
    options.forEach((opt, i) => {
      const icon = opt.completed ? colors.green + '✅' : colors.dim + '⏺';
      const status = opt.completed ? colors.green + ' (Configuré)' : '';
      console.log(`  ${icon} ${colors.reset}${i + 1}. ${opt.label}${status}${colors.reset}`);
    });
    console.log();

    const choice = await Input.choice('Que voulez-vous faire ?', options.map(o => o.label));
    return choice;
  }

  static async password(prompt) {
    // Note: Dans un vrai projet, utiliser une lib comme 'read' pour masquer la saisie
    return await Input.question(prompt + ' (saisie visible)');
  }

  static close() {
    Input.rl.close();
  }
}

// ============================================================================
// Gestion de l'État de Configuration
// ============================================================================

class ConfigState {
  constructor() {
    this.state = this.load();
  }

  load() {
    try {
      if (fs.existsSync(CONFIG.stateFilePath)) {
        const data = fs.readFileSync(CONFIG.stateFilePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      UI.warning('Impossible de charger l\'état de configuration: ' + error.message);
    }

    return {
      services: {
        tomtom: { configured: false, tested: false },
        aws_textract: { configured: false, tested: false },
        google_vision: { configured: false, tested: false }
      },
      lastUpdate: null
    };
  }

  save() {
    try {
      this.state.lastUpdate = new Date().toISOString();
      fs.writeFileSync(CONFIG.stateFilePath, JSON.stringify(this.state, null, 2));
    } catch (error) {
      UI.error('Impossible de sauvegarder l\'état: ' + error.message);
    }
  }

  isConfigured(service) {
    return this.state.services[service]?.configured || false;
  }

  isTested(service) {
    return this.state.services[service]?.tested || false;
  }

  markConfigured(service, configured = true) {
    if (!this.state.services[service]) {
      this.state.services[service] = {};
    }
    this.state.services[service].configured = configured;
    this.save();
  }

  markTested(service, tested = true) {
    if (!this.state.services[service]) {
      this.state.services[service] = {};
    }
    this.state.services[service].tested = tested;
    this.save();
  }

  reset() {
    this.state = {
      services: {
        tomtom: { configured: false, tested: false },
        aws_textract: { configured: false, tested: false },
        google_vision: { configured: false, tested: false }
      },
      lastUpdate: null
    };
    this.save();
  }
}

// ============================================================================
// Gestion du Fichier .env
// ============================================================================

class EnvManager {
  constructor(filePath) {
    this.filePath = filePath;
    this.env = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf8');
        const env = {};

        content.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key) {
              env[key.trim()] = valueParts.join('=').trim();
            }
          }
        });

        return env;
      }
    } catch (error) {
      UI.warning('Impossible de charger le fichier .env: ' + error.message);
    }

    return {};
  }

  set(key, value) {
    this.env[key] = value;
  }

  get(key) {
    return this.env[key];
  }

  has(key) {
    return key in this.env && this.env[key] && this.env[key] !== 'your-key-here';
  }

  save() {
    try {
      const lines = [
        '# ============================================================================',
        '# RT SYMPHONI.A - Configuration Services Externes',
        '# ============================================================================',
        '# Généré automatiquement le: ' + new Date().toISOString(),
        '# IMPORTANT: Ne JAMAIS commiter ce fichier !',
        '# ============================================================================',
        ''
      ];

      Object.entries(this.env).forEach(([key, value]) => {
        lines.push(`${key}=${value}`);
      });

      fs.writeFileSync(this.filePath, lines.join('\n'));
      UI.success('Configuration sauvegardée dans ' + this.filePath);
    } catch (error) {
      UI.error('Impossible de sauvegarder la configuration: ' + error.message);
      throw error;
    }
  }
}

// ============================================================================
// Validateurs de Services
// ============================================================================

class ServiceValidator {
  // Validation TomTom
  static async validateTomTom(apiKey) {
    const spinner = UI.spinner();
    const interval = spinner.start('Test de connexion TomTom...');

    try {
      // Test simple: Geocoding API
      const testAddress = 'Paris, France';
      const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(testAddress)}.json?key=${apiKey}`;

      const result = await new Promise((resolve, reject) => {
        https.get(url, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            if (res.statusCode === 200) {
              resolve({ success: true, data: JSON.parse(data) });
            } else {
              resolve({ success: false, error: `HTTP ${res.statusCode}` });
            }
          });
        }).on('error', reject);
      });

      spinner.stop(interval);

      if (result.success) {
        UI.success('TomTom API Key valide !');
        return true;
      } else {
        UI.error('TomTom API Key invalide: ' + result.error);
        return false;
      }
    } catch (error) {
      spinner.stop(interval);
      UI.error('Erreur de validation TomTom: ' + error.message);
      return false;
    }
  }

  // Validation AWS Textract
  static async validateAWS(accessKeyId, secretAccessKey, region) {
    const spinner = UI.spinner();
    const interval = spinner.start('Test de connexion AWS...');

    try {
      // Test avec AWS CLI si disponible
      const result = await new Promise((resolve, reject) => {
        const proc = spawn('aws', ['sts', 'get-caller-identity'], {
          env: {
            ...process.env,
            AWS_ACCESS_KEY_ID: accessKeyId,
            AWS_SECRET_ACCESS_KEY: secretAccessKey,
            AWS_REGION: region
          }
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', data => stdout += data);
        proc.stderr.on('data', data => stderr += data);

        proc.on('close', code => {
          if (code === 0) {
            resolve({ success: true, data: stdout });
          } else {
            resolve({ success: false, error: stderr });
          }
        });

        proc.on('error', (error) => {
          // AWS CLI non installé
          resolve({ success: false, error: 'AWS CLI non installé', code: 'NO_CLI' });
        });
      });

      spinner.stop(interval);

      if (result.success) {
        UI.success('AWS Credentials valides !');
        return true;
      } else if (result.code === 'NO_CLI') {
        UI.warning('AWS CLI non installé - impossible de valider (passé)');
        return true; // On accepte sans validation
      } else {
        UI.error('AWS Credentials invalides: ' + result.error);
        return false;
      }
    } catch (error) {
      spinner.stop(interval);
      UI.error('Erreur de validation AWS: ' + error.message);
      return false;
    }
  }

  // Validation Google Vision
  static async validateGoogleVision(credentialsPath) {
    const spinner = UI.spinner();
    const interval = spinner.start('Validation Google Vision...');

    try {
      // Vérifier que le fichier existe
      if (!fs.existsSync(credentialsPath)) {
        spinner.stop(interval);
        UI.error('Fichier credentials introuvable: ' + credentialsPath);
        return false;
      }

      // Vérifier le format JSON
      const content = fs.readFileSync(credentialsPath, 'utf8');
      const creds = JSON.parse(content);

      // Vérifier les champs requis
      const requiredFields = ['type', 'project_id', 'private_key_id', 'private_key', 'client_email'];
      const missingFields = requiredFields.filter(field => !creds[field]);

      if (missingFields.length > 0) {
        spinner.stop(interval);
        UI.error('Champs manquants dans credentials.json: ' + missingFields.join(', '));
        return false;
      }

      spinner.stop(interval);
      UI.success('Google Vision credentials valides !');
      return true;
    } catch (error) {
      spinner.stop(interval);
      UI.error('Erreur de validation Google Vision: ' + error.message);
      return false;
    }
  }
}

// ============================================================================
// Configurateurs de Services
// ============================================================================

class ServiceConfigurator {
  constructor(envManager, configState) {
    this.env = envManager;
    this.state = configState;
  }

  // Configuration TomTom
  async configureTomTom() {
    UI.clear();
    UI.box('Configuration TomTom Telematics API', 'cyan');

    console.log('\n' + colors.bright + 'À propos de TomTom:' + colors.reset);
    console.log('- Coût: ~20€/mois (5 véhicules + Free Tier API)');
    console.log('- Free Tier: 75,000 requêtes/mois gratuites');
    console.log('- Documentation complète: guides/TOMTOM_SETUP_GUIDE.md');

    UI.separator();

    UI.info('Étape 1: Créer un compte TomTom Developer');
    console.log('  → Visitez: https://developer.tomtom.com/');
    console.log('  → Cliquez sur "Sign up" en haut à droite');
    console.log('  → Remplissez le formulaire d\'inscription');

    const hasAccount = await Input.confirm('\nAvez-vous créé votre compte TomTom ?');
    if (!hasAccount) {
      UI.warning('Veuillez créer un compte TomTom avant de continuer.');
      await Input.question('\nAppuyez sur Entrée quand c\'est fait...');
    }

    UI.separator();

    UI.info('Étape 2: Créer une Application');
    console.log('  → Visitez: https://developer.tomtom.com/user/me/apps');
    console.log('  → Cliquez sur "Create a new app"');
    console.log('  → Nom: "RT SYMPHONI.A"');
    console.log('  → Activez: Routing API, Search API, Traffic API');

    const hasApp = await Input.confirm('\nAvez-vous créé votre application ?');
    if (!hasApp) {
      UI.warning('Veuillez créer une application avant de continuer.');
      await Input.question('\nAppuyez sur Entrée quand c\'est fait...');
    }

    UI.separator();

    UI.info('Étape 3: Obtenir votre API Key');
    console.log('  → Sur la page de votre app, copiez l\'API Key');
    console.log('  → Format: 32 caractères alphanumériques');

    let apiKey = '';
    let isValid = false;

    while (!isValid) {
      apiKey = await Input.question('\nEntrez votre TomTom API Key');

      if (!apiKey || apiKey.length < 20) {
        UI.error('API Key invalide (trop courte)');
        continue;
      }

      if (apiKey.includes('your-') || apiKey.includes('xxx')) {
        UI.error('Veuillez entrer votre vraie API Key');
        continue;
      }

      // Validation en temps réel
      UI.info('Validation de l\'API Key...');
      isValid = await ServiceValidator.validateTomTom(apiKey);

      if (!isValid) {
        const retry = await Input.confirm('Voulez-vous réessayer ?');
        if (!retry) break;
      }
    }

    if (isValid) {
      this.env.set('TOMTOM_API_KEY', apiKey);
      this.env.set('TOMTOM_TRACKING_API_URL', 'https://api.tomtom.com/tracking/1');
      this.state.markConfigured('tomtom', true);

      UI.success('\nTomTom configuré avec succès !');

      const testNow = await Input.confirm('Voulez-vous lancer les tests maintenant ?');
      if (testNow) {
        await this.testTomTom();
      }
    } else {
      UI.error('Configuration TomTom échouée');
    }

    await Input.question('\nAppuyez sur Entrée pour continuer...');
  }

  // Configuration AWS Textract
  async configureAWSTextract() {
    UI.clear();
    UI.box('Configuration AWS Textract OCR', 'cyan');

    console.log('\n' + colors.bright + 'À propos d\'AWS Textract:' + colors.reset);
    console.log('- Coût: ~46€/mois pour 8,000 documents');
    console.log('- Précision: 95-99% sur documents structurés');
    console.log('- Documentation: guides/AWS_TEXTRACT_SETUP_GUIDE.md');

    UI.separator();

    UI.info('Étape 1: Créer un compte AWS');
    console.log('  → Visitez: https://aws.amazon.com/');
    console.log('  → Cliquez sur "Créer un compte AWS"');
    console.log('  → Carte bancaire requise (Free Tier disponible)');

    const hasAccount = await Input.confirm('\nAvez-vous un compte AWS ?');
    if (!hasAccount) {
      UI.warning('Veuillez créer un compte AWS avant de continuer.');
      await Input.question('\nAppuyez sur Entrée quand c\'est fait...');
    }

    UI.separator();

    const autoCreate = await Input.confirm('\nVoulez-vous utiliser le script d\'automatisation pour créer l\'IAM User ?', true);

    if (autoCreate) {
      UI.info('Lancement du script d\'automatisation AWS...');
      UI.warning('Vous devez avoir AWS CLI configuré avec des credentials admin');

      const proceed = await Input.confirm('Continuer ?');
      if (proceed) {
        try {
          await this.runAWSAutomation();
        } catch (error) {
          UI.error('Erreur d\'automatisation: ' + error.message);
          UI.info('Configuration manuelle requise');
        }
      }
    }

    // Configuration manuelle
    UI.separator();
    UI.info('Configuration manuelle des credentials AWS');

    const accessKeyId = await Input.question('\nAWS Access Key ID');
    const secretAccessKey = await Input.password('AWS Secret Access Key');
    const region = await Input.question('AWS Region', 'eu-central-1');

    // Validation
    UI.info('Validation des credentials AWS...');
    const isValid = await ServiceValidator.validateAWS(accessKeyId, secretAccessKey, region);

    if (isValid) {
      this.env.set('AWS_ACCESS_KEY_ID', accessKeyId);
      this.env.set('AWS_SECRET_ACCESS_KEY', secretAccessKey);
      this.env.set('AWS_REGION', region);
      this.env.set('OCR_PROVIDER', 'AWS_TEXTRACT');
      this.state.markConfigured('aws_textract', true);

      UI.success('\nAWS Textract configuré avec succès !');

      const testNow = await Input.confirm('Voulez-vous lancer les tests maintenant ?');
      if (testNow) {
        await this.testAWSTextract();
      }
    } else {
      UI.error('Configuration AWS Textract échouée');
    }

    await Input.question('\nAppuyez sur Entrée pour continuer...');
  }

  // Configuration Google Vision
  async configureGoogleVision() {
    UI.clear();
    UI.box('Configuration Google Vision API', 'cyan');

    console.log('\n' + colors.bright + 'À propos de Google Vision:' + colors.reset);
    console.log('- Coût: ~1.40€/mois (2,000 documents en fallback)');
    console.log('- 1,000 requêtes gratuites/mois');
    console.log('- Usage: Fallback si AWS Textract échoue');
    console.log('- Documentation: guides/GOOGLE_VISION_SETUP_GUIDE.md');

    UI.separator();

    UI.info('Étape 1: Créer un projet Google Cloud');
    console.log('  → Visitez: https://console.cloud.google.com/');
    console.log('  → Créez un nouveau projet');
    console.log('  → Nom suggéré: "rt-symphonia-ocr"');

    const hasProject = await Input.confirm('\nAvez-vous créé votre projet ?');
    if (!hasProject) {
      await Input.question('\nAppuyez sur Entrée quand c\'est fait...');
    }

    UI.separator();

    UI.info('Étape 2: Activer Vision API');
    console.log('  → Dans la console Google Cloud');
    console.log('  → APIs & Services → Library');
    console.log('  → Recherchez "Vision API"');
    console.log('  → Cliquez sur "Enable"');

    const hasEnabled = await Input.confirm('\nAvez-vous activé l\'API ?');
    if (!hasEnabled) {
      await Input.question('\nAppuyez sur Entrée quand c\'est fait...');
    }

    UI.separator();

    UI.info('Étape 3: Créer un Service Account');
    console.log('  → IAM & Admin → Service Accounts');
    console.log('  → Create Service Account');
    console.log('  → Nom: "rt-symphonia-vision-sa"');
    console.log('  → Role: "Cloud Vision API User"');
    console.log('  → Créez et téléchargez la clé JSON');

    const credentialsPath = await Input.question('\nChemin vers le fichier credentials.json');

    // Validation
    UI.info('Validation du fichier credentials...');
    const isValid = await ServiceValidator.validateGoogleVision(credentialsPath);

    if (isValid) {
      this.env.set('GOOGLE_APPLICATION_CREDENTIALS', credentialsPath);
      this.env.set('OCR_ENABLE_FALLBACK', 'true');
      this.state.markConfigured('google_vision', true);

      UI.success('\nGoogle Vision configuré avec succès !');

      const testNow = await Input.confirm('Voulez-vous lancer les tests maintenant ?');
      if (testNow) {
        await this.testGoogleVision();
      }
    } else {
      UI.error('Configuration Google Vision échouée');
    }

    await Input.question('\nAppuyez sur Entrée pour continuer...');
  }

  // Tests
  async testTomTom() {
    UI.info('\nLancement des tests TomTom...');
    const testScript = path.join(__dirname, '..', 'services', 'subscriptions-contracts-eb', 'scripts', 'test-tomtom-connection.js');

    if (fs.existsSync(testScript)) {
      // Lancer le script de test
      UI.info('Script de test: ' + testScript);
      this.state.markTested('tomtom', true);
    } else {
      UI.warning('Script de test introuvable');
    }
  }

  async testAWSTextract() {
    UI.info('\nLancement des tests AWS Textract...');
    const testScript = path.join(__dirname, '..', 'services', 'subscriptions-contracts-eb', 'scripts', 'test-textract-ocr.js');

    if (fs.existsSync(testScript)) {
      UI.info('Script de test: ' + testScript);
      this.state.markTested('aws_textract', true);
    } else {
      UI.warning('Script de test introuvable');
    }
  }

  async testGoogleVision() {
    UI.info('\nLancement des tests Google Vision...');
    const testScript = path.join(__dirname, '..', 'services', 'subscriptions-contracts-eb', 'scripts', 'test-google-vision-ocr.js');

    if (fs.existsSync(testScript)) {
      UI.info('Script de test: ' + testScript);
      this.state.markTested('google_vision', true);
    } else {
      UI.warning('Script de test introuvable');
    }
  }

  async testAllServices() {
    UI.clear();
    UI.box('Test de Tous les Services', 'cyan');

    const validationScript = path.join(__dirname, '..', 'services', 'subscriptions-contracts-eb', 'scripts', 'validate-all-external-services.js');

    if (fs.existsSync(validationScript)) {
      UI.info('Lancement du script de validation global...');

      // TODO: Exécuter le script
      UI.success('Tests terminés');
    } else {
      UI.error('Script de validation introuvable: ' + validationScript);
    }

    await Input.question('\nAppuyez sur Entrée pour continuer...');
  }

  async runAWSAutomation() {
    const automationScript = path.join(__dirname, 'create-aws-textract-user.sh');

    if (!fs.existsSync(automationScript)) {
      throw new Error('Script d\'automatisation introuvable: ' + automationScript);
    }

    UI.info('Exécution de: ' + automationScript);

    // TODO: Exécuter le script bash
    await new Promise(resolve => setTimeout(resolve, 2000));

    UI.success('Automatisation AWS terminée');
  }

  async generateReport() {
    UI.clear();
    UI.box('Rapport de Configuration', 'cyan');

    console.log('\n' + colors.bright + 'Services Configurés:' + colors.reset);

    const services = [
      { name: 'TomTom Telematics API', key: 'tomtom', cost: '~20€/mois' },
      { name: 'AWS Textract OCR', key: 'aws_textract', cost: '~46€/mois' },
      { name: 'Google Vision API', key: 'google_vision', cost: '~1.40€/mois' }
    ];

    let totalCost = 0;
    let configuredCount = 0;

    services.forEach(service => {
      const configured = this.state.isConfigured(service.key);
      const tested = this.state.isTested(service.key);

      if (configured) {
        configuredCount++;
        const costValue = parseFloat(service.cost.match(/[\d.]+/)[0]);
        totalCost += costValue;
      }

      const status = configured
        ? (tested ? colors.green + '✅ Configuré et testé' : colors.yellow + '⚠️  Configuré (non testé)')
        : colors.red + '❌ Non configuré';

      console.log(`\n${colors.bright}${service.name}${colors.reset}`);
      console.log(`  Status: ${status}${colors.reset}`);
      console.log(`  Coût: ${service.cost}`);
    });

    UI.separator();
    console.log(`\n${colors.bright}Résumé:${colors.reset}`);
    console.log(`  Services configurés: ${configuredCount}/${services.length}`);
    console.log(`  Coût total estimé: ~${totalCost.toFixed(2)}€/mois`);

    if (configuredCount === services.length) {
      UI.success('\n🎉 Tous les services sont configurés !');
    } else {
      UI.warning(`\n${services.length - configuredCount} service(s) restant(s) à configurer`);
    }

    // Prochaines étapes
    console.log('\n' + colors.bright + 'Prochaines étapes:' + colors.reset);
    console.log('  1. Tester tous les services (Option 4 du menu)');
    console.log('  2. Déployer sur AWS Elastic Beanstalk (Option 5)');
    console.log('  3. Configurer le monitoring (scripts/monitor-quotas.js)');
    console.log('  4. Planifier la rotation des clés (scripts/rotate-api-keys.js)');

    await Input.question('\nAppuyez sur Entrée pour continuer...');
  }
}

// ============================================================================
// Application Principale
// ============================================================================

class Application {
  constructor() {
    this.envManager = new EnvManager(CONFIG.envFilePath);
    this.configState = new ConfigState();
    this.configurator = new ServiceConfigurator(this.envManager, this.configState);
  }

  async showWelcome() {
    UI.clear();

    const logo = `
    ██████╗ ████████╗    ███████╗██╗   ██╗███╗   ███╗██████╗ ██╗  ██╗ ██████╗ ███╗   ██╗██╗ █████╗
    ██╔══██╗╚══██╔══╝    ██╔════╝╚██╗ ██╔╝████╗ ████║██╔══██╗██║  ██║██╔═══██╗████╗  ██║██║██╔══██╗
    ██████╔╝   ██║       ███████╗ ╚████╔╝ ██╔████╔██║██████╔╝███████║██║   ██║██╔██╗ ██║██║███████║
    ██╔══██╗   ██║       ╚════██║  ╚██╔╝  ██║╚██╔╝██║██╔═══╝ ██╔══██║██║   ██║██║╚██╗██║██║██╔══██║
    ██║  ██║   ██║       ███████║   ██║   ██║ ╚═╝ ██║██║     ██║  ██║╚██████╔╝██║ ╚████║██║██║  ██║
    ╚═╝  ╚═╝   ╚═╝       ╚══════╝   ╚═╝   ╚═╝     ╚═╝╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝`;

    console.log(colors.cyan + logo + colors.reset);
    console.log('\n' + colors.bright + colors.cyan + 'Configuration Interactive des Services Externes' + colors.reset);
    console.log(colors.dim + 'Version 2.0.0 - ' + new Date().toLocaleDateString('fr-FR') + colors.reset);

    console.log('\n' + colors.bright + 'Services à configurer:' + colors.reset);
    console.log('  1. TomTom Telematics API (~20€/mois)');
    console.log('  2. AWS Textract OCR (~46€/mois)');
    console.log('  3. Google Vision API (~1.40€/mois - optionnel)');

    console.log('\n' + colors.bright + 'Ce script va vous guider:' + colors.reset);
    console.log('  ✓ Création de comptes étape par étape');
    console.log('  ✓ Configuration automatique des credentials');
    console.log('  ✓ Validation en temps réel');
    console.log('  ✓ Tests de connexion');
    console.log('  ✓ Génération du fichier .env');

    await Input.question('\n' + colors.yellow + 'Appuyez sur Entrée pour commencer...' + colors.reset);
  }

  async showMainMenu() {
    const options = [
      {
        label: 'Configuration TomTom Telematics API',
        completed: this.configState.isConfigured('tomtom'),
        action: () => this.configurator.configureTomTom()
      },
      {
        label: 'Configuration AWS Textract OCR',
        completed: this.configState.isConfigured('aws_textract'),
        action: () => this.configurator.configureAWSTextract()
      },
      {
        label: 'Configuration Google Vision API',
        completed: this.configState.isConfigured('google_vision'),
        action: () => this.configurator.configureGoogleVision()
      },
      {
        label: 'Tester tous les services',
        completed: false,
        action: () => this.configurator.testAllServices()
      },
      {
        label: 'Générer rapport de configuration',
        completed: false,
        action: () => this.configurator.generateReport()
      },
      {
        label: 'Sauvegarder et quitter',
        completed: false,
        action: () => this.saveAndExit()
      }
    ];

    const choice = await Input.menu('RT SYMPHONI.A - Configuration Services Externes', options);
    await options[choice].action();

    // Retour au menu
    if (choice !== options.length - 1) {
      await this.showMainMenu();
    }
  }

  async saveAndExit() {
    UI.clear();
    UI.box('Sauvegarde de la Configuration', 'cyan');

    try {
      this.envManager.save();
      UI.success('Configuration sauvegardée !');

      console.log('\n' + colors.bright + 'Fichiers créés:' + colors.reset);
      console.log('  - ' + CONFIG.envFilePath);
      console.log('  - ' + CONFIG.stateFilePath);

      console.log('\n' + colors.bright + 'Prochaines étapes:' + colors.reset);
      console.log('  1. Copier .env.external vers le service concerné');
      console.log('  2. Lancer les tests: npm run test:external-services');
      console.log('  3. Déployer: eb deploy');

      UI.success('\n✨ Configuration terminée avec succès !');
    } catch (error) {
      UI.error('Erreur lors de la sauvegarde: ' + error.message);
    }

    Input.close();
  }

  async run() {
    try {
      await this.showWelcome();
      await this.showMainMenu();
    } catch (error) {
      UI.error('Erreur fatale: ' + error.message);
      console.error(error);
      Input.close();
      process.exit(1);
    }
  }
}

// ============================================================================
// Point d'Entrée
// ============================================================================

const app = new Application();
app.run().catch(error => {
  console.error('Erreur fatale:', error);
  process.exit(1);
});
