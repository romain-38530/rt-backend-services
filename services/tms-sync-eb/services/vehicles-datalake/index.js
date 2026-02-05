/**
 * Vehicles Data Lake - Module Principal
 *
 * Exports tous les services pour la gestion des véhicules:
 * - Sync Dashdoc + Vehizen
 * - Documents (carte grise, assurance, CT)
 * - Entretiens et pannes
 * - OCR factures fournisseurs
 */

const { VehicleDatalakeSyncService, getVehicleDatalakeSyncService } = require('./datalake-sync.service');
const VehicleDocumentService = require('./document.service');
const VehicleMaintenanceService = require('./maintenance.service');
const OcrService = require('./ocr/ocr.service');
const InvoiceParser = require('./ocr/invoice.parser');

// Singleton instances
let documentService = null;
let maintenanceService = null;

/**
 * Initialise tous les services du module véhicules
 */
async function initializeVehiclesModule(config = {}) {
  console.log('[VEHICLES-MODULE] Initialisation...');

  // 1. Initialiser le service de sync
  const syncService = getVehicleDatalakeSyncService();

  // Récupérer les connexions Vehizen depuis la base
  let vechizenConnections = [];
  try {
    const Connection = require('../../models/Connection.model');
    vechizenConnections = await Connection.find({
      provider: 'vehizen',
      isActive: true,
    });
  } catch (e) {
    console.log('[VEHICLES-MODULE] Modèle Connection non disponible, skip Vehizen');
  }

  await syncService.initialize(vechizenConnections);

  // 2. Initialiser le service de documents
  documentService = new VehicleDocumentService(config);

  // 3. Initialiser le service de maintenance
  maintenanceService = new VehicleMaintenanceService(config);

  console.log('[VEHICLES-MODULE] Module initialisé avec succès');

  return {
    syncService,
    documentService,
    maintenanceService,
  };
}

/**
 * Démarre les syncs périodiques
 */
function startVehiclesSync() {
  const syncService = getVehicleDatalakeSyncService();
  syncService.start();
}

/**
 * Arrête les syncs
 */
function stopVehiclesSync() {
  const syncService = getVehicleDatalakeSyncService();
  syncService.stop();
}

/**
 * Retourne le service de documents
 */
function getDocumentService() {
  if (!documentService) {
    documentService = new VehicleDocumentService();
  }
  return documentService;
}

/**
 * Retourne le service de maintenance
 */
function getMaintenanceService() {
  if (!maintenanceService) {
    maintenanceService = new VehicleMaintenanceService();
  }
  return maintenanceService;
}

/**
 * Retourne le statut global du module
 */
function getModuleStatus() {
  const syncService = getVehicleDatalakeSyncService();

  return {
    sync: syncService.getStatus(),
    services: {
      document: documentService ? 'initialized' : 'not_initialized',
      maintenance: maintenanceService ? 'initialized' : 'not_initialized',
    },
  };
}

module.exports = {
  // Initialisation
  initializeVehiclesModule,
  startVehiclesSync,
  stopVehiclesSync,
  getModuleStatus,

  // Services
  getVehicleDatalakeSyncService,
  getDocumentService,
  getMaintenanceService,

  // Classes (pour usage direct)
  VehicleDatalakeSyncService,
  VehicleDocumentService,
  VehicleMaintenanceService,
  OcrService,
  InvoiceParser,
};
