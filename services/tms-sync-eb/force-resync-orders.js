/**
 * Force re-synchronisation des commandes depuis Dashdoc
 * Utiliser pour mettre à jour les anciennes commandes après un fix
 *
 * Usage: node force-resync-orders.js [date-debut] [date-fin]
 * Exemple: node force-resync-orders.js 2026-02-11 2026-02-15
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const DashdocConnector = require('./connectors/dashdoc.connector');

async function forceResync(startDate, endDate) {
  console.log(`🔄 Force re-sync commandes ${startDate} → ${endDate}`);

  // Connexion MongoDB (native + mongoose)
  const mongoClient = new MongoClient(process.env.MONGODB_URI);
  await mongoClient.connect();
  const db = mongoClient.db();

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB connecté (native + mongoose)');

  // Récupérer les connexions TMS actives
  const connections = await db.collection('tmsConnections').find({
    isActive: true,
    tmsType: 'dashdoc'
  }).toArray();

  console.log(`📋 ${connections.length} connexions TMS trouvées\n`);

  for (const connection of connections) {
    try {
      console.log(`🔄 Sync ${connection.organizationName}...`);

      const dashdoc = new DashdocConnector(connection);

      // Récupérer les transports avec filtre date
      const filters = {
        created_after: new Date(startDate).toISOString(),
        created_before: new Date(endDate + 'T23:59:59').toISOString(),
        tags__name: 'Symphonia' // Seulement les transports Symphonia
      };

      console.log(`   Filtre: ${filters.created_after} → ${filters.created_before}`);

      const rawTransports = await dashdoc.getTransports(filters);
      console.log(`   📦 ${rawTransports.length} transports Dashdoc récupérés`);

      if (rawTransports.length === 0) {
        console.log(`   ℹ️  Aucun transport à synchroniser\n`);
        continue;
      }

      // Mapper avec mapTransport pour inclure assignedCarrier
      const mappedTransports = rawTransports.map(t => dashdoc.mapTransport(t));
      console.log(`   ✅ Transports mappés avec assignedCarrier`);

      // 1. Stocker dans Data Lake MongoDB
      const DashdocTransport = require('./models/dashdoc-datalake/DashdocTransport.model');

      let dataLakeUpdated = 0;
      for (const transport of mappedTransports) {
        await DashdocTransport.findOneAndUpdate(
          {
            pk: transport.dashdocId || transport.pk,
            connectionId: connection._id.toString()
          },
          {
            $set: {
              ...transport,
              updatedAt: new Date()
            }
          },
          { upsert: true }
        );
        dataLakeUpdated++;

        if (dataLakeUpdated % 10 === 0) {
          process.stdout.write(`\r   💾 Data Lake: ${dataLakeUpdated}/${mappedTransports.length}`);
        }
      }
      console.log(`\r   ✅ Data Lake: ${dataLakeUpdated}/${mappedTransports.length} transports`);

      // 2. Synchroniser vers Symphonia Orders
      let symphoniaUpdated = 0;
      let symphoniaErrors = 0;

      for (const transport of mappedTransports) {
        try {
          // Vérifier si la commande existe déjà dans Symphonia
          const existingOrder = await db.collection('orders').findOne({
            'metadata.dashdocTransportUid': transport.uid || transport.dashdocId
          });

          if (existingOrder) {
            // Mettre à jour avec les nouvelles données assignedCarrier
            await db.collection('orders').updateOne(
              { _id: existingOrder._id },
              {
                $set: {
                  'assignedCarrier': transport.assignedCarrier,
                  'metadata.lastSyncDate': new Date(),
                  'updatedAt': new Date()
                }
              }
            );
            symphoniaUpdated++;
          }

          if ((symphoniaUpdated + symphoniaErrors) % 10 === 0) {
            process.stdout.write(`\r   🔄 Symphonia: ${symphoniaUpdated} mis à jour, ${symphoniaErrors} erreurs`);
          }
        } catch (err) {
          symphoniaErrors++;
        }
      }

      console.log(`\r   ✅ Symphonia: ${symphoniaUpdated} commandes mises à jour`);
      if (symphoniaErrors > 0) {
        console.log(`   ⚠️  ${symphoniaErrors} erreurs (commandes non trouvées dans Symphonia)`);
      }
      console.log('');

    } catch (error) {
      console.error(`   ❌ Erreur pour ${connection.organizationName}:`, error.message);
      console.log('');
    }
  }

  await mongoose.disconnect();
  await mongoClient.close();
  console.log('🎉 Re-synchronisation terminée!\n');
}

// Arguments: date début et fin
const startDate = process.argv[2] || '2026-02-11';
const endDate = process.argv[3] || '2026-02-15';

forceResync(startDate, endDate)
  .catch(err => {
    console.error('❌ Erreur:', err);
    process.exit(1);
  });
