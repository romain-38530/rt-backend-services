/**
 * Service de Synchronisation Affret.IA → Dashdoc
 *
 * Écoute les événements d'affectation de commandes par Affret.IA
 * et met à jour automatiquement les transports dans Dashdoc
 *
 * Événement écouté: 'carrier.assigned'
 * Données reçues: { orderId, carrierId, price, sessionId }
 */

const mongoose = require('mongoose');
const DashdocUpdateConnector = require('../connectors/dashdoc-update.connector');

class AffretIADashdocSyncService {
  constructor() {
    this.connectors = new Map(); // Cache des connecteurs Dashdoc par connexion
    this.syncQueue = []; // File d'attente des syncs
    this.retryConfig = {
      maxRetries: 3,
      retryDelay: 5000, // 5 secondes
      backoffMultiplier: 2
    };
  }

  /**
   * Initialiser le service et écouter les événements
   */
  async initialize() {
    console.log('[Affret.IA → Dashdoc Sync] Initialisation du service...');

    // Charger les connexions Dashdoc actives
    await this.loadDashdocConnections();

    // Écouter l'événement global carrier.assigned
    if (global.emitEvent) {
      console.log('[Affret.IA → Dashdoc Sync] Listener d\'événements activé');
      // Note: L'événement est émis via global.emitEvent, pas un EventEmitter classique
      // On doit utiliser un système de polling ou webhook
    }

    console.log('[Affret.IA → Dashdoc Sync] ✅ Service initialisé');
  }

  /**
   * Charger toutes les connexions Dashdoc actives
   */
  async loadDashdocConnections() {
    try {
      // Vérifier que mongoose est connecté
      if (mongoose.connection.readyState !== 1) {
        console.log('[Affret.IA → Dashdoc Sync] MongoDB non connecté, chargement différé des connexions');
        return;
      }

      // Vérifier que le modèle existe
      if (!mongoose.models.TMSConnection) {
        console.log('[Affret.IA → Dashdoc Sync] Modèle TMSConnection non trouvé, chargement différé');
        return;
      }

      const TMSConnection = mongoose.model('TMSConnection');
      const connections = await TMSConnection.find({
        tmsProvider: 'dashdoc',
        status: 'active'
      });

      console.log(`[Affret.IA → Dashdoc Sync] ${connections.length} connexion(s) Dashdoc active(s) trouvée(s)`);

      for (const connection of connections) {
        this.connectors.set(connection.organizationId.toString(), new DashdocUpdateConnector(
          connection.credentials.apiToken,
          { baseUrl: connection.apiEndpoint }
        ));

        console.log(`[Affret.IA → Dashdoc Sync] Connecteur chargé pour org ${connection.organizationId}`);
      }
    } catch (error) {
      console.error('[Affret.IA → Dashdoc Sync] Erreur chargement connexions:', error);
    }
  }

  /**
   * Gérer l'événement carrier.assigned depuis Affret.IA
   *
   * @param {Object} eventData - Données de l'événement
   * @param {String} eventData.orderId - ID de la commande
   * @param {String} eventData.carrierId - ID du transporteur assigné
   * @param {Number} eventData.price - Prix final négocié
   * @param {String} eventData.sessionId - ID de la session Affret.IA
   */
  async handleCarrierAssigned(eventData) {
    const { orderId, carrierId, price, sessionId } = eventData;

    console.log(`\n[Affret.IA → Dashdoc Sync] ===============================================`);
    console.log(`[Affret.IA → Dashdoc Sync] Événement carrier.assigned reçu`);
    console.log(`[Affret.IA → Dashdoc Sync] Order ID: ${orderId}`);
    console.log(`[Affret.IA → Dashdoc Sync] Carrier ID: ${carrierId}`);
    console.log(`[Affret.IA → Dashdoc Sync] Price: ${price}€`);
    console.log(`[Affret.IA → Dashdoc Sync] Session ID: ${sessionId}`);
    console.log(`[Affret.IA → Dashdoc Sync] ===============================================\n`);

    try {
      // 1. Récupérer la commande depuis MongoDB
      const order = await this.getOrder(orderId);

      if (!order) {
        console.error(`[Affret.IA → Dashdoc Sync] ❌ Commande ${orderId} non trouvée`);
        return { success: false, error: 'Order not found' };
      }

      // 2. Vérifier que la commande provient de Dashdoc
      if (order.externalSource !== 'dashdoc') {
        console.log(`[Affret.IA → Dashdoc Sync] ⚠️ Commande ${orderId} ne provient pas de Dashdoc (source: ${order.externalSource})`);
        return { success: false, error: 'Not a Dashdoc order' };
      }

      if (!order.externalId) {
        console.error(`[Affret.IA → Dashdoc Sync] ❌ Commande ${orderId} sans externalId (transport UID Dashdoc)`);
        return { success: false, error: 'Missing Dashdoc transport UID' };
      }

      // 3. Récupérer le transporteur depuis MongoDB
      const carrier = await this.getCarrier(carrierId);

      if (!carrier) {
        console.error(`[Affret.IA → Dashdoc Sync] ❌ Transporteur ${carrierId} non trouvé`);
        return { success: false, error: 'Carrier not found' };
      }

      if (!carrier.externalId || carrier.externalSource !== 'dashdoc') {
        console.error(`[Affret.IA → Dashdoc Sync] ❌ Transporteur ${carrierId} ne provient pas de Dashdoc ou sans externalId`);
        return { success: false, error: 'Carrier not from Dashdoc' };
      }

      // 4. Récupérer la session Affret.IA pour plus de détails
      const affretSession = await this.getAffretSession(sessionId);

      // 5. Obtenir le connecteur Dashdoc pour cette organisation
      const connector = this.connectors.get(order.organizationId.toString());

      if (!connector) {
        console.error(`[Affret.IA → Dashdoc Sync] ❌ Aucun connecteur Dashdoc pour org ${order.organizationId}`);
        return { success: false, error: 'No Dashdoc connector for organization' };
      }

      // 6. Préparer les données d'assignation
      const assignmentData = {
        carrierExternalId: carrier.externalId, // Company PK Dashdoc
        finalPrice: price,
        sellingPrice: order.pricing?.totalPrice, // Prix de vente si disponible
        vehiclePlate: affretSession?.selection?.vehiclePlate,
        driverEmail: affretSession?.selection?.driverEmail
      };

      console.log(`[Affret.IA → Dashdoc Sync] Données d'assignation:`, JSON.stringify(assignmentData, null, 2));

      // 7. Mettre à jour le transport dans Dashdoc
      const result = await this.syncToDashdoc(
        connector,
        order.externalId, // Transport UID Dashdoc
        assignmentData,
        { orderId, carrierId, sessionId }
      );

      // 8. Logger le résultat
      await this.logSyncResult(orderId, result);

      return result;

    } catch (error) {
      console.error(`[Affret.IA → Dashdoc Sync] ❌ Erreur traitement événement:`, error);

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Synchroniser l'assignation vers Dashdoc avec retry logic
   */
  async syncToDashdoc(connector, transportUid, assignmentData, metadata, retryCount = 0) {
    try {
      console.log(`[Affret.IA → Dashdoc Sync] Tentative ${retryCount + 1}/${this.retryConfig.maxRetries + 1}...`);

      // Appeler l'assignation complète
      const result = await connector.assignTransportFull(transportUid, assignmentData);

      if (result.success) {
        console.log(`[Affret.IA → Dashdoc Sync] ✅ Transport ${transportUid} mis à jour avec succès dans Dashdoc`);

        return {
          success: true,
          transportUid,
          result,
          metadata,
          retriesUsed: retryCount
        };
      } else {
        throw new Error(result.error || 'Unknown error');
      }

    } catch (error) {
      console.error(`[Affret.IA → Dashdoc Sync] ❌ Erreur sync tentative ${retryCount + 1}:`, error.message);

      // Retry logic
      if (retryCount < this.retryConfig.maxRetries) {
        const delay = this.retryConfig.retryDelay * Math.pow(this.retryConfig.backoffMultiplier, retryCount);
        console.log(`[Affret.IA → Dashdoc Sync] ⏳ Retry dans ${delay}ms...`);

        await this.sleep(delay);

        return this.syncToDashdoc(connector, transportUid, assignmentData, metadata, retryCount + 1);
      }

      // Max retries atteint
      console.error(`[Affret.IA → Dashdoc Sync] ❌ Échec définitif après ${retryCount + 1} tentatives`);

      return {
        success: false,
        transportUid,
        error: error.message,
        metadata,
        retriesUsed: retryCount
      };
    }
  }

  /**
   * Récupérer une commande depuis MongoDB
   */
  async getOrder(orderId) {
    try {
      const Order = mongoose.model('Order');
      const order = await Order.findById(orderId);
      return order;
    } catch (error) {
      console.error(`[Affret.IA → Dashdoc Sync] Erreur récupération order ${orderId}:`, error);
      return null;
    }
  }

  /**
   * Récupérer un transporteur depuis MongoDB
   */
  async getCarrier(carrierId) {
    try {
      const Carrier = mongoose.model('Carrier');
      const carrier = await Carrier.findById(carrierId);
      return carrier;
    } catch (error) {
      console.error(`[Affret.IA → Dashdoc Sync] Erreur récupération carrier ${carrierId}:`, error);
      return null;
    }
  }

  /**
   * Récupérer une session Affret.IA depuis l'API
   */
  async getAffretSession(sessionId) {
    try {
      const axios = require('axios');

      const response = await axios.get(
        `${process.env.AFFRET_IA_API_URL || 'http://localhost:3006/api/v1'}/affretia/session/${sessionId}`
      );

      return response.data.session;
    } catch (error) {
      console.error(`[Affret.IA → Dashdoc Sync] Erreur récupération session ${sessionId}:`, error.message);
      return null;
    }
  }

  /**
   * Logger le résultat de synchronisation dans MongoDB
   */
  async logSyncResult(orderId, result) {
    try {
      const TMSSyncLog = mongoose.model('TMSSyncLog');

      await TMSSyncLog.create({
        connectionId: null, // Pas de connection ID spécifique ici
        syncType: 'affretia_assignment',
        direction: 'symphonia_to_dashdoc',
        status: result.success ? 'success' : 'failed',
        itemsProcessed: 1,
        itemsFailed: result.success ? 0 : 1,
        duration: result.duration || 0,
        details: {
          orderId,
          transportUid: result.transportUid,
          metadata: result.metadata,
          retriesUsed: result.retriesUsed,
          error: result.error
        }
      });

      console.log(`[Affret.IA → Dashdoc Sync] Log de sync créé pour order ${orderId}`);
    } catch (error) {
      console.error('[Affret.IA → Dashdoc Sync] Erreur création log:', error);
    }
  }

  /**
   * Endpoint HTTP pour tester la synchronisation manuellement
   */
  async testSync(orderId, carrierId, price) {
    console.log(`[Affret.IA → Dashdoc Sync] Test manuel de synchronisation...`);

    return this.handleCarrierAssigned({
      orderId,
      carrierId,
      price,
      sessionId: 'manual-test'
    });
  }

  /**
   * Synchroniser manuellement une commande vers Dashdoc
   */
  async manualSync(orderId, options = {}) {
    console.log(`[Affret.IA → Dashdoc Sync] Synchronisation manuelle order ${orderId}...`);

    try {
      // Récupérer la commande
      const order = await this.getOrder(orderId);

      if (!order) {
        throw new Error('Order not found');
      }

      if (order.externalSource !== 'dashdoc') {
        throw new Error('Not a Dashdoc order');
      }

      if (!order.carrier || !order.carrier.id) {
        throw new Error('Order not assigned to a carrier');
      }

      // Récupérer le transporteur
      const carrier = await this.getCarrier(order.carrier.id);

      if (!carrier) {
        throw new Error('Carrier not found');
      }

      // Obtenir le connecteur
      const connector = this.connectors.get(order.organizationId.toString());

      if (!connector) {
        throw new Error('No Dashdoc connector for organization');
      }

      // Préparer les données
      const assignmentData = {
        carrierExternalId: carrier.externalId,
        finalPrice: options.price || order.pricing?.agreedPrice || order.pricing?.totalPrice,
        sellingPrice: options.sellingPrice || order.pricing?.totalPrice,
        vehiclePlate: options.vehiclePlate,
        driverEmail: options.driverEmail
      };

      // Synchroniser
      return await this.syncToDashdoc(
        connector,
        order.externalId,
        assignmentData,
        { orderId, carrierId: carrier._id.toString(), manual: true }
      );

    } catch (error) {
      console.error(`[Affret.IA → Dashdoc Sync] Erreur sync manuelle:`, error);

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Helper: sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton
const affretIADashdocSyncService = new AffretIADashdocSyncService();

module.exports = affretIADashdocSyncService;
