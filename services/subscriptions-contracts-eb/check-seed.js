const { MongoClient } = require('mongodb');
const uri = 'mongodb+srv://admin:RT2024SecurePass@rt-cluster-0.l12vt.mongodb.net/rt-subscriptions?retryWrites=true&w=majority';

async function check() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('rt-subscriptions');

  console.log('\n=== VERIFICATION DU SEED COMPLET ===\n');

  // Logisticiens
  const logisticians = await db.collection('logisticians').find({}).toArray();
  console.log('LOGISTICIENS:', logisticians.length);
  for (const l of logisticians) {
    console.log('  -', l.email, '| status:', l.status, '| hasPassword:', !!l.passwordHash);
  }

  // e-CMR
  const ecmr = await db.collection('ecmr').find({}).toArray();
  console.log('\nE-CMR:', ecmr.length);
  for (const e of ecmr) {
    console.log('  -', e.ecmrNumber, '| status:', e.status);
  }

  // Transport Orders
  const orders = await db.collection('transport_orders').find({}).toArray();
  console.log('\nTRANSPORT ORDERS:', orders.length);

  // Carriers
  const carriers = await db.collection('carriers').find({}).toArray();
  console.log('CARRIERS:', carriers.length);

  // Pricing Grids
  const grids = await db.collection('pricing_grids').find({}).toArray();
  console.log('PRICING GRIDS:', grids.length);

  // ICPE Declarations
  const icpe = await db.collection('icpe_volume_declarations').find({}).toArray();
  console.log('ICPE DECLARATIONS:', icpe.length);

  // Planning
  const slots = await db.collection('site_planning_slots').find({}).toArray();
  console.log('PLANNING SLOTS:', slots.length);

  // Chatbot
  const conversations = await db.collection('chatbot_conversations').find({}).toArray();
  console.log('CHATBOT CONVERSATIONS:', conversations.length);

  // Storage Market
  const storage = await db.collection('storage_capacity_offers').find({}).toArray();
  console.log('STORAGE OFFERS:', storage.length);

  console.log('\n=== FIN VERIFICATION ===\n');

  await client.close();
}

check().catch(console.error);
