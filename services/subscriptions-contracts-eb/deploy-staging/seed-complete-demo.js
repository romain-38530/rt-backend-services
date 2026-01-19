/**
 * SYMPHONI.A - Complete Demo Seed Script
 *
 * Script complet pour initialiser des donnees de demonstration
 * couvrant l'ENSEMBLE du systeme et tous les univers.
 *
 * UNIVERS COUVERTS:
 * 1. TRANSPORTEUR - Carriers with different plans
 * 2. INDUSTRIEL - Industrial companies with transport needs
 * 3. LOGISTICIEN - Warehouse operators with ICPE
 *
 * MODULES COUVERTS:
 * - Authentication & Accounts
 * - Subscriptions & Plans
 * - Transport Orders (full lifecycle)
 * - e-CMR (electronic consignment notes)
 * - Carrier Referencing & Vigilance
 * - Pricing Grids (FTL, LTL, Messagerie)
 * - Planning (slots, RDV, driver check-in)
 * - AFFRET.IA (intelligent freight)
 * - Chatbot Suite (8 assistants)
 * - Logisticien Delegation & ICPE
 * - Storage Market (Bourse de Stockage)
 * - Notifications & Events
 *
 * Usage: node seed-complete-demo.js [--clean]
 *   --clean : Supprime toutes les donnees existantes avant insertion
 */

const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rt-subscriptions-contracts';
const CLEAN_BEFORE_SEED = process.argv.includes('--clean');

// ============================================
// FIXED IDS FOR TESTING
// ============================================

const IDS = {
  // === USERS ===
  userAdmin: new ObjectId('670000000000000000000001'),

  // Industriels
  industriel1: new ObjectId('670100000000000000000001'),
  industriel2: new ObjectId('670100000000000000000002'),

  // Transporteurs
  transporteur1: new ObjectId('670200000000000000000001'),
  transporteur2: new ObjectId('670200000000000000000002'),
  transporteur3: new ObjectId('670200000000000000000003'),
  transporteur4: new ObjectId('670200000000000000000004'),
  transporteurInvited: new ObjectId('670200000000000000000005'),

  // Logisticiens
  logisticien1: new ObjectId('670300000000000000000001'),
  logisticien2: new ObjectId('670300000000000000000002'),
  logisticien3: new ObjectId('670300000000000000000003'),

  // === TRANSPORT ORDERS ===
  order1: new ObjectId('670400000000000000000001'),
  order2: new ObjectId('670400000000000000000002'),
  order3: new ObjectId('670400000000000000000003'),
  order4: new ObjectId('670400000000000000000004'),
  order5: new ObjectId('670400000000000000000005'),
  order6: new ObjectId('670400000000000000000006'),
  order7: new ObjectId('670400000000000000000007'),
  order8: new ObjectId('670400000000000000000008'),
  order9: new ObjectId('670400000000000000000009'),
  order10: new ObjectId('670400000000000000000010'),

  // === E-CMR ===
  ecmr1: new ObjectId('670500000000000000000001'),
  ecmr2: new ObjectId('670500000000000000000002'),
  ecmr3: new ObjectId('670500000000000000000003'),

  // === CARRIERS (referenced) ===
  carrier1: new ObjectId('670600000000000000000001'),
  carrier2: new ObjectId('670600000000000000000002'),
  carrier3: new ObjectId('670600000000000000000003'),
  carrier4: new ObjectId('670600000000000000000004'),
  carrier5: new ObjectId('670600000000000000000005'),

  // === PRICING GRIDS ===
  grid1: new ObjectId('670700000000000000000001'),
  grid2: new ObjectId('670700000000000000000002'),
  grid3: new ObjectId('670700000000000000000003'),
  grid4: new ObjectId('670700000000000000000004'),

  // === PLANNING ===
  sitePlanning1: new ObjectId('670800000000000000000001'),
  sitePlanning2: new ObjectId('670800000000000000000002'),
  rdv1: new ObjectId('670900000000000000000001'),
  rdv2: new ObjectId('670900000000000000000002'),
  rdv3: new ObjectId('670900000000000000000003'),
  rdv4: new ObjectId('670900000000000000000004'),

  // === AFFRET.IA ===
  affretSession1: new ObjectId('670A00000000000000000001'),
  affretSession2: new ObjectId('670A00000000000000000002'),
  affretSession3: new ObjectId('670A00000000000000000003'),

  // === CHATBOT ===
  conversation1: new ObjectId('670B00000000000000000001'),
  conversation2: new ObjectId('670B00000000000000000002'),
  conversation3: new ObjectId('670B00000000000000000003'),
  conversation4: new ObjectId('670B00000000000000000004'),
  ticket1: new ObjectId('670C00000000000000000001'),
  ticket2: new ObjectId('670C00000000000000000002'),

  // === STORAGE MARKET ===
  storageCapacity1: new ObjectId('670D00000000000000000001'),
  storageNeed1: new ObjectId('670E00000000000000000001'),

  // === DOCUMENTS ===
  doc1: new ObjectId('670F00000000000000000001'),
  doc2: new ObjectId('670F00000000000000000002'),
  doc3: new ObjectId('670F00000000000000000003'),
};

// Warehouse IDs (strings)
const WAREHOUSES = {
  log1_wh1: 'WH-LOG1-001',
  log1_wh2: 'WH-LOG1-002',
  log2_wh1: 'WH-LOG2-001',
  log3_wh1: 'WH-LOG3-001',
};

// ============================================
// HELPER FUNCTIONS
// ============================================

const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
const hoursFromNow = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000);
const getISOWeek = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

// Generate random order number
const genOrderNumber = (prefix, num) => `${prefix}-${new Date().getFullYear()}-${String(num).padStart(5, '0')}`;

// ============================================
// MAIN SEED FUNCTION
// ============================================

async function seedDatabase() {
  console.log('');
  console.log('='.repeat(80));
  console.log('  SYMPHONI.A - COMPLETE DEMO SEED');
  console.log('  Covering ALL universes and modules');
  console.log('='.repeat(80));
  console.log('');

  const client = new MongoClient(MONGODB_URI);
  const passwordHash = await bcrypt.hash('Demo2024!', 10);
  const currentWeek = getISOWeek(new Date());
  const currentYear = new Date().getFullYear();

  try {
    await client.connect();
    console.log('Connected to MongoDB');
    const db = client.db();

    // ========================================
    // CLEAN IF REQUESTED
    // ========================================
    if (CLEAN_BEFORE_SEED) {
      console.log('\n[CLEAN] Suppression des donnees existantes...');
      const collections = [
        'users', 'subscriptions', 'subscription_events',
        'transport_orders', 'transport_events', 'transport_documents',
        'ecmr', 'ecmr_documents', 'signatures',
        'carriers', 'carrier_scores', 'documents',
        'pricing_grids', 'industrial_transport_configs',
        'site_plannings', 'planning_slots', 'planning_rdvs', 'driver_checkins', 'docks',
        'affretia_sessions', 'freight_offers',
        'chatbot_conversations', 'support_tickets', 'chatbot_faqs', 'knowledge_base',
        'logisticians', 'logistician_documents', 'logistician_events',
        'logistician_vigilance_alerts', 'icpe_volume_declarations',
        'storage_market_capacities', 'storage_market_needs', 'storage_market_responses',
        'notifications', 'planning_notifications'
      ];

      for (const coll of collections) {
        try {
          await db.collection(coll).deleteMany({});
        } catch (e) {
          // Collection might not exist, ignore
        }
      }
      console.log('[CLEAN] Done - ' + collections.length + ' collections cleared');
    }

    // ========================================
    // 1. USERS - ALL UNIVERSES
    // ========================================
    console.log('\n[1/15] Creation des utilisateurs (Industriels, Transporteurs, Admin)...');

    const users = [
      // Admin
      {
        _id: IDS.userAdmin,
        email: 'admin@symphonia.io',
        passwordHash,
        firstName: 'Admin',
        lastName: 'Symphonia',
        role: 'admin',
        companyName: 'RT Technologie',
        status: 'active',
        createdAt: daysAgo(365),
        lastLogin: daysAgo(1)
      },

      // Industriel 1 - ENTERPRISE plan
      {
        _id: IDS.industriel1,
        email: 'contact@acme-industries.fr',
        passwordHash,
        firstName: 'Jean',
        lastName: 'Dupont',
        role: 'industrial',
        companyName: 'ACME Industries',
        siret: '12345678900001',
        phone: '+33 1 23 45 67 89',
        address: { street: '100 Avenue de l\'Industrie', city: 'Lyon', postalCode: '69003', country: 'France' },
        status: 'active',
        subscription: {
          plan: 'ENTERPRISE',
          status: 'active',
          startDate: daysAgo(180),
          stripeCustomerId: 'cus_demo_ind1',
          features: {
            affretia: true,
            apiAccess: true,
            planningAvance: true,
            kpiTableauBord: true
          }
        },
        settings: {
          notifications: { email: true, sms: true, push: true },
          language: 'fr'
        },
        createdAt: daysAgo(365),
        lastLogin: daysAgo(0)
      },

      // Industriel 2 - PRO plan
      {
        _id: IDS.industriel2,
        email: 'logistique@techprod.com',
        passwordHash,
        firstName: 'Marie',
        lastName: 'Martin',
        role: 'industrial',
        companyName: 'TechProd SA',
        siret: '98765432100001',
        phone: '+33 4 56 78 90 12',
        address: { street: '50 Rue de la Tech', city: 'Marseille', postalCode: '13001', country: 'France' },
        status: 'active',
        subscription: {
          plan: 'PRO',
          status: 'active',
          startDate: daysAgo(90),
          stripeCustomerId: 'cus_demo_ind2'
        },
        createdAt: daysAgo(120),
        lastLogin: daysAgo(2)
      },

      // Transporteur 1 - PREMIUM plan
      {
        _id: IDS.transporteur1,
        email: 'contact@transport-martin.fr',
        passwordHash,
        firstName: 'Pierre',
        lastName: 'Martin',
        role: 'transporteur',
        companyName: 'Transport Martin SARL',
        siret: '11111111100001',
        phone: '+33 1 11 11 11 11',
        address: { street: '10 ZI Transport', city: 'Paris', postalCode: '75012', country: 'France' },
        status: 'active',
        subscription: {
          plan: 'PREMIUM',
          status: 'active',
          startDate: daysAgo(200)
        },
        fleet: {
          vehicles: 15,
          drivers: 12
        },
        transportTypes: ['FTL', 'LTL', 'ADR'],
        coverage: ['IDF', 'ARA', 'BFC', 'GES'],
        createdAt: daysAgo(300),
        lastLogin: daysAgo(0)
      },

      // Transporteur 2 - STARTER plan
      {
        _id: IDS.transporteur2,
        email: 'info@express-fret.com',
        passwordHash,
        firstName: 'Sophie',
        lastName: 'Leclerc',
        role: 'transporteur',
        companyName: 'Express Fret',
        siret: '22222222200001',
        phone: '+33 2 22 22 22 22',
        status: 'active',
        subscription: {
          plan: 'STARTER',
          status: 'active',
          startDate: daysAgo(60)
        },
        transportTypes: ['LTL', 'MESSAGERIE'],
        coverage: ['IDF', 'HDF', 'NOR'],
        createdAt: daysAgo(90),
        lastLogin: daysAgo(1)
      },

      // Transporteur 3 - BUSINESS plan (ADR specialist)
      {
        _id: IDS.transporteur3,
        email: 'contact@adr-transport.fr',
        passwordHash,
        firstName: 'Marc',
        lastName: 'Dubois',
        role: 'transporteur',
        companyName: 'ADR Transport Pro',
        siret: '33333333300001',
        phone: '+33 3 33 33 33 33',
        status: 'active',
        subscription: {
          plan: 'BUSINESS',
          status: 'active',
          startDate: daysAgo(150)
        },
        transportTypes: ['ADR', 'FTL'],
        coverage: ['ARA', 'PAC', 'OCC', 'NAQ'],
        certifications: ['ADR', 'ISO_9001'],
        createdAt: daysAgo(200),
        lastLogin: daysAgo(0)
      },

      // Transporteur 4 - GRATUIT plan (limited)
      {
        _id: IDS.transporteur4,
        email: 'contact@petit-transport.fr',
        passwordHash,
        firstName: 'Luc',
        lastName: 'Petit',
        role: 'transporteur',
        companyName: 'Petit Transport',
        siret: '44444444400001',
        status: 'active',
        subscription: {
          plan: 'GRATUIT',
          status: 'active',
          startDate: daysAgo(30),
          responsesRemaining: 5
        },
        transportTypes: ['LTL'],
        coverage: ['IDF'],
        createdAt: daysAgo(45),
        lastLogin: daysAgo(5)
      },

      // Transporteur 5 - INVITED (not onboarded)
      {
        _id: IDS.transporteurInvited,
        email: 'nouveau@transport.fr',
        role: 'transporteur',
        companyName: 'Nouveau Transport',
        status: 'invited',
        invitationToken: 'DEMO-TRANSPORT-INVITE-123',
        invitationExpiry: daysFromNow(7),
        invitedBy: IDS.industriel1,
        createdAt: daysAgo(3)
      }
    ];

    await db.collection('users').insertMany(users);
    console.log(`  + ${users.length} utilisateurs crees`);

    // ========================================
    // 2. CARRIERS (Referenced by Industrials)
    // ========================================
    console.log('\n[2/15] Creation des transporteurs references...');

    const carriers = [
      {
        _id: IDS.carrier1,
        userId: IDS.transporteur1,
        name: 'Transport Martin SARL',
        email: 'contact@transport-martin.fr',
        siret: '11111111100001',
        status: 'active',
        referenceLevel: 'HIGH_PRIORITY',
        referencedBy: [IDS.industriel1, IDS.industriel2],
        transportTypes: ['FTL', 'LTL', 'ADR'],
        coverage: {
          zones: ['IDF', 'ARA', 'BFC', 'GES'],
          countries: ['FR', 'BE', 'DE']
        },
        scoring: {
          rating: 4.7,
          completedOrders: 156,
          onTimeDelivery: 94,
          qualityScore: 92,
          responseTime: 25
        },
        vigilance: {
          status: 'compliant',
          lastCheck: daysAgo(5),
          expiresAt: daysFromNow(60)
        },
        documents: {
          kbis: { verified: true, expiresAt: daysFromNow(60) },
          urssaf: { verified: true, expiresAt: daysFromNow(45) },
          insurance: { verified: true, expiresAt: daysFromNow(200) },
          transportLicense: { verified: true, expiresAt: daysFromNow(1000) }
        },
        createdAt: daysAgo(300),
        updatedAt: daysAgo(5)
      },
      {
        _id: IDS.carrier2,
        userId: IDS.transporteur2,
        name: 'Express Fret',
        email: 'info@express-fret.com',
        siret: '22222222200001',
        status: 'active',
        referenceLevel: 'REFERENCED',
        referencedBy: [IDS.industriel1],
        transportTypes: ['LTL', 'MESSAGERIE'],
        coverage: {
          zones: ['IDF', 'HDF', 'NOR'],
          countries: ['FR']
        },
        scoring: {
          rating: 4.2,
          completedOrders: 89,
          onTimeDelivery: 88,
          qualityScore: 85,
          responseTime: 45
        },
        vigilance: { status: 'compliant', expiresAt: daysFromNow(30) },
        createdAt: daysAgo(90),
        updatedAt: daysAgo(10)
      },
      {
        _id: IDS.carrier3,
        userId: IDS.transporteur3,
        name: 'ADR Transport Pro',
        email: 'contact@adr-transport.fr',
        siret: '33333333300001',
        status: 'active',
        referenceLevel: 'HIGH_PRIORITY',
        referencedBy: [IDS.industriel1, IDS.industriel2],
        transportTypes: ['ADR', 'FTL'],
        coverage: {
          zones: ['ARA', 'PAC', 'OCC', 'NAQ'],
          countries: ['FR', 'ES', 'IT']
        },
        certifications: ['ADR', 'ISO_9001', 'OEA'],
        scoring: {
          rating: 4.9,
          completedOrders: 234,
          onTimeDelivery: 97,
          qualityScore: 98,
          responseTime: 15
        },
        vigilance: { status: 'compliant', expiresAt: daysFromNow(90) },
        createdAt: daysAgo(200),
        updatedAt: daysAgo(2)
      },
      {
        _id: IDS.carrier4,
        name: 'Frigo Express',
        email: 'contact@frigo-express.fr',
        siret: '55555555500001',
        status: 'active',
        referenceLevel: 'REFERENCED',
        referencedBy: [IDS.industriel2],
        transportTypes: ['FRIGO', 'LTL'],
        coverage: {
          zones: ['ARA', 'PAC', 'IDF'],
          countries: ['FR']
        },
        certifications: ['IFS_LOGISTICS', 'HACCP'],
        scoring: {
          rating: 4.5,
          completedOrders: 178,
          onTimeDelivery: 91,
          qualityScore: 94,
          responseTime: 30
        },
        vigilance: { status: 'warning', expiresAt: daysFromNow(15) },
        createdAt: daysAgo(150),
        updatedAt: daysAgo(7)
      },
      {
        _id: IDS.carrier5,
        name: 'Transport Eco',
        email: 'eco@transport-eco.fr',
        siret: '66666666600001',
        status: 'blocked',
        referenceLevel: 'GUEST',
        referencedBy: [IDS.industriel1],
        transportTypes: ['LTL'],
        coverage: { zones: ['IDF'], countries: ['FR'] },
        scoring: {
          rating: 3.2,
          completedOrders: 23,
          onTimeDelivery: 72,
          qualityScore: 68,
          responseTime: 120
        },
        vigilance: { status: 'blocked', expiresAt: daysAgo(10) },
        blockedReason: 'Documents expires',
        createdAt: daysAgo(100),
        updatedAt: daysAgo(10)
      }
    ];

    await db.collection('carriers').insertMany(carriers);
    console.log(`  + ${carriers.length} transporteurs references crees`);

    // ========================================
    // 3. PRICING GRIDS
    // ========================================
    console.log('\n[3/15] Creation des grilles tarifaires...');

    const pricingGrids = [
      // FTL Grid
      {
        _id: IDS.grid1,
        gridId: 'GRID-FTL-001',
        carrierId: IDS.carrier1,
        industrialId: IDS.industriel1,
        transportType: 'FTL',
        calculationType: 'FLAT_RATE',
        status: 'active',
        validFrom: daysAgo(90),
        validUntil: daysFromNow(275),
        ftlPricing: {
          flatRate: 450,
          pricePerKm: 1.2,
          minDistance: 100
        },
        zones: {
          IDF: { priceModifier: 0.95 },
          ARA: { priceModifier: 1.0 },
          PAC: { priceModifier: 1.1 }
        },
        options: {
          ADR: { multiplier: 1.4 },
          HAYON: { fixedSupplement: 35 },
          EXPRESS: { multiplier: 1.5 }
        },
        approvedBy: IDS.industriel1,
        approvalDate: daysAgo(88),
        createdAt: daysAgo(90),
        updatedAt: daysAgo(30)
      },
      // LTL Grid
      {
        _id: IDS.grid2,
        gridId: 'GRID-LTL-001',
        carrierId: IDS.carrier2,
        industrialId: IDS.industriel1,
        transportType: 'LTL',
        calculationType: 'PER_PALLET',
        status: 'active',
        validFrom: daysAgo(60),
        validUntil: daysFromNow(305),
        ltlPricing: {
          pricePerPallet: 85,
          minPalettes: 1,
          maxPalettes: 10,
          volumeDiscounts: [
            { minPalettes: 5, discount: 5 },
            { minPalettes: 10, discount: 10 }
          ]
        },
        zones: {
          IDF: { priceModifier: 0.9 },
          HDF: { priceModifier: 1.0 },
          NOR: { priceModifier: 1.05 }
        },
        options: {
          HAYON: { fixedSupplement: 25 },
          SHRINK_WRAP: { fixedSupplement: 15 }
        },
        approvedBy: IDS.industriel1,
        approvalDate: daysAgo(58),
        createdAt: daysAgo(60),
        updatedAt: daysAgo(15)
      },
      // Messagerie Grid
      {
        _id: IDS.grid3,
        gridId: 'GRID-MSG-001',
        carrierId: IDS.carrier2,
        industrialId: IDS.industriel1,
        transportType: 'MESSAGERIE',
        calculationType: 'PER_WEIGHT',
        status: 'active',
        validFrom: daysAgo(45),
        validUntil: daysFromNow(320),
        messageriePricing: {
          departments: {
            '75': { pricePer100kg: 12 },
            '76': { pricePer100kg: 15 },
            '77': { pricePer100kg: 14 },
            '78': { pricePer100kg: 13 },
            '91': { pricePer100kg: 14 },
            '92': { pricePer100kg: 12 },
            '93': { pricePer100kg: 12 },
            '94': { pricePer100kg: 12 },
            '95': { pricePer100kg: 14 }
          },
          minWeight: 30,
          maxWeight: 3000
        },
        createdAt: daysAgo(45),
        updatedAt: daysAgo(10)
      },
      // ADR Grid
      {
        _id: IDS.grid4,
        gridId: 'GRID-ADR-001',
        carrierId: IDS.carrier3,
        industrialId: IDS.industriel1,
        transportType: 'ADR',
        calculationType: 'HYBRID',
        status: 'active',
        validFrom: daysAgo(120),
        validUntil: daysFromNow(245),
        ftlPricing: {
          flatRate: 650,
          pricePerKm: 1.8
        },
        ltlPricing: {
          pricePerPallet: 150,
          minPalettes: 1
        },
        options: {
          ADR_CLASS_3: { multiplier: 1.2 },
          ADR_CLASS_6: { multiplier: 1.5 },
          ADR_CLASS_8: { multiplier: 1.4 }
        },
        createdAt: daysAgo(120),
        updatedAt: daysAgo(20)
      }
    ];

    await db.collection('pricing_grids').insertMany(pricingGrids);
    console.log(`  + ${pricingGrids.length} grilles tarifaires creees`);

    // ========================================
    // 4. TRANSPORT ORDERS (Full lifecycle)
    // ========================================
    console.log('\n[4/15] Creation des commandes de transport...');

    const transportOrders = [
      // Order 1: DELIVERED - Complete
      {
        _id: IDS.order1,
        orderId: genOrderNumber('ORD', 1),
        industrialId: IDS.industriel1,
        carrierId: IDS.carrier1,
        status: 'DELIVERED',
        transportType: 'FTL',
        pickup: {
          location: { street: '100 Avenue de l\'Industrie', city: 'Lyon', postalCode: '69003', country: 'FR' },
          datetime: daysAgo(5),
          contact: { name: 'Jean Dupont', phone: '+33 1 23 45 67 89' },
          completedAt: daysAgo(5)
        },
        delivery: {
          location: { street: '50 Rue Commerce', city: 'Paris', postalCode: '75010', country: 'FR' },
          datetime: daysAgo(4),
          contact: { name: 'Client A', phone: '+33 1 98 76 54 32' },
          completedAt: daysAgo(4)
        },
        goods: {
          description: 'Machines industrielles',
          weight: 15000,
          volume: 45,
          pallets: 20,
          transportType: 'FTL'
        },
        pricing: {
          estimatedPrice: 850,
          finalPrice: 850,
          currency: 'EUR'
        },
        tracking: {
          enabled: true,
          lastPosition: { lat: 48.8566, lon: 2.3522, timestamp: daysAgo(4) }
        },
        createdAt: daysAgo(10),
        updatedAt: daysAgo(4)
      },

      // Order 2: IN_TRANSIT
      {
        _id: IDS.order2,
        orderId: genOrderNumber('ORD', 2),
        industrialId: IDS.industriel1,
        carrierId: IDS.carrier1,
        status: 'EN_ROUTE_DELIVERY',
        transportType: 'LTL',
        pickup: {
          location: { street: '100 Avenue de l\'Industrie', city: 'Lyon', postalCode: '69003', country: 'FR' },
          datetime: daysAgo(1),
          completedAt: daysAgo(1)
        },
        delivery: {
          location: { street: '25 Boulevard Maritime', city: 'Marseille', postalCode: '13002', country: 'FR' },
          datetime: daysFromNow(0),
          eta: hoursFromNow(3)
        },
        goods: {
          description: 'Pieces detachees',
          weight: 2500,
          pallets: 8,
          transportType: 'LTL'
        },
        pricing: {
          estimatedPrice: 680,
          currency: 'EUR'
        },
        tracking: {
          enabled: true,
          lastPosition: { lat: 43.5, lon: 5.0, timestamp: new Date() }
        },
        createdAt: daysAgo(3),
        updatedAt: new Date()
      },

      // Order 3: AWAITING_ASSIGNMENT (for AFFRET.IA)
      {
        _id: IDS.order3,
        orderId: genOrderNumber('ORD', 3),
        industrialId: IDS.industriel1,
        carrierId: null,
        status: 'AWAITING_ASSIGNMENT',
        transportType: 'ADR',
        pickup: {
          location: { street: '100 Avenue de l\'Industrie', city: 'Lyon', postalCode: '69003', country: 'FR' },
          datetime: daysFromNow(3)
        },
        delivery: {
          location: { street: '80 Zone Industrielle', city: 'Bordeaux', postalCode: '33000', country: 'FR' },
          datetime: daysFromNow(4)
        },
        goods: {
          description: 'Produits chimiques classe 8',
          weight: 8000,
          pallets: 16,
          adrClass: '8',
          transportType: 'ADR'
        },
        pricing: {
          estimatedPrice: 1200,
          currency: 'EUR'
        },
        affretiaTriggered: true,
        affretiaSessionId: IDS.affretSession1,
        createdAt: daysAgo(1),
        updatedAt: new Date()
      },

      // Order 4: NEW
      {
        _id: IDS.order4,
        orderId: genOrderNumber('ORD', 4),
        industrialId: IDS.industriel1,
        status: 'NEW',
        transportType: 'MESSAGERIE',
        pickup: {
          location: { city: 'Lyon', postalCode: '69003', country: 'FR' },
          datetime: daysFromNow(2)
        },
        delivery: {
          location: { city: 'Lille', postalCode: '59000', country: 'FR' },
          datetime: daysFromNow(3)
        },
        goods: {
          description: 'Colis divers',
          weight: 450,
          packages: 12,
          transportType: 'MESSAGERIE'
        },
        pricing: { estimatedPrice: 180, currency: 'EUR' },
        createdAt: hoursFromNow(-2),
        updatedAt: new Date()
      },

      // Order 5: ACCEPTED (by carrier)
      {
        _id: IDS.order5,
        orderId: genOrderNumber('ORD', 5),
        industrialId: IDS.industriel2,
        carrierId: IDS.carrier3,
        status: 'ACCEPTED',
        transportType: 'FTL',
        pickup: {
          location: { city: 'Marseille', postalCode: '13001', country: 'FR' },
          datetime: daysFromNow(1)
        },
        delivery: {
          location: { city: 'Nice', postalCode: '06000', country: 'FR' },
          datetime: daysFromNow(1)
        },
        goods: {
          description: 'Equipements electroniques',
          weight: 12000,
          pallets: 26,
          transportType: 'FTL'
        },
        pricing: { estimatedPrice: 450, finalPrice: 420, currency: 'EUR' },
        carrierResponse: {
          acceptedAt: daysAgo(1),
          proposedPrice: 420,
          notes: 'Disponible avec un vehicule 19T'
        },
        createdAt: daysAgo(2),
        updatedAt: daysAgo(1)
      },

      // Order 6: TRACKING_STARTED (with warehouse)
      {
        _id: IDS.order6,
        orderId: genOrderNumber('ORD', 6),
        industrialId: IDS.industriel1,
        carrierId: IDS.carrier1,
        status: 'TRACKING_STARTED',
        transportType: 'LTL',
        pickup: {
          type: 'warehouse',
          warehouseId: WAREHOUSES.log1_wh1,
          logisticianId: IDS.logisticien1,
          location: { city: 'Lyon', postalCode: '69100', country: 'FR' },
          datetime: daysFromNow(0)
        },
        delivery: {
          type: 'client',
          location: { city: 'Grenoble', postalCode: '38000', country: 'FR' },
          datetime: daysFromNow(0)
        },
        goods: {
          description: 'Palettes produits finis',
          weight: 3500,
          pallets: 10,
          transportType: 'LTL'
        },
        pricing: { estimatedPrice: 320, currency: 'EUR' },
        tracking: { enabled: true },
        createdAt: daysAgo(2),
        updatedAt: new Date()
      },

      // Order 7: DOCUMENTS_PENDING
      {
        _id: IDS.order7,
        orderId: genOrderNumber('ORD', 7),
        industrialId: IDS.industriel2,
        carrierId: IDS.carrier4,
        status: 'DOCUMENTS_PENDING',
        transportType: 'FRIGO',
        pickup: {
          location: { city: 'Rungis', postalCode: '94150', country: 'FR' },
          datetime: daysAgo(2),
          completedAt: daysAgo(2)
        },
        delivery: {
          location: { city: 'Lyon', postalCode: '69003', country: 'FR' },
          datetime: daysAgo(1),
          completedAt: daysAgo(1)
        },
        goods: {
          description: 'Produits frais',
          weight: 5000,
          pallets: 12,
          temperature: { min: 2, max: 8 },
          transportType: 'FRIGO'
        },
        pricing: { finalPrice: 580, currency: 'EUR' },
        ecmrId: IDS.ecmr2,
        createdAt: daysAgo(5),
        updatedAt: daysAgo(1)
      },

      // Order 8: For Logisticien 2 (delivery)
      {
        _id: IDS.order8,
        orderId: genOrderNumber('ORD', 8),
        industrialId: IDS.industriel2,
        carrierId: IDS.carrier1,
        status: 'ACCEPTED',
        transportType: 'LTL',
        pickup: {
          type: 'supplier',
          location: { city: 'Milan', country: 'IT' },
          datetime: daysFromNow(2)
        },
        delivery: {
          type: 'warehouse',
          warehouseId: WAREHOUSES.log2_wh1,
          logisticianId: IDS.logisticien2,
          location: { city: 'Marseille', postalCode: '13002', country: 'FR' },
          datetime: daysFromNow(3)
        },
        goods: {
          description: 'Composants importes',
          weight: 6000,
          pallets: 15,
          transportType: 'LTL'
        },
        pricing: { estimatedPrice: 780, currency: 'EUR' },
        createdAt: daysAgo(1),
        updatedAt: new Date()
      },

      // Order 9: CLOSED (scored)
      {
        _id: IDS.order9,
        orderId: genOrderNumber('ORD', 9),
        industrialId: IDS.industriel1,
        carrierId: IDS.carrier1,
        status: 'CLOSED',
        transportType: 'FTL',
        pickup: {
          location: { city: 'Lyon', postalCode: '69003', country: 'FR' },
          datetime: daysAgo(10),
          completedAt: daysAgo(10)
        },
        delivery: {
          location: { city: 'Strasbourg', postalCode: '67000', country: 'FR' },
          datetime: daysAgo(9),
          completedAt: daysAgo(9)
        },
        goods: { description: 'Lot complet', weight: 18000, pallets: 33 },
        pricing: { finalPrice: 920, currency: 'EUR' },
        scoring: {
          rating: 5,
          onTime: true,
          qualityScore: 100,
          comment: 'Excellent service, livraison parfaite'
        },
        ecmrId: IDS.ecmr1,
        createdAt: daysAgo(15),
        updatedAt: daysAgo(8),
        closedAt: daysAgo(8)
      },

      // Order 10: CANCELLED
      {
        _id: IDS.order10,
        orderId: genOrderNumber('ORD', 10),
        industrialId: IDS.industriel2,
        carrierId: null,
        status: 'CANCELLED',
        transportType: 'LTL',
        pickup: {
          location: { city: 'Marseille', postalCode: '13001', country: 'FR' },
          datetime: daysAgo(5)
        },
        delivery: {
          location: { city: 'Montpellier', postalCode: '34000', country: 'FR' },
          datetime: daysAgo(4)
        },
        goods: { description: 'Commande annulee', weight: 2000, pallets: 5 },
        cancellation: {
          reason: 'Client a annule la commande',
          cancelledBy: IDS.industriel2,
          cancelledAt: daysAgo(6)
        },
        createdAt: daysAgo(8),
        updatedAt: daysAgo(6)
      }
    ];

    await db.collection('transport_orders').insertMany(transportOrders);
    console.log(`  + ${transportOrders.length} commandes de transport creees`);

    // ========================================
    // 5. E-CMR (Electronic Consignment Notes)
    // ========================================
    console.log('\n[5/15] Creation des e-CMR...');

    const ecmrs = [
      // CMR 1: SIGNED (complete)
      {
        _id: IDS.ecmr1,
        cmrNumber: 'CMR-2024-00001',
        transportOrderId: IDS.order9,
        status: 'SIGNED',
        sender: {
          type: 'COMPANY',
          name: 'ACME Industries',
          siret: '12345678900001',
          address: { street: '100 Avenue de l\'Industrie', postalCode: '69003', city: 'Lyon', country: 'FR' },
          contact: { name: 'Jean Dupont', phone: '+33 1 23 45 67 89', email: 'contact@acme-industries.fr' }
        },
        consignee: {
          type: 'COMPANY',
          name: 'Client Strasbourg',
          address: { street: '50 Rue du Commerce', postalCode: '67000', city: 'Strasbourg', country: 'FR' },
          contact: { name: 'Marc Muller', phone: '+33 3 88 00 00 00' }
        },
        carrier: {
          name: 'Transport Martin SARL',
          siret: '11111111100001',
          licenseNumber: 'LIC-2024-001',
          vehicle: { plate: 'AB-123-CD', type: 'Semi-remorque' },
          driver: { name: 'Pierre Martin', license: 'DRIVER-001' }
        },
        goods: {
          description: 'Lot complet machines industrielles',
          weight: 18000,
          packages: 33,
          nature: 'Equipements industriels'
        },
        signatures: [
          { party: 'SENDER', status: 'SIGNED', signedAt: daysAgo(10), signedBy: 'Jean Dupont' },
          { party: 'CARRIER', status: 'SIGNED', signedAt: daysAgo(10), signedBy: 'Pierre Martin' },
          { party: 'CONSIGNEE', status: 'SIGNED', signedAt: daysAgo(9), signedBy: 'Marc Muller' }
        ],
        remarks: {
          loading: 'Chargement OK, 33 palettes',
          delivery: 'Livraison conforme, aucune reserve'
        },
        createdAt: daysAgo(10),
        updatedAt: daysAgo(9),
        completedAt: daysAgo(9)
      },

      // CMR 2: PENDING_SIGNATURES
      {
        _id: IDS.ecmr2,
        cmrNumber: 'CMR-2024-00002',
        transportOrderId: IDS.order7,
        status: 'PENDING_SIGNATURES',
        sender: {
          type: 'COMPANY',
          name: 'TechProd SA',
          siret: '98765432100001',
          address: { postalCode: '94150', city: 'Rungis', country: 'FR' }
        },
        consignee: {
          type: 'COMPANY',
          name: 'Client Lyon',
          address: { postalCode: '69003', city: 'Lyon', country: 'FR' }
        },
        carrier: {
          name: 'Frigo Express',
          siret: '55555555500001'
        },
        goods: {
          description: 'Produits frais temperature controlee',
          weight: 5000,
          packages: 12,
          nature: 'Alimentaire',
          temperature: { min: 2, max: 8 }
        },
        signatures: [
          { party: 'SENDER', status: 'SIGNED', signedAt: daysAgo(2) },
          { party: 'CARRIER', status: 'SIGNED', signedAt: daysAgo(2) },
          { party: 'CONSIGNEE', status: 'PENDING' }
        ],
        createdAt: daysAgo(2),
        updatedAt: daysAgo(1)
      },

      // CMR 3: DRAFT
      {
        _id: IDS.ecmr3,
        cmrNumber: 'CMR-2024-00003',
        transportOrderId: IDS.order5,
        status: 'DRAFT',
        sender: {
          type: 'COMPANY',
          name: 'TechProd SA',
          address: { postalCode: '13001', city: 'Marseille', country: 'FR' }
        },
        consignee: {
          type: 'COMPANY',
          name: 'Client Nice',
          address: { postalCode: '06000', city: 'Nice', country: 'FR' }
        },
        carrier: {
          name: 'ADR Transport Pro',
          siret: '33333333300001'
        },
        goods: {
          description: 'Equipements electroniques',
          weight: 12000,
          packages: 26
        },
        signatures: [
          { party: 'SENDER', status: 'PENDING' },
          { party: 'CARRIER', status: 'PENDING' },
          { party: 'CONSIGNEE', status: 'PENDING' }
        ],
        createdAt: daysAgo(1),
        updatedAt: new Date()
      }
    ];

    await db.collection('ecmr').insertMany(ecmrs);
    console.log(`  + ${ecmrs.length} e-CMR crees`);

    // ========================================
    // 6. LOGISTICIENS (Delegation System)
    // ========================================
    console.log('\n[6/15] Creation des logisticiens...');

    const logisticiens = [
      // Logisticien 1: Active, 2 entrepots
      {
        _id: IDS.logisticien1,
        email: 'logistique-durand@demo.io',
        passwordHash,
        companyName: 'Entrepots Durand SARL',
        siret: '77777777700001',
        vatNumber: 'FR77777777701',
        phone: '+33 4 72 00 00 01',
        address: { street: '15 Rue de la Logistique', city: 'Lyon', postalCode: '69007', country: 'France' },
        status: 'active',
        vigilanceStatus: 'compliant',
        industrialClients: [
          {
            industrialId: IDS.industriel1,
            industrialName: 'ACME Industries',
            invitedAt: daysAgo(180),
            activatedAt: daysAgo(175),
            status: 'active',
            delegationType: 'full'
          },
          {
            industrialId: IDS.industriel2,
            industrialName: 'TechProd SA',
            invitedAt: daysAgo(90),
            activatedAt: daysAgo(85),
            status: 'active',
            delegationType: 'partial',
            delegatedSites: ['Site Marseille']
          }
        ],
        warehouses: [
          {
            warehouseId: WAREHOUSES.log1_wh1,
            name: 'Entrepot Lyon Nord',
            address: { street: '100 ZI Nord', city: 'Lyon', postalCode: '69100', country: 'France' },
            gpsCoordinates: { lat: 45.7833, lng: 4.8333 },
            surface: 15000,
            dockCount: 12,
            icpeStatus: 'enregistrement',
            icpeRubriques: [
              { rubrique: '1510', libelle: 'Entrepot couvert', regime: 'E', seuilMax: 5000, unite: 'tonnes' },
              { rubrique: '2662', libelle: 'Stockage de polymeres', regime: 'E', seuilMax: 2000, unite: 'tonnes' }
            ],
            icpeNumero: 'ICPE-69-2024-0001',
            certifications: ['ISO 9001', 'OEA'],
            constraints: ['ADR', 'Frigo'],
            isActive: true
          },
          {
            warehouseId: WAREHOUSES.log1_wh2,
            name: 'Entrepot Lyon Sud',
            address: { street: '50 ZI Sud', city: 'Lyon', postalCode: '69200', country: 'France' },
            surface: 8000,
            dockCount: 6,
            icpeStatus: 'declaration',
            icpeRubriques: [
              { rubrique: '1510', libelle: 'Entrepot couvert', regime: 'D', seuilMax: 800, unite: 'tonnes' }
            ],
            isActive: true
          }
        ],
        contacts: [
          { type: 'direction', firstName: 'Jean', lastName: 'Durand', email: 'j.durand@entrepots-durand.fr', phone: '+33 6 00 00 00 01', isMain: true },
          { type: 'exploitation', firstName: 'Marie', lastName: 'Martin', email: 'm.martin@entrepots-durand.fr', warehouseId: WAREHOUSES.log1_wh1 }
        ],
        subscription: {
          type: 'free',
          paidOptions: {
            bourseDeStockage: { active: true, activatedAt: daysAgo(60) },
            borneAccueilChauffeur: { active: false }
          }
        },
        score: 92,
        lastLogin: daysAgo(1),
        createdAt: daysAgo(180),
        updatedAt: new Date()
      },

      // Logisticien 2: Active, SEVESO site, alertes ICPE
      {
        _id: IDS.logisticien2,
        email: 'stock-express@demo.io',
        passwordHash,
        companyName: 'Stock Express',
        siret: '88888888800001',
        phone: '+33 4 91 00 00 01',
        address: { street: '200 Avenue du Port', city: 'Marseille', postalCode: '13002', country: 'France' },
        status: 'active',
        vigilanceStatus: 'warning',
        industrialClients: [
          {
            industrialId: IDS.industriel2,
            industrialName: 'TechProd SA',
            invitedAt: daysAgo(120),
            activatedAt: daysAgo(110),
            status: 'active',
            delegationType: 'full'
          }
        ],
        warehouses: [
          {
            warehouseId: WAREHOUSES.log2_wh1,
            name: 'Entrepot Marseille Port',
            address: { street: '200 Quai du Port', city: 'Marseille', postalCode: '13002', country: 'France' },
            gpsCoordinates: { lat: 43.2965, lng: 5.3698 },
            surface: 25000,
            dockCount: 20,
            icpeStatus: 'autorisation',
            icpeRubriques: [
              { rubrique: '1510', libelle: 'Entrepot couvert', regime: 'A', seuilMax: 10000, unite: 'tonnes' },
              { rubrique: '4331', libelle: 'Liquides inflammables (cat 2)', regime: 'A', seuilMax: 150, unite: 'tonnes' }
            ],
            icpeNumero: 'ICPE-13-2022-0123',
            certifications: ['ISO 9001', 'ISO 14001', 'OEA', 'IFS Logistics'],
            constraints: ['ADR', 'SEVESO SB'],
            isActive: true
          }
        ],
        subscription: {
          type: 'free',
          paidOptions: {
            bourseDeStockage: { active: true, activatedAt: daysAgo(30) },
            borneAccueilChauffeur: { active: true, activatedAt: daysAgo(30) }
          }
        },
        score: 78,
        lastLogin: daysAgo(0),
        createdAt: daysAgo(120),
        updatedAt: new Date()
      },

      // Logisticien 3: Active, simple
      {
        _id: IDS.logisticien3,
        email: 'log-simple@demo.io',
        passwordHash,
        companyName: 'Logistique Simple',
        siret: '99999999900001',
        status: 'active',
        vigilanceStatus: 'compliant',
        industrialClients: [
          {
            industrialId: IDS.industriel1,
            industrialName: 'ACME Industries',
            invitedAt: daysAgo(60),
            activatedAt: daysAgo(55),
            status: 'active',
            delegationType: 'partial',
            delegatedSites: ['Usine Paris']
          }
        ],
        warehouses: [
          {
            warehouseId: WAREHOUSES.log3_wh1,
            name: 'Entrepot Paris Est',
            address: { city: 'Paris', postalCode: '75012', country: 'France' },
            surface: 5000,
            dockCount: 4,
            icpeStatus: 'declaration',
            icpeRubriques: [
              { rubrique: '1510', regime: 'D', seuilMax: 600, unite: 'tonnes' }
            ],
            isActive: true
          }
        ],
        subscription: { type: 'free', paidOptions: {} },
        score: 85,
        createdAt: daysAgo(60),
        updatedAt: daysAgo(10)
      }
    ];

    await db.collection('logisticians').insertMany(logisticiens);
    console.log(`  + ${logisticiens.length} logisticiens crees`);

    // ========================================
    // 7. ICPE DECLARATIONS
    // ========================================
    console.log('\n[7/15] Creation des declarations ICPE...');

    const icpeDeclarations = [
      // Logisticien 1, Lyon Nord - Semaine actuelle (warning 84%)
      {
        logisticianId: IDS.logisticien1,
        warehouseId: WAREHOUSES.log1_wh1,
        weekNumber: currentWeek,
        year: currentYear,
        declaredAt: daysAgo(2),
        declaredBy: 'logistique-durand@demo.io',
        volumes: [
          { rubrique: '1510', libelle: 'Entrepot couvert', volume: 4200, unite: 'tonnes', seuilMax: 5000, percentageUsed: 84, alertLevel: 'warning' },
          { rubrique: '2662', libelle: 'Stockage de polymeres', volume: 1100, unite: 'tonnes', seuilMax: 2000, percentageUsed: 55, alertLevel: 'ok' }
        ],
        status: 'submitted'
      },
      // Logisticien 1, Lyon Nord - Semaine precedente
      {
        logisticianId: IDS.logisticien1,
        warehouseId: WAREHOUSES.log1_wh1,
        weekNumber: currentWeek - 1,
        year: currentYear,
        declaredAt: daysAgo(9),
        declaredBy: 'logistique-durand@demo.io',
        volumes: [
          { rubrique: '1510', volume: 3800, seuilMax: 5000, percentageUsed: 76, alertLevel: 'ok' },
          { rubrique: '2662', volume: 950, seuilMax: 2000, percentageUsed: 47.5, alertLevel: 'ok' }
        ],
        status: 'validated',
        validatedAt: daysAgo(7)
      },
      // Logisticien 2, Marseille - Semaine actuelle (CRITICAL 92%)
      {
        logisticianId: IDS.logisticien2,
        warehouseId: WAREHOUSES.log2_wh1,
        weekNumber: currentWeek,
        year: currentYear,
        declaredAt: daysAgo(1),
        declaredBy: 'stock-express@demo.io',
        volumes: [
          { rubrique: '1510', libelle: 'Entrepot couvert', volume: 9200, unite: 'tonnes', seuilMax: 10000, percentageUsed: 92, alertLevel: 'critical' },
          { rubrique: '4331', libelle: 'Liquides inflammables', volume: 85, unite: 'tonnes', seuilMax: 150, percentageUsed: 56.7, alertLevel: 'ok' }
        ],
        status: 'submitted',
        notes: 'Pic activite fin annee'
      }
    ];

    await db.collection('icpe_volume_declarations').insertMany(icpeDeclarations);
    console.log(`  + ${icpeDeclarations.length} declarations ICPE creees`);

    // ========================================
    // 8. LOGISTICIEN VIGILANCE ALERTS
    // ========================================
    console.log('\n[8/15] Creation des alertes vigilance...');

    const vigilanceAlerts = [
      // Document expiring soon
      {
        logisticianId: IDS.logisticien2,
        industrialId: IDS.industriel2,
        documentType: 'urssaf',
        alertType: 'document_expiring_15',
        severity: 'warning',
        title: 'Attestation URSSAF expire dans 10 jours',
        message: 'Veuillez renouveler votre attestation URSSAF.',
        isResolved: false,
        autoBlockAt: daysFromNow(10),
        createdAt: daysAgo(5)
      },
      // ICPE threshold warning
      {
        logisticianId: IDS.logisticien1,
        warehouseId: WAREHOUSES.log1_wh1,
        alertType: 'icpe_seuil_warning',
        severity: 'warning',
        rubrique: '1510',
        title: 'Seuil ICPE 1510 - 84%',
        message: 'Volume proche du seuil autorise.',
        isResolved: false,
        createdAt: daysAgo(2)
      },
      // ICPE threshold critical
      {
        logisticianId: IDS.logisticien2,
        warehouseId: WAREHOUSES.log2_wh1,
        alertType: 'icpe_seuil_critical',
        severity: 'critical',
        rubrique: '1510',
        title: 'URGENT: Seuil ICPE 1510 - 92%',
        message: 'Action immediate requise. Seuil proche du maximum autorise.',
        actionRequired: true,
        isResolved: false,
        createdAt: daysAgo(1)
      }
    ];

    await db.collection('logistician_vigilance_alerts').insertMany(vigilanceAlerts);
    console.log(`  + ${vigilanceAlerts.length} alertes vigilance creees`);

    // ========================================
    // 9. PLANNING (Sites, Slots, RDV)
    // ========================================
    console.log('\n[9/15] Creation du planning (sites, slots, RDV)...');

    // Site Plannings
    const sitePlannings = [
      {
        _id: IDS.sitePlanning1,
        sitePlanningId: 'PLAN-IND1-SITE1',
        industrialId: IDS.industriel1,
        siteId: 'SITE-LYON-001',
        siteName: 'Usine Lyon',
        siteType: 'factory',
        address: { city: 'Lyon', postalCode: '69003', country: 'FR' },
        operatingHours: {
          monday: { open: '06:00', close: '20:00' },
          tuesday: { open: '06:00', close: '20:00' },
          wednesday: { open: '06:00', close: '20:00' },
          thursday: { open: '06:00', close: '20:00' },
          friday: { open: '06:00', close: '18:00' },
          saturday: { open: '08:00', close: '12:00' }
        },
        docks: [
          { dockId: 'DOCK-A1', name: 'Quai A1', flowType: 'loading', capacity: 2 },
          { dockId: 'DOCK-A2', name: 'Quai A2', flowType: 'loading', capacity: 2 },
          { dockId: 'DOCK-B1', name: 'Quai B1', flowType: 'delivery', capacity: 3 },
          { dockId: 'DOCK-B2', name: 'Quai B2', flowType: 'delivery', capacity: 3 }
        ],
        slotGeneration: {
          duration: 60,
          bufferBetweenSlots: 15,
          maxVehiclesPerSlot: 2
        },
        createdAt: daysAgo(200),
        updatedAt: daysAgo(30)
      },
      {
        _id: IDS.sitePlanning2,
        sitePlanningId: 'PLAN-IND2-SITE1',
        industrialId: IDS.industriel2,
        siteId: 'SITE-MARSEILLE-001',
        siteName: 'Site Marseille',
        siteType: 'warehouse',
        address: { city: 'Marseille', postalCode: '13001', country: 'FR' },
        operatingHours: {
          monday: { open: '07:00', close: '19:00' },
          tuesday: { open: '07:00', close: '19:00' },
          wednesday: { open: '07:00', close: '19:00' },
          thursday: { open: '07:00', close: '19:00' },
          friday: { open: '07:00', close: '17:00' }
        },
        docks: [
          { dockId: 'DOCK-1', name: 'Quai 1', flowType: 'loading', capacity: 1 },
          { dockId: 'DOCK-2', name: 'Quai 2', flowType: 'delivery', capacity: 2 }
        ],
        slotGeneration: { duration: 45, bufferBetweenSlots: 10 },
        createdAt: daysAgo(100),
        updatedAt: daysAgo(15)
      }
    ];

    await db.collection('site_plannings').insertMany(sitePlannings);

    // Planning Slots
    const slots = [];
    const baseDate = new Date();
    baseDate.setHours(8, 0, 0, 0);

    for (let day = 0; day < 5; day++) {
      for (let hour = 8; hour < 18; hour++) {
        const slotDate = new Date(baseDate);
        slotDate.setDate(slotDate.getDate() + day);
        slotDate.setHours(hour, 0, 0, 0);

        slots.push({
          slotId: `SLOT-${day}-${hour}`,
          sitePlanningId: IDS.sitePlanning1,
          status: hour < 12 && day === 0 ? 'RESERVED' : 'AVAILABLE',
          startTime: new Date(slotDate),
          endTime: new Date(slotDate.getTime() + 60 * 60 * 1000),
          dockId: hour % 2 === 0 ? 'DOCK-A1' : 'DOCK-B1',
          flowType: hour % 2 === 0 ? 'loading' : 'delivery',
          maxCapacity: 2,
          currentReservations: hour < 12 && day === 0 ? 1 : 0,
          createdAt: daysAgo(30)
        });
      }
    }

    await db.collection('planning_slots').insertMany(slots);

    // RDVs
    const rdvs = [
      {
        _id: IDS.rdv1,
        rdvId: 'RDV-001',
        status: 'CONFIRMED',
        sitePlanningId: IDS.sitePlanning1,
        slotId: 'SLOT-0-9',
        transportOrderId: IDS.order6,
        carrierId: IDS.carrier1,
        driverInfo: { name: 'Pierre Martin', phone: '+33 6 11 22 33 44', vehicle: 'AB-123-CD' },
        requestedAt: daysAgo(2),
        confirmedAt: daysAgo(1),
        scheduledDate: new Date(baseDate.getTime() + 60 * 60 * 1000), // Today 9:00
        dockAssigned: 'DOCK-A1',
        flowType: 'loading',
        estimatedDuration: 60,
        createdAt: daysAgo(2),
        updatedAt: daysAgo(1)
      },
      {
        _id: IDS.rdv2,
        rdvId: 'RDV-002',
        status: 'CHECKED_IN',
        sitePlanningId: IDS.sitePlanning1,
        slotId: 'SLOT-0-10',
        transportOrderId: IDS.order2,
        carrierId: IDS.carrier1,
        driverInfo: { name: 'Pierre Martin', phone: '+33 6 11 22 33 44' },
        requestedAt: daysAgo(3),
        confirmedAt: daysAgo(2),
        arrivedAt: hoursFromNow(-1),
        scheduledDate: new Date(baseDate.getTime() + 2 * 60 * 60 * 1000), // Today 10:00
        dockAssigned: 'DOCK-B1',
        flowType: 'delivery',
        createdAt: daysAgo(3),
        updatedAt: hoursFromNow(-1)
      },
      {
        _id: IDS.rdv3,
        rdvId: 'RDV-003',
        status: 'REQUESTED',
        sitePlanningId: IDS.sitePlanning1,
        transportOrderId: IDS.order4,
        requestedSlot: { date: daysFromNow(2), timeWindow: '08:00-12:00' },
        requestedAt: hoursFromNow(-2),
        createdAt: hoursFromNow(-2),
        updatedAt: hoursFromNow(-2)
      },
      {
        _id: IDS.rdv4,
        rdvId: 'RDV-004',
        status: 'COMPLETED',
        sitePlanningId: IDS.sitePlanning1,
        transportOrderId: IDS.order1,
        carrierId: IDS.carrier1,
        confirmedAt: daysAgo(6),
        arrivedAt: daysAgo(5),
        operationStartTime: daysAgo(5),
        operationEndTime: daysAgo(5),
        departedAt: daysAgo(5),
        completedAt: daysAgo(5),
        actualDuration: 55,
        createdAt: daysAgo(7),
        updatedAt: daysAgo(5)
      }
    ];

    await db.collection('planning_rdvs').insertMany(rdvs);

    // Driver Check-ins
    const driverCheckins = [
      {
        rdvId: IDS.rdv2,
        driverId: 'DRIVER-001',
        vehicleId: 'AB-123-CD',
        status: 'checked_in',
        checkInMode: 'app_geofence',
        geolocation: { lat: 45.76, lon: 4.84, accuracy: 15 },
        checkInTime: hoursFromNow(-1),
        dockAssignedAt: hoursFromNow(-0.5),
        estimatedWaitTime: 15,
        createdAt: hoursFromNow(-1)
      },
      {
        rdvId: IDS.rdv4,
        driverId: 'DRIVER-001',
        vehicleId: 'AB-123-CD',
        status: 'checked_out',
        checkInMode: 'qr_code',
        checkInTime: daysAgo(5),
        dockAssignedAt: daysAgo(5),
        operationStartTime: daysAgo(5),
        operationEndTime: daysAgo(5),
        checkOutTime: daysAgo(5),
        actualWaitTime: 10,
        createdAt: daysAgo(5)
      }
    ];

    await db.collection('driver_checkins').insertMany(driverCheckins);
    console.log(`  + ${sitePlannings.length} sites, ${slots.length} slots, ${rdvs.length} RDV, ${driverCheckins.length} check-ins`);

    // ========================================
    // 10. AFFRET.IA SESSIONS
    // ========================================
    console.log('\n[10/15] Creation des sessions AFFRET.IA...');

    const affretSessions = [
      // Session 1: In progress (shortlist ready)
      {
        _id: IDS.affretSession1,
        sessionId: 'AFFRET-001',
        status: 'SHORTLIST_READY',
        triggerType: 'ASSIGNMENT_CHAIN_FAILURE',
        triggerReason: 'Aucun transporteur reference disponible pour ADR',
        transportOrderId: IDS.order3,
        transportData: {
          origin: { city: 'Lyon', postalCode: '69003', lat: 45.76, lon: 4.84 },
          destination: { city: 'Bordeaux', postalCode: '33000', lat: 44.84, lon: -0.58 },
          goods: { description: 'Produits chimiques classe 8', weight: 8000, transportType: 'ADR' }
        },
        analysis: {
          requiredCarriers: 5,
          estimatedPrice: 1200,
          negotiationMargin: 15,
          maxCounterOffer: 1380
        },
        shortlist: [
          { carrierId: IDS.carrier3, carrierName: 'ADR Transport Pro', score: 95, estimatedPrice: 1150, coverage: true },
          { carrierId: new ObjectId(), carrierName: 'Chimie Transport', score: 88, estimatedPrice: 1280, coverage: true },
          { carrierId: new ObjectId(), carrierName: 'Hazmat Express', score: 82, estimatedPrice: 1350, coverage: true }
        ],
        broadcast: { email: true, marketplace: true, sms: false },
        responses: [],
        createdAt: daysAgo(1),
        updatedAt: new Date()
      },

      // Session 2: Completed successfully
      {
        _id: IDS.affretSession2,
        sessionId: 'AFFRET-002',
        status: 'COMPLETED',
        triggerType: 'INTERNAL_TIMEOUT',
        triggerReason: 'Transporteurs references n\'ont pas repondu sous 2h',
        transportOrderId: IDS.order9,
        transportData: {
          origin: { city: 'Lyon', postalCode: '69003' },
          destination: { city: 'Strasbourg', postalCode: '67000' },
          goods: { description: 'Lot complet', weight: 18000, transportType: 'FTL' }
        },
        analysis: {
          requiredCarriers: 3,
          estimatedPrice: 900,
          negotiationMargin: 10
        },
        shortlist: [
          { carrierId: IDS.carrier1, carrierName: 'Transport Martin SARL', score: 92, estimatedPrice: 920 }
        ],
        responses: [
          { carrierId: IDS.carrier1, responseType: 'accept', proposedPrice: 920, respondedAt: daysAgo(12) }
        ],
        selectedCarrierId: IDS.carrier1,
        selectedPrice: 920,
        autoNegotiationApplied: false,
        createdAt: daysAgo(15),
        updatedAt: daysAgo(12),
        completedAt: daysAgo(12)
      },

      // Session 3: No responses (failed)
      {
        _id: IDS.affretSession3,
        sessionId: 'AFFRET-003',
        status: 'NO_RESPONSES',
        triggerType: 'MANUAL_ACTIVATION',
        triggerReason: 'Activation manuelle par dispatcher',
        transportOrderId: IDS.order10,
        transportData: {
          origin: { city: 'Marseille', postalCode: '13001' },
          destination: { city: 'Montpellier', postalCode: '34000' },
          goods: { description: 'Commande annulee', weight: 2000, transportType: 'LTL' }
        },
        shortlist: [
          { carrierId: IDS.carrier2, carrierName: 'Express Fret', score: 78, estimatedPrice: 280 }
        ],
        responses: [
          { carrierId: IDS.carrier2, responseType: 'timeout', respondedAt: null }
        ],
        failureReason: 'Aucune reponse des transporteurs dans le delai imparti',
        createdAt: daysAgo(8),
        updatedAt: daysAgo(7),
        failedAt: daysAgo(7)
      }
    ];

    await db.collection('affretia_sessions').insertMany(affretSessions);
    console.log(`  + ${affretSessions.length} sessions AFFRET.IA creees`);

    // ========================================
    // 11. CHATBOT CONVERSATIONS & TICKETS
    // ========================================
    console.log('\n[11/15] Creation des conversations chatbot...');

    const conversations = [
      // Conversation 1: Resolved by bot (STANDARD)
      {
        _id: IDS.conversation1,
        conversationId: 'CONV-001',
        userId: IDS.transporteur2,
        userRole: 'transporteur',
        chatbotType: 'routier',
        status: 'resolved',
        priority: 3,
        messages: [
          { type: 'user', content: 'Comment consulter mes grilles tarifaires?', timestamp: daysAgo(3) },
          { type: 'bot', content: 'Pour consulter vos grilles tarifaires, rendez-vous dans le menu "Tarifs" puis "Mes Grilles". Vous y trouverez toutes vos grilles actives et en attente.', metadata: { intent: 'pricing_grids_help', confidence: 0.95 }, timestamp: daysAgo(3) },
          { type: 'user', content: 'Merci, j\'ai trouve!', timestamp: daysAgo(3) },
          { type: 'bot', content: 'Parfait! N\'hesitez pas si vous avez d\'autres questions.', timestamp: daysAgo(3) }
        ],
        feedback: { rating: 5, comment: 'Reponse rapide et claire', submittedAt: daysAgo(3) },
        createdAt: daysAgo(3),
        updatedAt: daysAgo(3),
        closedAt: daysAgo(3)
      },

      // Conversation 2: Escalated to ticket (IMPORTANT)
      {
        _id: IDS.conversation2,
        conversationId: 'CONV-002',
        userId: IDS.industriel1,
        userRole: 'industrial',
        chatbotType: 'planif_ia',
        status: 'transferred',
        priority: 2,
        messages: [
          { type: 'user', content: 'Je n\'arrive pas a creer un RDV pour demain', timestamp: daysAgo(2) },
          { type: 'bot', content: 'Je comprends votre probleme. Pouvez-vous me preciser quel site est concerne?', timestamp: daysAgo(2) },
          { type: 'user', content: 'Usine Lyon, je recois une erreur "slot indisponible"', timestamp: daysAgo(2) },
          { type: 'bot', content: 'Je verifie... Il semble que tous les creneaux de demain sont reserves. Je vous transfère vers un technicien pour trouver une solution.', timestamp: daysAgo(2) },
          { type: 'system', content: 'Conversation transferee au support technique - Ticket #TKT-001', timestamp: daysAgo(2) }
        ],
        escalatedToTicket: IDS.ticket1,
        createdAt: daysAgo(2),
        updatedAt: daysAgo(2)
      },

      // Conversation 3: Active (in progress)
      {
        _id: IDS.conversation3,
        conversationId: 'CONV-003',
        userId: IDS.logisticien1,
        userRole: 'logistics',
        chatbotType: 'quai_wms',
        status: 'active',
        priority: 3,
        messages: [
          { type: 'user', content: 'Comment declarer mes volumes ICPE?', timestamp: hoursFromNow(-2) },
          { type: 'bot', content: 'Pour declarer vos volumes ICPE hebdomadaires, allez dans "ICPE" > "Declaration". Selectionnez l\'entrepot et renseignez les volumes par rubrique.', timestamp: hoursFromNow(-2) },
          { type: 'user', content: 'Et si je depasse le seuil?', timestamp: hoursFromNow(-1) }
        ],
        createdAt: hoursFromNow(-2),
        updatedAt: hoursFromNow(-1)
      },

      // Conversation 4: Critical - immediate escalation
      {
        _id: IDS.conversation4,
        conversationId: 'CONV-004',
        userId: IDS.transporteur1,
        userRole: 'transporteur',
        chatbotType: 'helpbot',
        status: 'transferred',
        priority: 1,
        messages: [
          { type: 'user', content: 'URGENT: Je ne peux plus acceder a l\'application, erreur 500 partout!', timestamp: hoursFromNow(-4) },
          { type: 'system', content: 'Probleme critique detecte. Transfert immediat au support.', timestamp: hoursFromNow(-4) }
        ],
        escalatedToTicket: IDS.ticket2,
        createdAt: hoursFromNow(-4),
        updatedAt: hoursFromNow(-4)
      }
    ];

    await db.collection('chatbot_conversations').insertMany(conversations);

    // Support Tickets
    const tickets = [
      {
        _id: IDS.ticket1,
        ticketId: 'TKT-001',
        conversationId: IDS.conversation2,
        userId: IDS.industriel1,
        priority: 2,
        status: 'resolved',
        subject: 'Impossible de creer RDV - slots indisponibles',
        category: 'planning',
        assignedTo: 'tech1@symphonia.io',
        slaExpiresAt: daysAgo(1),
        resolution: {
          action: 'Ajout de creneaux supplementaires pour le site Lyon',
          resolvedBy: 'tech1@symphonia.io',
          resolvedAt: daysAgo(1)
        },
        createdAt: daysAgo(2),
        updatedAt: daysAgo(1),
        resolvedAt: daysAgo(1)
      },
      {
        _id: IDS.ticket2,
        ticketId: 'TKT-002',
        conversationId: IDS.conversation4,
        userId: IDS.transporteur1,
        priority: 1,
        status: 'in_progress',
        subject: 'Erreur 500 - Acces impossible',
        category: 'technical',
        assignedTo: 'tech2@symphonia.io',
        slaExpiresAt: hoursFromNow(1),
        createdAt: hoursFromNow(-4),
        updatedAt: hoursFromNow(-2)
      }
    ];

    await db.collection('support_tickets').insertMany(tickets);

    // FAQs
    const faqs = [
      {
        question: 'Comment ajouter un transporteur a mon reseau?',
        answer: 'Allez dans "Transporteurs" > "Inviter". Renseignez l\'email du transporteur et il recevra une invitation pour rejoindre votre reseau.',
        category: 'carrier_management',
        chatbotTypes: ['planif_ia', 'helpbot'],
        views: 156,
        helpful: 142,
        createdAt: daysAgo(180)
      },
      {
        question: 'Comment fonctionne le scoring transporteur?',
        answer: 'Le score est calcule sur 4 criteres: ponctualite (40%), qualite (30%), reactivite (20%), et documents (10%). Il est mis a jour apres chaque livraison.',
        category: 'scoring',
        chatbotTypes: ['planif_ia', 'routier'],
        views: 89,
        helpful: 78,
        createdAt: daysAgo(150)
      },
      {
        question: 'Qu\'est-ce que l\'ICPE?',
        answer: 'L\'ICPE (Installation Classee pour la Protection de l\'Environnement) est une reglementation francaise pour les entrepots. Vous devez declarer vos volumes hebdomadaires par rubrique.',
        category: 'icpe',
        chatbotTypes: ['quai_wms', 'helpbot'],
        views: 234,
        helpful: 210,
        createdAt: daysAgo(120)
      }
    ];

    await db.collection('chatbot_faqs').insertMany(faqs);
    console.log(`  + ${conversations.length} conversations, ${tickets.length} tickets, ${faqs.length} FAQs`);

    // ========================================
    // 12. STORAGE MARKET (Bourse de Stockage)
    // ========================================
    console.log('\n[12/15] Creation du marche de stockage...');

    const storageCapacities = [
      {
        _id: IDS.storageCapacity1,
        logisticianId: IDS.logisticien1,
        warehouseId: WAREHOUSES.log1_wh1,
        warehouseName: 'Entrepot Lyon Nord',
        status: 'active',
        storageType: 'TEMPORARY',
        availableCapacity: {
          value: 500,
          unit: 'PALLETS',
          availableFrom: new Date(),
          availableUntil: daysFromNow(90)
        },
        pricing: {
          pricePerUnit: 3.5,
          currency: 'EUR',
          billingPeriod: 'day'
        },
        certifications: ['ISO_9001', 'OEA'],
        services: ['inventory_management', 'order_picking', 'labeling'],
        constraints: ['ADR', 'temperature_controlled'],
        location: { city: 'Lyon', region: 'ARA', country: 'FR' },
        createdAt: daysAgo(30),
        updatedAt: daysAgo(5)
      }
    ];

    const storageNeeds = [
      {
        _id: IDS.storageNeed1,
        industrialId: IDS.industriel2,
        status: 'open',
        storageType: 'TEMPORARY',
        requiredCapacity: {
          value: 200,
          unit: 'PALLETS',
          startDate: daysFromNow(7),
          endDate: daysFromNow(37)
        },
        requirements: {
          certifications: ['ISO_9001'],
          services: ['inventory_management'],
          constraints: []
        },
        preferredRegions: ['ARA', 'PAC'],
        budget: {
          maxPricePerUnit: 4,
          currency: 'EUR'
        },
        responses: [
          {
            logisticianId: IDS.logisticien1,
            capacityId: IDS.storageCapacity1,
            proposedPrice: 3.5,
            availableCapacity: 300,
            responseDate: daysAgo(2),
            status: 'pending'
          }
        ],
        createdAt: daysAgo(5),
        updatedAt: daysAgo(2)
      }
    ];

    await db.collection('storage_market_capacities').insertMany(storageCapacities);
    await db.collection('storage_market_needs').insertMany(storageNeeds);
    console.log(`  + ${storageCapacities.length} capacites, ${storageNeeds.length} besoins stockage`);

    // ========================================
    // 13. DOCUMENTS (Vigilance)
    // ========================================
    console.log('\n[13/15] Creation des documents vigilance...');

    const documents = [
      // Logisticien 1 documents
      {
        _id: IDS.doc1,
        logisticianId: IDS.logisticien1,
        documentType: 'kbis',
        fileName: 'kbis_durand_2024.pdf',
        s3Key: 'logisticians/doc1/kbis.pdf',
        status: 'verified',
        expiresAt: daysFromNow(60),
        uploadedAt: daysAgo(30),
        verifiedAt: daysAgo(28),
        verifiedBy: 'admin@symphonia.io'
      },
      {
        _id: IDS.doc2,
        logisticianId: IDS.logisticien1,
        documentType: 'urssaf',
        fileName: 'urssaf_durand_q4.pdf',
        s3Key: 'logisticians/doc1/urssaf.pdf',
        status: 'verified',
        expiresAt: daysFromNow(45),
        uploadedAt: daysAgo(45),
        verifiedAt: daysAgo(43),
        verifiedBy: 'admin@symphonia.io'
      },
      // Logisticien 2 documents (expiring soon)
      {
        _id: IDS.doc3,
        logisticianId: IDS.logisticien2,
        documentType: 'urssaf',
        fileName: 'urssaf_stock_express.pdf',
        s3Key: 'logisticians/doc2/urssaf.pdf',
        status: 'verified',
        expiresAt: daysFromNow(10), // Expiring soon!
        uploadedAt: daysAgo(80),
        verifiedAt: daysAgo(78),
        verifiedBy: 'admin@symphonia.io'
      }
    ];

    await db.collection('logistician_documents').insertMany(documents);
    console.log(`  + ${documents.length} documents vigilance crees`);

    // ========================================
    // 14. NOTIFICATIONS & EVENTS
    // ========================================
    console.log('\n[14/15] Creation des notifications et evenements...');

    const notifications = [
      {
        userId: IDS.industriel1,
        type: 'order_status',
        title: 'Commande livree',
        message: 'La commande ORD-001 a ete livree avec succes.',
        orderId: IDS.order1,
        read: true,
        createdAt: daysAgo(4)
      },
      {
        userId: IDS.industriel1,
        type: 'carrier_response',
        title: 'Reponse transporteur',
        message: 'Transport Martin a accepte la commande ORD-005.',
        orderId: IDS.order5,
        carrierId: IDS.carrier3,
        read: false,
        createdAt: daysAgo(1)
      },
      {
        userId: IDS.logisticien2,
        type: 'icpe_alert',
        title: 'Alerte ICPE critique',
        message: 'Seuil ICPE rubrique 1510 atteint a 92%.',
        severity: 'critical',
        read: false,
        createdAt: daysAgo(1)
      },
      {
        userId: IDS.transporteur1,
        type: 'affretia_request',
        title: 'Nouvelle demande de fret',
        message: 'Vous etes selectionne pour une demande ADR Lyon-Bordeaux.',
        sessionId: IDS.affretSession1,
        read: false,
        createdAt: new Date()
      }
    ];

    const logisticianEvents = [
      { logisticianId: IDS.logisticien1, type: 'invited', payload: { industrialName: 'ACME Industries' }, timestamp: daysAgo(180) },
      { logisticianId: IDS.logisticien1, type: 'validated', payload: {}, timestamp: daysAgo(175) },
      { logisticianId: IDS.logisticien1, type: 'option_activated', payload: { option: 'bourseDeStockage', price: 150 }, timestamp: daysAgo(60) },
      { logisticianId: IDS.logisticien1, type: 'icpe_volume_declared', payload: { warehouseId: WAREHOUSES.log1_wh1, weekNumber: currentWeek }, timestamp: daysAgo(2) },
      { logisticianId: IDS.logisticien2, type: 'invited', payload: { industrialName: 'TechProd SA' }, timestamp: daysAgo(120) },
      { logisticianId: IDS.logisticien2, type: 'validated', payload: {}, timestamp: daysAgo(110) },
      { logisticianId: IDS.logisticien2, type: 'icpe_volume_declared', payload: { warehouseId: WAREHOUSES.log2_wh1, weekNumber: currentWeek, alertCount: 1 }, timestamp: daysAgo(1) },
      { logisticianId: IDS.logisticien1, type: 'login', payload: { ip: '192.168.1.1' }, timestamp: daysAgo(1) },
      { logisticianId: IDS.logisticien2, type: 'login', payload: { ip: '192.168.1.2' }, timestamp: new Date() }
    ];

    await db.collection('notifications').insertMany(notifications);
    await db.collection('logistician_events').insertMany(logisticianEvents.map(e => ({ ...e, createdAt: e.timestamp })));
    console.log(`  + ${notifications.length} notifications, ${logisticianEvents.length} evenements`);

    // ========================================
    // 15. SUMMARY
    // ========================================
    console.log('\n[15/15] Verification finale...');

    const counts = {
      users: await db.collection('users').countDocuments(),
      carriers: await db.collection('carriers').countDocuments(),
      pricingGrids: await db.collection('pricing_grids').countDocuments(),
      transportOrders: await db.collection('transport_orders').countDocuments(),
      ecmr: await db.collection('ecmr').countDocuments(),
      logisticians: await db.collection('logisticians').countDocuments(),
      icpeDeclarations: await db.collection('icpe_volume_declarations').countDocuments(),
      vigilanceAlerts: await db.collection('logistician_vigilance_alerts').countDocuments(),
      sitePlannings: await db.collection('site_plannings').countDocuments(),
      planningSlots: await db.collection('planning_slots').countDocuments(),
      planningRdvs: await db.collection('planning_rdvs').countDocuments(),
      driverCheckins: await db.collection('driver_checkins').countDocuments(),
      affretSessions: await db.collection('affretia_sessions').countDocuments(),
      conversations: await db.collection('chatbot_conversations').countDocuments(),
      tickets: await db.collection('support_tickets').countDocuments(),
      faqs: await db.collection('chatbot_faqs').countDocuments(),
      storageCapacities: await db.collection('storage_market_capacities').countDocuments(),
      storageNeeds: await db.collection('storage_market_needs').countDocuments(),
      documents: await db.collection('logistician_documents').countDocuments(),
      notifications: await db.collection('notifications').countDocuments()
    };

    console.log('');
    console.log('='.repeat(80));
    console.log('  SEED COMPLETE - SYMPHONI.A DEMO DATA');
    console.log('='.repeat(80));
    console.log('');
    console.log('  UNIVERS COUVERTS:');
    console.log('');
    console.log('  1. TRANSPORTEURS (Carriers)');
    console.log(`     - ${counts.users - 5} comptes transporteur (GRATUIT, STARTER, PREMIUM, BUSINESS)`);
    console.log(`     - ${counts.carriers} transporteurs references`);
    console.log(`     - ${counts.pricingGrids} grilles tarifaires (FTL, LTL, Messagerie, ADR)`);
    console.log('');
    console.log('  2. INDUSTRIELS (Shippers)');
    console.log('     - 2 comptes industriel (PRO, ENTERPRISE)');
    console.log(`     - ${counts.transportOrders} commandes de transport (tous statuts)`);
    console.log(`     - ${counts.ecmr} e-CMR (DRAFT, PENDING, SIGNED)`);
    console.log(`     - ${counts.sitePlannings} sites planifies`);
    console.log(`     - ${counts.planningSlots} creneaux, ${counts.planningRdvs} RDV`);
    console.log('');
    console.log('  3. LOGISTICIENS (Warehouse Operators)');
    console.log(`     - ${counts.logisticians} logisticiens (actifs, ICPE)`);
    console.log(`     - ${counts.icpeDeclarations} declarations ICPE (warning 84%, critical 92%)`);
    console.log(`     - ${counts.vigilanceAlerts} alertes vigilance`);
    console.log(`     - ${counts.documents} documents vigilance`);
    console.log('');
    console.log('  MODULES IA:');
    console.log(`     - ${counts.affretSessions} sessions AFFRET.IA`);
    console.log(`     - ${counts.conversations} conversations chatbot`);
    console.log(`     - ${counts.tickets} tickets support (SLA)`);
    console.log(`     - ${counts.faqs} FAQs`);
    console.log('');
    console.log('  MARCHE STOCKAGE:');
    console.log(`     - ${counts.storageCapacities} capacites publiees`);
    console.log(`     - ${counts.storageNeeds} besoins exprimes`);
    console.log('');
    console.log('='.repeat(80));
    console.log('  COMPTES DE TEST (mot de passe: Demo2024!)');
    console.log('='.repeat(80));
    console.log('');
    console.log('  ADMIN:');
    console.log('    - admin@symphonia.io');
    console.log('');
    console.log('  INDUSTRIELS:');
    console.log('    - contact@acme-industries.fr (ENTERPRISE)');
    console.log('    - logistique@techprod.com (PRO)');
    console.log('');
    console.log('  TRANSPORTEURS:');
    console.log('    - contact@transport-martin.fr (PREMIUM, flotte 15 vehicules)');
    console.log('    - info@express-fret.com (STARTER)');
    console.log('    - contact@adr-transport.fr (BUSINESS, specialiste ADR)');
    console.log('    - contact@petit-transport.fr (GRATUIT, 5 reponses restantes)');
    console.log('');
    console.log('  LOGISTICIENS:');
    console.log('    - logistique-durand@demo.io (actif, 2 entrepots, Bourse Stockage)');
    console.log('    - stock-express@demo.io (actif, SEVESO, alertes ICPE 92%)');
    console.log('    - log-simple@demo.io (actif, basique)');
    console.log('');
    console.log('='.repeat(80));
    console.log('  SCENARIOS DE TEST DISPONIBLES');
    console.log('='.repeat(80));
    console.log('');
    console.log('  1. CYCLE COMMANDE COMPLET');
    console.log('     - Voir commandes a tous les statuts (NEW -> CLOSED)');
    console.log('     - Tester affectation transporteur');
    console.log('     - Suivre tracking en temps reel');
    console.log('');
    console.log('  2. AFFRET.IA');
    console.log('     - Session en cours: ADR Lyon-Bordeaux (shortlist prete)');
    console.log('     - Session complete: FTL Lyon-Strasbourg');
    console.log('     - Session echouee: pas de reponse');
    console.log('');
    console.log('  3. PLANNING & RDV');
    console.log('     - RDV confirme (aujourd\'hui 9h)');
    console.log('     - Chauffeur en check-in (aujourd\'hui 10h)');
    console.log('     - Demande RDV en attente');
    console.log('');
    console.log('  4. E-CMR');
    console.log('     - CMR signe (complet)');
    console.log('     - CMR en attente signature destinataire');
    console.log('     - CMR brouillon');
    console.log('');
    console.log('  5. ICPE & VIGILANCE');
    console.log('     - Alerte warning 84% (Lyon Nord)');
    console.log('     - Alerte critique 92% (Marseille Port)');
    console.log('     - Document expire dans 10 jours');
    console.log('');
    console.log('  6. CHATBOT & SUPPORT');
    console.log('     - Conversation resolue par bot');
    console.log('     - Ticket escalade (priority 2, resolu)');
    console.log('     - Ticket critique en cours (priority 1)');
    console.log('');
    console.log('  7. BOURSE DE STOCKAGE');
    console.log('     - Capacite publiee: 500 palettes Lyon');
    console.log('     - Besoin en attente: 200 palettes ARA/PAC');
    console.log('');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('ERREUR:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\nConnexion MongoDB fermee');
  }
}

// Execution
seedDatabase();
