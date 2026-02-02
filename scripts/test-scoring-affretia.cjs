/**
 * Test du scoring de vigilance et activation Affret.IA
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_URL = 'http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com';
const CARRIER_ID = '697f5a2b1980ef959ce78b67';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(title) {
  console.log(`\n${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  log(title, 'bright');
  console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
}

async function getCarrierInfo() {
  const response = await axios.get(`${API_URL}/api/carriers/${CARRIER_ID}`);
  return response.data;
}

async function uploadDocument(docMetadata) {
  try {
    // Étape 1: Obtenir URL présignée
    const urlResponse = await axios.post(
      `${API_URL}/api/carriers/${CARRIER_ID}/documents/upload-url`,
      {
        fileName: docMetadata.file,
        contentType: 'application/pdf',
        documentType: docMetadata.type
      }
    );

    const { uploadUrl, s3Key } = urlResponse.data;

    // Étape 2: Lire le fichier
    const pdfPath = path.join(__dirname, 'test-documents', docMetadata.file);
    const pdfBuffer = fs.readFileSync(pdfPath);

    // Étape 3: Upload vers S3
    await axios.put(uploadUrl, pdfBuffer, {
      headers: { 'Content-Type': 'application/pdf' },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    // Étape 4: Confirmer l'upload
    const confirmData = {
      s3Key,
      documentType: docMetadata.type,
      fileName: docMetadata.file
    };

    if (docMetadata.expiryDate) {
      confirmData.expiresAt = docMetadata.expiryDate;
    }

    const confirmResponse = await axios.post(
      `${API_URL}/api/carriers/${CARRIER_ID}/documents/confirm-upload`,
      confirmData
    );

    return confirmResponse.data;

  } catch (error) {
    throw new Error(`Upload failed for ${docMetadata.name}: ${error.message}`);
  }
}

async function checkAffretIA() {
  try {
    const response = await axios.get(`http://localhost:3017/api/carriers/${CARRIER_ID}/trial-account`);
    return response.data;
  } catch (error) {
    return { error: error.message, available: false };
  }
}

async function main() {
  try {
    header('TEST SCORING DE VIGILANCE ET AFFRET.IA');

    // ===== ÉTAPE 1: État initial (AVANT upload) =====
    header('ÉTAPE 1: ÉTAT INITIAL (AVANT DÉPÔT DES DOCUMENTS)');

    const initialCarrier = await getCarrierInfo();

    log('Informations transporteur:', 'cyan');
    log(`  Nom: ${initialCarrier.companyName}`);
    log(`  Status: ${initialCarrier.status}`);
    log(`  Vigilance: ${initialCarrier.vigilanceStatus}`);
    log(`  Documents: ${initialCarrier.documents?.length || 0}/6`);

    console.log(`\n${colors.bright}Score de vigilance initial:${colors.reset}`);
    log(`  Score global: ${initialCarrier.overallScore}/100`,
        initialCarrier.overallScore >= 70 ? 'green' :
        initialCarrier.overallScore >= 50 ? 'yellow' : 'red');

    if (initialCarrier.scoreDetails) {
      console.log(`\n  Détails:`);
      Object.entries(initialCarrier.scoreDetails).forEach(([key, value]) => {
        const color = value >= 70 ? 'green' : value >= 50 ? 'yellow' : 'red';
        log(`    - ${key}: ${value}/100`, color);
      });
    }

    console.log(`\n${colors.bright}Documents actuels:${colors.reset}`);
    if (initialCarrier.documents && initialCarrier.documents.length > 0) {
      initialCarrier.documents.forEach((doc, i) => {
        log(`  ${i + 1}. ${doc.type} - ${doc.status}`,
            doc.status === 'verified' ? 'green' : 'yellow');
        if (doc.expiresAt) {
          const daysUntilExpiry = Math.floor((new Date(doc.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
          log(`     Expire dans: ${daysUntilExpiry} jours`,
              daysUntilExpiry > 30 ? 'green' : daysUntilExpiry > 7 ? 'yellow' : 'red');
        }
      });
    } else {
      log('  Aucun document', 'red');
    }

    // ===== ÉTAPE 2: Upload des documents manquants =====
    header('ÉTAPE 2: UPLOAD DES DOCUMENTS MANQUANTS');

    const metadata = JSON.parse(fs.readFileSync(
      path.join(__dirname, 'test-documents', 'metadata.json'),
      'utf8'
    ));

    const existingTypes = new Set(initialCarrier.documents?.map(d => d.type) || []);
    const documentsToUpload = metadata.documents.filter(d => !existingTypes.has(d.type));

    log(`Documents à uploader: ${documentsToUpload.length}`, 'cyan');

    for (const doc of documentsToUpload) {
      try {
        log(`\n  → Upload: ${doc.name}...`, 'blue');
        const result = await uploadDocument(doc);
        log(`    ✓ Uploadé avec succès (ID: ${result.document.id})`, 'green');

        if (doc.expiryDate) {
          const days = doc.daysUntilExpiry ||
            Math.floor((new Date(doc.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
          log(`    ✓ Expire dans: ${days} jours`,
              days > 30 ? 'green' : days > 7 ? 'yellow' : 'red');
        }

        // Petit délai entre chaque upload
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        log(`    ✗ Échec: ${error.message}`, 'red');
      }
    }

    // ===== ÉTAPE 3: État après upload =====
    header('ÉTAPE 3: ÉTAT APRÈS DÉPÔT DES DOCUMENTS');

    // Attendre que le scoring soit recalculé
    log('Attente du recalcul du score...', 'cyan');
    await new Promise(resolve => setTimeout(resolve, 3000));

    const updatedCarrier = await getCarrierInfo();

    log('Informations transporteur:', 'cyan');
    log(`  Nom: ${updatedCarrier.companyName}`);
    log(`  Status: ${updatedCarrier.status}`);
    log(`  Vigilance: ${updatedCarrier.vigilanceStatus}`);
    log(`  Documents: ${updatedCarrier.documents?.length || 0}/6`);

    console.log(`\n${colors.bright}Score de vigilance mis à jour:${colors.reset}`);
    log(`  Score global: ${updatedCarrier.overallScore}/100`,
        updatedCarrier.overallScore >= 70 ? 'green' :
        updatedCarrier.overallScore >= 50 ? 'yellow' : 'red');

    if (updatedCarrier.scoreDetails) {
      console.log(`\n  Détails:`);
      Object.entries(updatedCarrier.scoreDetails).forEach(([key, value]) => {
        const oldValue = initialCarrier.scoreDetails?.[key] || 0;
        const diff = value - oldValue;
        const color = value >= 70 ? 'green' : value >= 50 ? 'yellow' : 'red';
        const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
        log(`    - ${key}: ${value}/100 ${arrow} ${diff > 0 ? '+' : ''}${diff}`, color);
      });
    }

    console.log(`\n${colors.bright}Évolution du score:${colors.reset}`);
    const scoreDiff = updatedCarrier.overallScore - initialCarrier.overallScore;
    log(`  ${initialCarrier.overallScore} → ${updatedCarrier.overallScore} (${scoreDiff > 0 ? '+' : ''}${scoreDiff})`,
        scoreDiff > 0 ? 'green' : scoreDiff < 0 ? 'red' : 'yellow');

    // ===== ÉTAPE 4: Vérification des alertes =====
    console.log(`\n${colors.bright}Alertes de vigilance:${colors.reset}`);
    if (updatedCarrier.vigilanceAlerts && updatedCarrier.vigilanceAlerts.length > 0) {
      updatedCarrier.vigilanceAlerts.forEach((alert, i) => {
        const severityColor = {
          info: 'blue',
          warning: 'yellow',
          critical: 'red',
          blocked: 'red'
        }[alert.severity] || 'reset';
        log(`  ${i + 1}. [${alert.severity.toUpperCase()}] ${alert.message}`, severityColor);
        if (alert.documentType) {
          log(`     Document: ${alert.documentType}`, 'cyan');
        }
        if (alert.daysUntilExpiry !== undefined) {
          log(`     Expire dans: ${alert.daysUntilExpiry} jours`, 'cyan');
        }
      });
    } else {
      log('  Aucune alerte active', 'green');
    }

    // ===== ÉTAPE 5: Test Affret.IA =====
    header('ÉTAPE 5: VÉRIFICATION AFFRET.IA');

    log('Vérification de l\'éligibilité Affret.IA...', 'cyan');

    // Critères d'éligibilité
    const hasAllDocuments = updatedCarrier.documents?.length >= 6;
    const noExpiredDocs = !updatedCarrier.documents?.some(doc => {
      if (!doc.expiresAt) return false;
      return new Date(doc.expiresAt) < new Date();
    });
    const goodScore = updatedCarrier.overallScore >= 40; // Seuil minimum
    const notBlocked = updatedCarrier.vigilanceStatus !== 'blocked';

    console.log(`\n${colors.bright}Critères d'éligibilité:${colors.reset}`);
    log(`  ✓ Tous les documents: ${hasAllDocuments ? 'Oui' : 'Non'}`, hasAllDocuments ? 'green' : 'red');
    log(`  ✓ Aucun document expiré: ${noExpiredDocs ? 'Oui' : 'Non'}`, noExpiredDocs ? 'green' : 'red');
    log(`  ✓ Score minimum (40+): ${goodScore ? 'Oui' : 'Non'} (${updatedCarrier.overallScore})`, goodScore ? 'green' : 'red');
    log(`  ✓ Non bloqué: ${notBlocked ? 'Oui' : 'Non'}`, notBlocked ? 'green' : 'red');

    const isEligible = hasAllDocuments && noExpiredDocs && goodScore && notBlocked;

    console.log(`\n${colors.bright}Résultat:${colors.reset}`);
    if (isEligible) {
      log('✓ ÉLIGIBLE pour un compte d\'essai Affret.IA', 'green');
      log('\n  Avantages du compte d\'essai:', 'cyan');
      log('    - 10 transports gratuits');
      log('    - Accès aux fonctionnalités IA');
      log('    - Durée: 30 jours');
      log('    - Upgrade automatique après 10 transports réussis');
    } else {
      log('✗ NON ÉLIGIBLE pour Affret.IA', 'red');

      const reasons = [];
      if (!hasAllDocuments) reasons.push(`${6 - (updatedCarrier.documents?.length || 0)} document(s) manquant(s)`);
      if (!noExpiredDocs) reasons.push('Document(s) expiré(s)');
      if (!goodScore) reasons.push(`Score trop bas (${updatedCarrier.overallScore}/100)`);
      if (!notBlocked) reasons.push('Compte bloqué');

      log('\n  Raisons:', 'cyan');
      reasons.forEach(r => log(`    - ${r}`, 'red'));
    }

    // Tester l'API Affret.IA
    console.log(`\n${colors.bright}Test de l'API Affret.IA:${colors.reset}`);
    const affretResult = await checkAffretIA();

    if (affretResult.error) {
      log(`  ⚠ API Affret.IA non accessible: ${affretResult.error}`, 'yellow');
      log('  Note: L\'API Affret.IA doit être démarrée sur le port 3017', 'cyan');
    } else if (affretResult.trial) {
      log('  ✓ Compte d\'essai activé!', 'green');
      log(`    - Transports restants: ${affretResult.trial.remainingTrips}/10`, 'cyan');
      log(`    - Expire le: ${new Date(affretResult.trial.expiresAt).toLocaleDateString()}`, 'cyan');
    } else {
      log('  ℹ Compte d\'essai non encore activé', 'blue');
    }

    // ===== RÉSUMÉ FINAL =====
    header('RÉSUMÉ FINAL');

    console.log(`${colors.bright}Avant dépôt des documents:${colors.reset}`);
    log(`  Score: ${initialCarrier.overallScore}/100`, 'cyan');
    log(`  Documents: ${initialCarrier.documents?.length || 0}/6`, 'cyan');
    log(`  Vigilance: ${initialCarrier.vigilanceStatus}`, 'cyan');

    console.log(`\n${colors.bright}Après dépôt des documents:${colors.reset}`);
    log(`  Score: ${updatedCarrier.overallScore}/100 (${scoreDiff > 0 ? '+' : ''}${scoreDiff})`,
        scoreDiff > 0 ? 'green' : 'yellow');
    log(`  Documents: ${updatedCarrier.documents?.length || 0}/6`, 'green');
    log(`  Vigilance: ${updatedCarrier.vigilanceStatus}`, 'cyan');
    log(`  Alertes: ${updatedCarrier.vigilanceAlerts?.length || 0}`,
        (updatedCarrier.vigilanceAlerts?.length || 0) === 0 ? 'green' : 'yellow');

    console.log(`\n${colors.bright}Affret.IA:${colors.reset}`);
    log(`  Éligible: ${isEligible ? 'Oui' : 'Non'}`, isEligible ? 'green' : 'red');

    console.log('');

  } catch (error) {
    console.error(`\n${colors.red}❌ ERREUR:${colors.reset}`);
    console.error(error.message);
    if (error.response?.data) {
      console.error('Réponse API:', error.response.data);
    }
    process.exit(1);
  }
}

main();
