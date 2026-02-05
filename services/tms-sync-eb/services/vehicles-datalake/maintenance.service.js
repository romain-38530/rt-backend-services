/**
 * Vehicle Maintenance Service
 *
 * Gestion des entretiens et pannes véhicules:
 * - Création/suivi des entretiens planifiés
 * - Gestion des pannes
 * - Upload factures fournisseurs avec OCR
 * - Calcul des coûts et heures de travail
 * - Alertes d'entretien
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const path = require('path');

const InvoiceParser = require('./ocr/invoice.parser');
const {
  Vehicle,
  VehicleMaintenance,
  VehicleBreakdown,
  VehicleInvoice,
  VehicleMileage,
} = require('../../models/vehicles-datalake');

class VehicleMaintenanceService {
  constructor(config = {}) {
    this.region = config.region || process.env.AWS_REGION || 'eu-west-3';
    this.bucket = config.bucket || process.env.S3_INVOICES_BUCKET || 'rt-vehicle-invoices';

    this.s3Client = new S3Client({
      region: this.region,
      credentials: config.credentials,
    });

    this.invoiceParser = new InvoiceParser(config);
  }

  // ==========================================
  // GESTION DES ENTRETIENS
  // ==========================================

  /**
   * Crée un nouvel entretien
   */
  async createMaintenance(data) {
    const {
      vehicleId,
      licensePlate,
      maintenanceType,
      description,
      scheduledDate,
      scheduledMileage,
      organizationId,
      createdBy,
      estimatedCost,
      supplier,
      isRecurring,
      recurringInterval,
    } = data;

    // Récupérer le véhicule
    const vehicle = await this.getVehicle(vehicleId, licensePlate, organizationId);
    if (!vehicle) {
      throw new Error('Véhicule non trouvé');
    }

    const maintenance = new VehicleMaintenance({
      vehicleId: vehicle._id,
      licensePlate: vehicle.licensePlate,
      maintenanceType,
      description,
      status: 'scheduled',
      scheduledDate,
      scheduledMileage,
      estimatedCost,
      supplier,
      isRecurring,
      recurringInterval,
      organizationId,
      createdBy,
    });

    await maintenance.save();

    // Mettre à jour le véhicule avec la prochaine maintenance
    await this.updateVehicleNextMaintenance(vehicle._id);

    console.log(`[MAINTENANCE-SERVICE] Entretien créé: ${maintenance._id} pour ${vehicle.licensePlate}`);

    return maintenance;
  }

  /**
   * Démarre un entretien (passage en cours)
   */
  async startMaintenance(maintenanceId, data = {}) {
    const { startedBy, notes, actualMileage } = data;

    const maintenance = await VehicleMaintenance.findByIdAndUpdate(
      maintenanceId,
      {
        $set: {
          status: 'in_progress',
          startDate: new Date(),
          actualMileage: actualMileage,
          notes: notes,
          lastModifiedBy: startedBy,
        },
      },
      { new: true }
    );

    if (!maintenance) {
      throw new Error('Entretien non trouvé');
    }

    // Mettre à jour le statut du véhicule
    await Vehicle.findByIdAndUpdate(maintenance.vehicleId, {
      $set: { status: 'maintenance' },
    });

    return maintenance;
  }

  /**
   * Termine un entretien
   */
  async completeMaintenance(maintenanceId, data) {
    const {
      completedBy,
      actualMileage,
      laborHours,
      laborCost,
      partsCost,
      otherCost,
      partsReplaced,
      technicianNotes,
      nextMaintenanceMileage,
      nextMaintenanceDate,
    } = data;

    // Calculer le coût total
    const totalCost = (laborCost || 0) + (partsCost || 0) + (otherCost || 0);

    const maintenance = await VehicleMaintenance.findByIdAndUpdate(
      maintenanceId,
      {
        $set: {
          status: 'completed',
          completedDate: new Date(),
          actualMileage,
          laborHours,
          laborCost,
          partsCost,
          otherCost,
          totalCost,
          partsReplaced: partsReplaced || [],
          technicianNotes,
          nextMaintenanceMileage,
          nextMaintenanceDate,
          lastModifiedBy: completedBy,
        },
      },
      { new: true }
    );

    if (!maintenance) {
      throw new Error('Entretien non trouvé');
    }

    // Remettre le véhicule en service
    await Vehicle.findByIdAndUpdate(maintenance.vehicleId, {
      $set: { status: 'active' },
    });

    // Enregistrer le kilométrage si fourni
    if (actualMileage) {
      await this.recordMileage(maintenance.vehicleId, actualMileage, 'maintenance', maintenance.organizationId);
    }

    // Créer l'entretien récurrent suivant si applicable
    if (maintenance.isRecurring && maintenance.recurringInterval) {
      await this.createRecurringMaintenance(maintenance);
    }

    // Mettre à jour les stats du véhicule
    await this.updateVehicleMaintenanceStats(maintenance.vehicleId);
    await this.updateVehicleNextMaintenance(maintenance.vehicleId);

    console.log(`[MAINTENANCE-SERVICE] Entretien terminé: ${maintenanceId}, coût: ${totalCost}€`);

    return maintenance;
  }

  /**
   * Crée la prochaine occurrence d'un entretien récurrent
   */
  async createRecurringMaintenance(completedMaintenance) {
    const { km, months } = completedMaintenance.recurringInterval;

    let nextDate = null;
    let nextMileage = null;

    if (months) {
      nextDate = new Date();
      nextDate.setMonth(nextDate.getMonth() + months);
    }

    if (km && completedMaintenance.actualMileage) {
      nextMileage = completedMaintenance.actualMileage + km;
    }

    const nextMaintenance = new VehicleMaintenance({
      vehicleId: completedMaintenance.vehicleId,
      licensePlate: completedMaintenance.licensePlate,
      maintenanceType: completedMaintenance.maintenanceType,
      description: completedMaintenance.description,
      status: 'scheduled',
      scheduledDate: nextDate,
      scheduledMileage: nextMileage,
      isRecurring: true,
      recurringInterval: completedMaintenance.recurringInterval,
      supplier: completedMaintenance.supplier,
      organizationId: completedMaintenance.organizationId,
      previousMaintenanceId: completedMaintenance._id,
    });

    await nextMaintenance.save();
    console.log(`[MAINTENANCE-SERVICE] Entretien récurrent créé pour ${completedMaintenance.licensePlate}`);
  }

  /**
   * Récupère les entretiens d'un véhicule
   */
  async getVehicleMaintenances(vehicleId, options = {}) {
    const { status, type, from, to, limit = 50 } = options;

    const query = { vehicleId };
    if (status) query.status = status;
    if (type) query.maintenanceType = type;
    if (from || to) {
      query.scheduledDate = {};
      if (from) query.scheduledDate.$gte = new Date(from);
      if (to) query.scheduledDate.$lte = new Date(to);
    }

    return VehicleMaintenance.find(query)
      .sort({ scheduledDate: -1 })
      .limit(limit);
  }

  /**
   * Récupère les entretiens en retard
   */
  async getOverdueMaintenances(organizationId) {
    return VehicleMaintenance.findOverdue(organizationId);
  }

  /**
   * Récupère les entretiens à venir
   */
  async getUpcomingMaintenances(organizationId, daysAhead = 30) {
    return VehicleMaintenance.findUpcoming(daysAhead, organizationId);
  }

  // ==========================================
  // GESTION DES PANNES
  // ==========================================

  /**
   * Déclare une nouvelle panne
   */
  async reportBreakdown(data) {
    const {
      vehicleId,
      licensePlate,
      breakdownType,
      severity,
      description,
      location,
      reportedBy,
      organizationId,
      mileageAtBreakdown,
      towingRequired,
    } = data;

    // Récupérer le véhicule
    const vehicle = await this.getVehicle(vehicleId, licensePlate, organizationId);
    if (!vehicle) {
      throw new Error('Véhicule non trouvé');
    }

    const breakdown = new VehicleBreakdown({
      vehicleId: vehicle._id,
      licensePlate: vehicle.licensePlate,
      breakdownType,
      severity: severity || 'medium',
      description,
      status: 'reported',
      reportedDate: new Date(),
      location,
      reportedBy,
      mileageAtBreakdown: mileageAtBreakdown || vehicle.currentMileage,
      towingRequired,
      organizationId,
    });

    await breakdown.save();

    // Mettre le véhicule hors service si panne critique
    if (severity === 'critical' || severity === 'immobilizing') {
      await Vehicle.findByIdAndUpdate(vehicle._id, {
        $set: { status: 'hors_service' },
      });
    }

    console.log(`[MAINTENANCE-SERVICE] Panne déclarée: ${breakdown._id} pour ${vehicle.licensePlate}`);

    return breakdown;
  }

  /**
   * Commence la réparation d'une panne
   */
  async startBreakdownRepair(breakdownId, data = {}) {
    const { repairedBy, supplier, estimatedCompletion, diagnosis } = data;

    const breakdown = await VehicleBreakdown.findByIdAndUpdate(
      breakdownId,
      {
        $set: {
          status: 'in_repair',
          repairStartDate: new Date(),
          supplier,
          estimatedCompletion,
          diagnosis,
          repairedBy,
        },
      },
      { new: true }
    );

    if (!breakdown) {
      throw new Error('Panne non trouvée');
    }

    // Mettre le véhicule en maintenance
    await Vehicle.findByIdAndUpdate(breakdown.vehicleId, {
      $set: { status: 'maintenance' },
    });

    return breakdown;
  }

  /**
   * Termine la réparation d'une panne
   */
  async completeBreakdownRepair(breakdownId, data) {
    const {
      completedBy,
      repairDescription,
      laborHours,
      laborCost,
      partsCost,
      towingCost,
      otherCost,
      partsReplaced,
      warrantyApplied,
      technicianNotes,
    } = data;

    // Calculer les coûts
    const totalCost = (laborCost || 0) + (partsCost || 0) + (towingCost || 0) + (otherCost || 0);

    const breakdown = await VehicleBreakdown.findById(breakdownId);
    if (!breakdown) {
      throw new Error('Panne non trouvée');
    }

    // Calculer le temps d'immobilisation
    const downtimeHours = breakdown.repairStartDate
      ? Math.round((Date.now() - breakdown.repairStartDate.getTime()) / (1000 * 60 * 60))
      : null;

    await VehicleBreakdown.findByIdAndUpdate(breakdownId, {
      $set: {
        status: 'resolved',
        repairEndDate: new Date(),
        repairDescription,
        laborHours,
        laborCost,
        partsCost,
        towingCost,
        otherCost,
        totalCost,
        partsReplaced: partsReplaced || [],
        warrantyApplied,
        technicianNotes,
        downtimeHours,
        lastModifiedBy: completedBy,
      },
    });

    // Remettre le véhicule en service
    await Vehicle.findByIdAndUpdate(breakdown.vehicleId, {
      $set: { status: 'active' },
    });

    // Mettre à jour les stats
    await this.updateVehicleBreakdownStats(breakdown.vehicleId);

    console.log(`[MAINTENANCE-SERVICE] Panne réparée: ${breakdownId}, coût: ${totalCost}€, immobilisation: ${downtimeHours}h`);

    return VehicleBreakdown.findById(breakdownId);
  }

  /**
   * Récupère les pannes d'un véhicule
   */
  async getVehicleBreakdowns(vehicleId, options = {}) {
    const { status, type, from, to, limit = 50 } = options;

    const query = { vehicleId };
    if (status) query.status = status;
    if (type) query.breakdownType = type;
    if (from || to) {
      query.reportedDate = {};
      if (from) query.reportedDate.$gte = new Date(from);
      if (to) query.reportedDate.$lte = new Date(to);
    }

    return VehicleBreakdown.find(query)
      .sort({ reportedDate: -1 })
      .limit(limit);
  }

  /**
   * Récupère les pannes actives
   */
  async getActiveBreakdowns(organizationId) {
    return VehicleBreakdown.findActive(organizationId);
  }

  // ==========================================
  // GESTION DES FACTURES FOURNISSEURS
  // ==========================================

  /**
   * Upload une facture fournisseur avec OCR
   */
  async uploadSupplierInvoice(file, metadata) {
    const {
      maintenanceId,
      breakdownId,
      vehicleId,
      organizationId,
      uploadedBy,
    } = metadata;

    console.log(`[MAINTENANCE-SERVICE] Upload facture fournisseur`);

    // 1. Générer le chemin S3
    const fileExt = path.extname(file.originalname || file.name || '.pdf');
    const fileName = `invoice_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${fileExt}`;
    const s3Key = `${organizationId}/invoices/${fileName}`;

    // 2. Upload vers S3
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      Body: file.buffer || file,
      ContentType: file.mimetype || 'application/pdf',
      Metadata: {
        'organization-id': organizationId,
        'maintenance-id': maintenanceId?.toString() || '',
        'breakdown-id': breakdownId?.toString() || '',
        'uploaded-by': uploadedBy || '',
      },
    }));

    const fileUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${s3Key}`;

    // 3. Créer l'entrée en base
    const invoice = new VehicleInvoice({
      vehicleId,
      maintenanceId,
      breakdownId,
      fileName: file.originalname || fileName,
      fileUrl,
      fileSize: file.size || file.buffer?.length,
      mimeType: file.mimetype || 'application/pdf',
      s3Key,
      s3Bucket: this.bucket,
      status: 'uploaded',
      organizationId,
      uploadedBy,
      uploadedAt: new Date(),
    });

    await invoice.save();

    // 4. Lancer l'OCR en arrière-plan
    this.processInvoiceOcrAsync(invoice._id, file.buffer || file, organizationId);

    return {
      invoiceId: invoice._id,
      fileUrl,
      status: 'uploaded',
      ocrStatus: 'pending',
    };
  }

  /**
   * Traite l'OCR d'une facture de manière asynchrone
   */
  async processInvoiceOcrAsync(invoiceId, buffer, organizationId) {
    try {
      console.log(`[MAINTENANCE-SERVICE] Démarrage OCR facture ${invoiceId}`);

      // Parser la facture
      const parsedData = await this.invoiceParser.parseFromBuffer(buffer);

      // Formatter pour la base de données
      const dbData = this.invoiceParser.formatForDatabase(parsedData);

      // Mettre à jour la facture
      await VehicleInvoice.findByIdAndUpdate(invoiceId, {
        $set: {
          ocrProcessed: true,
          ocrProcessedAt: new Date(),
          ocrConfidence: dbData.extractionConfidence,
          extractedData: dbData,
          extractedLicensePlate: dbData.extractedLicensePlate,
          extractedInvoiceNumber: dbData.extractedInvoiceNumber,
          extractedDate: dbData.extractedDate,
          extractedAmountHt: dbData.extractedAmountHt,
          extractedAmountTtc: dbData.extractedAmountTtc,
          invoiceCategory: dbData.invoiceCategory,
        },
      });

      // Tenter de lier au véhicule par immatriculation
      if (dbData.extractedLicensePlate) {
        await this.linkInvoiceToVehicle(invoiceId, dbData.extractedLicensePlate, organizationId);
      }

      console.log(`[MAINTENANCE-SERVICE] OCR facture terminé: ${invoiceId}`, {
        licensePlate: dbData.extractedLicensePlate,
        amountTtc: dbData.extractedAmountTtc,
        confidence: dbData.extractionConfidence,
      });

    } catch (error) {
      console.error(`[MAINTENANCE-SERVICE] Erreur OCR facture ${invoiceId}:`, error.message);

      await VehicleInvoice.findByIdAndUpdate(invoiceId, {
        $set: {
          ocrProcessed: true,
          ocrProcessedAt: new Date(),
          ocrError: error.message,
        },
      });
    }
  }

  /**
   * Lie une facture à un véhicule par immatriculation
   */
  async linkInvoiceToVehicle(invoiceId, licensePlate, organizationId) {
    const normalizedPlate = licensePlate.replace(/[^A-Z0-9]/gi, '').toUpperCase();

    const vehicle = await Vehicle.findOne({
      organizationId,
      licensePlate: normalizedPlate,
    });

    if (vehicle) {
      await VehicleInvoice.findByIdAndUpdate(invoiceId, {
        $set: {
          vehicleId: vehicle._id,
          licensePlate: normalizedPlate,
          vehicleMatchConfidence: 0.9,
          vehicleMatchMethod: 'ocr_license_plate',
        },
      });

      console.log(`[MAINTENANCE-SERVICE] Facture ${invoiceId} liée au véhicule ${normalizedPlate}`);
      return vehicle;
    }

    return null;
  }

  /**
   * Valide manuellement une facture OCR
   */
  async validateInvoice(invoiceId, validationData) {
    const {
      validatedBy,
      vehicleId,
      licensePlate,
      invoiceNumber,
      invoiceDate,
      amountHt,
      amountTtc,
      supplierId,
      supplierName,
      notes,
    } = validationData;

    return VehicleInvoice.findByIdAndUpdate(
      invoiceId,
      {
        $set: {
          status: 'validated',
          isValidated: true,
          validatedBy,
          validatedAt: new Date(),
          vehicleId,
          licensePlate,
          invoiceNumber: invoiceNumber,
          invoiceDate,
          amountHt,
          amountTtc,
          supplierId,
          supplierName,
          validationNotes: notes,
        },
      },
      { new: true }
    );
  }

  /**
   * Lie une facture à un entretien ou une panne
   */
  async linkInvoiceToWork(invoiceId, data) {
    const { maintenanceId, breakdownId } = data;

    const update = {};
    if (maintenanceId) update.maintenanceId = maintenanceId;
    if (breakdownId) update.breakdownId = breakdownId;

    const invoice = await VehicleInvoice.findByIdAndUpdate(
      invoiceId,
      { $set: update },
      { new: true }
    );

    // Mettre à jour les coûts de l'entretien/panne
    if (maintenanceId && invoice.amountTtc) {
      await this.updateMaintenanceCosts(maintenanceId);
    }
    if (breakdownId && invoice.amountTtc) {
      await this.updateBreakdownCosts(breakdownId);
    }

    return invoice;
  }

  /**
   * Met à jour les coûts d'un entretien depuis les factures liées
   */
  async updateMaintenanceCosts(maintenanceId) {
    const invoices = await VehicleInvoice.find({
      maintenanceId,
      isValidated: true,
    });

    const totalFromInvoices = invoices.reduce((sum, inv) => sum + (inv.amountTtc || 0), 0);

    await VehicleMaintenance.findByIdAndUpdate(maintenanceId, {
      $set: { 'linkedInvoices.totalAmount': totalFromInvoices },
      $addToSet: { 'linkedInvoices.invoiceIds': { $each: invoices.map(i => i._id) } },
    });
  }

  /**
   * Met à jour les coûts d'une panne depuis les factures liées
   */
  async updateBreakdownCosts(breakdownId) {
    const invoices = await VehicleInvoice.find({
      breakdownId,
      isValidated: true,
    });

    const totalFromInvoices = invoices.reduce((sum, inv) => sum + (inv.amountTtc || 0), 0);

    await VehicleBreakdown.findByIdAndUpdate(breakdownId, {
      $set: { 'linkedInvoices.totalAmount': totalFromInvoices },
      $addToSet: { 'linkedInvoices.invoiceIds': { $each: invoices.map(i => i._id) } },
    });
  }

  // ==========================================
  // STATISTIQUES ET RAPPORTS
  // ==========================================

  /**
   * Calcule les statistiques de maintenance d'un véhicule
   */
  async getVehicleMaintenanceStats(vehicleId) {
    const [maintenances, breakdowns, invoices] = await Promise.all([
      VehicleMaintenance.find({ vehicleId }),
      VehicleBreakdown.find({ vehicleId }),
      VehicleInvoice.find({ vehicleId, isValidated: true }),
    ]);

    const completedMaintenances = maintenances.filter(m => m.status === 'completed');
    const resolvedBreakdowns = breakdowns.filter(b => b.status === 'resolved');

    return {
      maintenance: {
        total: maintenances.length,
        completed: completedMaintenances.length,
        scheduled: maintenances.filter(m => m.status === 'scheduled').length,
        inProgress: maintenances.filter(m => m.status === 'in_progress').length,
        totalCost: completedMaintenances.reduce((sum, m) => sum + (m.totalCost || 0), 0),
        totalLaborHours: completedMaintenances.reduce((sum, m) => sum + (m.laborHours || 0), 0),
      },
      breakdowns: {
        total: breakdowns.length,
        resolved: resolvedBreakdowns.length,
        active: breakdowns.filter(b => ['reported', 'in_repair'].includes(b.status)).length,
        totalCost: resolvedBreakdowns.reduce((sum, b) => sum + (b.totalCost || 0), 0),
        totalDowntimeHours: resolvedBreakdowns.reduce((sum, b) => sum + (b.downtimeHours || 0), 0),
      },
      invoices: {
        total: invoices.length,
        totalAmount: invoices.reduce((sum, i) => sum + (i.amountTtc || 0), 0),
      },
      costs: {
        totalMaintenance: completedMaintenances.reduce((sum, m) => sum + (m.totalCost || 0), 0),
        totalBreakdowns: resolvedBreakdowns.reduce((sum, b) => sum + (b.totalCost || 0), 0),
        grandTotal: (
          completedMaintenances.reduce((sum, m) => sum + (m.totalCost || 0), 0) +
          resolvedBreakdowns.reduce((sum, b) => sum + (b.totalCost || 0), 0)
        ),
      },
    };
  }

  /**
   * Récupère les coûts de flotte par période
   */
  async getFleetCosts(organizationId, options = {}) {
    const { from, to, groupBy = 'month' } = options;

    const matchStage = { organizationId };
    if (from || to) {
      matchStage.completedDate = {};
      if (from) matchStage.completedDate.$gte = new Date(from);
      if (to) matchStage.completedDate.$lte = new Date(to);
    }

    const groupId = groupBy === 'month'
      ? { year: { $year: '$completedDate' }, month: { $month: '$completedDate' } }
      : { year: { $year: '$completedDate' } };

    const [maintenanceCosts, breakdownCosts] = await Promise.all([
      VehicleMaintenance.aggregate([
        { $match: { ...matchStage, status: 'completed' } },
        {
          $group: {
            _id: groupId,
            totalCost: { $sum: '$totalCost' },
            laborCost: { $sum: '$laborCost' },
            partsCost: { $sum: '$partsCost' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      VehicleBreakdown.aggregate([
        { $match: { ...matchStage, status: 'resolved' } },
        {
          $group: {
            _id: groupId,
            totalCost: { $sum: '$totalCost' },
            laborCost: { $sum: '$laborCost' },
            partsCost: { $sum: '$partsCost' },
            towingCost: { $sum: '$towingCost' },
            count: { $sum: 1 },
            downtimeHours: { $sum: '$downtimeHours' },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);

    return {
      maintenance: maintenanceCosts,
      breakdowns: breakdownCosts,
    };
  }

  // ==========================================
  // UTILITAIRES
  // ==========================================

  async getVehicle(vehicleId, licensePlate, organizationId) {
    if (vehicleId) {
      return Vehicle.findById(vehicleId);
    }

    if (licensePlate) {
      const normalized = licensePlate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      return Vehicle.findOne({ organizationId, licensePlate: normalized });
    }

    return null;
  }

  async recordMileage(vehicleId, mileage, source, organizationId) {
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) return;

    await VehicleMileage.create({
      vehicleId,
      licensePlate: vehicle.licensePlate,
      mileage,
      previousMileage: vehicle.currentMileage,
      source,
      context: source,
      organizationId,
      recordedAt: new Date(),
    });

    await Vehicle.findByIdAndUpdate(vehicleId, {
      $set: {
        currentMileage: mileage,
        mileageUpdatedAt: new Date(),
        mileageSource: source,
      },
    });
  }

  async updateVehicleNextMaintenance(vehicleId) {
    const nextMaintenance = await VehicleMaintenance.findOne({
      vehicleId,
      status: 'scheduled',
    }).sort({ scheduledDate: 1 });

    const update = nextMaintenance
      ? {
          'maintenance.nextScheduledDate': nextMaintenance.scheduledDate,
          'maintenance.nextScheduledMileage': nextMaintenance.scheduledMileage,
          'maintenance.nextMaintenanceType': nextMaintenance.maintenanceType,
        }
      : {
          'maintenance.nextScheduledDate': null,
          'maintenance.nextScheduledMileage': null,
          'maintenance.nextMaintenanceType': null,
        };

    await Vehicle.findByIdAndUpdate(vehicleId, { $set: update });
  }

  async updateVehicleMaintenanceStats(vehicleId) {
    const stats = await this.getVehicleMaintenanceStats(vehicleId);

    await Vehicle.findByIdAndUpdate(vehicleId, {
      $set: {
        'stats.totalMaintenanceCost': stats.costs.totalMaintenance,
        'stats.totalBreakdownCost': stats.costs.totalBreakdowns,
        'stats.breakdownCount': stats.breakdowns.total,
        'stats.maintenanceCount': stats.maintenance.total,
      },
    });
  }

  async updateVehicleBreakdownStats(vehicleId) {
    await this.updateVehicleMaintenanceStats(vehicleId);
  }
}

module.exports = VehicleMaintenanceService;
