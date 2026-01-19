/**
 * Module Planning Chargement & Livraison
 * Service de Check-in Chauffeur (Borne Virtuelle)
 * Version: 1.0.0
 */

const { ObjectId } = require('mongodb');
const crypto = require('crypto');
const {
  RdvStatus,
  CheckInModes,
  PlanningEvents,
  DefaultConfig
} = require('./planning-models');
const { PlanningNotificationService } = require('./planning-notification-service');

// ============================================================================
// CLASSE PRINCIPALE: DriverCheckinService
// ============================================================================

class DriverCheckinService {
  constructor(db, eventEmitter = null) {
    this.db = db;
    this.eventEmitter = eventEmitter;
    this.rdvs = db.collection('planning_rdvs');
    this.driverQueues = db.collection('driver_queues');
    this.sitePlannings = db.collection('site_plannings');
    this.carriers = db.collection('carriers');
    this.ecmrDocuments = db.collection('ecmr_documents');
    this.notificationService = new PlanningNotificationService(db);
  }

  // ==========================================================================
  // CHECK-IN / CHECK-OUT CHAUFFEUR
  // ==========================================================================

  /**
   * Signaler l'approche du chauffeur (geofence 2km)
   */
  async driverApproaching(rdvId, coordinates) {
    const rdv = await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
    if (!rdv) {
      throw new Error('RDV non trouve');
    }
    if (rdv.status !== RdvStatus.CONFIRMED) {
      throw new Error('Le RDV doit etre confirme pour signaler l\'approche');
    }

    const sitePlanning = await this.sitePlannings.findOne({ _id: rdv.sitePlanningId });
    if (!sitePlanning) {
      throw new Error('Planning de site non trouve');
    }

    // Calculer la distance au site
    const distance = this._calculateDistance(
      coordinates,
      sitePlanning.site.geofence?.coordinates || sitePlanning.site.address.coordinates
    );

    // Verifier si dans la zone d'approche (2km par defaut)
    const approachRadius = DefaultConfig.geofence.approachRadius;
    if (distance > approachRadius) {
      return {
        inApproachZone: false,
        distance,
        approachRadius
      };
    }

    // Mettre a jour le RDV
    await this.rdvs.updateOne(
      { _id: new ObjectId(rdvId) },
      {
        $set: {
          'checkIn.mode': CheckInModes.APP_GEOFENCE,
          'checkIn.approachingAt': new Date(),
          'checkIn.approachCoordinates': coordinates,
          updatedAt: new Date()
        }
      }
    );

    this._emitEvent(PlanningEvents.DRIVER_APPROACHING, {
      rdvId,
      rdvNumber: rdv.rdvNumber,
      carrierName: rdv.carrier.carrierName,
      distance,
      siteName: sitePlanning.site.name
    });

    return {
      inApproachZone: true,
      distance,
      approachRadius,
      siteName: sitePlanning.site.name,
      instructions: sitePlanning.instructions.arrival
    };
  }

  /**
   * Check-in du chauffeur
   */
  async driverCheckIn(rdvId, data) {
    const rdv = await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
    if (!rdv) {
      throw new Error('RDV non trouve');
    }
    if (![RdvStatus.CONFIRMED, RdvStatus.RESCHEDULED].includes(rdv.status)) {
      throw new Error('Le RDV doit etre confirme pour effectuer le check-in');
    }

    const sitePlanning = await this.sitePlannings.findOne({ _id: rdv.sitePlanningId });
    if (!sitePlanning) {
      throw new Error('Planning de site non trouve');
    }

    const now = new Date();

    // Valider le mode de check-in
    let validated = false;
    let mode = data.mode || CheckInModes.MANUAL;

    switch (mode) {
      case CheckInModes.APP_GEOFENCE:
        if (data.coordinates) {
          const distance = this._calculateDistance(
            data.coordinates,
            sitePlanning.site.geofence?.coordinates || sitePlanning.site.address.coordinates
          );
          validated = distance <= DefaultConfig.geofence.arrivalRadius;
        }
        break;

      case CheckInModes.QR_CODE:
        validated = await this._validateQRCode(data.qrCode, rdvId);
        break;

      case CheckInModes.KIOSK:
        validated = true; // Valide par defaut pour borne physique
        break;

      case CheckInModes.MANUAL:
        validated = true;
        break;
    }

    if (!validated) {
      throw new Error('Validation du check-in echouee');
    }

    // Mettre a jour le RDV
    await this.rdvs.updateOne(
      { _id: new ObjectId(rdvId) },
      {
        $set: {
          status: RdvStatus.CHECKED_IN,
          'checkIn.mode': mode,
          'checkIn.arrivedAt': rdv.checkIn?.approachingAt || now,
          'checkIn.checkedInAt': now,
          updatedAt: new Date()
        },
        $push: {
          statusHistory: {
            status: RdvStatus.CHECKED_IN,
            changedAt: now,
            changedBy: data.driverId ? new ObjectId(data.driverId) : null,
            reason: `Check-in via ${mode}`
          }
        }
      }
    );

    // Ajouter a la file d'attente
    await this._addToQueue(rdv, sitePlanning);

    this._emitEvent(PlanningEvents.DRIVER_CHECKED_IN, {
      rdvId,
      rdvNumber: rdv.rdvNumber,
      carrierName: rdv.carrier.carrierName,
      mode,
      siteName: sitePlanning.site.name
    });

    // Recuperer la position dans la file
    const queuePosition = await this._getQueuePosition(rdv.sitePlanningId, rdvId);

    return {
      checkedInAt: now,
      mode,
      queuePosition,
      estimatedWaitTime: queuePosition * 15, // Estimation: 15 min par camion
      dockAssigned: null, // Sera assigne plus tard
      instructions: sitePlanning.instructions.parking
    };
  }

  /**
   * Signaler l'arrivee au quai
   */
  async driverAtDock(rdvId, dockId) {
    const rdv = await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
    if (!rdv) {
      throw new Error('RDV non trouve');
    }
    if (rdv.status !== RdvStatus.CHECKED_IN) {
      throw new Error('Le chauffeur doit etre check-in pour arriver au quai');
    }

    const now = new Date();
    const waitTime = rdv.checkIn?.checkedInAt
      ? Math.round((now - new Date(rdv.checkIn.checkedInAt)) / 60000)
      : 0;

    await this.rdvs.updateOne(
      { _id: new ObjectId(rdvId) },
      {
        $set: {
          'checkIn.atDockAt': now,
          'checkIn.waitTime': waitTime,
          'slot.dockId': dockId,
          updatedAt: new Date()
        }
      }
    );

    // Mettre a jour la file d'attente
    await this._updateQueueDriverStatus(rdv.sitePlanningId, rdvId, 'at_dock', dockId);

    this._emitEvent(PlanningEvents.DRIVER_AT_DOCK, {
      rdvId,
      rdvNumber: rdv.rdvNumber,
      dockId,
      waitTime
    });

    return {
      atDockAt: now,
      dockId,
      waitTime
    };
  }

  /**
   * Check-out du chauffeur
   */
  async driverCheckOut(rdvId, data = {}) {
    const rdv = await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
    if (!rdv) {
      throw new Error('RDV non trouve');
    }
    if (![RdvStatus.CHECKED_IN, RdvStatus.IN_PROGRESS].includes(rdv.status)) {
      throw new Error('Le chauffeur doit etre check-in ou en operation pour effectuer le check-out');
    }

    const now = new Date();
    const operationTime = rdv.operation?.startedAt
      ? Math.round((now - new Date(rdv.operation.startedAt)) / 60000)
      : 0;

    // Calculer le score de la visite
    const visitScore = await this._calculateVisitScore(rdv, operationTime);

    await this.rdvs.updateOne(
      { _id: new ObjectId(rdvId) },
      {
        $set: {
          status: RdvStatus.COMPLETED,
          'checkIn.checkedOutAt': now,
          'checkIn.operationTime': operationTime,
          'operation.completedAt': now,
          'operation.remarks': data.remarks || null,
          'operation.issues': data.issues || [],
          completedAt: now,
          updatedAt: new Date()
        },
        $push: {
          statusHistory: {
            status: RdvStatus.COMPLETED,
            changedAt: now,
            reason: 'Check-out effectue'
          }
        }
      }
    );

    // Retirer de la file d'attente
    await this._removeFromQueue(rdv.sitePlanningId, rdvId);

    // Mettre a jour le score du transporteur
    await this._updateCarrierScore(rdv.carrier.carrierId, visitScore);

    this._emitEvent(PlanningEvents.DRIVER_CHECKED_OUT, {
      rdvId,
      rdvNumber: rdv.rdvNumber,
      operationTime,
      visitScore
    });

    return {
      checkedOutAt: now,
      operationTime,
      visitScore
    };
  }

  /**
   * Obtenir le statut du chauffeur
   */
  async getDriverStatus(rdvId) {
    const rdv = await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
    if (!rdv) {
      throw new Error('RDV non trouve');
    }

    const queuePosition = rdv.status === RdvStatus.CHECKED_IN
      ? await this._getQueuePosition(rdv.sitePlanningId, rdvId)
      : null;

    return {
      rdvId: rdv._id,
      rdvNumber: rdv.rdvNumber,
      status: rdv.status,
      checkIn: rdv.checkIn,
      slot: rdv.slot,
      queuePosition,
      estimatedWaitTime: queuePosition ? queuePosition * 15 : null,
      operation: rdv.operation,
      signature: rdv.signature
    };
  }

  // ==========================================================================
  // GESTION DE LA FILE D'ATTENTE
  // ==========================================================================

  /**
   * Obtenir la file d'attente d'un site
   */
  async getDriverQueue(sitePlanningId, date = null) {
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    let queue = await this.driverQueues.findOne({
      sitePlanningId: new ObjectId(sitePlanningId),
      date: targetDate
    });

    if (!queue) {
      queue = {
        sitePlanningId: new ObjectId(sitePlanningId),
        date: targetDate,
        drivers: [],
        stats: {
          totalWaiting: 0,
          averageWaitTime: 0,
          longestWaitTime: 0,
          processedToday: 0
        }
      };
    }

    // Enrichir avec les temps d'attente actuels
    const now = new Date();
    queue.drivers = queue.drivers.map(driver => {
      if (driver.status === 'waiting' && driver.checkedInAt) {
        driver.currentWaitTime = Math.round((now - new Date(driver.checkedInAt)) / 60000);
      }
      return driver;
    });

    return queue;
  }

  /**
   * Appeler le prochain chauffeur dans la file
   */
  async callNextDriver(sitePlanningId, dockId) {
    const queue = await this.getDriverQueue(sitePlanningId);

    // Trouver le prochain chauffeur en attente
    const nextDriver = queue.drivers.find(d => d.status === 'waiting');
    if (!nextDriver) {
      return null;
    }

    // Obtenir le site planning pour le nom du quai
    const sitePlanning = await this.sitePlannings.findOne({ _id: new ObjectId(sitePlanningId) });
    const dock = sitePlanning?.docks?.find(d => d.dockId === dockId);
    const dockName = dock?.name || `Quai ${dockId}`;

    // Mettre a jour le statut du chauffeur
    await this._updateQueueDriverStatus(sitePlanningId, nextDriver.rdvId, 'called', dockId);

    // Recuperer le RDV complet pour la notification
    const rdv = await this.rdvs.findOne({ _id: nextDriver.rdvId });

    // Envoyer SMS/Push notification au chauffeur
    if (rdv) {
      try {
        await this.notificationService.notifyDriverCalled(rdv, dockId, dockName);
        console.log(`[DriverCheckin] Push notification envoyee au chauffeur ${nextDriver.driverName} - Quai ${dockName}`);
      } catch (notifError) {
        console.error(`[DriverCheckin] Erreur notification chauffeur:`, notifError.message);
      }
    }

    this._emitEvent('driver.called', {
      rdvId: nextDriver.rdvId,
      dockId,
      dockName,
      driverName: nextDriver.driverName,
      carrierName: nextDriver.carrierName
    });

    return {
      rdvId: nextDriver.rdvId,
      driverName: nextDriver.driverName,
      carrierName: nextDriver.carrierName,
      vehiclePlate: nextDriver.vehiclePlate,
      dockId,
      dockName,
      notificationSent: true
    };
  }

  /**
   * Marquer un chauffeur comme absent (no-show)
   */
  async markNoShow(rdvId, userId) {
    const rdv = await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
    if (!rdv) {
      throw new Error('RDV non trouve');
    }
    if (rdv.status === RdvStatus.COMPLETED) {
      throw new Error('Le RDV est deja termine');
    }

    const now = new Date();

    await this.rdvs.updateOne(
      { _id: new ObjectId(rdvId) },
      {
        $set: {
          status: RdvStatus.NO_SHOW,
          completedAt: now,
          updatedAt: new Date()
        },
        $push: {
          statusHistory: {
            status: RdvStatus.NO_SHOW,
            changedAt: now,
            changedBy: new ObjectId(userId),
            reason: 'Absence constatee'
          }
        }
      }
    );

    // Retirer de la file d'attente
    await this._removeFromQueue(rdv.sitePlanningId, rdvId);

    // Penalite sur le score transporteur
    await this._updateCarrierScore(rdv.carrier.carrierId, DefaultConfig.scoring.noShowPenalty);

    // Liberer le creneau
    await this.db.collection('planning_slots').updateOne(
      { _id: rdv.slotId },
      {
        $pull: { reservations: { rdvId: rdv._id } },
        $inc: { reserved: -1, available: 1 },
        $set: { updatedAt: new Date() }
      }
    );

    // Envoyer notification no-show au transporteur et au site
    try {
      await this.notificationService.notifyNoShow(rdv, DefaultConfig.scoring.noShowPenalty);
      console.log(`[DriverCheckin] Notification no-show envoyee pour RDV ${rdv.rdvNumber}`);
    } catch (notifError) {
      console.error(`[DriverCheckin] Erreur notification no-show:`, notifError.message);
    }

    this._emitEvent(PlanningEvents.DRIVER_NO_SHOW, {
      rdvId,
      rdvNumber: rdv.rdvNumber,
      carrierId: rdv.carrier.carrierId,
      carrierName: rdv.carrier.carrierName
    });

    return {
      rdvId: rdv._id,
      rdvNumber: rdv.rdvNumber,
      status: RdvStatus.NO_SHOW,
      scorePenalty: DefaultConfig.scoring.noShowPenalty,
      notificationSent: true
    };
  }

  // ==========================================================================
  // GESTION DES OPERATIONS
  // ==========================================================================

  /**
   * Demarrer l'operation de chargement/dechargement
   */
  async startOperation(rdvId) {
    const rdv = await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
    if (!rdv) {
      throw new Error('RDV non trouve');
    }
    if (rdv.status !== RdvStatus.CHECKED_IN) {
      throw new Error('Le chauffeur doit etre check-in pour demarrer l\'operation');
    }

    const now = new Date();

    await this.rdvs.updateOne(
      { _id: new ObjectId(rdvId) },
      {
        $set: {
          status: RdvStatus.IN_PROGRESS,
          'operation.startedAt': now,
          updatedAt: new Date()
        },
        $push: {
          statusHistory: {
            status: RdvStatus.IN_PROGRESS,
            changedAt: now,
            reason: 'Operation demarree'
          }
        }
      }
    );

    // Mettre a jour la file d'attente
    await this._updateQueueDriverStatus(rdv.sitePlanningId, rdvId, 'at_dock');

    const eventType = rdv.flowType === 'loading'
      ? PlanningEvents.LOADING_STARTED
      : PlanningEvents.DELIVERY_STARTED;

    this._emitEvent(eventType, {
      rdvId,
      rdvNumber: rdv.rdvNumber,
      startedAt: now
    });

    return {
      rdvId: rdv._id,
      status: RdvStatus.IN_PROGRESS,
      startedAt: now
    };
  }

  /**
   * Terminer l'operation de chargement/dechargement
   */
  async completeOperation(rdvId, data = {}) {
    const rdv = await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
    if (!rdv) {
      throw new Error('RDV non trouve');
    }
    if (rdv.status !== RdvStatus.IN_PROGRESS) {
      throw new Error('L\'operation doit etre en cours pour etre terminee');
    }

    const now = new Date();
    const operationTime = rdv.operation?.startedAt
      ? Math.round((now - new Date(rdv.operation.startedAt)) / 60000)
      : 0;

    await this.rdvs.updateOne(
      { _id: new ObjectId(rdvId) },
      {
        $set: {
          'operation.completedAt': now,
          'operation.actualWeight': data.actualWeight || null,
          'operation.actualPallets': data.actualPallets || null,
          'operation.remarks': data.remarks || null,
          'operation.photos': data.photos || [],
          'operation.issues': data.issues || [],
          'checkIn.operationTime': operationTime,
          updatedAt: new Date()
        }
      }
    );

    const eventType = rdv.flowType === 'loading'
      ? PlanningEvents.LOADING_COMPLETED
      : PlanningEvents.DELIVERY_COMPLETED;

    this._emitEvent(eventType, {
      rdvId,
      rdvNumber: rdv.rdvNumber,
      completedAt: now,
      operationTime
    });

    return {
      rdvId: rdv._id,
      operationCompletedAt: now,
      operationTime,
      signatureRequired: rdv.signature?.required
    };
  }

  // ==========================================================================
  // SIGNATURE ELECTRONIQUE (eCMR)
  // ==========================================================================

  /**
   * Signer le document eCMR
   */
  async signEcmr(rdvId, data) {
    const rdv = await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
    if (!rdv) {
      throw new Error('RDV non trouve');
    }

    const now = new Date();
    const signatureId = crypto.randomUUID();

    // Creer le document eCMR
    const ecmrDocument = {
      signatureId,
      rdvId: new ObjectId(rdvId),
      transportOrderId: rdv.transportOrderId,
      organizationId: rdv.organizationId,
      carrier: rdv.carrier,
      site: rdv.site,
      slot: rdv.slot,
      cargo: rdv.cargo,
      operation: rdv.operation,
      signature: {
        signedAt: now,
        signedBy: {
          name: data.signerName,
          role: data.signerRole,
          userId: data.signerId ? new ObjectId(data.signerId) : null
        },
        signatureData: data.signatureData, // Base64 de la signature
        validated: false,
        validatedAt: null,
        validatedBy: null
      },
      documentNumber: await this._generateEcmrNumber(rdv.organizationId),
      status: 'signed',
      createdAt: now
    };

    await this.ecmrDocuments.insertOne(ecmrDocument);

    // Mettre a jour le RDV
    await this.rdvs.updateOne(
      { _id: new ObjectId(rdvId) },
      {
        $set: {
          'signature.signedAt': now,
          'signature.signedBy': {
            name: data.signerName,
            role: data.signerRole
          },
          'signature.documentId': ecmrDocument._id,
          updatedAt: new Date()
        }
      }
    );

    this._emitEvent(PlanningEvents.SIGNATURE_COMPLETED, {
      rdvId,
      rdvNumber: rdv.rdvNumber,
      signatureId,
      signedBy: data.signerName
    });

    return {
      signatureId,
      documentNumber: ecmrDocument.documentNumber,
      signedAt: now,
      signedBy: data.signerName
    };
  }

  /**
   * Valider le document eCMR
   */
  async validateEcmr(rdvId, userId) {
    const rdv = await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
    if (!rdv) {
      throw new Error('RDV non trouve');
    }
    if (!rdv.signature?.documentId) {
      throw new Error('Aucun document signe trouve');
    }

    const now = new Date();

    await this.ecmrDocuments.updateOne(
      { _id: rdv.signature.documentId },
      {
        $set: {
          'signature.validated': true,
          'signature.validatedAt': now,
          'signature.validatedBy': new ObjectId(userId),
          status: 'validated'
        }
      }
    );

    return {
      validated: true,
      validatedAt: now
    };
  }

  /**
   * Obtenir un document eCMR
   */
  async getEcmrDocument(rdvId) {
    const rdv = await this.rdvs.findOne({ _id: new ObjectId(rdvId) });
    if (!rdv || !rdv.signature?.documentId) {
      return null;
    }

    return await this.ecmrDocuments.findOne({ _id: rdv.signature.documentId });
  }

  /**
   * Historique des documents eCMR d'une commande
   */
  async getEcmrHistory(transportOrderId) {
    return await this.ecmrDocuments
      .find({ transportOrderId: new ObjectId(transportOrderId) })
      .sort({ createdAt: -1 })
      .toArray();
  }

  // ==========================================================================
  // METHODES UTILITAIRES PRIVEES
  // ==========================================================================

  /**
   * Ajouter un chauffeur a la file d'attente
   */
  async _addToQueue(rdv, sitePlanning) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);

    const driverEntry = {
      rdvId: rdv._id,
      driverId: rdv.driver?.driverId,
      driverName: rdv.driver?.name || 'Inconnu',
      carrierName: rdv.carrier.carrierName,
      vehiclePlate: rdv.driver?.vehiclePlate || 'N/A',
      rdvTime: rdv.slot.startTime,
      arrivedAt: rdv.checkIn?.arrivedAt || new Date(),
      checkedInAt: new Date(),
      priority: rdv.priority || 2,
      status: 'waiting',
      assignedDock: null,
      estimatedWaitTime: 0,
      position: 0
    };

    await this.driverQueues.updateOne(
      {
        sitePlanningId: sitePlanning._id,
        date
      },
      {
        $push: { drivers: driverEntry },
        $inc: { 'stats.totalWaiting': 1 },
        $setOnInsert: {
          siteId: sitePlanning.siteId,
          createdAt: new Date()
        },
        $set: { updatedAt: new Date() }
      },
      { upsert: true }
    );

    // Recalculer les positions
    await this._recalculateQueuePositions(sitePlanning._id, date);
  }

  /**
   * Retirer un chauffeur de la file d'attente
   */
  async _removeFromQueue(sitePlanningId, rdvId) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);

    await this.driverQueues.updateOne(
      { sitePlanningId: new ObjectId(sitePlanningId), date },
      {
        $pull: { drivers: { rdvId: new ObjectId(rdvId) } },
        $inc: { 'stats.processedToday': 1 },
        $set: { updatedAt: new Date() }
      }
    );

    await this._recalculateQueuePositions(sitePlanningId, date);
  }

  /**
   * Mettre a jour le statut d'un chauffeur dans la file
   */
  async _updateQueueDriverStatus(sitePlanningId, rdvId, status, dockId = null) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);

    const updateData = {
      'drivers.$.status': status,
      updatedAt: new Date()
    };

    if (dockId) {
      updateData['drivers.$.assignedDock'] = dockId;
    }

    await this.driverQueues.updateOne(
      {
        sitePlanningId: new ObjectId(sitePlanningId),
        date,
        'drivers.rdvId': new ObjectId(rdvId)
      },
      { $set: updateData }
    );
  }

  /**
   * Obtenir la position dans la file
   */
  async _getQueuePosition(sitePlanningId, rdvId) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);

    const queue = await this.driverQueues.findOne({
      sitePlanningId: new ObjectId(sitePlanningId),
      date
    });

    if (!queue) return 0;

    const driver = queue.drivers.find(d =>
      d.rdvId.toString() === rdvId.toString() && d.status === 'waiting'
    );

    return driver?.position || 0;
  }

  /**
   * Recalculer les positions dans la file
   */
  async _recalculateQueuePositions(sitePlanningId, date) {
    const queue = await this.driverQueues.findOne({
      sitePlanningId: new ObjectId(sitePlanningId),
      date
    });

    if (!queue) return;

    // Trier par priorite et heure d'arrivee
    const waitingDrivers = queue.drivers
      .filter(d => d.status === 'waiting')
      .sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return new Date(a.checkedInAt) - new Date(b.checkedInAt);
      });

    // Assigner les positions
    let position = 1;
    const updates = waitingDrivers.map(d => ({
      rdvId: d.rdvId,
      position: position++
    }));

    // Mettre a jour les positions
    for (const update of updates) {
      await this.driverQueues.updateOne(
        {
          sitePlanningId: new ObjectId(sitePlanningId),
          date,
          'drivers.rdvId': update.rdvId
        },
        {
          $set: {
            'drivers.$.position': update.position,
            'drivers.$.estimatedWaitTime': update.position * 15
          }
        }
      );
    }

    // Mettre a jour les stats
    const waitingCount = waitingDrivers.length;
    const waitTimes = queue.drivers
      .filter(d => d.status === 'waiting' && d.checkedInAt)
      .map(d => Math.round((new Date() - new Date(d.checkedInAt)) / 60000));

    await this.driverQueues.updateOne(
      { sitePlanningId: new ObjectId(sitePlanningId), date },
      {
        $set: {
          'stats.totalWaiting': waitingCount,
          'stats.averageWaitTime': waitTimes.length > 0
            ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length)
            : 0,
          'stats.longestWaitTime': waitTimes.length > 0
            ? Math.max(...waitTimes)
            : 0
        }
      }
    );
  }

  /**
   * Calculer la distance entre deux points (formule Haversine)
   */
  _calculateDistance(coord1, coord2) {
    if (!coord1 || !coord2 || !coord1.lat || !coord2.lat) {
      return Infinity;
    }

    const R = 6371e3; // Rayon de la Terre en metres
    const lat1 = coord1.lat * Math.PI / 180;
    const lat2 = coord2.lat * Math.PI / 180;
    const deltaLat = (coord2.lat - coord1.lat) * Math.PI / 180;
    const deltaLng = (coord2.lng - coord1.lng) * Math.PI / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance en metres
  }

  /**
   * Valider un QR code
   */
  async _validateQRCode(qrCode, rdvId) {
    if (!qrCode) return false;

    // Le QR code doit contenir l'ID du RDV et un token de validation
    try {
      const data = JSON.parse(Buffer.from(qrCode, 'base64').toString());
      return data.rdvId === rdvId.toString();
    } catch {
      return false;
    }
  }

  /**
   * Calculer le score de la visite
   */
  async _calculateVisitScore(rdv, operationTime) {
    let score = 0;

    // Ponctualite
    const scheduledTime = new Date(rdv.slot.date);
    const [hours, minutes] = rdv.slot.startTime.split(':').map(Number);
    scheduledTime.setHours(hours, minutes, 0, 0);

    const arrivedAt = new Date(rdv.checkIn?.arrivedAt || rdv.checkIn?.checkedInAt);
    const delayMinutes = Math.round((arrivedAt - scheduledTime) / 60000);

    if (delayMinutes <= 0) {
      score += DefaultConfig.scoring.onTimBonus; // A l'heure ou en avance
    } else if (delayMinutes <= 15) {
      score += 0; // Leger retard, pas de penalite
    } else {
      score += DefaultConfig.scoring.latePenalty; // Retard significant
    }

    // Duree d'operation (bonus si rapide)
    const expectedDuration = rdv.slot.duration || 60;
    if (operationTime < expectedDuration * 0.8) {
      score += 1; // Operation rapide
    }

    // Problemes signales
    if (rdv.operation?.issues?.length > 0) {
      score -= rdv.operation.issues.length;
    }

    return score;
  }

  /**
   * Mettre a jour le score du transporteur
   */
  async _updateCarrierScore(carrierId, scoreChange) {
    await this.carriers.updateOne(
      { _id: new ObjectId(carrierId) },
      {
        $inc: { score: scoreChange },
        $set: { updatedAt: new Date() }
      }
    );
  }

  /**
   * Generer un numero de document eCMR
   */
  async _generateEcmrNumber(organizationId) {
    const date = new Date();
    const prefix = 'ECMR';
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');

    const count = await this.ecmrDocuments.countDocuments({
      organizationId: new ObjectId(organizationId),
      createdAt: {
        $gte: new Date(date.getFullYear(), date.getMonth(), 1),
        $lt: new Date(date.getFullYear(), date.getMonth() + 1, 1)
      }
    });

    const sequence = String(count + 1).padStart(5, '0');
    return `${prefix}${year}${month}-${sequence}`;
  }

  /**
   * Emettre un evenement
   */
  _emitEvent(eventType, data) {
    if (this.eventEmitter) {
      this.eventEmitter.emit(eventType, {
        event: eventType,
        timestamp: new Date(),
        data
      });
    }
    console.log(`[DriverCheckin Event] ${eventType}:`, JSON.stringify(data));
  }
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports = { DriverCheckinService };
