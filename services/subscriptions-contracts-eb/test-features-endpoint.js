const { MongoClient, ObjectId } = require('mongodb');
const uri = 'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/?retryWrites=true&w=majority';

// Simuler la logique de l'endpoint /api/stripe/features
(async () => {
  const mongoClient = new MongoClient(uri);
  try {
    await mongoClient.connect();

    const testEmails = ['r.tardy@rt-groupe.com', 'rtardy@rt-groupe.com'];

    for (const email of testEmails) {
      console.log('\n===========================================');
      console.log('Testing email:', email);
      console.log('===========================================');

      // Chercher dans rt-auth (source de vérité)
      const authDb = mongoClient.db('rt-auth');
      let user = null;

      // Chercher par email (comme le fait l'API)
      user = await authDb.collection('users').findOne({ email: email.toLowerCase() });

      if (!user) {
        // Fallback: chercher dans rt-subscriptions
        const subDb = mongoClient.db('rt-subscriptions');
        user = await subDb.collection('users').findOne({ email: email.toLowerCase() });
      }

      if (!user) {
        console.log('❌ User NOT FOUND');
        console.log('Would return: transporteur_free');
        continue;
      }

      console.log('✓ User found in database');

      // Déterminer le plan depuis les différentes sources possibles
      const planLevel = user.planLevel || user.subscription?.planLevel || 'GRATUIT';
      const planId = user.subscription?.plan || user.currentPlan || 'transporteur_free';
      const planName = user.subscription?.planName || 'Transporteur Gratuit';

      console.log('- planLevel:', planLevel);
      console.log('- planId:', planId);
      console.log('- planName:', planName);
      console.log('- subscription.status:', user.subscription?.status);

      // Construire les features activées depuis les modules
      const modules = user.modules || {};
      const activatedFeatures = ['base_access'];

      // Mapper les modules vers les features
      if (modules.affretIA || modules.bourse_fret) activatedFeatures.push('bourse_fret');
      if (modules.affretIA) activatedFeatures.push('matching_ia');
      if (modules.vigilanceDocuments || modules.alertesCritiques) activatedFeatures.push('vigilance', 'alertes_temps_reel');
      if (modules.referencementTransporteurs || modules.carrierReferencing) activatedFeatures.push('referentiel_transporteurs');
      if (modules.planningChargement || modules.planningIA) activatedFeatures.push('planning');
      if (modules.indicateursKpi || modules.kpiDashboard || modules.dashboardIndustriel) activatedFeatures.push('kpi');
      if (modules.carrierScoringSelection) activatedFeatures.push('scoring');
      if (modules.reponseAppelsOffres === true || modules.reponseAppelsOffres === -1) activatedFeatures.push('appels_offres');
      if (modules.multiUtilisateurs === -1 || user.subscription?.options?.includes('accessIndustrielComplet')) activatedFeatures.push('utilisateurs_illimites');
      if (modules.apiAccess) activatedFeatures.push('api_rest', 'tms_sync', 'webhooks');

      // Dédupliquer
      const uniqueFeatures = [...new Set(activatedFeatures)];

      console.log('- Modules count:', Object.keys(modules).length);
      console.log('- Features count:', uniqueFeatures.length);
      console.log('- Features:', uniqueFeatures.join(', '));

      const response = {
        success: true,
        data: {
          currentPlan: planId,
          planLevel: planLevel,
          planName: planName,
          price: user.subscription?.price || 0,
          activatedFeatures: uniqueFeatures,
          subscriptionStatus: user.subscription?.status || user.subscriptionStatus || (planLevel !== 'GRATUIT' ? 'active' : null),
          planActivatedAt: user.subscription?.startDate || user.planActivatedAt || null,
          modules: modules,
          options: user.subscription?.options || []
        }
      };

      console.log('\n📤 API Response would be:');
      console.log(JSON.stringify(response.data, null, 2));
    }

  } finally {
    await mongoClient.close();
  }
})();
