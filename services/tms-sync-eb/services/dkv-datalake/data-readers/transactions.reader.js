/**
 * DKV Transactions Reader
 *
 * Provides read access to DKV transaction data from MongoDB
 */

const { DkvTransaction } = require('../../../models/dkv-datalake');

class TransactionsReader {
  constructor(db) {
    this.db = db;
  }

  // ============================================================================
  // Basic Queries
  // ============================================================================

  async getById(transactionId, connectionId = null) {
    const filter = { transactionId };
    if (connectionId) filter.connectionId = connectionId;
    return DkvTransaction.findOne(filter).lean();
  }

  async getAll(connectionId = null, options = {}) {
    const filter = {};
    if (connectionId) filter.connectionId = connectionId;

    const {
      page = 1,
      limit = 50,
      sortBy = 'transactionDate',
      sortOrder = -1,
    } = options;

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      DkvTransaction.find(filter)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      DkvTransaction.countDocuments(filter),
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
      sortBy = 'transactionDate',
      sortOrder = -1,
    } = options;

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      DkvTransaction.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      DkvTransaction.countDocuments(query),
    ]);

    return {
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  // ============================================================================
  // Filtered Queries
  // ============================================================================

  async getByCard(cardNumber, connectionId = null, options = {}) {
    return this.find({ cardNumber }, options, connectionId);
  }

  async getByVehicle(vehiclePlate, connectionId = null, options = {}) {
    return this.find({ vehiclePlate }, options, connectionId);
  }

  async getByDateRange(fromDate, toDate, connectionId = null, options = {}) {
    const filter = {
      transactionDate: {
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      },
    };
    return this.find(filter, options, connectionId);
  }

  async getByCountry(country, connectionId = null, options = {}) {
    return this.find({ stationCountry: country }, options, connectionId);
  }

  async getByProduct(productName, connectionId = null, options = {}) {
    return this.find({ productName: new RegExp(productName, 'i') }, options, connectionId);
  }

  async getUnbilled(connectionId = null, options = {}) {
    return this.find({ billed: false }, options, connectionId);
  }

  async getByInvoice(invoiceNumber, connectionId = null, options = {}) {
    return this.find({ invoiceNumber }, options, connectionId);
  }

  // ============================================================================
  // Recent Transactions
  // ============================================================================

  async getRecent(daysBack = 7, connectionId = null, options = {}) {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);

    return this.getByDateRange(fromDate, new Date(), connectionId, options);
  }

  async getToday(connectionId = null, options = {}) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.getByDateRange(today, tomorrow, connectionId, options);
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  async getStatsByCard(connectionId = null) {
    const match = {};
    if (connectionId) match.connectionId = connectionId;

    return DkvTransaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$cardNumber',
          totalTransactions: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalAmount: { $sum: '$grossAmount' },
          avgQuantity: { $avg: '$quantity' },
          avgAmount: { $avg: '$grossAmount' },
          firstTransaction: { $min: '$transactionDate' },
          lastTransaction: { $max: '$transactionDate' },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);
  }

  async getStatsByVehicle(connectionId = null) {
    const match = { vehiclePlate: { $exists: true, $ne: null } };
    if (connectionId) match.connectionId = connectionId;

    return DkvTransaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$vehiclePlate',
          totalTransactions: { $sum: 1 },
          totalLiters: { $sum: '$quantity' },
          totalCost: { $sum: '$grossAmount' },
          avgLiters: { $avg: '$quantity' },
          avgCost: { $avg: '$grossAmount' },
          lastRefuel: { $max: '$transactionDate' },
          countries: { $addToSet: '$stationCountry' },
        },
      },
      { $sort: { totalCost: -1 } },
    ]);
  }

  async getStatsByCountry(connectionId = null) {
    const match = {};
    if (connectionId) match.connectionId = connectionId;

    return DkvTransaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$stationCountry',
          totalTransactions: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalAmount: { $sum: '$grossAmount' },
          avgUnitPrice: { $avg: '$unitPrice' },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);
  }

  async getStatsByProduct(connectionId = null) {
    const match = {};
    if (connectionId) match.connectionId = connectionId;

    return DkvTransaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$productName',
          totalTransactions: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalAmount: { $sum: '$grossAmount' },
          avgUnitPrice: { $avg: '$unitPrice' },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);
  }

  async getStatsByMonth(connectionId = null, year = null) {
    const match = {};
    if (connectionId) match.connectionId = connectionId;
    if (year) {
      match.transactionDate = {
        $gte: new Date(`${year}-01-01`),
        $lt: new Date(`${year + 1}-01-01`),
      };
    }

    return DkvTransaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            year: { $year: '$transactionDate' },
            month: { $month: '$transactionDate' },
          },
          totalTransactions: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalAmount: { $sum: '$grossAmount' },
          avgUnitPrice: { $avg: '$unitPrice' },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
    ]);
  }

  async getGlobalStats(connectionId = null) {
    const match = {};
    if (connectionId) match.connectionId = connectionId;

    const [stats] = await DkvTransaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalAmount: { $sum: '$grossAmount' },
          totalUnbilled: { $sum: { $cond: ['$billed', 0, 1] } },
          unbilledAmount: { $sum: { $cond: ['$billed', 0, '$grossAmount'] } },
          avgQuantity: { $avg: '$quantity' },
          avgAmount: { $avg: '$grossAmount' },
          avgUnitPrice: { $avg: '$unitPrice' },
          uniqueCards: { $addToSet: '$cardNumber' },
          uniqueVehicles: { $addToSet: '$vehiclePlate' },
          uniqueCountries: { $addToSet: '$stationCountry' },
          firstTransaction: { $min: '$transactionDate' },
          lastTransaction: { $max: '$transactionDate' },
        },
      },
      {
        $project: {
          totalTransactions: 1,
          totalQuantity: 1,
          totalAmount: 1,
          totalUnbilled: 1,
          unbilledAmount: 1,
          avgQuantity: 1,
          avgAmount: 1,
          avgUnitPrice: 1,
          uniqueCardsCount: { $size: '$uniqueCards' },
          uniqueVehiclesCount: { $size: '$uniqueVehicles' },
          uniqueCountriesCount: { $size: '$uniqueCountries' },
          firstTransaction: 1,
          lastTransaction: 1,
        },
      },
    ]);

    return stats || {
      totalTransactions: 0,
      totalQuantity: 0,
      totalAmount: 0,
    };
  }

  // ============================================================================
  // Geospatial Queries
  // ============================================================================

  async findNearStation(longitude, latitude, maxDistanceKm = 50, connectionId = null) {
    const filter = {
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude],
          },
          $maxDistance: maxDistanceKm * 1000,
        },
      },
    };
    if (connectionId) filter.connectionId = connectionId;

    return DkvTransaction.find(filter).limit(100).lean();
  }

  // ============================================================================
  // Search
  // ============================================================================

  async search(term, connectionId = null, options = {}) {
    const filter = {
      $text: { $search: term },
    };
    if (connectionId) filter.connectionId = connectionId;

    const { limit = 50 } = options;

    return DkvTransaction.find(filter, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .lean();
  }

  // ============================================================================
  // Data Freshness
  // ============================================================================

  async getDataFreshness(connectionId = null) {
    const filter = {};
    if (connectionId) filter.connectionId = connectionId;

    const latest = await DkvTransaction.findOne(filter)
      .sort({ syncedAt: -1 })
      .select('syncedAt transactionDate')
      .lean();

    return {
      lastSyncedAt: latest?.syncedAt,
      latestTransaction: latest?.transactionDate,
      isStale: latest ? (Date.now() - new Date(latest.syncedAt).getTime() > 3600000) : true,
    };
  }

  async count(filters = {}, connectionId = null) {
    const query = { ...filters };
    if (connectionId) query.connectionId = connectionId;
    return DkvTransaction.countDocuments(query);
  }
}

module.exports = { TransactionsReader };
