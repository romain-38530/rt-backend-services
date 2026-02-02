/**
 * Agent Destinataire - Simule un destinataire (réceptionnaire)
 */

const axios = require('axios');
const { log, assert, sleep } = require('../utils/test-helpers');

class AgentDestinataire {
  constructor(name, email, baseUrls) {
    this.name = name;
    this.email = email;
    this.password = 'DestinataireTest2026!';
    this.token = null;
    this.recipientId = null;
    this.appointments = [];
    this.baseUrls = baseUrls;
  }

  /**
   * S'inscrire sur la plateforme
   */
  async register() {
    try {
      log(`Inscription destinataire ${this.name}...`, 'info');

      const response = await axios.post(`${this.baseUrls.authz}/register`, {
        email: this.email,
        password: this.password,
        name: this.name,
        portal: 'recipient',
        companyName: `${this.name} Entrepôt`
      });

      this.token = response.data.token;
      this.recipientId = response.data.user.id;

      log(`Destinataire ${this.name} inscrit: ${this.email}`, 'success');

      return response.data;
    } catch (error) {
      log(`Erreur inscription destinataire: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Se connecter
   */
  async login() {
    try {
      const response = await axios.post(`${this.baseUrls.authz}/login`, {
        email: this.email,
        password: this.password
      });

      this.token = response.data.token;
      this.recipientId = response.data.user.id;

      log(`Destinataire ${this.name} connecté`, 'success');

      return response.data;
    } catch (error) {
      log(`Erreur login: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Obtenir le profil
   */
  async getProfile() {
    try {
      const response = await axios.get(`${this.baseUrls.authz}/me`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });

      return response.data.user;
    } catch (error) {
      log(`Erreur récupération profil: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Vérifier l'accès à une commande
   */
  async checkOrderAccess(orderId) {
    try {
      const response = await axios.get(
        `${this.baseUrls.authz}/recipient/orders/${orderId}/access`,
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      return response.data;
    } catch (error) {
      log(`Erreur vérification accès: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Obtenir les créneaux disponibles pour un RDV
   */
  async getAvailableSlots(orderId, date) {
    try {
      log(`Récupération créneaux disponibles pour ${orderId}...`, 'info');

      const response = await axios.get(
        `${this.baseUrls.authz}/recipient/rdv/slots`,
        {
          params: {
            orderId,
            date: date.toISOString().split('T')[0] // Format YYYY-MM-DD
          },
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      log(`${response.data.slots.length} créneaux disponibles`, 'success');

      return response.data.slots || [];
    } catch (error) {
      log(`Erreur récupération créneaux: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Prendre un RDV de livraison
   */
  async bookAppointment(orderId, slotDate, slotTime) {
    try {
      log(`Prise de RDV pour commande ${orderId}...`, 'info');

      const response = await axios.post(
        `${this.baseUrls.authz}/recipient/rdv`,
        {
          orderId,
          type: 'delivery',
          date: typeof slotDate === 'string' ? slotDate : slotDate.toISOString().split('T')[0],
          timeSlot: slotTime,
          recipientId: this.recipientId
        },
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      this.appointments.push(response.data.appointment);

      log(`RDV confirmé: ${slotDate} ${slotTime}`, 'success');

      return response.data.appointment;
    } catch (error) {
      log(`Erreur prise de RDV: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Annuler un RDV
   */
  async cancelAppointment(appointmentId, reason) {
    try {
      log(`Annulation RDV ${appointmentId}...`, 'info');

      const response = await axios.post(
        `${this.baseUrls.authz}/recipient/rdv/${appointmentId}/cancel`,
        {
          reason
        },
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      log('RDV annulé', 'warning');

      return response.data.appointment;
    } catch (error) {
      log(`Erreur annulation RDV: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Obtenir la liste des RDV
   */
  async getAppointments() {
    try {
      const response = await axios.get(
        `${this.baseUrls.authz}/recipient/rdv`,
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      return response.data.appointments || [];
    } catch (error) {
      log(`Erreur récupération RDV: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Signer un eCMR en tant que destinataire
   */
  async signECMR(ecmrId, signature) {
    try {
      log(`Signature eCMR ${ecmrId} par destinataire...`, 'info');

      const response = await axios.post(
        `${this.baseUrls.ecmr}/ecmr/${ecmrId}/sign`,
        {
          role: 'consignee',
          signature,
          signedAt: new Date(),
          signedBy: this.name,
          recipientId: this.recipientId
        },
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      log('eCMR signé par destinataire', 'success');

      return response.data.ecmr;
    } catch (error) {
      log(`Erreur signature eCMR: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Consulter un eCMR
   */
  async getECMR(ecmrId) {
    try {
      const response = await axios.get(
        `${this.baseUrls.ecmr}/ecmr/${ecmrId}`,
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      return response.data.ecmr;
    } catch (error) {
      log(`Erreur récupération eCMR: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Télécharger le PDF d'un eCMR
   */
  async getECMRPDF(ecmrId) {
    try {
      const response = await axios.get(
        `${this.baseUrls.ecmr}/ecmr/${ecmrId}/pdf`,
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      return response.data.pdfUrl;
    } catch (error) {
      log(`Erreur téléchargement PDF: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Signaler un problème de livraison
   */
  async reportDeliveryIssue(orderId, issue) {
    try {
      log(`Signalement problème livraison ${orderId}...`, 'warning');

      const response = await axios.post(
        `${this.baseUrls.authz}/recipient/orders/${orderId}/issue`,
        {
          issueType: issue.type,
          description: issue.description,
          severity: issue.severity || 'medium',
          reportedBy: this.recipientId
        },
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      log(`Problème signalé: ${issue.type}`, 'warning');

      return response.data.issue;
    } catch (error) {
      log(`Erreur signalement problème: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Confirmer réception de la livraison
   */
  async confirmDelivery(orderId, confirmation) {
    try {
      log(`Confirmation livraison ${orderId}...`, 'info');

      const response = await axios.post(
        `${this.baseUrls.authz}/recipient/orders/${orderId}/confirm`,
        {
          receivedAt: new Date(),
          receivedBy: this.name,
          recipientId: this.recipientId,
          notes: confirmation.notes,
          damageReported: confirmation.damageReported || false
        },
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      log('Livraison confirmée', 'success');

      return response.data.delivery;
    } catch (error) {
      log(`Erreur confirmation livraison: ${error.message}`, 'error');
      throw error;
    }
  }
}

module.exports = AgentDestinataire;
