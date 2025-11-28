/**
 * Service de Negociation Automatique AFFRET.IA
 * Gere les contre-propositions et la negociation intelligente
 */

const CarrierProposal = require('../models/CarrierProposal');
const AffretSession = require('../models/AffretSession');
const AIScoringEngine = require('../modules/ai-scoring-engine');

class NegotiationService {
  constructor() {
    this.scoringEngine = new AIScoringEngine();
    this.maxNegotiationRounds = parseInt(process.env.AFFRET_NEGOTIATION_MAX_ROUNDS) || 3;
    this.maxPriceIncrease = parseFloat(process.env.AFFRET_MAX_PRICE_INCREASE) || 15;
    this.autoAcceptThreshold = parseFloat(process.env.AFFRET_AUTO_ACCEPT_THRESHOLD) || 0;
  }

  /**
   * Evaluer une proposition et decider de l'action (accepter, rejeter, negocier)
   */
  async evaluateProposal(proposalId) {
    try {
      const proposal = await CarrierProposal.findById(proposalId);

      if (!proposal) {
        throw new Error('Proposal not found');
      }

      const session = await AffretSession.findOne({ sessionId: proposal.sessionId });

      if (!session) {
        throw new Error('Session not found');
      }

      const estimatedPrice = session.analysis.estimatedPrice;

      // Calculer les scores
      const scores = await this.scoringEngine.calculateProposalScore(proposal, estimatedPrice);

      proposal.scores = {
        price: scores.priceScore,
        quality: scores.qualityScore,
        overall: scores.overall,
        details: scores.breakdown
      };

      await proposal.save();

      // Verifier si auto-acceptation possible
      const autoAcceptCheck = this.scoringEngine.canAutoAccept(
        scores,
        estimatedPrice,
        proposal.proposedPrice,
        {
          maxPriceIncrease: session.negotiationSettings.maxPriceIncrease,
          minQualityScore: 70,
          minOverallScore: 75
        }
      );

      if (autoAcceptCheck.canAccept) {
        // Acceptation automatique
        proposal.accept('ai', autoAcceptCheck.reason);
        await proposal.save();

        session.proposalsAccepted++;
        session.addTimelineEvent('proposal_auto_accepted', {
          proposalId: proposal._id,
          carrierId: proposal.carrierId,
          price: proposal.proposedPrice,
          reason: autoAcceptCheck.reason
        });
        await session.save();

        return {
          action: 'accepted',
          reason: autoAcceptCheck.reason,
          proposal,
          scores
        };
      }

      // Verifier si le prix est trop eleve (> +15%)
      const priceRatio = (proposal.proposedPrice / estimatedPrice - 1) * 100;

      if (priceRatio > session.negotiationSettings.maxPriceIncrease) {
        // Rejet automatique
        proposal.reject('ai', `Prix trop eleve (+${priceRatio.toFixed(1)}%, max +${session.negotiationSettings.maxPriceIncrease}%)`);
        await proposal.save();

        session.proposalsRejected++;
        session.addTimelineEvent('proposal_auto_rejected', {
          proposalId: proposal._id,
          carrierId: proposal.carrierId,
          price: proposal.proposedPrice,
          reason: `Prix trop eleve (+${priceRatio.toFixed(1)}%)`
        });
        await session.save();

        return {
          action: 'rejected',
          reason: `Prix trop eleve (+${priceRatio.toFixed(1)}%)`,
          proposal,
          scores
        };
      }

      // Verifier si negociation possible
      if (proposal.canNegotiate()) {
        // Generer contre-proposition
        const counterOffer = this.scoringEngine.generateCounterOffer(
          proposal.proposedPrice,
          estimatedPrice,
          {
            maxPriceIncrease: session.negotiationSettings.maxPriceIncrease
          }
        );

        if (counterOffer) {
          proposal.addNegotiation({
            proposedPrice: proposal.proposedPrice,
            counterPrice: counterOffer.counterPrice,
            proposedBy: 'ai',
            message: counterOffer.message,
            status: 'pending'
          });

          await proposal.save();

          session.proposalsNegotiated++;
          session.addTimelineEvent('negotiation_started', {
            proposalId: proposal._id,
            carrierId: proposal.carrierId,
            originalPrice: proposal.proposedPrice,
            counterPrice: counterOffer.counterPrice,
            round: proposal.currentNegotiationRound
          });
          await session.save();

          return {
            action: 'negotiating',
            counterOffer,
            proposal,
            scores,
            round: proposal.currentNegotiationRound
          };
        }
      }

      // Par defaut, laisser en attente pour decision manuelle
      return {
        action: 'pending',
        reason: 'En attente de decision manuelle',
        proposal,
        scores
      };

    } catch (error) {
      console.error('[NEGOTIATION SERVICE] Error evaluating proposal:', error);
      throw error;
    }
  }

  /**
   * Repondre a une contre-proposition du transporteur
   */
  async respondToCounterOffer(proposalId, carrierCounterPrice) {
    try {
      const proposal = await CarrierProposal.findById(proposalId);

      if (!proposal) {
        throw new Error('Proposal not found');
      }

      if (!proposal.canNegotiate()) {
        throw new Error('Cannot negotiate - max rounds reached or invalid status');
      }

      const session = await AffretSession.findOne({ sessionId: proposal.sessionId });
      const estimatedPrice = session.analysis.estimatedPrice;

      // Verifier si la nouvelle proposition est acceptable
      const priceRatio = (carrierCounterPrice / estimatedPrice - 1) * 100;

      if (priceRatio <= this.autoAcceptThreshold) {
        // Accepter la contre-proposition
        proposal.proposedPrice = carrierCounterPrice;
        proposal.addNegotiation({
          proposedPrice: carrierCounterPrice,
          counterPrice: carrierCounterPrice,
          proposedBy: 'ai',
          message: 'Contre-proposition acceptee',
          status: 'accepted'
        });
        proposal.accept('ai', `Contre-proposition acceptee a ${carrierCounterPrice}€`);

        await proposal.save();

        session.proposalsAccepted++;
        session.addTimelineEvent('counter_offer_accepted', {
          proposalId: proposal._id,
          carrierId: proposal.carrierId,
          finalPrice: carrierCounterPrice,
          negotiationRounds: proposal.currentNegotiationRound
        });
        await session.save();

        return {
          action: 'accepted',
          finalPrice: carrierCounterPrice,
          proposal
        };
      }

      if (priceRatio > session.negotiationSettings.maxPriceIncrease) {
        // Rejeter la contre-proposition
        proposal.addNegotiation({
          proposedPrice: carrierCounterPrice,
          counterPrice: null,
          proposedBy: 'ai',
          message: `Contre-proposition rejetee - prix trop eleve (+${priceRatio.toFixed(1)}%)`,
          status: 'rejected'
        });
        proposal.reject('ai', `Contre-proposition rejetee - prix trop eleve (+${priceRatio.toFixed(1)}%)`);

        await proposal.save();

        session.proposalsRejected++;
        await session.save();

        return {
          action: 'rejected',
          reason: `Prix trop eleve (+${priceRatio.toFixed(1)}%)`,
          proposal
        };
      }

      // Continuer la negociation si possible
      if (proposal.currentNegotiationRound < proposal.maxNegotiationRounds) {
        const newCounterOffer = this.scoringEngine.generateCounterOffer(
          carrierCounterPrice,
          estimatedPrice,
          {
            maxPriceIncrease: session.negotiationSettings.maxPriceIncrease
          }
        );

        if (newCounterOffer) {
          proposal.addNegotiation({
            proposedPrice: carrierCounterPrice,
            counterPrice: newCounterOffer.counterPrice,
            proposedBy: 'ai',
            message: newCounterOffer.message,
            status: 'pending'
          });

          await proposal.save();

          session.addTimelineEvent('negotiation_continued', {
            proposalId: proposal._id,
            carrierId: proposal.carrierId,
            carrierPrice: carrierCounterPrice,
            counterPrice: newCounterOffer.counterPrice,
            round: proposal.currentNegotiationRound
          });
          await session.save();

          return {
            action: 'negotiating',
            counterOffer: newCounterOffer,
            proposal,
            round: proposal.currentNegotiationRound
          };
        }
      }

      // Max rounds atteint - decision manuelle
      proposal.status = 'pending';
      await proposal.save();

      return {
        action: 'pending',
        reason: 'Nombre maximum de tours de negociation atteint - decision manuelle requise',
        proposal
      };

    } catch (error) {
      console.error('[NEGOTIATION SERVICE] Error responding to counter offer:', error);
      throw error;
    }
  }

  /**
   * Verifier les propositions en timeout
   */
  async checkTimeouts(sessionId) {
    try {
      const session = await AffretSession.findOne({ sessionId });

      if (!session) {
        throw new Error('Session not found');
      }

      const timeout = session.negotiationSettings.timeout || 24; // heures
      const timeoutThreshold = new Date(Date.now() - timeout * 60 * 60 * 1000);

      const proposals = await CarrierProposal.find({
        sessionId,
        status: { $in: ['pending', 'negotiating'] },
        submittedAt: { $lt: timeoutThreshold }
      });

      let timeoutCount = 0;

      for (const proposal of proposals) {
        proposal.timeout();
        await proposal.save();
        timeoutCount++;
      }

      if (timeoutCount > 0) {
        session.proposalsTimeout = (session.proposalsTimeout || 0) + timeoutCount;
        session.addTimelineEvent('proposals_timeout', {
          count: timeoutCount,
          threshold: timeoutThreshold
        });
        await session.save();
      }

      return {
        sessionId,
        timeoutCount,
        proposals: proposals.map(p => ({
          proposalId: p._id,
          carrierId: p.carrierId,
          submittedAt: p.submittedAt
        }))
      };

    } catch (error) {
      console.error('[NEGOTIATION SERVICE] Error checking timeouts:', error);
      throw error;
    }
  }

  /**
   * Accepter manuellement une proposition
   */
  async acceptManually(proposalId, userId, reason = '') {
    try {
      const proposal = await CarrierProposal.findById(proposalId);

      if (!proposal) {
        throw new Error('Proposal not found');
      }

      proposal.accept(userId, reason || 'Acceptation manuelle');
      await proposal.save();

      const session = await AffretSession.findOne({ sessionId: proposal.sessionId });
      session.proposalsAccepted++;
      session.addTimelineEvent('proposal_manually_accepted', {
        proposalId: proposal._id,
        carrierId: proposal.carrierId,
        price: proposal.proposedPrice,
        userId
      }, userId);
      await session.save();

      return proposal;

    } catch (error) {
      console.error('[NEGOTIATION SERVICE] Error accepting manually:', error);
      throw error;
    }
  }

  /**
   * Rejeter manuellement une proposition
   */
  async rejectManually(proposalId, userId, reason = '') {
    try {
      const proposal = await CarrierProposal.findById(proposalId);

      if (!proposal) {
        throw new Error('Proposal not found');
      }

      proposal.reject(userId, reason || 'Rejet manuel');
      await proposal.save();

      const session = await AffretSession.findOne({ sessionId: proposal.sessionId });
      session.proposalsRejected++;
      session.addTimelineEvent('proposal_manually_rejected', {
        proposalId: proposal._id,
        carrierId: proposal.carrierId,
        price: proposal.proposedPrice,
        reason,
        userId
      }, userId);
      await session.save();

      return proposal;

    } catch (error) {
      console.error('[NEGOTIATION SERVICE] Error rejecting manually:', error);
      throw error;
    }
  }

  /**
   * Negocier manuellement
   */
  async negotiateManually(proposalId, counterPrice, message, userId) {
    try {
      const proposal = await CarrierProposal.findById(proposalId);

      if (!proposal) {
        throw new Error('Proposal not found');
      }

      if (!proposal.canNegotiate()) {
        throw new Error('Cannot negotiate - max rounds reached or invalid status');
      }

      proposal.addNegotiation({
        proposedPrice: proposal.proposedPrice,
        counterPrice,
        proposedBy: 'user',
        message,
        status: 'pending'
      });

      await proposal.save();

      const session = await AffretSession.findOne({ sessionId: proposal.sessionId });
      session.proposalsNegotiated++;
      session.addTimelineEvent('manual_negotiation', {
        proposalId: proposal._id,
        carrierId: proposal.carrierId,
        originalPrice: proposal.proposedPrice,
        counterPrice,
        round: proposal.currentNegotiationRound,
        userId
      }, userId);
      await session.save();

      return {
        proposal,
        negotiationRound: proposal.currentNegotiationRound,
        maxRounds: proposal.maxNegotiationRounds
      };

    } catch (error) {
      console.error('[NEGOTIATION SERVICE] Error negotiating manually:', error);
      throw error;
    }
  }
}

module.exports = new NegotiationService();
