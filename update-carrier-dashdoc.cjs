const { MongoClient, ObjectId } = require('mongodb');

const uri = 'mongodb+srv://rt_admin:Symphonia2024!@stagingrt.v2jnoh2.mongodb.net';
const carrierId = '6980887cdef6432153c25be5';

// Data from Dashdoc API
const dashdocData = {
  dashdoc: {
    pk: 3802458,
    apiToken: '8321c7a8f7fe8f75192fa15a6c883a11758e0084',
    syncEnabled: true,
    lastSync: new Date()
  },
  name: 'SETT Transports',
  legalName: 'SARL SETT TRANSPORTS',
  siret: '35067556700050',
  vatNumber: 'FR21350675567',
  legalForm: 'SARL',
  shareCapital: 47648.00,
  shareCapitalCurrency: 'EUR',
  country: 'FR',
  phone: '+33476047111',
  email: 'exploitation@rt-groupe.com',
  website: 'https://rt-globalsolution.com/',
  logo: 'https://storage.googleapis.com/dashdoc-media/media/carriers/181c20ab-92a9-461e-a637-6f06ab3bb2d7.png',
  address: {
    street: '1088 Av. Jean François Champollion',
    city: 'Pontcharra',
    postalCode: '38530',
    country: 'France',
    coordinates: {
      lat: 45.42486,
      lng: 6.00464
    }
  },
  contacts: [
    {
      name: 'Romain Tardy',
      email: 'r.tardy@rt-groupe.com',
      phone: '+33600000000',
      role: 'admin'
    },
    {
      name: 'SETT Transports',
      email: 'exploitation@rt-groupe.com',
      phone: '+33476047111',
      role: 'exploitation'
    }
  ],
  fleet: {
    vehicleCount: 28,
    vehicles: [
      { licensePlate: 'FN153FD', driver: 'Massimo Bordin' },
      { licensePlate: 'EE639CB', driver: 'Mohamed Sallami' }
    ]
  },
  stats: {
    totalTransports: 24881,
    totalDistance: 2751663.86,
    totalDistanceUnit: 'km'
  },
  settings: {
    defaultRole: 'carrier',
    timezone: 'Europe/Paris',
    mobileAppAssignment: 'trucker',
    signatureProcess: 'sign_on_glass',
    geofencingTracking: true,
    dateFormat: 'DD/MM/YYYY',
    defaultCurrency: 'EUR'
  },
  status: 'active',
  verified: true,
  premium: true,
  specializations: ['general', 'temperature', 'adr'],
  updatedAt: new Date()
};

async function updateCarrier() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const carriersDb = client.db('rt-carriers');

    // Update carrier with Dashdoc data
    const result = await carriersDb.collection('carriers').updateOne(
      { _id: new ObjectId(carrierId) },
      { $set: dashdocData }
    );

    console.log('Carrier updated:', result.modifiedCount > 0 ? 'SUCCESS' : 'NO CHANGES');

    // Verify the update
    const carrier = await carriersDb.collection('carriers').findOne({ _id: new ObjectId(carrierId) });
    console.log('');
    console.log('=== CARRIER DATA ===');
    console.log('Name:', carrier.name);
    console.log('Legal Name:', carrier.legalName);
    console.log('SIRET:', carrier.siret);
    console.log('VAT:', carrier.vatNumber);
    console.log('Phone:', carrier.phone);
    console.log('Email:', carrier.email);
    console.log('Address:', carrier.address.street + ', ' + carrier.address.postalCode + ' ' + carrier.address.city);
    console.log('Vehicles:', carrier.fleet.vehicleCount);
    console.log('Total Transports:', carrier.stats.totalTransports);
    console.log('Dashdoc PK:', carrier.dashdoc.pk);
    console.log('Dashdoc Sync:', carrier.dashdoc.syncEnabled ? 'ENABLED' : 'DISABLED');

    // Also update subscription with carrier name
    const subsDb = client.db('rt-subscriptions');
    await subsDb.collection('subscriptions').updateOne(
      { carrierId: carrierId },
      { $set: {
        carrierName: 'SETT Transports',
        companyName: 'SARL SETT TRANSPORTS',
        updatedAt: new Date()
      }}
    );
    console.log('');
    console.log('Subscription updated with carrier name');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
    console.log('');
    console.log('Done!');
  }
}

updateCarrier();
