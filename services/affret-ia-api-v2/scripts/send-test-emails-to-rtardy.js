/**
 * Script pour envoyer les emails de test TYPE 1 et TYPE 2
 * à r.tardy@rt-groupe.com pour validation
 */

require('dotenv').config();
const DashdocCarrierInvitationService = require('../services/dashdoc-carrier-invitation.service');

console.log('\n' + '='.repeat(80));
console.log('  ENVOI EMAILS DE TEST À R.TARDY@RT-GROUPE.COM');
console.log('='.repeat(80));
console.log();

// Email de test
const TEST_EMAIL = 'r.tardy@rt-groupe.com';

// Données de test (MENIER TRANSPORTS)
const mockCarrierData = {
  carrierName: 'MENIER TRANSPORTS',
  carrierEmail: TEST_EMAIL, // Envoi à r.tardy pour test
  carrierPhone: '+33678378662',
  carrierSiren: '89823001600021',
  carrierContact: {
    firstName: 'Mohamed',
    lastName: 'SOLTANI',
    email: TEST_EMAIL,
    phone: '+33678378662'
  },
  totalTransports: 47,
  routes: [
    {
      from: '38790',
      fromCity: 'Saint-Georges-d\'Espéranche',
      to: '38070',
      toCity: 'Saint-Quentin-Fallavier',
      price: 12,
      date: new Date('2026-02-02')
    },
    {
      from: '13000',
      fromCity: 'Marseille',
      to: '69000',
      toCity: 'Lyon',
      price: 420,
      date: new Date('2026-01-28')
    },
    {
      from: '75000',
      fromCity: 'Paris',
      to: '33000',
      toCity: 'Bordeaux',
      price: 850,
      date: new Date('2026-01-15')
    }
  ],
  avgPrice: 384.5
};

// Offres disponibles pour TYPE 2
const mockAvailableOrders = [
  {
    orderId: 'TEST-ORDER-1',
    pickup: { city: 'Lyon', postalCode: '69000' },
    delivery: { city: 'Paris', postalCode: '75000' },
    pickupDate: new Date('2026-02-10'),
    estimatedPrice: 800,
    cargo: { palettes: 28, weight: 19000 }
  },
  {
    orderId: 'TEST-ORDER-2',
    pickup: { city: 'Marseille', postalCode: '13000' },
    delivery: { city: 'Bordeaux', postalCode: '33000' },
    pickupDate: new Date('2026-02-12'),
    estimatedPrice: 650,
    cargo: { palettes: 22, weight: 15000 }
  }
];

async function sendTestEmails() {
  try {
    console.log(`📧 Destinataire: ${TEST_EMAIL}`);
    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // ENVOI EMAIL TYPE 1 - Transporteur Connu
    // ═══════════════════════════════════════════════════════════════════════

    console.log('─'.repeat(80));
    console.log('📤 ENVOI EMAIL TYPE 1 : TRANSPORTEUR CONNU');
    console.log('─'.repeat(80));
    console.log();

    console.log('📋 Données email TYPE 1:');
    console.log(`   Transporteur: ${mockCarrierData.carrierName}`);
    console.log(`   Contact: ${mockCarrierData.carrierContact.firstName} ${mockCarrierData.carrierContact.lastName}`);
    console.log(`   Transports: ${mockCarrierData.totalTransports}`);
    console.log(`   Routes: ${mockCarrierData.routes.length}`);
    console.log(`   Prix moyen: ${mockCarrierData.avgPrice.toFixed(2)}€`);
    console.log();

    const resultType1 = await DashdocCarrierInvitationService.sendInvitationToKnownCarrier(
      mockCarrierData,
      { dryRun: false } // VRAI ENVOI
    );

    if (resultType1.success) {
      console.log('✅ EMAIL TYPE 1 ENVOYÉ');
      console.log(`   MessageId: ${resultType1.messageId || 'N/A'}`);
      console.log(`   URL invitation: ${resultType1.invitationUrl}`);
    } else {
      console.log('❌ ÉCHEC ENVOI TYPE 1:', resultType1.error || resultType1.reason);
    }

    console.log();

    // Attendre 2 secondes entre les emails
    console.log('⏳ Attente 2 secondes...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // ENVOI EMAIL TYPE 2 - Conquête
    // ═══════════════════════════════════════════════════════════════════════

    console.log('─'.repeat(80));
    console.log('📤 ENVOI EMAIL TYPE 2 : CONQUÊTE');
    console.log('─'.repeat(80));
    console.log();

    console.log('📋 Données email TYPE 2:');
    console.log(`   Transporteur: ${mockCarrierData.carrierName}`);
    console.log(`   Contact: ${mockCarrierData.carrierContact.firstName} ${mockCarrierData.carrierContact.lastName}`);
    console.log(`   Offres disponibles: ${mockAvailableOrders.length}`);
    mockAvailableOrders.forEach((order, i) => {
      console.log(`   ${i+1}. ${order.pickup.city} → ${order.delivery.city} (${order.estimatedPrice}€)`);
    });
    console.log();

    const resultType2 = await DashdocCarrierInvitationService.sendConquestEmailToCarrier(
      mockCarrierData,
      mockAvailableOrders,
      { dryRun: false } // VRAI ENVOI
    );

    if (resultType2.success) {
      console.log('✅ EMAIL TYPE 2 ENVOYÉ');
      console.log(`   MessageId: ${resultType2.messageId || 'N/A'}`);
      console.log(`   URL inscription: ${resultType2.signupUrl}`);
    } else {
      console.log('❌ ÉCHEC ENVOI TYPE 2:', resultType2.error || resultType2.reason);
    }

    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // RÉSUMÉ FINAL
    // ═══════════════════════════════════════════════════════════════════════

    console.log('='.repeat(80));
    console.log('  RÉSUMÉ');
    console.log('='.repeat(80));
    console.log();

    const type1Success = resultType1.success ? '✅' : '❌';
    const type2Success = resultType2.success ? '✅' : '❌';

    console.log(`${type1Success} EMAIL TYPE 1 (Transporteur Connu): ${resultType1.success ? 'ENVOYÉ' : 'ÉCHEC'}`);
    console.log(`${type2Success} EMAIL TYPE 2 (Conquête): ${resultType2.success ? 'ENVOYÉ' : 'ÉCHEC'}`);
    console.log();

    if (resultType1.success && resultType2.success) {
      console.log('🎉 TOUS LES EMAILS ONT ÉTÉ ENVOYÉS AVEC SUCCÈS !');
      console.log();
      console.log(`📬 Vérifiez votre boîte email: ${TEST_EMAIL}`);
      console.log();
      console.log('📝 Contenu des emails:');
      console.log('   TYPE 1: Email personnalisé avec historique (47 transports, 3 routes)');
      console.log('   TYPE 2: Email de conquête avec offres disponibles (2 transports)');
      console.log();
      console.log('✅ Modifications validées:');
      console.log('   - TYPE 1: Prix moyen retiré de la section statistiques');
      console.log('   - TYPE 2: "10 consultations de transports gratuit" (au lieu de commission)');
      console.log('   - TYPE 2: "20 consultations de transports gratuit" dans offre limitée');
      console.log();
      console.log(`🌐 Domaine utilisé: symphonia-controltower.com`);
      console.log(`📧 Expéditeur: affret-ia@symphonia-controltower.com`);
    } else {
      console.log('⚠️ CERTAINS EMAILS N\'ONT PAS ÉTÉ ENVOYÉS');
      console.log();
      console.log('Vérifiez:');
      console.log('1. AWS SES est configuré (AWS_REGION, credentials)');
      console.log('2. Le domaine symphonia-controltower.com est vérifié dans SES');
      console.log('3. L\'email affret-ia@symphonia-controltower.com est autorisé');
      console.log('4. Le compte SES est sorti du mode Sandbox');
    }

    console.log();
    console.log('='.repeat(80));
    console.log();

  } catch (error) {
    console.error('❌ ERREUR:', error.message);
    console.error();
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Exécuter
sendTestEmails();
