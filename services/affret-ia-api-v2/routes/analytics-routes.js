/**
 * Affret.IA Analytics Routes
 * Endpoints pour l'analyse du funnel de conversion et des blockers
 */

const express = require('express');
const router = express.Router();

/**
 * Setup analytics routes
 */
function setupAnalyticsRoutes(db) {

  // GET /api/v1/affretia/analytics/conversion - Funnel de conversion
  router.get('/conversion', async (req, res) => {
    try {
      const { startDate, endDate, carrierId } = req.query;

      const matchStage = {};
      if (startDate || endDate) {
        matchStage.createdAt = {};
        if (startDate) matchStage.createdAt.$gte = new Date(startDate);
        if (endDate) matchStage.createdAt.$lte = new Date(endDate);
      }
      if (carrierId) {
        matchStage.carrierId = carrierId;
      }

      // Recuperer tous les trackings
      const trackings = await db.collection('affretia_trial_tracking').find(matchStage).toArray();

      // Calculer le funnel
      const funnel = {
        total: trackings.length,
        steps: {
          step1_start: trackings.filter(t => t.step === 'trial_start').length,
          step2_doc_upload: trackings.filter(t => t.step === 'document_upload').length,
          step3_info_complete: trackings.filter(t => t.step === 'info_complete').length,
          step4_tms_connect: trackings.filter(t => t.step === 'tms_connect').length,
          step5_first_affret: trackings.filter(t => t.step === 'first_affret').length,
          step6_conversion: trackings.filter(t => t.step === 'conversion').length
        },
        rates: {}
      };

      // Calculer les taux de conversion
      if (funnel.steps.step1_start > 0) {
        funnel.rates.start_to_doc = Math.round((funnel.steps.step2_doc_upload / funnel.steps.step1_start) * 100);
        funnel.rates.doc_to_info = Math.round((funnel.steps.step3_info_complete / funnel.steps.step1_start) * 100);
        funnel.rates.info_to_tms = Math.round((funnel.steps.step4_tms_connect / funnel.steps.step1_start) * 100);
        funnel.rates.tms_to_affret = Math.round((funnel.steps.step5_first_affret / funnel.steps.step1_start) * 100);
        funnel.rates.affret_to_conversion = Math.round((funnel.steps.step6_conversion / funnel.steps.step1_start) * 100);
        funnel.rates.overall = Math.round((funnel.steps.step6_conversion / funnel.steps.step1_start) * 100);
      }

      // Calculer les drop-offs
      funnel.dropOffs = {
        start_to_doc: funnel.steps.step1_start - funnel.steps.step2_doc_upload,
        doc_to_info: funnel.steps.step2_doc_upload - funnel.steps.step3_info_complete,
        info_to_tms: funnel.steps.step3_info_complete - funnel.steps.step4_tms_connect,
        tms_to_affret: funnel.steps.step4_tms_connect - funnel.steps.step5_first_affret,
        affret_to_conversion: funnel.steps.step5_first_affret - funnel.steps.step6_conversion
      };

      res.json({
        success: true,
        data: funnel,
        period: { startDate, endDate }
      });

    } catch (error) {
      console.error('[ERROR] Analytics conversion:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/v1/affretia/analytics/blockers - Analyse des blockers
  router.get('/blockers', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const matchStage = {};
      if (startDate || endDate) {
        matchStage.createdAt = {};
        if (startDate) matchStage.createdAt.$gte = new Date(startDate);
        if (endDate) matchStage.createdAt.$lte = new Date(endDate);
      }

      // Recuperer tous les trackings avec blockers
      const trackings = await db.collection('affretia_trial_tracking').find({
        ...matchStage,
        'blocker.blocked': true
      }).toArray();

      // Analyser les blockers
      const blockerAnalysis = {
        total: trackings.length,
        byType: {},
        byStep: {},
        topBlockers: [],
        avgTimeToResolve: 0,
        resolved: 0,
        pending: 0
      };

      trackings.forEach(t => {
        const blocker = t.blocker;

        // Par type
        if (blocker.type) {
          blockerAnalysis.byType[blocker.type] = (blockerAnalysis.byType[blocker.type] || 0) + 1;
        }

        // Par step
        if (t.step) {
          blockerAnalysis.byStep[t.step] = (blockerAnalysis.byStep[t.step] || 0) + 1;
        }

        // Resolved vs pending
        if (blocker.resolved) {
          blockerAnalysis.resolved++;
        } else {
          blockerAnalysis.pending++;
        }
      });

      // Convertir byType en array trie
      blockerAnalysis.topBlockers = Object.entries(blockerAnalysis.byType)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      res.json({
        success: true,
        data: blockerAnalysis,
        period: { startDate, endDate }
      });

    } catch (error) {
      console.error('[ERROR] Analytics blockers:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/v1/affretia/analytics/timeline - Timeline des etapes par jour
  router.get('/timeline', async (req, res) => {
    try {
      const { startDate, endDate, step } = req.query;

      const matchStage = {};
      if (startDate || endDate) {
        matchStage.createdAt = {};
        if (startDate) matchStage.createdAt.$gte = new Date(startDate);
        if (endDate) matchStage.createdAt.$lte = new Date(endDate);
      }
      if (step) {
        matchStage.step = step;
      }

      // Aggregation par jour
      const timeline = await db.collection('affretia_trial_tracking').aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              step: '$step'
            },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { '_id.date': 1 }
        }
      ]).toArray();

      // Reformater les donnees
      const timelineData = {};
      timeline.forEach(item => {
        const date = item._id.date;
        const step = item._id.step;

        if (!timelineData[date]) {
          timelineData[date] = {};
        }
        timelineData[date][step] = item.count;
      });

      res.json({
        success: true,
        data: timelineData,
        period: { startDate, endDate }
      });

    } catch (error) {
      console.error('[ERROR] Analytics timeline:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/v1/affretia/analytics/carriers/:carrierId/journey - Journey d'un carrier
  router.get('/carriers/:carrierId/journey', async (req, res) => {
    try {
      const { carrierId } = req.params;

      // Recuperer tous les trackings du carrier
      const journey = await db.collection('affretia_trial_tracking')
        .find({ carrierId })
        .sort({ createdAt: 1 })
        .toArray();

      if (journey.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No journey found for this carrier'
        });
      }

      // Calculer des metriques
      const metrics = {
        totalSteps: journey.length,
        currentStep: journey[journey.length - 1].step,
        startDate: journey[0].createdAt,
        lastUpdate: journey[journey.length - 1].createdAt,
        durationDays: Math.round((new Date(journey[journey.length - 1].createdAt) - new Date(journey[0].createdAt)) / (1000 * 60 * 60 * 24)),
        hasBlockers: journey.some(j => j.blocker?.blocked),
        blockers: journey.filter(j => j.blocker?.blocked).map(j => ({
          step: j.step,
          type: j.blocker.type,
          reason: j.blocker.reason,
          resolved: j.blocker.resolved,
          createdAt: j.createdAt
        })),
        completed: journey.some(j => j.step === 'conversion')
      };

      // Construire la timeline
      const timeline = journey.map(j => ({
        step: j.step,
        timestamp: j.createdAt,
        metadata: j.metadata,
        blocker: j.blocker
      }));

      res.json({
        success: true,
        data: {
          carrierId,
          metrics,
          timeline
        }
      });

    } catch (error) {
      console.error('[ERROR] Analytics journey:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = { setupAnalyticsRoutes };
