// Script de test de la configuration SMTP OVH
// Usage: node scripts/test-smtp.js

require('dotenv').config();
const { testSMTPConnection, sendEmail } = require('../email');

async function testSMTPConfiguration() {
  console.log('\n📧 Test de la configuration SMTP OVH');
  console.log('====================================\n');

  // Vérifier les variables d'environnement
  console.log('1️⃣  Vérification des variables d\'environnement...\n');

  const requiredVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD'];
  const missingVars = requiredVars.filter(v => !process.env[v]);

  if (missingVars.length > 0) {
    console.error('❌ Variables manquantes:', missingVars.join(', '));
    console.log('\nConfigurer dans le fichier .env:');
    console.log('SMTP_HOST=ssl0.ovh.net');
    console.log('SMTP_PORT=587');
    console.log('SMTP_SECURE=false');
    console.log('SMTP_USER=noreply@symphonia.com');
    console.log('SMTP_PASSWORD=votre-mot-de-passe');
    console.log('SMTP_FROM=noreply@symphonia.com\n');
    process.exit(1);
  }

  console.log('✅ Variables d\'environnement configurées:');
  console.log(`   SMTP_HOST: ${process.env.SMTP_HOST}`);
  console.log(`   SMTP_PORT: ${process.env.SMTP_PORT}`);
  console.log(`   SMTP_USER: ${process.env.SMTP_USER}`);
  console.log(`   SMTP_FROM: ${process.env.SMTP_FROM || process.env.SMTP_USER}\n`);

  // Test de connexion SMTP
  console.log('2️⃣  Test de connexion au serveur SMTP...\n');

  const connectionTest = await testSMTPConnection();

  if (!connectionTest.success) {
    console.error('❌ Échec de la connexion SMTP');
    console.error('   Erreur:', connectionTest.error);
    console.log('\nVérifiez:');
    console.log('- L\'adresse email et le mot de passe sont corrects');
    console.log('- Le compte email existe sur OVH');
    console.log('- Le serveur ssl0.ovh.net est accessible');
    console.log('- Le port 587 est ouvert\n');
    process.exit(1);
  }

  console.log('✅ Connexion SMTP réussie!\n');

  // Test d'envoi d'email
  console.log('3️⃣  Test d\'envoi d\'email...\n');

  const testEmail = process.argv[2] || process.env.SMTP_USER;

  console.log(`   Destinataire: ${testEmail}`);
  console.log('   Envoi en cours...\n');

  const sendResult = await sendEmail({
    to: testEmail,
    subject: '✅ Test SMTP SYMPHONI.A - Succès',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
          .check { font-size: 64px; text-align: center; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Configuration Réussie</h1>
            <p>SMTP OVH pour SYMPHONI.A</p>
          </div>
          <div class="content">
            <div class="check">✅</div>
            <h2>Félicitations !</h2>
            <p>Votre configuration SMTP OVH fonctionne parfaitement.</p>

            <p><strong>Détails de la configuration:</strong></p>
            <ul>
              <li>Serveur SMTP: ${process.env.SMTP_HOST}</li>
              <li>Port: ${process.env.SMTP_PORT}</li>
              <li>Sécurité: ${process.env.SMTP_SECURE === 'true' ? 'SSL/TLS' : 'STARTTLS'}</li>
              <li>Utilisateur: ${process.env.SMTP_USER}</li>
            </ul>

            <p><strong>Le système est prêt à envoyer:</strong></p>
            <ul>
              <li>📧 Emails d'invitation transporteurs</li>
              <li>🎉 Emails d'onboarding</li>
              <li>⚠️ Alertes de vigilance (J-30, J-15, J-7)</li>
              <li>🚫 Notifications de blocage</li>
              <li>✅ Confirmations de déblocage</li>
            </ul>

            <p>Vous pouvez maintenant déployer la version v3.1.0 en production!</p>
          </div>
          <div class="footer">
            <p>Email de test envoyé par SYMPHONI.A</p>
            <p>Date: ${new Date().toLocaleString('fr-FR')}</p>
          </div>
        </div>
      </body>
      </html>
    `
  });

  if (!sendResult.success) {
    console.error('❌ Échec de l\'envoi d\'email');
    console.error('   Erreur:', sendResult.error);
    console.log('\nVérifiez:');
    console.log('- Les paramètres SMTP sont corrects');
    console.log('- L\'adresse email destinataire est valide');
    console.log('- Le serveur OVH n\'est pas temporairement indisponible\n');
    process.exit(1);
  }

  console.log('✅ Email de test envoyé avec succès!');
  console.log(`   Message ID: ${sendResult.messageId}\n`);

  // Résumé final
  console.log('====================================');
  console.log('📊 Résumé des tests\n');
  console.log('✅ Variables d\'environnement: OK');
  console.log('✅ Connexion SMTP: OK');
  console.log('✅ Envoi d\'email: OK\n');
  console.log('🎉 Configuration SMTP OVH complète et fonctionnelle!');
  console.log('====================================\n');

  console.log('📝 Prochaines étapes:');
  console.log('1. Configurer SPF dans vos DNS');
  console.log('2. Activer DKIM sur OVH');
  console.log('3. Configurer DMARC dans vos DNS');
  console.log('4. Déployer la version v3.1.0 sur Elastic Beanstalk');
  console.log('5. Tester l\'invitation d\'un transporteur\n');

  process.exit(0);
}

// Exécuter le test
testSMTPConfiguration().catch(error => {
  console.error('\n💥 Erreur inattendue:', error.message);
  console.error(error.stack);
  process.exit(1);
});
