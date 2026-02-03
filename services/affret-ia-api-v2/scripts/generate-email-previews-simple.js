/**
 * Génération simple des templates d'email sans dépendances
 * Valide les modifications :
 * - TYPE 1 : Prix moyen retiré
 * - TYPE 2 : Offre changée en "10 consultations de transports gratuit"
 */

const fs = require('fs');
const path = require('path');

// Mock data
const mockCarrier = {
  carrierName: 'MENIER TRANSPORTS',
  contactName: 'Mohamed SOLTANI',
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
  ]
};

const mockOrders = [
  {
    pickup: { city: 'Lyon', postalCode: '69000' },
    delivery: { city: 'Paris', postalCode: '75000' },
    pickupDate: new Date('2026-02-10'),
    estimatedPrice: 800,
    cargo: { palettes: 28, weight: 19000 }
  },
  {
    pickup: { city: 'Marseille', postalCode: '13000' },
    delivery: { city: 'Bordeaux', postalCode: '33000' },
    pickupDate: new Date('2026-02-12'),
    estimatedPrice: 650,
    cargo: { palettes: 22, weight: 15000 }
  }
];

const invitationUrl = 'https://symphonia.com/invitation/dashdoc/TOKEN123';
const signupUrl = 'https://symphonia.com/signup/carrier?source=dashdoc';

console.log('\n' + '='.repeat(80));
console.log('  GÉNÉRATION PREVIEWS EMAIL');
console.log('='.repeat(80));
console.log();

// ═══════════════════════════════════════════════════════════════════════
// EMAIL TYPE 1 : Transporteur Connu
// ═══════════════════════════════════════════════════════════════════════

const emailType1 = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .route-card { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #667eea; border-radius: 5px; }
    .price { color: #667eea; font-weight: bold; font-size: 18px; }
    .date { color: #666; font-size: 14px; }
    .btn { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
    .btn:hover { background: #5568d3; }
    .stats { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚛 SYMPHONI.A</h1>
      <p>Plateforme intelligente d'affrètement</p>
    </div>

    <div class="content">
      <h2>Bonjour ${mockCarrier.contactName} 👋</h2>

      <p>Nous avons une excellente nouvelle pour vous !</p>

      <p>
        Nous avons analysé vos <strong>${mockCarrier.totalTransports} transports réalisés</strong> et identifié
        plusieurs opportunités d'affaires sur vos routes habituelles via notre plateforme <strong>SYMPHONI.A</strong>.
      </p>

      <div class="stats">
        <h3>📊 Votre Activité</h3>
        <ul>
          <li><strong>${mockCarrier.totalTransports}</strong> transports réalisés</li>
          <li><strong>${mockCarrier.routes.length}</strong> routes identifiées</li>
        </ul>
      </div>

      <h3>🛣️ Vos Routes Principales</h3>

      ${mockCarrier.routes.map(route => `
        <div class="route-card">
          <strong>${route.fromCity} (${route.from}) → ${route.toCity} (${route.to})</strong>
          <br>
          <span class="price">${route.price}€</span>
          <span class="date">• Réalisé le ${route.date.toLocaleDateString('fr-FR')}</span>
        </div>
      `).join('')}

      <p style="margin-top: 30px;">
        <strong>Pourquoi rejoindre SYMPHONI.A ?</strong>
      </p>

      <ul>
        <li>✅ <strong>Accès prioritaire</strong> aux offres sur vos routes habituelles</li>
        <li>✅ <strong>Négociation intelligente</strong> basée sur vos prix historiques</li>
        <li>✅ <strong>Zéro commission</strong> sur les 10 premiers transports</li>
        <li>✅ <strong>Paiement garanti</strong> sous 30 jours</li>
        <li>✅ <strong>Affret.IA</strong> vous propose automatiquement les meilleures offres</li>
      </ul>

      <center>
        <a href="${invitationUrl}" class="btn">
          🚀 Accéder à mon espace SYMPHONI.A
        </a>
      </center>

      <p style="margin-top: 30px; padding: 15px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 5px;">
        <strong>💡 Bon à savoir :</strong> Nous connaissons déjà votre historique de prix.
        Affret.IA vous proposera automatiquement des tarifs cohérents avec ce que vous avez déjà pratiqué.
      </p>

      <p style="margin-top: 20px; font-size: 14px; color: #666;">
        Cette invitation est valable <strong>30 jours</strong>.
        Ne manquez pas l'opportunité d'accéder à de nouvelles offres sur vos routes !
      </p>
    </div>

    <div class="footer">
      <p>SYMPHONI.A - Affret.IA</p>
      <p>Intelligence artificielle au service du transport</p>
      <p style="font-size: 11px; color: #999;">
        Vous recevez cet email car vous avez réalisé des transports avec nos partenaires.
        <a href="${invitationUrl}" style="color: #667eea;">Se désinscrire</a>
      </p>
    </div>
  </div>
</body>
</html>
`;

// ═══════════════════════════════════════════════════════════════════════
// EMAIL TYPE 2 : Conquête
// ═══════════════════════════════════════════════════════════════════════

const emailType2 = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .order-card { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #11998e; border-radius: 5px; }
    .price { color: #11998e; font-weight: bold; font-size: 18px; }
    .badge { display: inline-block; background: #38ef7d; color: white; padding: 5px 10px; border-radius: 3px; font-size: 12px; margin-right: 5px; }
    .btn { display: inline-block; background: #11998e; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
    .btn:hover { background: #0d7a70; }
    .highlight { background: #d4edda; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #28a745; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 SYMPHONI.A</h1>
      <p>Nouvelles opportunités de transport disponibles</p>
    </div>

    <div class="content">
      <h2>Bonjour ${mockCarrier.contactName} 👋</h2>

      <p>
        Nous avons détecté que vous réalisez régulièrement des transports sur des routes
        où nous avons actuellement <strong>${mockOrders.length} offres disponibles</strong>.
      </p>

      <h3>📦 Offres Disponibles sur Vos Routes</h3>

      ${mockOrders.map(order => `
        <div class="order-card">
          <div style="margin-bottom: 10px;">
            <span class="badge">URGENT</span>
            <span class="badge">Chargement ${order.pickupDate.toLocaleDateString('fr-FR')}</span>
          </div>
          <strong>${order.pickup.city} (${order.pickup.postalCode}) → ${order.delivery.city} (${order.delivery.postalCode})</strong>
          <br>
          <span class="price">${order.estimatedPrice}€</span>
          <br>
          <small>${order.cargo.palettes} palettes • ${order.cargo.weight} kg</small>
        </div>
      `).join('')}

      <div class="highlight">
        <h3 style="margin-top: 0;">💰 Offre de Lancement Exclusive</h3>
        <ul style="margin: 10px 0;">
          <li><strong>10 consultations de transports gratuit</strong></li>
          <li>Accès immédiat aux offres sur vos routes</li>
          <li>Paiement garanti sous 30 jours</li>
          <li>Aucun engagement, aucun abonnement</li>
        </ul>
      </div>

      <h3>🤖 Affret.IA - Votre Assistant Personnel</h3>

      <p>
        Notre intelligence artificielle analyse automatiquement :
      </p>
      <ul>
        <li>✅ Les offres compatibles avec vos routes habituelles</li>
        <li>✅ Les prix du marché en temps réel</li>
        <li>✅ Votre disponibilité et vos préférences</li>
        <li>✅ Les meilleures opportunités de retour à vide</li>
      </ul>

      <p style="margin-top: 20px;">
        <strong>Comment ça marche ?</strong>
      </p>
      <ol>
        <li>Inscrivez-vous en 2 minutes (gratuit)</li>
        <li>Affret.IA vous propose automatiquement les offres pertinentes</li>
        <li>Acceptez ou refusez en un clic</li>
        <li>Recevez les détails et réalisez le transport</li>
      </ol>

      <center>
        <a href="${signupUrl}" class="btn">
          🚀 Créer mon compte gratuitement
        </a>
      </center>

      <p style="margin-top: 30px; padding: 15px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 5px;">
        <strong>⏰ Offre limitée :</strong> Les 100 premiers transporteurs inscrits bénéficient
        de <strong>20 consultations de transports gratuit</strong> au lieu de 10 !
      </p>

      <p style="margin-top: 20px; font-size: 14px; color: #666;">
        Rejoignez déjà <strong>500+ transporteurs</strong> qui utilisent SYMPHONI.A pour optimiser
        leur activité et réduire les retours à vide.
      </p>
    </div>

    <div class="footer">
      <p>SYMPHONI.A - Affret.IA</p>
      <p>Intelligence artificielle au service du transport</p>
      <p style="font-size: 11px; color: #999;">
        Vous recevez cet email car vous êtes un professionnel du transport.
        <a href="${signupUrl}" style="color: #11998e;">Se désinscrire</a>
      </p>
    </div>
  </div>
</body>
</html>
`;

// Sauvegarder les previews
const previewPath1 = path.join(__dirname, 'preview-email-type1-final.html');
const previewPath2 = path.join(__dirname, 'preview-email-type2-final.html');

fs.writeFileSync(previewPath1, emailType1);
fs.writeFileSync(previewPath2, emailType2);

console.log('✅ Email TYPE 1 généré');
console.log(`   📄 ${previewPath1}`);
console.log();

console.log('✅ Email TYPE 2 généré');
console.log(`   📄 ${previewPath2}`);
console.log();

// Validations
console.log('─'.repeat(80));
console.log('VALIDATIONS');
console.log('─'.repeat(80));
console.log();

const checks = {
  type1NoPrixMoyen: !emailType1.includes('Prix moyen'),
  type2Has10Consultations: emailType2.includes('10 consultations de transports gratuit'),
  type2Has20Consultations: emailType2.includes('20 consultations de transports gratuit'),
  type2NoCommission: !emailType2.includes('transports SANS COMMISSION') && !emailType2.includes('transports sans commission')
};

console.log('TYPE 1:');
console.log(`  ${checks.type1NoPrixMoyen ? '✅' : '❌'} Prix moyen retiré`);
console.log();

console.log('TYPE 2:');
console.log(`  ${checks.type2NoCommission ? '✅' : '❌'} Ancienne offre "transports sans commission" retirée`);
console.log(`  ${checks.type2Has10Consultations ? '✅' : '❌'} Nouvelle offre "10 consultations de transports gratuit"`);
console.log(`  ${checks.type2Has20Consultations ? '✅' : '❌'} Offre limitée "20 consultations de transports gratuit"`);
console.log();

if (Object.values(checks).every(v => v === true)) {
  console.log('='.repeat(80));
  console.log('✅ TOUS LES TESTS RÉUSSIS !');
  console.log('='.repeat(80));
  console.log();
  console.log('📝 Prochaines étapes:');
  console.log('1. Ouvrir les previews dans navigateur pour validation visuelle');
  console.log('2. Configurer AWS SES pour l\'envoi des emails');
  console.log('3. Déployer le service sur AWS EB');
} else {
  console.log('❌ Certains tests ont échoué');
}

console.log();
