/**
 * DKV Mobility Enterprise API Connector
 *
 * Handles OAuth2 authentication and data retrieval from DKV API
 * for fuel card transactions, toll passages, and vehicle/card master data.
 *
 * API Documentation: https://api-portal.dkv-mobility.com/
 */

const axios = require('axios');
const crypto = require('crypto');

// ============================================================================
// Rate Limiter (shared pattern from Dashdoc)
// ============================================================================

class DkvRateLimiter {
  constructor(minDelayMs = 200) {
    this.minDelayMs = minDelayMs;
    this.lastRequestTime = 0;
    this.queue = [];
    this.processing = false;
  }

  async throttle() {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      if (timeSinceLastRequest < this.minDelayMs) {
        await this.sleep(this.minDelayMs - timeSinceLastRequest);
      }

      this.lastRequestTime = Date.now();
      const resolve = this.queue.shift();
      resolve();
    }

    this.processing = false;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const globalRateLimiter = new DkvRateLimiter(200); // 5 req/s max

// ============================================================================
// DKV Connector Class
// ============================================================================

class DkvConnector {
  constructor(config) {
    this.config = {
      customerNumber: config.customerNumber,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      subscriptionKey: config.subscriptionKey,
      authUrl: config.authUrl || 'https://my.dkv-mobility.com/auth/realms/enterprise-api/protocol/openid-connect/token',
      apiBaseUrl: config.apiBaseUrl || 'https://api.dkv-mobility.com/enterprise',
      timeout: config.timeout || 30000,
    };

    this.accessToken = null;
    this.tokenExpiresAt = null;
    this.rateLimiter = globalRateLimiter;

    // Request statistics
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      tokenRefreshes: 0,
      lastRequestTime: null,
    };
  }

  // ==========================================================================
  // OAuth2 Authentication (client_credentials flow)
  // ==========================================================================

  async getAccessToken(forceRefresh = false) {
    // Check if we have a valid token
    if (!forceRefresh && this.accessToken && this.tokenExpiresAt) {
      const now = Date.now();
      // Refresh 60 seconds before expiration
      if (now < this.tokenExpiresAt - 60000) {
        return this.accessToken;
      }
    }

    console.log('[DKV] Refreshing access token...');

    try {
      const response = await axios.post(
        this.config.authUrl,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 15000,
        }
      );

      this.accessToken = response.data.access_token;
      // Calculate expiration time (default 5 minutes if not provided)
      const expiresIn = response.data.expires_in || 300;
      this.tokenExpiresAt = Date.now() + (expiresIn * 1000);
      this.stats.tokenRefreshes++;

      console.log(`[DKV] Token refreshed, expires in ${expiresIn}s`);
      return this.accessToken;
    } catch (error) {
      console.error('[DKV] Token refresh failed:', error.message);
      if (error.response) {
        console.error('[DKV] Auth error response:', error.response.status, error.response.data);
      }
      throw new Error(`DKV authentication failed: ${error.message}`);
    }
  }

  // ==========================================================================
  // HTTP Client Methods
  // ==========================================================================

  async makeRequest(method, endpoint, options = {}) {
    await this.rateLimiter.throttle();

    const token = await this.getAccessToken();
    const url = `${this.config.apiBaseUrl}${endpoint}`;

    this.stats.totalRequests++;
    this.stats.lastRequestTime = new Date();

    try {
      const response = await axios({
        method,
        url,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Ocp-Apim-Subscription-Key': this.config.subscriptionKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...options.headers,
        },
        params: options.params,
        data: options.data,
        timeout: this.config.timeout,
      });

      this.stats.successfulRequests++;
      return response.data;
    } catch (error) {
      this.stats.failedRequests++;

      // Handle token expiration
      if (error.response && error.response.status === 401) {
        console.log('[DKV] Token expired, refreshing...');
        await this.getAccessToken(true);
        // Retry once with new token
        return this.makeRequest(method, endpoint, options);
      }

      console.error(`[DKV] Request failed: ${method} ${endpoint}`, error.message);
      if (error.response) {
        console.error('[DKV] Error response:', error.response.status, error.response.data);
      }
      throw error;
    }
  }

  async get(endpoint, params = {}) {
    return this.makeRequest('GET', endpoint, { params });
  }

  async post(endpoint, data = {}) {
    return this.makeRequest('POST', endpoint, { data });
  }

  // ==========================================================================
  // Connection Test
  // ==========================================================================

  async testConnection() {
    try {
      console.log('[DKV] Testing connection...');

      // Get token first
      await this.getAccessToken();
      console.log('[DKV] Authentication successful');

      // Try to get customer info or card list
      try {
        const cards = await this.getCards({ limit: 1 });
        console.log(`[DKV] Connection test successful, found ${cards.total || 0} cards`);
        return {
          success: true,
          message: 'Connection successful',
          customerNumber: this.config.customerNumber,
          cardsCount: cards.total || 0,
        };
      } catch (apiError) {
        // Even if card fetch fails, authentication worked
        return {
          success: true,
          message: 'Authentication successful, API access may be limited',
          customerNumber: this.config.customerNumber,
          warning: apiError.message,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
        customerNumber: this.config.customerNumber,
      };
    }
  }

  // ==========================================================================
  // Cards API
  // ==========================================================================

  /**
   * Get list of fuel cards for the customer
   */
  async getCards(options = {}) {
    const params = {
      customerNumber: this.config.customerNumber,
      ...options,
    };

    try {
      const response = await this.get('/v1/cards', params);
      return {
        data: response.data || response.cards || response || [],
        total: response.totalCount || response.total || (response.data || []).length,
        _raw: response,
      };
    } catch (error) {
      // Try alternative endpoints
      try {
        const response = await this.get('/cards', params);
        return {
          data: response.data || response.cards || response || [],
          total: response.totalCount || (response.data || []).length,
          _raw: response,
        };
      } catch (e) {
        console.error('[DKV] Failed to fetch cards:', e.message);
        return { data: [], total: 0, error: e.message };
      }
    }
  }

  /**
   * Get card details by card number
   */
  async getCardByNumber(cardNumber) {
    try {
      const response = await this.get(`/v1/cards/${cardNumber}`, {
        customerNumber: this.config.customerNumber,
      });
      return this.mapCard(response);
    } catch (error) {
      console.error(`[DKV] Failed to fetch card ${cardNumber}:`, error.message);
      return null;
    }
  }

  /**
   * Get all cards with pagination
   */
  async getAllCardsWithPagination(options = {}) {
    const allCards = [];
    let page = 1;
    const pageSize = options.pageSize || 100;
    let hasMore = true;

    while (hasMore) {
      const result = await this.getCards({
        page,
        pageSize,
        ...options,
      });

      if (result.data && result.data.length > 0) {
        allCards.push(...result.data);
        page++;
        hasMore = result.data.length === pageSize;
      } else {
        hasMore = false;
      }

      // Safety limit
      if (page > 50) {
        console.warn('[DKV] Reached maximum page limit for cards');
        break;
      }
    }

    return allCards.map(c => this.mapCard(c));
  }

  // ==========================================================================
  // Transactions API
  // ==========================================================================

  /**
   * Get fuel transactions
   */
  async getTransactions(options = {}) {
    const params = {
      customerNumber: this.config.customerNumber,
      ...options,
    };

    try {
      const response = await this.get('/v1/transactions', params);
      return {
        data: response.data || response.transactions || response || [],
        total: response.totalCount || response.total || (response.data || []).length,
        _raw: response,
      };
    } catch (error) {
      // Try alternative endpoints
      const endpoints = ['/transactions', '/v1/fuel-transactions', '/fuel/transactions'];

      for (const endpoint of endpoints) {
        try {
          const response = await this.get(endpoint, params);
          return {
            data: response.data || response.transactions || response || [],
            total: response.totalCount || (response.data || []).length,
            _raw: response,
          };
        } catch (e) {
          continue;
        }
      }

      console.error('[DKV] Failed to fetch transactions:', error.message);
      return { data: [], total: 0, error: error.message };
    }
  }

  /**
   * Get transactions with date range
   */
  async getTransactionsByDateRange(fromDate, toDate, options = {}) {
    return this.getTransactions({
      fromDate: fromDate instanceof Date ? fromDate.toISOString().split('T')[0] : fromDate,
      toDate: toDate instanceof Date ? toDate.toISOString().split('T')[0] : toDate,
      ...options,
    });
  }

  /**
   * Get transactions for a specific card
   */
  async getTransactionsByCard(cardNumber, options = {}) {
    return this.getTransactions({
      cardNumber,
      ...options,
    });
  }

  /**
   * Get all transactions with pagination
   */
  async getAllTransactionsWithPagination(options = {}) {
    const allTransactions = [];
    let page = 1;
    const pageSize = options.pageSize || 100;
    let hasMore = true;

    while (hasMore) {
      const result = await this.getTransactions({
        page,
        pageSize,
        ...options,
      });

      if (result.data && result.data.length > 0) {
        allTransactions.push(...result.data);
        page++;
        hasMore = result.data.length === pageSize;

        // Delay between pages
        await this.sleep(300);
      } else {
        hasMore = false;
      }

      // Safety limit
      if (page > 100) {
        console.warn('[DKV] Reached maximum page limit for transactions');
        break;
      }
    }

    return allTransactions.map(t => this.mapTransaction(t));
  }

  /**
   * Get recent transactions (last N days)
   */
  async getRecentTransactions(daysBack = 7, options = {}) {
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);

    return this.getTransactionsByDateRange(fromDate, toDate, options);
  }

  // ==========================================================================
  // Toll Passages API
  // ==========================================================================

  /**
   * Get toll passages
   */
  async getTollPassages(options = {}) {
    const params = {
      customerNumber: this.config.customerNumber,
      ...options,
    };

    try {
      const response = await this.get('/v1/toll/passages', params);
      return {
        data: response.data || response.passages || response || [],
        total: response.totalCount || (response.data || []).length,
        _raw: response,
      };
    } catch (error) {
      // Try alternatives
      try {
        const response = await this.get('/toll/passages', params);
        return {
          data: response.data || response.passages || response || [],
          total: response.totalCount || (response.data || []).length,
          _raw: response,
        };
      } catch (e) {
        console.error('[DKV] Failed to fetch toll passages:', e.message);
        return { data: [], total: 0, error: e.message };
      }
    }
  }

  /**
   * Get toll boxes (OBUs)
   */
  async getTollBoxes(options = {}) {
    const params = {
      customerNumber: this.config.customerNumber,
      ...options,
    };

    try {
      const response = await this.get('/v1/toll/boxes', params);
      return {
        data: response.data || response.boxes || response || [],
        total: response.totalCount || (response.data || []).length,
        _raw: response,
      };
    } catch (error) {
      return { data: [], total: 0, error: error.message };
    }
  }

  // ==========================================================================
  // Invoices API
  // ==========================================================================

  /**
   * Get invoices
   */
  async getInvoices(options = {}) {
    const params = {
      customerNumber: this.config.customerNumber,
      ...options,
    };

    try {
      const response = await this.get('/v1/invoices', params);
      return {
        data: response.data || response.invoices || response || [],
        total: response.totalCount || (response.data || []).length,
        _raw: response,
      };
    } catch (error) {
      return { data: [], total: 0, error: error.message };
    }
  }

  /**
   * Get unbilled transactions
   */
  async getUnbilledTransactions(options = {}) {
    const params = {
      customerNumber: this.config.customerNumber,
      billed: false,
      ...options,
    };

    return this.getTransactions(params);
  }

  // ==========================================================================
  // Vehicles & Drivers (Master Data)
  // ==========================================================================

  /**
   * Get vehicles linked to cards
   */
  async getVehicles(options = {}) {
    const params = {
      customerNumber: this.config.customerNumber,
      ...options,
    };

    try {
      const response = await this.get('/v1/vehicles', params);
      return {
        data: response.data || response.vehicles || response || [],
        total: response.totalCount || (response.data || []).length,
        _raw: response,
      };
    } catch (error) {
      return { data: [], total: 0, error: error.message };
    }
  }

  /**
   * Get drivers linked to cards
   */
  async getDrivers(options = {}) {
    const params = {
      customerNumber: this.config.customerNumber,
      ...options,
    };

    try {
      const response = await this.get('/v1/drivers', params);
      return {
        data: response.data || response.drivers || response || [],
        total: response.totalCount || (response.data || []).length,
        _raw: response,
      };
    } catch (error) {
      return { data: [], total: 0, error: error.message };
    }
  }

  // ==========================================================================
  // Stations/Vendors API
  // ==========================================================================

  /**
   * Get fuel station network
   */
  async getStations(options = {}) {
    try {
      const response = await this.get('/v1/stations', options);
      return {
        data: response.data || response.stations || response || [],
        total: response.totalCount || (response.data || []).length,
        _raw: response,
      };
    } catch (error) {
      return { data: [], total: 0, error: error.message };
    }
  }

  // ==========================================================================
  // Data Mapping Functions
  // ==========================================================================

  mapCard(card) {
    if (!card) return null;

    return {
      cardNumber: card.cardNumber || card.card_number || card.number,
      cardType: card.cardType || card.card_type || card.type,
      status: card.status || 'active',
      embossedName: card.embossedName || card.embossed_name || card.name,
      vehiclePlate: card.vehiclePlate || card.vehicle_plate || card.licensePlate,
      driverName: card.driverName || card.driver_name,
      expiryDate: card.expiryDate || card.expiry_date || card.validUntil,
      issueDate: card.issueDate || card.issue_date,
      productRestrictions: card.productRestrictions || card.product_restrictions || [],
      dailyLimit: card.dailyLimit || card.daily_limit,
      monthlyLimit: card.monthlyLimit || card.monthly_limit,
      _rawData: card,
    };
  }

  mapTransaction(transaction) {
    if (!transaction) return null;

    const t = transaction;
    return {
      transactionId: t.transactionId || t.transaction_id || t.id,
      cardNumber: t.cardNumber || t.card_number,
      transactionDate: t.transactionDate || t.transaction_date || t.date,
      transactionTime: t.transactionTime || t.transaction_time || t.time,
      timestamp: t.timestamp || this.parseDateTime(t.transactionDate, t.transactionTime),

      // Location
      stationId: t.stationId || t.station_id,
      stationName: t.stationName || t.station_name || t.merchantName,
      stationAddress: t.stationAddress || t.station_address,
      stationCity: t.stationCity || t.city,
      stationCountry: t.stationCountry || t.country,
      latitude: t.latitude || t.lat,
      longitude: t.longitude || t.lon || t.lng,

      // Product details
      productCode: t.productCode || t.product_code,
      productName: t.productName || t.product_name || t.fuelType,
      quantity: parseFloat(t.quantity || t.volume || 0),
      unitOfMeasure: t.unitOfMeasure || t.unit || 'L',

      // Pricing
      unitPrice: parseFloat(t.unitPrice || t.unit_price || t.pricePerUnit || 0),
      grossAmount: parseFloat(t.grossAmount || t.gross_amount || t.totalAmount || 0),
      netAmount: parseFloat(t.netAmount || t.net_amount || 0),
      vatAmount: parseFloat(t.vatAmount || t.vat_amount || t.tax || 0),
      currency: t.currency || 'EUR',

      // Vehicle/Driver
      vehiclePlate: t.vehiclePlate || t.vehicle_plate || t.licensePlate,
      driverName: t.driverName || t.driver_name,
      odometer: t.odometer || t.mileage,

      // Billing
      invoiceNumber: t.invoiceNumber || t.invoice_number,
      billed: t.billed || t.is_billed || false,

      _rawData: t,
    };
  }

  mapTollPassage(passage) {
    if (!passage) return null;

    return {
      passageId: passage.passageId || passage.passage_id || passage.id,
      boxId: passage.boxId || passage.box_id || passage.obuId,
      vehiclePlate: passage.vehiclePlate || passage.vehicle_plate,
      passageDate: passage.passageDate || passage.passage_date || passage.date,
      passageTime: passage.passageTime || passage.passage_time || passage.time,
      timestamp: passage.timestamp || this.parseDateTime(passage.passageDate, passage.passageTime),

      // Location
      tollStation: passage.tollStation || passage.toll_station || passage.stationName,
      entryPoint: passage.entryPoint || passage.entry_point,
      exitPoint: passage.exitPoint || passage.exit_point,
      country: passage.country,
      roadName: passage.roadName || passage.road_name || passage.highway,

      // Pricing
      amount: parseFloat(passage.amount || passage.cost || 0),
      currency: passage.currency || 'EUR',

      // Billing
      invoiceNumber: passage.invoiceNumber || passage.invoice_number,
      billed: passage.billed || false,

      _rawData: passage,
    };
  }

  mapInvoice(invoice) {
    if (!invoice) return null;

    return {
      invoiceNumber: invoice.invoiceNumber || invoice.invoice_number || invoice.number,
      invoiceDate: invoice.invoiceDate || invoice.invoice_date || invoice.date,
      dueDate: invoice.dueDate || invoice.due_date,
      periodFrom: invoice.periodFrom || invoice.period_from,
      periodTo: invoice.periodTo || invoice.period_to,

      totalAmount: parseFloat(invoice.totalAmount || invoice.total_amount || invoice.total || 0),
      netAmount: parseFloat(invoice.netAmount || invoice.net_amount || 0),
      vatAmount: parseFloat(invoice.vatAmount || invoice.vat_amount || 0),
      currency: invoice.currency || 'EUR',

      status: invoice.status || 'issued',
      pdfUrl: invoice.pdfUrl || invoice.pdf_url,

      _rawData: invoice,
    };
  }

  mapVehicle(vehicle) {
    if (!vehicle) return null;

    return {
      vehicleId: vehicle.vehicleId || vehicle.vehicle_id || vehicle.id,
      licensePlate: vehicle.licensePlate || vehicle.license_plate || vehicle.plate,
      vin: vehicle.vin,
      brand: vehicle.brand || vehicle.make,
      model: vehicle.model,
      type: vehicle.type || vehicle.vehicleType,
      fuelType: vehicle.fuelType || vehicle.fuel_type,
      tankCapacity: vehicle.tankCapacity || vehicle.tank_capacity,

      _rawData: vehicle,
    };
  }

  // ==========================================================================
  // Full Sync
  // ==========================================================================

  /**
   * Full sync of all DKV data
   */
  async fullSync(options = {}) {
    console.log('[DKV] Starting full sync...');
    const startTime = Date.now();

    const result = {
      cards: [],
      transactions: [],
      tollPassages: [],
      invoices: [],
      vehicles: [],
      drivers: [],
      errors: [],
    };

    // Sync cards
    try {
      console.log('[DKV] Syncing cards...');
      result.cards = await this.getAllCardsWithPagination(options);
      console.log(`[DKV] Synced ${result.cards.length} cards`);
    } catch (error) {
      result.errors.push({ entity: 'cards', error: error.message });
    }

    // Sync transactions
    try {
      console.log('[DKV] Syncing transactions...');
      const daysBack = options.transactionDaysBack || 30;
      const txResult = await this.getRecentTransactions(daysBack, options);
      result.transactions = (txResult.data || []).map(t => this.mapTransaction(t));
      console.log(`[DKV] Synced ${result.transactions.length} transactions`);
    } catch (error) {
      result.errors.push({ entity: 'transactions', error: error.message });
    }

    // Sync toll passages
    try {
      console.log('[DKV] Syncing toll passages...');
      const tollResult = await this.getTollPassages(options);
      result.tollPassages = (tollResult.data || []).map(p => this.mapTollPassage(p));
      console.log(`[DKV] Synced ${result.tollPassages.length} toll passages`);
    } catch (error) {
      result.errors.push({ entity: 'tollPassages', error: error.message });
    }

    // Sync invoices
    try {
      console.log('[DKV] Syncing invoices...');
      const invoicesResult = await this.getInvoices(options);
      result.invoices = (invoicesResult.data || []).map(i => this.mapInvoice(i));
      console.log(`[DKV] Synced ${result.invoices.length} invoices`);
    } catch (error) {
      result.errors.push({ entity: 'invoices', error: error.message });
    }

    // Sync vehicles
    try {
      console.log('[DKV] Syncing vehicles...');
      const vehiclesResult = await this.getVehicles(options);
      result.vehicles = (vehiclesResult.data || []).map(v => this.mapVehicle(v));
      console.log(`[DKV] Synced ${result.vehicles.length} vehicles`);
    } catch (error) {
      result.errors.push({ entity: 'vehicles', error: error.message });
    }

    const duration = Date.now() - startTime;
    console.log(`[DKV] Full sync completed in ${duration}ms`);
    console.log(`[DKV] Summary: ${result.cards.length} cards, ${result.transactions.length} transactions, ${result.tollPassages.length} toll passages, ${result.invoices.length} invoices`);

    return result;
  }

  // ==========================================================================
  // Utility Functions
  // ==========================================================================

  parseDateTime(date, time) {
    if (!date) return null;
    try {
      if (time) {
        return new Date(`${date}T${time}`);
      }
      return new Date(date);
    } catch {
      return null;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  generateChecksum(data, fields) {
    const values = fields.map(f => {
      const value = data[f];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    });
    return crypto.createHash('md5').update(values.join('|')).digest('hex');
  }

  getStats() {
    return { ...this.stats };
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  DkvConnector,
  DkvRateLimiter,
  globalRateLimiter,
};
