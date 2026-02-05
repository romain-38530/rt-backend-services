/**
 * Dashdoc Data Lake Service
 * Export principal du module de synchronisation Dashdoc
 *
 * Architecture:
 * - DatalakeSyncService: Orchestre la synchronisation périodique depuis Dashdoc vers MongoDB
 * - Data Readers: Fournissent une interface de lecture depuis MongoDB
 *
 * Utilisation:
 * ```javascript
 * const { DatalakeSyncService, createReaders } = require('./services/dashdoc-datalake');
 *
 * // Créer le service de sync
 * const syncService = new DatalakeSyncService(db, dashdocConnector, {
 *   organizationId: 'org-123',
 *   connectionId: 'conn-456' // Identifie le carrier/client (ex: SETT Transports)
 * });
 *
 * // Démarrer la sync
 * await syncService.start();
 *
 * // Créer les readers pour lecture
 * const readers = createReaders(db);
 *
 * // Lire les transports depuis MongoDB (pas d'appel API)
 * const transports = await readers.transports.find({}, {}, 'conn-456');
 * ```
 */

const DatalakeSyncService = require('./datalake-sync.service');
const { createReaders, TransportsReader, CarriersReader, VehiclesReader, TruckersReader } = require('./data-readers');

module.exports = {
  // Service de synchronisation
  DatalakeSyncService,

  // Readers pour lecture depuis MongoDB
  createReaders,
  TransportsReader,
  CarriersReader,
  VehiclesReader,
  TruckersReader
};
