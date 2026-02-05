/**
 * Truckers Reader
 * Interface pour lire les chauffeurs depuis le Data Lake MongoDB
 */

const { COLLECTIONS } = require('../../../models/dashdoc-datalake');

class TruckersReader {
  constructor(db) {
    this.db = db;
    this.collection = db.collection(COLLECTIONS.TRUCKERS);
  }

  /**
   * Récupérer tous les chauffeurs d'une connexion
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
   * Récupérer un chauffeur par PK
   */
  async getByPk(dashdocPk, connectionId = null) {
    const query = { dashdocPk: parseInt(dashdocPk) };
    if (connectionId) query.connectionId = connectionId;
    return this.collection.findOne(query);
  }

  /**
   * Rechercher un chauffeur par email
   */
  async getByEmail(email, connectionId = null) {
    const query = { email: { $regex: email, $options: 'i' } };
    if (connectionId) query.connectionId = connectionId;
    return this.collection.findOne(query);
  }

  /**
   * Récupérer les chauffeurs d'un carrier
   */
  async getByCarrier(carrierPk, connectionId = null, options = {}) {
    const { limit = 100 } = options;

    const query = { carrierPk: parseInt(carrierPk) };
    if (connectionId) query.connectionId = connectionId;

    return this.collection.find(query).limit(limit).toArray();
  }

  /**
   * Chauffeurs actifs
   */
  async getActive(connectionId = null, options = {}) {
    const { limit = 500 } = options;

    const query = { isActive: true };
    if (connectionId) query.connectionId = connectionId;

    return this.collection.find(query).limit(limit).toArray();
  }

  /**
   * Chauffeurs avec licence ADR
   */
  async getWithAdrLicense(connectionId = null, options = {}) {
    const { limit = 100 } = options;

    const query = {
      adrLicense: { $exists: true, $ne: null },
      $or: [
        { adrLicenseDeadline: { $exists: false } },
        { adrLicenseDeadline: { $gte: new Date() } }
      ]
    };
    if (connectionId) query.connectionId = connectionId;

    return this.collection.find(query).limit(limit).toArray();
  }

  /**
   * Chauffeurs avec documents expirant bientôt
   */
  async getWithExpiringDocuments(connectionId = null, options = {}) {
    const { limit = 100, daysAhead = 30 } = options;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const query = {
      $or: [
        { drivingLicenseDeadline: { $lte: futureDate, $gte: new Date() } },
        { adrLicenseDeadline: { $lte: futureDate, $gte: new Date() } },
        { driverCardDeadline: { $lte: futureDate, $gte: new Date() } }
      ]
    };
    if (connectionId) query.connectionId = connectionId;

    return this.collection.find(query).limit(limit).toArray();
  }

  /**
   * Chauffeurs avec documents expirés
   */
  async getWithExpiredDocuments(connectionId = null, options = {}) {
    const { limit = 100 } = options;
    const now = new Date();

    const query = {
      $or: [
        { drivingLicenseDeadline: { $lt: now } },
        { adrLicenseDeadline: { $lt: now } },
        { driverCardDeadline: { $lt: now } }
      ]
    };
    if (connectionId) query.connectionId = connectionId;

    return this.collection.find(query).limit(limit).toArray();
  }

  /**
   * Recherche par nom
   */
  async search(searchTerm, connectionId = null, options = {}) {
    const { limit = 50 } = options;

    const query = {
      $or: [
        { firstName: { $regex: searchTerm, $options: 'i' } },
        { lastName: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } }
      ]
    };
    if (connectionId) query.connectionId = connectionId;

    return this.collection.find(query).limit(limit).toArray();
  }

  /**
   * Statistiques des chauffeurs
   */
  async getStats(connectionId) {
    const matchStage = connectionId ? { $match: { connectionId } } : { $match: {} };

    const pipeline = [
      matchStage,
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
          withAdr: { $sum: { $cond: [{ $ne: ['$adrLicense', null] }, 1, 0] } }
        }
      }
    ];

    const result = await this.collection.aggregate(pipeline).toArray();
    return result[0] || { total: 0, active: 0, withAdr: 0 };
  }

  /**
   * Compter les chauffeurs
   */
  async count(connectionId = null) {
    const query = connectionId ? { connectionId } : {};
    return this.collection.countDocuments(query);
  }
}

module.exports = TruckersReader;
