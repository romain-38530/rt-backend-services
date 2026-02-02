const https = require('https');
const http = require('http');
const crypto = require('crypto');

const CARRIER_ID = '6980887cdef6432153c25be5'; // SETT Transports

// Générer un token d'invitation unique
function generateInvitationToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function sendInvitationEmail() {
  // 1. Login to get token
  console.log('1. Getting auth token...');
  const loginData = JSON.stringify({
    email: 'r.tardy@rt-groupe.com',
    password: 'Symphonia2026!'
  });

  const loginResponse = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'ddaywxps9n701.cloudfront.net',
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': loginData.length
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(loginData);
    req.end();
  });

  const token = loginResponse.token;
  console.log('   Token obtained!\n');

  // 2. Générer le token d'invitation
  const invitationToken = generateInvitationToken();
  const registrationLink = `https://transporteur.symphonia-controltower.com/inscription?token=${invitationToken}&email=r.tardy@rt-groupe.com&offer=AFFRET_IA_DECOUVERTE`;

  console.log('2. Registration link:', registrationLink, '\n');

  // 3. Envoyer l'email via SES (directement)
  console.log('3. Sending email via AWS SES...\n');

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #ff6b35; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
    .benefits { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .benefit-item { display: flex; align-items: center; margin: 10px 0; }
    .benefit-icon { color: #22c55e; font-size: 20px; margin-right: 10px; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚚 SYMPHONI.A</h1>
      <p>L'IA qui orchestre vos flux transport</p>
    </div>
    <div class="content">
      <h2>Vous êtes invité à rejoindre SYMPHONI.A !</h2>

      <p>Bonjour,</p>

      <p><strong>SETT Transports</strong> vous invite à rejoindre la plateforme SYMPHONI.A pour collaborer sur des opportunités de transport.</p>

      <div class="benefits">
        <h3>🎁 Offre Découverte AFFRET.IA</h3>
        <div class="benefit-item">
          <span class="benefit-icon">✓</span>
          <span><strong>10 transports gratuits</strong> sur la bourse de fret AFFRET.IA</span>
        </div>
        <div class="benefit-item">
          <span class="benefit-icon">✓</span>
          <span>Dépôt de vos <strong>documents légaux</strong> (vigilance)</span>
        </div>
        <div class="benefit-item">
          <span class="benefit-icon">✓</span>
          <span><strong>Score transporteur</strong> automatique</span>
        </div>
        <div class="benefit-item">
          <span class="benefit-icon">✓</span>
          <span>Accès au <strong>portail transporteur</strong> complet</span>
        </div>
      </div>

      <p style="text-align: center;">
        <a href="${registrationLink}" class="button">
          Créer mon compte gratuitement →
        </a>
      </p>

      <p style="font-size: 12px; color: #666;">
        Ce lien est valable pendant 7 jours. Si vous n'avez pas demandé cette invitation, vous pouvez ignorer cet email.
      </p>
    </div>
    <div class="footer">
      <p>SYMPHONI.A - L'IA qui orchestre vos flux transport</p>
      <p>© 2026 RT Groupe - Tous droits réservés</p>
    </div>
  </div>
</body>
</html>
`;

  // Envoyer via l'API notifications
  const emailData = JSON.stringify({
    to: 'r.tardy@rt-groupe.com',
    subject: '🚚 SETT Transports vous invite sur SYMPHONI.A - 10 transports gratuits !',
    html: emailHtml,
    from: 'noreply@symphonia-controltower.com',
    fromName: 'SYMPHONI.A'
  });

  const emailResponse = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'rt-notifications-api-prod.eba-usjgee8u.eu-central-1.elasticbeanstalk.com',
      path: '/api/v1/notifications/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(emailData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('   Status:', res.statusCode);
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.write(emailData);
    req.end();
  });

  console.log('   Response:', JSON.stringify(emailResponse, null, 2));

  if (emailResponse.success || emailResponse.messageId) {
    console.log('\n✅ Email d\'invitation envoyé avec succès!');
    console.log('   Destinataire: r.tardy@rt-groupe.com');
    console.log('   Lien d\'inscription:', registrationLink);
  }
}

sendInvitationEmail().catch(console.error);
