// ============================================================================
// RT SYMPHONI.A - Validation Complète des Services Externes
// ============================================================================
// Version: 1.6.2-security-final
// Date: 2024-11-26
// ============================================================================
//
// Ce script orchestre les tests de validation de tous les services externes :
// - TomTom Telematics API
// - AWS Textract
// - Google Vision API
//
// ============================================================================

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

function logSection(message) {
  log(`\n${'═'.repeat(70)}`, 'cyan');
  log(`  ${message}`, 'bold');
  log('═'.repeat(70), 'cyan');
}

// ============================================================================
// Configuration
// ============================================================================

const SERVICES = [
  {
    name: 'TomTom Telematics API',
    script: 'test-tomtom-connection.js',
    required: true,
    description: 'Tracking GPS Premium (20€/mois pour 5 véhicules)'
  },
  {
    name: 'AWS Textract',
    script: 'test-textract-ocr.js',
    required: true,
    description: 'OCR Primary Provider (~46€/mois pour 8k docs)'
  },
  {
    name: 'Google Vision API',
    script: 'test-google-vision-ocr.js',
    required: false,
    description: 'OCR Fallback Provider (~1.40€/mois pour 2k docs)'
  }
];

// ============================================================================
// Fonctions Utilitaires
// ============================================================================

function checkNodeVersion() {
  const version = process.version;
  const major = parseInt(version.split('.')[0].substring(1));

  logInfo(`Version Node.js : ${version}`);

  if (major < 14) {
    logWarning('Version Node.js < 14 - Mise à jour recommandée');
    return false;
  }

  if (major >= 20) {
    logSuccess('Version Node.js OK (>= 20)');
  }

  return true;
}

function checkEnvironmentVariables() {
  logSection('Vérification des Variables d\'Environnement');

  const requiredVars = {
    tomtom: ['TOMTOM_API_KEY'],
    aws: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
    google: ['GOOGLE_APPLICATION_CREDENTIALS'],
    ocr: ['OCR_PROVIDER', 'OCR_ENABLE_FALLBACK']
  };

  const results = {};

  // TomTom
  log('\n📡 TomTom Telematics:', 'blue');
  results.tomtom = checkVars(requiredVars.tomtom);

  // AWS
  log('\n☁️  AWS Textract:', 'blue');
  results.aws = checkVars(requiredVars.aws);

  // Google
  log('\n🔍 Google Vision API:', 'blue');
  results.google = checkVars(requiredVars.google);

  // OCR Config
  log('\n⚙️  Configuration OCR:', 'blue');
  results.ocr = checkVars(requiredVars.ocr);

  return results;
}

function checkVars(vars) {
  let allPresent = true;

  vars.forEach(varName => {
    if (process.env[varName]) {
      const value = process.env[varName];
      const displayValue = value.length > 30
        ? value.substring(0, 20) + '...'
        : value;

      logSuccess(`${varName.padEnd(35)} : ${displayValue}`);
    } else {
      logError(`${varName.padEnd(35)} : NON DÉFINIE`);
      allPresent = false;
    }
  });

  return allPresent;
}

function checkDependencies() {
  logSection('Vérification des Dépendances NPM');

  const dependencies = [
    { name: 'express', required: true },
    { name: 'mongodb', required: true },
    { name: 'aws-sdk', required: true },
    { name: '@google-cloud/vision', required: false },
    { name: 'helmet', required: true },
    { name: 'cors', required: true }
  ];

  let allPresent = true;

  dependencies.forEach(dep => {
    try {
      require.resolve(dep.name);
      logSuccess(`${dep.name.padEnd(30)} : INSTALLÉ`);
    } catch (error) {
      if (dep.required) {
        logError(`${dep.name.padEnd(30)} : MANQUANT (requis)`);
        allPresent = false;
      } else {
        logWarning(`${dep.name.padEnd(30)} : MANQUANT (optionnel)`);
      }
    }
  });

  return allPresent;
}

function runServiceTest(service) {
  logSection(`Test : ${service.name}`);

  logInfo(`Description : ${service.description}`);
  logInfo(`Requis : ${service.required ? 'OUI' : 'NON (optionnel)'}`);
  logInfo(`Script : ${service.script}`);

  const scriptPath = path.join(__dirname, service.script);

  if (!fs.existsSync(scriptPath)) {
    logError(`Script non trouvé : ${scriptPath}`);
    return { passed: false, error: 'Script manquant' };
  }

  try {
    log('\n🚀 Exécution du test...', 'cyan');

    const output = execSync(`node "${scriptPath}"`, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 60000 // 1 minute max
    });

    console.log(output);

    logSuccess(`Test ${service.name} réussi`);
    return { passed: true };

  } catch (error) {
    // Exit code != 0 signifie que des tests ont échoué
    if (error.stdout) {
      console.log(error.stdout);
    }
    if (error.stderr) {
      console.error(error.stderr);
    }

    if (service.required) {
      logError(`Test ${service.name} échoué (REQUIS)`);
      return { passed: false, error: error.message, required: true };
    } else {
      logWarning(`Test ${service.name} échoué (optionnel)`);
      return { passed: false, error: error.message, required: false };
    }
  }
}

function generateReport(results) {
  logSection('RAPPORT DE VALIDATION');

  log('\n📊 Résultats par Service :', 'bold');
  log('');

  const allResults = [];

  SERVICES.forEach((service, index) => {
    const result = results[index];

    const statusIcon = result.passed ? '✅' : (service.required ? '❌' : '⚠️ ');
    const statusText = result.passed ? 'RÉUSSI' : 'ÉCHOUÉ';
    const statusColor = result.passed ? 'green' : (service.required ? 'red' : 'yellow');

    log(`${statusIcon} ${service.name.padEnd(30)} : ${statusText}`, statusColor);

    if (!result.passed && result.error) {
      logInfo(`   Erreur : ${result.error.substring(0, 60)}...`);
    }

    allResults.push({
      name: service.name,
      passed: result.passed,
      required: service.required
    });
  });

  // Statistiques
  log('');
  log('📈 Statistiques :', 'bold');

  const totalTests = allResults.length;
  const passedTests = allResults.filter(r => r.passed).length;
  const failedRequired = allResults.filter(r => !r.passed && r.required).length;
  const failedOptional = allResults.filter(r => !r.passed && !r.required).length;

  logInfo(`Total de tests : ${totalTests}`);
  logSuccess(`Tests réussis : ${passedTests}`);

  if (failedRequired > 0) {
    logError(`Tests échoués (requis) : ${failedRequired}`);
  }

  if (failedOptional > 0) {
    logWarning(`Tests échoués (optionnels) : ${failedOptional}`);
  }

  const successRate = Math.round((passedTests / totalTests) * 100);
  log('');
  log(`Taux de réussite : ${successRate}%`, successRate === 100 ? 'green' : 'yellow');

  // Coûts estimés
  log('');
  log('💰 Coûts Mensuels Estimés :', 'bold');
  logInfo('TomTom (5 véhicules)           : ~20€/mois');
  logInfo('AWS Textract (8k docs)         : ~46€/mois');
  logInfo('Google Vision (2k docs)        : ~1.40€/mois');
  log('─'.repeat(50), 'cyan');
  logInfo('TOTAL                          : ~68€/mois (~810€/an)');

  return {
    success: failedRequired === 0,
    passedTests,
    totalTests,
    failedRequired,
    failedOptional
  };
}

// ============================================================================
// Fonction Principale
// ============================================================================

async function validateAllServices() {
  log('\n╔══════════════════════════════════════════════════════════════════════╗', 'magenta');
  log('║                                                                      ║', 'magenta');
  log('║  RT SYMPHONI.A - Validation Complète des Services Externes          ║', 'magenta');
  log('║                                                                      ║', 'magenta');
  log('╚══════════════════════════════════════════════════════════════════════╝', 'magenta');

  logInfo(`Date : ${new Date().toLocaleString('fr-FR')}`);
  logInfo(`Environnement : ${process.env.NODE_ENV || 'development'}`);
  logInfo(`Plateforme : ${process.platform}`);

  // Étape 1 : Vérifications préliminaires
  logSection('Vérifications Préliminaires');

  const nodeOK = checkNodeVersion();
  const depsOK = checkDependencies();
  const envResults = checkEnvironmentVariables();

  if (!nodeOK) {
    logWarning('Version Node.js non optimale, mais poursuite des tests...');
  }

  if (!depsOK) {
    logError('Dépendances manquantes ! Installation requise :');
    logInfo('npm install');
    process.exit(1);
  }

  // Étape 2 : Tests des services
  log('\n');
  logSection('Tests des Services Externes');

  const serviceResults = [];

  for (const service of SERVICES) {
    const result = runServiceTest(service);
    serviceResults.push(result);

    // Pause de 2 secondes entre les tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Étape 3 : Rapport final
  log('\n');
  const report = generateReport(serviceResults);

  // Étape 4 : Conclusion
  log('');
  logSection('CONCLUSION');

  if (report.success) {
    log('');
    log('🎉 VALIDATION RÉUSSIE !', 'green');
    log('');
    logSuccess('Tous les services requis sont opérationnels');
    logSuccess('RT SYMPHONI.A est prêt pour le déploiement en production');

    if (report.failedOptional > 0) {
      log('');
      logWarning(`Note : ${report.failedOptional} service(s) optionnel(s) non configuré(s)`);
      logInfo('Ces services peuvent être configurés ultérieurement');
    }

    log('');
    log('📋 Prochaines étapes :', 'cyan');
    logInfo('1. Déployer sur AWS Elastic Beanstalk : eb deploy');
    logInfo('2. Vérifier les logs : eb logs');
    logInfo('3. Tester l\'API en production');
    logInfo('4. Configurer le monitoring CloudWatch');
    log('');

    process.exit(0);

  } else {
    log('');
    log('⚠️  VALIDATION ÉCHOUÉE', 'red');
    log('');
    logError(`${report.failedRequired} service(s) requis non opérationnel(s)`);
    log('');
    log('🔧 Actions correctives :', 'yellow');

    serviceResults.forEach((result, index) => {
      const service = SERVICES[index];
      if (!result.passed && service.required) {
        logInfo(`- Corriger la configuration de ${service.name}`);
      }
    });

    log('');
    logInfo('Consultez la documentation pour plus d\'aide :');
    logInfo('- CONFIGURATION_TOMTOM_TELEMATICS.md');
    logInfo('- CONFIGURATION_OCR_AWS_GOOGLE.md');
    logInfo('- DEPLOIEMENT_SERVICES_EXTERNES.md');
    log('');

    process.exit(1);
  }
}

// ============================================================================
// Options en Ligne de Commande
// ============================================================================

function showHelp() {
  log('\n╔══════════════════════════════════════════════════════════════════════╗', 'cyan');
  log('║  Validation des Services Externes - Aide                            ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════════════╝', 'cyan');

  log('\nUsage:', 'bold');
  log('  node validate-all-external-services.js [options]');

  log('\nOptions:', 'bold');
  log('  --help, -h          Afficher cette aide');
  log('  --service <name>    Tester un service spécifique uniquement');
  log('                      Valeurs : tomtom, aws, google');

  log('\nExemples:', 'bold');
  log('  node validate-all-external-services.js');
  log('  node validate-all-external-services.js --service tomtom');

  log('\nServices disponibles:', 'bold');
  SERVICES.forEach(service => {
    log(`  - ${service.name} (${service.required ? 'requis' : 'optionnel'})`);
    log(`    ${service.description}`);
  });

  log('');
}

// ============================================================================
// Point d'Entrée
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  validateAllServices().catch(error => {
    logError(`Erreur fatale : ${error.message}`);
    console.error(error);
    process.exit(1);
  });
}

module.exports = { validateAllServices };
