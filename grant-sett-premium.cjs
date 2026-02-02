const https = require('https');

const API_HOST = 'ddaywxps9n701.cloudfront.net';
const CARRIER_ID = '6980887cdef6432153c25be5';

async function apiRequest(method, path, body = null, token = null) {
  const bodyStr = body ? JSON.stringify(body) : '';

  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('GRANT PREMIUM TO SETT TRANSPORTS');
  console.log('='.repeat(60) + '\n');

  // 1. Login
  console.log('1. Connexion...');
  const loginResult = await apiRequest('POST', '/api/auth/login', {
    email: 'r.tardy@rt-groupe.com',
    password: 'Symphonia2026!'
  });

  if (loginResult.status !== 200 || !loginResult.data.token) {
    console.log('   ERREUR: Connexion échouée');
    console.log('   Response:', JSON.stringify(loginResult.data).substring(0, 200));
    return;
  }
  const token = loginResult.data.token;
  console.log('   OK - Connecté\n');

  // 2. Check carrier exists
  console.log('2. Vérification carrier SETT Transports...');
  const carrierResult = await apiRequest('GET', `/api/carriers/${CARRIER_ID}`, null, token);
  if (carrierResult.status === 200) {
    console.log(`   OK - Carrier trouvé: ${carrierResult.data.carrier?.companyName || carrierResult.data.companyName || 'SETT Transports'}`);
    console.log(`   Level actuel: ${carrierResult.data.carrier?.level || carrierResult.data.level || 'N/A'}`);
  } else {
    console.log(`   Info: Status ${carrierResult.status}`);
  }

  // 3. Grant Premium
  console.log('\n3. Attribution du statut PREMIUM...');
  const premiumResult = await apiRequest('POST', `/api/carriers/${CARRIER_ID}/premium/grant`, {
    notes: 'RT Groupe - Abonnement Premium SETT Transports'
  }, token);

  if (premiumResult.status === 200) {
    console.log('   OK - Premium accordé!');
    console.log(`   Carrier: ${premiumResult.data.carrier?.companyName}`);
    console.log(`   Level: ${premiumResult.data.carrier?.level}`);
  } else if (premiumResult.status === 400 && premiumResult.data?.error?.includes('deja Premium')) {
    console.log('   OK - Carrier déjà en Premium');
  } else {
    console.log(`   Status: ${premiumResult.status}`);
    console.log(`   Response: ${JSON.stringify(premiumResult.data).substring(0, 200)}`);
  }

  // 4. Verify
  console.log('\n4. Vérification finale...');
  const verifyResult = await apiRequest('GET', `/api/carriers/${CARRIER_ID}`, null, token);
  if (verifyResult.status === 200) {
    const carrier = verifyResult.data.carrier || verifyResult.data;
    console.log(`   Carrier: ${carrier.companyName}`);
    console.log(`   Level: ${carrier.level}`);
    console.log(`   Premium Since: ${carrier.premiumSince || 'N/A'}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('TERMINÉ');
  console.log('='.repeat(60));
}

main().catch(console.error);
