/**
 * Dashdoc Update Connector
 * Extension du connecteur Dashdoc pour les opérations de mise à jour (PATCH/PUT)
 *
 * Gère la synchronisation bidirectionnelle SYMPHONI.A → Dashdoc:
 * - Mise à jour des transporteurs assignés
 * - Mise à jour des prix de vente
 * - Mise à jour des moyens (véhicules, chauffeurs)
 * - Mise à jour du statut
 */

const axios = require('axios');

class DashdocUpdateConnector {
  constructor(apiToken, options = {}) {
    this.apiToken = apiToken;
    this.baseUrl = options.baseUrl || 'https://www.dashdoc.eu/api/v4';
    this.timeout = options.timeout || 30000;
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

      const response = await this.client.patch(`/transports/${transportUid}/`, payload);

      console.log(`[Dashdoc Update] ✅ Transport ${transportUid} mis à jour avec succès`);

      return {
        success: true,
        transport: response.data,
        message: `Transport ${transportUid} mis à jour`
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
   */
  async getCarrierAddress(companyPk) {
    try {
      const response = await this.client.get(`/companies/${companyPk}/`);
      const company = response.data;

      // L'adresse principale utilisée pour carrier_address
      if (company.primary_address && company.primary_address.pk) {
        return {
          success: true,
          addressPk: company.primary_address.pk,
          address: company.primary_address
        };
      }

      // Fallback: chercher dans les adresses
      if (company.addresses && company.addresses.length > 0) {
        const firstAddress = company.addresses[0];
        return {
          success: true,
          addressPk: firstAddress.pk,
          address: firstAddress
        };
      }

      return {
        success: false,
        error: 'Aucune adresse trouvée pour ce transporteur',
        message: `Company ${companyPk} sans adresse`
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
   */
  async getCarrierVehicles(companyPk) {
    try {
      const response = await this.client.get(`/vehicles/?company=${companyPk}`);

      return {
        success: true,
        vehicles: response.data.results || [],
        count: response.data.count || 0
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
   */
  async getCarrierDrivers(companyPk) {
    try {
      const response = await this.client.get(`/manager-truckers/?carrier=${companyPk}`);

      return {
        success: true,
        drivers: response.data.results || [],
        count: response.data.count || 0
      };
    } catch (error) {
      console.error(`[Dashdoc Update] Erreur récupération chauffeurs company ${companyPk}:`, error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data || error.message,
        drivers: []
      };
    }
  }

  /**
   * Rechercher un véhicule par plaque d'immatriculation
   */
  async findVehicleByPlate(licensePlate) {
    try {
      const response = await this.client.get(`/vehicles/?license_plate=${encodeURIComponent(licensePlate)}`);

      if (response.data.results && response.data.results.length > 0) {
        return {
          success: true,
          vehicle: response.data.results[0],
          uid: response.data.results[0].uid
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
   */
  async findDriverByEmail(email) {
    try {
      const response = await this.client.get(`/manager-truckers/?email=${encodeURIComponent(email)}`);

      if (response.data.results && response.data.results.length > 0) {
        return {
          success: true,
          driver: response.data.results[0],
          uid: response.data.results[0].uid
        };
      }

      return {
        success: false,
        error: 'Chauffeur non trouvé',
        message: `Aucun chauffeur avec email ${email}`
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
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
}

module.exports = DashdocUpdateConnector;
