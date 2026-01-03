#!/usr/bin/env node
/**
 * Secrets Audit Script
 * SYMPHONI.A - RT Technologie
 *
 * Script pour auditer les secrets potentiellement exposés dans le code.
 * Utilisation: node scripts/security/audit-secrets.js
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

// Patterns de secrets à rechercher
const SECRET_PATTERNS = [
  // Mots de passe et secrets génériques
  { pattern: /password\s*[=:]\s*['"][^'"]{4,}['"]/gi, name: 'Password assignment' },
  { pattern: /secret\s*[=:]\s*['"][^'"]{8,}['"]/gi, name: 'Secret assignment' },
  { pattern: /api[_-]?key\s*[=:]\s*['"][^'"]{8,}['"]/gi, name: 'API Key assignment' },
  { pattern: /token\s*[=:]\s*['"][^'"]{20,}['"]/gi, name: 'Token assignment' },

  // AWS
  { pattern: /AKIA[0-9A-Z]{16}/g, name: 'AWS Access Key ID' },
  { pattern: /aws[_-]?secret[_-]?access[_-]?key\s*[=:]\s*['"][^'"]+['"]/gi, name: 'AWS Secret Key' },

  // MongoDB
  { pattern: /mongodb(\+srv)?:\/\/[^:]+:[^@]+@/gi, name: 'MongoDB URI with credentials' },

  // JWT
  { pattern: /jwt[_-]?secret\s*[=:]\s*['"][^'"]{10,}['"]/gi, name: 'JWT Secret' },

  // Stripe
  { pattern: /sk_live_[a-zA-Z0-9]{24,}/g, name: 'Stripe Live Secret Key' },
  { pattern: /sk_test_[a-zA-Z0-9]{24,}/g, name: 'Stripe Test Secret Key' },
  { pattern: /whsec_[a-zA-Z0-9]{24,}/g, name: 'Stripe Webhook Secret' },

  // Clés privées
  { pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g, name: 'Private Key' },
  { pattern: /-----BEGIN\s+PGP\s+PRIVATE\s+KEY-----/g, name: 'PGP Private Key' },

  // OAuth / Tokens
  { pattern: /bearer\s+[a-zA-Z0-9_\-\.]+/gi, name: 'Bearer Token' },
  { pattern: /oauth[_-]?token\s*[=:]\s*['"][^'"]+['"]/gi, name: 'OAuth Token' },

  // Divers services
  { pattern: /twilio[_-]?auth[_-]?token\s*[=:]\s*['"][^'"]+['"]/gi, name: 'Twilio Auth Token' },
  { pattern: /sendgrid[_-]?api[_-]?key\s*[=:]\s*['"][^'"]+['"]/gi, name: 'SendGrid API Key' },
  { pattern: /mailgun[_-]?api[_-]?key\s*[=:]\s*['"][^'"]+['"]/gi, name: 'Mailgun API Key' }
];

// Extensions de fichiers à analyser
const FILE_EXTENSIONS = [
  '.js', '.ts', '.jsx', '.tsx',
  '.json', '.yaml', '.yml',
  '.env', '.env.local', '.env.production',
  '.sh', '.bash',
  '.md', '.txt'
];

// Dossiers à ignorer
const IGNORE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt'
];

// Fichiers à ignorer
const IGNORE_FILES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'audit-secrets.js', // Ce fichier lui-même
  'generate-secrets.js'
];

// ============================================================================
// FONCTIONS
// ============================================================================

/**
 * Vérifie si un chemin doit être ignoré
 */
function shouldIgnore(filePath) {
  const parts = filePath.split(path.sep);

  // Ignorer les dossiers
  for (const dir of IGNORE_DIRS) {
    if (parts.includes(dir)) {
      return true;
    }
  }

  // Ignorer les fichiers
  const fileName = path.basename(filePath);
  if (IGNORE_FILES.includes(fileName)) {
    return true;
  }

  return false;
}

/**
 * Récupère tous les fichiers à analyser
 */
function getAllFiles(dir, files = []) {
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);

    if (shouldIgnore(fullPath)) {
      continue;
    }

    if (item.isDirectory()) {
      getAllFiles(fullPath, files);
    } else if (item.isFile()) {
      const ext = path.extname(item.name).toLowerCase();
      if (FILE_EXTENSIONS.includes(ext) || item.name.startsWith('.env')) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Analyse un fichier pour trouver des secrets
 */
function analyzeFile(filePath) {
  const findings = [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    for (const secretDef of SECRET_PATTERNS) {
      let match;
      const regex = new RegExp(secretDef.pattern.source, secretDef.pattern.flags);

      while ((match = regex.exec(content)) !== null) {
        // Trouver le numéro de ligne
        const beforeMatch = content.substring(0, match.index);
        const lineNumber = (beforeMatch.match(/\n/g) || []).length + 1;

        // Masquer partiellement la valeur trouvée
        const found = match[0];
        const masked = found.length > 20
          ? found.substring(0, 10) + '...[MASKED]...' + found.substring(found.length - 5)
          : found.substring(0, 5) + '...[MASKED]';

        findings.push({
          file: filePath,
          line: lineNumber,
          type: secretDef.name,
          match: masked,
          severity: getSeverity(secretDef.name, filePath)
        });
      }
    }
  } catch (error) {
    console.error(`Erreur lors de l'analyse de ${filePath}: ${error.message}`);
  }

  return findings;
}

/**
 * Détermine la sévérité d'une découverte
 */
function getSeverity(type, filePath) {
  // Les fichiers .env sont plus critiques
  if (filePath.includes('.env') && !filePath.includes('.example')) {
    return 'CRITICAL';
  }

  // Les clés de production sont critiques
  if (type.includes('Live') || type.includes('Private Key')) {
    return 'CRITICAL';
  }

  // Les credentials de base de données sont hauts
  if (type.includes('MongoDB') || type.includes('AWS')) {
    return 'HIGH';
  }

  return 'MEDIUM';
}

// ============================================================================
// RAPPORT
// ============================================================================

function printReport(findings) {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                      AUDIT DES SECRETS - RAPPORT                             ║');
  console.log('║                    SYMPHONI.A - RT Technologie                               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('');

  if (findings.length === 0) {
    console.log('✅ Aucun secret potentiel détecté dans le code source.');
    console.log('');
    return;
  }

  // Grouper par sévérité
  const critical = findings.filter(f => f.severity === 'CRITICAL');
  const high = findings.filter(f => f.severity === 'HIGH');
  const medium = findings.filter(f => f.severity === 'MEDIUM');

  console.log(`Total: ${findings.length} secrets potentiels détectés`);
  console.log(`  🔴 CRITICAL: ${critical.length}`);
  console.log(`  🟠 HIGH: ${high.length}`);
  console.log(`  🟡 MEDIUM: ${medium.length}`);
  console.log('');

  // Afficher les findings
  const printFindings = (list, emoji, label) => {
    if (list.length === 0) return;

    console.log(`═══════════════════════════════════════════════════════════════════════════════`);
    console.log(`${emoji} ${label} (${list.length})`);
    console.log(`═══════════════════════════════════════════════════════════════════════════════`);
    console.log('');

    for (const finding of list) {
      console.log(`  📁 ${finding.file}:${finding.line}`);
      console.log(`     Type: ${finding.type}`);
      console.log(`     Match: ${finding.match}`);
      console.log('');
    }
  };

  printFindings(critical, '🔴', 'CRITICAL - Action immédiate requise');
  printFindings(high, '🟠', 'HIGH - À traiter rapidement');
  printFindings(medium, '🟡', 'MEDIUM - À vérifier');

  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('RECOMMANDATIONS:');
  console.log('');
  console.log('1. Vérifiez chaque finding pour confirmer s\'il s\'agit d\'un vrai secret');
  console.log('2. Les fichiers .env.example peuvent contenir des placeholders (faux positifs)');
  console.log('3. Utilisez AWS Secrets Manager pour les vrais secrets');
  console.log('4. Nettoyez l\'historique Git si des secrets ont été commités');
  console.log('');
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  const targetDir = args[0] || process.cwd();

  console.log(`\nAnalyse du répertoire: ${targetDir}\n`);

  // Récupérer tous les fichiers
  const files = getAllFiles(targetDir);
  console.log(`Fichiers à analyser: ${files.length}`);

  // Analyser chaque fichier
  const allFindings = [];
  for (const file of files) {
    const findings = analyzeFile(file);
    allFindings.push(...findings);
  }

  // Afficher le rapport
  printReport(allFindings);

  // Code de sortie
  const hasCritical = allFindings.some(f => f.severity === 'CRITICAL');
  process.exit(hasCritical ? 1 : 0);
}

main();
