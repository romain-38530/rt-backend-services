/**
 * Test des étapes 3-7 du workflow documents
 * Utilise un carrier existant
 */

const axios = require('axios');

const CARRIER_ID = '697f5a2b1980ef959ce78b67';
const AUTHZ_API = 'http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com';

// Couleurs pour le terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(type, message) {
  const prefix = {
    info: `${colors.blue}ℹ${colors.reset}`,
    success: `${colors.green}✓${colors.reset}`,
    error: `${colors.red}✗${colors.reset}`,
    warn: `${colors.yellow}⚠${colors.reset}`
  }[type] || '';

  console.log(`${prefix} ${message}`);
}

async function testWorkflow() {
  console.log(`\n${colors.bright}${colors.cyan}=== TEST WORKFLOW DOCUMENTS TRANSPORTEUR ===${colors.reset}\n`);
  console.log(`Carrier ID: ${CARRIER_ID}\n`);

  try {
    // ÉTAPE 1: Récupérer les infos du carrier
    log('info', 'Récupération des informations du transporteur...');
    const carrierResponse = await axios.get(`${AUTHZ_API}/api/carriers/${CARRIER_ID}`);
    const carrier = carrierResponse.data.carrier;

    log('success', `Transporteur trouvé: ${carrier.companyName}`);
    log('info', `  Status: ${carrier.status}`);
    log('info', `  Vigilance: ${carrier.vigilanceStatus}`);
    log('info', `  Bloqué: ${carrier.isBlocked ? 'Oui' : 'Non'}`);
    if (carrier.blockedReason) {
      log('warn', `  Raison: ${carrier.blockedReason}`);
    }

    // ÉTAPE 2: Les documents sont déjà inclus dans la réponse carrier
    console.log(`\n${colors.bright}DOCUMENTS${colors.reset}`);
    const documents = carrier.documents || [];

    log('info', `${documents.length} document(s) trouvé(s)`);

    documents.forEach((doc, index) => {
      console.log(`\n  ${index + 1}. ${doc.type}`);
      console.log(`     Status: ${doc.status}`);
      console.log(`     URL: ${doc.url ? 'Oui' : 'Non'}`);
      if (doc.expiryDate) {
        console.log(`     Expiration: ${doc.expiryDate}`);
      }
      if (doc.ocrData) {
        console.log(`     OCR: ${doc.ocrData.confidence || 'N/A'}`);
      }
    });

    // ÉTAPE 3: Vérifier les alertes de vigilance
    console.log(`\n${colors.bright}ALERTES${colors.reset}`);
    try {
      const alertsResponse = await axios.get(`${AUTHZ_API}/api/vigilance/alerts?carrierId=${CARRIER_ID}`);
      const alerts = alertsResponse.data.alerts || [];

      log('info', `${alerts.length} alerte(s) active(s)`);

      alerts.forEach((alert, index) => {
        const levelColor = {
          info: colors.blue,
          warning: colors.yellow,
          critical: colors.red,
          blocked: colors.red
        }[alert.severity] || colors.reset;

        console.log(`\n  ${index + 1}. ${levelColor}${alert.type}${colors.reset}`);
        console.log(`     Sévérité: ${alert.severity}`);
        console.log(`     Message: ${alert.message}`);
        if (alert.expiryDate) {
          console.log(`     Expiration: ${alert.expiryDate}`);
        }
      });
    } catch (error) {
      log('warn', `Endpoint alertes non disponible: ${error.message}`);
    }

    // ÉTAPE 4: Vérifier le score de vigilance
    console.log(`\n${colors.bright}SCORE DE VIGILANCE${colors.reset}`);
    log('info', `Score actuel: ${carrier.score}/100`);
    log('info', `Status: ${carrier.vigilanceStatus}`);

    // Calculer les documents manquants
    const requiredDocs = [
      'licenceTransport',
      'assuranceRC',
      'assuranceMarchandises',
      'kbis',
      'attestationURSSAF',
      'rib'
    ];

    const existingDocTypes = documents.map(d => d.type);
    const missingDocs = requiredDocs.filter(type => !existingDocTypes.includes(type));

    if (missingDocs.length > 0) {
      console.log(`\n  ${colors.yellow}Documents manquants (${missingDocs.length}):${colors.reset}`);
      missingDocs.forEach(doc => {
        console.log(`    - ${doc}`);
      });
    }

    // Calculer les documents expirés ou à expirer
    const now = new Date();
    const expiringSoon = documents.filter(doc => {
      if (!doc.expiryDate) return false;
      const expiryDate = new Date(doc.expiryDate);
      const daysUntilExpiry = (expiryDate - now) / (1000 * 60 * 60 * 24);
      return daysUntilExpiry < 30 && daysUntilExpiry > 0;
    });

    const expired = documents.filter(doc => {
      if (!doc.expiryDate) return false;
      const expiryDate = new Date(doc.expiryDate);
      return expiryDate < now;
    });

    if (expiringSoon.length > 0) {
      console.log(`\n  ${colors.yellow}Documents expirant bientôt (${expiringSoon.length}):${colors.reset}`);
      expiringSoon.forEach(doc => {
        const expiryDate = new Date(doc.expiryDate);
        const daysUntilExpiry = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));
        console.log(`    - ${doc.type}: ${daysUntilExpiry} jours`);
      });
    }

    if (expired.length > 0) {
      console.log(`\n  ${colors.red}Documents expirés (${expired.length}):${colors.reset}`);
      expired.forEach(doc => {
        const expiryDate = new Date(doc.expiryDate);
        const daysExpired = Math.floor((now - expiryDate) / (1000 * 60 * 60 * 24));
        console.log(`    - ${doc.type}: expiré depuis ${daysExpired} jours`);
      });
    }

    // ÉTAPE 5: Vérifier l'éligibilité Affret.IA
    console.log(`\n${colors.bright}AFFRET.IA${colors.reset}`);

    const allRequiredDocsPresent = missingDocs.length === 0;
    const noExpiredDocs = expired.length === 0;
    const eligible = allRequiredDocsPresent && noExpiredDocs && !carrier.isBlocked;

    if (eligible) {
      log('success', 'Éligible pour un compte d\'essai Affret.IA');
      log('info', '  - 10 transports gratuits');
      log('info', '  - 30 jours d\'essai');
    } else {
      log('warn', 'Non éligible pour Affret.IA');
      if (!allRequiredDocsPresent) {
        log('info', `  Raison: ${missingDocs.length} document(s) manquant(s)`);
      }
      if (expired.length > 0) {
        log('info', `  Raison: ${expired.length} document(s) expiré(s)`);
      }
      if (carrier.isBlocked) {
        log('info', `  Raison: Compte bloqué (${carrier.blockedReason})`);
      }
    }

    // RÉSUMÉ
    console.log(`\n${colors.bright}${colors.cyan}=== RÉSUMÉ ===${colors.reset}\n`);
    console.log(`Transporteur: ${carrier.companyName}`);
    console.log(`Status: ${carrier.status}`);
    console.log(`Documents: ${documents.length}/${requiredDocs.length}`);
    console.log(`Score vigilance: ${carrier.score}/100`);
    console.log(`Bloqué: ${carrier.isBlocked ? 'Oui' : 'Non'}`);
    console.log(`Affret.IA: ${eligible ? 'Éligible' : 'Non éligible'}`);
    console.log('');

  } catch (error) {
    log('error', `Erreur: ${error.message}`);
    if (error.response?.data) {
      console.log(JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testWorkflow();
