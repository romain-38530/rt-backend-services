/**
 * Service de Diffusion Multi-Canal AFFRET.IA
 * Gere l'envoi Email, Bourse publique, Push notifications
 */

const axios = require('axios');
const BroadcastCampaign = require('../models/BroadcastCampaign');

class BroadcastService {
  constructor() {
    this.notificationsApiUrl = process.env.NOTIFICATIONS_API_URL;
    this.sendgridApiKey = process.env.SENDGRID_API_KEY;
    this.sendgridFromEmail = process.env.SENDGRID_FROM_EMAIL || 'affret@symphonia.com';
    this.bourseBaseUrl = process.env.BOURSE_BASE_URL || 'https://bourse.affretia.com';
  }

  /**
   * Creer une campagne de diffusion
   */
  async createBroadcastCampaign(sessionId, orderId, organizationId, shortlist, channels = ['email', 'bourse', 'push']) {
    try {
      // Generer un ID de campagne
      const campaignId = await BroadcastCampaign.generateCampaignId();

      // Preparer les recipients
      const recipients = shortlist.map(carrier => ({
        carrierId: carrier.carrierId,
        carrierName: carrier.carrierName,
        contactEmail: carrier.contactEmail,
        contactPhone: carrier.contactPhone,
        channel: this.determinePreferredChannel(carrier, channels),
        queued: true,
        queuedAt: new Date(),
        sent: false,
        delivered: false,
        opened: false,
        clicked: false,
        responded: false,
        failed: false
      }));

      // Creer la campagne
      const campaign = new BroadcastCampaign({
        campaignId,
        sessionId,
        orderId,
        organizationId,
        channels: channels.map(channel => ({
          type: channel,
          enabled: true,
          status: 'pending'
        })),
        recipients,
        stats: {
          total: recipients.length,
          queued: recipients.length
        },
        status: 'draft',
        settings: {
          priority: 'normal',
          autoReminders: true,
          responseDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
        }
      });

      await campaign.save();

      return campaign;
    } catch (error) {
      console.error('[BROADCAST SERVICE] Error creating campaign:', error);
      throw error;
    }
  }

  /**
   * Executer la diffusion multi-canal
   */
  async executeBroadcast(campaign, orderData) {
    try {
      campaign.status = 'sending';
      campaign.startedAt = new Date();
      await campaign.save();

      const results = {
        email: { sent: 0, failed: 0 },
        bourse: { published: false },
        push: { sent: 0, failed: 0 }
      };

      // Diffuser par email
      if (campaign.channels.some(c => c.type === 'email' && c.enabled)) {
        const emailResult = await this.sendEmailBroadcast(campaign, orderData);
        results.email = emailResult;

        const emailChannel = campaign.channels.find(c => c.type === 'email');
        emailChannel.sentAt = new Date();
        emailChannel.status = 'sent';
      }

      // Publier sur la bourse
      if (campaign.channels.some(c => c.type === 'bourse' && c.enabled)) {
        const bourseResult = await this.publishToBourse(campaign, orderData);
        results.bourse = bourseResult;

        const bourseChannel = campaign.channels.find(c => c.type === 'bourse');
        bourseChannel.sentAt = new Date();
        bourseChannel.status = 'sent';
      }

      // Envoyer push notifications
      if (campaign.channels.some(c => c.type === 'push' && c.enabled)) {
        const pushResult = await this.sendPushNotifications(campaign, orderData);
        results.push = pushResult;

        const pushChannel = campaign.channels.find(c => c.type === 'push');
        pushChannel.sentAt = new Date();
        pushChannel.status = 'sent';
      }

      // Mettre a jour la campagne
      campaign.status = 'sent';
      campaign.completedAt = new Date();
      campaign.duration = campaign.completedAt - campaign.startedAt;
      campaign.updateStats();
      await campaign.save();

      return {
        campaignId: campaign.campaignId,
        results,
        recipientsCount: campaign.recipients.length
      };

    } catch (error) {
      console.error('[BROADCAST SERVICE] Error executing broadcast:', error);
      campaign.status = 'failed';
      await campaign.save();
      throw error;
    }
  }

  /**
   * Envoyer des emails aux transporteurs
   */
  async sendEmailBroadcast(campaign, orderData) {
    let sent = 0;
    let failed = 0;

    const emailRecipients = campaign.recipients.filter(r => r.channel === 'email' && r.contactEmail);

    for (const recipient of emailRecipients) {
      try {
        const emailContent = this.generateEmailContent(orderData, campaign);

        // Utiliser le service de notifications
        if (this.notificationsApiUrl) {
          await axios.post(`${this.notificationsApiUrl}/api/v1/notifications/send`, {
            type: 'email',
            to: recipient.contactEmail,
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text,
            metadata: {
              campaignId: campaign.campaignId,
              sessionId: campaign.sessionId,
              carrierId: recipient.carrierId
            }
          });
        } else {
          console.warn('[BROADCAST SERVICE] Notifications API not configured, skipping email');
        }

        campaign.markRecipientSent(recipient.carrierId);
        sent++;

      } catch (error) {
        console.error(`[BROADCAST SERVICE] Error sending email to ${recipient.carrierId}:`, error.message);
        campaign.markRecipientFailed(recipient.carrierId, error.message);
        failed++;
      }
    }

    await campaign.save();

    return { sent, failed, total: emailRecipients.length };
  }

  /**
   * Publier sur la bourse publique AFFRET.IA
   */
  async publishToBourse(campaign, orderData) {
    try {
      const bourseUrl = `${this.bourseBaseUrl}/${campaign.sessionId}`;

      campaign.boursePublication = {
        published: true,
        publishedAt: new Date(),
        expiresAt: campaign.settings.responseDeadline,
        views: 0,
        url: bourseUrl
      };

      await campaign.save();

      return {
        published: true,
        url: bourseUrl,
        expiresAt: campaign.settings.responseDeadline
      };

    } catch (error) {
      console.error('[BROADCAST SERVICE] Error publishing to bourse:', error);
      return { published: false, error: error.message };
    }
  }

  /**
   * Envoyer des push notifications
   */
  async sendPushNotifications(campaign, orderData) {
    let sent = 0;
    let failed = 0;

    const pushRecipients = campaign.recipients.filter(r =>
      (r.channel === 'push' || !r.contactEmail) && r.carrierId
    );

    for (const recipient of pushRecipients) {
      try {
        const pushContent = this.generatePushContent(orderData, campaign);

        if (this.notificationsApiUrl) {
          await axios.post(`${this.notificationsApiUrl}/api/v1/notifications/send`, {
            type: 'push',
            carrierId: recipient.carrierId,
            title: pushContent.title,
            body: pushContent.body,
            data: pushContent.data
          });
        }

        campaign.markRecipientSent(recipient.carrierId);
        sent++;

      } catch (error) {
        console.error(`[BROADCAST SERVICE] Error sending push to ${recipient.carrierId}:`, error.message);
        campaign.markRecipientFailed(recipient.carrierId, error.message);
        failed++;
      }
    }

    await campaign.save();

    return { sent, failed, total: pushRecipients.length };
  }

  /**
   * Generer le contenu d'un email
   */
  generateEmailContent(orderData, campaign) {
    const subject = `Nouvelle opportunite de transport - ${orderData.pickup?.city || 'Pickup'} > ${orderData.delivery?.city || 'Delivery'}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .detail-row { margin: 10px 0; padding: 10px; background: white; border-left: 3px solid #2563eb; }
          .label { font-weight: bold; color: #1f2937; }
          .value { color: #4b5563; }
          .cta { text-align: center; margin: 30px 0; }
          .button { background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>AFFRET.IA - Nouvelle Opportunite</h1>
          </div>

          <div class="content">
            <p>Bonjour,</p>
            <p>Une nouvelle mission de transport est disponible et correspond a votre profil :</p>

            <div class="detail-row">
              <span class="label">Enlevement :</span>
              <span class="value">${orderData.pickup?.address || ''}, ${orderData.pickup?.postalCode || ''} ${orderData.pickup?.city || ''}</span>
            </div>

            <div class="detail-row">
              <span class="label">Livraison :</span>
              <span class="value">${orderData.delivery?.address || ''}, ${orderData.delivery?.postalCode || ''} ${orderData.delivery?.city || ''}</span>
            </div>

            <div class="detail-row">
              <span class="label">Date d'enlevement :</span>
              <span class="value">${orderData.pickupDate ? new Date(orderData.pickupDate).toLocaleDateString('fr-FR') : 'A definir'}</span>
            </div>

            <div class="detail-row">
              <span class="label">Marchandise :</span>
              <span class="value">${orderData.cargo?.type || ''} - ${orderData.cargo?.quantity || 0} unite(s) - ${orderData.cargo?.weight?.value || 0} kg</span>
            </div>

            <div class="detail-row">
              <span class="label">Type de vehicule :</span>
              <span class="value">${orderData.vehicleType || 'Standard'}</span>
            </div>

            <div class="cta">
              <a href="${this.bourseBaseUrl}/${campaign.sessionId}" class="button">
                Voir les details et soumettre une proposition
              </a>
            </div>

            <p><strong>Date limite de reponse :</strong> ${campaign.settings.responseDeadline ? new Date(campaign.settings.responseDeadline).toLocaleString('fr-FR') : '24h'}</p>
          </div>

          <div class="footer">
            <p>AFFRET.IA - Plateforme d'affretement intelligent SYMPHONI.A</p>
            <p>Session : ${campaign.sessionId}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
AFFRET.IA - Nouvelle Opportunite de Transport

Enlevement : ${orderData.pickup?.city || ''} (${orderData.pickup?.postalCode || ''})
Livraison : ${orderData.delivery?.city || ''} (${orderData.delivery?.postalCode || ''})
Date : ${orderData.pickupDate ? new Date(orderData.pickupDate).toLocaleDateString('fr-FR') : 'A definir'}
Marchandise : ${orderData.cargo?.type || ''} - ${orderData.cargo?.weight?.value || 0} kg

Pour soumettre une proposition : ${this.bourseBaseUrl}/${campaign.sessionId}

Date limite : ${campaign.settings.responseDeadline ? new Date(campaign.settings.responseDeadline).toLocaleString('fr-FR') : '24h'}

Session : ${campaign.sessionId}
    `;

    return { subject, html, text };
  }

  /**
   * Generer le contenu d'une push notification
   */
  generatePushContent(orderData, campaign) {
    return {
      title: 'Nouvelle opportunite AFFRET.IA',
      body: `${orderData.pickup?.city || 'Pickup'} > ${orderData.delivery?.city || 'Delivery'} - ${orderData.pickupDate ? new Date(orderData.pickupDate).toLocaleDateString('fr-FR') : 'A definir'}`,
      data: {
        sessionId: campaign.sessionId,
        orderId: campaign.orderId,
        type: 'affret_opportunity',
        url: `${this.bourseBaseUrl}/${campaign.sessionId}`
      }
    };
  }

  /**
   * Determiner le canal prefere pour un transporteur
   */
  determinePreferredChannel(carrier, availableChannels) {
    // Priorite : email > push > bourse
    if (availableChannels.includes('email') && carrier.contactEmail) {
      return 'email';
    }
    if (availableChannels.includes('push')) {
      return 'push';
    }
    return 'bourse';
  }

  /**
   * Envoyer une relance
   */
  async sendReminder(campaignId) {
    try {
      const campaign = await BroadcastCampaign.findOne({ campaignId });

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Trouver les destinataires qui n'ont pas encore repondu
      const nonRespondents = campaign.recipients.filter(r => r.sent && !r.responded);

      if (nonRespondents.length === 0) {
        return { sent: 0, message: 'No non-respondents to remind' };
      }

      // TODO: Implementer l'envoi de relances
      campaign.addReminder(nonRespondents.length, 'email');
      await campaign.save();

      return {
        sent: nonRespondents.length,
        campaignId: campaign.campaignId
      };

    } catch (error) {
      console.error('[BROADCAST SERVICE] Error sending reminder:', error);
      throw error;
    }
  }
}

module.exports = new BroadcastService();
