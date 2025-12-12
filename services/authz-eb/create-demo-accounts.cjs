/**
 * Script pour créer les comptes de démonstration dans la base de données
 * Usage: node create-demo-accounts.cjs
 */

const { MongoClient, ServerApiVersion } = require('mongodb');
const bcrypt = require('bcryptjs');

// Configuration MongoDB
const MONGODB_URI = 'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/?retryWrites=true&w=majority&appName=StagingRT';

// Mot de passe par défaut pour tous les comptes de démo
const DEMO_PASSWORD = 'Demo2025!';

// Comptes de démonstration à créer
const DEMO_ACCOUNTS = [
  {
    email: 'demo-industrie@symphonia-controltower.com',
    password: DEMO_PASSWORD,
    firstName: 'Jean-Pierre',
    lastName: 'Martin',
    role: 'industry',
    organization: {
      name: 'Industrie Moderne SA',
      siret: '12345678901234',
      address: '15 Rue de l\'Innovation, 69001 Lyon',
      phone: '+33 4 72 00 00 01'
    },
    isVerified: true,
    isActive: true
  },
  {
    email: 'demo-transport1@symphonia-controltower.com',
    password: DEMO_PASSWORD,
    firstName: 'Marc',
    lastName: 'Dupont',
    role: 'transporter',
    organization: {
      name: 'Transport Express SARL',
      siret: '98765432109876',
      address: '8 Avenue du Fret, 69007 Lyon',
      phone: '+33 4 72 00 00 10',
      licenseNumber: 'LIC-2024-001',
      fleetSize: 25,
      score: 95
    },
    isVerified: true,
    isActive: true
  },
  {
    email: 'demo-transport2@symphonia-controltower.com',
    password: DEMO_PASSWORD,
    firstName: 'Sophie',
    lastName: 'Lemaire',
    role: 'transporter',
    organization: {
      name: 'Trans Europe International',
      siret: '55566677788899',
      address: '22 Route Nationale, 38000 Grenoble',
      phone: '+33 4 76 00 00 20',
      licenseNumber: 'LIC-2024-002',
      fleetSize: 40,
      score: 88
    },
    isVerified: true,
    isActive: true
  },
  {
    email: 'demo-transport3@symphonia-controltower.com',
    password: DEMO_PASSWORD,
    firstName: 'Pierre',
    lastName: 'Moreau',
    role: 'transporter',
    organization: {
      name: 'Speed Logistics Express',
      siret: '11122233344455',
      address: '5 Zone Industrielle Nord, 42000 Saint-Etienne',
      phone: '+33 4 77 00 00 30',
      licenseNumber: 'LIC-2024-003',
      fleetSize: 15,
      score: 82
    },
    isVerified: true,
    isActive: true
  },
  {
    email: 'demo-logisticien@symphonia-controltower.com',
    password: DEMO_PASSWORD,
    firstName: 'Marie',
    lastName: 'Durand',
    role: 'logistician',
    organization: {
      name: 'LogiStock France',
      siret: '44455566677788',
      address: '100 Parc Logistique, 69200 Vénissieux',
      phone: '+33 4 72 00 00 50',
      warehouses: [
        { name: 'Entrepôt Lyon Sud', surface: 15000, city: 'Vénissieux' },
        { name: 'Entrepôt Rhône-Alpes', surface: 25000, city: 'Saint-Priest' }
      ]
    },
    isVerified: true,
    isActive: true
  },
  {
    email: 'demo-fournisseur@symphonia-controltower.com',
    password: DEMO_PASSWORD,
    firstName: 'Luc',
    lastName: 'Bernard',
    role: 'supplier',
    organization: {
      name: 'Fournisseur Alpha Industries',
      siret: '77788899900011',
      address: '50 Zone Artisanale, 01000 Bourg-en-Bresse',
      phone: '+33 4 74 00 00 60'
    },
    isVerified: true,
    isActive: true
  },
  {
    email: 'demo-destinataire@symphonia-controltower.com',
    password: DEMO_PASSWORD,
    firstName: 'Claire',
    lastName: 'Petit',
    role: 'recipient',
    organization: {
      name: 'Destinataire Final SARL',
      siret: '22233344455566',
      address: '25 Avenue du Commerce, 75012 Paris',
      phone: '+33 1 40 00 00 70'
    },
    isVerified: true,
    isActive: true
  }
];

async function createDemoAccounts() {
  console.log('============================================================');
  console.log('CRÉATION DES COMPTES DE DÉMONSTRATION');
  console.log('============================================================\n');

  const client = new MongoClient(MONGODB_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });

  try {
    await client.connect();
    console.log('✅ Connecté à MongoDB\n');

    const db = client.db('rt-auth');
    const usersCollection = db.collection('users');

    const results = [];

    for (const account of DEMO_ACCOUNTS) {
      try {
        // Vérifier si le compte existe déjà
        const existingUser = await usersCollection.findOne({ email: account.email });

        if (existingUser) {
          // Mettre à jour le mot de passe si le compte existe
          const hashedPassword = await bcrypt.hash(account.password, 10);
          await usersCollection.updateOne(
            { email: account.email },
            {
              $set: {
                password: hashedPassword,
                isVerified: true,
                isActive: true,
                updatedAt: new Date()
              }
            }
          );
          console.log(`🔄 Mis à jour: ${account.email}`);
          results.push({ email: account.email, status: 'updated' });
        } else {
          // Créer le compte
          const hashedPassword = await bcrypt.hash(account.password, 10);
          const userDoc = {
            email: account.email,
            password: hashedPassword,
            firstName: account.firstName,
            lastName: account.lastName,
            role: account.role,
            organization: account.organization,
            isVerified: true,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          await usersCollection.insertOne(userDoc);
          console.log(`✅ Créé: ${account.email}`);
          results.push({ email: account.email, status: 'created' });
        }
      } catch (error) {
        console.error(`❌ Erreur pour ${account.email}: ${error.message}`);
        results.push({ email: account.email, status: 'error', error: error.message });
      }
    }

    console.log('\n============================================================');
    console.log('COMPTES DE DÉMONSTRATION CRÉÉS');
    console.log('============================================================\n');

    console.log('Mot de passe pour tous les comptes: ' + DEMO_PASSWORD);
    console.log('\n--- IDENTIFIANTS DE CONNEXION ---\n');

    console.log('🏭 INDUSTRIEL:');
    console.log('   URL: https://industry.symphonia-controltower.com');
    console.log('   Email: demo-industrie@symphonia-controltower.com');
    console.log('   Mot de passe: ' + DEMO_PASSWORD);

    console.log('\n🚚 TRANSPORTEURS:');
    console.log('   URL: https://transporter.symphonia-controltower.com');
    console.log('   Email: demo-transport1@symphonia-controltower.com (Score 95)');
    console.log('   Email: demo-transport2@symphonia-controltower.com (Score 88)');
    console.log('   Email: demo-transport3@symphonia-controltower.com (Score 82)');
    console.log('   Mot de passe: ' + DEMO_PASSWORD);

    console.log('\n📦 LOGISTICIEN:');
    console.log('   URL: https://logistician.symphonia-controltower.com');
    console.log('   Email: demo-logisticien@symphonia-controltower.com');
    console.log('   Mot de passe: ' + DEMO_PASSWORD);

    console.log('\n�icing FOURNISSEUR:');
    console.log('   URL: https://supplier.symphonia-controltower.com');
    console.log('   Email: demo-fournisseur@symphonia-controltower.com');
    console.log('   Mot de passe: ' + DEMO_PASSWORD);

    console.log('\n📬 DESTINATAIRE:');
    console.log('   URL: https://recipient.symphonia-controltower.com');
    console.log('   Email: demo-destinataire@symphonia-controltower.com');
    console.log('   Mot de passe: ' + DEMO_PASSWORD);

    console.log('\n============================================================');

    return results;

  } catch (error) {
    console.error('Erreur de connexion MongoDB:', error.message);
    throw error;
  } finally {
    await client.close();
    console.log('\n✅ Connexion MongoDB fermée');
  }
}

createDemoAccounts().catch(console.error);
