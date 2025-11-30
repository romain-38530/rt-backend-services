/**
 * Storage Market Routes - PROGRESSIVE VERSION
 * Phase 1: Routes de base sans IA
 */

const express = require('express');
const {
  StorageTypes,
  VolumeUnits,
  PublicationStatus,
  PublicationTypes,
  TemperatureConstraints,
  Certifications,
  Services,
  ResponseStatus,
  AIRecommendation,
  ImportanceLevel,
  DefaultConfig
} = require('./storage-market-models');

function configureStorageMarketRoutes(app, db, authenticateToken) {
  console.log('[Storage Market] Routes progressives configurées (Phase 1: Base sans IA)');

  // ============================================================================
  // ROUTE TEST
  // ============================================================================
  app.get('/api/storage-market/test', (req, res) => {
    res.json({
      success: true,
      message: 'Storage Market Phase 1 active',
      phase: 'Base routes without AI'
    });
  });

  // ============================================================================
  // CONSTANTES
  // ============================================================================
  app.get('/api/storage-market/constants', (req, res) => {
    res.json({
      success: true,
      data: {
        storageTypes: StorageTypes,
        volumeUnits: VolumeUnits,
        publicationStatus: PublicationStatus,
        publicationTypes: PublicationTypes,
        temperatureConstraints: TemperatureConstraints,
        certifications: Certifications,
        services: Services,
        responseStatus: ResponseStatus,
        aiRecommendation: AIRecommendation,
        importanceLevel: ImportanceLevel,
        defaultConfig: DefaultConfig
      }
    });
  });

  // ============================================================================
  // GESTION DES BESOINS DE STOCKAGE (CRUD de base)
  // ============================================================================

  /**
   * POST /api/storage-market/needs/create
   * Crée un nouveau besoin de stockage
   */
  app.post('/api/storage-market/needs/create', authenticateToken, async (req, res) => {
    try {
      const {
        storageType,
        volume,
        duration,
        location,
        constraints = {},
        infrastructure = {},
        activity = {},
        selectionCriteria = DefaultConfig.criteriaWeights
      } = req.body;

      const needId = `NEED-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const need = {
        needId,
        organizationId: req.user.organization,
        createdBy: req.user.userId,
        storageType,
        volume,
        duration,
        location,
        constraints,
        infrastructure,
        activity,
        selectionCriteria,
        status: PublicationStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await db.collection('storage_market_needs').insertOne(need);

      res.status(201).json({
        success: true,
        data: { needId, need }
      });

    } catch (error) {
      console.error('❌ Erreur création besoin:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la création du besoin'
      });
    }
  });

  /**
   * GET /api/storage-market/needs
   * Liste tous les besoins de l'organisation
   */
  app.get('/api/storage-market/needs', authenticateToken, async (req, res) => {
    try {
      const { status, limit = 50, offset = 0 } = req.query;

      const query = { organizationId: req.user.organization };
      if (status) {
        query.status = status;
      }

      const needs = await db.collection('storage_market_needs')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(parseInt(offset))
        .limit(parseInt(limit))
        .toArray();

      const total = await db.collection('storage_market_needs').countDocuments(query);

      res.json({
        success: true,
        data: {
          needs,
          pagination: {
            total,
            limit: parseInt(limit),
            offset: parseInt(offset)
          }
        }
      });

    } catch (error) {
      console.error('❌ Erreur liste besoins:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération des besoins'
      });
    }
  });

  /**
   * GET /api/storage-market/needs/:needId
   * Récupère un besoin spécifique
   */
  app.get('/api/storage-market/needs/:needId', authenticateToken, async (req, res) => {
    try {
      const { needId } = req.params;

      const need = await db.collection('storage_market_needs').findOne({
        needId,
        organizationId: req.user.organization
      });

      if (!need) {
        return res.status(404).json({
          success: false,
          error: 'Besoin non trouvé'
        });
      }

      res.json({
        success: true,
        data: need
      });

    } catch (error) {
      console.error('❌ Erreur récupération besoin:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération du besoin'
      });
    }
  });

  // ============================================================================
  // GESTION DES CAPACITÉS LOGISTIQUES
  // ============================================================================

  /**
   * POST /api/storage-market/logistician-capacity
   * Enregistre ou met à jour la capacité de stockage d'un logisticien
   */
  app.post('/api/storage-market/logistician-capacity', authenticateToken, async (req, res) => {
    try {
      const {
        warehouseId,
        warehouseName,
        location,
        totalCapacity,
        availableCapacity,
        storageTypes,
        priceRanges,
        certifications = [],
        services = [],
        infrastructure = {}
      } = req.body;

      const capacityId = warehouseId || `CAP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const capacity = {
        capacityId,
        logisticianId: req.user.organization,
        warehouseId: capacityId,
        warehouseName,
        location,
        totalCapacity,
        availableCapacity,
        storageTypes,
        priceRanges,
        certifications,
        services,
        infrastructure,
        isActive: true,
        lastUpdated: new Date()
      };

      await db.collection('storage_market_capacities').updateOne(
        { capacityId },
        { $set: capacity },
        { upsert: true }
      );

      res.status(201).json({
        success: true,
        data: { capacityId, capacity }
      });

    } catch (error) {
      console.error('❌ Erreur enregistrement capacité:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de l\'enregistrement de la capacité'
      });
    }
  });

  console.log('[Storage Market] ✅ Routes de base configurées');
}

module.exports = { configureStorageMarketRoutes };
