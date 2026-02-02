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

  // 2. Test invitation to a test email
  console.log('2. Sending test invitation...');

  const inviteData = JSON.stringify({
    email: 'r.tardy@rt-groupe.com', // Test avec votre propre email
    siret: '87766039900024',
    companyName: '2BMoved (TEST)',
    phone: '+33458008086',
    address: {
      street: '8 route des bois - ZAC Champfeuillet',
      city: 'VOIRON',
      postalCode: '38500',
      country: 'FR'
    },
    externalSource: 'dashdoc',
    externalId: '4608128',
    offer: 'AFFRET_IA_DECOUVERTE',
    freeTransports: 10,
    invitedBy: CARRIER_ID,
    invitedAt: new Date().toISOString()
  });

  const inviteResponse = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com',
      path: `/api/v1/carriers/${CARRIER_ID}/subcontractors/invite`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': inviteData.length
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
}

testInvitation().catch(console.error);
