/**
 * Agent Transporteur - Simule un transporteur
 */

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { log, assert, sleep, retry } = require('../utils/test-helpers');

class AgentTransporteur {
  constructor(name, email, baseUrls, acceptanceRate = 0.8) {
    this.name = name;
    this.email = email;
    this.password = 'TransporteurTest2026!';
    this.token = null;
    this.carrierId = null;
    this.acceptanceRate = acceptanceRate; // Probabilité d'accepter une commande
    this.documents = [];
    this.proposals = [];
    this.score = 0;
    this.baseUrls = baseUrls;
  }

  /**
   * S'inscrire via invitation
   */
  async register(invitationToken) {
    try {
      log(`Inscription transporteur ${this.name}...`, 'info');

      const response = await axios.post(`${this.baseUrls.authz}/register`, {
        email: this.email,
        password: this.password,
        name: this.name,
        portal: 'transporter',
        companyName: `${this.name} Transport`,
        invitationToken
      });

      this.token = response.data.token;
      this.carrierId = response.data.user.carrierId || response.data.user.id;

      log(`Transporteur ${this.name} inscrit: ${this.email}`, 'success');

      return response.data;
    } catch (error) {
      log(`Erreur inscription transporteur: ${error.message}`, 'error');
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
      this.carrierId = response.data.user.carrierId || response.data.user.id;

      log(`Transporteur ${this.name} connecté`, 'success');

      return response.data;
    } catch (error) {
      log(`Erreur login: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Upload un document via multipart/form-data
   */
  async uploadDocument(docType, filePath) {
    try {
      log(`Upload document ${docType} pour ${this.name}...`, 'info');

      // Créer FormData pour upload multipart
      const FormData = require('form-data');
      const form = new FormData();

      form.append('file', fs.createReadStream(filePath));
      form.append('orderId', this.carrierId); // Utiliser carrierId comme orderId pour l'instant
      form.append('type', docType);
      form.append('uploadedBy', this.carrierId);

      const response = await axios.post(
        `${this.baseUrls.documents}/documents/upload`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${this.token}`
          }
        }
      );

      this.documents.push(response.data.document);

      log(`Document ${docType} uploadé: ${response.data.document._id}`, 'success');

      return response.data.document;
    } catch (error) {
      log(`Erreur upload document: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Obtenir le résultat OCR d'un document
   */
  async getDocumentOCR(documentId) {
    try {
      const response = await axios.get(
        `${this.baseUrls.documents}/documents/${documentId}/ocr`,
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      return response.data.ocr;
    } catch (error) {
      log(`Erreur récupération OCR: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Obtenir le score du transporteur
   */
  async getScore() {
    try {
      // L'endpoint de score est sur authz sans /api/auth
      const authzBaseUrl = this.baseUrls.authz.replace('/api/auth', '');
      const response = await axios.get(
        `${authzBaseUrl}/api/carriers/${this.carrierId}/score`,
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      this.score = response.data.score;

      log(`Score ${this.name}: ${this.score}/100`, 'info');

      return this.score;
    } catch (error) {
      log(`Erreur récupération score: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Obtenir les alertes documents
   */
  async getAlerts() {
    try {
      // L'endpoint alertes est sur authz sans /api/auth
      const authzBaseUrl = this.baseUrls.authz.replace('/api/auth', '');
      const response = await axios.get(
        `${authzBaseUrl}/api/carriers/${this.carrierId}/alerts`,
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      return response.data.alerts || [];
    } catch (error) {
      log(`Erreur récupération alertes: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Vérifier réception demande grille tarifaire
   */
  async receivePricingGridRequest() {
    try {
      const authzBaseUrl = this.baseUrls.authz.replace('/api/auth', '');
      const response = await axios.get(
        `${authzBaseUrl}/api/carriers/${this.carrierId}/pricing-grid-request`,
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      return response.data.request || { status: 'sent' };
    } catch (error) {
      // Si pas de demande, retourner statut par défaut
      return { status: 'none' };
    }
  }

  /**
   * Remplir la grille tarifaire
   */
  async fillPricingGrid(zones, vehicleTypes) {
    try {
      log(`${this.name} remplit sa grille tarifaire...`, 'info');

      const grid = {
        carrierId: this.carrierId,
        zones,
        vehicleTypes,
        prices: []
      };

      // Générer prix aléatoires pour chaque combinaison
      for (const zone of zones) {
        for (const vehicleType of vehicleTypes) {
          grid.prices.push({
            zoneFrom: zone.from,
            zoneTo: zone.to,
            vehicleType,
            price: Math.floor(Math.random() * 300) + 150 // 150-450€
          });
        }
      }

      const authzBaseUrl = this.baseUrls.authz.replace('/api/auth', '');
      const response = await axios.post(
        `${authzBaseUrl}/api/pricing-grids`,
        grid,
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      log(`Grille tarifaire remplie: ${grid.prices.length} prix`, 'success');

      return response.data.grid;
    } catch (error) {
      log(`Erreur remplissage grille: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Obtenir la grille tarifaire soumise
   */
  async getPricingGrid() {
    try {
      const authzBaseUrl = this.baseUrls.authz.replace('/api/auth', '');
      const response = await axios.get(
        `${authzBaseUrl}/api/carriers/${this.carrierId}/pricing-grid`,
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      return response.data.grid;
    } catch (error) {
      log(`Erreur récupération grille: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Répondre à une commande (accepter/refuser basé sur acceptanceRate)
   */
  async respondToOrder(orderId) {
    try {
      // Décision aléatoire basée sur acceptanceRate
      const willAccept = Math.random() < this.acceptanceRate;

      if (willAccept) {
        const proposedPrice = Math.floor(Math.random() * 500) + 200; // 200-700€

        const response = await axios.post(
          `${this.baseUrls.affretIA}/affretia/response`,
          {
            orderId,
            carrierId: this.carrierId,
            status: 'accepted',
            proposedPrice
          },
          {
            headers: { Authorization: `Bearer ${this.token}` }
          }
        );

        log(`${this.name} accepte commande ${orderId}: ${proposedPrice}€`, 'success');

        this.proposals.push(response.data.proposal);

        return { status: 'accepted', proposedPrice, proposal: response.data.proposal };
      } else {
        const response = await axios.post(
          `${this.baseUrls.affretIA}/affretia/response`,
          {
            orderId,
            carrierId: this.carrierId,
            status: 'refused',
            reason: 'Capacité insuffisante'
          },
          {
            headers: { Authorization: `Bearer ${this.token}` }
          }
        );

        log(`${this.name} refuse commande ${orderId}`, 'warning');

        return { status: 'refused' };
      }
    } catch (error) {
      log(`Erreur réponse commande: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * S'inscrire via Affret.IA (sans compte Symphonia initial)
   */
  async registerViaAffretIA(invitationToken) {
    try {
      log(`Inscription via Affret.IA: ${this.name}...`, 'info');

      const response = await axios.post(`${this.baseUrls.affretIA}/affretia/register`, {
        email: this.email,
        password: this.password,
        name: this.name,
        companyName: `${this.name} Transport`,
        invitationToken
      });

      this.token = response.data.token;
      this.carrierId = response.data.carrier.id;

      log(`Transporteur ${this.name} inscrit via Affret.IA`, 'success');

      return response.data;
    } catch (error) {
      log(`Erreur inscription Affret.IA: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Répondre à une offre découverte (10 transports gratuits)
   */
  async respondToDiscoveryOffer(orderId, proposal) {
    try {
      log(`${this.name} répond à offre découverte: ${orderId}`, 'info');

      const response = await axios.post(
        `${this.baseUrls.affretIA}/affretia/discovery-response`,
        {
          orderId,
          carrierId: this.carrierId,
          proposedPrice: proposal.proposedPrice,
          vehicleType: proposal.vehicleType,
          acceptsDiscoveryTerms: true
        },
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      log(`Offre découverte acceptée: ${proposal.proposedPrice}€`, 'success');

      return response.data.proposal;
    } catch (error) {
      log(`Erreur offre découverte: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Accepter une négociation
   */
  async acceptNegotiation(proposalId, finalPrice) {
    try {
      const response = await axios.post(
        `${this.baseUrls.affretIA}/affretia/negotiation/accept`,
        {
          proposalId,
          carrierId: this.carrierId,
          finalPrice
        },
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      log(`${this.name} accepte négociation: ${finalPrice}€`, 'success');

      return response.data.negotiation;
    } catch (error) {
      log(`Erreur acceptation négociation: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Contre-proposer lors d'une négociation
   */
  async counterOffer(proposalId, counterPrice) {
    try {
      const response = await axios.post(
        `${this.baseUrls.affretIA}/affretia/negotiation/counter`,
        {
          proposalId,
          carrierId: this.carrierId,
          counterPrice
        },
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      log(`${this.name} contre-propose: ${counterPrice}€`, 'info');

      return response.data.negotiation;
    } catch (error) {
      log(`Erreur contre-proposition: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Valider une préfacture
   */
  async validatePrefacture(prefactureId, validation) {
    try {
      log(`${this.name} valide préfacture ${prefactureId}...`, 'info');

      const response = await axios.post(
        `${this.baseUrls.billing}/prefactures/${prefactureId}/validate`,
        {
          carrierId: this.carrierId,
          validated: validation.validated,
          notes: validation.notes
        },
        {
          headers: { Authorization: `Bearer ${this.token}` }
        }
      );

      log(`Préfacture ${validation.validated ? 'validée' : 'rejetée'}`, 'success');

      return response.data.prefacture;
    } catch (error) {
      log(`Erreur validation préfacture: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Obtenir le statut de paiement
   */
  async getPaymentStatus(invoiceId) {
    try {
      const response = await axios.get(
        `${this.baseUrls.billing}/invoices/${invoiceId}/carrier-status`,
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

module.exports = AgentTransporteur;
