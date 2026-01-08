/**
 * SYMPHONI.A - Script de Reset et Seed des donnees de demo COMPLET
 *
 * Ce script:
 * 1. Supprime toutes les donnees de demo existantes (GARDE les leads B2P/CRM)
 * 2. Recree un scenario complet demontrant TOUTES les fonctionnalites:
 *    - Univers Industriel complet
 *    - Univers Transporteur avec Dashboard B2P
 *    - Univers Logisticien avec ICPE et delegation
 *    - AFFRET.IA (recherche autonome, bourse, propositions)
 *    - e-CMR electronique avec signatures
 *    - Plan de transport consolide
 *    - Auto-dispatch intelligent
 *    - Grilles tarifaires multi-zones
 *    - Gestion d'equipe et permissions
 *    - Scoring et vigilance transporteurs
 *    - KPIs et analytics
 *    - Tracking temps reel
 *    - Gestion palettes circulaires
 *    - Rendez-vous transporteurs
 *    - ICPE (conformite environnementale)
 *    - Prefacturation et facturation
 *
 * Usage: node scripts/reset-and-seed-demo.js
 */

import { MongoClient, ObjectId } from 'mongodb';

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-technologie?retryWrites=true&w=majority&appName=StagingRT';
const DB_NAME = 'rt-technologie';

// Couleurs console
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function main() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    log('green', '=== Connexion MongoDB etablie ===\n');

    const db = client.db(DB_NAME);
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // ============================================
    // ETAPE 1: SUPPRESSION DES DONNEES (sauf leads B2P)
    // ============================================
    log('yellow', '>>> ETAPE 1: Suppression des donnees de demo (conservation leads B2P)...\n');

    const collectionsToClean = [
      'orders', 'shipments', 'dispatches', 'dispatch_logs',
      'ecmr', 'ecmr_documents', 'ecmr_signatures',
      'affretia_sessions', 'affretia_proposals', 'carrier_proposals', 'affretia_broadcasts',
      'tracking_events', 'tracking_positions', 'geofence_events',
      'notifications', 'notification_preferences',
      'appointments', 'slots', 'planning_events',
      'pricing_quotes', 'invoices', 'invoice_lines', 'payments', 'prefactures',
      'palettes', 'palette_movements', 'palette_accounts',
      'kpis', 'carrier_scores', 'vigilance_checks', 'vigilance_documents',
      'icpe_declarations', 'icpe_reports', 'icpe_alerts',
      'delegations', 'delegation_requests',
      'pricing_grids', 'pricing_zones', 'pricing_rules',
      'transport_plans', 'transport_lanes', 'lane_assignments',
      'team_invitations',
      'audit_logs',
      'chat_messages', 'chat_sessions'
    ];

    for (const collName of collectionsToClean) {
      try {
        const result = await db.collection(collName).deleteMany({});
        if (result.deletedCount > 0) {
          log('cyan', `  - ${collName}: ${result.deletedCount} documents supprimes`);
        }
      } catch (e) {
        // Collection inexistante, on ignore
      }
    }

    // Supprimer organisations et users de demo
    const demoSlugs = ['acme-industries', 'techparts-manufacturing', 'trans-express', 'logispeed-transport', 'rapidfret-express', 'logistock-entrepots', 'globalfreight-transit'];
    const demoEmails = ['demo.industrie@symphonia.com', 'logistique@acme-industries.fr', 'comptabilite@acme-industries.fr', 'demo.transporteur@symphonia.com', 'dispatch@trans-express.fr', 'michel.bernard@trans-express.fr', 'paul.petit@trans-express.fr', 'demo.logisticien@symphonia.com', 'icpe@logistock.fr', 'rdv@logistock.fr', 'admin@logispeed.fr'];

    const orgsDeleted = await db.collection('organizations').deleteMany({ slug: { $in: demoSlugs } });
    if (orgsDeleted.deletedCount > 0) {
      log('cyan', `  - organizations: ${orgsDeleted.deletedCount} documents supprimes`);
    }
    const usersDeleted = await db.collection('users').deleteMany({ email: { $in: demoEmails } });
    if (usersDeleted.deletedCount > 0) {
      log('cyan', `  - users: ${usersDeleted.deletedCount} documents supprimes`);
    }

    log('green', '\n>>> Donnees de demo supprimees (leads B2P conserves)!\n');

    // ============================================
    // ETAPE 2: ORGANISATIONS DE DEMO
    // ============================================
    log('yellow', '>>> ETAPE 2: Creation des organisations...\n');

    const orgs = {
      industry: {
        _id: new ObjectId(),
        name: 'ACME Industries',
        slug: 'acme-industries',
        type: 'industry',
        siret: '12345678901234',
        vatNumber: 'FR12345678901',
        address: {
          street: '123 Avenue de l\'Industrie',
          city: 'Lyon',
          postalCode: '69001',
          country: 'France',
          lat: 45.764043,
          lng: 4.835659
        },
        contact: {
          email: 'contact@acme-industries.fr',
          phone: '+33 4 72 00 00 01'
        },
        vigilance: {
          status: 'verified',
          lastCheck: new Date('2024-12-15'),
          kbis: { valid: true, expiry: new Date('2025-12-31') },
          insurance: { valid: true, amount: 2000000, expiry: new Date('2025-06-30') },
          licenses: []
        },
        subscription: {
          plan: 'enterprise',
          status: 'active',
          features: ['affretia', 'ecmr', 'planning', 'billing', 'api', 'analytics']
        },
        settings: {
          autoDispatch: true,
          affretiaEnabled: true,
          bourseEnabled: true,
          ecmrDigital: true
        },
        createdAt: new Date('2023-01-15'),
        updatedAt: now
      },
      industry2: {
        _id: new ObjectId(),
        name: 'TechParts Manufacturing',
        slug: 'techparts-manufacturing',
        type: 'industry',
        siret: '98765432109876',
        address: {
          street: '45 Rue de la Mecanique',
          city: 'Grenoble',
          postalCode: '38000',
          country: 'France',
          lat: 45.188529,
          lng: 5.724524
        },
        subscription: { plan: 'pro', status: 'active' },
        createdAt: new Date('2024-02-01'),
        updatedAt: now
      },
      transporter1: {
        _id: new ObjectId(),
        name: 'Trans Express SARL',
        slug: 'trans-express',
        type: 'transporter',
        siret: '11111111111111',
        vatNumber: 'FR11111111111',
        address: {
          street: '56 Zone Industrielle',
          city: 'Villeurbanne',
          postalCode: '69100',
          country: 'France',
          lat: 45.766667,
          lng: 4.883333
        },
        contact: {
          email: 'contact@trans-express.fr',
          phone: '+33 4 78 00 00 01'
        },
        fleet: {
          vehicles: 15,
          drivers: 18,
          vehicleTypes: ['semi', 'porteur', 'fourgon']
        },
        vigilance: {
          status: 'verified',
          lastCheck: new Date('2024-11-20'),
          kbis: { valid: true, expiry: new Date('2025-11-30') },
          insurance: { valid: true, amount: 5000000, expiry: new Date('2025-03-31') },
          licenses: [
            { type: 'transport_lourd', number: 'TL-2024-001', expiry: new Date('2026-12-31') }
          ]
        },
        subscription: {
          plan: 'enterprise',
          status: 'active',
          features: ['b2p', 'ecmr', 'tracking', 'bourse', 'proposals']
        },
        score: {
          global: 4.5,
          ponctualite: 4.7,
          qualite: 4.3,
          communication: 4.5,
          totalMissions: 156
        },
        createdAt: new Date('2022-06-15'),
        updatedAt: now
      },
      transporter2: {
        _id: new ObjectId(),
        name: 'LogiSpeed Transport',
        slug: 'logispeed-transport',
        type: 'transporter',
        siret: '22222222222222',
        address: {
          street: '78 Avenue du Transport',
          city: 'Saint-Etienne',
          postalCode: '42000',
          country: 'France'
        },
        fleet: { vehicles: 8, drivers: 10 },
        vigilance: { status: 'verified' },
        subscription: { plan: 'pro', status: 'active' },
        score: { global: 4.2, totalMissions: 89 },
        createdAt: new Date('2023-03-01'),
        updatedAt: now
      },
      transporter3: {
        _id: new ObjectId(),
        name: 'RapidFret Express',
        slug: 'rapidfret-express',
        type: 'transporter',
        siret: '33333333333333',
        address: {
          street: '12 Rue du Fret',
          city: 'Marseille',
          postalCode: '13001',
          country: 'France'
        },
        fleet: { vehicles: 25, drivers: 30 },
        vigilance: { status: 'verified' },
        subscription: { plan: 'enterprise', status: 'active' },
        score: { global: 4.8, totalMissions: 245 },
        createdAt: new Date('2021-09-01'),
        updatedAt: now
      },
      logistician: {
        _id: new ObjectId(),
        name: 'LogiStock Entrepots',
        slug: 'logistock-entrepots',
        type: 'logistician',
        siret: '44444444444444',
        vatNumber: 'FR44444444444',
        address: {
          street: '200 Zone Logistique',
          city: 'Venissieux',
          postalCode: '69200',
          country: 'France',
          lat: 45.705,
          lng: 4.886
        },
        contact: {
          email: 'contact@logistock.fr',
          phone: '+33 4 72 00 00 02'
        },
        warehouses: [
          {
            name: 'Entrepot A - ICPE',
            address: '200 Zone Logistique, 69200 Venissieux',
            surface: 15000,
            icpeStatus: 'authorized',
            icpeNumber: 'ICPE-69-2024-001'
          },
          {
            name: 'Entrepot B - Standard',
            address: '202 Zone Logistique, 69200 Venissieux',
            surface: 8000
          }
        ],
        vigilance: {
          status: 'verified',
          lastCheck: new Date('2024-10-15'),
          kbis: { valid: true },
          insurance: { valid: true, amount: 3000000 }
        },
        subscription: {
          plan: 'enterprise',
          status: 'active',
          features: ['icpe', 'delegation', 'rdv', 'palettes', 'billing']
        },
        createdAt: new Date('2023-03-01'),
        updatedAt: now
      },
      forwarder: {
        _id: new ObjectId(),
        name: 'GlobalFreight Transit',
        slug: 'globalfreight-transit',
        type: 'forwarder',
        siret: '55555555555555',
        address: {
          street: '1 Place du Commerce',
          city: 'Paris',
          postalCode: '75001',
          country: 'France'
        },
        subscription: { plan: 'pro', status: 'active' },
        createdAt: new Date('2024-03-01'),
        updatedAt: now
      }
    };

    for (const [key, org] of Object.entries(orgs)) {
      await db.collection('organizations').insertOne(org);
      log('cyan', `  - ${org.name} (${org.type})`);
    }

    log('green', '\n>>> Organisations creees!\n');

    // ============================================
    // ETAPE 3: UTILISATEURS
    // ============================================
    log('yellow', '>>> ETAPE 3: Creation des utilisateurs...\n');

    const users = {
      industryAdmin: {
        _id: new ObjectId(),
        email: 'demo.industrie@symphonia.com',
        firstName: 'Marie',
        lastName: 'Dupont',
        role: 'admin',
        organizationId: orgs.industry._id,
        organizationType: 'industry',
        permissions: ['all'],
        isActive: true,
        lastLogin: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        createdAt: new Date('2024-01-15')
      },
      industryLogistics: {
        _id: new ObjectId(),
        email: 'logistique@acme-industries.fr',
        firstName: 'Pierre',
        lastName: 'Martin',
        role: 'logistics_manager',
        organizationId: orgs.industry._id,
        organizationType: 'industry',
        permissions: ['orders.manage', 'carriers.view', 'tracking.view', 'ecmr.sign'],
        isActive: true,
        createdAt: new Date('2024-02-01')
      },
      industryViewer: {
        _id: new ObjectId(),
        email: 'comptabilite@acme-industries.fr',
        firstName: 'Claire',
        lastName: 'Durand',
        role: 'viewer',
        organizationId: orgs.industry._id,
        organizationType: 'industry',
        permissions: ['orders.view', 'invoices.view', 'kpis.view'],
        isActive: true,
        createdAt: new Date('2024-03-15')
      },
      transporterAdmin: {
        _id: new ObjectId(),
        email: 'demo.transporteur@symphonia.com',
        firstName: 'Jean',
        lastName: 'Durand',
        role: 'admin',
        organizationId: orgs.transporter1._id,
        organizationType: 'transporter',
        permissions: ['all'],
        isActive: true,
        lastLogin: new Date(now.getTime() - 1 * 60 * 60 * 1000),
        createdAt: new Date('2023-06-01')
      },
      transporterDispatch: {
        _id: new ObjectId(),
        email: 'dispatch@trans-express.fr',
        firstName: 'Lucas',
        lastName: 'Bernard',
        role: 'dispatcher',
        organizationId: orgs.transporter1._id,
        organizationType: 'transporter',
        permissions: ['missions.manage', 'drivers.manage', 'proposals.create'],
        isActive: true,
        createdAt: new Date('2023-08-01')
      },
      driver1: {
        _id: new ObjectId(),
        email: 'michel.bernard@trans-express.fr',
        firstName: 'Michel',
        lastName: 'Bernard',
        role: 'driver',
        organizationId: orgs.transporter1._id,
        organizationType: 'transporter',
        phone: '+33612345678',
        vehicleId: 'VH001',
        vehiclePlate: 'AB-123-CD',
        permissions: ['missions.view', 'ecmr.sign', 'tracking.update'],
        isActive: true,
        createdAt: new Date('2023-06-15')
      },
      driver2: {
        _id: new ObjectId(),
        email: 'paul.petit@trans-express.fr',
        firstName: 'Paul',
        lastName: 'Petit',
        role: 'driver',
        organizationId: orgs.transporter1._id,
        organizationType: 'transporter',
        phone: '+33698765432',
        vehicleId: 'VH002',
        vehiclePlate: 'EF-456-GH',
        isActive: true,
        createdAt: new Date('2023-09-01')
      },
      logisticianAdmin: {
        _id: new ObjectId(),
        email: 'demo.logisticien@symphonia.com',
        firstName: 'Sophie',
        lastName: 'Leroy',
        role: 'admin',
        organizationId: orgs.logistician._id,
        organizationType: 'logistician',
        permissions: ['all'],
        isActive: true,
        lastLogin: new Date(now.getTime() - 3 * 60 * 60 * 1000),
        createdAt: new Date('2023-03-01')
      },
      logisticianICPE: {
        _id: new ObjectId(),
        email: 'icpe@logistock.fr',
        firstName: 'Antoine',
        lastName: 'Moreau',
        role: 'icpe_manager',
        organizationId: orgs.logistician._id,
        organizationType: 'logistician',
        permissions: ['icpe.manage', 'delegations.manage', 'reports.view'],
        isActive: true,
        createdAt: new Date('2023-05-01')
      },
      logisticianRdv: {
        _id: new ObjectId(),
        email: 'rdv@logistock.fr',
        firstName: 'Emma',
        lastName: 'Dubois',
        role: 'rdv_manager',
        organizationId: orgs.logistician._id,
        organizationType: 'logistician',
        permissions: ['appointments.manage', 'slots.manage'],
        isActive: true,
        createdAt: new Date('2023-06-01')
      },
      transporter2Admin: {
        _id: new ObjectId(),
        email: 'admin@logispeed.fr',
        firstName: 'Thomas',
        lastName: 'Garcia',
        role: 'admin',
        organizationId: orgs.transporter2._id,
        organizationType: 'transporter',
        isActive: true,
        createdAt: new Date('2024-01-15')
      }
    };

    for (const [key, user] of Object.entries(users)) {
      user.userId = `demo-${key}-${user._id.toString().slice(-6)}`;
      await db.collection('users').insertOne(user);
      log('cyan', `  - ${user.firstName} ${user.lastName} (${user.role})`);
    }

    log('green', '\n>>> Utilisateurs crees!\n');

    // ============================================
    // ETAPE 4: GRILLES TARIFAIRES
    // ============================================
    log('yellow', '>>> ETAPE 4: Creation des grilles tarifaires...\n');

    const pricingGrids = [
      {
        _id: new ObjectId(),
        name: 'Grille Standard ACME-TransExpress 2025',
        code: 'GR-ACME-TE-2025',
        type: 'FTL',
        shipperId: orgs.industry._id,
        carrierId: orgs.transporter1._id,
        status: 'active',
        validFrom: new Date('2025-01-01'),
        validTo: new Date('2025-12-31'),
        zones: [
          { code: 'Z1', name: 'Rhone-Alpes', departments: ['69', '38', '42', '01', '73', '74'] },
          { code: 'Z2', name: 'PACA', departments: ['13', '83', '84', '06', '04', '05'] },
          { code: 'Z3', name: 'Ile-de-France', departments: ['75', '77', '78', '91', '92', '93', '94', '95'] }
        ],
        rates: [
          { fromZone: 'Z1', toZone: 'Z1', basePrice: 250, pricePerKm: 1.2, pricePerKg: 0.05 },
          { fromZone: 'Z1', toZone: 'Z2', basePrice: 450, pricePerKm: 1.4, pricePerKg: 0.06 },
          { fromZone: 'Z1', toZone: 'Z3', basePrice: 550, pricePerKm: 1.5, pricePerKg: 0.07 },
          { fromZone: 'Z2', toZone: 'Z3', basePrice: 650, pricePerKm: 1.6, pricePerKg: 0.08 }
        ],
        surcharges: [
          { type: 'fuel', name: 'Surcharge carburant', percentage: 15, isActive: true },
          { type: 'adr', name: 'Matieres dangereuses', flatAmount: 150, isActive: true },
          { type: 'weekend', name: 'Livraison week-end', percentage: 25, isActive: true },
          { type: 'express', name: 'Express J+1', percentage: 50, isActive: true }
        ],
        createdAt: new Date('2024-12-01'),
        createdBy: users.industryAdmin._id
      },
      {
        _id: new ObjectId(),
        name: 'Grille Messagerie LogiSpeed 2025',
        code: 'GR-ACME-LS-MSG-2025',
        type: 'LTL',
        shipperId: orgs.industry._id,
        carrierId: orgs.transporter2._id,
        status: 'active',
        validFrom: new Date('2025-01-01'),
        validTo: new Date('2025-12-31'),
        weightBrackets: [
          { min: 0, max: 30, pricePerKg: 2.5 },
          { min: 30, max: 100, pricePerKg: 1.8 },
          { min: 100, max: 500, pricePerKg: 1.2 },
          { min: 500, max: 1000, pricePerKg: 0.8 }
        ],
        createdAt: new Date('2024-12-15'),
        createdBy: users.industryAdmin._id
      }
    ];

    for (const grid of pricingGrids) {
      await db.collection('pricing_grids').insertOne(grid);
      log('cyan', `  - ${grid.name} (${grid.type})`);
    }

    log('green', '\n>>> Grilles tarifaires creees!\n');

    // ============================================
    // ETAPE 5: PLAN DE TRANSPORT
    // ============================================
    log('yellow', '>>> ETAPE 5: Creation du plan de transport...\n');

    const transportPlan = {
      _id: new ObjectId(),
      name: 'Plan Transport ACME 2025',
      organizationId: orgs.industry._id,
      status: 'active',
      period: { start: new Date('2025-01-01'), end: new Date('2025-12-31') },
      lanes: [],
      autoDispatchEnabled: true,
      affretiaFallback: true,
      createdAt: new Date('2024-12-01'),
      createdBy: users.industryAdmin._id
    };

    const lanes = [
      {
        _id: new ObjectId(),
        planId: transportPlan._id,
        name: 'Lyon - Marseille (Quotidien)',
        origin: { city: 'Lyon', postalCode: '69001', lat: 45.764043, lng: 4.835659 },
        destination: { city: 'Marseille', postalCode: '13001', lat: 43.296482, lng: 5.369780 },
        distance: 315,
        frequency: 'daily',
        assignedCarrierId: orgs.transporter1._id,
        pricingGridId: pricingGrids[0]._id,
        volumePerWeek: 5,
        priority: 1,
        isActive: true
      },
      {
        _id: new ObjectId(),
        planId: transportPlan._id,
        name: 'Lyon - Paris (3x/semaine)',
        origin: { city: 'Lyon', postalCode: '69001', lat: 45.764043, lng: 4.835659 },
        destination: { city: 'Paris', postalCode: '75001', lat: 48.856614, lng: 2.352222 },
        distance: 465,
        frequency: 'weekly',
        daysOfWeek: ['monday', 'wednesday', 'friday'],
        assignedCarrierId: orgs.transporter3._id,
        volumePerWeek: 3,
        priority: 2,
        isActive: true
      },
      {
        _id: new ObjectId(),
        planId: transportPlan._id,
        name: 'Lyon - Grenoble (Spot)',
        origin: { city: 'Lyon', postalCode: '69001', lat: 45.764043, lng: 4.835659 },
        destination: { city: 'Grenoble', postalCode: '38000', lat: 45.188529, lng: 5.724524 },
        distance: 105,
        frequency: 'on_demand',
        useAffretia: true,
        priority: 3,
        isActive: true
      }
    ];

    transportPlan.lanes = lanes.map(l => l._id);
    await db.collection('transport_plans').insertOne(transportPlan);
    for (const lane of lanes) {
      await db.collection('transport_lanes').insertOne(lane);
    }
    log('cyan', `  - Plan: ${transportPlan.name}`);
    log('cyan', `  - ${lanes.length} lanes configurees`);

    log('green', '\n>>> Plan de transport cree!\n');

    // ============================================
    // ETAPE 6: COMMANDES DE TRANSPORT
    // ============================================
    log('yellow', '>>> ETAPE 6: Creation des commandes...\n');

    const orders = [
      // Commande 1 - En cours de livraison
      {
        _id: new ObjectId(),
        orderNumber: 'ORD-2025-0001',
        shipperId: orgs.industry._id,
        shipperName: 'ACME Industries',
        carrierId: orgs.transporter1._id,
        carrierName: 'Trans Express SARL',
        status: 'in_transit',
        type: 'FTL',
        pickup: {
          address: '123 Avenue de l\'Industrie, 69001 Lyon',
          city: 'Lyon',
          postalCode: '69001',
          lat: 45.764043,
          lng: 4.835659,
          date: yesterday,
          timeSlot: { start: '08:00', end: '10:00' },
          contact: { name: 'Pierre Martin', phone: '+33 4 72 00 00 01' },
          completedAt: new Date(yesterday.getTime() + 2 * 60 * 60 * 1000)
        },
        delivery: {
          address: '45 Rue de la Republique, 13001 Marseille',
          city: 'Marseille',
          postalCode: '13001',
          lat: 43.296482,
          lng: 5.369780,
          date: now,
          timeSlot: { start: '14:00', end: '16:00' },
          contact: { name: 'Client Marseille', phone: '+33 4 91 00 00 01' }
        },
        goods: {
          description: 'Pieces mecaniques - Lot A2025',
          weight: 8500,
          volume: 25,
          pallets: 12,
          packages: 48,
          value: 125000
        },
        pricing: {
          gridId: pricingGrids[0]._id,
          basePrice: 450,
          surcharges: [{ type: 'fuel', amount: 67.5 }],
          total: 517.5
        },
        dispatchMethod: 'plan',
        laneId: lanes[0]._id,
        driverId: users.driver1._id,
        vehiclePlate: 'AB-123-CD',
        tracking: {
          lastPosition: { lat: 44.5, lng: 4.9, updatedAt: new Date(now.getTime() - 30 * 60 * 1000) },
          eta: new Date(now.getTime() + 2 * 60 * 60 * 1000),
          events: ['pickup_completed', 'in_transit']
        },
        documents: { cmr: true, deliveryNote: true },
        createdAt: twoDaysAgo,
        createdBy: users.industryLogistics._id
      },
      // Commande 2 - Livree (avec e-CMR signe)
      {
        _id: new ObjectId(),
        orderNumber: 'ORD-2025-0002',
        shipperId: orgs.industry._id,
        shipperName: 'ACME Industries',
        carrierId: orgs.transporter1._id,
        carrierName: 'Trans Express SARL',
        status: 'delivered',
        type: 'FTL',
        pickup: {
          address: '123 Avenue de l\'Industrie, 69001 Lyon',
          city: 'Lyon',
          postalCode: '69001',
          date: twoDaysAgo,
          completedAt: new Date(twoDaysAgo.getTime() + 2 * 60 * 60 * 1000)
        },
        delivery: {
          address: '1 Place Bellecour, 69002 Lyon',
          city: 'Lyon',
          postalCode: '69002',
          date: twoDaysAgo,
          completedAt: new Date(twoDaysAgo.getTime() + 5 * 60 * 60 * 1000)
        },
        goods: {
          description: 'Equipements industriels',
          weight: 3200,
          pallets: 4
        },
        pricing: { total: 280 },
        dispatchMethod: 'plan',
        driverId: users.driver1._id,
        rating: { score: 5, comment: 'Livraison parfaite, chauffeur tres professionnel' },
        createdAt: new Date(twoDaysAgo.getTime() - 24 * 60 * 60 * 1000),
        completedAt: new Date(twoDaysAgo.getTime() + 5 * 60 * 60 * 1000)
      },
      // Commande 3 - Planifiee pour demain
      {
        _id: new ObjectId(),
        orderNumber: 'ORD-2025-0003',
        shipperId: orgs.industry._id,
        shipperName: 'ACME Industries',
        carrierId: orgs.transporter3._id,
        carrierName: 'RapidFret Express',
        status: 'confirmed',
        type: 'FTL',
        pickup: {
          address: '123 Avenue de l\'Industrie, 69001 Lyon',
          city: 'Lyon',
          date: tomorrow,
          timeSlot: { start: '06:00', end: '08:00' }
        },
        delivery: {
          address: '10 Rue de Rivoli, 75001 Paris',
          city: 'Paris',
          date: tomorrow,
          timeSlot: { start: '16:00', end: '18:00' }
        },
        goods: {
          description: 'Composants electroniques - Urgent',
          weight: 1500,
          pallets: 2,
          value: 85000,
          specialRequirements: ['fragile', 'temperature_controlled']
        },
        pricing: { total: 750 },
        dispatchMethod: 'plan',
        laneId: lanes[1]._id,
        createdAt: now,
        createdBy: users.industryAdmin._id
      },
      // Commande 4 - Via AFFRET.IA (recherche en cours)
      {
        _id: new ObjectId(),
        orderNumber: 'ORD-2025-0004',
        shipperId: orgs.industry._id,
        shipperName: 'ACME Industries',
        status: 'searching',
        type: 'FTL',
        pickup: {
          address: '123 Avenue de l\'Industrie, 69001 Lyon',
          city: 'Lyon',
          date: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
        },
        delivery: {
          address: '25 Rue Victor Hugo, 38000 Grenoble',
          city: 'Grenoble',
          date: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
        },
        goods: {
          description: 'Materiaux de construction',
          weight: 12000,
          pallets: 18
        },
        dispatchMethod: 'affretia',
        laneId: lanes[2]._id,
        affretiaSessionId: null,
        createdAt: now,
        createdBy: users.industryLogistics._id
      },
      // Commande 5 - En attente de RDV
      {
        _id: new ObjectId(),
        orderNumber: 'ORD-2025-0005',
        shipperId: orgs.industry._id,
        shipperName: 'ACME Industries',
        carrierId: orgs.transporter2._id,
        carrierName: 'LogiSpeed Transport',
        status: 'pending_appointment',
        type: 'LTL',
        pickup: {
          address: '123 Avenue de l\'Industrie, 69001 Lyon',
          city: 'Lyon',
          date: nextWeek
        },
        delivery: {
          address: '200 Zone Logistique, 69200 Venissieux',
          city: 'Venissieux',
          date: nextWeek,
          warehouseId: orgs.logistician._id
        },
        goods: {
          description: 'Stock pour delegation logistique',
          weight: 2500,
          pallets: 6
        },
        pricing: {
          gridId: pricingGrids[1]._id,
          total: 320
        },
        dispatchMethod: 'manual',
        createdAt: now,
        createdBy: users.industryLogistics._id
      },
      // Commande 6 - Avec probleme (litige)
      {
        _id: new ObjectId(),
        orderNumber: 'ORD-2024-0156',
        shipperId: orgs.industry._id,
        shipperName: 'ACME Industries',
        carrierId: orgs.transporter2._id,
        carrierName: 'LogiSpeed Transport',
        status: 'dispute',
        type: 'FTL',
        pickup: {
          address: '123 Avenue de l\'Industrie, 69001 Lyon',
          city: 'Lyon',
          date: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          completedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000)
        },
        delivery: {
          address: '15 Zone Industrielle, 42000 Saint-Etienne',
          city: 'Saint-Etienne',
          date: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          completedAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
        },
        goods: {
          description: 'Pieces detachees',
          weight: 4500,
          pallets: 8
        },
        pricing: { total: 380 },
        dispute: {
          reason: 'Retard de livraison (24h)',
          status: 'open',
          createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
          details: 'Livraison effectuee avec 24h de retard sans communication prealable'
        },
        createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
      }
    ];

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      // Add unique id field required by the schema
      order.id = `demo-order-${i + 1}-${order._id.toString().slice(-6)}`;
      await db.collection('orders').insertOne(order);
      log('cyan', `  - ${order.orderNumber} (${order.status})`);
    }

    log('green', '\n>>> Commandes creees!\n');

    // ============================================
    // ETAPE 7: SESSIONS AFFRET.IA
    // ============================================
    log('yellow', '>>> ETAPE 7: Creation des sessions AFFRET.IA...\n');

    const affretiaSession = {
      _id: new ObjectId(),
      orderId: orders[3]._id,
      orderNumber: orders[3].orderNumber,
      shipperId: orgs.industry._id,
      status: 'searching',
      searchType: 'autonomous',
      requirements: {
        vehicleType: 'semi',
        weight: 12000,
        pallets: 18,
        pickupDate: orders[3].pickup.date,
        pickupLocation: orders[3].pickup,
        deliveryLocation: orders[3].delivery,
        maxPrice: 400,
        preferredCarriers: [orgs.transporter1._id, orgs.transporter2._id, orgs.transporter3._id]
      },
      searchPhases: [
        { phase: 'preferred_carriers', status: 'completed', startedAt: now, completedAt: now, carriersContacted: 3, responses: 1 },
        { phase: 'bourse', status: 'in_progress', startedAt: now, carriersNotified: 25 }
      ],
      proposals: [],
      timeline: [
        { event: 'session_created', timestamp: now },
        { event: 'preferred_carriers_contacted', timestamp: now, count: 3 },
        { event: 'proposal_received', timestamp: new Date(now.getTime() + 5 * 60 * 1000), carrierId: orgs.transporter2._id }
      ],
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      createdAt: now,
      createdBy: users.industryLogistics._id
    };

    // Propositions de transporteurs
    const proposals = [
      {
        _id: new ObjectId(),
        sessionId: affretiaSession._id,
        orderId: orders[3]._id,
        carrierId: orgs.transporter2._id,
        carrierName: 'LogiSpeed Transport',
        status: 'pending',
        price: 350,
        vehicleType: 'semi',
        vehiclePlate: 'EF-456-GH',
        driverName: 'Thomas Garcia',
        estimatedPickup: orders[3].pickup.date,
        estimatedDelivery: orders[3].delivery.date,
        validUntil: new Date(now.getTime() + 4 * 60 * 60 * 1000),
        message: 'Disponible pour cette mission. Vehicule equipe hayon.',
        carrierScore: 4.2,
        createdAt: new Date(now.getTime() + 5 * 60 * 1000)
      },
      {
        _id: new ObjectId(),
        sessionId: affretiaSession._id,
        orderId: orders[3]._id,
        carrierId: orgs.transporter3._id,
        carrierName: 'RapidFret Express',
        status: 'pending',
        price: 380,
        vehicleType: 'semi',
        estimatedPickup: orders[3].pickup.date,
        estimatedDelivery: orders[3].delivery.date,
        validUntil: new Date(now.getTime() + 6 * 60 * 60 * 1000),
        message: 'Proposition disponible, livraison garantie avant 14h.',
        carrierScore: 4.8,
        createdAt: new Date(now.getTime() + 15 * 60 * 1000)
      }
    ];

    affretiaSession.proposals = proposals.map(p => p._id);

    // Mise a jour de la commande avec l'ID de session
    await db.collection('orders').updateOne(
      { _id: orders[3]._id },
      { $set: { affretiaSessionId: affretiaSession._id } }
    );

    await db.collection('affretia_sessions').insertOne(affretiaSession);
    for (const proposal of proposals) {
      await db.collection('affretia_proposals').insertOne(proposal);
    }
    log('cyan', `  - Session AFFRET.IA pour ${orders[3].orderNumber}`);
    log('cyan', `  - ${proposals.length} propositions recues`);

    // Session terminee (historique)
    const completedSession = {
      _id: new ObjectId(),
      orderId: orders[1]._id,
      orderNumber: orders[1].orderNumber,
      shipperId: orgs.industry._id,
      status: 'completed',
      searchType: 'direct',
      selectedCarrierId: orgs.transporter1._id,
      selectedPrice: 280,
      completedAt: new Date(twoDaysAgo.getTime() - 2 * 60 * 60 * 1000),
      createdAt: new Date(twoDaysAgo.getTime() - 6 * 60 * 60 * 1000)
    };
    await db.collection('affretia_sessions').insertOne(completedSession);

    log('green', '\n>>> Sessions AFFRET.IA creees!\n');

    // ============================================
    // ETAPE 8: e-CMR ELECTRONIQUES
    // ============================================
    log('yellow', '>>> ETAPE 8: Creation des e-CMR...\n');

    const ecmrs = [
      // e-CMR complete (commande livree)
      {
        _id: new ObjectId(),
        ecmrNumber: 'ECMR-2025-0002',
        orderId: orders[1]._id,
        orderNumber: orders[1].orderNumber,
        status: 'completed',
        shipperId: orgs.industry._id,
        shipperName: 'ACME Industries',
        carrierId: orgs.transporter1._id,
        carrierName: 'Trans Express SARL',
        consignee: {
          name: 'Client Lyon Centre',
          address: '1 Place Bellecour, 69002 Lyon'
        },
        goods: orders[1].goods,
        pickup: {
          ...orders[1].pickup,
          signature: {
            name: 'Pierre Martin',
            timestamp: new Date(twoDaysAgo.getTime() + 2 * 60 * 60 * 1000),
            type: 'expediteur'
          }
        },
        delivery: {
          ...orders[1].delivery,
          signature: {
            name: 'Client Lyon',
            timestamp: new Date(twoDaysAgo.getTime() + 5 * 60 * 60 * 1000),
            type: 'destinataire'
          }
        },
        driver: {
          name: 'Michel Bernard',
          signature: {
            timestamp: new Date(twoDaysAgo.getTime() + 2 * 60 * 60 * 1000),
            type: 'transporteur'
          }
        },
        signatures: {
          expediteur: { signed: true, signedAt: new Date(twoDaysAgo.getTime() + 2 * 60 * 60 * 1000), signedBy: 'Pierre Martin' },
          transporteur: { signed: true, signedAt: new Date(twoDaysAgo.getTime() + 2 * 60 * 60 * 1000), signedBy: 'Michel Bernard' },
          destinataire: { signed: true, signedAt: new Date(twoDaysAgo.getTime() + 5 * 60 * 60 * 1000), signedBy: 'Client Lyon' }
        },
        pdfUrl: '/documents/ecmr/ECMR-2025-0002.pdf',
        createdAt: twoDaysAgo,
        completedAt: new Date(twoDaysAgo.getTime() + 5 * 60 * 60 * 1000)
      },
      // e-CMR en cours (commande en transit)
      {
        _id: new ObjectId(),
        ecmrNumber: 'ECMR-2025-0001',
        orderId: orders[0]._id,
        orderNumber: orders[0].orderNumber,
        status: 'in_transit',
        shipperId: orgs.industry._id,
        shipperName: 'ACME Industries',
        carrierId: orgs.transporter1._id,
        carrierName: 'Trans Express SARL',
        consignee: {
          name: 'Client Marseille',
          address: '45 Rue de la Republique, 13001 Marseille'
        },
        goods: orders[0].goods,
        pickup: {
          ...orders[0].pickup,
          signature: {
            name: 'Pierre Martin',
            timestamp: new Date(yesterday.getTime() + 2 * 60 * 60 * 1000),
            type: 'expediteur'
          }
        },
        delivery: orders[0].delivery,
        driver: { name: 'Michel Bernard' },
        signatures: {
          expediteur: { signed: true, signedAt: new Date(yesterday.getTime() + 2 * 60 * 60 * 1000), signedBy: 'Pierre Martin' },
          transporteur: { signed: true, signedAt: new Date(yesterday.getTime() + 2 * 60 * 60 * 1000), signedBy: 'Michel Bernard' },
          destinataire: { signed: false }
        },
        createdAt: yesterday
      }
    ];

    for (const ecmr of ecmrs) {
      await db.collection('ecmr').insertOne(ecmr);
      log('cyan', `  - ${ecmr.ecmrNumber} (${ecmr.status})`);
    }

    log('green', '\n>>> e-CMR crees!\n');

    // ============================================
    // ETAPE 9: TRACKING GPS
    // ============================================
    log('yellow', '>>> ETAPE 9: Creation du tracking GPS...\n');

    const positions = [
      { lat: 45.764043, lng: 4.835659, timestamp: new Date(yesterday.getTime() + 2 * 60 * 60 * 1000), event: 'pickup' },
      { lat: 45.5, lng: 4.85, timestamp: new Date(yesterday.getTime() + 4 * 60 * 60 * 1000) },
      { lat: 45.2, lng: 4.9, timestamp: new Date(yesterday.getTime() + 6 * 60 * 60 * 1000) },
      { lat: 44.8, lng: 4.95, timestamp: new Date(yesterday.getTime() + 8 * 60 * 60 * 1000) },
      { lat: 44.5, lng: 4.9, timestamp: new Date(now.getTime() - 30 * 60 * 1000), event: 'last_known' }
    ];

    for (const pos of positions) {
      await db.collection('tracking_positions').insertOne({
        orderId: orders[0]._id,
        driverId: users.driver1._id,
        vehiclePlate: 'AB-123-CD',
        ...pos
      });
    }

    const trackingEvents = [
      { orderId: orders[0]._id, type: 'created', timestamp: twoDaysAgo, description: 'Commande creee' },
      { orderId: orders[0]._id, type: 'confirmed', timestamp: twoDaysAgo, description: 'Commande confirmee par Trans Express' },
      { orderId: orders[0]._id, type: 'pickup_started', timestamp: new Date(yesterday.getTime() + 1.5 * 60 * 60 * 1000), description: 'Chauffeur arrive a l\'enlevement' },
      { orderId: orders[0]._id, type: 'pickup_completed', timestamp: new Date(yesterday.getTime() + 2 * 60 * 60 * 1000), description: 'Enlevement effectue - e-CMR signe' },
      { orderId: orders[0]._id, type: 'in_transit', timestamp: new Date(yesterday.getTime() + 2.5 * 60 * 60 * 1000), description: 'En route vers Marseille' },
      { orderId: orders[0]._id, type: 'eta_update', timestamp: new Date(now.getTime() - 30 * 60 * 1000), description: 'ETA mise a jour: 14h30', eta: new Date(now.getTime() + 2 * 60 * 60 * 1000) }
    ];

    for (const event of trackingEvents) {
      await db.collection('tracking_events').insertOne(event);
    }
    log('cyan', `  - ${positions.length} positions GPS`);
    log('cyan', `  - ${trackingEvents.length} evenements de tracking`);

    log('green', '\n>>> Tracking GPS cree!\n');

    // ============================================
    // ETAPE 10: DELEGATIONS LOGISTIQUES
    // ============================================
    log('yellow', '>>> ETAPE 10: Creation des delegations logistiques...\n');

    const delegations = [
      {
        _id: new ObjectId(),
        type: 'storage',
        status: 'active',
        industryId: orgs.industry._id,
        industryName: 'ACME Industries',
        logisticianId: orgs.logistician._id,
        logisticianName: 'LogiStock Entrepots',
        warehouse: orgs.logistician.warehouses[0],
        contract: {
          startDate: new Date('2024-06-01'),
          endDate: new Date('2025-05-31'),
          renewalType: 'automatic'
        },
        services: ['storage', 'picking', 'packing', 'shipping'],
        pricing: {
          storagePerPallet: 2.5,
          handlingIn: 3.0,
          handlingOut: 3.5,
          pickingPerLine: 0.8
        },
        currentStock: {
          pallets: 85,
          locations: 120,
          value: 425000
        },
        kpis: {
          accuracyRate: 99.2,
          onTimeShipment: 97.5,
          damageRate: 0.1
        },
        createdAt: new Date('2024-06-01'),
        createdBy: users.industryAdmin._id
      },
      {
        _id: new ObjectId(),
        type: 'cross_dock',
        status: 'active',
        industryId: orgs.industry2._id,
        industryName: 'TechParts Manufacturing',
        logisticianId: orgs.logistician._id,
        logisticianName: 'LogiStock Entrepots',
        warehouse: orgs.logistician.warehouses[1],
        contract: {
          startDate: new Date('2024-09-01'),
          endDate: new Date('2025-08-31')
        },
        services: ['cross_dock', 'consolidation'],
        pricing: {
          crossDockPerPallet: 5.0,
          consolidationPerShipment: 25
        },
        createdAt: new Date('2024-09-01')
      }
    ];

    for (const delegation of delegations) {
      await db.collection('delegations').insertOne(delegation);
      log('cyan', `  - ${delegation.type}: ${delegation.industryName} -> ${delegation.logisticianName}`);
    }

    log('green', '\n>>> Delegations logistiques creees!\n');

    // ============================================
    // ETAPE 11: ICPE
    // ============================================
    log('yellow', '>>> ETAPE 11: Creation des donnees ICPE...\n');

    const icpeDeclarations = [
      {
        _id: new ObjectId(),
        type: 'declaration',
        status: 'approved',
        organizationId: orgs.logistician._id,
        organizationName: 'LogiStock Entrepots',
        warehouse: orgs.logistician.warehouses[0],
        icpeNumber: 'ICPE-69-2024-001',
        category: '1510',
        categoryName: 'Entrepots couverts',
        regime: 'declaration',
        surface: 15000,
        volumes: {
          maxStorage: 45000,
          currentStorage: 38500,
          hazardous: 2500,
          flammable: 5000
        },
        thresholds: {
          declaration: 50000,
          authorization: 300000,
          currentPercentage: 77
        },
        lastInspection: {
          date: new Date('2024-10-15'),
          result: 'conforme',
          inspector: 'DREAL Auvergne-Rhone-Alpes',
          nextInspection: new Date('2025-10-15')
        },
        documents: [
          { type: 'cerfa', name: 'Cerfa 15271*02', uploadedAt: new Date('2024-01-15') },
          { type: 'plan', name: 'Plan de stockage', uploadedAt: new Date('2024-01-15') },
          { type: 'inspection', name: 'PV inspection 2024', uploadedAt: new Date('2024-10-20') }
        ],
        createdAt: new Date('2024-01-15'),
        createdBy: users.logisticianICPE._id
      },
      {
        _id: new ObjectId(),
        type: 'monitoring',
        status: 'active',
        organizationId: orgs.logistician._id,
        icpeNumber: 'ICPE-69-2024-001',
        monthlyReports: [
          { month: '2024-11', totalVolume: 36500, hazardous: 2300, compliance: true },
          { month: '2024-12', totalVolume: 38500, hazardous: 2500, compliance: true }
        ],
        createdAt: new Date('2024-11-01')
      }
    ];

    const icpeAlerts = [
      {
        _id: new ObjectId(),
        type: 'threshold_warning',
        severity: 'warning',
        organizationId: orgs.logistician._id,
        icpeNumber: 'ICPE-69-2024-001',
        message: 'Seuil de stockage a 77% - Attention au depassement',
        threshold: 50000,
        currentValue: 38500,
        percentage: 77,
        status: 'acknowledged',
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        acknowledgedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        acknowledgedBy: users.logisticianICPE._id
      },
      {
        _id: new ObjectId(),
        type: 'inspection_reminder',
        severity: 'info',
        organizationId: orgs.logistician._id,
        icpeNumber: 'ICPE-69-2024-001',
        message: 'Prochaine inspection DREAL dans 9 mois',
        dueDate: new Date('2025-10-15'),
        status: 'open',
        createdAt: now
      }
    ];

    for (const decl of icpeDeclarations) {
      await db.collection('icpe_declarations').insertOne(decl);
    }
    for (const alert of icpeAlerts) {
      await db.collection('icpe_alerts').insertOne(alert);
    }
    log('cyan', `  - ${icpeDeclarations.length} declarations ICPE`);
    log('cyan', `  - ${icpeAlerts.length} alertes ICPE`);

    log('green', '\n>>> Donnees ICPE creees!\n');

    // ============================================
    // ETAPE 12: RDV TRANSPORTEURS
    // ============================================
    log('yellow', '>>> ETAPE 12: Creation des RDV transporteurs...\n');

    const slots = [];
    for (let d = 0; d < 7; d++) {
      const slotDate = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
      slots.push(
        {
          _id: new ObjectId(),
          warehouseId: orgs.logistician._id,
          warehouseName: 'LogiStock Entrepots - Entrepot A',
          date: slotDate,
          timeSlot: { start: '08:00', end: '10:00' },
          type: 'reception',
          capacity: 3,
          booked: d === 0 ? 2 : d === 1 ? 1 : 0,
          available: d === 0 ? 1 : d === 1 ? 2 : 3
        },
        {
          _id: new ObjectId(),
          warehouseId: orgs.logistician._id,
          warehouseName: 'LogiStock Entrepots - Entrepot A',
          date: slotDate,
          timeSlot: { start: '10:00', end: '12:00' },
          type: 'reception',
          capacity: 3,
          booked: 0,
          available: 3
        },
        {
          _id: new ObjectId(),
          warehouseId: orgs.logistician._id,
          warehouseName: 'LogiStock Entrepots - Entrepot A',
          date: slotDate,
          timeSlot: { start: '14:00', end: '16:00' },
          type: 'expedition',
          capacity: 4,
          booked: d === 0 ? 3 : 1,
          available: d === 0 ? 1 : 3
        }
      );
    }

    const appointments = [
      {
        _id: new ObjectId(),
        warehouseId: orgs.logistician._id,
        carrierId: orgs.transporter1._id,
        carrierName: 'Trans Express SARL',
        orderId: orders[0]._id,
        orderNumber: orders[0].orderNumber,
        type: 'expedition',
        date: now,
        timeSlot: { start: '14:00', end: '16:00' },
        status: 'confirmed',
        vehiclePlate: 'AB-123-CD',
        driverName: 'Michel Bernard',
        driverPhone: '+33612345678',
        goods: { pallets: 12, weight: 8500 },
        createdAt: yesterday,
        confirmedAt: yesterday
      },
      {
        _id: new ObjectId(),
        warehouseId: orgs.logistician._id,
        carrierId: orgs.transporter2._id,
        carrierName: 'LogiSpeed Transport',
        type: 'reception',
        date: tomorrow,
        timeSlot: { start: '08:00', end: '10:00' },
        status: 'pending',
        goods: { pallets: 6, weight: 2500, description: 'Livraison stock ACME' },
        createdAt: now
      }
    ];

    for (const slot of slots) {
      await db.collection('slots').insertOne(slot);
    }
    for (const appt of appointments) {
      await db.collection('appointments').insertOne(appt);
    }
    log('cyan', `  - ${slots.length} creneaux disponibles`);
    log('cyan', `  - ${appointments.length} RDV planifies`);

    log('green', '\n>>> RDV transporteurs crees!\n');

    // ============================================
    // ETAPE 13: GESTION DES PALETTES
    // ============================================
    log('yellow', '>>> ETAPE 13: Creation de la gestion des palettes...\n');

    const paletteAccounts = [
      {
        _id: new ObjectId(),
        organizationId: orgs.industry._id,
        organizationName: 'ACME Industries',
        paletteType: 'EUR',
        balance: 245,
        lastUpdated: now,
        movements: [
          { date: yesterday, type: 'out', quantity: 12, orderId: orders[0]._id, description: 'Expedition Marseille' },
          { date: twoDaysAgo, type: 'in', quantity: 4, orderId: orders[1]._id, description: 'Retour consigne' }
        ]
      },
      {
        _id: new ObjectId(),
        organizationId: orgs.transporter1._id,
        organizationName: 'Trans Express SARL',
        paletteType: 'EUR',
        balance: -18,
        lastUpdated: now
      }
    ];

    for (const account of paletteAccounts) {
      await db.collection('palette_accounts').insertOne(account);
    }
    log('cyan', `  - ${paletteAccounts.length} comptes palettes`);

    log('green', '\n>>> Gestion palettes creee!\n');

    // ============================================
    // ETAPE 14: NOTIFICATIONS
    // ============================================
    log('yellow', '>>> ETAPE 14: Creation des notifications...\n');

    const notifications = [
      {
        _id: new ObjectId(),
        userId: users.industryAdmin._id,
        type: 'order_update',
        title: 'Commande en transit',
        message: `La commande ${orders[0].orderNumber} est en route vers Marseille. ETA: 14h30`,
        orderId: orders[0]._id,
        read: false,
        createdAt: new Date(now.getTime() - 30 * 60 * 1000)
      },
      {
        _id: new ObjectId(),
        userId: users.industryAdmin._id,
        type: 'affretia_proposal',
        title: 'Nouvelle proposition AFFRET.IA',
        message: `2 propositions recues pour la commande ${orders[3].orderNumber}`,
        orderId: orders[3]._id,
        sessionId: affretiaSession._id,
        read: false,
        createdAt: new Date(now.getTime() - 15 * 60 * 1000)
      },
      {
        _id: new ObjectId(),
        userId: users.logisticianAdmin._id,
        type: 'icpe_alert',
        title: 'Alerte ICPE',
        message: 'Seuil de stockage a 77% - Attention au depassement',
        severity: 'warning',
        read: true,
        readAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
      },
      {
        _id: new ObjectId(),
        userId: users.transporterAdmin._id,
        type: 'mission_assigned',
        title: 'Nouvelle mission',
        message: `Mission ${orders[0].orderNumber} assignee a Michel Bernard`,
        orderId: orders[0]._id,
        read: true,
        createdAt: twoDaysAgo
      }
    ];

    for (const notif of notifications) {
      await db.collection('notifications').insertOne(notif);
    }
    log('cyan', `  - ${notifications.length} notifications`);

    log('green', '\n>>> Notifications creees!\n');

    // ============================================
    // ETAPE 15: KPIs ET ANALYTICS
    // ============================================
    log('yellow', '>>> ETAPE 15: Creation des KPIs...\n');

    const kpis = [
      {
        _id: new ObjectId(),
        organizationId: orgs.industry._id,
        period: 'monthly',
        month: '2024-12',
        metrics: {
          totalOrders: 48,
          deliveredOnTime: 45,
          deliveredLate: 2,
          cancelled: 1,
          onTimeRate: 93.75,
          averageDeliveryTime: 6.5,
          totalSpend: 24500,
          averageOrderValue: 510.42,
          topCarriers: [
            { id: orgs.transporter1._id, name: 'Trans Express SARL', orders: 28, rating: 4.5 },
            { id: orgs.transporter3._id, name: 'RapidFret Express', orders: 15, rating: 4.8 },
            { id: orgs.transporter2._id, name: 'LogiSpeed Transport', orders: 5, rating: 4.2 }
          ],
          byLane: [
            { lane: 'Lyon - Marseille', orders: 22, avgCost: 485 },
            { lane: 'Lyon - Paris', orders: 12, avgCost: 720 },
            { lane: 'Lyon - Grenoble', orders: 14, avgCost: 180 }
          ]
        },
        createdAt: new Date('2025-01-01')
      },
      {
        _id: new ObjectId(),
        organizationId: orgs.transporter1._id,
        period: 'monthly',
        month: '2024-12',
        metrics: {
          totalMissions: 35,
          completedOnTime: 33,
          revenue: 17850,
          averageMissionValue: 510,
          fuelCosts: 4200,
          margin: 13650,
          utilizationRate: 87.5,
          topClients: [
            { id: orgs.industry._id, name: 'ACME Industries', missions: 28, revenue: 14280 }
          ]
        },
        createdAt: new Date('2025-01-01')
      }
    ];

    for (const kpi of kpis) {
      await db.collection('kpis').insertOne(kpi);
    }
    log('cyan', `  - ${kpis.length} rapports KPI`);

    log('green', '\n>>> KPIs crees!\n');

    // ============================================
    // ETAPE 16: SCORES TRANSPORTEURS
    // ============================================
    log('yellow', '>>> ETAPE 16: Creation des scores transporteurs...\n');

    const carrierScores = [
      {
        _id: new ObjectId(),
        carrierId: orgs.transporter1._id,
        carrierName: 'Trans Express SARL',
        period: '2024-12',
        scores: {
          global: 4.5,
          ponctualite: 4.7,
          qualite: 4.3,
          communication: 4.5,
          documentation: 4.6,
          tarification: 4.2
        },
        metrics: {
          totalMissions: 35,
          onTimeDelivery: 94.3,
          incidentRate: 2.8,
          responseTime: 15,
          ecmrDigitalRate: 100
        },
        vigilance: {
          status: 'verified',
          kbisValid: true,
          insuranceValid: true,
          licensesValid: true,
          lastCheck: new Date('2024-12-01')
        },
        rankings: {
          overall: 2,
          category: 1,
          region: 1
        },
        createdAt: new Date('2025-01-01')
      },
      {
        _id: new ObjectId(),
        carrierId: orgs.transporter3._id,
        carrierName: 'RapidFret Express',
        period: '2024-12',
        scores: {
          global: 4.8,
          ponctualite: 4.9,
          qualite: 4.7,
          communication: 4.8
        },
        metrics: {
          totalMissions: 52,
          onTimeDelivery: 98.1,
          incidentRate: 0.5
        },
        vigilance: { status: 'verified' },
        rankings: { overall: 1 },
        createdAt: new Date('2025-01-01')
      },
      {
        _id: new ObjectId(),
        carrierId: orgs.transporter2._id,
        carrierName: 'LogiSpeed Transport',
        period: '2024-12',
        scores: {
          global: 4.2,
          ponctualite: 4.0,
          qualite: 4.3,
          communication: 4.3
        },
        metrics: {
          totalMissions: 18,
          onTimeDelivery: 88.9,
          incidentRate: 5.5
        },
        vigilance: { status: 'verified' },
        rankings: { overall: 15 },
        createdAt: new Date('2025-01-01')
      }
    ];

    for (const score of carrierScores) {
      await db.collection('carrier_scores').insertOne(score);
    }
    log('cyan', `  - ${carrierScores.length} fiches transporteurs`);

    log('green', '\n>>> Scores transporteurs crees!\n');

    // ============================================
    // ETAPE 17: AUDIT LOGS
    // ============================================
    log('yellow', '>>> ETAPE 17: Creation des logs d\'audit...\n');

    const auditLogs = [
      { action: 'order.created', userId: users.industryLogistics._id, orderId: orders[0]._id, timestamp: twoDaysAgo, details: { orderNumber: orders[0].orderNumber } },
      { action: 'order.dispatched', userId: users.industryLogistics._id, orderId: orders[0]._id, timestamp: twoDaysAgo, details: { carrierId: orgs.transporter1._id, method: 'plan' } },
      { action: 'ecmr.signed', userId: users.driver1._id, orderId: orders[0]._id, timestamp: new Date(yesterday.getTime() + 2 * 60 * 60 * 1000), details: { type: 'pickup', signatory: 'Michel Bernard' } },
      { action: 'affretia.session_created', userId: users.industryLogistics._id, orderId: orders[3]._id, timestamp: now, details: { sessionId: affretiaSession._id } },
      { action: 'affretia.proposal_received', userId: null, orderId: orders[3]._id, timestamp: new Date(now.getTime() + 5 * 60 * 1000), details: { carrierId: orgs.transporter2._id, price: 350 } },
      { action: 'icpe.alert_created', userId: null, organizationId: orgs.logistician._id, timestamp: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), details: { type: 'threshold_warning', percentage: 77 } }
    ];

    for (const log_entry of auditLogs) {
      await db.collection('audit_logs').insertOne(log_entry);
    }
    log('cyan', `  - ${auditLogs.length} entrees d'audit`);

    log('green', '\n>>> Logs d\'audit crees!\n');

    // ============================================
    // ETAPE 18: PREFACTURATION ET FACTURATION
    // ============================================
    log('yellow', '>>> ETAPE 18: Creation de la prefacturation et facturation...\n');

    const prefactures = [
      {
        _id: new ObjectId(),
        prefactureNumber: 'PRE-2025-0001',
        orderId: orders[0]._id,
        orderNumber: orders[0].orderNumber,
        ecmrId: ecmrs[1]._id,
        ecmrNumber: ecmrs[1].ecmrNumber,
        shipperId: orgs.industry._id,
        shipperName: 'ACME Industries',
        carrierId: orgs.transporter1._id,
        carrierName: 'Trans Express SARL',
        status: 'pending_validation',
        pricing: {
          gridId: pricingGrids[0]._id,
          gridName: 'Grille Standard ACME-TransExpress 2025',
          lines: [
            { description: 'Transport FTL Lyon - Marseille', quantity: 1, unitPrice: 450, amount: 450 },
            { description: 'Surcharge carburant (15%)', quantity: 1, unitPrice: 67.5, amount: 67.5 }
          ],
          subtotal: 517.5,
          vatRate: 20,
          vatAmount: 103.5,
          total: 621
        },
        goods: orders[0].goods,
        pickup: orders[0].pickup,
        delivery: orders[0].delivery,
        createdAt: now,
        createdBy: users.industryLogistics._id
      },
      {
        _id: new ObjectId(),
        prefactureNumber: 'PRE-2025-0002',
        orderId: orders[1]._id,
        orderNumber: orders[1].orderNumber,
        ecmrId: ecmrs[0]._id,
        ecmrNumber: ecmrs[0].ecmrNumber,
        shipperId: orgs.industry._id,
        shipperName: 'ACME Industries',
        carrierId: orgs.transporter1._id,
        carrierName: 'Trans Express SARL',
        status: 'validated',
        pricing: {
          lines: [
            { description: 'Transport FTL Lyon local', quantity: 1, unitPrice: 280, amount: 280 }
          ],
          subtotal: 280,
          vatRate: 20,
          vatAmount: 56,
          total: 336
        },
        validatedAt: yesterday,
        validatedBy: users.industryAdmin._id,
        invoiceId: null,
        createdAt: twoDaysAgo
      }
    ];

    const invoices = [
      {
        _id: new ObjectId(),
        invoiceNumber: 'FAC-2025-0001',
        type: 'transport',
        status: 'sent',
        prefactureId: prefactures[1]._id,
        orderId: orders[1]._id,
        orderNumber: orders[1].orderNumber,
        issuerId: orgs.transporter1._id,
        issuerName: 'Trans Express SARL',
        issuerSiret: orgs.transporter1.siret,
        issuerVat: orgs.transporter1.vatNumber,
        issuerAddress: orgs.transporter1.address,
        recipientId: orgs.industry._id,
        recipientName: 'ACME Industries',
        recipientSiret: orgs.industry.siret,
        recipientVat: orgs.industry.vatNumber,
        recipientAddress: orgs.industry.address,
        lines: [
          { description: 'Transport FTL Lyon local - ORD-2025-0002', quantity: 1, unitPrice: 280, vatRate: 20, amount: 280 }
        ],
        subtotal: 280,
        vatAmount: 56,
        total: 336,
        currency: 'EUR',
        issueDate: yesterday,
        dueDate: new Date(yesterday.getTime() + 30 * 24 * 60 * 60 * 1000),
        sentAt: yesterday,
        pdfUrl: '/documents/invoices/FAC-2025-0001.pdf',
        createdAt: yesterday
      },
      {
        _id: new ObjectId(),
        invoiceNumber: 'FAC-2024-0045',
        type: 'transport',
        status: 'paid',
        orderId: null,
        issuerId: orgs.transporter1._id,
        issuerName: 'Trans Express SARL',
        recipientId: orgs.industry._id,
        recipientName: 'ACME Industries',
        lines: [
          { description: 'Transport FTL decembre 2024 - Lot 1', quantity: 15, unitPrice: 485, vatRate: 20, amount: 7275 },
          { description: 'Surcharges carburant', quantity: 1, unitPrice: 1091.25, vatRate: 20, amount: 1091.25 }
        ],
        subtotal: 8366.25,
        vatAmount: 1673.25,
        total: 10039.50,
        currency: 'EUR',
        issueDate: new Date('2024-12-31'),
        dueDate: new Date('2025-01-30'),
        paidAt: new Date('2025-01-05'),
        paymentMethod: 'virement',
        paymentReference: 'VIR-ACME-2025-001',
        createdAt: new Date('2024-12-31')
      },
      {
        _id: new ObjectId(),
        invoiceNumber: 'FAC-LOG-2025-0001',
        type: 'logistique',
        status: 'pending',
        delegationId: delegations[0]._id,
        issuerId: orgs.logistician._id,
        issuerName: 'LogiStock Entrepots',
        recipientId: orgs.industry._id,
        recipientName: 'ACME Industries',
        period: { start: new Date('2024-12-01'), end: new Date('2024-12-31') },
        lines: [
          { description: 'Stockage palettes (85 palettes x 31 jours)', quantity: 2635, unitPrice: 2.5, vatRate: 20, amount: 6587.5 },
          { description: 'Manutention entree', quantity: 45, unitPrice: 3, vatRate: 20, amount: 135 },
          { description: 'Manutention sortie', quantity: 38, unitPrice: 3.5, vatRate: 20, amount: 133 },
          { description: 'Picking (lignes)', quantity: 320, unitPrice: 0.8, vatRate: 20, amount: 256 }
        ],
        subtotal: 7111.5,
        vatAmount: 1422.3,
        total: 8533.8,
        currency: 'EUR',
        issueDate: new Date('2025-01-02'),
        dueDate: new Date('2025-02-01'),
        createdAt: new Date('2025-01-02')
      }
    ];

    prefactures[1].invoiceId = invoices[0]._id;

    const payments = [
      {
        _id: new ObjectId(),
        invoiceId: invoices[1]._id,
        invoiceNumber: 'FAC-2024-0045',
        payerId: orgs.industry._id,
        payerName: 'ACME Industries',
        payeeId: orgs.transporter1._id,
        payeeName: 'Trans Express SARL',
        amount: 10039.50,
        currency: 'EUR',
        method: 'virement',
        reference: 'VIR-ACME-2025-001',
        status: 'completed',
        paidAt: new Date('2025-01-05'),
        createdAt: new Date('2025-01-05')
      }
    ];

    const billingStats = {
      _id: new ObjectId(),
      organizationId: orgs.industry._id,
      period: '2024-12',
      transport: {
        invoicesReceived: 8,
        totalAmount: 24500,
        paid: 24500,
        pending: 0,
        avgPaymentDays: 12
      },
      logistics: {
        invoicesReceived: 1,
        totalAmount: 8533.8,
        paid: 0,
        pending: 8533.8
      },
      createdAt: new Date('2025-01-01')
    };

    for (const pre of prefactures) {
      await db.collection('prefactures').insertOne(pre);
    }
    for (const inv of invoices) {
      await db.collection('invoices').insertOne(inv);
    }
    for (const pay of payments) {
      await db.collection('payments').insertOne(pay);
    }
    await db.collection('kpis').insertOne(billingStats);

    log('cyan', `  - ${prefactures.length} prefactures`);
    log('cyan', `  - ${invoices.length} factures`);
    log('cyan', `  - ${payments.length} paiements`);

    log('green', '\n>>> Prefacturation et facturation creees!\n');

    // ============================================
    // RESUME FINAL
    // ============================================
    log('magenta', '╔════════════════════════════════════════════════════════════════╗');
    log('magenta', '║         SYMPHONI.A - DONNEES DE DEMO CREEES AVEC SUCCES        ║');
    log('magenta', '╚════════════════════════════════════════════════════════════════╝\n');

    log('green', '  ORGANISATIONS:');
    log('cyan', '    - 2 Industriels (ACME Industries, TechParts Manufacturing)');
    log('cyan', '    - 3 Transporteurs (Trans Express, LogiSpeed, RapidFret)');
    log('cyan', '    - 1 Logisticien (LogiStock Entrepots)');
    log('cyan', '    - 1 Transitaire (GlobalFreight Transit)');

    log('green', '\n  UTILISATEURS:');
    log('cyan', '    - 3 utilisateurs Industriel (admin, logistics, viewer)');
    log('cyan', '    - 4 utilisateurs Transporteur (admin, dispatch, 2 chauffeurs)');
    log('cyan', '    - 3 utilisateurs Logisticien (admin, ICPE, RDV)');

    log('green', '\n  COMMANDES:');
    log('cyan', '    - 6 commandes (en transit, livree, planifiee, recherche AFFRET.IA, RDV, litige)');

    log('green', '\n  AFFRET.IA:');
    log('cyan', '    - 1 session de recherche active avec 2 propositions');
    log('cyan', '    - 1 session completee (historique)');

    log('green', '\n  e-CMR:');
    log('cyan', '    - 2 e-CMR (1 complete avec signatures, 1 en transit)');

    log('green', '\n  PLAN DE TRANSPORT:');
    log('cyan', '    - 1 plan avec 3 lanes (quotidien, hebdo, spot)');
    log('cyan', '    - 2 grilles tarifaires (FTL, LTL)');

    log('green', '\n  DELEGATION LOGISTIQUE:');
    log('cyan', '    - 2 delegations actives (storage, cross-dock)');

    log('green', '\n  ICPE:');
    log('cyan', '    - 1 declaration ICPE avec suivi mensuel');
    log('cyan', '    - 2 alertes (seuil, inspection)');

    log('green', '\n  RDV TRANSPORTEURS:');
    log('cyan', '    - 21 creneaux disponibles (7 jours)');
    log('cyan', '    - 2 RDV planifies');

    log('green', '\n  PREFACTURATION:');
    log('cyan', '    - 2 prefactures (1 en attente validation, 1 validee)');

    log('green', '\n  FACTURATION:');
    log('cyan', '    - FAC-2025-0001: Transport 336 EUR (envoyee)');
    log('cyan', '    - FAC-2024-0045: Transport 10 039.50 EUR (payee)');
    log('cyan', '    - FAC-LOG-2025-0001: Logistique 8 533.80 EUR (en attente)');

    log('green', '\n  AUTRES:');
    log('cyan', '    - Tracking GPS avec 5 positions');
    log('cyan', '    - 4 notifications');
    log('cyan', '    - 2 rapports KPI');
    log('cyan', '    - 3 fiches scores transporteurs');
    log('cyan', '    - 2 comptes palettes');
    log('cyan', '    - 6 entrees audit');

    log('magenta', '\n╔════════════════════════════════════════════════════════════════╗');
    log('magenta', '║                    CODES D\'ACCES DEMO                           ║');
    log('magenta', '╚════════════════════════════════════════════════════════════════╝\n');

    log('green', '  PORTAIL INDUSTRIEL:');
    log('cyan', '    Email: demo.industrie@symphonia.com');
    log('cyan', '    Mot de passe: Demo2025!');

    log('green', '\n  PORTAIL TRANSPORTEUR:');
    log('cyan', '    Email: demo.transporteur@symphonia.com');
    log('cyan', '    Mot de passe: Demo2025!');

    log('green', '\n  PORTAIL LOGISTICIEN:');
    log('cyan', '    Email: demo.logisticien@symphonia.com');
    log('cyan', '    Mot de passe: Demo2025!');

    log('green', '\n  APPLICATION CHAUFFEUR:');
    log('cyan', '    Email: michel.bernard@trans-express.fr');
    log('cyan', '    Mot de passe: Demo2025!');

    log('magenta', '\n════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    log('red', `ERREUR: ${error.message}`);
    throw error;
  } finally {
    await client.close();
    log('yellow', 'Connexion MongoDB fermee');
  }
}

main().catch(console.error);
