/**
 * Contacts Reader
 * Interface pour lire les contacts/utilisateurs depuis le Data Lake MongoDB
 *
 * IMPORTANT: Ce reader remplace les appels API directs vers Dashdoc
 * Les contacts sont les utilisateurs Dashdoc (managers, chauffeurs, etc.)
 */

const { COLLECTIONS } = require('../../../models/dashdoc-datalake');

class ContactsReader {
  constructor(db) {
    this.db = db;
    this.contactsCollection = db.collection(COLLECTIONS.CONTACTS);
    this.companiesCollection = db.collection(COLLECTIONS.COMPANIES);
  }

  /**
   * Récupérer tous les contacts d'une connexion
   * @param {string} connectionId - ID de la connexion (multi-tenant)
   * @param {Object} options - Options de pagination et tri
   */
  async getAll(connectionId, options = {}) {
    const { limit = 500, skip = 0, sort = { lastName: 1, firstName: 1 } } = options;

    const query = {};
    if (connectionId) query.connectionId = connectionId;

    const [results, total] = await Promise.all([
      this.contactsCollection.find(query).sort(sort).skip(skip).limit(limit).toArray(),
      this.contactsCollection.countDocuments(query)
    ]);

    return {
      results,
      total,
      page: Math.floor(skip / limit) + 1,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Récupérer un contact par PK Dashdoc
   */
  async getByPk(dashdocPk, connectionId = null) {
    const query = { dashdocPk: parseInt(dashdocPk) };
    if (connectionId) query.connectionId = connectionId;
    return this.contactsCollection.findOne(query);
  }

  /**
   * Récupérer un contact par email
   */
  async getByEmail(email, connectionId = null) {
    const query = { email: email.toLowerCase() };
    if (connectionId) query.connectionId = connectionId;
    return this.contactsCollection.findOne(query);
  }

  /**
   * Récupérer les contacts d'une entreprise
   */
  async getByCompany(companyPk, connectionId = null, options = {}) {
    const { limit = 100 } = options;

    const query = { companyPk: parseInt(companyPk) };
    if (connectionId) query.connectionId = connectionId;

    return this.contactsCollection.find(query).limit(limit).toArray();
  }

  /**
   * Rechercher des contacts par nom ou email
   */
  async search(searchTerm, connectionId = null, options = {}) {
    const { limit = 50 } = options;

    const query = {
      $or: [
        { firstName: { $regex: searchTerm, $options: 'i' } },
        { lastName: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } },
        { phoneNumber: { $regex: searchTerm, $options: 'i' } }
      ]
    };

    if (connectionId) query.connectionId = connectionId;

    return this.contactsCollection.find(query).limit(limit).toArray();
  }

  /**
   * Récupérer les contacts par rôle
   * @param {string} role - Rôle du contact (manager, driver, admin, etc.)
   */
  async getByRole(role, connectionId = null, options = {}) {
    const { limit = 100 } = options;

    const query = { role };
    if (connectionId) query.connectionId = connectionId;

    return this.contactsCollection.find(query).limit(limit).toArray();
  }

  /**
   * Récupérer les contacts avec enrichissement entreprise
   */
  async getWithCompanyInfo(connectionId, options = {}) {
    const { limit = 100, skip = 0 } = options;

    const matchStage = {};
    if (connectionId) matchStage.connectionId = connectionId;

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: COLLECTIONS.COMPANIES,
          localField: 'companyPk',
          foreignField: 'dashdocPk',
          as: 'company'
        }
      },
      {
        $addFields: {
          company: { $arrayElemAt: ['$company', 0] }
        }
      },
      {
        $project: {
          '_rawData': 0,
          'company._rawData': 0
        }
      },
      { $skip: skip },
      { $limit: limit }
    ];

    return this.contactsCollection.aggregate(pipeline).toArray();
  }

  /**
   * Récupérer les managers (contacts avec droits d'administration)
   */
  async getManagers(connectionId = null, options = {}) {
    const { limit = 100 } = options;

    const query = {
      $or: [
        { role: 'manager' },
        { role: 'admin' },
        { isManager: true }
      ]
    };
    if (connectionId) query.connectionId = connectionId;

    return this.contactsCollection.find(query).limit(limit).toArray();
  }

  /**
   * Statistiques globales des contacts
   */
  async getGlobalStats(connectionId) {
    const matchStage = {};
    if (connectionId) matchStage.connectionId = connectionId;

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalContacts: { $sum: 1 },
          withEmail: {
            $sum: { $cond: [{ $and: [{ $ne: ['$email', null] }, { $ne: ['$email', ''] }] }, 1, 0] }
          },
          withPhone: {
            $sum: { $cond: [{ $and: [{ $ne: ['$phoneNumber', null] }, { $ne: ['$phoneNumber', ''] }] }, 1, 0] }
          },
          managers: {
            $sum: { $cond: [{ $eq: ['$role', 'manager'] }, 1, 0] }
          }
        }
      }
    ];

    const result = await this.contactsCollection.aggregate(pipeline).toArray();
    return result[0] || { totalContacts: 0, withEmail: 0, withPhone: 0, managers: 0 };
  }

  /**
   * Grouper les contacts par entreprise
   */
  async groupByCompany(connectionId, options = {}) {
    const { limit = 50 } = options;

    const matchStage = {};
    if (connectionId) matchStage.connectionId = connectionId;

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$companyPk',
          contacts: { $push: { firstName: '$firstName', lastName: '$lastName', email: '$email', role: '$role' } },
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: COLLECTIONS.COMPANIES,
          localField: '_id',
          foreignField: 'dashdocPk',
          as: 'company'
        }
      },
      {
        $addFields: {
          companyName: { $arrayElemAt: ['$company.name', 0] }
        }
      },
      { $project: { company: 0 } },
      { $sort: { count: -1 } },
      { $limit: limit }
    ];

    return this.contactsCollection.aggregate(pipeline).toArray();
  }

  /**
   * Compter les contacts
   */
  async count(connectionId = null) {
    const query = {};
    if (connectionId) query.connectionId = connectionId;
    return this.contactsCollection.countDocuments(query);
  }

  /**
   * Vérifier la fraîcheur des données
   */
  async getDataFreshness(connectionId) {
    const query = {};
    if (connectionId) query.connectionId = connectionId;

    const latest = await this.contactsCollection.findOne(
      query,
      { sort: { syncedAt: -1 }, projection: { syncedAt: 1 } }
    );

    return {
      lastSyncedAt: latest?.syncedAt,
      isFresh: latest?.syncedAt && (Date.now() - latest.syncedAt.getTime()) < 5 * 60 * 1000 // < 5 min
    };
  }
}

module.exports = ContactsReader;
