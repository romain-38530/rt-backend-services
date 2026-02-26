/**
 * Service de Monitoring Automatisé des Chauffeurs
 *
 * Surveille automatiquement:
 * 1. Positions GPS Vehizen
 * 2. Retards via ETA vs Position réelle
 * 3. Envoie alertes progressives selon gravité
 * 4. SMS automatique UNIQUEMENT pour retards critiques (>2h)
 */

const DriverAlertsService = require('./driver-alerts.service');

class AutomatedDriverMonitoringService {
  constructor(db, ordersDb) {
    this.db = db;
    this.ordersDb = ordersDb;
    this.alertsService = new DriverAlertsService(db);
    this.isRunning = false;
    this.monitoringInterval = null;
    this.checkIntervalMs = 5 * 60 * 1000; // Vérifier toutes les 5 minutes
  }

  /**
   * Démarrer le monitoring automatique
   */
  start() {
    if (this.isRunning) {
      console.log('[AUTO-MONITORING] Déjà en cours');
      return;
    }

    console.log('[AUTO-MONITORING] Démarrage du monitoring automatique des chauffeurs');
    this.isRunning = true;

    // Vérification immédiate
    this.checkAllActiveTransports();

    // Puis vérification périodique
    this.monitoringInterval = setInterval(() => {
      this.checkAllActiveTransports();
    }, this.checkIntervalMs);
  }

  /**
   * Arrêter le monitoring
   */
  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isRunning = false;
    console.log('[AUTO-MONITORING] Monitoring arrêté');
  }

  /**
   * Vérifier tous les transports actifs
   */
  async checkAllActiveTransports() {
    try {
      console.log('[AUTO-MONITORING] Vérification des transports actifs...');

      if (!this.db) {
        console.warn('[AUTO-MONITORING] Database non disponible');
        return;
      }

      // Récupérer les transports en cours (ongoing, loading, etc.)
      const activeTransports = await this.db.collection('dashdoctransports')
        .find({
          status: { $in: ['ongoing', 'loading_complete', 'on_loading_site'] },
          'metadata.deleted': { $ne: true }
        })
        .limit(100) // Limiter pour performance
        .toArray();

      console.log(`[AUTO-MONITORING] ${activeTransports.length} transports actifs à vérifier`);

      let checkedCount = 0;
      let alertsTriggered = 0;
      let smsAutomaticSent = 0;

      for (const transport of activeTransports) {
        try {
          const result = await this.checkTransportDelay(transport);
          checkedCount++;

          if (result.alertTriggered) alertsTriggered++;
          if (result.smsAutomaticSent) smsAutomaticSent++;

        } catch (error) {
          console.error(`[AUTO-MONITORING] Erreur transport ${transport.uid}:`, error.message);
        }

        // Pause entre chaque transport pour ne pas surcharger
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`[AUTO-MONITORING] Vérification terminée: ${checkedCount} transports, ${alertsTriggered} alertes, ${smsAutomaticSent} SMS envoyés`);

    } catch (error) {
      console.error('[AUTO-MONITORING] Erreur vérification:', error);
    }
  }

  /**
   * Vérifier le retard d'un transport spécifique
   */
  async checkTransportDelay(transport) {
    const result = {
      transportUid: transport.uid,
      alertTriggered: false,
      smsAutomaticSent: false,
      action: 'none'
    };

    try {
      // 1. Récupérer position GPS actuelle
      const gpsPosition = await this.getVehicleGPSPosition(transport);

      // 2. Calculer le retard estimé
      const delayInfo = await this.calculateDelay(transport, gpsPosition);

      if (!delayInfo || delayInfo.delayMinutes < 30) {
        // Pas de retard significatif
        return result;
      }

      // 3. Évaluer le niveau de gravité
      const evaluation = this.alertsService.evaluateDelay(delayInfo.delayMinutes);

      // 4. Déclencher l'action appropriée
      switch (evaluation.level) {
        case 'minor':
          // Retard 30-60 min : Log seulement
          await this.logAlert(transport, delayInfo, 'minor', 'Log UI seulement');
          result.alertTriggered = true;
          result.action = 'ui_log';
          break;

        case 'medium':
          // Retard 60-120 min : Notification UI + Email
          await this.sendEmailNotification(transport, delayInfo);
          await this.logAlert(transport, delayInfo, 'medium', 'Email notification');
          result.alertTriggered = true;
          result.action = 'email';
          break;

        case 'high':
        case 'critical':
          // Retard > 120 min : SMS AUTOMATIQUE (si cooldown OK)
          const smsSent = await this.sendAutomaticSMS(transport, delayInfo);
          result.alertTriggered = true;
          result.smsAutomaticSent = smsSent;
          result.action = smsSent ? 'sms_sent' : 'sms_blocked_cooldown';
          break;
      }

    } catch (error) {
      console.error(`[AUTO-MONITORING] Erreur check transport ${transport.uid}:`, error.message);
    }

    return result;
  }

  /**
   * Récupérer la position GPS d'un véhicule
   */
  async getVehicleGPSPosition(transport) {
    if (!this.ordersDb) return null;

    try {
      const vehiclePlate = transport.vehicle?.licensePlate ||
                          transport.rawData?.segments?.[0]?.vehicle?.license_plate;

      if (!vehiclePlate) return null;

      const vehicle = await this.ordersDb.collection('vehizenvehicles').findOne({
        registration: vehiclePlate.toUpperCase()
      });

      return vehicle?.lastPosition || null;

    } catch (error) {
      console.error('[AUTO-MONITORING] Erreur GPS:', error.message);
      return null;
    }
  }

  /**
   * Calculer le retard estimé d'un transport
   */
  async calculateDelay(transport, gpsPosition) {
    try {
      // Extraire l'ETA (heure d'arrivée estimée)
      const eta = transport.metadata?.eta ||
                  transport.rawData?.estimated_delivery_date;

      if (!eta) return null;

      const etaDate = new Date(eta);
      const now = new Date();

      // Si ETA dans le futur, pas de retard
      if (etaDate > now) return null;

      // Calculer le retard en minutes
      const delayMinutes = Math.floor((now - etaDate) / (1000 * 60));

      return {
        delayMinutes,
        eta: etaDate,
        currentTime: now,
        hasGPS: !!gpsPosition,
        gpsAge: gpsPosition ? Math.floor((now - new Date(gpsPosition.timestamp)) / (1000 * 60)) : null
      };

    } catch (error) {
      console.error('[AUTO-MONITORING] Erreur calcul retard:', error.message);
      return null;
    }
  }

  /**
   * Envoyer SMS automatique (seulement pour retards critiques)
   */
  async sendAutomaticSMS(transport, delayInfo) {
    try {
      // Vérifier cooldown
      const cooldownCheck = this.alertsService.canSendSMS(transport.uid);
      if (!cooldownCheck.allowed) {
        console.log(`[AUTO-MONITORING] SMS bloqué (cooldown): ${transport.uid}`);
        return false;
      }

      // Récupérer le téléphone du chauffeur
      const driverPhone = transport.assignedCarrier?.carrierPhone ||
                         transport.assignedCarrier?.driverPhone;

      if (!driverPhone) {
        console.warn(`[AUTO-MONITORING] Pas de téléphone pour transport ${transport.uid}`);
        return false;
      }

      // Générer message automatique
      const message = this.generateAutomaticSMSMessage(transport, delayInfo);

      // Envoyer SMS
      const result = await this.alertsService.sendManualSMS({
        transportUid: transport.uid,
        driverPhone,
        message,
        delayMinutes: delayInfo.delayMinutes,
        userId: 'system-auto',
        userName: 'Système Automatique'
      });

      if (result.success) {
        console.log(`[AUTO-MONITORING] SMS automatique envoyé: Transport ${transport.sequentialId}, Retard ${delayInfo.delayMinutes}min`);
        return true;
      } else {
        console.error(`[AUTO-MONITORING] Échec SMS: ${result.error}`);
        return false;
      }

    } catch (error) {
      console.error('[AUTO-MONITORING] Erreur envoi SMS auto:', error.message);
      return false;
    }
  }

  /**
   * Générer message SMS automatique
   */
  generateAutomaticSMSMessage(transport, delayInfo) {
    const origin = transport.rawData?.segments?.[0]?.origin?.name || 'Chargement';
    const destination = transport.rawData?.segments?.[transport.rawData.segments.length - 1]?.destination?.name || 'Livraison';

    return `ALERTE RETARD - Transport ${transport.sequentialId} (${origin} → ${destination}) retardé de ${delayInfo.delayMinutes}min. Merci de confirmer votre position et ETA. SYMPHONIA`;
  }

  /**
   * Envoyer notification email
   */
  async sendEmailNotification(transport, delayInfo) {
    // TODO: Intégrer avec AWS SES pour envoyer emails
    console.log(`[AUTO-MONITORING] Email notification: Transport ${transport.sequentialId}, Retard ${delayInfo.delayMinutes}min`);

    // Pour l'instant, juste logger
    await this.logAlert(transport, delayInfo, 'email', 'Email notification sent');
  }

  /**
   * Logger une alerte dans la base
   */
  async logAlert(transport, delayInfo, level, action) {
    if (!this.db) return;

    try {
      await this.db.collection('driver_monitoring_alerts').insertOne({
        transportUid: transport.uid,
        sequentialId: transport.sequentialId,
        level,
        action,
        delayMinutes: delayInfo.delayMinutes,
        eta: delayInfo.eta,
        hasGPS: delayInfo.hasGPS,
        gpsAge: delayInfo.gpsAge,
        detectedAt: new Date(),
        status: transport.status
      });
    } catch (error) {
      console.error('[AUTO-MONITORING] Erreur log alert:', error.message);
    }
  }

  /**
   * Obtenir les statistiques de monitoring
   */
  async getStats(period = '24h') {
    if (!this.db) return null;

    const hours = period === '24h' ? 24 : period === '7d' ? 168 : 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [totalAlerts, bySeverity, smsCount] = await Promise.all([
      this.db.collection('driver_monitoring_alerts').countDocuments({ detectedAt: { $gte: since } }),
      this.db.collection('driver_monitoring_alerts').aggregate([
        { $match: { detectedAt: { $gte: since } } },
        { $group: { _id: '$level', count: { $sum: 1 } } }
      ]).toArray(),
      this.db.collection('driver_sms_history').countDocuments({
        sentAt: { $gte: since },
        sentBy: 'system-auto'
      })
    ]);

    return {
      period,
      totalAlerts,
      bySeverity: bySeverity.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      automaticSMSSent: smsCount,
      isRunning: this.isRunning,
      checkInterval: `${this.checkIntervalMs / 1000 / 60} minutes`
    };
  }
}

module.exports = AutomatedDriverMonitoringService;
