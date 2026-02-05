/**
 * Vehicle Data Lake Sync Service
 *
 * Synchronise les données véhicules depuis:
 * - Dashdoc Data Lake (données de base)
 * - Vehizen (kilométrage réel, positions, alertes)
 *
 * Stratégie de sync:
 * - Incrémental: toutes les 5 minutes (kilométrage Vehizen)
 * - Périodique: toutes les 30 minutes (fusion Dashdoc + Vehizen)
 * - Full: toutes les 6 heures (réconciliation complète)
 */

const mongoose = require('mongoose');
const { createVechizenConnector } = require('../../connectors/vehizen.connector');
const {
  Vehicle,
  VehicleMileage,
  VehicleInspection,
} = require('../../models/vehicles-datalake');

// Import des modèles Dashdoc Data Lake
let DashdocVehicle, DashdocTrailer;
try {
  DashdocVehicle = require('../../models/dashdoc-datalake/DashdocVehicle.model');
  DashdocTrailer = require('../../models/dashdoc-datalake/DashdocTrailer.model');
} catch (e) {
  console.log('[VEHICLES-DATALAKE] Modèles Dashdoc non disponibles');
}

// Import des modèles DKV Data Lake (backup source)
let DkvVehicle;
try {
  DkvVehicle = require('../../models/dkv-datalake/DkvVehicle.model');
  console.log('[VEHICLES-DATALAKE] Modèle DkvVehicle disponible');
} catch (e) {
  console.log('[VEHICLES-DATALAKE] Modèle DKV non disponible');
}

// ===============================================================
// Vehizen Data Lake - SOURCE PRIMAIRE
// Collection: vehizenvehicles dans base rt-orders (api-orders)
// Nécessite ORDERS_MONGODB_URI pour se connecter à cette base
// ===============================================================
const vechizenVehicleSchema = new mongoose.Schema({
  vehicleId: String,
  vin: String,
  registration: String,        // = licensePlate
  carrierId: String,           // = organizationId
  brand: String,
  model: String,
  type: String,
  fuelType: String,
  year: Number,
  status: String,
  lastPosition: {
    latitude: Number,
    longitude: Number,
    timestamp: Date,
    speed: Number,
    heading: Number,
  },
  odometer: Number,
  telemetry: mongoose.Schema.Types.Mixed,
  _rawData: mongoose.Schema.Types.Mixed,
  createdAt: Date,
  updatedAt: Date,
}, { collection: 'vehizenvehicles', strict: false });

// Connexion secondaire vers la base rt-orders (api-orders)
let ordersConnection = null;
let VechizenVehicleDL = null;

async function initOrdersConnection() {
  const ORDERS_MONGODB_URI = process.env.ORDERS_MONGODB_URI;
  if (!ORDERS_MONGODB_URI) {
    console.log('[VEHICLES-DATALAKE] ORDERS_MONGODB_URI not configured, Vehizen Data Lake disabled');
    return null;
  }

  try {
    if (ordersConnection && ordersConnection.readyState === 1) {
      return ordersConnection;
    }

    console.log('[VEHICLES-DATALAKE] Connecting to rt-orders database for Vehizen Data Lake...');
    ordersConnection = mongoose.createConnection(ORDERS_MONGODB_URI);

    ordersConnection.on('connected', () => {
      console.log('[VEHICLES-DATALAKE] Connected to rt-orders database (Vehizen Data Lake)');
    });

    ordersConnection.on('error', (err) => {
      console.error('[VEHICLES-DATALAKE] rt-orders connection error:', err.message);
    });

    // Créer le modèle sur cette connexion
    VechizenVehicleDL = ordersConnection.model('VechizenVehicle', vechizenVehicleSchema);
    console.log('[VEHICLES-DATALAKE] Modèle VechizenVehicleDL disponible (source PRIMAIRE)');

    return ordersConnection;
  } catch (e) {
    console.error('[VEHICLES-DATALAKE] Failed to connect to rt-orders:', e.message);
    return null;
  }
}

// Initialize connection at module load
initOrdersConnection();

class VehicleDatalakeSyncService {
  constructor() {
    this.syncIntervals = {
      incremental: 5 * 60 * 1000,   // 5 minutes
      periodic: 30 * 60 * 1000,      // 30 minutes
      full: 6 * 60 * 60 * 1000,      // 6 heures
    };

    this.connectors = new Map(); // organizationId -> VechizenConnector
    this.isRunning = false;
    this.timers = {};
    this.stats = {
      lastIncrementalSync: null,
      lastPeriodicSync: null,
      lastFullSync: null,
      syncErrors: [],
      vehiclesSynced: 0,
      mileageRecords: 0,
    };
  }

  /**
   * Initialise le service de sync
   */
  async initialize(connections) {
    console.log('[VEHICLES-DATALAKE] Initialisation du service de sync...');

    // Créer les connecteurs Vehizen pour chaque organisation
    for (const connection of connections) {
      if (connection.provider === 'vehizen' && connection.isActive) {
        try {
          const connector = createVechizenConnector(connection);
          const testResult = await connector.testConnection();

          if (testResult.success) {
            this.connectors.set(connection.organizationId, connector);
            console.log(`[VEHICLES-DATALAKE] Connecteur Vehizen actif pour ${connection.organizationId}`);
          } else {
            console.error(`[VEHICLES-DATALAKE] Erreur connexion Vehizen ${connection.organizationId}:`, testResult.message);
          }
        } catch (error) {
          console.error(`[VEHICLES-DATALAKE] Erreur création connecteur Vehizen:`, error.message);
        }
      }
    }

    // Créer les index MongoDB
    await this.ensureIndexes();

    console.log(`[VEHICLES-DATALAKE] Service initialisé avec ${this.connectors.size} connecteur(s) Vehizen`);
  }

  /**
   * Démarre les syncs périodiques
   */
  start() {
    if (this.isRunning) {
      console.log('[VEHICLES-DATALAKE] Service déjà démarré');
      return;
    }

    this.isRunning = true;
    console.log('[VEHICLES-DATALAKE] Démarrage des syncs périodiques');

    // Sync incrémentale (kilométrage) toutes les 5 min
    this.timers.incremental = setInterval(
      () => this.runIncrementalSync(),
      this.syncIntervals.incremental
    );

    // Sync périodique (fusion) toutes les 30 min
    this.timers.periodic = setInterval(
      () => this.runPeriodicSync(),
      this.syncIntervals.periodic
    );

    // Sync full toutes les 6h
    this.timers.full = setInterval(
      () => this.runFullSync(),
      this.syncIntervals.full
    );

    // Lancer une sync initiale
    this.runPeriodicSync();
  }

  /**
   * Arrête les syncs
   */
  stop() {
    this.isRunning = false;
    Object.values(this.timers).forEach(timer => clearInterval(timer));
    this.timers = {};
    console.log('[VEHICLES-DATALAKE] Service arrêté');
  }

  /**
   * Sync incrémentale: kilométrage Vehizen uniquement
   */
  async runIncrementalSync() {
    console.log('[VEHICLES-DATALAKE] Démarrage sync incrémentale (kilométrage)...');
    const startTime = Date.now();

    try {
      for (const [organizationId, connector] of this.connectors) {
        await this.syncMileageForOrganization(organizationId, connector);
      }

      this.stats.lastIncrementalSync = new Date();
      console.log(`[VEHICLES-DATALAKE] Sync incrémentale terminée en ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error('[VEHICLES-DATALAKE] Erreur sync incrémentale:', error.message);
      this.stats.syncErrors.push({ type: 'incremental', error: error.message, at: new Date() });
    }
  }

  /**
   * Sync périodique: fusion Dashdoc + Vehizen
   */
  async runPeriodicSync() {
    console.log('[VEHICLES-DATALAKE] Démarrage sync périodique (fusion)...');
    const startTime = Date.now();

    try {
      // Récupérer toutes les organisations actives
      const organizations = await this.getActiveOrganizations();

      for (const orgId of organizations) {
        await this.syncVehiclesForOrganization(orgId);
      }

      this.stats.lastPeriodicSync = new Date();
      console.log(`[VEHICLES-DATALAKE] Sync périodique terminée en ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error('[VEHICLES-DATALAKE] Erreur sync périodique:', error.message);
      this.stats.syncErrors.push({ type: 'periodic', error: error.message, at: new Date() });
    }
  }

  /**
   * Sync complète: réconciliation totale
   */
  async runFullSync() {
    console.log('[VEHICLES-DATALAKE] Démarrage sync complète (réconciliation)...');
    const startTime = Date.now();

    try {
      const organizations = await this.getActiveOrganizations();

      for (const orgId of organizations) {
        // 1. Sync véhicules
        await this.syncVehiclesForOrganization(orgId, { fullSync: true });

        // 2. Vérifier les véhicules orphelins
        await this.cleanupOrphanVehicles(orgId);

        // 3. Recalculer les statistiques
        await this.recalculateVehicleStats(orgId);
      }

      this.stats.lastFullSync = new Date();
      console.log(`[VEHICLES-DATALAKE] Sync complète terminée en ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error('[VEHICLES-DATALAKE] Erreur sync complète:', error.message);
      this.stats.syncErrors.push({ type: 'full', error: error.message, at: new Date() });
    }
  }

  /**
   * Sync des véhicules pour une organisation
   * Sources prioritaires: 1. VEHIZEN DATA LAKE (primaire), 2. DKV Data Lake, 3. Dashdoc Data Lake, 4. Vehizen API
   * Utilise l'immatriculation comme clé unique pour éviter les doublons
   */
  async syncVehiclesForOrganization(organizationId, options = {}) {
    console.log(`[VEHICLES-DATALAKE] Sync véhicules pour ${organizationId}`);

    // 1. VEHIZEN DATA LAKE - SOURCE PRIMAIRE (collection vehizenvehicles)
    const vechizenDatalakeVehicles = await this.getVechizenDataLakeVehicles(organizationId);
    console.log(`[VEHICLES-DATALAKE] Vehizen Data Lake (PRIMAIRE): ${vechizenDatalakeVehicles.length} véhicules`);

    // 2. Récupérer véhicules depuis DKV Data Lake (backup)
    const dkvVehicles = await this.getDkvVehicles(organizationId);
    console.log(`[VEHICLES-DATALAKE] DKV: ${dkvVehicles.length} véhicules`);

    // 3. Récupérer véhicules depuis Dashdoc Data Lake
    const dashdocVehicles = await this.getDashdocVehicles(organizationId);
    const dashdocTrailers = await this.getDashdocTrailers(organizationId);
    console.log(`[VEHICLES-DATALAKE] Dashdoc: ${dashdocVehicles.length} véhicules, ${dashdocTrailers.length} remorques`);

    // 4. Récupérer véhicules depuis Vehizen API (si connecteur disponible et pas de données Data Lake)
    const connector = this.connectors.get(organizationId);
    let vechizenApiVehicles = [];
    if (connector && vechizenDatalakeVehicles.length === 0) {
      try {
        const result = await connector.getVehicles();
        vechizenApiVehicles = result.vehicles.map(v => connector.transformVehicle(v));
        console.log(`[VEHICLES-DATALAKE] Vehizen API (fallback): ${vechizenApiVehicles.length} véhicules`);
      } catch (error) {
        console.error(`[VEHICLES-DATALAKE] Erreur récupération Vehizen API:`, error.message);
      }
    }

    // 5. Fusionner les données (utilise licensePlate comme clé unique)
    // Priorité: Vehizen Data Lake > DKV > Dashdoc > Vehizen API
    const mergedVehicles = this.mergeVehicleData(dashdocVehicles, dashdocTrailers, vechizenApiVehicles, dkvVehicles, vechizenDatalakeVehicles);
    console.log(`[VEHICLES-DATALAKE] Total après fusion: ${mergedVehicles.length} véhicules uniques`);

    // 5. Sauvegarder en base
    let syncCount = 0;
    for (const vehicleData of mergedVehicles) {
      try {
        await this.upsertVehicle(organizationId, vehicleData);
        syncCount++;
      } catch (error) {
        console.error(`[VEHICLES-DATALAKE] Erreur sauvegarde véhicule ${vehicleData.licensePlate}:`, error.message);
      }
    }

    this.stats.vehiclesSynced += syncCount;
    console.log(`[VEHICLES-DATALAKE] ${syncCount} véhicules synchronisés pour ${organizationId}`);
  }

  /**
   * Sync du kilométrage pour une organisation
   */
  async syncMileageForOrganization(organizationId, connector) {
    try {
      // Récupérer tous les kilométrages en batch
      const mileageData = await connector.getAllVehiclesMileage();

      for (const record of mileageData) {
        // Trouver le véhicule correspondant
        const vehicle = await Vehicle.findOne({
          organizationId,
          $or: [
            { vechizenId: record.vehicleId },
            { licensePlate: record.licensePlate?.replace(/[^A-Z0-9]/gi, '').toUpperCase() },
          ],
        });

        if (!vehicle) continue;

        // Vérifier si le kilométrage a changé
        if (vehicle.currentMileage !== record.mileage) {
          // Enregistrer dans l'historique
          await VehicleMileage.create({
            vehicleId: vehicle._id,
            licensePlate: vehicle.licensePlate,
            mileage: record.mileage,
            previousMileage: vehicle.currentMileage,
            source: 'vehizen',
            recordedAt: record.recordedAt ? new Date(record.recordedAt) : new Date(),
            organizationId,
          });

          // Mettre à jour le véhicule
          vehicle.currentMileage = record.mileage;
          vehicle.mileageUpdatedAt = new Date();
          vehicle.mileageSource = 'vehizen';
          await vehicle.save();

          this.stats.mileageRecords++;
        }
      }
    } catch (error) {
      console.error(`[VEHICLES-DATALAKE] Erreur sync kilométrage ${organizationId}:`, error.message);
    }
  }

  /**
   * Récupère les véhicules Dashdoc
   */
  async getDashdocVehicles(organizationId) {
    if (!DashdocVehicle) return [];

    try {
      const vehicles = await DashdocVehicle.find({ organizationId }).lean();
      return vehicles.map(v => ({
        source: 'dashdoc',
        dashdocPk: v.dashdocPk,
        licensePlate: v.licensePlate || v._rawData?.license_plate,
        brand: v._rawData?.brand,
        model: v._rawData?.model,
        vehicleType: this.mapDashdocVehicleType(v._rawData?.vehicle_type),
        vin: v._rawData?.vin,
        isActive: true,
        _dashdocRawData: v._rawData,
      }));
    } catch (error) {
      console.error('[VEHICLES-DATALAKE] Erreur lecture véhicules Dashdoc:', error.message);
      return [];
    }
  }

  /**
   * Récupère les remorques Dashdoc
   */
  async getDashdocTrailers(organizationId) {
    if (!DashdocTrailer) return [];

    try {
      const trailers = await DashdocTrailer.find({ organizationId }).lean();
      return trailers.map(t => ({
        source: 'dashdoc',
        dashdocPk: t.dashdocPk,
        licensePlate: t.licensePlate || t._rawData?.license_plate,
        vehicleType: 'trailer',
        trailerType: t._rawData?.trailer_type,
        isActive: true,
        _dashdocRawData: t._rawData,
      }));
    } catch (error) {
      console.error('[VEHICLES-DATALAKE] Erreur lecture remorques Dashdoc:', error.message);
      return [];
    }
  }

  /**
   * Récupère les véhicules DKV Data Lake (backup source)
   * Utilise l'immatriculation comme clé unique pour éviter les doublons
   */
  async getDkvVehicles(organizationId) {
    if (!DkvVehicle) return [];

    try {
      const vehicles = await DkvVehicle.find({ organizationId }).lean();
      console.log(`[VEHICLES-DATALAKE] ${vehicles.length} véhicules trouvés dans DKV Data Lake pour ${organizationId}`);

      return vehicles.map(v => ({
        source: 'dkv',
        licensePlate: v.licensePlate?.replace(/[^A-Z0-9]/gi, '').toUpperCase(),
        vin: v.vin,
        brand: v.brand,
        model: v.model,
        vehicleType: this.mapDkvVehicleType(v.type),
        fuelType: v.fuelType,
        year: v.year,
        tankCapacity: v.tankCapacity,
        tollBoxId: v.tollBoxId,
        emissionClass: v.emissionClass,
        axleCount: v.axleCount,
        currentMileage: v.stats?.lastOdometer,
        isActive: true,
        _dkvRawData: v._rawData,
      }));
    } catch (error) {
      console.error('[VEHICLES-DATALAKE] Erreur lecture véhicules DKV:', error.message);
      return [];
    }
  }

  /**
   * Map le type de véhicule DKV vers notre format
   */
  mapDkvVehicleType(type) {
    const mapping = {
      'truck': 'truck',
      'van': 'van',
      'car': 'car',
      'trailer': 'trailer',
      'bus': 'other',
      'other': 'other',
    };
    return mapping[type?.toLowerCase()] || 'truck';
  }

  /**
   * Récupère les véhicules depuis Vehizen Data Lake (SOURCE PRIMAIRE)
   * Collection: vehizenvehicles dans base rt-orders (via ORDERS_MONGODB_URI)
   * Utilise carrierId comme organizationId
   */
  async getVechizenDataLakeVehicles(organizationId) {
    // Ensure connection is initialized
    if (!VechizenVehicleDL) {
      await initOrdersConnection();
    }

    if (!VechizenVehicleDL) {
      console.log('[VEHICLES-DATALAKE] VechizenVehicleDL model not available (ORDERS_MONGODB_URI not configured?)');
      return [];
    }

    try {
      // Dans vehizen datalake, carrierId = organizationId
      const vehicles = await VechizenVehicleDL.find({ carrierId: organizationId }).lean();
      console.log(`[VEHICLES-DATALAKE] ${vehicles.length} véhicules trouvés dans Vehizen Data Lake pour ${organizationId}`);

      return vehicles.map(v => ({
        source: 'vehizen_datalake',
        vechizenId: v.vehicleId,
        licensePlate: v.registration?.replace(/[^A-Z0-9]/gi, '').toUpperCase(),
        vin: v.vin,
        brand: v.brand,
        model: v.model,
        vehicleType: this.mapVechizenVehicleType(v.type),
        fuelType: v.fuelType,
        year: v.year,
        currentMileage: v.odometer,
        lastPosition: v.lastPosition ? {
          lat: v.lastPosition.latitude,
          lng: v.lastPosition.longitude,
          timestamp: v.lastPosition.timestamp,
          speed: v.lastPosition.speed,
          heading: v.lastPosition.heading,
        } : null,
        isActive: v.status === 'active',
        _vechizenDatalakeRawData: v._rawData,
      }));
    } catch (error) {
      console.error('[VEHICLES-DATALAKE] Erreur lecture véhicules Vehizen Data Lake:', error.message);
      return [];
    }
  }

  /**
   * Map le type de véhicule Vehizen vers notre format
   */
  mapVechizenVehicleType(type) {
    const mapping = {
      'truck': 'truck',
      'van': 'van',
      'car': 'car',
      'trailer': 'trailer',
      'tractor': 'tractor',
      'semi': 'semi_trailer',
      'other': 'other',
    };
    return mapping[type?.toLowerCase()] || 'truck';
  }

  /**
   * Fusionne les données des différentes sources
   * Utilise l'immatriculation (licensePlate) comme clé unique pour éviter les doublons
   * Priorité: VEHIZEN DATA LAKE > DKV > Vehizen API > Dashdoc
   * (les données plus prioritaires écrasent/enrichissent les autres)
   */
  mergeVehicleData(dashdocVehicles, dashdocTrailers, vechizenApiVehicles, dkvVehicles = [], vechizenDatalakeVehicles = []) {
    const vehicleMap = new Map();

    // 1. Ajouter véhicules Dashdoc (base - priorité la plus basse)
    for (const v of dashdocVehicles) {
      const key = v.licensePlate?.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (key) {
        vehicleMap.set(key, {
          ...v,
          licensePlate: key,
          dataSources: ['dashdoc'],
        });
      }
    }

    // 2. Ajouter remorques Dashdoc
    for (const t of dashdocTrailers) {
      const key = t.licensePlate?.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (key) {
        vehicleMap.set(key, {
          ...t,
          licensePlate: key,
          dataSources: ['dashdoc'],
        });
      }
    }

    // 3. Fusionner données Vehizen API (fallback)
    for (const v of vechizenApiVehicles) {
      const key = v.licensePlate;
      if (!key) continue;

      if (vehicleMap.has(key)) {
        const existing = vehicleMap.get(key);
        vehicleMap.set(key, {
          ...existing,
          vechizenId: v.vechizenId,
          currentMileage: v.currentMileage || existing.currentMileage,
          mileageUpdatedAt: v.mileageUpdatedAt,
          lastPosition: v.lastPosition,
          equipment: { ...existing.equipment, ...v.equipment },
          _vechizenRawData: v._vechizenRawData,
          dataSources: [...existing.dataSources, 'vehizen_api'],
        });
      } else {
        vehicleMap.set(key, {
          ...v,
          dataSources: ['vehizen_api'],
        });
      }
    }

    // 4. Fusionner données DKV Data Lake
    for (const v of dkvVehicles) {
      const key = v.licensePlate;
      if (!key) continue;

      if (vehicleMap.has(key)) {
        const existing = vehicleMap.get(key);
        vehicleMap.set(key, {
          ...existing,
          tollBoxId: v.tollBoxId || existing.tollBoxId,
          emissionClass: v.emissionClass || existing.emissionClass,
          axleCount: v.axleCount || existing.axleCount,
          tankCapacity: v.tankCapacity || existing.tankCapacity,
          fuelType: v.fuelType || existing.fuelType,
          currentMileage: v.currentMileage || existing.currentMileage,
          _dkvRawData: v._dkvRawData,
          dataSources: [...existing.dataSources, 'dkv'],
        });
      } else {
        vehicleMap.set(key, {
          ...v,
          dataSources: ['dkv'],
        });
      }
    }

    // 5. VEHIZEN DATA LAKE - SOURCE PRIMAIRE (priorité la plus haute)
    // Écrase/enrichit toutes les autres sources
    for (const v of vechizenDatalakeVehicles) {
      const key = v.licensePlate;
      if (!key) continue;

      if (vehicleMap.has(key)) {
        const existing = vehicleMap.get(key);
        vehicleMap.set(key, {
          ...existing,
          // Vehizen Data Lake a la priorité absolue pour ces champs
          vechizenId: v.vechizenId || existing.vechizenId,
          brand: v.brand || existing.brand,
          model: v.model || existing.model,
          vehicleType: v.vehicleType || existing.vehicleType,
          vin: v.vin || existing.vin,
          fuelType: v.fuelType || existing.fuelType,
          year: v.year || existing.year,
          currentMileage: v.currentMileage || existing.currentMileage,
          lastPosition: v.lastPosition || existing.lastPosition,
          isActive: v.isActive,
          _vechizenDatalakeRawData: v._vechizenDatalakeRawData,
          dataSources: [...existing.dataSources.filter(s => s !== 'vehizen_datalake'), 'vehizen_datalake'],
        });
      } else {
        // Nouveau véhicule depuis Vehizen Data Lake
        vehicleMap.set(key, {
          ...v,
          dataSources: ['vehizen_datalake'],
        });
      }
    }

    return Array.from(vehicleMap.values());
  }

  /**
   * Insert ou met à jour un véhicule
   */
  async upsertVehicle(organizationId, vehicleData) {
    const filter = {
      organizationId,
      licensePlate: vehicleData.licensePlate,
    };

    const update = {
      $set: {
        // Identification
        licensePlate: vehicleData.licensePlate,
        vin: vehicleData.vin,
        brand: vehicleData.brand,
        model: vehicleData.model,
        vehicleType: vehicleData.vehicleType,
        year: vehicleData.year,

        // IDs externes
        dashdocPk: vehicleData.dashdocPk,
        vechizenId: vehicleData.vechizenId,

        // DKV specific fields
        tollBoxId: vehicleData.tollBoxId,
        emissionClass: vehicleData.emissionClass,
        axleCount: vehicleData.axleCount,
        tankCapacity: vehicleData.tankCapacity,
        fuelType: vehicleData.fuelType,

        // Kilométrage
        currentMileage: vehicleData.currentMileage,
        mileageUpdatedAt: vehicleData.mileageUpdatedAt,
        mileageSource: this.determineMileageSource(vehicleData),

        // Position
        lastPosition: vehicleData.lastPosition,

        // Équipements
        equipment: vehicleData.equipment,

        // Sources
        dataSources: vehicleData.dataSources,

        // Données brutes
        '_rawData.dashdoc': vehicleData._dashdocRawData,
        '_rawData.vehizen': vehicleData._vechizenRawData,
        '_rawData.vehizen_datalake': vehicleData._vechizenDatalakeRawData,
        '_rawData.dkv': vehicleData._dkvRawData,

        // Statut
        status: vehicleData.isActive ? 'active' : 'inactive',

        // Métadonnées
        organizationId,
        syncedAt: new Date(),
      },
    };

    const options = { upsert: true, new: true };
    return Vehicle.findOneAndUpdate(filter, update, options);
  }

  /**
   * Détermine la source du kilométrage (priorité: Vehizen Data Lake > DKV > Vehizen API > Dashdoc)
   */
  determineMileageSource(vehicleData) {
    if (!vehicleData.currentMileage) return null;
    if (vehicleData.dataSources?.includes('vehizen_datalake')) return 'vehizen_datalake';
    if (vehicleData.dataSources?.includes('dkv')) return 'dkv';
    if (vehicleData.dataSources?.includes('vehizen_api')) return 'vehizen';
    if (vehicleData.vechizenId) return 'vehizen';
    if (vehicleData.dashdocPk) return 'dashdoc';
    return 'manual';
  }

  /**
   * Nettoie les véhicules orphelins
   */
  async cleanupOrphanVehicles(organizationId) {
    // Marquer comme inactifs les véhicules non syncés depuis 7 jours
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);

    await Vehicle.updateMany(
      {
        organizationId,
        syncedAt: { $lt: cutoffDate },
        status: 'active',
      },
      {
        $set: { status: 'inactive' },
      }
    );
  }

  /**
   * Recalcule les statistiques des véhicules
   */
  async recalculateVehicleStats(organizationId) {
    const vehicles = await Vehicle.find({ organizationId, status: 'active' });

    for (const vehicle of vehicles) {
      try {
        // Calculer les km totaux sur les 12 derniers mois
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const mileageRecords = await VehicleMileage.find({
          vehicleId: vehicle._id,
          recordedAt: { $gte: oneYearAgo },
          isValidated: true,
        }).sort({ recordedAt: 1 });

        if (mileageRecords.length >= 2) {
          const firstRecord = mileageRecords[0];
          const lastRecord = mileageRecords[mileageRecords.length - 1];
          vehicle.stats = vehicle.stats || {};
          vehicle.stats.totalKmLast12Months = lastRecord.mileage - firstRecord.mileage;
          vehicle.stats.avgKmPerMonth = Math.round(vehicle.stats.totalKmLast12Months / 12);
        }

        // Prochaine échéance CT
        const nextCt = await VehicleInspection.findOne({
          vehicleId: vehicle._id,
          inspectionType: 'ct',
          result: 'pass',
        }).sort({ expiryDate: -1 });

        if (nextCt) {
          vehicle.documents = vehicle.documents || {};
          vehicle.documents.ctExpiryDate = nextCt.expiryDate;
        }

        await vehicle.save();
      } catch (error) {
        console.error(`[VEHICLES-DATALAKE] Erreur calcul stats véhicule ${vehicle.licensePlate}:`, error.message);
      }
    }
  }

  /**
   * Récupère les organisations actives
   * Inclut les organisations ayant des véhicules dans : Vehizen Data Lake, DKV, Dashdoc, ou connecteurs Vehizen
   */
  async getActiveOrganizations() {
    const allOrgs = [];

    // 1. VEHIZEN DATA LAKE - SOURCE PRIMAIRE (carrierId = organizationId)
    // Ensure connection is initialized
    if (!VechizenVehicleDL) {
      await initOrdersConnection();
    }

    if (VechizenVehicleDL) {
      try {
        const vechizenDlOrgs = await VechizenVehicleDL.distinct('carrierId');
        allOrgs.push(...vechizenDlOrgs);
        console.log(`[VEHICLES-DATALAKE] ${vechizenDlOrgs.length} organisations Vehizen Data Lake trouvées (PRIMAIRE)`);
      } catch (e) {
        console.log('[VEHICLES-DATALAKE] Pas de véhicules Vehizen Data Lake:', e.message);
      }
    }

    // 2. Organisations avec connecteurs Vehizen API
    const orgsFromVehizen = Array.from(this.connectors.keys());
    allOrgs.push(...orgsFromVehizen);

    // 3. Organisations avec véhicules DKV Data Lake
    if (DkvVehicle) {
      try {
        const dkvOrgs = await DkvVehicle.distinct('organizationId');
        allOrgs.push(...dkvOrgs);
        console.log(`[VEHICLES-DATALAKE] ${dkvOrgs.length} organisations DKV trouvées`);
      } catch (e) {
        console.log('[VEHICLES-DATALAKE] Pas de véhicules DKV');
      }
    }

    // 4. Organisations avec véhicules Dashdoc
    if (DashdocVehicle) {
      try {
        const dashdocOrgs = await DashdocVehicle.distinct('organizationId');
        allOrgs.push(...dashdocOrgs);
        console.log(`[VEHICLES-DATALAKE] ${dashdocOrgs.length} organisations Dashdoc trouvées`);
      } catch (e) {
        console.log('[VEHICLES-DATALAKE] Pas de véhicules Dashdoc');
      }
    }

    const uniqueOrgs = [...new Set(allOrgs.filter(o => o))];
    console.log(`[VEHICLES-DATALAKE] Total organisations actives: ${uniqueOrgs.length}`);
    return uniqueOrgs;
  }

  /**
   * Crée les index MongoDB
   */
  async ensureIndexes() {
    try {
      const { ensureIndexes } = require('../../models/vehicles-datalake');
      await ensureIndexes();
    } catch (error) {
      console.error('[VEHICLES-DATALAKE] Erreur création index:', error.message);
    }
  }

  /**
   * Map le type de véhicule Dashdoc
   */
  mapDashdocVehicleType(type) {
    const mapping = {
      'truck': 'truck',
      'tractor': 'tractor',
      'van': 'van',
      'trailer': 'trailer',
      'semi-trailer': 'semi_trailer',
    };
    return mapping[type?.toLowerCase()] || 'other';
  }

  /**
   * Retourne le statut du service
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      connectors: this.connectors.size,
      stats: {
        ...this.stats,
        recentErrors: this.stats.syncErrors.slice(-5),
      },
      intervals: {
        incremental: `${this.syncIntervals.incremental / 60000} min`,
        periodic: `${this.syncIntervals.periodic / 60000} min`,
        full: `${this.syncIntervals.full / 3600000} h`,
      },
    };
  }

  /**
   * Force une sync manuelle
   */
  async forceSync(type = 'periodic', organizationId = null) {
    switch (type) {
      case 'incremental':
        if (organizationId && this.connectors.has(organizationId)) {
          await this.syncMileageForOrganization(organizationId, this.connectors.get(organizationId));
        } else {
          await this.runIncrementalSync();
        }
        break;

      case 'periodic':
        if (organizationId) {
          await this.syncVehiclesForOrganization(organizationId);
        } else {
          await this.runPeriodicSync();
        }
        break;

      case 'full':
        await this.runFullSync();
        break;
    }
  }
}

// Singleton
let instance = null;

function getVehicleDatalakeSyncService() {
  if (!instance) {
    instance = new VehicleDatalakeSyncService();
  }
  return instance;
}

module.exports = {
  VehicleDatalakeSyncService,
  getVehicleDatalakeSyncService,
};
