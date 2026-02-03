/**
 * Service d'envoi d'emails via AWS SES
 * Remplace nodemailer pour production
 */

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

class AwsSesEmailService {
  constructor() {
    // Configuration AWS SES
    this.sesClient = new SESClient({
      region: process.env.AWS_REGION || 'eu-central-1'
    });

    this.fromEmail = process.env.SES_FROM_EMAIL || 'affret-ia@symphonia-controltower.com';
    this.fromName = process.env.SES_FROM_NAME || 'AFFRET.IA SYMPHONI.A';
  }

  /**
   * Convertir HTML en texte brut (améliore délivrabilité anti-spam)
   */
  htmlToText(html) {
    return html
      // Retirer balises <style>
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      // Retirer balises <script>
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      // Convertir <br> en saut de ligne
      .replace(/<br\s*\/?>/gi, '\n')
      // Convertir <p> en saut de ligne
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<p[^>]*>/gi, '')
      // Convertir <li> en bullet point
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<\/li>/gi, '\n')
      // Convertir titres en majuscules
      .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, (match, content) => {
        return '\n\n' + content.toUpperCase() + '\n\n';
      })
      // Convertir liens en format texte
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
      // Retirer toutes les autres balises HTML
      .replace(/<[^>]+>/g, '')
      // Décoder entités HTML
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&rarr;/g, '→')
      // Nettoyer espaces multiples
      .replace(/[ \t]+/g, ' ')
      // Nettoyer sauts de ligne multiples
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Envoyer un email via AWS SES (avec version texte automatique)
   */
  async sendEmail({ to, subject, html, text = null, replyTo = null }) {
    try {
      // Générer version texte si non fournie (améliore délivrabilité)
      const textContent = text || this.htmlToText(html);

      const params = {
        Source: `"${this.fromName}" <${this.fromEmail}>`,
        Destination: {
          ToAddresses: Array.isArray(to) ? to : [to]
        },
        Message: {
          Subject: {
            Charset: 'UTF-8',
            Data: subject
          },
          Body: {
            Html: {
              Charset: 'UTF-8',
              Data: html
            },
            Text: {
              Charset: 'UTF-8',
              Data: textContent
            }
          }
        }
      };

      // Ajouter ReplyTo si fourni
      if (replyTo) {
        params.ReplyToAddresses = [replyTo];
      }

      const command = new SendEmailCommand(params);
      const response = await this.sesClient.send(command);

      console.log(`[AWS SES] ✅ Email envoyé à ${to} (HTML + Texte)`);
      console.log(`[AWS SES] MessageId: ${response.MessageId}`);

      return {
        success: true,
        messageId: response.MessageId
      };

    } catch (error) {
      console.error(`[AWS SES] ❌ Erreur envoi email à ${to}:`, error.message);
      throw error;
    }
  }

  /**
   * Envoyer un email en batch (jusqu'à 50 destinataires)
   */
  async sendBatchEmail({ recipients, subject, html }) {
    try {
      const results = [];

      // AWS SES limite à 50 destinataires par appel
      const batchSize = 50;

      for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);

        const params = {
          Source: `"${this.fromName}" <${this.fromEmail}>`,
          Destination: {
            ToAddresses: batch
          },
          Message: {
            Subject: {
              Charset: 'UTF-8',
              Data: subject
            },
            Body: {
              Html: {
                Charset: 'UTF-8',
                Data: html
              }
            }
          }
        };

        const command = new SendEmailCommand(params);
        const response = await this.sesClient.send(command);

        results.push({
          batch: i / batchSize + 1,
          recipients: batch,
          messageId: response.MessageId
        });

        console.log(`[AWS SES] ✅ Batch ${i / batchSize + 1} envoyé (${batch.length} destinataires)`);
      }

      return {
        success: true,
        totalSent: recipients.length,
        batches: results.length,
        results
      };

    } catch (error) {
      console.error('[AWS SES] Erreur envoi batch:', error.message);
      throw error;
    }
  }

  /**
   * Vérifier si une adresse email est vérifiée dans SES
   * (requis en mode sandbox)
   */
  async verifyEmail(email) {
    try {
      const { VerifyEmailIdentityCommand } = require('@aws-sdk/client-ses');
      const command = new VerifyEmailIdentityCommand({ EmailAddress: email });
      await this.sesClient.send(command);

      console.log(`[AWS SES] ✅ Email de vérification envoyé à ${email}`);
      return { success: true };

    } catch (error) {
      console.error(`[AWS SES] Erreur vérification email ${email}:`, error.message);
      throw error;
    }
  }

  /**
   * Obtenir les statistiques d'envoi
   */
  async getSendQuota() {
    try {
      const { GetSendQuotaCommand } = require('@aws-sdk/client-ses');
      const command = new GetSendQuotaCommand({});
      const response = await this.sesClient.send(command);

      return {
        max24HourSend: response.Max24HourSend,
        maxSendRate: response.MaxSendRate,
        sentLast24Hours: response.SentLast24Hours,
        remaining: response.Max24HourSend - response.SentLast24Hours
      };

    } catch (error) {
      console.error('[AWS SES] Erreur récupération quota:', error.message);
      throw error;
    }
  }
}

module.exports = new AwsSesEmailService();
