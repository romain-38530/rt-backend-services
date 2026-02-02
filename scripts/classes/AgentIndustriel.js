/**
 * Agent Industriel - Simule un donneur d'ordre (client industriel)
 */

const axios = require('axios');
const { log, assert, sleep, retry } = require('../utils/test-helpers');

class AgentIndustriel {
  constructor(name, email, baseUrls) {
    this.name = name;
    this.email = email;
    this.password = 'IndustrielTest2026!';
    this.token = null;
    this.organizationId = null;
    this.orders = [];
    this.transporters = [];
    this.baseUrls = baseUrls;
  }

  /**
   * S'inscrire sur la plateforme
   */
  async register() {
    try {
      log(`Inscription de l'industriel ${this.name}...`, 'info');

      const response = await axios.post(`${this.baseUrls.authz}/register`, {
        email: this.email,
        password: this.password,
        name: this.name,
        portal: 'industry',
        companyName: `${this.name} Industries`
      });

      this.token = response.data.token;
      this.organizationId = response.data.user.id;

      log(`Industriel ${this.name} inscrit: ${this.email}`, 'success');

      return response.data;
    } catch (error) {
      log(`Erreur inscription industriel: ${error.message}`, 'error');
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
      this.organizationId = response.data.user.id;

      log(`Industriel ${this.name} connecté`, 'success');

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
   * Inviter un transporteur
   */
  async inviteTransporter(transporterEmail, companyName) {
    try {
      log(`Invitation transporteur: ${companyName} (${transporterEmail})`, 'info');

      // L'endpoint carriers/invite est sur /api/carriers, pas /api/auth
      const authzBaseUrl = this.baseUrls.authz.replace('/api/auth', '');
      const response = await axios.post(
        `${authzBaseUrl}/api/carriers/invite`,
        {
          email: transporterEmail,
          companyName,
          industrielId: this.organizationId
        },
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      this.transporters.push(response.data.carrier);

      log(`Invitation envoyée à ${transporterEmail}`, 'success');

      return response.data;
    } catch (error) {
      log(`Erreur invitation transporteur: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Créer une commande
   */
  async createOrder(orderData) {
    try {
      log(`Création commande: ${orderData.pickup.city} → ${orderData.delivery.city}`, 'info');

      const response = await axios.post(
        `${this.baseUrls.orders}/orders`,
        orderData,
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      this.orders.push(response.data.order);

      log(`Commande créée: ${response.data.order.orderNumber}`, 'success');

      return response.data;
    } catch (error) {
      log(`Erreur création commande: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Obtenir toutes les commandes
   */
  async getOrders() {
    try {
      const response = await axios.get(
        `${this.baseUrls.orders}/orders?organizationId=${this.organizationId}`,
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      return response.data.orders || [];
    } catch (error) {
      log(`Erreur récupération commandes: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Obtenir le statut d'une commande
   */
  async getOrderStatus(orderId) {
    try {
      const response = await axios.get(
        `${this.baseUrls.orders}/orders/${orderId}`,
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      return response.data.order;
    } catch (error) {
      log(`Erreur récupération statut commande: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Déclencher Affret.IA pour une commande
   */
  async triggerAffretIA(orderId) {
    try {
      log(`Déclenchement Affret.IA pour commande ${orderId}`, 'info');

      const response = await axios.post(
        `${this.baseUrls.affretIA}/affretia/trigger`,
        {
          orderId
        },
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      log('Affret.IA déclenché', 'success');

      return response.data.session;
    } catch (error) {
      log(`Erreur déclenchement Affret.IA: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Obtenir les grilles tarifaires
   */
  async getPricingGrids() {
    try {
      const authzBaseUrl = this.baseUrls.authz.replace('/api/auth', '');
      const response = await axios.get(
        `${authzBaseUrl}/api/pricing-grids`,
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      return response.data.grids || [];
    } catch (error) {
      log(`Erreur récupération grilles: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Créer un plan de transport
   */
  async createTransportPlan(planData) {
    try {
      log(`Création plan de transport: ${planData.name}`, 'info');

      const response = await axios.post(
        `${this.baseUrls.orders}/transport-plans`,
        planData,
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      log(`Plan de transport créé: ${response.data.plan.id}`, 'success');

      return response.data.plan;
    } catch (error) {
      log(`Erreur création plan: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Générer une préfacture
   */
  async generatePrefacture(data) {
    try {
      log('Génération préfacture...', 'info');

      const response = await axios.post(
        `${this.baseUrls.billing}/prefactures`,
        data,
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      log(`Préfacture ${response.data.prefacture.number} créée`, 'success');

      return response.data.prefacture;
    } catch (error) {
      log(`Erreur génération préfacture: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Convertir préfacture en facture
   */
  async convertPrefactureToInvoice(prefactureId) {
    try {
      log('Conversion préfacture en facture...', 'info');

      const response = await axios.post(
        `${this.baseUrls.billing}/prefactures/${prefactureId}/convert`,
        {},
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      log(`Facture ${response.data.invoice.invoiceNumber} créée`, 'success');

      return response.data.invoice;
    } catch (error) {
      log(`Erreur conversion facture: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Enregistrer un paiement
   */
  async recordPayment(invoiceId, paymentData) {
    try {
      log(`Enregistrement paiement: ${paymentData.amount}€`, 'info');

      const response = await axios.post(
        `${this.baseUrls.billing}/invoices/${invoiceId}/payments`,
        paymentData,
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      log('Paiement enregistré', 'success');

      return response.data.payment;
    } catch (error) {
      log(`Erreur enregistrement paiement: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Obtenir le statut de paiement
   */
  async getPaymentStatus(invoiceId) {
    try {
      const response = await axios.get(
        `${this.baseUrls.billing}/invoices/${invoiceId}`,
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      return response.data.invoice;
    } catch (error) {
      log(`Erreur récupération statut paiement: ${error.message}`, 'error');
      throw error;
    }
  }
}

module.exports = AgentIndustriel;
