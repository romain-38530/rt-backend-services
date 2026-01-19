/**
 * SYMPHONI.A - Create Stripe Products for Logisticien Paid Options
 *
 * Run this script to create Stripe products and prices for:
 * - Bourse de Stockage (200 EUR/mois) - PRIX OFFICIEL
 * - Tablette Accueil Chauffeur (150 EUR/mois) - PRIX OFFICIEL
 *
 * Usage: node create-stripe-logisticien-options.js
 *
 * Prerequisites:
 * - Set STRIPE_SECRET_KEY environment variable
 * - Or run with: STRIPE_SECRET_KEY=sk_live_xxx node create-stripe-logisticien-options.js
 *
 * UPDATED: Janvier 2026 - Tarifs commercialisation officiels
 */

require('dotenv').config();
const Stripe = require('stripe');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error('ERROR: STRIPE_SECRET_KEY environment variable is required');
  console.error('Usage: STRIPE_SECRET_KEY=sk_xxx node create-stripe-logisticien-options.js');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

// ==================== LOGISTICIEN PAID OPTIONS ====================

const LOGISTICIEN_OPTIONS = [
  {
    id: 'bourse_stockage',
    name: 'Bourse de Stockage - Logisticien',
    description: 'Acces a la marketplace de stockage SYMPHONI.A. Publiez vos capacites de stockage, repondez aux besoins des industriels, recevez des recommandations IA.',
    price: 20000, // 200.00 EUR in cents - PRIX OFFICIEL
    currency: 'eur',
    interval: 'month',
    metadata: {
      type: 'logisticien_option',
      optionId: 'bourseDeStockage',
      features: 'publishCapacity,respondToNeeds,aiRecommendations,marketplaceVisibility',
      universe: 'logisticien'
    }
  },
  {
    id: 'tablette_accueil_chauffeur',
    name: 'Tablette Accueil Chauffeur - Logisticien',
    description: 'Automatisation de l\'accueil chauffeur avec tablette/kiosque. Check-in QR code, attribution automatique de quai, file d\'attente chauffeurs, notifications SMS.',
    price: 15000, // 150.00 EUR in cents - PRIX OFFICIEL
    currency: 'eur',
    interval: 'month',
    metadata: {
      type: 'logisticien_option',
      optionId: 'borneAccueilChauffeur',
      features: 'kioskMode,qrCodeCheckin,automaticDockAssignment,driverQueue,smsNotifications,waitTimeDisplay',
      universe: 'logisticien'
    }
  }
];

// ==================== HELPER FUNCTIONS ====================

async function findExistingProduct(name) {
  try {
    const products = await stripe.products.search({
      query: `name~"${name}"`,
      limit: 10
    });
    return products.data.find(p => p.name === name);
  } catch (error) {
    // Search might fail if not available, fallback to list
    const products = await stripe.products.list({ limit: 100 });
    return products.data.find(p => p.name === name);
  }
}

async function findExistingPrice(productId, amount, interval) {
  const prices = await stripe.prices.list({
    product: productId,
    limit: 100
  });
  return prices.data.find(p =>
    p.unit_amount === amount &&
    p.recurring?.interval === interval &&
    p.active
  );
}

async function createProduct(option) {
  console.log(`\n=== Creating product: ${option.name} ===`);

  // Check if product already exists
  let product = await findExistingProduct(option.name);

  if (product) {
    console.log(`  Product already exists: ${product.id}`);

    // Update metadata if needed
    product = await stripe.products.update(product.id, {
      description: option.description,
      metadata: option.metadata
    });
    console.log(`  Product metadata updated`);
  } else {
    // Create new product
    product = await stripe.products.create({
      name: option.name,
      description: option.description,
      metadata: option.metadata
    });
    console.log(`  Product created: ${product.id}`);
  }

  // Check if price already exists
  let price = await findExistingPrice(product.id, option.price, option.interval);

  if (price) {
    console.log(`  Price already exists: ${price.id}`);
  } else {
    // Create new price
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: option.price,
      currency: option.currency,
      recurring: {
        interval: option.interval
      },
      metadata: {
        ...option.metadata,
        priceType: 'recurring_monthly'
      }
    });
    console.log(`  Price created: ${price.id}`);
  }

  return {
    productId: product.id,
    priceId: price.id,
    name: option.name,
    amount: option.price / 100,
    currency: option.currency.toUpperCase()
  };
}

// ==================== MAIN ====================

async function main() {
  console.log('='.repeat(70));
  console.log('SYMPHONI.A - Creating Stripe Products for Logisticien Options');
  console.log('='.repeat(70));
  console.log(`Environment: ${STRIPE_SECRET_KEY.startsWith('sk_live') ? 'PRODUCTION' : 'TEST'}`);
  console.log(`Date: ${new Date().toISOString()}`);

  const results = [];

  for (const option of LOGISTICIEN_OPTIONS) {
    try {
      const result = await createProduct(option);
      results.push(result);
    } catch (error) {
      console.error(`\n  ERROR creating ${option.name}:`, error.message);
      results.push({
        name: option.name,
        error: error.message
      });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY - Logisticien Paid Options');
  console.log('='.repeat(70));

  console.log('\n// Add these Price IDs to subscription-features.js:\n');
  console.log('const LOGISTICIEN_PAID_OPTIONS = {');

  for (const result of results) {
    if (result.priceId) {
      const optionKey = result.name.includes('Bourse') ? 'bourseDeStockage' : 'borneAccueilChauffeur';
      console.log(`  ${optionKey}: {`);
      console.log(`    // ${result.name}`);
      console.log(`    stripePriceId: '${result.priceId}',`);
      console.log(`    stripeProductId: '${result.productId}',`);
      console.log(`    monthlyPrice: ${result.amount},`);
      console.log(`  },`);
    }
  }

  console.log('};');

  console.log('\n' + '='.repeat(70));
  console.log('Results Table');
  console.log('='.repeat(70));
  console.log('\n| Option | Product ID | Price ID | Amount |');
  console.log('|--------|------------|----------|--------|');

  for (const result of results) {
    if (result.priceId) {
      console.log(`| ${result.name.substring(0, 30)}... | ${result.productId} | ${result.priceId} | ${result.amount} ${result.currency} |`);
    } else {
      console.log(`| ${result.name} | ERROR | ${result.error} | - |`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('Done! Update subscription-features.js with the Price IDs above.');
  console.log('='.repeat(70));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
