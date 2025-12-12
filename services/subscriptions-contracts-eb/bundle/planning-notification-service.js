/**
 * Planning Notification Service
 * Service de notifications pour le module Planning Chargement & Livraison
 * Version: 1.0.0
 */

const notificationService = require('./notification-service');

// ============================================================================
// TYPES DE NOTIFICATIONS PLANNING
// ============================================================================

const PlanningNotificationTypes = {
  // RDV Workflow
  RDV_REQUESTED: 'rdv.requested',
  RDV_PROPOSED: 'rdv.proposed',
  RDV_CONFIRMED: 'rdv.confirmed',
  RDV_REFUSED: 'rdv.refused',
  RDV_RESCHEDULED: 'rdv.rescheduled',
  RDV_CANCELLED: 'rdv.cancelled',
  RDV_REMINDER: 'rdv.reminder',

  // Driver Events
  DRIVER_APPROACHING: 'driver.approaching',
  DRIVER_CHECKED_IN: 'driver.checked_in',
  DRIVER_CALLED: 'driver.called',
  DRIVER_NO_SHOW: 'driver.no_show',

  // Operations
  OPERATION_STARTED: 'operation.started',
  OPERATION_COMPLETED: 'operation.completed',

  // Tracking Integration
  EARLY_ARRIVAL: 'tracking.early_arrival',
  DELAY_DETECTED: 'tracking.delay_detected',
  SLOT_PROPOSAL: 'tracking.slot_proposal'
};

// ============================================================================
// TEMPLATES EMAIL
// ============================================================================

const PlanningEmailTemplates = {
  [PlanningNotificationTypes.RDV_REQUESTED]: {
    subject: 'Demande de RDV #{rdvNumber} - {siteName}',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Nouvelle demande de RDV</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>N° RDV:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{rdvNumber}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Site:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{siteName}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Date:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{slotDate}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Créneau:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{slotTime}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Transporteur:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{carrierName}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Type:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{flowType}</td></tr>
        </table>
        <p style="margin-top: 20px;">Veuillez confirmer ou proposer un créneau alternatif.</p>
        <p style="color: #6b7280; font-size: 12px;">RT SYMPHONI.A - Planning Chargement & Livraison</p>
      </div>
    `
  },

  [PlanningNotificationTypes.RDV_PROPOSED]: {
    subject: 'Proposition de créneau alternatif - RDV #{rdvNumber}',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f59e0b;">Créneau alternatif proposé</h2>
        <p>Le site <strong>{siteName}</strong> vous propose un nouveau créneau:</p>
        <table style="width: 100%; border-collapse: collapse; background: #fef3c7; padding: 15px; border-radius: 8px;">
          <tr><td style="padding: 8px;"><strong>Nouvelle date:</strong></td><td style="padding: 8px;">{newSlotDate}</td></tr>
          <tr><td style="padding: 8px;"><strong>Nouveau créneau:</strong></td><td style="padding: 8px;">{newSlotTime}</td></tr>
        </table>
        <p><strong>Raison:</strong> {reason}</p>
        <p style="margin-top: 20px;">Veuillez accepter ou refuser cette proposition.</p>
        <p style="color: #6b7280; font-size: 12px;">RT SYMPHONI.A - Planning Chargement & Livraison</p>
      </div>
    `
  },

  [PlanningNotificationTypes.RDV_CONFIRMED]: {
    subject: '✅ RDV Confirmé #{rdvNumber} - {siteName}',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10b981;">RDV Confirmé</h2>
        <div style="background: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px;"><strong>N° RDV:</strong></td><td style="padding: 8px;">{rdvNumber}</td></tr>
            <tr><td style="padding: 8px;"><strong>Site:</strong></td><td style="padding: 8px;">{siteName}</td></tr>
            <tr><td style="padding: 8px;"><strong>Adresse:</strong></td><td style="padding: 8px;">{siteAddress}</td></tr>
            <tr><td style="padding: 8px;"><strong>Date:</strong></td><td style="padding: 8px;">{slotDate}</td></tr>
            <tr><td style="padding: 8px;"><strong>Créneau:</strong></td><td style="padding: 8px;">{slotTime}</td></tr>
            <tr><td style="padding: 8px;"><strong>Quai:</strong></td><td style="padding: 8px;">{dockName}</td></tr>
          </table>
        </div>
        <h3>Instructions d'arrivée:</h3>
        <p>{arrivalInstructions}</p>
        <p style="color: #6b7280; font-size: 12px;">RT SYMPHONI.A - Planning Chargement & Livraison</p>
      </div>
    `
  },

  [PlanningNotificationTypes.RDV_REFUSED]: {
    subject: '❌ RDV Refusé #{rdvNumber}',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ef4444;">RDV Refusé</h2>
        <p>Votre demande de RDV a été refusée.</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>N° RDV:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{rdvNumber}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Site:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{siteName}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Raison:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{reason}</td></tr>
        </table>
        <p style="margin-top: 20px;">Vous pouvez soumettre une nouvelle demande avec un créneau différent.</p>
        <p style="color: #6b7280; font-size: 12px;">RT SYMPHONI.A - Planning Chargement & Livraison</p>
      </div>
    `
  },

  [PlanningNotificationTypes.RDV_RESCHEDULED]: {
    subject: '📅 RDV Replanifié #{rdvNumber}',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #8b5cf6;">RDV Replanifié</h2>
        <p>Votre RDV a été déplacé vers un nouveau créneau.</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>N° RDV:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{rdvNumber}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Nouvelle date:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{newSlotDate}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Nouveau créneau:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{newSlotTime}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Raison:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{reason}</td></tr>
        </table>
        <p style="color: #6b7280; font-size: 12px;">RT SYMPHONI.A - Planning Chargement & Livraison</p>
      </div>
    `
  },

  [PlanningNotificationTypes.RDV_CANCELLED]: {
    subject: '🚫 RDV Annulé #{rdvNumber}',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #6b7280;">RDV Annulé</h2>
        <p>Le RDV suivant a été annulé:</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>N° RDV:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{rdvNumber}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Site:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{siteName}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Raison:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{reason}</td></tr>
        </table>
        <p style="color: #6b7280; font-size: 12px;">RT SYMPHONI.A - Planning Chargement & Livraison</p>
      </div>
    `
  },

  [PlanningNotificationTypes.RDV_REMINDER]: {
    subject: '⏰ Rappel RDV #{rdvNumber} - Demain {slotTime}',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Rappel de votre RDV</h2>
        <p>Votre RDV est prévu pour demain:</p>
        <div style="background: #dbeafe; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px;"><strong>N° RDV:</strong></td><td style="padding: 8px;">{rdvNumber}</td></tr>
            <tr><td style="padding: 8px;"><strong>Site:</strong></td><td style="padding: 8px;">{siteName}</td></tr>
            <tr><td style="padding: 8px;"><strong>Date:</strong></td><td style="padding: 8px;">{slotDate}</td></tr>
            <tr><td style="padding: 8px;"><strong>Créneau:</strong></td><td style="padding: 8px;">{slotTime}</td></tr>
            <tr><td style="padding: 8px;"><strong>Quai:</strong></td><td style="padding: 8px;">{dockName}</td></tr>
          </table>
        </div>
        <p style="color: #6b7280; font-size: 12px;">RT SYMPHONI.A - Planning Chargement & Livraison</p>
      </div>
    `
  },

  [PlanningNotificationTypes.DRIVER_CALLED]: {
    subject: '🚛 Votre tour - RDV #{rdvNumber} - Quai {dockId}',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10b981;">C'est votre tour!</h2>
        <div style="background: #d1fae5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <p style="font-size: 24px; margin: 0;">Rendez-vous au</p>
          <p style="font-size: 48px; font-weight: bold; color: #059669; margin: 10px 0;">{dockName}</p>
        </div>
        <p>Votre véhicule est attendu au quai <strong>{dockId}</strong>.</p>
        <p style="color: #6b7280; font-size: 12px;">RT SYMPHONI.A - Planning Chargement & Livraison</p>
      </div>
    `
  },

  [PlanningNotificationTypes.DRIVER_NO_SHOW]: {
    subject: '⚠️ Absence détectée - RDV #{rdvNumber}',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ef4444;">Absence constatée</h2>
        <p>Le chauffeur ne s'est pas présenté au RDV:</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>N° RDV:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{rdvNumber}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Transporteur:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{carrierName}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Pénalité scoring:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #ef4444;">{scorePenalty} points</td></tr>
        </table>
        <p style="color: #6b7280; font-size: 12px;">RT SYMPHONI.A - Planning Chargement & Livraison</p>
      </div>
    `
  },

  [PlanningNotificationTypes.DELAY_DETECTED]: {
    subject: '⚠️ Retard détecté - RDV #{rdvNumber}',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f59e0b;">Retard détecté</h2>
        <p>Un retard a été détecté pour le RDV suivant:</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>N° RDV:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{rdvNumber}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Retard estimé:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #f59e0b;">{delayMinutes} minutes</td></tr>
        </table>
        <p>Un nouveau créneau vous sera proposé si nécessaire.</p>
        <p style="color: #6b7280; font-size: 12px;">RT SYMPHONI.A - Planning Chargement & Livraison</p>
      </div>
    `
  }
};

// ============================================================================
// TEMPLATES SMS
// ============================================================================

const PlanningSmsTemplates = {
  [PlanningNotificationTypes.RDV_REQUESTED]: 'RT: Demande RDV {rdvNumber} reçue pour {siteName} le {slotDate} à {slotTime}',
  [PlanningNotificationTypes.RDV_PROPOSED]: 'RT: Nouveau créneau proposé pour RDV {rdvNumber}: {newSlotDate} {newSlotTime}',
  [PlanningNotificationTypes.RDV_CONFIRMED]: '✅ RT: RDV {rdvNumber} confirmé - {siteName} le {slotDate} à {slotTime} - Quai {dockName}',
  [PlanningNotificationTypes.RDV_REFUSED]: '❌ RT: RDV {rdvNumber} refusé. Raison: {reason}',
  [PlanningNotificationTypes.RDV_RESCHEDULED]: '📅 RT: RDV {rdvNumber} replanifié au {newSlotDate} {newSlotTime}',
  [PlanningNotificationTypes.RDV_CANCELLED]: '🚫 RT: RDV {rdvNumber} annulé. Raison: {reason}',
  [PlanningNotificationTypes.RDV_REMINDER]: '⏰ RT: Rappel RDV {rdvNumber} demain {slotTime} - {siteName}',
  [PlanningNotificationTypes.DRIVER_CALLED]: '🚛 RT: C\'est votre tour! Rendez-vous au {dockName} maintenant. RDV {rdvNumber}',
  [PlanningNotificationTypes.DRIVER_NO_SHOW]: '⚠️ RT: Absence RDV {rdvNumber} - Pénalité {scorePenalty} pts',
  [PlanningNotificationTypes.DELAY_DETECTED]: '⚠️ RT: Retard {delayMinutes}min détecté sur RDV {rdvNumber}'
};

// ============================================================================
// SERVICE PRINCIPAL
// ============================================================================

class PlanningNotificationService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Envoyer une notification planning
   */
  async sendPlanningNotification(type, data, options = {}) {
    const {
      channels = ['email', 'sms'],
      recipients = []
    } = options;

    const results = {
      success: true,
      sent: [],
      errors: []
    };

    // Preparer les donnees pour les templates
    const templateData = this._prepareTemplateData(data);

    // Obtenir les contacts des destinataires
    const contacts = await this._getContacts(data, recipients);

    // Envoyer email
    if (channels.includes('email') && contacts.email) {
      const emailTemplate = PlanningEmailTemplates[type];
      if (emailTemplate) {
        const subject = notificationService.formatTemplate(emailTemplate.subject, templateData);
        const html = notificationService.formatTemplate(emailTemplate.body, templateData);

        const emailResult = await notificationService.sendEmail({
          to: contacts.email,
          subject,
          html
        });

        results.sent.push({ channel: 'email', ...emailResult });
        if (!emailResult.success) {
          results.errors.push(emailResult);
        }
      }
    }

    // Envoyer SMS
    if (channels.includes('sms') && contacts.phone) {
      const smsTemplate = PlanningSmsTemplates[type];
      if (smsTemplate) {
        const body = notificationService.formatTemplate(smsTemplate, templateData);

        const smsResult = await notificationService.sendSMS({
          to: contacts.phone,
          body
        });

        results.sent.push({ channel: 'sms', ...smsResult });
        if (!smsResult.success) {
          results.errors.push(smsResult);
        }
      }
    }

    // Log notification
    await this._logNotification(type, data, results);

    results.success = results.errors.length === 0;
    return results;
  }

  /**
   * Notifications specifiques au workflow RDV
   */
  async notifyRdvRequested(rdv) {
    return this.sendPlanningNotification(
      PlanningNotificationTypes.RDV_REQUESTED,
      { rdv },
      { channels: ['email'], recipients: ['site'] }
    );
  }

  async notifyRdvProposed(rdv, reason) {
    return this.sendPlanningNotification(
      PlanningNotificationTypes.RDV_PROPOSED,
      { rdv, reason },
      { channels: ['email', 'sms'], recipients: ['carrier'] }
    );
  }

  async notifyRdvConfirmed(rdv) {
    return this.sendPlanningNotification(
      PlanningNotificationTypes.RDV_CONFIRMED,
      { rdv },
      { channels: ['email', 'sms'], recipients: ['carrier', 'site'] }
    );
  }

  async notifyRdvRefused(rdv, reason) {
    return this.sendPlanningNotification(
      PlanningNotificationTypes.RDV_REFUSED,
      { rdv, reason },
      { channels: ['email', 'sms'], recipients: ['carrier'] }
    );
  }

  async notifyRdvRescheduled(rdv, reason) {
    return this.sendPlanningNotification(
      PlanningNotificationTypes.RDV_RESCHEDULED,
      { rdv, reason },
      { channels: ['email', 'sms'], recipients: ['carrier', 'site'] }
    );
  }

  async notifyRdvCancelled(rdv, reason) {
    return this.sendPlanningNotification(
      PlanningNotificationTypes.RDV_CANCELLED,
      { rdv, reason },
      { channels: ['email', 'sms'], recipients: ['carrier', 'site'] }
    );
  }

  /**
   * Notification chauffeur appele (priorite SMS)
   */
  async notifyDriverCalled(rdv, dockId, dockName) {
    return this.sendPlanningNotification(
      PlanningNotificationTypes.DRIVER_CALLED,
      { rdv, dockId, dockName },
      { channels: ['sms', 'email'], recipients: ['driver'] }
    );
  }

  /**
   * Notification no-show
   */
  async notifyNoShow(rdv, scorePenalty) {
    return this.sendPlanningNotification(
      PlanningNotificationTypes.DRIVER_NO_SHOW,
      { rdv, scorePenalty },
      { channels: ['email'], recipients: ['carrier', 'site'] }
    );
  }

  /**
   * Notification retard detecte
   */
  async notifyDelayDetected(rdv, delayMinutes) {
    return this.sendPlanningNotification(
      PlanningNotificationTypes.DELAY_DETECTED,
      { rdv, delayMinutes },
      { channels: ['email', 'sms'], recipients: ['site'] }
    );
  }

  /**
   * Preparer les donnees pour les templates
   */
  _prepareTemplateData(data) {
    const { rdv, reason, dockId, dockName, scorePenalty, delayMinutes } = data;

    if (!rdv) return data;

    return {
      rdvNumber: rdv.rdvNumber || rdv.rdvId,
      siteName: rdv.site?.siteName || 'Site',
      siteAddress: rdv.site?.address ? `${rdv.site.address.street}, ${rdv.site.address.city}` : '',
      slotDate: rdv.slot?.date ? new Date(rdv.slot.date).toLocaleDateString('fr-FR') : '',
      slotTime: rdv.slot ? `${rdv.slot.startTime} - ${rdv.slot.endTime}` : '',
      newSlotDate: rdv.slot?.date ? new Date(rdv.slot.date).toLocaleDateString('fr-FR') : '',
      newSlotTime: rdv.slot ? `${rdv.slot.startTime} - ${rdv.slot.endTime}` : '',
      dockId: dockId || rdv.slot?.dockId || '',
      dockName: dockName || rdv.slot?.dockName || '',
      carrierName: rdv.carrier?.carrierName || 'Transporteur',
      flowType: rdv.flowType === 'loading' ? 'Chargement' : 'Livraison',
      arrivalInstructions: rdv.site?.instructions?.arrival || 'Suivre la signalétique',
      reason: reason || '',
      scorePenalty: scorePenalty || -15,
      delayMinutes: delayMinutes || 0,
      ...data
    };
  }

  /**
   * Obtenir les contacts des destinataires
   */
  async _getContacts(data, recipients) {
    const contacts = { email: [], phone: [] };
    const { rdv } = data;

    if (!rdv) return { email: null, phone: null };

    for (const recipient of recipients) {
      switch (recipient) {
        case 'carrier':
          if (rdv.carrier?.carrierId) {
            const carrier = await this.db.collection('carriers')
              .findOne({ _id: rdv.carrier.carrierId });
            if (carrier) {
              if (carrier.email) contacts.email.push(carrier.email);
              if (carrier.phone) contacts.phone.push(carrier.phone);
            }
          }
          break;

        case 'driver':
          if (rdv.driver?.phone) {
            contacts.phone.push(rdv.driver.phone);
          }
          if (rdv.driver?.driverId) {
            const driver = await this.db.collection('users')
              .findOne({ _id: rdv.driver.driverId });
            if (driver) {
              if (driver.email) contacts.email.push(driver.email);
              if (driver.phone) contacts.phone.push(driver.phone);
            }
          }
          break;

        case 'site':
          const sitePlanning = await this.db.collection('site_plannings')
            .findOne({ _id: rdv.sitePlanningId });
          if (sitePlanning?.contacts) {
            for (const contact of sitePlanning.contacts) {
              if (contact.email) contacts.email.push(contact.email);
              if (contact.phone) contacts.phone.push(contact.phone);
            }
          }
          break;
      }
    }

    return {
      email: contacts.email.length > 0 ? contacts.email : null,
      phone: contacts.phone.length > 0 ? contacts.phone[0] : null // SMS: premier numero
    };
  }

  /**
   * Logger la notification
   */
  async _logNotification(type, data, results) {
    try {
      await this.db.collection('planning_notifications').insertOne({
        type,
        rdvId: data.rdv?._id,
        rdvNumber: data.rdv?.rdvNumber,
        results: results.sent,
        errors: results.errors,
        sentAt: new Date()
      });
    } catch (error) {
      console.error('[PlanningNotification] Log error:', error.message);
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  PlanningNotificationService,
  PlanningNotificationTypes,
  PlanningEmailTemplates,
  PlanningSmsTemplates
};
