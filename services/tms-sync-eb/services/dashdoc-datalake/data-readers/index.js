/**
 * Data Readers Index
 * Export centralisé de tous les readers pour le Data Lake
 *
 * Les readers fournissent une interface de lecture vers MongoDB
 * Ils remplacent les appels API directs vers Dashdoc pour les lectures
 */

const TransportsReader = require('./transports.reader');
const CarriersReader = require('./carriers.reader');
const VehiclesReader = require('./vehicles.reader');
const TruckersReader = require('./truckers.reader');
const ContactsReader = require('./contacts.reader');

/**
 * Factory pour créer tous les readers d'un coup
 * @param {Db} db - Instance MongoDB
 * @returns {Object} Tous les readers initialisés
 */
function createReaders(db) {
  return {
    transports: new TransportsReader(db),
    carriers: new CarriersReader(db),
    vehicles: new VehiclesReader(db),
    truckers: new TruckersReader(db),
    contacts: new ContactsReader(db)
  };
}

module.exports = {
  TransportsReader,
  CarriersReader,
  VehiclesReader,
  TruckersReader,
  ContactsReader,
  createReaders
};
