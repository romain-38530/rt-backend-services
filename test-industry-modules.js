import https from 'https';
import http from 'http';
import fs from 'fs';

// Configuration des modules à tester
const modules = [
  {
    name: 'Login/Auth',
    apiUrl: 'ddaywxps9n701.cloudfront.net',
    endpoints: [
      { method: 'GET', path: '/health' },
      { method: 'GET', path: '/' },
      { method: 'OPTIONS', path: '/auth/login' }
    ]
  },
  {
    name: 'Orders',
    apiUrl: 'dh9acecfz0wg0.cloudfront.net',
    endpoints: [
      { method: 'GET', path: '/health' },
      { method: 'GET', path: '/api/v1/orders' },
      { method: 'OPTIONS', path: '/api/v1/orders' }
    ]
  },
  {
    name: 'Affret IA',
    apiUrl: 'd393yiia4ig3bw.cloudfront.net',
    endpoints: [
      { method: 'GET', path: '/health' },
      { method: 'GET', path: '/api/v1/affretia' },
      { method: 'OPTIONS', path: '/api/v1/affretia' }
    ]
  },
  {
    name: 'Storage Market',
    apiUrl: 'd1ea8wbaf6ws9i.cloudfront.net',
    endpoints: [
      { method: 'GET', path: '/health' },
      { method: 'GET', path: '/api/storage-offers' },
      { method: 'OPTIONS', path: '/api/storage-offers' }
    ]
  },
  {
    name: 'Pricing Grids',
    apiUrl: 'd39uizi9hzozo8.cloudfront.net',
    endpoints: [
      { method: 'GET', path: '/health' },
      { method: 'GET', path: '/api/pricing-grids' },
      { method: 'OPTIONS', path: '/api/pricing-grids' }
    ]
  },
  {
    name: 'Chatbot',
    apiUrl: 'de1913kh0ya48.cloudfront.net',
    endpoints: [
      { method: 'GET', path: '/health' },
      { method: 'GET', path: '/api/chatbot' },
      { method: 'OPTIONS', path: '/api/chatbot' }
    ]
  },
  {
    name: 'Training',
    apiUrl: 'd39f1h56c4jwz4.cloudfront.net',
    endpoints: [
      { method: 'GET', path: '/health' },
      { method: 'GET', path: '/api/training' },
      { method: 'OPTIONS', path: '/api/training' }
    ]
  },
  {
    name: 'Transporteurs',
    apiUrl: 'd39uizi9hzozo8.cloudfront.net',
    endpoints: [
      { method: 'GET', path: '/health' },
      { method: 'GET', path: '/api/carriers' },
      { method: 'OPTIONS', path: '/api/carriers' }
    ]
  },
  {
    name: 'Facturation/Billing',
    apiUrl: 'd1ciol606nbfs0.cloudfront.net',
    endpoints: [
      { method: 'GET', path: '/health' },
      { method: 'GET', path: '/api/invoices' },
      { method: 'OPTIONS', path: '/api/invoices' }
    ]
  },
  {
    name: 'Palettes Europe',
    apiUrl: 'd2o4ng8nutcmou.cloudfront.net',
    endpoints: [
      { method: 'GET', path: '/health' },
      { method: 'GET', path: '/api/palettes' },
      { method: 'OPTIONS', path: '/api/palettes' }
    ]
  }
];

// Fonction pour faire une requête HTTP/HTTPS
function makeRequest(hostname, path, method = 'GET') {
  return new Promise((resolve) => {
    const options = {
      hostname: hostname,
      path: path,
      method: method,
      headers: {
        'User-Agent': 'Industry-Portal-Test/1.0',
        'Accept': 'application/json',
        'Origin': 'https://industrie.symphonia-controltower.com'
      },
      timeout: 10000
    };

    const protocol = https;

    const req = protocol.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          success: true,
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          method: method,
          path: path
        });
      });
    });

    req.on('error', (error) => {
      resolve({
        success: false,
        error: error.message,
        method: method,
        path: path
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        error: 'Request timeout',
        method: method,
        path: path
      });
    });

    req.end();
  });
}

// Fonction pour tester un module
async function testModule(module) {
  console.log('\n' + '='.repeat(80));
  console.log(`MODULE: ${module.name}`);
  console.log(`API URL: https://${module.apiUrl}`);
  console.log('='.repeat(80));

  const results = {
    name: module.name,
    apiUrl: module.apiUrl,
    health: 'UNKNOWN',
    cors: 'UNKNOWN',
    endpoints: [],
    problems: []
  };

  // Tester chaque endpoint
  for (const endpoint of module.endpoints) {
    console.log(`\nTesting ${endpoint.method} ${endpoint.path}...`);

    const result = await makeRequest(module.apiUrl, endpoint.path, endpoint.method);

    if (!result.success) {
      console.log(`  FAIL: ${result.error}`);
      results.endpoints.push({
        method: endpoint.method,
        path: endpoint.path,
        status: 'FAIL',
        error: result.error
      });
      results.problems.push(`${endpoint.method} ${endpoint.path}: ${result.error}`);

      // Si c'est le health check qui échoue
      if (endpoint.path === '/health') {
        results.health = 'FAIL';
      }
    } else {
      const statusOk = result.statusCode >= 200 && result.statusCode < 500;
      console.log(`  ${statusOk ? 'OK' : 'FAIL'}: Status ${result.statusCode}`);

      // Vérifier les headers CORS
      const corsHeader = result.headers['access-control-allow-origin'];
      if (endpoint.method === 'OPTIONS' || endpoint.method === 'GET') {
        if (corsHeader) {
          console.log(`  CORS Header: ${corsHeader}`);
          results.cors = 'OK';
        } else {
          console.log(`  CORS Header: MISSING`);
          if (results.cors === 'UNKNOWN') {
            results.cors = 'FAIL';
            results.problems.push('Missing CORS headers');
          }
        }
      }

      // Afficher un aperçu de la réponse
      if (result.body && result.body.length > 0) {
        const preview = result.body.substring(0, 200);
        console.log(`  Response preview: ${preview}${result.body.length > 200 ? '...' : ''}`);
      }

      results.endpoints.push({
        method: endpoint.method,
        path: endpoint.path,
        status: statusOk ? 'OK' : 'FAIL',
        statusCode: result.statusCode,
        cors: corsHeader || 'MISSING',
        bodyLength: result.body ? result.body.length : 0
      });

      // Déterminer le statut de santé
      if (endpoint.path === '/health') {
        results.health = (result.statusCode === 200) ? 'OK' : 'FAIL';
        if (result.statusCode !== 200) {
          results.problems.push(`Health check returned ${result.statusCode}`);
        }
      }

      // Détecter les erreurs 4xx/5xx
      if (result.statusCode >= 400) {
        results.problems.push(`${endpoint.method} ${endpoint.path}: HTTP ${result.statusCode}`);
      }
    }

    // Petit délai entre les requêtes
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return results;
}

// Fonction principale
async function runTests() {
  console.log('DEBUT DES TESTS DU PORTAIL INDUSTRY');
  console.log('Date: ' + new Date().toISOString());
  console.log('Portal URL: https://industrie.symphonia-controltower.com');
  console.log('\n');

  const allResults = [];

  for (const module of modules) {
    const result = await testModule(module);
    allResults.push(result);

    // Délai entre les modules
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Générer le résumé
  console.log('\n\n');
  console.log('*'.repeat(80));
  console.log('RESUME DES TESTS');
  console.log('*'.repeat(80));

  const functional = allResults.filter(r => r.health === 'OK' && r.problems.length === 0);
  const withProblems = allResults.filter(r => r.health !== 'OK' || r.problems.length > 0);

  console.log('\n--- MODULES FONCTIONNELS ---');
  if (functional.length === 0) {
    console.log('Aucun module entièrement fonctionnel');
  } else {
    functional.forEach(r => {
      console.log(`  ${r.name} (${r.apiUrl})`);
    });
  }

  console.log('\n--- MODULES AVEC PROBLEMES ---');
  if (withProblems.length === 0) {
    console.log('Aucun problème détecté');
  } else {
    withProblems.forEach(r => {
      console.log(`\n  ${r.name} (${r.apiUrl})`);
      console.log(`    Health: ${r.health}`);
      console.log(`    CORS: ${r.cors}`);
      console.log(`    Problèmes:`);
      r.problems.forEach(p => {
        console.log(`      - ${p}`);
      });
    });
  }

  console.log('\n--- STATISTIQUES ---');
  console.log(`Total modules testés: ${allResults.length}`);
  console.log(`Modules fonctionnels: ${functional.length}`);
  console.log(`Modules avec problèmes: ${withProblems.length}`);

  const corsOk = allResults.filter(r => r.cors === 'OK').length;
  const corsFail = allResults.filter(r => r.cors === 'FAIL').length;
  console.log(`CORS OK: ${corsOk}`);
  console.log(`CORS FAIL: ${corsFail}`);

  console.log('\n--- ACTIONS CORRECTIVES RECOMMANDEES ---');

  // Analyser les problèmes communs
  const commonProblems = {
    cors: corsFail,
    timeout: allResults.filter(r => r.problems.some(p => p.includes('timeout'))).length,
    auth: allResults.filter(r => r.problems.some(p => p.includes('401') || p.includes('403'))).length,
    serverError: allResults.filter(r => r.problems.some(p => p.includes('500') || p.includes('502') || p.includes('503'))).length
  };

  if (commonProblems.cors > 0) {
    console.log(`1. Corriger les headers CORS sur ${commonProblems.cors} module(s)`);
    console.log('   - Ajouter Access-Control-Allow-Origin dans les réponses');
    console.log('   - Vérifier la configuration CloudFront');
  }

  if (commonProblems.timeout > 0) {
    console.log(`2. Investiguer les timeouts sur ${commonProblems.timeout} module(s)`);
    console.log('   - Vérifier que les services Lambda sont actifs');
    console.log('   - Augmenter les timeouts si nécessaire');
  }

  if (commonProblems.auth > 0) {
    console.log(`3. Vérifier l'authentification sur ${commonProblems.auth} module(s)`);
    console.log('   - Certains endpoints nécessitent peut-être un token');
  }

  if (commonProblems.serverError > 0) {
    console.log(`4. Corriger les erreurs serveur sur ${commonProblems.serverError} module(s)`);
    console.log('   - Vérifier les logs CloudWatch');
    console.log('   - Déboguer les fonctions Lambda');
  }

  console.log('\n' + '*'.repeat(80));
  console.log('FIN DES TESTS');
  console.log('*'.repeat(80));

  // Sauvegarder les résultats en JSON
  const reportPath = 'c:\\Users\\rtard\\rt-backend-services\\industry-test-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(allResults, null, 2));
  console.log(`\nRapport JSON sauvegardé: ${reportPath}`);
}

// Lancer les tests
runTests().catch(console.error);
