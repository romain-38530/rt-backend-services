/**
 * Dashdoc TMS Connector
 * Synchronise les donnees entre Dashdoc et SYMPHONI.A
 *
 * Endpoints Dashdoc utilises:
 * - /transports/ - Ordres de transport
 * - /deliveries/ - Livraisons
 * - /companies/ - Entreprises
 * - /contacts/ - Contacts
 * - /vehicles/ - Vehicules
 * - /trailers/ - Remorques
 * - /manager-truckers/ - Chauffeurs
 * - /invoices/ - Factures
 * - /counters/ - Compteurs temps reel
 */

const axios = require('axios');

class DashdocConnector {
  constructor(apiToken, options = {}) {
    this.apiToken = apiToken;
    this.baseUrl = options.baseUrl || 'https://www.dashdoc.eu/api/v4';
    this.timeout = options.timeout || 30000;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Authorization': `Token ${this.apiToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Test de connexion API
   */
  async testConnection() {
    try {
      const response = await this.client.get('/counters/');
      return {
        success: true,
        counters: response.data,
        message: 'Connexion Dashdoc etablie'
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.message,
        message: 'Echec de connexion Dashdoc'
      };
    }
  }

  /**
   * Recuperer les compteurs en temps reel
   */
  async getCounters() {
    const response = await this.client.get('/counters/');
    return response.data;
  }

  /**
   * Recuperer les transports avec pagination
   */
  async getTransports(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);
    if (options.page) params.append('page', options.page);
    if (options.status) params.append('status', options.status);
    if (options.status__in) params.append('status__in', options.status__in);
    if (options.tags__in) params.append('tags__in', options.tags__in);
    if (options.ordering) params.append('ordering', options.ordering);
    if (options.created__gte) params.append('created__gte', options.created__gte);
    if (options.created__lte) params.append('created__lte', options.created__lte);

    const response = await this.client.get(`/transports/?${params.toString()}`);
    return {
      count: response.data.count,
      next: response.data.next,
      previous: response.data.previous,
      results: response.data.results.map(t => this.mapTransport(t))
    };
  }

  /**
   * Recuperer un transport par UID
   */
  async getTransport(uid) {
    const response = await this.client.get(`/transports/${uid}/`);
    return this.mapTransport(response.data);
  }

  /**
   * Recuperer TOUS les transports avec pagination automatique
   * Parcourt toutes les pages jusqu'a obtenir tous les resultats
   * @param {Object} options - Options de filtre (tags__in, status__in, ordering, etc.)
   * @param {Number} maxPages - Limite de securite (defaut: 100 pages = 10 000 transports)
   * @returns {Promise<Array>} Tous les transports
   */
  async getAllTransportsWithPagination(options = {}, maxPages = 100) {
    const allTransports = [];
    let page = 1;
    let hasMorePages = true;
    const limit = 100; // Limite API Dashdoc

    console.log('[DASHDOC] Starting full pagination...');
    console.log('[DASHDOC] Options:', options);

    while (hasMorePages && page <= maxPages) {
      try {
        console.log(`[DASHDOC] Fetching page ${page}...`);

        const result = await this.getTransports({
          ...options,
          limit,
          page
        });

        allTransports.push(...result.results);

        console.log(`[DASHDOC] Page ${page}: ${result.results.length} transports, Total: ${allTransports.length}/${result.count}`);

        // Verifier si il y a une page suivante
        hasMorePages = result.next !== null && allTransports.length < result.count;
        page++;

        // Petit delai pour ne pas surcharger l'API
        if (hasMorePages) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error) {
        console.error(`[DASHDOC] Error fetching page ${page}:`, error.message);
        // Continuer avec ce qu'on a recupere
        break;
      }
    }

    if (page >= maxPages && hasMorePages) {
      console.warn(`[DASHDOC] Reached max pages limit (${maxPages}). Some transports may be missing.`);
    }

    console.log(`[DASHDOC] Pagination complete: ${allTransports.length} total transports`);
    return allTransports;
  }

  /**
   * Recuperer TOUS les carriers avec pagination automatique
   * Parcourt toutes les pages jusqu'a obtenir tous les resultats
   * @param {Object} options - Options de filtre
   * @param {Number} maxPages - Limite de securite (defaut: 100 pages = 50 000 carriers)
   * @returns {Promise<Array>} Tous les carriers
   */
  async getAllCarriersWithPagination(options = {}, maxPages = 100) {
    const allCarriers = [];
    let page = 1;
    let hasMorePages = true;
    const limit = 500; // Limite API Dashdoc pour companies

    console.log('[DASHDOC CARRIERS] Starting full pagination...');
    console.log('[DASHDOC CARRIERS] Options:', options);

    while (hasMorePages && page <= maxPages) {
      try {
        console.log(`[DASHDOC CARRIERS] Fetching page ${page}...`);

        const result = await this.getCarriers({
          ...options,
          limit,
          page
        });

        allCarriers.push(...result.results);

        console.log(`[DASHDOC CARRIERS] Page ${page}: ${result.results.length} carriers, Total: ${allCarriers.length}/${result.count || 'unknown'}`);

        // Verifier si il y a une page suivante (utilise result.next de l'API Dashdoc)
        hasMorePages = result.next !== null && result.next !== undefined;
        page++;

        // Petit delai pour ne pas surcharger l'API
        if (hasMorePages) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error) {
        console.error(`[DASHDOC CARRIERS] Error fetching page ${page}:`, error.message);
        // Continuer avec ce qu'on a recupere
        break;
      }
    }

    if (page >= maxPages && hasMorePages) {
      console.warn(`[DASHDOC CARRIERS] Reached max pages limit (${maxPages}). Some carriers may be missing.`);
    }

    console.log(`[DASHDOC CARRIERS] Pagination complete: ${allCarriers.length} total carriers`);
    return allCarriers;
  }

  /**
   * Recuperer les livraisons
   */
  async getDeliveries(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);
    if (options.page) params.append('page', options.page);

    const response = await this.client.get(`/deliveries/?${params.toString()}`);
    return {
      count: response.data.count,
      results: response.data.results.map(d => this.mapDelivery(d))
    };
  }

  /**
   * Recuperer les entreprises
   */
  async getCompanies(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);
    if (options.page) params.append('page', options.page);

    const response = await this.client.get(`/companies/?${params.toString()}`);
    return {
      count: response.data.count,
      results: response.data.results.map(c => this.mapCompany(c))
    };
  }

  /**
   * Recuperer les contacts
   */
  async getContacts(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);
    if (options.page) params.append('page', options.page);

    const response = await this.client.get(`/contacts/?${params.toString()}`);
    return {
      count: response.data.count,
      results: response.data.results.map(c => this.mapContact(c))
    };
  }

  /**
   * Recuperer les vehicules
   */
  async getVehicles(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);

    const response = await this.client.get(`/vehicles/?${params.toString()}`);
    return {
      count: response.data.count || response.data.length,
      results: (response.data.results || response.data).map(v => this.mapVehicle(v))
    };
  }

  /**
   * Recuperer les remorques
   */
  async getTrailers(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);

    const response = await this.client.get(`/trailers/?${params.toString()}`);
    return {
      count: response.data.count || response.data.length,
      results: (response.data.results || response.data).map(t => this.mapTrailer(t))
    };
  }

  /**
   * Recuperer les chauffeurs
   */
  async getTruckers(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);

    const response = await this.client.get(`/manager-truckers/?${params.toString()}`);
    return {
      count: response.data.count,
      results: response.data.results.map(t => this.mapTrucker(t))
    };
  }

  /**
   * Recuperer les factures
   */
  async getInvoices(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);
    if (options.page) params.append('page', options.page);

    const response = await this.client.get(`/invoices/?${params.toString()}`);
    return {
      count: response.data.count,
      results: response.data.results.map(i => this.mapInvoice(i))
    };
  }

  /**
   * Recuperer les adresses
   */
  async getAddresses(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);
    if (options.page) params.append('page', options.page);

    const response = await this.client.get(`/deliveries/addresses/?${params.toString()}`);
    return {
      count: response.data.count,
      results: response.data.results.map(a => this.mapAddress(a))
    };
  }

  /**
   * Recuperer les transporteurs partenaires (sous-traitants)
   * Filtre les entreprises qui sont des transporteurs (carriers)
   */
  async getCarriers(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit || 500);
    if (options.page) params.append('page', options.page);

    // Filtrer uniquement les transporteurs (is_carrier=true)
    params.append('is_carrier', 'true');

    // Tenter d'exclure les donneurs d'ordre avec is_shipper=false
    // Note: ce paramètre peut ne pas être supporté par Dashdoc API
    params.append('is_shipper', 'false');

    const response = await this.client.get(`/companies/?${params.toString()}`);

    // Filtrer manuellement les donneurs d'ordre identifiés par leurs remoteId
    // Pattern observé: remoteId commençant par "C" seul = donneur d'ordre (ex: "C10006")
    // "S" ou "CF" = sous-traitant/carrier (ex: "S70392", "CF30078")
    const filteredResults = response.data.results.filter(c => {
      // Exclure si remoteId commence par "C" suivi de chiffres uniquement
      if (c.remote_id && /^C\d+$/.test(c.remote_id)) {
        console.log(`[DASHDOC] Filtering out client: ${c.name} (${c.remote_id})`);
        return false;
      }
      return true;
    });

    console.log(`[DASHDOC] Carriers: ${response.data.results.length} from API, ${filteredResults.length} after filtering`);

    return {
      count: response.data.count,  // Count AVANT filtrage pour la pagination
      filteredCount: filteredResults.length,  // Count APRES filtrage
      next: response.data.next,  // URL de la page suivante
      results: filteredResults.map(c => this.mapCarrier(c))
    };
  }

  /**
   * Mapper un transporteur Dashdoc vers format SYMPHONI.A SubContractor
   */
  mapCarrier(c) {
    return {
      externalId: c.pk?.toString(),
      externalSource: 'dashdoc',
      remoteId: c.remote_id,

      // Infos entreprise
      companyName: c.name,
      legalName: c.name,
      siret: c.trade_number || c.siren,
      siren: c.siren,
      vatNumber: c.vat_number,

      // Contact
      email: c.email,
      phone: c.phone_number,
      website: c.website,

      // Adresse
      address: c.primary_address ? {
        street: c.primary_address.address,
        city: c.primary_address.city,
        postalCode: c.primary_address.postcode,
        country: c.primary_address.country || 'France',
        location: c.primary_address.latitude ? {
          type: 'Point',
          coordinates: [c.primary_address.longitude, c.primary_address.latitude]
        } : null
      } : null,

      // Statut
      isVerified: c.is_verified,
      accountType: c.account_type,
      logo: c.logo,

      // Metadata
      tags: c.tags || [],
      country: c.country || 'FR',
      legalForm: c.legal_form,

      // Stats (a enrichir avec les transports)
      totalOrders: 0,
      lastOrderAt: null,

      // Niveau par defaut pour import
      level: c.is_verified ? 'N1_referenced' : 'N2_guest',
      status: 'pending', // A valider apres import

      // Documents status par defaut
      documentsStatus: {
        valid: 0,
        expiringSoon: 0,
        expired: 0,
        missing: 7 // Documents a fournir
      }
    };
  }

  /**
   * Recuperer les stats de transports par transporteur
   * Pour enrichir les donnees des carriers
   */
  async getCarrierStats(carrierId) {
    try {
      const params = new URLSearchParams();
      params.append('carrier', carrierId);
      params.append('limit', '1000');

      const response = await this.client.get(`/transports/?${params.toString()}`);
      const transports = response.data.results || [];

      const completed = transports.filter(t => t.status === 'done');
      const lastOrder = transports.sort((a, b) => new Date(b.created) - new Date(a.created))[0];

      return {
        totalOrders: transports.length,
        completedOrders: completed.length,
        lastOrderAt: lastOrder?.created || null,
        onTimeRate: completed.length > 0 ? Math.round((completed.length / transports.length) * 100) : 0
      };
    } catch (error) {
      console.error('Error fetching carrier stats:', error.message);
      return {
        totalOrders: 0,
        completedOrders: 0,
        lastOrderAt: null,
        onTimeRate: 0
      };
    }
  }

  /**
   * Synchroniser les transporteurs avec enrichissement des stats
   * @param {Object} options - Options incluant pagination
   * @param {Boolean} options.usePagination - Activer pagination automatique (defaut: true)
   * @param {Number} options.maxPages - Limite de securite pour pagination (defaut: 20)
   */
  async syncCarriersWithStats(options = {}) {
    // Par defaut, utiliser la pagination pour recuperer TOUS les carriers
    const usePagination = options.usePagination !== false;
    const maxPages = options.maxPages || 20; // 20 pages * 500 = 10 000 carriers max

    let carriersArray;

    if (usePagination) {
      console.log('[DASHDOC CARRIERS] Using pagination to fetch ALL carriers...');
      carriersArray = await this.getAllCarriersWithPagination(options, maxPages);
    } else {
      console.log('[DASHDOC CARRIERS] Using single call (no pagination)...');
      const carriers = await this.getCarriers(options);
      carriersArray = carriers.results;
    }

    console.log(`[DASHDOC CARRIERS] Total carriers to enrich: ${carriersArray.length}`);

    // Enrichir avec les stats (en parallele par batch)
    // Pour eviter de surcharger l'API, on traite par batch de 10
    const enrichedCarriers = [];
    const batchSize = 10;

    for (let i = 0; i < carriersArray.length; i += batchSize) {
      const batch = carriersArray.slice(i, i + batchSize);
      console.log(`[DASHDOC CARRIERS] Enriching batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(carriersArray.length / batchSize)}...`);

      const enrichedBatch = await Promise.all(
        batch.map(async (carrier) => {
          if (carrier.externalId) {
            try {
              const stats = await this.getCarrierStats(carrier.externalId);
              return {
                ...carrier,
                totalOrders: stats.totalOrders,
                lastOrderAt: stats.lastOrderAt,
                score: stats.onTimeRate
              };
            } catch (error) {
              console.warn(`[DASHDOC CARRIERS] Failed to get stats for ${carrier.companyName}:`, error.message);
              return carrier;
            }
          }
          return carrier;
        })
      );

      enrichedCarriers.push(...enrichedBatch);

      // Petit delai entre les batchs
      if (i + batchSize < carriersArray.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`[DASHDOC CARRIERS] Enrichment complete: ${enrichedCarriers.length} carriers`);

    return {
      count: enrichedCarriers.length,
      results: enrichedCarriers
    };
  }

  /**
   * Synchronisation complete - recupere toutes les donnees
   */
  async fullSync(options = {}) {
    const results = {
      startedAt: new Date().toISOString(),
      counters: null,
      transports: { count: 0, synced: 0, errors: [] },
      companies: { count: 0, synced: 0, errors: [] },
      contacts: { count: 0, synced: 0, errors: [] },
      vehicles: { count: 0, synced: 0, errors: [] },
      trailers: { count: 0, synced: 0, errors: [] },
      truckers: { count: 0, synced: 0, errors: [] },
      invoices: { count: 0, synced: 0, errors: [] }
    };

    try {
      // Compteurs
      results.counters = await this.getCounters();

      // Transports avec pagination automatique
      console.log('[DASHDOC] Starting FULL SYNC with automatic pagination...');

      // Definir les statuts a exclure (annules)
      // Si aucun filtre status__in specifie, on exclut automatiquement les cancelled/declined
      let statusFilter = options.status__in;
      if (!statusFilter && options.excludeCancelled !== false) {
        // Par defaut, on recupere tous les statuts SAUF cancelled et declined
        statusFilter = 'created,unassigned,assigned,confirmed,on_loading_site,loading_complete,on_unloading_site,unloading_complete,done';
        console.log('[DASHDOC] Excluding cancelled and declined orders by default');
      }

      // Si transportLimit = 0, on utilise la pagination automatique
      let allTransports;
      if (options.transportLimit === 0 || !options.transportLimit) {
        allTransports = await this.getAllTransportsWithPagination({
          ordering: '-created',
          tags__in: options.tags__in,
          status__in: statusFilter
        }, options.maxPages || 100);
      } else {
        // Ancienne methode pour compatibilite
        const transports = await this.getTransports({
          limit: options.transportLimit,
          ordering: '-created',
          status__in: statusFilter
        });
        allTransports = transports.results;
      }

      console.log(`[DASHDOC] Retrieved ${allTransports.length} transports (cancelled orders excluded)`);

      results.transports.count = allTransports.length;
      results.transports.synced = allTransports.length;
      results.transports.data = allTransports;

      // Entreprises
      const companies = await this.getCompanies({ limit: options.companyLimit || 500 });
      results.companies.count = companies.count;
      results.companies.synced = companies.results.length;
      results.companies.data = companies.results;

      // Contacts
      const contacts = await this.getContacts({ limit: options.contactLimit || 500 });
      results.contacts.count = contacts.count;
      results.contacts.synced = contacts.results.length;
      results.contacts.data = contacts.results;

      // Vehicules
      const vehicles = await this.getVehicles({ limit: 100 });
      results.vehicles.count = vehicles.count;
      results.vehicles.synced = vehicles.results.length;
      results.vehicles.data = vehicles.results;

      // Remorques
      const trailers = await this.getTrailers({ limit: 100 });
      results.trailers.count = trailers.count;
      results.trailers.synced = trailers.results.length;
      results.trailers.data = trailers.results;

      // Chauffeurs
      const truckers = await this.getTruckers({ limit: 100 });
      results.truckers.count = truckers.count;
      results.truckers.synced = truckers.results.length;
      results.truckers.data = truckers.results;

      // Factures
      const invoices = await this.getInvoices({ limit: options.invoiceLimit || 100 });
      results.invoices.count = invoices.count;
      results.invoices.synced = invoices.results.length;
      results.invoices.data = invoices.results;

    } catch (error) {
      results.error = error.message;
    }

    results.completedAt = new Date().toISOString();
    return results;
  }

  // ==================== MAPPING FUNCTIONS ====================

  /**
   * Mapper un transport Dashdoc vers format SYMPHONI.A Order
   */
  mapTransport(t) {
    const delivery = t.deliveries?.[0] || {};
    const origin = delivery.origin || {};
    const destination = delivery.destination || {};
    const loads = delivery.loads || [];

    return {
      // Identifiants
      externalId: t.uid,
      externalSource: 'dashdoc',
      sequentialId: t.sequential_id,
      inviteCode: t.invite_code,
      remoteId: t.remote_id,

      // Statut
      status: this.mapStatus(t.status),
      globalStatus: t.global_status,
      creationMethod: t.creation_method,

      // Dates
      createdAt: t.created,
      updatedAt: t.updated,

      // Pickup (chargement)
      pickup: {
        address: {
          name: origin.address?.name,
          street: origin.address?.address,
          city: origin.address?.city,
          postalCode: origin.address?.postcode,
          country: origin.address?.country,
          location: origin.address?.latitude ? {
            type: 'Point',
            coordinates: [origin.address.longitude, origin.address.latitude]
          } : null
        },
        contact: {
          name: origin.address?.company?.name,
          phone: origin.address?.company?.phone_number
        },
        scheduledAt: origin.slots?.[0]?.start,
        scheduledEnd: origin.slots?.[0]?.end,
        instructions: origin.instructions,
        reference: origin.reference
      },

      // Delivery (livraison)
      delivery: {
        address: {
          name: destination.address?.name,
          street: destination.address?.address,
          city: destination.address?.city,
          postalCode: destination.address?.postcode,
          country: destination.address?.country,
          location: destination.address?.latitude ? {
            type: 'Point',
            coordinates: [destination.address.longitude, destination.address.latitude]
          } : null
        },
        contact: {
          name: destination.address?.company?.name,
          phone: destination.address?.company?.phone_number
        },
        scheduledAt: destination.slots?.[0]?.start,
        scheduledEnd: destination.slots?.[0]?.end,
        instructions: destination.instructions,
        reference: destination.reference
      },

      // Marchandises
      cargo: loads.map(l => ({
        description: l.description,
        category: l.category,
        quantity: l.quantity,
        weight: l.weight,
        weightUnit: l.weight_unit,
        volume: l.volume,
        volumeUnit: l.volume_unit,
        linearMeters: l.linear_meters,
        isDangerous: l.is_dangerous,
        isRefrigerated: l.refrigerated,
        temperature: l.temperature,
        temperatureUnit: l.temperature_unit,
        adrCode: l.adr_un_code
      })),

      // Transporteur assigne
      carrier: t.carrier_address ? {
        externalId: t.carrier_address.company?.pk,
        name: t.carrier_address.company?.name,
        siret: t.carrier_address.company?.trade_number,
        vatNumber: t.carrier_address.company?.vat_number,
        phone: t.carrier_address.company?.phone_number,
        address: {
          street: t.carrier_address.address,
          city: t.carrier_address.city,
          postalCode: t.carrier_address.postcode,
          country: t.carrier_address.country
        }
      } : null,

      // Pricing
      pricing: {
        totalPrice: parseFloat(t.pricing_total_price) || null,
        agreedPrice: parseFloat(t.agreed_price_total) || null,
        invoicedPrice: parseFloat(t.invoiced_price_total) || null,
        currency: t.currency || 'EUR'
      },

      // Metrics
      metrics: {
        estimatedDistance: t.estimated_distance,
        carbonFootprint: t.carbon_footprint
      },

      // Documents
      documents: (t.documents || []).map(d => ({
        externalId: d.pk,
        category: d.category,
        name: d.name,
        fileUrl: d.file,
        createdAt: d.file_updated_date
      })),

      // Tracking
      trackingId: delivery.tracking_id,

      // Parent transport (pour sous-traitance)
      parentTransportId: t.parent_transport?.uid,

      // Tags (libelles Dashdoc)
      tags: t.tags || [],

      // Raw data for debugging
      _raw: {
        shape: t.shape,
        isOrder: t.is_order,
        businessPrivacy: t.business_privacy
      }
    };
  }

  /**
   * Mapper un statut Dashdoc vers statut SYMPHONI.A
   */
  mapStatus(dashdocStatus) {
    const statusMap = {
      'created': 'DRAFT',
      'unassigned': 'PENDING',
      'assigned': 'CONFIRMED',
      'confirmed': 'CONFIRMED',
      'on_loading_site': 'IN_PROGRESS',
      'loading_complete': 'IN_PROGRESS',
      'on_unloading_site': 'IN_PROGRESS',
      'unloading_complete': 'IN_PROGRESS',
      'done': 'COMPLETED',
      'cancelled': 'CANCELLED',
      'declined': 'CANCELLED'
    };
    return statusMap[dashdocStatus] || 'PENDING';
  }

  /**
   * Mapper une livraison
   */
  mapDelivery(d) {
    return {
      externalId: d.uid,
      externalSource: 'dashdoc',
      sequentialId: d.sequential_id,
      trackingId: d.tracking_id,
      shipperReference: d.shipper_reference,
      origin: d.origin ? {
        address: this.mapAddress(d.origin.address),
        scheduledAt: d.origin.slots?.[0]?.start,
        instructions: d.origin.instructions
      } : null,
      destination: d.destination ? {
        address: this.mapAddress(d.destination.address),
        scheduledAt: d.destination.slots?.[0]?.start,
        instructions: d.destination.instructions
      } : null
    };
  }

  /**
   * Mapper une entreprise Dashdoc vers Company SYMPHONI.A
   */
  mapCompany(c) {
    return {
      externalId: c.pk?.toString(),
      externalSource: 'dashdoc',
      remoteId: c.remote_id,

      name: c.name,
      legalName: c.name,

      // Identifiants legaux
      siret: c.trade_number,
      siren: c.siren,
      vatNumber: c.vat_number,

      // Contact
      phone: c.phone_number,
      email: c.email,
      website: c.website,

      // Adresse principale
      address: c.primary_address ? {
        street: c.primary_address.address,
        city: c.primary_address.city,
        postalCode: c.primary_address.postcode,
        country: c.primary_address.country,
        location: c.primary_address.latitude ? {
          type: 'Point',
          coordinates: [c.primary_address.longitude, c.primary_address.latitude]
        } : null
      } : null,

      // Settings
      isVerified: c.is_verified,
      accountType: c.account_type,
      logo: c.logo,

      // Metadata
      tags: c.tags || [],
      country: c.country,
      legalForm: c.legal_form
    };
  }

  /**
   * Mapper un contact
   */
  mapContact(c) {
    return {
      externalId: c.uid,
      externalSource: 'dashdoc',
      remoteId: c.remote_id,

      firstName: c.first_name,
      lastName: c.last_name,
      email: c.email,
      phone: c.phone_number,
      fax: c.fax_number,
      language: c.language,

      companyId: c.company?.pk?.toString(),
      companyName: c.company?.name,

      jobs: c.jobs || [],

      preferences: {
        receiveShareEmails: c.does_receive_share_emails,
        receiveReminderEmails: c.does_receive_reminder_emails
      },

      createdAt: c.created
    };
  }

  /**
   * Mapper un vehicule
   */
  mapVehicle(v) {
    return {
      externalId: v.pk?.toString() || v.uid,
      externalSource: 'dashdoc',
      remoteId: v.remote_id,

      licensePlate: v.license_plate,
      type: v.type,
      brand: v.brand,
      model: v.model,

      // Capacites
      payload: v.payload,
      volume: v.volume,

      // Caracteristiques
      hasLiftgate: v.has_liftgate,
      isRefrigerated: v.is_refrigerated,
      isAdr: v.is_adr,

      // Tags
      tags: v.tags || [],

      // Flotte
      fleetNumber: v.fleet_number,
      companyId: v.company?.pk?.toString()
    };
  }

  /**
   * Mapper une remorque
   */
  mapTrailer(t) {
    return {
      externalId: t.pk?.toString() || t.uid,
      externalSource: 'dashdoc',
      remoteId: t.remote_id,

      licensePlate: t.license_plate,
      type: t.type,

      // Capacites
      payload: t.payload,
      volume: t.volume,

      // Caracteristiques
      hasLiftgate: t.has_liftgate,
      isRefrigerated: t.is_refrigerated,

      // Tags
      tags: t.tags || [],

      fleetNumber: t.fleet_number,
      companyId: t.company?.pk?.toString()
    };
  }

  /**
   * Mapper un chauffeur
   */
  mapTrucker(t) {
    return {
      externalId: t.pk?.toString(),
      externalSource: 'dashdoc',
      remoteId: t.remote_id,

      firstName: t.user?.first_name,
      lastName: t.user?.last_name,
      email: t.user?.email,
      phone: t.user?.phone_number,

      // Permis
      drivingLicense: t.driving_license,
      drivingLicenseDeadline: t.driving_license_deadline,

      // ADR
      adrLicense: t.adr_license,
      adrLicenseDeadline: t.adr_license_deadline,

      // Carte conducteur
      driverCard: t.driver_card,
      driverCardDeadline: t.driver_card_deadline,

      // Status
      isActive: t.is_active,

      companyId: t.carrier?.pk?.toString()
    };
  }

  /**
   * Mapper une facture
   */
  mapInvoice(i) {
    return {
      externalId: i.uid,
      externalSource: 'dashdoc',

      invoiceNumber: i.document_number,
      status: i.status,

      // Montants
      totalTaxFree: i.total_tax_free_amount,
      totalWithTax: i.total_tax_amount,
      currency: i.currency || 'EUR',

      // Dates
      issueDate: i.issue_date,
      dueDate: i.due_date,
      paidAt: i.paid_at,

      // Parties
      debtor: i.debtor ? {
        companyId: i.debtor.pk?.toString(),
        name: i.debtor.name
      } : null,
      creditor: i.creditor ? {
        companyId: i.creditor.pk?.toString(),
        name: i.creditor.name
      } : null,

      // Lignes
      lines: (i.lines || []).map(l => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unit_price,
        totalPrice: l.total_price,
        vatRate: l.vat_rate
      })),

      // Document
      fileUrl: i.file_url,

      createdAt: i.created
    };
  }

  /**
   * Mapper une adresse
   */
  mapAddress(a) {
    if (!a) return null;
    return {
      externalId: a.pk?.toString(),
      externalSource: 'dashdoc',
      remoteId: a.remote_id,

      name: a.name,
      street: a.address,
      city: a.city,
      postalCode: a.postcode,
      country: a.country,

      location: a.latitude ? {
        type: 'Point',
        coordinates: [a.longitude, a.latitude]
      } : null,

      radius: a.radius,
      instructions: a.instructions,

      isCarrier: a.is_carrier,
      isShipper: a.is_shipper,
      isOrigin: a.is_origin,
      isDestination: a.is_destination,

      companyId: a.company?.pk?.toString(),
      companyName: a.company?.name,

      createdAt: a.created
    };
  }
}

module.exports = DashdocConnector;
