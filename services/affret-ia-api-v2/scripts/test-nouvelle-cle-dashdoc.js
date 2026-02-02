/**
 * Script rapide pour tester une NOUVELLE clé API Dashdoc
 *
 * Usage:
 *   node test-nouvelle-cle-dashdoc.js <VOTRE_NOUVELLE_CLE>
 *
 * Exemple:
 *   node test-nouvelle-cle-dashdoc.js a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
 */

const axios = require('axios');

const newApiKey = process.argv[2];

if (!newApiKey) {
  console.error('\n❌ Erreur: Clé API manquante\n');
  console.log('Usage:');
  console.log('  node test-nouvelle-cle-dashdoc.js <VOTRE_NOUVELLE_CLE>\n');
  console.log('Exemple:');
  console.log('  node test-nouvelle-cle-dashdoc.js a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6\n');
  process.exit(1);
}

const DASHDOC_API_URL = 'https://api.dashdoc.com/api/v4';

async function testNewKey() {
  console.log('\n' + '='.repeat(70));
  console.log('  TEST RAPIDE - NOUVELLE CLÉ API DASHDOC');
  console.log('='.repeat(70));
  console.log();
  console.log(`Clé API testée: ${newApiKey.substring(0, 20)}...`);
  console.log(`URL API: ${DASHDOC_API_URL}`);
  console.log();

  try {
    console.log('🔄 Test 1: Récupération d\'un transport...');

    const response = await axios.get(`${DASHDOC_API_URL}/transports/`, {
      headers: {
        'Authorization': `Bearer ${newApiKey}`,
        'Content-Type': 'application/json'
      },
      params: {
        page_size: 1,
        ordering: '-created'
      },
      timeout: 10000
    });

    console.log('✅ SUCCÈS ! La clé API fonctionne !\n');
    console.log(`HTTP Status: ${response.status} ${response.statusText}`);
    console.log(`Nombre total de transports: ${response.data.count || 0}`);

    if (response.data.results && response.data.results.length > 0) {
      console.log(`Premier transport trouvé: ${response.data.results[0].uid}`);
      console.log();
    }

    // Test 2: Transports complétés
    console.log('🔄 Test 2: Transports complétés (status=done)...');

    const response2 = await axios.get(`${DASHDOC_API_URL}/transports/`, {
      headers: {
        'Authorization': `Bearer ${newApiKey}`,
        'Content-Type': 'application/json'
      },
      params: {
        status: 'done',
        page_size: 1,
        ordering: '-created'
      },
      timeout: 10000
    });

    console.log(`✅ ${response2.data.count || 0} transports complétés trouvés\n`);

    // Test 3: Transports sous-traités
    console.log('🔄 Test 3: Transports sous-traités (is_subcontracted=true)...');

    const response3 = await axios.get(`${DASHDOC_API_URL}/transports/`, {
      headers: {
        'Authorization': `Bearer ${newApiKey}`,
        'Content-Type': 'application/json'
      },
      params: {
        status: 'done',
        is_subcontracted: true,
        page_size: 1,
        ordering: '-created'
      },
      timeout: 10000
    });

    console.log(`✅ ${response3.data.count || 0} transports sous-traités trouvés\n`);

    if (response3.data.results && response3.data.results.length > 0) {
      const t = response3.data.results[0];
      console.log('📦 Exemple de transport sous-traité:');
      console.log(`   UID: ${t.uid}`);
      console.log(`   Status: ${t.status}`);
      console.log(`   Created: ${t.created}`);

      if (t.origin?.address) {
        console.log(`   Origin: ${t.origin.address.city || 'N/A'} (${t.origin.address.postcode || 'N/A'})`);
      }
      if (t.destination?.address) {
        console.log(`   Destination: ${t.destination.address.city || 'N/A'} (${t.destination.address.postcode || 'N/A'})`);
      }

      // Vérifier les prix disponibles
      console.log('\n💰 Analyse des prix disponibles:');

      if (t.charter) {
        console.log('   ✅ charter object présent');
        if (t.charter.price) console.log(`      → charter.price: ${t.charter.price} ${t.charter.currency || 'EUR'}`);
        if (t.charter.purchase_price) console.log(`      → charter.purchase_price: ${t.charter.purchase_price}`);
        if (t.charter.carrier) console.log(`      → charter.carrier: ${t.charter.carrier.name}`);
      }

      if (t.subcontracting) {
        console.log('   ✅ subcontracting object présent');
        if (t.subcontracting.price) console.log(`      → subcontracting.price: ${t.subcontracting.price}`);
        if (t.subcontracting.purchase_price) console.log(`      → subcontracting.purchase_price: ${t.subcontracting.purchase_price}`);
        if (t.subcontracting.carrier) console.log(`      → subcontracting.carrier: ${t.subcontracting.carrier.name}`);
      }

      if (t.pricing) {
        console.log('   📊 pricing object présent');
        if (t.pricing.invoicing_amount) console.log(`      → pricing.invoicing_amount: ${t.pricing.invoicing_amount} (prix CLIENT)`);
        if (t.pricing.carrier_price) console.log(`      → pricing.carrier_price: ${t.pricing.carrier_price}`);
      }
    }

    // Résumé final
    console.log();
    console.log('='.repeat(70));
    console.log('  ✅ RÉSULTAT: CLÉ API VALIDE ET FONCTIONNELLE');
    console.log('='.repeat(70));
    console.log();
    console.log('📝 PROCHAINES ÉTAPES:');
    console.log();
    console.log('1. Mettre à jour la clé sur AWS Elastic Beanstalk:');
    console.log();
    console.log('   aws elasticbeanstalk update-environment \\');
    console.log('     --environment-name rt-affret-ia-api-prod-v4 \\');
    console.log('     --region eu-central-1 \\');
    console.log('     --option-settings \\');
    console.log(`       Namespace=aws:elasticbeanstalk:application:environment,OptionName=DASHDOC_API_KEY,Value="${newApiKey}"`);
    console.log();
    console.log('2. Attendre 2-3 minutes le redémarrage de l\'environnement');
    console.log();
    console.log('3. Tester l\'import avec dry-run:');
    console.log();
    console.log('   curl -X POST "http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/import/dashdoc" \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d \'{"organizationId":"test-org","months":6,"dryRun":true}\'');
    console.log();
    console.log('4. Si le test réussit, lancer l\'import réel (dryRun=false)');
    console.log();

  } catch (error) {
    console.log('❌ ÉCHEC - La clé ne fonctionne pas\n');

    if (error.response) {
      console.error(`HTTP Status: ${error.response.status} ${error.response.statusText}`);
      console.error(`Erreur: ${JSON.stringify(error.response.data, null, 2)}`);
      console.log();

      if (error.response.status === 401) {
        console.log('⚠️ ERREUR 401: Authentification échouée');
        console.log();
        console.log('Causes possibles:');
        console.log('  1. La clé API est incorrecte');
        console.log('  2. La clé a été copiée avec des espaces ou caractères invisibles');
        console.log('  3. La clé n\'a pas les bonnes permissions');
        console.log();
        console.log('Actions:');
        console.log('  - Vérifier que vous avez copié la clé complète (sans espaces)');
        console.log('  - Vérifier les permissions dans Dashdoc:');
        console.log('    • Lecture des transports');
        console.log('    • Accès aux données de tarification');
        console.log('    • Accès aux informations transporteur');
        console.log('  - Essayer de régénérer une nouvelle clé');
        console.log();
      } else if (error.response.status === 403) {
        console.log('⚠️ ERREUR 403: Permissions insuffisantes');
        console.log();
        console.log('La clé API est valide mais n\'a pas accès aux transports.');
        console.log('Vérifier les permissions de la clé dans Dashdoc.');
        console.log();
      }
    } else if (error.request) {
      console.error('❌ Pas de réponse du serveur');
      console.error(`Erreur réseau: ${error.message}`);
      console.log();
      console.log('Vérifier votre connexion internet et que l\'URL est correcte:');
      console.log(`  ${DASHDOC_API_URL}`);
      console.log();
    } else {
      console.error(`❌ Erreur: ${error.message}`);
      console.log();
    }

    process.exit(1);
  }
}

// Exécution
testNewKey().catch(error => {
  console.error('Erreur fatale:', error.message);
  process.exit(1);
});
