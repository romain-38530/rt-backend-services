/**
 * Script de correction du compte SETT Transports
 * Met a jour le compte dans rt-auth avec le plan PREMIUM
 *
 * Usage: node fix-sett-account.js
 */

const { MongoClient } = require('c:/Users/rtard/rt-backend-services/node_modules/.pnpm/mongodb@6.21.0/node_modules/mongodb');

// Configuration - URI de production MongoDB Atlas
const MONGODB_URI = 'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/?retryWrites=true&w=majority';
const AUTH_DB_NAME = 'rt-auth';

// Donnees SETT Transports
const SETT_EMAIL = 'r.tardy@rt-groupe.com';

const SETT_SUBSCRIPTION = {
  plan: 'transporteur-premium',
  planLevel: 'PREMIUM',
  planName: 'Transporteur Premium',
  price: 849,
  priceBreakdown: {
    base: 399, // Plan Premium
    accessIndustrielComplet: 499, // Pack fonctionnalites industrielles
    affretIATransporteur: 200, // AFFRET.IA
    trackingIAAutonome: 150 // Tracking IA
  },
  options: ['accessIndustrielComplet', 'affretIATransporteur', 'trackingIAAutonome'],
  status: 'active',
  startDate: new Date(),
  billingCycle: 'monthly',
  currency: 'EUR'
};

const SETT_MODULES = {
  // Modules transporteur Premium
  transporteurModule: true,
  dashboard: true,
  profilEntreprise: true,
  consultationMarketplace: true,
  reponseAppelsOffres: true,
  gpsTracking: true,
  ecmr: true,
  gestionFlotte: true,
  facturationAuto: true,
  palettesEurope: true,
  statistiquesAvancees: true,
  supportPrioritaire: true,

  // Modules industriels (pack 499 EUR)
  industrielModule: true,
  accessIndustriel: true,
  dashboardIndustriel: true,
  commandesIndustrielles: true,
  indicateursKpi: true,
  alertesCritiques: true,
  demandesTransport: true,
  facturation: true,
  bourseStockage: true,
  referencementTransporteurs: true,
  grillesTarifaires: true,
  planningChargement: true,
  vigilanceDocuments: true,

  // AFFRET.IA (200 EUR)
  affretIA: true,
  carrierShortlist: true,
  multiChannelBroadcast: true,
  autoNegotiation: true,
  carrierScoringSelection: true,

  // Tracking IA (150 EUR)
  trackingIA: true,
  emailTracking: true,
  etaMonitoring: true,
  delayAlerts: true,
  deliveryConfirmation: true
};

async function fixSettAccount() {
  let client;

  try {
    console.log('Connexion a MongoDB...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();

    const db = client.db(AUTH_DB_NAME);
    const usersCollection = db.collection('users');

    // Trouver le compte SETT
    console.log(`\nRecherche du compte ${SETT_EMAIL}...`);
    const user = await usersCollection.findOne({ email: SETT_EMAIL.toLowerCase() });

    if (!user) {
      console.log('ERREUR: Compte non trouve dans rt-auth!');
      console.log('Le compte doit etre cree via l\'API d\'inscription.');
      return;
    }

    console.log('\nCompte trouve:');
    console.log('  ID:', user._id);
    console.log('  Email:', user.email);
    console.log('  Plan actuel:', user.subscription?.planLevel || 'GRATUIT');
    console.log('  Modules actuels:', JSON.stringify(user.modules || {}, null, 2));

    // Mettre a jour avec le plan PREMIUM
    console.log('\nMise a jour vers PREMIUM...');

    const updateResult = await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: {
          subscription: SETT_SUBSCRIPTION,
          modules: SETT_MODULES,
          planLevel: 'PREMIUM',
          accountType: 'premium',
          updatedAt: new Date(),
          fixedAt: new Date(),
          fixedBy: 'fix-sett-account.js'
        }
      }
    );

    if (updateResult.modifiedCount > 0) {
      console.log('SUCCESS: Compte mis a jour!');

      // Verifier la mise a jour
      const updatedUser = await usersCollection.findOne({ _id: user._id });
      console.log('\nNouveau plan:', updatedUser.subscription?.planLevel);
      console.log('Prix total:', updatedUser.subscription?.price, 'EUR/mois');
      console.log('Options:', updatedUser.subscription?.options?.join(', '));

      console.log('\nModules actifs:');
      const activeModules = Object.entries(updatedUser.modules || {})
        .filter(([k, v]) => v === true)
        .map(([k]) => k);
      console.log('  -', activeModules.join('\n  - '));
    } else {
      console.log('ATTENTION: Aucune modification effectuee');
    }

  } catch (error) {
    console.error('ERREUR:', error.message);
  } finally {
    if (client) {
      await client.close();
      console.log('\nConnexion fermee.');
    }
  }
}

// Executer
fixSettAccount();
