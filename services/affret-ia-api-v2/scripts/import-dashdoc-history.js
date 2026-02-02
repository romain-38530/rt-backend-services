/**
 * Script d'import de l'historique des prix depuis Dashdoc
 *
 * Usage:
 *   node scripts/import-dashdoc-history.js [options]
 *
 * Options:
 *   --months N         Nombre de mois d'historique à importer (défaut: 6)
 *   --org-id ID       ID de l'organisation (défaut: dashdoc-import)
 *   --dry-run         Mode simulation (n'écrit pas en base)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const pricingService = require('../services/pricing.service');

// Configuration MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://rtuser:Symphonia2024!@stagingrt1.abcd.mongodb.net/symphonia-staging?retryWrites=true&w=majority';

// Parse arguments
const args = process.argv.slice(2);
const options = {
  months: 6,
  orgId: 'dashdoc-import',
  dryRun: false
};

args.forEach((arg, index) => {
  if (arg === '--months' && args[index + 1]) {
    options.months = parseInt(args[index + 1]);
  }
  if (arg === '--org-id' && args[index + 1]) {
    options.orgId = args[index + 1];
  }
  if (arg === '--dry-run') {
    options.dryRun = true;
  }
});

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  IMPORT HISTORIQUE PRIX DEPUIS DASHDOC                    ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Connexion MongoDB
    console.log('[1/4] Connexion à MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connecté à MongoDB\n');

    // Vérifier configuration Dashdoc
    console.log('[2/4] Vérification configuration Dashdoc...');
    if (!process.env.DASHDOC_API_KEY) {
      throw new Error('❌ DASHDOC_API_KEY non configuré dans .env');
    }
    if (!process.env.DASHDOC_API_URL) {
      console.warn('⚠️  DASHDOC_API_URL non configuré, utilisation URL par défaut');
    }
    console.log('✅ Configuration Dashdoc OK\n');

    // Calculer période
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - options.months);

    console.log('[3/4] Import des données...');
    console.log(`    Période: ${startDate.toLocaleDateString()} → ${endDate.toLocaleDateString()}`);
    console.log(`    Organisation ID: ${options.orgId}`);
    console.log(`    Mode: ${options.dryRun ? '🔍 DRY-RUN (simulation)' : '💾 WRITE (écriture)'}\n`);

    if (options.dryRun) {
      console.log('⚠️  MODE DRY-RUN: Aucune donnée ne sera écrite en base\n');
    }

    // Import
    const result = await pricingService.importFromDashdoc({
      startDate,
      endDate,
      organizationId: options.orgId
    });

    console.log('\n[4/4] Résultats de l\'import:\n');
    console.log(`    ✅ Importés: ${result.imported}`);
    console.log(`    ⏭️  Ignorés: ${result.skipped}`);

    if (result.errors && result.errors.length > 0) {
      console.log(`    ❌ Erreurs: ${result.errors.length}`);
      console.log('\n    Détails erreurs:');
      result.errors.slice(0, 5).forEach(err => {
        console.log(`      - Transport ${err.transportId}: ${err.error}`);
      });
      if (result.errors.length > 5) {
        console.log(`      ... et ${result.errors.length - 5} autres`);
      }
    }

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  IMPORT TERMINÉ AVEC SUCCÈS                               ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n❌ ERREUR LORS DE L\'IMPORT:\n');
    console.error(`   ${error.message}\n`);

    if (error.response) {
      console.error('   Détails API Dashdoc:');
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Message: ${error.response.data?.message || error.response.statusText}\n`);
    }

    process.exit(1);
  } finally {
    // Fermer connexion
    await mongoose.connection.close();
    console.log('✅ Connexion MongoDB fermée\n');
  }
}

// Gestion Ctrl+C
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Import interrompu par l\'utilisateur\n');
  await mongoose.connection.close();
  process.exit(0);
});

// Lancement
main();
