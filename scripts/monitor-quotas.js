#!/usr/bin/env node
// ============================================================================
// RT SYMPHONI.A - Monitoring des Quotas et Limites des Services Externes
// ============================================================================
// Version: 1.0.0
// Date: 2025-11-26
// Description: Surveille l'utilisation des quotas pour TomTom, AWS Textract
//              et Google Vision API et alerte en cas de dépassement
// ============================================================================

import https from 'https';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  quotas: {
    tomtom: {
      dailyLimit: 2500, // Free Tier
      monthlyLimit: 75000,
      warningThreshold: 0.8 // 80%
    },
    aws_textract: {
      monthlyLimit: 10000, // Budget configuré
      warningThreshold: 0.9 // 90%
    },
    google_vision: {
      monthlyFree: 1000,
      monthlyLimit: 10000,
      warningThreshold: 0.8
    }
  },
  usageFile: path.join(__dirname, '..', '.quota-usage.json'),
  alertsFile: path.join(__dirname, '..', '.quota-alerts.json')
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

function formatNumber(num) {
  return num.toLocaleString('fr-FR');
}

function formatPercent(value) {
  return (value * 100).toFixed(1) + '%';
}

// ============================================================================
// Gestion de l'Usage
// ============================================================================

class UsageTracker {
  constructor() {
    this.usage = this.load();
  }

  load() {
    try {
      if (fs.existsSync(CONFIG.usageFile)) {
        const data = fs.readFileSync(CONFIG.usageFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      log.warning('Impossible de charger l\'usage');
    }

    const now = new Date();
    return {
      month: now.getMonth(),
      year: now.getFullYear(),
      tomtom: { daily: 0, monthly: 0, lastReset: now.toISOString() },
      aws_textract: { monthly: 0, lastReset: now.toISOString() },
      google_vision: { monthly: 0, lastReset: now.toISOString() },
      lastUpdate: now.toISOString()
    };
  }

  save() {
    try {
      this.usage.lastUpdate = new Date().toISOString();
      fs.writeFileSync(CONFIG.usageFile, JSON.stringify(this.usage, null, 2));
    } catch (error) {
      log.error('Impossible de sauvegarder l\'usage: ' + error.message);
    }
  }

  checkReset() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Reset mensuel
    if (this.usage.month !== currentMonth || this.usage.year !== currentYear) {
      log.info('Nouveau mois détecté - Reset des compteurs mensuels');
      this.usage.month = currentMonth;
      this.usage.year = currentYear;
      this.usage.tomtom.monthly = 0;
      this.usage.aws_textract.monthly = 0;
      this.usage.google_vision.monthly = 0;
      this.save();
    }

    // Reset quotidien TomTom
    const lastReset = new Date(this.usage.tomtom.lastReset);
    const daysSinceReset = Math.floor((now - lastReset) / (1000 * 60 * 60 * 24));

    if (daysSinceReset >= 1) {
      log.info('Nouveau jour détecté - Reset du compteur TomTom quotidien');
      this.usage.tomtom.daily = 0;
      this.usage.tomtom.lastReset = now.toISOString();
      this.save();
    }
  }

  recordUsage(service, count = 1) {
    this.checkReset();

    if (service === 'tomtom') {
      this.usage.tomtom.daily += count;
      this.usage.tomtom.monthly += count;
    } else if (service === 'aws_textract') {
      this.usage.aws_textract.monthly += count;
    } else if (service === 'google_vision') {
      this.usage.google_vision.monthly += count;
    }

    this.save();
  }

  getUsage(service) {
    this.checkReset();
    return this.usage[service];
  }
}

// ============================================================================
// Gestion des Alertes
// ============================================================================

class AlertManager {
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

  addAlert(service, type, message, severity = 'warning') {
    const alert = {
      service,
      type,
      message,
      severity,
      timestamp: new Date().toISOString()
    };

    this.alerts.push(alert);
    this.save();

    if (severity === 'critical') {
      log.error(`[${service.toUpperCase()}] ${message}`);
    } else {
      log.warning(`[${service.toUpperCase()}] ${message}`);
    }
  }

  getRecentAlerts(hours = 24) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);

    return this.alerts.filter((alert) => new Date(alert.timestamp) > cutoff);
  }

  clearOldAlerts(days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const before = this.alerts.length;
    this.alerts = this.alerts.filter((alert) => new Date(alert.timestamp) > cutoff);
    const removed = before - this.alerts.length;

    if (removed > 0) {
      this.save();
      log.info(`${removed} anciennes alertes supprimées`);
    }
  }
}

// ============================================================================
// Monitoring TomTom
// ============================================================================

class TomTomMonitor {
  constructor(tracker, alertManager) {
    this.tracker = tracker;
    this.alertManager = alertManager;
  }

  async check() {
    log.header('TomTom Telematics API - Quotas');

    const usage = this.tracker.getUsage('tomtom');
    const quotas = CONFIG.quotas.tomtom;

    // Quota quotidien
    const dailyUsagePercent = usage.daily / quotas.dailyLimit;
    const dailyRemaining = quotas.dailyLimit - usage.daily;

    console.log(`\n${colors.bright}Quota Quotidien:${colors.reset}`);
    console.log(`  Utilisé:   ${formatNumber(usage.daily)} / ${formatNumber(quotas.dailyLimit)}`);
    console.log(`  Restant:   ${formatNumber(dailyRemaining)}`);
    console.log(`  Usage:     ${formatPercent(dailyUsagePercent)}`);

    this.displayProgressBar(dailyUsagePercent, 'quotidien');

    if (dailyUsagePercent >= 1.0) {
      log.error('Quota quotidien DÉPASSÉ !');
      this.alertManager.addAlert('tomtom', 'quota_exceeded', 'Quota quotidien dépassé', 'critical');
    } else if (dailyUsagePercent >= quotas.warningThreshold) {
      log.warning(`Quota quotidien à ${formatPercent(dailyUsagePercent)}`);
      this.alertManager.addAlert('tomtom', 'quota_warning', `Quota quotidien à ${formatPercent(dailyUsagePercent)}`);
    } else {
      log.success('Quota quotidien OK');
    }

    // Quota mensuel
    const monthlyUsagePercent = usage.monthly / quotas.monthlyLimit;
    const monthlyRemaining = quotas.monthlyLimit - usage.monthly;

    console.log(`\n${colors.bright}Quota Mensuel:${colors.reset}`);
    console.log(`  Utilisé:   ${formatNumber(usage.monthly)} / ${formatNumber(quotas.monthlyLimit)}`);
    console.log(`  Restant:   ${formatNumber(monthlyRemaining)}`);
    console.log(`  Usage:     ${formatPercent(monthlyUsagePercent)}`);

    this.displayProgressBar(monthlyUsagePercent, 'mensuel');

    if (monthlyUsagePercent >= 1.0) {
      log.error('Quota mensuel DÉPASSÉ !');
      this.alertManager.addAlert('tomtom', 'quota_exceeded', 'Quota mensuel dépassé', 'critical');
    } else if (monthlyUsagePercent >= quotas.warningThreshold) {
      log.warning(`Quota mensuel à ${formatPercent(monthlyUsagePercent)}`);
    } else {
      log.success('Quota mensuel OK');
    }

    return {
      service: 'tomtom',
      daily: { used: usage.daily, limit: quotas.dailyLimit, percent: dailyUsagePercent },
      monthly: { used: usage.monthly, limit: quotas.monthlyLimit, percent: monthlyUsagePercent }
    };
  }

  displayProgressBar(percent, label) {
    const width = 50;
    const filled = Math.min(Math.round(percent * width), width);
    const empty = width - filled;

    let color = colors.green;
    if (percent >= 1.0) color = colors.red;
    else if (percent >= CONFIG.quotas.tomtom.warningThreshold) color = colors.yellow;

    const bar = color + '█'.repeat(filled) + colors.reset + '░'.repeat(empty);
    console.log(`  [${bar}] ${formatPercent(percent)} ${label}`);
  }
}

// ============================================================================
// Monitoring AWS Textract
// ============================================================================

class AWSTextractMonitor {
  constructor(tracker, alertManager) {
    this.tracker = tracker;
    this.alertManager = alertManager;
  }

  async check() {
    log.header('AWS Textract - Quotas');

    const usage = this.tracker.getUsage('aws_textract');
    const quotas = CONFIG.quotas.aws_textract;

    const monthlyUsagePercent = usage.monthly / quotas.monthlyLimit;
    const monthlyRemaining = quotas.monthlyLimit - usage.monthly;

    // Estimation des coûts (simplifié)
    const estimatedCost = this.estimateCost(usage.monthly);

    console.log(`\n${colors.bright}Quota Mensuel:${colors.reset}`);
    console.log(`  Utilisé:        ${formatNumber(usage.monthly)} / ${formatNumber(quotas.monthlyLimit)} pages`);
    console.log(`  Restant:        ${formatNumber(monthlyRemaining)} pages`);
    console.log(`  Usage:          ${formatPercent(monthlyUsagePercent)}`);
    console.log(`  Coût estimé:    ${estimatedCost.toFixed(2)}€`);

    this.displayProgressBar(monthlyUsagePercent);

    if (monthlyUsagePercent >= 1.0) {
      log.error('Quota mensuel DÉPASSÉ !');
      this.alertManager.addAlert('aws_textract', 'quota_exceeded', 'Quota mensuel dépassé', 'critical');
    } else if (monthlyUsagePercent >= quotas.warningThreshold) {
      log.warning(`Quota mensuel à ${formatPercent(monthlyUsagePercent)}`);
      this.alertManager.addAlert('aws_textract', 'quota_warning', `Quota à ${formatPercent(monthlyUsagePercent)}`);
    } else {
      log.success('Quota mensuel OK');
    }

    // Recommandations
    if (monthlyUsagePercent >= 0.5) {
      console.log(`\n${colors.yellow}Recommandations:${colors.reset}`);
      console.log(`  - Activez le cache pour réduire les appels`);
      console.log(`  - Utilisez Google Vision en fallback`);
      console.log(`  - Optimisez la qualité des images (réduire les erreurs)`);
    }

    return {
      service: 'aws_textract',
      monthly: { used: usage.monthly, limit: quotas.monthlyLimit, percent: monthlyUsagePercent },
      estimatedCost
    };
  }

  estimateCost(pages) {
    // Simplifié: mix 70% DetectDocumentText + 30% AnalyzeDocument
    const detectPages = pages * 0.7;
    const analyzePages = pages * 0.3;

    const detectCost = (detectPages / 1000) * 1.5; // USD
    const analyzeCost = (analyzePages / 1000) * 15.0; // USD

    const totalUSD = detectCost + analyzeCost;
    const totalEUR = totalUSD * 0.95; // Approximation EUR

    return totalEUR;
  }

  displayProgressBar(percent) {
    const width = 50;
    const filled = Math.min(Math.round(percent * width), width);
    const empty = width - filled;

    let color = colors.green;
    if (percent >= 1.0) color = colors.red;
    else if (percent >= CONFIG.quotas.aws_textract.warningThreshold) color = colors.yellow;

    const bar = color + '█'.repeat(filled) + colors.reset + '░'.repeat(empty);
    console.log(`  [${bar}] ${formatPercent(percent)}`);
  }
}

// ============================================================================
// Monitoring Google Vision
// ============================================================================

class GoogleVisionMonitor {
  constructor(tracker, alertManager) {
    this.tracker = tracker;
    this.alertManager = alertManager;
  }

  async check() {
    log.header('Google Vision API - Quotas');

    const usage = this.tracker.getUsage('google_vision');
    const quotas = CONFIG.quotas.google_vision;

    const monthlyUsagePercent = usage.monthly / quotas.monthlyLimit;
    const monthlyRemaining = quotas.monthlyLimit - usage.monthly;

    // Déterminer si on est dans le Free Tier
    const freeRemaining = Math.max(0, quotas.monthlyFree - usage.monthly);
    const paidUsage = Math.max(0, usage.monthly - quotas.monthlyFree);

    // Estimation des coûts
    const estimatedCost = this.estimateCost(usage.monthly);

    console.log(`\n${colors.bright}Quota Mensuel:${colors.reset}`);
    console.log(`  Utilisé:        ${formatNumber(usage.monthly)} / ${formatNumber(quotas.monthlyLimit)} pages`);
    console.log(`  Restant:        ${formatNumber(monthlyRemaining)} pages`);
    console.log(`  Free Tier:      ${formatNumber(freeRemaining)} pages restantes`);
    console.log(`  Usage payant:   ${formatNumber(paidUsage)} pages`);
    console.log(`  Coût estimé:    ${estimatedCost.toFixed(2)}€`);

    this.displayProgressBar(monthlyUsagePercent);

    if (monthlyUsagePercent >= 1.0) {
      log.error('Quota mensuel DÉPASSÉ !');
      this.alertManager.addAlert('google_vision', 'quota_exceeded', 'Quota mensuel dépassé', 'critical');
    } else if (monthlyUsagePercent >= quotas.warningThreshold) {
      log.warning(`Quota mensuel à ${formatPercent(monthlyUsagePercent)}`);
    } else {
      log.success('Quota mensuel OK');
    }

    if (usage.monthly > quotas.monthlyFree && freeRemaining === 0) {
      log.info('Free Tier épuisé - Facturation en cours');
    }

    return {
      service: 'google_vision',
      monthly: { used: usage.monthly, limit: quotas.monthlyLimit, percent: monthlyUsagePercent },
      freeTier: { remaining: freeRemaining, used: Math.min(usage.monthly, quotas.monthlyFree) },
      estimatedCost
    };
  }

  estimateCost(pages) {
    const freePages = Math.min(pages, CONFIG.quotas.google_vision.monthlyFree);
    const paidPages = Math.max(0, pages - freePages);

    const costUSD = (paidPages / 1000) * 1.5;
    const costEUR = costUSD * 0.95;

    return costEUR;
  }

  displayProgressBar(percent) {
    const width = 50;
    const filled = Math.min(Math.round(percent * width), width);
    const empty = width - filled;

    let color = colors.green;
    if (percent >= 1.0) color = colors.red;
    else if (percent >= CONFIG.quotas.google_vision.warningThreshold) color = colors.yellow;

    const bar = color + '█'.repeat(filled) + colors.reset + '░'.repeat(empty);
    console.log(`  [${bar}] ${formatPercent(percent)}`);
  }
}

// ============================================================================
// Rapport Global
// ============================================================================

class GlobalReport {
  constructor(results) {
    this.results = results;
  }

  display() {
    log.header('Rapport Global');

    // Coût total
    const totalCost =
      (this.results.aws?.estimatedCost || 0) + (this.results.google?.estimatedCost || 0);

    console.log(`\n${colors.bright}Coûts Estimés:${colors.reset}`);
    console.log(`  TomTom:         0.00€ (Free Tier)`);
    console.log(`  AWS Textract:   ${(this.results.aws?.estimatedCost || 0).toFixed(2)}€`);
    console.log(`  Google Vision:  ${(this.results.google?.estimatedCost || 0).toFixed(2)}€`);
    console.log(`  ${colors.bright}Total:          ${totalCost.toFixed(2)}€${colors.reset}`);

    // Alertes
    const alertManager = new AlertManager();
    const recentAlerts = alertManager.getRecentAlerts(24);

    if (recentAlerts.length > 0) {
      console.log(`\n${colors.yellow}Alertes Récentes (24h):${colors.reset}`);
      recentAlerts.forEach((alert) => {
        const icon = alert.severity === 'critical' ? '🔴' : '🟡';
        console.log(`  ${icon} [${alert.service}] ${alert.message}`);
      });
    } else {
      log.success('\nAucune alerte récente');
    }
  }

  exportJSON(filename) {
    const data = {
      timestamp: new Date().toISOString(),
      results: this.results,
      alerts: new AlertManager().getRecentAlerts(24)
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
  console.log(colors.bright + colors.cyan + '║  RT SYMPHONI.A - Monitoring des Quotas                      ║' + colors.reset);
  console.log(colors.bright + colors.cyan + '╚══════════════════════════════════════════════════════════════╝' + colors.reset);

  const tracker = new UsageTracker();
  const alertManager = new AlertManager();

  // Nettoyer les anciennes alertes
  alertManager.clearOldAlerts(30);

  // Monitors
  const tomtom = new TomTomMonitor(tracker, alertManager);
  const aws = new AWSTextractMonitor(tracker, alertManager);
  const google = new GoogleVisionMonitor(tracker, alertManager);

  // Vérifications
  const results = {};

  try {
    results.tomtom = await tomtom.check();
    results.aws = await aws.check();
    results.google = await google.check();
  } catch (error) {
    log.error('Erreur durant le monitoring: ' + error.message);
  }

  // Rapport global
  const report = new GlobalReport(results);
  report.display();

  // Export optionnel
  const exportPath = path.join(__dirname, '..', 'quota-report-' + Date.now() + '.json');
  report.exportJSON(exportPath);

  console.log();
  log.info('Monitoring terminé');
}

// ============================================================================
// Point d'Entrée
// ============================================================================

main().catch((error) => {
  log.error('Erreur fatale: ' + error.message);
  console.error(error);
  process.exit(1);
});
