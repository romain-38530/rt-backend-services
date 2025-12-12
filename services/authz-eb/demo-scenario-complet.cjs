/**
 * SYMPHONI.A - Scénario de Démonstration Complet
 *
 * Ce script crée un scénario complet incluant:
 * - 1 Industriel qui invite des transporteurs
 * - 3 Transporteurs avec documents légaux et grilles tarifaires
 * - 1 Logisticien gérant les flux de l'industriel
 * - 1 Fournisseur
 * - 1 Destinataire final
 * - Commandes avec affectation automatique et cascade vers Affret.IA
 * - Emails de notification à chaque étape
 *
 * Usage: node demo-scenario-complet.js
 */

const nodemailer = require('nodemailer');

// Configuration
const DEMO_EMAIL = 'r.tardy@rt-groupe.com';
const API_BASE = 'https://ddaywxps9n701.cloudfront.net';

// Transporteur email (pour Nodemailer) - Configuration OVH SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'ssl0.ovh.net',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  }
});

// ============================================
// DONNÉES DE DÉMONSTRATION
// ============================================

const DEMO_DATA = {
  // Industriel principal
  industrial: {
    id: 'demo-ind-001',
    name: 'Industrie Moderne SA',
    email: 'demo-industrie@symphonia-controltower.com',
    siret: '12345678901234',
    address: '15 Rue de l\'Innovation, 69001 Lyon',
    contact: 'Jean-Pierre Martin',
    phone: '+33 4 72 00 00 01'
  },

  // 3 Transporteurs (classés par score)
  transporters: [
    {
      id: 'demo-trans-001',
      name: 'Transport Express SARL',
      email: 'demo-transport1@symphonia-controltower.com',
      siret: '98765432109876',
      address: '8 Avenue du Fret, 69007 Lyon',
      contact: 'Marc Dupont',
      phone: '+33 4 72 00 00 10',
      score: 95,
      licenseNumber: 'LIC-2024-001',
      fleetSize: 25,
      specializations: ['frigo', 'express', 'adr']
    },
    {
      id: 'demo-trans-002',
      name: 'Trans Europe International',
      email: 'demo-transport2@symphonia-controltower.com',
      siret: '55566677788899',
      address: '22 Route Nationale, 38000 Grenoble',
      contact: 'Sophie Lemaire',
      phone: '+33 4 76 00 00 20',
      score: 88,
      licenseNumber: 'LIC-2024-002',
      fleetSize: 40,
      specializations: ['international', 'bache', 'citerne']
    },
    {
      id: 'demo-trans-003',
      name: 'Speed Logistics Express',
      email: 'demo-transport3@symphonia-controltower.com',
      siret: '11122233344455',
      address: '5 Zone Industrielle Nord, 42000 Saint-Etienne',
      contact: 'Pierre Moreau',
      phone: '+33 4 77 00 00 30',
      score: 82,
      licenseNumber: 'LIC-2024-003',
      fleetSize: 15,
      specializations: ['express', 'palette']
    }
  ],

  // Logisticien
  logistician: {
    id: 'demo-log-001',
    name: 'LogiStock France',
    email: 'demo-logisticien@symphonia-controltower.com',
    siret: '44455566677788',
    address: '100 Parc Logistique, 69200 Vénissieux',
    contact: 'Marie Durand',
    phone: '+33 4 72 00 00 50',
    warehouses: [
      { name: 'Entrepôt Lyon Sud', surface: 15000, city: 'Vénissieux' },
      { name: 'Entrepôt Rhône-Alpes', surface: 25000, city: 'Saint-Priest' }
    ]
  },

  // Fournisseur
  supplier: {
    id: 'demo-sup-001',
    name: 'Fournisseur Alpha Industries',
    email: 'demo-fournisseur@symphonia-controltower.com',
    siret: '77788899900011',
    address: '50 Zone Artisanale, 01000 Bourg-en-Bresse',
    contact: 'Luc Bernard',
    phone: '+33 4 74 00 00 60'
  },

  // Destinataire final
  recipient: {
    id: 'demo-dest-001',
    name: 'Destinataire Final SARL',
    email: 'demo-destinataire@symphonia-controltower.com',
    siret: '22233344455566',
    address: '25 Avenue du Commerce, 75012 Paris',
    contact: 'Claire Petit',
    phone: '+33 1 40 00 00 70'
  }
};

// Grilles tarifaires des transporteurs
const TRANSPORT_GRIDS = {
  'demo-trans-001': {
    name: 'Grille Express 2025',
    basePrice: 85,
    pricePerKm: 1.45,
    options: {
      frigo: { price: 150, available: true },
      express: { price: 80, available: true },
      adr: { price: 200, available: true },
      hayon: { price: 45, available: true },
      weekend: { price: 100, available: false }
    },
    zones: [
      { from: 'Lyon', to: 'Paris', fixedPrice: 450 },
      { from: 'Lyon', to: 'Marseille', fixedPrice: 320 },
      { from: 'Lyon', to: 'Grenoble', fixedPrice: 120 }
    ]
  },
  'demo-trans-002': {
    name: 'Grille International 2025',
    basePrice: 95,
    pricePerKm: 1.35,
    options: {
      frigo: { price: 180, available: false },
      express: { price: 100, available: true },
      adr: { price: 250, available: true },
      hayon: { price: 50, available: true },
      weekend: { price: 120, available: true }
    },
    zones: [
      { from: 'Lyon', to: 'Paris', fixedPrice: 480 },
      { from: 'Lyon', to: 'Milan', fixedPrice: 550 },
      { from: 'Lyon', to: 'Barcelone', fixedPrice: 680 }
    ]
  },
  'demo-trans-003': {
    name: 'Grille Régionale 2025',
    basePrice: 65,
    pricePerKm: 1.25,
    options: {
      frigo: { price: 120, available: false },
      express: { price: 60, available: true },
      adr: { price: 150, available: false },
      hayon: { price: 40, available: true },
      weekend: { price: 80, available: false }
    },
    zones: [
      { from: 'Lyon', to: 'Saint-Etienne', fixedPrice: 95 },
      { from: 'Lyon', to: 'Grenoble', fixedPrice: 110 },
      { from: 'Lyon', to: 'Valence', fixedPrice: 130 }
    ]
  }
};

// Commandes de démonstration
const DEMO_ORDERS = [
  // Commande 1: Affectée au meilleur transporteur (Transport Express)
  {
    id: 'CMD-DEMO-001',
    type: 'industrial_to_recipient',
    status: 'assigned',
    assignedTo: 'demo-trans-001',
    pickup: { address: DEMO_DATA.industrial.address, date: '2025-12-05', time: '08:00' },
    delivery: { address: DEMO_DATA.recipient.address, date: '2025-12-05', time: '16:00' },
    goods: { description: 'Pièces mécaniques', weight: 2500, palettes: 8 },
    options: ['express'],
    price: 520
  },
  // Commande 2: Refusée par le 1er, affectée au 2ème
  {
    id: 'CMD-DEMO-002',
    type: 'industrial_to_recipient',
    status: 'assigned',
    assignedTo: 'demo-trans-002',
    refusedBy: ['demo-trans-001'],
    refusalReason: 'Véhicule frigo non disponible à cette date',
    pickup: { address: DEMO_DATA.industrial.address, date: '2025-12-06', time: '06:00' },
    delivery: { address: '88 Rue du Marché, 13001 Marseille', date: '2025-12-06', time: '14:00' },
    goods: { description: 'Produits alimentaires', weight: 3200, palettes: 12 },
    options: ['frigo', 'express'],
    price: 680
  },
  // Commande 3: Refusée par tous, sur Affret.IA avec offres
  {
    id: 'CMD-DEMO-003',
    type: 'industrial_to_recipient',
    status: 'on_affret_ia',
    refusedBy: ['demo-trans-001', 'demo-trans-002'],
    affretIAOffers: [
      { id: 'offer-001', transporterId: 'ext-trans-001', name: 'Rhône Transport', price: 750, eta: '2025-12-07 15:00', score: 91 },
      { id: 'offer-002', transporterId: 'ext-trans-002', name: 'Alps Logistics', price: 720, eta: '2025-12-07 17:00', score: 87 },
      { id: 'offer-003', transporterId: 'demo-trans-003', name: 'Speed Logistics Express', price: 690, eta: '2025-12-07 18:00', score: 82 }
    ],
    pickup: { address: DEMO_DATA.industrial.address, date: '2025-12-07', time: '07:00' },
    delivery: { address: '12 Zone Industrielle, 38500 Voiron', date: '2025-12-07', time: '18:00' },
    goods: { description: 'Équipements industriels ADR', weight: 4500, palettes: 15 },
    options: ['adr', 'hayon'],
    price: null // En attente d'offre acceptée
  },
  // Commande 4: Fournisseur -> Logisticien
  {
    id: 'CMD-DEMO-004',
    type: 'supplier_to_logistician',
    status: 'pending',
    pickup: { address: DEMO_DATA.supplier.address, date: '2025-12-08', time: '09:00' },
    delivery: { address: DEMO_DATA.logistician.warehouses[0].name + ', ' + DEMO_DATA.logistician.address, date: '2025-12-08', time: '14:00' },
    goods: { description: 'Matières premières', weight: 5000, palettes: 20 },
    options: [],
    price: 350
  },
  // Commande 5: Logisticien -> Destinataire final
  {
    id: 'CMD-DEMO-005',
    type: 'logistician_to_recipient',
    status: 'pending',
    pickup: { address: DEMO_DATA.logistician.address, date: '2025-12-09', time: '08:00' },
    delivery: { address: DEMO_DATA.recipient.address, date: '2025-12-09', time: '16:00' },
    goods: { description: 'Produits finis conditionnés', weight: 1800, palettes: 6 },
    options: ['express'],
    price: 480
  }
];

// ============================================
// TEMPLATES D'EMAILS
// ============================================

// Logo URL pour les emails
const LOGO_URL = 'https://symphonia-controltower.com/logo-symphonia.png';

const EMAIL_TEMPLATES = {
  // 1. Invitation transporteur
  transporterInvitation: (transporter, industrial) => ({
    subject: `🚚 SYMPHONI.A - Invitation à rejoindre le réseau de ${industrial.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <img src="${LOGO_URL}" alt="SYMPHONI.A" style="height: 50px; margin-bottom: 15px;" onerror="this.style.display='none'">
          <h1 style="color: white; margin: 0;">SYMPHONI.A</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">L'IA qui orchestre vos flux transport</p>
        </div>

        <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
          <h2 style="color: #333;">Bonjour ${transporter.contact},</h2>

          <p style="color: #666; line-height: 1.6;">
            <strong>${industrial.name}</strong> vous invite à rejoindre son réseau de transporteurs référencés sur la plateforme SYMPHONI.A.
          </p>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Entreprise invitante :</h3>
            <ul style="color: #666; padding-left: 20px;">
              <li><strong>Raison sociale :</strong> ${industrial.name}</li>
              <li><strong>Contact :</strong> ${industrial.contact}</li>
              <li><strong>Adresse :</strong> ${industrial.address}</li>
            </ul>
          </div>

          <p style="color: #666; line-height: 1.6;">
            En acceptant cette invitation, vous pourrez :
          </p>
          <ul style="color: #666; line-height: 1.8;">
            <li>✅ Recevoir des propositions de transport en priorité</li>
            <li>✅ Intégrer vos grilles tarifaires</li>
            <li>✅ Gérer vos documents légaux en ligne</li>
            <li>✅ Suivre vos missions en temps réel</li>
          </ul>

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://transporter.symphonia-controltower.com/invitation/accept?token=DEMO-TOKEN-${transporter.id}"
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
              Accepter l'invitation
            </a>
          </div>

          <p style="color: #999; font-size: 12px; text-align: center;">
            Cette invitation expire dans 7 jours. Si vous n'êtes pas ${transporter.name}, ignorez cet email.
          </p>
        </div>

        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
          <p style="color: #999; font-size: 12px; margin: 0;">
            SYMPHONI.A - RT Technologie © 2025<br>
            <a href="https://symphonia-controltower.com" style="color: #667eea;">www.symphonia-controltower.com</a>
          </p>
        </div>
      </div>
    `
  }),

  // 2. Confirmation d'acceptation d'invitation
  invitationAccepted: (transporter, industrial) => ({
    subject: `✅ SYMPHONI.A - Invitation acceptée par ${transporter.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #00D084 0%, #00B37E 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <img src="${LOGO_URL}" alt="SYMPHONI.A" style="height: 50px; margin-bottom: 15px;" onerror="this.style.display='none'">
          <h1 style="color: white; margin: 0;">✅ Invitation Acceptée</h1>
        </div>

        <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
          <h2 style="color: #333;">Bonjour ${industrial.contact},</h2>

          <p style="color: #666; line-height: 1.6;">
            Excellente nouvelle ! <strong>${transporter.name}</strong> a accepté votre invitation et fait maintenant partie de votre réseau de transporteurs référencés.
          </p>

          <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #00D084;">
            <h3 style="margin-top: 0; color: #2e7d32;">Nouveau transporteur :</h3>
            <ul style="color: #666; padding-left: 20px;">
              <li><strong>Entreprise :</strong> ${transporter.name}</li>
              <li><strong>Contact :</strong> ${transporter.contact}</li>
              <li><strong>Téléphone :</strong> ${transporter.phone}</li>
              <li><strong>Score qualité :</strong> ⭐ ${transporter.score}/100</li>
              <li><strong>Flotte :</strong> ${transporter.fleetSize} véhicules</li>
              <li><strong>Spécialités :</strong> ${transporter.specializations.join(', ')}</li>
            </ul>
          </div>

          <p style="color: #666; line-height: 1.6;">
            Ce transporteur peut maintenant :
          </p>
          <ul style="color: #666;">
            <li>📄 Téléverser ses documents légaux</li>
            <li>💰 Configurer ses grilles tarifaires</li>
            <li>🚚 Recevoir vos propositions de transport</li>
          </ul>
        </div>

        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
          <a href="https://transporter.symphonia-controltower.com/admin/transporters/${transporter.id}"
             style="background: #667eea; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; display: inline-block;">
            Voir le profil transporteur
          </a>
        </div>
      </div>
    `
  }),

  // 3. Documents légaux validés
  documentsValidated: (transporter) => ({
    subject: `📋 SYMPHONI.A - Documents légaux validés pour ${transporter.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <img src="${LOGO_URL}" alt="SYMPHONI.A" style="height: 50px; margin-bottom: 15px;" onerror="this.style.display='none'">
          <h1 style="color: white; margin: 0;">📋 Documents Validés</h1>
        </div>

        <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
          <h2 style="color: #333;">Bonjour ${transporter.contact},</h2>

          <p style="color: #666; line-height: 1.6;">
            Vos documents légaux ont été vérifiés et validés avec succès. Vous êtes maintenant autorisé à recevoir des missions de transport.
          </p>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Documents validés :</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666;">✅ Licence de transport</td>
                <td style="padding: 8px 0; color: #00D084; text-align: right;">${transporter.licenseNumber}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">✅ Assurance RC Pro</td>
                <td style="padding: 8px 0; color: #00D084; text-align: right;">Valide jusqu'au 31/12/2025</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">✅ Attestation de capacité</td>
                <td style="padding: 8px 0; color: #00D084; text-align: right;">Validée</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">✅ Kbis</td>
                <td style="padding: 8px 0; color: #00D084; text-align: right;">Moins de 3 mois</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://transporter.symphonia-controltower.com"
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; margin-bottom: 15px;">
              Acceder a mon espace transporteur
            </a>
            <br><br>
            <a href="https://transporter.symphonia-controltower.com/documents"
               style="background: #3b82f6; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block; margin-right: 10px;">
              Voir mes documents
            </a>
            <a href="https://transporter.symphonia-controltower.com/grids"
               style="background: #00D084; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
              Configurer mes grilles tarifaires
            </a>
          </div>
        </div>
      </div>
    `
  }),

  // 4. Grille tarifaire intégrée
  gridIntegrated: (transporter, grid) => ({
    subject: `💰 SYMPHONI.A - Grille tarifaire "${grid.name}" activée`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <img src="${LOGO_URL}" alt="SYMPHONI.A" style="height: 50px; margin-bottom: 15px;" onerror="this.style.display='none'">
          <h1 style="color: white; margin: 0;">💰 Grille Tarifaire Active</h1>
        </div>

        <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
          <h2 style="color: #333;">Bonjour ${transporter.contact},</h2>

          <p style="color: #666; line-height: 1.6;">
            Votre grille tarifaire <strong>"${grid.name}"</strong> a été intégrée avec succès et est maintenant active.
          </p>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Récapitulatif de votre grille :</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666;">Prix de base :</td>
                <td style="padding: 8px 0; color: #333; text-align: right; font-weight: bold;">${grid.basePrice} €</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Prix au km :</td>
                <td style="padding: 8px 0; color: #333; text-align: right; font-weight: bold;">${grid.pricePerKm} €/km</td>
              </tr>
            </table>

            <h4 style="color: #333; margin-top: 15px;">Options disponibles :</h4>
            <ul style="color: #666; padding-left: 20px;">
              ${Object.entries(grid.options).filter(([_, opt]) => opt.available).map(([name, opt]) =>
                `<li>${name}: +${opt.price} €</li>`
              ).join('')}
            </ul>

            <h4 style="color: #333; margin-top: 15px;">Zones à prix fixe :</h4>
            <ul style="color: #666; padding-left: 20px;">
              ${grid.zones.map(z => `<li>${z.from} → ${z.to}: ${z.fixedPrice} €</li>`).join('')}
            </ul>
          </div>

          <p style="color: #666; line-height: 1.6;">
            Vous êtes maintenant prêt à recevoir des propositions de transport !
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://transporter.symphonia-controltower.com"
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; margin-bottom: 15px;">
              Acceder a mon espace transporteur
            </a>
            <br><br>
            <a href="https://transporter.symphonia-controltower.com/grids"
               style="background: #00D084; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
              Voir mes grilles tarifaires
            </a>
          </div>
        </div>
      </div>
    `
  }),

  // 5. Nouvelle commande affectée au transporteur
  orderAssigned: (transporter, order, industrial) => ({
    subject: `🚚 SYMPHONI.A - Nouvelle mission ${order.id} à valider`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #FF6B35 0%, #F7931E 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <img src="${LOGO_URL}" alt="SYMPHONI.A" style="height: 50px; margin-bottom: 15px;" onerror="this.style.display='none'">
          <h1 style="color: white; margin: 0;">🚚 Nouvelle Mission</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 24px; font-weight: bold;">${order.id}</p>
        </div>

        <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
          <h2 style="color: #333;">Bonjour ${transporter.contact},</h2>

          <p style="color: #666; line-height: 1.6;">
            <strong>${industrial.name}</strong> vous propose une nouvelle mission de transport. Vous avez été sélectionné grâce à votre excellent score qualité (${transporter.score}/100).
          </p>

          <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #FF6B35;">
            <h3 style="margin-top: 0; color: #e65100;">⏰ Répondez sous 2 heures</h3>
            <p style="color: #666; margin: 0;">Sans réponse, la mission sera proposée au transporteur suivant.</p>
          </div>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Détails de la mission :</h3>

            <div style="display: flex; margin-bottom: 15px;">
              <div style="flex: 1;">
                <p style="color: #999; margin: 0; font-size: 12px;">ENLÈVEMENT</p>
                <p style="color: #333; margin: 5px 0; font-weight: bold;">📍 ${order.pickup.address}</p>
                <p style="color: #666; margin: 0;">📅 ${order.pickup.date} à ${order.pickup.time}</p>
              </div>
            </div>

            <div style="border-left: 3px dashed #ccc; height: 30px; margin-left: 10px;"></div>

            <div style="display: flex;">
              <div style="flex: 1;">
                <p style="color: #999; margin: 0; font-size: 12px;">LIVRAISON</p>
                <p style="color: #333; margin: 5px 0; font-weight: bold;">📍 ${order.delivery.address}</p>
                <p style="color: #666; margin: 0;">📅 ${order.delivery.date} à ${order.delivery.time}</p>
              </div>
            </div>

            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 5px 0; color: #666;">Marchandise :</td>
                <td style="padding: 5px 0; color: #333; text-align: right;">${order.goods.description}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; color: #666;">Poids :</td>
                <td style="padding: 5px 0; color: #333; text-align: right;">${order.goods.weight} kg</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; color: #666;">Palettes :</td>
                <td style="padding: 5px 0; color: #333; text-align: right;">${order.goods.palettes}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; color: #666;">Options :</td>
                <td style="padding: 5px 0; color: #333; text-align: right;">${order.options.join(', ') || 'Aucune'}</td>
              </tr>
            </table>

            <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin-top: 15px; text-align: center;">
              <p style="color: #2e7d32; margin: 0; font-size: 24px; font-weight: bold;">${order.price} € HT</p>
              <p style="color: #666; margin: 5px 0 0; font-size: 12px;">Prix calculé selon votre grille tarifaire</p>
            </div>
          </div>

          <div style="display: flex; gap: 10px; justify-content: center; margin: 30px 0;">
            <a href="https://transporter.symphonia-controltower.com/mission/${order.id}/accept"
               style="background: #00D084; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              ✅ Accepter
            </a>
            <a href="https://transporter.symphonia-controltower.com/mission/${order.id}/refuse"
               style="background: #ff5252; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              ❌ Refuser
            </a>
          </div>
        </div>
      </div>
    `
  }),

  // 6. Commande refusée - notification à l'industriel
  orderRefused: (order, refusingTransporter, nextTransporter) => ({
    subject: `⚠️ SYMPHONI.A - Mission ${order.id} refusée par ${refusingTransporter.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <img src="${LOGO_URL}" alt="SYMPHONI.A" style="height: 50px; margin-bottom: 15px;" onerror="this.style.display='none'">
          <h1 style="color: white; margin: 0;">⚠️ Mission Refusée</h1>
        </div>

        <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
          <p style="color: #666; line-height: 1.6;">
            La mission <strong>${order.id}</strong> a été refusée par <strong>${refusingTransporter.name}</strong>.
          </p>

          <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ff9800;">
            <p style="color: #e65100; margin: 0;"><strong>Raison :</strong> ${order.refusalReason}</p>
          </div>

          ${nextTransporter ? `
            <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #2196f3;">
              <p style="color: #1565c0; margin: 0;">
                <strong>Action automatique :</strong> La mission a été proposée à <strong>${nextTransporter.name}</strong> (Score: ${nextTransporter.score}/100)
              </p>
            </div>
          ` : `
            <div style="background: #fce4ec; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #e91e63;">
              <p style="color: #c2185b; margin: 0;">
                <strong>Action automatique :</strong> Tous les transporteurs référencés ont refusé. La mission est maintenant sur <strong>AFFRET.IA</strong> pour recevoir des offres externes.
              </p>
            </div>
          `}
        </div>
      </div>
    `
  }),

  // 7. Commande sur Affret.IA avec offres
  orderOnAffretIA: (order, offers) => ({
    subject: `🤖 SYMPHONI.A - ${offers.length} offres reçues sur Affret.IA pour ${order.id}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #9c27b0 0%, #673ab7 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <img src="https://symphonia-controltower.com/logo-white.png" alt="SYMPHONI.A" style="height: 50px; margin-bottom: 15px;" onerror="this.style.display='none'">
          <h1 style="color: white; margin: 0;">🤖 AFFRET.IA</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">${offers.length} offres disponibles</p>
        </div>

        <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
          <p style="color: #666; line-height: 1.6;">
            Votre mission <strong>${order.id}</strong> a reçu <strong>${offers.length} offres</strong> via notre plateforme d'affrètement intelligent.
          </p>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Offres reçues :</h3>

            ${offers.map((offer, idx) => `
              <div style="background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 15px; margin-bottom: 15px; ${idx === 0 ? 'border-color: #00D084; border-width: 2px;' : ''}">
                ${idx === 0 ? '<span style="background: #00D084; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; float: right;">RECOMMANDÉ</span>' : ''}
                <p style="margin: 0 0 5px; font-weight: bold; color: #333;">${offer.name}</p>
                <p style="margin: 0 0 8px; color: #666; font-size: 14px;">
                  <span style="background: #667eea; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-right: 8px;">Score: ${offer.score}/100</span>
                  Prix: <strong style="color: #00D084;">${offer.price} € HT</strong> |
                  Livraison estimée: ${offer.eta}
                </p>
                <div style="text-align: center; margin-top: 12px;">
                  <a href="https://industry.symphonia-controltower.com/orders/${order.id}/accept-offer/${offer.id}"
                     style="background: ${idx === 0 ? '#00D084' : '#667eea'}; color: white; padding: 10px 25px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block; font-size: 13px;">
                    Accepter cette offre
                  </a>
                </div>
              </div>
            `).join('')}
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://industry.symphonia-controltower.com/affret-ia/${order.id}"
               style="background: linear-gradient(135deg, #9c27b0 0%, #673ab7 100%); color: white; padding: 15px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
              Voir toutes les offres sur Affret.IA
            </a>
          </div>
        </div>

        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
          <p style="color: #999; font-size: 12px; margin: 0;">
            SYMPHONI.A - RT Technologie © 2025<br>
            <a href="https://symphonia-controltower.com" style="color: #667eea;">www.symphonia-controltower.com</a>
          </p>
        </div>
      </div>
    `
  }),

  // 8. Nouvelle commande pour le fournisseur
  supplierNewOrder: (order, supplier, logistician) => ({
    subject: `📦 SYMPHONI.A - Nouvelle commande ${order.id} à préparer`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #00BCD4 0%, #0097A7 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <img src="${LOGO_URL}" alt="SYMPHONI.A" style="height: 50px; margin-bottom: 15px;" onerror="this.style.display='none'">
          <h1 style="color: white; margin: 0;">📦 Nouvelle Commande</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 20px;">${order.id}</p>
        </div>

        <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
          <h2 style="color: #333;">Bonjour ${supplier.contact},</h2>

          <p style="color: #666; line-height: 1.6;">
            Une nouvelle commande a été créée dans votre espace fournisseur SYMPHONI.A.
            <strong>${logistician.name}</strong> attend cette livraison.
          </p>

          <div style="background: #e0f7fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #00BCD4;">
            <h3 style="margin-top: 0; color: #00838f;">Détails de la commande :</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666;">Destinataire :</td>
                <td style="padding: 8px 0; color: #333; text-align: right;">${logistician.name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Adresse de livraison :</td>
                <td style="padding: 8px 0; color: #333; text-align: right;">${order.delivery.address}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Date d'enlèvement :</td>
                <td style="padding: 8px 0; color: #333; text-align: right;">${order.pickup.date} à ${order.pickup.time}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Marchandise :</td>
                <td style="padding: 8px 0; color: #333; text-align: right;">${order.goods.description}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Quantité :</td>
                <td style="padding: 8px 0; color: #333; text-align: right;">${order.goods.palettes} palettes (${order.goods.weight} kg)</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://transporter.symphonia-controltower.com/supplier/orders/${order.id}"
               style="background: linear-gradient(135deg, #00BCD4 0%, #0097A7 100%); color: white; padding: 15px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
              Voir la commande
            </a>
          </div>
        </div>
      </div>
    `
  }),

  // 9. Nouvelle livraison pour le destinataire
  recipientNewDelivery: (order, recipient, logistician) => ({
    subject: `📬 SYMPHONI.A - Livraison ${order.id} programmée`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #4CAF50 0%, #388E3C 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <img src="${LOGO_URL}" alt="SYMPHONI.A" style="height: 50px; margin-bottom: 15px;" onerror="this.style.display='none'">
          <h1 style="color: white; margin: 0;">📬 Livraison Programmée</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 20px;">${order.id}</p>
        </div>

        <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
          <h2 style="color: #333;">Bonjour ${recipient.contact},</h2>

          <p style="color: #666; line-height: 1.6;">
            Une livraison a été programmée à votre adresse. <strong>${logistician.name}</strong> vous envoie cette marchandise.
          </p>

          <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4CAF50;">
            <h3 style="margin-top: 0; color: #2e7d32;">Détails de la livraison :</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666;">Expéditeur :</td>
                <td style="padding: 8px 0; color: #333; text-align: right;">${logistician.name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Date de livraison :</td>
                <td style="padding: 8px 0; color: #333; text-align: right; font-weight: bold;">${order.delivery.date} à ${order.delivery.time}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Adresse :</td>
                <td style="padding: 8px 0; color: #333; text-align: right;">${order.delivery.address}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Contenu :</td>
                <td style="padding: 8px 0; color: #333; text-align: right;">${order.goods.description}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Palettes :</td>
                <td style="padding: 8px 0; color: #333; text-align: right;">${order.goods.palettes}</td>
              </tr>
            </table>
          </div>

          <p style="color: #666; line-height: 1.6;">
            Vous recevrez un SMS et un email le jour de la livraison avec le créneau horaire précis et la possibilité de suivre le transporteur en temps réel.
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://transporter.symphonia-controltower.com/recipient/deliveries/${order.id}"
               style="background: linear-gradient(135deg, #4CAF50 0%, #388E3C 100%); color: white; padding: 15px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
              Suivre ma livraison
            </a>
          </div>
        </div>
      </div>
    `
  }),

  // 10. Résumé quotidien pour l'industriel
  dailySummary: (industrial, stats) => ({
    subject: `📊 SYMPHONI.A - Résumé quotidien pour ${industrial.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <img src="${LOGO_URL}" alt="SYMPHONI.A" style="height: 50px; margin-bottom: 15px;" onerror="this.style.display='none'">
          <h1 style="color: white; margin: 0;">📊 Résumé Quotidien</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">3 Décembre 2025</p>
        </div>

        <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
          <h2 style="color: #333;">Bonjour ${industrial.contact},</h2>

          <p style="color: #666; line-height: 1.6;">Voici le résumé de votre activité transport aujourd'hui :</p>

          <div style="display: flex; gap: 15px; margin: 20px 0;">
            <div style="flex: 1; background: #e3f2fd; padding: 20px; border-radius: 8px; text-align: center;">
              <p style="color: #1565c0; font-size: 32px; font-weight: bold; margin: 0;">5</p>
              <p style="color: #666; margin: 5px 0 0; font-size: 14px;">Commandes créées</p>
            </div>
            <div style="flex: 1; background: #e8f5e9; padding: 20px; border-radius: 8px; text-align: center;">
              <p style="color: #2e7d32; font-size: 32px; font-weight: bold; margin: 0;">3</p>
              <p style="color: #666; margin: 5px 0 0; font-size: 14px;">Affectées</p>
            </div>
            <div style="flex: 1; background: #fff3e0; padding: 20px; border-radius: 8px; text-align: center;">
              <p style="color: #e65100; font-size: 32px; font-weight: bold; margin: 0;">1</p>
              <p style="color: #666; margin: 5px 0 0; font-size: 14px;">Sur Affret.IA</p>
            </div>
          </div>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Transporteurs actifs :</h3>
            <ul style="color: #666; padding-left: 20px;">
              <li>Transport Express SARL - ⭐ 95/100 - 2 missions</li>
              <li>Trans Europe International - ⭐ 88/100 - 1 mission</li>
              <li>Speed Logistics Express - ⭐ 82/100 - 0 missions</li>
            </ul>
          </div>

          <div style="background: #fce4ec; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="color: #c2185b; margin: 0;">
              <strong>Action requise :</strong> 1 commande sur Affret.IA avec 3 offres en attente de validation
            </p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://transporter.symphonia-controltower.com/dashboard"
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
              Accéder au tableau de bord
            </a>
          </div>
        </div>
      </div>
    `
  })
};

// ============================================
// FONCTIONS PRINCIPALES
// ============================================

async function sendEmail(to, template) {
  try {
    await transporter.sendMail({
      from: '"SYMPHONI.A Demo" <contact@symphonia-controltower.com>',
      to: to,
      subject: template.subject,
      html: template.html
    });
    console.log(`✅ Email envoyé: ${template.subject}`);
    return true;
  } catch (error) {
    console.error(`❌ Erreur envoi email: ${error.message}`);
    return false;
  }
}

async function runDemoScenario() {
  console.log('='.repeat(60));
  console.log('SYMPHONI.A - SCÉNARIO DE DÉMONSTRATION COMPLET');
  console.log('='.repeat(60));
  console.log(`\nTous les emails seront envoyés à: ${DEMO_EMAIL}\n`);

  const allEmails = [];

  // ============================================
  // PHASE 1: Invitations aux transporteurs
  // ============================================
  console.log('\n--- PHASE 1: Invitations aux transporteurs ---\n');

  for (const transporter of DEMO_DATA.transporters) {
    const template = EMAIL_TEMPLATES.transporterInvitation(transporter, DEMO_DATA.industrial);
    allEmails.push({ to: DEMO_EMAIL, template, description: `Invitation à ${transporter.name}` });
    console.log(`📧 Préparé: Invitation à ${transporter.name}`);
  }

  // ============================================
  // PHASE 2: Acceptation des invitations
  // ============================================
  console.log('\n--- PHASE 2: Acceptation des invitations ---\n');

  for (const transporter of DEMO_DATA.transporters) {
    // Email à l'industriel
    const template = EMAIL_TEMPLATES.invitationAccepted(transporter, DEMO_DATA.industrial);
    allEmails.push({ to: DEMO_EMAIL, template, description: `${transporter.name} a accepté` });
    console.log(`📧 Préparé: ${transporter.name} a accepté l'invitation`);
  }

  // ============================================
  // PHASE 3: Validation des documents légaux
  // ============================================
  console.log('\n--- PHASE 3: Validation des documents légaux ---\n');

  for (const transporter of DEMO_DATA.transporters) {
    const template = EMAIL_TEMPLATES.documentsValidated(transporter);
    allEmails.push({ to: DEMO_EMAIL, template, description: `Documents validés pour ${transporter.name}` });
    console.log(`📧 Préparé: Documents validés pour ${transporter.name}`);
  }

  // ============================================
  // PHASE 4: Intégration des grilles tarifaires
  // ============================================
  console.log('\n--- PHASE 4: Intégration des grilles tarifaires ---\n');

  for (const transporter of DEMO_DATA.transporters) {
    const grid = TRANSPORT_GRIDS[transporter.id];
    const template = EMAIL_TEMPLATES.gridIntegrated(transporter, grid);
    allEmails.push({ to: DEMO_EMAIL, template, description: `Grille tarifaire de ${transporter.name}` });
    console.log(`📧 Préparé: Grille tarifaire intégrée pour ${transporter.name}`);
  }

  // ============================================
  // PHASE 5: Création et affectation des commandes
  // ============================================
  console.log('\n--- PHASE 5: Création et affectation des commandes ---\n');

  // Commande 1: Affectée au meilleur transporteur
  const order1 = DEMO_ORDERS[0];
  const trans1 = DEMO_DATA.transporters.find(t => t.id === order1.assignedTo);
  allEmails.push({
    to: DEMO_EMAIL,
    template: EMAIL_TEMPLATES.orderAssigned(trans1, order1, DEMO_DATA.industrial),
    description: `Mission ${order1.id} proposée à ${trans1.name}`
  });
  console.log(`📧 Préparé: Mission ${order1.id} proposée à ${trans1.name}`);

  // Commande 2: Refusée par le 1er, affectée au 2ème
  const order2 = DEMO_ORDERS[1];
  const refusingTrans = DEMO_DATA.transporters[0];
  const nextTrans = DEMO_DATA.transporters.find(t => t.id === order2.assignedTo);

  // Notification de refus
  allEmails.push({
    to: DEMO_EMAIL,
    template: EMAIL_TEMPLATES.orderRefused(order2, refusingTrans, nextTrans),
    description: `Mission ${order2.id} refusée par ${refusingTrans.name}`
  });
  console.log(`📧 Préparé: Mission ${order2.id} refusée par ${refusingTrans.name}`);

  // Proposition au 2ème transporteur
  allEmails.push({
    to: DEMO_EMAIL,
    template: EMAIL_TEMPLATES.orderAssigned(nextTrans, order2, DEMO_DATA.industrial),
    description: `Mission ${order2.id} proposée à ${nextTrans.name}`
  });
  console.log(`📧 Préparé: Mission ${order2.id} proposée à ${nextTrans.name}`);

  // Commande 3: Refusée par tous, sur Affret.IA
  const order3 = DEMO_ORDERS[2];
  allEmails.push({
    to: DEMO_EMAIL,
    template: EMAIL_TEMPLATES.orderRefused(order3, DEMO_DATA.transporters[1], null),
    description: `Mission ${order3.id} - tous ont refusé`
  });
  console.log(`📧 Préparé: Mission ${order3.id} - tous les transporteurs ont refusé`);

  allEmails.push({
    to: DEMO_EMAIL,
    template: EMAIL_TEMPLATES.orderOnAffretIA(order3, order3.affretIAOffers),
    description: `Mission ${order3.id} sur Affret.IA`
  });
  console.log(`📧 Préparé: Mission ${order3.id} sur Affret.IA avec ${order3.affretIAOffers.length} offres`);

  // ============================================
  // PHASE 6: Commandes Fournisseur -> Logisticien
  // ============================================
  console.log('\n--- PHASE 6: Commandes Fournisseur -> Logisticien ---\n');

  const order4 = DEMO_ORDERS[3];
  allEmails.push({
    to: DEMO_EMAIL,
    template: EMAIL_TEMPLATES.supplierNewOrder(order4, DEMO_DATA.supplier, DEMO_DATA.logistician),
    description: `Commande ${order4.id} pour le fournisseur`
  });
  console.log(`📧 Préparé: Commande ${order4.id} notifiée au fournisseur`);

  // ============================================
  // PHASE 7: Commandes Logisticien -> Destinataire
  // ============================================
  console.log('\n--- PHASE 7: Commandes Logisticien -> Destinataire ---\n');

  const order5 = DEMO_ORDERS[4];
  allEmails.push({
    to: DEMO_EMAIL,
    template: EMAIL_TEMPLATES.recipientNewDelivery(order5, DEMO_DATA.recipient, DEMO_DATA.logistician),
    description: `Livraison ${order5.id} pour le destinataire`
  });
  console.log(`📧 Préparé: Livraison ${order5.id} notifiée au destinataire`);

  // ============================================
  // PHASE 8: Résumé quotidien
  // ============================================
  console.log('\n--- PHASE 8: Résumé quotidien ---\n');

  allEmails.push({
    to: DEMO_EMAIL,
    template: EMAIL_TEMPLATES.dailySummary(DEMO_DATA.industrial, {}),
    description: 'Résumé quotidien pour l\'industriel'
  });
  console.log(`📧 Préparé: Résumé quotidien`);

  // ============================================
  // ENVOI DE TOUS LES EMAILS
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log(`ENVOI DE ${allEmails.length} EMAILS À ${DEMO_EMAIL}`);
  console.log('='.repeat(60) + '\n');

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < allEmails.length; i++) {
    const { to, template, description } = allEmails[i];
    console.log(`[${i + 1}/${allEmails.length}] ${description}...`);

    const success = await sendEmail(to, template);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }

    // Petit délai entre les emails pour éviter le throttling
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // ============================================
  // RÉSUMÉ FINAL
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('RÉSUMÉ DU SCÉNARIO DE DÉMONSTRATION');
  console.log('='.repeat(60));
  console.log(`\n📧 Emails envoyés: ${successCount}/${allEmails.length}`);
  if (failCount > 0) {
    console.log(`❌ Échecs: ${failCount}`);
  }

  console.log('\n📋 COMPTES DE DÉMONSTRATION CRÉÉS:');
  console.log(`   • Industriel: ${DEMO_DATA.industrial.name} (${DEMO_DATA.industrial.email})`);
  console.log(`   • Transporteur 1: ${DEMO_DATA.transporters[0].name} (Score: ${DEMO_DATA.transporters[0].score})`);
  console.log(`   • Transporteur 2: ${DEMO_DATA.transporters[1].name} (Score: ${DEMO_DATA.transporters[1].score})`);
  console.log(`   • Transporteur 3: ${DEMO_DATA.transporters[2].name} (Score: ${DEMO_DATA.transporters[2].score})`);
  console.log(`   • Logisticien: ${DEMO_DATA.logistician.name}`);
  console.log(`   • Fournisseur: ${DEMO_DATA.supplier.name}`);
  console.log(`   • Destinataire: ${DEMO_DATA.recipient.name}`);

  console.log('\n📦 COMMANDES CRÉÉES:');
  DEMO_ORDERS.forEach(order => {
    console.log(`   • ${order.id}: ${order.type} - Status: ${order.status}`);
  });

  console.log('\n✅ Scénario de démonstration terminé!');
  console.log(`   Vérifiez votre boîte mail: ${DEMO_EMAIL}\n`);
}

// Exécution
runDemoScenario().catch(console.error);
