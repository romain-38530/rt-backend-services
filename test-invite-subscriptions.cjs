const https = require('https');
const http = require('http');

const CARRIER_ID = '6980887cdef6432153c25be5'; // SETT Transports

async function testInvitation() {
  // 1. Login to get token
  console.log('1. Getting auth token...');
  const loginData = JSON.stringify({
    email: 'r.tardy@rt-groupe.com',
    password: 'Symphonia2026!'
  });

  const loginResponse = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'ddaywxps9n701.cloudfront.net',
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': loginData.length
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(loginData);
    req.end();
  });

  const token = loginResponse.token;
  console.log('   Token obtained!\n');

  // 2. Test invitation via Subscriptions API
  console.log('2. Sending test invitation via Subscriptions API...');

  const inviteData = JSON.stringify({
    industrialId: CARRIER_ID, // L'industriel qui invite (SETT Transports)
    email: 'r.tardy@rt-groupe.com', // Test avec votre propre email pour vérifier
    companyName: '2BMoved (TEST INVITATION)',
    siret: '87766039900024',
    phone: '+33458008086',
    contactName: 'Test Contact',
    address: {
      street: '8 route des bois - ZAC Champfeuillet',
      city: 'VOIRON',
      postalCode: '38500',
      country: 'France'
    },
    offer: {
      type: 'AFFRET_IA_DECOUVERTE',
      name: 'Offre Découverte AFFRET.IA',
      freeTransports: 10,
      benefits: [
        '10 transports gratuits sur AFFRET.IA',
        'Dépôt documents légaux + Scoring',
        'Accès au portail transporteur'
      ]
    },
    externalSource: 'dashdoc',
    externalId: '4608128'
  });

  const inviteResponse = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'rt-subscriptions-api-prod-v5.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com',
      path: '/api/carriers/invite',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(inviteData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('   Status:', res.statusCode);
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.write(inviteData);
    req.end();
  });

  console.log('   Response:', JSON.stringify(inviteResponse, null, 2));

  if (inviteResponse.success) {
    console.log('\n✓ Invitation envoyée avec succès!');
    console.log('  Vérifiez votre boîte mail: r.tardy@rt-groupe.com');
    if (inviteResponse.invitation) {
      console.log('  Lien d\'inscription:', inviteResponse.invitation.registrationLink);
    }
  }
}

testInvitation().catch(console.error);
