/**
 * Setup Stripe Products and Prices for Transporter Plans
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_xxx node scripts/setup-stripe-products.js
 *
 * Or with live key:
 *   STRIPE_SECRET_KEY=sk_live_xxx node scripts/setup-stripe-products.js
 */

const Stripe = require('stripe');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY is required');
  console.log('Usage: STRIPE_SECRET_KEY=sk_xxx node scripts/setup-stripe-products.js');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

// Products and prices to create
const TRANSPORTER_PLANS = [
  {
    productId: 'prod_transporteur_affretia',
    productName: 'AFFRET.IA - Bourse de Fret',
    productDescription: 'Accès à la bourse de fret, matching IA intelligent, vigilance et notation, alertes temps réel',
    priceId: 'price_transporteur_affretia_200',
    priceAmount: 20000, // 200€ in cents
    currency: 'eur',
    interval: 'month',
    features: ['bourse_fret', 'matching_ia', 'vigilance', 'alertes_temps_reel']
  },
  {
    productId: 'prod_transporteur_industrie',
    productName: 'Pack Industrie Complet',
    productDescription: 'Pack complet incluant AFFRET.IA + référentiel transporteurs, planning, KPI, scoring, appels d\'offres, utilisateurs illimités',
    priceId: 'price_transporteur_industrie_499',
    priceAmount: 49900, // 499€ in cents
    currency: 'eur',
    interval: 'month',
    features: ['bourse_fret', 'matching_ia', 'vigilance', 'alertes_temps_reel', 'referentiel_transporteurs', 'planning', 'kpi', 'scoring', 'appels_offres', 'utilisateurs_illimites']
  },
  {
    productId: 'prod_transporteur_tms',
    productName: 'Connexion TMS',
    productDescription: 'Synchronisation TMS, API REST complète, Webhooks temps réel',
    priceId: 'price_transporteur_tms_149',
    priceAmount: 14900, // 149€ in cents
    currency: 'eur',
    interval: 'month',
    features: ['tms_sync', 'api_rest', 'webhooks']
  }
];

async function createProductsAndPrices() {
  console.log('🚀 Creating Stripe products and prices for Transporter plans...\n');

  const results = {
    products: [],
    prices: []
  };

  for (const plan of TRANSPORTER_PLANS) {
    try {
      // Check if product already exists
      let product;
      try {
        const existingProducts = await stripe.products.list({
          limit: 100
        });
        product = existingProducts.data.find(p => p.metadata?.planId === plan.productId);
      } catch (e) {
        // Product doesn't exist, we'll create it
      }

      if (!product) {
        // Create product
        console.log(`📦 Creating product: ${plan.productName}`);
        product = await stripe.products.create({
          name: plan.productName,
          description: plan.productDescription,
          metadata: {
            planId: plan.productId,
            features: plan.features.join(',')
          }
        });
        console.log(`   ✅ Product created: ${product.id}`);
        results.products.push({ name: plan.productName, id: product.id, created: true });
      } else {
        console.log(`📦 Product already exists: ${plan.productName} (${product.id})`);
        results.products.push({ name: plan.productName, id: product.id, created: false });
      }

      // Check if price already exists with our lookup_key
      let price;
      try {
        const existingPrices = await stripe.prices.list({
          product: product.id,
          active: true
        });
        price = existingPrices.data.find(p =>
          p.unit_amount === plan.priceAmount &&
          p.recurring?.interval === plan.interval
        );
      } catch (e) {
        // Price doesn't exist
      }

      if (!price) {
        // Create price
        console.log(`💰 Creating price: ${plan.priceAmount / 100}€/${plan.interval}`);
        price = await stripe.prices.create({
          product: product.id,
          unit_amount: plan.priceAmount,
          currency: plan.currency,
          recurring: {
            interval: plan.interval
          },
          lookup_key: plan.priceId,
          metadata: {
            planId: plan.productId,
            features: plan.features.join(',')
          }
        });
        console.log(`   ✅ Price created: ${price.id}`);
        results.prices.push({
          name: plan.productName,
          id: price.id,
          lookupKey: plan.priceId,
          amount: plan.priceAmount / 100,
          created: true
        });
      } else {
        console.log(`💰 Price already exists: ${plan.priceAmount / 100}€/${plan.interval} (${price.id})`);
        results.prices.push({
          name: plan.productName,
          id: price.id,
          lookupKey: plan.priceId,
          amount: plan.priceAmount / 100,
          created: false
        });
      }

      console.log('');
    } catch (error) {
      console.error(`❌ Error creating ${plan.productName}:`, error.message);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 SUMMARY');
  console.log('='.repeat(60));

  console.log('\n🔧 Environment Variables to set:\n');

  for (const price of results.prices) {
    const envName = `STRIPE_PRICE_TRANSPORTEUR_${price.name.includes('AFFRET') ? 'AFFRETIA' : price.name.includes('Industrie') ? 'INDUSTRIE' : 'TMS'}`;
    console.log(`${envName}=${price.id}`);
  }

  console.log('\n📝 For Elastic Beanstalk, run:\n');
  console.log('aws elasticbeanstalk update-environment \\');
  console.log('  --environment-name subscriptions-contracts-eb \\');
  console.log('  --option-settings \\');

  for (let i = 0; i < results.prices.length; i++) {
    const price = results.prices[i];
    const envName = `STRIPE_PRICE_TRANSPORTEUR_${price.name.includes('AFFRET') ? 'AFFRETIA' : price.name.includes('Industrie') ? 'INDUSTRIE' : 'TMS'}`;
    const isLast = i === results.prices.length - 1;
    console.log(`    Namespace=aws:elasticbeanstalk:application:environment,OptionName=${envName},Value=${price.id}${isLast ? '' : ' \\'}`);
  }

  console.log('\n✅ Setup complete!');

  return results;
}

// Run
createProductsAndPrices()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
