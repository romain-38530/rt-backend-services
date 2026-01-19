/**
 * Script pour nettoyer les commandes du compte SETT
 * Le compte vient d'etre cree, il ne devrait avoir aucune commande
 */

const { MongoClient } = require('c:/Users/rtard/rt-backend-services/node_modules/.pnpm/mongodb@6.21.0/node_modules/mongodb');

const MONGODB_URI = 'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/?retryWrites=true&w=majority';
const SETT_EMAIL = 'r.tardy@rt-groupe.com';

async function cleanOrders() {
  let client;

  try {
    console.log('Connexion a MongoDB Atlas...\n');
    client = new MongoClient(MONGODB_URI);
    await client.connect();

    // Chercher dans rt-auth pour obtenir l'ID utilisateur
    const authDb = client.db('rt-auth');
    const user = await authDb.collection('users').findOne({ email: SETT_EMAIL.toLowerCase() });

    if (!user) {
      console.log('Utilisateur non trouve!');
      return;
    }

    console.log('Utilisateur trouve:');
    console.log('  ID:', user._id.toString());
    console.log('  Email:', user.email);
    console.log('  Company:', user.companyName);

    // Chercher les commandes dans differentes bases/collections
    const databases = ['rt-auth', 'rt-subscriptions', 'rt-transport'];

    for (const dbName of databases) {
      const db = client.db(dbName);
      const collections = await db.listCollections().toArray();

      for (const col of collections) {
        if (col.name.includes('order') || col.name.includes('commande') || col.name.includes('transport')) {
          const collection = db.collection(col.name);

          // Chercher par carrierId, transporterId, userId, email, companyName
          const queries = [
            { carrierId: user._id },
            { carrierId: user._id.toString() },
            { transporterId: user._id },
            { transporterId: user._id.toString() },
            { userId: user._id },
            { userId: user._id.toString() },
            { 'carrier.email': SETT_EMAIL },
            { 'transporter.email': SETT_EMAIL },
            { carrierEmail: SETT_EMAIL },
            { transporterEmail: SETT_EMAIL },
            { 'carrier.companyName': 'SETT Transports' },
            { 'transporter.companyName': 'SETT Transports' },
            { companyName: 'SETT Transports' },
            { createdBy: 'SETT' },
            { createdBy: { $regex: /SETT/i } }
          ];

          let totalFound = 0;
          for (const query of queries) {
            const count = await collection.countDocuments(query);
            if (count > 0) {
              totalFound += count;
              console.log(`\n[${dbName}.${col.name}] ${count} documents trouves avec:`, JSON.stringify(query));

              // Lister quelques exemples
              const examples = await collection.find(query).limit(3).toArray();
              examples.forEach(doc => {
                console.log('  - ID:', doc._id, '| Statut:', doc.status || doc.statut || 'N/A');
              });
            }
          }

          if (totalFound > 0) {
            console.log(`\nTotal dans ${dbName}.${col.name}: ${totalFound} documents`);
          }
        }
      }
    }

    // Verifier aussi les affectations
    console.log('\n=== Verification des affectations ===');
    const affectationsCollections = ['affectations', 'carrier_affectations', 'transporter_assignments'];

    for (const dbName of databases) {
      const db = client.db(dbName);
      for (const colName of affectationsCollections) {
        try {
          const col = db.collection(colName);
          const count = await col.countDocuments({
            $or: [
              { carrierId: user._id },
              { carrierId: user._id.toString() },
              { carrierEmail: SETT_EMAIL },
              { 'carrier.email': SETT_EMAIL }
            ]
          });
          if (count > 0) {
            console.log(`[${dbName}.${colName}] ${count} affectations trouvees`);
          }
        } catch (e) {
          // Collection n'existe pas
        }
      }
    }

  } catch (error) {
    console.error('ERREUR:', error.message);
  } finally {
    if (client) {
      await client.close();
      console.log('\nConnexion fermee.');
    }
  }
}

cleanOrders();
