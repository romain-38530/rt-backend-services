const https = require('https');

const API_HOST = 'ddaywxps9n701.cloudfront.net';
const CARRIER_ID = '6980887cdef6432153c25be5';

// RT Groupe users
const RT_GROUPE_USERS = [
  { firstName: 'Sett', lastName: 'Transports', email: 'exploitation@rt-groupe.com' },
  { firstName: 'Ludivine', lastName: 'Accary', email: 'l.accary@rt-groupe.com' },
  { firstName: 'Theo', lastName: 'Gimenez', email: 'affretement@rt-groupe.com' },
  { firstName: 'Pauline', lastName: 'Tardy', email: 'p.tardy@rt-groupe.com' },
  { firstName: 'Marion', lastName: 'Marly', email: 'm.marly@rt-groupe.com' },
  { firstName: 'Baptiste', lastName: 'Mattio', email: 'b.mattio@rt-groupe.com' },
  { firstName: 'Maxime', lastName: 'Dufey', email: 'admintransport@rt-groupe.com' },
  { firstName: 'Alphonse', lastName: 'Mendes', email: 'a.mendes@rt-groupe.com' },
  { firstName: 'Romain', lastName: 'Tardy', email: 'r.tardy@rt-groupe.com' },
  { firstName: 'Lola', lastName: 'Balmon', email: 'm.beccafarri@rt-groupe.com' }
];

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
  console.log('CONFIGURATION RT GROUPE - ABONNEMENT PREMIUM via API');
  console.log('='.repeat(60) + '\n');

  // 1. Login as admin
  console.log('1. Connexion admin...');
  const loginResult = await apiRequest('POST', '/api/auth/login', {
    email: 'r.tardy@rt-groupe.com',
    password: 'Symphonia2026!'
  });

  if (loginResult.status !== 200 || !loginResult.data.token) {
    console.log('   ERREUR: Connexion échouée');
    console.log('   Response:', loginResult.data);
    return;
  }
  const token = loginResult.data.token;
  console.log('   OK - Connecté\n');

  // 2. Get carrier info
  console.log('2. Vérification carrier SETT Transports...');
  const carrierResult = await apiRequest('GET', `/api/carriers/${CARRIER_ID}`, null, token);
  if (carrierResult.status === 200) {
    console.log(`   OK - Carrier: ${carrierResult.data.name || carrierResult.data.companyName}`);
  } else {
    console.log('   Carrier non trouvé, création...');
  }

  // 3. Update carrier subscription to Premium
  console.log('\n3. Configuration abonnement Premium pour SETT Transports...');
  const subscriptionData = {
    carrierId: CARRIER_ID,
    tier: 'premium',
    plan: 'transporteur_premium',
    planName: 'Transporteur Premium',
    status: 'active',
    activatedFeatures: [
      'affret_ia', 'vigilance', 'scoring', 'tracking_gps',
      'ecmr', 'planning', 'bourse_fret', 'kpi_advanced',
      'multi_user', 'api_access', 'tms_connection'
    ],
    features: {
      maxUsers: 100,
      maxVehicles: 100,
      maxTransports: -1,
      apiAccess: true,
      customBranding: true,
      prioritySupport: true
    },
    billingCycle: 'yearly',
    currentPeriodEnd: '2027-01-01'
  };

  const subResult = await apiRequest('PUT', `/api/subscriptions/carrier/${CARRIER_ID}`, subscriptionData, token);
  if (subResult.status === 200 || subResult.status === 201) {
    console.log('   OK - Abonnement Premium configuré');
  } else {
    console.log(`   Info: ${subResult.status} - ${JSON.stringify(subResult.data).substring(0, 100)}`);
  }

  // 4. Update each user's subscription
  console.log('\n4. Mise à jour des utilisateurs RT Groupe...\n');

  let updated = 0;
  for (const user of RT_GROUPE_USERS) {
    process.stdout.write(`   ${user.email}... `);

    const updateResult = await apiRequest('PUT', '/api/users/subscription', {
      email: user.email,
      subscription: {
        tier: 'premium',
        plan: 'transporteur_premium',
        planName: 'Transporteur Premium',
        status: 'active',
        carrierId: CARRIER_ID
      }
    }, token);

    if (updateResult.status === 200) {
      console.log('OK');
      updated++;
    } else {
      console.log(`(${updateResult.status})`);
    }

    await new Promise(r => setTimeout(r, 100));
  }

  // 5. Summary
  console.log('\n' + '='.repeat(60));
  console.log('RESUME');
  console.log('='.repeat(60));
  console.log(`   Utilisateurs traités: ${updated}/${RT_GROUPE_USERS.length}`);
  console.log(`   Carrier: SETT Transports (${CARRIER_ID})`);
  console.log(`   Plan: Transporteur Premium`);
  console.log(`   Status: Active`);
  console.log('\nTerminé!');
}

main().catch(console.error);
