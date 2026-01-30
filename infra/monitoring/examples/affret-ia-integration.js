/**
 * Exemple d'intégration du module de métriques dans Affret.IA
 *
 * Copiez ce code dans votre service Affret.IA pour activer le monitoring
 */

const { AffretIAMetrics, createMetricsMiddleware } = require('../cloudwatch-metrics');

// Initialiser les métriques Affret.IA
const metrics = new AffretIAMetrics({
  enabled: process.env.NODE_ENV === 'production', // Activer seulement en production
  bufferSize: 20,
  flushInterval: 60000 // Flush toutes les 60 secondes
});

// Si vous utilisez Express, ajoutez le middleware
// app.use(createMetricsMiddleware('Affret-IA', metrics));

// Exemple 1: Enregistrer une requête IA
async function processAIRequest(requestData) {
  const startTime = Date.now();

  try {
    // Votre code de traitement IA ici
    const result = await analyzeFreightRequest(requestData);

    const processingTime = Date.now() - startTime;

    // Enregistrer le succès
    await metrics.recordAIRequest(processingTime, true);

    console.log(`AI request processed successfully in ${processingTime}ms`);
    return result;

  } catch (error) {
    const processingTime = Date.now() - startTime;

    // Enregistrer l'échec
    await metrics.recordAIRequest(processingTime, false);

    console.error(`AI request failed after ${processingTime}ms:`, error);
    throw error;
  }
}

// Exemple 2: Enregistrer un résultat de matching
async function matchCarriers(freightRequest) {
  const startTime = Date.now();

  try {
    // Votre algorithme de matching
    const matches = await findMatchingCarriers(freightRequest);

    const processingTime = Date.now() - startTime;
    const matchCount = matches.length;

    // Enregistrer les résultats
    await metrics.recordMatchingResult(matchCount, processingTime);

    console.log(`Found ${matchCount} matches in ${processingTime}ms`);
    return matches;

  } catch (error) {
    const processingTime = Date.now() - startTime;

    // Enregistrer l'échec avec 0 matches
    await metrics.recordMatchingResult(0, processingTime);

    throw error;
  }
}

// Exemple 3: Enregistrer l'envoi d'un email
async function sendMatchingEmail(matches, recipients) {
  try {
    // Envoyer l'email via SES
    await sendEmailViaSES({
      to: recipients,
      subject: 'Nouveaux transporteurs disponibles',
      body: formatMatchingEmail(matches)
    });

    // Enregistrer le succès
    await metrics.recordEmailSent(recipients.length, true);

    console.log(`Email sent successfully to ${recipients.length} recipients`);

  } catch (error) {
    // Enregistrer l'échec
    await metrics.recordEmailSent(recipients.length, false);

    console.error('Failed to send email:', error);
    throw error;
  }
}

// Exemple 4: Enregistrer un appel au fournisseur IA (OpenAI, Anthropic, etc.)
async function callAIProvider(provider, prompt) {
  const startTime = Date.now();

  try {
    let response;

    switch (provider) {
      case 'openai':
        response = await callOpenAI(prompt);
        break;
      case 'anthropic':
        response = await callAnthropic(prompt);
        break;
      default:
        throw new Error(`Unknown AI provider: ${provider}`);
    }

    const duration = Date.now() - startTime;

    // Enregistrer le succès
    await metrics.recordAIProviderCall(provider, duration, true);

    console.log(`AI provider ${provider} responded in ${duration}ms`);
    return response;

  } catch (error) {
    const duration = Date.now() - startTime;

    // Enregistrer l'échec
    await metrics.recordAIProviderCall(provider, duration, false);

    console.error(`AI provider ${provider} failed after ${duration}ms:`, error);
    throw error;
  }
}

// Exemple 5: Pipeline complet de traitement
async function processFreightRequest(requestData) {
  console.log('Processing freight request...');

  try {
    // 1. Analyser la demande avec l'IA
    const aiAnalysis = await callAIProvider('openai', {
      role: 'analyze_freight_request',
      data: requestData
    });

    // 2. Traiter la requête
    const processedRequest = await processAIRequest({
      ...requestData,
      aiAnalysis
    });

    // 3. Trouver des transporteurs correspondants
    const matches = await matchCarriers(processedRequest);

    // 4. Envoyer les résultats par email
    if (matches.length > 0) {
      await sendMatchingEmail(matches, [requestData.contactEmail]);
    }

    // Incrémenter un compteur global de succès
    await metrics.incrementCounter('Affret-IA-Pipeline-Success');

    return {
      success: true,
      matches: matches.length,
      analysis: aiAnalysis
    };

  } catch (error) {
    // Incrémenter un compteur global d'échec
    await metrics.incrementCounter('Affret-IA-Pipeline-Failed', {
      ErrorType: error.code || error.name || 'Unknown'
    });

    throw error;
  }
}

// Exemple 6: Enregistrer des métriques personnalisées
async function recordCustomMetrics() {
  // Nombre de demandes en attente
  const pendingRequests = await getPendingRequestsCount();
  await metrics.sendMetric('Affret-IA-Pending-Requests', pendingRequests, 'Count');

  // Taux de réussite du matching
  const matchingRate = await getMatchingSuccessRate();
  await metrics.sendMetric('Affret-IA-Matching-Rate', matchingRate, 'Percent');

  // Temps moyen de réponse IA
  const avgResponseTime = await getAverageAIResponseTime();
  await metrics.sendMetric('Affret-IA-Avg-Response-Time', avgResponseTime, 'Milliseconds');
}

// Exemple 7: Job périodique de métriques
function startMetricsJob() {
  // Enregistrer les métriques personnalisées toutes les 5 minutes
  setInterval(async () => {
    try {
      await recordCustomMetrics();
    } catch (error) {
      console.error('Failed to record custom metrics:', error);
    }
  }, 5 * 60 * 1000);
}

// Nettoyer à l'arrêt de l'application
process.on('SIGTERM', async () => {
  console.log('Flushing metrics before shutdown...');
  await metrics.dispose();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Flushing metrics before shutdown...');
  await metrics.dispose();
  process.exit(0);
});

module.exports = {
  metrics,
  processAIRequest,
  matchCarriers,
  sendMatchingEmail,
  callAIProvider,
  processFreightRequest,
  recordCustomMetrics,
  startMetricsJob
};
