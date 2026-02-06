/**
 * Dashdoc Update Connector
 * Extension du connecteur Dashdoc pour les opérations de mise à jour (PATCH/PUT)
 *
 * ARCHITECTURE HYBRIDE:
 * 1. Écriture directe vers Dashdoc API (source de vérité)
 * 2. Mise à jour immédiate du Data Lake MongoDB (pour lecture locale)
 *
 * ⚠️ RATE LIMITING: Maximum 10 req/s vers Dashdoc
 * - Utilise le rate limiter global de dashdoc.connector.js
 * - Appliqué aux appels API fallback (quand Data Lake échoue)
 *
 * Gère la synchronisation bidirectionnelle SYMPHONI.A → Dashdoc:
 * - Mise à jour des transporteurs assignés
 * - Mise à jour des prix de vente
 * - Mise à jour des moyens (véhicules, chauffeurs)
 * - Mise à jour du statut
 * - Ajout d'événements Tracking IA
 */

const axios = require('axios');

/**
 * Rate Limiter simple pour les appels API fallback
 * Partagé avec dashdoc.connector.js si possible
 */
class SimpleRateLimiter {
  constructor(minDelayMs = 150) {
    this.minDelayMs = minDelayMs;
    this.lastRequestTime = 0;
  }

  async throttle() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < this.minDelayMs) {
      const waitTime = this.minDelayMs - elapsed;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }
}

// Rate limiter pour les appels API fallback
const apiRateLimiter = new SimpleRateLimiter(150);

class DashdocUpdateConnector {
  constructor(apiToken, options = {}) {
    this.apiToken = apiToken;
    this.baseUrl = options.baseUrl || 'https://www.dashdoc.eu/api/v4';
    this.timeout = options.timeout || 30000;
    this.connectionId = options.connectionId || null;

    // ✅ NOUVEAU: Connexion Data Lake pour synchronisation immédiate
    this.datalakeDb = options.datalakeDb || null;

    // ⚠️ Rate limiter pour les appels API
    this.rateLimiter = apiRateLimiter;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Authorization': `Token ${this.apiToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Configurer la connexion Data Lake
   * @param {Db} db - Instance MongoDB
   * @param {String} connectionId - ID de connexion pour multi-tenant
   */
  setDatalakeConnection(db, connectionId = null) {
    this.datalakeDb = db;
    this.connectionId = connectionId;
    console.log('[Dashdoc Update] Data Lake connection configured');
  }

  /**
   * Synchroniser un transport vers le Data Lake après mise à jour Dashdoc
   * @param {String} transportUid - UID du transport
   * @param {Object} updatedTransport - Données du transport mis à jour
   */
  async syncToDataLake(transportUid, updatedTransport) {
    if (!this.datalakeDb) {
      console.log('[Dashdoc Update] Data Lake non configuré, skip sync local');
      return;
    }

    try {
      const collection = this.datalakeDb.collection('dashdoc_transports');

      await collection.updateOne(
        { dashdocUid: transportUid },
        {
          $set: {
            _rawData: updatedTransport,
            status: updatedTransport.status,
            'carrier.externalId': updatedTransport.carrier_address?.company?.pk,
            'carrier.name': updatedTransport.carrier_address?.company?.name,
            'pricing.purchaseCost': updatedTransport.purchase_cost_total,
            'pricing.sellingPrice': updatedTransport.pricing_total_price,
            syncedAt: new Date(),
            lastWriteAt: new Date()
          }
        },
        { upsert: false }
      );

      console.log(`[Dashdoc Update] ✅ Data Lake synchronisé pour transport ${transportUid}`);
    } catch (error) {
      console.error(`[Dashdoc Update] ⚠️ Erreur sync Data Lake:`, error.message);
      // Ne pas bloquer si Data Lake échoue
    }
  }

  /**
   * Mettre à jour un transport avec les informations d'affectation Affret.IA
   *
   * @param {String} transportUid - UID du transport Dashdoc
   * @param {Object} assignmentData - Données d'affectation depuis Affret.IA
   * @param {String} assignmentData.carrierId - ID du transporteur dans Dashdoc
   * @param {Number} assignmentData.agreedPrice - Prix convenu (coût d'achat)
   * @param {Number} assignmentData.sellingPrice - Prix de vente (facultatif)
   * @param {String} assignmentData.vehicleUid - UID du véhicule (facultatif)
   * @param {String} assignmentData.driverUid - UID du chauffeur (facultatif)
   * @param {String} assignmentData.trailerUid - UID de la remorque (facultatif)
   *
   * @returns {Promise<Object>} Transport mis à jour
   */
  async updateTransportAssignment(transportUid, assignmentData) {
    try {
      const payload = this.buildAssignmentPayload(assignmentData);

      console.log(`[Dashdoc Update] Mise à jour transport ${transportUid}...`);
      console.log(`[Dashdoc Update] Payload:`, JSON.stringify(payload, null, 2));

      // ⚠️ RATE LIMITING: Attendre avant l'appel API
      await this.rateLimiter.throttle();

      // 1. Écriture directe vers Dashdoc API
      const response = await this.client.patch(`/transports/${transportUid}/`, payload);

      console.log(`[Dashdoc Update] ✅ Transport ${transportUid} mis à jour avec succès`);

      // 2. ✅ NOUVEAU: Synchronisation immédiate vers Data Lake
      await this.syncToDataLake(transportUid, response.data);

      return {
        success: true,
        transport: response.data,
        message: `Transport ${transportUid} mis à jour`,
        datalakeSynced: !!this.datalakeDb
      };
    } catch (error) {
      console.error(`[Dashdoc Update] ❌ Erreur mise à jour transport ${transportUid}:`, error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data || error.message,
        message: `Échec mise à jour transport ${transportUid}`
      };
    }
  }

  /**
   * Construire le payload pour l'assignation d'un transport
   *
   * Format Dashdoc API v4:
   * {
   *   "carrier_address": integer (pk de l'adresse du transporteur),
   *   "requested_vehicle": string (UID du véhicule),
   *   "assigned_trucker": string (UID du chauffeur),
   *   "assigned_trailer": string (UID de la remorque),
   *   "purchase_cost_total": number (prix d'achat TTC),
   *   "pricing_total_price": number (prix de vente TTC),
   *   "status": string (statut)
   * }
   */
  buildAssignmentPayload(assignmentData) {
    const payload = {};

    // Transporteur assigné (carrier_address = pk de l'adresse)
    if (assignmentData.carrierAddressPk) {
      payload.carrier_address = assignmentData.carrierAddressPk;
    }

    // Prix d'achat (coût sous-traitant)
    if (assignmentData.agreedPrice !== undefined) {
      payload.purchase_cost_total = assignmentData.agreedPrice;
    }

    // Prix de vente (facultatif)
    if (assignmentData.sellingPrice !== undefined) {
      payload.pricing_total_price = assignmentData.sellingPrice;
    }

    // Véhicule
    if (assignmentData.vehicleUid) {
      payload.requested_vehicle = assignmentData.vehicleUid;
    }

    // Chauffeur
    if (assignmentData.driverUid) {
      payload.assigned_trucker = assignmentData.driverUid;
    }

    // Remorque
    if (assignmentData.trailerUid) {
      payload.assigned_trailer = assignmentData.trailerUid;
    }

    // Statut (passer à "assigned" si transporteur assigné)
    if (assignmentData.carrierAddressPk && !assignmentData.status) {
      payload.status = 'assigned';
    } else if (assignmentData.status) {
      payload.status = assignmentData.status;
    }

    return payload;
  }

  /**
   * Mettre à jour uniquement le transporteur assigné
   */
  async updateCarrierAssignment(transportUid, carrierAddressPk) {
    return this.updateTransportAssignment(transportUid, {
      carrierAddressPk,
      status: 'assigned'
    });
  }

  /**
   * Mettre à jour uniquement le prix d'achat
   */
  async updatePurchaseCost(transportUid, purchaseCost) {
    return this.updateTransportAssignment(transportUid, {
      agreedPrice: purchaseCost
    });
  }

  /**
   * Mettre à jour uniquement le prix de vente
   */
  async updateSellingPrice(transportUid, sellingPrice) {
    return this.updateTransportAssignment(transportUid, {
      sellingPrice
    });
  }

  /**
   * Mettre à jour les moyens (véhicule + chauffeur + remorque)
   */
  async updateTransportMeans(transportUid, vehicleUid, driverUid, trailerUid = null) {
    return this.updateTransportAssignment(transportUid, {
      vehicleUid,
      driverUid,
      trailerUid
    });
  }

  /**
   * Mettre à jour le statut d'un transport
   */
  async updateTransportStatus(transportUid, status) {
    return this.updateTransportAssignment(transportUid, {
      status
    });
  }

  /**
   * Récupérer l'adresse principale (carrier_address) d'un transporteur par company PK
   * Nécessaire pour assigner le transporteur à un transport
   *
   * ✅ DATA LAKE: Lecture depuis MongoDB avec fallback API
   */
  async getCarrierAddress(companyPk) {
    // ✅ PRIORITÉ: Lecture depuis Data Lake
    if (this.datalakeDb) {
      try {
        const company = await this.datalakeDb.collection('dashdoc_companies').findOne({
          dashdocPk: parseInt(companyPk)
        });

        if (company && company._rawData) {
          const rawData = company._rawData;

          // L'adresse principale utilisée pour carrier_address
          if (rawData.primary_address && rawData.primary_address.pk) {
            console.log(`[Dashdoc Update] ✅ Adresse company ${companyPk} lue depuis Data Lake`);
            return {
              success: true,
              addressPk: rawData.primary_address.pk,
              address: rawData.primary_address,
              source: 'datalake'
            };
          }

          // Fallback: chercher dans les adresses
          if (rawData.addresses && rawData.addresses.length > 0) {
            const firstAddress = rawData.addresses[0];
            console.log(`[Dashdoc Update] ✅ Adresse (fallback) company ${companyPk} lue depuis Data Lake`);
            return {
              success: true,
              addressPk: firstAddress.pk,
              address: firstAddress,
              source: 'datalake'
            };
          }
        }
        // Company trouvée mais sans adresse - pas besoin d'appeler l'API
        if (company) {
          return {
            success: false,
            error: 'Aucune adresse trouvée pour ce transporteur',
            message: `Company ${companyPk} sans adresse (Data Lake)`,
            source: 'datalake'
          };
        }
        // Company non trouvée dans Data Lake - fallback API
        console.log(`[Dashdoc Update] Company ${companyPk} non trouvée dans Data Lake, fallback API`);
      } catch (dlError) {
        console.warn(`[Dashdoc Update] Erreur Data Lake, fallback API:`, dlError.message);
      }
    }

    // ⚠️ FALLBACK: Appel API direct Dashdoc (rate limited)
    try {
      console.log(`[Dashdoc Update] ⚠️ Appel API direct pour company ${companyPk}`);
      await this.rateLimiter.throttle();
      const response = await this.client.get(`/companies/${companyPk}/`);
      const company = response.data;

      // L'adresse principale utilisée pour carrier_address
      if (company.primary_address && company.primary_address.pk) {
        return {
          success: true,
          addressPk: company.primary_address.pk,
          address: company.primary_address,
          source: 'api'
        };
      }

      // Fallback: chercher dans les adresses
      if (company.addresses && company.addresses.length > 0) {
        const firstAddress = company.addresses[0];
        return {
          success: true,
          addressPk: firstAddress.pk,
          address: firstAddress,
          source: 'api'
        };
      }

      return {
        success: false,
        error: 'Aucune adresse trouvée pour ce transporteur',
        message: `Company ${companyPk} sans adresse`,
        source: 'api'
      };
    } catch (error) {
      console.error(`[Dashdoc Update] Erreur récupération adresse company ${companyPk}:`, error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data || error.message,
        message: `Échec récupération adresse company ${companyPk}`
      };
    }
  }

  /**
   * Récupérer les véhicules d'un transporteur
   *
   * ✅ DATA LAKE: Lecture depuis MongoDB avec fallback API
   */
  async getCarrierVehicles(companyPk) {
    // ✅ PRIORITÉ: Lecture depuis Data Lake
    if (this.datalakeDb) {
      try {
        const vehicles = await this.datalakeDb.collection('dashdoc_vehicles')
          .find({ carrierPk: parseInt(companyPk) })
          .toArray();

        if (vehicles.length > 0) {
          console.log(`[Dashdoc Update] ✅ ${vehicles.length} véhicules company ${companyPk} lus depuis Data Lake`);
          return {
            success: true,
            vehicles: vehicles.map(v => v._rawData || v),
            count: vehicles.length,
            source: 'datalake'
          };
        }
        // Aucun véhicule trouvé - vérifier si c'est normal ou fallback API
        console.log(`[Dashdoc Update] Aucun véhicule pour company ${companyPk} dans Data Lake, fallback API`);
      } catch (dlError) {
        console.warn(`[Dashdoc Update] Erreur Data Lake véhicules, fallback API:`, dlError.message);
      }
    }

    // ⚠️ FALLBACK: Appel API direct Dashdoc (rate limited)
    try {
      console.log(`[Dashdoc Update] ⚠️ Appel API direct véhicules company ${companyPk}`);
      await this.rateLimiter.throttle();
      const response = await this.client.get(`/vehicles/?company=${companyPk}`);

      return {
        success: true,
        vehicles: response.data.results || [],
        count: response.data.count || 0,
        source: 'api'
      };
    } catch (error) {
      console.error(`[Dashdoc Update] Erreur récupération véhicules company ${companyPk}:`, error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data || error.message,
        vehicles: []
      };
    }
  }

  /**
   * Récupérer les chauffeurs d'un transporteur
   *
   * ✅ DATA LAKE ONLY: Lecture depuis MongoDB (truckers + transports)
   * Note: L'API /manager-truckers/?carrier=X retourne des erreurs, donc on utilise uniquement le Data Lake
   */
  async getCarrierDrivers(companyPk) {
    if (!this.datalakeDb) {
      console.warn(`[Dashdoc Update] Data Lake non disponible pour chauffeurs company ${companyPk}`);
      return { success: false, drivers: [], error: 'Data Lake non disponible' };
    }

    try {
      // 1. Chercher d'abord dans la collection dashdoc_truckers
      const drivers = await this.datalakeDb.collection('dashdoc_truckers')
        .find({ carrierPk: parseInt(companyPk) })
        .toArray();

      if (drivers.length > 0) {
        console.log(`[Dashdoc Update] ✅ ${drivers.length} chauffeurs company ${companyPk} lus depuis Data Lake truckers`);
        return {
          success: true,
          drivers: drivers.map(d => d._rawData || d),
          count: drivers.length,
          source: 'datalake_truckers'
        };
      }

      // 2. Fallback: Extraire les chauffeurs depuis les transports assignés à ce carrier
      const transports = await this.datalakeDb.collection('dashdoc_transports')
        .find({
          'carrier.externalId': String(companyPk),
          'trucker.name': { $exists: true, $ne: null }
        })
        .project({ trucker: 1 })
        .toArray();

      // Dédupliquer les chauffeurs par nom
      const uniqueDrivers = new Map();
      for (const t of transports) {
        if (t.trucker?.name) {
          const key = t.trucker.name.toLowerCase();
          if (!uniqueDrivers.has(key)) {
            uniqueDrivers.set(key, {
              name: t.trucker.name,
              phone: t.trucker.phone || null,
              externalId: t.trucker.externalId || null
            });
          }
        }
      }

      const driversFromTransports = Array.from(uniqueDrivers.values());
      console.log(`[Dashdoc Update] ✅ ${driversFromTransports.length} chauffeurs company ${companyPk} extraits depuis transports`);

      return {
        success: true,
        drivers: driversFromTransports,
        count: driversFromTransports.length,
        source: 'datalake_transports'
      };
    } catch (dlError) {
      console.error(`[Dashdoc Update] Erreur Data Lake chauffeurs company ${companyPk}:`, dlError.message);
      return {
        success: false,
        error: dlError.message,
        drivers: []
      };
    }
  }

  /**
   * Rechercher un véhicule par plaque d'immatriculation
   *
   * ✅ DATA LAKE: Lecture depuis MongoDB avec fallback API
   */
  async findVehicleByPlate(licensePlate) {
    // Normaliser la plaque (sans espaces, majuscules)
    const normalizedPlate = licensePlate.replace(/[\s-]/g, '').toUpperCase();

    // ✅ PRIORITÉ: Lecture depuis Data Lake
    if (this.datalakeDb) {
      try {
        // Recherche exacte ou normalisée
        const vehicle = await this.datalakeDb.collection('dashdoc_vehicles').findOne({
          $or: [
            { licensePlate: licensePlate },
            { licensePlate: normalizedPlate },
            { 'licensePlate': { $regex: normalizedPlate, $options: 'i' } }
          ]
        });

        if (vehicle) {
          const rawData = vehicle._rawData || vehicle;
          console.log(`[Dashdoc Update] ✅ Véhicule plaque ${licensePlate} trouvé dans Data Lake`);
          return {
            success: true,
            vehicle: rawData,
            uid: rawData.uid || vehicle.dashdocUid,
            source: 'datalake'
          };
        }
        console.log(`[Dashdoc Update] Véhicule ${licensePlate} non trouvé dans Data Lake, fallback API`);
      } catch (dlError) {
        console.warn(`[Dashdoc Update] Erreur Data Lake findVehicle, fallback API:`, dlError.message);
      }
    }

    // ⚠️ FALLBACK: Appel API direct Dashdoc (rate limited)
    try {
      console.log(`[Dashdoc Update] ⚠️ Appel API direct recherche véhicule ${licensePlate}`);
      await this.rateLimiter.throttle();
      const response = await this.client.get(`/vehicles/?license_plate=${encodeURIComponent(licensePlate)}`);

      if (response.data.results && response.data.results.length > 0) {
        return {
          success: true,
          vehicle: response.data.results[0],
          uid: response.data.results[0].uid,
          source: 'api'
        };
      }

      return {
        success: false,
        error: 'Véhicule non trouvé',
        message: `Aucun véhicule avec plaque ${licensePlate}`
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
        message: `Erreur recherche véhicule ${licensePlate}`
      };
    }
  }

  /**
   * Rechercher un chauffeur par email ou nom
   *
   * ✅ DATA LAKE ONLY: Lecture depuis MongoDB (truckers + transports)
   * Note: L'API /manager-truckers/?email=X peut retourner des erreurs
   */
  async findDriverByEmail(email) {
    if (!this.datalakeDb) {
      console.warn(`[Dashdoc Update] Data Lake non disponible pour recherche chauffeur ${email}`);
      return { success: false, error: 'Data Lake non disponible', message: `Recherche chauffeur ${email} impossible` };
    }

    try {
      // 1. Chercher dans la collection dashdoc_truckers
      const driver = await this.datalakeDb.collection('dashdoc_truckers').findOne({
        email: { $regex: `^${email}$`, $options: 'i' }
      });

      if (driver) {
        const rawData = driver._rawData || driver;
        console.log(`[Dashdoc Update] ✅ Chauffeur ${email} trouvé dans Data Lake truckers`);
        return {
          success: true,
          driver: rawData,
          uid: rawData.uid || driver.dashdocUid,
          source: 'datalake_truckers'
        };
      }

      // 2. Fallback: Chercher par nom dans les transports (si email contient le nom)
      const searchName = email.split('@')[0].replace(/[._-]/g, ' ');
      const transport = await this.datalakeDb.collection('dashdoc_transports').findOne({
        'trucker.name': { $regex: searchName, $options: 'i' }
      });

      if (transport?.trucker) {
        console.log(`[Dashdoc Update] ✅ Chauffeur trouvé via transport (nom: ${transport.trucker.name})`);
        return {
          success: true,
          driver: transport.trucker,
          uid: transport.trucker.externalId,
          source: 'datalake_transports'
        };
      }

      console.log(`[Dashdoc Update] Chauffeur ${email} non trouvé dans Data Lake`);
      return {
        success: false,
        error: 'Chauffeur non trouvé',
        message: `Aucun chauffeur avec email ${email}`
      };
    } catch (dlError) {
      console.error(`[Dashdoc Update] Erreur Data Lake findDriver ${email}:`, dlError.message);
      return {
        success: false,
        error: dlError.message,
        message: `Erreur recherche chauffeur ${email}`
      };
    }
  }

  /**
   * Mettre à jour un transport avec assignation complète
   * Version high-level qui résout automatiquement les références
   *
   * @param {String} transportUid - UID du transport Dashdoc
   * @param {Object} assignment - Données d'affectation depuis Affret.IA
   * @param {String} assignment.carrierExternalId - External ID du transporteur (company PK)
   * @param {Number} assignment.finalPrice - Prix final négocié
   * @param {String} assignment.vehiclePlate - Plaque d'immatriculation (facultatif)
   * @param {String} assignment.driverEmail - Email du chauffeur (facultatif)
   */
  async assignTransportFull(transportUid, assignment) {
    try {
      console.log(`[Dashdoc Update] Assignation complète transport ${transportUid}...`);

      // 1. Récupérer carrier_address
      const carrierAddressResult = await this.getCarrierAddress(assignment.carrierExternalId);

      if (!carrierAddressResult.success) {
        throw new Error(`Impossible de récupérer l'adresse du transporteur: ${carrierAddressResult.error}`);
      }

      const assignmentData = {
        carrierAddressPk: carrierAddressResult.addressPk,
        agreedPrice: assignment.finalPrice
      };

      // 2. Résoudre véhicule si fourni
      if (assignment.vehiclePlate) {
        const vehicleResult = await this.findVehicleByPlate(assignment.vehiclePlate);
        if (vehicleResult.success) {
          assignmentData.vehicleUid = vehicleResult.uid;
          console.log(`[Dashdoc Update] Véhicule trouvé: ${assignment.vehiclePlate}`);
        } else {
          console.warn(`[Dashdoc Update] Véhicule ${assignment.vehiclePlate} non trouvé`);
        }
      }

      // 3. Résoudre chauffeur si fourni
      if (assignment.driverEmail) {
        const driverResult = await this.findDriverByEmail(assignment.driverEmail);
        if (driverResult.success) {
          assignmentData.driverUid = driverResult.uid;
          console.log(`[Dashdoc Update] Chauffeur trouvé: ${assignment.driverEmail}`);
        } else {
          console.warn(`[Dashdoc Update] Chauffeur ${assignment.driverEmail} non trouvé`);
        }
      }

      // 4. Prix de vente si fourni
      if (assignment.sellingPrice) {
        assignmentData.sellingPrice = assignment.sellingPrice;
      }

      // 5. Mise à jour du transport
      return await this.updateTransportAssignment(transportUid, assignmentData);

    } catch (error) {
      console.error(`[Dashdoc Update] Erreur assignation complète transport ${transportUid}:`, error.message);

      return {
        success: false,
        error: error.message,
        message: `Échec assignation complète transport ${transportUid}`
      };
    }
  }

  // ==================== TRACKING IA EVENTS ====================

  /**
   * Ajouter un événement Tracking IA sur un transport
   * Les événements sont ajoutés comme messages sur le transport Dashdoc
   *
   * @param {String} transportUid - UID du transport Dashdoc
   * @param {Object} trackingEvent - Événement Tracking IA
   * @param {String} trackingEvent.type - Type d'événement (position, eta, delay, alert, etc.)
   * @param {String} trackingEvent.message - Message descriptif
   * @param {Object} trackingEvent.data - Données additionnelles (coordonnées, temps, etc.)
   * @param {String} trackingEvent.source - Source de l'événement (tracking-ia, gps, driver, etc.)
   * @param {Date} trackingEvent.timestamp - Horodatage de l'événement
   */
  async addTrackingEvent(transportUid, trackingEvent) {
    try {
      const {
        type = 'tracking',
        message,
        data = {},
        source = 'tracking-ia',
        timestamp = new Date()
      } = trackingEvent;

      console.log(`[Dashdoc Update] Ajout événement Tracking IA sur transport ${transportUid}...`);

      // Format du message pour Dashdoc
      const formattedMessage = this.formatTrackingMessage(type, message, data, source, timestamp);

      // 1. Ajouter le message via l'API Dashdoc
      const response = await this.client.post(`/transports/${transportUid}/messages/`, {
        message: formattedMessage,
        document_type: 'message',
        visibility: 'internal' // Visible uniquement en interne (pas transporteur)
      });

      console.log(`[Dashdoc Update] ✅ Événement Tracking IA ajouté sur transport ${transportUid}`);

      // 2. Synchroniser l'événement vers Data Lake
      await this.syncTrackingEventToDataLake(transportUid, {
        type,
        message: formattedMessage,
        data,
        source,
        timestamp,
        dashdocMessageId: response.data?.pk || response.data?.id
      });

      return {
        success: true,
        messageId: response.data?.pk || response.data?.id,
        message: `Événement ajouté sur transport ${transportUid}`
      };
    } catch (error) {
      console.error(`[Dashdoc Update] ❌ Erreur ajout événement transport ${transportUid}:`, error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data || error.message,
        message: `Échec ajout événement transport ${transportUid}`
      };
    }
  }

  /**
   * Formater un message Tracking IA pour Dashdoc
   */
  formatTrackingMessage(type, message, data, source, timestamp) {
    const typeEmojis = {
      'position': '📍',
      'eta': '⏱️',
      'delay': '⚠️',
      'alert': '🚨',
      'arrival': '✅',
      'departure': '🚚',
      'loading': '📦',
      'unloading': '📤',
      'break': '☕',
      'incident': '🔴',
      'geofence_enter': '📥',
      'geofence_exit': '📤',
      'tracking': '🔔'
    };

    const emoji = typeEmojis[type] || '🔔';
    const formattedTime = new Date(timestamp).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    let formatted = `${emoji} [${source.toUpperCase()}] ${message}`;

    // Ajouter les données de position si présentes
    if (data.latitude && data.longitude) {
      formatted += `\n📍 Position: ${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)}`;
    }

    // Ajouter l'ETA si présent
    if (data.eta) {
      const etaTime = new Date(data.eta).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      formatted += `\n⏱️ ETA: ${etaTime}`;
    }

    // Ajouter le retard si présent
    if (data.delayMinutes) {
      formatted += `\n⏰ Retard estimé: ${data.delayMinutes} min`;
    }

    formatted += `\n🕐 ${formattedTime}`;

    return formatted;
  }

  /**
   * Synchroniser un événement Tracking vers le Data Lake
   */
  async syncTrackingEventToDataLake(transportUid, event) {
    if (!this.datalakeDb) return;

    try {
      const collection = this.datalakeDb.collection('dashdoc_transports');

      await collection.updateOne(
        { dashdocUid: transportUid },
        {
          $push: {
            trackingEvents: {
              ...event,
              syncedAt: new Date()
            }
          },
          $set: {
            lastTrackingEventAt: new Date(),
            'tracking.lastPosition': event.data?.latitude ? {
              latitude: event.data.latitude,
              longitude: event.data.longitude,
              updatedAt: event.timestamp
            } : undefined,
            'tracking.lastEta': event.data?.eta || undefined
          }
        }
      );

      console.log(`[Dashdoc Update] ✅ Événement Tracking synchronisé dans Data Lake`);
    } catch (error) {
      console.error(`[Dashdoc Update] ⚠️ Erreur sync événement Data Lake:`, error.message);
    }
  }

  /**
   * Mettre à jour la position GPS d'un transport
   *
   * @param {String} transportUid - UID du transport
   * @param {Object} position - Position GPS
   * @param {Number} position.latitude - Latitude
   * @param {Number} position.longitude - Longitude
   * @param {String} position.address - Adresse formatée (optionnel)
   * @param {Date} position.timestamp - Horodatage
   */
  async updateTrackingPosition(transportUid, position) {
    const { latitude, longitude, address, timestamp = new Date() } = position;

    return this.addTrackingEvent(transportUid, {
      type: 'position',
      message: address || `Position mise à jour`,
      data: { latitude, longitude, address },
      source: 'tracking-ia',
      timestamp
    });
  }

  /**
   * Mettre à jour l'ETA (heure d'arrivée estimée)
   *
   * @param {String} transportUid - UID du transport
   * @param {Object} etaData - Données ETA
   * @param {Date} etaData.eta - Heure d'arrivée estimée
   * @param {Number} etaData.delayMinutes - Retard en minutes (optionnel)
   * @param {String} etaData.reason - Raison du retard (optionnel)
   */
  async updateTrackingETA(transportUid, etaData) {
    const { eta, delayMinutes, reason } = etaData;

    let message = `ETA mise à jour: ${new Date(eta).toLocaleString('fr-FR')}`;
    if (delayMinutes && delayMinutes > 0) {
      message = `Retard estimé de ${delayMinutes} min${reason ? ` (${reason})` : ''}`;
    }

    return this.addTrackingEvent(transportUid, {
      type: delayMinutes > 0 ? 'delay' : 'eta',
      message,
      data: { eta, delayMinutes, reason },
      source: 'tracking-ia',
      timestamp: new Date()
    });
  }

  /**
   * Signaler un événement de statut (arrivée, départ, chargement, etc.)
   *
   * @param {String} transportUid - UID du transport
   * @param {String} eventType - Type: arrival, departure, loading, unloading, break, incident
   * @param {Object} eventData - Données de l'événement
   */
  async addTrackingStatusEvent(transportUid, eventType, eventData = {}) {
    const statusMessages = {
      'arrival': 'Arrivée sur site',
      'departure': 'Départ du site',
      'loading': 'Chargement en cours',
      'unloading': 'Déchargement en cours',
      'break': 'Pause chauffeur',
      'incident': 'Incident signalé',
      'geofence_enter': 'Entrée dans la zone',
      'geofence_exit': 'Sortie de la zone'
    };

    return this.addTrackingEvent(transportUid, {
      type: eventType,
      message: eventData.message || statusMessages[eventType] || eventType,
      data: eventData,
      source: eventData.source || 'tracking-ia',
      timestamp: eventData.timestamp || new Date()
    });
  }

  /**
   * Récupérer l'historique des événements Tracking d'un transport depuis Data Lake
   *
   * @param {String} transportUid - UID du transport
   * @param {Object} options - Options de filtrage
   */
  async getTrackingHistory(transportUid, options = {}) {
    if (!this.datalakeDb) {
      return { success: false, error: 'Data Lake non configuré', events: [] };
    }

    try {
      const { limit = 50, type = null, since = null } = options;

      const transport = await this.datalakeDb.collection('dashdoc_transports').findOne(
        { dashdocUid: transportUid },
        { projection: { trackingEvents: 1, tracking: 1 } }
      );

      if (!transport) {
        return { success: false, error: 'Transport non trouvé', events: [] };
      }

      let events = transport.trackingEvents || [];

      // Filtrer par type
      if (type) {
        events = events.filter(e => e.type === type);
      }

      // Filtrer par date
      if (since) {
        const sinceDate = new Date(since);
        events = events.filter(e => new Date(e.timestamp) >= sinceDate);
      }

      // Trier par date décroissante et limiter
      events = events
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);

      return {
        success: true,
        events,
        lastPosition: transport.tracking?.lastPosition,
        lastEta: transport.tracking?.lastEta,
        count: events.length
      };
    } catch (error) {
      console.error(`[Dashdoc Update] Erreur récupération historique tracking:`, error.message);
      return { success: false, error: error.message, events: [] };
    }
  }
}

module.exports = DashdocUpdateConnector;
