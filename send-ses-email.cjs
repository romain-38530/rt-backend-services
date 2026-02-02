const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const crypto = require('crypto');

const sesClient = new SESClient({ region: 'eu-west-1' });

// Générer un token d'invitation unique
function generateInvitationToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function sendInvitationEmail() {
  const invitationToken = generateInvitationToken();
  const testEmail = 'r.tardy@rt-groupe.com';
  const inviterCompany = 'SETT Transports';
  const registrationLink = `https://transporteur.symphonia-controltower.com/inscription?token=${invitationToken}&email=${encodeURIComponent(testEmail)}&offer=AFFRET_IA_DECOUVERTE`;

  console.log('Registration link:', registrationLink, '\n');

  const emailHtml = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Invitation SYMPHONI.A</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f0f4f8; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">

  <!-- Wrapper Table -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f0f4f8;">
    <tr>
      <td style="padding: 40px 20px;">

        <!-- Main Container -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);">

          <!-- Header with gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #334155 100%); padding: 48px 40px; text-align: center;">
              <!-- Logo -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center;">
                    <div style="display: inline-block; background: rgba(255,255,255,0.1); border-radius: 16px; padding: 16px 32px; margin-bottom: 20px;">
                      <span style="font-size: 32px; font-weight: 800; color: #ffffff; letter-spacing: -1px;">SYMPHONI</span><span style="font-size: 32px; font-weight: 800; color: #6366f1;">.A</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="text-align: center; padding-top: 8px;">
                    <p style="margin: 0; color: rgba(255,255,255,0.7); font-size: 14px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase;">Control Tower du Transport</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Invitation Badge -->
          <tr>
            <td style="padding: 0 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding-top: 0; margin-top: -24px;">
                    <div style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 12px 28px; border-radius: 50px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4); margin-top: -20px;">
                      Invitation exclusive
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 40px 48px;">

              <!-- Greeting -->
              <h1 style="margin: 0 0 24px 0; font-size: 28px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                Vous avez ete invite a rejoindre notre reseau !
              </h1>

              <p style="margin: 0 0 24px 0; font-size: 16px; color: #475569; line-height: 1.7;">
                <strong style="color: #6366f1;">${inviterCompany}</strong> souhaite collaborer avec vous sur la plateforme SYMPHONI.A et vous offre un acces privilegie a notre bourse de fret intelligente.
              </p>

              <!-- Gift Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 32px 0;">
                <tr>
                  <td style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 16px; padding: 28px; border: 1px solid #a7f3d0;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td width="60" valign="top">
                          <div style="width: 52px; height: 52px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 12px; text-align: center; line-height: 52px; font-size: 24px;">
                            🎁
                          </div>
                        </td>
                        <td style="padding-left: 20px;">
                          <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: #059669; text-transform: uppercase; letter-spacing: 1px;">Offre de bienvenue</p>
                          <p style="margin: 0; font-size: 24px; font-weight: 800; color: #065f46;">10 transports GRATUITS</p>
                          <p style="margin: 4px 0 0 0; font-size: 14px; color: #047857;">sur la bourse de fret AFFRET.IA</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Benefits -->
              <p style="margin: 0 0 20px 0; font-size: 14px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Ce qui vous attend</p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <!-- Benefit 1 -->
                <tr>
                  <td style="padding: 14px 0; border-bottom: 1px solid #f1f5f9;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td width="44">
                          <div style="width: 40px; height: 40px; background: #eff6ff; border-radius: 10px; text-align: center; line-height: 40px; font-size: 18px;">🚛</div>
                        </td>
                        <td style="padding-left: 16px;">
                          <p style="margin: 0; font-size: 15px; font-weight: 600; color: #1e293b;">+500 offres de fret / jour</p>
                          <p style="margin: 2px 0 0 0; font-size: 13px; color: #64748b;">Matchees par notre IA selon vos preferences</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Benefit 2 -->
                <tr>
                  <td style="padding: 14px 0; border-bottom: 1px solid #f1f5f9;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td width="44">
                          <div style="width: 40px; height: 40px; background: #f0fdf4; border-radius: 10px; text-align: center; line-height: 40px; font-size: 18px;">📋</div>
                        </td>
                        <td style="padding-left: 16px;">
                          <p style="margin: 0; font-size: 15px; font-weight: 600; color: #1e293b;">Conformite vigilance automatisee</p>
                          <p style="margin: 2px 0 0 0; font-size: 13px; color: #64748b;">URSSAF, KBIS, Assurances - tout centralise</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Benefit 3 -->
                <tr>
                  <td style="padding: 14px 0; border-bottom: 1px solid #f1f5f9;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td width="44">
                          <div style="width: 40px; height: 40px; background: #fef3c7; border-radius: 10px; text-align: center; line-height: 40px; font-size: 18px;">⭐</div>
                        </td>
                        <td style="padding-left: 16px;">
                          <p style="margin: 0; font-size: 15px; font-weight: 600; color: #1e293b;">Score transporteur premium</p>
                          <p style="margin: 2px 0 0 0; font-size: 13px; color: #64748b;">Valorisez votre fiabilite aupres des chargeurs</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Benefit 4 -->
                <tr>
                  <td style="padding: 14px 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td width="44">
                          <div style="width: 40px; height: 40px; background: #fae8ff; border-radius: 10px; text-align: center; line-height: 40px; font-size: 18px;">💰</div>
                        </td>
                        <td style="padding-left: 16px;">
                          <p style="margin: 0; font-size: 15px; font-weight: 600; color: #1e293b;">0% de commission</p>
                          <p style="margin: 2px 0 0 0; font-size: 13px; color: #64748b;">Conservez 100% de vos revenus</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 36px 0 24px 0;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${registrationLink}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 18px 48px; border-radius: 12px; font-size: 16px; font-weight: 700; box-shadow: 0 8px 24px rgba(99, 102, 241, 0.35);">
                      Creer mon compte gratuitement →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Security note -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 24px;">
                <tr>
                  <td style="background: #f8fafc; border-radius: 12px; padding: 16px 20px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td width="24" valign="top">
                          <span style="font-size: 16px;">🔒</span>
                        </td>
                        <td style="padding-left: 12px;">
                          <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5;">
                            Ce lien est <strong>securise</strong> et valable pendant 7 jours.<br>
                            Si vous n'avez pas demande cette invitation, ignorez simplement cet email.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 48px;">
              <div style="height: 1px; background: linear-gradient(to right, transparent, #e2e8f0, transparent);"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 48px 40px 48px; background: #f8fafc;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center;">
                    <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #475569;">SYMPHONI.A</p>
                    <p style="margin: 0 0 16px 0; font-size: 13px; color: #94a3b8;">L'IA qui orchestre vos flux transport</p>

                    <!-- Contact -->
                    <p style="margin: 0 0 4px 0; font-size: 12px; color: #94a3b8;">
                      📞 04 76 33 23 78 &nbsp;&nbsp;|&nbsp;&nbsp; 📧 contact@symphonia-controltower.com
                    </p>
                    <p style="margin: 16px 0 0 0; font-size: 11px; color: #cbd5e1;">
                      © 2026 RT Groupe - Tous droits reserves<br>
                      38500 Voiron, France
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- End Main Container -->

      </td>
    </tr>
  </table>
  <!-- End Wrapper -->

</body>
</html>
`;

  const params = {
    Source: 'SYMPHONI.A <noreply@symphonia-controltower.com>',
    Destination: {
      ToAddresses: [testEmail]
    },
    Message: {
      Subject: {
        Data: `${inviterCompany} vous invite sur SYMPHONI.A - 10 transports offerts`,
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: emailHtml,
          Charset: 'UTF-8'
        },
        Text: {
          Data: `${inviterCompany} vous invite sur SYMPHONI.A !

OFFRE DE BIENVENUE : 10 transports GRATUITS sur AFFRET.IA

Ce qui vous attend :
- +500 offres de fret par jour matchees par IA
- Conformite vigilance automatisee (URSSAF, KBIS, Assurances)
- Score transporteur premium
- 0% de commission

Creer votre compte gratuitement : ${registrationLink}

Ce lien est valable 7 jours.

---
SYMPHONI.A - L'IA qui orchestre vos flux transport
04 76 33 23 78 | contact@symphonia-controltower.com
© 2026 RT Groupe`,
          Charset: 'UTF-8'
        }
      }
    }
  };

  try {
    console.log('Sending email via AWS SES...');
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    console.log('Email sent successfully!');
    console.log('Message ID:', response.MessageId);
    console.log('\nVerifiez votre boite mail:', testEmail);
    console.log('Lien d\'inscription:', registrationLink);
  } catch (error) {
    console.error('Error sending email:', error.message);
  }
}

sendInvitationEmail();
