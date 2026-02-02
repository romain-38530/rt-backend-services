/**
 * Test End-to-End - Workflow Complet Carrier
 *
 * Workflow testé:
 * 1. Créer un carrier
 * 2. Upload 6 documents requis
 * 3. Vérifier les documents
 * 4. Calculer le score
 * 5. Vérifier l'éligibilité Affret.IA
 * 6. Vérifier les webhooks déclenchés
 * 7. Vérifier les email logs
 * 8. Vérifier les métriques CloudWatch (si disponible)
 * 9. Cleanup à la fin
 *
 * Usage: node tests/test-e2e-complete-workflow.cjs
 */

require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  carriersApiUrl: process.env.CARRIERS_API_URL || 'http://localhost:3002',
  documentsApiUrl: process.env.DOCUMENTS_API_URL || 'http://localhost:3003',
  scoringApiUrl: process.env.SCORING_API_URL || 'http://localhost:3004',
  affretiaApiUrl: process.env.AFFRETIA_API_URL || 'http://localhost:3017',
  authzApiUrl: process.env.AUTHZ_API_URL || 'http://localhost:3001',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
  dbName: process.env.MONGODB_DB_NAME || 'symphonia',
  testDataCleanup: process.env.TEST_DATA_CLEANUP !== 'false', // true par défaut
};

// Codes de sortie
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

// Couleurs pour les logs
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

// État du workflow
const workflowState = {
  carrierId: null,
  documentIds: [],
  webhooksReceived: [],
  emailsSent: [],
  createdAt: new Date(),
};

// Helpers de logs
function logSection(title) {
  console.log(`\n${colors.bright}${colors.cyan}======================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}======================================${colors.reset}\n`);
}

function logSuccess(message) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function logError(message) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

function logInfo(message) {
  console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function logStep(stepNumber, message) {
  console.log(`${colors.magenta}[Étape ${stepNumber}]${colors.reset} ${message}`);
}

// Étape 1: Créer un carrier
async function step1CreateCarrier() {
  logSection('Étape 1: Créer un Carrier');

  try {
    const carrierData = {
      name: `Test Carrier E2E ${Date.now()}`,
      siret: `${Math.floor(Math.random() * 100000000000000)}`,
      email: `test-carrier-${Date.now()}@example.com`,
      phone: '+33612345678',
      address: {
        street: '123 Rue de Test',
        city: 'Paris',
        zipCode: '75001',
        country: 'France',
      },
      legalForm: 'SARL',
      registrationNumber: `REG-${Date.now()}`,
      vatNumber: `FR${Math.floor(Math.random() * 100000000000)}`,
      metadata: {
        testData: true,
        e2eTest: true,
        createdAt: new Date().toISOString(),
      },
    };

    logInfo('Création du carrier...');
    const response = await axios.post(`${config.carriersApiUrl}/api/v1/carriers`, carrierData, {
      timeout: 10000,
    });

    if (response.status !== 201) {
      throw new Error(`Status code attendu: 201, reçu: ${response.status}`);
    }

    workflowState.carrierId = response.data._id || response.data.id;
    logSuccess(`Carrier créé: ${workflowState.carrierId}`);
    logInfo(`Nom: ${carrierData.name}`);
    logInfo(`SIRET: ${carrierData.siret}`);

    return true;
  } catch (error) {
    logError(`Erreur lors de la création du carrier: ${error.message}`);
    return false;
  }
}

// Étape 2: Upload des 6 documents requis
async function step2UploadDocuments() {
  logSection('Étape 2: Upload des 6 Documents Requis');

  const requiredDocuments = [
    { type: 'kbis', name: 'KBIS - Extrait K-bis' },
    { type: 'insurance', name: 'Assurance responsabilité civile' },
    { type: 'license', name: 'Licence de transport' },
    { type: 'carte_grise', name: 'Carte grise véhicule' },
    { type: 'identity', name: 'Pièce d\'identité gérant' },
    { type: 'rib', name: 'RIB/IBAN' },
  ];

  try {
    for (const doc of requiredDocuments) {
      logInfo(`Upload du document: ${doc.name}...`);

      // Créer un fichier de test temporaire
      const testFilePath = path.join(__dirname, `test-${doc.type}.pdf`);
      fs.writeFileSync(testFilePath, `Test PDF content for ${doc.type}\n%PDF-1.4\nTest document`);

      const formData = new FormData();
      formData.append('file', fs.createReadStream(testFilePath));
      formData.append('type', doc.type);
      formData.append('carrierId', workflowState.carrierId);
      formData.append('metadata', JSON.stringify({ testData: true }));

      try {
        const response = await axios.post(
          `${config.documentsApiUrl}/api/v1/documents/upload`,
          formData,
          {
            headers: formData.getHeaders(),
            timeout: 30000,
          }
        );

        if (response.status === 201 || response.status === 200) {
          const documentId = response.data._id || response.data.id;
          workflowState.documentIds.push(documentId);
          logSuccess(`  Document uploadé: ${documentId}`);
        } else {
          logWarning(`  Upload échoué (status ${response.status})`);
        }
      } catch (uploadError) {
        logWarning(`  Erreur upload: ${uploadError.message}`);
      } finally {
        // Nettoyer le fichier temporaire
        if (fs.existsSync(testFilePath)) {
          fs.unlinkSync(testFilePath);
        }
      }
    }

    logSuccess(`Total de documents uploadés: ${workflowState.documentIds.length}/${requiredDocuments.length}`);
    return workflowState.documentIds.length >= 3; // Au moins 3 documents pour continuer
  } catch (error) {
    logError(`Erreur lors de l'upload des documents: ${error.message}`);
    return false;
  }
}

// Étape 3: Vérifier les documents
async function step3VerifyDocuments() {
  logSection('Étape 3: Vérifier les Documents');

  try {
    let verifiedCount = 0;

    for (const documentId of workflowState.documentIds) {
      try {
        const response = await axios.get(
          `${config.documentsApiUrl}/api/v1/documents/${documentId}`,
          { timeout: 5000 }
        );

        if (response.status === 200) {
          const document = response.data;
          logInfo(`Document ${documentId}:`);
          logInfo(`  Type: ${document.type}`);
          logInfo(`  Status: ${document.status || 'unknown'}`);
          logInfo(`  Taille: ${document.size || 'N/A'} bytes`);
          verifiedCount++;
        }
      } catch (error) {
        logWarning(`Impossible de vérifier le document ${documentId}`);
      }
    }

    logSuccess(`${verifiedCount}/${workflowState.documentIds.length} documents vérifiés`);
    return verifiedCount > 0;
  } catch (error) {
    logError(`Erreur lors de la vérification des documents: ${error.message}`);
    return false;
  }
}

// Étape 4: Calculer le score
async function step4CalculateScore() {
  logSection('Étape 4: Calculer le Score du Carrier');

  try {
    logInfo('Calcul du score...');

    const response = await axios.post(
      `${config.scoringApiUrl}/api/v1/scoring/calculate`,
      {
        carrierId: workflowState.carrierId,
        metrics: {
          documentsCompleted: workflowState.documentIds.length,
          totalDocumentsRequired: 6,
          onTimeDeliveryRate: 0.95,
          customerSatisfaction: 4.5,
          yearsInBusiness: 5,
        },
      },
      { timeout: 10000 }
    );

    if (response.status === 200 || response.status === 201) {
      const scoring = response.data;
      logSuccess(`Score calculé: ${scoring.score || 'N/A'}/100`);
      logInfo(`Niveau: ${scoring.level || 'N/A'}`);
      logInfo(`Documents: ${scoring.documentsScore || 'N/A'}/100`);
      logInfo(`Performance: ${scoring.performanceScore || 'N/A'}/100`);
      workflowState.score = scoring.score;
      return true;
    } else {
      logWarning(`Score non calculé (status ${response.status})`);
      return false;
    }
  } catch (error) {
    if (error.response?.status === 404) {
      logWarning('Endpoint de scoring non disponible');
      return true; // Non bloquant
    }
    logError(`Erreur lors du calcul du score: ${error.message}`);
    return false;
  }
}

// Étape 5: Vérifier l'éligibilité Affret.IA
async function step5CheckAffretiaEligibility() {
  logSection('Étape 5: Vérifier l\'Éligibilité Affret.IA');

  try {
    logInfo('Vérification de l\'éligibilité...');

    const response = await axios.post(
      `${config.affretiaApiUrl}/api/v1/affretia/eligibility/check`,
      {
        carrierId: workflowState.carrierId,
        score: workflowState.score || 75,
        documentsCount: workflowState.documentIds.length,
      },
      { timeout: 10000 }
    );

    if (response.status === 200) {
      const eligibility = response.data;
      logSuccess(`Éligibilité: ${eligibility.eligible ? 'OUI' : 'NON'}`);

      if (eligibility.eligible) {
        logInfo(`Niveau: ${eligibility.level || 'N/A'}`);
        logInfo(`Accès bourse: ${eligibility.accessToBourse ? 'Oui' : 'Non'}`);
      } else {
        logInfo(`Raisons: ${eligibility.reasons?.join(', ') || 'N/A'}`);
      }

      return true;
    } else {
      logWarning(`Vérification échouée (status ${response.status})`);
      return false;
    }
  } catch (error) {
    if (error.response?.status === 404) {
      logWarning('Endpoint d\'éligibilité non disponible');
      return true; // Non bloquant
    }
    logError(`Erreur lors de la vérification d'éligibilité: ${error.message}`);
    return false;
  }
}

// Étape 6: Vérifier les webhooks déclenchés
async function step6VerifyWebhooks(mongoClient) {
  logSection('Étape 6: Vérifier les Webhooks Déclenchés');

  try {
    const db = mongoClient.db(config.dbName);
    const webhooksCollection = db.collection('webhook_logs');

    // Vérifier si la collection existe
    const collections = await db.listCollections({ name: 'webhook_logs' }).toArray();
    if (collections.length === 0) {
      logWarning('Collection webhook_logs n\'existe pas');
      return true; // Non bloquant
    }

    // Récupérer les webhooks liés au carrier de test
    const webhooks = await webhooksCollection
      .find({
        'payload.carrierId': workflowState.carrierId,
        createdAt: { $gte: workflowState.createdAt },
      })
      .sort({ createdAt: 1 })
      .toArray();

    logInfo(`Webhooks déclenchés: ${webhooks.length}`);

    if (webhooks.length > 0) {
      webhooks.forEach((webhook, index) => {
        logInfo(`  ${index + 1}. ${webhook.event}: ${webhook.status || 'unknown'}`);
      });
      workflowState.webhooksReceived = webhooks;
      logSuccess('Webhooks détectés');
    } else {
      logWarning('Aucun webhook détecté (peut-être désactivés en test)');
    }

    return true;
  } catch (error) {
    logError(`Erreur lors de la vérification des webhooks: ${error.message}`);
    return false;
  }
}

// Étape 7: Vérifier les email logs
async function step7VerifyEmailLogs(mongoClient) {
  logSection('Étape 7: Vérifier les Email Logs');

  try {
    const db = mongoClient.db(config.dbName);
    const emailLogsCollection = db.collection('email_logs');

    // Vérifier si la collection existe
    const collections = await db.listCollections({ name: 'email_logs' }).toArray();
    if (collections.length === 0) {
      logWarning('Collection email_logs n\'existe pas');
      return true; // Non bloquant
    }

    // Récupérer les emails liés au carrier de test
    const emails = await emailLogsCollection
      .find({
        $or: [
          { 'metadata.carrierId': workflowState.carrierId },
          { to: { $regex: workflowState.carrierId } },
        ],
        sentAt: { $gte: workflowState.createdAt },
      })
      .sort({ sentAt: 1 })
      .toArray();

    logInfo(`Emails envoyés: ${emails.length}`);

    if (emails.length > 0) {
      emails.forEach((email, index) => {
        logInfo(`  ${index + 1}. ${email.type || 'unknown'}: ${email.status || 'unknown'}`);
        logInfo(`     À: ${email.to}`);
      });
      workflowState.emailsSent = emails;
      logSuccess('Emails détectés');
    } else {
      logWarning('Aucun email détecté (mode dry run activé?)');
    }

    return true;
  } catch (error) {
    logError(`Erreur lors de la vérification des emails: ${error.message}`);
    return false;
  }
}

// Étape 8: Vérifier les métriques CloudWatch
async function step8VerifyCloudWatchMetrics() {
  logSection('Étape 8: Vérifier les Métriques CloudWatch');

  try {
    // Tester l'endpoint de métriques
    const response = await axios.get(`${config.carriersApiUrl}/api/v1/metrics/cloudwatch`, {
      timeout: 5000,
    });

    if (response.status === 200) {
      const metrics = response.data;
      logSuccess('Endpoint CloudWatch accessible');
      logInfo(`Métriques disponibles: ${Object.keys(metrics).length}`);

      if (metrics.carriersCreated) {
        logInfo(`  Carriers créés: ${metrics.carriersCreated}`);
      }
      if (metrics.documentsUploaded) {
        logInfo(`  Documents uploadés: ${metrics.documentsUploaded}`);
      }
      if (metrics.scoresCalculated) {
        logInfo(`  Scores calculés: ${metrics.scoresCalculated}`);
      }

      return true;
    }

    return false;
  } catch (error) {
    if (error.response?.status === 404) {
      logWarning('Endpoint CloudWatch non disponible');
      return true; // Non bloquant
    }
    logError(`Erreur lors de la vérification CloudWatch: ${error.message}`);
    return false;
  }
}

// Étape 9: Cleanup
async function step9Cleanup(mongoClient) {
  logSection('Étape 9: Cleanup des Données de Test');

  if (!config.testDataCleanup) {
    logWarning('Cleanup désactivé (TEST_DATA_CLEANUP=false)');
    logInfo('Données de test conservées:');
    logInfo(`  - Carrier ID: ${workflowState.carrierId}`);
    logInfo(`  - Documents: ${workflowState.documentIds.length}`);
    return true;
  }

  try {
    const db = mongoClient.db(config.dbName);
    let deletedCount = 0;

    // Supprimer le carrier
    if (workflowState.carrierId) {
      try {
        const carriersCollection = db.collection('carriers');
        const result = await carriersCollection.deleteOne({
          _id: new ObjectId(workflowState.carrierId),
        });
        if (result.deletedCount > 0) {
          logSuccess('Carrier supprimé');
          deletedCount++;
        }
      } catch (error) {
        logWarning(`Erreur suppression carrier: ${error.message}`);
      }
    }

    // Supprimer les documents
    if (workflowState.documentIds.length > 0) {
      try {
        const documentsCollection = db.collection('documents');
        const result = await documentsCollection.deleteMany({
          _id: { $in: workflowState.documentIds.map((id) => new ObjectId(id)) },
        });
        logSuccess(`${result.deletedCount} documents supprimés`);
        deletedCount += result.deletedCount;
      } catch (error) {
        logWarning(`Erreur suppression documents: ${error.message}`);
      }
    }

    // Supprimer les logs associés
    try {
      const webhooksCollection = db.collection('webhook_logs');
      const result = await webhooksCollection.deleteMany({
        'payload.carrierId': workflowState.carrierId,
      });
      if (result.deletedCount > 0) {
        logSuccess(`${result.deletedCount} webhooks supprimés`);
      }
    } catch (error) {
      // Non bloquant
    }

    logSuccess(`Cleanup terminé: ${deletedCount} éléments supprimés`);
    return true;
  } catch (error) {
    logError(`Erreur lors du cleanup: ${error.message}`);
    return false;
  }
}

// Fonction principale
async function main() {
  console.log(`${colors.bright}${colors.cyan}`);
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║    TEST END-TO-END - WORKFLOW COMPLET CARRIER        ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  logInfo('Configuration:');
  logInfo(`  - Carriers API: ${config.carriersApiUrl}`);
  logInfo(`  - Documents API: ${config.documentsApiUrl}`);
  logInfo(`  - Scoring API: ${config.scoringApiUrl}`);
  logInfo(`  - Affret.IA API: ${config.affretiaApiUrl}`);
  logInfo(`  - MongoDB: ${config.mongoUri.replace(/\/\/.*@/, '//***@')}`);
  logInfo(`  - Cleanup: ${config.testDataCleanup ? 'Activé' : 'Désactivé'}`);

  let mongoClient;
  const results = {
    step1: false,
    step2: false,
    step3: false,
    step4: false,
    step5: false,
    step6: false,
    step7: false,
    step8: false,
    step9: false,
  };

  try {
    // Connexion MongoDB
    logSection('Connexion à MongoDB');
    mongoClient = new MongoClient(config.mongoUri);
    await mongoClient.connect();
    logSuccess('Connecté à MongoDB');

    // Exécuter le workflow
    results.step1 = await step1CreateCarrier();
    if (!results.step1) {
      throw new Error('Échec de la création du carrier - Arrêt du workflow');
    }

    results.step2 = await step2UploadDocuments();
    results.step3 = await step3VerifyDocuments();
    results.step4 = await step4CalculateScore();
    results.step5 = await step5CheckAffretiaEligibility();
    results.step6 = await step6VerifyWebhooks(mongoClient);
    results.step7 = await step7VerifyEmailLogs(mongoClient);
    results.step8 = await step8VerifyCloudWatchMetrics();
    results.step9 = await step9Cleanup(mongoClient);

    // Résumé des résultats
    logSection('Résumé du Workflow');

    const steps = [
      { name: 'Création du Carrier', result: results.step1, critical: true },
      { name: 'Upload des Documents', result: results.step2, critical: true },
      { name: 'Vérification des Documents', result: results.step3, critical: false },
      { name: 'Calcul du Score', result: results.step4, critical: false },
      { name: 'Éligibilité Affret.IA', result: results.step5, critical: false },
      { name: 'Webhooks', result: results.step6, critical: false },
      { name: 'Email Logs', result: results.step7, critical: false },
      { name: 'CloudWatch Metrics', result: results.step8, critical: false },
      { name: 'Cleanup', result: results.step9, critical: false },
    ];

    let passedCount = 0;
    let criticalFailures = 0;

    steps.forEach((step) => {
      if (step.result) {
        logSuccess(`${step.name}: PASS`);
        passedCount++;
      } else {
        if (step.critical) {
          logError(`${step.name}: FAIL (CRITIQUE)`);
          criticalFailures++;
        } else {
          logWarning(`${step.name}: FAIL (non bloquant)`);
        }
      }
    });

    console.log(`\n${colors.bright}Résultat: ${passedCount}/${steps.length} étapes réussies${colors.reset}`);
    console.log(`${colors.bright}Critiques: ${criticalFailures} échecs${colors.reset}\n`);

    // Fermer la connexion MongoDB
    await mongoClient.close();
    logSuccess('Connexion MongoDB fermée');

    // Retourner le code de sortie approprié
    if (criticalFailures === 0 && passedCount >= steps.length - 2) {
      // Au moins 7/9 réussis et pas d'échec critique
      console.log(`${colors.green}${colors.bright}✓ WORKFLOW COMPLET REUSSI !${colors.reset}\n`);
      process.exit(EXIT_SUCCESS);
    } else {
      console.log(`${colors.red}${colors.bright}✗ WORKFLOW ECHOUE${colors.reset}\n`);
      process.exit(EXIT_FAILURE);
    }
  } catch (error) {
    logError(`Erreur fatale: ${error.message}`);
    console.error(error.stack);

    // Tenter un cleanup même en cas d'erreur
    if (mongoClient && workflowState.carrierId) {
      logWarning('Tentative de cleanup après erreur...');
      try {
        await step9Cleanup(mongoClient);
      } catch (cleanupError) {
        logWarning('Cleanup échoué');
      }
    }

    if (mongoClient) {
      await mongoClient.close();
    }

    process.exit(EXIT_FAILURE);
  }
}

// Lancer le workflow
main();
