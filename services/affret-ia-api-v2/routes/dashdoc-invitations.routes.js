/**
 * Routes API pour invitations transporteurs Dashdoc
 */

const express = require('express');
const router = express.Router();
const DashdocCarrierInvitationService = require('../services/dashdoc-carrier-invitation.service');

/**
 * GET /api/v1/dashdoc-invitations/carriers/not-in-symphonia
 * Identifier les transporteurs Dashdoc qui ne sont pas dans Symphonia
 */
router.get('/carriers/not-in-symphonia', async (req, res) => {
  try {
    const result = await DashdocCarrierInvitationService.identifyDashdocCarriersNotInSymphonia();

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[API] Erreur identification carriers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v1/dashdoc-invitations/send-known-carrier
 * Envoyer invitation TYPE 1 (transporteur connu avec historique)
 *
 * Body:
 * {
 *   carrierId: "dashdoc-3991213",
 *   dryRun: false
 * }
 */
router.post('/send-known-carrier', async (req, res) => {
  try {
    const { carrierId, dryRun = false } = req.body;

    if (!carrierId) {
      return res.status(400).json({
        success: false,
        error: 'carrierId requis'
      });
    }

    // Récupérer les données du carrier depuis PriceHistory
    const PriceHistory = require('../models/PriceHistory');

    const carrierData = await PriceHistory.aggregate([
      { $match: { carrierId } },
      {
        $group: {
          _id: '$carrierId',
          carrierName: { $first: '$carrierName' },
          carrierEmail: { $first: '$carrierEmail' },
          carrierPhone: { $first: '$carrierPhone' },
          carrierSiren: { $first: '$carrierSiren' },
          carrierContact: { $first: '$carrierContact' },
          totalTransports: { $sum: 1 },
          routes: {
            $addToSet: {
              from: '$route.from.postalCode',
              fromCity: '$route.from.city',
              to: '$route.to.postalCode',
              toCity: '$route.to.city',
              price: '$price.final',
              date: '$completedAt'
            }
          },
          avgPrice: { $avg: '$price.final' }
        }
      }
    ]);

    if (!carrierData || carrierData.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Carrier non trouvé'
      });
    }

    const result = await DashdocCarrierInvitationService.sendInvitationToKnownCarrier(
      carrierData[0],
      { dryRun }
    );

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('[API] Erreur envoi invitation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v1/dashdoc-invitations/send-conquest
 * Envoyer email TYPE 2 (conquête pure)
 *
 * Body:
 * {
 *   carrierId: "dashdoc-3991213",
 *   availableOrders: [...],
 *   dryRun: false
 * }
 */
router.post('/send-conquest', async (req, res) => {
  try {
    const { carrierId, availableOrders = [], dryRun = false } = req.body;

    if (!carrierId) {
      return res.status(400).json({
        success: false,
        error: 'carrierId requis'
      });
    }

    // Récupérer les données du carrier
    const PriceHistory = require('../models/PriceHistory');

    const carrierData = await PriceHistory.aggregate([
      { $match: { carrierId } },
      {
        $group: {
          _id: '$carrierId',
          carrierName: { $first: '$carrierName' },
          carrierEmail: { $first: '$carrierEmail' },
          carrierPhone: { $first: '$carrierPhone' },
          carrierSiren: { $first: '$carrierSiren' },
          carrierContact: { $first: '$carrierContact' },
          routes: {
            $addToSet: {
              from: '$route.from.postalCode',
              fromCity: '$route.from.city',
              to: '$route.to.postalCode',
              toCity: '$route.to.city'
            }
          }
        }
      }
    ]);

    if (!carrierData || carrierData.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Carrier non trouvé'
      });
    }

    const result = await DashdocCarrierInvitationService.sendConquestEmailToCarrier(
      carrierData[0],
      availableOrders,
      { dryRun }
    );

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('[API] Erreur envoi conquête:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v1/dashdoc-invitations/campaign
 * Lancer une campagne d'invitation massive
 *
 * Body:
 * {
 *   type: "known",        // "known" ou "conquest"
 *   maxInvitations: 100,
 *   delayBetweenEmails: 2000,
 *   dryRun: false
 * }
 */
router.post('/campaign', async (req, res) => {
  try {
    const {
      type = 'known',
      maxInvitations = 100,
      delayBetweenEmails = 2000,
      dryRun = false
    } = req.body;

    // Démarrer campagne en arrière-plan
    const result = await DashdocCarrierInvitationService.runInvitationCampaign({
      type,
      maxInvitations,
      delayBetweenEmails,
      dryRun
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('[API] Erreur campagne:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/dashdoc-invitations/preview/:carrierId
 * Prévisualiser l'email d'invitation pour un carrier
 */
router.get('/preview/:carrierId', async (req, res) => {
  try {
    const { carrierId } = req.params;
    const { type = 'known' } = req.query;

    // Récupérer données carrier
    const PriceHistory = require('../models/PriceHistory');

    const carrierData = await PriceHistory.aggregate([
      { $match: { carrierId } },
      {
        $group: {
          _id: '$carrierId',
          carrierName: { $first: '$carrierName' },
          carrierEmail: { $first: '$carrierEmail' },
          carrierContact: { $first: '$carrierContact' },
          totalTransports: { $sum: 1 },
          routes: {
            $addToSet: {
              from: '$route.from.postalCode',
              fromCity: '$route.from.city',
              to: '$route.to.postalCode',
              toCity: '$route.to.city',
              price: '$price.final',
              date: '$completedAt'
            }
          },
          avgPrice: { $avg: '$price.final' }
        }
      }
    ]);

    if (!carrierData || carrierData.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Carrier non trouvé'
      });
    }

    const carrier = carrierData[0];

    // Générer token
    const invitationToken = DashdocCarrierInvitationService.generateInvitationToken(carrier);
    const invitationUrl = `${process.env.FRONTEND_URL || 'https://symphonia.com'}/invitation/dashdoc/${invitationToken}`;

    // Générer HTML
    let html;
    if (type === 'known') {
      html = DashdocCarrierInvitationService.generateKnownCarrierEmailHtml({
        carrierName: carrier.carrierName,
        contactName: carrier.carrierContact ?
          `${carrier.carrierContact.firstName} ${carrier.carrierContact.lastName}` :
          null,
        totalTransports: carrier.totalTransports,
        routes: carrier.routes.slice(0, 5),
        avgPrice: carrier.avgPrice,
        invitationUrl
      });
    } else {
      html = DashdocCarrierInvitationService.generateConquestEmailHtml({
        carrierName: carrier.carrierName,
        contactName: carrier.carrierContact ?
          `${carrier.carrierContact.firstName} ${carrier.carrierContact.lastName}` :
          null,
        routes: carrier.routes.slice(0, 3),
        availableOrders: [],
        signupUrl: invitationUrl
      });
    }

    // Retourner HTML brut pour prévisualisation
    res.setHeader('Content-Type', 'text/html');
    res.send(html);

  } catch (error) {
    console.error('[API] Erreur preview:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
