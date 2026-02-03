/**
 * Test avec clé API Dashdoc vérifiée par les équipes Dashdoc
 * Clé confirmée opérationnelle: 8321c7a8f7fe8f75192fa15a6c883a11758e0084
 */

const axios = require('axios');

const API_KEY = '8321c7a8f7fe8f75192fa15a6c883a11758e0084';
const BASE_URL = 'https://api.dashdoc.com/api/v4';

console.log('\n' + '='.repeat(80));
console.log('  TEST AVEC CLÉ DASHDOC VÉRIFIÉE PAR LES ÉQUIPES');
console.log('='.repeat(80));
console.log();
console.log(`Clé API: ${API_KEY.substring(0, 20)}...`);
console.log(`Base URL: ${BASE_URL}`);
console.log();

async function testConfiguration(name, config) {
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`TEST: ${name}`);
  console.log('─'.repeat(80));

  try {
    console.log(`URL: ${config.url}`);
    console.log(`Headers:`, JSON.stringify(config.headers, null, 2));
    if (config.params) {
      console.log(`Params:`, JSON.stringify(config.params, null, 2));
    }
    console.log();

    const response = await axios(config);

    console.log(`✅ SUCCÈS - HTTP ${response.status}`);
    console.log(`Response data:`, JSON.stringify(response.data, null, 2).substring(0, 500));
    return true;

  } catch (error) {
    console.log(`❌ ÉCHEC`);

    if (error.response) {
      console.log(`HTTP Status: ${error.response.status} ${error.response.statusText}`);
      console.log(`Response:`, JSON.stringify(error.response.data, null, 2));

      // Afficher les headers de la réponse
      console.log(`Response Headers:`, JSON.stringify(error.response.headers, null, 2));
    } else if (error.request) {
      console.log(`Pas de réponse du serveur`);
      console.log(`Error:`, error.message);
    } else {
      console.log(`Error:`, error.message);
    }

    return false;
  }
}

async function runTests() {
  const tests = [
    // Test 1: Authorization Bearer (standard)
    {
      name: '1. Authorization: Bearer (standard)',
      config: {
        method: 'GET',
        url: `${BASE_URL}/transports/`,
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: {
          page_size: 1
        },
        timeout: 10000
      }
    },

    // Test 2: Token (alternative Django)
    {
      name: '2. Authorization: Token (Django style)',
      config: {
        method: 'GET',
        url: `${BASE_URL}/transports/`,
        headers: {
          'Authorization': `Token ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: {
          page_size: 1
        },
        timeout: 10000
      }
    },

    // Test 3: API-Key header
    {
      name: '3. X-API-Key header',
      config: {
        method: 'GET',
        url: `${BASE_URL}/transports/`,
        headers: {
          'X-API-Key': API_KEY,
          'Content-Type': 'application/json'
        },
        params: {
          page_size: 1
        },
        timeout: 10000
      }
    },

    // Test 4: Bearer + Accept header
    {
      name: '4. Bearer + Accept: application/json',
      config: {
        method: 'GET',
        url: `${BASE_URL}/transports/`,
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        params: {
          page_size: 1
        },
        timeout: 10000
      }
    },

    // Test 5: Sans Content-Type
    {
      name: '5. Bearer sans Content-Type',
      config: {
        method: 'GET',
        url: `${BASE_URL}/transports/`,
        headers: {
          'Authorization': `Bearer ${API_KEY}`
        },
        params: {
          page_size: 1
        },
        timeout: 10000
      }
    },

    // Test 6: Avec User-Agent
    {
      name: '6. Bearer + User-Agent',
      config: {
        method: 'GET',
        url: `${BASE_URL}/transports/`,
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Affret.IA/2.7.0'
        },
        params: {
          page_size: 1
        },
        timeout: 10000
      }
    },

    // Test 7: URL différente - me/
    {
      name: '7. Test endpoint /me/ (user info)',
      config: {
        method: 'GET',
        url: `${BASE_URL}/me/`,
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    },

    // Test 8: URL différente - companies/
    {
      name: '8. Test endpoint /companies/',
      config: {
        method: 'GET',
        url: `${BASE_URL}/companies/`,
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: {
          page_size: 1
        },
        timeout: 10000
      }
    },

    // Test 9: API v3 (au cas où)
    {
      name: '9. Test API v3 au lieu de v4',
      config: {
        method: 'GET',
        url: 'https://api.dashdoc.com/api/v3/transports/',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: {
          page_size: 1
        },
        timeout: 10000
      }
    },

    // Test 10: Sans params
    {
      name: '10. Bearer sans query params',
      config: {
        method: 'GET',
        url: `${BASE_URL}/transports/`,
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    }
  ];

  let successCount = 0;
  let successfulConfig = null;

  for (const test of tests) {
    const success = await testConfiguration(test.name, test.config);

    if (success) {
      successCount++;
      successfulConfig = test;
      console.log();
      console.log('🎉 CONFIGURATION FONCTIONNELLE TROUVÉE !');
      console.log();
      console.log('Configuration à utiliser:');
      console.log(JSON.stringify(test.config, null, 2));
      break; // Arrêter au premier succès
    }
  }

  console.log();
  console.log('='.repeat(80));
  console.log('  RÉSULTAT FINAL');
  console.log('='.repeat(80));
  console.log();

  if (successCount > 0) {
    console.log(`✅ ${successCount} configuration(s) fonctionnelle(s) trouvée(s)`);
    console.log();
    console.log('📝 PROCHAINES ÉTAPES:');
    console.log();
    console.log('1. Mettre à jour services/pricing.service.js avec la bonne configuration');
    console.log('2. Redéployer l\'application');
    console.log('3. Tester l\'import Dashdoc');
    console.log();
  } else {
    console.log('❌ Aucune configuration n\'a fonctionné');
    console.log();
    console.log('📝 ACTIONS À ENTREPRENDRE:');
    console.log();
    console.log('1. Contacter les équipes Dashdoc pour vérifier:');
    console.log('   - Le format exact d\'authentification requis');
    console.log('   - L\'URL de l\'API à utiliser');
    console.log('   - Les headers requis');
    console.log('   - Les permissions de la clé API');
    console.log();
    console.log('2. Demander un exemple de requête curl qui fonctionne');
    console.log();
    console.log('3. Vérifier si la clé est active pour le bon environnement:');
    console.log('   - Production: https://api.dashdoc.com/api/v4');
    console.log('   - Staging: https://api.staging.dashdoc.com/api/v4');
    console.log('   - Sandbox: https://api.sandbox.dashdoc.com/api/v4');
    console.log();
  }
}

// Exécution
runTests().catch(error => {
  console.error('Erreur fatale:', error);
  process.exit(1);
});
