const { MongoClient, ObjectId } = require('mongodb');
const https = require('https');

const uri = 'mongodb+srv://rt_admin:Symphonia2024!@stagingrt.v2jnoh2.mongodb.net';
const DASHDOC_TOKEN = '8321c7a8f7fe8f75192fa15a6c883a11758e0084';
const OWNER_CARRIER_ID = '6980887cdef6432153c25be5';

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

function mapDashdocToCarrier(company) {
  const primaryAddress = company.primary_address || company.addresses?.[0] || {};

  return {
    dashdocPk: company.pk,
    name: company.name,
    legalName: company.name,
    siret: company.trade_number || '',
    vatNumber: company.vat_number || '',
    phone: company.phone_number || '',
    email: company.email || null,
    website: company.website || '',
    country: company.country || 'FR',
    address: {
      street: primaryAddress.address || '',
      city: primaryAddress.city || '',
      postalCode: primaryAddress.postcode || '',
      country: primaryAddress.country || 'France',
      coordinates: primaryAddress.latitude && primaryAddress.longitude ? {
        lat: primaryAddress.latitude,
        lng: primaryAddress.longitude
      } : null
    },
    contacts: (company.contacts || []).map(c => ({
      name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
      email: c.email || '',
      phone: c.phone_number || '',
      role: c.jobs?.[0] || 'contact'
    })),
    status: 'active',
    verified: company.is_verified || false,
    hasLoggableManagers: company.has_loggable_managers || false,
    dashdoc: {
      pk: company.pk,
      remoteId: company.remote_id || '',
      syncedAt: new Date()
    },
    ownerCarrierId: OWNER_CARRIER_ID,
    updatedAt: new Date()
  };
}

async function importMissing() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const carriersDb = client.db('rt-carriers');
    const collection = carriersDb.collection('carriers');

    // Get existing dashdocPk values
    const existingPks = new Set(
      (await collection.find({}, { projection: { dashdocPk: 1 } }).toArray())
        .map(c => c.dashdocPk)
        .filter(Boolean)
    );
    console.log(`Existing carriers with dashdocPk: ${existingPks.size}\n`);

    // Fetch all pages and import missing
    const firstPage = await fetchDashdocPage(1, 100);
    const totalCount = firstPage.count;
    const totalPages = Math.ceil(totalCount / 100);

    console.log(`Total in Dashdoc: ${totalCount}`);
    console.log(`Pages to check: ${totalPages}\n`);

    let imported = 0;

    for (let page = 1; page <= totalPages; page++) {
      process.stdout.write(`Page ${page}/${totalPages}...`);

      const data = page === 1 ? firstPage : await fetchDashdocPage(page, 100);

      if (!data.results) {
        console.log(' No results');
        continue;
      }

      let pageImported = 0;

      for (const company of data.results) {
        // Skip if already exists
        if (existingPks.has(company.pk)) {
          continue;
        }

        try {
          const carrier = mapDashdocToCarrier(company);
          carrier.createdAt = new Date();

          await collection.insertOne(carrier);
          imported++;
          pageImported++;
          existingPks.add(company.pk);
        } catch (err) {
          // Ignore duplicate errors
        }
      }

      console.log(` +${pageImported}`);

      if (page < totalPages) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    console.log(`\nImported ${imported} additional carriers`);
    console.log(`Total in DB: ${await collection.countDocuments()}`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
    console.log('\nDone!');
  }
}

importMissing();
