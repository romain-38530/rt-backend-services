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

  // Generate unique email if empty
  const email = company.email || `no-email-${company.pk}@dashdoc.placeholder`;

  return {
    dashdocPk: company.pk,
    name: company.name,
    legalName: company.name,
    siret: company.trade_number || '',
    vatNumber: company.vat_number || '',
    phone: company.phone_number || '',
    email: email,
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
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

async function importCarriers() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const carriersDb = client.db('rt-carriers');
    const collection = carriersDb.collection('carriers');

    // Drop the email unique index if it exists
    console.log('Dropping email unique index if exists...');
    try {
      await collection.dropIndex('email_1');
      console.log('  Index dropped');
    } catch (e) {
      console.log('  Index not found or already dropped');
    }

    // Delete all carriers except SETT Transports
    console.log('\nDeleting all carriers except SETT Transports...');
    const deleteResult = await collection.deleteMany({
      _id: { $ne: new ObjectId(OWNER_CARRIER_ID) }
    });
    console.log(`Deleted ${deleteResult.deletedCount} carriers\n`);

    // Get first page to know total count
    console.log('Fetching first page to get total count...');
    const firstPage = await fetchDashdocPage(1, 100);
    const totalCount = firstPage.count;
    const totalPages = Math.ceil(totalCount / 100);

    console.log(`Total carriers in Dashdoc: ${totalCount}`);
    console.log(`Total pages to fetch: ${totalPages}\n`);

    let imported = 0;
    let updated = 0;
    let errors = 0;

    // Process all pages
    for (let page = 1; page <= totalPages; page++) {
      process.stdout.write(`Processing page ${page}/${totalPages}...`);

      const data = page === 1 ? firstPage : await fetchDashdocPage(page, 100);

      if (!data.results || data.results.length === 0) {
        console.log(` No results`);
        continue;
      }

      let pageImported = 0;
      let pageErrors = 0;

      for (const company of data.results) {
        try {
          const carrier = mapDashdocToCarrier(company);

          // Upsert: update if exists (by dashdocPk), insert if not
          const result = await collection.updateOne(
            { dashdocPk: company.pk },
            { $set: carrier },
            { upsert: true }
          );

          if (result.upsertedCount > 0) {
            imported++;
            pageImported++;
          } else if (result.modifiedCount > 0) {
            updated++;
            pageImported++;
          }
        } catch (err) {
          errors++;
          pageErrors++;
        }
      }

      console.log(` +${pageImported} carriers (${pageErrors} errors)`);

      // Small delay to avoid rate limiting
      if (page < totalPages) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    console.log('\n=== IMPORT COMPLETE ===');
    console.log(`Imported: ${imported}`);
    console.log(`Updated: ${updated}`);
    console.log(`Errors: ${errors}`);
    console.log(`Total in DB: ${await collection.countDocuments()}`);

    // Create index on dashdocPk for faster lookups
    console.log('\nCreating dashdocPk index...');
    await collection.createIndex({ dashdocPk: 1 }, { unique: true, sparse: true });
    console.log('Index created');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
    console.log('\nDone!');
  }
}

importCarriers();
