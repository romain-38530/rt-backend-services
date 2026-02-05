/**
 * DKV Data Lake Readers Index
 *
 * Exports all data reader classes for DKV Data Lake
 */

const { TransactionsReader } = require('./transactions.reader');
const { CardsReader } = require('./cards.reader');
const { VehiclesReader } = require('./vehicles.reader');

/**
 * Create all readers with shared database connection
 */
function createReaders(db) {
  return {
    transactions: new TransactionsReader(db),
    cards: new CardsReader(db),
    vehicles: new VehiclesReader(db),
  };
}

module.exports = {
  TransactionsReader,
  CardsReader,
  VehiclesReader,
  createReaders,
};
