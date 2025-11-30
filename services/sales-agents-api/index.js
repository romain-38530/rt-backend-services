/**
 * SYMPHONI.A - Sales Agents & Commissions API
 * Module Agents Commerciaux & Commissions
 *
 * Gestion complete des agents independants integree au CRM commercial
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');
const cron = require('node-cron');
const {
  format,
  startOfMonth,
  endOfMonth,
  addMonths,
  differenceInMonths
} = require('date-fns');
const { fr } = require('date-fns/locale');

const app = express();
const PORT = process.env.PORT || 3015;

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  // Commission par client actif par mois
  COMMISSION_PER_CLIENT: 70.00,

  // Challenge "1000 clients en 4 mois"
  CHALLENGE: {
    name: '1000 clients en 4 mois',
    target: 1000,
    durationMonths: 4,
    prizes: {
      first: 4000,
      second: 2000,
      third: 1000
    }
  },

  // Regions disponibles
  REGIONS: [
    'Ile-de-France',
    'Auvergne-Rhone-Alpes',
    'Nouvelle-Aquitaine',
    'Occitanie',
    'Hauts-de-France',
    'Provence-Alpes-Cote d\'Azur',
    'Grand Est',
    'Pays de la Loire',
    'Bretagne',
    'Normandie',
    'Bourgogne-Franche-Comte',
    'Centre-Val de Loire',
    'Corse'
  ]
};

// =============================================================================
// MONGOOSE SCHEMAS
// =============================================================================

// Schema Agent Commercial
const agentSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },

  // Informations personnelles
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  address: {
    street: String,
    city: String,
    postalCode: String,
    country: { type: String, default: 'France' }
  },

  // Authentification portail
  password: String,
  portalActivated: { type: Boolean, default: false },
  lastLogin: Date,

  // Statut independant
  siret: String,
  companyName: String,

  // Documents administratifs
  documents: {
    identityCard: {
      uploaded: { type: Boolean, default: false },
      url: String,
      uploadedAt: Date,
      verified: { type: Boolean, default: false }
    },
    rib: {
      uploaded: { type: Boolean, default: false },
      url: String,
      uploadedAt: Date,
      iban: String,
      bic: String,
      verified: { type: Boolean, default: false }
    },
    urssaf: {
      uploaded: { type: Boolean, default: false },
      url: String,
      uploadedAt: Date,
      verified: { type: Boolean, default: false },
      expirationDate: Date
    }
  },

  // Region et zone geographique
  region: { type: String, required: true },
  departments: [String],

  // Contrat
  contract: {
    generatedAt: Date,
    signedAt: Date,
    signatureId: String,  // ID signature electronique
    pdfUrl: String,
    duration: { type: String, enum: ['unlimited', '1_year'], default: 'unlimited' },
    commissionRate: { type: Number, default: CONFIG.COMMISSION_PER_CLIENT }
  },

  // Statut agent
  status: {
    type: String,
    enum: ['pending_signature', 'active', 'suspended', 'terminated', 'non_compliant'],
    default: 'pending_signature'
  },
  statusHistory: [{
    status: String,
    changedAt: { type: Date, default: Date.now },
    reason: String,
    changedBy: String
  }],

  // Metriques performance
  metrics: {
    totalClientsSigned: { type: Number, default: 0 },
    activeClients: { type: Number, default: 0 },
    totalCommissionsEarned: { type: Number, default: 0 },
    totalCommissionsPaid: { type: Number, default: 0 },
    currentMonthClients: { type: Number, default: 0 }
  },

  // Metadonnees
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: String
});

// Schema Client signe par un agent
const agentClientSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  agentId: { type: String, required: true, index: true },

  // Informations client
  companyName: { type: String, required: true },
  companyId: String,  // ID dans le systeme SYMPHONI.A
  contactName: String,
  contactEmail: String,
  contactPhone: String,

  // Contrat client
  subscriptionType: String,  // Type d'abonnement SYMPHONI.A
  monthlyValue: Number,  // Valeur mensuelle du contrat
  signedAt: { type: Date, required: true },
  activatedAt: Date,

  // Statut
  status: {
    type: String,
    enum: ['pending', 'active', 'churned', 'cancelled'],
    default: 'pending'
  },
  churnedAt: Date,
  churnReason: String,

  // Commission
  commissionStartDate: Date,
  commissionEndDate: Date,

  createdAt: { type: Date, default: Date.now }
});

// Schema Commission mensuelle
const commissionSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  agentId: { type: String, required: true, index: true },

  // Periode
  period: { type: String, required: true },  // Format: YYYY-MM
  periodStart: Date,
  periodEnd: Date,

  // Calcul
  activeClientsCount: { type: Number, default: 0 },
  commissionRate: { type: Number, default: CONFIG.COMMISSION_PER_CLIENT },
  grossAmount: { type: Number, default: 0 },

  // Details des clients
  clientsDetails: [{
    clientId: String,
    companyName: String,
    monthlyCommission: Number
  }],

  // Statut paiement
  status: {
    type: String,
    enum: ['calculated', 'validated', 'paid', 'disputed'],
    default: 'calculated'
  },
  validatedAt: Date,
  validatedBy: String,
  paidAt: Date,
  paymentReference: String,

  // Bordereau PDF
  statementPdfUrl: String,

  createdAt: { type: Date, default: Date.now }
});

// Schema Challenge
const challengeSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  name: { type: String, required: true },
  description: String,

  // Objectif
  targetClients: { type: Number, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },

  // Prix
  prizes: {
    first: Number,
    second: Number,
    third: Number
  },

  // Statut
  status: {
    type: String,
    enum: ['upcoming', 'active', 'completed'],
    default: 'upcoming'
  },

  // Resultats
  totalClientsSigned: { type: Number, default: 0 },
  ranking: [{
    agentId: String,
    agentName: String,
    clientsSigned: Number,
    rank: Number,
    prize: Number
  }],

  winnersAnnounced: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now }
});

const Agent = mongoose.model('Agent', agentSchema);
const AgentClient = mongoose.model('AgentClient', agentClientSchema);
const Commission = mongoose.model('Commission', commissionSchema);
const Challenge = mongoose.model('Challenge', challengeSchema);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Genere un contrat PDF pour un agent
 */
async function generateContractPDF(agent) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // En-tete
    doc.fontSize(20).font('Helvetica-Bold')
       .text('CONTRAT D\'AGENT COMMERCIAL', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).font('Helvetica')
       .text('SYMPHONI.A - Plateforme de gestion logistique intelligente', { align: 'center' });
    doc.moveDown(2);

    // Parties
    doc.fontSize(12).font('Helvetica-Bold').text('ENTRE LES SOUSSIGNES :');
    doc.moveDown(0.5);
    doc.font('Helvetica').text('SYMPHONI.A SAS, societe par actions simplifiee');
    doc.text('Ci-apres denommee "Le Mandant"');
    doc.moveDown();
    doc.text('ET');
    doc.moveDown();
    doc.text(`${agent.firstName} ${agent.lastName}`);
    if (agent.companyName) {
      doc.text(`Exer\u00e7ant sous le nom : ${agent.companyName}`);
    }
    if (agent.siret) {
      doc.text(`SIRET : ${agent.siret}`);
    }
    doc.text(`Adresse : ${agent.address?.street || ''}, ${agent.address?.postalCode || ''} ${agent.address?.city || ''}`);
    doc.text('Ci-apres denomme "L\'Agent Commercial"');
    doc.moveDown(2);

    // Article 1 - Objet
    doc.font('Helvetica-Bold').text('ARTICLE 1 - OBJET DU CONTRAT');
    doc.moveDown(0.5);
    doc.font('Helvetica').text(
      'Le Mandant confie a l\'Agent Commercial, qui accepte, la mission de prospecter ' +
      'et de developper la clientele pour les services de la plateforme SYMPHONI.A ' +
      `dans la region : ${agent.region}.`
    );
    doc.moveDown();

    // Article 2 - Zone geographique
    doc.font('Helvetica-Bold').text('ARTICLE 2 - ZONE GEOGRAPHIQUE');
    doc.moveDown(0.5);
    doc.font('Helvetica').text(`Region attribuee : ${agent.region}`);
    if (agent.departments && agent.departments.length > 0) {
      doc.text(`Departements : ${agent.departments.join(', ')}`);
    }
    doc.moveDown();

    // Article 3 - Remuneration
    doc.font('Helvetica-Bold').text('ARTICLE 3 - REMUNERATION');
    doc.moveDown(0.5);
    doc.font('Helvetica').text(
      `L'Agent Commercial percevra une commission de ${CONFIG.COMMISSION_PER_CLIENT} EUR (soixante-dix euros) ` +
      'par mois pour chaque contrat client actif qu\'il aura signe.'
    );
    doc.moveDown(0.5);
    doc.text(
      'Cette commission sera versee pendant toute la duree de vie du contrat client, ' +
      'creant ainsi un revenu recurrent.'
    );
    doc.moveDown(0.5);
    doc.text('Le versement des commissions sera effectue mensuellement, le 10 du mois suivant.');
    doc.moveDown();

    // Article 4 - Duree
    doc.font('Helvetica-Bold').text('ARTICLE 4 - DUREE');
    doc.moveDown(0.5);
    doc.font('Helvetica').text(
      agent.contract?.duration === '1_year'
        ? 'Le present contrat est conclu pour une duree d\'un (1) an, renouvelable par tacite reconduction.'
        : 'Le present contrat est conclu pour une duree indeterminee.'
    );
    doc.moveDown();

    // Article 5 - Obligations
    doc.font('Helvetica-Bold').text('ARTICLE 5 - OBLIGATIONS DE L\'AGENT');
    doc.moveDown(0.5);
    doc.font('Helvetica')
       .text('- Respecter la charte commerciale SYMPHONI.A')
       .text('- Transmettre les informations clients avec exactitude')
       .text('- Maintenir a jour ses documents administratifs (URSSAF, RIB)')
       .text('- Respecter la confidentialite des informations clients');
    doc.moveDown();

    // Article 6 - Non-exclusivite
    doc.font('Helvetica-Bold').text('ARTICLE 6 - NON-EXCLUSIVITE');
    doc.moveDown(0.5);
    doc.font('Helvetica').text(
      'Le present contrat n\'est pas exclusif. L\'Agent Commercial peut exercer ' +
      'd\'autres activites professionnelles sous reserve qu\'elles ne soient pas ' +
      'concurrentes de l\'activite de SYMPHONI.A.'
    );
    doc.moveDown(2);

    // Signatures
    doc.font('Helvetica-Bold').text('SIGNATURES');
    doc.moveDown();

    const signatureY = doc.y;
    doc.font('Helvetica')
       .text('Pour SYMPHONI.A', 50, signatureY)
       .text('L\'Agent Commercial', 350, signatureY);

    doc.moveDown(3);
    doc.text('Date : _______________', 50)
       .text('Date : _______________', 350);

    doc.moveDown(2);
    doc.text('Signature :', 50)
       .text('Signature :', 350);

    // Pied de page
    doc.moveDown(4);
    doc.fontSize(8).text(
      `Contrat genere automatiquement le ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
      { align: 'center' }
    );
    doc.text(`Reference : AGT-${agent.id.substring(0, 8).toUpperCase()}`, { align: 'center' });

    doc.end();
  });
}

/**
 * Genere un bordereau de commission PDF
 */
async function generateCommissionStatementPDF(agent, commission) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // En-tete
    doc.fontSize(18).font('Helvetica-Bold')
       .text('BORDEREAU DE COMMISSION', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).font('Helvetica')
       .text(`Periode : ${commission.period}`, { align: 'center' });
    doc.moveDown(2);

    // Informations agent
    doc.font('Helvetica-Bold').text('AGENT COMMERCIAL');
    doc.font('Helvetica')
       .text(`${agent.firstName} ${agent.lastName}`)
       .text(`Email : ${agent.email}`)
       .text(`Region : ${agent.region}`);
    doc.moveDown(2);

    // Resume
    doc.font('Helvetica-Bold').text('RESUME');
    doc.moveDown(0.5);

    const tableTop = doc.y;
    doc.font('Helvetica')
       .text('Nombre de clients actifs :', 50, tableTop)
       .text(commission.activeClientsCount.toString(), 250, tableTop)
       .text('Taux par client :', 50, tableTop + 20)
       .text(`${commission.commissionRate.toFixed(2)} EUR`, 250, tableTop + 20)
       .text('TOTAL COMMISSION :', 50, tableTop + 50)
       .font('Helvetica-Bold')
       .text(`${commission.grossAmount.toFixed(2)} EUR`, 250, tableTop + 50);

    doc.moveDown(5);

    // Detail des clients
    if (commission.clientsDetails && commission.clientsDetails.length > 0) {
      doc.font('Helvetica-Bold').text('DETAIL DES CLIENTS');
      doc.moveDown(0.5);

      let y = doc.y;
      doc.font('Helvetica-Bold')
         .text('Client', 50, y)
         .text('Commission', 400, y);

      doc.moveTo(50, y + 15).lineTo(500, y + 15).stroke();
      y += 25;

      doc.font('Helvetica');
      commission.clientsDetails.forEach(client => {
        doc.text(client.companyName, 50, y)
           .text(`${client.monthlyCommission.toFixed(2)} EUR`, 400, y);
        y += 18;
      });
    }

    // Pied de page
    doc.fontSize(8)
       .text(
         `Bordereau genere le ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
         50, 700, { align: 'center' }
       )
       .text(
         `Reference : COM-${commission.id.substring(0, 8).toUpperCase()}`,
         { align: 'center' }
       );

    doc.end();
  });
}

/**
 * Calcule les commissions pour un mois donne
 */
async function calculateMonthlyCommissions(periodDate = new Date()) {
  const period = format(periodDate, 'yyyy-MM');
  const periodStart = startOfMonth(periodDate);
  const periodEnd = endOfMonth(periodDate);

  // Recuperer tous les agents actifs
  const agents = await Agent.find({ status: 'active' });

  const results = [];

  for (const agent of agents) {
    // Compter les clients actifs de cet agent
    const activeClients = await AgentClient.find({
      agentId: agent.id,
      status: 'active',
      signedAt: { $lte: periodEnd }
    });

    const activeClientsCount = activeClients.length;
    const grossAmount = activeClientsCount * agent.contract.commissionRate;

    // Creer ou mettre a jour la commission
    let commission = await Commission.findOne({ agentId: agent.id, period });

    if (!commission) {
      commission = new Commission({
        agentId: agent.id,
        period,
        periodStart,
        periodEnd
      });
    }

    commission.activeClientsCount = activeClientsCount;
    commission.commissionRate = agent.contract.commissionRate;
    commission.grossAmount = grossAmount;
    commission.clientsDetails = activeClients.map(client => ({
      clientId: client.id,
      companyName: client.companyName,
      monthlyCommission: agent.contract.commissionRate
    }));

    await commission.save();

    // Mettre a jour les metriques de l'agent
    agent.metrics.activeClients = activeClientsCount;
    await agent.save();

    results.push({
      agentId: agent.id,
      agentName: `${agent.firstName} ${agent.lastName}`,
      period,
      activeClients: activeClientsCount,
      commission: grossAmount
    });
  }

  return results;
}

/**
 * Met a jour le classement du challenge
 */
async function updateChallengeRanking(challengeId) {
  const challenge = await Challenge.findOne({ id: challengeId });
  if (!challenge || challenge.status !== 'active') return;

  // Compter les clients signes par chaque agent pendant la periode du challenge
  const agentStats = await AgentClient.aggregate([
    {
      $match: {
        signedAt: { $gte: challenge.startDate, $lte: challenge.endDate }
      }
    },
    {
      $group: {
        _id: '$agentId',
        clientsSigned: { $sum: 1 }
      }
    },
    { $sort: { clientsSigned: -1 } }
  ]);

  // Enrichir avec les noms des agents
  const ranking = [];
  let rank = 1;
  let totalClientsSigned = 0;

  for (const stat of agentStats) {
    const agent = await Agent.findOne({ id: stat._id });
    if (agent) {
      let prize = 0;
      if (rank === 1) prize = challenge.prizes.first;
      else if (rank === 2) prize = challenge.prizes.second;
      else if (rank === 3) prize = challenge.prizes.third;

      ranking.push({
        agentId: stat._id,
        agentName: `${agent.firstName} ${agent.lastName}`,
        clientsSigned: stat.clientsSigned,
        rank,
        prize
      });

      totalClientsSigned += stat.clientsSigned;
      rank++;
    }
  }

  challenge.ranking = ranking;
  challenge.totalClientsSigned = totalClientsSigned;
  await challenge.save();

  return ranking;
}

// =============================================================================
// AUTHENTICATION MIDDLEWARE
// =============================================================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token requis' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'symphonia-secret', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide' });
    }
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Acces administrateur requis' });
  }
  next();
};

// =============================================================================
// ROUTES - GESTION DES AGENTS
// =============================================================================

/**
 * POST /agents
 * Creer un nouvel agent commercial
 */
app.post('/agents', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      address,
      siret,
      companyName,
      region,
      departments,
      contractDuration
    } = req.body;

    // Verifier si l'email existe deja
    const existingAgent = await Agent.findOne({ email });
    if (existingAgent) {
      return res.status(400).json({ error: 'Un agent avec cet email existe deja' });
    }

    const agent = new Agent({
      firstName,
      lastName,
      email,
      phone,
      address,
      siret,
      companyName,
      region,
      departments: departments || [],
      contract: {
        duration: contractDuration || 'unlimited',
        commissionRate: CONFIG.COMMISSION_PER_CLIENT,
        generatedAt: new Date()
      },
      status: 'pending_signature',
      statusHistory: [{
        status: 'pending_signature',
        reason: 'Creation du profil agent',
        changedBy: req.user.id
      }],
      createdBy: req.user.id
    });

    await agent.save();

    // Generer le contrat PDF
    const contractPdf = await generateContractPDF(agent);
    // En production: sauvegarder le PDF sur S3/GCS et stocker l'URL
    agent.contract.pdfUrl = `/contracts/agent-${agent.id}.pdf`;
    await agent.save();

    res.status(201).json({
      agent,
      message: 'Agent cree avec succes. Contrat genere et en attente de signature.'
    });
  } catch (error) {
    console.error('Erreur creation agent:', error);
    res.status(500).json({ error: 'Erreur lors de la creation de l\'agent' });
  }
});

/**
 * GET /agents
 * Liste des agents (admin)
 */
app.get('/agents', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, region, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (region) filter.region = region;

    const agents = await Agent.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Agent.countDocuments(filter);

    res.json({
      agents,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur liste agents:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation des agents' });
  }
});

/**
 * GET /agents/:id
 * Detail d'un agent
 */
app.get('/agents/:id', authenticateToken, async (req, res) => {
  try {
    const agent = await Agent.findOne({ id: req.params.id }).select('-password');

    if (!agent) {
      return res.status(404).json({ error: 'Agent non trouve' });
    }

    // Recuperer les clients de l'agent
    const clients = await AgentClient.find({ agentId: agent.id });

    // Recuperer les commissions recentes
    const commissions = await Commission.find({ agentId: agent.id })
      .sort({ period: -1 })
      .limit(12);

    res.json({ agent, clients, commissions });
  } catch (error) {
    console.error('Erreur detail agent:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation de l\'agent' });
  }
});

/**
 * PUT /agents/:id
 * Modifier un agent
 */
app.put('/agents/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const agent = await Agent.findOne({ id: req.params.id });
    if (!agent) {
      return res.status(404).json({ error: 'Agent non trouve' });
    }

    const allowedUpdates = [
      'firstName', 'lastName', 'phone', 'address',
      'siret', 'companyName', 'region', 'departments'
    ];

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        agent[field] = req.body[field];
      }
    });

    agent.updatedAt = new Date();
    await agent.save();

    res.json({ agent, message: 'Agent mis a jour' });
  } catch (error) {
    console.error('Erreur modification agent:', error);
    res.status(500).json({ error: 'Erreur lors de la modification de l\'agent' });
  }
});

/**
 * POST /agents/:id/status
 * Changer le statut d'un agent
 */
app.post('/agents/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, reason } = req.body;

    const agent = await Agent.findOne({ id: req.params.id });
    if (!agent) {
      return res.status(404).json({ error: 'Agent non trouve' });
    }

    const validStatuses = ['pending_signature', 'active', 'suspended', 'terminated', 'non_compliant'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }

    agent.status = status;
    agent.statusHistory.push({
      status,
      reason,
      changedBy: req.user.id
    });
    agent.updatedAt = new Date();

    await agent.save();

    res.json({ agent, message: `Statut change en: ${status}` });
  } catch (error) {
    console.error('Erreur changement statut:', error);
    res.status(500).json({ error: 'Erreur lors du changement de statut' });
  }
});

/**
 * POST /agents/:id/activate
 * Activer un agent apres signature du contrat
 */
app.post('/agents/:id/activate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { signatureId } = req.body;

    const agent = await Agent.findOne({ id: req.params.id });
    if (!agent) {
      return res.status(404).json({ error: 'Agent non trouve' });
    }

    if (agent.status !== 'pending_signature') {
      return res.status(400).json({ error: 'L\'agent n\'est pas en attente de signature' });
    }

    // Generer un mot de passe temporaire pour le portail
    const tempPassword = uuidv4().substring(0, 8);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    agent.status = 'active';
    agent.contract.signedAt = new Date();
    agent.contract.signatureId = signatureId;
    agent.password = hashedPassword;
    agent.portalActivated = true;
    agent.statusHistory.push({
      status: 'active',
      reason: 'Contrat signe et valide',
      changedBy: req.user.id
    });
    agent.updatedAt = new Date();

    await agent.save();

    // En production: envoyer email avec credentials

    res.json({
      agent,
      portalCredentials: {
        email: agent.email,
        tempPassword
      },
      message: 'Agent active avec succes'
    });
  } catch (error) {
    console.error('Erreur activation agent:', error);
    res.status(500).json({ error: 'Erreur lors de l\'activation de l\'agent' });
  }
});

/**
 * POST /agents/:id/documents
 * Upload d'un document administratif
 */
app.post('/agents/:id/documents', authenticateToken, async (req, res) => {
  try {
    const { documentType, url, iban, bic, expirationDate } = req.body;

    const agent = await Agent.findOne({ id: req.params.id });
    if (!agent) {
      return res.status(404).json({ error: 'Agent non trouve' });
    }

    const validTypes = ['identityCard', 'rib', 'urssaf'];
    if (!validTypes.includes(documentType)) {
      return res.status(400).json({ error: 'Type de document invalide' });
    }

    agent.documents[documentType] = {
      uploaded: true,
      url,
      uploadedAt: new Date(),
      verified: false
    };

    if (documentType === 'rib') {
      agent.documents.rib.iban = iban;
      agent.documents.rib.bic = bic;
    }

    if (documentType === 'urssaf' && expirationDate) {
      agent.documents.urssaf.expirationDate = new Date(expirationDate);
    }

    agent.updatedAt = new Date();
    await agent.save();

    res.json({ agent, message: 'Document uploade avec succes' });
  } catch (error) {
    console.error('Erreur upload document:', error);
    res.status(500).json({ error: 'Erreur lors de l\'upload du document' });
  }
});

/**
 * POST /agents/:id/documents/:type/verify
 * Verifier un document
 */
app.post('/agents/:id/documents/:type/verify', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { type } = req.params;

    const agent = await Agent.findOne({ id: req.params.id });
    if (!agent) {
      return res.status(404).json({ error: 'Agent non trouve' });
    }

    if (!agent.documents[type]) {
      return res.status(400).json({ error: 'Document non trouve' });
    }

    agent.documents[type].verified = true;
    agent.updatedAt = new Date();
    await agent.save();

    res.json({ agent, message: 'Document verifie' });
  } catch (error) {
    console.error('Erreur verification document:', error);
    res.status(500).json({ error: 'Erreur lors de la verification' });
  }
});

// =============================================================================
// ROUTES - CLIENTS SIGNES PAR AGENTS
// =============================================================================

/**
 * POST /agents/:id/clients
 * Ajouter un client signe par un agent
 */
app.post('/agents/:id/clients', authenticateToken, async (req, res) => {
  try {
    const agent = await Agent.findOne({ id: req.params.id });
    if (!agent) {
      return res.status(404).json({ error: 'Agent non trouve' });
    }

    if (agent.status !== 'active') {
      return res.status(400).json({ error: 'L\'agent n\'est pas actif' });
    }

    const {
      companyName,
      companyId,
      contactName,
      contactEmail,
      contactPhone,
      subscriptionType,
      monthlyValue
    } = req.body;

    const client = new AgentClient({
      agentId: agent.id,
      companyName,
      companyId,
      contactName,
      contactEmail,
      contactPhone,
      subscriptionType,
      monthlyValue,
      signedAt: new Date(),
      status: 'pending'
    });

    await client.save();

    // Mettre a jour les metriques
    agent.metrics.totalClientsSigned += 1;
    agent.metrics.currentMonthClients += 1;
    await agent.save();

    res.status(201).json({ client, message: 'Client ajoute avec succes' });
  } catch (error) {
    console.error('Erreur ajout client:', error);
    res.status(500).json({ error: 'Erreur lors de l\'ajout du client' });
  }
});

/**
 * POST /agents/clients/:clientId/activate
 * Activer un client (debut des commissions)
 */
app.post('/agents/clients/:clientId/activate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const client = await AgentClient.findOne({ id: req.params.clientId });
    if (!client) {
      return res.status(404).json({ error: 'Client non trouve' });
    }

    client.status = 'active';
    client.activatedAt = new Date();
    client.commissionStartDate = new Date();
    await client.save();

    // Mettre a jour les metriques de l'agent
    const agent = await Agent.findOne({ id: client.agentId });
    if (agent) {
      agent.metrics.activeClients += 1;
      await agent.save();
    }

    res.json({ client, message: 'Client active, commissions demarrees' });
  } catch (error) {
    console.error('Erreur activation client:', error);
    res.status(500).json({ error: 'Erreur lors de l\'activation du client' });
  }
});

/**
 * POST /agents/clients/:clientId/churn
 * Marquer un client comme parti (churn)
 */
app.post('/agents/clients/:clientId/churn', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body;

    const client = await AgentClient.findOne({ id: req.params.clientId });
    if (!client) {
      return res.status(404).json({ error: 'Client non trouve' });
    }

    client.status = 'churned';
    client.churnedAt = new Date();
    client.churnReason = reason;
    client.commissionEndDate = new Date();
    await client.save();

    // Mettre a jour les metriques de l'agent
    const agent = await Agent.findOne({ id: client.agentId });
    if (agent) {
      agent.metrics.activeClients = Math.max(0, agent.metrics.activeClients - 1);
      await agent.save();
    }

    res.json({ client, message: 'Client marque comme parti' });
  } catch (error) {
    console.error('Erreur churn client:', error);
    res.status(500).json({ error: 'Erreur lors du churn' });
  }
});

/**
 * GET /agents/:id/clients
 * Liste des clients d'un agent
 */
app.get('/agents/:id/clients', authenticateToken, async (req, res) => {
  try {
    const { status } = req.query;

    const filter = { agentId: req.params.id };
    if (status) filter.status = status;

    const clients = await AgentClient.find(filter).sort({ signedAt: -1 });

    res.json({ clients });
  } catch (error) {
    console.error('Erreur liste clients:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation des clients' });
  }
});

// =============================================================================
// ROUTES - COMMISSIONS
// =============================================================================

/**
 * POST /commissions/calculate
 * Calculer les commissions pour un mois
 */
app.post('/commissions/calculate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { period } = req.body;  // Format: YYYY-MM

    const periodDate = period ? new Date(period + '-01') : new Date();
    const results = await calculateMonthlyCommissions(periodDate);

    res.json({
      period: format(periodDate, 'yyyy-MM'),
      results,
      totalAgents: results.length,
      totalCommissions: results.reduce((sum, r) => sum + r.commission, 0)
    });
  } catch (error) {
    console.error('Erreur calcul commissions:', error);
    res.status(500).json({ error: 'Erreur lors du calcul des commissions' });
  }
});

/**
 * GET /commissions
 * Liste des commissions (admin)
 */
app.get('/commissions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { period, status, agentId, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (period) filter.period = period;
    if (status) filter.status = status;
    if (agentId) filter.agentId = agentId;

    const commissions = await Commission.find(filter)
      .sort({ period: -1, grossAmount: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Enrichir avec les infos agents
    const enrichedCommissions = await Promise.all(
      commissions.map(async (comm) => {
        const agent = await Agent.findOne({ id: comm.agentId });
        return {
          ...comm.toObject(),
          agentName: agent ? `${agent.firstName} ${agent.lastName}` : 'Inconnu',
          agentEmail: agent?.email
        };
      })
    );

    const total = await Commission.countDocuments(filter);

    res.json({
      commissions: enrichedCommissions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur liste commissions:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation des commissions' });
  }
});

/**
 * GET /commissions/:id
 * Detail d'une commission
 */
app.get('/commissions/:id', authenticateToken, async (req, res) => {
  try {
    const commission = await Commission.findOne({ id: req.params.id });
    if (!commission) {
      return res.status(404).json({ error: 'Commission non trouvee' });
    }

    const agent = await Agent.findOne({ id: commission.agentId });

    res.json({
      commission,
      agent: agent ? {
        id: agent.id,
        name: `${agent.firstName} ${agent.lastName}`,
        email: agent.email
      } : null
    });
  } catch (error) {
    console.error('Erreur detail commission:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation' });
  }
});

/**
 * POST /commissions/:id/validate
 * Valider une commission pour paiement
 */
app.post('/commissions/:id/validate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const commission = await Commission.findOne({ id: req.params.id });
    if (!commission) {
      return res.status(404).json({ error: 'Commission non trouvee' });
    }

    commission.status = 'validated';
    commission.validatedAt = new Date();
    commission.validatedBy = req.user.id;
    await commission.save();

    res.json({ commission, message: 'Commission validee' });
  } catch (error) {
    console.error('Erreur validation commission:', error);
    res.status(500).json({ error: 'Erreur lors de la validation' });
  }
});

/**
 * POST /commissions/:id/pay
 * Marquer une commission comme payee
 */
app.post('/commissions/:id/pay', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { paymentReference } = req.body;

    const commission = await Commission.findOne({ id: req.params.id });
    if (!commission) {
      return res.status(404).json({ error: 'Commission non trouvee' });
    }

    if (commission.status !== 'validated') {
      return res.status(400).json({ error: 'La commission doit etre validee avant paiement' });
    }

    commission.status = 'paid';
    commission.paidAt = new Date();
    commission.paymentReference = paymentReference;
    await commission.save();

    // Mettre a jour les metriques de l'agent
    const agent = await Agent.findOne({ id: commission.agentId });
    if (agent) {
      agent.metrics.totalCommissionsPaid += commission.grossAmount;
      await agent.save();
    }

    res.json({ commission, message: 'Commission payee' });
  } catch (error) {
    console.error('Erreur paiement commission:', error);
    res.status(500).json({ error: 'Erreur lors du paiement' });
  }
});

/**
 * GET /commissions/:id/statement
 * Generer le bordereau de commission PDF
 */
app.get('/commissions/:id/statement', authenticateToken, async (req, res) => {
  try {
    const commission = await Commission.findOne({ id: req.params.id });
    if (!commission) {
      return res.status(404).json({ error: 'Commission non trouvee' });
    }

    const agent = await Agent.findOne({ id: commission.agentId });
    if (!agent) {
      return res.status(404).json({ error: 'Agent non trouve' });
    }

    const pdfBuffer = await generateCommissionStatementPDF(agent, commission);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=bordereau-${commission.period}-${agent.lastName}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Erreur generation bordereau:', error);
    res.status(500).json({ error: 'Erreur lors de la generation du bordereau' });
  }
});

/**
 * GET /commissions/export
 * Export comptable des commissions
 */
app.get('/commissions/export', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { period, format: exportFormat = 'csv' } = req.query;

    const filter = { status: 'validated' };
    if (period) filter.period = period;

    const commissions = await Commission.find(filter);

    // Enrichir avec les infos agents
    const exportData = await Promise.all(
      commissions.map(async (comm) => {
        const agent = await Agent.findOne({ id: comm.agentId });
        return {
          period: comm.period,
          agentId: comm.agentId,
          agentName: agent ? `${agent.firstName} ${agent.lastName}` : '',
          agentEmail: agent?.email || '',
          iban: agent?.documents?.rib?.iban || '',
          bic: agent?.documents?.rib?.bic || '',
          activeClients: comm.activeClientsCount,
          commissionRate: comm.commissionRate,
          grossAmount: comm.grossAmount,
          status: comm.status
        };
      })
    );

    if (exportFormat === 'csv') {
      const csvHeader = 'Periode;Agent ID;Nom Agent;Email;IBAN;BIC;Clients Actifs;Taux;Montant;Statut\n';
      const csvRows = exportData.map(d =>
        `${d.period};${d.agentId};${d.agentName};${d.agentEmail};${d.iban};${d.bic};${d.activeClients};${d.commissionRate};${d.grossAmount};${d.status}`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=commissions-export-${period || 'all'}.csv`);
      res.send(csvHeader + csvRows);
    } else {
      res.json({ data: exportData });
    }
  } catch (error) {
    console.error('Erreur export commissions:', error);
    res.status(500).json({ error: 'Erreur lors de l\'export' });
  }
});

// =============================================================================
// ROUTES - CHALLENGES
// =============================================================================

/**
 * POST /challenges
 * Creer un nouveau challenge
 */
app.post('/challenges', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, targetClients, startDate, endDate, prizes } = req.body;

    const challenge = new Challenge({
      name,
      description,
      targetClients,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      prizes: prizes || CONFIG.CHALLENGE.prizes,
      status: new Date(startDate) > new Date() ? 'upcoming' : 'active'
    });

    await challenge.save();

    res.status(201).json({ challenge, message: 'Challenge cree' });
  } catch (error) {
    console.error('Erreur creation challenge:', error);
    res.status(500).json({ error: 'Erreur lors de la creation du challenge' });
  }
});

/**
 * GET /challenges
 * Liste des challenges
 */
app.get('/challenges', authenticateToken, async (req, res) => {
  try {
    const { status } = req.query;

    const filter = {};
    if (status) filter.status = status;

    const challenges = await Challenge.find(filter).sort({ startDate: -1 });

    res.json({ challenges });
  } catch (error) {
    console.error('Erreur liste challenges:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation des challenges' });
  }
});

/**
 * GET /challenges/:id
 * Detail d'un challenge avec classement
 */
app.get('/challenges/:id', authenticateToken, async (req, res) => {
  try {
    const challenge = await Challenge.findOne({ id: req.params.id });
    if (!challenge) {
      return res.status(404).json({ error: 'Challenge non trouve' });
    }

    // Mettre a jour le classement
    if (challenge.status === 'active') {
      await updateChallengeRanking(challenge.id);
      await challenge.reload();
    }

    res.json({ challenge });
  } catch (error) {
    console.error('Erreur detail challenge:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation du challenge' });
  }
});

/**
 * POST /challenges/:id/refresh-ranking
 * Rafraichir le classement d'un challenge
 */
app.post('/challenges/:id/refresh-ranking', authenticateToken, async (req, res) => {
  try {
    const ranking = await updateChallengeRanking(req.params.id);

    res.json({ ranking, message: 'Classement mis a jour' });
  } catch (error) {
    console.error('Erreur rafraichissement classement:', error);
    res.status(500).json({ error: 'Erreur lors du rafraichissement' });
  }
});

// =============================================================================
// ROUTES - PORTAIL AGENT
// =============================================================================

/**
 * POST /portal/login
 * Connexion au portail agent
 */
app.post('/portal/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const agent = await Agent.findOne({ email });
    if (!agent) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    if (!agent.portalActivated) {
      return res.status(401).json({ error: 'Portail non active' });
    }

    const validPassword = await bcrypt.compare(password, agent.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    agent.lastLogin = new Date();
    await agent.save();

    const token = jwt.sign(
      { id: agent.id, email: agent.email, role: 'agent' },
      process.env.JWT_SECRET || 'symphonia-secret',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      agent: {
        id: agent.id,
        firstName: agent.firstName,
        lastName: agent.lastName,
        email: agent.email,
        region: agent.region
      }
    });
  } catch (error) {
    console.error('Erreur login portail:', error);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

/**
 * GET /portal/dashboard
 * Dashboard personnel de l'agent
 */
app.get('/portal/dashboard', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'agent') {
      return res.status(403).json({ error: 'Acces reserve aux agents' });
    }

    const agent = await Agent.findOne({ id: req.user.id }).select('-password');
    if (!agent) {
      return res.status(404).json({ error: 'Agent non trouve' });
    }

    // Clients
    const activeClients = await AgentClient.countDocuments({
      agentId: agent.id,
      status: 'active'
    });

    const currentMonth = format(new Date(), 'yyyy-MM');
    const currentMonthClients = await AgentClient.countDocuments({
      agentId: agent.id,
      signedAt: {
        $gte: startOfMonth(new Date()),
        $lte: endOfMonth(new Date())
      }
    });

    // Commissions
    const currentCommission = await Commission.findOne({
      agentId: agent.id,
      period: currentMonth
    });

    const totalCommissions = await Commission.aggregate([
      { $match: { agentId: agent.id, status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$grossAmount' } } }
    ]);

    const pendingCommissions = await Commission.aggregate([
      { $match: { agentId: agent.id, status: { $in: ['calculated', 'validated'] } } },
      { $group: { _id: null, total: { $sum: '$grossAmount' } } }
    ]);

    // Challenge actif
    const activeChallenge = await Challenge.findOne({ status: 'active' });
    let challengeRank = null;
    if (activeChallenge) {
      const agentRanking = activeChallenge.ranking.find(r => r.agentId === agent.id);
      if (agentRanking) {
        challengeRank = {
          rank: agentRanking.rank,
          clientsSigned: agentRanking.clientsSigned,
          potentialPrize: agentRanking.prize,
          challengeName: activeChallenge.name,
          totalParticipants: activeChallenge.ranking.length
        };
      }
    }

    // Projection des gains (12 mois)
    const projection12Months = activeClients * CONFIG.COMMISSION_PER_CLIENT * 12;

    res.json({
      agent: {
        id: agent.id,
        name: `${agent.firstName} ${agent.lastName}`,
        region: agent.region,
        status: agent.status
      },
      metrics: {
        activeClients,
        totalClientsSigned: agent.metrics.totalClientsSigned,
        currentMonthClients
      },
      commissions: {
        currentMonth: currentCommission?.grossAmount || 0,
        totalPaid: totalCommissions[0]?.total || 0,
        pending: pendingCommissions[0]?.total || 0,
        projection12Months
      },
      challenge: challengeRank,
      documents: {
        identityCard: agent.documents.identityCard.verified,
        rib: agent.documents.rib.verified,
        urssaf: agent.documents.urssaf.verified
      }
    });
  } catch (error) {
    console.error('Erreur dashboard portail:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation du dashboard' });
  }
});

/**
 * GET /portal/commissions
 * Historique des commissions de l'agent
 */
app.get('/portal/commissions', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'agent') {
      return res.status(403).json({ error: 'Acces reserve aux agents' });
    }

    const commissions = await Commission.find({ agentId: req.user.id })
      .sort({ period: -1 })
      .limit(24);

    res.json({ commissions });
  } catch (error) {
    console.error('Erreur commissions portail:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation des commissions' });
  }
});

/**
 * PUT /portal/profile
 * Mise a jour du profil agent
 */
app.put('/portal/profile', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'agent') {
      return res.status(403).json({ error: 'Acces reserve aux agents' });
    }

    const agent = await Agent.findOne({ id: req.user.id });
    if (!agent) {
      return res.status(404).json({ error: 'Agent non trouve' });
    }

    const { phone, address } = req.body;

    if (phone) agent.phone = phone;
    if (address) agent.address = { ...agent.address, ...address };
    agent.updatedAt = new Date();

    await agent.save();

    res.json({ message: 'Profil mis a jour' });
  } catch (error) {
    console.error('Erreur mise a jour profil:', error);
    res.status(500).json({ error: 'Erreur lors de la mise a jour' });
  }
});

/**
 * PUT /portal/password
 * Changement de mot de passe
 */
app.put('/portal/password', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'agent') {
      return res.status(403).json({ error: 'Acces reserve aux agents' });
    }

    const { currentPassword, newPassword } = req.body;

    const agent = await Agent.findOne({ id: req.user.id });
    if (!agent) {
      return res.status(404).json({ error: 'Agent non trouve' });
    }

    const validPassword = await bcrypt.compare(currentPassword, agent.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
    }

    agent.password = await bcrypt.hash(newPassword, 10);
    agent.updatedAt = new Date();
    await agent.save();

    res.json({ message: 'Mot de passe modifie' });
  } catch (error) {
    console.error('Erreur changement mot de passe:', error);
    res.status(500).json({ error: 'Erreur lors du changement de mot de passe' });
  }
});

// =============================================================================
// ROUTES - DASHBOARD DIRECTION
// =============================================================================

/**
 * GET /dashboard/overview
 * Vue globale pour la direction
 */
app.get('/dashboard/overview', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Agents
    const totalAgents = await Agent.countDocuments();
    const activeAgents = await Agent.countDocuments({ status: 'active' });
    const pendingAgents = await Agent.countDocuments({ status: 'pending_signature' });

    // Clients
    const totalClients = await AgentClient.countDocuments();
    const activeClients = await AgentClient.countDocuments({ status: 'active' });

    // MRR (Monthly Recurring Revenue) des commissions
    const currentMonth = format(new Date(), 'yyyy-MM');
    const monthlyCommissions = await Commission.aggregate([
      { $match: { period: currentMonth } },
      { $group: { _id: null, total: { $sum: '$grossAmount' } } }
    ]);
    const commissionMRR = monthlyCommissions[0]?.total || 0;

    // Distribution par region
    const agentsByRegion = await Agent.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$region', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Top performers
    const topAgents = await Agent.find({ status: 'active' })
      .sort({ 'metrics.activeClients': -1 })
      .limit(10)
      .select('firstName lastName region metrics');

    // Evolution mensuelle (6 derniers mois)
    const monthlyEvolution = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = addMonths(new Date(), -i);
      const period = format(monthDate, 'yyyy-MM');

      const monthCommissions = await Commission.aggregate([
        { $match: { period } },
        { $group: { _id: null, total: { $sum: '$grossAmount' }, clients: { $sum: '$activeClientsCount' } } }
      ]);

      monthlyEvolution.push({
        period,
        commissions: monthCommissions[0]?.total || 0,
        clients: monthCommissions[0]?.clients || 0
      });
    }

    // Challenge actif
    const activeChallenge = await Challenge.findOne({ status: 'active' });

    res.json({
      agents: {
        total: totalAgents,
        active: activeAgents,
        pending: pendingAgents
      },
      clients: {
        total: totalClients,
        active: activeClients
      },
      revenue: {
        commissionMRR,
        projectedARR: commissionMRR * 12
      },
      agentsByRegion,
      topAgents: topAgents.map(a => ({
        name: `${a.firstName} ${a.lastName}`,
        region: a.region,
        activeClients: a.metrics.activeClients,
        totalClients: a.metrics.totalClientsSigned
      })),
      monthlyEvolution,
      challenge: activeChallenge ? {
        name: activeChallenge.name,
        totalClientsSigned: activeChallenge.totalClientsSigned,
        target: activeChallenge.targetClients,
        topRanking: activeChallenge.ranking.slice(0, 5)
      } : null
    });
  } catch (error) {
    console.error('Erreur dashboard direction:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation du dashboard' });
  }
});

/**
 * GET /dashboard/agents/:id
 * Vue detaillee d'un agent pour la direction
 */
app.get('/dashboard/agents/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const agent = await Agent.findOne({ id: req.params.id }).select('-password');
    if (!agent) {
      return res.status(404).json({ error: 'Agent non trouve' });
    }

    // Historique des clients
    const clients = await AgentClient.find({ agentId: agent.id })
      .sort({ signedAt: -1 });

    // Historique des commissions
    const commissions = await Commission.find({ agentId: agent.id })
      .sort({ period: -1 });

    // CA genere par cet agent
    const totalCAGenerated = clients
      .filter(c => c.status === 'active')
      .reduce((sum, c) => sum + (c.monthlyValue || 0), 0);

    // Taux de transformation
    const conversionRate = clients.length > 0
      ? (clients.filter(c => c.status === 'active').length / clients.length * 100).toFixed(1)
      : 0;

    res.json({
      agent,
      clients,
      commissions,
      analytics: {
        totalCAGenerated,
        monthlyCAGenerated: totalCAGenerated,
        conversionRate: parseFloat(conversionRate),
        averageCommissionPerMonth: commissions.length > 0
          ? (commissions.reduce((sum, c) => sum + c.grossAmount, 0) / commissions.length).toFixed(2)
          : 0
      }
    });
  } catch (error) {
    console.error('Erreur detail agent direction:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation' });
  }
});

// =============================================================================
// CRON JOBS
// =============================================================================

// Calcul automatique des commissions le 1er du mois a 2h00
cron.schedule('0 2 1 * *', async () => {
  console.log('Cron: Calcul mensuel des commissions');
  try {
    const results = await calculateMonthlyCommissions();
    console.log(`Commissions calculees pour ${results.length} agents`);
  } catch (error) {
    console.error('Erreur cron commissions:', error);
  }
});

// Mise a jour du classement challenge toutes les heures
cron.schedule('0 * * * *', async () => {
  console.log('Cron: Mise a jour classement challenge');
  try {
    const activeChallenge = await Challenge.findOne({ status: 'active' });
    if (activeChallenge) {
      await updateChallengeRanking(activeChallenge.id);
      console.log('Classement challenge mis a jour');
    }
  } catch (error) {
    console.error('Erreur cron challenge:', error);
  }
});

// Verification conformite URSSAF tous les jours a 8h00
cron.schedule('0 8 * * *', async () => {
  console.log('Cron: Verification conformite URSSAF');
  try {
    const agents = await Agent.find({
      status: 'active',
      'documents.urssaf.expirationDate': { $lt: new Date() }
    });

    for (const agent of agents) {
      agent.status = 'non_compliant';
      agent.statusHistory.push({
        status: 'non_compliant',
        reason: 'Justificatif URSSAF expire',
        changedBy: 'system'
      });
      await agent.save();
      // En production: envoyer notification
    }

    console.log(`${agents.length} agents marques non conformes`);
  } catch (error) {
    console.error('Erreur cron conformite:', error);
  }
});

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'sales-agents-api',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /config
 * Configuration publique
 */
app.get('/config', (req, res) => {
  res.json({
    commissionPerClient: CONFIG.COMMISSION_PER_CLIENT,
    regions: CONFIG.REGIONS,
    challenge: CONFIG.CHALLENGE
  });
});

// =============================================================================
// MONGODB CONNECTION & SERVER START
// =============================================================================

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/symphonia-agents';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`SYMPHONI.A Sales Agents API running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    app.listen(PORT, () => {
      console.log(`SYMPHONI.A Sales Agents API running on port ${PORT} (no DB)`);
    });
  });

module.exports = app;
