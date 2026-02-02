/**
 * Agent de Simulation Emails
 *
 * Simule l'envoi et la réception d'emails à chaque étape
 * avec test des liens inclus par les destinataires
 */

const axios = require('axios');

class EmailSimulationAgent {
  constructor() {
    this.role = 'Email System';
    this.sentEmails = [];
    this.emailInteractions = [];
  }

  /**
   * Simule l'envoi d'un email
   */
  async sendEmail(template, recipient, data) {
    const email = {
      id: `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      template,
      recipient,
      data,
      sentAt: new Date(),
      status: 'sent',
      links: this.extractLinksFromTemplate(template, data)
    };

    this.sentEmails.push(email);

    console.log(`${this.colors().cyan}[Email System]${this.colors().reset} Envoi: ${template} → ${recipient.email}`);
    console.log(`  ${this.colors().dim}Objet: ${this.getEmailSubject(template, data)}${this.colors().reset}`);

    return email;
  }

  /**
   * Simule un destinataire qui reçoit et lit l'email
   */
  async recipientReceivesEmail(emailId, recipient) {
    const email = this.sentEmails.find(e => e.id === emailId);
    if (!email) {
      throw new Error(`Email ${emailId} non trouvé`);
    }

    console.log(`${this.colors().green}[${recipient.name}]${this.colors().reset} Reçoit email: ${email.template}`);

    const interaction = {
      emailId,
      recipient: recipient.email,
      openedAt: new Date(),
      linksClicked: []
    };

    this.emailInteractions.push(interaction);

    // Simuler ouverture après 1-5 minutes
    await this.sleep(100);

    return interaction;
  }

  /**
   * Simule un destinataire qui clique sur un lien dans l'email
   */
  async recipientClicksLink(interactionId, linkIndex, recipient) {
    const interaction = this.emailInteractions.find(i => i.emailId === interactionId);
    const email = this.sentEmails.find(e => e.id === interactionId);

    if (!email || !email.links[linkIndex]) {
      throw new Error(`Lien ${linkIndex} non trouvé dans email ${interactionId}`);
    }

    const link = email.links[linkIndex];

    console.log(`${this.colors().green}[${recipient.name}]${this.colors().reset} Clique sur: ${link.label}`);
    console.log(`  ${this.colors().dim}URL: ${link.url}${this.colors().reset}`);

    // Test du lien
    const testResult = await this.testLink(link.url, recipient);

    interaction.linksClicked.push({
      linkIndex,
      linkUrl: link.url,
      clickedAt: new Date(),
      testResult
    });

    return testResult;
  }

  /**
   * Test un lien HTTP pour vérifier qu'il fonctionne
   */
  async testLink(url, recipient) {
    try {
      // Remplacer les placeholders dans l'URL
      const fullUrl = url.replace('{token}', 'test_token_123');

      console.log(`  ${this.colors().blue}ℹ${this.colors().reset} Test du lien: ${fullUrl}`);

      // Simuler la requête HTTP
      const response = await axios.get(fullUrl, {
        timeout: 5000,
        validateStatus: () => true // Accepter tous les status codes
      });

      const success = response.status >= 200 && response.status < 400;

      if (success) {
        console.log(`  ${this.colors().green}✓${this.colors().reset} Lien fonctionnel (${response.status})`);
      } else {
        console.log(`  ${this.colors().red}✗${this.colors().reset} Lien en erreur (${response.status})`);
      }

      return {
        url: fullUrl,
        status: response.status,
        success,
        responseTime: response.headers['x-response-time'] || 'N/A',
        testedAt: new Date()
      };

    } catch (error) {
      console.log(`  ${this.colors().red}✗${this.colors().reset} Erreur: ${error.message}`);

      return {
        url,
        success: false,
        error: error.message,
        testedAt: new Date()
      };
    }
  }

  /**
   * Extrait les liens d'un template d'email
   */
  extractLinksFromTemplate(template, data) {
    const links = {
      'carrier_invitation': [
        {
          label: 'Créer mon compte',
          url: `${data.baseUrl}/carriers/signup?token={token}`,
          action: 'signup'
        },
        {
          label: 'En savoir plus',
          url: `${data.baseUrl}/about`,
          action: 'info'
        }
      ],
      'document_expiry_alert': [
        {
          label: 'Voir mes documents',
          url: `${data.baseUrl}/carriers/documents`,
          action: 'view_documents'
        },
        {
          label: 'Uploader nouveau document',
          url: `${data.baseUrl}/carriers/documents/upload`,
          action: 'upload'
        }
      ],
      'pricing_request': [
        {
          label: 'Voir la demande',
          url: `${data.baseUrl}/carriers/orders/${data.orderId}`,
          action: 'view_order'
        },
        {
          label: 'Soumettre un devis',
          url: `${data.baseUrl}/carriers/orders/${data.orderId}/quote`,
          action: 'submit_quote'
        }
      ],
      'order_confirmed': [
        {
          label: 'Voir les détails',
          url: `${data.baseUrl}/carriers/orders/${data.orderId}`,
          action: 'view_details'
        },
        {
          label: 'Contacter le donneur d\'ordre',
          url: `${data.baseUrl}/carriers/orders/${data.orderId}/contact`,
          action: 'contact'
        }
      ],
      'tracking_update': [
        {
          label: 'Suivre ma commande',
          url: `${data.baseUrl}/tracking/${data.trackingId}`,
          action: 'track'
        }
      ],
      'delivery_confirmation': [
        {
          label: 'Voir le bon de livraison',
          url: `${data.baseUrl}/orders/${data.orderId}/pod`,
          action: 'view_pod'
        },
        {
          label: 'Télécharger e-CMR',
          url: `${data.baseUrl}/orders/${data.orderId}/ecmr/download`,
          action: 'download_ecmr'
        }
      ],
      'invoice_ready': [
        {
          label: 'Voir la facture',
          url: `${data.baseUrl}/invoices/${data.invoiceId}`,
          action: 'view_invoice'
        },
        {
          label: 'Télécharger PDF',
          url: `${data.baseUrl}/invoices/${data.invoiceId}/download`,
          action: 'download_pdf'
        }
      ]
    };

    return links[template] || [];
  }

  /**
   * Génère l'objet de l'email selon le template
   */
  getEmailSubject(template, data) {
    const subjects = {
      'carrier_invitation': `Invitation Symphonia - ${data.companyName}`,
      'document_expiry_alert': `⚠️ Documents expirant bientôt - ${data.documentType}`,
      'pricing_request': `Nouvelle demande de transport - ${data.orderId}`,
      'order_confirmed': `✓ Commande confirmée - ${data.orderId}`,
      'tracking_update': `📍 Mise à jour transport - ${data.orderId}`,
      'delivery_confirmation': `✓ Livraison effectuée - ${data.orderId}`,
      'invoice_ready': `Facture disponible - ${data.invoiceId}`
    };

    return subjects[template] || 'Email Symphonia';
  }

  /**
   * Génère un rapport des emails envoyés et des interactions
   */
  generateReport() {
    const totalEmails = this.sentEmails.length;
    const totalInteractions = this.emailInteractions.length;
    const totalLinksClicked = this.emailInteractions.reduce((sum, i) => sum + i.linksClicked.length, 0);

    const linkTests = this.emailInteractions
      .flatMap(i => i.linksClicked)
      .map(l => l.testResult);

    const successfulLinks = linkTests.filter(t => t.success).length;
    const failedLinks = linkTests.filter(t => !t.success).length;

    return {
      emails: {
        total: totalEmails,
        byTemplate: this.countByTemplate(),
        deliveryRate: '100%' // Simulé
      },
      interactions: {
        total: totalInteractions,
        openRate: ((totalInteractions / totalEmails) * 100).toFixed(2) + '%',
        totalLinksClicked,
        clickRate: ((totalLinksClicked / totalEmails) * 100).toFixed(2) + '%'
      },
      linkTests: {
        total: linkTests.length,
        successful: successfulLinks,
        failed: failedLinks,
        successRate: ((successfulLinks / linkTests.length) * 100).toFixed(2) + '%'
      },
      details: {
        sentEmails: this.sentEmails,
        interactions: this.emailInteractions
      }
    };
  }

  countByTemplate() {
    const counts = {};
    this.sentEmails.forEach(email => {
      counts[email.template] = (counts[email.template] || 0) + 1;
    });
    return counts;
  }

  colors() {
    return {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      dim: '\x1b[2m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m'
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { EmailSimulationAgent };
