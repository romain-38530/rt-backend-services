// ============================================================================
// RT SYMPHONI.A - Test Google Vision API OCR
// ============================================================================
// Version: 1.6.2-security-final
// Date: 2024-11-26
// ============================================================================

const fs = require('fs');
const path = require('path');

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
// Document de Test
// ============================================================================

// Image PNG 1x1 pixel transparente
const TEST_IMAGE_BASE64 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

// ============================================================================
// Tests de Validation
// ============================================================================

async function testGoogleCredentialsConfiguration() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('Test 1: Configuration Google Cloud Credentials', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!credentialsPath) {
    logError('Variable GOOGLE_APPLICATION_CREDENTIALS non définie');
    logInfo('Définissez le chemin vers le fichier JSON des credentials');
    return false;
  }

  logInfo(`Chemin des credentials : ${credentialsPath}`);

  if (!fs.existsSync(credentialsPath)) {
    logError(`Fichier credentials non trouvé : ${credentialsPath}`);
    logInfo('Téléchargez le fichier JSON depuis Google Cloud Console');
    return false;
  }

  try {
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

    if (!credentials.type || credentials.type !== 'service_account') {
      logError('Fichier credentials invalide (type != service_account)');
      return false;
    }

    logSuccess('Credentials Google Cloud configurées');
    logInfo(`Project ID : ${credentials.project_id}`);
    logInfo(`Client Email : ${credentials.client_email}`);
    logInfo(`Type : ${credentials.type}`);

    return true;
  } catch (error) {
    logError(`Erreur lors de la lecture des credentials : ${error.message}`);
    return false;
  }
}

async function testGoogleVisionImport() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('Test 2: Import du SDK Google Vision', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  try {
    // Essayer d'importer le module
    const vision = require('@google-cloud/vision');
    logSuccess('SDK @google-cloud/vision importé avec succès');

    // Vérifier que le client peut être créé
    const client = new vision.ImageAnnotatorClient();
    logSuccess('Client ImageAnnotatorClient créé');

    return true;
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      logError('Module @google-cloud/vision non installé');
      logInfo('Installation : npm install @google-cloud/vision --save');
      return false;
    }

    logError(`Erreur lors de l'import : ${error.message}`);
    return false;
  }
}

async function testGoogleVisionAccess() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('Test 3: Accès à l\'API Google Vision', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  try {
    const vision = require('@google-cloud/vision');

    const client = new vision.ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });

    logInfo('Envoi d\'une image test à Google Vision...');
    const startTime = Date.now();

    const [result] = await client.textDetection({
      image: { content: TEST_IMAGE_BASE64 }
    });

    const duration = Date.now() - startTime;

    logSuccess('Google Vision API accessible');
    logInfo(`Temps de réponse : ${duration} ms`);

    if (result.textAnnotations && result.textAnnotations.length > 0) {
      logInfo(`Texte détecté : ${result.textAnnotations.length} annotations`);
    } else {
      logInfo('Aucun texte détecté (image test vide)');
    }

    if (duration > 10000) {
      logWarning('Temps de réponse élevé (>10s)');
    }

    return true;
  } catch (error) {
    if (error.code === 7) {
      logError('Accès refusé - Vérifiez les permissions du Service Account');
      logInfo('Permission requise : Cloud Vision API User');
      return false;
    }

    if (error.code === 3) {
      logError('API non activée - Activez Cloud Vision API');
      logInfo('https://console.cloud.google.com/apis/library/vision.googleapis.com');
      return false;
    }

    logError(`Erreur : ${error.message}`);
    logInfo(`Code d'erreur : ${error.code}`);
    return false;
  }
}

async function testDocumentTextDetection() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('Test 4: Document Text Detection', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  try {
    const vision = require('@google-cloud/vision');
    const client = new vision.ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });

    logInfo('Analyse de document avec détection de texte...');
    const startTime = Date.now();

    const [result] = await client.documentTextDetection({
      image: { content: TEST_IMAGE_BASE64 }
    });

    const duration = Date.now() - startTime;

    logSuccess('Document text detection fonctionnel');
    logInfo(`Temps d'analyse : ${duration} ms`);

    if (result.fullTextAnnotation) {
      const fullText = result.fullTextAnnotation;
      logInfo(`Pages détectées : ${fullText.pages ? fullText.pages.length : 0}`);

      if (fullText.text && fullText.text.length > 0) {
        logInfo(`Texte extrait : ${fullText.text.substring(0, 50)}...`);
      }
    }

    return true;
  } catch (error) {
    logError(`Erreur : ${error.message}`);
    return false;
  }
}

async function testWithRealDocument() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('Test 5: Extraction avec Document Réel (Optionnel)', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  const testDocsPath = path.join(__dirname, '..', 'test-documents');

  if (!fs.existsSync(testDocsPath)) {
    logWarning('Dossier test-documents non trouvé - Test ignoré');
    return true;
  }

  const files = fs.readdirSync(testDocsPath).filter(f =>
    f.match(/\.(png|jpg|jpeg|pdf)$/i)
  );

  if (files.length === 0) {
    logWarning('Aucun document de test trouvé - Test ignoré');
    return true;
  }

  try {
    const vision = require('@google-cloud/vision');
    const client = new vision.ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });

    const testFile = files[0];
    logInfo(`Document de test : ${testFile}`);

    const filePath = path.join(testDocsPath, testFile);
    const fileBuffer = fs.readFileSync(filePath);

    logInfo(`Taille du fichier : ${Math.round(fileBuffer.length / 1024)} KB`);

    const startTime = Date.now();
    const [result] = await client.documentTextDetection({
      image: { content: fileBuffer }
    });
    const duration = Date.now() - startTime;

    logSuccess('Extraction réussie');
    logInfo(`Temps d'extraction : ${duration} ms`);

    if (result.fullTextAnnotation) {
      const fullText = result.fullTextAnnotation;

      if (fullText.text) {
        const lines = fullText.text.split('\n').filter(l => l.trim().length > 0);
        logInfo(`Lignes de texte : ${lines.length}`);

        if (lines.length > 0) {
          logInfo('Aperçu (5 premières lignes) :');
          lines.slice(0, 5).forEach((line, i) => {
            logInfo(`  ${i + 1}. ${line.substring(0, 60)}`);
          });
        }
      }

      // Calculer confiance moyenne
      if (fullText.pages && fullText.pages.length > 0) {
        const page = fullText.pages[0];
        if (page.blocks) {
          const confidences = page.blocks
            .filter(b => b.confidence)
            .map(b => b.confidence);

          if (confidences.length > 0) {
            const avgConfidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
            logInfo(`Confiance moyenne : ${(avgConfidence * 100).toFixed(2)}%`);

            if (avgConfidence < 0.8) {
              logWarning('Confiance faible (<80%) - Qualité du document à améliorer');
            }
          }
        }
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

  const COST_PER_1000_IMAGES = 1.50; // $1.50 per 1000 images
  const FREE_TIER_MONTHLY = 1000; // First 1000 images free per month

  const monthlyImages = 2000; // Estimation : 2,000 images/mois en fallback

  const paidImages = Math.max(0, monthlyImages - FREE_TIER_MONTHLY);
  const monthlyCost = (paidImages / 1000) * COST_PER_1000_IMAGES;
  const annualCost = monthlyCost * 12;

  logInfo('Tarification Google Vision API :');
  logInfo(`  - Text Detection : $${COST_PER_1000_IMAGES} / 1000 images`);
  logInfo(`  - Document Text Detection : $${COST_PER_1000_IMAGES} / 1000 images`);
  logInfo(`  - Free Tier : ${FREE_TIER_MONTHLY} images/mois GRATUITS`);

  log('');
  logInfo(`Estimation pour ${monthlyImages.toLocaleString()} images/mois (fallback 20%) :`);
  logInfo(`  - Images gratuites : ${FREE_TIER_MONTHLY}`);
  logInfo(`  - Images payantes : ${paidImages}`);
  logInfo(`  - Coût mensuel : $${monthlyCost.toFixed(2)} (~${(monthlyCost * 0.92).toFixed(2)}€)`);
  logInfo(`  - Coût annuel : $${annualCost.toFixed(2)} (~${(annualCost * 0.92).toFixed(2)}€)`);

  logSuccess('Estimation des coûts calculée');

  log('');
  logInfo('💡 Comparaison AWS Textract vs Google Vision :');
  logInfo('  - AWS Textract : ~$58/mois (8k docs, 80% du volume)');
  logInfo('  - Google Vision : ~$1.40/mois (2k docs, 20% fallback)');
  logInfo('  - TOTAL OCR : ~$59.40/mois (~54.65€)');

  return true;
}

// ============================================================================
// Fonction Principale
// ============================================================================

async function runAllTests() {
  log('\n╔══════════════════════════════════════════════════════════════════╗', 'cyan');
  log('║  RT SYMPHONI.A - Test Google Vision API OCR                     ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════════╝', 'cyan');

  logInfo(`Date : ${new Date().toLocaleString('fr-FR')}`);
  logInfo(`Node.js : ${process.version}`);
  logInfo(`Environnement : ${process.env.NODE_ENV || 'development'}`);

  const tests = [
    { name: 'Configuration Google Credentials', fn: testGoogleCredentialsConfiguration },
    { name: 'Import SDK Google Vision', fn: testGoogleVisionImport },
    { name: 'Accès Google Vision API', fn: testGoogleVisionAccess },
    { name: 'Document Text Detection', fn: testDocumentTextDetection },
    { name: 'Extraction Document Réel', fn: testWithRealDocument },
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
    log('✅ Google Vision API est opérationnelle', 'green');
    process.exit(0);
  } else {
    log('\n⚠️  CERTAINS TESTS ONT ÉCHOUÉ', 'yellow');
    log('Vérifiez votre configuration Google Cloud et réessayez', 'yellow');
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
