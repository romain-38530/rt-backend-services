/**
 * Service de Gestion des Alertes Chauffeurs
 *
 * Règles:
 * 1. PAS de SMS automatiques
 * 2. Pointer via Vehizen GPS en priorité
 * 3. SMS manuel uniquement pour GROS retards (> 2h)
 * 4. Max 1 SMS par transport par jour
 */

const AWS = require('aws-sdk');
const sns = new AWS.SNS({ region: 'eu-central-1' });

// Seuils de retard (en minutes)
const DELAY_THRESHOLDS = {
  MINOR: 30,      // < 30min : Aucune action
  MEDIUM: 60,     // 30-60min : Afficher alerte dans UI seulement
  HIGH: 120,      // 60-120min : Alerte UI + Option d'envoi SMS manuel
  CRITICAL: 180   // > 180min : Alerte critique + Suggestion SMS
};

// Cooldown entre SMS (24h)
const SMS_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Historique des SMS envoyés (en mémoire)
// TODO: Stocker dans MongoDB pour persistance
const smsHistory = new Map();

class DriverAlertsService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Évaluer le niveau de retard et l'action recommandée
   */
  evaluateDelay(delayMinutes) {
    if (delayMinutes < DELAY_THRESHOLDS.MINOR) {
      return {
        level: 'none',
        action: 'none',
        message: 'Retard mineur, suivi GPS Vehizen suffisant'
      };
    }

    if (delayMinutes < DELAY_THRESHOLDS.MEDIUM) {
      return {
        level: 'minor',
        action: 'ui_alert',
        message: 'Retard modéré, surveiller via GPS'
      };
    }

    if (delayMinutes < DELAY_THRESHOLDS.HIGH) {
      return {
        level: 'medium',
        action: 'ui_alert_with_manual_sms',
        message: 'Retard significatif, option SMS manuel disponible'
      };
    }

    if (delayMinutes < DELAY_THRESHOLDS.CRITICAL) {
      return {
        level: 'high',
        action: 'suggest_manual_sms',
        message: 'Retard important, SMS manuel recommandé'
      };
    }

    return {
      level: 'critical',
      action: 'require_manual_intervention',
      message: 'Retard critique, intervention manuelle requise'
    };
  }

  /**
   * Vérifier si un SMS peut être envoyé (cooldown)
   */
  canSendSMS(transportUid) {
    const lastSent = smsHistory.get(transportUid);

    if (!lastSent) {
      return { allowed: true, reason: null };
    }

    const timeSinceLast = Date.now() - lastSent;

    if (timeSinceLast < SMS_COOLDOWN_MS) {
      const hoursRemaining = Math.ceil((SMS_COOLDOWN_MS - timeSinceLast) / (60 * 60 * 1000));
      return {
        allowed: false,
        reason: `SMS déjà envoyé il y a ${Math.floor(timeSinceLast / (60 * 60 * 1000))}h. Attendre ${hoursRemaining}h.`
      };
    }

    return { allowed: true, reason: null };
  }

  /**
   * Envoyer un SMS manuel à un chauffeur (SEULEMENT sur action utilisateur)
   */
  async sendManualSMS(params) {
    const {
      transportUid,
      driverPhone,
      message,
      delayMinutes,
      userId,
      userName
    } = params;

    try {
      // Vérifier seuil minimum
      if (delayMinutes < DELAY_THRESHOLDS.HIGH) {
        return {
          success: false,
          error: `Retard insuffisant (${delayMinutes}min). SMS autorisé uniquement > ${DELAY_THRESHOLDS.HIGH}min.`
        };
      }

      // Vérifier cooldown
      const cooldownCheck = this.canSendSMS(transportUid);
      if (!cooldownCheck.allowed) {
        return {
          success: false,
          error: cooldownCheck.reason
        };
      }

      // Envoyer via AWS SNS
      const snsParams = {
        PhoneNumber: driverPhone,
        Message: message,
        MessageAttributes: {
          'AWS.SNS.SMS.SenderID': {
            DataType: 'String',
            StringValue: 'SYMPHONIA'
          },
          'AWS.SNS.SMS.SMSType': {
            DataType: 'String',
            StringValue: 'Transactional'
          }
        }
      };

      const result = await sns.publish(snsParams).promise();

      // Enregistrer dans l'historique
      smsHistory.set(transportUid, Date.now());

      // Logger dans MongoDB
      if (this.db) {
        await this.db.collection('driver_sms_history').insertOne({
          transportUid,
          driverPhone,
          message,
          delayMinutes,
          sentBy: userId,
          sentByName: userName,
          sentAt: new Date(),
          snsMessageId: result.MessageId,
          status: 'sent'
        });
      }

      console.log(`[DRIVER-ALERTS] SMS envoyé: Transport ${transportUid}, Retard ${delayMinutes}min, Par ${userName}`);

      return {
        success: true,
        messageId: result.MessageId,
        message: 'SMS envoyé avec succès'
      };

    } catch (error) {
      console.error('[DRIVER-ALERTS] Erreur envoi SMS:', error);

      // Logger l'erreur
      if (this.db) {
        await this.db.collection('driver_sms_history').insertOne({
          transportUid,
          driverPhone,
          message,
          delayMinutes,
          sentBy: userId,
          sentByName: userName,
          sentAt: new Date(),
          status: 'failed',
          error: error.message
        });
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Obtenir l'historique des SMS pour un transport
   */
  async getSMSHistory(transportUid) {
    if (!this.db) return [];

    return this.db.collection('driver_sms_history')
      .find({ transportUid })
      .sort({ sentAt: -1 })
      .limit(10)
      .toArray();
  }

  /**
   * Obtenir des statistiques d'utilisation des SMS
   */
  async getStats(period = '7d') {
    if (!this.db) return null;

    const daysAgo = parseInt(period) || 7;
    const since = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

    const [total, sent, failed] = await Promise.all([
      this.db.collection('driver_sms_history').countDocuments({ sentAt: { $gte: since } }),
      this.db.collection('driver_sms_history').countDocuments({ sentAt: { $gte: since }, status: 'sent' }),
      this.db.collection('driver_sms_history').countDocuments({ sentAt: { $gte: since }, status: 'failed' })
    ]);

    return {
      period: `${daysAgo} jours`,
      total,
      sent,
      failed,
      successRate: total > 0 ? Math.round((sent / total) * 100) : 0
    };
  }
}

module.exports = DriverAlertsService;
module.exports.DELAY_THRESHOLDS = DELAY_THRESHOLDS;
