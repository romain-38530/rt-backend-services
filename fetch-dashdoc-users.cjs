const https = require('https');
const fs = require('fs');

const DASHDOC_TOKEN = '8321c7a8f7fe8f75192fa15a6c883a11758e0084';

async function fetchFromDashdoc(endpoint, description) {
  console.log(`Fetching ${description}...`);

  const allResults = [];
  let nextUrl = `https://api.dashdoc.eu/api/v4/${endpoint}/?page_size=100`;
  let page = 1;

  while (nextUrl && page <= 30) {
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
            console.log('Parse error:', data.substring(0, 200));
            resolve({ results: [], next: null });
          }
        });
      });
      req.on('error', reject);
      req.end();
    });

    if (response.results && response.results.length > 0) {
      allResults.push(...response.results);
      process.stdout.write(`  Page ${page}: +${response.results.length} (total: ${allResults.length})\r`);
    }

    nextUrl = response.next;
    page++;
  }

  console.log(`  Total ${description}: ${allResults.length}`);
  return allResults;
}

async function main() {
  console.log('='.repeat(60));
  console.log('EXTRACTION UTILISATEURS DASHDOC');
  console.log('='.repeat(60) + '\n');

  // Fetch contacts
  const contacts = await fetchFromDashdoc('contacts', 'contacts');

  // Fetch managers
  const managers = await fetchFromDashdoc('manager', 'managers');

  // Fetch company contacts
  const companies = await fetchFromDashdoc('companies', 'companies');

  // Extract unique users with emails
  const uniqueUsers = new Map();

  // From contacts
  for (const contact of contacts) {
    const email = contact.email;
    if (email && email.includes('@') && !email.includes('example.com') && !email.includes('test@')) {
      uniqueUsers.set(email.toLowerCase(), {
        email: email.toLowerCase(),
        firstName: contact.first_name || '',
        lastName: contact.last_name || '',
        phone: contact.phone_number || '',
        companyName: contact.company?.name || '',
        companyId: contact.company?.pk || null,
        source: 'contact'
      });
    }
  }

  // From managers
  for (const manager of managers) {
    const email = manager.user?.email || manager.email;
    if (email && email.includes('@') && !email.includes('example.com') && !email.includes('test@')) {
      const existing = uniqueUsers.get(email.toLowerCase());
      uniqueUsers.set(email.toLowerCase(), {
        email: email.toLowerCase(),
        firstName: manager.user?.first_name || manager.first_name || existing?.firstName || '',
        lastName: manager.user?.last_name || manager.last_name || existing?.lastName || '',
        phone: manager.user?.phone_number || manager.phone_number || existing?.phone || '',
        companyName: existing?.companyName || '',
        companyId: existing?.companyId || null,
        source: 'manager'
      });
    }
  }

  // From companies - get primary contact
  for (const company of companies) {
    if (company.primary_contact) {
      const email = company.primary_contact.email;
      if (email && email.includes('@') && !email.includes('example.com')) {
        const existing = uniqueUsers.get(email.toLowerCase());
        uniqueUsers.set(email.toLowerCase(), {
          email: email.toLowerCase(),
          firstName: company.primary_contact.first_name || existing?.firstName || '',
          lastName: company.primary_contact.last_name || existing?.lastName || '',
          phone: company.primary_contact.phone_number || existing?.phone || '',
          companyName: company.name || existing?.companyName || '',
          companyId: company.pk || existing?.companyId || null,
          source: 'company_primary'
        });
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`UTILISATEURS UNIQUES AVEC EMAIL: ${uniqueUsers.size}`);
  console.log('='.repeat(60));

  // Convert to array and save
  const usersArray = Array.from(uniqueUsers.values());

  // Show sample
  console.log('\nExemples (5 premiers):');
  usersArray.slice(0, 5).forEach((u, i) => {
    console.log(`  ${i+1}. ${u.email} - ${u.firstName} ${u.lastName} (${u.companyName || 'N/A'})`);
  });

  // Save to file
  fs.writeFileSync('./dashdoc-users.json', JSON.stringify(usersArray, null, 2));
  console.log(`\nListe sauvegardee: dashdoc-users.json (${usersArray.length} utilisateurs)`);

  // Stats by company
  const byCompany = {};
  for (const user of usersArray) {
    const company = user.companyName || 'Sans entreprise';
    byCompany[company] = (byCompany[company] || 0) + 1;
  }

  console.log('\nTop 10 entreprises:');
  Object.entries(byCompany)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([name, count], i) => {
      console.log(`  ${i+1}. ${name}: ${count} utilisateurs`);
    });

  return usersArray;
}

main().catch(console.error);
