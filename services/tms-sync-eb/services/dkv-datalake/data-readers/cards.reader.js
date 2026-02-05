/**
 * DKV Cards Reader
 *
 * Provides read access to DKV card data from MongoDB
 */

const { DkvCard } = require('../../../models/dkv-datalake');

class CardsReader {
  constructor(db) {
    this.db = db;
  }

  // ============================================================================
  // Basic Queries
  // ============================================================================

  async getByNumber(cardNumber, connectionId = null) {
    const filter = { cardNumber };
    if (connectionId) filter.connectionId = connectionId;
    return DkvCard.findOne(filter).lean();
  }

  async getAll(connectionId = null, options = {}) {
    const filter = {};
    if (connectionId) filter.connectionId = connectionId;

    const {
      page = 1,
      limit = 50,
      sortBy = 'cardNumber',
      sortOrder = 1,
    } = options;

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      DkvCard.find(filter)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      DkvCard.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async find(filters, options = {}, connectionId = null) {
    const query = { ...filters };
    if (connectionId) query.connectionId = connectionId;

    const {
      page = 1,
      limit = 50,
      sortBy = 'cardNumber',
      sortOrder = 1,
    } = options;

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      DkvCard.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      DkvCard.countDocuments(query),
    ]);

    return {
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  // ============================================================================
  // Filtered Queries
  // ============================================================================

  async getByStatus(status, connectionId = null, options = {}) {
    return this.find({ status }, options, connectionId);
  }

  async getActiveCards(connectionId = null, options = {}) {
    return this.getByStatus('active', connectionId, options);
  }

  async getBlockedCards(connectionId = null, options = {}) {
    return this.getByStatus('blocked', connectionId, options);
  }

  async getExpiredCards(connectionId = null, options = {}) {
    return this.find({
      expiryDate: { $lt: new Date() },
    }, options, connectionId);
  }

  async getExpiringCards(daysAhead = 30, connectionId = null, options = {}) {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    return this.find({
      expiryDate: { $gte: now, $lte: futureDate },
      status: 'active',
    }, options, connectionId);
  }

  async getByVehicle(vehiclePlate, connectionId = null) {
    const filter = { vehiclePlate };
    if (connectionId) filter.connectionId = connectionId;
    return DkvCard.find(filter).lean();
  }

  async getByDriver(driverName, connectionId = null) {
    const filter = { driverName: new RegExp(driverName, 'i') };
    if (connectionId) filter.connectionId = connectionId;
    return DkvCard.find(filter).lean();
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  async getStatsByStatus(connectionId = null) {
    const match = {};
    if (connectionId) match.connectionId = connectionId;

    return DkvCard.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);
  }

  async getStatsByType(connectionId = null) {
    const match = {};
    if (connectionId) match.connectionId = connectionId;

    return DkvCard.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$cardType',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);
  }

  async getGlobalStats(connectionId = null) {
    const match = {};
    if (connectionId) match.connectionId = connectionId;

    const [stats] = await DkvCard.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalCards: { $sum: 1 },
          activeCards: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          blockedCards: { $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] } },
          expiredCards: { $sum: { $cond: [{ $lt: ['$expiryDate', new Date()] }, 1, 0] } },
          cardsWithVehicle: { $sum: { $cond: [{ $ne: ['$vehiclePlate', null] }, 1, 0] } },
          cardsWithDriver: { $sum: { $cond: [{ $ne: ['$driverName', null] }, 1, 0] } },
          uniqueVehicles: { $addToSet: '$vehiclePlate' },
        },
      },
      {
        $project: {
          totalCards: 1,
          activeCards: 1,
          blockedCards: 1,
          expiredCards: 1,
          cardsWithVehicle: 1,
          cardsWithDriver: 1,
          uniqueVehiclesCount: { $size: { $filter: { input: '$uniqueVehicles', cond: { $ne: ['$$this', null] } } } },
        },
      },
    ]);

    return stats || { totalCards: 0 };
  }

  // ============================================================================
  // Search
  // ============================================================================

  async search(term, connectionId = null, options = {}) {
    const filter = {
      $or: [
        { cardNumber: new RegExp(term, 'i') },
        { embossedName: new RegExp(term, 'i') },
        { vehiclePlate: new RegExp(term, 'i') },
        { driverName: new RegExp(term, 'i') },
      ],
    };
    if (connectionId) filter.connectionId = connectionId;

    const { limit = 50 } = options;

    return DkvCard.find(filter).limit(limit).lean();
  }

  // ============================================================================
  // Data Freshness
  // ============================================================================

  async getDataFreshness(connectionId = null) {
    const filter = {};
    if (connectionId) filter.connectionId = connectionId;

    const latest = await DkvCard.findOne(filter)
      .sort({ syncedAt: -1 })
      .select('syncedAt')
      .lean();

    return {
      lastSyncedAt: latest?.syncedAt,
      isStale: latest ? (Date.now() - new Date(latest.syncedAt).getTime() > 3600000) : true,
    };
  }

  async count(filters = {}, connectionId = null) {
    const query = { ...filters };
    if (connectionId) query.connectionId = connectionId;
    return DkvCard.countDocuments(query);
  }
}

module.exports = { CardsReader };
