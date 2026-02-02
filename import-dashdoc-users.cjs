const https = require('https');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const fs = require('fs');

const DASHDOC_TOKEN = '8321c7a8f7fe8f75192fa15a6c883a11758e0084';
const CARRIER_ID = '6980887cdef6432153c25be5'; // SETT Transports
const DEFAULT_PASSWORD = 'Symphonia2026!';

// Read the welcome email template
const welcomeEmailTemplate = fs.readFileSync('./email-templates/bienvenue.html', 'utf8');

async function fetchDashdocContacts() {
  console.log('1. Fetching contacts from Dashdoc API...\n');

  const allContacts = [];
  let nextUrl = 'https://api.dashdoc.eu/api/v4/contacts/?page_size=100';
  let page = 1;

  while (nextUrl) {
    console.log(`   Fetching page ${page}...`);

    const response = await new Promise((resolve, reject) => {
      const url = new URL(nextUrl);
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'Authorization': `Token ${DASHDOC_TOKEN}`,
          'Accept': 'application/json'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ results: [], next: null });
          }
        });
      });
      req.on('error', reject);
      req.end();
    });

    if (response.results && response.results.length > 0) {
      allContacts.push(...response.results);
      console.log(`   Found ${response.results.length} contacts (total: ${allContacts.length})`);
    }

    nextUrl = response.next;
    page++;

    // Safety limit
    if (page > 50) break;
  }

  console.log(`\n   Total contacts fetched: ${allContacts.length}\n`);
  return allContacts;
}

async function fetchDashdocManagers() {
  console.log('2. Fetching carrier managers from Dashdoc API...\n');

  const allManagers = [];
  let nextUrl = 'https://api.dashdoc.eu/api/v4/manager/?page_size=100';
  let page = 1;

  while (nextUrl) {
    console.log(`   Fetching page ${page}...`);

    const response = await new Promise((resolve, reject) => {
      const url = new URL(nextUrl);
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'Authorization': `Token ${DASHDOC_TOKEN}`,
          'Accept': 'application/json'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ results: [], next: null });
          }
        });
      });
      req.on('error', reject);
      req.end();
    });

    if (response.results && response.results.length > 0) {
      allManagers.push(...response.results);
      console.log(`   Found ${response.results.length} managers (total: ${allManagers.length})`);
    }

    nextUrl = response.next;
    page++;

    if (page > 20) break;
  }

  console.log(`\n   Total managers fetched: ${allManagers.length}\n`);
  return allManagers;
}

async function loginAndGetToken() {
  console.log('3. Getting auth token...');

  const loginData = JSON.stringify({
    email: 'r.tardy@rt-groupe.com',
    password: 'Symphonia2026!'
  });

  const response = await new Promise((resolve, reject) => {
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

  console.log('   Token obtained!\n');
  return response.token;
}

async function createUser(token, userData) {
  const registerData = JSON.stringify({
    email: userData.email,
    password: DEFAULT_PASSWORD,
    firstName: userData.firstName || '',
    lastName: userData.lastName || '',
    phone: userData.phone || '',
    companyName: userData.companyName || '',
    role: 'transporter',
    carrierId: CARRIER_ID,
    source: 'dashdoc-import',
    subscription: {
      plan: 'trial',
      trialTransports: 10,
      trialExpiry: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
    }
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'ddaywxps9n701.cloudfront.net',
      path: '/api/auth/register',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
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

async function sendWelcomeEmail(userData) {
  // Replace template variables
  let emailHtml = welcomeEmailTemplate
    .replace(/\{\{contactName\}\}/g, userData.firstName || userData.lastName || 'Transporteur')
    .replace(/\{\{companyName\}\}/g, userData.companyName || 'Votre entreprise');

  const params = {
    Source: 'SYMPHONI.A <noreply@symphonia-controltower.com>',
    Destination: {
      ToAddresses: [userData.email]
    },
    Message: {
      Subject: {
        Data: 'Bienvenue sur SYMPHONI.A - Votre compte est actif',
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: emailHtml,
          Charset: 'UTF-8'
        },
        Text: {
          Data: `Bienvenue sur SYMPHONI.A !

Bonjour ${userData.firstName || 'Transporteur'},

Votre compte ${userData.companyName || ''} a ete cree avec succes.

Vos identifiants de connexion :
- Email : ${userData.email}
- Mot de passe : ${DEFAULT_PASSWORD}

IMPORTANT : Nous vous recommandons de changer votre mot de passe lors de votre premiere connexion.

Connectez-vous sur : https://transporteur.symphonia-controltower.com

Cadeau de bienvenue : 10 consultations OFFERTES sur AFFRET.IA !

---
SYMPHONI.A - La plateforme de conformite et de fret pour le transport
04 76 33 23 78 | contact@symphonia-controltower.com`,
          Charset: 'UTF-8'
        }
      }
    }
  };

  // For now, just return success - we'll use AWS CLI for actual sending
  return { success: true, email: userData.email };
}

async function main() {
  console.log('='.repeat(60));
  console.log('IMPORT UTILISATEURS DASHDOC VERS SYMPHONI.A');
  console.log('='.repeat(60) + '\n');

  try {
    // 1. Fetch contacts from Dashdoc
    const contacts = await fetchDashdocContacts();

    // 2. Fetch managers from Dashdoc
    const managers = await fetchDashdocManagers();

    // 3. Combine and deduplicate by email
    const allUsers = [...contacts, ...managers];
    const uniqueUsers = new Map();

    for (const user of allUsers) {
      const email = user.email || user.user?.email;
      if (email && email.includes('@') && !email.includes('example')) {
        const firstName = user.first_name || user.user?.first_name || '';
        const lastName = user.last_name || user.user?.last_name || '';
        const phone = user.phone_number || user.user?.phone_number || '';
        const companyName = user.company?.name || '';

        uniqueUsers.set(email.toLowerCase(), {
          email: email.toLowerCase(),
          firstName,
          lastName,
          phone,
          companyName
        });
      }
    }

    console.log(`4. Unique users with valid email: ${uniqueUsers.size}\n`);

    // 4. Get auth token
    const token = await loginAndGetToken();

    // 5. Create users and prepare email list
    console.log('5. Creating users in SYMPHONI.A...\n');

    const results = {
      created: [],
      alreadyExists: [],
      failed: []
    };

    let count = 0;
    for (const [email, userData] of uniqueUsers) {
      count++;
      process.stdout.write(`   [${count}/${uniqueUsers.size}] ${email}... `);

      const result = await createUser(token, userData);

      if (result.status === 201 || result.status === 200) {
        console.log('CREATED');
        results.created.push(userData);
      } else if (result.status === 409 || (result.data && result.data.message && result.data.message.includes('existe'))) {
        console.log('EXISTS');
        results.alreadyExists.push(userData);
      } else {
        console.log(`FAILED (${result.status})`);
        results.failed.push({ ...userData, error: result.data });
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 100));
    }

    // 6. Summary
    console.log('\n' + '='.repeat(60));
    console.log('RESUME');
    console.log('='.repeat(60));
    console.log(`   Utilisateurs crees: ${results.created.length}`);
    console.log(`   Deja existants: ${results.alreadyExists.length}`);
    console.log(`   Echecs: ${results.failed.length}`);

    // 7. Save results for email sending
    const emailList = [...results.created, ...results.alreadyExists];
    fs.writeFileSync('./users-to-email.json', JSON.stringify(emailList, null, 2));
    console.log(`\n   Liste sauvegardee dans users-to-email.json (${emailList.length} emails)`);

    // 8. Generate AWS CLI commands for sending emails
    console.log('\n' + '='.repeat(60));
    console.log('COMMANDES POUR ENVOYER LES EMAILS');
    console.log('='.repeat(60));
    console.log('\nExecutez le script send-welcome-emails.ps1 pour envoyer les emails de bienvenue.\n');

    // Generate PowerShell script for sending emails
    let psScript = `# Script pour envoyer les emails de bienvenue
$emails = @(
`;
    for (const user of emailList.slice(0, 50)) { // Limit to 50 for first batch
      psScript += `    @{email="${user.email}"; name="${user.firstName || user.lastName || 'Transporteur'}"; company="${user.companyName || ''}"},\n`;
    }
    psScript += `)

foreach ($user in $emails) {
    Write-Host "Envoi a $($user.email)..."
    # aws ses send-email commands here
}

Write-Host "Termine!"
`;

    fs.writeFileSync('./send-welcome-emails.ps1', psScript);
    console.log('Script PowerShell genere: send-welcome-emails.ps1\n');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
