/**
 * ============================================================================
 * AFFRET.IA - AI Enhancement Service
 * ============================================================================
 * Service d'amélioration IA pour AFFRET.IA utilisant Claude
 * Optimisation de la sélection, négociation et analyse
 * ============================================================================
 */

const { ClaudeIntegrationService } = require('./claude-integration');

class AffretiaAIEnhancement {
  constructor() {
    this.claudeService = new ClaudeIntegrationService();
    console.log('✅ AFFRET.IA AI Enhancement initialized:', this.claudeService.isEnabled());
  }

  /**
   * Analyse intelligente des besoins de transport
   * Enrichit l'analyse avec des insights IA
   */
  async enhanceTransportAnalysis(mission, orderDetails = {}) {
    if (!this.claudeService.isEnabled()) {
      return { enhanced: false, analysis: null };
    }

    try {
      const prompt = `Tu es un expert en transport et logistique. Analyse cette mission de transport et fournis des recommandations.

Mission:
- Origine: ${mission.origin?.city || mission.origin?.address || 'Non spécifié'}
- Destination: ${mission.destination?.city || mission.destination?.address || 'Non spécifié'}
- Date enlèvement: ${mission.pickupDate || 'Non spécifié'}
- Date livraison: ${mission.deliveryDate || 'Non spécifié'}
- Marchandise: ${JSON.stringify(mission.goods || {})}
- Exigences: ${JSON.stringify(mission.requirements || {})}
- Budget: ${mission.budget?.initial || 'Non spécifié'} ${mission.budget?.currency || 'EUR'}

Fournis une analyse concise en JSON avec:
{
  "complexity": "SIMPLE|MODERATE|COMPLEX",
  "riskFactors": ["facteur1", "facteur2"],
  "recommendations": ["recommandation1", "recommandation2"],
  "suggestedCarrierTypes": ["type1", "type2"],
  "estimatedDuration": "durée estimée",
  "criticalPoints": ["point1", "point2"]
}`;

      const response = await this.claudeService.client.messages.create({
        model: this.claudeService.model,
        max_tokens: 1500,
        system: 'Tu es un expert en transport et logistique. Réponds uniquement en JSON valide.',
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const analysisText = response.content[0].text;

      // Extraire le JSON de la réponse
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        return {
          enhanced: true,
          analysis,
          tokensUsed: response.usage
        };
      }

      return { enhanced: false, analysis: null };

    } catch (error) {
      console.error('❌ Erreur analyse IA AFFRET.IA:', error.message);
      return { enhanced: false, analysis: null, error: error.message };
    }
  }

  /**
   * Optimisation intelligente de la shortlist de transporteurs
   * Recommande les meilleurs candidats avec justification
   */
  async optimizeCarrierShortlist(candidates, mission, sessionContext = {}) {
    if (!this.claudeService.isEnabled() || candidates.length === 0) {
      return { optimized: false, recommendations: [] };
    }

    try {
      // Préparer les infos des candidats
      const candidatesInfo = candidates.slice(0, 10).map((c, idx) => ({
        id: idx + 1,
        name: c.carrierName || c.name,
        score: c.score || c.rating || 0,
        price: c.proposedPrice || c.price || 0,
        experience: c.experience || 'Non spécifié',
        specializations: c.specializations || [],
        averageDelay: c.averageDelay || 'N/A',
        rating: c.globalRating || c.rating || 'N/A'
      }));

      const prompt = `Tu es un expert en sélection de transporteurs. Analyse ces candidats et recommande le top 5 pour cette mission.

Mission:
- Origine: ${mission.origin?.city || 'Non spécifié'}
- Destination: ${mission.destination?.city || 'Non spécifié'}
- Type marchandise: ${JSON.stringify(mission.goods?.type || 'Générique')}
- Budget: ${mission.budget?.initial || 'Non spécifié'} EUR
- Exigences: ${JSON.stringify(mission.requirements || {})}

Candidats disponibles:
${JSON.stringify(candidatesInfo, null, 2)}

Fournis une recommandation en JSON:
{
  "topRecommendations": [
    {
      "candidateId": 1,
      "rank": 1,
      "score": 95,
      "reasons": ["raison1", "raison2"],
      "concerns": ["préoccupation éventuelle"]
    }
  ],
  "summary": "résumé global",
  "alternativeStrategy": "stratégie si top candidats refusent"
}

Limite à 5 recommandations maximum.`;

      const response = await this.claudeService.client.messages.create({
        model: this.claudeService.model,
        max_tokens: 2000,
        system: 'Tu es un expert en sélection de transporteurs. Réponds uniquement en JSON valide.',
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const recommendationText = response.content[0].text;
      const jsonMatch = recommendationText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const recommendations = JSON.parse(jsonMatch[0]);
        return {
          optimized: true,
          recommendations: recommendations.topRecommendations || [],
          summary: recommendations.summary,
          alternativeStrategy: recommendations.alternativeStrategy,
          tokensUsed: response.usage
        };
      }

      return { optimized: false, recommendations: [] };

    } catch (error) {
      console.error('❌ Erreur optimisation shortlist IA:', error.message);
      return { optimized: false, recommendations: [], error: error.message };
    }
  }

  /**
   * Génération intelligente de description d'offre
   * Crée une description professionnelle et attrayante
   */
  async generateOfferDescription(mission, targetCarriers = []) {
    if (!this.claudeService.isEnabled()) {
      return { generated: false, description: null };
    }

    try {
      const prompt = `Tu es un expert en rédaction d'offres de transport. Génère une description professionnelle pour cette mission.

Mission:
- Référence: ${mission.reference || 'N/A'}
- Trajet: ${mission.origin?.city || 'N/A'} → ${mission.destination?.city || 'N/A'}
- Date: ${mission.pickupDate || 'À définir'}
- Marchandise: ${JSON.stringify(mission.goods || {})}
- Exigences spéciales: ${JSON.stringify(mission.requirements || {})}
- Budget indicatif: ${mission.budget?.initial || 'Négociable'} EUR

Génère une description en 3 parties:
1. Titre accrocheur (1 ligne)
2. Description détaillée (3-4 lignes)
3. Exigences clés (liste à puces)

Format: texte professionnel, clair, attractif pour les transporteurs.`;

      const response = await this.claudeService.client.messages.create({
        model: this.claudeService.model,
        max_tokens: 800,
        system: 'Tu es un expert en rédaction d\'offres de transport. Rédige de manière professionnelle et concise.',
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const description = response.content[0].text;

      return {
        generated: true,
        description,
        tokensUsed: response.usage
      };

    } catch (error) {
      console.error('❌ Erreur génération description:', error.message);
      return { generated: false, description: null, error: error.message };
    }
  }

  /**
   * Assistance à la négociation
   * Suggère des contre-propositions intelligentes
   */
  async suggestNegotiationStrategy(session, carrierResponse) {
    if (!this.claudeService.isEnabled()) {
      return { suggested: false, strategy: null };
    }

    try {
      const initialBudget = session.mission?.budget?.initial || 0;
      const proposedPrice = carrierResponse.price || 0;
      const difference = proposedPrice - initialBudget;
      const percentDiff = initialBudget > 0 ? ((difference / initialBudget) * 100).toFixed(1) : 0;

      const prompt = `Tu es un négociateur expert en transport. Analyse cette situation et suggère une stratégie.

Situation:
- Budget initial: ${initialBudget} EUR
- Prix proposé: ${proposedPrice} EUR
- Différence: ${difference > 0 ? '+' : ''}${difference} EUR (${percentDiff}%)
- Transporteur: Score ${carrierResponse.carrierScore || 'N/A'}/100
- Délai accepté: ${carrierResponse.acceptedTimeline || 'Non spécifié'}
- Commentaire: ${carrierResponse.comment || 'Aucun'}

Mission:
- Type: ${session.mission?.goods?.type || 'Standard'}
- Exigences: ${JSON.stringify(session.mission?.requirements || {})}

Fournis en JSON:
{
  "recommendation": "ACCEPT|NEGOTIATE|REJECT",
  "counterOffer": prix_suggéré_ou_null,
  "negotiationPoints": ["point1", "point2"],
  "justification": "explication brève",
  "alternativeActions": ["action1", "action2"]
}`;

      const response = await this.claudeService.client.messages.create({
        model: this.claudeService.model,
        max_tokens: 1200,
        system: 'Tu es un négociateur expert. Réponds uniquement en JSON valide.',
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const strategyText = response.content[0].text;
      const jsonMatch = strategyText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const strategy = JSON.parse(jsonMatch[0]);
        return {
          suggested: true,
          strategy,
          tokensUsed: response.usage
        };
      }

      return { suggested: false, strategy: null };

    } catch (error) {
      console.error('❌ Erreur stratégie négociation:', error.message);
      return { suggested: false, strategy: null, error: error.message };
    }
  }

  /**
   * Analyse des réponses reçues et scoring intelligent
   */
  async analyzeResponses(responses, mission) {
    if (!this.claudeService.isEnabled() || responses.length === 0) {
      return { analyzed: false, insights: null };
    }

    try {
      const responsesInfo = responses.map(r => ({
        carrier: r.carrierName || 'Inconnu',
        price: r.price || 0,
        delay: r.delay || 0,
        comment: r.comment || '',
        accepted: r.accepted
      }));

      const prompt = `Tu es un analyste expert en transport. Analyse ces réponses de transporteurs.

Mission budget: ${mission.budget?.initial || 'N/A'} EUR

Réponses reçues:
${JSON.stringify(responsesInfo, null, 2)}

Fournis une analyse en JSON:
{
  "bestValue": "nom du meilleur rapport qualité/prix",
  "concerns": ["préoccupation1", "préoccupation2"],
  "marketInsights": "analyse du marché basée sur les réponses",
  "recommendation": "recommandation finale",
  "negotiationOpportunities": ["opportunité1", "opportunité2"]
}`;

      const response = await this.claudeService.client.messages.create({
        model: this.claudeService.model,
        max_tokens: 1500,
        system: 'Tu es un analyste expert en transport. Réponds uniquement en JSON valide.',
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const insightsText = response.content[0].text;
      const jsonMatch = insightsText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const insights = JSON.parse(jsonMatch[0]);
        return {
          analyzed: true,
          insights,
          tokensUsed: response.usage
        };
      }

      return { analyzed: false, insights: null };

    } catch (error) {
      console.error('❌ Erreur analyse réponses:', error.message);
      return { analyzed: false, insights: null, error: error.message };
    }
  }

  /**
   * Vérifie si le service est actif
   */
  isEnabled() {
    return this.claudeService && this.claudeService.isEnabled();
  }

  /**
   * Obtient les statistiques d'utilisation
   */
  getStats() {
    return {
      enabled: this.isEnabled(),
      model: this.claudeService?.model,
      provider: 'Anthropic Claude'
    };
  }
}

module.exports = { AffretiaAIEnhancement };
