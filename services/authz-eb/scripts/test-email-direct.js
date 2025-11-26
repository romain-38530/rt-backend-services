#!/usr/bin/env node
// Script de test direct pour envoyer un email de vérification
// Usage: node scripts/test-email-direct.js

const nodemailer = require('nodemailer');

// Configuration SMTP OVH
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'ssl0.ovh.net',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'noreply@symphonia-controltower.com',
    pass: process.env.SMTP_PASSWORD || 'Sett.38530'
  }
};

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║   🧪 Test Direct SMTP OVH - SYMPHONI.A                 ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

console.log('📋 Configuration SMTP:');
console.log(`   Host: ${SMTP_CONFIG.host}`);
console.log(`   Port: ${SMTP_CONFIG.port}`);
console.log(`   Secure: ${SMTP_CONFIG.secure}`);
console.log(`   User: ${SMTP_CONFIG.auth.user}`);
console.log(`   Pass: ${'*'.repeat(SMTP_CONFIG.auth.pass.length)}\n`);

async function testEmailDirect() {
  try {
    console.log('🔌 1. Création du transporteur nodemailer...');
    const transporter = nodemailer.createTransport(SMTP_CONFIG);

    console.log('✅ Transporteur créé\n');

    console.log('🔐 2. Test de connexion SMTP...');
    await transporter.verify();
    console.log('✅ Connexion SMTP réussie!\n');

    console.log('📧 3. Envoi d\'un email de test...');

    const testEmail = 'r.tardy@rt-groupe.com';

    const info = await transporter.sendMail({
      from: `"SYMPHONI.A" <${SMTP_CONFIG.auth.user}>`,
      to: testEmail,
      subject: '✅ Test Système d\'Emails SYMPHONI.A - 26 Nov 2025',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">
                        ✅ Test Réussi !
                      </h1>
                    </td>
                  </tr>

                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="color: #333333; margin: 0 0 20px 0; font-size: 24px;">
                        Système d'Emails Opérationnel
                      </h2>

                      <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                        Félicitations ! Le système d'envoi d'emails SYMPHONI.A fonctionne parfaitement.
                      </p>

                      <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0;">
                        <p style="margin: 0; color: #333333; font-size: 14px; line-height: 1.6;">
                          <strong>📧 Expéditeur:</strong> noreply@symphonia-controltower.com<br>
                          <strong>📅 Date:</strong> ${new Date().toLocaleString('fr-FR')}<br>
                          <strong>🚀 Version:</strong> v3.1.0-with-emails<br>
                          <strong>✅ Status:</strong> Opérationnel
                        </p>
                      </div>

                      <h3 style="color: #333333; margin: 30px 0 15px 0; font-size: 18px;">
                        🎯 Prochaines Étapes
                      </h3>

                      <ul style="color: #666666; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                        <li>✅ Système d'emails testé et fonctionnel</li>
                        <li>📋 Configuration DNS recommandée (SPF, DKIM, DMARC)</li>
                        <li>🚚 Prêt pour inviter des transporteurs réels</li>
                        <li>📊 Surveillance automatique des documents active</li>
                      </ul>

                      <div style="margin-top: 30px; padding: 20px; background-color: #e8f5e9; border-radius: 6px;">
                        <p style="margin: 0; color: #2e7d32; font-size: 14px; text-align: center;">
                          <strong>🎉 Le système SYMPHONI.A peut maintenant communiquer automatiquement avec tous ses transporteurs !</strong>
                        </p>
                      </div>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e0e0e0;">
                      <p style="color: #999999; font-size: 12px; margin: 0; line-height: 1.6;">
                        Cet email a été envoyé automatiquement par le système SYMPHONI.A<br>
                        Version v3.1.0-with-emails | 26 Novembre 2025<br>
                        © 2025 SYMPHONI.A - Tous droits réservés
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `
TEST SYSTÈME D'EMAILS SYMPHONI.A

Félicitations ! Le système d'envoi d'emails fonctionne parfaitement.

Expéditeur: noreply@symphonia-controltower.com
Date: ${new Date().toLocaleString('fr-FR')}
Version: v3.1.0-with-emails
Status: Opérationnel

Prochaines Étapes:
- Système d'emails testé et fonctionnel
- Configuration DNS recommandée (SPF, DKIM, DMARC)
- Prêt pour inviter des transporteurs réels
- Surveillance automatique des documents active

Le système SYMPHONI.A peut maintenant communiquer automatiquement avec tous ses transporteurs !

---
SYMPHONI.A | Version v3.1.0 | 26 Novembre 2025
      `
    });

    console.log('✅ Email envoyé avec succès!\n');
    console.log('📬 Détails:');
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Destinataire: ${testEmail}`);
    console.log(`   Accepté: ${info.accepted.length > 0 ? 'Oui' : 'Non'}`);
    console.log(`   Rejeté: ${info.rejected.length > 0 ? 'Oui' : 'Non'}\n`);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ TEST RÉUSSI !');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('📬 Vérifiez maintenant votre boîte email: ' + testEmail);
    console.log('⚠️  Si vous ne voyez pas l\'email:');
    console.log('   1. Vérifiez le dossier SPAM');
    console.log('   2. Attendez 2-3 minutes');
    console.log('   3. Vérifiez l\'expéditeur: noreply@symphonia-controltower.com\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ ERREUR lors du test:\n');
    console.error('   Message:', error.message);

    if (error.code === 'EAUTH') {
      console.error('\n⚠️  Erreur d\'authentification SMTP');
      console.error('   Solutions:');
      console.error('   1. Vérifiez que le compte noreply@symphonia-controltower.com existe sur OVH');
      console.error('   2. Vérifiez que le mot de passe est correct: Sett.38530');
      console.error('   3. Vérifiez que SMTP est activé pour ce compte');
    } else if (error.code === 'ECONNECTION') {
      console.error('\n⚠️  Erreur de connexion au serveur SMTP');
      console.error('   Solutions:');
      console.error('   1. Vérifiez votre connexion internet');
      console.error('   2. Vérifiez que ssl0.ovh.net:587 est accessible');
      console.error('   3. Vérifiez les paramètres firewall');
    }

    console.error('\n');
    process.exit(1);
  }
}

console.log('▶️  Démarrage du test...\n');
testEmailDirect();
