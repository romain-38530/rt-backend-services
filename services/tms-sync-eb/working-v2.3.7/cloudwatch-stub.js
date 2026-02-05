/**
 * Stub CloudWatch Metrics - Désactivé temporairement pour le déploiement
 * Les métriques seront réactivées dans une prochaine version
 */

class TMSSyncMetrics {
  constructor(config = {}) {
    this.enabled = false;
    console.log('[METRICS] CloudWatch metrics disabled (stub mode)');
  }

  async recordSyncSuccess(duration, count) {
    // No-op
  }

  async recordSyncFailure(duration, errorCode) {
    // No-op
  }

  async recordMetric(namespace, metricName, value, unit = 'None') {
    // No-op
  }
}

class CloudWatchMetrics {
  constructor(config = {}) {
    this.enabled = false;
  }

  async putMetric(name, value, unit = 'None', dimensions = []) {
    // No-op
  }
}

class AffretIAMetrics extends CloudWatchMetrics {
  async recordTrialActivation(carrierId) {
    // No-op
  }

  async recordUpgrade(carrierId) {
    // No-op
  }
}

module.exports = {
  CloudWatchMetrics,
  TMSSyncMetrics,
  AffretIAMetrics
};
