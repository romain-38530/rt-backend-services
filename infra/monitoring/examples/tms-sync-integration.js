/**
 * Exemple d'intégration du module de métriques dans TMS Sync
 *
 * Copiez ce code dans votre service TMS Sync pour activer le monitoring
 */

const { TMSSyncMetrics, createMetricsMiddleware } = require('../cloudwatch-metrics');

// Initialiser les métriques TMS Sync
const metrics = new TMSSyncMetrics({
  enabled: process.env.NODE_ENV === 'production', // Activer seulement en production
  bufferSize: 20,
  flushInterval: 60000 // Flush toutes les 60 secondes
});

// Si vous utilisez Express, ajoutez le middleware
// app.use(createMetricsMiddleware('TMS-Sync', metrics));

// Exemple 1: Enregistrer une synchronisation réussie
async function performSync() {
  const startTime = Date.now();

  try {
    // Votre code de synchronisation ici
    const result = await syncDataFromSymphonia();

    const duration = Date.now() - startTime;
    const itemCount = result.items?.length || 0;

    // Enregistrer le succès
    await metrics.recordSyncSuccess(duration, itemCount);

    console.log(`Sync completed successfully in ${duration}ms, ${itemCount} items synced`);
    return result;

  } catch (error) {
    const duration = Date.now() - startTime;

    // Enregistrer l'échec avec le type d'erreur
    const errorType = error.code || error.name || 'Unknown';
    await metrics.recordSyncFailure(duration, errorType);

    console.error(`Sync failed after ${duration}ms:`, error);
    throw error;
  }
}

// Exemple 2: Enregistrer un appel API
async function callSymphoniaAPI(endpoint, data) {
  const startTime = Date.now();

  try {
    const response = await fetch(`https://api.symphonia.com${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const duration = Date.now() - startTime;

    // Enregistrer l'appel API
    await metrics.recordAPICall(endpoint, duration, response.status);

    return await response.json();

  } catch (error) {
    const duration = Date.now() - startTime;

    // Enregistrer l'erreur (statusCode 0 pour timeout/erreur réseau)
    await metrics.recordAPICall(endpoint, duration, 0);

    throw error;
  }
}

// Exemple 3: Utiliser measureExecutionTime pour mesurer automatiquement
async function processData() {
  return metrics.measureExecutionTime(
    'TMS-Sync-Processing',
    async () => {
      // Votre code de traitement ici
      const result = await heavyDataProcessing();
      return result;
    },
    { Operation: 'DataProcessing' }
  );
}

// Exemple 4: Job de synchronisation complet
async function syncJob() {
  console.log('Starting TMS Sync job...');

  try {
    // 1. Récupérer les données de Symphonia
    const symphoniaData = await callSymphoniaAPI('/tms/orders', {
      since: new Date(Date.now() - 3600000) // Dernière heure
    });

    // 2. Traiter les données
    const processedData = await processData(symphoniaData);

    // 3. Enregistrer la synchronisation
    await performSync(processedData);

    // Incrémenter un compteur global
    await metrics.incrementCounter('TMS-Sync-Job-Completed');

  } catch (error) {
    await metrics.incrementCounter('TMS-Sync-Job-Failed', {
      ErrorType: error.code || 'Unknown'
    });

    throw error;
  }
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
  performSync,
  callSymphoniaAPI,
  processData,
  syncJob
};
