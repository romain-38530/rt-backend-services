/**
 * Script pour envoyer un email de bienvenue professionnel
 * SETT Transports - Transporteur Premium
 * Version 2.0 - Avec headers anti-spam et meilleure delivrabilite
 */

const { SESClient, SendRawEmailCommand } = require('c:/Users/rtard/rt-backend-services/node_modules/.pnpm/@aws-sdk+client-ses@3.936.0/node_modules/@aws-sdk/client-ses');

// Configuration AWS
const sesClient = new SESClient({
  region: 'eu-central-1'
});

// Donnees SETT
const RECIPIENT = 'r.tardy@rt-groupe.com';
const COMPANY_NAME = 'SETT Transports';
const PLAN_NAME = 'Transporteur Premium';
const MONTHLY_PRICE = 849;
const SIRET = '35067556700027';

// Configuration email - utiliser une adresse verifiee
const FROM_EMAIL = 'contact@symphonia-controltower.com';
const FROM_NAME = 'SYMPHONI.A';
const REPLY_TO = 'support@symphonia-controltower.com';

// Email HTML v3 - Design avec bordures et texte colore (compatible Outlook Web)
const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenue sur SYMPHONI.A</title>
</head>
<body style="margin:0; padding:0; font-family:Arial, Helvetica, sans-serif; background-color:#f3f4f6;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
  <tr>
    <td align="center" style="padding:30px 15px;">

      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%; background-color:#ffffff; border:1px solid #e5e7eb;">

        <!-- HEADER avec bordure gauche coloree -->
        <tr>
          <td style="border-left:8px solid #6366f1; padding:40px 30px; border-bottom:3px solid #6366f1;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="70" valign="top">
                  <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="width:60px; height:60px; background-color:#6366f1; text-align:center; vertical-align:middle;">
                        <span style="color:#ffffff; font-size:32px; font-weight:bold; font-family:Arial, sans-serif;">S</span>
                      </td>
                    </tr>
                  </table>
                </td>
                <td valign="middle" style="padding-left:15px;">
                  <span style="color:#6366f1; font-size:28px; font-weight:bold; font-family:Arial, sans-serif;">SYMPHONI.A</span><br>
                  <span style="color:#6b7280; font-size:14px; font-family:Arial, sans-serif;">Votre partenaire transport intelligent</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- MESSAGE PRINCIPAL -->
        <tr>
          <td style="padding:35px 30px;">

            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="padding-bottom:25px;">
                  <span style="font-size:42px;">&#127881;</span>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding-bottom:10px;">
                  <span style="color:#111827; font-size:26px; font-weight:bold; font-family:Arial, sans-serif;">Felicitations ${COMPANY_NAME} !</span>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding-bottom:30px; line-height:24px;">
                  <span style="color:#4b5563; font-size:16px; font-family:Arial, sans-serif;">
                    Votre compte est maintenant <strong style="color:#059669;">ACTIF</strong><br>
                    et pret a revolutionner votre gestion transport.
                  </span>
                </td>
              </tr>
            </table>

            <!-- PLAN BOX avec bordure epaisse -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:3px solid #6366f1; margin-bottom:30px;">
              <tr>
                <td style="padding:20px 25px; border-left:6px solid #6366f1;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td valign="middle">
                        <span style="color:#6b7280; font-size:12px; text-transform:uppercase; letter-spacing:1px; font-family:Arial, sans-serif;">VOTRE FORMULE</span><br>
                        <span style="color:#6366f1; font-size:22px; font-weight:bold; font-family:Arial, sans-serif;">${PLAN_NAME}</span>
                      </td>
                      <td align="right" valign="middle">
                        <span style="color:#6366f1; font-size:38px; font-weight:bold; font-family:Arial, sans-serif;">${MONTHLY_PRICE}</span>
                        <span style="color:#6b7280; font-size:14px; font-family:Arial, sans-serif;"> EUR/mois</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- TITRE MODULES -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="padding-bottom:20px;">
                  <span style="color:#111827; font-size:16px; font-weight:bold; font-family:Arial, sans-serif;">&#10024; Vos modules premium actives</span>
                </td>
              </tr>
            </table>

            <!-- MODULES en liste avec icones colorees -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:30px;">

              <!-- Module 1 - Cyan -->
              <tr>
                <td style="padding:12px 15px; border-left:5px solid #0891b2; border-bottom:1px solid #e5e7eb;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="40" valign="middle">
                        <span style="font-size:24px;">&#127981;</span>
                      </td>
                      <td valign="middle">
                        <span style="color:#0891b2; font-size:15px; font-weight:bold; font-family:Arial, sans-serif;">Acces Industriel</span>
                      </td>
                      <td align="right" valign="middle">
                        <span style="color:#6b7280; font-size:14px; font-family:Arial, sans-serif;">499 EUR/mois</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Module 2 - Violet -->
              <tr>
                <td style="padding:12px 15px; border-left:5px solid #7c3aed; border-bottom:1px solid #e5e7eb;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="40" valign="middle">
                        <span style="font-size:24px;">&#129302;</span>
                      </td>
                      <td valign="middle">
                        <span style="color:#7c3aed; font-size:15px; font-weight:bold; font-family:Arial, sans-serif;">AFFRET.IA</span>
                      </td>
                      <td align="right" valign="middle">
                        <span style="color:#6b7280; font-size:14px; font-family:Arial, sans-serif;">200 EUR/mois</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Module 3 - Orange -->
              <tr>
                <td style="padding:12px 15px; border-left:5px solid #ea580c; border-bottom:1px solid #e5e7eb;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="40" valign="middle">
                        <span style="font-size:24px;">&#128205;</span>
                      </td>
                      <td valign="middle">
                        <span style="color:#ea580c; font-size:15px; font-weight:bold; font-family:Arial, sans-serif;">Tracking IA</span>
                      </td>
                      <td align="right" valign="middle">
                        <span style="color:#6b7280; font-size:14px; font-family:Arial, sans-serif;">150 EUR/mois</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Module 4 - Vert -->
              <tr>
                <td style="padding:12px 15px; border-left:5px solid #059669;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="40" valign="middle">
                        <span style="font-size:24px;">&#128666;</span>
                      </td>
                      <td valign="middle">
                        <span style="color:#059669; font-size:15px; font-weight:bold; font-family:Arial, sans-serif;">Transporteur Pro</span>
                      </td>
                      <td align="right" valign="middle">
                        <span style="color:#059669; font-size:14px; font-weight:bold; font-family:Arial, sans-serif;">INCLUS</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </table>

            <!-- BOUTON CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="padding:20px 0 30px;">
                  <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="background-color:#6366f1; padding:16px 40px;">
                        <a href="https://transporteur.symphonia-controltower.com" target="_blank" style="color:#ffffff; font-size:16px; font-weight:bold; text-decoration:none; font-family:Arial, sans-serif;">
                          &#128640; Acceder a mon espace
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- IDENTIFIANTS -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb; border-left:5px solid #6366f1;">
              <tr>
                <td style="padding:20px;">
                  <span style="color:#9ca3af; font-size:11px; text-transform:uppercase; letter-spacing:1px; font-family:Arial, sans-serif;">VOS IDENTIFIANTS</span><br><br>
                  <span style="color:#111827; font-size:15px; font-weight:bold; font-family:Courier New, monospace;">${RECIPIENT}</span><br><br>
                  <span style="color:#6b7280; font-size:13px; font-family:Arial, sans-serif;">Mot de passe : celui choisi lors de votre inscription</span>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="padding:25px 30px; border-top:1px solid #e5e7eb; text-align:center;">
            <span style="color:#6b7280; font-size:14px; font-family:Arial, sans-serif;">Une question ? Notre equipe est la pour vous &#128075;</span><br><br>
            <a href="mailto:support@symphonia-controltower.com" style="color:#6366f1; font-size:14px; font-weight:bold; text-decoration:none; font-family:Arial, sans-serif;">support@symphonia-controltower.com</a><br><br>
            <span style="color:#9ca3af; font-size:12px; font-family:Arial, sans-serif;">SYMPHONI.A - Plateforme de gestion transport</span>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>
`;

// Version texte
const textContent = `
SYMPHONI.A
==========

Bienvenue ${COMPANY_NAME}

Votre espace transporteur est pret.

VOTRE FORMULE
-------------
${PLAN_NAME} - ${MONTHLY_PRICE} EUR/mois HT

MODULES INCLUS
--------------
* Acces Industriel (499 EUR/mois)
* AFFRET.IA (200 EUR/mois)
* Tracking IA (150 EUR/mois)
* Transporteur Pro (Inclus)

CONNEXION
---------
https://transporteur.symphonia-controltower.com
Identifiant: ${RECIPIENT}

---
Une question ? support@symphonia-controltower.com
SYMPHONI.A - Plateforme de gestion transport
`;

/**
 * Genere un boundary unique pour le MIME multipart
 */
function generateBoundary() {
  return '----=_Part_' + Math.random().toString(36).substring(2) + '_' + Date.now();
}

/**
 * Construit un email MIME complet avec tous les headers anti-spam
 */
function buildRawEmail() {
  const boundary = generateBoundary();
  const subject = `Bienvenue chez SYMPHONI.A - Votre compte ${PLAN_NAME} est actif`;
  const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2)}@symphonia-controltower.com>`;
  const date = new Date().toUTCString();

  // Construction du message MIME avec headers optimises pour la delivrabilite
  const rawEmail = [
    // Headers principaux
    `From: ${FROM_NAME} <${FROM_EMAIL}>`,
    `To: ${RECIPIENT}`,
    `Reply-To: ${REPLY_TO}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    `Date: ${date}`,
    `Message-ID: ${messageId}`,

    // Headers anti-spam et conformite
    `MIME-Version: 1.0`,
    `X-Mailer: SYMPHONIA-MailService/2.0`,
    `X-Priority: 3`,
    `Precedence: bulk`,
    `List-Unsubscribe: <mailto:unsubscribe@symphonia-controltower.com?subject=Unsubscribe&body=Unsubscribe%20${encodeURIComponent(RECIPIENT)}>`,
    `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,

    // Identification de l'expediteur
    `Organization: SYMPHONI.A`,
    `X-Organization-ID: symphonia`,

    // Content-Type multipart
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',

    // Partie texte
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: quoted-printable`,
    '',
    textContent,
    '',

    // Partie HTML
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: quoted-printable`,
    '',
    htmlContent,
    '',

    // Fin du multipart
    `--${boundary}--`
  ].join('\r\n');

  return rawEmail;
}

async function sendWelcomeEmail() {
  try {
    console.log('='.repeat(60));
    console.log('Envoi de l\'email de bienvenue professionnel v2.0');
    console.log('='.repeat(60));
    console.log('');
    console.log('Destinataire:', RECIPIENT);
    console.log('Expediteur:', `${FROM_NAME} <${FROM_EMAIL}>`);
    console.log('Reply-To:', REPLY_TO);
    console.log('');

    // Construire l'email brut avec tous les headers
    const rawEmailData = buildRawEmail();

    const params = {
      RawMessage: {
        Data: Buffer.from(rawEmailData)
      },
      Source: `${FROM_NAME} <${FROM_EMAIL}>`,
      Destinations: [RECIPIENT]
    };

    const command = new SendRawEmailCommand(params);
    const result = await sesClient.send(command);

    console.log('Email envoye avec succes!');
    console.log('Message ID:', result.MessageId);
    console.log('');
    console.log('Headers anti-spam inclus:');
    console.log('  - List-Unsubscribe');
    console.log('  - Reply-To valide');
    console.log('  - Organization');
    console.log('  - X-Priority: 3 (normal)');
    console.log('');
    console.log('L\'email devrait arriver dans la boite principale.');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('');
    console.error('ERREUR lors de l\'envoi:');
    console.error('Code:', error.Code || error.name);
    console.error('Message:', error.message);

    if (error.Code === 'MessageRejected') {
      console.error('');
      console.error('L\'email a ete rejete par SES.');
      console.error('Verifiez que l\'adresse', FROM_EMAIL, 'est verifiee dans SES.');
    }
  }
}

sendWelcomeEmail();
