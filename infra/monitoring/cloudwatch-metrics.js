/**
 * Module de métriques personnalisées CloudWatch pour SYMPHONI.A
 *
 * Ce module permet d'envoyer des métriques personnalisées à CloudWatch
 * pour un monitoring détaillé des services TMS Sync et Affret.IA
 */

const { CloudWatchClient, PutMetricDataCommand } = require("@aws-sdk/client-cloudwatch");

class CloudWatchMetrics {
  constructor(options = {}) {
    this.region = options.region || process.env.AWS_REGION || 'eu-central-1';
    this.namespace = options.namespace || 'SYMPHONIA';
    this.client = new CloudWatchClient({ region: this.region });
    this.enabled = options.enabled !== false; // Activé par défaut
    this.bufferSize = options.bufferSize || 20; // Nombre max de métriques avant envoi
    this.flushInterval = options.flushInterval || 60000; // 60 secondes
    this.buffer = [];

    // Démarrer le flush automatique si activé
    if (this.enabled && this.flushInterval > 0) {
      this.startAutoFlush();
    }
  }

  /**
   * Démarre l'envoi automatique périodique des métriques
   */
  startAutoFlush() {
    this.flushTimer = setInterval(() => {
      this.flush().catch(err => {
        console.error('Error flushing metrics:', err);
      });
    }, this.flushInterval);
  }

  /**
   * Arrête l'envoi automatique des métriques
   */
  stopAutoFlush() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Envoie une métrique à CloudWatch
   *
   * @param {string} metricName - Nom de la métrique
   * @param {number} value - Valeur de la métrique
   * @param {string} unit - Unité (Count, Seconds, Milliseconds, Bytes, etc.)
   * @param {Object} dimensions - Dimensions additionnelles
   * @param {Date} timestamp - Timestamp (par défaut: maintenant)
   */
  async sendMetric(metricName, value, unit = 'Count', dimensions = {}, timestamp = null) {
    if (!this.enabled) {
      return;
    }

    const metricData = {
      MetricName: metricName,
      Value: value,
      Unit: unit,
      Timestamp: timestamp || new Date(),
      Dimensions: Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value }))
    };

    // Ajouter au buffer
    this.buffer.push(metricData);

    // Flush si le buffer est plein
    if (this.buffer.length >= this.bufferSize) {
      await this.flush();
    }
  }

  /**
   * Envoie toutes les métriques en buffer à CloudWatch
   */
  async flush() {
    if (this.buffer.length === 0) {
      return;
    }

    const metricsToSend = [...this.buffer];
    this.buffer = [];

    // CloudWatch accepte max 1000 métriques par requête, on divise si nécessaire
    const batchSize = 1000;
    for (let i = 0; i < metricsToSend.length; i += batchSize) {
      const batch = metricsToSend.slice(i, i + batchSize);

      const params = {
        Namespace: this.namespace,
        MetricData: batch
      };

      try {
        await this.client.send(new PutMetricDataCommand(params));
      } catch (error) {
        console.error('Failed to send metrics to CloudWatch:', error);
        // Remettre les métriques dans le buffer en cas d'erreur
        this.buffer.push(...batch);
        throw error;
      }
    }
  }

  /**
   * Envoie une métrique de compteur (incrémente)
   */
  async incrementCounter(metricName, dimensions = {}) {
    return this.sendMetric(metricName, 1, 'Count', dimensions);
  }

  /**
   * Envoie une métrique de durée en millisecondes
   */
  async recordDuration(metricName, durationMs, dimensions = {}) {
    return this.sendMetric(metricName, durationMs, 'Milliseconds', dimensions);
  }

  /**
   * Envoie une métrique de taille en bytes
   */
  async recordSize(metricName, sizeBytes, dimensions = {}) {
    return this.sendMetric(metricName, sizeBytes, 'Bytes', dimensions);
  }

  /**
   * Wrapper pour mesurer automatiquement le temps d'exécution d'une fonction
   */
  async measureExecutionTime(metricName, fn, dimensions = {}) {
    const startTime = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      await this.recordDuration(metricName, duration, dimensions);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.recordDuration(metricName, duration, { ...dimensions, Status: 'Error' });
      throw error;
    }
  }

  /**
   * Nettoie les ressources
   */
  async dispose() {
    this.stopAutoFlush();
    await this.flush();
  }
}

// Instances prédéfinies pour TMS Sync et Affret.IA
class TMSSyncMetrics extends CloudWatchMetrics {
  constructor(options = {}) {
    super({ ...options, namespace: 'SYMPHONIA' });
  }

  async recordSyncSuccess(duration, itemCount = 0) {
    await this.incrementCounter('TMS-Sync-Success');
    await this.recordDuration('TMS-Sync-Duration', duration);
    if (itemCount > 0) {
      await this.sendMetric('TMS-Sync-Items', itemCount, 'Count');
    }
  }

  async recordSyncFailure(duration, errorType = 'Unknown') {
    await this.incrementCounter('TMS-Sync-Failure', { ErrorType: errorType });
    await this.recordDuration('TMS-Sync-Duration', duration, { Status: 'Failed' });
  }

  async recordAPICall(endpoint, duration, statusCode) {
    await this.incrementCounter('TMS-Sync-API-Calls', { Endpoint: endpoint });
    await this.recordDuration('TMS-Sync-API-Duration', duration, {
      Endpoint: endpoint,
      StatusCode: statusCode.toString()
    });
  }
}

class AffretIAMetrics extends CloudWatchMetrics {
  constructor(options = {}) {
    super({ ...options, namespace: 'SYMPHONIA' });
  }

  async recordAIRequest(processingTime, success = true) {
    await this.incrementCounter('Affret-IA-Requests');
    if (success) {
      await this.incrementCounter('Affret-IA-Success');
    } else {
      await this.incrementCounter('Affret-IA-Errors');
    }
    await this.recordDuration('Affret-IA-Processing-Time', processingTime);
  }

  async recordMatchingResult(matchCount, processingTime) {
    await this.sendMetric('Affret-IA-Match-Count', matchCount, 'Count');
    await this.recordDuration('Affret-IA-Matching-Duration', processingTime);
  }

  async recordEmailSent(recipientCount, success = true) {
    const metricSuffix = success ? 'Success' : 'Failure';
    await this.incrementCounter(`Affret-IA-Email-${metricSuffix}`);
    await this.sendMetric('Affret-IA-Email-Recipients', recipientCount, 'Count');
  }

  async recordAIProviderCall(provider, duration, success = true) {
    await this.incrementCounter('Affret-IA-Provider-Calls', { Provider: provider });
    await this.recordDuration('Affret-IA-Provider-Duration', duration, {
      Provider: provider,
      Status: success ? 'Success' : 'Error'
    });
  }
}

// Middleware Express pour enregistrer automatiquement les métriques de requêtes HTTP
function createMetricsMiddleware(serviceName, metricsInstance = null) {
  const metrics = metricsInstance || new CloudWatchMetrics();

  return (req, res, next) => {
    const startTime = Date.now();

    // Hook dans la fin de la réponse
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;

      // Envoyer les métriques de manière asynchrone sans bloquer la réponse
      metrics.sendMetric(
        `${serviceName}-Request-Duration`,
        duration,
        'Milliseconds',
        {
          Method: req.method,
          Path: req.route?.path || req.path,
          StatusCode: statusCode.toString()
        }
      ).catch(err => console.error('Failed to send request metrics:', err));

      // Compter les requêtes par statut
      if (statusCode >= 500) {
        metrics.incrementCounter(`${serviceName}-5xx-Errors`, {
          Path: req.route?.path || req.path
        }).catch(err => console.error('Failed to send error metric:', err));
      } else if (statusCode >= 400) {
        metrics.incrementCounter(`${serviceName}-4xx-Errors`, {
          Path: req.route?.path || req.path
        }).catch(err => console.error('Failed to send error metric:', err));
      }

      return originalSend.call(this, data);
    };

    next();
  };
}

module.exports = {
  CloudWatchMetrics,
  TMSSyncMetrics,
  AffretIAMetrics,
  createMetricsMiddleware
};
