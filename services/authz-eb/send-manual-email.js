#!/usr/bin/env node
// Script pour envoyer manuellement l'email de confirmation d'onboarding

const nodemailer = require('nodemailer');

// Configuration 1: OVH Pro avec STARTTLS
const SMTP_CONFIGS = [
  {
    name: 'OVH Pro STARTTLS (587)',
    host: 'pro1.mail.ovh.net',
    port: 587,
    secure: false,
    auth: {
      user: 'noreply@symphonia-controltower.com',
      pass: 'Sett.38530'
    },
    tls: { rejectUnauthorized: false }
  },
  {
    name: 'OVH Pro SSL (465)',
    host: 'pro1.mail.ovh.net',
    port: 465,
    secure: true,
    auth: {
      user: 'noreply@symphonia-controltower.com',
      pass: 'Sett.38530'
    },
    tls: { rejectUnauthorized: false }
  },
  {
    name: 'OVH ssl0 STARTTLS (587)',
    host: 'ssl0.ovh.net',
    port: 587,
    secure: false,
    auth: {
      user: 'noreply@symphonia-controltower.com',
      pass: 'Sett.38530'
    },
    tls: { rejectUnauthorized: false }
  },
  {
    name: 'OVH ssl0 SSL (465)',
    host: 'ssl0.ovh.net',
    port: 465,
    secure: true,
    auth: {
      user: 'noreply@symphonia-controltower.com',
      pass: 'Sett.38530'
    },
    tls: { rejectUnauthorized: false }
  },
  {
    name: 'OVH MX Plan (587)',
    host: 'smtp.mail.ovh.net',
    port: 587,
    secure: false,
    auth: {
      user: 'noreply@symphonia-controltower.com',
      pass: 'Sett.38530'
    },
    tls: { rejectUnauthorized: false }
  }
];

async function sendEmail() {
  const clientEmail = 'r.tardy@rt-groupe.com';
  const companyName = 'EURL RT LOGISTIQUE';
  const requestId = '692ee8fe3eb20ed59147fc4a';
  const paymentMethod = 'card'; // 'card', 'sepa', 'invoice'

  console.log('='.repeat(60));
  console.log('Envoi email avec bouton carte bancaire');
  console.log('='.repeat(60));

  // Utiliser directement la config qui fonctionne (ssl0.ovh.net:587)
  const config = SMTP_CONFIGS[2]; // OVH ssl0 STARTTLS (587)
  console.log(`\nUsing: ${config.name}`);

  const transporter = nodemailer.createTransport(config);

  try {
    await transporter.verify();
    console.log('[OK] Connexion établie!');
    return await sendWithTransporter(transporter, clientEmail, companyName, requestId, paymentMethod);
  } catch (err) {
    console.log(`[ERREUR] ${err.message}`);
    process.exit(1);
  }
}

async function sendWithTransporter(transporter, clientEmail, companyName, requestId, paymentMethod = 'card') {
  const frontendUrl = 'https://main.df8cnylp3pqka.amplifyapp.com';
  const paymentLink = `${frontendUrl}/finalize-payment?requestId=${requestId}&email=${encodeURIComponent(clientEmail)}`;

  // Section conditionnelle pour le paiement par carte
  const cardPaymentSection = paymentMethod === 'card' ? `
          <tr>
            <td style="padding: 0 40px;">
              <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 25px; border-radius: 10px; margin: 0 0 25px 0; text-align: center;">
                <h3 style="color: white; margin: 0 0 15px 0; font-size: 18px;">💳 Finalisez votre inscription</h3>
                <p style="color: #dbeafe; margin: 0 0 20px 0; font-size: 14px;">
                  Pour activer immédiatement votre compte, veuillez enregistrer vos coordonnées bancaires de manière sécurisée.
                </p>
                <a href="${paymentLink}" style="display: inline-block; background: white; color: #1d4ed8; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                  Enregistrer ma carte bancaire
                </a>
                <p style="color: #93c5fd; margin: 15px 0 0 0; font-size: 12px;">
                  🔒 Paiement 100% sécurisé via Stripe
                </p>
              </div>
            </td>
          </tr>
  ` : '';

  const subject = paymentMethod === 'card'
    ? '💳 SYMPHONI.A - Finalisez votre inscription (Action requise)'
    : '✅ Inscription SYMPHONI.A - Votre compte est en cours de création';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmation d'inscription</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header avec Logo -->
          <tr>
            <td style="padding: 30px 40px 20px; text-align: center; background-color: #ffffff; border-radius: 8px 8px 0 0;">
              <img src="${frontendUrl}/symphonia-logo.png" alt="SYMPHONI.A Control Tower" style="max-width: 300px; height: auto;" />
              <div style="height: 4px; background: linear-gradient(90deg, #f97316 0%, #1d4ed8 50%, #10b981 100%); margin-top: 20px; border-radius: 2px;"></div>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 40px 20px;">
              <h2 style="margin: 0 0 20px; color: #f97316; font-size: 24px; font-weight: 700;">Merci pour votre inscription !</h2>

              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Bonjour,<br><br>
                Nous avons bien reçu votre demande d'inscription pour <strong style="color: #1d4ed8;">${companyName}</strong>.
              </p>
            </td>
          </tr>

          ${cardPaymentSection}

          <tr>
            <td style="padding: ${paymentMethod === 'card' ? '0' : '0'} 40px 40px;">
              <div style="background: linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%); border: 2px solid #f97316; padding: 20px; border-radius: 10px; margin: 0 0 20px 0;">
                <h3 style="margin: 0 0 15px; color: #ea580c; font-size: 18px; font-weight: 700;">📋 ${paymentMethod === 'card' ? 'Étapes restantes' : 'Prochaines étapes'} :</h3>
                ${paymentMethod === 'card' ? `
                <ol style="margin: 0; padding-left: 20px; color: #424242; font-size: 14px; line-height: 1.8;">
                  <li><strong style="color: #3b82f6;">Enregistrez votre carte bancaire</strong> (bouton ci-dessus)</li>
                  <li>Activation immédiate de votre compte</li>
                  <li>Réception de vos identifiants par email</li>
                </ol>
                ` : `
                <ol style="margin: 0; padding-left: 20px; color: #424242; font-size: 14px; line-height: 1.8;">
                  <li>Notre équipe va examiner votre dossier</li>
                  <li>Nous vérifierons les informations fournies</li>
                  <li>Vous recevrez vos identifiants de connexion par email</li>
                  <li>Vous pourrez alors accéder à la plateforme</li>
                </ol>
                `}
              </div>

              <p style="margin: 0 0 20px; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Le délai de traitement est généralement de <strong>24 à 48 heures ouvrées</strong>.
              </p>

              <div style="background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%); border: 2px solid #6366f1; padding: 15px; border-radius: 10px; margin: 0 0 20px 0; text-align: center;">
                <p style="margin: 0 0 5px; color: #4f46e5; font-size: 12px; font-weight: 600;">Référence de votre demande :</p>
                <p style="margin: 0; color: #312e81; font-size: 16px; font-weight: bold; font-family: 'Courier New', monospace;">${requestId}</p>
              </div>

              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                Si vous avez des questions, n'hésitez pas à nous contacter.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 10px; color: #6b7280; font-size: 12px;">
                © 2025 SYMPHONI.A - Control Tower
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 11px;">
                Cet email a été envoyé automatiquement, merci de ne pas y répondre.
              </p>
              <p style="margin: 10px 0 0;">
                <a href="${frontendUrl}" style="color: #f97316; text-decoration: none; font-size: 12px;">symphonia-controltower.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  console.log('\nEnvoi de l\'email à:', clientEmail);
  console.log('Payment method:', paymentMethod);

  try {
    const result = await transporter.sendMail({
      from: '"SYMPHONI.A" <noreply@symphonia-controltower.com>',
      to: clientEmail,
      subject: subject,
      html: html
    });

    console.log('[OK] Email envoyé avec succès!');
    console.log('Message ID:', result.messageId);
    console.log('Response:', result.response);
  } catch (err) {
    console.error('[ERREUR] Envoi échoué:', err.message);
    throw err;
  }
}

sendEmail().catch(err => {
  console.error('\nErreur fatale:', err);
  process.exit(1);
});
