/**
 * SYMPHONI.A - Contract Generation & Signature Service
 * RT Backend Services - Version 1.0.0
 *
 * Generates subscription contracts with client data and handles
 * electronic signature via Yousign
 */

const PDFDocument = require('pdfkit');
const crypto = require('crypto');

// ============================================
// COMPANY INFO (RT Technologie)
// ============================================

const RT_TECHNOLOGIE = {
  name: 'RT Technologie',
  legalForm: 'SAS',
  capital: '10 000',
  address: '1088 avenue de Champollion',
  postalCode: '38530',
  city: 'Pontcharra',
  rcs: 'Grenoble',
  siret: '948816988',
  tvaNumber: 'FR41948816988',
  representative: 'Romain Tardy',
  representativeTitle: 'Président',
  email: 'contact@rt-technologie.fr',
  phone: '+33 4 76 XX XX XX'
};

// ============================================
// SUBSCRIPTION PLANS CONFIGURATION
// ============================================

const SUBSCRIPTION_PLANS = {
  // Plans Industriel
  industriel: {
    name: 'Industriel',
    description: 'Gestion automatisée des flux, intégration des transporteurs, planification et AFFRET.IA sur périmètre interne.',
    monthlyPrice: 499,
    launchPrice: true,
    normalPrice: 799,
    features: [
      'Gestion automatisée des flux logistiques',
      'Intégration des transporteurs',
      'Planification automatique',
      'AFFRET.IA sur périmètre interne',
      'Tableaux de bord et KPIs',
      'Support technique standard'
    ]
  },

  // Plans Transporteur
  transporteur_invite: {
    name: 'Transporteur Invité',
    description: 'Réception des commandes de ses clients industriels.',
    monthlyPrice: 0,
    features: [
      'Réception des commandes clients',
      'Suivi des missions',
      'Accès mobile chauffeur'
    ]
  },
  transporteur_premium: {
    name: 'Transporteur Premium',
    description: 'Accès à la bourse AFFRET.IA + prospection client + visibilité élargie.',
    monthlyPrice: 299,
    features: [
      'Accès bourse AFFRET.IA',
      'Prospection clients industriels',
      'Visibilité élargie sur la plateforme',
      'Matching IA opportunités',
      'Alertes temps réel'
    ]
  },
  transporteur_pro: {
    name: 'Transporteur Pro',
    description: 'Utilisation complète de l\'application : invitation de transporteurs, planification automatisée, contrôle de vigilance.',
    monthlyPrice: 499,
    features: [
      'Toutes les fonctionnalités Premium',
      'Invitation de sous-traitants',
      'Planification automatisée',
      'Contrôle de vigilance documents légaux',
      'Utilisateurs illimités'
    ]
  },
  transporteur_affretia: {
    name: 'AFFRET.IA',
    description: 'Accès à la bourse de fret intelligente avec matching IA.',
    monthlyPrice: 200,
    features: [
      'Accès bourse de fret AFFRET.IA',
      'Matching IA transporteurs',
      'Vigilance documents',
      'Alertes temps réel'
    ]
  },
  transporteur_industrie: {
    name: 'Pack Industrie Complet',
    description: 'Accès complet à toutes les fonctionnalités industrielles.',
    monthlyPrice: 499,
    features: [
      'Bourse de fret AFFRET.IA',
      'Matching IA avancé',
      'Référentiel transporteurs',
      'Planning & KPIs',
      'Scoring transporteurs',
      'Appels d\'offres',
      'Utilisateurs illimités'
    ]
  },
  transporteur_tms: {
    name: 'Connexion TMS',
    description: 'Intégration avec votre TMS existant.',
    monthlyPrice: 149,
    features: [
      'Synchronisation TMS',
      'API REST complète',
      'Webhooks temps réel'
    ]
  },

  // Plans Logisticien
  logisticien_invite: {
    name: 'Logisticien Invité',
    description: 'Accès planning via invitation client.',
    monthlyPrice: 0,
    features: [
      'Accès planning partagé',
      'Réception des RDV',
      'Notifications'
    ]
  },
  logisticien_premium: {
    name: 'Logisticien Premium',
    description: 'Accès aux appels d\'offres de l\'ensemble des industriels.',
    monthlyPrice: 499,
    features: [
      'Accès appels d\'offres industriels',
      'Bourse de stockage',
      'Visibilité marketplace',
      'Recommandations IA'
    ]
  },

  // Plans Transitaire
  transitaire_invite: {
    name: 'Transitaire Invité',
    description: 'Accès activités internes de ses clients.',
    monthlyPrice: 0,
    features: [
      'Accès activités clients',
      'Suivi opérations',
      'Notifications'
    ]
  },
  transitaire_premium: {
    name: 'Transitaire Premium',
    description: 'Accès aux appels d\'offres de l\'ensemble des industriels.',
    monthlyPrice: 299,
    features: [
      'Accès appels d\'offres',
      'Visibilité élargie',
      'Matching opportunités'
    ]
  }
};

// ============================================
// OPTIONS ADDITIONNELLES
// ============================================

const ADDITIONAL_OPTIONS = {
  affretIA: {
    name: 'AFFRET.IA Premium',
    description: 'AFFRET.IA sur l\'ensemble des transporteurs Premium RT Technology',
    monthlyPrice: 200,
    type: 'monthly'
  },
  thirdPartyConnection: {
    name: 'Connexion outil tiers',
    description: 'Intégration avec un outil tiers',
    monthlyPrice: 89,
    type: 'monthly'
  },
  telematics: {
    name: 'Connexion télématique',
    unitPrice: 19,
    unit: 'camion connecté',
    type: 'per_unit'
  },
  sms: {
    name: 'Envoi SMS',
    unitPrice: 0.07,
    unit: 'SMS',
    type: 'metered'
  },
  onsiteAssistance: {
    name: 'Assistance sur site',
    unitPrice: 1470,
    unit: 'jour',
    type: 'one_time'
  },
  eCmr: {
    name: 'e-CMR',
    monthlyPrice: 49,
    type: 'monthly'
  },
  geofencing: {
    name: 'Geofencing',
    monthlyPrice: 29,
    type: 'monthly'
  },
  ocrDocuments: {
    name: 'OCR Documents',
    monthlyPrice: 39,
    type: 'monthly'
  },
  boursePrivee: {
    name: 'Bourse privée transporteurs',
    monthlyPrice: 149,
    type: 'monthly'
  },
  webhooks: {
    name: 'Webhooks temps réel',
    monthlyPrice: 59,
    type: 'monthly'
  },
  archivageLegal: {
    name: 'Archivage légal 10 ans',
    monthlyPrice: 19,
    type: 'monthly'
  },
  trackingPremium: {
    name: 'Tracking Premium GPS',
    unitPrice: 4,
    unit: 'véhicule',
    type: 'per_unit'
  },
  signatureQualifiee: {
    name: 'Signature électronique qualifiée',
    unitPrice: 2,
    unit: 'signature',
    type: 'metered'
  },
  bourseDeStockage: {
    name: 'Bourse de Stockage',
    monthlyPrice: 200,
    type: 'monthly'
  },
  borneAccueilChauffeur: {
    name: 'Tablette Accueil Chauffeur',
    monthlyPrice: 150,
    type: 'monthly'
  }
};

// ============================================
// DISCOUNT RATES
// ============================================

const DISCOUNT_RATES = {
  12: 0,    // Moins de 3 ans : 0%
  36: 3,    // 3 ans : -3%
  48: 5,    // 4 ans : -5%
  60: 7     // 5 ans : -7%
};

function getDiscountRate(durationMonths) {
  if (durationMonths >= 60) return 7;
  if (durationMonths >= 48) return 5;
  if (durationMonths >= 36) return 3;
  return 0;
}

// ============================================
// CONTRACT NUMBER GENERATION
// ============================================

async function generateContractNumber(db) {
  const year = new Date().getFullYear();
  const prefix = `CT-${year}`;

  // Get the last contract number for this year
  const lastContract = await db.collection('contracts')
    .find({ contractNumber: { $regex: `^${prefix}` } })
    .sort({ contractNumber: -1 })
    .limit(1)
    .toArray();

  let sequence = 1;
  if (lastContract.length > 0) {
    const lastNumber = lastContract[0].contractNumber;
    const lastSequence = parseInt(lastNumber.split('-')[2]) || 0;
    sequence = lastSequence + 1;
  }

  return `${prefix}-${String(sequence).padStart(5, '0')}`;
}

// ============================================
// PDF GENERATION
// ============================================

/**
 * Generate a subscription contract PDF
 * @param {Object} contractData - Contract data
 * @returns {Promise<Buffer>} - PDF buffer
 */
async function generateContractPDF(contractData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Contrat d'abonnement SYMPHONI.A - ${contractData.contractNumber}`,
          Author: 'RT Technologie',
          Subject: 'Contrat d\'abonnement',
          Creator: 'SYMPHONI.A Control Tower'
        }
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const client = contractData.client;
      const plan = contractData.plan;
      const options = contractData.options || [];
      const duration = contractData.durationMonths || 12;
      const discountPercent = getDiscountRate(duration);

      // ========== PAGE 1 - HEADER ==========
      doc.fontSize(18).font('Helvetica-Bold')
        .text('CONTRAT D\'ABONNEMENT', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica')
        .text(`N° ${contractData.contractNumber}`, { align: 'center' });
      doc.moveDown(2);

      // ========== PARTIES ==========
      doc.fontSize(12).font('Helvetica-Bold').text('ENTRE :');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica')
        .text(`${RT_TECHNOLOGIE.name}, société ${RT_TECHNOLOGIE.legalForm}, au capital de ${RT_TECHNOLOGIE.capital}€, dont le siège social est situé ${RT_TECHNOLOGIE.address} ${RT_TECHNOLOGIE.postalCode} ${RT_TECHNOLOGIE.city}, immatriculée au Registre du Commerce et des Sociétés de ${RT_TECHNOLOGIE.rcs} sous le numéro ${RT_TECHNOLOGIE.siret}, numéro de TVA ${RT_TECHNOLOGIE.tvaNumber}, représentée par ${RT_TECHNOLOGIE.representative}, ${RT_TECHNOLOGIE.representativeTitle}, ci-après dénommée "RT Technologie" ou le "Fournisseur",`);
      doc.moveDown(1);

      doc.fontSize(12).font('Helvetica-Bold').text('ET :');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica')
        .text(`${client.companyName}, société ${client.legalForm || 'SAS'}, au capital de ${client.capital || '[à compléter]'}€, dont le siège social est situé ${client.address}, ${client.postalCode} ${client.city}, immatriculée au Registre du Commerce et des Sociétés de ${client.rcsCity || client.city} sous le numéro ${client.siret || '[SIRET]'}, numéro de TVA ${client.tvaNumber || '[TVA]'}, représentée par ${client.representativeName || client.contactName}, ${client.representativeTitle || 'Représentant légal'}, ci-après dénommée le "Client".`);
      doc.moveDown(2);

      doc.fontSize(12).font('Helvetica-Bold').text('IL A ÉTÉ CONVENU CE QUI SUIT :', { align: 'center' });
      doc.moveDown(1.5);

      // ========== ARTICLE 1 - OBJET ==========
      doc.fontSize(11).font('Helvetica-Bold').text('ARTICLE 1. OBJET DU CONTRAT');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica')
        .text('Le présent contrat a pour objet de définir les conditions dans lesquelles RT Technologie fournit au Client un accès et un droit d\'utilisation de son outil Control Tower SYMPHONI.A, ainsi que les services associés.');
      doc.moveDown(1);

      // ========== ARTICLE 2 - DESCRIPTION DES SERVICES ==========
      doc.fontSize(11).font('Helvetica-Bold').text('ARTICLE 2. DESCRIPTION DES SERVICES');
      doc.moveDown(0.5);

      // Plan souscrit
      doc.fontSize(10).font('Helvetica-Bold').text('Plan souscrit : ' + plan.name);
      doc.fontSize(10).font('Helvetica').text(plan.description);
      doc.moveDown(0.5);

      doc.text('Fonctionnalités incluses :');
      const features = SUBSCRIPTION_PLANS[contractData.planId]?.features || plan.features || [];
      features.forEach(feature => {
        doc.text(`  • ${feature}`);
      });
      doc.moveDown(0.5);

      // Options additionnelles
      if (options.length > 0) {
        doc.font('Helvetica-Bold').text('Options additionnelles souscrites :');
        doc.font('Helvetica');
        options.forEach(opt => {
          const optConfig = ADDITIONAL_OPTIONS[opt.id] || opt;
          if (opt.quantity && opt.quantity > 1) {
            doc.text(`  • ${optConfig.name} (x${opt.quantity}) - ${opt.monthlyPrice || optConfig.monthlyPrice}€/mois`);
          } else if (optConfig.type === 'per_unit') {
            doc.text(`  • ${optConfig.name} - ${optConfig.unitPrice}€/${optConfig.unit}`);
          } else {
            doc.text(`  • ${optConfig.name} - ${opt.monthlyPrice || optConfig.monthlyPrice}€/mois`);
          }
        });
      }
      doc.moveDown(1);

      // ========== ARTICLE 3 - CONDITIONS FINANCIÈRES ==========
      doc.fontSize(11).font('Helvetica-Bold').text('ARTICLE 3. CONDITIONS FINANCIÈRES');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica');

      const basePrice = plan.monthlyPrice;
      let optionsTotal = 0;
      options.forEach(opt => {
        const optConfig = ADDITIONAL_OPTIONS[opt.id] || opt;
        if (optConfig.type === 'monthly') {
          optionsTotal += (opt.monthlyPrice || optConfig.monthlyPrice) * (opt.quantity || 1);
        }
      });

      const totalHT = basePrice + optionsTotal;
      const discountAmount = totalHT * (discountPercent / 100);
      const finalHT = totalHT - discountAmount;
      const tva = finalHT * 0.20;
      const totalTTC = finalHT + tva;

      doc.text(`• Tarif mensuel du plan ${plan.name} : ${basePrice}€ HT/mois`);
      if (optionsTotal > 0) {
        doc.text(`• Total options mensuelles : ${optionsTotal}€ HT/mois`);
      }
      doc.text(`• Total mensuel brut : ${totalHT}€ HT/mois`);

      if (discountPercent > 0) {
        doc.text(`• Remise engagement ${duration} mois : -${discountPercent}% (-${discountAmount.toFixed(2)}€)`);
      }

      doc.font('Helvetica-Bold')
        .text(`• Total mensuel HT : ${finalHT.toFixed(2)}€`)
        .text(`• TVA (20%) : ${tva.toFixed(2)}€`)
        .text(`• Total mensuel TTC : ${totalTTC.toFixed(2)}€`);
      doc.font('Helvetica');
      doc.moveDown(0.5);

      doc.text('Le paiement s\'effectue par prélèvement automatique sur carte bancaire, le premier jour de chaque mois.');
      doc.moveDown(0.5);

      doc.text('Grille des remises commerciales selon durée d\'engagement :');
      doc.text('  • Moins de 3 ans : 0% (tarif plein)');
      doc.text('  • 3 ans (36 mois) : -3%');
      doc.text('  • 4 ans (48 mois) : -5%');
      doc.text('  • 5 ans (60 mois) : -7%');
      doc.moveDown(1);

      // ========== PAGE 2 ==========
      doc.addPage();

      // ========== ARTICLE 4 - DURÉE ==========
      doc.fontSize(11).font('Helvetica-Bold').text('ARTICLE 4. DURÉE ET RENOUVELLEMENT');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica')
        .text(`Le présent contrat est conclu pour une durée de ${duration} mois à compter de sa signature. À l'issue de cette période initiale, le contrat sera renouvelé tacitement pour une durée de 12 mois, sauf dénonciation par l'une ou l'autre des parties par lettre recommandée avec accusé de réception, adressée au moins 3 mois avant la date d'expiration.`);
      doc.moveDown(1);

      // ========== ARTICLE 5 - NIVEAUX DE SERVICE ==========
      doc.fontSize(11).font('Helvetica-Bold').text('ARTICLE 5. NIVEAUX DE SERVICE (SLA)');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica')
        .text('RT Technologie s\'engage à fournir :')
        .text('  • Disponibilité de la plateforme : 99,5% (hors maintenance planifiée)')
        .text('  • Temps de réponse support : 24h ouvrées (48h max)')
        .text('  • Support technique par email : support@symphonia-controltower.com')
        .text('  • Support téléphonique : du lundi au vendredi, 9h-18h');
      doc.moveDown(1);

      // ========== ARTICLE 6 - RÉSILIATION ==========
      doc.fontSize(11).font('Helvetica-Bold').text('ARTICLE 6. RÉSILIATION');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica')
        .text('• Résiliation pour manquement : En cas de manquement grave de l\'une des parties, l\'autre partie pourra résilier le contrat après mise en demeure restée sans effet pendant 30 jours.')
        .text('')
        .text('• Résiliation anticipée : Le client pourra résilier de manière anticipée moyennant le versement d\'une indemnité égale aux mensualités restantes jusqu\'au terme de l\'engagement initial.');
      doc.moveDown(1);

      // ========== ARTICLE 7 - PROPRIÉTÉ INTELLECTUELLE ==========
      doc.fontSize(11).font('Helvetica-Bold').text('ARTICLE 7. PROPRIÉTÉ INTELLECTUELLE');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica')
        .text('RT Technologie conserve l\'entière propriété intellectuelle de l\'outil SYMPHONI.A Control Tower. Le client dispose d\'un droit d\'utilisation non exclusif pendant la durée du contrat. Toute reproduction, modification ou distribution est strictement interdite sans accord préalable écrit.');
      doc.moveDown(1);

      // ========== ARTICLE 8 - CONFIDENTIALITÉ ==========
      doc.fontSize(11).font('Helvetica-Bold').text('ARTICLE 8. CONFIDENTIALITÉ');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica')
        .text('Les parties s\'engagent à ne pas divulguer les informations confidentielles échangées dans le cadre du présent contrat. Cette obligation survivra à la fin du contrat.');
      doc.moveDown(1);

      // ========== ARTICLE 9 - DONNÉES PERSONNELLES ==========
      doc.fontSize(11).font('Helvetica-Bold').text('ARTICLE 9. PROTECTION DES DONNÉES');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica')
        .text('RT Technologie s\'engage à traiter les données personnelles conformément au RGPD. En cas de résiliation, les données du client seront restituées dans un format standard (JSON/CSV) dans un délai de 30 jours.');
      doc.moveDown(1);

      // ========== ARTICLE 10 - RESPONSABILITÉ ==========
      doc.fontSize(11).font('Helvetica-Bold').text('ARTICLE 10. RESPONSABILITÉ');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica')
        .text('La responsabilité de RT Technologie est limitée aux dommages directs et prévisibles. En aucun cas RT Technologie ne pourra être tenue responsable des dommages indirects. La responsabilité totale est limitée au montant des sommes versées par le client au titre du présent contrat sur les 12 derniers mois.');
      doc.moveDown(1);

      // ========== ARTICLE 11 - DROIT APPLICABLE ==========
      doc.fontSize(11).font('Helvetica-Bold').text('ARTICLE 11. DROIT APPLICABLE');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica')
        .text('Le présent contrat est soumis au droit français. En cas de litige, les parties s\'efforceront de trouver une solution amiable. À défaut, les tribunaux de Grenoble seront seuls compétents.');
      doc.moveDown(2);

      // ========== PAGE 3 - SIGNATURES ==========
      doc.addPage();

      doc.fontSize(11).font('Helvetica-Bold').text('ARTICLE 12. CONDITIONS DE VALIDATION');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica')
        .text('Le présent contrat entre en vigueur à compter de sa signature électronique par les deux parties.');
      doc.moveDown(2);

      // ========== RÉCAPITULATIF ==========
      doc.fontSize(11).font('Helvetica-Bold').text('RÉCAPITULATIF DE L\'ABONNEMENT', { align: 'center' });
      doc.moveDown(1);

      // Table
      const tableTop = doc.y;
      const col1 = 50;
      const col2 = 350;

      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Description', col1, tableTop);
      doc.text('Montant', col2, tableTop);

      doc.moveTo(col1, tableTop + 15).lineTo(500, tableTop + 15).stroke();

      let yPos = tableTop + 25;
      doc.font('Helvetica');

      doc.text(`Plan ${plan.name}`, col1, yPos);
      doc.text(`${basePrice}€ HT/mois`, col2, yPos);
      yPos += 20;

      options.forEach(opt => {
        const optConfig = ADDITIONAL_OPTIONS[opt.id] || opt;
        const optName = opt.quantity > 1 ? `${optConfig.name} (x${opt.quantity})` : optConfig.name;
        const optPrice = (opt.monthlyPrice || optConfig.monthlyPrice) * (opt.quantity || 1);
        doc.text(optName, col1, yPos);
        doc.text(`${optPrice}€ HT/mois`, col2, yPos);
        yPos += 20;
      });

      if (discountPercent > 0) {
        doc.text(`Remise engagement ${duration} mois`, col1, yPos);
        doc.text(`-${discountPercent}%`, col2, yPos);
        yPos += 20;
      }

      doc.moveTo(col1, yPos).lineTo(500, yPos).stroke();
      yPos += 10;

      doc.font('Helvetica-Bold');
      doc.text('TOTAL HT', col1, yPos);
      doc.text(`${finalHT.toFixed(2)}€/mois`, col2, yPos);
      yPos += 20;

      doc.text('TVA (20%)', col1, yPos);
      doc.text(`${tva.toFixed(2)}€/mois`, col2, yPos);
      yPos += 20;

      doc.text('TOTAL TTC', col1, yPos);
      doc.text(`${totalTTC.toFixed(2)}€/mois`, col2, yPos);
      yPos += 20;

      doc.text(`Durée d'engagement`, col1, yPos);
      doc.text(`${duration} mois`, col2, yPos);
      doc.moveDown(3);

      // ========== SIGNATURES ==========
      doc.fontSize(12).font('Helvetica-Bold').text('SIGNATURES', { align: 'center' });
      doc.moveDown(1);

      const today = new Date().toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      doc.fontSize(10).font('Helvetica')
        .text(`Fait en deux exemplaires électroniques, le ${today}`, { align: 'center' });
      doc.moveDown(2);

      // Two columns for signatures
      const sigY = doc.y;

      // Left - RT Technologie
      doc.fontSize(10).font('Helvetica-Bold')
        .text('Pour RT Technologie', 50, sigY);
      doc.font('Helvetica')
        .text(RT_TECHNOLOGIE.representative, 50, sigY + 15)
        .text(RT_TECHNOLOGIE.representativeTitle, 50, sigY + 30);
      doc.moveDown(1);
      doc.text('[Signature électronique]', 50, sigY + 60);

      // Right - Client
      doc.fontSize(10).font('Helvetica-Bold')
        .text('Pour le Client', 300, sigY);
      doc.font('Helvetica')
        .text(client.representativeName || client.contactName, 300, sigY + 15)
        .text(client.representativeTitle || 'Représentant légal', 300, sigY + 30);
      doc.moveDown(1);
      doc.text('[Signature électronique]', 300, sigY + 60);

      // Footer
      doc.fontSize(8).font('Helvetica')
        .text(`Contrat généré automatiquement par SYMPHONI.A - ${contractData.contractNumber}`, 50, 750, { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// ============================================
// CONTRACT SERVICE CLASS
// ============================================

class ContractService {
  constructor(mongoClient, sesClient = null) {
    this.mongoClient = mongoClient;
    this.sesClient = sesClient;

    // Utiliser la signature interne par défaut
    // Yousign peut être activé si configuré ET si USE_YOUSIGN=true
    this.useInternalSignature = process.env.USE_YOUSIGN !== 'true';
    this.yousignEnabled = !this.useInternalSignature && !!(process.env.YOUSIGN_API_KEY && process.env.YOUSIGN_API_KEY !== 'your_yousign_api_key');

    if (this.useInternalSignature) {
      console.log('[Contract] Using internal electronic signature service');
    } else if (this.yousignEnabled) {
      console.log('[Contract] Using Yousign for electronic signatures');
    }

    this.yousignConfig = {
      apiKey: process.env.YOUSIGN_API_KEY,
      baseUrl: process.env.YOUSIGN_ENV === 'production'
        ? 'https://api.yousign.com/v3'
        : 'https://api-sandbox.yousign.app/v3',
      webhookUrl: process.env.YOUSIGN_WEBHOOK_URL || 'https://dgze8l03lwl5h.cloudfront.net/api/webhooks/yousign'
    };
  }

  /**
   * Create a contract for a new subscription
   */
  async createContract(onboardingRequest, stripeCustomerId = null) {
    const db = this.mongoClient.db();

    try {
      // Generate contract number
      const contractNumber = await generateContractNumber(db);

      // Get plan configuration
      const planId = onboardingRequest.subscriptionType || onboardingRequest.planId || 'industriel';
      const plan = SUBSCRIPTION_PLANS[planId] || SUBSCRIPTION_PLANS.industriel;

      // Parse selected options
      const selectedOptions = [];
      if (onboardingRequest.options) {
        for (const [optionKey, isSelected] of Object.entries(onboardingRequest.options)) {
          if (isSelected && ADDITIONAL_OPTIONS[optionKey]) {
            const optConfig = ADDITIONAL_OPTIONS[optionKey];
            selectedOptions.push({
              id: optionKey,
              name: optConfig.name,
              monthlyPrice: optConfig.monthlyPrice,
              quantity: onboardingRequest.optionQuantities?.[optionKey] || 1,
              type: optConfig.type
            });
          }
        }
      }

      // Build contract data
      const contractData = {
        contractNumber,
        planId,
        plan: {
          name: plan.name,
          description: plan.description,
          monthlyPrice: plan.monthlyPrice,
          features: plan.features
        },
        client: {
          companyName: onboardingRequest.companyName || onboardingRequest.company,
          legalForm: onboardingRequest.legalForm || 'SAS',
          capital: onboardingRequest.capital,
          address: onboardingRequest.address || onboardingRequest.companyAddress,
          postalCode: onboardingRequest.postalCode,
          city: onboardingRequest.city,
          siret: onboardingRequest.siret,
          tvaNumber: onboardingRequest.tvaNumber,
          rcsCity: onboardingRequest.rcsCity,
          contactName: onboardingRequest.contactName || `${onboardingRequest.firstName} ${onboardingRequest.lastName}`,
          representativeName: onboardingRequest.representativeName || onboardingRequest.contactName,
          representativeTitle: onboardingRequest.representativeTitle || 'Représentant légal',
          email: onboardingRequest.email
        },
        options: selectedOptions,
        durationMonths: parseInt(onboardingRequest.duration) || 12,
        stripeCustomerId,
        onboardingRequestId: onboardingRequest._id?.toString()
      };

      // Generate PDF
      console.log(`[Contract] Generating PDF for contract ${contractNumber}...`);
      const pdfBuffer = await generateContractPDF(contractData);

      // Calculate financial summary
      const discountPercent = getDiscountRate(contractData.durationMonths);
      let totalMonthlyHT = plan.monthlyPrice;
      selectedOptions.forEach(opt => {
        if (opt.type === 'monthly') {
          totalMonthlyHT += (opt.monthlyPrice || 0) * (opt.quantity || 1);
        }
      });
      const discountAmount = totalMonthlyHT * (discountPercent / 100);
      const finalMonthlyHT = totalMonthlyHT - discountAmount;
      const monthlyTVA = finalMonthlyHT * 0.20;
      const monthlyTTC = finalMonthlyHT + monthlyTVA;

      // Save contract to database
      const contractDoc = {
        contractNumber,
        status: 'pending_signature',

        // Client info
        clientEmail: onboardingRequest.email,
        clientCompany: contractData.client.companyName,
        clientContact: contractData.client.contactName,

        // Plan info
        planId,
        planName: plan.name,
        durationMonths: contractData.durationMonths,

        // Options
        selectedOptions: selectedOptions.map(o => ({
          id: o.id,
          name: o.name,
          monthlyPrice: o.monthlyPrice,
          quantity: o.quantity
        })),

        // Financial
        monthlyHT: finalMonthlyHT,
        monthlyTVA,
        monthlyTTC,
        discountPercent,
        totalContractValue: monthlyTTC * contractData.durationMonths,

        // References
        stripeCustomerId,
        onboardingRequestId: onboardingRequest._id,

        // PDF
        pdfGenerated: true,
        pdfSize: pdfBuffer.length,

        // Signature
        yousignProcedureId: null,
        signatureRequestedAt: null,
        signedAt: null,
        signedPdfUrl: null,

        // Dates
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await db.collection('contracts').insertOne(contractDoc);
      contractDoc._id = result.insertedId;

      console.log(`[Contract] Contract ${contractNumber} created successfully`);

      // Store PDF temporarily (or in S3)
      await this.storePDF(contractNumber, pdfBuffer, db);

      return {
        success: true,
        contract: contractDoc,
        pdfBuffer,
        contractNumber
      };
    } catch (error) {
      console.error('[Contract] Error creating contract:', error);
      throw error;
    }
  }

  /**
   * Store PDF in database or S3
   */
  async storePDF(contractNumber, pdfBuffer, db) {
    // Store in MongoDB GridFS or as base64 for now
    // In production, should use S3
    await db.collection('contract_pdfs').updateOne(
      { contractNumber },
      {
        $set: {
          contractNumber,
          pdf: pdfBuffer.toString('base64'),
          contentType: 'application/pdf',
          size: pdfBuffer.length,
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
  }

  /**
   * Get PDF from storage
   */
  async getPDF(contractNumber) {
    const db = this.mongoClient.db();
    const doc = await db.collection('contract_pdfs').findOne({ contractNumber });
    if (doc && doc.pdf) {
      return Buffer.from(doc.pdf, 'base64');
    }
    return null;
  }

  /**
   * Send contract for signature (internal service or Yousign)
   */
  async sendForSignature(contractNumber) {
    const db = this.mongoClient.db();
    const contract = await db.collection('contracts').findOne({ contractNumber });

    if (!contract) {
      throw new Error(`Contract ${contractNumber} not found`);
    }

    // UTILISER LA SIGNATURE INTERNE PAR DEFAUT
    if (this.useInternalSignature || !this.yousignEnabled) {
      console.log(`[Contract] Using internal signature for ${contractNumber}`);

      try {
        const { ElectronicSignatureService } = require('./electronic-signature-service');
        const signatureService = new ElectronicSignatureService(this.mongoClient);

        const signatureRequest = await signatureService.createSignatureRequest(
          contractNumber,
          contract.clientEmail,
          contract.clientContact || contract.clientCompany
        );

        console.log(`[Contract] Internal signature request created for ${contractNumber}`);

        // Envoyer l'email avec le lien de signature si SES configuré
        if (this.sesClient) {
          try {
            await this.sendSignatureRequestEmail(contract, signatureRequest.signatureUrl);
          } catch (emailError) {
            console.error('[Contract] Error sending signature email:', emailError.message);
          }
        }

        return {
          success: true,
          internal: true,
          signatureUrl: signatureRequest.signatureUrl,
          expiresAt: signatureRequest.expiresAt
        };
      } catch (error) {
        console.error('[Contract] Error with internal signature:', error);
        throw error;
      }
    }

    // YOUSIGN (si configuré et activé)
    const pdfBuffer = await this.getPDF(contractNumber);
    if (!pdfBuffer) {
      throw new Error(`PDF not found for contract ${contractNumber}`);
    }

    try {
      // Create Yousign signature request
      const signatureRequest = await this.createYousignSignatureRequest(contract, pdfBuffer);

      // Update contract with Yousign info
      await db.collection('contracts').updateOne(
        { contractNumber },
        {
          $set: {
            status: 'pending_signature',
            yousignProcedureId: signatureRequest.procedureId,
            yousignSignatureRequestId: signatureRequest.signatureRequestId,
            signatureRequestedAt: new Date(),
            signatureUrl: signatureRequest.signatureUrl,
            updatedAt: new Date()
          }
        }
      );

      console.log(`[Contract] Yousign signature request sent for ${contractNumber}`);

      return {
        success: true,
        internal: false,
        procedureId: signatureRequest.procedureId,
        signatureUrl: signatureRequest.signatureUrl
      };
    } catch (error) {
      console.error('[Contract] Error sending for signature:', error);
      throw error;
    }
  }

  /**
   * Send signature request email
   */
  async sendSignatureRequestEmail(contract, signatureUrl) {
    if (!this.sesClient) return;

    const { SendRawEmailCommand } = require('@aws-sdk/client-ses');
    const nodemailer = require('nodemailer');

    const transporter = nodemailer.createTransport({
      SES: { ses: this.sesClient, aws: { SendRawEmailCommand } }
    });

    const mailOptions = {
      from: '"SYMPHONI.A Contrats" <contrats@symphonia-controltower.com>',
      to: contract.clientEmail,
      subject: `[SYMPHONI.A] Contrat à signer - ${contract.contractNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #2563eb; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">SYMPHONI.A</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Control Tower</p>
          </div>

          <div style="padding: 30px; background: #f9fafb;">
            <h2 style="color: #1f2937; margin-top: 0;">Bonjour ${contract.clientContact || 'Client'},</h2>

            <p>Votre contrat d'abonnement SYMPHONI.A est prêt à être signé.</p>

            <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #374151;">Récapitulatif</h3>
              <p><strong>Numéro :</strong> ${contract.contractNumber}</p>
              <p><strong>Plan :</strong> ${contract.planName}</p>
              <p><strong>Durée :</strong> ${contract.durationMonths} mois</p>
              <p><strong>Montant :</strong> ${contract.monthlyTTC?.toFixed(2) || 'N/A'}€ TTC/mois</p>
            </div>

            <p style="text-align: center; margin: 30px 0;">
              <a href="${signatureUrl}"
                 style="display: inline-block; background: #2563eb; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                Signer mon contrat
              </a>
            </p>

            <p style="color: #6b7280; font-size: 14px;">
              Ce lien est valable 7 jours. Vous pourrez prévisualiser le contrat avant de le signer.
            </p>

            <p>Cordialement,<br>L'équipe SYMPHONI.A</p>
          </div>

          <div style="background: #1f2937; color: #9ca3af; padding: 20px; text-align: center; font-size: 12px;">
            <p style="margin: 0;">RT Technologie SAS - 1088 avenue de Champollion, 38530 Pontcharra</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`[Contract] Signature request email sent to ${contract.clientEmail}`);
  }

  /**
   * Create Yousign signature request (API v3)
   */
  async createYousignSignatureRequest(contract, pdfBuffer) {
    const fetch = (await import('node-fetch')).default;

    // Step 1: Create signature request
    const signatureRequestResponse = await fetch(`${this.yousignConfig.baseUrl}/signature_requests`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.yousignConfig.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `Contrat SYMPHONI.A - ${contract.contractNumber}`,
        delivery_mode: 'email',
        timezone: 'Europe/Paris',
        expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        external_id: contract.contractNumber,
        custom_experience_id: process.env.YOUSIGN_EXPERIENCE_ID || null
      })
    });

    if (!signatureRequestResponse.ok) {
      const errorText = await signatureRequestResponse.text();
      throw new Error(`Yousign signature request failed: ${errorText}`);
    }

    const signatureRequest = await signatureRequestResponse.json();
    const signatureRequestId = signatureRequest.id;

    // Step 2: Upload document
    const formData = new (await import('form-data')).default();
    formData.append('file', pdfBuffer, {
      filename: `contrat-${contract.contractNumber}.pdf`,
      contentType: 'application/pdf'
    });
    formData.append('nature', 'signable_document');

    const documentResponse = await fetch(
      `${this.yousignConfig.baseUrl}/signature_requests/${signatureRequestId}/documents`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.yousignConfig.apiKey}`,
          ...formData.getHeaders()
        },
        body: formData
      }
    );

    if (!documentResponse.ok) {
      const errorText = await documentResponse.text();
      throw new Error(`Yousign document upload failed: ${errorText}`);
    }

    const document = await documentResponse.json();

    // Step 3: Add signer (client)
    const signerResponse = await fetch(
      `${this.yousignConfig.baseUrl}/signature_requests/${signatureRequestId}/signers`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.yousignConfig.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          info: {
            first_name: contract.clientContact?.split(' ')[0] || 'Client',
            last_name: contract.clientContact?.split(' ').slice(1).join(' ') || contract.clientCompany,
            email: contract.clientEmail,
            locale: 'fr'
          },
          signature_level: 'electronic_signature',
          signature_authentication_mode: 'no_otp',
          fields: [
            {
              type: 'signature',
              document_id: document.id,
              page: 3, // Page 3 - signatures
              x: 300,
              y: 500,
              width: 150,
              height: 50
            }
          ]
        })
      }
    );

    if (!signerResponse.ok) {
      const errorText = await signerResponse.text();
      throw new Error(`Yousign signer creation failed: ${errorText}`);
    }

    const signer = await signerResponse.json();

    // Step 4: Activate signature request
    const activateResponse = await fetch(
      `${this.yousignConfig.baseUrl}/signature_requests/${signatureRequestId}/activate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.yousignConfig.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!activateResponse.ok) {
      const errorText = await activateResponse.text();
      throw new Error(`Yousign activation failed: ${errorText}`);
    }

    return {
      procedureId: signatureRequestId,
      signatureRequestId: signatureRequestId,
      documentId: document.id,
      signerId: signer.id,
      signatureUrl: signer.signature_link
    };
  }

  /**
   * Handle Yousign webhook (signature completed)
   */
  async handleYousignWebhook(event) {
    const db = this.mongoClient.db();

    console.log(`[Contract] Yousign webhook received: ${event.event_name}`);

    if (event.event_name === 'signature_request.done') {
      const signatureRequestId = event.data?.signature_request?.id;

      // Find contract by Yousign ID
      const contract = await db.collection('contracts').findOne({
        yousignSignatureRequestId: signatureRequestId
      });

      if (!contract) {
        console.error(`[Contract] Contract not found for Yousign ID: ${signatureRequestId}`);
        return { success: false, error: 'Contract not found' };
      }

      // Download signed document
      const signedPdfUrl = await this.downloadSignedDocument(signatureRequestId);

      // Update contract status
      await db.collection('contracts').updateOne(
        { _id: contract._id },
        {
          $set: {
            status: 'signed',
            signedAt: new Date(),
            signedPdfUrl,
            updatedAt: new Date()
          }
        }
      );

      console.log(`[Contract] Contract ${contract.contractNumber} signed successfully`);

      // Send signed contract to client
      await this.sendSignedContractEmail(contract.contractNumber);

      // Trigger subscription activation if needed
      await this.activateSubscription(contract);

      return { success: true, contractNumber: contract.contractNumber };
    }

    return { success: true, message: 'Event acknowledged' };
  }

  /**
   * Download signed document from Yousign
   */
  async downloadSignedDocument(signatureRequestId) {
    if (!this.yousignEnabled) return null;

    try {
      const fetch = (await import('node-fetch')).default;

      const response = await fetch(
        `${this.yousignConfig.baseUrl}/signature_requests/${signatureRequestId}/documents/download`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.yousignConfig.apiKey}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to download signed document: ${response.status}`);
      }

      const pdfBuffer = await response.buffer();

      // Store signed PDF
      const db = this.mongoClient.db();
      const contract = await db.collection('contracts').findOne({
        yousignSignatureRequestId: signatureRequestId
      });

      if (contract) {
        await db.collection('contract_pdfs').updateOne(
          { contractNumber: contract.contractNumber },
          {
            $set: {
              signedPdf: pdfBuffer.toString('base64'),
              signedAt: new Date()
            }
          }
        );
      }

      // In production, upload to S3 and return URL
      return `https://storage.symphonia-controltower.com/contracts/${contract?.contractNumber}-signed.pdf`;
    } catch (error) {
      console.error('[Contract] Error downloading signed document:', error);
      return null;
    }
  }

  /**
   * Send signed contract by email
   */
  async sendSignedContractEmail(contractNumber) {
    const db = this.mongoClient.db();
    const contract = await db.collection('contracts').findOne({ contractNumber });

    if (!contract) {
      throw new Error(`Contract ${contractNumber} not found`);
    }

    // Get signed PDF
    const pdfDoc = await db.collection('contract_pdfs').findOne({ contractNumber });
    const pdfBuffer = pdfDoc?.signedPdf
      ? Buffer.from(pdfDoc.signedPdf, 'base64')
      : (pdfDoc?.pdf ? Buffer.from(pdfDoc.pdf, 'base64') : null);

    if (!pdfBuffer) {
      console.error(`[Contract] PDF not found for ${contractNumber}`);
      return { success: false, error: 'PDF not found' };
    }

    if (!this.sesClient) {
      console.log('[Contract] SES not configured - skipping email');
      return { success: false, error: 'SES not configured' };
    }

    try {
      const { SendRawEmailCommand } = await import('@aws-sdk/client-ses');
      const nodemailer = await import('nodemailer');

      // Create email with attachment
      const transporter = nodemailer.createTransport({
        SES: { ses: this.sesClient, aws: { SendRawEmailCommand } }
      });

      const mailOptions = {
        from: `"SYMPHONI.A Contrats" <contrats@symphonia-controltower.com>`,
        to: contract.clientEmail,
        subject: `[SYMPHONI.A] Votre contrat d'abonnement signé - ${contractNumber}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1f2937;">Contrat d'abonnement signé</h2>
            <p>Bonjour ${contract.clientContact || 'Client'},</p>
            <p>Nous vous confirmons que votre contrat d'abonnement SYMPHONI.A a été signé avec succès.</p>
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Numéro de contrat :</strong> ${contractNumber}</p>
              <p><strong>Plan :</strong> ${contract.planName}</p>
              <p><strong>Durée d'engagement :</strong> ${contract.durationMonths} mois</p>
              <p><strong>Montant mensuel TTC :</strong> ${contract.monthlyTTC?.toFixed(2) || 'N/A'}€</p>
            </div>
            <p>Vous trouverez ci-joint votre contrat signé au format PDF.</p>
            <p>Votre abonnement est maintenant actif. Vous pouvez accéder à votre espace client :</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="https://app.symphonia-controltower.com"
                 style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                Accéder à mon espace
              </a>
            </p>
            <p>Merci de votre confiance.</p>
            <p>L'équipe SYMPHONI.A</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <p style="font-size: 12px; color: #6b7280;">
              RT Technologie SAS - 1088 avenue de Champollion, 38530 Pontcharra<br>
              SIRET: 948816988 - TVA: FR41948816988
            </p>
          </div>
        `,
        attachments: [
          {
            filename: `Contrat-SYMPHONIA-${contractNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ]
      };

      await transporter.sendMail(mailOptions);

      // Update contract
      await db.collection('contracts').updateOne(
        { contractNumber },
        {
          $set: {
            signedContractEmailSent: true,
            signedContractEmailSentAt: new Date(),
            updatedAt: new Date()
          }
        }
      );

      console.log(`[Contract] Signed contract email sent for ${contractNumber}`);
      return { success: true };
    } catch (error) {
      console.error('[Contract] Error sending signed contract email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Activate subscription after contract is signed
   */
  async activateSubscription(contract) {
    const db = this.mongoClient.db();

    try {
      // Update user subscription status
      if (contract.onboardingRequestId) {
        const authDb = this.mongoClient.db('rt-auth');

        await authDb.collection('onboarding_requests').updateOne(
          { _id: contract.onboardingRequestId },
          {
            $set: {
              contractSigned: true,
              contractSignedAt: new Date(),
              contractNumber: contract.contractNumber,
              status: 'active',
              updatedAt: new Date()
            }
          }
        );

        // Find and update user
        const onboardingRequest = await authDb.collection('onboarding_requests').findOne({
          _id: contract.onboardingRequestId
        });

        if (onboardingRequest?.userId) {
          await db.collection('users').updateOne(
            { _id: onboardingRequest.userId },
            {
              $set: {
                contractSigned: true,
                contractNumber: contract.contractNumber,
                subscriptionStatus: 'active',
                updatedAt: new Date()
              }
            }
          );
        }
      }

      console.log(`[Contract] Subscription activated for contract ${contract.contractNumber}`);
    } catch (error) {
      console.error('[Contract] Error activating subscription:', error);
    }
  }

  /**
   * Get contract by number
   */
  async getContract(contractNumber) {
    const db = this.mongoClient.db();
    return await db.collection('contracts').findOne({ contractNumber });
  }

  /**
   * List contracts for a client
   */
  async listClientContracts(clientEmail) {
    const db = this.mongoClient.db();
    return await db.collection('contracts')
      .find({ clientEmail })
      .sort({ createdAt: -1 })
      .toArray();
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  ContractService,
  generateContractPDF,
  generateContractNumber,
  SUBSCRIPTION_PLANS,
  ADDITIONAL_OPTIONS,
  DISCOUNT_RATES,
  getDiscountRate,
  RT_TECHNOLOGIE
};
