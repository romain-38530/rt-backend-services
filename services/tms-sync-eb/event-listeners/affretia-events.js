/**
 * Event Listeners pour Affret.IA
 *
 * Écoute les événements WebSocket depuis Affret.IA et déclenche les synchronisations
 * appropriées vers les TMS (Dashdoc, etc.)
 */

const affretIADashdocSyncService = require('../services/affretia-dashdoc-sync.service');

class AffretIAEventListeners {
  constructor(io) {
    this.io = io;
    this.listeners = new Map();
  }

  /**
   * Initialiser tous les listeners
   */
  async initialize() {
    console.log('[Affret.IA Events] Initialisation des listeners...');

    try {
      // Initialiser le service de sync Dashdoc
      await affretIADashdocSyncService.initialize();
    } catch (error) {
      console.error('[Affret.IA Events] Erreur initialisation service sync:', error.message);
      console.log('[Affret.IA Events] Le service continuera mais sans connecteurs pré-chargés');
    }

    // S'abonner aux événements WebSocket si io est disponible
    if (this.io) {
      this.setupWebSocketListeners();
    }

    // S'abonner aux événements HTTP (webhook style)
    this.setupHttpListeners();

    console.log('[Affret.IA Events] ✅ Listeners initialisés');
  }

  /**
   * Configurer les listeners WebSocket
   */
  setupWebSocketListeners() {
    console.log('[Affret.IA Events] Configuration des listeners WebSocket...');

    // Écouter l'événement 'emit-event' du serveur Affret.IA
    this.io.on('connection', (socket) => {
      console.log('[Affret.IA Events] Client WebSocket connecté');

      // Écouter les événements émis par Affret.IA
      socket.on('emit-event', async (data) => {
        const { eventName, data: eventData } = data;

        console.log(`[Affret.IA Events] Événement reçu: ${eventName}`);

        await this.handleEvent(eventName, eventData);
      });

      socket.on('disconnect', () => {
        console.log('[Affret.IA Events] Client WebSocket déconnecté');
      });
    });
  }

  /**
   * Configurer les listeners HTTP (endpoints webhook)
   */
  setupHttpListeners() {
    console.log('[Affret.IA Events] Listeners HTTP configurés (voir routes)');
  }

  /**
   * Router les événements vers les handlers appropriés
   */
  async handleEvent(eventName, eventData) {
    try {
      switch (eventName) {
        case 'carrier.assigned':
          await this.handleCarrierAssigned(eventData);
          break;

        case 'affret.session.created':
          console.log(`[Affret.IA Events] Session créée: ${eventData.sessionId}`);
          break;

        case 'affret.analysis.completed':
          console.log(`[Affret.IA Events] Analyse complétée: ${eventData.sessionId}`);
          break;

        case 'affret.proposal.received':
          console.log(`[Affret.IA Events] Proposition reçue: ${eventData.sessionId} - ${eventData.carrierId}`);
          break;

        default:
          console.log(`[Affret.IA Events] Événement non géré: ${eventName}`);
      }
    } catch (error) {
      console.error(`[Affret.IA Events] Erreur traitement événement ${eventName}:`, error);
    }
  }

  /**
   * Handler pour carrier.assigned
   */
  async handleCarrierAssigned(eventData) {
    console.log(`[Affret.IA Events] ▶️ carrier.assigned - Order: ${eventData.orderId}, Carrier: ${eventData.carrierId}`);

    try {
      // Appeler le service de sync Dashdoc
      const result = await affretIADashdocSyncService.handleCarrierAssigned(eventData);

      if (result.success) {
        console.log(`[Affret.IA Events] ✅ Synchronisation Dashdoc réussie`);
      } else {
        console.error(`[Affret.IA Events] ❌ Échec synchronisation Dashdoc:`, result.error);
      }

      return result;
    } catch (error) {
      console.error(`[Affret.IA Events] ❌ Erreur handler carrier.assigned:`, error);

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Déclencher manuellement un événement (pour tests)
   */
  async triggerManual(eventName, eventData) {
    console.log(`[Affret.IA Events] Déclenchement manuel: ${eventName}`);

    return await this.handleEvent(eventName, eventData);
  }
}

module.exports = AffretIAEventListeners;
