/**
 * Script de synchronisation des données de scraping vers AFFRET.IA
 * Vérifie et importe les transporteurs scrapés depuis B2PWeb
 *
 * Usage: node scripts/sync-scraping-to-affretia.js [check|sync|stats]
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rt-affretia';
const ADMIN_MONGODB_URI = process.env.ADMIN_MONGODB_URI || MONGODB_URI.replace('/rt-affretia', '/rt-admin');

// Schémas simplifiés
const TransportCompanySchema = new mongoose.Schema({
  companyName: String,
  legalName: String,
  siret: String,
  email: String,
  phone: String,
  address: {
    street: String,
    postalCode: String,
    city: String,
    department: String,
    departmentCode: String,
    country: String
  },
  transportInfo: {
    services: [String],
    specializations: [String],
    vehicleTypes: [String],
    coveredDepartments: [String],
    fleetSize: Number
  },
  source: {
    type: String,
    name: String,
    url: String,
    scrapedAt: Date
  },
  prospectionStatus: String,
  addedToLeadPool: Boolean
}, { timestamps: true, collection: 'transportcompanies' });

const TransportOfferSchema = new mongoose.Schema({
  externalId: String,
  source: String,
  status: String,
  origin: {
    city: String,
    postalCode: String,
    country: String
  },
  destination: {
    city: String,
    postalCode: String,
    country: String
  },
  pickup: {
    date: Date
  },
  carrier: {
    name: String,
    email: String,
    phone: String
  }
}, { timestamps: true, collection: 'transportoffers' });

const ProspectCarrierSchema = new mongoose.Schema({
  carrierName: String,
  carrierEmail: String,
  carrierPhone: String,
  contactName: String,
  source: {
    type: String,
    firstSeen: Date,
    lastSeen: Date,
    interactionCount: Number
  },
  activityZones: [{
    fromPostal: String,
    fromCity: String,
    toPostal: String,
    toCity: String,
    frequency: Number
  }],
  transportTypes: {
    ftl: Boolean,
    ltl: Boolean,
    adr: Boolean,
    frigo: Boolean
  },
  prospectionStatus: String,
  trialOffer: {
    isActive: Boolean,
    transportsUsed: Number,
    maxTransports: Number
  }
}, { timestamps: true, collection: 'prospectcarriers' });

// Connexions aux bases de données
let adminConnection = null;
let affretiaConnection = null;

async function connectDatabases() {
  console.log('Connecting to databases...');

  // Connexion principale (affret_ia)
  affretiaConnection = await mongoose.createConnection(MONGODB_URI);
  console.log(`  Connected to AFFRET.IA DB: ${MONGODB_URI.split('@')[1]?.split('/')[1] || 'rt-affretia'}`);

  // Connexion admin (pour TransportCompany/TransportOffer)
  try {
    adminConnection = await mongoose.createConnection(ADMIN_MONGODB_URI);
    console.log(`  Connected to Admin DB: ${ADMIN_MONGODB_URI.split('@')[1]?.split('/')[1] || 'rt-admin'}`);
  } catch (err) {
    console.log('  Admin DB not available, using main DB for scraping data');
    adminConnection = affretiaConnection;
  }

  return {
    TransportCompany: adminConnection.model('TransportCompany', TransportCompanySchema),
    TransportOffer: adminConnection.model('TransportOffer', TransportOfferSchema),
    ProspectCarrier: affretiaConnection.model('ProspectCarrier', ProspectCarrierSchema)
  };
}

async function checkScrapingData(models) {
  console.log('\n=== Checking Scraping Data ===\n');

  // TransportCompany stats
  const companyCount = await models.TransportCompany.countDocuments();
  console.log(`TransportCompany records: ${companyCount}`);

  if (companyCount > 0) {
    const bySource = await models.TransportCompany.aggregate([
      { $group: { _id: '$source.name', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    console.log('  By source:');
    for (const s of bySource) {
      console.log(`    ${s._id || 'unknown'}: ${s.count}`);
    }

    const byStatus = await models.TransportCompany.aggregate([
      { $group: { _id: '$prospectionStatus', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    console.log('  By prospection status:');
    for (const s of byStatus) {
      console.log(`    ${s._id || 'unknown'}: ${s.count}`);
    }

    const withEmail = await models.TransportCompany.countDocuments({ email: { $exists: true, $ne: null, $ne: '' } });
    console.log(`  With email: ${withEmail} (${((withEmail/companyCount)*100).toFixed(1)}%)`);
  }

  // TransportOffer stats
  const offerCount = await models.TransportOffer.countDocuments();
  console.log(`\nTransportOffer records: ${offerCount}`);

  if (offerCount > 0) {
    const byOfferSource = await models.TransportOffer.aggregate([
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    console.log('  By source:');
    for (const s of byOfferSource) {
      console.log(`    ${s._id || 'unknown'}: ${s.count}`);
    }

    const recentOffers = await models.TransportOffer.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });
    console.log(`  Last 7 days: ${recentOffers}`);
  }

  // ProspectCarrier stats (déjà synchronisés)
  const prospectCount = await models.ProspectCarrier.countDocuments();
  console.log(`\nProspectCarrier records: ${prospectCount}`);

  if (prospectCount > 0) {
    const byProspectStatus = await models.ProspectCarrier.aggregate([
      { $group: { _id: '$prospectionStatus', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    console.log('  By status:');
    for (const s of byProspectStatus) {
      console.log(`    ${s._id || 'new'}: ${s.count}`);
    }

    const withContactName = await models.ProspectCarrier.countDocuments({
      contactName: { $exists: true, $ne: null, $ne: '' }
    });
    console.log(`  With contact name: ${withContactName}`);

    const withTrial = await models.ProspectCarrier.countDocuments({
      'trialOffer.isActive': true
    });
    console.log(`  With active trial: ${withTrial}`);
  }

  return { companyCount, offerCount, prospectCount };
}

async function syncCompaniesToProspects(models, dryRun = true) {
  console.log(`\n=== Syncing TransportCompany -> ProspectCarrier (${dryRun ? 'DRY RUN' : 'LIVE'}) ===\n`);

  // Trouver les entreprises avec email non encore importées
  const companies = await models.TransportCompany.find({
    email: { $exists: true, $ne: null, $ne: '' },
    prospectionStatus: { $in: ['new', 'to_contact', null] }
  }).limit(100);

  console.log(`Found ${companies.length} companies to potentially sync`);

  let created = 0;
  let skipped = 0;
  let updated = 0;

  for (const company of companies) {
    // Vérifier si existe déjà
    const existing = await models.ProspectCarrier.findOne({
      carrierEmail: company.email.toLowerCase()
    });

    if (existing) {
      skipped++;
      continue;
    }

    // Extraire zones d'activité
    const activityZones = [];
    if (company.transportInfo?.coveredDepartments?.length > 0) {
      for (const dept of company.transportInfo.coveredDepartments.slice(0, 5)) {
        activityZones.push({
          fromPostal: dept,
          fromCity: '',
          toPostal: '',
          toCity: '',
          frequency: 1
        });
      }
    }

    // Déterminer les types de transport
    const transportTypes = {
      ftl: company.transportInfo?.services?.some(s => /lot.*complet|ftl|full/i.test(s)) || false,
      ltl: company.transportInfo?.services?.some(s => /messagerie|groupage|ltl|partial/i.test(s)) || false,
      adr: company.transportInfo?.specializations?.some(s => /adr|danger/i.test(s)) || false,
      frigo: company.transportInfo?.specializations?.some(s => /frigo|froid|temp|refrig/i.test(s)) || false
    };

    const prospectData = {
      carrierName: company.companyName || company.legalName,
      carrierEmail: company.email.toLowerCase(),
      carrierPhone: company.phone,
      contactName: company.mainContact?.firstName && company.mainContact?.lastName
        ? `${company.mainContact.firstName} ${company.mainContact.lastName}`
        : null,
      source: {
        type: 'b2pweb',
        firstSeen: company.source?.scrapedAt || company.createdAt,
        lastSeen: company.updatedAt || new Date(),
        interactionCount: 0
      },
      activityZones,
      transportTypes,
      prospectionStatus: 'new',
      trialOffer: {
        isActive: false,
        transportsUsed: 0,
        maxTransports: 10
      }
    };

    if (!dryRun) {
      await models.ProspectCarrier.create(prospectData);

      // Marquer comme ajouté au lead pool
      await models.TransportCompany.updateOne(
        { _id: company._id },
        { $set: { addedToLeadPool: true, prospectionStatus: 'to_contact' } }
      );
    }

    created++;

    if (created <= 5) {
      console.log(`  + ${company.companyName} (${company.email})`);
    }
  }

  if (created > 5) {
    console.log(`  ... and ${created - 5} more`);
  }

  console.log(`\nSync results:`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped (already exists): ${skipped}`);
  console.log(`  Updated: ${updated}`);

  return { created, skipped, updated };
}

async function showRecentActivity(models) {
  console.log('\n=== Recent Scraping Activity ===\n');

  // Dernières entreprises scrapées
  const recentCompanies = await models.TransportCompany.find()
    .sort({ 'source.scrapedAt': -1, createdAt: -1 })
    .limit(5)
    .select('companyName email source.name source.scrapedAt createdAt');

  console.log('Last scraped companies:');
  for (const c of recentCompanies) {
    const date = c.source?.scrapedAt || c.createdAt;
    console.log(`  ${c.companyName} | ${c.email || 'no email'} | ${c.source?.name || 'unknown'} | ${date?.toLocaleDateString() || 'unknown'}`);
  }

  // Dernières offres
  const recentOffers = await models.TransportOffer.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .select('carrier.name origin.city destination.city source createdAt');

  console.log('\nLast transport offers:');
  for (const o of recentOffers) {
    console.log(`  ${o.carrier?.name || 'unknown'} | ${o.origin?.city} -> ${o.destination?.city} | ${o.source} | ${o.createdAt?.toLocaleDateString() || 'unknown'}`);
  }

  // Derniers prospects créés
  const recentProspects = await models.ProspectCarrier.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .select('carrierName carrierEmail prospectionStatus createdAt');

  console.log('\nLast prospects created:');
  for (const p of recentProspects) {
    console.log(`  ${p.carrierName} | ${p.carrierEmail} | ${p.prospectionStatus} | ${p.createdAt?.toLocaleDateString() || 'unknown'}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'check';

  try {
    const models = await connectDatabases();

    switch (command) {
      case 'check':
        await checkScrapingData(models);
        await showRecentActivity(models);
        break;

      case 'sync':
        await checkScrapingData(models);
        const dryRun = !args.includes('--live');
        if (dryRun) {
          console.log('\n⚠️  Running in DRY RUN mode. Use --live to actually sync.');
        }
        await syncCompaniesToProspects(models, dryRun);
        break;

      case 'stats':
        await checkScrapingData(models);
        break;

      default:
        console.log('Usage: node scripts/sync-scraping-to-affretia.js [check|sync|stats]');
        console.log('  check - Check scraping data and show recent activity (default)');
        console.log('  sync  - Sync TransportCompany to ProspectCarrier (dry run)');
        console.log('  sync --live - Actually perform the sync');
        console.log('  stats - Show statistics only');
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    if (adminConnection && adminConnection !== affretiaConnection) {
      await adminConnection.close();
    }
    if (affretiaConnection) {
      await affretiaConnection.close();
    }
    console.log('\nDisconnected from databases');
  }
}

main();
