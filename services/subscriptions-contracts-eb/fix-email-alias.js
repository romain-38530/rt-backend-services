const { MongoClient, ObjectId } = require('mongodb');
const uri = 'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/?retryWrites=true&w=majority';

(async () => {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const authDb = client.db('rt-auth');

    // Récupérer l'utilisateur existant
    const existingUser = await authDb.collection('users').findOne({ email: 'r.tardy@rt-groupe.com' });

    if (!existingUser) {
      console.error('User r.tardy@rt-groupe.com not found');
      return;
    }

    console.log('Found existing user:', existingUser.email);
    console.log('PlanLevel:', existingUser.planLevel);
    console.log('Subscription status:', existingUser.subscription?.status);

    // Vérifier si l'alias existe déjà
    const aliasUser = await authDb.collection('users').findOne({ email: 'rtardy@rt-groupe.com' });

    if (aliasUser) {
      console.log('\nAlias user already exists, updating...');

      // Mettre à jour l'utilisateur alias avec les mêmes données
      await authDb.collection('users').updateOne(
        { email: 'rtardy@rt-groupe.com' },
        {
          $set: {
            planLevel: existingUser.planLevel,
            subscription: existingUser.subscription,
            modules: existingUser.modules,
            companyName: existingUser.companyName,
            updatedAt: new Date()
          }
        }
      );

      console.log('✓ Alias user updated with premium subscription');
    } else {
      console.log('\nCreating alias user...');

      // Créer un nouvel utilisateur alias
      const newUser = {
        ...existingUser,
        _id: new ObjectId(),
        email: 'rtardy@rt-groupe.com',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      delete newUser.password; // Ne pas copier le mot de passe si il existe

      await authDb.collection('users').insertOne(newUser);

      console.log('✓ Alias user created with premium subscription');
    }

    // Vérifier le résultat
    const updatedUser = await authDb.collection('users').findOne({ email: 'rtardy@rt-groupe.com' });
    console.log('\nVerification:');
    console.log('- Email:', updatedUser.email);
    console.log('- PlanLevel:', updatedUser.planLevel);
    console.log('- Subscription status:', updatedUser.subscription?.status);
    console.log('- Modules count:', Object.keys(updatedUser.modules || {}).length);

    console.log('\n✓ Done! Both emails now work:');
    console.log('  - r.tardy@rt-groupe.com');
    console.log('  - rtardy@rt-groupe.com');

  } finally {
    await client.close();
  }
})();
