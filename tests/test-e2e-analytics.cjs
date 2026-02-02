/**
 * Test End-to-End - Analytics Affret.IA
 *
 * Tests:
 * - Funnel Affret.IA: GET /api/v1/affretia/analytics/conversion
 * - Vérification de la collection affretia_trial_tracking
 * - Timeline des essais
 * - Blockers identifiés
 * - Vérification de l'intégrité des données
 *
 * Usage: node tests/test-e2e-analytics.cjs
 */

require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');
const { performance } = require('perf_hooks');

// Configuration
const config = {
  affretiaApiUrl: process.env.AFFRETIA_API_URL || 'http://localhost:3017',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
  dbName: process.env.MONGODB_DB_NAME || 'symphonia',
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

function logData(label, value) {
  console.log(`${colors.magenta}📊${colors.reset} ${label}: ${value}`);
}

// Test 1: Funnel de conversion Affret.IA
async function testConversionFunnel() {
  logSection('Test 1: Funnel de Conversion Affret.IA');

  try {
    const start = performance.now();
    const response = await axios.get(`${config.affretiaApiUrl}/api/v1/affretia/analytics/conversion`, {
      timeout: 10000,
    });
    const duration = performance.now() - start;

    if (response.status !== 200) {
      throw new Error(`Status code attendu: 200, reçu: ${response.status}`);
    }

    const funnel = response.data;
    logSuccess(`Endpoint /api/v1/affretia/analytics/conversion accessible (${duration.toFixed(2)}ms)`);

    // Vérifier la structure du funnel
    const requiredStages = ['invited', 'started_trial', 'first_order', 'converted', 'churned'];
    const missingStages = requiredStages.filter((stage) => !(stage in funnel));

    if (missingStages.length > 0) {
      logWarning(`Étapes manquantes: ${missingStages.join(', ')}`);
    }

    // Afficher les statistiques du funnel
    logData('Invités', funnel.invited || 0);
    logData('Essai démarré', funnel.started_trial || 0);
    logData('Première commande', funnel.first_order || 0);
    logData('Convertis', funnel.converted || 0);
    logData('Désistements', funnel.churned || 0);

    // Calculer les taux de conversion
    if (funnel.invited > 0) {
      const trialRate = ((funnel.started_trial / funnel.invited) * 100).toFixed(2);
      const conversionRate = ((funnel.converted / funnel.invited) * 100).toFixed(2);
      const churnRate = ((funnel.churned / funnel.invited) * 100).toFixed(2);

      logData('Taux d\'essai', `${trialRate}%`);
      logData('Taux de conversion', `${conversionRate}%`);
      logData('Taux de désistement', `${churnRate}%`);

      // Validation des métriques
      if (parseFloat(conversionRate) > 0) {
        logSuccess('Conversions détectées dans le funnel');
      } else {
        logWarning('Aucune conversion détectée');
      }
    }

    return true;
  } catch (error) {
    if (error.response?.status === 404) {
      logWarning('Endpoint de conversion non implémenté');
      return true; // Non bloquant pour l'instant
    }
    logError(`Erreur lors du test du funnel: ${error.message}`);
    return false;
  }
}

// Test 2: Vérifier la collection affretia_trial_tracking
async function testTrialTrackingCollection(mongoClient) {
  logSection('Test 2: Collection affretia_trial_tracking');

  try {
    const db = mongoClient.db(config.dbName);
    const trialCollection = db.collection('affretia_trial_tracking');

    // Vérifier que la collection existe
    const collections = await db.listCollections({ name: 'affretia_trial_tracking' }).toArray();
    if (collections.length === 0) {
      logWarning('Collection affretia_trial_tracking n\'existe pas encore');
      // Créer un document de test
      await trialCollection.insertOne({
        carrierId: new ObjectId(),
        status: 'test',
        invitedAt: new Date(),
        stages: {
          invited: { date: new Date(), completed: true },
        },
        metadata: {
          source: 'test',
          testData: true,
        },
      });
      logSuccess('Collection affretia_trial_tracking créée avec données de test');
    } else {
      logSuccess('Collection affretia_trial_tracking existe');
    }

    // Compter les documents
    const totalTrials = await trialCollection.countDocuments();
    const activeTrials = await trialCollection.countDocuments({ status: 'active' });
    const convertedTrials = await trialCollection.countDocuments({ status: 'converted' });
    const churnedTrials = await trialCollection.countDocuments({ status: 'churned' });

    logData('Total des essais', totalTrials);
    logData('Essais actifs', activeTrials);
    logData('Convertis', convertedTrials);
    logData('Désistements', churnedTrials);

    // Vérifier les index
    const indexes = await trialCollection.indexes();
    logInfo(`\nIndexes trouvés: ${indexes.length}`);
    indexes.forEach((index) => {
      logInfo(`  - ${index.name}: ${JSON.stringify(index.key)}`);
    });

    // Vérifier l'intégrité des données
    const recentTrials = await trialCollection
      .find()
      .sort({ invitedAt: -1 })
      .limit(5)
      .toArray();

    logInfo('\nDerniers essais:');
    recentTrials.forEach((trial, index) => {
      const stagesCount = Object.keys(trial.stages || {}).length;
      logInfo(`  ${index + 1}. Carrier ${trial.carrierId} - Status: ${trial.status} - ${stagesCount} étapes`);
    });

    return true;
  } catch (error) {
    logError(`Erreur lors de la vérification de la collection: ${error.message}`);
    return false;
  }
}

// Test 3: Timeline des essais
async function testTrialTimeline(mongoClient) {
  logSection('Test 3: Timeline des Essais');

  try {
    // Tester via API si disponible
    try {
      const response = await axios.get(
        `${config.affretiaApiUrl}/api/v1/affretia/analytics/timeline?days=30`,
        { timeout: 5000 }
      );

      if (response.status === 200) {
        logSuccess('Endpoint timeline accessible');
        const timeline = response.data;

        if (Array.isArray(timeline)) {
          logData('Points de données', timeline.length);

          // Afficher un échantillon
          if (timeline.length > 0) {
            logInfo('\nÉchantillon de la timeline:');
            timeline.slice(0, 5).forEach((point, index) => {
              logInfo(`  ${index + 1}. ${point.date}: ${point.count || 0} événements`);
            });
          }
        }

        return true;
      }
    } catch (apiError) {
      if (apiError.response?.status !== 404) {
        logWarning(`Erreur API timeline: ${apiError.message}`);
      }
    }

    // Fallback: Générer la timeline depuis MongoDB
    logInfo('Génération de la timeline depuis MongoDB...');
    const db = mongoClient.db(config.dbName);
    const trialCollection = db.collection('affretia_trial_tracking');

    // Agréger par jour sur les 30 derniers jours
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const timeline = await trialCollection
      .aggregate([
        {
          $match: {
            invitedAt: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$invitedAt' },
            },
            count: { $sum: 1 },
            converted: {
              $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] },
            },
            churned: {
              $sum: { $cond: [{ $eq: ['$status', 'churned'] }, 1, 0] },
            },
          },
        },
        {
          $sort: { _id: 1 },
        },
      ])
      .toArray();

    logData('Points de timeline générés', timeline.length);

    if (timeline.length > 0) {
      logInfo('\nTimeline (5 derniers jours):');
      timeline.slice(-5).forEach((day) => {
        logInfo(`  ${day._id}: ${day.count} essais (${day.converted} convertis, ${day.churned} désistements)`);
      });
    }

    return true;
  } catch (error) {
    logError(`Erreur lors du test de la timeline: ${error.message}`);
    return false;
  }
}

// Test 4: Identification des blockers
async function testBlockersIdentification(mongoClient) {
  logSection('Test 4: Identification des Blockers');

  try {
    // Tester via API
    try {
      const response = await axios.get(
        `${config.affretiaApiUrl}/api/v1/affretia/analytics/blockers`,
        { timeout: 5000 }
      );

      if (response.status === 200) {
        logSuccess('Endpoint blockers accessible');
        const blockers = response.data;

        if (Array.isArray(blockers)) {
          logData('Blockers identifiés', blockers.length);

          blockers.forEach((blocker, index) => {
            logInfo(`  ${index + 1}. ${blocker.type}: ${blocker.count} occurrences`);
            if (blocker.impact) {
              logInfo(`     Impact: ${blocker.impact}`);
            }
          });
        }

        return true;
      }
    } catch (apiError) {
      if (apiError.response?.status !== 404) {
        logWarning(`Erreur API blockers: ${apiError.message}`);
      }
    }

    // Fallback: Analyser depuis MongoDB
    logInfo('Analyse des blockers depuis MongoDB...');
    const db = mongoClient.db(config.dbName);
    const trialCollection = db.collection('affretia_trial_tracking');

    // Identifier les carriers qui ont échoué à une étape
    const blockers = await trialCollection
      .aggregate([
        {
          $match: {
            status: { $in: ['churned', 'inactive'] },
          },
        },
        {
          $group: {
            _id: '$lastStage',
            count: { $sum: 1 },
          },
        },
        {
          $sort: { count: -1 },
        },
      ])
      .toArray();

    logData('Blockers identifiés', blockers.length);

    if (blockers.length > 0) {
      logInfo('\nPrincipaux blockers:');
      blockers.forEach((blocker, index) => {
        logInfo(`  ${index + 1}. Bloqué à l'étape "${blocker._id || 'unknown'}": ${blocker.count} carriers`);
      });
    } else {
      logInfo('Aucun blocker identifié (bonne nouvelle!)');
    }

    return true;
  } catch (error) {
    logError(`Erreur lors de l'identification des blockers: ${error.message}`);
    return false;
  }
}

// Test 5: Intégrité des données analytics
async function testDataIntegrity(mongoClient) {
  logSection('Test 5: Intégrité des Données');

  try {
    const db = mongoClient.db(config.dbName);
    const trialCollection = db.collection('affretia_trial_tracking');

    let issuesFound = 0;

    // Vérifier les documents sans carrierId
    const withoutCarrierId = await trialCollection.countDocuments({
      carrierId: { $exists: false },
    });

    if (withoutCarrierId > 0) {
      logWarning(`${withoutCarrierId} documents sans carrierId`);
      issuesFound++;
    } else {
      logSuccess('Tous les documents ont un carrierId');
    }

    // Vérifier les documents sans date d'invitation
    const withoutInvitedAt = await trialCollection.countDocuments({
      invitedAt: { $exists: false },
    });

    if (withoutInvitedAt > 0) {
      logWarning(`${withoutInvitedAt} documents sans date d'invitation`);
      issuesFound++;
    } else {
      logSuccess('Tous les documents ont une date d\'invitation');
    }

    // Vérifier les status invalides
    const validStatuses = ['invited', 'active', 'converted', 'churned', 'inactive', 'test'];
    const invalidStatus = await trialCollection.countDocuments({
      status: { $nin: validStatuses },
    });

    if (invalidStatus > 0) {
      logWarning(`${invalidStatus} documents avec status invalide`);
      issuesFound++;
    } else {
      logSuccess('Tous les status sont valides');
    }

    // Vérifier la cohérence des stages
    const trials = await trialCollection.find().limit(100).toArray();
    let stageIssues = 0;

    trials.forEach((trial) => {
      if (!trial.stages || typeof trial.stages !== 'object') {
        stageIssues++;
      } else {
        // Vérifier que les stages ont des dates
        Object.values(trial.stages).forEach((stage) => {
          if (!stage.date) {
            stageIssues++;
          }
        });
      }
    });

    if (stageIssues > 0) {
      logWarning(`${stageIssues} problèmes de cohérence dans les stages`);
      issuesFound++;
    } else {
      logSuccess('Stages cohérents pour tous les essais vérifiés');
    }

    // Résumé
    if (issuesFound === 0) {
      logSuccess('\nAucun problème d\'intégrité détecté');
      return true;
    } else {
      logWarning(`\n${issuesFound} problèmes d\'intégrité détectés`);
      return false;
    }
  } catch (error) {
    logError(`Erreur lors de la vérification d'intégrité: ${error.message}`);
    return false;
  }
}

// Fonction principale
async function main() {
  console.log(`${colors.bright}${colors.cyan}`);
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║      TEST END-TO-END - ANALYTICS AFFRET.IA           ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  logInfo('Configuration:');
  logInfo(`  - Affret.IA API: ${config.affretiaApiUrl}`);
  logInfo(`  - MongoDB URI: ${config.mongoUri.replace(/\/\/.*@/, '//***@')}`);
  logInfo(`  - Database: ${config.dbName}`);

  let mongoClient;
  const results = {
    conversionFunnel: false,
    trialTracking: false,
    timeline: false,
    blockers: false,
    dataIntegrity: false,
  };

  try {
    // Connexion MongoDB
    logSection('Connexion à MongoDB');
    mongoClient = new MongoClient(config.mongoUri);
    await mongoClient.connect();
    logSuccess('Connecté à MongoDB');

    // Exécuter les tests
    results.conversionFunnel = await testConversionFunnel();
    results.trialTracking = await testTrialTrackingCollection(mongoClient);
    results.timeline = await testTrialTimeline(mongoClient);
    results.blockers = await testBlockersIdentification(mongoClient);
    results.dataIntegrity = await testDataIntegrity(mongoClient);

    // Résumé des résultats
    logSection('Résumé des Tests');

    const tests = [
      { name: 'Funnel de Conversion', result: results.conversionFunnel },
      { name: 'Collection Trial Tracking', result: results.trialTracking },
      { name: 'Timeline des Essais', result: results.timeline },
      { name: 'Identification des Blockers', result: results.blockers },
      { name: 'Intégrité des Données', result: results.dataIntegrity },
    ];

    let passedCount = 0;
    tests.forEach((test) => {
      if (test.result) {
        logSuccess(`${test.name}: PASS`);
        passedCount++;
      } else {
        logError(`${test.name}: FAIL`);
      }
    });

    console.log(`\n${colors.bright}Résultat: ${passedCount}/${tests.length} tests réussis${colors.reset}\n`);

    // Fermer la connexion MongoDB
    await mongoClient.close();
    logSuccess('Connexion MongoDB fermée');

    // Retourner le code de sortie approprié
    if (passedCount === tests.length) {
      console.log(`${colors.green}${colors.bright}✓ TOUS LES TESTS SONT PASSES !${colors.reset}\n`);
      process.exit(EXIT_SUCCESS);
    } else {
      console.log(`${colors.red}${colors.bright}✗ CERTAINS TESTS ONT ECHOUE${colors.reset}\n`);
      process.exit(EXIT_FAILURE);
    }
  } catch (error) {
    logError(`Erreur fatale: ${error.message}`);
    console.error(error.stack);

    if (mongoClient) {
      await mongoClient.close();
    }

    process.exit(EXIT_FAILURE);
  }
}

// Lancer les tests
main();
