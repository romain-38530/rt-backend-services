/**
 * Module Planning Chargement & Livraison
 * Service de gestion des plannings et rendez-vous
 * Version: 1.0.0
 */

const { ObjectId } = require('mongodb');
const crypto = require('crypto');
const {
  SiteTypes,
  FlowTypes,
  TransportTypes,
  SlotStatus,
  RdvStatus,
  CheckInModes,
  PlanningEvents,
  PriorityLevels,
  DefaultConfig
} = require('./planning-models');
const { PlanningNotificationService } = require('./planning-notification-service');

// ============================================================================
// CLASSE PRINCIPALE: PlanningService
// ============================================================================

class PlanningService {
  constructor(db, eventEmitter = null) {
    this.db = db;
    this.eventEmitter = eventEmitter;
    this.sitePlannings = db.collection('site_plannings');
    this.slots = db.collection('planning_slots');
    this.rdvs = db.collection('planning_rdvs');
    this.driverQueues = db.collection('driver_queues');
    this.transportOrders = db.collection('transport_orders');
    this.carriers = db.collection('carriers');
    this.notificationService = new PlanningNotificationService(db);
  }

  // ==========================================================================
  // GESTION DES PLANNINGS DE SITE
  // ==========================================================================

  /**
   * Creer un nouveau planning de site
   */
  async createSitePlanning(data, userId) {
    const siteId = crypto.randomUUID();

    const sitePlanning = {
      siteId,
      organizationId: new ObjectId(data.organizationId),
      site: {
        name: data.site.name,
        type: data.site.type || SiteTypes.WAREHOUSE,
        address: {
          street: data.site.address.street,
          city: data.site.address.city,
          postalCode: data.site.address.postalCode,
          country: data.site.address.country || 'FR',
          coordinates: data.site.address.coordinates || null
        },
        geofence: data.site.geofence || {
          radius: DefaultConfig.geofence.arrivalRadius,
          coordinates: data.site.address.coordinates || null
        },
        timezone: data.site.timezone || 'Europe/Paris'
      },
      docks: (data.docks || []).map((dock, index) => ({
        dockId: dock.dockId || `DOCK-${index + 1}`,
        name: dock.name || `Quai ${index + 1}`,
        type: dock.type || 'mixed',
        capacity: dock.capacity || 1,
        equipment: dock.equipment || [],
        constraints: {
          allowedTransportTypes: dock.constraints?.allowedTransportTypes || Object.values(TransportTypes),
          maxWeight: dock.constraints?.maxWeight || 40000,
          maxHeight: dock.constraints?.maxHeight || 4.5,
          adrCompatible: dock.constraints?.adrCompatible || false,
          frigoCompatible: dock.constraints?.frigoCompatible || false
        },
        status: dock.status || 'active'
      })),
      openingHours: data.openingHours || this._getDefaultOpeningHours(),
      closures: data.closures || [],
      slotConfig: {
        defaultDuration: data.slotConfig?.defaultDuration || DefaultConfig.slots.defaultDuration,
        minBookingNotice: data.slotConfig?.minBookingNotice || DefaultConfig.slots.minBookingNotice,
        maxAdvanceBooking: data.slotConfig?.maxAdvanceBooking || DefaultConfig.slots.maxAdvanceBooking,
        toleranceWindow: data.slotConfig?.toleranceWindow || DefaultConfig.slots.toleranceWindow,
        noShowThreshold: data.slotConfig?.noShowThreshold || DefaultConfig.slots.noShowThreshold
      },
      rules: data.rules || {
        prioritySlots: [],
        expressSlots: [],
        adrSlots: [],
        capacityByFlow: {
          ftl: 2,
          ltl: 4,
          parcel: 6,
          express: 2
        }
      },
      autoRdvEnabled: data.autoRdvEnabled || false,
      autoRdvMinScore: data.autoRdvMinScore || 85,
      contacts: data.contacts || [],
      instructions: data.instructions || {
        arrival: '',
        safety: '',
        parking: '',
        documents: []
      },
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: new ObjectId(userId)
    };

    const result = await this.sitePlannings.insertOne(sitePlanning);
    sitePlanning._id = result.insertedId;

    // Generer les creneaux pour les 14 prochains jours
    await this.generateSlotsForPeriod(sitePlanning._id, new Date(), 14);

    this._emitEvent(PlanningEvents.PLANNING_CREATED, {
      sitePlanningId: sitePlanning._id,
      siteId,
      siteName: sitePlanning.site.name
    });

    return sitePlanning;
  }

  /**
   * Mettre a jour un planning de site
   */
  async updateSitePlanning(sitePlanningId, updates, userId) {
    const existing = await this.sitePlannings.findOne({ _id: new ObjectId(sitePlanningId) });
    if (!existing) {
      throw new Error('Planning de site non trouve');
    }

    const updateData = {
      ...updates,
      updatedAt: new Date()
    };

    // Ne pas permettre la modification de certains champs
    delete updateData._id;
    delete updateData.siteId;
    delete updateData.organizationId;
    delete updateData.createdAt;
    delete updateData.createdBy;

    await this.sitePlannings.updateOne(
      { _id: new ObjectId(sitePlanningId) },
      { $set: updateData }
    );

    this._emitEvent(PlanningEvents.PLANNING_UPDATED, {
      sitePlanningId: new ObjectId(sitePlanningId),
      siteId: existing.siteId,
      updates: Object.keys(updates)
    });

    return await this.sitePlannings.findOne({ _id: new ObjectId(sitePlanningId) });
  }

  /**
   * Obtenir un planning de site
   */
  async getSitePlanning(sitePlanningId) {
    return await this.sitePlannings.findOne({ _id: new ObjectId(sitePlanningId) });
  }

  /**
   * Lister les plannings d'une organisation
   */
  async listSitePlannings(organizationId, filters = {}) {
    const query = { organizationId: new ObjectId(organizationId) };

    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.siteType) {
      query['site.type'] = filters.siteType;
    }

    return await this.sitePlannings.find(query).toArray();
  }

  // ==========================================================================
  // GESTION DES CRENEAUX (SLOTS)
  // ==========================================================================

  /**
   * Generer les creneaux pour une periode donnee
   */
  async generateSlotsForPeriod(sitePlanningId, startDate, days) {
    const sitePlanning = await this.sitePlannings.findOne({ _id: new ObjectId(sitePlanningId) });
    if (!sitePlanning) {
      throw new Error('Planning de site non trouve');
    }

    const slots = [];
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    for (let d = 0; d < days; d++) {
      const currentDate = new Date(start);
      currentDate.setDate(currentDate.getDate() + d);

      // Verifier si c'est un jour de fermeture
      if (this._isClosedDay(sitePlanning, currentDate)) {
        continue;
      }

      const dayOfWeek = this._getDayName(currentDate);
      const hours = sitePlanning.openingHours[dayOfWeek];

      if (!hours || hours.closed) {
        continue;
      }

      // Generer les creneaux pour chaque quai actif
      for (const dock of sitePlanning.docks.filter(d => d.status === 'active')) {
        const daySlots = this._generateDaySlots(
          sitePlanning,
          dock,
          currentDate,
          hours.open,
          hours.close
        );
        slots.push(...daySlots);
      }
    }

    if (slots.length > 0) {
      // Supprimer les creneaux existants non reserves pour cette periode
      await this.slots.deleteMany({
        sitePlanningId: new ObjectId(sitePlanningId),
        date: { $gte: start, $lt: new Date(start.getTime() + days * 24 * 60 * 60 * 1000) },
        status: SlotStatus.AVAILABLE
      });

      await this.slots.insertMany(slots);
    }

    return slots.length;
  }

  /**
   * Generer les creneaux d'une journee pour un quai
   */
  _generateDaySlots(sitePlanning, dock, date, openTime, closeTime) {
    const slots = [];
    const duration = sitePlanning.slotConfig.defaultDuration;

    const [openHour, openMin] = openTime.split(':').map(Number);
    const [closeHour, closeMin] = closeTime.split(':').map(Number);

    let currentTime = new Date(date);
    currentTime.setHours(openHour, openMin, 0, 0);

    const endTime = new Date(date);
    endTime.setHours(closeHour, closeMin, 0, 0);

    while (currentTime < endTime) {
      const slotEnd = new Date(currentTime.getTime() + duration * 60 * 1000);
      if (slotEnd > endTime) break;

      const startTimeStr = this._formatTime(currentTime);
      const endTimeStr = this._formatTime(slotEnd);

      // Determiner les contraintes du creneau
      const constraints = this._getSlotConstraints(sitePlanning, startTimeStr, endTimeStr, dock);

      slots.push({
        slotId: crypto.randomUUID(),
        sitePlanningId: sitePlanning._id,
        siteId: sitePlanning.siteId,
        date: new Date(date),
        startTime: startTimeStr,
        endTime: endTimeStr,
        duration,
        dockId: dock.dockId,
        dockName: dock.name,
        flowType: dock.type === 'loading' ? FlowTypes.LOADING :
                  dock.type === 'delivery' ? FlowTypes.DELIVERY : null,
        transportType: null,
        capacity: dock.capacity,
        reserved: 0,
        available: dock.capacity,
        status: SlotStatus.AVAILABLE,
        reservations: [],
        constraints,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      currentTime = slotEnd;
    }

    return slots;
  }

  /**
   * Rechercher des creneaux disponibles
   */
  async findAvailableSlots(criteria) {
    const query = {
      status: SlotStatus.AVAILABLE,
      available: { $gt: 0 }
    };

    if (criteria.sitePlanningId) {
      query.sitePlanningId = new ObjectId(criteria.sitePlanningId);
    }
    if (criteria.siteId) {
      query.siteId = criteria.siteId;
    }
    if (criteria.date) {
      const startOfDay = new Date(criteria.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(criteria.date);
      endOfDay.setHours(23, 59, 59, 999);
      query.date = { $gte: startOfDay, $lte: endOfDay };
    }
    if (criteria.dateFrom && criteria.dateTo) {
      query.date = { $gte: new Date(criteria.dateFrom), $lte: new Date(criteria.dateTo) };
    }
    if (criteria.flowType) {
      query.$or = [
        { flowType: criteria.flowType },
        { flowType: null }
      ];
    }
    if (criteria.transportType) {
      query.transportType = { $in: [criteria.transportType, null] };
    }
    if (criteria.dockId) {
      query.dockId = criteria.dockId;
    }

    // Verifier le delai minimum de reservation
    const now = new Date();
    const sitePlanning = await this.sitePlannings.findOne({ _id: query.sitePlanningId });
    if (sitePlanning) {
      const minNotice = sitePlanning.slotConfig.minBookingNotice;
      const minDate = new Date(now.getTime() + minNotice * 60 * 60 * 1000);
      if (!query.date) {
        query.date = { $gte: minDate };
      } else {
        query.date.$gte = minDate;
      }
    }

    return await this.slots.find(query).sort({ date: 1, startTime: 1 }).toArray();
  }

  /**
   * Reserver un creneau
   */
  async reserveSlot(slotId, rdvId, carrierId, carrierName) {
    const slot = await this.slots.findOne({ _id: new ObjectId(slotId) });
    if (!slot) {
      throw new Error('Creneau non trouve');
    }
    if (slot.available <= 0) {
      throw new Error('Creneau complet');
    }

    const reservation = {
      rdvId: new ObjectId(rdvId),
      carrierId: new ObjectId(carrierId),
      carrierName,
      reservedAt: new Date(),
      status: 'active'
    };

    await this.slots.updateOne(
      { _id: new ObjectId(slotId) },
      {
        $push: { reservations: reservation },
        $inc: { reserved: 1, available: -1 },
        $set: {
          status: slot.available <= 1 ? SlotStatus.RESERVED : SlotStatus.AVAILABLE,
          updatedAt: new Date()
        }
      }
    );

    this._emitEvent(PlanningEvents.SLOT_RESERVED, {
      slotId: slot.slotId,
      rdvId,
      carrierId
    });

    return await this.slots.findOne({ _id: new ObjectId(slotId) });
  }

  /**
   * Liberer un creneau
   */
  async releaseSlot(slotId, rdvId) {
    const slot = await this.slots.findOne({ _id: new ObjectId(slotId) });
    if (!slot) {
      throw new Error('Creneau non trouve');
    }

    await this.slots.updateOne(
      { _id: new ObjectId(slotId) },
      {
        $pull: { reservations: { rdvId: new ObjectId(rdvId) } },
        $inc: { reserved: -1, available: 1 },
        $set: {
          status: SlotStatus.AVAILABLE,
          updatedAt: new Date()
        }
      }
    );

    this._emitEvent(PlanningEvents.SLOT_RELEASED, {
      slotId: slot.slotId,
      rdvId
    });
  }

  /**
   * Bloquer un creneau (maintenance, etc.)
   */
  async blockSlot(slotId, reason, userId) {
    await this.slots.updateOne(
      { _id: new ObjectId(slotId) },
      {
        $set: {
          status: SlotStatus.BLOCKED,
          blockReason: reason,
          blockedBy: new ObjectId(userId),
          blockedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );

    this._emitEvent(PlanningEvents.SLOT_BLOCKED, { slotId, reason });
  }

  // ==========================================================================
  // GESTION DES RENDEZ-VOUS (RDV)
  // ==========================================================================

  /**
   * Demander un RDV (transporteur)
   */
  async requestRdv(data, carrierId) {
    const transportOrder = await this.transportOrders.findOne({
      _id: new ObjectId(data.transportOrderId)
    });
    if (!transportOrder) {
      throw new Error('Commande de transport non trouvee');
    }

    const carrier = await this.carriers.findOne({ _id: new ObjectId(carrierId) });
    if (!carrier) {
      throw new Error('Transporteur non trouve');
    }

    const sitePlanning = await this.sitePlannings.findOne({
      _id: new ObjectId(data.sitePlanningId)
    });
    if (!sitePlanning) {
      throw new Error('Planning de site non trouve');
    }

    // Verifier si auto-RDV est actif et si le transporteur est eligible
    const isAutoRdv = sitePlanning.autoRdvEnabled &&
                      carrier.score >= sitePlanning.autoRdvMinScore;

    // Trouver le creneau demande
    const slot = await this.slots.findOne({ _id: new ObjectId(data.slotId) });
    if (!slot) {
      throw new Error('Creneau non trouve');
    }
    if (slot.available <= 0 && !isAutoRdv) {
      throw new Error('Creneau non disponible');
    }

    const rdvId = crypto.randomUUID();
    const rdvNumber = await this._generateRdvNumber(sitePlanning.organizationId);

    const rdv = {
      rdvId,
      rdvNumber,
      transportOrderId: new ObjectId(data.transportOrderId),
      orderReference: transportOrder.reference || transportOrder.orderNumber,
      sitePlanningId: new ObjectId(data.sitePlanningId),
      slotId: slot._id,
      organizationId: sitePlanning.organizationId,
      carrier: {
        carrierId: new ObjectId(carrierId),
        carrierName: carrier.companyName || carrier.name,
        carrierScore: carrier.score || 0,
        isPremium: carrier.isPremium || false
      },
      driver: data.driver ? {
        driverId: data.driver.driverId ? new ObjectId(data.driver.driverId) : null,
        name: data.driver.name,
        phone: data.driver.phone,
        vehiclePlate: data.driver.vehiclePlate,
        vehicleType: data.driver.vehicleType
      } : null,
      site: {
        siteId: sitePlanning.siteId,
        siteName: sitePlanning.site.name,
        address: sitePlanning.site.address
      },
      slot: {
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        dockId: slot.dockId,
        dockName: slot.dockName
      },
      flowType: data.flowType || slot.flowType || FlowTypes.DELIVERY,
      transportType: data.transportType || TransportTypes.FTL,
      cargo: data.cargo || {
        description: transportOrder.cargo?.description || '',
        weight: transportOrder.cargo?.weight || 0,
        volume: transportOrder.cargo?.volume || 0,
        pallets: transportOrder.cargo?.pallets || 0,
        packages: transportOrder.cargo?.packages || 0,
        hazardous: transportOrder.cargo?.hazardous || false,
        temperature: transportOrder.cargo?.temperature || null
      },
      status: isAutoRdv ? RdvStatus.CONFIRMED : RdvStatus.REQUESTED,
      statusHistory: [{
        status: isAutoRdv ? RdvStatus.CONFIRMED : RdvStatus.REQUESTED,
        changedAt: new Date(),
        changedBy: new ObjectId(carrierId),
        reason: isAutoRdv ? 'Auto-RDV (score >= seuil)' : 'Demande initiale'
      }],
      workflow: {
        requestedAt: new Date(),
        requestedBy: new ObjectId(carrierId),
        proposedSlot: null,
        confirmedAt: isAutoRdv ? new Date() : null,
        confirmedBy: isAutoRdv ? new ObjectId(carrierId) : null
      },
      checkIn: {
        mode: null,
        arrivedAt: null,
        checkedInAt: null,
        atDockAt: null,
        checkedOutAt: null,
        waitTime: null,
        operationTime: null
      },
      operation: {
        startedAt: null,
        completedAt: null,
        actualWeight: null,
        actualPallets: null,
        remarks: null,
        photos: [],
        issues: []
      },
      signature: {
        required: true,
        signedAt: null,
        signedBy: null,
        signatureUrl: null,
        documentUrl: null
      },
      notifications: [],
      priority: data.priority || PriorityLevels.NORMAL,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null
    };

    const result = await this.rdvs.insertOne(rdv);
    rdv._id = result.insertedId;

    // Reserver le creneau
    await this.reserveSlot(slot._id, rdv._id, carrierId, rdv.carrier.carrierName);

    // Envoyer notification
    await this._sendRdvNotification(rdv, isAutoRdv ? 'confirmed' : 'requested');

    this._emitEvent(isAutoRdv ? PlanningEvents.RDV_CONFIRMED : PlanningEvents.RDV_REQUESTED, {
      rdvId: rdv._id,
      rdvNumber,
      carrierId,
      sitePlanningId: data.sitePlanningId,
      autoRdv: isAutoRdv
    });

    return rdv;
  }

  /**
   * Proposer un creneau alternatif (site)
   */
  async proposeAlternativeSlot(rdvId, newSlotId, reason, userId) {
    const rdv = await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
    if (!rdv) {
      throw new Error('RDV non trouve');
    }
    if (rdv.status !== RdvStatus.REQUESTED) {
      throw new Error('Le RDV ne peut plus etre modifie');
    }

    const newSlot = await this.slots.findOne({ _id: new ObjectId(newSlotId) });
    if (!newSlot) {
      throw new Error('Nouveau creneau non trouve');
    }
    if (newSlot.available <= 0) {
      throw new Error('Nouveau creneau non disponible');
    }

    // Liberer l'ancien creneau
    await this.releaseSlot(rdv.slotId, rdv._id);

    // Mettre a jour le RDV
    await this.rdvs.updateOne(
      { _id: new ObjectId(rdvId) },
      {
        $set: {
          status: RdvStatus.PROPOSED,
          slotId: newSlot._id,
          'slot.date': newSlot.date,
          'slot.startTime': newSlot.startTime,
          'slot.endTime': newSlot.endTime,
          'slot.dockId': newSlot.dockId,
          'slot.dockName': newSlot.dockName,
          'workflow.proposedSlot': {
            date: newSlot.date,
            startTime: newSlot.startTime,
            endTime: newSlot.endTime
          },
          updatedAt: new Date()
        },
        $push: {
          statusHistory: {
            status: RdvStatus.PROPOSED,
            changedAt: new Date(),
            changedBy: new ObjectId(userId),
            reason
          }
        }
      }
    );

    // Reserver le nouveau creneau
    await this.reserveSlot(newSlot._id, rdv._id, rdv.carrier.carrierId, rdv.carrier.carrierName);

    // Notifier le transporteur
    await this._sendRdvNotification({ ...rdv, slot: newSlot }, 'proposed');

    this._emitEvent(PlanningEvents.RDV_PROPOSED, {
      rdvId,
      oldSlotId: rdv.slotId,
      newSlotId,
      reason
    });

    return await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
  }

  /**
   * Confirmer un RDV
   */
  async confirmRdv(rdvId, userId, isCarrier = false) {
    const rdv = await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
    if (!rdv) {
      throw new Error('RDV non trouve');
    }
    if (![RdvStatus.REQUESTED, RdvStatus.PROPOSED].includes(rdv.status)) {
      throw new Error('Le RDV ne peut pas etre confirme dans son etat actuel');
    }

    await this.rdvs.updateOne(
      { _id: new ObjectId(rdvId) },
      {
        $set: {
          status: RdvStatus.CONFIRMED,
          'workflow.confirmedAt': new Date(),
          'workflow.confirmedBy': new ObjectId(userId),
          updatedAt: new Date()
        },
        $push: {
          statusHistory: {
            status: RdvStatus.CONFIRMED,
            changedAt: new Date(),
            changedBy: new ObjectId(userId),
            reason: isCarrier ? 'Confirmation par transporteur' : 'Confirmation par site'
          }
        }
      }
    );

    // Mettre a jour le creneau
    await this.slots.updateOne(
      { _id: rdv.slotId },
      {
        $set: { status: SlotStatus.CONFIRMED, updatedAt: new Date() }
      }
    );

    // Notifier
    await this._sendRdvNotification(rdv, 'confirmed');

    this._emitEvent(PlanningEvents.RDV_CONFIRMED, {
      rdvId,
      confirmedBy: userId,
      isCarrier
    });

    return await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
  }

  /**
   * Refuser un RDV
   */
  async refuseRdv(rdvId, reason, userId) {
    const rdv = await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
    if (!rdv) {
      throw new Error('RDV non trouve');
    }
    if (![RdvStatus.REQUESTED, RdvStatus.PROPOSED].includes(rdv.status)) {
      throw new Error('Le RDV ne peut pas etre refuse dans son etat actuel');
    }

    // Liberer le creneau
    await this.releaseSlot(rdv.slotId, rdv._id);

    await this.rdvs.updateOne(
      { _id: new ObjectId(rdvId) },
      {
        $set: {
          status: RdvStatus.REFUSED,
          updatedAt: new Date()
        },
        $push: {
          statusHistory: {
            status: RdvStatus.REFUSED,
            changedAt: new Date(),
            changedBy: new ObjectId(userId),
            reason
          }
        }
      }
    );

    // Notifier
    await this._sendRdvNotification(rdv, 'refused', reason);

    this._emitEvent(PlanningEvents.RDV_REFUSED, { rdvId, reason });

    return await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
  }

  /**
   * Replanifier un RDV
   */
  async rescheduleRdv(rdvId, newSlotId, reason, userId) {
    const rdv = await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
    if (!rdv) {
      throw new Error('RDV non trouve');
    }
    if (![RdvStatus.CONFIRMED, RdvStatus.PROPOSED].includes(rdv.status)) {
      throw new Error('Le RDV ne peut pas etre replanifie dans son etat actuel');
    }

    const newSlot = await this.slots.findOne({ _id: new ObjectId(newSlotId) });
    if (!newSlot || newSlot.available <= 0) {
      throw new Error('Nouveau creneau non disponible');
    }

    // Liberer l'ancien creneau
    await this.releaseSlot(rdv.slotId, rdv._id);

    // Reserver le nouveau
    await this.reserveSlot(newSlot._id, rdv._id, rdv.carrier.carrierId, rdv.carrier.carrierName);

    await this.rdvs.updateOne(
      { _id: new ObjectId(rdvId) },
      {
        $set: {
          status: RdvStatus.RESCHEDULED,
          slotId: newSlot._id,
          'slot.date': newSlot.date,
          'slot.startTime': newSlot.startTime,
          'slot.endTime': newSlot.endTime,
          'slot.dockId': newSlot.dockId,
          'slot.dockName': newSlot.dockName,
          updatedAt: new Date()
        },
        $push: {
          statusHistory: {
            status: RdvStatus.RESCHEDULED,
            changedAt: new Date(),
            changedBy: new ObjectId(userId),
            reason
          }
        }
      }
    );

    // Notifier
    await this._sendRdvNotification({ ...rdv, slot: newSlot }, 'rescheduled');

    this._emitEvent(PlanningEvents.RDV_RESCHEDULED, {
      rdvId,
      oldSlotId: rdv.slotId,
      newSlotId,
      reason
    });

    return await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
  }

  /**
   * Annuler un RDV
   */
  async cancelRdv(rdvId, reason, userId) {
    const rdv = await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
    if (!rdv) {
      throw new Error('RDV non trouve');
    }
    if ([RdvStatus.COMPLETED, RdvStatus.CANCELLED].includes(rdv.status)) {
      throw new Error('Le RDV ne peut pas etre annule');
    }

    // Liberer le creneau
    await this.releaseSlot(rdv.slotId, rdv._id);

    await this.rdvs.updateOne(
      { _id: new ObjectId(rdvId) },
      {
        $set: {
          status: RdvStatus.CANCELLED,
          updatedAt: new Date()
        },
        $push: {
          statusHistory: {
            status: RdvStatus.CANCELLED,
            changedAt: new Date(),
            changedBy: new ObjectId(userId),
            reason
          }
        }
      }
    );

    // Notifier
    await this._sendRdvNotification(rdv, 'cancelled', reason);

    this._emitEvent(PlanningEvents.RDV_CANCELLED, { rdvId, reason });

    return await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
  }

  /**
   * Obtenir un RDV
   */
  async getRdv(rdvId) {
    return await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
  }

  /**
   * Lister les RDV
   */
  async listRdvs(filters = {}) {
    const query = {};

    if (filters.organizationId) {
      query.organizationId = new ObjectId(filters.organizationId);
    }
    if (filters.sitePlanningId) {
      query.sitePlanningId = new ObjectId(filters.sitePlanningId);
    }
    if (filters.carrierId) {
      query['carrier.carrierId'] = new ObjectId(filters.carrierId);
    }
    if (filters.transportOrderId) {
      query.transportOrderId = new ObjectId(filters.transportOrderId);
    }
    if (filters.status) {
      query.status = Array.isArray(filters.status) ? { $in: filters.status } : filters.status;
    }
    if (filters.date) {
      const startOfDay = new Date(filters.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(filters.date);
      endOfDay.setHours(23, 59, 59, 999);
      query['slot.date'] = { $gte: startOfDay, $lte: endOfDay };
    }
    if (filters.dateFrom && filters.dateTo) {
      query['slot.date'] = {
        $gte: new Date(filters.dateFrom),
        $lte: new Date(filters.dateTo)
      };
    }

    const limit = filters.limit || 100;
    const skip = filters.skip || 0;

    return await this.rdvs
      .find(query)
      .sort({ 'slot.date': 1, 'slot.startTime': 1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  // ==========================================================================
  // INTEGRATION TRACKING IA
  // ==========================================================================

  /**
   * Gerer l'arrivee anticipee d'un chauffeur (detectee par tracking)
   */
  async handleEarlyArrival(rdvId, etaMinutes) {
    const rdv = await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
    if (!rdv || rdv.status !== RdvStatus.CONFIRMED) {
      return null;
    }

    // Verifier si le chauffeur arrive en avance de plus de 30 minutes
    const scheduledTime = this._parseTime(rdv.slot.date, rdv.slot.startTime);
    const now = new Date();
    const earlyMinutes = (scheduledTime - now) / 60000 - etaMinutes;

    if (earlyMinutes > 30) {
      // Chercher un creneau plus tot
      const earlierSlots = await this.findAvailableSlots({
        sitePlanningId: rdv.sitePlanningId,
        date: rdv.slot.date,
        flowType: rdv.flowType
      });

      const suitableSlot = earlierSlots.find(s => {
        const slotTime = this._parseTime(s.date, s.startTime);
        return slotTime > now && slotTime < scheduledTime;
      });

      if (suitableSlot) {
        // Proposer automatiquement le creneau plus tot
        return {
          action: 'propose_earlier',
          originalSlot: rdv.slot,
          proposedSlot: suitableSlot,
          earlyMinutes
        };
      }
    }

    return { action: 'none', earlyMinutes };
  }

  /**
   * Gerer le retard d'un chauffeur (detecte par tracking)
   */
  async handleDelay(rdvId, delayMinutes) {
    const rdv = await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
    if (!rdv || ![RdvStatus.CONFIRMED, RdvStatus.CHECKED_IN].includes(rdv.status)) {
      return null;
    }

    const sitePlanning = await this.sitePlannings.findOne({ _id: rdv.sitePlanningId });
    const tolerance = sitePlanning.slotConfig.toleranceWindow;

    if (delayMinutes > tolerance) {
      // Rechercher un creneau plus tard
      const laterSlots = await this.findAvailableSlots({
        sitePlanningId: rdv.sitePlanningId,
        date: rdv.slot.date,
        flowType: rdv.flowType
      });

      const scheduledTime = this._parseTime(rdv.slot.date, rdv.slot.startTime);
      const newEstimatedTime = new Date(scheduledTime.getTime() + delayMinutes * 60000);

      const suitableSlot = laterSlots.find(s => {
        const slotTime = this._parseTime(s.date, s.startTime);
        return slotTime >= newEstimatedTime;
      });

      if (suitableSlot) {
        return {
          action: 'propose_later',
          originalSlot: rdv.slot,
          proposedSlot: suitableSlot,
          delayMinutes
        };
      } else {
        // Pas de creneau disponible, notifier le site
        return {
          action: 'notify_delay',
          delayMinutes,
          noSlotAvailable: true
        };
      }
    }

    return { action: 'within_tolerance', delayMinutes };
  }

  // ==========================================================================
  // STATISTIQUES ET RAPPORTS
  // ==========================================================================

  /**
   * Obtenir les statistiques d'un site
   */
  async getSiteStats(sitePlanningId, dateFrom, dateTo) {
    const matchStage = {
      sitePlanningId: new ObjectId(sitePlanningId),
      'slot.date': {
        $gte: new Date(dateFrom),
        $lte: new Date(dateTo)
      }
    };

    const stats = await this.rdvs.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    const waitTimeStats = await this.rdvs.aggregate([
      {
        $match: {
          ...matchStage,
          'checkIn.waitTime': { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          avgWaitTime: { $avg: '$checkIn.waitTime' },
          maxWaitTime: { $max: '$checkIn.waitTime' },
          minWaitTime: { $min: '$checkIn.waitTime' }
        }
      }
    ]).toArray();

    const operationTimeStats = await this.rdvs.aggregate([
      {
        $match: {
          ...matchStage,
          'checkIn.operationTime': { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          avgOperationTime: { $avg: '$checkIn.operationTime' },
          maxOperationTime: { $max: '$checkIn.operationTime' },
          minOperationTime: { $min: '$checkIn.operationTime' }
        }
      }
    ]).toArray();

    const statusCounts = {};
    stats.forEach(s => { statusCounts[s._id] = s.count; });

    return {
      period: { from: dateFrom, to: dateTo },
      totals: {
        total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
        byStatus: statusCounts
      },
      waitTime: waitTimeStats[0] || { avgWaitTime: 0, maxWaitTime: 0, minWaitTime: 0 },
      operationTime: operationTimeStats[0] || { avgOperationTime: 0, maxOperationTime: 0, minOperationTime: 0 },
      performance: {
        completedOnTime: statusCounts[RdvStatus.COMPLETED] || 0,
        noShows: statusCounts[RdvStatus.NO_SHOW] || 0,
        cancelled: statusCounts[RdvStatus.CANCELLED] || 0
      }
    };
  }

  // ==========================================================================
  // METHODES UTILITAIRES PRIVEES
  // ==========================================================================

  _getDefaultOpeningHours() {
    const defaultHours = { open: '08:00', close: '18:00', closed: false };
    return {
      monday: { ...defaultHours },
      tuesday: { ...defaultHours },
      wednesday: { ...defaultHours },
      thursday: { ...defaultHours },
      friday: { ...defaultHours },
      saturday: { open: '08:00', close: '12:00', closed: false },
      sunday: { closed: true }
    };
  }

  _getDayName(date) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[date.getDay()];
  }

  _isClosedDay(sitePlanning, date) {
    // Verifier les fermetures exceptionnelles
    const closure = sitePlanning.closures.find(c => {
      const closureDate = new Date(c.date);
      return closureDate.toDateString() === date.toDateString() && c.fullDay;
    });
    return !!closure;
  }

  _formatTime(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  _parseTime(date, timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const result = new Date(date);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }

  _getSlotConstraints(sitePlanning, startTime, endTime, dock) {
    const constraints = {
      priority: false,
      express: false,
      adr: dock.constraints.adrCompatible,
      frigo: dock.constraints.frigoCompatible,
      minScore: 0
    };

    // Verifier les creneaux prioritaires
    for (const prioritySlot of sitePlanning.rules.prioritySlots || []) {
      if (startTime >= prioritySlot.startTime && endTime <= prioritySlot.endTime) {
        constraints.priority = true;
        constraints.minScore = prioritySlot.conditions?.minScore || 80;
        break;
      }
    }

    // Verifier les creneaux express
    for (const expressSlot of sitePlanning.rules.expressSlots || []) {
      if (startTime >= expressSlot.startTime && endTime <= expressSlot.endTime) {
        constraints.express = true;
        break;
      }
    }

    return constraints;
  }

  async _generateRdvNumber(organizationId) {
    const date = new Date();
    const prefix = 'RDV';
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');

    // Compter les RDV du mois pour l'organisation
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    const count = await this.rdvs.countDocuments({
      organizationId: new ObjectId(organizationId),
      createdAt: { $gte: startOfMonth, $lte: endOfMonth }
    });

    const sequence = String(count + 1).padStart(4, '0');
    return `${prefix}${year}${month}-${sequence}`;
  }

  async _sendRdvNotification(rdv, type, additionalInfo = null) {
    // Integration complete avec Mailgun/Twilio via PlanningNotificationService
    let result = { success: false };

    try {
      switch (type) {
        case 'requested':
          result = await this.notificationService.notifyRdvRequested(rdv);
          break;
        case 'proposed':
          result = await this.notificationService.notifyRdvProposed(rdv, additionalInfo);
          break;
        case 'confirmed':
          result = await this.notificationService.notifyRdvConfirmed(rdv);
          break;
        case 'refused':
          result = await this.notificationService.notifyRdvRefused(rdv, additionalInfo);
          break;
        case 'rescheduled':
          result = await this.notificationService.notifyRdvRescheduled(rdv, additionalInfo);
          break;
        case 'cancelled':
          result = await this.notificationService.notifyRdvCancelled(rdv, additionalInfo);
          break;
        default:
          console.log(`[Planning] Type de notification inconnu: ${type}`);
      }

      // Enregistrer la notification dans le RDV
      const notification = {
        type: `rdv_${type}`,
        channels: result.sent?.map(s => s.channel) || ['email'],
        sentAt: new Date(),
        recipient: rdv.carrier.carrierName,
        success: result.success
      };

      await this.rdvs.updateOne(
        { _id: rdv._id },
        { $push: { notifications: notification } }
      );

      console.log(`[Planning] Notification ${type} envoyee pour RDV ${rdv.rdvNumber} - Success: ${result.success}`);
    } catch (error) {
      console.error(`[Planning] Erreur notification ${type}:`, error.message);
    }

    return result;
  }

  _emitEvent(eventType, data) {
    if (this.eventEmitter) {
      this.eventEmitter.emit(eventType, {
        event: eventType,
        timestamp: new Date(),
        data
      });
    }
    console.log(`[Planning Event] ${eventType}:`, JSON.stringify(data));
  }
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports = { PlanningService };
