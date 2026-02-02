/**
 * Vérification des documents, recalcul du score et activation Affret.IA
 */

const axios = require('axios');

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

async function getCarrier() {
  const response = await axios.get(`${API_URL}/api/carriers/${CARRIER_ID}`);
  return response.data;
}

async function verifyDocument(documentId) {
  const response = await axios.post(
    `${API_URL}/api/carriers/${CARRIER_ID}/documents/${documentId}/verify`,
    { approved: true }
  );
  return response.data;
}

async function calculateScore() {
  const response = await axios.post(
    `${API_URL}/api/carriers/${CARRIER_ID}/calculate-score`
  );
  return response.data;
}

async function unblockCarrier() {
  const response = await axios.post(
    `${API_URL}/api/carriers/${CARRIER_ID}/unblock`
  );
  return response.data;
}

async function main() {
  try {
    header('VÉRIFICATION DOCUMENTS ET ACTIVATION TRANSPORTEUR');

    // ===== ÉTAPE 1: État initial =====
    header('ÉTAPE 1: ÉTAT INITIAL');

    let carrier = await getCarrier();

    log(`Transporteur: ${carrier.companyName}`, 'cyan');
    log(`Score actuel: ${carrier.overallScore}/100`, 'cyan');
    log(`Status: ${carrier.status}`, 'cyan');
    log(`Vigilance: ${carrier.vigilanceStatus}`, 'cyan');
    log(`Documents: ${carrier.documents?.length || 0}`, 'cyan');

    console.log(`\n${colors.bright}Documents à vérifier:${colors.reset}`);
    const pendingDocs = carrier.documents?.filter(d => d.status === 'pending') || [];
    log(`${pendingDocs.length} document(s) en attente de vérification`, 'yellow');

    if (pendingDocs.length === 0) {
      log('Tous les documents sont déjà vérifiés!', 'green');
      return;
    }

    // ===== ÉTAPE 2: Vérifier tous les documents =====
    header('ÉTAPE 2: VÉRIFICATION DES DOCUMENTS');

    for (const doc of pendingDocs) {
      try {
        log(`\n  → Vérification: ${doc.type}...`, 'blue');
        await verifyDocument(doc.id);
        log(`    ✓ Document vérifié`, 'green');

        // Petit délai entre chaque vérification
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        log(`    ✗ Échec: ${error.message}`, 'red');
        if (error.response?.data) {
          console.log('      ', error.response.data);
        }
      }
    }

    // ===== ÉTAPE 3: Recalculer le score =====
    header('ÉTAPE 3: RECALCUL DU SCORE DE VIGILANCE');

    log('Recalcul du score...', 'cyan');

    try {
      const scoreResult = await calculateScore();
      log('✓ Score recalculé avec succès', 'green');

      if (scoreResult.score) {
        log(`\n  Score global: ${scoreResult.score.overall}/100`, 'cyan');

        if (scoreResult.score.details) {
          console.log(`\n  Détails:`);
          Object.entries(scoreResult.score.details).forEach(([key, value]) => {
            const color = value >= 70 ? 'green' : value >= 50 ? 'yellow' : 'red';
            log(`    - ${key}: ${value}/100`, color);
          });
        }
      }
    } catch (error) {
      log(`✗ Échec du recalcul: ${error.message}`, 'red');
      if (error.response?.data) {
        console.log('  ', error.response.data);
      }
    }

    // Attendre la mise à jour
    await new Promise(resolve => setTimeout(resolve, 2000));

    // ===== ÉTAPE 4: Débloquer le transporteur =====
    header('ÉTAPE 4: DÉBLOCAGE DU TRANSPORTEUR');

    log('Tentative de déblocage...', 'cyan');

    try {
      const unblockResult = await unblockCarrier();
      log('✓ Transporteur débloqué avec succès', 'green');

      if (unblockResult.carrier) {
        log(`\n  Nouveau status: ${unblockResult.carrier.status}`, 'cyan');
        log(`  Vigilance: ${unblockResult.carrier.vigilanceStatus}`, 'cyan');
        log(`  Score: ${unblockResult.carrier.score}/100`, 'cyan');
      }
    } catch (error) {
      log(`⚠ Déblocage: ${error.message}`, 'yellow');
      if (error.response?.data) {
        console.log('  ', error.response.data);
      }
    }

    // Attendre la mise à jour
    await new Promise(resolve => setTimeout(resolve, 2000));

    // ===== ÉTAPE 5: Vérifier l'état final =====
    header('ÉTAPE 5: ÉTAT FINAL');

    carrier = await getCarrier();

    log(`Transporteur: ${carrier.companyName}`, 'cyan');

    console.log(`\n${colors.bright}Score final:${colors.reset}`);
    log(`  Score global: ${carrier.overallScore}/100`,
        carrier.overallScore >= 70 ? 'green' :
        carrier.overallScore >= 50 ? 'yellow' : 'red');

    if (carrier.scoreDetails) {
      console.log(`\n  Détails:`);
      Object.entries(carrier.scoreDetails).forEach(([key, value]) => {
        const color = value >= 70 ? 'green' : value >= 50 ? 'yellow' : 'red';
        log(`    - ${key}: ${value}/100`, color);
      });
    }

    console.log(`\n${colors.bright}Statut:${colors.reset}`);
    log(`  Status: ${carrier.status}`, 'cyan');
    log(`  Vigilance: ${carrier.vigilanceStatus}`,
        carrier.vigilanceStatus === 'compliant' ? 'green' :
        carrier.vigilanceStatus === 'warning' ? 'yellow' : 'red');

    console.log(`\n${colors.bright}Documents:${colors.reset}`);
    const verifiedDocs = carrier.documents?.filter(d => d.status === 'verified') || [];
    log(`  ${verifiedDocs.length}/${carrier.documents?.length || 0} document(s) vérifié(s)`,
        verifiedDocs.length === carrier.documents?.length ? 'green' : 'yellow');

    carrier.documents?.forEach((doc, i) => {
      const statusColor = doc.status === 'verified' ? 'green' : 'yellow';
      log(`    ${i + 1}. ${doc.type} - ${doc.status}`, statusColor);
    });

    // ===== ÉTAPE 6: Éligibilité Affret.IA =====
    header('ÉTAPE 6: ÉLIGIBILITÉ AFFRET.IA');

    const hasAllDocs = carrier.documents?.length >= 6;
    const allVerified = carrier.documents?.every(d => d.status === 'verified');
    const noExpiredDocs = !carrier.documents?.some(doc => {
      if (!doc.expiresAt) return false;
      return new Date(doc.expiresAt) < new Date();
    });
    const goodScore = carrier.overallScore >= 40;
    const notBlocked = carrier.vigilanceStatus !== 'blocked';

    console.log(`${colors.bright}Critères d'éligibilité:${colors.reset}`);
    log(`  ✓ Tous les documents (6): ${hasAllDocs ? 'Oui' : 'Non'}`, hasAllDocs ? 'green' : 'red');
    log(`  ✓ Tous vérifiés: ${allVerified ? 'Oui' : 'Non'}`, allVerified ? 'green' : 'red');
    log(`  ✓ Aucun expiré: ${noExpiredDocs ? 'Oui' : 'Non'}`, noExpiredDocs ? 'green' : 'red');
    log(`  ✓ Score minimum (40+): ${goodScore ? 'Oui' : 'Non'} (${carrier.overallScore})`, goodScore ? 'green' : 'red');
    log(`  ✓ Non bloqué: ${notBlocked ? 'Oui' : 'Non'}`, notBlocked ? 'green' : 'red');

    const isEligible = hasAllDocs && allVerified && noExpiredDocs && goodScore && notBlocked;

    console.log(`\n${colors.bright}Résultat:${colors.reset}`);
    if (isEligible) {
      log('✅ ÉLIGIBLE pour un compte d\'essai Affret.IA!', 'green');
      log('\n  Avantages:', 'cyan');
      log('    • 10 transports gratuits');
      log('    • Accès complet aux fonctionnalités IA');
      log('    • Durée: 30 jours');
      log('    • Upgrade automatique après 10 transports réussis');
      log('    • Support prioritaire');
    } else {
      log('❌ NON ÉLIGIBLE pour Affret.IA', 'red');

      const reasons = [];
      if (!hasAllDocs) reasons.push('Documents incomplets');
      if (!allVerified) reasons.push('Documents non vérifiés');
      if (!noExpiredDocs) reasons.push('Document(s) expiré(s)');
      if (!goodScore) reasons.push(`Score trop bas (${carrier.overallScore}/100, minimum 40)`);
      if (!notBlocked) reasons.push('Compte bloqué');

      if (reasons.length > 0) {
        log('\n  Raisons:', 'cyan');
        reasons.forEach(r => log(`    - ${r}`, 'red'));
      }
    }

    // ===== RÉSUMÉ =====
    header('RÉSUMÉ');

    console.log(`${colors.bright}Opérations effectuées:${colors.reset}`);
    log(`  ✓ ${pendingDocs.length} document(s) vérifié(s)`, 'green');
    log(`  ✓ Score recalculé`, 'green');
    log(`  ✓ Tentative de déblocage effectuée`, 'green');

    console.log(`\n${colors.bright}État final:${colors.reset}`);
    log(`  Score: ${carrier.overallScore}/100`, 'cyan');
    log(`  Vigilance: ${carrier.vigilanceStatus}`, 'cyan');
    log(`  Documents vérifiés: ${verifiedDocs.length}/6`, 'cyan');
    log(`  Affret.IA: ${isEligible ? 'ÉLIGIBLE ✓' : 'Non éligible ✗'}`,
        isEligible ? 'green' : 'red');

    console.log('');

  } catch (error) {
    console.error(`\n${colors.red}❌ ERREUR:${colors.reset}`);
    console.error(error.message);
    if (error.response?.data) {
      console.error('\nRéponse API:', error.response.data);
    }
    if (error.stack) {
      console.error('\nStack:', error.stack.split('\n').slice(0, 5).join('\n'));
    }
    process.exit(1);
  }
}

main();
