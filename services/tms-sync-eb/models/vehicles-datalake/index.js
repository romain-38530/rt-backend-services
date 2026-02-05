/**
 * Vehicles Data Lake Models Index
 *
 * Exports tous les modèles MongoDB pour la gestion des véhicules
 */

const Vehicle = require('./Vehicle.model');
const VehicleDocument = require('./VehicleDocument.model');
const VehicleMaintenance = require('./VehicleMaintenance.model');
const VehicleBreakdown = require('./VehicleBreakdown.model');
const VehicleInvoice = require('./VehicleInvoice.model');
const VehicleMileage = require('./VehicleMileage.model');
const VehicleInspection = require('./VehicleInspection.model');

module.exports = {
  Vehicle,
  VehicleDocument,
  VehicleMaintenance,
  VehicleBreakdown,
  VehicleInvoice,
  VehicleMileage,
  VehicleInspection,

  // Noms des collections
  collections: {
    vehicles: 'vehicles',
    documents: 'vehicle_documents',
    maintenance: 'vehicle_maintenance',
    breakdowns: 'vehicle_breakdowns',
    invoices: 'vehicle_invoices',
    mileage: 'vehicle_mileage',
    inspections: 'vehicle_inspections',
  },

  /**
   * Initialise tous les index des collections
   */
  async ensureIndexes() {
    console.log('[VEHICLES-DATALAKE] Creating indexes...');
    try {
      await Promise.all([
        Vehicle.ensureIndexes(),
        VehicleDocument.ensureIndexes(),
        VehicleMaintenance.ensureIndexes(),
        VehicleBreakdown.ensureIndexes(),
        VehicleInvoice.ensureIndexes(),
        VehicleMileage.ensureIndexes(),
        VehicleInspection.ensureIndexes(),
      ]);
      console.log('[VEHICLES-DATALAKE] All indexes created successfully');
    } catch (error) {
      console.error('[VEHICLES-DATALAKE] Error creating indexes:', error.message);
    }
  },

  /**
   * Statistiques des collections
   */
  async getCollectionStats(organizationId) {
    const match = organizationId ? { organizationId } : {};

    const [
      vehiclesCount,
      documentsCount,
      maintenanceCount,
      breakdownsCount,
      invoicesCount,
    ] = await Promise.all([
      Vehicle.countDocuments(match),
      VehicleDocument.countDocuments(match),
      VehicleMaintenance.countDocuments(match),
      VehicleBreakdown.countDocuments(match),
      VehicleInvoice.countDocuments(match),
    ]);

    return {
      vehicles: vehiclesCount,
      documents: documentsCount,
      maintenance: maintenanceCount,
      breakdowns: breakdownsCount,
      invoices: invoicesCount,
      total: vehiclesCount + documentsCount + maintenanceCount + breakdownsCount + invoicesCount,
    };
  },
};
