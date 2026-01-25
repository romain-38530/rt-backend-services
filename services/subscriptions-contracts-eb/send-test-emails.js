/**
 * Script d'envoi des emails de test - Templates commerciaux SYMPHONI.A
 * Envoie tous les templates à r.tardy@rt-groupe.com pour validation
 */

require('dotenv').config();
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

// Configuration AWS SES - utilise la région eu-central-1 où SES est vérifié
const sesClient = new SESClient({
  region: 'eu-central-1'
});

const TEST_EMAIL = 'r.tardy@rt-groupe.com';
const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'noreply@symphonia-controltower.com';

// Données de test
const testData = {
  companyName: 'Transport Durand & Fils',
  documentName: 'Attestation URSSAF',
  expiryDate: '15/02/2026',
  portalUrl: 'https://portail.symphonia-controltower.com',
  invitingCompany: 'SETT Transports',
  invitationUrl: 'https://transporteur.symphonia-controltower.com/inscription?ref=sett-transports&trial=10'
};

// Templates d'emails commerciaux
const emailTemplates = {
  reminder_30: {
    subject: 'SYMPHONI.A - Optimisez votre conformité : {documentName} à renouveler',
    body: `
Bonjour {companyName},

Nous espérons que votre activité se porte bien !

Dans le cadre de notre partenariat et pour vous garantir un accès continu à notre réseau de donneurs d'ordres premium, nous vous informons que votre document "{documentName}" arrive à échéance le {expiryDate}.

🎯 POURQUOI C'EST IMPORTANT POUR VOUS ?

En maintenant vos documents à jour, vous bénéficiez :
• D'une visibilité maximale auprès de nos 150+ donneurs d'ordres industriels
• D'un accès prioritaire aux offres de fret via AFFRET.IA
• D'un score de fiabilité optimisé (+15% de chances d'attribution)
• De la confiance renforcée de vos partenaires

📋 MISE À JOUR SIMPLIFIÉE (2 minutes)

1. Connectez-vous à votre espace : {portalUrl}
2. Section "Documents de conformité"
3. Glissez-déposez votre nouveau document
4. Validation automatique sous 24h

💡 ASTUCE : Activez les rappels automatiques dans vos paramètres pour ne plus jamais manquer une échéance !

Notre équipe reste à votre disposition pour vous accompagner.

Excellente continuation,

L'équipe SYMPHONI.A
──────────────────────────
📞 Support : 04 76 33 23 78
📧 support@symphonia-controltower.com
🌐 www.symphonia-controltower.com
    `
  },
  reminder_15: {
    subject: 'SYMPHONI.A - Action requise : {documentName} expire dans 15 jours',
    body: `
Bonjour {companyName},

Le temps passe vite ! Votre document "{documentName}" expire le {expiryDate}.

⏰ IL VOUS RESTE 15 JOURS

Ne laissez pas cette échéance impacter votre activité. Chaque jour, des transporteurs avec des documents à jour remportent les meilleurs contrats sur notre plateforme.

📈 VOS AVANTAGES EN RÈGLE :
• Accès à +500 offres de fret/jour via AFFRET.IA
• Référencement prioritaire dans notre réseau industriel
• Badge "Transporteur Vérifié" visible par les donneurs d'ordres
• Statistiques : les transporteurs conformes obtiennent 35% de missions en plus

🚀 RENOUVELEZ EN 1 CLIC
{portalUrl}

Besoin d'aide ? Notre équipe vous accompagne gratuitement dans vos démarches administratives.

À très bientôt sur SYMPHONI.A,

L'équipe Partenariats
──────────────────────────
📞 04 76 33 23 78 (9h-18h)
💬 Chat disponible sur votre portail
    `
  },
  reminder_7: {
    subject: 'SYMPHONI.A - Dernière semaine : {documentName} expire bientôt !',
    body: `
Bonjour {companyName},

⚡ ALERTE - Plus que 7 jours !

Votre document "{documentName}" expire le {expiryDate}.

Nous tenons à vous car vous êtes un partenaire précieux de notre réseau. Ne perdez pas les avantages que vous avez construits :

✅ Votre historique de missions préservé
✅ Votre score de fiabilité maintenu
✅ Votre visibilité auprès des industriels
✅ Vos tarifs négociés conservés

❌ SANS RENOUVELLEMENT :
• Suspension temporaire de votre compte
• Perte de visibilité sur la bourse de fret
• Missions en cours potentiellement réattribuées

👉 AGISSEZ MAINTENANT : {portalUrl}

Notre équipe peut vous rappeler pour vous aider : répondez simplement "RAPPEL" à cet email.

Nous comptons sur vous,

L'équipe SYMPHONI.A
    `
  },
  reminder_3: {
    subject: '⚠️ SYMPHONI.A - URGENT : {documentName} expire dans 3 jours',
    body: `
{companyName},

🔴 SITUATION URGENTE - 3 JOURS RESTANTS

Votre document "{documentName}" expire le {expiryDate}.

Nous ne voulons pas vous perdre ! Vous faites partie des transporteurs de confiance de notre réseau, et nous souhaitons continuer à travailler ensemble.

⚡ ACTION IMMÉDIATE REQUISE ⚡

→ Cliquez ici : {portalUrl}
→ Uploadez votre document renouvelé
→ Continuez à recevoir des missions

📞 BESOIN D'AIDE URGENTE ?
Appelez-nous directement : 04 76 33 23 78
Notre équipe est mobilisée pour vous aider.

Nous croyons en votre entreprise,

L'équipe SYMPHONI.A
    `
  },
  reminder_1: {
    subject: '🚨 SYMPHONI.A - DERNIER JOUR : {documentName} expire DEMAIN',
    body: `
{companyName},

⏰ DERNIÈRES HEURES - Votre document "{documentName}" expire DEMAIN ({expiryDate})

C'est le moment d'agir. Après demain, votre compte sera temporairement suspendu et vous ne pourrez plus :
• Recevoir de nouvelles propositions de transport
• Accéder à la bourse AFFRET.IA
• Être visible dans le référentiel transporteurs

🆘 NOUS SOMMES LÀ POUR VOUS

Nous comprenons que les démarches administratives peuvent être chronophages. Si vous rencontrez des difficultés pour obtenir votre document à temps, contactez-nous MAINTENANT.

📱 LIGNE DIRECTE : 04 76 33 23 78
📧 urgent@symphonia-controltower.com

→ RENOUVELER MON DOCUMENT : {portalUrl}

Ne laissez pas une formalité administrative freiner votre croissance.

Cordialement,

L'équipe SYMPHONI.A
    `
  },
  expired: {
    subject: 'SYMPHONI.A - Votre compte attend votre retour ({documentName})',
    body: `
Bonjour {companyName},

Votre document "{documentName}" a expiré le {expiryDate}, et votre compte est actuellement en pause.

🤝 NOUS GARDONS VOTRE PLACE

Bonne nouvelle : votre historique, votre score et vos paramètres sont préservés. Dès que vous aurez mis à jour votre document, tout sera réactivé instantanément.

CE QUI VOUS ATTEND À VOTRE RETOUR :
• Votre score de fiabilité intact
• Vos relations donneurs d'ordres préservées
• Accès immédiat à +500 offres/jour sur AFFRET.IA
• Badge "Transporteur Vérifié" restauré

🔓 RÉACTIVATION EXPRESS (24h)

1. Connectez-vous : {portalUrl}
2. Uploadez votre nouveau document
3. Validation sous 24h ouvrées
4. Reprenez votre activité !

💬 BESOIN D'ACCOMPAGNEMENT ?
Notre équipe peut vous guider pas à pas.
📞 04 76 33 23 78 | 📧 support@symphonia-controltower.com

Nous avons hâte de vous retrouver,

L'équipe SYMPHONI.A

P.S. : Saviez-vous que vous pouvez activer les rappels automatiques pour ne plus jamais manquer une échéance ? Découvrez cette fonctionnalité dans vos paramètres !
    `
  },
  invitation_decouverte: {
    subject: '{invitingCompany} vous invite à déposer vos documents de conformité sur SYMPHONI.A',
    body: `
Bonjour,

{invitingCompany} a choisi SYMPHONI.A pour gérer son obligation de vigilance envers ses sous-traitants.

En tant que partenaire de {invitingCompany}, nous vous invitons à déposer vos documents de conformité sur notre plateforme sécurisée. Cela simplifiera considérablement la gestion administrative pour vous comme pour {invitingCompany}.

📋 CE QUE NOUS VOUS DEMANDONS

Connectez-vous et déposez vos documents obligatoires :
• Attestation URSSAF de vigilance
• Extrait Kbis (moins de 3 mois)
• Attestation d'assurance RC Pro
• Licence de transport (le cas échéant)

Notre système vous alertera automatiquement avant chaque expiration pour que vous restiez toujours en conformité.

──────────────────────────

🚀 DÉCOUVREZ SYMPHONI.A - BIEN PLUS QU'UN PORTAIL DOCUMENTS !

SYMPHONI.A est LA plateforme transport nouvelle génération qui connecte transporteurs et donneurs d'ordres industriels.

✅ AFFRET.IA : +500 offres de fret/jour grâce à notre IA
✅ +150 donneurs d'ordres industriels (Carrefour, Danone, L'Oréal...)
✅ Paiement garanti sous 30 jours
✅ Application mobile pour vos chauffeurs
✅ eCMR et signature électronique inclus
✅ Scoring transporteur pour booster votre visibilité

🎁 OFFRE EXCLUSIVE DE BIENVENUE

Pour vous remercier de votre confiance, {invitingCompany} vous offre :
• 10 transports AFFRET.IA GRATUITS (valeur ~500€)
• Accès complet au portail SYMPHONI.A pendant 90 jours
• Scoring transporteur et visibilité auprès de notre réseau

──────────────────────────

📋 INSCRIPTION EN 3 ÉTAPES (5 minutes)

1. Cliquez sur le lien ci-dessous
2. Complétez vos informations entreprise
3. Déposez vos documents de conformité
→ C'est prêt ! Vous pouvez recevoir des offres de fret.

👉 CRÉER MON COMPTE : {invitationUrl}

Cette offre est valable 30 jours.

Des questions ? Notre équipe est à votre écoute :
📞 04 76 33 23 78 | 📧 partenariats@symphonia-controltower.com

À très bientôt sur SYMPHONI.A,

L'équipe Partenariats
──────────────────────────
SYMPHONI.A - La plateforme transport nouvelle génération
🌐 www.symphonia-controltower.com
    `
  }
};

/**
 * Remplacer les variables dans un template
 */
function replaceVars(template, data) {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
  }
  return result;
}

/**
 * Envoyer un email via AWS SES
 */
async function sendEmail(to, subject, body, templateName) {
  try {
    console.log(`\n📧 Envoi: ${templateName}`);
    console.log(`   Sujet: ${subject}`);

    const command = new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: {
        ToAddresses: [to]
      },
      Message: {
        Subject: { Data: `[TEST] ${subject}`, Charset: 'UTF-8' },
        Body: {
          Text: { Data: body, Charset: 'UTF-8' }
        }
      }
    });

    const result = await sesClient.send(command);
    console.log(`   ✅ Envoyé! MessageId: ${result.MessageId}`);
    return { success: true, messageId: result.MessageId };
  } catch (error) {
    console.error(`   ❌ Erreur: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Envoyer tous les emails de test
 */
async function sendAllTestEmails() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   ENVOI DES EMAILS DE TEST - SYMPHONI.A');
  console.log('   Destinataire: ' + TEST_EMAIL);
  console.log('═══════════════════════════════════════════════════════════════');

  const results = [];

  for (const [templateName, template] of Object.entries(emailTemplates)) {
    const subject = replaceVars(template.subject, testData);
    const body = replaceVars(template.body, testData);

    const result = await sendEmail(TEST_EMAIL, subject, body, templateName);
    results.push({ templateName, ...result });

    // Pause entre chaque email pour éviter le throttling
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('   RÉSUMÉ');
  console.log('═══════════════════════════════════════════════════════════════');

  const success = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`   ✅ Envoyés: ${success}`);
  console.log(`   ❌ Échoués: ${failed}`);
  console.log('\n   Templates envoyés:');
  results.forEach(r => {
    console.log(`   ${r.success ? '✅' : '❌'} ${r.templateName}`);
  });

  return results;
}

// Exécution
sendAllTestEmails()
  .then(() => {
    console.log('\n✅ Script terminé');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Erreur:', err);
    process.exit(1);
  });
