const { MongoClient } = require('mongodb');
const uri = 'mongodb+srv://rt_admin:Symphonia2024!@stagingrt.v2jnoh2.mongodb.net';

async function count() {
  const client = new MongoClient(uri);
  await client.connect();

  const db = client.db('rt-carriers');
  const total = await db.collection('carriers').countDocuments();
  const withEmail = await db.collection('carriers').countDocuments({ email: { $ne: null, $not: /placeholder/ } });
  const withSiret = await db.collection('carriers').countDocuments({ siret: { $ne: '' } });

  console.log('Total carriers:', total);
  console.log('With real email:', withEmail);
  console.log('With SIRET:', withSiret);

  await client.close();
}

count();
