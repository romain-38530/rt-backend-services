/**
 * ============================================================================
 * Storage Market AI Enhancement Service
 * ============================================================================
 * Service d'amélioration IA pour la Bourse de Stockage utilisant Claude
 * Assistance rédaction appels d'offres, uniformisation, analyse réponses
 * ============================================================================
 */

const { ClaudeIntegrationService } = require('./claude-integration');

class StorageMarketAIEnhancement {
  constructor() {
    this.claudeService = new ClaudeIntegrationService();
    console.log('✅ Storage Market AI Enhancement initialized:', this.claudeService.isEnabled());
  }

  /**
   * Assistance IA à la rédaction d'un appel d'offres de stockage
   * Génère un cahier des charges structuré et professionnel
   */
  async generateStorageRFP(needDetails, companyContext = {}) {
    if (!this.claudeService.isEnabled()) {
      return { generated: false, rfp: null };
    }

    try {
      const prompt = `Tu es un expert en logistique et appels d'offres. Génère un cahier des charges professionnel pour ce besoin de stockage.

Besoin de stockage:
- Type: ${needDetails.storageType || 'Non spécifié'} (temporaire, long terme, picking, cross-dock, douane)
- Volume: ${needDetails.volume || 'Non spécifié'} (m², palettes, mètres linéaires ou m³)
- Durée: ${needDetails.duration || 'Non spécifié'} (dates début/fin, flexibilité)
- Localisation: ${JSON.stringify(needDetails.location || {})}
- Contraintes: ${JSON.stringify(needDetails.constraints || {})}
- Infrastructure requise: ${JSON.stringify(needDetails.infrastructure || {})}
- Activité: ${JSON.stringify(needDetails.activity || {})}

Contexte entreprise:
- Secteur: ${companyContext.industry || 'Non spécifié'}
- Références: ${companyContext.references || 'Non spécifié'}

Génère un cahier des charges en sections structurées:

1. PRÉSENTATION DU BESOIN (2-3 phrases)
2. CARACTÉRISTIQUES TECHNIQUES
   - Type de stockage et volumes
   - Durée et flexibilité
   - Localisation géographique
3. CONTRAINTES OPÉRATIONNELLES
   - Conditions (température, ADR, sécurité)
   - Infrastructure (quais, levage, manutention)
   - Activité (horaires, fréquence mouvements)
4. CRITÈRES DE SÉLECTION
   - Prix, Proximité, Fiabilité, Services
5. DOCUMENTS À FOURNIR PAR LE LOGISTICIEN
6. MODALITÉS DE RÉPONSE

Format professionnel, clair et structuré. Utilise des listes à puces pour la lisibilité.`;

      const response = await this.claudeService.client.messages.create({
        model: this.claudeService.model,
        max_tokens: 2500,
        system: 'Tu es un expert en logistique et rédaction d\'appels d\'offres. Rédige de manière professionnelle et structurée.',
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const rfpText = response.content[0].text;

      return {
        generated: true,
        rfp: rfpText,
        tokensUsed: response.usage
      };

    } catch (error) {
      console.error('❌ Erreur génération RFP stockage:', error.message);
      return { generated: false, rfp: null, error: error.message };
    }
  }

  /**
   * Uniformise et améliore un appel d'offres existant
   * Standardise le format et complète les informations manquantes
   */
  async standardizeStorageRFP(existingRFP, needDetails = {}) {
    if (!this.claudeService.isEnabled()) {
      return { standardized: false, rfp: null };
    }

    try {
      const prompt = `Tu es un expert en standardisation d'appels d'offres logistiques. Améliore et uniformise ce cahier des charges de stockage.

Cahier des charges actuel:
${existingRFP}

Informations supplémentaires disponibles:
${JSON.stringify(needDetails, null, 2)}

Tâches:
1. Restructurer selon le format standard (Présentation, Caractéristiques techniques, Contraintes, Critères sélection, Documents, Modalités)
2. Compléter les informations manquantes si disponibles
3. Clarifier les points ambigus
4. Uniformiser la terminologie professionnelle
5. Ajouter les éléments critiques oubliés

Produis un cahier des charges amélioré, complet et professionnel.`;

      const response = await this.claudeService.client.messages.create({
        model: this.claudeService.model,
        max_tokens: 2500,
        system: 'Tu es un expert en standardisation d\'appels d\'offres. Améliore la qualité et la complétude du document.',
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const standardizedRFP = response.content[0].text;

      return {
        standardized: true,
        rfp: standardizedRFP,
        tokensUsed: response.usage
      };

    } catch (error) {
      console.error('❌ Erreur standardisation RFP:', error.message);
      return { standardized: false, rfp: null, error: error.message };
    }
  }

  /**
   * Analyse intelligente des réponses des logisticiens
   * Compare et classe les offres selon des critères pondérés
   */
  async analyzeLogisticianResponses(responses, originalNeed, criteria = {}) {
    if (!this.claudeService.isEnabled() || responses.length === 0) {
      return { analyzed: false, analysis: null };
    }

    try {
      const responsesInfo = responses.map((r, idx) => ({
        id: idx + 1,
        logistician: r.logisticianName || 'Inconnu',
        pricePerM2: r.pricing?.pricePerM2 || 'N/A',
        pricePerPallet: r.pricing?.pricePerPallet || 'N/A',
        setupFees: r.pricing?.setupFees || 'N/A',
        movementFees: r.pricing?.movementFees || 'N/A',
        totalEstimated: r.pricing?.totalEstimated || 'N/A',
        location: r.location || 'N/A',
        distance: r.distanceKm || 'N/A',
        availabilityDate: r.availabilityDate || 'N/A',
        certifications: r.certifications || [],
        services: r.services || [],
        wmsIntegration: r.wmsIntegration || false,
        responseTime: r.responseTimeHours || 'N/A',
        comments: r.comments || ''
      }));

      const prompt = `Tu es un expert en sélection de prestataires logistiques. Analyse ces réponses pour ce besoin de stockage.

Besoin initial:
- Type: ${originalNeed.storageType || 'Non spécifié'}
- Volume: ${originalNeed.volume || 'Non spécifié'}
- Durée: ${originalNeed.duration || 'Non spécifié'}
- Localisation: ${JSON.stringify(originalNeed.location || {})}
- Budget indicatif: ${originalNeed.budget || 'Non spécifié'} EUR

Critères de pondération:
- Prix: ${criteria.priceWeight || 40}%
- Proximité: ${criteria.proximityWeight || 25}%
- Qualité/Certifications: ${criteria.qualityWeight || 20}%
- Services/Intégration: ${criteria.servicesWeight || 15}%

Réponses reçues:
${JSON.stringify(responsesInfo, null, 2)}

Fournis une analyse complète en JSON:
{
  "ranking": [
    {
      "logisticianId": 1,
      "rank": 1,
      "overallScore": 92,
      "priceScore": 85,
      "proximityScore": 95,
      "qualityScore": 90,
      "servicesScore": 98,
      "strengths": ["point fort 1", "point fort 2"],
      "weaknesses": ["point faible éventuel"],
      "recommendation": "HIGHLY_RECOMMENDED|RECOMMENDED|ACCEPTABLE|NOT_RECOMMENDED"
    }
  ],
  "topChoice": {
    "logisticianId": 1,
    "justification": "Pourquoi ce choix est le meilleur"
  },
  "priceComparison": {
    "lowest": prix_le_plus_bas,
    "highest": prix_le_plus_haut,
    "average": prix_moyen,
    "bestValue": "Qui offre le meilleur rapport qualité/prix"
  },
  "warnings": ["alerte1 si applicable", "alerte2"],
  "negotiationOpportunities": ["opportunité de négociation 1", "opportunité 2"],
  "summary": "Résumé global de l'analyse en 2-3 phrases"
}`;

      const response = await this.claudeService.client.messages.create({
        model: this.claudeService.model,
        max_tokens: 3000,
        system: 'Tu es un expert en analyse comparative d\'offres logistiques. Réponds uniquement en JSON valide.',
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const analysisText = response.content[0].text;
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        return {
          analyzed: true,
          analysis,
          tokensUsed: response.usage
        };
      }

      return { analyzed: false, analysis: null };

    } catch (error) {
      console.error('❌ Erreur analyse réponses stockage:', error.message);
      return { analyzed: false, analysis: null, error: error.message };
    }
  }

  /**
   * Extrait et structure les informations clés d'une réponse logisticien
   * Normalise les données pour faciliter la comparaison
   */
  async extractResponseData(rawResponse, needContext = {}) {
    if (!this.claudeService.isEnabled()) {
      return { extracted: false, data: null };
    }

    try {
      const prompt = `Tu es un expert en extraction de données logistiques. Extrait et structure les informations de cette réponse.

Réponse brute du logisticien:
${rawResponse}

Contexte du besoin:
${JSON.stringify(needContext, null, 2)}

Extrait et structure en JSON:
{
  "pricing": {
    "pricePerM2": nombre_ou_null,
    "pricePerPallet": nombre_ou_null,
    "setupFees": nombre_ou_null,
    "movementFees": nombre_ou_null,
    "monthlyTotal": nombre_estimé,
    "currency": "EUR"
  },
  "location": {
    "address": "adresse complète",
    "city": "ville",
    "postalCode": "code postal",
    "country": "pays"
  },
  "capacity": {
    "totalM2": nombre,
    "availableM2": nombre,
    "totalPallets": nombre,
    "availablePallets": nombre
  },
  "infrastructure": {
    "docks": nombre,
    "ceilingHeight": nombre_metres,
    "temperatureControlled": true/false,
    "adrCertified": true/false,
    "customsBonded": true/false
  },
  "services": ["service1", "service2"],
  "certifications": ["cert1", "cert2"],
  "wmsIntegration": true/false,
  "availabilityDate": "YYYY-MM-DD",
  "offerValidityDate": "YYYY-MM-DD",
  "keyPoints": ["point clé 1", "point clé 2"]
}

Si une information n'est pas trouvée, mets null.`;

      const response = await this.claudeService.client.messages.create({
        model: this.claudeService.model,
        max_tokens: 1500,
        system: 'Tu es un expert en extraction de données. Réponds uniquement en JSON valide.',
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const dataText = response.content[0].text;
      const jsonMatch = dataText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const extractedData = JSON.parse(jsonMatch[0]);
        return {
          extracted: true,
          data: extractedData,
          tokensUsed: response.usage
        };
      }

      return { extracted: false, data: null };

    } catch (error) {
      console.error('❌ Erreur extraction données:', error.message);
      return { extracted: false, data: null, error: error.message };
    }
  }

  /**
   * Suggère des questions de clarification pour un logisticien
   * Identifie les points manquants ou ambigus dans une réponse
   */
  async suggestClarificationQuestions(logisticianResponse, originalNeed) {
    if (!this.claudeService.isEnabled()) {
      return { suggested: false, questions: [] };
    }

    try {
      const prompt = `Tu es un expert en appels d'offres logistiques. Identifie les points à clarifier dans cette réponse.

Besoin initial:
${JSON.stringify(originalNeed, null, 2)}

Réponse du logisticien:
${JSON.stringify(logisticianResponse, null, 2)}

Analyse la réponse et identifie:
1. Les informations manquantes critiques
2. Les points ambigus nécessitant clarification
3. Les incohérences éventuelles

Fournis en JSON:
{
  "missingInfo": [
    {
      "category": "pricing|capacity|infrastructure|services|timeline",
      "question": "Question précise à poser",
      "importance": "critical|high|medium|low",
      "reason": "Pourquoi cette information est importante"
    }
  ],
  "ambiguousPoints": [
    {
      "point": "Point ambigu identifié",
      "clarificationQuestion": "Question pour clarifier",
      "importance": "high|medium|low"
    }
  ],
  "inconsistencies": [
    {
      "issue": "Incohérence détectée",
      "question": "Question pour résoudre l'incohérence"
    }
  ],
  "additionalQuestions": ["Question bonus 1", "Question bonus 2"],
  "completenessScore": 75
}`;

      const response = await this.claudeService.client.messages.create({
        model: this.claudeService.model,
        max_tokens: 1800,
        system: 'Tu es un expert en qualification d\'offres. Réponds uniquement en JSON valide.',
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const questionsText = response.content[0].text;
      const jsonMatch = questionsText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          suggested: true,
          questions: result,
          tokensUsed: response.usage
        };
      }

      return { suggested: false, questions: [] };

    } catch (error) {
      console.error('❌ Erreur suggestions questions:', error.message);
      return { suggested: false, questions: [], error: error.message };
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

module.exports = { StorageMarketAIEnhancement };
