#!/usr/bin/env node
// ============================================================================
// RT SYMPHONI.A - Alertes de Dépassement de Budget
// ============================================================================
// Version: 1.0.0
// Date: 2025-11-26
// Description: Surveille les coûts des services externes et envoie des
//              alertes par email/webhook en cas de dépassement de budget
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  budgets: {
    monthly: 70.0, // Budget mensuel total en EUR
    tomtom: 0.0, // Free Tier
    aws_textract: 46.0,
    google_vision: 1.50
  },
  thresholds: {
    warning: 0.75, // 75%
    critical: 0.9, // 90%
    exceeded: 1.0 // 100%
  },
  pricing: {
    tomtom: {
      free_tier: 75000,
      pay_as_you_go: 0.0007 // EUR per request
    },
    aws_textract: {
      detect_text: 1.50 / 1000, // EUR per page
      analyze_document: 15.0 / 1000 // EUR per page
    },
    google_vision: {
      free_tier: 1000,
      document_text_detection: 1.50 / 1000 // EUR per page
    }
  },
  alertsFile: path.join(__dirname, '..', '.budget-alerts.json'),
  usageFile: path.join(__dirname, '..', '.quota-usage.json'),
  webhookURL: process.env.BUDGET_ALERT_WEBHOOK || null,
  emailConfig: {
    enabled: false,
    from: 'alerts@rt-symphonia.com',
    to: 'admin@rt-symphonia.com'
  }
};

// Couleurs
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m'
};

// ============================================================================
// Utilitaires
// ============================================================================

const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ️  ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  header: (msg) => {
    console.log(`\n${colors.bright}${colors.cyan}${msg}${colors.reset}`);
    console.log(colors.cyan + '═'.repeat(msg.length) + colors.reset);
  }
};

function formatCurrency(amount) {
  return amount.toFixed(2) + '€';
}

function formatPercent(value) {
  return (value * 100).toFixed(1) + '%';
}

// ============================================================================
// Calculateur de Coûts
// ============================================================================

class CostCalculator {
  constructor() {
    this.usage = this.loadUsage();
  }

  loadUsage() {
    try {
      if (fs.existsSync(CONFIG.usageFile)) {
        const data = fs.readFileSync(CONFIG.usageFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      log.warning('Impossible de charger l\'usage');
    }

    return {
      tomtom: { monthly: 0 },
      aws_textract: { monthly: 0 },
      google_vision: { monthly: 0 }
    };
  }

  calculateTomTomCost() {
    const monthlyRequests = this.usage.tomtom?.monthly || 0;

    if (monthlyRequests <= CONFIG.pricing.tomtom.free_tier) {
      return {
        cost: 0,
        freeRequests: monthlyRequests,
        paidRequests: 0,
        inFreeTier: true
      };
    }

    const paidRequests = monthlyRequests - CONFIG.pricing.tomtom.free_tier;
    const cost = paidRequests * CONFIG.pricing.tomtom.pay_as_you_go;

    return {
      cost,
      freeRequests: CONFIG.pricing.tomtom.free_tier,
      paidRequests,
      inFreeTier: false
    };
  }

  calculateAWSTextractCost() {
    const monthlyPages = this.usage.aws_textract?.monthly || 0;

    // Hypothèse: 70% DetectDocumentText, 30% AnalyzeDocument
    const detectPages = monthlyPages * 0.7;
    const analyzePages = monthlyPages * 0.3;

    const detectCost = detectPages * CONFIG.pricing.aws_textract.detect_text;
    const analyzeCost = analyzePages * CONFIG.pricing.aws_textract.analyze_document;
    const totalCost = detectCost + analyzeCost;

    return {
      cost: totalCost,
      pages: monthlyPages,
      breakdown: {
        detectDocumentText: { pages: detectPages, cost: detectCost },
        analyzeDocument: { pages: analyzePages, cost: analyzeCost }
      }
    };
  }

  calculateGoogleVisionCost() {
    const monthlyPages = this.usage.google_vision?.monthly || 0;

    if (monthlyPages <= CONFIG.pricing.google_vision.free_tier) {
      return {
        cost: 0,
        freePages: monthlyPages,
        paidPages: 0,
        inFreeTier: true
      };
    }

    const paidPages = monthlyPages - CONFIG.pricing.google_vision.free_tier;
    const cost = paidPages * CONFIG.pricing.google_vision.document_text_detection;

    return {
      cost,
      freePages: CONFIG.pricing.google_vision.free_tier,
      paidPages,
      inFreeTier: false
    };
  }

  calculateTotalCost() {
    const tomtom = this.calculateTomTomCost();
    const aws = this.calculateAWSTextractCost();
    const google = this.calculateGoogleVisionCost();

    const total = tomtom.cost + aws.cost + google.cost;

    return {
      total,
      breakdown: { tomtom, aws, google }
    };
  }
}

// ============================================================================
// Gestionnaire d'Alertes
// ============================================================================

class BudgetAlertManager {
  constructor() {
    this.alerts = this.load();
  }

  load() {
    try {
      if (fs.existsSync(CONFIG.alertsFile)) {
        const data = fs.readFileSync(CONFIG.alertsFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      return [];
    }
    return [];
  }

  save() {
    try {
      fs.writeFileSync(CONFIG.alertsFile, JSON.stringify(this.alerts, null, 2));
    } catch (error) {
      log.error('Impossible de sauvegarder les alertes: ' + error.message);
    }
  }

  addAlert(level, service, message, cost, budget) {
    const alert = {
      level,
      service,
      message,
      cost,
      budget,
      percent: (cost / budget) * 100,
      timestamp: new Date().toISOString()
    };

    this.alerts.push(alert);
    this.save();

    return alert;
  }

  hasRecentAlert(service, level, hours = 24) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);

    return this.alerts.some(
      (alert) =>
        alert.service === service &&
        alert.level === level &&
        new Date(alert.timestamp) > cutoff
    );
  }

  getRecentAlerts(hours = 24) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);

    return this.alerts.filter((alert) => new Date(alert.timestamp) > cutoff);
  }
}

// ============================================================================
// Vérificateur de Budget
// ============================================================================

class BudgetChecker {
  constructor() {
    this.calculator = new CostCalculator();
    this.alertManager = new BudgetAlertManager();
  }

  check() {
    log.header('Vérification du Budget');

    const costs = this.calculator.calculateTotalCost();

    // Budget global
    this.checkGlobalBudget(costs);

    // Budgets par service
    this.checkServiceBudget('tomtom', costs.breakdown.tomtom.cost, CONFIG.budgets.tomtom);
    this.checkServiceBudget('aws_textract', costs.breakdown.aws.cost, CONFIG.budgets.aws_textract);
    this.checkServiceBudget('google_vision', costs.breakdown.google.cost, CONFIG.budgets.google_vision);

    return costs;
  }

  checkGlobalBudget(costs) {
    const total = costs.total;
    const budget = CONFIG.budgets.monthly;
    const percent = total / budget;

    console.log(`\n${colors.bright}Budget Global:${colors.reset}`);
    console.log(`  Coût actuel:   ${formatCurrency(total)}`);
    console.log(`  Budget:        ${formatCurrency(budget)}`);
    console.log(`  Utilisation:   ${formatPercent(percent)}`);

    this.displayProgressBar(percent);

    if (percent >= CONFIG.thresholds.exceeded) {
      log.error('Budget DÉPASSÉ !');
      this.sendAlert('critical', 'global', 'Budget mensuel dépassé', total, budget);
    } else if (percent >= CONFIG.thresholds.critical) {
      log.warning(`Budget critique (${formatPercent(percent)})`);
      this.sendAlert('critical', 'global', `Budget à ${formatPercent(percent)}`, total, budget);
    } else if (percent >= CONFIG.thresholds.warning) {
      log.warning(`Budget élevé (${formatPercent(percent)})`);
      this.sendAlert('warning', 'global', `Budget à ${formatPercent(percent)}`, total, budget);
    } else {
      log.success('Budget OK');
    }
  }

  checkServiceBudget(service, cost, budget) {
    const percent = budget > 0 ? cost / budget : 0;

    console.log(`\n${colors.bright}${service.toUpperCase()}:${colors.reset}`);
    console.log(`  Coût actuel:   ${formatCurrency(cost)}`);
    console.log(`  Budget:        ${formatCurrency(budget)}`);
    console.log(`  Utilisation:   ${formatPercent(percent)}`);

    if (budget > 0) {
      this.displayProgressBar(percent);
    }

    if (percent >= CONFIG.thresholds.exceeded) {
      log.error(`Budget ${service} DÉPASSÉ !`);
      this.sendAlert('critical', service, `Budget ${service} dépassé`, cost, budget);
    } else if (percent >= CONFIG.thresholds.critical) {
      log.warning(`Budget ${service} critique (${formatPercent(percent)})`);
      this.sendAlert('warning', service, `Budget ${service} à ${formatPercent(percent)}`, cost, budget);
    } else if (percent >= CONFIG.thresholds.warning) {
      log.info(`Budget ${service} élevé (${formatPercent(percent)})`);
    } else {
      log.success(`Budget ${service} OK`);
    }
  }

  displayProgressBar(percent) {
    const width = 50;
    const filled = Math.min(Math.round(percent * width), width);
    const empty = Math.max(width - filled, 0);

    let color = colors.green;
    if (percent >= CONFIG.thresholds.exceeded) color = colors.red;
    else if (percent >= CONFIG.thresholds.critical) color = colors.red;
    else if (percent >= CONFIG.thresholds.warning) color = colors.yellow;

    const bar = color + '█'.repeat(filled) + colors.reset + '░'.repeat(empty);
    console.log(`  [${bar}] ${formatPercent(percent)}`);
  }

  sendAlert(level, service, message, cost, budget) {
    // Éviter les alertes en double
    if (this.alertManager.hasRecentAlert(service, level, 24)) {
      log.info(`Alerte déjà envoyée pour ${service} (${level})`);
      return;
    }

    const alert = this.alertManager.addAlert(level, service, message, cost, budget);

    // Envoyer par webhook
    if (CONFIG.webhookURL) {
      this.sendWebhook(alert);
    }

    // Envoyer par email
    if (CONFIG.emailConfig.enabled) {
      this.sendEmail(alert);
    }
  }

  sendWebhook(alert) {
    log.info('Envoi webhook...');

    const payload = JSON.stringify({
      level: alert.level,
      service: alert.service,
      message: alert.message,
      cost: formatCurrency(alert.cost),
      budget: formatCurrency(alert.budget),
      percent: formatPercent(alert.percent / 100),
      timestamp: alert.timestamp
    });

    const url = new URL(CONFIG.webhookURL);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 200) {
        log.success('Webhook envoyé');
      } else {
        log.error(`Webhook échoué: HTTP ${res.statusCode}`);
      }
    });

    req.on('error', (error) => {
      log.error('Erreur webhook: ' + error.message);
    });

    req.write(payload);
    req.end();
  }

  sendEmail(alert) {
    log.info('Envoi email...');
    // TODO: Implémenter l'envoi d'email (nodemailer, SES, etc.)
    log.warning('Email non implémenté - utilisez un webhook');
  }
}

// ============================================================================
// Générateur de Rapport
// ============================================================================

class BudgetReport {
  constructor(costs) {
    this.costs = costs;
  }

  display() {
    log.header('Rapport Détaillé des Coûts');

    // TomTom
    const tomtom = this.costs.breakdown.tomtom;
    console.log(`\n${colors.bright}TomTom Telematics API:${colors.reset}`);
    console.log(`  Requêtes gratuites: ${tomtom.freeRequests}`);
    console.log(`  Requêtes payantes:  ${tomtom.paidRequests}`);
    console.log(`  Coût:               ${formatCurrency(tomtom.cost)}`);
    console.log(`  Statut:             ${tomtom.inFreeTier ? 'Free Tier' : 'Payant'}`);

    // AWS Textract
    const aws = this.costs.breakdown.aws;
    console.log(`\n${colors.bright}AWS Textract:${colors.reset}`);
    console.log(`  Pages totales:      ${aws.pages}`);
    console.log(`  DetectDocumentText: ${aws.breakdown.detectDocumentText.pages.toFixed(0)} pages → ${formatCurrency(aws.breakdown.detectDocumentText.cost)}`);
    console.log(`  AnalyzeDocument:    ${aws.breakdown.analyzeDocument.pages.toFixed(0)} pages → ${formatCurrency(aws.breakdown.analyzeDocument.cost)}`);
    console.log(`  Coût total:         ${formatCurrency(aws.cost)}`);

    // Google Vision
    const google = this.costs.breakdown.google;
    console.log(`\n${colors.bright}Google Vision API:${colors.reset}`);
    console.log(`  Pages gratuites:    ${google.freePages}`);
    console.log(`  Pages payantes:     ${google.paidPages}`);
    console.log(`  Coût:               ${formatCurrency(google.cost)}`);
    console.log(`  Statut:             ${google.inFreeTier ? 'Free Tier' : 'Payant'}`);

    // Total
    console.log(`\n${colors.bright}TOTAL:${colors.reset}`);
    console.log(`  Coût mensuel:       ${formatCurrency(this.costs.total)}`);
    console.log(`  Budget:             ${formatCurrency(CONFIG.budgets.monthly)}`);
    console.log(`  Économies:          ${formatCurrency(CONFIG.budgets.monthly - this.costs.total)}`);
  }

  generateRecommendations() {
    log.header('Recommandations d\'Optimisation');

    const costs = this.costs;
    const recommendations = [];

    // TomTom
    if (costs.breakdown.tomtom.paidRequests > 0) {
      recommendations.push('TomTom: Vous avez dépassé le Free Tier. Optimisez les appels API ou activez le cache.');
    }

    // AWS Textract
    const awsPercent = costs.breakdown.aws.cost / CONFIG.budgets.aws_textract;
    if (awsPercent > 0.8) {
      recommendations.push('AWS Textract: Utilisation élevée. Considérez:');
      recommendations.push('  - Améliorer la qualité des images pour réduire les erreurs');
      recommendations.push('  - Utiliser Google Vision en fallback plus souvent');
      recommendations.push('  - Activer le cache Redis pour éviter les appels redondants');
    }

    // Google Vision
    if (!costs.breakdown.google.inFreeTier) {
      recommendations.push('Google Vision: Free Tier épuisé. C\'est normal en fallback.');
    }

    // Général
    if (costs.total > CONFIG.budgets.monthly * 0.9) {
      recommendations.push('Budget Global: Critique ! Actions immédiates:');
      recommendations.push('  - Analyser les logs pour identifier les appels excessifs');
      recommendations.push('  - Implémenter un rate limiter');
      recommendations.push('  - Augmenter le budget ou optimiser l\'usage');
    }

    if (recommendations.length > 0) {
      recommendations.forEach((rec) => {
        console.log(`  ${colors.yellow}•${colors.reset} ${rec}`);
      });
    } else {
      log.success('Aucune optimisation nécessaire');
    }
  }

  exportJSON(filename) {
    const data = {
      timestamp: new Date().toISOString(),
      costs: this.costs,
      budget: CONFIG.budgets,
      alerts: new BudgetAlertManager().getRecentAlerts(24)
    };

    try {
      fs.writeFileSync(filename, JSON.stringify(data, null, 2));
      log.success(`Rapport exporté: ${filename}`);
    } catch (error) {
      log.error('Erreur d\'exportation: ' + error.message);
    }
  }
}

// ============================================================================
// Application Principale
// ============================================================================

async function main() {
  console.log(colors.bright + colors.cyan + '\n╔══════════════════════════════════════════════════════════════╗' + colors.reset);
  console.log(colors.bright + colors.cyan + '║  RT SYMPHONI.A - Alertes de Dépassement de Budget           ║' + colors.reset);
  console.log(colors.bright + colors.cyan + '╚══════════════════════════════════════════════════════════════╝' + colors.reset);

  const checker = new BudgetChecker();
  const costs = checker.check();

  const report = new BudgetReport(costs);
  report.display();
  report.generateRecommendations();

  // Export
  const exportPath = path.join(__dirname, '..', 'budget-report-' + Date.now() + '.json');
  report.exportJSON(exportPath);

  console.log();
  log.info('Vérification terminée');
}

// ============================================================================
// Point d'Entrée
// ============================================================================

main().catch((error) => {
  log.error('Erreur fatale: ' + error.message);
  console.error(error);
  process.exit(1);
});
