/**
 * Script simple pour tester l'API Dashdoc avec différentes méthodes d'authentification
 */

const axios = require('axios');

const DASHDOC_API_KEY = '8321c7a8f7fe8f75192fa15a6c883a11758e0084';
const DASHDOC_API_URL = 'https://api.dashdoc.com/api/v4';

async function testMethod(name, config) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${name}`);
  console.log('='.repeat(60));

  try {
    console.log(`URL: ${config.url}`);
    console.log(`Headers:`, JSON.stringify(config.headers, null, 2));

    const response = await axios(config);

    console.log(`✅ SUCCÈS - HTTP ${response.status}`);
    console.log(`Nombre de résultats: ${response.data.count || 0}`);

    if (response.data.results && response.data.results.length > 0) {
      console.log(`\n📦 Premier transport:`);
      const t = response.data.results[0];
      console.log(`   UID: ${t.uid}`);
      console.log(`   Status: ${t.status}`);
      console.log(`   Origin: ${t.origin?.address?.city || 'N/A'} (${t.origin?.address?.postcode || 'N/A'})`);
      console.log(`   Destination: ${t.destination?.address?.city || 'N/A'} (${t.destination?.address?.postcode || 'N/A'})`);

      // Analyser les prix disponibles
      console.log(`\n💰 Analyse des prix:`);

      if (t.pricing) {
        console.log(`   📊 Pricing object présent:`);
        Object.keys(t.pricing).forEach(key => {
          if (typeof t.pricing[key] === 'number' || key.includes('price') || key.includes('amount')) {
            console.log(`      ${key}: ${t.pricing[key]}`);
          }
        });
      } else {
        console.log(`   ⚠️ Pas de pricing object`);
      }

      if (t.charter) {
        console.log(`   🚛 Charter object présent:`);
        if (t.charter.price) console.log(`      charter.price: ${t.charter.price}`);
        if (t.charter.purchase_price) console.log(`      charter.purchase_price: ${t.charter.purchase_price}`);
        if (t.charter.carrier) console.log(`      charter.carrier: ${t.charter.carrier.name}`);
      }

      if (t.subcontracting) {
        console.log(`   📋 Subcontracting object présent:`);
        if (t.subcontracting.price) console.log(`      subcontracting.price: ${t.subcontracting.price}`);
        if (t.subcontracting.purchase_price) console.log(`      subcontracting.purchase_price: ${t.subcontracting.purchase_price}`);
        if (t.subcontracting.carrier) console.log(`      subcontracting.carrier: ${t.subcontracting.carrier.name}`);
      }

      // Afficher la structure complète pour analyse
      console.log(`\n📋 Clés disponibles dans le transport:`);
      console.log(`   ${Object.keys(t).join(', ')}`);
    }

    return true;

  } catch (error) {
    console.log(`❌ ÉCHEC`);

    if (error.response) {
      console.log(`HTTP Status: ${error.response.status} ${error.response.statusText}`);
      console.log(`Erreur:`, JSON.stringify(error.response.data, null, 2));

      if (error.response.status === 401) {
        console.log(`\n⚠️ ERREUR 401 - Authentification échouée`);
        console.log(`Causes possibles:`);
        console.log(`  1. Clé API invalide ou expirée`);
        console.log(`  2. Format d'authentification incorrect`);
        console.log(`  3. Permissions insuffisantes`);
      } else if (error.response.status === 403) {
        console.log(`\n⚠️ ERREUR 403 - Accès refusé`);
        console.log(`La clé API est valide mais n'a pas les permissions nécessaires`);
      } else if (error.response.status === 404) {
        console.log(`\n⚠️ ERREUR 404 - Endpoint inexistant`);
      }
    } else if (error.request) {
      console.log(`❌ Pas de réponse du serveur`);
      console.log(`Erreur réseau:`, error.message);
    } else {
      console.log(`❌ Erreur:`, error.message);
    }

    return false;
  }
}

async function runTests() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`DIAGNOSTIC API DASHDOC`);
  console.log(`='.repeat(60)}`);
  console.log(`\nClé API: ${DASHDOC_API_KEY.substring(0, 20)}...`);
  console.log(`URL: ${DASHDOC_API_URL}`);

  const tests = [
    {
      name: '1. Authorization: Bearer (méthode standard)',
      config: {
        method: 'GET',
        url: `${DASHDOC_API_URL}/transports/`,
        headers: {
          'Authorization': `Bearer ${DASHDOC_API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: {
          page_size: 1,
          ordering: '-created'
        }
      }
    },
    {
      name: '2. Authorization: Token (méthode alternative)',
      config: {
        method: 'GET',
        url: `${DASHDOC_API_URL}/transports/`,
        headers: {
          'Authorization': `Token ${DASHDOC_API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: {
          page_size: 1,
          ordering: '-created'
        }
      }
    },
    {
      name: '3. X-API-Key header',
      config: {
        method: 'GET',
        url: `${DASHDOC_API_URL}/transports/`,
        headers: {
          'X-API-Key': DASHDOC_API_KEY,
          'Content-Type': 'application/json'
        },
        params: {
          page_size: 1,
          ordering: '-created'
        }
      }
    },
    {
      name: '4. Authorization: Bearer + status=done',
      config: {
        method: 'GET',
        url: `${DASHDOC_API_URL}/transports/`,
        headers: {
          'Authorization': `Bearer ${DASHDOC_API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: {
          status: 'done',
          page_size: 1,
          ordering: '-created'
        }
      }
    },
    {
      name: '5. Authorization: Bearer + is_subcontracted=true',
      config: {
        method: 'GET',
        url: `${DASHDOC_API_URL}/transports/`,
        headers: {
          'Authorization': `Bearer ${DASHDOC_API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: {
          is_subcontracted: true,
          page_size: 1,
          ordering: '-created'
        }
      }
    }
  ];

  let successCount = 0;

  for (const test of tests) {
    const success = await testMethod(test.name, test.config);
    if (success) {
      successCount++;
      console.log(`\n✅ ${test.name} a fonctionné !`);
      console.log(`\n🎯 SOLUTION TROUVÉE: Utiliser cette méthode d'authentification`);
      break; // Arrêter aux premier succès
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`RÉSULTAT FINAL`);
  console.log('='.repeat(60));

  if (successCount > 0) {
    console.log(`\n✅ ${successCount} méthode(s) fonctionnelle(s) trouvée(s)`);
    console.log(`\n📝 PROCHAINES ÉTAPES:`);
    console.log(`   1. Mettre à jour le code de pricing.service.js avec la bonne méthode`);
    console.log(`   2. Tester l'import avec dryRun=true`);
    console.log(`   3. Lancer l'import réel`);
  } else {
    console.log(`\n❌ Aucune méthode d'authentification n'a fonctionné`);
    console.log(`\n📝 PROCHAINES ACTIONS:`);
    console.log(`   1. Vérifier que la clé API est active dans Dashdoc`);
    console.log(`   2. Vérifier les permissions de la clé`);
    console.log(`   3. Régénérer une nouvelle clé API avec permissions complètes:`);
    console.log(`      - Lecture des transports`);
    console.log(`      - Accès aux données de tarification`);
    console.log(`      - Accès aux informations carrier`);
    console.log(`   4. Contacter le support Dashdoc: support@dashdoc.com`);
    console.log(`      Fournir: clé API, endpoint, code erreur, message`);
  }

  console.log('');
}

// Exécution
runTests().catch(error => {
  console.error('Erreur fatale:', error);
  process.exit(1);
});
