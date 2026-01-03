/**
 * Seed Logisticien Demo Data
 *
 * Script complet pour initialiser des donnees de demonstration
 * couvrant l'ensemble des fonctionnalites du module Logisticien.
 *
 * Scenarios couverts:
 * 1. Industriel avec plusieurs logisticiens delegues
 * 2. Logisticien avec plusieurs entrepots et rubriques ICPE
 * 3. Documents de vigilance (valides, expires, en attente)
 * 4. Declarations ICPE hebdomadaires avec alertes
 * 5. Relations multi-industriels
 * 6. Options payantes activees
 *
 * Usage: node seed-logisticien-demo.js [--clean]
 *   --clean : Supprime toutes les donnees existantes avant insertion
 */

const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rt-subscriptions-contracts';
const CLEAN_BEFORE_SEED = process.argv.includes('--clean');

// IDs fixes pour faciliter les tests
const IDS = {
  // Industriels
  industriel1: new ObjectId('675000000000000000000001'),
  industriel2: new ObjectId('675000000000000000000002'),

  // Logisticiens
  logisticien1: new ObjectId('675100000000000000000001'),
  logisticien2: new ObjectId('675100000000000000000002'),
  logisticien3: new ObjectId('675100000000000000000003'),
  logisticienInvited: new ObjectId('675100000000000000000004'),
  logisticienOnboarding: new ObjectId('675100000000000000000005'),
  logisticienBlocked: new ObjectId('675100000000000000000006'),

  // Entrepots (warehouseId string)
  warehouse1A: 'WH-LOG1-001',
  warehouse1B: 'WH-LOG1-002',
  warehouse2A: 'WH-LOG2-001',
  warehouse3A: 'WH-LOG3-001',

  // Documents
  doc1: new ObjectId('675200000000000000000001'),
  doc2: new ObjectId('675200000000000000000002'),
  doc3: new ObjectId('675200000000000000000003'),
  doc4: new ObjectId('675200000000000000000004'),
  doc5: new ObjectId('675200000000000000000005'),
  docExpired: new ObjectId('675200000000000000000006'),
  docPending: new ObjectId('675200000000000000000007'),

  // Declarations ICPE
  decl1: new ObjectId('675300000000000000000001'),
  decl2: new ObjectId('675300000000000000000002'),
  decl3: new ObjectId('675300000000000000000003'),

  // Alertes
  alert1: new ObjectId('675400000000000000000001'),
  alert2: new ObjectId('675400000000000000000002'),
  alert3: new ObjectId('675400000000000000000003'),

  // Commandes transport (pour test portail)
  order1: new ObjectId('675500000000000000000001'),
  order2: new ObjectId('675500000000000000000002'),
  order3: new ObjectId('675500000000000000000003'),
};

// Helper pour generer des dates
const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
const getISOWeek = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

async function seedDatabase() {
  console.log('');
  console.log('='.repeat(70));
  console.log('  SEED LOGISTICIEN DEMO DATA');
  console.log('='.repeat(70));
  console.log('');

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db();

    // Nettoyage si demande
    if (CLEAN_BEFORE_SEED) {
      console.log('\n[CLEAN] Suppression des donnees existantes...');
      await db.collection('logisticians').deleteMany({});
      await db.collection('logistician_documents').deleteMany({});
      await db.collection('logistician_events').deleteMany({});
      await db.collection('logistician_vigilance_alerts').deleteMany({});
      await db.collection('icpe_volume_declarations').deleteMany({});
      // Supprimer les commandes de test
      await db.collection('transport_orders').deleteMany({ _id: { $in: [IDS.order1, IDS.order2, IDS.order3] } });
      console.log('[CLEAN] Donnees supprimees');
    }

    // ========================================
    // 1. INDUSTRIELS (utilisateurs existants)
    // ========================================
    console.log('\n[1/8] Creation/Mise a jour des industriels...');

    const industriels = [
      {
        _id: IDS.industriel1,
        email: 'demo-industriel@symphonia.io',
        companyName: 'ACME Industries',
        role: 'industrial',
        subscription: { plan: 'PRO', active: true },
        sites: [
          { name: 'Usine Lyon', address: { city: 'Lyon', postalCode: '69000' } },
          { name: 'Usine Paris', address: { city: 'Paris', postalCode: '75000' } }
        ],
        createdAt: daysAgo(365),
        updatedAt: new Date()
      },
      {
        _id: IDS.industriel2,
        email: 'industrie2@demo.io',
        companyName: 'TechProd SA',
        role: 'industrial',
        subscription: { plan: 'ENTERPRISE', active: true },
        sites: [
          { name: 'Site Marseille', address: { city: 'Marseille', postalCode: '13000' } }
        ],
        createdAt: daysAgo(200),
        updatedAt: new Date()
      }
    ];

    for (const ind of industriels) {
      await db.collection('users').updateOne(
        { _id: ind._id },
        { $set: ind },
        { upsert: true }
      );
    }
    console.log(`  + ${industriels.length} industriels crees/mis a jour`);

    // ========================================
    // 2. LOGISTICIENS
    // ========================================
    console.log('\n[2/8] Creation des logisticiens...');

    const passwordHash = await bcrypt.hash('Demo2024!', 10);

    const logisticians = [
      // Logisticien 1: ACTIF avec 2 entrepots, 2 industriels clients
      {
        _id: IDS.logisticien1,
        email: 'logistique-durand@demo.io',
        companyName: 'Entrepots Durand SARL',
        siret: '12345678901234',
        vatNumber: 'FR12345678901',
        phone: '+33 4 72 00 00 01',
        address: {
          street: '15 Rue de la Logistique',
          city: 'Lyon',
          postalCode: '69007',
          country: 'France'
        },
        status: 'active',
        vigilanceStatus: 'compliant',
        industrialClients: [
          {
            industrialId: IDS.industriel1,
            industrialName: 'ACME Industries',
            invitedAt: daysAgo(180),
            activatedAt: daysAgo(175),
            status: 'active',
            delegationType: 'full',
            delegatedSites: ['Usine Lyon']
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
            warehouseId: IDS.warehouse1A,
            name: 'Entrepot Lyon Nord',
            address: { street: '100 ZI Nord', city: 'Lyon', postalCode: '69100', country: 'France' },
            gpsCoordinates: { lat: 45.7833, lng: 4.8333 },
            surface: 15000,
            dockCount: 12,
            icpeStatus: 'enregistrement',
            icpeRubriques: [
              {
                rubrique: '1510',
                libelle: 'Entrepot couvert',
                regime: 'E',
                seuilMax: 5000,
                unite: 'tonnes',
                dateDeclaration: daysAgo(365)
              },
              {
                rubrique: '2662',
                libelle: 'Stockage de polymeres',
                regime: 'E',
                seuilMax: 2000,
                unite: 'tonnes',
                dateDeclaration: daysAgo(365)
              }
            ],
            icpeNumero: 'ICPE-69-2024-0001',
            icpePrefecture: 'Rhone',
            icpeDateDeclaration: daysAgo(365),
            icpeProchainControle: daysFromNow(180),
            certifications: ['ISO 9001', 'OEA'],
            constraints: ['ADR', 'Frigo'],
            operatingHours: {
              monday: { open: '06:00', close: '22:00' },
              tuesday: { open: '06:00', close: '22:00' },
              wednesday: { open: '06:00', close: '22:00' },
              thursday: { open: '06:00', close: '22:00' },
              friday: { open: '06:00', close: '20:00' },
              saturday: { open: '08:00', close: '12:00' }
            },
            isActive: true
          },
          {
            warehouseId: IDS.warehouse1B,
            name: 'Entrepot Lyon Sud',
            address: { street: '50 ZI Sud', city: 'Lyon', postalCode: '69200', country: 'France' },
            gpsCoordinates: { lat: 45.7200, lng: 4.8000 },
            surface: 8000,
            dockCount: 6,
            icpeStatus: 'declaration',
            icpeRubriques: [
              {
                rubrique: '1510',
                libelle: 'Entrepot couvert',
                regime: 'D',
                seuilMax: 800,
                unite: 'tonnes',
                dateDeclaration: daysAgo(200)
              }
            ],
            icpeNumero: 'ICPE-69-2024-0045',
            icpePrefecture: 'Rhone',
            icpeDateDeclaration: daysAgo(200),
            icpeProchainControle: daysFromNow(365),
            certifications: ['ISO 9001'],
            constraints: [],
            isActive: true
          }
        ],
        contacts: [
          { type: 'direction', firstName: 'Jean', lastName: 'Durand', email: 'j.durand@entrepots-durand.fr', phone: '+33 6 00 00 00 01', isMain: true },
          { type: 'exploitation', firstName: 'Marie', lastName: 'Martin', email: 'm.martin@entrepots-durand.fr', phone: '+33 6 00 00 00 02', warehouseId: IDS.warehouse1A },
          { type: 'quais', firstName: 'Pierre', lastName: 'Bernard', email: 'p.bernard@entrepots-durand.fr', phone: '+33 6 00 00 00 03', warehouseId: IDS.warehouse1A }
        ],
        passwordHash,
        subscription: {
          type: 'free',
          startDate: daysAgo(175),
          monthlyPrice: 0,
          paidOptions: {
            bourseDeStockage: { active: true, activatedAt: daysAgo(60) },
            borneAccueilChauffeur: { active: false }
          }
        },
        score: 92,
        scoreDetails: {
          vigilanceDocuments: 25,
          icpeCompliance: 20,
          responseTime: 18,
          orderCompletion: 15,
          feedback: 14
        },
        notificationPreferences: { email: true, push: true, sms: false },
        lastLogin: daysAgo(1),
        source: 'invitation',
        createdAt: daysAgo(180),
        updatedAt: new Date()
      },

      // Logisticien 2: ACTIF avec 1 entrepot, alerte ICPE active
      {
        _id: IDS.logisticien2,
        email: 'stock-express@demo.io',
        companyName: 'Stock Express',
        siret: '98765432109876',
        vatNumber: 'FR98765432109',
        phone: '+33 4 91 00 00 01',
        address: {
          street: '200 Avenue du Port',
          city: 'Marseille',
          postalCode: '13002',
          country: 'France'
        },
        status: 'active',
        vigilanceStatus: 'warning', // Document expire bientot
        industrialClients: [
          {
            industrialId: IDS.industriel2,
            industrialName: 'TechProd SA',
            invitedAt: daysAgo(120),
            activatedAt: daysAgo(110),
            status: 'active',
            delegationType: 'full',
            delegatedSites: []
          }
        ],
        warehouses: [
          {
            warehouseId: IDS.warehouse2A,
            name: 'Entrepot Marseille Port',
            address: { street: '200 Quai du Port', city: 'Marseille', postalCode: '13002', country: 'France' },
            gpsCoordinates: { lat: 43.2965, lng: 5.3698 },
            surface: 25000,
            dockCount: 20,
            icpeStatus: 'autorisation',
            icpeRubriques: [
              {
                rubrique: '1510',
                libelle: 'Entrepot couvert',
                regime: 'A',
                seuilMax: 10000,
                unite: 'tonnes',
                dateDeclaration: daysAgo(730)
              },
              {
                rubrique: '4331',
                libelle: 'Liquides inflammables (cat 2)',
                regime: 'A',
                seuilMax: 150,
                unite: 'tonnes',
                dateDeclaration: daysAgo(730)
              }
            ],
            icpeNumero: 'ICPE-13-2022-0123',
            icpePrefecture: 'Bouches-du-Rhone',
            icpeDateDeclaration: daysAgo(730),
            icpeProchainControle: daysFromNow(90),
            certifications: ['ISO 9001', 'ISO 14001', 'OEA', 'IFS Logistics'],
            constraints: ['ADR', 'SEVESO SB'],
            isActive: true
          }
        ],
        contacts: [
          { type: 'direction', firstName: 'Sophie', lastName: 'Leclerc', email: 's.leclerc@stock-express.fr', phone: '+33 6 00 00 00 10', isMain: true }
        ],
        passwordHash,
        subscription: {
          type: 'free',
          startDate: daysAgo(110),
          monthlyPrice: 0,
          paidOptions: {
            bourseDeStockage: { active: true, activatedAt: daysAgo(30) },
            borneAccueilChauffeur: { active: true, activatedAt: daysAgo(30) }
          }
        },
        score: 78,
        scoreDetails: {
          vigilanceDocuments: 20,
          icpeCompliance: 15,
          responseTime: 18,
          orderCompletion: 15,
          feedback: 10
        },
        notificationPreferences: { email: true, push: true, sms: true },
        lastLogin: daysAgo(2),
        source: 'invitation',
        createdAt: daysAgo(120),
        updatedAt: new Date()
      },

      // Logisticien 3: ACTIF simple, 1 industriel, sans options payantes
      {
        _id: IDS.logisticien3,
        email: 'log-simple@demo.io',
        companyName: 'Logistique Simple',
        siret: '55555555555555',
        phone: '+33 1 00 00 00 01',
        address: { city: 'Paris', postalCode: '75012', country: 'France' },
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
            warehouseId: IDS.warehouse3A,
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
        contacts: [
          { type: 'direction', firstName: 'Paul', lastName: 'Petit', email: 'p.petit@log-simple.fr', isMain: true }
        ],
        passwordHash,
        subscription: {
          type: 'free',
          paidOptions: { bourseDeStockage: { active: false }, borneAccueilChauffeur: { active: false } }
        },
        score: 85,
        lastLogin: daysAgo(5),
        createdAt: daysAgo(60),
        updatedAt: new Date()
      },

      // Logisticien 4: INVITE (en attente d'onboarding)
      {
        _id: IDS.logisticienInvited,
        email: 'nouveau-log@demo.io',
        companyName: 'Nouveau Logisticien',
        status: 'invited',
        vigilanceStatus: 'pending',
        industrialClients: [
          {
            industrialId: IDS.industriel1,
            industrialName: 'ACME Industries',
            invitedAt: daysAgo(3),
            status: 'pending',
            delegationType: 'full'
          }
        ],
        warehouses: [],
        contacts: [],
        invitationToken: 'DEMO-INVITE-TOKEN-123456',
        invitationExpiry: daysFromNow(4),
        invitedBy: IDS.industriel1.toString(),
        subscription: { type: 'free', paidOptions: {} },
        createdAt: daysAgo(3),
        updatedAt: new Date()
      },

      // Logisticien 5: EN ONBOARDING (step 2)
      {
        _id: IDS.logisticienOnboarding,
        email: 'onboarding@demo.io',
        companyName: 'Log en Cours',
        siret: '77777777777777',
        status: 'onboarding',
        vigilanceStatus: 'pending',
        industrialClients: [
          {
            industrialId: IDS.industriel2,
            industrialName: 'TechProd SA',
            invitedAt: daysAgo(5),
            status: 'pending',
            delegationType: 'full'
          }
        ],
        warehouses: [],
        contacts: [],
        passwordHash,
        subscription: { type: 'free', paidOptions: {} },
        createdAt: daysAgo(5),
        updatedAt: daysAgo(2)
      },

      // Logisticien 6: BLOQUE (documents expires)
      {
        _id: IDS.logisticienBlocked,
        email: 'blocked@demo.io',
        companyName: 'Logisticien Bloque',
        siret: '99999999999999',
        status: 'blocked',
        vigilanceStatus: 'blocked',
        blockedReason: 'documents_expired',
        blockedAt: daysAgo(15),
        blockingHistory: [
          {
            reason: 'documents_expired',
            description: 'Kbis et attestation URSSAF expires depuis plus de 30 jours',
            blockedAt: daysAgo(15),
            blockedBy: 'system'
          }
        ],
        industrialClients: [
          {
            industrialId: IDS.industriel1,
            industrialName: 'ACME Industries',
            invitedAt: daysAgo(200),
            activatedAt: daysAgo(190),
            status: 'suspended',
            delegationType: 'full'
          }
        ],
        warehouses: [
          {
            warehouseId: 'WH-BLOCKED-001',
            name: 'Entrepot Bloque',
            surface: 3000,
            dockCount: 2,
            isActive: false
          }
        ],
        passwordHash,
        subscription: { type: 'free', paidOptions: {} },
        score: 45,
        createdAt: daysAgo(200),
        updatedAt: daysAgo(15)
      }
    ];

    await db.collection('logisticians').insertMany(logisticians);
    console.log(`  + ${logisticians.length} logisticiens crees`);

    // ========================================
    // 3. DOCUMENTS VIGILANCE
    // ========================================
    console.log('\n[3/8] Creation des documents de vigilance...');

    const documents = [
      // Logisticien 1 - Documents valides
      {
        _id: IDS.doc1,
        logisticianId: IDS.logisticien1,
        warehouseId: null,
        documentType: 'kbis',
        fileName: 'kbis_durand_2024.pdf',
        s3Key: 'logisticians/675100000000000000000001/company/kbis/kbis_durand_2024.pdf',
        s3Bucket: 'rt-logistician-documents',
        status: 'verified',
        expiresAt: daysFromNow(60),
        uploadedAt: daysAgo(30),
        verifiedAt: daysAgo(28),
        verifiedBy: 'admin@symphonia.io'
      },
      {
        _id: IDS.doc2,
        logisticianId: IDS.logisticien1,
        warehouseId: null,
        documentType: 'urssaf',
        fileName: 'urssaf_durand_q4_2024.pdf',
        s3Key: 'logisticians/675100000000000000000001/company/urssaf/urssaf_durand.pdf',
        status: 'verified',
        expiresAt: daysFromNow(45),
        uploadedAt: daysAgo(45),
        verifiedAt: daysAgo(43),
        verifiedBy: 'admin@symphonia.io'
      },
      {
        _id: IDS.doc3,
        logisticianId: IDS.logisticien1,
        warehouseId: null,
        documentType: 'insurance_rc',
        fileName: 'rc_pro_durand_2024.pdf',
        s3Key: 'logisticians/675100000000000000000001/company/insurance_rc/rc_pro.pdf',
        status: 'verified',
        expiresAt: daysFromNow(200),
        uploadedAt: daysAgo(165),
        verifiedAt: daysAgo(163),
        verifiedBy: 'admin@symphonia.io'
      },
      {
        _id: IDS.doc4,
        logisticianId: IDS.logisticien1,
        warehouseId: IDS.warehouse1A,
        documentType: 'icpe_enregistrement',
        fileName: 'icpe_lyon_nord_2024.pdf',
        s3Key: 'logisticians/675100000000000000000001/WH-LOG1-001/icpe_enregistrement/icpe.pdf',
        status: 'verified',
        expiresAt: null, // ICPE n'expire pas
        uploadedAt: daysAgo(175),
        verifiedAt: daysAgo(173),
        verifiedBy: 'admin@symphonia.io',
        ocrExtracted: {
          success: true,
          rubriques: ['1510', '2662'],
          confidence: 'high'
        }
      },
      {
        _id: IDS.doc5,
        logisticianId: IDS.logisticien1,
        warehouseId: IDS.warehouse1A,
        documentType: 'conformite_incendie',
        fileName: 'conformite_incendie_lyon_nord.pdf',
        s3Key: 'logisticians/675100000000000000000001/WH-LOG1-001/conformite_incendie/cert.pdf',
        status: 'verified',
        expiresAt: daysFromNow(180),
        uploadedAt: daysAgo(185),
        verifiedAt: daysAgo(183),
        verifiedBy: 'admin@symphonia.io'
      },

      // Logisticien 2 - Document expire bientot (warning)
      {
        _id: IDS.docExpired,
        logisticianId: IDS.logisticien2,
        warehouseId: null,
        documentType: 'urssaf',
        fileName: 'urssaf_stock_express.pdf',
        s3Key: 'logisticians/675100000000000000000002/company/urssaf/urssaf.pdf',
        status: 'verified',
        expiresAt: daysFromNow(10), // Expire dans 10 jours!
        uploadedAt: daysAgo(80),
        verifiedAt: daysAgo(78),
        verifiedBy: 'admin@symphonia.io'
      },

      // Logisticien 2 - Document en attente de verification
      {
        _id: IDS.docPending,
        logisticianId: IDS.logisticien2,
        warehouseId: IDS.warehouse2A,
        documentType: 'rapport_inspection',
        fileName: 'rapport_dreal_2024.pdf',
        s3Key: 'logisticians/675100000000000000000002/WH-LOG2-001/rapport_inspection/rapport.pdf',
        status: 'pending',
        expiresAt: daysFromNow(365),
        uploadedAt: daysAgo(2),
        notes: 'Rapport DREAL suite inspection du 28/12/2024'
      }
    ];

    await db.collection('logistician_documents').insertMany(documents);
    console.log(`  + ${documents.length} documents crees`);

    // ========================================
    // 4. DECLARATIONS ICPE HEBDOMADAIRES
    // ========================================
    console.log('\n[4/8] Creation des declarations ICPE...');

    const currentWeek = getISOWeek(new Date());
    const currentYear = new Date().getFullYear();

    const declarations = [
      // Logisticien 1, Entrepot Lyon Nord - Semaine en cours
      {
        _id: IDS.decl1,
        logisticianId: IDS.logisticien1,
        warehouseId: IDS.warehouse1A,
        weekNumber: currentWeek,
        year: currentYear,
        declaredAt: daysAgo(2),
        declaredBy: 'logistique-durand@demo.io',
        volumes: [
          {
            rubrique: '1510',
            libelle: 'Entrepot couvert',
            volume: 4200,
            unite: 'tonnes',
            seuilMax: 5000,
            percentageUsed: 84,
            alertLevel: 'warning'
          },
          {
            rubrique: '2662',
            libelle: 'Stockage de polymeres',
            volume: 1100,
            unite: 'tonnes',
            seuilMax: 2000,
            percentageUsed: 55,
            alertLevel: 'ok'
          }
        ],
        status: 'submitted',
        notes: 'Augmentation temporaire due aux fetes'
      },

      // Logisticien 1, Entrepot Lyon Nord - Semaine precedente
      {
        _id: IDS.decl2,
        logisticianId: IDS.logisticien1,
        warehouseId: IDS.warehouse1A,
        weekNumber: currentWeek - 1,
        year: currentYear,
        declaredAt: daysAgo(9),
        declaredBy: 'logistique-durand@demo.io',
        volumes: [
          {
            rubrique: '1510',
            volume: 3800,
            seuilMax: 5000,
            percentageUsed: 76,
            alertLevel: 'ok'
          },
          {
            rubrique: '2662',
            volume: 950,
            seuilMax: 2000,
            percentageUsed: 47.5,
            alertLevel: 'ok'
          }
        ],
        status: 'validated',
        validatedAt: daysAgo(7),
        validatedBy: 'system'
      },

      // Logisticien 2, Marseille - Semaine en cours avec ALERTE CRITIQUE
      {
        _id: IDS.decl3,
        logisticianId: IDS.logisticien2,
        warehouseId: IDS.warehouse2A,
        weekNumber: currentWeek,
        year: currentYear,
        declaredAt: daysAgo(1),
        declaredBy: 'stock-express@demo.io',
        volumes: [
          {
            rubrique: '1510',
            libelle: 'Entrepot couvert',
            volume: 9200,
            unite: 'tonnes',
            seuilMax: 10000,
            percentageUsed: 92,
            alertLevel: 'critical'
          },
          {
            rubrique: '4331',
            libelle: 'Liquides inflammables',
            volume: 85,
            unite: 'tonnes',
            seuilMax: 150,
            percentageUsed: 56.7,
            alertLevel: 'ok'
          }
        ],
        status: 'submitted',
        notes: 'Pic d\'activite fin d\'annee - surveillance renforcee'
      }
    ];

    await db.collection('icpe_volume_declarations').insertMany(declarations);
    console.log(`  + ${declarations.length} declarations ICPE creees`);

    // ========================================
    // 5. ALERTES VIGILANCE
    // ========================================
    console.log('\n[5/8] Creation des alertes vigilance...');

    const alerts = [
      // Alerte document expire bientot
      {
        _id: IDS.alert1,
        logisticianId: IDS.logisticien2,
        industrialId: IDS.industriel2,
        documentType: 'urssaf',
        documentId: IDS.docExpired,
        alertType: 'document_expiring_15',
        severity: 'warning',
        title: 'Attestation URSSAF expire dans 10 jours',
        message: 'L\'attestation URSSAF de Stock Express expire le ' + daysFromNow(10).toLocaleDateString('fr-FR') + '. Veuillez la renouveler.',
        isResolved: false,
        autoBlockAt: daysFromNow(10),
        notificationsSent: [
          { channel: 'email', sentAt: daysAgo(5), recipient: 'stock-express@demo.io' }
        ],
        createdAt: daysAgo(5)
      },

      // Alerte ICPE seuil warning
      {
        _id: IDS.alert2,
        logisticianId: IDS.logisticien1,
        warehouseId: IDS.warehouse1A,
        alertType: 'icpe_seuil_warning',
        severity: 'warning',
        rubrique: '1510',
        title: 'Seuil ICPE 1510 - 84%',
        message: 'Le volume declare pour la rubrique 1510 (Entrepot couvert) atteint 84% du seuil autorise.',
        actionRequired: false,
        isResolved: false,
        createdAt: daysAgo(2)
      },

      // Alerte ICPE seuil critique
      {
        _id: IDS.alert3,
        logisticianId: IDS.logisticien2,
        warehouseId: IDS.warehouse2A,
        alertType: 'icpe_seuil_critical',
        severity: 'critical',
        rubrique: '1510',
        title: 'URGENT: Seuil ICPE 1510 - 92%',
        message: 'ATTENTION: Le volume declare pour la rubrique 1510 atteint 92% du seuil. Action immediate requise.',
        actionRequired: true,
        actionLabel: 'Mettre a jour declaration ICPE ou reduire stock',
        isResolved: false,
        notificationsSent: [
          { channel: 'email', sentAt: daysAgo(1), recipient: 'stock-express@demo.io' },
          { channel: 'email', sentAt: daysAgo(1), recipient: 'industrie2@demo.io' }
        ],
        createdAt: daysAgo(1)
      }
    ];

    await db.collection('logistician_vigilance_alerts').insertMany(alerts);
    console.log(`  + ${alerts.length} alertes creees`);

    // ========================================
    // 6. EVENEMENTS LOGISTICIEN
    // ========================================
    console.log('\n[6/8] Creation des evenements...');

    const events = [
      // Logisticien 1
      { logisticianId: IDS.logisticien1, type: 'invited', payload: { industrialName: 'ACME Industries' }, timestamp: daysAgo(180) },
      { logisticianId: IDS.logisticien1, type: 'onboarding_started', payload: { step: 1 }, timestamp: daysAgo(178) },
      { logisticianId: IDS.logisticien1, type: 'onboarding_completed', payload: { warehouseCount: 2 }, timestamp: daysAgo(176) },
      { logisticianId: IDS.logisticien1, type: 'validated', payload: { activatedAt: daysAgo(175) }, timestamp: daysAgo(175) },
      { logisticianId: IDS.logisticien1, type: 'industrial_added', payload: { industrialName: 'TechProd SA' }, timestamp: daysAgo(90) },
      { logisticianId: IDS.logisticien1, type: 'option_activated', payload: { option: 'bourseDeStockage', price: 150 }, timestamp: daysAgo(60) },
      { logisticianId: IDS.logisticien1, type: 'icpe_volume_declared', payload: { warehouseId: IDS.warehouse1A, weekNumber: currentWeek }, timestamp: daysAgo(2) },
      { logisticianId: IDS.logisticien1, type: 'login', payload: { ip: '192.168.1.1' }, timestamp: daysAgo(1) },

      // Logisticien 2
      { logisticianId: IDS.logisticien2, type: 'invited', payload: { industrialName: 'TechProd SA' }, timestamp: daysAgo(120) },
      { logisticianId: IDS.logisticien2, type: 'validated', payload: {}, timestamp: daysAgo(110) },
      { logisticianId: IDS.logisticien2, type: 'option_activated', payload: { option: 'bourseDeStockage', price: 150 }, timestamp: daysAgo(30) },
      { logisticianId: IDS.logisticien2, type: 'option_activated', payload: { option: 'borneAccueilChauffeur', price: 100 }, timestamp: daysAgo(30) },
      { logisticianId: IDS.logisticien2, type: 'icpe_volume_declared', payload: { warehouseId: IDS.warehouse2A, weekNumber: currentWeek, alertCount: 1 }, timestamp: daysAgo(1) },

      // Logisticien bloque
      { logisticianId: IDS.logisticienBlocked, type: 'blocked', payload: { reason: 'documents_expired' }, timestamp: daysAgo(15) }
    ];

    await db.collection('logistician_events').insertMany(events.map(e => ({ ...e, createdAt: e.timestamp })));
    console.log(`  + ${events.length} evenements crees`);

    // ========================================
    // 7. COMMANDES TRANSPORT (pour test portail)
    // ========================================
    console.log('\n[7/8] Creation des commandes de transport...');

    const orders = [
      // Commande 1: Pickup a l'entrepot du Logisticien 1
      {
        _id: IDS.order1,
        orderNumber: 'ORD-DEMO-001',
        industrialId: IDS.industriel1,
        status: 'pending',
        pickup: {
          type: 'warehouse',
          warehouseId: IDS.warehouse1A,
          logisticianId: IDS.logisticien1,
          name: 'Entrepot Lyon Nord',
          address: { city: 'Lyon', postalCode: '69100' },
          requestedDate: daysFromNow(2),
          requestedTimeSlot: { from: '08:00', to: '12:00' }
        },
        delivery: {
          type: 'client',
          name: 'Client Final A',
          address: { city: 'Grenoble', postalCode: '38000' },
          requestedDate: daysFromNow(2)
        },
        goods: {
          description: 'Palettes de produits finis',
          weight: 12000,
          pallets: 20
        },
        createdAt: daysAgo(1),
        updatedAt: new Date()
      },

      // Commande 2: Delivery a l'entrepot du Logisticien 1
      {
        _id: IDS.order2,
        orderNumber: 'ORD-DEMO-002',
        industrialId: IDS.industriel1,
        status: 'in_transit',
        pickup: {
          type: 'supplier',
          name: 'Fournisseur B',
          address: { city: 'Milan', country: 'IT' }
        },
        delivery: {
          type: 'warehouse',
          warehouseId: IDS.warehouse1A,
          logisticianId: IDS.logisticien1,
          name: 'Entrepot Lyon Nord',
          address: { city: 'Lyon', postalCode: '69100' },
          requestedDate: daysFromNow(1),
          requestedTimeSlot: { from: '14:00', to: '18:00' }
        },
        goods: {
          description: 'Matieres premieres',
          weight: 18000,
          pallets: 33
        },
        rdv: {
          confirmedDate: daysFromNow(1),
          confirmedSlot: { from: '15:00', to: '16:00' },
          dockAssigned: 'Quai 5',
          confirmedBy: 'logistique-durand@demo.io'
        },
        createdAt: daysAgo(5),
        updatedAt: daysAgo(1)
      },

      // Commande 3: Pour Logisticien 2
      {
        _id: IDS.order3,
        orderNumber: 'ORD-DEMO-003',
        industrialId: IDS.industriel2,
        status: 'pending',
        pickup: {
          type: 'warehouse',
          warehouseId: IDS.warehouse2A,
          logisticianId: IDS.logisticien2,
          name: 'Entrepot Marseille Port',
          address: { city: 'Marseille', postalCode: '13002' },
          requestedDate: daysFromNow(3)
        },
        delivery: {
          type: 'client',
          name: 'Client C',
          address: { city: 'Toulouse', postalCode: '31000' }
        },
        goods: {
          description: 'Produits chimiques (ADR)',
          weight: 8000,
          pallets: 16,
          adr: true
        },
        createdAt: daysAgo(2),
        updatedAt: new Date()
      }
    ];

    await db.collection('transport_orders').insertMany(orders);
    console.log(`  + ${orders.length} commandes creees`);

    // ========================================
    // 8. RESUME
    // ========================================
    console.log('\n[8/8] Verification finale...');

    const counts = {
      logisticians: await db.collection('logisticians').countDocuments(),
      documents: await db.collection('logistician_documents').countDocuments(),
      declarations: await db.collection('icpe_volume_declarations').countDocuments(),
      alerts: await db.collection('logistician_vigilance_alerts').countDocuments(),
      events: await db.collection('logistician_events').countDocuments(),
      orders: await db.collection('transport_orders').countDocuments({ _id: { $in: [IDS.order1, IDS.order2, IDS.order3] } })
    };

    console.log('');
    console.log('='.repeat(70));
    console.log('  SEED COMPLETE');
    console.log('='.repeat(70));
    console.log('');
    console.log('  Collections creees:');
    console.log(`    - Logisticiens: ${counts.logisticians}`);
    console.log(`    - Documents vigilance: ${counts.documents}`);
    console.log(`    - Declarations ICPE: ${counts.declarations}`);
    console.log(`    - Alertes: ${counts.alerts}`);
    console.log(`    - Evenements: ${counts.events}`);
    console.log(`    - Commandes test: ${counts.orders}`);
    console.log('');
    console.log('  Comptes de test:');
    console.log('');
    console.log('  LOGISTICIENS (mot de passe: Demo2024!)');
    console.log('    - logistique-durand@demo.io : ACTIF, 2 entrepots, 2 industriels, Bourse Stockage');
    console.log('    - stock-express@demo.io     : ACTIF, 1 entrepot SEVESO, alertes ICPE');
    console.log('    - log-simple@demo.io        : ACTIF, basique');
    console.log('    - nouveau-log@demo.io       : INVITE (token: DEMO-INVITE-TOKEN-123456)');
    console.log('    - onboarding@demo.io        : EN ONBOARDING');
    console.log('    - blocked@demo.io           : BLOQUE');
    console.log('');
    console.log('  INDUSTRIELS');
    console.log('    - demo-industriel@symphonia.io : 2 logisticiens delegues');
    console.log('    - industrie2@demo.io           : 2 logisticiens delegues');
    console.log('');
    console.log('  SCENARIOS DE TEST:');
    console.log('    1. Connexion portail logisticien avec logistique-durand@demo.io');
    console.log('    2. Voir les commandes pickups/deliveries sur ses entrepots');
    console.log('    3. Dashboard ICPE industriel avec alertes');
    console.log('    4. Document expire dans 10 jours (stock-express, URSSAF)');
    console.log('    5. Alerte ICPE critique 92% (stock-express, rubrique 1510)');
    console.log('    6. Onboarding complet avec nouveau-log@demo.io');
    console.log('    7. Deblocage compte avec blocked@demo.io');
    console.log('');
    console.log('='.repeat(70));

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
