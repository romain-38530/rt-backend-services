// ============================================================================
// OVHcloud Service - Gestion DNS et Emails
// ============================================================================
// Service d'intégration avec l'API OVHcloud pour gérer:
// - Enregistrements DNS (A, AAAA, CNAME, MX, TXT, etc.)
// - Comptes email et redirections
// - Domaines et sous-domaines
// ============================================================================

const ovh = require('ovh');

/**
 * @class OVHcloudService
 * @description Service pour gérer le nom de domaine et les emails via l'API OVHcloud
 */
class OVHcloudService {
  constructor() {
    this.client = null;
    this.domain = process.env.OVH_DOMAIN || 'rt-symphonia.com';
    this.initialized = false;
  }

  /**
   * Initialiser le client OVHcloud
   */
  initialize() {
    try {
      if (!process.env.OVH_APP_KEY || !process.env.OVH_APP_SECRET || !process.env.OVH_CONSUMER_KEY) {
        console.warn('⚠️  OVHcloud API credentials not configured');
        return false;
      }

      this.client = ovh({
        endpoint: process.env.OVH_ENDPOINT || 'ovh-eu',
        appKey: process.env.OVH_APP_KEY,
        appSecret: process.env.OVH_APP_SECRET,
        consumerKey: process.env.OVH_CONSUMER_KEY
      });

      this.initialized = true;
      console.log('✅ OVHcloud API client initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize OVHcloud client:', error.message);
      return false;
    }
  }

  /**
   * Vérifier la configuration
   */
  async checkConfiguration() {
    if (!this.initialized) {
      throw new Error('OVHcloud client not initialized');
    }

    try {
      // Test simple: récupérer les informations du domaine
      const domainInfo = await this.client.requestPromised('GET', `/domain/${this.domain}`);
      return {
        success: true,
        domain: this.domain,
        info: domainInfo
      };
    } catch (error) {
      throw new Error(`OVHcloud API test failed: ${error.message}`);
    }
  }

  // ============================================================================
  // DNS MANAGEMENT
  // ============================================================================

  /**
   * Lister tous les enregistrements DNS
   * @param {Object} options - Options de filtrage (fieldType, subDomain)
   * @returns {Promise<Array>} Liste des enregistrements DNS
   */
  async listDNSRecords(options = {}) {
    if (!this.initialized) {
      throw new Error('OVHcloud client not initialized');
    }

    try {
      // Récupérer les IDs des enregistrements
      let url = `/domain/zone/${this.domain}/record`;
      if (options.fieldType) {
        url += `?fieldType=${options.fieldType}`;
      }
      if (options.subDomain) {
        url += `${options.fieldType ? '&' : '?'}subDomain=${options.subDomain}`;
      }

      const recordIds = await this.client.requestPromised('GET', url);

      // Récupérer les détails de chaque enregistrement
      const records = await Promise.all(
        recordIds.map(id =>
          this.client.requestPromised('GET', `/domain/zone/${this.domain}/record/${id}`)
        )
      );

      return records;
    } catch (error) {
      throw new Error(`Failed to list DNS records: ${error.message}`);
    }
  }

  /**
   * Créer un enregistrement DNS
   * @param {Object} record - Enregistrement à créer
   * @param {string} record.subDomain - Sous-domaine (ex: 'api', 'www', '')
   * @param {string} record.fieldType - Type (A, AAAA, CNAME, MX, TXT, etc.)
   * @param {string} record.target - Cible de l'enregistrement
   * @param {number} record.ttl - TTL en secondes (optionnel, défaut: 3600)
   * @returns {Promise<Object>} Enregistrement créé
   */
  async createDNSRecord({ subDomain, fieldType, target, ttl = 3600 }) {
    if (!this.initialized) {
      throw new Error('OVHcloud client not initialized');
    }

    try {
      const record = await this.client.requestPromised('POST', `/domain/zone/${this.domain}/record`, {
        subDomain: subDomain || '',
        fieldType,
        target,
        ttl
      });

      // Rafraîchir la zone DNS
      await this.refreshDNSZone();

      return record;
    } catch (error) {
      throw new Error(`Failed to create DNS record: ${error.message}`);
    }
  }

  /**
   * Mettre à jour un enregistrement DNS
   * @param {number} recordId - ID de l'enregistrement
   * @param {Object} updates - Modifications à apporter
   * @returns {Promise<Object>} Enregistrement mis à jour
   */
  async updateDNSRecord(recordId, updates) {
    if (!this.initialized) {
      throw new Error('OVHcloud client not initialized');
    }

    try {
      await this.client.requestPromised('PUT', `/domain/zone/${this.domain}/record/${recordId}`, updates);

      // Rafraîchir la zone DNS
      await this.refreshDNSZone();

      // Récupérer l'enregistrement mis à jour
      const record = await this.client.requestPromised('GET', `/domain/zone/${this.domain}/record/${recordId}`);
      return record;
    } catch (error) {
      throw new Error(`Failed to update DNS record: ${error.message}`);
    }
  }

  /**
   * Supprimer un enregistrement DNS
   * @param {number} recordId - ID de l'enregistrement
   * @returns {Promise<void>}
   */
  async deleteDNSRecord(recordId) {
    if (!this.initialized) {
      throw new Error('OVHcloud client not initialized');
    }

    try {
      await this.client.requestPromised('DELETE', `/domain/zone/${this.domain}/record/${recordId}`);

      // Rafraîchir la zone DNS
      await this.refreshDNSZone();
    } catch (error) {
      throw new Error(`Failed to delete DNS record: ${error.message}`);
    }
  }

  /**
   * Rafraîchir la zone DNS (appliquer les changements)
   * @returns {Promise<void>}
   */
  async refreshDNSZone() {
    if (!this.initialized) {
      throw new Error('OVHcloud client not initialized');
    }

    try {
      await this.client.requestPromised('POST', `/domain/zone/${this.domain}/refresh`);
    } catch (error) {
      throw new Error(`Failed to refresh DNS zone: ${error.message}`);
    }
  }

  // ============================================================================
  // EMAIL MANAGEMENT
  // ============================================================================

  /**
   * Lister tous les comptes email
   * @returns {Promise<Array>} Liste des comptes email
   */
  async listEmailAccounts() {
    if (!this.initialized) {
      throw new Error('OVHcloud client not initialized');
    }

    try {
      const accounts = await this.client.requestPromised('GET', `/email/domain/${this.domain}/account`);

      // Récupérer les détails de chaque compte
      const accountsDetails = await Promise.all(
        accounts.map(accountName =>
          this.client.requestPromised('GET', `/email/domain/${this.domain}/account/${accountName}`)
        )
      );

      return accountsDetails;
    } catch (error) {
      throw new Error(`Failed to list email accounts: ${error.message}`);
    }
  }

  /**
   * Créer un compte email
   * @param {Object} account - Compte à créer
   * @param {string} account.accountName - Nom du compte (ex: 'contact', 'support')
   * @param {string} account.password - Mot de passe
   * @param {number} account.size - Taille en MB (optionnel, défaut: 5000)
   * @returns {Promise<Object>} Compte créé
   */
  async createEmailAccount({ accountName, password, size = 5000 }) {
    if (!this.initialized) {
      throw new Error('OVHcloud client not initialized');
    }

    try {
      await this.client.requestPromised('POST', `/email/domain/${this.domain}/account`, {
        accountName,
        password,
        size
      });

      // Récupérer les détails du compte créé
      const account = await this.client.requestPromised('GET', `/email/domain/${this.domain}/account/${accountName}`);
      return account;
    } catch (error) {
      throw new Error(`Failed to create email account: ${error.message}`);
    }
  }

  /**
   * Modifier le mot de passe d'un compte email
   * @param {string} accountName - Nom du compte
   * @param {string} password - Nouveau mot de passe
   * @returns {Promise<void>}
   */
  async changeEmailPassword(accountName, password) {
    if (!this.initialized) {
      throw new Error('OVHcloud client not initialized');
    }

    try {
      await this.client.requestPromised('POST', `/email/domain/${this.domain}/account/${accountName}/changePassword`, {
        password
      });
    } catch (error) {
      throw new Error(`Failed to change email password: ${error.message}`);
    }
  }

  /**
   * Supprimer un compte email
   * @param {string} accountName - Nom du compte
   * @returns {Promise<void>}
   */
  async deleteEmailAccount(accountName) {
    if (!this.initialized) {
      throw new Error('OVHcloud client not initialized');
    }

    try {
      await this.client.requestPromised('DELETE', `/email/domain/${this.domain}/account/${accountName}`);
    } catch (error) {
      throw new Error(`Failed to delete email account: ${error.message}`);
    }
  }

  /**
   * Lister les redirections email
   * @returns {Promise<Array>} Liste des redirections
   */
  async listEmailRedirections() {
    if (!this.initialized) {
      throw new Error('OVHcloud client not initialized');
    }

    try {
      const redirectionIds = await this.client.requestPromised('GET', `/email/domain/${this.domain}/redirection`);

      // Récupérer les détails de chaque redirection
      const redirections = await Promise.all(
        redirectionIds.map(id =>
          this.client.requestPromised('GET', `/email/domain/${this.domain}/redirection/${id}`)
        )
      );

      return redirections;
    } catch (error) {
      throw new Error(`Failed to list email redirections: ${error.message}`);
    }
  }

  /**
   * Créer une redirection email
   * @param {Object} redirection - Redirection à créer
   * @param {string} redirection.from - Email source (ex: 'contact')
   * @param {string} redirection.to - Email destination
   * @param {boolean} redirection.localCopy - Garder une copie locale (optionnel)
   * @returns {Promise<Object>} Redirection créée
   */
  async createEmailRedirection({ from, to, localCopy = false }) {
    if (!this.initialized) {
      throw new Error('OVHcloud client not initialized');
    }

    try {
      const redirectionId = await this.client.requestPromised('POST', `/email/domain/${this.domain}/redirection`, {
        from,
        to,
        localCopy
      });

      // Récupérer les détails de la redirection créée
      const redirection = await this.client.requestPromised('GET', `/email/domain/${this.domain}/redirection/${redirectionId}`);
      return redirection;
    } catch (error) {
      throw new Error(`Failed to create email redirection: ${error.message}`);
    }
  }

  /**
   * Supprimer une redirection email
   * @param {string} redirectionId - ID de la redirection
   * @returns {Promise<void>}
   */
  async deleteEmailRedirection(redirectionId) {
    if (!this.initialized) {
      throw new Error('OVHcloud client not initialized');
    }

    try {
      await this.client.requestPromised('DELETE', `/email/domain/${this.domain}/redirection/${redirectionId}`);
    } catch (error) {
      throw new Error(`Failed to delete email redirection: ${error.message}`);
    }
  }

  // ============================================================================
  // DOMAIN MANAGEMENT
  // ============================================================================

  /**
   * Obtenir les informations du domaine
   * @returns {Promise<Object>} Informations du domaine
   */
  async getDomainInfo() {
    if (!this.initialized) {
      throw new Error('OVHcloud client not initialized');
    }

    try {
      const info = await this.client.requestPromised('GET', `/domain/${this.domain}`);
      return info;
    } catch (error) {
      throw new Error(`Failed to get domain info: ${error.message}`);
    }
  }

  /**
   * Lister tous les domaines disponibles
   * @returns {Promise<Array>} Liste des domaines
   */
  async listDomains() {
    if (!this.initialized) {
      throw new Error('OVHcloud client not initialized');
    }

    try {
      const domains = await this.client.requestPromised('GET', '/domain');
      return domains;
    } catch (error) {
      throw new Error(`Failed to list domains: ${error.message}`);
    }
  }
}

// Export singleton instance
const ovhcloudService = new OVHcloudService();

module.exports = ovhcloudService;
