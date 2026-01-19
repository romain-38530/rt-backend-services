// Script pour créer les produits et prix Stripe pour les options
// Usage: STRIPE_SECRET_KEY=sk_live_xxx node create-stripe-options.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const OPTIONS_MONTHLY = [
  { key: 'afretIA', name: 'AFFRET.IA Premium', price: 20000, description: 'Intelligence artificielle avancée pour affrètement optimal' },
  { key: 'thirdPartyConnection', name: 'Connexion outil tiers', price: 8900, description: 'Intégration ERP, TMS, WMS bidirectionnelle' },
  { key: 'eCmr', name: 'e-CMR Lettre de voiture électronique', price: 4900, description: 'CMR électronique conforme protocole 2008' },
  { key: 'geofencing', name: 'Geofencing Alertes zones', price: 2900, description: 'Alertes entrée/sortie zones géographiques' },
  { key: 'ocrDocuments', name: 'OCR automatique documents', price: 3900, description: 'Reconnaissance optique CMR, BL, factures' },
  { key: 'boursePrivee', name: 'Bourse privée transporteurs', price: 14900, description: 'Marketplace privé transporteurs référencés' },
  { key: 'webhooks', name: 'Webhooks temps réel', price: 5900, description: 'Notifications push pour 20+ événements' },
  { key: 'archivageLegal', name: 'Archivage légal 10 ans', price: 1900, description: 'Conservation sécurisée documents CMR' }
];

const OPTIONS_PER_UNIT = [
  { key: 'telematics', name: 'Connexion télématique', price: 1900, unit: 'camion', description: 'Intégration boîtiers GPS temps réel' },
  { key: 'trackingPremium', name: 'Tracking Premium GPS', price: 400, unit: 'véhicule', description: 'Suivi GPS haute fréquence TomTom' }
];

const OPTIONS_METERED = [
  { key: 'sms', name: 'Notifications SMS', price: 7, unit: 'SMS', description: 'Alertes SMS aux destinataires' },
  { key: 'signatureQualifiee', name: 'Signature électronique qualifiée', price: 200, unit: 'signature', description: 'Signature eIDAS qualifiée Yousign' }
];

async function createAllProducts() {
  console.log('=== Création des produits et prix Stripe ===\n');

  const results = {};

  // Options mensuelles fixes
  console.log('--- Options mensuelles fixes ---');
  for (const opt of OPTIONS_MONTHLY) {
    try {
      const product = await stripe.products.create({
        name: opt.name,
        description: opt.description,
        metadata: { option_key: opt.key, type: 'monthly' }
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: opt.price,
        currency: 'eur',
        recurring: { interval: 'month' },
        metadata: { option_key: opt.key }
      });

      results[opt.key] = price.id;
      console.log(`✅ ${opt.name}: ${price.id} (${opt.price/100}€/mois)`);
    } catch (error) {
      console.error(`❌ ${opt.name}: ${error.message}`);
    }
  }

  // Options par unité (licensed)
  console.log('\n--- Options par unité ---');
  for (const opt of OPTIONS_PER_UNIT) {
    try {
      const product = await stripe.products.create({
        name: opt.name,
        description: opt.description,
        unit_label: opt.unit,
        metadata: { option_key: opt.key, type: 'per_unit' }
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: opt.price,
        currency: 'eur',
        recurring: { interval: 'month', usage_type: 'licensed' },
        metadata: { option_key: opt.key }
      });

      results[opt.key] = price.id;
      console.log(`✅ ${opt.name}: ${price.id} (${opt.price/100}€/${opt.unit}/mois)`);
    } catch (error) {
      console.error(`❌ ${opt.name}: ${error.message}`);
    }
  }

  // Options à l'usage (metered)
  console.log('\n--- Options à l\'usage ---');
  for (const opt of OPTIONS_METERED) {
    try {
      const product = await stripe.products.create({
        name: opt.name,
        description: opt.description,
        unit_label: opt.unit,
        metadata: { option_key: opt.key, type: 'metered' }
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: opt.price,
        currency: 'eur',
        recurring: { interval: 'month', usage_type: 'metered' },
        metadata: { option_key: opt.key }
      });

      results[opt.key] = price.id;
      console.log(`✅ ${opt.name}: ${price.id} (${opt.price/100}€/${opt.unit})`);
    } catch (error) {
      console.error(`❌ ${opt.name}: ${error.message}`);
    }
  }

  // Afficher le résumé pour les variables d'environnement
  console.log('\n\n=== Variables d\'environnement à ajouter ===\n');
  for (const [key, priceId] of Object.entries(results)) {
    const envKey = `STRIPE_PRICE_OPTION_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
    console.log(`${envKey}=${priceId}`);
  }

  return results;
}

createAllProducts().catch(console.error);
