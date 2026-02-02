const { MongoClient } = require('mongodb');
const https = require('https');

const uri = 'mongodb+srv://rt_admin:Symphonia2024!@stagingrt.v2jnoh2.mongodb.net';
const DASHDOC_TOKEN = '8321c7a8f7fe8f75192fa15a6c883a11758e0084';

async function fetchDashdocPage(page, pageSize = 100) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.dashdoc.eu',
      path: `/api/v4/companies/?page=${page}&page_size=${pageSize}`,
      method: 'GET',
      headers: {
        'Authorization': `Token ${DASHDOC_TOKEN}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function updateEmails() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const carriersDb = client.db('rt-carriers');
    const collection = carriersDb.collection('carriers');

    // Fetch all Dashdoc companies and extract emails from contacts
    const firstPage = await fetchDashdocPage(1, 100);
    const totalPages = Math.ceil(firstPage.count / 100);

    console.log(`Total companies in Dashdoc: ${firstPage.count}`);
    console.log(`Pages to process: ${totalPages}\n`);

    let updated = 0;
    let contactsFound = 0;

    for (let page = 1; page <= totalPages; page++) {
      process.stdout.write(`Page ${page}/${totalPages}...`);

      const data = page === 1 ? firstPage : await fetchDashdocPage(page, 100);

      if (!data.results) {
        console.log(' No results');
        continue;
      }

      let pageUpdated = 0;

      for (const company of data.results) {
        // Get email from company or first contact with email
        let email = company.email;
        let contactEmail = null;
        let allContacts = [];

        if (company.contacts && company.contacts.length > 0) {
          // Find first contact with valid email
          for (const contact of company.contacts) {
            const cEmail = contact.email;
            const cName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
            const cPhone = contact.phone_number || '';
            const cRole = contact.jobs?.[0] || 'contact';

            allContacts.push({
              name: cName,
              email: cEmail || '',
              phone: cPhone,
              role: cRole,
              isManager: contact.is_manager || false
            });

            if (!contactEmail && cEmail && !cEmail.includes('placeholder')) {
              contactEmail = cEmail;
            }
          }
          contactsFound += company.contacts.length;
        }

        // Use contact email if company email is empty or placeholder
        const finalEmail = (email && !email.includes('placeholder')) ? email : contactEmail;

        if (finalEmail || allContacts.length > 0) {
          const updateData = {
            contacts: allContacts,
            updatedAt: new Date()
          };

          if (finalEmail) {
            updateData.email = finalEmail;
          }

          const result = await collection.updateOne(
            { dashdocPk: company.pk },
            { $set: updateData }
          );

          if (result.modifiedCount > 0) {
            updated++;
            pageUpdated++;
          }
        }
      }

      console.log(` +${pageUpdated} updated`);

      if (page < totalPages) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    console.log('\n=== UPDATE COMPLETE ===');
    console.log(`Carriers updated: ${updated}`);
    console.log(`Total contacts found: ${contactsFound}`);

    // Recount emails
    const withRealEmail = await collection.countDocuments({
      email: { $ne: null, $not: /placeholder/ }
    });
    const withContacts = await collection.countDocuments({
      'contacts.0': { $exists: true }
    });

    console.log(`\nCarriers with real email: ${withRealEmail}`);
    console.log(`Carriers with contacts: ${withContacts}`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
    console.log('\nDone!');
  }
}

updateEmails();
