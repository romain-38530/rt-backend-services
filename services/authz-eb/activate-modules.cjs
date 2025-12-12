/**
 * Script pour activer les modules pour le compte démo industrie
 */

const { MongoClient, ServerApiVersion } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/?retryWrites=true&w=majority&appName=StagingRT';

async function activateModules() {
  console.log('='.repeat(60));
  console.log('ACTIVATION DES MODULES POUR DEMO INDUSTRIE');
  console.log('='.repeat(60));

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

    // Modules à activer pour l'industriel
    const industrielModules = {
      modules: {
        // Modules existants (boutons violets 'Accéder')
        commandesIndustrielles: { active: true, name: 'Commandes Industrielles', icon: 'Package' },
        indicateurs: { active: true, name: 'Indicateurs', icon: 'BarChart' },
        alertesCritiques: { active: true, name: 'Alertes Critiques', icon: 'AlertTriangle' },
        demandes: { active: true, name: 'Demandes', icon: 'FileText' },
        facturation: { active: true, name: 'Facturation', icon: 'Euro' },
        palettesEurope: { active: true, name: 'Palettes Europe', icon: 'Box' },

        // Modules à débloquer (étaient verrouillés)
        bourseDeStockage: { active: true, name: 'Bourse de Stockage', icon: 'Warehouse' },
        formationTraining: { active: true, name: 'Formation & Training', icon: 'GraduationCap' },
        affretIA: { active: true, name: 'Affret.IA', icon: 'Brain' },

        // Nouveaux modules à ajouter
        referencementTransporteurs: { active: true, name: 'Référencement Transporteurs', icon: 'Users' },
        grillesTarifaires: { active: true, name: 'Grilles Tarifaires', icon: 'Grid' }
      },
      subscription: {
        plan: 'enterprise',
        status: 'active',
        features: [
          'storage_market',
          'training',
          'affret_ia',
          'carrier_referencing',
          'pricing_grids',
          'invoicing',
          'palettes',
          'orders',
          'indicators',
          'alerts',
          'demands',
          'ecmr',
          'tracking',
          'chatbot'
        ],
        activatedAt: new Date(),
        expiresAt: new Date('2026-12-31')
      },
      accountType: 'EXPEDITEUR',
      accountStatus: 'ACTIVE'
    };

    const result = await db.collection('users').updateOne(
      { email: 'demo-industrie@symphonia-controltower.com' },
      {
        $set: {
          ...industrielModules,
          updatedAt: new Date()
        }
      }
    );

    console.log('Mis à jour:', result.modifiedCount, 'document(s)\n');

    // Vérifier
    const user = await db.collection('users').findOne({ email: 'demo-industrie@symphonia-controltower.com' });
    console.log('Modules activés pour demo-industrie:');
    Object.entries(user.modules || {}).forEach(([key, val]) => {
      console.log(`  ✅ ${val.name}`);
    });

    console.log('\nFeatures abonnement:');
    (user.subscription?.features || []).forEach(f => console.log(`  - ${f}`));

  } catch (error) {
    console.error('Erreur:', error.message);
  } finally {
    await client.close();
    console.log('\n✅ Connexion MongoDB fermée');
  }
}

activateModules();
