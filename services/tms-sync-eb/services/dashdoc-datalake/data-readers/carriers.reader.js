/**
 * Carriers Reader
 * Interface pour lire les transporteurs depuis le Data Lake MongoDB
 *
 * IMPORTANT: Ce reader remplace les appels API directs vers Dashdoc
 * Utilisé par Affret.IA pour récupérer les carriers disponibles
 */

const { COLLECTIONS } = require('../../../models/dashdoc-datalake');

class CarriersReader {
  constructor(db) {
    this.db = db;
    this.companiesCollection = db.collection(COLLECTIONS.COMPANIES);
    this.transportsCollection = db.collection(COLLECTIONS.TRANSPORTS);
  }

  /**
   * Récupérer tous les carriers d'une connexion
   * @param {string} connectionId - ID de la connexion (différencie SETT Transports des autres)
   * @param {Object} options - Options de pagination et tri
   */
  async getAllCarriers(connectionId, options = {}) {
    const { limit = 500, skip = 0, sort = { name: 1 } } = options;

    const query = { isCarrier: true };
    if (connectionId) query.connectionId = connectionId;

    const [results, total] = await Promise.all([
      this.companiesCollection.find(query).sort(sort).skip(skip).limit(limit).toArray(),
      this.companiesCollection.countDocuments(query)
    ]);

    return {
      results,
      total,
      page: Math.floor(skip / limit) + 1,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Récupérer un carrier par PK Dashdoc
   */
  async getByPk(dashdocPk, connectionId = null) {
    const query = { dashdocPk: parseInt(dashdocPk) };
    if (connectionId) query.connectionId = connectionId;
    return this.companiesCollection.findOne(query);
  }

  /**
   * Récupérer un carrier par SIRET
   */
  async getBySiret(siret, connectionId = null) {
    const query = { siret, isCarrier: true };
    if (connectionId) query.connectionId = connectionId;
    return this.companiesCollection.findOne(query);
  }

  /**
   * Récupérer un carrier par numéro de TVA
   */
  async getByVatNumber(vatNumber, connectionId = null) {
    const query = { vatNumber, isCarrier: true };
    if (connectionId) query.connectionId = connectionId;
    return this.companiesCollection.findOne(query);
  }

  /**
   * Recherche carriers par nom ou SIRET
   */
  async search(searchTerm, connectionId = null, options = {}) {
    const { limit = 50 } = options;

    const query = {
      isCarrier: true,
      $or: [
        { name: { $regex: searchTerm, $options: 'i' } },
        { legalName: { $regex: searchTerm, $options: 'i' } },
        { siret: { $regex: searchTerm, $options: 'i' } },
        { vatNumber: { $regex: searchTerm, $options: 'i' } }
      ]
    };

    if (connectionId) query.connectionId = connectionId;

    return this.companiesCollection.find(query).limit(limit).toArray();
  }

  /**
   * Carriers avec statistiques de transports enrichies
   * Pour Affret.IA scoring et sélection
   */
  async getCarriersWithStats(connectionId, options = {}) {
    const { limit = 100, minOrders = 0 } = options;

    const matchStage = { isCarrier: true };
    if (connectionId) matchStage.connectionId = connectionId;

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: COLLECTIONS.TRANSPORTS,
          let: { carrierPk: { $toString: '$dashdocPk' } },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$carrier.externalId', '$$carrierPk'] }
              }
            }
          ],
          as: 'transports'
        }
      },
      {
        $addFields: {
          stats: {
            totalOrders: { $size: '$transports' },
            completedOrders: {
              $size: {
                $filter: {
                  input: '$transports',
                  cond: { $eq: ['$$this.status', 'COMPLETED'] }
                }
              }
            },
            totalRevenue: { $sum: '$transports.pricing.totalPrice' },
            avgPrice: { $avg: '$transports.pricing.totalPrice' },
            lastOrderAt: { $max: '$transports.createdAt' }
          }
        }
      },
      { $match: { 'stats.totalOrders': { $gte: minOrders } } },
      {
        $project: {
          transports: 0, // Ne pas retourner les transports
          _rawData: 0
        }
      },
      { $sort: { 'stats.totalOrders': -1 } },
      { $limit: limit }
    ];

    return this.companiesCollection.aggregate(pipeline).toArray();
  }

  /**
   * Carriers vérifiés
   */
  async getVerifiedCarriers(connectionId, options = {}) {
    const { limit = 500 } = options;

    const query = { isCarrier: true, isVerified: true };
    if (connectionId) query.connectionId = connectionId;

    return this.companiesCollection.find(query).limit(limit).toArray();
  }

  /**
   * Carriers par zone géographique (recherche par ville ou code postal)
   */
  async getByLocation(city = null, postalCode = null, connectionId = null, options = {}) {
    const { limit = 100 } = options;

    const query = { isCarrier: true };
    if (connectionId) query.connectionId = connectionId;
    if (city) query['address.city'] = { $regex: city, $options: 'i' };
    if (postalCode) query['address.postalCode'] = { $regex: `^${postalCode.substring(0, 2)}` };

    return this.companiesCollection.find(query).limit(limit).toArray();
  }

  /**
   * Recherche géospatiale - Carriers proches d'un point
   */
  async findNear(longitude, latitude, maxDistanceKm = 100, connectionId = null, options = {}) {
    const { limit = 50 } = options;

    const query = {
      isCarrier: true,
      'address.location': {
        $near: {
          $geometry: { type: 'Point', coordinates: [longitude, latitude] },
          $maxDistance: maxDistanceKm * 1000
        }
      }
    };

    if (connectionId) query.connectionId = connectionId;

    return this.companiesCollection.find(query).limit(limit).toArray();
  }

  /**
   * Top carriers par nombre de commandes
   */
  async getTopCarriers(connectionId, options = {}) {
    const { limit = 10, period = 90 } = options; // Période en jours

    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - period);

    const matchStage = { isCarrier: true };
    if (connectionId) matchStage.connectionId = connectionId;

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: COLLECTIONS.TRANSPORTS,
          let: { carrierPk: { $toString: '$dashdocPk' } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$carrier.externalId', '$$carrierPk'] },
                    { $gte: ['$createdAt', dateLimit] }
                  ]
                }
              }
            }
          ],
          as: 'recentTransports'
        }
      },
      {
        $addFields: {
          recentOrdersCount: { $size: '$recentTransports' },
          recentRevenue: { $sum: '$recentTransports.pricing.totalPrice' }
        }
      },
      { $match: { recentOrdersCount: { $gt: 0 } } },
      { $project: { recentTransports: 0, _rawData: 0 } },
      { $sort: { recentOrdersCount: -1 } },
      { $limit: limit }
    ];

    return this.companiesCollection.aggregate(pipeline).toArray();
  }

  /**
   * Carriers sans commandes récentes (pour relance)
   */
  async getInactiveCarriers(connectionId, options = {}) {
    const { limit = 50, inactiveDays = 30 } = options;

    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - inactiveDays);

    const matchStage = { isCarrier: true };
    if (connectionId) matchStage.connectionId = connectionId;

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: COLLECTIONS.TRANSPORTS,
          let: { carrierPk: { $toString: '$dashdocPk' } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$carrier.externalId', '$$carrierPk'] },
                    { $gte: ['$createdAt', dateLimit] }
                  ]
                }
              }
            }
          ],
          as: 'recentTransports'
        }
      },
      { $match: { recentTransports: { $size: 0 } } },
      { $project: { recentTransports: 0, _rawData: 0 } },
      { $limit: limit }
    ];

    return this.companiesCollection.aggregate(pipeline).toArray();
  }

  /**
   * Statistiques globales des carriers
   */
  async getGlobalStats(connectionId) {
    const matchStage = { isCarrier: true };
    if (connectionId) matchStage.connectionId = connectionId;

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalCarriers: { $sum: 1 },
          verifiedCarriers: {
            $sum: { $cond: ['$isVerified', 1, 0] }
          },
          withSiret: {
            $sum: { $cond: [{ $ne: ['$siret', null] }, 1, 0] }
          },
          withEmail: {
            $sum: { $cond: [{ $ne: ['$email', null] }, 1, 0] }
          }
        }
      }
    ];

    const result = await this.companiesCollection.aggregate(pipeline).toArray();
    return result[0] || { totalCarriers: 0, verifiedCarriers: 0, withSiret: 0, withEmail: 0 };
  }

  /**
   * Compter les carriers
   */
  async count(connectionId = null) {
    const query = { isCarrier: true };
    if (connectionId) query.connectionId = connectionId;
    return this.companiesCollection.countDocuments(query);
  }

  /**
   * Vérifier la fraîcheur des données
   */
  async getDataFreshness(connectionId) {
    const query = { isCarrier: true };
    if (connectionId) query.connectionId = connectionId;

    const latest = await this.companiesCollection.findOne(
      query,
      { sort: { syncedAt: -1 }, projection: { syncedAt: 1 } }
    );

    return {
      lastSyncedAt: latest?.syncedAt,
      isFresh: latest?.syncedAt && (Date.now() - latest.syncedAt.getTime()) < 5 * 60 * 1000 // < 5 min
    };
  }
}

module.exports = CarriersReader;
