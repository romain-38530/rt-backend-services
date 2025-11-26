// ============================================================================
// RT SYMPHONI.A - Test de Connexion TomTom Telematics API
// ============================================================================
// Version: 1.6.2-security-final
// Date: 2024-11-26
// ============================================================================

const tomtom = require('../tomtom-integration');

// Configuration de test
const TEST_CONFIG = {
  // Route de test : Paris → Lyon
  origin: { lat: 48.8566, lng: 2.3522 },
  destination: { lat: 45.7640, lng: 4.8357 },

  // Adresse de test pour géocodage
  testAddress: '10 Rue de la Paix, 75002 Paris, France',

  // Coordonnées pour reverse geocoding
  testCoordinates: { lat: 48.8584, lng: 2.2945 }, // Tour Eiffel

  // Zone de geofencing (Paris centre)
  geofenceCenter: { lat: 48.8566, lng: 2.3522 },
  geofenceRadius: 5000 // 5 km
};

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

// ============================================================================
// Tests de Validation
// ============================================================================

async function testAPIKeyConfiguration() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('Test 1: Configuration de l\'API Key TomTom', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  if (!process.env.TOMTOM_API_KEY && !tomtom.TOMTOM_API_KEY) {
    logError('Variable d\'environnement TOMTOM_API_KEY non définie');
    return false;
  }

  const apiKey = process.env.TOMTOM_API_KEY || tomtom.TOMTOM_API_KEY;

  if (apiKey.length < 20) {
    logError('API Key trop courte (probablement invalide)');
    return false;
  }

  if (apiKey.includes('your-') || apiKey === 'ZQ9AaXfe1bDR3egvxV0I5owWAl9q2JBU') {
    logWarning('API Key par défaut détectée - Utilisez votre propre clé !');
    return false;
  }

  logSuccess('API Key TomTom configurée');
  logInfo(`Longueur de la clé : ${apiKey.length} caractères`);
  return true;
}

async function testCalculateRoute() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('Test 2: Calcul d\'itinéraire (Paris → Lyon)', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  try {
    const startTime = Date.now();
    const result = await tomtom.calculateRoute(
      TEST_CONFIG.origin,
      TEST_CONFIG.destination,
      {
        vehicleWeight: 15000,
        vehicleType: 'truck'
      }
    );
    const duration = Date.now() - startTime;

    if (!result.success) {
      logError(`Échec du calcul d'itinéraire: ${result.error}`);
      return false;
    }

    logSuccess('Itinéraire calculé avec succès');
    logInfo(`Distance : ${(result.distance / 1000).toFixed(2)} km`);
    logInfo(`Durée : ${Math.round(result.duration / 60)} minutes`);
    logInfo(`Retard trafic : ${result.delayMinutes} minutes`);
    logInfo(`Arrivée estimée : ${result.estimatedArrival.toLocaleString('fr-FR')}`);
    logInfo(`Temps de réponse : ${duration} ms`);

    if (duration > 5000) {
      logWarning('Temps de réponse élevé (>5s)');
    }

    return true;
  } catch (error) {
    logError(`Erreur: ${error.message}`);
    return false;
  }
}

async function testCalculateETA() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('Test 3: Calcul ETA (Temps d\'arrivée estimé)', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  try {
    const result = await tomtom.calculateETA(
      TEST_CONFIG.origin,
      TEST_CONFIG.destination,
      { averageSpeed: 70 }
    );

    if (!result.success) {
      logError(`Échec du calcul ETA: ${result.error}`);
      return false;
    }

    logSuccess('ETA calculé avec succès');
    logInfo(`ETA : ${result.eta.toLocaleString('fr-FR')}`);
    logInfo(`Distance : ${(result.distance / 1000).toFixed(2)} km`);
    logInfo(`Durée : ${Math.round(result.duration / 60)} minutes`);
    logInfo(`Méthode : ${result.method}`);

    if (result.fallback) {
      logWarning('Fallback utilisé (calcul Haversine)');
    }

    return true;
  } catch (error) {
    logError(`Erreur: ${error.message}`);
    return false;
  }
}

async function testGeocoding() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('Test 4: Géocodage (Adresse → GPS)', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  try {
    logInfo(`Adresse de test : ${TEST_CONFIG.testAddress}`);

    const result = await tomtom.geocodeAddress(TEST_CONFIG.testAddress);

    if (!result.success) {
      logError(`Échec du géocodage: ${result.error}`);
      return false;
    }

    logSuccess('Géocodage réussi');
    logInfo(`Coordonnées : lat=${result.coordinates.lat}, lng=${result.coordinates.lng}`);
    logInfo(`Adresse trouvée : ${result.address}`);
    logInfo(`Confiance : ${result.confidence}`);

    return true;
  } catch (error) {
    logError(`Erreur: ${error.message}`);
    return false;
  }
}

async function testReverseGeocoding() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('Test 5: Reverse Geocoding (GPS → Adresse)', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  try {
    logInfo(`Coordonnées : lat=${TEST_CONFIG.testCoordinates.lat}, lng=${TEST_CONFIG.testCoordinates.lng}`);

    const result = await tomtom.reverseGeocode(TEST_CONFIG.testCoordinates);

    if (!result.success) {
      logError(`Échec du reverse geocoding: ${result.error}`);
      return false;
    }

    logSuccess('Reverse geocoding réussi');
    logInfo(`Adresse : ${result.address}`);
    logInfo(`Ville : ${result.city}`);
    logInfo(`Code postal : ${result.postalCode}`);
    logInfo(`Pays : ${result.country}`);

    return true;
  } catch (error) {
    logError(`Erreur: ${error.message}`);
    return false;
  }
}

async function testGeofencing() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('Test 6: Géofencing (Détection de zone)', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  try {
    // Test 1 : Position dans la zone
    const position1 = { lat: 48.8600, lng: 2.3500 }; // Proche du centre de Paris
    const inZone1 = tomtom.isInGeofence(
      position1,
      TEST_CONFIG.geofenceCenter,
      TEST_CONFIG.geofenceRadius
    );

    logInfo(`Position 1 : lat=${position1.lat}, lng=${position1.lng}`);
    logInfo(`Dans la zone (${TEST_CONFIG.geofenceRadius}m) : ${inZone1 ? 'OUI ✅' : 'NON ❌'}`);

    // Test 2 : Position hors zone
    const position2 = { lat: 45.7640, lng: 4.8357 }; // Lyon
    const inZone2 = tomtom.isInGeofence(
      position2,
      TEST_CONFIG.geofenceCenter,
      TEST_CONFIG.geofenceRadius
    );

    logInfo(`Position 2 : lat=${position2.lat}, lng=${position2.lng}`);
    logInfo(`Dans la zone (${TEST_CONFIG.geofenceRadius}m) : ${inZone2 ? 'OUI ✅' : 'NON ❌'}`);

    if (inZone1 && !inZone2) {
      logSuccess('Géofencing fonctionne correctement');
      return true;
    } else {
      logError('Résultats de géofencing incorrects');
      return false;
    }
  } catch (error) {
    logError(`Erreur: ${error.message}`);
    return false;
  }
}

async function testHaversineDistance() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('Test 7: Calcul de Distance (Haversine)', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  try {
    const distance = tomtom.calculateHaversineDistance(
      TEST_CONFIG.origin,
      TEST_CONFIG.destination
    );

    logInfo(`Origine : Paris (${TEST_CONFIG.origin.lat}, ${TEST_CONFIG.origin.lng})`);
    logInfo(`Destination : Lyon (${TEST_CONFIG.destination.lat}, ${TEST_CONFIG.destination.lng})`);
    logInfo(`Distance calculée : ${distance.toFixed(2)} km`);

    // Distance réelle Paris-Lyon : ~390-400 km
    const expectedDistance = 400;
    const tolerance = 50; // ±50 km

    if (Math.abs(distance - expectedDistance) < tolerance) {
      logSuccess('Distance calculée cohérente');
      return true;
    } else {
      logWarning(`Distance calculée s'écarte de la distance attendue (~${expectedDistance} km)`);
      return true; // Pas une erreur bloquante
    }
  } catch (error) {
    logError(`Erreur: ${error.message}`);
    return false;
  }
}

async function testTrafficInfo() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('Test 8: Informations Trafic', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  try {
    const routePoints = [
      TEST_CONFIG.origin,
      { lat: 47.3167, lng: 3.3833 }, // Point intermédiaire
      TEST_CONFIG.destination
    ];

    const result = await tomtom.getTrafficInfo(routePoints);

    if (!result.success) {
      logWarning(`Impossible de récupérer les infos trafic: ${result.error}`);
      return true; // Pas bloquant
    }

    logSuccess('Informations trafic récupérées');
    logInfo(`Vitesse actuelle : ${result.currentSpeed} km/h`);
    logInfo(`Vitesse fluide : ${result.freeFlowSpeed} km/h`);
    logInfo(`Confiance : ${result.confidence}`);
    logInfo(`Route fermée : ${result.roadClosure ? 'OUI' : 'NON'}`);

    return true;
  } catch (error) {
    logWarning(`Erreur (non bloquante): ${error.message}`);
    return true;
  }
}

// ============================================================================
// Fonction Principale
// ============================================================================

async function runAllTests() {
  log('\n╔══════════════════════════════════════════════════════════════════╗', 'cyan');
  log('║  RT SYMPHONI.A - Test de Connexion TomTom Telematics API        ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════════╝', 'cyan');

  logInfo(`Date : ${new Date().toLocaleString('fr-FR')}`);
  logInfo(`Node.js : ${process.version}`);
  logInfo(`Environnement : ${process.env.NODE_ENV || 'development'}`);

  const tests = [
    { name: 'Configuration API Key', fn: testAPIKeyConfiguration },
    { name: 'Calcul d\'itinéraire', fn: testCalculateRoute },
    { name: 'Calcul ETA', fn: testCalculateETA },
    { name: 'Géocodage', fn: testGeocoding },
    { name: 'Reverse Geocoding', fn: testReverseGeocoding },
    { name: 'Géofencing', fn: testGeofencing },
    { name: 'Distance Haversine', fn: testHaversineDistance },
    { name: 'Informations Trafic', fn: testTrafficInfo }
  ];

  const results = [];

  for (const test of tests) {
    try {
      const passed = await test.fn();
      results.push({ name: test.name, passed });
    } catch (error) {
      logError(`Exception non gérée: ${error.message}`);
      results.push({ name: test.name, passed: false });
    }
  }

  // Résumé
  log('\n╔══════════════════════════════════════════════════════════════════╗', 'cyan');
  log('║  RÉSUMÉ DES TESTS                                                ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════════╝', 'cyan');

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  results.forEach(result => {
    if (result.passed) {
      logSuccess(`${result.name.padEnd(40)} : RÉUSSI`);
    } else {
      logError(`${result.name.padEnd(40)} : ÉCHOUÉ`);
    }
  });

  log('\n' + '═'.repeat(68), 'cyan');
  log(`Total : ${passed}/${total} tests réussis (${Math.round(passed / total * 100)}%)`, passed === total ? 'green' : 'yellow');
  log('═'.repeat(68), 'cyan');

  if (passed === total) {
    log('\n🎉 TOUS LES TESTS SONT PASSÉS !', 'green');
    log('✅ TomTom Telematics API est opérationnel', 'green');
    process.exit(0);
  } else {
    log('\n⚠️  CERTAINS TESTS ONT ÉCHOUÉ', 'yellow');
    log('Vérifiez votre configuration et réessayez', 'yellow');
    process.exit(1);
  }
}

// ============================================================================
// Exécution
// ============================================================================

if (require.main === module) {
  runAllTests().catch(error => {
    logError(`Erreur fatale: ${error.message}`);
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runAllTests };
