// Pricing Grids Models - Grilles tarifaires transporteurs par industriel
// RT Backend Services - Version 2.0.0
// Support pour LTL (palette), FTL (lot complet), Messagerie (département/poids)

// Types de transport supportés
const TransportTypes = {
  FTL: 'FTL',                           // Full Truck Load - Lot complet
  LTL: 'LTL',                           // Less Than Truck Load - Groupage palette
  MESSAGERIE: 'MESSAGERIE',             // Messagerie - Par département/poids
  ADR: 'ADR',                           // Matières dangereuses
  FRIGO: 'FRIGO',                       // Température contrôlée
  EXPRESS: 'EXPRESS',                   // Express
  VRAC: 'VRAC',                         // Transport en vrac
  BENNE: 'BENNE'                        // Transport benne
};

// Types de calcul tarifaire
const PricingCalculationTypes = {
  PER_PALLET: 'PER_PALLET',             // Prix à la palette (LTL)
  FLAT_RATE: 'FLAT_RATE',               // Prix forfaitaire (FTL)
  PER_KM: 'PER_KM',                     // Prix au kilomètre (FTL)
  PER_WEIGHT: 'PER_WEIGHT',             // Prix au poids avec payant pour (Messagerie)
  HYBRID: 'HYBRID'                      // Hybride (combinaison)
};

// Statuts de grille
const GridStatus = {
  DRAFT: 'DRAFT',                       // Brouillon
  PENDING_APPROVAL: 'PENDING_APPROVAL', // En attente d'approbation
  ACTIVE: 'ACTIVE',                     // Active
  EXPIRED: 'EXPIRED',                   // Expirée
  SUSPENDED: 'SUSPENDED',               // Suspendue
  ARCHIVED: 'ARCHIVED'                  // Archivée
};

// Départements français (pour messagerie)
const FrenchDepartments = {
  '01': 'Ain', '02': 'Aisne', '03': 'Allier', '04': 'Alpes-de-Haute-Provence', '05': 'Hautes-Alpes',
  '06': 'Alpes-Maritimes', '07': 'Ardèche', '08': 'Ardennes', '09': 'Ariège', '10': 'Aube',
  '11': 'Aude', '12': 'Aveyron', '13': 'Bouches-du-Rhône', '14': 'Calvados', '15': 'Cantal',
  '16': 'Charente', '17': 'Charente-Maritime', '18': 'Cher', '19': 'Corrèze', '2A': 'Corse-du-Sud',
  '2B': 'Haute-Corse', '21': 'Côte-d\'Or', '22': 'Côtes-d\'Armor', '23': 'Creuse', '24': 'Dordogne',
  '25': 'Doubs', '26': 'Drôme', '27': 'Eure', '28': 'Eure-et-Loir', '29': 'Finistère',
  '30': 'Gard', '31': 'Haute-Garonne', '32': 'Gers', '33': 'Gironde', '34': 'Hérault',
  '35': 'Ille-et-Vilaine', '36': 'Indre', '37': 'Indre-et-Loire', '38': 'Isère', '39': 'Jura',
  '40': 'Landes', '41': 'Loir-et-Cher', '42': 'Loire', '43': 'Haute-Loire', '44': 'Loire-Atlantique',
  '45': 'Loiret', '46': 'Lot', '47': 'Lot-et-Garonne', '48': 'Lozère', '49': 'Maine-et-Loire',
  '50': 'Manche', '51': 'Marne', '52': 'Haute-Marne', '53': 'Mayenne', '54': 'Meurthe-et-Moselle',
  '55': 'Meuse', '56': 'Morbihan', '57': 'Moselle', '58': 'Nièvre', '59': 'Nord',
  '60': 'Oise', '61': 'Orne', '62': 'Pas-de-Calais', '63': 'Puy-de-Dôme', '64': 'Pyrénées-Atlantiques',
  '65': 'Hautes-Pyrénées', '66': 'Pyrénées-Orientales', '67': 'Bas-Rhin', '68': 'Haut-Rhin', '69': 'Rhône',
  '70': 'Haute-Saône', '71': 'Saône-et-Loire', '72': 'Sarthe', '73': 'Savoie', '74': 'Haute-Savoie',
  '75': 'Paris', '76': 'Seine-Maritime', '77': 'Seine-et-Marne', '78': 'Yvelines', '79': 'Deux-Sèvres',
  '80': 'Somme', '81': 'Tarn', '82': 'Tarn-et-Garonne', '83': 'Var', '84': 'Vaucluse',
  '85': 'Vendée', '86': 'Vienne', '87': 'Haute-Vienne', '88': 'Vosges', '89': 'Yonne',
  '90': 'Territoire de Belfort', '91': 'Essonne', '92': 'Hauts-de-Seine', '93': 'Seine-Saint-Denis',
  '94': 'Val-de-Marne', '95': 'Val-d\'Oise',
  '971': 'Guadeloupe', '972': 'Martinique', '973': 'Guyane', '974': 'La Réunion', '976': 'Mayotte'
};

// Zones géographiques prédéfinies (pour LTL/FTL)
const GeographicZones = {
  // France métropolitaine par région
  IDF: { code: 'IDF', name: 'Île-de-France', country: 'FR', departments: ['75', '77', '78', '91', '92', '93', '94', '95'] },
  ARA: { code: 'ARA', name: 'Auvergne-Rhône-Alpes', country: 'FR', departments: ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'] },
  BFC: { code: 'BFC', name: 'Bourgogne-Franche-Comté', country: 'FR', departments: ['21', '25', '39', '58', '70', '71', '89', '90'] },
  BRE: { code: 'BRE', name: 'Bretagne', country: 'FR', departments: ['22', '29', '35', '56'] },
  CVL: { code: 'CVL', name: 'Centre-Val de Loire', country: 'FR', departments: ['18', '28', '36', '37', '41', '45'] },
  GES: { code: 'GES', name: 'Grand Est', country: 'FR', departments: ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'] },
  HDF: { code: 'HDF', name: 'Hauts-de-France', country: 'FR', departments: ['02', '59', '60', '62', '80'] },
  NOR: { code: 'NOR', name: 'Normandie', country: 'FR', departments: ['14', '27', '50', '61', '76'] },
  NAQ: { code: 'NAQ', name: 'Nouvelle-Aquitaine', country: 'FR', departments: ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'] },
  OCC: { code: 'OCC', name: 'Occitanie', country: 'FR', departments: ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'] },
  PDL: { code: 'PDL', name: 'Pays de la Loire', country: 'FR', departments: ['44', '49', '53', '72', '85'] },
  PAC: { code: 'PAC', name: "Provence-Alpes-Côte d'Azur", country: 'FR', departments: ['04', '05', '06', '13', '83', '84'] },
  COR: { code: 'COR', name: 'Corse', country: 'FR', departments: ['2A', '2B'] },

  // Pays européens
  BE: { code: 'BE', name: 'Belgique', country: 'BE' },
  LU: { code: 'LU', name: 'Luxembourg', country: 'LU' },
  DE: { code: 'DE', name: 'Allemagne', country: 'DE' },
  ES: { code: 'ES', name: 'Espagne', country: 'ES' },
  IT: { code: 'IT', name: 'Italie', country: 'IT' },
  NL: { code: 'NL', name: 'Pays-Bas', country: 'NL' },
  CH: { code: 'CH', name: 'Suisse', country: 'CH' },
  UK: { code: 'UK', name: 'Royaume-Uni', country: 'UK' },
  PT: { code: 'PT', name: 'Portugal', country: 'PT' },
  PL: { code: 'PL', name: 'Pologne', country: 'PL' }
};

// Configuration des options tarifaires
const pricingOptionsConfig = {
  ADR: {
    name: 'Transport ADR (Matières dangereuses)',
    multiplier: 1.3,
    fixedSupplement: 50,
    requiresCertification: true
  },
  HAYON: {
    name: 'Hayon élévateur',
    multiplier: 1.1,
    fixedSupplement: 20,
    requiresCertification: false
  },
  FRIGO: {
    name: 'Température contrôlée',
    multiplier: 1.25,
    fixedSupplement: 40,
    requiresCertification: true
  },
  EXPRESS: {
    name: 'Livraison express',
    multiplier: 1.5,
    fixedSupplement: 100,
    requiresCertification: false
  },
  MULTIPOINT: {
    name: 'Multi-livraisons',
    multiplier: 1.0,
    fixedSupplement: 30,
    perStopSupplement: 25,
    requiresCertification: false
  },
  FRAGILE: {
    name: 'Marchandise fragile',
    multiplier: 1.15,
    fixedSupplement: 30,
    requiresCertification: false
  },
  OVERSIZE: {
    name: 'Hors gabarit',
    multiplier: 1.4,
    fixedSupplement: 80,
    requiresCertification: true
  },
  WEEKEND: {
    name: 'Livraison weekend',
    multiplier: 1.3,
    fixedSupplement: 60,
    requiresCertification: false
  },
  NIGHT: {
    name: 'Livraison nocturne',
    multiplier: 1.35,
    fixedSupplement: 70,
    requiresCertification: false
  }
};

// ============================================================================
// STRUCTURES DE TARIFICATION PAR TYPE
// ============================================================================

/**
 * Structure LTL - Groupage palette (1-33 palettes)
 * Prix par palette avec paliers par zone
 * Exemple:
 * {
 *   zoneOrigin: 'IDF',
 *   zoneDestination: 'ARA',
 *   palletTiers: [
 *     { min: 1, max: 1, price: 150 },
 *     { min: 2, max: 5, price: 120 },
 *     { min: 6, max: 10, price: 100 },
 *     { min: 11, max: 20, price: 85 },
 *     { min: 21, max: 33, price: 75 }
 *   ]
 * }
 */
const LTLPricingStructure = {
  // Tarifs par combinaison zone origine -> zone destination
  zonePricing: [{
    zoneOrigin: 'string',         // Code zone origine (ex: 'IDF')
    zoneDestination: 'string',    // Code zone destination (ex: 'ARA')
    palletTiers: [{
      min: 'number',              // Nombre min de palettes
      max: 'number',              // Nombre max de palettes
      pricePerPallet: 'number'    // Prix par palette dans ce palier
    }],
    minimumPrice: 'number',       // Prix minimum pour cette zone
    transitDays: 'number'         // Délai de livraison en jours
  }]
};

/**
 * Structure FTL - Lot complet
 * Prix forfaitaire ou au km par zone/distance
 * Exemple:
 * {
 *   vehicleType: 'SEMI',
 *   zoneOrigin: 'IDF',
 *   zoneDestination: 'PAC',
 *   flatRate: 1500,
 *   pricePerKm: null // ou alternativement { pricePerKm: 1.50, minKm: 100 }
 * }
 */
const FTLPricingStructure = {
  vehicleTypes: ['SEMI', 'PORTEUR', 'MEGA', 'TAUTLINER', 'FRIGO_TRUCK'],
  zonePricing: [{
    zoneOrigin: 'string',
    zoneDestination: 'string',
    vehicleType: 'string',        // Type de véhicule
    flatRate: 'number',           // Prix forfaitaire (si FLAT_RATE)
    pricePerKm: 'number',         // Prix au km (si PER_KM)
    minKm: 'number',              // Distance minimum facturée
    minimumPrice: 'number',       // Prix minimum
    transitDays: 'number'
  }]
};

/**
 * Structure Messagerie - Par département et poids
 * Avec "payant pour" = max(poids réel, poids volumétrique)
 * Poids volumétrique = (L x l x H en cm) / 5000
 *
 * Exemple:
 * {
 *   departmentOrigin: '75',
 *   departmentDestination: '13',
 *   weightTiers: [
 *     { min: 0, max: 30, price: 15.50 },
 *     { min: 30, max: 100, price: 25.00 },
 *     { min: 100, max: 300, price: 45.00 },
 *     { min: 300, max: 500, price: 75.00 },
 *     { min: 500, max: 1000, price: 120.00 }
 *   ]
 * }
 */
const MessagingPricingStructure = {
  volumetricDivisor: 5000,        // Diviseur pour calcul poids volumétrique
  departmentPricing: [{
    departmentOrigin: 'string',   // Code département origine (ex: '75')
    departmentDestination: 'string', // Code département destination (ex: '13')
    weightTiers: [{
      minKg: 'number',            // Poids minimum (kg)
      maxKg: 'number',            // Poids maximum (kg)
      price: 'number'             // Prix pour ce palier
    }],
    minimumPrice: 'number',       // Prix minimum
    transitDays: 'number'
  }]
};

// ============================================================================
// SCHEMA COMPLET DE GRILLE TARIFAIRE
// ============================================================================

const pricingGridSchema = {
  gridId: { type: 'string', required: true, unique: true },

  // Relations
  carrierId: { type: 'string', required: true },
  industrialId: { type: 'string', required: true },

  // Informations générales
  name: { type: 'string', required: true },
  description: { type: 'string', required: false },
  transportType: {
    type: 'string',
    required: true,
    enum: Object.keys(TransportTypes)
  },

  // Configuration tarifaire
  calculationType: {
    type: 'string',
    required: true,
    enum: Object.keys(PricingCalculationTypes)
  },

  // ============ TARIFICATION LTL (Groupage palette) ============
  ltlPricing: {
    zonePricing: [{
      zoneOrigin: 'string',
      zoneDestination: 'string',
      palletTiers: [{
        min: 'number',
        max: 'number',
        pricePerPallet: 'number'
      }],
      minimumPrice: 'number',
      transitDays: 'number'
    }]
  },

  // ============ TARIFICATION FTL (Lot complet) ============
  ftlPricing: {
    zonePricing: [{
      zoneOrigin: 'string',
      zoneDestination: 'string',
      vehicleType: 'string',
      flatRate: 'number',
      pricePerKm: 'number',
      minKm: 'number',
      minimumPrice: 'number',
      transitDays: 'number'
    }]
  },

  // ============ TARIFICATION MESSAGERIE (Département/Poids) ============
  messageriePricing: {
    volumetricDivisor: { type: 'number', default: 5000 },
    departmentPricing: [{
      departmentOrigin: 'string',
      departmentDestination: 'string',
      weightTiers: [{
        minKg: 'number',
        maxKg: 'number',
        price: 'number'
      }],
      minimumPrice: 'number',
      transitDays: 'number'
    }]
  },

  // ============ TARIFICATION LEGACY (rétrocompatibilité) ============
  basePricing: {
    basePrice: { type: 'number', required: false },
    pricePerKm: { type: 'number', required: false },
    pricePerKg: { type: 'number', required: false },
    pricePerM3: { type: 'number', required: false },
    pricePerPallet: { type: 'number', required: false },
    minimumPrice: { type: 'number', required: false },
    currency: { type: 'string', required: true, default: 'EUR' }
  },

  // Options et suppléments
  options: {
    enabledOptions: ['string'],
    optionsModifiers: {}
  },

  // Majorations temporelles
  timeModifiers: {
    weekendMultiplier: 'number',
    nightMultiplier: 'number',
    holidayMultiplier: 'number',
    peakSeasonMultiplier: 'number'
  },

  // Conditions d'application
  conditions: {
    minDistance: 'number',
    maxDistance: 'number',
    minWeight: 'number',
    maxWeight: 'number',
    minVolume: 'number',
    maxVolume: 'number',
    vehicleTypes: ['string'],
    requiresInsurance: 'boolean'
  },

  // Validité
  validFrom: { type: 'date', required: true },
  validUntil: { type: 'date', required: false },
  autoRenew: { type: 'boolean', default: false },

  // Statut et workflow
  status: {
    type: 'string',
    required: true,
    enum: Object.keys(GridStatus),
    default: 'DRAFT'
  },

  // Approbation
  approval: {
    required: 'boolean',
    approvedBy: 'string',
    approvedAt: 'date',
    rejectionReason: 'string'
  },

  // Versioning
  version: { type: 'number', required: true, default: 1 },
  previousVersionId: { type: 'string', required: false },

  // Import tracking
  importedFrom: {
    type: 'string',       // 'EXCEL', 'API', 'MANUAL'
    fileName: 'string',
    importedAt: 'date',
    importedBy: 'string'
  },

  // Statistiques d'utilisation
  usage: {
    totalQuotes: 'number',
    totalOrders: 'number',
    totalRevenue: 'number',
    lastUsedAt: 'date'
  },

  // Métadonnées
  createdBy: { type: 'string', required: true },
  createdAt: { type: 'date', required: true },
  updatedAt: { type: 'date', required: true },
  updatedBy: { type: 'string', required: false }
};

// ============================================================================
// FONCTIONS DE CALCUL DE PRIX
// ============================================================================

/**
 * Calculer le poids "payant pour" (messagerie)
 * = max(poids réel, poids volumétrique)
 */
function calculatePayingWeight(realWeight, dimensions, volumetricDivisor = 5000) {
  if (!dimensions || !dimensions.length || !dimensions.width || !dimensions.height) {
    return realWeight;
  }

  // Poids volumétrique = (L x l x H) / diviseur
  const volumetricWeight = (dimensions.length * dimensions.width * dimensions.height) / volumetricDivisor;

  // Payant pour = max des deux
  return Math.max(realWeight, volumetricWeight);
}

/**
 * Calculer le prix LTL (groupage palette)
 */
function calculateLTLPrice(grid, parameters) {
  const { pallets, zoneOrigin, zoneDestination } = parameters;

  if (!pallets || pallets < 1) {
    return { valid: false, error: 'Number of pallets required for LTL pricing' };
  }

  if (!grid.ltlPricing || !grid.ltlPricing.zonePricing) {
    return { valid: false, error: 'LTL pricing not configured for this grid' };
  }

  // Trouver le tarif pour la zone
  const zonePricing = grid.ltlPricing.zonePricing.find(
    z => z.zoneOrigin === zoneOrigin && z.zoneDestination === zoneDestination
  );

  if (!zonePricing) {
    return { valid: false, error: `No pricing found for zone ${zoneOrigin} -> ${zoneDestination}` };
  }

  // Trouver le palier de palettes
  const palletTier = zonePricing.palletTiers.find(
    t => pallets >= t.min && pallets <= t.max
  );

  if (!palletTier) {
    return { valid: false, error: `No pallet tier found for ${pallets} pallets` };
  }

  const calculatedPrice = pallets * palletTier.pricePerPallet;
  const finalPrice = Math.max(calculatedPrice, zonePricing.minimumPrice || 0);

  return {
    valid: true,
    price: finalPrice,
    currency: grid.basePricing?.currency || 'EUR',
    breakdown: {
      pallets,
      pricePerPallet: palletTier.pricePerPallet,
      palletTier: `${palletTier.min}-${palletTier.max}`,
      subtotal: calculatedPrice,
      minimumApplied: finalPrice !== calculatedPrice,
      total: finalPrice
    },
    transitDays: zonePricing.transitDays
  };
}

/**
 * Calculer le prix FTL (lot complet)
 */
function calculateFTLPrice(grid, parameters) {
  const { zoneOrigin, zoneDestination, vehicleType = 'SEMI', distance } = parameters;

  if (!grid.ftlPricing || !grid.ftlPricing.zonePricing) {
    return { valid: false, error: 'FTL pricing not configured for this grid' };
  }

  // Trouver le tarif pour la zone et le type de véhicule
  let zonePricing = grid.ftlPricing.zonePricing.find(
    z => z.zoneOrigin === zoneOrigin &&
         z.zoneDestination === zoneDestination &&
         z.vehicleType === vehicleType
  );

  // Si pas de tarif spécifique au véhicule, chercher sans filtre véhicule
  if (!zonePricing) {
    zonePricing = grid.ftlPricing.zonePricing.find(
      z => z.zoneOrigin === zoneOrigin && z.zoneDestination === zoneDestination
    );
  }

  if (!zonePricing) {
    return { valid: false, error: `No FTL pricing found for zone ${zoneOrigin} -> ${zoneDestination}` };
  }

  let calculatedPrice;
  let breakdown = {};

  if (zonePricing.flatRate) {
    // Prix forfaitaire
    calculatedPrice = zonePricing.flatRate;
    breakdown = {
      type: 'FLAT_RATE',
      flatRate: zonePricing.flatRate,
      total: calculatedPrice
    };
  } else if (zonePricing.pricePerKm && distance) {
    // Prix au kilomètre
    const billableKm = Math.max(distance, zonePricing.minKm || 0);
    calculatedPrice = billableKm * zonePricing.pricePerKm;
    breakdown = {
      type: 'PER_KM',
      distance,
      billableKm,
      pricePerKm: zonePricing.pricePerKm,
      minKm: zonePricing.minKm || 0,
      total: calculatedPrice
    };
  } else {
    return { valid: false, error: 'FTL pricing requires flatRate or (pricePerKm + distance)' };
  }

  const finalPrice = Math.max(calculatedPrice, zonePricing.minimumPrice || 0);
  breakdown.minimumApplied = finalPrice !== calculatedPrice;
  breakdown.total = finalPrice;

  return {
    valid: true,
    price: finalPrice,
    currency: grid.basePricing?.currency || 'EUR',
    breakdown,
    vehicleType: zonePricing.vehicleType || vehicleType,
    transitDays: zonePricing.transitDays
  };
}

/**
 * Calculer le prix Messagerie (département/poids)
 */
function calculateMessageriePrice(grid, parameters) {
  const {
    weight,
    dimensions, // { length, width, height } en cm
    departmentOrigin,
    departmentDestination
  } = parameters;

  if (!weight && !dimensions) {
    return { valid: false, error: 'Weight or dimensions required for Messagerie pricing' };
  }

  if (!grid.messageriePricing || !grid.messageriePricing.departmentPricing) {
    return { valid: false, error: 'Messagerie pricing not configured for this grid' };
  }

  // Calculer le poids payant
  const volumetricDivisor = grid.messageriePricing.volumetricDivisor || 5000;
  const payingWeight = calculatePayingWeight(weight || 0, dimensions, volumetricDivisor);

  // Trouver le tarif pour les départements
  const deptPricing = grid.messageriePricing.departmentPricing.find(
    d => d.departmentOrigin === departmentOrigin && d.departmentDestination === departmentDestination
  );

  if (!deptPricing) {
    return { valid: false, error: `No pricing found for ${departmentOrigin} -> ${departmentDestination}` };
  }

  // Trouver le palier de poids
  const weightTier = deptPricing.weightTiers.find(
    t => payingWeight >= t.minKg && payingWeight <= t.maxKg
  );

  if (!weightTier) {
    return { valid: false, error: `No weight tier found for ${payingWeight} kg` };
  }

  const finalPrice = Math.max(weightTier.price, deptPricing.minimumPrice || 0);

  return {
    valid: true,
    price: finalPrice,
    currency: grid.basePricing?.currency || 'EUR',
    breakdown: {
      realWeight: weight || 0,
      volumetricWeight: dimensions ?
        (dimensions.length * dimensions.width * dimensions.height) / volumetricDivisor : 0,
      payingWeight,
      volumetricDivisor,
      weightTier: `${weightTier.minKg}-${weightTier.maxKg} kg`,
      tierPrice: weightTier.price,
      minimumApplied: finalPrice !== weightTier.price,
      total: finalPrice
    },
    transitDays: deptPricing.transitDays
  };
}

/**
 * Calculer le prix pour un transport donné (dispatch selon type)
 */
function calculatePrice(grid, parameters) {
  const {
    distance,
    weight,
    volume,
    pallets,
    dimensions,
    zoneOrigin,
    zoneDestination,
    departmentOrigin,
    departmentDestination,
    vehicleType,
    options = [],
    isWeekend = false,
    isNight = false,
    isHoliday = false
  } = parameters;

  let result;

  // Dispatcher selon le type de transport
  switch (grid.transportType) {
    case 'LTL':
      result = calculateLTLPrice(grid, parameters);
      break;

    case 'FTL':
      result = calculateFTLPrice(grid, parameters);
      break;

    case 'MESSAGERIE':
      result = calculateMessageriePrice(grid, parameters);
      break;

    default:
      // Fallback vers l'ancien système pour les autres types
      result = calculateLegacyPrice(grid, parameters);
  }

  if (!result.valid) {
    return result;
  }

  // Appliquer les options
  if (options && options.length > 0 && grid.options?.enabledOptions) {
    let subtotal = result.price;
    result.breakdown.options = [];

    options.forEach(optionCode => {
      const optionConfig = pricingOptionsConfig[optionCode];
      if (optionConfig && grid.options.enabledOptions.includes(optionCode)) {
        const customModifier = grid.options.optionsModifiers?.[optionCode];
        const multiplier = customModifier?.multiplier || optionConfig.multiplier;
        const fixedSupplement = customModifier?.fixedSupplement || optionConfig.fixedSupplement;

        const optionCost = (subtotal * (multiplier - 1)) + fixedSupplement;
        result.breakdown.options.push({
          code: optionCode,
          name: optionConfig.name,
          cost: optionCost
        });

        subtotal += optionCost;
      }
    });

    result.price = subtotal;
    result.breakdown.total = subtotal;
  }

  // Appliquer les majorations temporelles
  if (grid.timeModifiers) {
    let timeMultiplier = 1.0;

    if (isWeekend && grid.timeModifiers.weekendMultiplier) {
      timeMultiplier *= grid.timeModifiers.weekendMultiplier;
    }

    if (isNight && grid.timeModifiers.nightMultiplier) {
      timeMultiplier *= grid.timeModifiers.nightMultiplier;
    }

    if (isHoliday && grid.timeModifiers.holidayMultiplier) {
      timeMultiplier *= grid.timeModifiers.holidayMultiplier;
    }

    if (timeMultiplier > 1.0) {
      const timeModifierCost = result.price * (timeMultiplier - 1);
      result.breakdown.timeModifiers = timeModifierCost;
      result.price += timeModifierCost;
      result.breakdown.total = result.price;
    }
  }

  return result;
}

/**
 * Calcul legacy pour rétrocompatibilité
 */
function calculateLegacyPrice(grid, parameters) {
  const { distance, weight, volume, pallets, zoneOrigin, zoneDestination } = parameters;

  if (!grid.basePricing) {
    return { valid: false, error: 'basePricing not configured' };
  }

  let breakdown = {
    base: grid.basePricing.basePrice || 0,
    distance: 0,
    weight: 0,
    volume: 0,
    pallets: 0,
    total: 0
  };

  if (distance && grid.basePricing.pricePerKm) {
    breakdown.distance = distance * grid.basePricing.pricePerKm;
  }

  if (weight && grid.basePricing.pricePerKg) {
    breakdown.weight = weight * grid.basePricing.pricePerKg;
  }

  if (volume && grid.basePricing.pricePerM3) {
    breakdown.volume = volume * grid.basePricing.pricePerM3;
  }

  if (pallets && grid.basePricing.pricePerPallet) {
    breakdown.pallets = pallets * grid.basePricing.pricePerPallet;
  }

  const subtotal = breakdown.base + breakdown.distance + breakdown.weight + breakdown.volume + breakdown.pallets;
  const finalPrice = Math.max(subtotal, grid.basePricing.minimumPrice || 0);

  breakdown.total = finalPrice;
  breakdown.minimumApplied = finalPrice !== subtotal;

  return {
    valid: true,
    price: finalPrice,
    currency: grid.basePricing.currency || 'EUR',
    breakdown
  };
}

/**
 * Valider que les paramètres respectent les conditions de la grille
 */
function validateConditions(grid, parameters) {
  const { distance, weight, volume } = parameters;
  const conditions = grid.conditions;

  if (!conditions) return true;

  if (conditions.minDistance && distance < conditions.minDistance) return false;
  if (conditions.maxDistance && distance > conditions.maxDistance) return false;
  if (conditions.minWeight && weight < conditions.minWeight) return false;
  if (conditions.maxWeight && weight > conditions.maxWeight) return false;
  if (conditions.minVolume && volume < conditions.minVolume) return false;
  if (conditions.maxVolume && volume > conditions.maxVolume) return false;

  return true;
}

/**
 * Vérifier si une grille est active
 */
function isGridActive(grid) {
  if (grid.status !== GridStatus.ACTIVE) {
    return { active: false, reason: `Grid status is ${grid.status}` };
  }

  const now = new Date();

  if (grid.validFrom && new Date(grid.validFrom) > now) {
    return { active: false, reason: 'Grid not yet valid' };
  }

  if (grid.validUntil && new Date(grid.validUntil) < now) {
    return { active: false, reason: 'Grid has expired' };
  }

  return { active: true };
}

/**
 * Trouver les grilles applicables pour un transport
 */
function findApplicableGrids(allGrids, parameters) {
  return allGrids.filter(grid => {
    const activeCheck = isGridActive(grid);
    if (!activeCheck.active) return false;

    if (parameters.transportType && grid.transportType !== parameters.transportType) {
      return false;
    }

    if (!validateConditions(grid, parameters)) {
      return false;
    }

    return true;
  });
}

/**
 * Générer un ID unique pour une grille
 */
function generateGridId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `GRID-${timestamp}-${random}`;
}

/**
 * Trouver la zone à partir d'un département
 */
function getZoneFromDepartment(departmentCode) {
  for (const [zoneCode, zone] of Object.entries(GeographicZones)) {
    if (zone.departments && zone.departments.includes(departmentCode)) {
      return zoneCode;
    }
  }
  return null;
}

/**
 * Valider un fichier Excel importé et le convertir en grilles
 */
function validateExcelImport(data, gridType) {
  const errors = [];
  const validRows = [];

  data.forEach((row, index) => {
    const rowNum = index + 2; // +2 car header + 0-indexed

    switch (gridType) {
      case 'LTL':
        if (!row.zoneOrigin || !row.zoneDestination) {
          errors.push(`Ligne ${rowNum}: zoneOrigin et zoneDestination requis`);
        } else {
          validRows.push(row);
        }
        break;

      case 'FTL':
        if (!row.zoneOrigin || !row.zoneDestination) {
          errors.push(`Ligne ${rowNum}: zoneOrigin et zoneDestination requis`);
        } else if (!row.flatRate && !row.pricePerKm) {
          errors.push(`Ligne ${rowNum}: flatRate ou pricePerKm requis`);
        } else {
          validRows.push(row);
        }
        break;

      case 'MESSAGERIE':
        if (!row.departmentOrigin || !row.departmentDestination) {
          errors.push(`Ligne ${rowNum}: departmentOrigin et departmentDestination requis`);
        } else {
          validRows.push(row);
        }
        break;

      default:
        errors.push(`Type de grille inconnu: ${gridType}`);
    }
  });

  return { valid: errors.length === 0, errors, rows: validRows };
}

module.exports = {
  TransportTypes,
  PricingCalculationTypes,
  GridStatus,
  GeographicZones,
  FrenchDepartments,
  pricingOptionsConfig,
  pricingGridSchema,
  LTLPricingStructure,
  FTLPricingStructure,
  MessagingPricingStructure,
  calculatePrice,
  calculateLTLPrice,
  calculateFTLPrice,
  calculateMessageriePrice,
  calculatePayingWeight,
  validateConditions,
  isGridActive,
  findApplicableGrids,
  generateGridId,
  getZoneFromDepartment,
  validateExcelImport
};
