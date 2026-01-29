const { MongoClient } = require('mongodb');
const uri = 'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/?retryWrites=true&w=majority';

(async () => {
  const client = new MongoClient(uri);
  try {
    await client.connect();

    console.log('=== Checking rt-auth database ===');
    const authDb = client.db('rt-auth');
    const authUsers = await authDb.collection('users').find({
      email: { $regex: 'tardy@rt-groupe', $options: 'i' }
    }).toArray();

    console.log('Users in rt-auth:', authUsers.length);
    authUsers.forEach(user => {
      console.log('\n- Email:', user.email);
      console.log('  PlanLevel:', user.planLevel);
      console.log('  Subscription:', user.subscription);
      console.log('  Modules:', user.modules ? JSON.stringify(user.modules, null, 2) : 'none');
      console.log('  _id:', user._id);
    });

    console.log('\n=== Checking rt-subscriptions database ===');
    const subDb = client.db('rt-subscriptions');
    const subUsers = await subDb.collection('users').find({
      $or: [
        { email: { $regex: 'tardy@rt-groupe', $options: 'i' } },
        { userEmail: { $regex: 'tardy@rt-groupe', $options: 'i' } }
      ]
    }).toArray();

    console.log('Users in rt-subscriptions:', subUsers.length);
    subUsers.forEach(user => {
      console.log('\n- Email:', user.email || user.userEmail);
      console.log('  PlanLevel:', user.planLevel);
      console.log('  Plan:', user.plan);
      console.log('  _id:', user._id);
    });

    console.log('\n=== Checking subscriptions collection ===');
    const subscriptions = await subDb.collection('subscriptions').find({
      $or: [
        { userEmail: { $regex: 'tardy@rt-groupe', $options: 'i' } },
        { email: { $regex: 'tardy@rt-groupe', $options: 'i' } }
      ]
    }).toArray();

    console.log('Subscriptions found:', subscriptions.length);
    subscriptions.forEach(sub => {
      console.log('\n- Email:', sub.userEmail || sub.email);
      console.log('  Plan:', sub.plan);
      console.log('  PlanName:', sub.planName);
      console.log('  Status:', sub.status);
      console.log('  StartDate:', sub.startDate);
      console.log('  EndDate:', sub.currentPeriodEnd);
      console.log('  _id:', sub._id);
      console.log('  userId:', sub.userId);
    });

  } finally {
    await client.close();
  }
})();
