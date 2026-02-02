/**
 * Data Generators - Génère des données de test pour les commandes
 */

const { generateRandomString } = require('./test-helpers');

/**
 * Codes postaux et coordonnées des villes françaises
 */
const FRENCH_CITIES = {
  Paris: {
    postalCode: '75001',
    coordinates: { latitude: 48.8566, longitude: 2.3522 },
    department: '75'
  },
  Lyon: {
    postalCode: '69001',
    coordinates: { latitude: 45.7640, longitude: 4.8357 },
    department: '69'
  },
  Marseille: {
    postalCode: '13001',
    coordinates: { latitude: 43.2965, longitude: 5.3698 },
    department: '13'
  },
  Toulouse: {
    postalCode: '31000',
    coordinates: { latitude: 43.6047, longitude: 1.4442 },
    department: '31'
  },
  Nice: {
    postalCode: '06000',
    coordinates: { latitude: 43.7102, longitude: 7.2620 },
    department: '06'
  },
  Bordeaux: {
    postalCode: '33000',
    coordinates: { latitude: 44.8378, longitude: -0.5792 },
    department: '33'
  },
  Strasbourg: {
    postalCode: '67000',
    coordinates: { latitude: 48.5734, longitude: 7.7521 },
    department: '67'
  },
  Lille: {
    postalCode: '59000',
    coordinates: { latitude: 50.6292, longitude: 3.0573 },
    department: '59'
  },
  Nantes: {
    postalCode: '44000',
    coordinates: { latitude: 47.2184, longitude: -1.5536 },
    department: '44'
  },
  Rennes: {
    postalCode: '35000',
    coordinates: { latitude: 48.1173, longitude: -1.6778 },
    department: '35'
  },
  Dijon: {
    postalCode: '21000',
    coordinates: { latitude: 47.3220, longitude: 5.0415 },
    department: '21'
  },
  Angers: {
    postalCode: '49000',
    coordinates: { latitude: 47.4784, longitude: -0.5632 },
    department: '49'
  },
  Brest: {
    postalCode: '29200',
    coordinates: { latitude: 48.3904, longitude: -4.4861 },
    department: '29'
  },
  Perpignan: {
    postalCode: '66000',
    coordinates: { latitude: 42.6886, longitude: 2.8948 },
    department: '66'
  },
  Grenoble: {
    postalCode: '38000',
    coordinates: { latitude: 45.1885, longitude: 5.7245 },
    department: '38'
  },
  Montpellier: {
    postalCode: '34000',
    coordinates: { latitude: 43.6108, longitude: 3.8767 },
    department: '34'
  }
};

/**
 * Get postal code from city name
 * @param {string} cityName - Nom de la ville
 * @returns {string}
 */
function getPostalCode(cityName) {
  const city = FRENCH_CITIES[cityName];
  return city ? city.postalCode : '75001';
}

/**
 * Get coordinates from city name
 * @param {string} cityName - Nom de la ville
 * @returns {{latitude: number, longitude: number}}
 */
function getCoordinates(cityName) {
  const city = FRENCH_CITIES[cityName];
  return city ? city.coordinates : { latitude: 48.8566, longitude: 2.3522 };
}

/**
 * Get department code from city name
 * @param {string} cityName - Nom de la ville
 * @returns {string}
 */
function getDepartmentCode(cityName) {
  const city = FRENCH_CITIES[cityName];
  return city ? city.department : '75';
}

/**
 * Generate address - Génère une adresse complète
 * @param {string} cityName - Nom de la ville
 * @returns {{name: string, street: string, city: string, postalCode: string, country: string, contact: object, coordinates: object}}
 */
function generateAddress(cityName) {
  const city = FRENCH_CITIES[cityName];

  if (!city) {
    throw new Error(`City ${cityName} not found in database`);
  }

  const streetNumber = Math.floor(Math.random() * 200) + 1;
  const streetNames = [
    'Rue de la République',
    'Avenue des Champs',
    'Boulevard Victor Hugo',
    'Rue Jean Jaurès',
    'Place de la Mairie',
    'Avenue de la Liberté',
    'Rue du Commerce',
    'Boulevard Gambetta'
  ];

  const streetName = streetNames[Math.floor(Math.random() * streetNames.length)];

  return {
    name: `Entrepôt ${cityName}`,
    street: `${streetNumber} ${streetName}`,
    city: cityName,
    postalCode: city.postalCode,
    country: 'France',
    contact: {
      name: `Contact ${cityName}`,
      phone: `+336${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      email: `contact-${cityName.toLowerCase()}@symphonia-test.com`
    },
    coordinates: city.coordinates
  };
}

/**
 * Generate cargo data - Génère des données de cargo aléatoires
 * @returns {{type: string, quantity: number, weight: object, volume: object, description: string}}
 */
function generateCargoData() {
  const cargoTypes = ['palette', 'colis', 'vrac', 'container'];
  const type = cargoTypes[Math.floor(Math.random() * cargoTypes.length)];

  const quantity = Math.floor(Math.random() * 20) + 1;
  const weight = {
    value: Math.floor(Math.random() * 1000) + 100,
    unit: 'kg'
  };
  const volume = {
    value: Math.floor(Math.random() * 10) + 1,
    unit: 'm3'
  };

  const descriptions = [
    'Marchandises diverses',
    'Produits manufacturés',
    'Matériel électronique',
    'Équipements industriels',
    'Produits alimentaires',
    'Pièces automobiles'
  ];

  const description = descriptions[Math.floor(Math.random() * descriptions.length)];

  return {
    type,
    quantity,
    weight,
    volume,
    description
  };
}

/**
 * Generate order data - Génère une commande complète
 * @param {string} pickupCity - Ville de chargement
 * @param {string} deliveryCity - Ville de livraison
 * @param {number} daysUntilPickup - Jours avant le chargement
 * @param {number} daysUntilDelivery - Jours avant la livraison
 * @returns {{pickup: object, delivery: object, cargo: object, pickupDate: Date, deliveryDate: Date}}
 */
function generateOrderData(pickupCity, deliveryCity, daysUntilPickup = 7, daysUntilDelivery = 10) {
  const pickupAddress = generateAddress(pickupCity);
  const deliveryAddress = generateAddress(deliveryCity);
  const cargo = generateCargoData();

  const pickupDate = new Date();
  pickupDate.setDate(pickupDate.getDate() + daysUntilPickup);

  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + daysUntilDelivery);

  return {
    pickup: pickupAddress,
    delivery: deliveryAddress,
    cargo,
    pickupDate,
    deliveryDate
  };
}

/**
 * Generate route - Génère une route GPS entre deux points
 * @param {{latitude: number, longitude: number}} start - Point de départ
 * @param {{latitude: number, longitude: number}} end - Point d'arrivée
 * @param {number} pointsCount - Nombre de points intermédiaires
 * @returns {Array<{lat: number, lng: number, heading: number}>}
 */
function generateRoute(start, end, pointsCount = 10) {
  const route = [];

  for (let i = 0; i <= pointsCount; i++) {
    const ratio = i / pointsCount;

    // Interpolation linéaire
    const lat = start.latitude + (end.latitude - start.latitude) * ratio;
    const lng = start.longitude + (end.longitude - start.longitude) * ratio;

    // Calcul du heading (direction)
    const heading = Math.atan2(
      end.longitude - start.longitude,
      end.latitude - start.latitude
    ) * (180 / Math.PI);

    route.push({
      lat,
      lng,
      heading: heading >= 0 ? heading : heading + 360
    });
  }

  return route;
}

/**
 * Generate company name - Génère un nom d'entreprise
 * @param {string} type - Type d'entreprise (industry, transport, logistics)
 * @returns {string}
 */
function generateCompanyName(type = 'industry') {
  const industrialPrefixes = ['Acme', 'Global', 'Tech', 'Innovative', 'Advanced', 'Premier'];
  const industrialSuffixes = ['Corp', 'Industries', 'Manufacturing', 'Systems', 'Group', 'Solutions'];

  const transportPrefixes = ['Trans', 'Logi', 'Express', 'Fast', 'Euro', 'Inter'];
  const transportSuffixes = ['Transport', 'Logistics', 'Express', 'Cargo', 'Freight', 'Services'];

  let prefixes, suffixes;

  switch (type) {
    case 'transport':
      prefixes = transportPrefixes;
      suffixes = transportSuffixes;
      break;
    case 'industry':
    default:
      prefixes = industrialPrefixes;
      suffixes = industrialSuffixes;
  }

  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];

  return `${prefix}${suffix}`;
}

/**
 * Generate pricing grid zones - Génère les zones pour grille tarifaire
 * @returns {Array<{from: string, to: string, label: string}>}
 */
function generatePricingGridZones() {
  return [
    { from: '75', to: '69', label: 'Paris → Lyon' },
    { from: '75', to: '13', label: 'Paris → Marseille' },
    { from: '69', to: '31', label: 'Lyon → Toulouse' },
    { from: '13', to: '33', label: 'Marseille → Bordeaux' },
    { from: '75', to: '59', label: 'Paris → Lille' },
    { from: '33', to: '44', label: 'Bordeaux → Nantes' }
  ];
}

/**
 * Generate vehicle types - Liste des types de véhicules
 * @returns {Array<string>}
 */
function generateVehicleTypes() {
  return ['VUL', '12T', '19T', 'SEMI'];
}

/**
 * Generate mock signature - Génère une signature base64 factice
 * @param {string} name - Nom du signataire
 * @returns {string}
 */
function generateMockSignature(name) {
  // Signature SVG simple encodée en base64
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <text x="10" y="50" font-family="cursive" font-size="24" fill="black">
        ${name}
      </text>
    </svg>
  `;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/**
 * Get all cities - Retourne toutes les villes disponibles
 * @returns {Array<string>}
 */
function getAllCities() {
  return Object.keys(FRENCH_CITIES);
}

module.exports = {
  FRENCH_CITIES,
  getPostalCode,
  getCoordinates,
  getDepartmentCode,
  generateAddress,
  generateCargoData,
  generateOrderData,
  generateRoute,
  generateCompanyName,
  generatePricingGridZones,
  generateVehicleTypes,
  generateMockSignature,
  getAllCities
};
