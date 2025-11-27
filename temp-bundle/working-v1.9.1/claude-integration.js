/**
 * ============================================================================
 * RT SYMPHONI.A - Claude AI Integration Service
 * ============================================================================
 * Service d'intégration avec l'API Claude (Anthropic)
 * Utilisé par tous les chatbots pour générer des réponses intelligentes
 * ============================================================================
 */

const Anthropic = require('@anthropic-ai/sdk');

class ClaudeIntegrationService {
  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    this.model = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';
    this.maxTokens = parseInt(process.env.CLAUDE_MAX_TOKENS || '4096');

    if (!this.apiKey) {
      console.warn('⚠️ ANTHROPIC_API_KEY not configured - Claude AI disabled');
      this.enabled = false;
      return;
    }

    this.client = new Anthropic({
      apiKey: this.apiKey
    });

    this.enabled = true;
    console.log(`✅ Claude AI Integration initialized (${this.model})`);
  }

  /**
   * Génère une réponse Claude pour un chatbot
   * @param {Object} params
   * @param {string} params.chatbotType - Type de chatbot (RT_HELPBOT, PLANIF_IA, etc.)
   * @param {string} params.userRole - Rôle utilisateur
   * @param {string} params.userMessage - Message utilisateur
   * @param {Array} params.conversationHistory - Historique conversation
   * @param {Object} params.context - Contexte additionnel
   * @returns {Promise<string>} Réponse générée
   */
  async generateResponse({ chatbotType, userRole, userMessage, conversationHistory = [], context = {} }) {
    if (!this.enabled) {
      throw new Error('Claude AI n\'est pas configuré. Vérifiez ANTHROPIC_API_KEY');
    }

    try {
      // Construire le system prompt selon le type de chatbot
      const systemPrompt = this._buildSystemPrompt(chatbotType, userRole, context);

      // Construire l'historique de messages
      const messages = this._buildMessages(conversationHistory, userMessage);

      // Appeler l'API Claude
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: messages
      });

      // Extraire et retourner la réponse
      const responseText = response.content[0].text;

      return {
        success: true,
        response: responseText,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens
        }
      };

    } catch (error) {
      console.error('❌ Erreur Claude API:', error.message);
      throw new Error(`Erreur Claude AI: ${error.message}`);
    }
  }

  /**
   * Construit le system prompt selon le chatbot
   */
  _buildSystemPrompt(chatbotType, userRole, context) {
    const basePrompt = `Tu es un assistant IA pour RT SYMPHONI.A, une plateforme TMS (Transport Management System) pour le transport et la logistique.

Ton rôle est d'aider les utilisateurs avec professionnalisme, précision et empathie.

Contexte utilisateur:
- Rôle: ${userRole}
- Entreprise: RT Technologie
- Plateforme: RT SYMPHONI.A

`;

    const chatbotPrompts = {
      RT_HELPBOT: `${basePrompt}Tu es RT HelpBot, l'assistant de support technique principal.

Tes responsabilités:
- Diagnostiquer et résoudre les problèmes techniques
- Guider les utilisateurs dans l'utilisation de la plateforme
- Escalader les problèmes critiques aux techniciens humains
- Fournir des solutions claires et pratiques

Modules de la plateforme:
- Abonnements & Contrats
- Commandes de transport
- Transporteurs & Scoring
- eCMR (Lettre de voiture électronique)
- Suivi GPS en temps réel
- Planning & Ordonnancement
- Gestion de quai & WMS
- Affrètement intelligent (AFFRET.IA)

Ton ton: Professionnel, aidant, rassurant`,

      PLANIF_IA: `${basePrompt}Tu es Planif'IA, l'assistant spécialisé en planning et ordonnancement.

Tes responsabilités:
- Aider à créer et optimiser les plannings de chargement/livraison
- Gérer les rendez-vous et les créneaux horaires
- Optimiser l'allocation des ressources (quais, personnel)
- Prévenir les conflits de planning

Ton expertise:
- Optimisation des tournées
- Gestion des contraintes temporelles
- Allocation intelligente des ressources
- Détection des conflits

Ton ton: Expert, stratégique, orienté solutions`,

      ROUTIER: `${basePrompt}Tu es l'Assistant Routier, spécialisé dans la planification transport.

Tes responsabilités:
- Optimiser les itinéraires de livraison
- Calculer les temps de trajet et coûts
- Gérer les contraintes réglementaires (temps de conduite, repos)
- Assister dans le choix des transporteurs

Ton expertise:
- Réglementation transport routier
- Optimisation d'itinéraires
- Calcul de coûts de transport
- Respect des temps de conduite

Ton ton: Pratique, réglementaire, efficient`,

      QUAI_WMS: `${basePrompt}Tu es l'Assistant Quai & WMS, spécialisé en gestion d'entrepôt.

Tes responsabilités:
- Optimiser la gestion des quais de chargement/déchargement
- Gérer les files d'attente de chauffeurs
- Coordonner les opérations de manutention
- Suivre les stocks et emplacements

Ton expertise:
- Gestion de quai
- Système WMS
- Check-in chauffeurs
- Optimisation des flux

Ton ton: Opérationnel, organisé, efficace`,

      LIVRAISONS: `${basePrompt}Tu es l'Assistant Livraisons, spécialisé dans le suivi des livraisons.

Tes responsabilités:
- Suivre l'état des livraisons en temps réel
- Gérer les retards et incidents
- Fournir des ETAs précis
- Coordonner avec les destinataires

Ton expertise:
- Suivi GPS
- Gestion des retards
- Communication client
- Preuve de livraison (eCMR)

Ton ton: Proactif, transparent, orienté client`,

      EXPEDITION: `${basePrompt}Tu es l'Assistant Expédition, spécialisé dans la préparation des commandes.

Tes responsabilités:
- Assister dans la préparation des expéditions
- Gérer les documents de transport
- Optimiser le chargement des véhicules
- Vérifier la conformité des envois

Ton expertise:
- Préparation de commandes
- Documents de transport
- Optimisation du chargement
- Contrôle qualité

Ton ton: Méthodique, précis, vigilant`,

      FREIGHT_IA: `${basePrompt}Tu es Freight IA, l'assistant d'affrètement intelligent.

Tes responsabilités:
- Aider à trouver les meilleurs transporteurs
- Analyser et comparer les offres
- Négocier les tarifs
- Automatiser le processus d'affrètement

Ton expertise:
- Scoring des transporteurs
- Analyse tarifaire
- Négociation automatique
- Sélection optimale

Ton ton: Analytique, stratégique, orienté ROI`,

      COPILOTE_CHAUFFEUR: `${basePrompt}Tu es le Copilote Chauffeur, l'assistant mobile pour les conducteurs.

Tes responsabilités:
- Guider les chauffeurs sur leurs missions
- Fournir des informations en temps réel
- Assister dans les procédures de livraison
- Gérer les imprévus sur la route

Ton expertise:
- Navigation et itinéraires
- Procédures de livraison
- Gestion des incidents
- Communication temps réel

Ton ton: Simple, clair, rassurant`
    };

    let prompt = chatbotPrompts[chatbotType] || basePrompt;

    // Ajouter le contexte additionnel si fourni
    if (context.orderNumber) {
      prompt += `\n\nCommande en cours: #${context.orderNumber}`;
    }
    if (context.module) {
      prompt += `\n\nModule concerné: ${context.module}`;
    }
    if (context.priority) {
      prompt += `\n\nPriorité: ${context.priority}`;
    }

    prompt += `\n\nRègles importantes:
- Réponds toujours en français
- Sois concis mais complet
- Si tu ne sais pas, dis-le honnêtement
- Pour les problèmes techniques critiques, recommande de contacter un technicien
- Fournis des étapes claires et numérotées quand c'est pertinent
- Utilise des exemples concrets liés au transport/logistique`;

    return prompt;
  }

  /**
   * Construit le tableau de messages pour Claude
   */
  _buildMessages(conversationHistory, currentMessage) {
    const messages = [];

    // Ajouter l'historique (limité aux 10 derniers messages pour économiser les tokens)
    const recentHistory = conversationHistory.slice(-10);

    for (const msg of recentHistory) {
      messages.push({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.message
      });
    }

    // Ajouter le message actuel
    messages.push({
      role: 'user',
      content: currentMessage
    });

    return messages;
  }

  /**
   * Analyse le sentiment/priorité d'un message
   * Utile pour la détection automatique de priorité
   */
  async analyzePriority(message) {
    if (!this.enabled) {
      // Fallback: analyse basique par mots-clés
      const urgentKeywords = ['urgent', 'critique', 'bloqué', 'panne', 'erreur', 'ne fonctionne pas'];
      const isUrgent = urgentKeywords.some(keyword => message.toLowerCase().includes(keyword));
      return isUrgent ? 'CRITICAL' : 'STANDARD';
    }

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 100,
        system: 'Tu es un analyseur de priorité. Réponds uniquement par: CRITICAL, IMPORTANT ou STANDARD',
        messages: [{
          role: 'user',
          content: `Analyse la priorité de ce message support:\n\n"${message}"\n\nRéponds uniquement par: CRITICAL, IMPORTANT ou STANDARD`
        }]
      });

      const priority = response.content[0].text.trim().toUpperCase();
      return ['CRITICAL', 'IMPORTANT', 'STANDARD'].includes(priority) ? priority : 'STANDARD';

    } catch (error) {
      console.error('Erreur analyse priorité:', error.message);
      return 'STANDARD';
    }
  }

  /**
   * Vérifie si le service est actif
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Obtient les statistiques d'utilisation
   */
  getStats() {
    return {
      enabled: this.enabled,
      model: this.model,
      maxTokens: this.maxTokens
    };
  }
}

module.exports = { ClaudeIntegrationService };
