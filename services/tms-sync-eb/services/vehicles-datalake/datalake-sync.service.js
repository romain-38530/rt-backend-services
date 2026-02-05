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
   */
  async syncVehiclesForOrganization(organizationId, options = {}) {
    console.log(`[VEHICLES-DATALAKE] Sync véhicules pour ${organizationId}`);

    // 1. Récupérer véhicules depuis Dashdoc Data Lake
    const dashdocVehicles = await this.getDashdocVehicles(organizationId);
    const dashdocTrailers = await this.getDashdocTrailers(organizationId);

    // 2. Récupérer véhicules depuis Vehizen (si connecteur disponible)
    const connector = this.connectors.get(organizationId);
    let vechizenVehicles = [];
    if (connector) {
      try {
        const result = await connector.getVehicles();
        vechizenVehicles = result.vehicles.map(v => connector.transformVehicle(v));
      } catch (error) {
        console.error(`[VEHICLES-DATALAKE] Erreur récupération Vehizen:`, error.message);
      }
    }

    // 3. Fusionner les données
    const mergedVehicles = this.mergeVehicleData(dashdocVehicles, dashdocTrailers, vechizenVehicles);

    // 4. Sauvegarder en base
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
   * Fusionne les données des différentes sources
   */
  mergeVehicleData(dashdocVehicles, dashdocTrailers, vechizenVehicles) {
    const vehicleMap = new Map();

    // 1. Ajouter véhicules Dashdoc
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

    // 3. Fusionner données Vehizen
    for (const v of vechizenVehicles) {
      const key = v.licensePlate;
      if (!key) continue;

      if (vehicleMap.has(key)) {
        // Enrichir les données existantes
        const existing = vehicleMap.get(key);
        vehicleMap.set(key, {
          ...existing,
          // Données Vehizen prioritaires pour certains champs
          vechizenId: v.vechizenId,
          currentMileage: v.currentMileage || existing.currentMileage,
          mileageUpdatedAt: v.mileageUpdatedAt,
          lastPosition: v.lastPosition,
          equipment: { ...existing.equipment, ...v.equipment },
          _vechizenRawData: v._vechizenRawData,
          dataSources: [...existing.dataSources, 'vehizen'],
        });
      } else {
        // Nouveau véhicule (uniquement dans Vehizen)
        vehicleMap.set(key, {
          ...v,
          dataSources: ['vehizen'],
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

        // IDs externes
        dashdocPk: vehicleData.dashdocPk,
        vechizenId: vehicleData.vechizenId,

        // Kilométrage
        currentMileage: vehicleData.currentMileage,
        mileageUpdatedAt: vehicleData.mileageUpdatedAt,
        mileageSource: vehicleData.currentMileage ? (vehicleData.vechizenId ? 'vehizen' : 'dashdoc') : null,

        // Position
        lastPosition: vehicleData.lastPosition,

        // Équipements
        equipment: vehicleData.equipment,

        // Sources
        dataSources: vehicleData.dataSources,

        // Données brutes
        '_rawData.dashdoc': vehicleData._dashdocRawData,
        '_rawData.vehizen': vehicleData._vechizenRawData,

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
   */
  async getActiveOrganizations() {
    // Récupérer depuis les connexions ou les véhicules existants
    const orgsFromVehizen = Array.from(this.connectors.keys());

    // Ajouter les organisations avec véhicules Dashdoc
    if (DashdocVehicle) {
      const dashdocOrgs = await DashdocVehicle.distinct('organizationId');
      orgsFromVehizen.push(...dashdocOrgs);
    }

    return [...new Set(orgsFromVehizen)];
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
