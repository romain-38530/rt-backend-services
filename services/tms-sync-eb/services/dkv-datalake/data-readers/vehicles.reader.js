/**
 * DKV Vehicles Reader
 *
 * Provides read access to DKV vehicle data from MongoDB
 */

const { DkvVehicle } = require('../../../models/dkv-datalake');

class VehiclesReader {
  constructor(db) {
    this.db = db;
  }

  // ============================================================================
  // Basic Queries
  // ============================================================================

  async getByPlate(licensePlate, connectionId = null) {
    const filter = { licensePlate };
    if (connectionId) filter.connectionId = connectionId;
    return DkvVehicle.findOne(filter).lean();
  }

  async getById(vehicleId, connectionId = null) {
    const filter = { vehicleId };
    if (connectionId) filter.connectionId = connectionId;
    return DkvVehicle.findOne(filter).lean();
  }

  async getAll(connectionId = null, options = {}) {
    const filter = {};
    if (connectionId) filter.connectionId = connectionId;

    const {
      page = 1,
      limit = 50,
      sortBy = 'licensePlate',
      sortOrder = 1,
    } = options;

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      DkvVehicle.find(filter)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      DkvVehicle.countDocuments(filter),
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

  // ============================================================================
  // Filtered Queries
  // ============================================================================

  async getByType(type, connectionId = null, options = {}) {
    const filter = { type };
    if (connectionId) filter.connectionId = connectionId;

    const { page = 1, limit = 50 } = options;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      DkvVehicle.find(filter).skip(skip).limit(limit).lean(),
      DkvVehicle.countDocuments(filter),
    ]);

    return {
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getByFuelType(fuelType, connectionId = null, options = {}) {
    const filter = { fuelType };
    if (connectionId) filter.connectionId = connectionId;

    const { page = 1, limit = 50 } = options;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      DkvVehicle.find(filter).skip(skip).limit(limit).lean(),
      DkvVehicle.countDocuments(filter),
    ]);

    return {
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getWithTollBox(connectionId = null, options = {}) {
    const filter = { tollBoxId: { $exists: true, $ne: null } };
    if (connectionId) filter.connectionId = connectionId;

    const { page = 1, limit = 50 } = options;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      DkvVehicle.find(filter).skip(skip).limit(limit).lean(),
      DkvVehicle.countDocuments(filter),
    ]);

    return {
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  // ============================================================================
  // Statistics & Analytics
  // ============================================================================

  async getTopConsumers(limit = 10, connectionId = null) {
    const match = {};
    if (connectionId) match.connectionId = connectionId;

    return DkvVehicle.find(match)
      .sort({ 'stats.totalFuelCost': -1 })
      .limit(limit)
      .lean();
  }

  async getStatsByType(connectionId = null) {
    const match = {};
    if (connectionId) match.connectionId = connectionId;

    return DkvVehicle.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalFuelLiters: { $sum: '$stats.totalFuelLiters' },
          totalFuelCost: { $sum: '$stats.totalFuelCost' },
          avgConsumption: { $avg: '$stats.avgConsumption' },
        },
      },
      { $sort: { count: -1 } },
    ]);
  }

  async getStatsByFuelType(connectionId = null) {
    const match = {};
    if (connectionId) match.connectionId = connectionId;

    return DkvVehicle.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$fuelType',
          count: { $sum: 1 },
          totalFuelLiters: { $sum: '$stats.totalFuelLiters' },
          totalFuelCost: { $sum: '$stats.totalFuelCost' },
        },
      },
      { $sort: { count: -1 } },
    ]);
  }

  async getGlobalStats(connectionId = null) {
    const match = {};
    if (connectionId) match.connectionId = connectionId;

    const [stats] = await DkvVehicle.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalVehicles: { $sum: 1 },
          totalFuelLiters: { $sum: '$stats.totalFuelLiters' },
          totalFuelCost: { $sum: '$stats.totalFuelCost' },
          totalTollCost: { $sum: '$stats.totalTollCost' },
          totalKm: { $sum: '$stats.totalKm' },
          vehiclesWithTollBox: { $sum: { $cond: [{ $ne: ['$tollBoxId', null] }, 1, 0] } },
          avgConsumption: { $avg: '$stats.avgConsumption' },
        },
      },
    ]);

    return stats || { totalVehicles: 0 };
  }

  // ============================================================================
  // Search
  // ============================================================================

  async search(term, connectionId = null, options = {}) {
    const filter = {
      $or: [
        { licensePlate: new RegExp(term, 'i') },
        { brand: new RegExp(term, 'i') },
        { model: new RegExp(term, 'i') },
        { vin: new RegExp(term, 'i') },
      ],
    };
    if (connectionId) filter.connectionId = connectionId;

    const { limit = 50 } = options;

    return DkvVehicle.find(filter).limit(limit).lean();
  }

  async count(filters = {}, connectionId = null) {
    const query = { ...filters };
    if (connectionId) query.connectionId = connectionId;
    return DkvVehicle.countDocuments(query);
  }
}

module.exports = { VehiclesReader };
