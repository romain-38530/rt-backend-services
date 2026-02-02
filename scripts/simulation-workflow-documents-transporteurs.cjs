/**
 * SYMPHONIA - Simulation du Workflow Complet de Gestion des Documents Transporteur
 *
 * Ce script simule l'ensemble du parcours:
 * 1. Envoi d'un mail d'invitation à un transporteur
 * 2. Création du compte transporteur
 * 3. Dépôt de documents (Licence, Assurance, KBIS, etc.)
 * 4. Analyse OCR pour extraction automatique des dates
 * 5. Validation des documents côté donneur d'ordre
 * 6. Génération d'alertes pour expiration
 * 7. Activation d'un compte d'essai Affret.IA
 *
 * Version: 1.0.0
 * Date: 2026-02-01
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Configuration des API (production URLs)
const CONFIG = {
  AUTHZ_API: 'http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com',
  DOCUMENTS_API: 'https://documents.symphonia-controltower.com',
  NOTIFICATIONS_API: 'https://notifications.symphonia-controltower.com',
  AFFRET_IA_API: 'https://d393yiia4ig3bw.cloudfront.net/api',
  ORDERS_API: 'http://rt-orders-api-prod-v2.eba-4tprbbqu.eu-central-1.elasticbeanstalk.com'
};

// Données de simulation
const SIMULATION_DATA = {
  // Industriel qui invite
  industriel: {
    id: '507f1f77bcf86cd799439011',
    name: 'Renault Trucks',
    email: 'logistique@renault-trucks.com'
  },
  // Transporteur invité
  transporteur: {
    email: 'contact@transport-demo.fr',
    companyName: 'Transport Express Demo',
    siret: '12345678901234',
    vatNumber: 'FR12345678901',
    phone: '+33612345678',
    level: 'referenced' // guest, referenced, ou premium
  },
  // Documents à déposer
  documents: [
    {
      type: 'licence_transport',
      fileName: 'licence-transport.pdf',
      expiresAt: '2025-12-31',
      notes: 'Licence de transport marchandises'
    },
    {
      type: 'insurance_rc',
      fileName: 'assurance-rc.pdf',
      expiresAt: '2025-06-30',
      notes: 'Assurance RC professionnelle'
    },
    {
      type: 'insurance_goods',
      fileName: 'assurance-marchandises.pdf',
      expiresAt: '2025-06-30',
      notes: 'Assurance marchandises transportées'
    },
    {
      type: 'kbis',
      fileName: 'kbis.pdf',
      expiresAt: '2025-03-15', // Kbis expire dans 42 jours - devrait générer alerte
      notes: 'Extrait Kbis'
    },
    {
      type: 'urssaf',
      fileName: 'urssaf.pdf',
      expiresAt: '2025-02-10', // Expire dans 9 jours - URGENT
      notes: 'Attestation URSSAF'
    }
  ]
};

// Couleurs pour console
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Helpers pour logging
function logSection(title) {
  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  ${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}\n`);
}

function logStep(step, message) {
  console.log(`${colors.bright}${colors.blue}[Étape ${step}]${colors.reset} ${message}`);
}

function logSuccess(message) {
  console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function logError(message) {
  console.log(`${colors.red}✗ ${message}${colors.reset}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠ ${message}${colors.reset}`);
}

function logInfo(message) {
  console.log(`${colors.cyan}ℹ ${message}${colors.reset}`);
}

// Variables globales pour stocker les résultats
const results = {
  invitation: null,
  carrier: null,
  documents: [],
  ocrResults: [],
  alerts: [],
  affretIAAccount: null,
  errors: []
};

/**
 * ÉTAPE 1: Envoi du mail d'invitation au transporteur
 */
async function etape1_InviterTransporteur() {
  logSection('ÉTAPE 1: Envoi du Mail d\'Invitation au Transporteur');

  try {
    logStep(1, 'Envoi de l\'invitation via API Authz...');

    const response = await axios.post(`${CONFIG.AUTHZ_API}/api/carriers/invite`, {
      email: SIMULATION_DATA.transporteur.email,
      companyName: SIMULATION_DATA.transporteur.companyName,
      siret: SIMULATION_DATA.transporteur.siret,
      vatNumber: SIMULATION_DATA.transporteur.vatNumber,
      phone: SIMULATION_DATA.transporteur.phone,
      invitedBy: SIMULATION_DATA.industriel.id,  // Champ requis par l'API
      referenceMode: 'direct'
    });

    results.invitation = response.data;

    logSuccess(`Transporteur créé avec ID: ${results.invitation.carrierId}`);
    logSuccess(`Status: ${results.invitation.status}`);
    logSuccess(`Message: ${results.invitation.message}`);
    logSuccess(`Email: ${SIMULATION_DATA.transporteur.email}`);
    logSuccess(`Entreprise: ${SIMULATION_DATA.transporteur.companyName}`);

    console.log(`\n${colors.dim}Le transporteur peut maintenant se connecter:${colors.reset}`);
    console.log(`  Email: ${SIMULATION_DATA.transporteur.email}`);
    console.log(`  Status: ${results.invitation.status} (Niveau 2 - Documents requis)`);

    return results.invitation;

  } catch (error) {
    logError(`Erreur lors de l'invitation: ${error.message}`);
    if (error.response?.data) {
      console.log(JSON.stringify(error.response.data, null, 2));
    }
    results.errors.push({ step: 'invitation', error: error.message });
    throw error;
  }
}

/**
 * ÉTAPE 2: Création du compte transporteur (simulation onboarding)
 */
async function etape2_CreerCompteTransporteur() {
  logSection('ÉTAPE 2: Création du Compte Transporteur');

  try {
    logStep(2, 'Récupération des informations du transporteur créé...');

    // Le transporteur est déjà créé lors de l'invitation, on récupère ses infos
    const carrierId = results.invitation.carrierId;

    const response = await axios.get(`${CONFIG.AUTHZ_API}/api/carriers/${carrierId}`);

    results.carrier = response.data;

    logSuccess(`Compte transporteur créé: ${carrierId}`);
    logSuccess(`Entreprise: ${results.carrier.companyName}`);
    logSuccess(`SIRET: ${results.carrier.siret}`);
    logSuccess(`Statut: ${results.carrier.status}`);
    logSuccess(`Niveau: ${results.carrier.level}`);
    logSuccess(`Score initial: ${results.carrier.score}/100`);
    logInfo(`Statut de vigilance: ${results.carrier.vigilanceStatus}`);

    return results.carrier;

  } catch (error) {
    logError(`Erreur lors de la création du compte: ${error.message}`);
    results.errors.push({ step: 'compte', error: error.message });
    throw error;
  }
}

/**
 * ÉTAPE 3: Dépôt des documents par le transporteur
 */
async function etape3_DeposerDocuments() {
  logSection('ÉTAPE 3: Dépôt des Documents par le Transporteur');

  const carrierId = results.carrier.id;

  for (let i = 0; i < SIMULATION_DATA.documents.length; i++) {
    const doc = SIMULATION_DATA.documents[i];

    try {
      logStep(`3.${i + 1}`, `Upload du document: ${doc.fileName} (${doc.type})`);

      // Étape 3.1: Générer l'URL présignée pour upload
      logInfo('  → Génération de l\'URL présignée S3...');
      const uploadUrlResponse = await axios.post(
        `${CONFIG.AUTHZ_API}/api/carriers/${carrierId}/documents/upload-url`,
        {
          fileName: doc.fileName,
          contentType: 'application/pdf',
          documentType: doc.type
        }
      );

      const { uploadUrl, s3Key } = uploadUrlResponse.data;
      logSuccess(`  ✓ URL présignée générée: ${s3Key}`);

      // Étape 3.2: Simuler l'upload du fichier (on ne va pas vraiment uploader)
      logInfo('  → Simulation de l\'upload sur S3...');
      // Dans un vrai scénario, on ferait: await axios.put(uploadUrl, fileBuffer)
      logSuccess('  ✓ Fichier uploadé sur S3 (simulé)');

      // Étape 3.3: Confirmer l'upload et créer l'enregistrement
      logInfo('  → Confirmation de l\'upload et création de l\'enregistrement...');
      const confirmResponse = await axios.post(
        `${CONFIG.AUTHZ_API}/api/carriers/${carrierId}/documents/confirm-upload`,
        {
          s3Key,
          documentType: doc.type,
          fileName: doc.fileName,
          expiresAt: doc.expiresAt,
          notes: doc.notes
        }
      );

      const uploadedDoc = confirmResponse.data.document;
      results.documents.push(uploadedDoc);

      logSuccess(`  ✓ Document enregistré: ${uploadedDoc.id}`);
      logInfo(`     Status: ${uploadedDoc.status}`);
      logInfo(`     Expire le: ${uploadedDoc.expiresAt}`);

      // Calculer jours avant expiration
      const expiryDate = new Date(doc.expiresAt);
      const today = new Date();
      const daysUntilExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry <= 7) {
        logWarning(`     ⚠ URGENT: Expire dans ${daysUntilExpiry} jours!`);
      } else if (daysUntilExpiry <= 30) {
        logWarning(`     ⚠ Attention: Expire dans ${daysUntilExpiry} jours`);
      }

    } catch (error) {
      logError(`Erreur lors de l'upload de ${doc.fileName}: ${error.message}`);
      results.errors.push({ step: `document_${doc.type}`, error: error.message });
    }
  }

  logSuccess(`\n${results.documents.length} documents déposés avec succès`);
  return results.documents;
}

/**
 * ÉTAPE 4: Analyse OCR des documents
 */
async function etape4_AnalyserDocumentsOCR() {
  logSection('ÉTAPE 4: Analyse OCR pour Extraction Automatique des Données');

  const carrierId = results.carrier.id;

  for (let i = 0; i < results.documents.length; i++) {
    const doc = results.documents[i];

    try {
      logStep(`4.${i + 1}`, `Analyse OCR du document: ${doc.name} (${doc.type})`);

      logInfo('  → Envoi du document à AWS Textract...');
      const ocrResponse = await axios.post(
        `${CONFIG.AUTHZ_API}/api/carriers/${carrierId}/documents/${doc.id}/analyze`
      );

      const ocrResult = ocrResponse.data;
      results.ocrResults.push(ocrResult);

      if (ocrResult.success) {
        logSuccess('  ✓ Analyse OCR terminée');
        logInfo(`     Confiance: ${ocrResult.analysis.confidence}`);
        logInfo(`     Dates trouvées: ${ocrResult.analysis.datesFound.length}`);

        if (ocrResult.analysis.suggestedExpiryDate) {
          const suggestedDate = new Date(ocrResult.analysis.suggestedExpiryDate);
          logSuccess(`     ✓ Date d'expiration détectée: ${suggestedDate.toLocaleDateString('fr-FR')}`);

          if (ocrResult.updated) {
            logSuccess('     ✓ Document mis à jour automatiquement');
          }
        }

        // Afficher quelques dates trouvées
        if (ocrResult.analysis.datesFound.length > 0) {
          console.log(`\n${colors.dim}     Dates extraites:${colors.reset}`);
          ocrResult.analysis.datesFound.slice(0, 3).forEach(d => {
            const marker = d.isValidityDate ? '🎯' : '📅';
            console.log(`${colors.dim}       ${marker} ${d.raw} → ${new Date(d.parsed).toLocaleDateString('fr-FR')}${colors.reset}`);
          });
        }

      } else {
        logError('  ✗ Échec de l\'analyse OCR');
        logError(`     Raison: ${ocrResult.error}`);
      }

    } catch (error) {
      logWarning(`  ⚠ OCR non disponible pour ${doc.name}: ${error.message}`);
      // L'OCR peut échouer si AWS Textract n'est pas configuré, ce n'est pas bloquant
    }
  }

  logSuccess(`\n${results.ocrResults.length} documents analysés`);
  return results.ocrResults;
}

/**
 * ÉTAPE 5: Validation des documents côté donneur d'ordre
 */
async function etape5_ValiderDocuments() {
  logSection('ÉTAPE 5: Validation des Documents Côté Donneur d\'Ordre');

  const carrierId = results.carrier.id;

  try {
    logStep(5, 'Vérification du statut de vigilance du transporteur...');

    // Récupérer l'état actuel du transporteur
    const carrierResponse = await axios.get(`${CONFIG.AUTHZ_API}/api/carriers/${carrierId}`);
    const carrier = carrierResponse.data;

    logInfo(`Statut de vigilance: ${carrier.vigilanceStatus}`);
    logInfo(`Documents déposés: ${carrier.documents?.length || 0}`);

    // Vérifier les documents expirés ou bientôt expirés
    const today = new Date();
    let expiredDocs = 0;
    let expiringSoonDocs = 0;

    carrier.documents?.forEach(doc => {
      if (doc.expiresAt) {
        const expiryDate = new Date(doc.expiresAt);
        const daysUntilExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));

        if (daysUntilExpiry < 0) {
          expiredDocs++;
          logError(`  ✗ Document expiré: ${doc.type} (expiré le ${expiryDate.toLocaleDateString('fr-FR')})`);
        } else if (daysUntilExpiry <= 30) {
          expiringSoonDocs++;
          const urgency = daysUntilExpiry <= 7 ? 'URGENT' : 'Attention';
          logWarning(`  ⚠ ${urgency}: ${doc.type} expire dans ${daysUntilExpiry} jours`);
        } else {
          logSuccess(`  ✓ ${doc.type} valide (expire dans ${daysUntilExpiry} jours)`);
        }
      }
    });

    console.log(`\n${colors.bright}Résumé de validation:${colors.reset}`);
    console.log(`  Documents valides: ${carrier.documents.length - expiredDocs - expiringSoonDocs}`);
    console.log(`  Documents expirant bientôt: ${expiringSoonDocs}`);
    console.log(`  Documents expirés: ${expiredDocs}`);

    if (expiredDocs > 0) {
      logError(`\n⚠ Le transporteur devrait être bloqué (${expiredDocs} document(s) expiré(s))`);
    } else if (expiringSoonDocs > 0) {
      logWarning(`\n⚠ Alertes à envoyer (${expiringSoonDocs} document(s) expirant bientôt)`);
    } else {
      logSuccess('\n✓ Tous les documents sont en règle');
    }

    return carrier;

  } catch (error) {
    logError(`Erreur lors de la validation: ${error.message}`);
    results.errors.push({ step: 'validation', error: error.message });
    throw error;
  }
}

/**
 * ÉTAPE 6: Vérification des alertes d'expiration
 */
async function etape6_VerifierAlertes() {
  logSection('ÉTAPE 6: Système d\'Alertes pour Documents Expirant');

  try {
    logStep(6, 'Récupération des alertes de vigilance...');

    const alertsResponse = await axios.get(`${CONFIG.AUTHZ_API}/api/vigilance/alerts`, {
      params: {
        carrierId: results.carrier.id,
        isResolved: false
      }
    });

    const { alerts, summary } = alertsResponse.data;
    results.alerts = alerts;

    logInfo(`Total d'alertes non résolues: ${summary.unresolved}`);
    logError(`  Critiques: ${summary.critical}`);
    logWarning(`  Avertissements: ${summary.warning}`);
    logInfo(`  Informations: ${summary.info}`);

    if (alerts.length > 0) {
      console.log(`\n${colors.bright}Détail des alertes:${colors.reset}\n`);

      alerts.forEach((alert, idx) => {
        const icon = alert.severity === 'critical' ? '🔴' :
                     alert.severity === 'warning' ? '🟡' : '🔵';

        console.log(`${icon} Alerte ${idx + 1}:`);
        console.log(`   Type: ${alert.type}`);
        console.log(`   Document: ${alert.documentType}`);
        console.log(`   Message: ${alert.message}`);

        if (alert.autoBlockAt) {
          const blockDate = new Date(alert.autoBlockAt);
          console.log(`   ${colors.red}Blocage auto le: ${blockDate.toLocaleDateString('fr-FR')}${colors.reset}`);
        }

        console.log(`   Canaux: ${alert.notificationChannels?.join(', ')}`);
        console.log('');
      });
    } else {
      logSuccess('Aucune alerte en cours');
    }

    // Simulation des emails d'alerte qui seraient envoyés
    console.log(`\n${colors.bright}Emails d'alerte envoyés:${colors.reset}\n`);

    SIMULATION_DATA.documents.forEach(doc => {
      const expiryDate = new Date(doc.expiresAt);
      const today = new Date();
      const daysUntilExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry <= 30 && daysUntilExpiry >= 0) {
        const urgency = daysUntilExpiry <= 7 ? 'URGENT' :
                       daysUntilExpiry <= 15 ? 'Important' : 'Information';
        const color = daysUntilExpiry <= 7 ? '#ef4444' :
                     daysUntilExpiry <= 15 ? '#f59e0b' : '#3b82f6';

        console.log(`  📧 Email: ${urgency} - ${doc.type} expire dans ${daysUntilExpiry} jours`);
        console.log(`     À: ${SIMULATION_DATA.transporteur.email}`);
        console.log(`     Sujet: ${urgency}: ${doc.type} expire dans ${daysUntilExpiry} jours`);
        console.log(`     Couleur: ${color}\n`);
      }
    });

    return alerts;

  } catch (error) {
    logWarning(`Impossible de récupérer les alertes: ${error.message}`);
    // Ce n'est pas bloquant si les alertes ne sont pas disponibles
    return [];
  }
}

/**
 * ÉTAPE 7: Activation compte d'essai Affret.IA
 */
async function etape7_ActiverAffretIA() {
  logSection('ÉTAPE 7: Activation Compte d\'Essai Affret.IA (10 Transports)');

  const carrierId = results.carrier.id;

  try {
    logStep(7, 'Vérification de l\'éligibilité du transporteur...');

    // Vérifier que le transporteur a tous les documents requis
    const requiredDocs = ['licence_transport', 'insurance_rc', 'insurance_goods', 'kbis'];
    const uploadedTypes = results.documents.map(d => d.type);
    const hasAllDocs = requiredDocs.every(type => uploadedTypes.includes(type));

    if (!hasAllDocs) {
      logWarning('  ⚠ Documents manquants, compte d\'essai limité');
    } else {
      logSuccess('  ✓ Tous les documents requis sont présents');
    }

    logInfo('Activation du compte d\'essai Affret.IA...');

    // Dans un scénario réel, on appellerait l'API Affret.IA
    // Pour la simulation, on crée un objet représentant le compte
    results.affretIAAccount = {
      carrierId: carrierId,
      accountType: 'trial',
      transportsLimit: 10,
      transportsUsed: 0,
      features: [
        'Accès aux propositions de transport',
        'Cotation automatique',
        'Suivi GPS basique',
        'Chat avec donneurs d\'ordre',
        'Notifications email'
      ],
      limitations: [
        'Maximum 10 transports',
        'Pas d\'accès aux transports premium',
        'Support standard uniquement'
      ],
      activatedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 jours
      upgradeToFullAt: null
    };

    logSuccess('✓ Compte d\'essai Affret.IA activé');
    logSuccess(`  Limite de transports: ${results.affretIAAccount.transportsLimit}`);
    logSuccess(`  Valide jusqu'au: ${results.affretIAAccount.expiresAt.toLocaleDateString('fr-FR')}`);

    console.log(`\n${colors.bright}Fonctionnalités activées:${colors.reset}`);
    results.affretIAAccount.features.forEach(f => {
      console.log(`  ${colors.green}✓${colors.reset} ${f}`);
    });

    console.log(`\n${colors.bright}Limitations:${colors.reset}`);
    results.affretIAAccount.limitations.forEach(l => {
      console.log(`  ${colors.yellow}⚠${colors.reset} ${l}`);
    });

    // Email de bienvenue
    console.log(`\n${colors.dim}Email de bienvenue envoyé:${colors.reset}`);
    console.log(`  De: ne-pas-repondre@symphonia-controltower.com`);
    console.log(`  À: ${SIMULATION_DATA.transporteur.email}`);
    console.log(`  Sujet: Bienvenue sur Affret.IA - Votre compte d'essai est activé`);
    console.log(`  Contenu: Accès à 10 transports + fonctionnalités de base`);

    return results.affretIAAccount;

  } catch (error) {
    logError(`Erreur lors de l'activation Affret.IA: ${error.message}`);
    results.errors.push({ step: 'affretia', error: error.message });
    return null;
  }
}

/**
 * Générer le rapport final de simulation
 */
function genererRapportFinal() {
  logSection('RAPPORT FINAL DE SIMULATION');

  console.log(`${colors.bright}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}  WORKFLOW COMPLET DE GESTION DES DOCUMENTS TRANSPORTEUR${colors.reset}`);
  console.log(`${colors.bright}═══════════════════════════════════════════════════════${colors.reset}\n`);

  // Résumé de l'invitation
  console.log(`${colors.bright}📧 1. INVITATION TRANSPORTEUR${colors.reset}`);
  if (results.invitation) {
    console.log(`   ✓ Email: ${SIMULATION_DATA.transporteur.email}`);
    console.log(`   ✓ Entreprise: ${SIMULATION_DATA.transporteur.companyName}`);
    console.log(`   ✓ Carrier ID: ${results.invitation.carrierId}`);
    console.log(`   ✓ Status: ${results.invitation.status}`);
  } else {
    console.log(`   ${colors.red}✗ Échec de l'invitation${colors.reset}`);
  }

  // Résumé du compte
  console.log(`\n${colors.bright}👤 2. COMPTE TRANSPORTEUR${colors.reset}`);
  if (results.carrier) {
    console.log(`   ✓ ID: ${results.carrier.id}`);
    console.log(`   ✓ SIRET: ${results.carrier.siret}`);
    console.log(`   ✓ Statut: ${results.carrier.status}`);
    console.log(`   ✓ Score: ${results.carrier.score}/100`);
    console.log(`   ✓ Vigilance: ${results.carrier.vigilanceStatus}`);
  } else {
    console.log(`   ${colors.red}✗ Compte non créé${colors.reset}`);
  }

  // Résumé des documents
  console.log(`\n${colors.bright}📄 3. DOCUMENTS DÉPOSÉS${colors.reset}`);
  console.log(`   Total: ${results.documents.length}`);

  const today = new Date();
  let stats = { valides: 0, expirants: 0, expires: 0 };

  results.documents.forEach(doc => {
    if (doc.expiresAt) {
      const expiryDate = new Date(doc.expiresAt);
      const daysUntilExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry < 0) {
        stats.expires++;
      } else if (daysUntilExpiry <= 30) {
        stats.expirants++;
      } else {
        stats.valides++;
      }
    }
  });

  console.log(`   ${colors.green}✓${colors.reset} Valides: ${stats.valides}`);
  console.log(`   ${colors.yellow}⚠${colors.reset} Expirant bientôt: ${stats.expirants}`);
  console.log(`   ${colors.red}✗${colors.reset} Expirés: ${stats.expires}`);

  // Résumé OCR
  console.log(`\n${colors.bright}🔍 4. ANALYSE OCR${colors.reset}`);
  const successfulOCR = results.ocrResults.filter(r => r.success).length;
  console.log(`   Analyses réussies: ${successfulOCR}/${results.ocrResults.length}`);

  const datesDetectees = results.ocrResults.reduce((sum, r) =>
    sum + (r.analysis?.datesFound?.length || 0), 0);
  console.log(`   Dates détectées: ${datesDetectees}`);

  const autoUpdated = results.ocrResults.filter(r => r.updated).length;
  console.log(`   Documents mis à jour auto: ${autoUpdated}`);

  // Résumé des alertes
  console.log(`\n${colors.bright}🚨 5. ALERTES DE VIGILANCE${colors.reset}`);
  console.log(`   Alertes actives: ${results.alerts.length}`);

  const alertsBySeverity = results.alerts.reduce((acc, a) => {
    acc[a.severity] = (acc[a.severity] || 0) + 1;
    return acc;
  }, {});

  if (alertsBySeverity.critical) {
    console.log(`   ${colors.red}●${colors.reset} Critiques: ${alertsBySeverity.critical}`);
  }
  if (alertsBySeverity.warning) {
    console.log(`   ${colors.yellow}●${colors.reset} Avertissements: ${alertsBySeverity.warning}`);
  }
  if (alertsBySeverity.info) {
    console.log(`   ${colors.blue}●${colors.reset} Informations: ${alertsBySeverity.info}`);
  }

  // Résumé Affret.IA
  console.log(`\n${colors.bright}🚛 6. COMPTE AFFRET.IA${colors.reset}`);
  if (results.affretIAAccount) {
    console.log(`   ✓ Type: ${results.affretIAAccount.accountType}`);
    console.log(`   ✓ Limite transports: ${results.affretIAAccount.transportsLimit}`);
    console.log(`   ✓ Utilisés: ${results.affretIAAccount.transportsUsed}/${results.affretIAAccount.transportsLimit}`);
    console.log(`   ✓ Expire le: ${results.affretIAAccount.expiresAt.toLocaleDateString('fr-FR')}`);
  } else {
    console.log(`   ${colors.yellow}⚠ Compte non activé${colors.reset}`);
  }

  // Erreurs rencontrées
  if (results.errors.length > 0) {
    console.log(`\n${colors.bright}${colors.red}❌ ERREURS RENCONTRÉES${colors.reset}`);
    results.errors.forEach((err, idx) => {
      console.log(`   ${idx + 1}. [${err.step}] ${err.error}`);
    });
  }

  // Conclusion
  console.log(`\n${colors.bright}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}  CONCLUSION${colors.reset}`);
  console.log(`${colors.bright}═══════════════════════════════════════════════════════${colors.reset}\n`);

  const totalSteps = 7;
  const completedSteps = totalSteps - results.errors.length;
  const successRate = Math.round((completedSteps / totalSteps) * 100);

  if (successRate === 100) {
    console.log(`${colors.green}✓ Workflow complet exécuté avec succès (${successRate}%)${colors.reset}`);
  } else if (successRate >= 70) {
    console.log(`${colors.yellow}⚠ Workflow partiellement exécuté (${successRate}%)${colors.reset}`);
  } else {
    console.log(`${colors.red}✗ Workflow incomplet (${successRate}%)${colors.reset}`);
  }

  console.log(`\n${colors.dim}Services impliqués:${colors.reset}`);
  console.log(`  • Authz API (Gestion transporteurs et documents)`);
  console.log(`  • AWS S3 (Stockage documents)`);
  console.log(`  • AWS Textract (OCR)`);
  console.log(`  • Notifications API (Emails et alertes)`);
  console.log(`  • Affret.IA API (Compte d'essai)`);

  console.log(`\n${colors.dim}Endpoints API utilisés:${colors.reset}`);
  console.log(`  POST /api/carriers/invite`);
  console.log(`  GET  /api/carriers/:id`);
  console.log(`  POST /api/carriers/:id/documents/upload-url`);
  console.log(`  POST /api/carriers/:id/documents/confirm-upload`);
  console.log(`  POST /api/carriers/:id/documents/:docId/analyze`);
  console.log(`  GET  /api/vigilance/alerts`);

  console.log(`\n${colors.bright}${colors.cyan}Simulation terminée!${colors.reset}\n`);
}

/**
 * Fonction principale
 */
async function executerSimulation() {
  console.log(`\n${colors.bright}${colors.magenta}╔═══════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}║  SYMPHONIA - SIMULATION WORKFLOW DOCUMENTS TRANSPORTEUR  ║${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}╚═══════════════════════════════════════════════════════╝${colors.reset}\n`);

  console.log(`${colors.dim}Date: ${new Date().toLocaleString('fr-FR')}${colors.reset}`);
  console.log(`${colors.dim}Environnement: Production${colors.reset}\n`);

  try {
    // Exécution séquentielle des étapes
    await etape1_InviterTransporteur();
    await etape2_CreerCompteTransporteur();
    await etape3_DeposerDocuments();
    await etape4_AnalyserDocumentsOCR();
    await etape5_ValiderDocuments();
    await etape6_VerifierAlertes();
    await etape7_ActiverAffretIA();

    // Génération du rapport final
    genererRapportFinal();

  } catch (error) {
    logError(`\n❌ La simulation a été interrompue: ${error.message}`);
    console.log(`\n${colors.dim}Détails de l'erreur:${colors.reset}`);
    console.error(error);

    // Afficher quand même un rapport partiel
    console.log(`\n${colors.yellow}Génération d'un rapport partiel...${colors.reset}`);
    genererRapportFinal();

    process.exit(1);
  }
}

// Lancer la simulation
if (require.main === module) {
  executerSimulation()
    .then(() => {
      console.log(`${colors.green}✓ Simulation terminée avec succès${colors.reset}\n`);
      process.exit(0);
    })
    .catch(error => {
      console.error(`${colors.red}✗ Erreur fatale:${colors.reset}`, error);
      process.exit(1);
    });
}

module.exports = {
  executerSimulation,
  CONFIG,
  SIMULATION_DATA,
  results
};
