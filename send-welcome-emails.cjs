const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_PASSWORD = 'Symphonia2026!';

// Les utilisateurs RT Groupe
const users = [
  { firstName: 'Sett', lastName: 'Transports', email: 'exploitation@rt-groupe.com' },
  { firstName: 'Ludivine', lastName: 'Accary', email: 'l.accary@rt-groupe.com' },
  { firstName: 'Theo', lastName: 'Gimenez', email: 'affretement@rt-groupe.com' },
  { firstName: 'Pauline', lastName: 'Tardy', email: 'p.tardy@rt-groupe.com' },
  { firstName: 'Marion', lastName: 'Marly', email: 'm.marly@rt-groupe.com' },
  { firstName: 'Baptiste', lastName: 'Mattio', email: 'b.mattio@rt-groupe.com' },
  { firstName: 'Maxime', lastName: 'Dufey', email: 'admintransport@rt-groupe.com' },
  { firstName: 'Alphonse', lastName: 'Mendes', email: 'a.mendes@rt-groupe.com' },
  { firstName: 'Romain', lastName: 'Tardy', email: 'r.tardy@rt-groupe.com' },
  { firstName: 'Lola', lastName: 'Balmon', email: 'm.beccafarri@rt-groupe.com' }
];

async function main() {
  console.log('='.repeat(60));
  console.log('ENVOI DES EMAILS DE BIENVENUE');
  console.log('='.repeat(60) + '\n');

  // Read template
  const template = fs.readFileSync('./email-templates/bienvenue-credentials.html', 'utf8');

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    process.stdout.write(`${user.firstName} ${user.lastName} (${user.email})... `);

    try {
      // Generate personalized HTML
      const html = template
        .replace(/\{\{firstName\}\}/g, user.firstName)
        .replace(/\{\{lastName\}\}/g, user.lastName)
        .replace(/\{\{email\}\}/g, user.email)
        .replace(/\{\{password\}\}/g, DEFAULT_PASSWORD);

      // Save to temp file
      const tempFile = path.join(__dirname, 'temp-email.html');
      fs.writeFileSync(tempFile, html);

      // Send via AWS CLI
      const cmd = `aws ses send-email --region eu-west-1 --from "SYMPHONI.A <noreply@symphonia-controltower.com>" --to "${user.email}" --subject "Bienvenue sur SYMPHONI.A - Vos identifiants de connexion" --html "file://${tempFile.replace(/\\/g, '/')}"`;

      const result = execSync(cmd, { encoding: 'utf8' });
      const messageId = JSON.parse(result).MessageId;
      console.log(`OK (${messageId.substring(0, 20)}...)`);
      sent++;
    } catch (err) {
      console.log(`ECHEC: ${err.message.substring(0, 50)}`);
      failed++;
    }

    // Rate limiting - 1 email per second to avoid SES throttling
    await new Promise(r => setTimeout(r, 1000));
  }

  // Cleanup
  try {
    fs.unlinkSync(path.join(__dirname, 'temp-email.html'));
  } catch (e) {}

  console.log('\n' + '='.repeat(60));
  console.log('RESUME');
  console.log('='.repeat(60));
  console.log(`Emails envoyes: ${sent}`);
  console.log(`Echecs: ${failed}`);
}

main().catch(console.error);
