/**
 * Récupérer le token Dashdoc depuis la base MongoDB
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = "mongodb+srv://rt_admin:SXmnNXTiAN5KtAaPLdhGHqLiXB5KX7Vd@stagingrt.v2jnoh2.mongodb.net/rt-tms-sync";

async function getToken() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db("rt-tms-sync");

    // Chercher la connexion Dashdoc
    const connection = await db.collection('tmsconnections').findOne({
      provider: 'dashdoc'
    });

    if (connection) {
      console.log("✅ Connexion Dashdoc trouvée:");
      console.log(`   ID: ${connection._id}`);
      console.log(`   Nom: ${connection.name}`);
      console.log(`   Provider: ${connection.provider}`);
      console.log(`   Active: ${connection.isActive}`);
      console.log(`   Token: ${connection.apiToken ? '***' + connection.apiToken.slice(-8) : 'N/A'}`);
      console.log("");
      console.log(`DASHDOC_API_TOKEN=${connection.apiToken}`);
    } else {
      console.log("❌ Aucune connexion Dashdoc trouvée");
    }

  } catch (error) {
    console.error("❌ Erreur:", error.message);
  } finally {
    await client.close();
  }
}

getToken();
