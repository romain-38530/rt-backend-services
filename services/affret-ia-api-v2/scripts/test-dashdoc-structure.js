/**
 * Script de test pour examiner la structure des données Dashdoc
 * Permet de vérifier quels champs contiennent les prix sous-traitants
 */

const axios = require('axios');
require('dotenv').config();

const DASHDOC_API_URL = process.env.DASHDOC_API_URL || 'https://api.dashdoc.com/api/v4';
const DASHDOC_API_KEY = process.env.DASHDOC_API_KEY;

async function testDashdocStructure() {
  console.log('\n=== TEST STRUCTURE DASHDOC API - AFFRETEMENT ===\n');

  if (!DASHDOC_API_KEY) {
    console.error('❌ DASHDOC_API_KEY non configuré');
    console.log('Définir la variable : export DASHDOC_API_KEY=your_key');
    process.exit(1);
  }

  // Tester plusieurs endpoints possibles pour l'affretement
  const endpointsToTest = [
    '/subcontracting/',
    '/chartered-transports/',
    '/charter/',
    '/affretements/',
    '/transports/' // Fallback avec filtre subcontracted
  ];

  for (const endpoint of endpointsToTest) {
    try {
      console.log(`📡 Test endpoint: ${endpoint}`);
      console.log(`URL: ${DASHDOC_API_URL}${endpoint}`);
      console.log(`Auth: Bearer ${DASHDOC_API_KEY.substring(0, 10)}...`);
      console.log('');

      const params = endpoint === '/transports/' ?
        { is_subcontracted: true, page_size: 1, ordering: '-created' } :
        { page_size: 1, ordering: '-created' };

      const response = await axios.get(`${DASHDOC_API_URL}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${DASHDOC_API_KEY}`,
          'Content-Type': 'application/json'
        },
        params
      });

    console.log(`✅ Réponse reçue: ${response.status} ${response.statusText}`);
    console.log(`📊 Nombre de transports: ${response.data.count || 0}`);
    console.log('');

    if (!response.data.results || response.data.results.length === 0) {
      console.log('⚠️ Aucun transport "done" trouvé');
      console.log('Essai sans filtre status...\n');

      const response2 = await axios.get(`${DASHDOC_API_URL}/transports/`, {
        headers: {
          'Authorization': `Bearer ${DASHDOC_API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: {
          page_size: 1,
          ordering: '-created'
        }
      });

      if (response2.data.results && response2.data.results.length > 0) {
        analyzeTransport(response2.data.results[0]);
      } else {
        console.log('❌ Aucun transport trouvé');
      }
      return;
    }

    const transport = response.data.results[0];
    analyzeTransport(transport);
    return; // Succès, sortir de la boucle

    } catch (error) {
      console.error(`❌ Erreur avec endpoint ${endpoint}:`);

      if (error.response) {
        console.error(`Status: ${error.response.status}`);
        console.error(`Message: ${JSON.stringify(error.response.data, null, 2)}`);

        if (error.response.status === 401) {
          console.error('\n⚠️ ERREUR 401: Clé API invalide ou expirée');
          console.error('Actions:');
          console.error('1. Vérifier que la clé API est correcte');
          console.error('2. Vérifier les permissions de la clé');
          console.error('3. Régénérer une nouvelle clé si nécessaire');
        } else if (error.response.status === 404) {
          console.error(`\n⚠️ Endpoint ${endpoint} n'existe pas`);
        }
      } else {
        console.error(error.message);
      }
      console.log(''); // Ligne vide avant le prochain endpoint
      // Continuer avec le prochain endpoint
    }
  }

  console.log('\n❌ Aucun endpoint fonctionnel trouvé');
  process.exit(1);
}

function analyzeTransport(transport) {
  console.log('='.repeat(60));
  console.log('📦 ANALYSE DU TRANSPORT');
  console.log('='.repeat(60));
  console.log('');

  // Infos de base
  console.log('🆔 Identifiant:');
  console.log(`   uid: ${transport.uid}`);
  console.log(`   sequential_id: ${transport.sequential_id || 'N/A'}`);
  console.log('');

  // Status
  console.log('📊 Status:');
  console.log(`   status: ${transport.status}`);
  console.log(`   created: ${transport.created}`);
  console.log(`   updated: ${transport.updated}`);
  console.log('');

  // Addresses
  console.log('📍 Addresses:');
  if (transport.origin?.address) {
    console.log(`   Origin: ${transport.origin.address.city || 'N/A'} (${transport.origin.address.postcode || 'N/A'})`);
  }
  if (transport.destination?.address) {
    console.log(`   Destination: ${transport.destination.address.city || 'N/A'} (${transport.destination.address.postcode || 'N/A'})`);
  }
  console.log('');

  // Carrier
  console.log('🚛 Transporteur:');
  if (transport.carrier) {
    console.log(`   pk: ${transport.carrier.pk}`);
    console.log(`   name: ${transport.carrier.name || 'N/A'}`);
    console.log(`   company_id: ${transport.carrier.company_id || 'N/A'}`);
  } else {
    console.log('   ⚠️ Pas de carrier défini');
  }
  console.log('');

  // PRICING - PARTIE CRITIQUE
  console.log('💰 PRICING (ANALYSE DÉTAILLÉE):');
  console.log('='.repeat(60));

  if (transport.pricing) {
    console.log(JSON.stringify(transport.pricing, null, 2));
    console.log('');

    // Analyse des champs de prix
    console.log('📊 Champs de prix détectés:');

    const priceFields = [
      'invoicing_amount',           // Prix facturé au CLIENT
      'carrier_price',              // Prix payé au TRANSPORTEUR
      'carrier_invoicing_amount',   // Montant facturé AU transporteur
      'purchase_price',             // Prix d'achat (payé au sous-traitant)
      'sale_price',                 // Prix de vente (facturé au client)
      'agreed_price',               // Prix convenu
      'final_price',                // Prix final
      'amount',                     // Montant
      'total_price',                // Prix total
      'quoted_price'                // Prix devisé
    ];

    let foundPrices = {};

    priceFields.forEach(field => {
      if (transport.pricing[field] !== undefined) {
        foundPrices[field] = transport.pricing[field];

        // Identifier le type de prix
        let priceType = '';
        if (field.includes('carrier') || field.includes('purchase')) {
          priceType = '🟢 SOUS-TRAITANT (À UTILISER)';
        } else if (field.includes('invoicing') || field.includes('sale')) {
          priceType = '🔴 CLIENT (NE PAS UTILISER)';
        } else {
          priceType = '🟡 À VÉRIFIER';
        }

        console.log(`   ${field}: ${transport.pricing[field]} ${transport.pricing.currency || 'EUR'} ${priceType}`);
      }
    });

    if (Object.keys(foundPrices).length === 0) {
      console.log('   ⚠️ Aucun champ de prix standard trouvé');
      console.log('   Champs disponibles:', Object.keys(transport.pricing).join(', '));
    }

    console.log('');

    // Recommandation
    console.log('🎯 RECOMMANDATION:');
    if (foundPrices.carrier_price || foundPrices.purchase_price) {
      const recommendedField = foundPrices.carrier_price ? 'carrier_price' : 'purchase_price';
      console.log(`   ✅ Utiliser: pricing.${recommendedField}`);
      console.log(`   Valeur: ${foundPrices[recommendedField]} ${transport.pricing.currency || 'EUR'}`);
    } else if (foundPrices.carrier_invoicing_amount) {
      console.log('   ⚠️ Utiliser: pricing.carrier_invoicing_amount');
      console.log(`   Valeur: ${foundPrices.carrier_invoicing_amount} ${transport.pricing.currency || 'EUR'}`);
    } else if (foundPrices.invoicing_amount) {
      console.log('   ⚠️ ATTENTION: Seulement invoicing_amount disponible');
      console.log('   Ce prix est facturé au CLIENT, pas au transporteur');
      console.log('   Vérifier si Dashdoc expose le prix sous-traitant');
    } else {
      console.log('   ❌ Aucun prix exploitable trouvé');
    }

  } else {
    console.log('   ❌ Pas de données pricing');
  }

  console.log('');
  console.log('='.repeat(60));

  // Transport details
  console.log('');
  console.log('🚚 Détails transport:');
  console.log(`   vehicle_type: ${transport.vehicle_type || 'N/A'}`);
  console.log(`   weight_kg: ${transport.weight_kg || 'N/A'}`);
  console.log(`   volume_m3: ${transport.volume_m3 || 'N/A'}`);
  console.log(`   pallets_count: ${transport.pallets_count || 'N/A'}`);
  console.log(`   distance_km: ${transport.distance_km || 'N/A'}`);
  console.log('');

  // Structure complète (limitée)
  console.log('📋 Structure complète (principales clés):');
  Object.keys(transport).forEach(key => {
    const value = transport[key];
    const type = Array.isArray(value) ? 'array' : typeof value;
    const preview = typeof value === 'object' && value !== null ?
      `{${Object.keys(value).slice(0, 3).join(', ')}${Object.keys(value).length > 3 ? ', ...' : ''}}` :
      (typeof value === 'string' && value.length > 30 ? value.substring(0, 30) + '...' : value);
    console.log(`   ${key}: (${type}) ${preview}`);
  });
}

// Exécution
testDashdocStructure();
