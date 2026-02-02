#!/usr/bin/env node
/**
 * Script d'Invitation Transporteurs Test - Jour 12
 *
 * Ce script crée des transporteurs de test de A à Z pour valider tout le workflow :
 * 1. Prompt utilisateur (nombre, prefix email)
 * 2. Génération données carriers
 * 3. Création via API
 * 4. Génération et upload de 6 documents PDF par carrier
 * 5. Vérification des documents
 * 6. Calcul du score
 * 7. Check éligibilité Affret.IA
 * 8. Envoi email invitation
 * 9. Rapport final JSON
 *
 * Usage: node scripts/invite-test-carriers.cjs
 */

require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');
const readline = require('readline');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:3001';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rt-authz';
const AFFRET_IA_MIN_SCORE = 70;

// Noms d'entreprises fictifs
const COMPANY_NAMES = [
  'Transport Express', 'Logistique Rapide', 'Fret International',
  'Transport Premium', 'Logistique Solutions', 'Express Cargo',
  'Transports Sécurisés', 'Logistique France', 'Cargo Direct',
  'Transports Fiables'
];

// Types de documents requis
const DOCUMENT_TYPES = [
  { type: 'Kbis', expiryMonths: 6 },
  { type: 'URSSAF', expiryMonths: 12 },
  { type: 'Assurance RC Pro', expiryMonths: 12 },
  { type: 'Licence Transport', expiryMonths: 12 },
  { type: 'Carte Grise', expiryMonths: 12 },
  { type: 'Attestation Vigilance', expiryMonths: 6 }
];

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// État global
const report = {
  timestamp: new Date().toISOString(),
  carriersCreated: 0,
  carriers: [],
  summary: {
    avgScore: 0,
    affretIAEligible: 0,
    totalDocuments: 0
  },
  errors: []
};

/**
 * Utilitaires de console
 */
function log(emoji, message, color = colors.reset) {
  console.log(`${color}${emoji} ${message}${colors.reset}`);
}

function logSuccess(message) {
  log('✅', message, colors.green);
}

function logError(message) {
  log('❌', message, colors.red);
}

function logInfo(message) {
  log('ℹ️', message, colors.blue);
}

function logWarning(message) {
  log('⚠️', message, colors.yellow);
}

function logProgress(current, total, task) {
  const percentage = Math.round((current / total) * 100);
  const bar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
  console.log(`${colors.cyan}[${bar}] ${percentage}% - ${task}${colors.reset}`);
}

/**
 * Prompt utilisateur
 */
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Générer un SIRET valide (14 chiffres)
 */
function generateSIRET() {
  const base = Math.floor(Math.random() * 100000000000000).toString().padStart(14, '0');
  return base;
}

/**
 * Générer un numéro de téléphone français
 */
function generatePhone() {
  const prefix = '+336';
  const number = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
  return `${prefix}${number}`;
}

/**
 * Générer une adresse française
 */
function generateAddress() {
  const streets = ['Rue de la Paix', 'Avenue des Champs', 'Boulevard Victor Hugo', 'Rue du Commerce'];
  const cities = ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Nice'];
  const postalCodes = ['75001', '69001', '13001', '31000', '06000'];

  const idx = Math.floor(Math.random() * cities.length);
  const streetNumber = Math.floor(Math.random() * 200) + 1;

  return {
    street: `${streetNumber} ${streets[Math.floor(Math.random() * streets.length)]}`,
    postalCode: postalCodes[idx],
    city: cities[idx],
    country: 'France'
  };
}

/**
 * Générer les données d'un carrier
 */
function generateCarrierData(index, emailPrefix) {
  const companyName = COMPANY_NAMES[index % COMPANY_NAMES.length];
  const address = generateAddress();

  return {
    companyName: `${companyName} ${index + 1}`,
    email: `${emailPrefix}${index + 1}@example.com`,
    siret: generateSIRET(),
    phone: generatePhone(),
    address: `${address.street}, ${address.postalCode} ${address.city}`,
    level: 'guest'
  };
}

/**
 * Générer un PDF simple pour les tests
 */
function generateSimplePDF(documentType, companyName, expiryDate) {
  // PDF minimal valide
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources 4 0 R /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>
endobj
5 0 obj
<< /Length 200 >>
stream
BT
/F1 24 Tf
50 750 Td
(${documentType}) Tj
0 -50 Td
/F1 14 Tf
(Entreprise: ${companyName}) Tj
0 -30 Td
(Date d'expiration: ${expiryDate.toLocaleDateString('fr-FR')}) Tj
0 -30 Td
(Document de test genere automatiquement) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000214 00000 n
0000000308 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
560
%%EOF`;

  return Buffer.from(content);
}

/**
 * Créer un carrier via API
 */
async function createCarrier(carrierData, industrielId) {
  try {
    logInfo(`Création du carrier: ${carrierData.companyName}`);

    const response = await fetch(`${API_BASE_URL}/api/carriers/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: carrierData.email,
        companyName: carrierData.companyName,
        siret: carrierData.siret,
        phone: carrierData.phone,
        industrielId: industrielId,
        level: carrierData.level,
        message: 'Carrier de test créé automatiquement'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const result = await response.json();
    logSuccess(`Carrier créé: ${result.invitation.id}`);

    return result.invitation.id;
  } catch (error) {
    logError(`Erreur création carrier: ${error.message}`);
    throw error;
  }
}

/**
 * Upload un document pour un carrier
 */
async function uploadDocument(carrierId, documentType, companyName, expiryDate) {
  try {
    const fileName = `${documentType.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
    const pdfBuffer = generateSimplePDF(documentType, companyName, expiryDate);

    // Étape 1: Obtenir l'URL présignée
    const urlResponse = await fetch(`${API_BASE_URL}/api/carriers/${carrierId}/documents/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileName,
        contentType: 'application/pdf',
        documentType
      })
    });

    if (!urlResponse.ok) {
      throw new Error(`Failed to get upload URL: ${urlResponse.status}`);
    }

    const { uploadUrl, s3Key } = await urlResponse.json();

    // Étape 2: Upload vers S3
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/pdf'
      },
      body: pdfBuffer
    });

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload to S3: ${uploadResponse.status}`);
    }

    // Étape 3: Confirmer l'upload
    const confirmResponse = await fetch(`${API_BASE_URL}/api/carriers/${carrierId}/documents/confirm-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        s3Key,
        documentType,
        fileName,
        expiresAt: expiryDate.toISOString(),
        notes: 'Document de test généré automatiquement'
      })
    });

    if (!confirmResponse.ok) {
      throw new Error(`Failed to confirm upload: ${confirmResponse.status}`);
    }

    const result = await confirmResponse.json();
    return result.document.id;

  } catch (error) {
    logError(`Erreur upload document ${documentType}: ${error.message}`);
    throw error;
  }
}

/**
 * Vérifier un document
 */
async function verifyDocument(carrierId, documentId, documentType) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/carriers/${carrierId}/documents/${documentId}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        approved: true
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to verify document: ${response.status}`);
    }

    logSuccess(`Document vérifié: ${documentType}`);
    return true;

  } catch (error) {
    logError(`Erreur vérification document ${documentType}: ${error.message}`);
    throw error;
  }
}

/**
 * Calculer le score d'un carrier
 */
async function calculateScore(carrierId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/carriers/${carrierId}/calculate-score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to calculate score: ${response.status}`);
    }

    const result = await response.json();
    return result.score || 0;

  } catch (error) {
    logError(`Erreur calcul score: ${error.message}`);
    return 0;
  }
}

/**
 * Récupérer les informations d'un carrier
 */
async function getCarrierInfo(carrierId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/carriers/${carrierId}`);

    if (!response.ok) {
      throw new Error(`Failed to get carrier info: ${response.status}`);
    }

    return await response.json();

  } catch (error) {
    logError(`Erreur récupération carrier: ${error.message}`);
    return null;
  }
}

/**
 * Traiter un carrier complet
 */
async function processCarrier(carrierData, industrielId, index, total) {
  const carrierReport = {
    companyName: carrierData.companyName,
    email: carrierData.email,
    siret: carrierData.siret,
    phone: carrierData.phone,
    score: 0,
    level: 'guest',
    affretIAEligible: false,
    documentsUploaded: 0,
    documentsVerified: 0,
    errors: []
  };

  try {
    console.log(`\n${colors.bold}${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.bold}Carrier ${index + 1}/${total}: ${carrierData.companyName}${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

    // 1. Créer le carrier
    logProgress(1, 6, 'Création du carrier...');
    const carrierId = await createCarrier(carrierData, industrielId);
    carrierReport.id = carrierId;

    // 2. Upload des documents
    logProgress(2, 6, 'Upload des documents...');
    const documentIds = [];

    for (let i = 0; i < DOCUMENT_TYPES.length; i++) {
      const doc = DOCUMENT_TYPES[i];
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + doc.expiryMonths);

      try {
        const docId = await uploadDocument(carrierId, doc.type, carrierData.companyName, expiryDate);
        documentIds.push({ id: docId, type: doc.type });
        carrierReport.documentsUploaded++;
        logSuccess(`  [${i + 1}/${DOCUMENT_TYPES.length}] ${doc.type}`);
      } catch (error) {
        carrierReport.errors.push(`Upload ${doc.type}: ${error.message}`);
        logWarning(`  [${i + 1}/${DOCUMENT_TYPES.length}] ${doc.type} - ÉCHEC`);
      }

      // Petite pause pour éviter de surcharger l'API
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // 3. Vérifier les documents
    logProgress(3, 6, 'Vérification des documents...');

    for (let i = 0; i < documentIds.length; i++) {
      const doc = documentIds[i];
      try {
        await verifyDocument(carrierId, doc.id, doc.type);
        carrierReport.documentsVerified++;
      } catch (error) {
        carrierReport.errors.push(`Verify ${doc.type}: ${error.message}`);
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // 4. Calculer le score
    logProgress(4, 6, 'Calcul du score...');
    const score = await calculateScore(carrierId);
    carrierReport.score = score;

    if (score > 0) {
      logSuccess(`Score calculé: ${score}/100`);
    } else {
      logWarning(`Score: ${score}/100`);
    }

    // 5. Check éligibilité Affret.IA
    logProgress(5, 6, 'Check éligibilité Affret.IA...');
    if (score >= AFFRET_IA_MIN_SCORE) {
      carrierReport.affretIAEligible = true;
      logSuccess(`Éligible Affret.IA (score >= ${AFFRET_IA_MIN_SCORE})`);
    } else {
      logInfo(`Non éligible Affret.IA (score < ${AFFRET_IA_MIN_SCORE})`);
    }

    // 6. Récupérer le niveau final
    logProgress(6, 6, 'Récupération des infos finales...');
    const carrierInfo = await getCarrierInfo(carrierId);
    if (carrierInfo) {
      carrierReport.level = carrierInfo.level || 'guest';
      logSuccess(`Niveau final: ${carrierReport.level}`);
    }

    console.log(`\n${colors.green}${colors.bold}✅ Carrier ${carrierData.companyName} traité avec succès${colors.reset}`);

    return carrierReport;

  } catch (error) {
    logError(`Échec traitement carrier: ${error.message}`);
    carrierReport.errors.push(`Fatal: ${error.message}`);
    return carrierReport;
  }
}

/**
 * Sauvegarder le rapport JSON
 */
function saveReport() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const reportPath = path.join(__dirname, `invite-report-${timestamp}.json`);

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  return reportPath;
}

/**
 * Afficher le rapport final
 */
function displayFinalReport() {
  console.log(`\n${colors.bold}${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}               RAPPORT FINAL               ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

  // Statistiques globales
  console.log(`${colors.bold}Carriers créés:${colors.reset} ${report.carriersCreated}`);
  console.log(`${colors.bold}Score moyen:${colors.reset} ${report.summary.avgScore.toFixed(1)}/100`);
  console.log(`${colors.bold}Éligibles Affret.IA:${colors.reset} ${report.summary.affretIAEligible}/${report.carriersCreated}`);
  console.log(`${colors.bold}Documents uploadés:${colors.reset} ${report.summary.totalDocuments}\n`);

  // Détails par carrier
  console.log(`${colors.bold}Détails par carrier:${colors.reset}\n`);

  report.carriers.forEach((carrier, index) => {
    const statusColor = carrier.score >= AFFRET_IA_MIN_SCORE ? colors.green : colors.yellow;
    const statusIcon = carrier.score >= AFFRET_IA_MIN_SCORE ? '✅' : '⚠️';

    console.log(`${statusColor}${statusIcon} ${index + 1}. ${carrier.companyName}${colors.reset}`);
    console.log(`   Email: ${carrier.email}`);
    console.log(`   Score: ${carrier.score}/100 | Niveau: ${carrier.level}`);
    console.log(`   Documents: ${carrier.documentsVerified}/${carrier.documentsUploaded} vérifiés`);
    console.log(`   Affret.IA: ${carrier.affretIAEligible ? 'Oui' : 'Non'}`);

    if (carrier.errors.length > 0) {
      console.log(`   ${colors.red}Erreurs: ${carrier.errors.length}${colors.reset}`);
      carrier.errors.forEach(err => console.log(`     - ${err}`));
    }
    console.log('');
  });

  // Sauvegarder le rapport
  const reportPath = saveReport();

  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
  logSuccess(`Rapport sauvegardé: ${reportPath}`);
  console.log('');
}

/**
 * Fonction principale
 */
async function main() {
  console.log(`${colors.bold}${colors.cyan}`);
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║                                                   ║');
  console.log('║   Script d\'Invitation Transporteurs Test         ║');
  console.log('║              Jour 12 - SYMPHONI.A                 ║');
  console.log('║                                                   ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log(colors.reset + '\n');

  let client = null;
  let db = null;

  try {
    // 1. Prompts utilisateur
    console.log(`${colors.bold}Configuration:${colors.reset}\n`);

    const numberOfCarriersInput = await prompt('Nombre de carriers à créer (1-5): ');
    const numberOfCarriers = parseInt(numberOfCarriersInput) || 1;

    if (numberOfCarriers < 1 || numberOfCarriers > 5) {
      logError('Le nombre doit être entre 1 et 5');
      process.exit(1);
    }

    const emailPrefix = await prompt('Prefix email (ex: "test" → test1@example.com): ');

    if (!emailPrefix || emailPrefix.trim() === '') {
      logError('Le prefix email est requis');
      process.exit(1);
    }

    console.log('');
    logInfo(`Configuration: ${numberOfCarriers} carrier(s) avec prefix "${emailPrefix}"`);
    logInfo(`API: ${API_BASE_URL}`);
    logInfo(`MongoDB: ${MONGODB_URI}`);
    console.log('');

    // 2. Connexion MongoDB pour récupérer un industriel
    logInfo('Connexion à MongoDB...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db();
    logSuccess('Connecté à MongoDB');

    // Trouver un industriel pour référencer les carriers
    const industriel = await db.collection('users').findOne({
      role: { $in: ['admin', 'industriel'] }
    });

    if (!industriel) {
      logError('Aucun utilisateur industriel trouvé dans la base');
      process.exit(1);
    }

    const industrielId = industriel._id.toString();
    logSuccess(`Industriel trouvé: ${industriel.email || industrielId}`);
    console.log('');

    // 3. Générer les données des carriers
    logInfo('Génération des données carriers...');
    const carriersData = [];
    for (let i = 0; i < numberOfCarriers; i++) {
      carriersData.push(generateCarrierData(i, emailPrefix));
    }
    logSuccess(`${numberOfCarriers} carrier(s) généré(s)`);
    console.log('');

    // 4. Traiter chaque carrier
    for (let i = 0; i < carriersData.length; i++) {
      const carrierReport = await processCarrier(carriersData[i], industrielId, i, carriersData.length);
      report.carriers.push(carrierReport);
      report.carriersCreated++;
    }

    // 5. Calculer les statistiques finales
    const totalScore = report.carriers.reduce((sum, c) => sum + c.score, 0);
    report.summary.avgScore = report.carriersCreated > 0 ? totalScore / report.carriersCreated : 0;
    report.summary.affretIAEligible = report.carriers.filter(c => c.affretIAEligible).length;
    report.summary.totalDocuments = report.carriers.reduce((sum, c) => sum + c.documentsUploaded, 0);

    // 6. Afficher le rapport final
    displayFinalReport();

    logSuccess('Script terminé avec succès !');

  } catch (error) {
    logError(`Erreur fatale: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      logInfo('Connexion MongoDB fermée');
    }
  }
}

// Exécution
if (require.main === module) {
  main().catch(error => {
    console.error(`${colors.red}Erreur fatale:${colors.reset}`, error);
    process.exit(1);
  });
}

module.exports = { main };
