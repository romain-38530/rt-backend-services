const https = require('https');
const http = require('http');

async function checkTMSSync() {
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

  const token = loginResponse.token;
  console.log('Got token\n');

  // 2. Check TMS connections
  console.log('=== TMS CONNECTIONS ===');
  const connections = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'rt-tms-sync-api-v2.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com',
      path: '/api/v1/tms/connections',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
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

  console.log(JSON.stringify(connections, null, 2));

  // 3. Check TMS carriers
  console.log('\n=== TMS CARRIERS (first 5) ===');
  const carriers = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'rt-tms-sync-api-v2.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com',
      path: '/api/v1/tms/carriers?limit=5',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
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

  console.log('Total:', carriers.total);
  console.log('Carriers:', JSON.stringify(carriers.carriers?.slice(0, 3), null, 2));
}

checkTMSSync().catch(console.error);
