/**
 * Transports Reader
 * Interface pour lire les transports depuis le Data Lake MongoDB
 *
 * IMPORTANT: Ce reader remplace les appels API directs vers Dashdoc
 * Les services doivent utiliser ce reader au lieu de dashdoc.connector.js pour les lectures
 */

const { COLLECTIONS } = require('../../../models/dashdoc-datalake');

class TransportsReader {
  constructor(db) {
    this.db = db;
    this.collection = db.collection(COLLECTIONS.TRANSPORTS);
  }

  /**
   * Récupérer un transport par UID Dashdoc
   * @param {string} uid - UID du transport
   * @param {string} connectionId - ID de la connexion (pour filtrer par carrier/client)
   */
  async getByUid(uid, connectionId = null) {
    const query = { dashdocUid: uid };
    if (connectionId) query.connectionId = connectionId;
    return this.collection.findOne(query);
  }

  /**
   * Récupérer un transport par ID séquentiel
   */
  async getBySequentialId(sequentialId, connectionId = null) {
    const query = { sequentialId };
    if (connectionId) query.connectionId = connectionId;
    return this.collection.findOne(query);
  }

  /**
   * Récupérer des transports avec filtres avancés
   * @param {Object} filters - Filtres de recherche
   * @param {Object} options - Options de pagination et tri
   * @param {string} connectionId - ID de la connexion (filtre par carrier/client)
   */
  async find(filters = {}, options = {}, connectionId = null) {
    const query = this.buildQuery(filters, connectionId);
    const { limit = 50, skip = 0, sort = { createdAt: -1 } } = options;

    const [results, total] = await Promise.all([
      this.collection.find(query).sort(sort).skip(skip).limit(limit).toArray(),
      this.collection.countDocuments(query)
    ]);

    return {
      results,
      total,
      page: Math.floor(skip / limit) + 1,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Récupérer tous les transports d'une connexion
   * @param {string} connectionId - ID de la connexion (carrier/client)
   */
  async getAllByConnection(connectionId, options = {}) {
    return this.find({}, options, connectionId);
  }

  /**
   * Transports "A planifier" (sans carrier assigné)
   */
  async getToPlan(connectionId, options = {}) {
    return this.find({
      status: { $in: ['DRAFT', 'PENDING'] },
      'carrier.externalId': { $exists: false }
    }, options, connectionId);
  }

  /**
   * Transports par statut
   */
  async getByStatus(status, connectionId, options = {}) {
    const statusArray = Array.isArray(status) ? status : [status];
    return this.find({ status: { $in: statusArray } }, options, connectionId);
  }

  /**
   * Transports avec un tag spécifique
   */
  async getByTag(tagName, connectionId, options = {}) {
    return this.find({ 'tags.name': tagName }, options, connectionId);
  }

  /**
   * Transports assignés à un carrier spécifique
   */
  async getByCarrier(carrierExternalId, connectionId = null, options = {}) {
    return this.find({ 'carrier.externalId': carrierExternalId }, options, connectionId);
  }

  /**
   * Recherche géospatiale - Transports proches d'un point de chargement
   */
  async findNearPickup(longitude, latitude, maxDistanceKm = 50, connectionId = null, options = {}) {
    const query = {
      'pickup.address.location': {
        $near: {
          $geometry: { type: 'Point', coordinates: [longitude, latitude] },
          $maxDistance: maxDistanceKm * 1000
        }
      }
    };

    if (connectionId) query.connectionId = connectionId;

    const { limit = 50 } = options;
    return this.collection.find(query).limit(limit).toArray();
  }

  /**
   * Recherche géospatiale - Transports proches d'un point de livraison
   */
  async findNearDelivery(longitude, latitude, maxDistanceKm = 50, connectionId = null, options = {}) {
    const query = {
      'delivery.address.location': {
        $near: {
          $geometry: { type: 'Point', coordinates: [longitude, latitude] },
          $maxDistance: maxDistanceKm * 1000
        }
      }
    };

    if (connectionId) query.connectionId = connectionId;

    const { limit = 50 } = options;
    return this.collection.find(query).limit(limit).toArray();
  }

  /**
   * Transports par période de création
   */
  async getByDateRange(startDate, endDate, connectionId, options = {}) {
    return this.find({
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    }, options, connectionId);
  }

  /**
   * Transports par période de chargement prévu
   */
  async getByPickupDateRange(startDate, endDate, connectionId, options = {}) {
    return this.find({
      'pickup.scheduledAt': {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    }, options, connectionId);
  }

  /**
   * Statistiques par statut
   */
  async getStatsByStatus(connectionId) {
    const matchStage = connectionId ? { $match: { connectionId } } : { $match: {} };

    const pipeline = [
      matchStage,
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalPrice: { $sum: '$pricing.totalPrice' }
        }
      },
      { $sort: { count: -1 } }
    ];

    return this.collection.aggregate(pipeline).toArray();
  }

  /**
   * Statistiques par carrier
   */
  async getStatsByCarrier(connectionId, options = {}) {
    const { limit = 20 } = options;
    const matchStage = connectionId ? { $match: { connectionId, 'carrier.externalId': { $exists: true } } } : { $match: { 'carrier.externalId': { $exists: true } } };

    const pipeline = [
      matchStage,
      {
        $group: {
          _id: '$carrier.externalId',
          carrierName: { $first: '$carrier.name' },
          count: { $sum: 1 },
          totalPrice: { $sum: '$pricing.totalPrice' },
          completedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] }
          }
        }
      },
      { $sort: { count: -1 } },
      { $limit: limit }
    ];

    return this.collection.aggregate(pipeline).toArray();
  }

  /**
   * Statistiques globales
   */
  async getGlobalStats(connectionId) {
    const matchStage = connectionId ? { $match: { connectionId } } : { $match: {} };

    const pipeline = [
      matchStage,
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          totalPrice: { $sum: '$pricing.totalPrice' },
          avgPrice: { $avg: '$pricing.totalPrice' },
          withCarrier: {
            $sum: { $cond: [{ $ne: ['$carrier.externalId', null] }, 1, 0] }
          },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] }
          }
        }
      }
    ];

    const result = await this.collection.aggregate(pipeline).toArray();
    return result[0] || { totalCount: 0, totalPrice: 0, avgPrice: 0, withCarrier: 0, completed: 0 };
  }

  /**
   * Recherche textuelle
   */
  async search(searchTerm, connectionId, options = {}) {
    const { limit = 50, skip = 0 } = options;

    const query = {
      $or: [
        { remoteId: { $regex: searchTerm, $options: 'i' } },
        { 'pickup.address.city': { $regex: searchTerm, $options: 'i' } },
        { 'delivery.address.city': { $regex: searchTerm, $options: 'i' } },
        { 'carrier.name': { $regex: searchTerm, $options: 'i' } }
      ]
    };

    if (connectionId) query.connectionId = connectionId;

    return this.collection.find(query).skip(skip).limit(limit).toArray();
  }

  /**
   * Construire la query MongoDB à partir des filtres
   */
  buildQuery(filters, connectionId) {
    const query = {};

    if (connectionId) query.connectionId = connectionId;
    if (filters.organizationId) query.organizationId = filters.organizationId;
    if (filters.status) {
      query.status = Array.isArray(filters.status) ? { $in: filters.status } : filters.status;
    }
    if (filters.carrierId) query['carrier.externalId'] = filters.carrierId;
    if (filters.tag) query['tags.name'] = filters.tag;
    if (filters.hasCarrier === true) query['carrier.externalId'] = { $exists: true, $ne: null };
    if (filters.hasCarrier === false) query['carrier.externalId'] = { $exists: false };

    // Filtres date
    if (filters.createdFrom || filters.createdTo) {
      query.createdAt = {};
      if (filters.createdFrom) query.createdAt.$gte = new Date(filters.createdFrom);
      if (filters.createdTo) query.createdAt.$lte = new Date(filters.createdTo);
    }

    // Filtre prix
    if (filters.minPrice || filters.maxPrice) {
      query['pricing.totalPrice'] = {};
      if (filters.minPrice) query['pricing.totalPrice'].$gte = filters.minPrice;
      if (filters.maxPrice) query['pricing.totalPrice'].$lte = filters.maxPrice;
    }

    return query;
  }

  /**
   * Compter les documents avec filtres
   */
  async count(filters = {}, connectionId = null) {
    const query = this.buildQuery(filters, connectionId);
    return this.collection.countDocuments(query);
  }

  /**
   * Vérifier la fraîcheur des données
   * @returns {Object} Informations sur la dernière sync
   */
  async getDataFreshness(connectionId) {
    const latest = await this.collection.findOne(
      connectionId ? { connectionId } : {},
      { sort: { syncedAt: -1 }, projection: { syncedAt: 1 } }
    );

    const oldest = await this.collection.findOne(
      connectionId ? { connectionId } : {},
      { sort: { syncedAt: 1 }, projection: { syncedAt: 1 } }
    );

    return {
      lastSyncedAt: latest?.syncedAt,
      oldestSyncedAt: oldest?.syncedAt,
      isFresh: latest?.syncedAt && (Date.now() - latest.syncedAt.getTime()) < 60000 // < 1 min
    };
  }
}

module.exports = TransportsReader;
