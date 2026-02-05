/**
 * DKV Data Lake Index
 *
 * Main export for DKV Data Lake services
 */

const { DkvDatalakeSyncService } = require('./datalake-sync.service');
const { createReaders, TransactionsReader, CardsReader, VehiclesReader } = require('./data-readers');

module.exports = {
  // Sync service
  DkvDatalakeSyncService,

  // Data readers
  createReaders,
  TransactionsReader,
  CardsReader,
  VehiclesReader,
};
