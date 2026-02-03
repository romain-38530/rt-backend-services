/**
 * Régénérer les previews avec logo et nouvelle phrase
 */

const fs = require('fs');
const path = require('path');

// Mock data
const mockCarrierData = {
  carrierName: 'MENIER TRANSPORTS',
  carrierEmail: 'elbad69@hotmail.fr',
  carrierContact: {
    firstName: 'Mohamed',
    lastName: 'SOLTANI'
  },
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
  ],
  avgPrice: 384.5
};

const mockAvailableOrders = [
  {
    orderId: 'ORDER-1',
    pickup: { city: 'Lyon', postalCode: '69000' },
    delivery: { city: 'Paris', postalCode: '75000' },
    pickupDate: new Date('2026-02-10'),
    estimatedPrice: 800,
    cargo: { palettes: 28, weight: 19000 }
  },
  {
    orderId: 'ORDER-2',
    pickup: { city: 'Marseille', postalCode: '13000' },
    delivery: { city: 'Bordeaux', postalCode: '33000' },
    pickupDate: new Date('2026-02-12'),
    estimatedPrice: 650,
    cargo: { palettes: 22, weight: 15000 }
  }
];

console.log('\n' + '='.repeat(80));
console.log('  RÉGÉNÉRATION PREVIEWS AVEC LOGO + NOUVELLE PHRASE');
console.log('='.repeat(80));
console.log();

// Charger le service
const DashdocCarrierInvitationService = require('../services/dashdoc-carrier-invitation.service');

const frontendUrl = 'https://transporteur.symphonia-controltower.com';
const invitationToken = 'TOKEN123';
const invitationUrl = `${frontendUrl}/invitation/dashdoc/${invitationToken}`;
const signupUrl = `${frontendUrl}/signup/carrier?source=dashdoc&token=${invitationToken}`;

// Générer TYPE 1
console.log('📝 Génération EMAIL TYPE 1...');
const emailType1 = DashdocCarrierInvitationService.generateKnownCarrierEmailHtml({
  carrierName: mockCarrierData.carrierName,
  contactName: `${mockCarrierData.carrierContact.firstName} ${mockCarrierData.carrierContact.lastName}`,
  totalTransports: mockCarrierData.totalTransports,
  routes: mockCarrierData.routes,
  avgPrice: mockCarrierData.avgPrice,
  invitationUrl
});

const previewPath1 = path.join(__dirname, 'preview-email-type1-with-logo.html');
fs.writeFileSync(previewPath1, emailType1);
console.log(`✅ Preview TYPE 1 sauvegardé: ${previewPath1}`);
console.log(`   Taille: ${emailType1.length} caractères`);
console.log();

// Générer TYPE 2
console.log('📝 Génération EMAIL TYPE 2...');
const emailType2 = DashdocCarrierInvitationService.generateConquestEmailHtml({
  carrierName: mockCarrierData.carrierName,
  contactName: `${mockCarrierData.carrierContact.firstName} ${mockCarrierData.carrierContact.lastName}`,
  routes: mockCarrierData.routes.slice(0, 3),
  availableOrders: mockAvailableOrders,
  signupUrl
});

const previewPath2 = path.join(__dirname, 'preview-email-type2-with-logo.html');
fs.writeFileSync(previewPath2, emailType2);
console.log(`✅ Preview TYPE 2 sauvegardé: ${previewPath2}`);
console.log(`   Taille: ${emailType2.length} caractères`);
console.log();

// Vérifications
console.log('='.repeat(80));
console.log('  VÉRIFICATIONS');
console.log('='.repeat(80));
console.log();

const checks = {
  type1HasLogo: emailType1.includes('class="logo"'),
  type2HasLogo: emailType2.includes('class="logo"'),
  type2HasTestimonial: emailType2.includes('a choisi SYMPHONI.A pour l\'accompagner'),
  type2HasCarrierName: emailType2.includes(mockCarrierData.carrierName),
  type1NoPrixMoyen: !emailType1.includes('Prix moyen'),
  type2Has10Consultations: emailType2.includes('10 consultations de transports gratuit'),
  type2Has20Consultations: emailType2.includes('20 consultations de transports gratuit')
};

console.log('TYPE 1:');
console.log(`  ${checks.type1HasLogo ? '✅' : '❌'} Logo SYMPHONI.A présent`);
console.log(`  ${checks.type1NoPrixMoyen ? '✅' : '❌'} Prix moyen retiré`);
console.log();

console.log('TYPE 2:');
console.log(`  ${checks.type2HasLogo ? '✅' : '❌'} Logo SYMPHONI.A présent`);
console.log(`  ${checks.type2HasTestimonial ? '✅' : '❌'} Phrase "a choisi SYMPHONI.A" présente`);
console.log(`  ${checks.type2HasCarrierName ? '✅' : '❌'} Nom du carrier (${mockCarrierData.carrierName}) présent`);
console.log(`  ${checks.type2Has10Consultations ? '✅' : '❌'} "10 consultations de transports gratuit" présent`);
console.log(`  ${checks.type2Has20Consultations ? '✅' : '❌'} "20 consultations de transports gratuit" présent`);
console.log();

const allValid = Object.values(checks).every(v => v === true);

if (allValid) {
  console.log('🎉 TOUS LES TESTS RÉUSSIS !');
  console.log();
  console.log('✅ Modifications appliquées:');
  console.log('   - Logo SYMPHONI.A ajouté dans les deux emails');
  console.log('   - Phrase testimonial ajoutée dans TYPE 2');
  console.log('   - Prix moyen retiré de TYPE 1');
  console.log('   - Offre "10/20 consultations" présente dans TYPE 2');
  console.log();
  console.log('📂 Fichiers générés:');
  console.log(`   - ${previewPath1}`);
  console.log(`   - ${previewPath2}`);
  console.log();
  console.log('🌐 Ouvrez ces fichiers dans votre navigateur pour voir le résultat final.');
} else {
  console.log('⚠️ CERTAINS TESTS ONT ÉCHOUÉ');
  console.log();
  console.log('Détails:');
  Object.entries(checks).forEach(([key, value]) => {
    if (!value) {
      console.log(`  ❌ ${key}`);
    }
  });
}

console.log();
console.log('='.repeat(80));
console.log();
