/**
 * Script de Seed - Donnees de demonstration
 * Module Economie Circulaire Palettes Europe
 *
 * Usage: node seed-demo.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Configuration MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-palettes?retryWrites=true&w=majority';

// Schemas simplifies pour le seed
const CompanySchema = new mongoose.Schema({
  companyId: { type: String, unique: true, required: true },
  name: String,
  type: { type: String, enum: ['industriel', 'transporteur', 'logisticien'] },
  siret: String,
  address: {
    street: String,
    city: String,
    postalCode: String,
    country: String,
    coordinates: { latitude: Number, longitude: Number }
  },
  contact: { email: String, phone: String, contactName: String },
  subscription: { active: Boolean, plan: String, startDate: Date },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'pallet_companies' });

const SiteSchema = new mongoose.Schema({
  siteId: { type: String, unique: true, required: true },
  companyId: String,
  siteName: String,
  type: String,
  address: {
    street: String,
    city: String,
    postalCode: String,
    country: String,
    coordinates: { latitude: Number, longitude: Number }
  },
  geofencing: { radius: Number, strictMode: Boolean },
  quota: { maxDaily: Number, currentDaily: Number, maxWeekly: Number, currentWeekly: Number },
  capacities: {
    EURO_EPAL: Number,
    EURO_EPAL_2: Number,
    DEMI_PALETTE: Number,
    PALETTE_PERDUE: Number
  },
  openingHours: { open: String, close: String },
  priority: Number,
  active: Boolean,
  createdAt: { type: Date, default: Date.now }
}, { collection: 'pallet_sites' });

const ChequeSchema = new mongoose.Schema({
  chequeId: { type: String, unique: true, required: true },
  qrCode: String,
  orderId: String,
  palletType: String,
  quantity: Number,
  transporterId: String,
  transporterName: String,
  vehiclePlate: String,
  driverName: String,
  destinationSiteId: String,
  destinationSiteName: String,
  status: { type: String, enum: ['EMIS', 'EN_TRANSIT', 'DEPOSE', 'RECU', 'LITIGE', 'ANNULE'] },
  timestamps: {
    emittedAt: Date,
    depositedAt: Date,
    receivedAt: Date
  },
  signatures: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
}, { collection: 'pallet_cheques' });

const LedgerSchema = new mongoose.Schema({
  ledgerId: { type: String, unique: true, required: true },
  companyId: String,
  balances: {
    EURO_EPAL: Number,
    EURO_EPAL_2: Number,
    DEMI_PALETTE: Number,
    PALETTE_PERDUE: Number
  },
  adjustments: [{
    date: Date,
    type: String,
    palletType: String,
    quantity: Number,
    reason: String,
    chequeId: String
  }],
  lastUpdated: { type: Date, default: Date.now }
}, { collection: 'pallet_ledgers' });

const DisputeSchema = new mongoose.Schema({
  disputeId: { type: String, unique: true, required: true },
  chequeId: String,
  type: String,
  initiatorId: String,
  respondentId: String,
  description: String,
  status: String,
  priority: String,
  claimedQuantity: Number,
  actualQuantity: Number,
  resolution: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
}, { collection: 'pallet_disputes' });

// Models
const Company = mongoose.model('PalletCompany', CompanySchema);
const Site = mongoose.model('PalletSite', SiteSchema);
const Cheque = mongoose.model('PalletCheque', ChequeSchema);
const Ledger = mongoose.model('PalletLedger', LedgerSchema);
const Dispute = mongoose.model('PalletDispute', DisputeSchema);

// Donnees de demonstration
const companies = [
  {
    companyId: 'COMP-IND001',
    name: 'Usine Carrefour Lyon',
    type: 'industriel',
    siret: '45678901234567',
    address: {
      street: '15 Rue de la Logistique',
      city: 'Lyon',
      postalCode: '69007',
      country: 'FR',
      coordinates: { latitude: 45.7578, longitude: 4.8320 }
    },
    contact: { email: 'logistique@carrefour-lyon.fr', phone: '+33472000001', contactName: 'Marie Dupont' },
    subscription: { active: true, plan: 'premium', startDate: new Date('2024-01-01') }
  },
  {
    companyId: 'COMP-IND002',
    name: 'Danone Production Paris',
    type: 'industriel',
    siret: '56789012345678',
    address: {
      street: '100 Boulevard Industriel',
      city: 'Evry',
      postalCode: '91000',
      country: 'FR',
      coordinates: { latitude: 48.6243, longitude: 2.4503 }
    },
    contact: { email: 'supply@danone.fr', phone: '+33164000001', contactName: 'Pierre Martin' },
    subscription: { active: true, plan: 'premium', startDate: new Date('2024-02-15') }
  },
  {
    companyId: 'COMP-TRANS001',
    name: 'Transport Express Lyon SARL',
    type: 'transporteur',
    siret: '12345678901234',
    address: {
      street: '10 Avenue des Transporteurs',
      city: 'Villeurbanne',
      postalCode: '69100',
      country: 'FR',
      coordinates: { latitude: 45.7676, longitude: 4.8798 }
    },
    contact: { email: 'contact@transport-express-lyon.fr', phone: '+33478000001', contactName: 'Jean Transporteur' },
    subscription: { active: true, plan: 'standard', startDate: new Date('2024-03-01') }
  },
  {
    companyId: 'COMP-TRANS002',
    name: 'Geodis Ile-de-France',
    type: 'transporteur',
    siret: '23456789012345',
    address: {
      street: '50 Rue du Fret',
      city: 'Rungis',
      postalCode: '94150',
      country: 'FR',
      coordinates: { latitude: 48.7469, longitude: 2.3514 }
    },
    contact: { email: 'idf@geodis.fr', phone: '+33149000001', contactName: 'Sophie Transport' },
    subscription: { active: true, plan: 'premium', startDate: new Date('2024-01-15') }
  },
  {
    companyId: 'COMP-LOG001',
    name: 'Logistique Rhone-Alpes',
    type: 'logisticien',
    siret: '98765432109876',
    address: {
      street: '25 Zone Industrielle',
      city: 'Saint-Priest',
      postalCode: '69800',
      country: 'FR',
      coordinates: { latitude: 45.6967, longitude: 4.9478 }
    },
    contact: { email: 'reception@log-rhonealpes.fr', phone: '+33472000002', contactName: 'Paul Logisticien' },
    subscription: { active: true, plan: 'premium', startDate: new Date('2024-01-01') }
  },
  {
    companyId: 'COMP-LOG002',
    name: 'FM Logistic Paris',
    type: 'logisticien',
    siret: '87654321098765',
    address: {
      street: '1 Rue du MIN',
      city: 'Rungis',
      postalCode: '94150',
      country: 'FR',
      coordinates: { latitude: 48.7489, longitude: 2.3534 }
    },
    contact: { email: 'reception@fmlogistic.fr', phone: '+33149000002', contactName: 'Claire Entrepot' },
    subscription: { active: true, plan: 'premium', startDate: new Date('2024-02-01') }
  }
];

const sites = [
  {
    siteId: 'SITE-LYO001',
    companyId: 'COMP-LOG001',
    siteName: 'Entrepot Lyon Sud',
    type: 'entrepot',
    address: {
      street: '25 Zone Industrielle',
      city: 'Saint-Priest',
      postalCode: '69800',
      country: 'FR',
      coordinates: { latitude: 45.6967, longitude: 4.9478 }
    },
    geofencing: { radius: 200, strictMode: false },
    quota: { maxDaily: 200, currentDaily: 45, maxWeekly: 1000, currentWeekly: 320 },
    capacities: { EURO_EPAL: 2000, EURO_EPAL_2: 500, DEMI_PALETTE: 300, PALETTE_PERDUE: 100 },
    openingHours: { open: '06:00', close: '20:00' },
    priority: 80,
    active: true
  },
  {
    siteId: 'SITE-LYO002',
    companyId: 'COMP-LOG001',
    siteName: 'Plateforme Lyon Est',
    type: 'plateforme',
    address: {
      street: '15 Rue de la Distribution',
      city: 'Meyzieu',
      postalCode: '69330',
      country: 'FR',
      coordinates: { latitude: 45.7667, longitude: 5.0000 }
    },
    geofencing: { radius: 150, strictMode: true },
    quota: { maxDaily: 150, currentDaily: 23, maxWeekly: 750, currentWeekly: 180 },
    capacities: { EURO_EPAL: 1500, EURO_EPAL_2: 400, DEMI_PALETTE: 200, PALETTE_PERDUE: 80 },
    openingHours: { open: '07:00', close: '19:00' },
    priority: 70,
    active: true
  },
  {
    siteId: 'SITE-PAR001',
    companyId: 'COMP-LOG002',
    siteName: 'Plateforme Paris-Rungis',
    type: 'plateforme',
    address: {
      street: '1 Rue du MIN',
      city: 'Rungis',
      postalCode: '94150',
      country: 'FR',
      coordinates: { latitude: 48.7469, longitude: 2.3514 }
    },
    geofencing: { radius: 300, strictMode: false },
    quota: { maxDaily: 500, currentDaily: 127, maxWeekly: 2500, currentWeekly: 890 },
    capacities: { EURO_EPAL: 5000, EURO_EPAL_2: 1500, DEMI_PALETTE: 800, PALETTE_PERDUE: 300 },
    openingHours: { open: '04:00', close: '22:00' },
    priority: 95,
    active: true
  },
  {
    siteId: 'SITE-PAR002',
    companyId: 'COMP-LOG002',
    siteName: 'Hub Logistique Orly',
    type: 'entrepot',
    address: {
      street: '20 Zone Cargo',
      city: 'Orly',
      postalCode: '94310',
      country: 'FR',
      coordinates: { latitude: 48.7262, longitude: 2.3652 }
    },
    geofencing: { radius: 250, strictMode: false },
    quota: { maxDaily: 300, currentDaily: 89, maxWeekly: 1500, currentWeekly: 567 },
    capacities: { EURO_EPAL: 3000, EURO_EPAL_2: 800, DEMI_PALETTE: 400, PALETTE_PERDUE: 150 },
    openingHours: { open: '05:00', close: '21:00' },
    priority: 85,
    active: true
  },
  {
    siteId: 'SITE-MAR001',
    companyId: 'COMP-LOG001',
    siteName: 'Hub Marseille Fos',
    type: 'quai',
    address: {
      street: 'Port de Fos',
      city: 'Fos-sur-Mer',
      postalCode: '13270',
      country: 'FR',
      coordinates: { latitude: 43.4344, longitude: 4.9306 }
    },
    geofencing: { radius: 500, strictMode: false },
    quota: { maxDaily: 300, currentDaily: 56, maxWeekly: 1500, currentWeekly: 234 },
    capacities: { EURO_EPAL: 3500, EURO_EPAL_2: 1000, DEMI_PALETTE: 500, PALETTE_PERDUE: 200 },
    openingHours: { open: '07:00', close: '19:00' },
    priority: 75,
    active: true
  }
];

// Generer des cheques de demonstration
function generateCheques() {
  const cheques = [];
  const palletTypes = ['EURO_EPAL', 'EURO_EPAL', 'EURO_EPAL', 'EURO_EPAL_2', 'DEMI_PALETTE'];
  const drivers = ['Jean Dupont', 'Pierre Martin', 'Marie Leroy', 'Sophie Bernard', 'Lucas Petit'];
  const plates = ['AB-123-CD', 'EF-456-GH', 'IJ-789-KL', 'MN-012-OP', 'QR-345-ST'];
  const statuses = ['EMIS', 'DEPOSE', 'RECU', 'RECU', 'RECU'];

  for (let i = 1; i <= 25; i++) {
    const dayOffset = 25 - i;
    const emittedAt = new Date(Date.now() - dayOffset * 24 * 60 * 60 * 1000);
    const statusIdx = Math.min(i % 5, 4);
    const status = statuses[statusIdx];

    const siteIdx = i % 5;
    const site = sites[siteIdx];
    const transporterIdx = i % 2;
    const transporter = transporterIdx === 0 ? companies[2] : companies[3];

    cheques.push({
      chequeId: `CHQ-DEMO${String(i).padStart(4, '0')}`,
      qrCode: `data:image/png;base64,DEMO_QR_${i}`,
      orderId: `ORD-2024${String(i).padStart(4, '0')}`,
      palletType: palletTypes[i % palletTypes.length],
      quantity: 10 + (i * 3) % 50,
      transporterId: transporter.companyId,
      transporterName: transporter.name,
      vehiclePlate: plates[i % plates.length],
      driverName: drivers[i % drivers.length],
      destinationSiteId: site.siteId,
      destinationSiteName: site.siteName,
      status: status,
      timestamps: {
        emittedAt: emittedAt,
        depositedAt: status !== 'EMIS' ? new Date(emittedAt.getTime() + 4 * 60 * 60 * 1000) : null,
        receivedAt: status === 'RECU' ? new Date(emittedAt.getTime() + 6 * 60 * 60 * 1000) : null
      },
      signatures: {
        emitter: { signature: 'demo_sig_' + i, timestamp: emittedAt }
      }
    });
  }
  return cheques;
}

// Generer les ledgers
function generateLedgers() {
  return [
    {
      ledgerId: 'LED-TRANS001',
      companyId: 'COMP-TRANS001',
      balances: { EURO_EPAL: -150, EURO_EPAL_2: -30, DEMI_PALETTE: -10, PALETTE_PERDUE: 0 },
      adjustments: [
        { date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), type: 'debit', palletType: 'EURO_EPAL', quantity: -33, reason: 'Emission cheque CHQ-DEMO0020', chequeId: 'CHQ-DEMO0020' },
        { date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), type: 'debit', palletType: 'EURO_EPAL', quantity: -45, reason: 'Emission cheque CHQ-DEMO0015', chequeId: 'CHQ-DEMO0015' },
        { date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), type: 'credit', palletType: 'EURO_EPAL', quantity: 20, reason: 'Restitution site Lyon', chequeId: null }
      ]
    },
    {
      ledgerId: 'LED-TRANS002',
      companyId: 'COMP-TRANS002',
      balances: { EURO_EPAL: -80, EURO_EPAL_2: -15, DEMI_PALETTE: -5, PALETTE_PERDUE: 0 },
      adjustments: [
        { date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), type: 'debit', palletType: 'EURO_EPAL', quantity: -28, reason: 'Emission cheque CHQ-DEMO0022', chequeId: 'CHQ-DEMO0022' },
        { date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), type: 'debit', palletType: 'EURO_EPAL_2', quantity: -15, reason: 'Emission cheque CHQ-DEMO0017', chequeId: 'CHQ-DEMO0017' }
      ]
    },
    {
      ledgerId: 'LED-LOG001',
      companyId: 'COMP-LOG001',
      balances: { EURO_EPAL: 320, EURO_EPAL_2: 85, DEMI_PALETTE: 40, PALETTE_PERDUE: 15 },
      adjustments: [
        { date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), type: 'credit', palletType: 'EURO_EPAL', quantity: 45, reason: 'Reception cheque CHQ-DEMO0023', chequeId: 'CHQ-DEMO0023' },
        { date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), type: 'credit', palletType: 'EURO_EPAL', quantity: 33, reason: 'Reception cheque CHQ-DEMO0019', chequeId: 'CHQ-DEMO0019' }
      ]
    },
    {
      ledgerId: 'LED-LOG002',
      companyId: 'COMP-LOG002',
      balances: { EURO_EPAL: 450, EURO_EPAL_2: 120, DEMI_PALETTE: 55, PALETTE_PERDUE: 20 },
      adjustments: [
        { date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), type: 'credit', palletType: 'EURO_EPAL', quantity: 52, reason: 'Reception cheque CHQ-DEMO0024', chequeId: 'CHQ-DEMO0024' },
        { date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), type: 'credit', palletType: 'EURO_EPAL_2', quantity: 28, reason: 'Reception cheque CHQ-DEMO0021', chequeId: 'CHQ-DEMO0021' }
      ]
    },
    {
      ledgerId: 'LED-IND001',
      companyId: 'COMP-IND001',
      balances: { EURO_EPAL: 50, EURO_EPAL_2: 10, DEMI_PALETTE: 5, PALETTE_PERDUE: 0 },
      adjustments: [
        { date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), type: 'credit', palletType: 'EURO_EPAL', quantity: 50, reason: 'Recuperation programmee', chequeId: null }
      ]
    }
  ];
}

// Generer des litiges de demonstration
function generateDisputes() {
  return [
    {
      disputeId: 'DISP-DEMO001',
      chequeId: 'CHQ-DEMO0010',
      type: 'quantite_incorrecte',
      initiatorId: 'COMP-LOG001',
      respondentId: 'COMP-TRANS001',
      description: 'Ecart de 5 palettes entre la quantite declaree (33) et la quantite recue (28)',
      status: 'ouvert',
      priority: 'medium',
      claimedQuantity: 33,
      actualQuantity: 28,
      resolution: null
    },
    {
      disputeId: 'DISP-DEMO002',
      chequeId: 'CHQ-DEMO0005',
      type: 'palettes_abimees',
      initiatorId: 'COMP-LOG002',
      respondentId: 'COMP-TRANS002',
      description: '8 palettes EURO EPAL presentent des dommages importants (lattes cassees)',
      status: 'proposition_emise',
      priority: 'high',
      claimedQuantity: 40,
      actualQuantity: 32,
      resolution: {
        type: 'ajustement_partiel',
        adjustedQuantity: 36,
        description: 'Acceptation de 4 palettes abimees utilisables, rejet de 4 autres',
        proposedBy: 'COMP-TRANS002',
        proposedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      }
    },
    {
      disputeId: 'DISP-DEMO003',
      chequeId: 'CHQ-DEMO0002',
      type: 'quantite_incorrecte',
      initiatorId: 'COMP-LOG001',
      respondentId: 'COMP-TRANS001',
      description: 'Difference de 2 palettes, probablement erreur de comptage',
      status: 'resolu',
      priority: 'low',
      claimedQuantity: 25,
      actualQuantity: 23,
      resolution: {
        type: 'acceptation_totale',
        adjustedQuantity: 23,
        description: 'Acceptation de la quantite recue apres verification des preuves photo',
        proposedBy: 'COMP-LOG001',
        proposedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        validatedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000)
      }
    }
  ];
}

// Fonction principale de seed
async function seedDatabase() {
  try {
    console.log('Connexion a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connecte a MongoDB');

    // Option: Nettoyer les collections existantes
    console.log('\nNettoyage des collections existantes...');
    await Company.deleteMany({});
    await Site.deleteMany({});
    await Cheque.deleteMany({});
    await Ledger.deleteMany({});
    await Dispute.deleteMany({});
    console.log('Collections nettoyees');

    // Inserer les entreprises
    console.log('\nInsertion des entreprises...');
    await Company.insertMany(companies);
    console.log(`${companies.length} entreprises inserees`);

    // Inserer les sites
    console.log('\nInsertion des sites...');
    await Site.insertMany(sites);
    console.log(`${sites.length} sites inseres`);

    // Inserer les cheques
    console.log('\nInsertion des cheques...');
    const cheques = generateCheques();
    await Cheque.insertMany(cheques);
    console.log(`${cheques.length} cheques inseres`);

    // Inserer les ledgers
    console.log('\nInsertion des ledgers...');
    const ledgers = generateLedgers();
    await Ledger.insertMany(ledgers);
    console.log(`${ledgers.length} ledgers inseres`);

    // Inserer les litiges
    console.log('\nInsertion des litiges...');
    const disputes = generateDisputes();
    await Dispute.insertMany(disputes);
    console.log(`${disputes.length} litiges inseres`);

    console.log('\n========================================');
    console.log('SEED COMPLETE!');
    console.log('========================================');
    console.log(`Entreprises: ${companies.length}`);
    console.log(`Sites: ${sites.length}`);
    console.log(`Cheques: ${cheques.length}`);
    console.log(`Ledgers: ${ledgers.length}`);
    console.log(`Litiges: ${disputes.length}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('Erreur lors du seed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Deconnexion MongoDB');
  }
}

// Executer le seed
seedDatabase();
