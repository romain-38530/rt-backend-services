/**
 * Carrier Scoring Routes
 * Endpoints pour le systeme de scoring des transporteurs
 */

const axios = require('axios');

const SCORING_API_URL = process.env.SCORING_API_URL || 'http://localhost:3016';

/**
 * Setup carrier scoring routes
 */
function setupCarrierScoringRoutes(app, db) {

  // GET /api/v1/carriers/leaderboard - Classement des transporteurs
  app.get('/api/v1/carriers/leaderboard', async (req, res) => {
    try {
      const { limit = 20, minTransports = 5, level, status } = req.query;

      // Appeler l'API de scoring
      const response = await axios.get(`${SCORING_API_URL}/api/v1/scoring/leaderboard`, {
        params: { limit, minTransports }
      });

      if (!response.data.success) {
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch leaderboard from scoring API'
        });
      }

      let carriers = response.data.data;

      // Enrichir avec les donnees des carriers depuis MongoDB
      const carrierIds = carriers.map(c => c.carrierId);
      const carrierDocs = await db.collection('carriers').find({
        _id: { $in: carrierIds }
      }).toArray();

      const carrierMap = {};
      carrierDocs.forEach(doc => {
        carrierMap[doc._id] = doc;
      });

      // Enrichir les donnees
      carriers = carriers.map(carrier => {
        const doc = carrierMap[carrier.carrierId];
        return {
          ...carrier,
          company: doc?.company || carrier.carrierName,
          email: doc?.email,
          level: doc?.level || 'bronze',
          status: doc?.status || 'active',
          phone: doc?.phone,
          city: doc?.address?.city,
          createdAt: doc?.createdAt
        };
      });

      // Filtrer par level si specifie
      if (level) {
        carriers = carriers.filter(c => c.level === level);
      }

      // Filtrer par status si specifie
      if (status) {
        carriers = carriers.filter(c => c.status === status);
      }

      res.json({
        success: true,
        data: carriers,
        count: carriers.length,
        filters: { level, status, limit, minTransports }
      });

    } catch (error) {
      console.error('[ERROR] Leaderboard:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // GET /api/v1/carriers/:id/score - Score d'un transporteur
  app.get('/api/v1/carriers/:id/score', async (req, res) => {
    try {
      const carrierId = req.params.id;

      // Appeler l'API de scoring
      const response = await axios.get(`${SCORING_API_URL}/api/v1/carriers/${carrierId}/score`);

      if (!response.data.success) {
        return res.status(404).json({
          success: false,
          error: 'Carrier score not found'
        });
      }

      // Enrichir avec les donnees du carrier
      const carrier = await db.collection('carriers').findOne({ _id: carrierId });

      const result = {
        ...response.data.data,
        carrier: carrier ? {
          company: carrier.company,
          email: carrier.email,
          level: carrier.level,
          status: carrier.status
        } : null
      };

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('[ERROR] Get carrier score:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // GET /api/v1/carriers/:id/score-history - Historique des scores
  app.get('/api/v1/carriers/:id/score-history', async (req, res) => {
    try {
      const carrierId = req.params.id;
      const { limit = 50, startDate, endDate } = req.query;

      // Appeler l'API de scoring
      const response = await axios.get(`${SCORING_API_URL}/api/v1/carriers/${carrierId}/score-history`, {
        params: { limit, startDate, endDate }
      });

      res.json(response.data);

    } catch (error) {
      console.error('[ERROR] Get score history:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // GET /api/v1/carriers/:id/benchmark - Benchmark d'un transporteur
  app.get('/api/v1/carriers/:id/benchmark', async (req, res) => {
    try {
      const carrierId = req.params.id;

      // Recuperer le score du carrier
      const carrierScoreResponse = await axios.get(`${SCORING_API_URL}/api/v1/carriers/${carrierId}/score`);

      if (!carrierScoreResponse.data.success) {
        return res.status(404).json({
          success: false,
          error: 'Carrier score not found'
        });
      }

      const carrierScore = carrierScoreResponse.data.data;

      // Recuperer la moyenne de tous les carriers
      const leaderboardResponse = await axios.get(`${SCORING_API_URL}/api/v1/scoring/leaderboard`, {
        params: { limit: 1000, minTransports: 1 }
      });

      const allCarriers = leaderboardResponse.data.data || [];

      // Calculer les moyennes
      const averages = {
        punctualityPickup: 0,
        punctualityDelivery: 0,
        appointmentRespect: 0,
        trackingReactivity: 0,
        podDelay: 0,
        incidentsManaged: 0,
        delaysJustified: 0,
        overall: 0
      };

      if (allCarriers.length > 0) {
        allCarriers.forEach(carrier => {
          const scores = carrier.averageScores || {};
          averages.punctualityPickup += scores.punctualityPickup || 0;
          averages.punctualityDelivery += scores.punctualityDelivery || 0;
          averages.appointmentRespect += scores.appointmentRespect || 0;
          averages.trackingReactivity += scores.trackingReactivity || 0;
          averages.podDelay += scores.podDelay || 0;
          averages.incidentsManaged += scores.incidentsManaged || 0;
          averages.delaysJustified += scores.delaysJustified || 0;
          averages.overall += scores.overall || 0;
        });

        const count = allCarriers.length;
        Object.keys(averages).forEach(key => {
          averages[key] = Math.round(averages[key] / count);
        });
      }

      // Creer le benchmark
      const benchmark = {
        carrier: {
          carrierId: carrierScore.carrierId,
          carrierName: carrierScore.carrierName,
          scores: carrierScore.averageScores
        },
        marketAverage: averages,
        comparison: {
          punctualityPickup: (carrierScore.averageScores?.punctualityPickup || 0) - averages.punctualityPickup,
          punctualityDelivery: (carrierScore.averageScores?.punctualityDelivery || 0) - averages.punctualityDelivery,
          appointmentRespect: (carrierScore.averageScores?.appointmentRespect || 0) - averages.appointmentRespect,
          trackingReactivity: (carrierScore.averageScores?.trackingReactivity || 0) - averages.trackingReactivity,
          podDelay: (carrierScore.averageScores?.podDelay || 0) - averages.podDelay,
          incidentsManaged: (carrierScore.averageScores?.incidentsManaged || 0) - averages.incidentsManaged,
          delaysJustified: (carrierScore.averageScores?.delaysJustified || 0) - averages.delaysJustified,
          overall: (carrierScore.averageScores?.overall || 0) - averages.overall
        },
        rank: carrierScore.rank,
        totalCarriers: allCarriers.length,
        percentile: Math.round((carrierScore.rank / allCarriers.length) * 100)
      };

      res.json({
        success: true,
        data: benchmark
      });

    } catch (error) {
      console.error('[ERROR] Get benchmark:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  console.log('[ROUTES] Carrier Scoring routes initialized');
}

module.exports = { setupCarrierScoringRoutes };
