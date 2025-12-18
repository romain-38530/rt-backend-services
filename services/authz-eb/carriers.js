// RT Carrier Management System - Version Complete
// Systeme de referencement des transporteurs selon specifications SYMPHONI.A
// Avec interconnexions Orders, KPI, et systeme d'emails complet

const { ObjectId } = require('mongodb');
const fetch = require('node-fetch');

// Configuration des APIs externes
const ORDERS_API_URL = process.env.ORDERS_API_URL || 'http://rt-orders-api-prod-v2.eba-4tprbbqu.eu-central-1.elasticbeanstalk.com';
const KPI_API_URL = process.env.KPI_API_URL || 'https://d57lw7v3zgfpy.cloudfront.net';
const AFFRET_IA_API_URL = process.env.AFFRET_IA_API_URL || 'https://d393yiia4ig3bw.cloudfront.net/api';

// Statuts des transporteurs (3 niveaux)
const CARRIER_LEVEL = {
  GUEST: 'guest',              // Niveau 2 - Transporteur invite
  REFERENCED: 'referenced',     // Niveau 1 - Transporteur reference
  PREMIUM: 'premium'            // Niveau 1+ - Transporteur prioritaire
};

const CARRIER_STATUS = {
  PENDING_INVITATION: 'pending_invitation',
  INVITED: 'invited',
  PENDING_VALIDATION: 'pending_validation',
  ACTIVE: 'active',
  BLOCKED: 'blocked',
  SUSPENDED: 'suspended',
  CHURNED: 'churned'
};

// Statuts de vigilance
const VIGILANCE_STATUS = {
  COMPLIANT: 'compliant',
  WARNING: 'warning',
  BLOCKED: 'blocked',
  PENDING: 'pending'
};

// Types de documents requis
const DOCUMENT_TYPES = {
  KBIS: 'kbis',
  URSSAF: 'urssaf',
  INSURANCE_RC: 'insurance_rc',
  INSURANCE_GOODS: 'insurance_goods',
  LICENSE: 'licence_transport',
  ADR_CERTIFICATE: 'adr_certificate',
  RIB: 'rib'
};

const DOCUMENT_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
};

// Raisons de blocage
const BLOCKING_REASONS = {
  DOCUMENTS_EXPIRED: 'documents_expired',
  INSURANCE_LAPSED: 'insurance_lapsed',
  SCORE_BELOW_THRESHOLD: 'score_below_threshold',
  UNPAID_INVOICES: 'unpaid_invoices',
  COMPLIANCE_VIOLATION: 'compliance_violation',
  MANUAL_BLOCK: 'manual_block'
};

// Types d'evenements
const CARRIER_EVENTS = {
  INVITED: 'carrier.invited',
  REGISTERED: 'carrier.registered',
  DOCUMENTS_UPLOADED: 'carrier.documents_uploaded',
  VALIDATED: 'carrier.validated',
  PREMIUM_REQUESTED: 'carrier.premium_requested',
  PREMIUM_GRANTED: 'carrier.premium_granted',
  PREMIUM_REVOKED: 'carrier.premium_revoked',
  BLOCKED: 'carrier.blocked',
  UNBLOCKED: 'carrier.unblocked',
  SCORE_UPDATED: 'carrier.score_updated',
  DISPATCH_UPDATED: 'carrier.dispatch_updated',
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_VERIFIED: 'document.verified',
  DOCUMENT_REJECTED: 'document.rejected',
  DOCUMENT_EXPIRED: 'document.expired',
  ALERT_CREATED: 'alert.created',
  ALERT_RESOLVED: 'alert.resolved',
  PRICING_UPDATED: 'pricing.updated'
};

// =============================================================================
// EMAIL FUNCTIONS
// =============================================================================

const nodemailer = require('nodemailer');

const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'ssl0.ovh.net',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: process.env.SMTP_SECURE !== 'false',
  auth: {
    user: process.env.SMTP_USER || 'ne-pas-repondre@symphonia-controltower.com',
    pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD
  }
};

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport(SMTP_CONFIG);
  }
  return transporter;
}

async function sendEmail(to, subject, html) {
  try {
    const mailOptions = {
      from: '"SYMPHONI.A" <ne-pas-repondre@symphonia-controltower.com>',
      to,
      subject,
      html
    };
    const result = await getTransporter().sendMail(mailOptions);
    console.log(`[Email] Sent to ${to}: ${subject}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error(`[Email] Failed to send to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

// Email templates
async function sendCarrierInvitationEmail(email, companyName, invitedByName, industrielName, level) {
  const levelLabel = level === 'premium' ? 'Premium (N1+)' : level === 'referenced' ? 'Reference (N1)' : 'Guest (N2)';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0;">SYMPHONI.A</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Control Tower</p>
      </div>
      <div style="padding: 30px; background: #f9fafb;">
        <h2 style="color: #1f2937;">Invitation a rejoindre le reseau transporteurs</h2>
        <p>Bonjour <strong>${companyName}</strong>,</p>
        <p><strong>${industrielName}</strong> vous invite a rejoindre son reseau de transporteurs references sur la plateforme SYMPHONI.A.</p>
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Niveau propose:</strong> ${levelLabel}</p>
          <p style="margin: 10px 0 0;"><strong>Invite par:</strong> ${invitedByName}</p>
        </div>
        <p>En rejoignant le reseau, vous pourrez:</p>
        <ul>
          <li>Recevoir des propositions de transport</li>
          <li>Gerer vos documents de conformite</li>
          <li>Suivre votre score et vos performances</li>
          <li>Acceder aux outils de cotation</li>
        </ul>
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://transporteur.symphonia-controltower.com/onboarding" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Accepter l'invitation</a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">Cette invitation expire dans 7 jours.</p>
      </div>
      <div style="padding: 20px; text-align: center; color: #6b7280; font-size: 12px;">
        <p>SYMPHONI.A - Plateforme de gestion logistique</p>
      </div>
    </div>
  `;
  return sendEmail(email, `Invitation a rejoindre le reseau ${industrielName}`, html);
}

async function sendOnboardingSuccessEmail(email, companyName, score, level) {
  const levelLabel = level === 'premium' ? 'Premium (N1+)' : level === 'referenced' ? 'Reference (N1)' : 'Guest (N2)';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0;">Felicitations!</h1>
      </div>
      <div style="padding: 30px; background: #f9fafb;">
        <h2 style="color: #1f2937;">Bienvenue sur SYMPHONI.A</h2>
        <p>Bonjour <strong>${companyName}</strong>,</p>
        <p>Votre compte transporteur a ete valide avec succes!</p>
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
          <p style="margin: 0; color: #6b7280;">Votre niveau</p>
          <p style="margin: 5px 0; font-size: 24px; font-weight: bold; color: #667eea;">${levelLabel}</p>
          <p style="margin: 15px 0 0; color: #6b7280;">Score initial</p>
          <p style="margin: 5px 0; font-size: 32px; font-weight: bold; color: #10b981;">${score}/100</p>
        </div>
        <p>Vous pouvez maintenant:</p>
        <ul>
          <li>Recevoir des propositions de transport</li>
          <li>Consulter et repondre aux demandes</li>
          <li>Gerer vos documents</li>
        </ul>
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://transporteur.symphonia-controltower.com" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Acceder a mon espace</a>
        </div>
      </div>
    </div>
  `;
  return sendEmail(email, `Bienvenue sur SYMPHONI.A - Compte valide`, html);
}

async function sendVigilanceAlertEmail(email, companyName, documentType, daysUntilExpiry, expiryDate) {
  const urgency = daysUntilExpiry <= 7 ? 'URGENT' : daysUntilExpiry <= 15 ? 'Important' : 'Information';
  const color = daysUntilExpiry <= 7 ? '#ef4444' : daysUntilExpiry <= 15 ? '#f59e0b' : '#3b82f6';
  const docLabels = {
    'kbis': 'Extrait Kbis',
    'urssaf': 'Attestation URSSAF',
    'insurance_rc': 'Assurance RC',
    'insurance_goods': 'Assurance Marchandises',
    'licence_transport': 'Licence de transport',
    'adr_certificate': 'Certificat ADR'
  };
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${color}; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">${urgency}: Document expirant</h1>
      </div>
      <div style="padding: 30px; background: #f9fafb;">
        <p>Bonjour <strong>${companyName}</strong>,</p>
        <p>Votre document <strong>${docLabels[documentType] || documentType}</strong> expire dans <strong>${daysUntilExpiry} jour(s)</strong>.</p>
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${color};">
          <p style="margin: 0;"><strong>Document:</strong> ${docLabels[documentType] || documentType}</p>
          <p style="margin: 10px 0 0;"><strong>Date d'expiration:</strong> ${new Date(expiryDate).toLocaleDateString('fr-FR')}</p>
          <p style="margin: 10px 0 0;"><strong>Jours restants:</strong> ${daysUntilExpiry}</p>
        </div>
        ${daysUntilExpiry <= 7 ? '<p style="color: #ef4444; font-weight: bold;">⚠️ Attention: Sans mise a jour, votre compte sera automatiquement bloque a l\'expiration.</p>' : ''}
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://transporteur.symphonia-controltower.com/documents" style="background: ${color}; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Mettre a jour mon document</a>
        </div>
      </div>
    </div>
  `;
  return sendEmail(email, `${urgency}: ${docLabels[documentType] || documentType} expire dans ${daysUntilExpiry} jours`, html);
}

async function sendCarrierBlockedEmail(email, companyName, reason, description) {
  const reasonLabels = {
    'documents_expired': 'Documents expires',
    'insurance_lapsed': 'Assurance expiree',
    'score_below_threshold': 'Score insuffisant',
    'manual_block': 'Decision administrative'
  };
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #ef4444; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">Compte bloque</h1>
      </div>
      <div style="padding: 30px; background: #f9fafb;">
        <p>Bonjour <strong>${companyName}</strong>,</p>
        <p>Votre compte transporteur a ete temporairement bloque.</p>
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
          <p style="margin: 0;"><strong>Raison:</strong> ${reasonLabels[reason] || reason}</p>
          ${description ? `<p style="margin: 10px 0 0;"><strong>Details:</strong> ${description}</p>` : ''}
        </div>
        <p>Pour debloquer votre compte, veuillez mettre a jour les elements concernes.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://transporteur.symphonia-controltower.com/documents" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Regulariser ma situation</a>
        </div>
      </div>
    </div>
  `;
  return sendEmail(email, `Important: Votre compte transporteur a ete bloque`, html);
}

async function sendCarrierUnblockedEmail(email, companyName) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #10b981; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">Compte reactive</h1>
      </div>
      <div style="padding: 30px; background: #f9fafb;">
        <p>Bonjour <strong>${companyName}</strong>,</p>
        <p>Bonne nouvelle! Votre compte transporteur a ete reactive.</p>
        <p>Vous pouvez a nouveau recevoir et repondre aux propositions de transport.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://transporteur.symphonia-controltower.com" style="background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Acceder a mon espace</a>
        </div>
      </div>
    </div>
  `;
  return sendEmail(email, `Votre compte transporteur a ete reactive`, html);
}

async function sendPremiumGrantedEmail(email, companyName) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0;">⭐ Statut Premium accorde!</h1>
      </div>
      <div style="padding: 30px; background: #f9fafb;">
        <p>Bonjour <strong>${companyName}</strong>,</p>
        <p>Felicitations! Vous avez ete promu au statut <strong>Premium (N1+)</strong>.</p>
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 15px; color: #f59e0b;">Vos avantages Premium:</h3>
          <ul style="margin: 0; padding-left: 20px;">
            <li>Priorite dans la chaine de dispatch</li>
            <li>Acces aux transports premium</li>
            <li>Visibilite accrue aupres des industriels</li>
            <li>Support prioritaire</li>
          </ul>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://transporteur.symphonia-controltower.com" style="background: #f59e0b; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Decouvrir mes avantages</a>
        </div>
      </div>
    </div>
  `;
  return sendEmail(email, `Felicitations! Vous etes maintenant Premium`, html);
}

// Notification a l'industriel quand un transporteur complete son onboarding
async function sendIndustrialCarrierReadyEmail(industrialEmail, industrialName, carrierName, carrierId) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #667eea; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">Nouveau transporteur disponible</h1>
      </div>
      <div style="padding: 30px; background: #f9fafb;">
        <p>Bonjour <strong>${industrialName}</strong>,</p>
        <p>Le transporteur <strong>${carrierName}</strong> que vous avez invite a complete son onboarding.</p>
        <p>Il est maintenant disponible dans votre chaine de dispatch.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://industrie.symphonia-controltower.com/transporteurs" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Voir mes transporteurs</a>
        </div>
      </div>
    </div>
  `;
  return sendEmail(industrialEmail, `${carrierName} est maintenant disponible`, html);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Enregistrer un evenement dans l'historique
 */
async function logCarrierEvent(db, carrierId, eventType, eventData, triggeredBy = { type: 'system' }) {
  const eventsCollection = db.collection('carrier_events');
  const event = {
    carrierId: typeof carrierId === 'string' ? new ObjectId(carrierId) : carrierId,
    type: eventType,
    triggeredBy,
    payload: eventData,
    timestamp: new Date(),
    createdAt: new Date()
  };
  const result = await eventsCollection.insertOne(event);
  return { ...event, id: result.insertedId.toString() };
}

/**
 * Calculer le score dynamique d'un transporteur
 */
async function calculateCarrierScore(db, carrierId) {
  const carrier = await db.collection('carriers').findOne({
    _id: typeof carrierId === 'string' ? new ObjectId(carrierId) : carrierId
  });
  if (!carrier) return { overall: 0, details: {} };

  const details = {
    onTimeDelivery: 50,
    communication: 50,
    damageRate: 50,
    documentation: 50,
    responsiveness: 50,
    pricing: 50,
    compliance: 50
  };

  // 1. Documents en regle (+10 points par document verifie, max 30)
  const verifiedDocs = await db.collection('carrier_documents')
    .countDocuments({
      carrierId: typeof carrierId === 'string' ? new ObjectId(carrierId) : carrierId,
      status: DOCUMENT_STATUS.VERIFIED
    });
  details.documentation = Math.min(100, 40 + verifiedDocs * 15);
  details.compliance = Math.min(100, 40 + verifiedDocs * 12);

  // 2. Anciennete (bonus progressif)
  if (carrier.referencedAt) {
    const daysSinceRef = Math.floor((Date.now() - new Date(carrier.referencedAt).getTime()) / (1000 * 60 * 60 * 24));
    details.responsiveness = Math.min(100, 50 + Math.floor(daysSinceRef / 30) * 5);
  }

  // 3. Niveau premium = bonus
  if (carrier.level === CARRIER_LEVEL.PREMIUM) {
    details.onTimeDelivery = Math.min(100, details.onTimeDelivery + 20);
    details.communication = Math.min(100, details.communication + 15);
  }

  // 4. Si bloque = penalite
  if (carrier.status === CARRIER_STATUS.BLOCKED) {
    Object.keys(details).forEach(k => details[k] = Math.max(0, details[k] - 30));
  }

  // 5. Recuperer les stats KPI si disponibles
  try {
    const kpiResponse = await fetch(`${KPI_API_URL}/kpi/carriers/${carrierId}`);
    if (kpiResponse.ok) {
      const kpiData = await kpiResponse.json();
      if (kpiData.metrics) {
        if (kpiData.metrics.onTimeRate) details.onTimeDelivery = Math.round(kpiData.metrics.onTimeRate * 100);
        if (kpiData.metrics.acceptanceRate) details.responsiveness = Math.round(kpiData.metrics.acceptanceRate * 100);
        if (kpiData.metrics.damageRate) details.damageRate = Math.round((1 - kpiData.metrics.damageRate) * 100);
      }
    }
  } catch (e) {
    // KPI non disponible, on garde les valeurs par defaut
  }

  // Calcul du score global (moyenne ponderee)
  const weights = {
    onTimeDelivery: 0.25,
    communication: 0.10,
    damageRate: 0.15,
    documentation: 0.15,
    responsiveness: 0.15,
    pricing: 0.10,
    compliance: 0.10
  };

  let overall = 0;
  Object.keys(weights).forEach(k => {
    overall += details[k] * weights[k];
  });

  return {
    overall: Math.round(overall),
    details
  };
}

/**
 * Verifier le statut de vigilance d'un transporteur
 */
async function checkVigilanceStatus(db, carrierId) {
  const documents = await db.collection('carrier_documents')
    .find({ carrierId: typeof carrierId === 'string' ? new ObjectId(carrierId) : carrierId })
    .toArray();

  if (documents.length === 0) {
    return { status: VIGILANCE_STATUS.PENDING, issues: ['Aucun document fourni'] };
  }

  const now = new Date();
  const issues = [];
  let hasExpired = false;
  let hasWarning = false;

  for (const doc of documents) {
    if (doc.status === DOCUMENT_STATUS.EXPIRED) {
      hasExpired = true;
      issues.push(`${doc.documentType} expire`);
    } else if (doc.status === DOCUMENT_STATUS.REJECTED) {
      hasExpired = true;
      issues.push(`${doc.documentType} rejete`);
    } else if (doc.expiryDate) {
      const daysUntilExpiry = Math.floor((new Date(doc.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry <= 0) {
        hasExpired = true;
        issues.push(`${doc.documentType} expire`);
      } else if (daysUntilExpiry <= 30) {
        hasWarning = true;
        issues.push(`${doc.documentType} expire dans ${daysUntilExpiry} jours`);
      }
    }
  }

  if (hasExpired) return { status: VIGILANCE_STATUS.BLOCKED, issues };
  if (hasWarning) return { status: VIGILANCE_STATUS.WARNING, issues };
  return { status: VIGILANCE_STATUS.COMPLIANT, issues: [] };
}

/**
 * Synchroniser le score avec l'API Orders pour le dispatch
 */
async function syncCarrierWithOrders(carrier, score) {
  try {
    // Mettre a jour les infos du transporteur dans la base orders
    await fetch(`${ORDERS_API_URL}/api/carriers/${carrier._id}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        carrierId: carrier._id.toString(),
        carrierName: carrier.companyName,
        carrierEmail: carrier.email,
        level: carrier.level,
        score: score.overall,
        scoreDetails: score.details,
        isBlocked: carrier.status === CARRIER_STATUS.BLOCKED,
        vigilanceStatus: carrier.vigilanceStatus
      })
    });
    console.log(`[SyncOrders] Carrier ${carrier._id} synced with orders API`);
  } catch (e) {
    console.error(`[SyncOrders] Failed to sync carrier ${carrier._id}:`, e.message);
  }
}

/**
 * Formater un transporteur pour la reponse API
 */
function formatCarrierResponse(carrier, documents = [], score = null) {
  return {
    id: carrier._id.toString(),
    externalId: carrier.externalId || null,
    companyId: carrier.companyId || carrier._id.toString(),
    companyName: carrier.companyName,
    siret: carrier.siret || null,
    vatNumber: carrier.vatNumber || null,
    level: carrier.level || CARRIER_LEVEL.GUEST,
    status: carrier.status || CARRIER_STATUS.INVITED,
    vigilanceStatus: carrier.vigilanceStatus || VIGILANCE_STATUS.PENDING,
    overallScore: score?.overall || carrier.score || 0,
    scoreDetails: score?.details || carrier.scoreDetails || {},
    dispatchOrder: carrier.dispatchOrder || 99,
    dispatchPriority: carrier.dispatchPriority || 'low',
    documents: documents.map(d => ({
      id: d._id.toString(),
      type: d.documentType,
      name: d.fileName,
      status: d.status,
      expiresAt: d.expiryDate,
      uploadedAt: d.uploadedAt
    })),
    vigilanceAlerts: carrier.vigilanceAlerts || [],
    pricingGrids: carrier.pricingGrids || [],
    options: carrier.options || [],
    blockingHistory: carrier.blockingHistory || [],
    currentBlockReason: carrier.blockedReason || null,
    blockedAt: carrier.blockedAt || null,
    totalOrders: carrier.totalOrders || 0,
    completedOrders: carrier.completedOrders || 0,
    cancelledOrders: carrier.cancelledOrders || 0,
    averageResponseTime: carrier.averageResponseTime || 0,
    contact: {
      email: carrier.email,
      phone: carrier.phone || null,
      address: carrier.address?.street || carrier.address || null,
      city: carrier.address?.city || null,
      postalCode: carrier.address?.postalCode || null,
      country: carrier.address?.country || 'FR'
    },
    referencedBy: carrier.referencedBy || carrier.invitedBy,
    referencedAt: carrier.referencedAt || carrier.onboardedAt || carrier.createdAt,
    premiumSince: carrier.premiumSince || null,
    source: carrier.source || carrier.referenceMode || 'manual',
    createdAt: carrier.createdAt,
    updatedAt: carrier.updatedAt
  };
}

// =============================================================================
// EXPRESS ROUTES
// =============================================================================

function setupCarrierRoutes(app, db) {

  // =====================================================================
  // GET /api/carriers - Liste des transporteurs (format frontend)
  // =====================================================================
  app.get('/api/carriers', async (req, res) => {
    try {
      const { industrielId, level, status, vigilanceStatus, search, page = 1, limit = 50, sortBy = 'score', sortOrder = 'desc' } = req.query;

      const filter = {};
      if (industrielId) filter.referencedBy = industrielId;
      if (level) filter.level = level;
      if (status) filter.status = status;
      if (vigilanceStatus) filter.vigilanceStatus = vigilanceStatus;
      if (search) {
        filter.$or = [
          { companyName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { siret: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const sortObj = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

      const [carriers, total] = await Promise.all([
        db.collection('carriers').find(filter).sort(sortObj).skip(skip).limit(parseInt(limit)).toArray(),
        db.collection('carriers').countDocuments(filter)
      ]);

      // Enrichir chaque transporteur
      const enrichedCarriers = await Promise.all(carriers.map(async (carrier) => {
        const documents = await db.collection('carrier_documents')
          .find({ carrierId: carrier._id })
          .toArray();
        const score = await calculateCarrierScore(db, carrier._id);
        return formatCarrierResponse(carrier, documents, score);
      }));

      res.json({
        carriers: enrichedCarriers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });

    } catch (error) {
      console.error('Error listing carriers:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================================
  // GET /api/carriers/:id - Details d'un transporteur
  // =====================================================================
  app.get('/api/carriers/:carrierId', async (req, res) => {
    try {
      const { carrierId } = req.params;

      let carrier;
      try {
        carrier = await db.collection('carriers').findOne({ _id: new ObjectId(carrierId) });
      } catch (e) {
        carrier = await db.collection('carriers').findOne({ externalId: carrierId });
      }

      if (!carrier) {
        return res.status(404).json({ error: 'Transporteur non trouve' });
      }

      const documents = await db.collection('carrier_documents')
        .find({ carrierId: carrier._id })
        .toArray();

      const score = await calculateCarrierScore(db, carrier._id);

      res.json(formatCarrierResponse(carrier, documents, score));

    } catch (error) {
      console.error('Error getting carrier:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================================
  // POST /api/carriers/invite - Inviter un transporteur
  // =====================================================================
  app.post('/api/carriers/invite', async (req, res) => {
    try {
      const { email, companyName, industrielId, message, level = 'guest', siret, vatNumber, phone } = req.body;

      if (!email || !companyName || !industrielId) {
        return res.status(400).json({ error: 'email, companyName et industrielId sont requis' });
      }

      // Verifier si existe deja
      const existing = await db.collection('carriers').findOne({
        $or: [
          { email: email.toLowerCase() },
          ...(siret ? [{ siret }] : []),
          ...(vatNumber ? [{ vatNumber }] : [])
        ]
      });

      if (existing) {
        return res.status(409).json({ error: 'Ce transporteur est deja enregistre' });
      }

      // Recuperer les infos de l'industriel
      let industrialName = 'Un industriel';
      let industrialEmail = null;
      try {
        const industrial = await db.collection('users').findOne({ _id: new ObjectId(industrielId) });
        if (industrial) {
          industrialName = industrial.organization?.name || industrial.companyName || industrial.name || 'Un industriel';
          industrialEmail = industrial.email;
        }
      } catch (e) { /* ignore */ }

      const carrier = {
        email: email.toLowerCase().trim(),
        companyName: companyName.trim(),
        siret: siret || null,
        vatNumber: vatNumber || null,
        phone: phone || null,
        level,
        status: CARRIER_STATUS.INVITED,
        vigilanceStatus: VIGILANCE_STATUS.PENDING,
        score: 0,
        scoreDetails: {},
        dispatchOrder: 99,
        referencedBy: industrielId,
        source: 'invitation',
        invitationMessage: message || null,
        invitedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await db.collection('carriers').insertOne(carrier);

      // Log event
      const event = await logCarrierEvent(db, result.insertedId, CARRIER_EVENTS.INVITED, {
        invitedBy: industrielId,
        level,
        email
      }, { type: 'user', id: industrielId, name: industrialName });

      // Envoyer email d'invitation
      sendCarrierInvitationEmail(
        email,
        companyName,
        industrialName,
        industrialName,
        level
      ).catch(err => console.error('Failed to send invitation email:', err.message));

      res.status(201).json({
        invitation: {
          id: result.insertedId.toString(),
          token: result.insertedId.toString(), // Simplifie pour l'instant
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        },
        event
      });

    } catch (error) {
      console.error('Error inviting carrier:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================================
  // POST /api/carriers/:id/block - Bloquer un transporteur
  // =====================================================================
  app.post('/api/carriers/:carrierId/block', async (req, res) => {
    try {
      const { carrierId } = req.params;
      const { reason, description, until } = req.body;

      if (!reason || !description) {
        return res.status(400).json({ error: 'reason et description sont requis' });
      }

      const carrier = await db.collection('carriers').findOne({ _id: new ObjectId(carrierId) });
      if (!carrier) {
        return res.status(404).json({ error: 'Transporteur non trouve' });
      }

      // Ajouter au historique de blocage
      const blockingEvent = {
        id: new ObjectId().toString(),
        reason,
        description,
        blockedAt: new Date(),
        blockedUntil: until ? new Date(until) : null,
        isResolved: false
      };

      await db.collection('carriers').updateOne(
        { _id: new ObjectId(carrierId) },
        {
          $set: {
            status: CARRIER_STATUS.BLOCKED,
            vigilanceStatus: VIGILANCE_STATUS.BLOCKED,
            blockedReason: reason,
            blockedAt: new Date(),
            blockedUntil: until ? new Date(until) : null,
            updatedAt: new Date()
          },
          $push: {
            blockingHistory: blockingEvent
          }
        }
      );

      const event = await logCarrierEvent(db, carrierId, CARRIER_EVENTS.BLOCKED, {
        reason,
        description,
        until
      });

      // Envoyer email
      sendCarrierBlockedEmail(carrier.email, carrier.companyName, reason, description)
        .catch(err => console.error('Failed to send blocked email:', err.message));

      // Sync avec orders API
      const updatedCarrier = await db.collection('carriers').findOne({ _id: new ObjectId(carrierId) });
      syncCarrierWithOrders(updatedCarrier, { overall: 0, details: {} });

      const documents = await db.collection('carrier_documents').find({ carrierId: new ObjectId(carrierId) }).toArray();

      res.json({
        carrier: formatCarrierResponse(updatedCarrier, documents),
        event
      });

    } catch (error) {
      console.error('Error blocking carrier:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================================
  // POST /api/carriers/:id/unblock - Debloquer un transporteur
  // =====================================================================
  app.post('/api/carriers/:carrierId/unblock', async (req, res) => {
    try {
      const { carrierId } = req.params;
      const { notes } = req.body;

      const carrier = await db.collection('carriers').findOne({ _id: new ObjectId(carrierId) });
      if (!carrier) {
        return res.status(404).json({ error: 'Transporteur non trouve' });
      }

      // Verifier la vigilance
      const vigilance = await checkVigilanceStatus(db, carrierId);

      await db.collection('carriers').updateOne(
        { _id: new ObjectId(carrierId) },
        {
          $set: {
            status: CARRIER_STATUS.ACTIVE,
            vigilanceStatus: vigilance.status,
            blockedReason: null,
            blockedAt: null,
            blockedUntil: null,
            updatedAt: new Date()
          }
        }
      );

      const event = await logCarrierEvent(db, carrierId, CARRIER_EVENTS.UNBLOCKED, { notes });

      // Envoyer email
      sendCarrierUnblockedEmail(carrier.email, carrier.companyName)
        .catch(err => console.error('Failed to send unblocked email:', err.message));

      // Sync avec orders API
      const updatedCarrier = await db.collection('carriers').findOne({ _id: new ObjectId(carrierId) });
      const score = await calculateCarrierScore(db, carrierId);
      syncCarrierWithOrders(updatedCarrier, score);

      const documents = await db.collection('carrier_documents').find({ carrierId: new ObjectId(carrierId) }).toArray();

      res.json({
        carrier: formatCarrierResponse(updatedCarrier, documents, score),
        event
      });

    } catch (error) {
      console.error('Error unblocking carrier:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================================
  // POST /api/carriers/:id/premium/grant - Accorder le statut Premium
  // =====================================================================
  app.post('/api/carriers/:carrierId/premium/grant', async (req, res) => {
    try {
      const { carrierId } = req.params;
      const { notes } = req.body;

      const carrier = await db.collection('carriers').findOne({ _id: new ObjectId(carrierId) });
      if (!carrier) {
        return res.status(404).json({ error: 'Transporteur non trouve' });
      }

      if (carrier.level === CARRIER_LEVEL.PREMIUM) {
        return res.status(400).json({ error: 'Le transporteur est deja Premium' });
      }

      const previousLevel = carrier.level;

      await db.collection('carriers').updateOne(
        { _id: new ObjectId(carrierId) },
        {
          $set: {
            level: CARRIER_LEVEL.PREMIUM,
            premiumSince: new Date(),
            dispatchPriority: 'high',
            updatedAt: new Date()
          }
        }
      );

      const event = await logCarrierEvent(db, carrierId, CARRIER_EVENTS.PREMIUM_GRANTED, {
        previousLevel,
        newLevel: CARRIER_LEVEL.PREMIUM,
        notes
      });

      // Envoyer email
      sendPremiumGrantedEmail(carrier.email, carrier.companyName)
        .catch(err => console.error('Failed to send premium email:', err.message));

      // Sync avec orders API
      const updatedCarrier = await db.collection('carriers').findOne({ _id: new ObjectId(carrierId) });
      const score = await calculateCarrierScore(db, carrierId);
      syncCarrierWithOrders(updatedCarrier, score);

      const documents = await db.collection('carrier_documents').find({ carrierId: new ObjectId(carrierId) }).toArray();

      res.json({
        carrier: formatCarrierResponse(updatedCarrier, documents, score),
        event
      });

    } catch (error) {
      console.error('Error granting premium:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================================
  // GET /api/stats/carriers/:industrielId - Statistiques transporteurs
  // =====================================================================
  app.get('/api/stats/carriers/:industrielId', async (req, res) => {
    try {
      const { industrielId } = req.params;

      const carriers = await db.collection('carriers')
        .find({ referencedBy: industrielId })
        .toArray();

      const byLevel = { guest: 0, referenced: 0, premium: 0 };
      const byStatus = {};
      const byVigilance = { compliant: 0, warning: 0, blocked: 0, pending: 0 };
      let totalScore = 0;

      carriers.forEach(c => {
        byLevel[c.level] = (byLevel[c.level] || 0) + 1;
        byStatus[c.status] = (byStatus[c.status] || 0) + 1;
        byVigilance[c.vigilanceStatus] = (byVigilance[c.vigilanceStatus] || 0) + 1;
        totalScore += c.score || 0;
      });

      // Alertes
      const alerts = await db.collection('vigilance_alerts')
        .find({ industrielId, isResolved: false })
        .toArray();

      const alertsSummary = { critical: 0, warning: 0, info: 0 };
      alerts.forEach(a => {
        alertsSummary[a.severity] = (alertsSummary[a.severity] || 0) + 1;
      });

      // Top carriers
      const topCarriers = carriers
        .filter(c => c.status === CARRIER_STATUS.ACTIVE)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 5)
        .map(c => formatCarrierResponse(c));

      res.json({
        totalCarriers: carriers.length,
        byLevel,
        byStatus,
        byVigilance,
        averageScore: carriers.length > 0 ? Math.round(totalScore / carriers.length) : 0,
        topCarriers,
        alertsSummary
      });

    } catch (error) {
      console.error('Error getting carrier stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================================
  // GET /api/vigilance/alerts - Liste des alertes
  // =====================================================================
  app.get('/api/vigilance/alerts', async (req, res) => {
    try {
      const { carrierId, industrielId, type, severity, isResolved, page = 1, limit = 50 } = req.query;

      const filter = {};
      if (carrierId) filter.carrierId = carrierId;
      if (industrielId) filter.industrielId = industrielId;
      if (type) filter.type = type;
      if (severity) filter.severity = severity;
      if (isResolved !== undefined) filter.isResolved = isResolved === 'true';

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [alerts, total] = await Promise.all([
        db.collection('vigilance_alerts').find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).toArray(),
        db.collection('vigilance_alerts').countDocuments(filter)
      ]);

      // Summary
      const allAlerts = await db.collection('vigilance_alerts').find({ industrielId, isResolved: false }).toArray();
      const summary = { critical: 0, warning: 0, info: 0, unresolved: 0 };
      allAlerts.forEach(a => {
        summary[a.severity] = (summary[a.severity] || 0) + 1;
        summary.unresolved++;
      });

      res.json({
        alerts: alerts.map(a => ({
          id: a._id.toString(),
          carrierId: a.carrierId,
          type: a.type,
          severity: a.severity,
          title: a.title,
          message: a.message,
          documentType: a.documentType,
          actionRequired: a.actionRequired,
          actionLabel: a.actionLabel,
          notificationChannels: a.notificationChannels || ['email', 'in_app'],
          isResolved: a.isResolved,
          resolvedAt: a.resolvedAt,
          autoBlockAt: a.autoBlockAt,
          createdAt: a.createdAt
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        },
        summary
      });

    } catch (error) {
      console.error('Error getting alerts:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================================
  // POST /api/vigilance/alerts/:alertId/resolve - Resoudre une alerte
  // =====================================================================
  app.post('/api/vigilance/alerts/:alertId/resolve', async (req, res) => {
    try {
      const { alertId } = req.params;
      const { notes } = req.body;

      await db.collection('vigilance_alerts').updateOne(
        { _id: new ObjectId(alertId) },
        {
          $set: {
            isResolved: true,
            resolvedAt: new Date(),
            resolutionNotes: notes || null
          }
        }
      );

      const alert = await db.collection('vigilance_alerts').findOne({ _id: new ObjectId(alertId) });

      if (alert) {
        await logCarrierEvent(db, alert.carrierId, CARRIER_EVENTS.ALERT_RESOLVED, {
          alertId,
          alertType: alert.type,
          notes
        });
      }

      res.json({
        alert: {
          id: alert._id.toString(),
          ...alert,
          isResolved: true,
          resolvedAt: new Date()
        }
      });

    } catch (error) {
      console.error('Error resolving alert:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================================
  // GET /api/events - Historique des evenements
  // =====================================================================
  app.get('/api/events', async (req, res) => {
    try {
      const { carrierId, industrielId, type, dateFrom, dateTo, page = 1, limit = 50 } = req.query;

      const filter = {};
      if (carrierId) filter.carrierId = new ObjectId(carrierId);
      if (industrielId) {
        // Trouver tous les transporteurs de cet industriel
        const carriers = await db.collection('carriers').find({ referencedBy: industrielId }).toArray();
        filter.carrierId = { $in: carriers.map(c => c._id) };
      }
      if (type) filter.type = type;
      if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
        if (dateTo) filter.createdAt.$lte = new Date(dateTo);
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [events, total] = await Promise.all([
        db.collection('carrier_events').find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).toArray(),
        db.collection('carrier_events').countDocuments(filter)
      ]);

      res.json({
        events: events.map(e => ({
          id: e._id.toString(),
          carrierId: e.carrierId?.toString(),
          type: e.type,
          triggeredBy: e.triggeredBy,
          payload: e.payload,
          createdAt: e.createdAt || e.timestamp
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });

    } catch (error) {
      console.error('Error getting events:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================================
  // GET /api/dispatch/chain - Chaine de dispatch
  // =====================================================================
  app.get('/api/dispatch/chain', async (req, res) => {
    try {
      const { industrielId, orderId, requiredOptions, minScore, limit = 10 } = req.query;

      if (!industrielId) {
        return res.status(400).json({ error: 'industrielId est requis' });
      }

      const filter = {
        referencedBy: industrielId,
        status: CARRIER_STATUS.ACTIVE,
        vigilanceStatus: { $ne: VIGILANCE_STATUS.BLOCKED }
      };

      if (minScore) {
        filter.score = { $gte: parseInt(minScore) };
      }

      let carriers = await db.collection('carriers')
        .find(filter)
        .sort({ dispatchOrder: 1, score: -1 })
        .limit(parseInt(limit))
        .toArray();

      // Filtrer par options si demande
      if (requiredOptions) {
        const options = requiredOptions.split(',');
        carriers = carriers.filter(c => {
          const carrierOptions = (c.options || []).map(o => o.code || o);
          return options.every(opt => carrierOptions.includes(opt));
        });
      }

      const dispatchCarriers = carriers.map((c, index) => ({
        rank: index + 1,
        carrierId: c._id.toString(),
        carrierName: c.companyName,
        level: c.level,
        score: c.score || 0,
        estimatedResponseTime: c.averageResponseTime || 2,
        availability: c.status === CARRIER_STATUS.ACTIVE ? 'available' : 'busy',
        matchScore: Math.min(100, (c.score || 50) + (c.level === CARRIER_LEVEL.PREMIUM ? 10 : 0))
      }));

      res.json({
        orderId: orderId || null,
        industrielId,
        carriers: dispatchCarriers,
        totalEligible: carriers.length,
        generatedAt: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error getting dispatch chain:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================================
  // POST /api/dispatch/reorder/:industrielId - Reordonner la chaine
  // =====================================================================
  app.post('/api/dispatch/reorder/:industrielId', async (req, res) => {
    try {
      const { industrielId } = req.params;
      const { carrierIds } = req.body;

      if (!Array.isArray(carrierIds)) {
        return res.status(400).json({ error: 'carrierIds doit etre un tableau' });
      }

      const events = [];

      // Mettre a jour l'ordre de chaque transporteur
      for (let i = 0; i < carrierIds.length; i++) {
        await db.collection('carriers').updateOne(
          { _id: new ObjectId(carrierIds[i]) },
          { $set: { dispatchOrder: i + 1, updatedAt: new Date() } }
        );

        const event = await logCarrierEvent(db, carrierIds[i], CARRIER_EVENTS.DISPATCH_UPDATED, {
          newOrder: i + 1,
          industrielId
        });
        events.push(event);
      }

      // Recuperer les transporteurs mis a jour
      const carriers = await db.collection('carriers')
        .find({ _id: { $in: carrierIds.map(id => new ObjectId(id)) } })
        .sort({ dispatchOrder: 1 })
        .toArray();

      res.json({
        carriers: carriers.map(c => formatCarrierResponse(c)),
        events
      });

    } catch (error) {
      console.error('Error reordering dispatch:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================================
  // POST /api/carriers/import/affret - Import depuis Affret.IA
  // =====================================================================
  app.post('/api/carriers/import/affret', async (req, res) => {
    try {
      const { affretCarrierId, industrielId, level = 'referenced', dispatchOrder, notes } = req.body;

      if (!affretCarrierId || !industrielId) {
        return res.status(400).json({ error: 'affretCarrierId et industrielId sont requis' });
      }

      // Recuperer les infos du transporteur depuis Affret.IA
      let affretCarrier;
      try {
        const response = await fetch(`${AFFRET_IA_API_URL}/v1/carriers/${affretCarrierId}`);
        if (response.ok) {
          affretCarrier = await response.json();
        }
      } catch (e) {
        console.log('Could not fetch from Affret.IA:', e.message);
      }

      // Creer le transporteur
      const carrier = {
        externalId: affretCarrierId,
        email: affretCarrier?.email || `carrier-${affretCarrierId}@imported.local`,
        companyName: affretCarrier?.companyName || `Transporteur ${affretCarrierId}`,
        siret: affretCarrier?.siret || null,
        vatNumber: affretCarrier?.vatNumber || null,
        phone: affretCarrier?.phone || null,
        level,
        status: CARRIER_STATUS.ACTIVE,
        vigilanceStatus: VIGILANCE_STATUS.PENDING,
        score: affretCarrier?.score || 50,
        dispatchOrder: dispatchOrder || 99,
        referencedBy: industrielId,
        source: 'affret_ia',
        importNotes: notes || null,
        referencedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Verifier si existe deja
      const existing = await db.collection('carriers').findOne({ externalId: affretCarrierId });
      if (existing) {
        return res.status(409).json({
          error: 'Ce transporteur est deja importe',
          carrier: formatCarrierResponse(existing)
        });
      }

      const result = await db.collection('carriers').insertOne(carrier);

      const event = await logCarrierEvent(db, result.insertedId, CARRIER_EVENTS.REGISTERED, {
        source: 'affret_ia',
        affretCarrierId,
        level
      });

      const newCarrier = await db.collection('carriers').findOne({ _id: result.insertedId });

      res.status(201).json({
        success: true,
        carrier: formatCarrierResponse(newCarrier),
        event,
        warnings: affretCarrier ? [] : ['Impossible de recuperer les details depuis Affret.IA']
      });

    } catch (error) {
      console.error('Error importing from Affret:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================================
  // DOCUMENTS ENDPOINTS
  // =====================================================================

  // POST /api/carriers/:carrierId/documents - Upload document
  app.post('/api/carriers/:carrierId/documents', async (req, res) => {
    try {
      const { carrierId } = req.params;
      const { type, name, fileUrl, expiresAt, notes } = req.body;

      if (!type || !name || !fileUrl) {
        return res.status(400).json({ error: 'type, name et fileUrl sont requis' });
      }

      const carrier = await db.collection('carriers').findOne({ _id: new ObjectId(carrierId) });
      if (!carrier) {
        return res.status(404).json({ error: 'Transporteur non trouve' });
      }

      const document = {
        carrierId: new ObjectId(carrierId),
        documentType: type,
        fileName: name,
        fileUrl,
        status: DOCUMENT_STATUS.PENDING,
        expiryDate: expiresAt ? new Date(expiresAt) : null,
        notes: notes || null,
        uploadedAt: new Date(),
        verifiedAt: null,
        verifiedBy: null
      };

      const result = await db.collection('carrier_documents').insertOne(document);

      await logCarrierEvent(db, carrierId, CARRIER_EVENTS.DOCUMENT_UPLOADED, {
        documentId: result.insertedId.toString(),
        documentType: type
      });

      res.status(201).json({
        document: {
          id: result.insertedId.toString(),
          ...document
        }
      });

    } catch (error) {
      console.error('Error uploading document:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/carriers/:carrierId/documents - Liste documents
  app.get('/api/carriers/:carrierId/documents', async (req, res) => {
    try {
      const { carrierId } = req.params;

      const documents = await db.collection('carrier_documents')
        .find({ carrierId: new ObjectId(carrierId) })
        .toArray();

      const now = new Date();
      const expiringSoon = documents.filter(d => {
        if (!d.expiryDate) return false;
        const days = Math.floor((new Date(d.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return days > 0 && days <= 30;
      });

      const expired = documents.filter(d => {
        if (!d.expiryDate) return false;
        return new Date(d.expiryDate) <= now;
      });

      res.json({
        documents: documents.map(d => ({
          id: d._id.toString(),
          carrierId: d.carrierId.toString(),
          type: d.documentType,
          name: d.fileName,
          fileUrl: d.fileUrl,
          status: d.status,
          expiresAt: d.expiryDate,
          uploadedAt: d.uploadedAt,
          verifiedAt: d.verifiedAt
        })),
        expiringSoon: expiringSoon.map(d => d._id.toString()),
        expired: expired.map(d => d._id.toString())
      });

    } catch (error) {
      console.error('Error getting documents:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/carriers/:carrierId/documents/:documentId/verify - Verifier document
  app.post('/api/carriers/:carrierId/documents/:documentId/verify', async (req, res) => {
    try {
      const { carrierId, documentId } = req.params;
      const { approved, rejectionReason } = req.body;

      const status = approved ? DOCUMENT_STATUS.VERIFIED : DOCUMENT_STATUS.REJECTED;

      await db.collection('carrier_documents').updateOne(
        { _id: new ObjectId(documentId) },
        {
          $set: {
            status,
            verifiedAt: new Date(),
            rejectionReason: !approved ? rejectionReason : null
          }
        }
      );

      // Mettre a jour la vigilance du transporteur
      const vigilance = await checkVigilanceStatus(db, carrierId);
      await db.collection('carriers').updateOne(
        { _id: new ObjectId(carrierId) },
        { $set: { vigilanceStatus: vigilance.status, updatedAt: new Date() } }
      );

      await logCarrierEvent(db, carrierId, approved ? CARRIER_EVENTS.DOCUMENT_VERIFIED : CARRIER_EVENTS.DOCUMENT_REJECTED, {
        documentId,
        approved,
        rejectionReason
      });

      const document = await db.collection('carrier_documents').findOne({ _id: new ObjectId(documentId) });

      res.json({
        document: {
          id: document._id.toString(),
          ...document,
          status
        }
      });

    } catch (error) {
      console.error('Error verifying document:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================================
  // SCORE ENDPOINT
  // =====================================================================

  // POST /api/carriers/:carrierId/calculate-score - Recalculer le score
  app.post('/api/carriers/:carrierId/calculate-score', async (req, res) => {
    try {
      const { carrierId } = req.params;

      const carrier = await db.collection('carriers').findOne({ _id: new ObjectId(carrierId) });
      if (!carrier) {
        return res.status(404).json({ error: 'Transporteur non trouve' });
      }

      const score = await calculateCarrierScore(db, carrierId);

      await db.collection('carriers').updateOne(
        { _id: new ObjectId(carrierId) },
        {
          $set: {
            score: score.overall,
            scoreDetails: score.details,
            updatedAt: new Date()
          }
        }
      );

      await logCarrierEvent(db, carrierId, CARRIER_EVENTS.SCORE_UPDATED, {
        previousScore: carrier.score,
        newScore: score.overall,
        details: score.details
      });

      // Sync avec orders
      const updatedCarrier = await db.collection('carriers').findOne({ _id: new ObjectId(carrierId) });
      syncCarrierWithOrders(updatedCarrier, score);

      res.json({
        success: true,
        score: score.overall,
        details: score.details
      });

    } catch (error) {
      console.error('Error calculating score:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================================
  // ONBOARD ENDPOINT
  // =====================================================================

  // POST /api/carriers/onboard - Finaliser l'onboarding
  app.post('/api/carriers/onboard', async (req, res) => {
    try {
      const { carrierId } = req.body;

      if (!carrierId) {
        return res.status(400).json({ error: 'carrierId est requis' });
      }

      const carrier = await db.collection('carriers').findOne({ _id: new ObjectId(carrierId) });
      if (!carrier) {
        return res.status(404).json({ error: 'Transporteur non trouve' });
      }

      // Verifier documents
      const requiredDocs = [DOCUMENT_TYPES.KBIS, DOCUMENT_TYPES.INSURANCE_RC, DOCUMENT_TYPES.LICENSE];
      const verifiedDocs = await db.collection('carrier_documents')
        .find({
          carrierId: new ObjectId(carrierId),
          status: DOCUMENT_STATUS.VERIFIED
        })
        .toArray();

      const verifiedTypes = verifiedDocs.map(d => d.documentType);
      const missingDocs = requiredDocs.filter(type => !verifiedTypes.includes(type));

      if (missingDocs.length > 0) {
        return res.status(400).json({
          error: `Documents manquants ou non verifies: ${missingDocs.join(', ')}`
        });
      }

      // Passer en statut actif et niveau reference
      const newLevel = carrier.level === CARRIER_LEVEL.GUEST ? CARRIER_LEVEL.REFERENCED : carrier.level;

      await db.collection('carriers').updateOne(
        { _id: new ObjectId(carrierId) },
        {
          $set: {
            status: CARRIER_STATUS.ACTIVE,
            level: newLevel,
            vigilanceStatus: VIGILANCE_STATUS.COMPLIANT,
            referencedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );

      // Calculer le score
      const score = await calculateCarrierScore(db, carrierId);
      await db.collection('carriers').updateOne(
        { _id: new ObjectId(carrierId) },
        { $set: { score: score.overall, scoreDetails: score.details } }
      );

      await logCarrierEvent(db, carrierId, CARRIER_EVENTS.VALIDATED, {
        level: newLevel,
        score: score.overall
      });

      // Envoyer emails
      sendOnboardingSuccessEmail(carrier.email, carrier.companyName, score.overall, newLevel)
        .catch(err => console.error('Failed to send onboarding success email:', err.message));

      // Notifier l'industriel
      if (carrier.referencedBy) {
        try {
          const industrial = await db.collection('users').findOne({ _id: new ObjectId(carrier.referencedBy) });
          if (industrial?.email) {
            sendIndustrialCarrierReadyEmail(
              industrial.email,
              industrial.organization?.name || industrial.companyName || 'Industriel',
              carrier.companyName,
              carrierId
            ).catch(err => console.error('Failed to notify industrial:', err.message));
          }
        } catch (e) { /* ignore */ }
      }

      // Sync avec orders
      const updatedCarrier = await db.collection('carriers').findOne({ _id: new ObjectId(carrierId) });
      syncCarrierWithOrders(updatedCarrier, score);

      res.json({
        success: true,
        message: 'Transporteur onboarde avec succes',
        status: CARRIER_STATUS.ACTIVE,
        level: newLevel,
        score: score.overall
      });

    } catch (error) {
      console.error('Error onboarding carrier:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================================
  // DISPATCH CHAINS (legacy)
  // =====================================================================

  app.post('/api/dispatch-chains', async (req, res) => {
    try {
      const { industrialId, carrierIds } = req.body;

      if (!industrialId || !Array.isArray(carrierIds)) {
        return res.status(400).json({ error: 'industrialId et carrierIds sont requis' });
      }

      // Mettre a jour l'ordre de dispatch
      for (let i = 0; i < carrierIds.length; i++) {
        await db.collection('carriers').updateOne(
          { _id: new ObjectId(carrierIds[i]) },
          {
            $set: {
              dispatchOrder: i + 1,
              isInDispatchChain: true,
              updatedAt: new Date()
            }
          }
        );
      }

      res.json({
        success: true,
        message: 'Chaine d\'affectation mise a jour'
      });

    } catch (error) {
      console.error('Error updating dispatch chain:', error);
      res.status(500).json({ error: error.message });
    }
  });

  console.log('✓ Carrier management routes configured (complete version)');
}

// =============================================================================
// CRON FUNCTIONS (pour vigilance automatique)
// =============================================================================

/**
 * Verifier et envoyer les alertes de vigilance (J-30, J-15, J-7)
 */
async function checkAndSendVigilanceAlerts(db) {
  const now = new Date();
  const alerts = [];

  // Documents expirant
  const documents = await db.collection('carrier_documents')
    .find({
      expiryDate: { $exists: true, $ne: null },
      status: DOCUMENT_STATUS.VERIFIED
    })
    .toArray();

  for (const doc of documents) {
    const daysUntilExpiry = Math.floor((new Date(doc.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if ([30, 15, 7, 3, 1].includes(daysUntilExpiry)) {
      // Verifier si alerte deja envoyee aujourd'hui
      const existingAlert = await db.collection('vigilance_alerts').findOne({
        carrierId: doc.carrierId.toString(),
        documentType: doc.documentType,
        type: `document_expiring_${daysUntilExpiry <= 7 ? '7' : daysUntilExpiry <= 15 ? '15' : '30'}`,
        createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
      });

      if (!existingAlert) {
        const carrier = await db.collection('carriers').findOne({ _id: doc.carrierId });
        if (carrier) {
          const alertType = daysUntilExpiry <= 7 ? 'document_expiring_7' : daysUntilExpiry <= 15 ? 'document_expiring_15' : 'document_expiring_30';
          const severity = daysUntilExpiry <= 7 ? 'critical' : daysUntilExpiry <= 15 ? 'warning' : 'info';

          const alert = {
            carrierId: doc.carrierId.toString(),
            industrielId: carrier.referencedBy,
            type: alertType,
            severity,
            title: `${doc.documentType} expire dans ${daysUntilExpiry} jour(s)`,
            message: `Le document ${doc.documentType} de ${carrier.companyName} expire le ${new Date(doc.expiryDate).toLocaleDateString('fr-FR')}`,
            documentType: doc.documentType,
            documentId: doc._id.toString(),
            actionRequired: true,
            actionLabel: 'Mettre a jour',
            notificationChannels: ['email', 'in_app'],
            isResolved: false,
            autoBlockAt: daysUntilExpiry <= 7 ? doc.expiryDate : null,
            createdAt: new Date()
          };

          await db.collection('vigilance_alerts').insertOne(alert);
          alerts.push(alert);

          // Envoyer email
          sendVigilanceAlertEmail(carrier.email, carrier.companyName, doc.documentType, daysUntilExpiry, doc.expiryDate)
            .catch(err => console.error('Failed to send vigilance alert email:', err.message));
        }
      }
    }

    // Si document expire, bloquer le transporteur
    if (daysUntilExpiry <= 0 && doc.status !== DOCUMENT_STATUS.EXPIRED) {
      await db.collection('carrier_documents').updateOne(
        { _id: doc._id },
        { $set: { status: DOCUMENT_STATUS.EXPIRED } }
      );

      const carrier = await db.collection('carriers').findOne({ _id: doc.carrierId });
      if (carrier && carrier.status !== CARRIER_STATUS.BLOCKED) {
        await db.collection('carriers').updateOne(
          { _id: doc.carrierId },
          {
            $set: {
              status: CARRIER_STATUS.BLOCKED,
              vigilanceStatus: VIGILANCE_STATUS.BLOCKED,
              blockedReason: BLOCKING_REASONS.DOCUMENTS_EXPIRED,
              blockedAt: new Date(),
              updatedAt: new Date()
            }
          }
        );

        await logCarrierEvent(db, doc.carrierId, CARRIER_EVENTS.BLOCKED, {
          reason: BLOCKING_REASONS.DOCUMENTS_EXPIRED,
          documentType: doc.documentType,
          automatic: true
        });

        sendCarrierBlockedEmail(carrier.email, carrier.companyName, BLOCKING_REASONS.DOCUMENTS_EXPIRED, `Document ${doc.documentType} expire`)
          .catch(err => console.error('Failed to send blocked email:', err.message));
      }
    }
  }

  return alerts;
}

module.exports = {
  setupCarrierRoutes,
  CARRIER_LEVEL,
  CARRIER_STATUS,
  DOCUMENT_TYPES,
  DOCUMENT_STATUS,
  VIGILANCE_STATUS,
  BLOCKING_REASONS,
  CARRIER_EVENTS,
  calculateCarrierScore,
  checkVigilanceStatus,
  checkAndSendVigilanceAlerts,
  logCarrierEvent,
  syncCarrierWithOrders
};
