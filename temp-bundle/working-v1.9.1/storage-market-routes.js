/**
 * ============================================================================
 * Storage Market (Bourse de Stockage) - Routes API
 * ============================================================================
 * Routes pour la plateforme de mise en relation industriels/logisticiens
 * Avec assistance IA pour rédaction, uniformisation et analyse
 * ============================================================================
 */

const express = require('express');
// Lazy require pour éviter le chargement au démarrage
let StorageMarketAIEnhancement = null;

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

// Instance du service IA (lazy initialization + lazy require)
let storageMarketAI = null;
function getStorageMarketAI() {
  if (!storageMarketAI) {
    if (!StorageMarketAIEnhancement) {
      const module = require('./storage-market-ai-enhancement');
      StorageMarketAIEnhancement = module.StorageMarketAIEnhancement;
    }
    storageMarketAI = new StorageMarketAIEnhancement();
  }
  return storageMarketAI;
}

/**
 * Configure les routes Storage Market
 * @param {Express.Application} app - L'application Express
 * @param {Db} db - La connexion MongoDB
 * @param {Function} authenticateToken - Middleware d'authentification
 */
function configureStorageMarketRoutes(app, db, authenticateToken) {

  // ============================================================================
  // ROUTES GESTION DES BESOINS DE STOCKAGE
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
        constraints,
        infrastructure,
        activity,
        budget,
        publicationType,
        referencedLogisticians,
        documents
      } = req.body;

      if (!storageType || !volume || !duration || !location) {
        return res.status(400).json({
          success: false,
          error: 'storageType, volume, duration et location requis'
        });
      }

      const needId = `STM-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

      const storageNeed = {
        needId,
        organizationId: req.user.organizationId,
        createdBy: req.user.userId,
        status: PublicationStatus.DRAFT,
        publicationType: publicationType || PublicationTypes.GLOBAL_MARKET,

        storageType,
        volume,
        duration,
        location,
        constraints: constraints || {},
        infrastructure: infrastructure || {},
        activity: activity || {},
        budget: budget || {},

        selectionCriteria: {
          priceWeight: budget?.priceWeight || DefaultConfig.criteriaWeights.price,
          proximityWeight: budget?.proximityWeight || DefaultConfig.criteriaWeights.proximity,
          qualityWeight: budget?.qualityWeight || DefaultConfig.criteriaWeights.quality,
          servicesWeight: budget?.servicesWeight || DefaultConfig.criteriaWeights.services
        },

        rfp: {
          original: null,
          aiGenerated: null,
          standardized: null,
          finalVersion: null
        },

        documents: documents || [],
        referencedLogisticians: referencedLogisticians || [],

        createdAt: new Date(),
        updatedAt: new Date()
      };

      await db.collection('storage_market_needs').insertOne(storageNeed);

      res.status(201).json({
        success: true,
        message: 'Besoin de stockage créé',
        data: {
          needId,
          status: storageNeed.status
        }
      });

    } catch (error) {
      console.error('[Storage Market] Erreur create need:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/storage-market/needs
   * Liste les besoins de stockage de l'organisation
   */
  app.get('/api/storage-market/needs', authenticateToken, async (req, res) => {
    try {
      const { status, limit = 50 } = req.query;

      const query = { organizationId: req.user.organizationId };
      if (status) {
        query.status = status;
      }

      const needs = await db.collection('storage_market_needs')
        .find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .toArray();

      res.json({
        success: true,
        data: {
          count: needs.length,
          needs
        }
      });

    } catch (error) {
      console.error('[Storage Market] Erreur list needs:', error);
      res.status(500).json({
        success: false,
        error: error.message
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

      const need = await db.collection('storage_market_needs').findOne({ needId });

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
      console.error('[Storage Market] Erreur get need:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // ROUTES IA - ASSISTANCE RÉDACTION APPELS D'OFFRES
  // ============================================================================

  /**
   * POST /api/storage-market/ai/generate-rfp
   * Génère un cahier des charges avec assistance IA
   */
  app.post('/api/storage-market/ai/generate-rfp', authenticateToken, async (req, res) => {
    try {
      const { needId, needDetails, companyContext } = req.body;

      if (!needId || !needDetails) {
        return res.status(400).json({
          success: false,
          error: 'needId et needDetails requis'
        });
      }

      // Générer le RFP avec Claude
      const result = await getStorageMarketAI().generateStorageRFP(needDetails, companyContext || {});

      if (!result.generated) {
        return res.status(503).json({
          success: false,
          error: 'Service IA non disponible',
          fallback: true
        });
      }

      // Sauvegarder le RFP généré
      await db.collection('storage_market_needs').updateOne(
        { needId },
        {
          $set: {
            'rfp.aiGenerated': result.rfp,
            'rfp.generatedAt': new Date(),
            'updatedAt': new Date()
          }
        }
      );

      res.json({
        success: true,
        data: {
          rfp: result.rfp,
          tokensUsed: result.tokensUsed
        }
      });

    } catch (error) {
      console.error('[Storage Market AI] Erreur generate-rfp:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/storage-market/ai/standardize-rfp
   * Uniformise et améliore un cahier des charges existant
   */
  app.post('/api/storage-market/ai/standardize-rfp', authenticateToken, async (req, res) => {
    try {
      const { needId, existingRFP, needDetails } = req.body;

      if (!needId || !existingRFP) {
        return res.status(400).json({
          success: false,
          error: 'needId et existingRFP requis'
        });
      }

      // Standardiser le RFP avec Claude
      const result = await getStorageMarketAI().standardizeStorageRFP(existingRFP, needDetails || {});

      if (!result.standardized) {
        return res.status(503).json({
          success: false,
          error: 'Service IA non disponible',
          fallback: true
        });
      }

      // Sauvegarder le RFP standardisé
      await db.collection('storage_market_needs').updateOne(
        { needId },
        {
          $set: {
            'rfp.original': existingRFP,
            'rfp.standardized': result.rfp,
            'rfp.standardizedAt': new Date(),
            'updatedAt': new Date()
          }
        }
      );

      res.json({
        success: true,
        data: {
          rfp: result.rfp,
          tokensUsed: result.tokensUsed
        }
      });

    } catch (error) {
      console.error('[Storage Market AI] Erreur standardize-rfp:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // ROUTES IA - ANALYSE DES RÉPONSES LOGISTICIENS
  // ============================================================================

  /**
   * POST /api/storage-market/ai/analyze-responses
   * Analyse intelligente des réponses des logisticiens
   */
  app.post('/api/storage-market/ai/analyze-responses', authenticateToken, async (req, res) => {
    try {
      const { needId } = req.body;

      if (!needId) {
        return res.status(400).json({
          success: false,
          error: 'needId requis'
        });
      }

      // Récupérer le besoin et les réponses
      const need = await db.collection('storage_market_needs').findOne({ needId });
      if (!need) {
        return res.status(404).json({
          success: false,
          error: 'Besoin non trouvé'
        });
      }

      const responses = await db.collection('storage_market_responses')
        .find({ needId, status: { $in: [ResponseStatus.SUBMITTED, ResponseStatus.UNDER_REVIEW] } })
        .toArray();

      if (responses.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Aucune réponse à analyser'
        });
      }

      // Analyser avec Claude
      const result = await getStorageMarketAI().analyzeLogisticianResponses(
        responses,
        need,
        need.selectionCriteria
      );

      if (!result.analyzed) {
        return res.status(503).json({
          success: false,
          error: 'Service IA non disponible',
          fallback: true
        });
      }

      // Mettre à jour les réponses avec le scoring IA
      const updatePromises = result.analysis.ranking.map(async (ranked) => {
        const responseId = responses[ranked.logisticianId - 1]?.responseId;
        if (responseId) {
          await db.collection('storage_market_responses').updateOne(
            { responseId },
            {
              $set: {
                'aiAnalysis': {
                  overallScore: ranked.overallScore,
                  priceScore: ranked.priceScore,
                  proximityScore: ranked.proximityScore,
                  qualityScore: ranked.qualityScore,
                  servicesScore: ranked.servicesScore,
                  recommendation: ranked.recommendation,
                  strengths: ranked.strengths,
                  weaknesses: ranked.weaknesses,
                  analyzedAt: new Date()
                }
              }
            }
          );
        }
      });

      await Promise.all(updatePromises);

      res.json({
        success: true,
        data: {
          analysis: result.analysis,
          tokensUsed: result.tokensUsed
        }
      });

    } catch (error) {
      console.error('[Storage Market AI] Erreur analyze-responses:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/storage-market/ai/extract-response-data
   * Extrait et structure les données d'une réponse
   */
  app.post('/api/storage-market/ai/extract-response-data', authenticateToken, async (req, res) => {
    try {
      const { responseId, rawResponse, needContext } = req.body;

      if (!responseId || !rawResponse) {
        return res.status(400).json({
          success: false,
          error: 'responseId et rawResponse requis'
        });
      }

      // Extraire les données avec Claude
      const result = await getStorageMarketAI().extractResponseData(rawResponse, needContext || {});

      if (!result.extracted) {
        return res.status(503).json({
          success: false,
          error: 'Service IA non disponible',
          fallback: true
        });
      }

      // Sauvegarder les données extraites
      await db.collection('storage_market_responses').updateOne(
        { responseId },
        {
          $set: {
            'aiExtraction': {
              extracted: true,
              extractedData: result.data,
              extractedAt: new Date(),
              tokensUsed: result.tokensUsed
            }
          }
        }
      );

      res.json({
        success: true,
        data: {
          extractedData: result.data,
          tokensUsed: result.tokensUsed
        }
      });

    } catch (error) {
      console.error('[Storage Market AI] Erreur extract-response-data:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/storage-market/ai/suggest-clarifications
   * Suggère des questions de clarification pour une réponse
   */
  app.post('/api/storage-market/ai/suggest-clarifications', authenticateToken, async (req, res) => {
    try {
      const { responseId } = req.body;

      if (!responseId) {
        return res.status(400).json({
          success: false,
          error: 'responseId requis'
        });
      }

      // Récupérer la réponse et le besoin
      const response = await db.collection('storage_market_responses').findOne({ responseId });
      if (!response) {
        return res.status(404).json({
          success: false,
          error: 'Réponse non trouvée'
        });
      }

      const need = await db.collection('storage_market_needs').findOne({ needId: response.needId });

      // Suggérer des questions avec Claude
      const result = await getStorageMarketAI().suggestClarificationQuestions(response, need);

      if (!result.suggested) {
        return res.status(503).json({
          success: false,
          error: 'Service IA non disponible',
          fallback: true
        });
      }

      res.json({
        success: true,
        data: {
          questions: result.questions,
          tokensUsed: result.tokensUsed
        }
      });

    } catch (error) {
      console.error('[Storage Market AI] Erreur suggest-clarifications:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/storage-market/ai/status
   * Statut du service IA Storage Market
   */
  app.get('/api/storage-market/ai/status', authenticateToken, (req, res) => {
    const stats = getStorageMarketAI().getStats();
    res.json({
      success: true,
      data: stats
    });
  });

  // ============================================================================
  // ROUTES GESTION DES CAPACITÉS LOGISTIQUES
  // ============================================================================

  /**
   * POST /api/storage-market/logistician-capacity
   * Déclare ou met à jour une capacité logistique
   */
  app.post('/api/storage-market/logistician-capacity', authenticateToken, async (req, res) => {
    try {
      const {
        capacityId,
        site,
        capacity,
        infrastructure,
        conditions,
        services,
        availability,
        pricing
      } = req.body;

      if (!site || !capacity) {
        return res.status(400).json({
          success: false,
          error: 'site et capacity requis'
        });
      }

      const newCapacityId = capacityId || `CAP-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

      const capacityData = {
        capacityId: newCapacityId,
        logisticianId: req.user.userId,
        organizationId: req.user.organizationId,
        site,
        capacity,
        infrastructure: infrastructure || {},
        conditions: conditions || {},
        services: services || [],
        availability: availability || {},
        pricing: pricing || {},
        stats: {
          occupancyRate: 0,
          averageStorageDuration: 0,
          clientCount: 0
        },
        lastUpdated: new Date(),
        createdAt: capacityId ? undefined : new Date()
      };

      if (capacityId) {
        // Mise à jour
        await db.collection('storage_market_capacities').updateOne(
          { capacityId, organizationId: req.user.organizationId },
          { $set: capacityData }
        );
      } else {
        // Création
        await db.collection('storage_market_capacities').insertOne(capacityData);
      }

      res.json({
        success: true,
        message: capacityId ? 'Capacité mise à jour' : 'Capacité déclarée',
        data: { capacityId: newCapacityId }
      });

    } catch (error) {
      console.error('[Storage Market] Erreur logistician-capacity:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // ROUTES CONSTANTES
  // ============================================================================

  /**
   * GET /api/storage-market/constants
   * Retourne les constantes pour le frontend
   */
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

  console.log('[Storage Market] Routes configurées avec assistance IA Claude');
}

module.exports = { configureStorageMarketRoutes };
