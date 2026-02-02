const https = require('https');
const http = require('http');

const DEFAULT_PASSWORD = 'Symphonia2026!';
const CARRIER_ID = '6980887cdef6432153c25be5'; // SETT Transports

// Les 11 utilisateurs de Dashdoc
const users = [
  { firstName: 'Sett', lastName: 'Transports', email: 'exploitation@rt-groupe.com', role: 'viewer' },
  { firstName: 'Ludivine', lastName: 'Accary', email: 'l.accary@rt-groupe.com', role: 'admin' },
  { firstName: 'Theo', lastName: 'Gimenez', email: 'affretement@rt-groupe.com', role: 'admin' },
  { firstName: 'Pauline', lastName: 'Tardy', email: 'p.tardy@rt-groupe.com', role: 'admin' },
  { firstName: 'Marion', lastName: 'Marly', email: 'm.marly@rt-groupe.com', role: 'admin' },
  { firstName: 'Baptiste', lastName: 'Mattio', email: 'b.mattio@rt-groupe.com', role: 'admin' },
  { firstName: 'Maxime', lastName: 'Dufey', email: 'admintransport@rt-groupe.com', role: 'user' },
  { firstName: 'Alphonse', lastName: 'Mendes', email: 'a.mendes@rt-groupe.com', role: 'user' },
  { firstName: 'Romain', lastName: 'Tardy', email: 'r.tardy@rt-groupe.com', role: 'admin' },
  { firstName: 'Lola', lastName: 'Balmon', email: 'm.beccafarri@rt-groupe.com', role: 'user' }
];

async function createUser(userData) {
  const registerData = JSON.stringify({
    email: userData.email,
    password: DEFAULT_PASSWORD,
    firstName: userData.firstName,
    lastName: userData.lastName,
    role: 'transporter',
    portal: 'transporter',
    carrierId: CARRIER_ID,
    companyName: 'SETT Transports',
    source: 'dashdoc-import'
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'ddaywxps9n701.cloudfront.net',
      path: '/api/auth/register',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(registerData)
      }
    }, (res) => {
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
    req.write(registerData);
    req.end();
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('CREATION DES UTILISATEURS RT GROUPE');
  console.log('='.repeat(60) + '\n');

  const results = { created: [], exists: [], failed: [] };

  for (const user of users) {
    process.stdout.write(`${user.firstName} ${user.lastName} (${user.email})... `);

    try {
      const result = await createUser(user);

      if (result.status === 201 || result.status === 200) {
        console.log('CREE');
        results.created.push(user);
      } else if (result.status === 409 || (result.data?.message?.includes('existe') || result.data?.message?.includes('already'))) {
        console.log('EXISTE DEJA');
        results.exists.push(user);
      } else {
        console.log(`ECHEC (${result.status}: ${result.data?.message || JSON.stringify(result.data).substring(0, 50)})`);
        results.failed.push(user);
      }
    } catch (err) {
      console.log(`ERREUR: ${err.message}`);
      results.failed.push(user);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n' + '='.repeat(60));
  console.log('RESUME');
  console.log('='.repeat(60));
  console.log(`Crees: ${results.created.length}`);
  console.log(`Existants: ${results.exists.length}`);
  console.log(`Echecs: ${results.failed.length}`);

  // Prepare email list
  const allUsers = [...results.created, ...results.exists];
  console.log('\n' + '='.repeat(60));
  console.log('EMAILS A ENVOYER');
  console.log('='.repeat(60));
  allUsers.forEach(u => console.log(`  - ${u.email}`));

  return allUsers;
}

main().catch(console.error);
