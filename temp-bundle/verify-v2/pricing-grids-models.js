// Pricing Grids Models - Grilles tarifaires transporteurs par industriel
// RT Backend Services - Version 1.0.0

// Types de transport supportés
const TransportTypes = {
  FTL: 'FTL',                           // Full Truck Load
  LTL: 'LTL',                           // Less Than Truck Load
  ADR: 'ADR',                           // Matières dangereuses
  FRIGO: 'FRIGO',                       // Température contrôlée
  HAYON: 'HAYON',                       // Avec hayon
  MESSAGERIE: 'MESSAGERIE',             // Messagerie
  EXPRESS: 'EXPRESS',                   // Express
  PALETTE: 'PALETTE',                   // Transport de palettes
  VRAC: 'VRAC',                         // Transport en vrac
  BENNE: 'BENNE'                        // Transport benne
};

// Types de calcul tarifaire
const PricingCalculationTypes = {
  PER_KM: 'PER_KM',                     // Prix au kilomètre
  FLAT_RATE: 'FLAT_RATE',               // Prix forfaitaire
  PER_WEIGHT: 'PER_WEIGHT',             // Prix au poids
  PER_VOLUME: 'PER_VOLUME',             // Prix au volume
  PER_PALLET: 'PER_PALLET',             // Prix à la palette
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

// Zones géographiques prédéfinies
const GeographicZones = {
  // France métropolitaine par région
  IDF: { code: 'IDF', name: 'Île-de-France', country: 'FR' },
  ARA: { code: 'ARA', name: 'Auvergne-Rhône-Alpes', country: 'FR' },
  BFC: { code: 'BFC', name: 'Bourgogne-Franche-Comté', country: 'FR' },
  BRE: { code: 'BRE', name: 'Bretagne', country: 'FR' },
  CVL: { code: 'CVL', name: 'Centre-Val de Loire', country: 'FR' },
  GES: { code: 'GES', name: 'Grand Est', country: 'FR' },
  HDF: { code: 'HDF', name: 'Hauts-de-France', country: 'FR' },
  NOR: { code: 'NOR', name: 'Normandie', country: 'FR' },
  NAQ: { code: 'NAQ', name: 'Nouvelle-Aquitaine', country: 'FR' },
  OCC: { code: 'OCC', name: 'Occitanie', country: 'FR' },
  PDL: { code: 'PDL', name: 'Pays de la Loire', country: 'FR' },
  PAC: { code: 'PAC', name: "Provence-Alpes-Côte d'Azur", country: 'FR' },
  COR: { code: 'COR', name: 'Corse', country: 'FR' },

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

// Schema d'une grille tarifaire
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

  // Tarifs de base
  basePricing: {
    basePrice: { type: 'number', required: true }, // Prix de base
    pricePerKm: { type: 'number', required: false }, // Prix au km
    pricePerKg: { type: 'number', required: false }, // Prix au kg
    pricePerM3: { type: 'number', required: false }, // Prix au m³
    pricePerPallet: { type: 'number', required: false }, // Prix à la palette
    minimumPrice: { type: 'number', required: true }, // Prix minimum
    currency: { type: 'string', required: true, default: 'EUR' }
  },

  // Zones et tarifs par zone
  zonesPricing: [{
    zoneOriginCode: 'string', // Code zone origine (ex: 'IDF')
    zoneDestinationCode: 'string', // Code zone destination (ex: 'ARA')
    basePrice: 'number',
    pricePerKm: 'number',
    pricePerKg: 'number',
    pricePerM3: 'number',
    minimumPrice: 'number',
    estimatedDistanceKm: 'number',
    estimatedDurationHours: 'number'
  }],

  // Paliers de poids/volume
  weightTiers: [{
    minWeight: 'number', // kg
    maxWeight: 'number', // kg
    pricePerKg: 'number',
    fixedPrice: 'number'
  }],

  volumeTiers: [{
    minVolume: 'number', // m³
    maxVolume: 'number', // m³
    pricePerM3: 'number',
    fixedPrice: 'number'
  }],

  // Options et suppléments
  options: {
    enabledOptions: ['string'], // Liste des options activées
    optionsModifiers: {} // Modificateurs personnalisés par option
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
    minDistance: 'number', // Distance minimale (km)
    maxDistance: 'number', // Distance maximale (km)
    minWeight: 'number', // Poids minimum (kg)
    maxWeight: 'number', // Poids maximum (kg)
    minVolume: 'number', // Volume minimum (m³)
    maxVolume: 'number', // Volume maximum (m³)
    vehicleTypes: ['string'], // Types de véhicules acceptés
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

/**
 * Calculer le prix pour un transport donné
 */
function calculatePrice(grid, parameters) {
  const {
    distance,
    weight,
    volume,
    pallets,
    zoneOrigin,
    zoneDestination,
    options = [],
    isWeekend = false,
    isNight = false,
    isHoliday = false
  } = parameters;

  // Vérifier les conditions d'application
  if (!validateConditions(grid, parameters)) {
    return {
      valid: false,
      errors: ['Transport parameters do not meet grid conditions'],
      price: null
    };
  }

  let basePrice = 0;
  let breakdown = {
    base: 0,
    distance: 0,
    weight: 0,
    volume: 0,
    pallets: 0,
    options: [],
    timeModifiers: 0,
    total: 0
  };

  // Chercher le prix pour la zone spécifique
  const zonePricing = grid.zonesPricing.find(
    z => z.zoneOriginCode === zoneOrigin && z.zoneDestinationCode === zoneDestination
  );

  if (zonePricing) {
    // Utiliser le prix de la zone
    breakdown.base = zonePricing.basePrice || grid.basePricing.basePrice;
    if (distance && zonePricing.pricePerKm) {
      breakdown.distance = distance * zonePricing.pricePerKm;
    }
    if (weight && zonePricing.pricePerKg) {
      breakdown.weight = weight * zonePricing.pricePerKg;
    }
    if (volume && zonePricing.pricePerM3) {
      breakdown.volume = volume * zonePricing.pricePerM3;
    }
  } else {
    // Utiliser le prix de base
    breakdown.base = grid.basePricing.basePrice;

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
  }

  // Appliquer les paliers de poids si configurés
  if (weight && grid.weightTiers && grid.weightTiers.length > 0) {
    const tier = grid.weightTiers.find(t => weight >= t.minWeight && weight <= t.maxWeight);
    if (tier) {
      breakdown.weight = tier.fixedPrice || (weight * tier.pricePerKg);
    }
  }

  // Appliquer les paliers de volume si configurés
  if (volume && grid.volumeTiers && grid.volumeTiers.length > 0) {
    const tier = grid.volumeTiers.find(t => volume >= t.minVolume && volume <= t.maxVolume);
    if (tier) {
      breakdown.volume = tier.fixedPrice || (volume * tier.pricePerM3);
    }
  }

  // Calculer le sous-total avant options
  let subtotal = breakdown.base + breakdown.distance + breakdown.weight + breakdown.volume + breakdown.pallets;

  // Appliquer les options
  if (options && options.length > 0) {
    options.forEach(optionCode => {
      const optionConfig = pricingOptionsConfig[optionCode];
      if (optionConfig && grid.options.enabledOptions.includes(optionCode)) {
        // Vérifier si un modificateur personnalisé existe
        const customModifier = grid.options.optionsModifiers?.[optionCode];
        const multiplier = customModifier?.multiplier || optionConfig.multiplier;
        const fixedSupplement = customModifier?.fixedSupplement || optionConfig.fixedSupplement;

        const optionCost = (subtotal * (multiplier - 1)) + fixedSupplement;
        breakdown.options.push({
          code: optionCode,
          name: optionConfig.name,
          cost: optionCost
        });

        subtotal += optionCost;
      }
    });
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
      breakdown.timeModifiers = subtotal * (timeMultiplier - 1);
      subtotal += breakdown.timeModifiers;
    }
  }

  // Appliquer le prix minimum
  const minimumPrice = zonePricing?.minimumPrice || grid.basePricing.minimumPrice;
  const finalPrice = Math.max(subtotal, minimumPrice);

  breakdown.total = finalPrice;

  return {
    valid: true,
    price: finalPrice,
    currency: grid.basePricing.currency,
    breakdown,
    minimumApplied: finalPrice === minimumPrice && subtotal < minimumPrice
  };
}

/**
 * Valider que les paramètres respectent les conditions de la grille
 */
function validateConditions(grid, parameters) {
  const { distance, weight, volume } = parameters;
  const conditions = grid.conditions;

  if (!conditions) return true;

  // Vérifier distance
  if (conditions.minDistance && distance < conditions.minDistance) return false;
  if (conditions.maxDistance && distance > conditions.maxDistance) return false;

  // Vérifier poids
  if (conditions.minWeight && weight < conditions.minWeight) return false;
  if (conditions.maxWeight && weight > conditions.maxWeight) return false;

  // Vérifier volume
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
    // Vérifier que la grille est active
    const activeCheck = isGridActive(grid);
    if (!activeCheck.active) return false;

    // Vérifier le type de transport
    if (parameters.transportType && grid.transportType !== parameters.transportType) {
      return false;
    }

    // Vérifier les conditions
    if (!validateConditions(grid, parameters)) {
      return false;
    }

    // Vérifier que la zone est couverte si spécifiée
    if (parameters.zoneOrigin && parameters.zoneDestination) {
      const hasZonePricing = grid.zonesPricing.some(
        z => z.zoneOriginCode === parameters.zoneOrigin &&
             z.zoneDestinationCode === parameters.zoneDestination
      );
      // Si pas de pricing zone spécifique, la grille de base s'applique
      return true;
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

module.exports = {
  TransportTypes,
  PricingCalculationTypes,
  GridStatus,
  GeographicZones,
  pricingOptionsConfig,
  pricingGridSchema,
  calculatePrice,
  validateConditions,
  isGridActive,
  findApplicableGrids,
  generateGridId
};
