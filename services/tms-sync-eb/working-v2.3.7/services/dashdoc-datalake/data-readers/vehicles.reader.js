/**
 * Vehicles Reader
 * Interface pour lire les véhicules depuis le Data Lake MongoDB
 */

const { COLLECTIONS } = require('../../../models/dashdoc-datalake');

class VehiclesReader {
  constructor(db) {
    this.db = db;
    this.collection = db.collection(COLLECTIONS.VEHICLES);
  }

  /**
   * Récupérer tous les véhicules d'une connexion
   */
  async getAll(connectionId, options = {}) {
    const { limit = 500, skip = 0 } = options;

    const query = connectionId ? { connectionId } : {};

    const [results, total] = await Promise.all([
      this.collection.find(query).skip(skip).limit(limit).toArray(),
      this.collection.countDocuments(query)
    ]);

    return { results, total };
  }

  /**
   * Récupérer un véhicule par PK
   */
  async getByPk(dashdocPk, connectionId = null) {
    const query = { dashdocPk: parseInt(dashdocPk) };
    if (connectionId) query.connectionId = connectionId;
    return this.collection.findOne(query);
  }

  /**
   * Rechercher un véhicule par plaque d'immatriculation
   */
  async getByLicensePlate(licensePlate, connectionId = null) {
    const query = { licensePlate: { $regex: licensePlate, $options: 'i' } };
    if (connectionId) query.connectionId = connectionId;
    return this.collection.findOne(query);
  }

  /**
   * Récupérer les véhicules d'un carrier
   */
  async getByCarrier(companyPk, connectionId = null, options = {}) {
    const { limit = 100 } = options;

    const query = { companyPk: parseInt(companyPk) };
    if (connectionId) query.connectionId = connectionId;

    return this.collection.find(query).limit(limit).toArray();
  }

  /**
   * Véhicules par type
   */
  async getByType(type, connectionId = null, options = {}) {
    const { limit = 100 } = options;

    const query = { type };
    if (connectionId) query.connectionId = connectionId;

    return this.collection.find(query).limit(limit).toArray();
  }

  /**
   * Véhicules frigorifiques
   */
  async getRefrigerated(connectionId = null, options = {}) {
    const { limit = 100 } = options;

    const query = { isRefrigerated: true };
    if (connectionId) query.connectionId = connectionId;

    return this.collection.find(query).limit(limit).toArray();
  }

  /**
   * Véhicules ADR
   */
  async getAdr(connectionId = null, options = {}) {
    const { limit = 100 } = options;

    const query = { isAdr: true };
    if (connectionId) query.connectionId = connectionId;

    return this.collection.find(query).limit(limit).toArray();
  }

  /**
   * Véhicules avec hayon
   */
  async getWithLiftgate(connectionId = null, options = {}) {
    const { limit = 100 } = options;

    const query = { hasLiftgate: true };
    if (connectionId) query.connectionId = connectionId;

    return this.collection.find(query).limit(limit).toArray();
  }

  /**
   * Recherche par capacité
   */
  async getByCapacity(minPayload = 0, minVolume = 0, connectionId = null, options = {}) {
    const { limit = 100 } = options;

    const query = {
      $and: [
        { payload: { $gte: minPayload } },
        { volume: { $gte: minVolume } }
      ]
    };
    if (connectionId) query.connectionId = connectionId;

    return this.collection.find(query).limit(limit).toArray();
  }

  /**
   * Statistiques des véhicules
   */
  async getStats(connectionId) {
    const matchStage = connectionId ? { $match: { connectionId } } : { $match: {} };

    const pipeline = [
      matchStage,
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          avgPayload: { $avg: '$payload' },
          avgVolume: { $avg: '$volume' }
        }
      },
      { $sort: { count: -1 } }
    ];

    return this.collection.aggregate(pipeline).toArray();
  }

  /**
   * Compter les véhicules
   */
  async count(connectionId = null) {
    const query = connectionId ? { connectionId } : {};
    return this.collection.countDocuments(query);
  }
}

module.exports = VehiclesReader;
