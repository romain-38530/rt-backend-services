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
  console.log('CREATE SETT TRANSPORTS CARRIER AS PREMIUM');
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
  const userId = loginResult.data.user?.id || loginResult.data.user?._id;
  console.log('   OK - Connecté');
  console.log(`   User ID: ${userId}\n`);

  // 2. Get user profile to check carrierId
  console.log('2. Vérification profil utilisateur...');
  const profileResult = await apiRequest('GET', '/api/auth/profile', null, token);
  if (profileResult.status === 200) {
    const user = profileResult.data.user || profileResult.data;
    console.log(`   Email: ${user.email}`);
    console.log(`   CarrierId: ${user.carrierId || 'N/A'}`);
    console.log(`   Portal: ${user.portal}`);
    console.log(`   Subscription: ${JSON.stringify(user.subscription || {})}`);
  }

  // 3. List carriers to see what exists
  console.log('\n3. Liste des carriers existants...');
  const carriersResult = await apiRequest('GET', '/api/carriers?limit=10', null, token);
  if (carriersResult.status === 200) {
    const carriers = carriersResult.data.carriers || carriersResult.data || [];
    console.log(`   Trouvé: ${carriers.length} carriers`);
    carriers.slice(0, 5).forEach(c => {
      console.log(`   - ${c._id || c.id}: ${c.companyName} (${c.level || 'N/A'})`);
    });
  } else {
    console.log(`   Status: ${carriersResult.status}`);
  }

  // 4. Try to create carrier via invite endpoint (using r.tardy as industrial)
  console.log('\n4. Création du carrier SETT Transports...');

  // First, we need an industrial user to invite. Let's use the same user but as industrial
  const inviteResult = await apiRequest('POST', '/api/carriers/invite', {
    email: 'exploitation@rt-groupe.com',
    companyName: 'SETT Transports',
    industrielId: userId,
    siret: '12345678901234',
    level: 'premium',
    message: 'Bienvenue sur SYMPHONI.A - RT Groupe'
  }, token);

  if (inviteResult.status === 201) {
    console.log('   OK - Carrier créé via invitation');
    console.log(`   ID: ${inviteResult.data.invitation?.id}`);
  } else if (inviteResult.status === 409) {
    console.log('   Carrier déjà existant');
  } else {
    console.log(`   Status: ${inviteResult.status}`);
    console.log(`   Response: ${JSON.stringify(inviteResult.data).substring(0, 200)}`);
  }

  // 5. Check carriers again
  console.log('\n5. Vérification finale des carriers...');
  const finalCarriers = await apiRequest('GET', '/api/carriers?limit=10', null, token);
  if (finalCarriers.status === 200) {
    const carriers = finalCarriers.data.carriers || finalCarriers.data || [];
    console.log(`   Trouvé: ${carriers.length} carriers`);
    carriers.forEach(c => {
      const id = c._id || c.id;
      const level = c.level || 'N/A';
      console.log(`   - ${id}: ${c.companyName} (${level})`);
      if (c.companyName?.toLowerCase().includes('sett')) {
        console.log(`     ^ SETT Transports trouvé! ID: ${id}`);
      }
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('TERMINÉ');
  console.log('='.repeat(60));
}

main().catch(console.error);
