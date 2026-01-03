#!/usr/bin/env node
/**
 * Generate Secure Secrets
 * SYMPHONI.A - RT Technologie
 *
 * Script pour générer de nouveaux secrets sécurisés.
 * Utilisation: node scripts/security/generate-secrets.js
 *
 * @version 1.0.0
 */

const crypto = require('crypto');

// ============================================================================
// CONFIGURATION
// ============================================================================

const SECRETS_CONFIG = {
  JWT_SECRET: {
    length: 64,
    description: 'Secret pour signer les tokens JWT d\'accès'
  },
  JWT_REFRESH_SECRET: {
    length: 64,
    description: 'Secret pour signer les tokens JWT de rafraîchissement'
  },
  STRIPE_WEBHOOK_SECRET: {
    prefix: 'whsec_',
    length: 32,
    description: 'Secret pour valider les webhooks Stripe'
  },
  API_KEY_INTERNAL: {
    prefix: 'sk_int_',
    length: 32,
    description: 'Clé API interne pour communication inter-services'
  },
  ENCRYPTION_KEY: {
    length: 32,
    encoding: 'hex',
    description: 'Clé de chiffrement AES-256'
  }
};

// ============================================================================
// FONCTIONS DE GÉNÉRATION
// ============================================================================

/**
 * Génère une chaîne aléatoire sécurisée
 * @param {number} length - Longueur en bytes
 * @param {string} encoding - Encodage ('base64', 'hex')
 * @returns {string}
 */
function generateSecureString(length, encoding = 'base64') {
  return crypto.randomBytes(length).toString(encoding);
}

/**
 * Génère un mot de passe sécurisé lisible
 * @param {number} length - Longueur du mot de passe
 * @returns {string}
 */
function generatePassword(length = 32) {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '@#$%^&*()_+-=[]{}|;:,.<>?';
  const allChars = lowercase + uppercase + numbers + special;

  let password = '';

  // Garantir au moins un de chaque type
  password += lowercase[crypto.randomInt(lowercase.length)];
  password += uppercase[crypto.randomInt(uppercase.length)];
  password += numbers[crypto.randomInt(numbers.length)];
  password += special[crypto.randomInt(special.length)];

  // Compléter le reste
  for (let i = password.length; i < length; i++) {
    password += allChars[crypto.randomInt(allChars.length)];
  }

  // Mélanger
  return password.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

/**
 * Génère tous les secrets
 * @returns {Object}
 */
function generateAllSecrets() {
  const secrets = {};

  for (const [name, config] of Object.entries(SECRETS_CONFIG)) {
    let value;

    if (config.prefix) {
      value = config.prefix + generateSecureString(config.length, 'hex');
    } else if (config.encoding) {
      value = generateSecureString(config.length, config.encoding);
    } else {
      value = generateSecureString(config.length);
    }

    secrets[name] = {
      value,
      description: config.description
    };
  }

  // Ajouter un mot de passe MongoDB
  secrets.MONGODB_PASSWORD = {
    value: generatePassword(32),
    description: 'Mot de passe MongoDB (à changer dans Atlas)'
  };

  return secrets;
}

// ============================================================================
// AFFICHAGE
// ============================================================================

function printSecrets(secrets) {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    NOUVEAUX SECRETS GÉNÉRÉS                                  ║');
  console.log('║                    SYMPHONI.A - RT Technologie                               ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
  console.log('║  ATTENTION: Ces secrets doivent être stockés dans AWS Secrets Manager        ║');
  console.log('║  Ne JAMAIS les commiter dans Git ou les partager par email/chat              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  console.log('# Copiez ces valeurs dans AWS Secrets Manager ou votre .env.local');
  console.log('# Date de génération:', new Date().toISOString());
  console.log('');

  for (const [name, data] of Object.entries(secrets)) {
    console.log(`# ${data.description}`);
    console.log(`${name}=${data.value}`);
    console.log('');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('PROCHAINES ÉTAPES:');
  console.log('');
  console.log('1. Copiez les secrets ci-dessus');
  console.log('2. Stockez-les dans AWS Secrets Manager:');
  console.log('   aws secretsmanager create-secret --name prod/symphonia/secrets --secret-string \'{"JWT_SECRET":"..."}\'');
  console.log('');
  console.log('3. OU pour le développement local, créez un fichier .env.local:');
  console.log('   cat > .env.local << EOF');
  console.log('   JWT_SECRET=...');
  console.log('   EOF');
  console.log('');
  console.log('4. Mettez à jour les credentials dans les services externes:');
  console.log('   - MongoDB Atlas: Database Access > Edit User');
  console.log('   - Stripe: Dashboard > Developers > API Keys');
  console.log('   - OVH: https://api.ovh.com/createToken/');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
}

// ============================================================================
// FORMAT JSON POUR AWS SECRETS MANAGER
// ============================================================================

function printAWSFormat(secrets) {
  const awsSecrets = {};

  for (const [name, data] of Object.entries(secrets)) {
    awsSecrets[name] = data.value;
  }

  console.log('');
  console.log('# Format JSON pour AWS Secrets Manager:');
  console.log('');
  console.log(JSON.stringify(awsSecrets, null, 2));
  console.log('');
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  const showJson = args.includes('--json');
  const showHelp = args.includes('--help') || args.includes('-h');

  if (showHelp) {
    console.log('');
    console.log('Usage: node generate-secrets.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --json    Afficher les secrets au format JSON pour AWS');
    console.log('  --help    Afficher cette aide');
    console.log('');
    return;
  }

  const secrets = generateAllSecrets();

  if (showJson) {
    printAWSFormat(secrets);
  } else {
    printSecrets(secrets);
  }
}

main();
