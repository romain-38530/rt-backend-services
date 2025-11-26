#!/usr/bin/env node
// Script de test pour envoyer tous les types d'emails SYMPHONI.A
// Usage: node scripts/test-all-emails.js <email-destinataire>

const {
  sendCarrierInvitationEmail,
  sendOnboardingSuccessEmail,
  sendVigilanceAlertEmail,
  sendCarrierBlockedEmail,
  sendCarrierUnblockedEmail,
  testSMTPConnection
} = require('../email');

async function testAllEmails(testEmail) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🧪 Test Complet du Système d\'Emails SYMPHONI.A           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  if (!testEmail) {
    console.error('❌ Erreur: Veuillez fournir une adresse email de test');
    console.log('\nUsage: node scripts/test-all-emails.js <email>\n');
    console.log('Exemple: node scripts/test-all-emails.js rtardieu@symphonia.com\n');
    process.exit(1);
  }

  console.log(`📬 Adresse de test: ${testEmail}\n`);
  console.log('─'.repeat(65) + '\n');

  // Test de connexion SMTP
  console.log('🔌 0. Test de connexion SMTP OVH...');
  const connectionTest = await testSMTPConnection();

  if (!connectionTest.success) {
    console.error('❌ Échec de connexion SMTP:', connectionTest.error);
    console.log('\n⚠️  Vérifiez votre configuration SMTP dans les variables d\'environnement');
    process.exit(1);
  }
  console.log('✅ Connexion SMTP réussie!\n');

  // Attendre 2 secondes entre chaque email
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  try {
    // Test 1: Email d'invitation
    console.log('─'.repeat(65));
    console.log('1️⃣  Email d\'INVITATION');
    console.log('─'.repeat(65));
    console.log('   Envoi en cours...');
    const result1 = await sendCarrierInvitationEmail(
      testEmail,
      'Test Transport SYMPHONI.A',
      'Admin Test System'
    );
    if (result1.success) {
      console.log('   ✅ Email d\'invitation envoyé avec succès');
      console.log('   📧 Sujet: 🚚 Invitation SYMPHONI.A - Rejoignez notre réseau');
      console.log('   🎨 Design: Dégradé bleu/violet\n');
    } else {
      console.log('   ❌ Erreur:', result1.error, '\n');
    }
    await delay(2000);

    // Test 2: Email d'onboarding
    console.log('─'.repeat(65));
    console.log('2️⃣  Email d\'ONBOARDING RÉUSSI');
    console.log('─'.repeat(65));
    console.log('   Envoi en cours...');
    const result2 = await sendOnboardingSuccessEmail(
      testEmail,
      'Test Transport SYMPHONI.A',
      85 // Score de test
    );
    if (result2.success) {
      console.log('   ✅ Email d\'onboarding envoyé avec succès');
      console.log('   📧 Sujet: 🎉 Félicitations - Vous êtes maintenant Référencé');
      console.log('   🎨 Design: Dégradé vert');
      console.log('   📊 Score affiché: 85/100\n');
    } else {
      console.log('   ❌ Erreur:', result2.error, '\n');
    }
    await delay(2000);

    // Test 3: Email alerte J-30
    console.log('─'.repeat(65));
    console.log('3️⃣  Email d\'ALERTE VIGILANCE J-30');
    console.log('─'.repeat(65));
    console.log('   Envoi en cours...');
    const result3 = await sendVigilanceAlertEmail(
      testEmail,
      'Test Transport SYMPHONI.A',
      'kbis',
      30,
      new Date('2025-12-26')
    );
    if (result3.success) {
      console.log('   ✅ Email alerte J-30 envoyé avec succès');
      console.log('   📧 Sujet: 📋 Rappel - Document expirant dans 30 jours');
      console.log('   🎨 Design: Bleu (#3b82f6)');
      console.log('   📄 Document: KBIS\n');
    } else {
      console.log('   ❌ Erreur:', result3.error, '\n');
    }
    await delay(2000);

    // Test 4: Email alerte J-15
    console.log('─'.repeat(65));
    console.log('4️⃣  Email d\'ALERTE VIGILANCE J-15');
    console.log('─'.repeat(65));
    console.log('   Envoi en cours...');
    const result4 = await sendVigilanceAlertEmail(
      testEmail,
      'Test Transport SYMPHONI.A',
      'insurance',
      15,
      new Date('2025-12-11')
    );
    if (result4.success) {
      console.log('   ✅ Email alerte J-15 envoyé avec succès');
      console.log('   📧 Sujet: ⚠️ Important - Document expirant dans 15 jours');
      console.log('   🎨 Design: Orange (#f59e0b)');
      console.log('   📄 Document: Assurance RC\n');
    } else {
      console.log('   ❌ Erreur:', result4.error, '\n');
    }
    await delay(2000);

    // Test 5: Email alerte J-7
    console.log('─'.repeat(65));
    console.log('5️⃣  Email d\'ALERTE VIGILANCE J-7');
    console.log('─'.repeat(65));
    console.log('   Envoi en cours...');
    const result5 = await sendVigilanceAlertEmail(
      testEmail,
      'Test Transport SYMPHONI.A',
      'license',
      7,
      new Date('2025-12-03')
    );
    if (result5.success) {
      console.log('   ✅ Email alerte J-7 envoyé avec succès');
      console.log('   📧 Sujet: 🚨 URGENT - Document expirant dans 7 jours');
      console.log('   🎨 Design: Rouge (#ef4444)');
      console.log('   📄 Document: Licence de Transport\n');
    } else {
      console.log('   ❌ Erreur:', result5.error, '\n');
    }
    await delay(2000);

    // Test 6: Email de blocage
    console.log('─'.repeat(65));
    console.log('6️⃣  Email de BLOCAGE AUTOMATIQUE');
    console.log('─'.repeat(65));
    console.log('   Envoi en cours...');
    const result6 = await sendCarrierBlockedEmail(
      testEmail,
      'Test Transport SYMPHONI.A',
      'Document KBIS expiré le 20/11/2025'
    );
    if (result6.success) {
      console.log('   ✅ Email de blocage envoyé avec succès');
      console.log('   📧 Sujet: 🚫 COMPTE BLOQUÉ - Document expiré');
      console.log('   🎨 Design: Rouge avec alerte forte');
      console.log('   ⚠️  Raison: Document KBIS expiré\n');
    } else {
      console.log('   ❌ Erreur:', result6.error, '\n');
    }
    await delay(2000);

    // Test 7: Email de déblocage
    console.log('─'.repeat(65));
    console.log('7️⃣  Email de DÉBLOCAGE');
    console.log('─'.repeat(65));
    console.log('   Envoi en cours...');
    const result7 = await sendCarrierUnblockedEmail(
      testEmail,
      'Test Transport SYMPHONI.A'
    );
    if (result7.success) {
      console.log('   ✅ Email de déblocage envoyé avec succès');
      console.log('   📧 Sujet: ✅ Félicitations - Votre compte a été débloqué');
      console.log('   🎨 Design: Dégradé vert');
      console.log('   🎉 Message: Félicitations pour la régularisation\n');
    } else {
      console.log('   ❌ Erreur:', result7.error, '\n');
    }

    // Résumé final
    console.log('═'.repeat(65));
    console.log('✅ TOUS LES EMAILS DE TEST ONT ÉTÉ ENVOYÉS!');
    console.log('═'.repeat(65));
    console.log('\n📬 Vérifiez votre boîte email:', testEmail);
    console.log('\n📋 Vous devriez avoir reçu 7 emails:');
    console.log('   1. Invitation (bleu/violet)');
    console.log('   2. Onboarding (vert)');
    console.log('   3. Alerte J-30 (bleu)');
    console.log('   4. Alerte J-15 (orange)');
    console.log('   5. Alerte J-7 (rouge)');
    console.log('   6. Blocage (rouge)');
    console.log('   7. Déblocage (vert)');
    console.log('\n⚠️  Si les emails n\'arrivent pas:');
    console.log('   • Vérifiez le dossier SPAM');
    console.log('   • Attendez 2-3 minutes (délai de livraison)');
    console.log('   • Vérifiez les logs AWS CloudWatch');
    console.log('\n💡 Pour améliorer la délivrabilité:');
    console.log('   • Configurez SPF: v=spf1 include:mx.ovh.net ~all');
    console.log('   • Activez DKIM sur OVH');
    console.log('   • Configurez DMARC');
    console.log('\n📖 Documentation: GUIDE_TEST_COMPLET_EMAILS.md');
    console.log('\n');

  } catch (error) {
    console.error('\n❌ Erreur lors de l\'envoi des emails:', error);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Récupérer l'email depuis les arguments de ligne de commande
const testEmail = process.argv[2];

// Exécuter les tests
testAllEmails(testEmail);
