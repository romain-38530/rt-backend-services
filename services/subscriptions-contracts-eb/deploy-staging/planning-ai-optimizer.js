/**
 * ============================================================================
 * Planning AI Optimizer Service
 * ============================================================================
 * Service d'optimisation IA pour le planning utilisant Claude
 * Résolution de conflits, optimisation des créneaux, prédictions
 * ============================================================================
 */

const { ClaudeIntegrationService } = require('./claude-integration');

class PlanningAIOptimizer {
  constructor() {
    this.claudeService = new ClaudeIntegrationService();
    console.log('✅ Planning AI Optimizer initialized:', this.claudeService.isEnabled());
  }

  /**
   * Optimise l'allocation des créneaux pour un jour donné
   * Suggère le meilleur planning en fonction des contraintes
   */
  async optimizeSlotAllocation(sitePlanning, rdvRequests, availableSlots, constraints = {}) {
    if (!this.claudeService.isEnabled()) {
      return { optimized: false, allocation: null };
    }

    try {
      const siteName = sitePlanning.site?.name || 'Site';
      const docksInfo = (sitePlanning.docks || []).map(d => ({
        id: d.dockId,
        name: d.name,
        capacity: d.capacity,
        type: d.type
      }));

      const rdvInfo = rdvRequests.map(rdv => ({
        id: rdv.rdvId || rdv._id,
        carrier: rdv.carrierName || 'Inconnu',
        type: rdv.transportType || 'standard',
        flow: rdv.flowType || 'loading',
        priority: rdv.priority || 'standard',
        duration: rdv.estimatedDuration || 30,
        preferredTime: rdv.preferredTime || null,
        constraints: rdv.constraints || {}
      }));

      const slotsInfo = availableSlots.map(s => ({
        slotId: s.slotId,
        startTime: s.startTime,
        endTime: s.endTime,
        dockId: s.dockId,
        available: s.status === 'available'
      }));

      const prompt = `Tu es un expert en optimisation de planning logistique. Optimise l'allocation des RDV sur les créneaux disponibles.

Site: ${siteName}
Quais disponibles:
${JSON.stringify(docksInfo, null, 2)}

Demandes de RDV:
${JSON.stringify(rdvInfo, null, 2)}

Créneaux disponibles:
${JSON.stringify(slotsInfo.slice(0, 20), null, 2)}

Contraintes:
- Prioriser les RDV urgents
- Éviter les changements de quai pour un même transporteur
- Minimiser les temps morts
- Respecter les capacités des quais

Fournis une allocation optimale en JSON:
{
  "allocations": [
    {
      "rdvId": "id_rdv",
      "slotId": "id_slot",
      "dockId": "id_quai",
      "startTime": "HH:MM",
      "reason": "raison du choix"
    }
  ],
  "conflicts": ["conflit éventuel"],
  "efficiencyScore": 85,
  "recommendations": ["recommandation1", "recommandation2"]
}`;

      const response = await this.claudeService.client.messages.create({
        model: this.claudeService.model,
        max_tokens: 2500,
        system: 'Tu es un expert en optimisation logistique. Réponds uniquement en JSON valide.',
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const allocationText = response.content[0].text;
      const jsonMatch = allocationText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const allocation = JSON.parse(jsonMatch[0]);
        return {
          optimized: true,
          allocation,
          tokensUsed: response.usage
        };
      }

      return { optimized: false, allocation: null };

    } catch (error) {
      console.error('❌ Erreur optimisation allocation:', error.message);
      return { optimized: false, allocation: null, error: error.message };
    }
  }

  /**
   * Résout automatiquement les conflits de planning
   * Propose des solutions alternatives
   */
  async resolveSchedulingConflicts(conflicts, sitePlanning, allRdvs = []) {
    if (!this.claudeService.isEnabled() || conflicts.length === 0) {
      return { resolved: false, solutions: [] };
    }

    try {
      const conflictsInfo = conflicts.map(c => ({
        type: c.type || 'overlap',
        rdv1: c.rdv1?.rdvId || 'N/A',
        rdv2: c.rdv2?.rdvId || 'N/A',
        slot: c.slotId || 'N/A',
        dock: c.dockId || 'N/A',
        severity: c.severity || 'medium'
      }));

      const rdvs = allRdvs.slice(0, 10).map(r => ({
        id: r.rdvId,
        carrier: r.carrierName,
        time: r.scheduledTime,
        priority: r.priority,
        flexible: r.isFlexible || false
      }));

      const prompt = `Tu es un expert en résolution de conflits de planning. Analyse ces conflits et propose des solutions.

Site: ${sitePlanning.site?.name || 'Site'}
Nombre de quais: ${sitePlanning.docks?.length || 0}

Conflits détectés:
${JSON.stringify(conflictsInfo, null, 2)}

RDV concernés:
${JSON.stringify(rdvs, null, 2)}

Propose des solutions en JSON:
{
  "solutions": [
    {
      "conflictId": 0,
      "strategy": "RESCHEDULE|REASSIGN|SPLIT|CANCEL",
      "actions": [
        {
          "rdvId": "id",
          "action": "move_to_slot",
          "newTime": "HH:MM",
          "newDock": "dock_id"
        }
      ],
      "impact": "faible|moyen|élevé",
      "reasoning": "explication"
    }
  ],
  "priority": "ordre de résolution suggéré"
}`;

      const response = await this.claudeService.client.messages.create({
        model: this.claudeService.model,
        max_tokens: 2000,
        system: 'Tu es un expert en résolution de conflits logistiques. Réponds uniquement en JSON valide.',
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const solutionsText = response.content[0].text;
      const jsonMatch = solutionsText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          resolved: true,
          solutions: result.solutions || [],
          priority: result.priority,
          tokensUsed: response.usage
        };
      }

      return { resolved: false, solutions: [] };

    } catch (error) {
      console.error('❌ Erreur résolution conflits:', error.message);
      return { resolved: false, solutions: [], error: error.message };
    }
  }

  /**
   * Prédit les goulots d'étranglement futurs
   * Analyse les tendances et anticipe les problèmes
   */
  async predictBottlenecks(sitePlanning, historicalData, upcomingRdvs) {
    if (!this.claudeService.isEnabled()) {
      return { predicted: false, bottlenecks: [] };
    }

    try {
      const historical = historicalData.slice(-30).map(h => ({
        date: h.date,
        totalRdvs: h.totalRdvs || 0,
        delays: h.delays || 0,
        cancellations: h.cancellations || 0,
        occupancyRate: h.occupancyRate || 0
      }));

      const upcoming = upcomingRdvs.slice(0, 20).map(r => ({
        date: r.scheduledDate,
        count: r.count || 1,
        type: r.transportType
      }));

      const prompt = `Tu es un analyste expert en logistique. Prédis les goulots d'étranglement potentiels.

Site: ${sitePlanning.site?.name || 'Site'}
Capacité: ${sitePlanning.docks?.length || 0} quais

Données historiques (30 derniers jours):
${JSON.stringify(historical, null, 2)}

RDV à venir (20 prochains):
${JSON.stringify(upcoming, null, 2)}

Analyse et fournis en JSON:
{
  "bottlenecks": [
    {
      "date": "YYYY-MM-DD",
      "severity": "low|medium|high",
      "type": "capacity|equipment|timing",
      "description": "description du problème",
      "impact": "impact estimé",
      "mitigation": ["action1", "action2"]
    }
  ],
  "trends": {
    "occupancyTrend": "stable|increasing|decreasing",
    "delayTrend": "improving|stable|worsening"
  },
  "recommendations": ["recommandation générale 1", "recommandation 2"]
}`;

      const response = await this.claudeService.client.messages.create({
        model: this.claudeService.model,
        max_tokens: 2000,
        system: 'Tu es un analyste expert en logistique. Réponds uniquement en JSON valide.',
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const predictionText = response.content[0].text;
      const jsonMatch = predictionText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const prediction = JSON.parse(jsonMatch[0]);
        return {
          predicted: true,
          bottlenecks: prediction.bottlenecks || [],
          trends: prediction.trends,
          recommendations: prediction.recommendations,
          tokensUsed: response.usage
        };
      }

      return { predicted: false, bottlenecks: [] };

    } catch (error) {
      console.error('❌ Erreur prédiction goulots:', error.message);
      return { predicted: false, bottlenecks: [], error: error.message };
    }
  }

  /**
   * Suggère une réorganisation optimale du planning
   * En cas de retard ou problème majeur
   */
  async suggestReorganization(sitePlanning, currentRdvs, issue) {
    if (!this.claudeService.isEnabled()) {
      return { suggested: false, reorganization: null };
    }

    try {
      const rdvs = currentRdvs.slice(0, 15).map(r => ({
        id: r.rdvId,
        carrier: r.carrierName,
        scheduledTime: r.scheduledTime,
        status: r.status,
        priority: r.priority,
        flexible: r.isFlexible || false
      }));

      const prompt = `Tu es un expert en gestion de crise logistique. Un problème est survenu, propose une réorganisation.

Site: ${sitePlanning.site?.name || 'Site'}

Problème:
Type: ${issue.type || 'Inconnu'}
Description: ${issue.description || 'N/A'}
Impact: ${issue.impact || 'N/A'}
Heure du problème: ${issue.time || 'maintenant'}

RDV actuels:
${JSON.stringify(rdvs, null, 2)}

Propose une réorganisation en JSON:
{
  "strategy": "description de la stratégie",
  "changes": [
    {
      "rdvId": "id",
      "action": "reschedule|cancel|prioritize",
      "newTime": "HH:MM" ou null,
      "notifyCarrier": true/false,
      "message": "message pour le transporteur"
    }
  ],
  "timeline": "délai de mise en œuvre",
  "risks": ["risque1", "risque2"],
  "benefits": ["bénéfice1", "bénéfice2"]
}`;

      const response = await this.claudeService.client.messages.create({
        model: this.claudeService.model,
        max_tokens: 2000,
        system: 'Tu es un expert en gestion de crise logistique. Réponds uniquement en JSON valide.',
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const reorganizationText = response.content[0].text;
      const jsonMatch = reorganizationText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const reorganization = JSON.parse(jsonMatch[0]);
        return {
          suggested: true,
          reorganization,
          tokensUsed: response.usage
        };
      }

      return { suggested: false, reorganization: null };

    } catch (error) {
      console.error('❌ Erreur suggestion réorganisation:', error.message);
      return { suggested: false, reorganization: null, error: error.message };
    }
  }

  /**
   * Analyse l'efficacité du planning actuel
   * Fournis des métriques et recommandations d'amélioration
   */
  async analyzePlanningEfficiency(sitePlanning, rdvs, metrics) {
    if (!this.claudeService.isEnabled()) {
      return { analyzed: false, insights: null };
    }

    try {
      const metricsInfo = {
        totalRdvs: metrics.totalRdvs || 0,
        onTimeRate: metrics.onTimeRate || 0,
        occupancyRate: metrics.occupancyRate || 0,
        averageWaitTime: metrics.averageWaitTime || 0,
        noShowRate: metrics.noShowRate || 0,
        averageProcessingTime: metrics.averageProcessingTime || 0
      };

      const prompt = `Tu es un consultant en optimisation logistique. Analyse l'efficacité de ce planning.

Site: ${sitePlanning.site?.name || 'Site'}
Configuration: ${sitePlanning.docks?.length || 0} quais, ${sitePlanning.slotConfig?.defaultDuration || 30}min par créneau

Métriques actuelles:
${JSON.stringify(metricsInfo, null, 2)}

Fournis une analyse en JSON:
{
  "overallScore": 75,
  "strengths": ["point fort 1", "point fort 2"],
  "weaknesses": ["point faible 1", "point faible 2"],
  "quickWins": [
    {
      "action": "action rapide",
      "expectedImprovement": "amélioration attendue",
      "effort": "low|medium|high"
    }
  ],
  "longTermImprovements": ["amélioration structurelle 1", "amélioration 2"],
  "benchmarkComparison": "comparaison avec les standards du secteur"
}`;

      const response = await this.claudeService.client.messages.create({
        model: this.claudeService.model,
        max_tokens: 1800,
        system: 'Tu es un consultant en optimisation logistique. Réponds uniquement en JSON valide.',
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
      console.error('❌ Erreur analyse efficacité:', error.message);
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

module.exports = { PlanningAIOptimizer };
