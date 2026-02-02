const https = require('https');
const http = require('http');

async function testStripeFeatures() {
  // 1. Login to get token
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

  console.log('Login response:', loginResponse.message);
  const token = loginResponse.token;
  console.log('Token:', token.substring(0, 50) + '...');

  // 2. Call Stripe features endpoint
  console.log('\nCalling /api/stripe/features...');

  const featuresResponse = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'rt-subscriptions-api-prod-v5.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com',
      path: '/api/stripe/features',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('Status:', res.statusCode);
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });

  console.log('Features response:', JSON.stringify(featuresResponse, null, 2));
}

testStripeFeatures().catch(console.error);
