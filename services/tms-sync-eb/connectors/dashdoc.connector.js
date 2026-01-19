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

      // Transports (limiter pour perf)
      const transports = await this.getTransports({
        limit: options.transportLimit || 100,
        ordering: '-created'
      });
      results.transports.count = transports.count;
      results.transports.synced = transports.results.length;
      results.transports.data = transports.results;

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
