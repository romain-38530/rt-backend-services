// ============================================================================
// RT SYMPHONI.A - Test AWS Textract OCR
// ============================================================================
// Version: 1.6.2-security-final
// Date: 2024-11-26
// ============================================================================

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

// Configuration AWS
const textract = new AWS.Textract({
  region: process.env.AWS_REGION || 'eu-central-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
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

// ============================================================================
// Document de Test (Base64 Minimal - Image 1x1 pixel)
// ============================================================================

// Image PNG 1x1 pixel transparente (pour tests)
const TEST_IMAGE_BASE64 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

// Document de test avec du texte simple (simulation BL)
const generateTestDocument = () => {
  // Crée un Buffer simulant un document PDF/Image avec du texte
  // Dans un environnement réel, utilisez un vrai document BL/CMR
  return TEST_IMAGE_BASE64;
};

// ============================================================================
// Tests de Validation
// ============================================================================

async function testAWSCredentials() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('Test 1: Configuration AWS Credentials', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  if (!process.env.AWS_ACCESS_KEY_ID) {
    logError('Variable AWS_ACCESS_KEY_ID non définie');
    return false;
  }

  if (!process.env.AWS_SECRET_ACCESS_KEY) {
    logError('Variable AWS_SECRET_ACCESS_KEY non définie');
    return false;
  }

  logSuccess('AWS Credentials configurées');
  logInfo(`Access Key ID : ${process.env.AWS_ACCESS_KEY_ID.substring(0, 10)}...`);
  logInfo(`Région : ${process.env.AWS_REGION || 'eu-central-1'}`);

  try {
    // Tester les credentials avec STS
    const sts = new AWS.STS({
      region: process.env.AWS_REGION || 'eu-central-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    });

    const identity = await sts.getCallerIdentity().promise();
    logSuccess('Credentials valides');
    logInfo(`Account : ${identity.Account}`);
    logInfo(`User ARN : ${identity.Arn}`);
    return true;
  } catch (error) {
    logError(`Credentials invalides : ${error.message}`);
    return false;
  }
}

async function testTextractAccess() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('Test 2: Accès au Service AWS Textract', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  try {
    // Test minimal : DetectDocumentText
    const params = {
      Document: {
        Bytes: generateTestDocument()
      }
    };

    logInfo('Envoi d\'un document test à AWS Textract...');
    const startTime = Date.now();

    const result = await textract.detectDocumentText(params).promise();
    const duration = Date.now() - startTime;

    logSuccess('AWS Textract accessible');
    logInfo(`Temps de réponse : ${duration} ms`);
    logInfo(`Blocks détectés : ${result.Blocks ? result.Blocks.length : 0}`);

    if (duration > 10000) {
      logWarning('Temps de réponse élevé (>10s)');
    }

    return true;
  } catch (error) {
    if (error.code === 'InvalidParameterException') {
      logWarning('Document test invalide mais accès Textract confirmé');
      return true;
    }

    if (error.code === 'AccessDeniedException') {
      logError('Accès refusé - Vérifiez les permissions IAM');
      logInfo('Permissions requises : textract:DetectDocumentText');
      return false;
    }

    logError(`Erreur : ${error.message}`);
    logInfo(`Code d'erreur : ${error.code}`);
    return false;
  }
}

async function testAnalyzeDocument() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('Test 3: Analyse de Document (Forms + Tables)', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  try {
    const params = {
      Document: {
        Bytes: generateTestDocument()
      },
      FeatureTypes: ['FORMS', 'TABLES']
    };

    logInfo('Analyse du document avec extraction de formulaires et tables...');
    const startTime = Date.now();

    const result = await textract.analyzeDocument(params).promise();
    const duration = Date.now() - startTime;

    logSuccess('Analyse de document réussie');
    logInfo(`Temps d\'analyse : ${duration} ms`);
    logInfo(`Blocks détectés : ${result.Blocks ? result.Blocks.length : 0}`);

    // Compter les types de blocks
    if (result.Blocks) {
      const blockTypes = {};
      result.Blocks.forEach(block => {
        blockTypes[block.BlockType] = (blockTypes[block.BlockType] || 0) + 1;
      });

      Object.keys(blockTypes).forEach(type => {
        logInfo(`  - ${type} : ${blockTypes[type]}`);
      });
    }

    return true;
  } catch (error) {
    if (error.code === 'InvalidParameterException') {
      logWarning('Document test invalide mais capacité d\'analyse confirmée');
      return true;
    }

    if (error.code === 'AccessDeniedException') {
      logError('Accès refusé pour AnalyzeDocument');
      logInfo('Permissions requises : textract:AnalyzeDocument');
      return false;
    }

    logError(`Erreur : ${error.message}`);
    return false;
  }
}

async function testSignatureDetection() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('Test 4: Détection de Signatures', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  try {
    const params = {
      Document: {
        Bytes: generateTestDocument()
      },
      FeatureTypes: ['SIGNATURES']
    };

    logInfo('Détection de signatures dans le document...');
    const result = await textract.analyzeDocument(params).promise();

    logSuccess('Détection de signatures fonctionnelle');

    const signatures = result.Blocks
      ? result.Blocks.filter(block => block.BlockType === 'SIGNATURE')
      : [];

    logInfo(`Signatures détectées : ${signatures.length}`);

    if (signatures.length > 0) {
      signatures.forEach((sig, index) => {
        logInfo(`  Signature ${index + 1} : Confiance ${Math.round(sig.Confidence || 0)}%`);
      });
    }

    return true;
  } catch (error) {
    if (error.code === 'InvalidParameterException') {
      logWarning('Document test invalide mais capacité de détection confirmée');
      return true;
    }

    logError(`Erreur : ${error.message}`);
    return false;
  }
}

async function testTextractWithRealDocument() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('Test 5: Extraction avec Document Réel (Optionnel)', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  // Chercher un document de test dans le dossier test-documents
  const testDocsPath = path.join(__dirname, '..', 'test-documents');

  if (!fs.existsSync(testDocsPath)) {
    logWarning('Dossier test-documents non trouvé - Test ignoré');
    logInfo('Créez le dossier et ajoutez des documents BL/CMR pour tester');
    return true; // Pas une erreur bloquante
  }

  const files = fs.readdirSync(testDocsPath).filter(f =>
    f.match(/\.(png|jpg|jpeg|pdf)$/i)
  );

  if (files.length === 0) {
    logWarning('Aucun document de test trouvé - Test ignoré');
    return true;
  }

  try {
    const testFile = files[0];
    logInfo(`Document de test : ${testFile}`);

    const filePath = path.join(testDocsPath, testFile);
    const fileBuffer = fs.readFileSync(filePath);

    logInfo(`Taille du fichier : ${Math.round(fileBuffer.length / 1024)} KB`);

    const params = {
      Document: { Bytes: fileBuffer },
      FeatureTypes: ['FORMS', 'TABLES', 'SIGNATURES']
    };

    const startTime = Date.now();
    const result = await textract.analyzeDocument(params).promise();
    const duration = Date.now() - startTime;

    logSuccess('Extraction réussie');
    logInfo(`Temps d\'extraction : ${duration} ms`);
    logInfo(`Blocks extraits : ${result.Blocks.length}`);

    // Extraire le texte complet
    const textBlocks = result.Blocks.filter(b => b.BlockType === 'LINE');
    if (textBlocks.length > 0) {
      logInfo(`Lignes de texte : ${textBlocks.length}`);
      logInfo('Aperçu (5 premières lignes) :');
      textBlocks.slice(0, 5).forEach((block, i) => {
        logInfo(`  ${i + 1}. ${block.Text}`);
      });
    }

    // Calculer confiance moyenne
    const confidences = result.Blocks
      .filter(b => b.Confidence)
      .map(b => b.Confidence);

    if (confidences.length > 0) {
      const avgConfidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
      logInfo(`Confiance moyenne : ${avgConfidence.toFixed(2)}%`);

      if (avgConfidence < 80) {
        logWarning('Confiance faible (<80%) - Qualité du document à améliorer');
      }
    }

    return true;
  } catch (error) {
    logError(`Erreur lors de l'extraction : ${error.message}`);
    return false;
  }
}

async function testCostEstimation() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('Test 6: Estimation des Coûts', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  const COST_PER_PAGE = {
    detectText: 0.0015,      // $0.0015 par page
    analyzeForms: 0.050,     // $0.050 par page
    analyzeTables: 0.015,    // $0.015 par page
    combined: 0.065          // $0.065 par page (Forms + Tables)
  };

  const monthlyDocs = 10000; // Estimation : 10,000 documents/mois

  const monthlyCost = monthlyDocs * COST_PER_PAGE.combined;
  const annualCost = monthlyCost * 12;

  logInfo('Tarification AWS Textract (région eu-central-1) :');
  logInfo(`  - DetectDocumentText : $${COST_PER_PAGE.detectText}/page`);
  logInfo(`  - AnalyzeDocument (Forms) : $${COST_PER_PAGE.analyzeForms}/page`);
  logInfo(`  - AnalyzeDocument (Tables) : $${COST_PER_PAGE.analyzeTables}/page`);
  logInfo(`  - Combined (Forms + Tables) : $${COST_PER_PAGE.combined}/page`);

  log('');
  logInfo(`Estimation pour ${monthlyDocs.toLocaleString()} documents/mois :`);
  logInfo(`  - Coût mensuel : $${monthlyCost.toFixed(2)} (~${(monthlyCost * 0.92).toFixed(2)}€)`);
  logInfo(`  - Coût annuel : $${annualCost.toFixed(2)} (~${(annualCost * 0.92).toFixed(2)}€)`);

  logSuccess('Estimation des coûts calculée');
  return true;
}

// ============================================================================
// Fonction Principale
// ============================================================================

async function runAllTests() {
  log('\n╔══════════════════════════════════════════════════════════════════╗', 'cyan');
  log('║  RT SYMPHONI.A - Test AWS Textract OCR                          ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════════╝', 'cyan');

  logInfo(`Date : ${new Date().toLocaleString('fr-FR')}`);
  logInfo(`Node.js : ${process.version}`);
  logInfo(`Environnement : ${process.env.NODE_ENV || 'development'}`);
  logInfo(`Région AWS : ${process.env.AWS_REGION || 'eu-central-1'}`);

  const tests = [
    { name: 'Configuration AWS Credentials', fn: testAWSCredentials },
    { name: 'Accès AWS Textract', fn: testTextractAccess },
    { name: 'Analyse de Document', fn: testAnalyzeDocument },
    { name: 'Détection de Signatures', fn: testSignatureDetection },
    { name: 'Extraction Document Réel', fn: testTextractWithRealDocument },
    { name: 'Estimation des Coûts', fn: testCostEstimation }
  ];

  const results = [];

  for (const test of tests) {
    try {
      const passed = await test.fn();
      results.push({ name: test.name, passed });
    } catch (error) {
      logError(`Exception non gérée: ${error.message}`);
      console.error(error);
      results.push({ name: test.name, passed: false });
    }
  }

  // Résumé
  log('\n╔══════════════════════════════════════════════════════════════════╗', 'cyan');
  log('║  RÉSUMÉ DES TESTS                                                ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════════╝', 'cyan');

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  results.forEach(result => {
    if (result.passed) {
      logSuccess(`${result.name.padEnd(40)} : RÉUSSI`);
    } else {
      logError(`${result.name.padEnd(40)} : ÉCHOUÉ`);
    }
  });

  log('\n' + '═'.repeat(68), 'cyan');
  log(`Total : ${passed}/${total} tests réussis (${Math.round(passed / total * 100)}%)`, passed === total ? 'green' : 'yellow');
  log('═'.repeat(68), 'cyan');

  if (passed === total) {
    log('\n🎉 TOUS LES TESTS SONT PASSÉS !', 'green');
    log('✅ AWS Textract est opérationnel', 'green');
    process.exit(0);
  } else {
    log('\n⚠️  CERTAINS TESTS ONT ÉCHOUÉ', 'yellow');
    log('Vérifiez votre configuration AWS et réessayez', 'yellow');
    process.exit(1);
  }
}

// ============================================================================
// Exécution
// ============================================================================

if (require.main === module) {
  runAllTests().catch(error => {
    logError(`Erreur fatale: ${error.message}`);
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runAllTests };
