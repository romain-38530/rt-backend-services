const https = require('https');

const API_HOST = 'ddaywxps9n701.cloudfront.net';

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
  console.log('FIND AND UPGRADE SETT TRANSPORTS TO PREMIUM');
  console.log('='.repeat(60) + '\n');

  // 1. Login
  console.log('1. Connexion...');
  const loginResult = await apiRequest('POST', '/api/auth/login', {
    email: 'r.tardy@rt-groupe.com',
    password: 'Symphonia2026!'
  });

  if (loginResult.status !== 200 || !loginResult.data.token) {
    console.log('   ERREUR:', JSON.stringify(loginResult.data).substring(0, 200));
    return;
  }
  const token = loginResult.data.token;
  const user = loginResult.data.user;
  console.log('   OK - Connecté');
  console.log(`   CarrierId from user: ${user.carrierId}`);

  // 2. Search carrier by email
  console.log('\n2. Recherche carrier par email...');
  const searchResult = await apiRequest('GET', '/api/carriers?search=exploitation@rt-groupe.com', null, token);
  console.log(`   Status: ${searchResult.status}`);
  if (searchResult.status === 200) {
    const carriers = searchResult.data.carriers || searchResult.data || [];
    console.log(`   Résultats: ${carriers.length}`);
    carriers.forEach(c => console.log(`   - ${c._id}: ${c.companyName}`));
  }

  // 3. Try to get carrier by user's carrierId
  const carrierId = user.carrierId;
  if (carrierId) {
    console.log(`\n3. Récupération carrier ${carrierId}...`);
    const carrierResult = await apiRequest('GET', `/api/carriers/${carrierId}`, null, token);
    console.log(`   Status: ${carrierResult.status}`);
    if (carrierResult.status === 200) {
      const carrier = carrierResult.data.carrier || carrierResult.data;
      console.log(`   Carrier trouvé: ${carrier.companyName}`);
      console.log(`   Level: ${carrier.level}`);
      console.log(`   Status: ${carrier.status}`);

      // 4. Grant premium if not already
      if (carrier.level !== 'premium') {
        console.log('\n4. Attribution Premium...');
        const premiumResult = await apiRequest('POST', `/api/carriers/${carrierId}/premium/grant`, {
          notes: 'RT Groupe - Upgrade Premium'
        }, token);
        console.log(`   Status: ${premiumResult.status}`);
        if (premiumResult.status === 200) {
          console.log('   OK - Premium accordé!');
        } else {
          console.log(`   Response: ${JSON.stringify(premiumResult.data).substring(0, 200)}`);
        }
      } else {
        console.log('\n4. Déjà Premium!');
      }
    } else {
      console.log(`   Carrier non trouvé: ${JSON.stringify(carrierResult.data).substring(0, 100)}`);
    }
  }

  // 5. List all carriers with search
  console.log('\n5. Recherche "SETT"...');
  const settResult = await apiRequest('GET', '/api/carriers?search=SETT', null, token);
  console.log(`   Status: ${settResult.status}`);
  if (settResult.status === 200) {
    const carriers = settResult.data.carriers || settResult.data || [];
    console.log(`   Trouvé: ${carriers.length}`);
    for (const c of carriers) {
      console.log(`\n   Carrier: ${c.companyName}`);
      console.log(`   ID: ${c._id}`);
      console.log(`   Level: ${c.level}`);

      // Try to upgrade this one
      if (c.level !== 'premium') {
        console.log('   -> Upgrade to Premium...');
        const upResult = await apiRequest('POST', `/api/carriers/${c._id}/premium/grant`, {
          notes: 'RT Groupe Premium'
        }, token);
        console.log(`   -> Status: ${upResult.status}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('TERMINÉ');
  console.log('='.repeat(60));
}

main().catch(console.error);
