#!/usr/bin/env node
/**
 * Script de Test Rapide pour invite-test-carriers.cjs
 *
 * Vérifie que toutes les dépendances et configurations sont OK
 * avant d'exécuter le script principal.
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const fetch = require('node-fetch');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function logSuccess(message) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function logError(message) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function logInfo(message) {
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

async function testConfiguration() {
  console.log(`\n${colors.bold}${colors.cyan}═══════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  Test Configuration - invite-test-carriers${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}═══════════════════════════════════════════${colors.reset}\n`);

  let allOk = true;

  // Test 1: Variables d'environnement
  console.log(`${colors.bold}[1/5] Variables d'environnement${colors.reset}\n`);

  const requiredVars = [
    { name: 'MONGODB_URI', value: process.env.MONGODB_URI },
    { name: 'AWS_REGION', value: process.env.AWS_REGION },
    { name: 'S3_DOCUMENTS_BUCKET', value: process.env.S3_DOCUMENTS_BUCKET }
  ];

  const optionalVars = [
    { name: 'API_URL', value: process.env.API_URL || 'http://localhost:3001' }
  ];

  requiredVars.forEach(v => {
    if (v.value) {
      logSuccess(`${v.name} = ${v.value}`);
    } else {
      logError(`${v.name} non définie`);
      allOk = false;
    }
  });

  optionalVars.forEach(v => {
    logInfo(`${v.name} = ${v.value}`);
  });

  // Test 2: MongoDB
  console.log(`\n${colors.bold}[2/5] Connexion MongoDB${colors.reset}\n`);

  let client = null;
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rt-authz';
    logInfo(`Connexion à: ${mongoUri}`);

    client = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 5000
    });

    await client.connect();
    const db = client.db();

    logSuccess('Connexion MongoDB réussie');

    // Vérifier qu'il existe au moins un industriel
    const industriel = await db.collection('users').findOne({
      role: { $in: ['admin', 'industriel'] }
    });

    if (industriel) {
      logSuccess(`Utilisateur industriel trouvé: ${industriel.email || industriel._id}`);
    } else {
      logWarning('Aucun utilisateur industriel trouvé - le script ne pourra pas s\'exécuter');
      logInfo('Créez un utilisateur admin ou industriel dans MongoDB');
      allOk = false;
    }

  } catch (error) {
    logError(`Erreur MongoDB: ${error.message}`);
    allOk = false;
  } finally {
    if (client) {
      await client.close();
    }
  }

  // Test 3: API
  console.log(`\n${colors.bold}[3/5] API SYMPHONI.A${colors.reset}\n`);

  try {
    const apiUrl = process.env.API_URL || 'http://localhost:3001';
    logInfo(`Test de: ${apiUrl}/health`);

    const response = await fetch(`${apiUrl}/health`, {
      timeout: 5000
    });

    if (response.ok) {
      const health = await response.json();
      logSuccess(`API accessible - Status: ${health.status || 'ok'}`);

      if (health.mongodb === 'connected') {
        logSuccess('MongoDB connecté via API');
      } else {
        logWarning(`MongoDB via API: ${health.mongodb || 'inconnu'}`);
      }
    } else {
      logWarning(`API retourne status ${response.status}`);
      logInfo('L\'API doit être démarrée pour que le script fonctionne');
    }

  } catch (error) {
    logError(`Erreur API: ${error.message}`);
    logInfo('Démarrez l\'API avec: npm start');
    allOk = false;
  }

  // Test 4: Dépendances Node
  console.log(`\n${colors.bold}[4/5] Dépendances Node.js${colors.reset}\n`);

  const deps = [
    'dotenv',
    'mongodb',
    'node-fetch',
    'readline'
  ];

  deps.forEach(dep => {
    try {
      require.resolve(dep);
      logSuccess(`${dep} installé`);
    } catch (error) {
      logError(`${dep} non installé`);
      allOk = false;
    }
  });

  // Test 5: Permissions S3 (optionnel)
  console.log(`\n${colors.bold}[5/5] Configuration AWS S3${colors.reset}\n`);

  const awsVars = [
    { name: 'AWS_REGION', value: process.env.AWS_REGION },
    { name: 'AWS_ACCESS_KEY_ID', value: process.env.AWS_ACCESS_KEY_ID ? '***' : undefined },
    { name: 'AWS_SECRET_ACCESS_KEY', value: process.env.AWS_SECRET_ACCESS_KEY ? '***' : undefined },
    { name: 'S3_DOCUMENTS_BUCKET', value: process.env.S3_DOCUMENTS_BUCKET }
  ];

  awsVars.forEach(v => {
    if (v.value) {
      logSuccess(`${v.name} = ${v.value}`);
    } else {
      logWarning(`${v.name} non définie (peut utiliser le rôle IAM)`);
    }
  });

  // Rapport final
  console.log(`\n${colors.bold}${colors.cyan}═══════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}              RÉSULTAT                     ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}═══════════════════════════════════════════${colors.reset}\n`);

  if (allOk) {
    logSuccess('Tous les tests sont passés !');
    console.log(`\n${colors.green}${colors.bold}Vous pouvez exécuter le script:${colors.reset}`);
    console.log(`${colors.cyan}node scripts/invite-test-carriers.cjs${colors.reset}\n`);
    process.exit(0);
  } else {
    logError('Certains tests ont échoué');
    console.log(`\n${colors.yellow}${colors.bold}Corrigez les problèmes avant d'exécuter le script${colors.reset}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  testConfiguration().catch(error => {
    console.error(`${colors.red}Erreur fatale:${colors.reset}`, error);
    process.exit(1);
  });
}
