/**
 * Module Prefacturation & Facturation Transport
 * RT Technologie - SYMPHONI.A API v1.0.0
 *
 * 5 Blocs:
 * 1. Prefacturation Automatique
 * 2. Detection d'Ecarts Tarifaires
 * 3. Validation Transporteur (OCR)
 * 4. Blocages Automatiques
 * 5. Facture Finale & Export ERP
 *
 * Archivage legal 10 ans
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const cron = require('node-cron');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const moment = require('moment');
const xml2js = require('xml2js');
const nodemailer = require('nodemailer');
const { SESClient, SendEmailCommand, SendRawEmailCommand } = require('@aws-sdk/client-ses');
const Mailgun = require('mailgun.js');
const FormData = require('form-data');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Route alias: /api/v1/billing/* -> /api/billing/*
app.use('/api/v1/billing', (req, res, next) => {
  req.url = '/api/billing' + req.url;
  next('route');
});
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/v1/billing')) {
    req.url = req.originalUrl.replace('/api/v1/billing', '/api/billing');
  }
  next();
});

// Multer pour upload fichiers
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// ===========================================
// CONFIGURATION
// ===========================================
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/billing';
const JWT_SECRET = process.env.JWT_SECRET || 'RtProd2026KeyAuth0MainToken123456XY';
const VALIDATION_TIMEOUT_DAYS = 7;
const ARCHIVE_RETENTION_YEARS = 10;

// TVA France
const TVA_RATE = 0.20;

// ===========================================
// EXTERNAL APIS CONFIGURATION
// ===========================================
const ORDERS_API_URL = process.env.ORDERS_API_URL || 'http://rt-orders-api-prod-v2.eba-4tprbbqu.eu-central-1.elasticbeanstalk.com';
const KPI_API_URL = process.env.KPI_API_URL || 'http://rt-kpi-api-prod.eba-ptuvs3pm.eu-central-1.elasticbeanstalk.com';
const TRACKING_API_URL = process.env.TRACKING_API_URL || 'http://rt-tracking-api-prod.eba-mwnftqbp.eu-central-1.elasticbeanstalk.com';

// ===========================================
// ORDERS SERVICE - Connexion à orders-api
// ===========================================
const OrdersService = {
  /**
   * Récupérer une commande par son numéro
   */
  async getOrderByNumber(orderNumber) {
    try {
      // Essayer d'abord par endpoint dédié, sinon chercher dans la liste
      const response = await axios.get(`${ORDERS_API_URL}/api/orders?orderNumber=${orderNumber}`, {
        timeout: 10000
      });
      const orders = response.data.data || response.data.orders || response.data;
      if (Array.isArray(orders) && orders.length > 0) {
        return orders[0];
      }
      return null;
    } catch (error) {
      console.error('[ORDERS] Error fetching order:', orderNumber, error.message);
      return null;
    }
  },

  /**
   * Récupérer une commande par son ID
   */
  async getOrderById(orderId) {
    try {
      const response = await axios.get(`${ORDERS_API_URL}/api/orders/${orderId}`, {
        timeout: 10000
      });
      // orders-api retourne { success: true, data: {...} }
      return response.data.data || response.data.order || response.data;
    } catch (error) {
      console.error('[ORDERS] Error fetching order by id:', orderId, error.message);
      return null;
    }
  },

  /**
   * Récupérer les commandes livrées d'un transporteur (pour génération préfacturation)
   */
  async getDeliveredOrdersByCarrier(carrierId, startDate, endDate) {
    try {
      const params = new URLSearchParams({
        carrierId,
        status: 'delivered',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });
      const response = await axios.get(`${ORDERS_API_URL}/api/orders?${params}`, {
        timeout: 15000
      });
      return response.data.orders || response.data || [];
    } catch (error) {
      console.error('[ORDERS] Error fetching delivered orders:', error.message);
      return [];
    }
  },

  /**
   * Récupérer les commandes livrées d'un client (industriel)
   */
  async getDeliveredOrdersByClient(organizationId, startDate, endDate) {
    try {
      const params = new URLSearchParams({
        organizationId,
        status: 'delivered',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });
      const response = await axios.get(`${ORDERS_API_URL}/api/orders?${params}`, {
        timeout: 15000
      });
      return response.data.orders || response.data || [];
    } catch (error) {
      console.error('[ORDERS] Error fetching client orders:', error.message);
      return [];
    }
  }
};

// ===========================================
// KPI SERVICE - Récupération des KPI mensuels
// ===========================================
const KPIService = {
  /**
   * Récupérer les KPI d'un transporteur pour le mois passé
   */
  async getCarrierMonthlyKPI(carrierId, month, year) {
    try {
      const response = await axios.get(`${KPI_API_URL}/api/kpi/carrier/${carrierId}/monthly`, {
        params: { month, year },
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.warn('[KPI] Could not fetch carrier KPI:', error.message);
      return null;
    }
  },

  /**
   * Récupérer les statistiques globales d'un transporteur
   */
  async getCarrierStats(carrierId) {
    try {
      const response = await axios.get(`${KPI_API_URL}/api/kpi/carrier/${carrierId}/stats`, {
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.warn('[KPI] Could not fetch carrier stats:', error.message);
      return null;
    }
  }
};

// ===========================================
// CLAUDE AI SERVICE - Analyse KPI & Préconisations
// ===========================================
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const ClaudeAIService = {
  /**
   * Génère une analyse IA des KPI avec préconisations personnalisées
   * @param {Object} kpiData - Données KPI du transporteur
   * @param {String} transporterName - Nom du transporteur
   * @returns {Object} Analyse et préconisations
   */
  async analyzeKPI(kpiData, transporterName) {
    // Si pas de clé API, générer une analyse basique basée sur les règles
    if (!ANTHROPIC_API_KEY) {
      return this.generateBasicAnalysis(kpiData, transporterName);
    }

    try {
      const prompt = `Tu es un expert en logistique transport. Analyse ces KPI d'un transporteur et donne des préconisations concrètes pour améliorer ses performances.

TRANSPORTEUR: ${transporterName}

KPI DU MOIS:
- Livraisons effectuées: ${kpiData.deliveries || 0}
- Taux de ponctualité: ${(kpiData.onTimeRate || 0).toFixed(1)}%
- Nombre d'incidents: ${kpiData.incidents || 0}
- Satisfaction client: ${(kpiData.satisfactionRate || 0).toFixed(1)}/5
- Distance totale: ${(kpiData.totalDistance || 0).toLocaleString('fr-FR')} km
- CA généré: ${(kpiData.revenue || 0).toLocaleString('fr-FR')} €
- Score global: ${kpiData.globalScore || 0}/100

Réponds en JSON avec cette structure exacte:
{
  "summary": "Résumé en 2 phrases maximum de la performance globale",
  "strengths": ["Point fort 1", "Point fort 2"],
  "improvements": ["Axe amélioration 1", "Axe amélioration 2", "Axe amélioration 3"],
  "recommendations": [
    {"priority": "haute", "action": "Action concrète 1", "impact": "Impact attendu"},
    {"priority": "moyenne", "action": "Action concrète 2", "impact": "Impact attendu"},
    {"priority": "basse", "action": "Action concrète 3", "impact": "Impact attendu"}
  ],
  "trend": "hausse" ou "stable" ou "baisse"
}`;

      const response = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        timeout: 15000
      });

      const content = response.data.content[0].text;
      // Extraire le JSON de la réponse
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return this.generateBasicAnalysis(kpiData, transporterName);
    } catch (error) {
      console.warn('[CLAUDE AI] Error:', error.message);
      return this.generateBasicAnalysis(kpiData, transporterName);
    }
  },

  /**
   * Génère une analyse basique sans IA (fallback)
   */
  generateBasicAnalysis(kpiData, transporterName) {
    const punctuality = kpiData.onTimeRate || 0;
    const satisfaction = kpiData.satisfactionRate || 0;
    const incidents = kpiData.incidents || 0;
    const score = kpiData.globalScore || 0;

    const strengths = [];
    const improvements = [];
    const recommendations = [];

    // Analyse ponctualité
    if (punctuality >= 95) {
      strengths.push('Excellente ponctualité des livraisons');
    } else if (punctuality >= 85) {
      strengths.push('Bonne ponctualité globale');
      improvements.push('Optimiser les créneaux de livraison');
      recommendations.push({
        priority: 'moyenne',
        action: 'Analyser les retards récurrents par zone géographique',
        impact: '+3-5% de ponctualité'
      });
    } else {
      improvements.push('Ponctualité à améliorer significativement');
      recommendations.push({
        priority: 'haute',
        action: 'Mettre en place un suivi temps réel des livraisons avec alertes',
        impact: '+10-15% de ponctualité attendu'
      });
    }

    // Analyse satisfaction
    if (satisfaction >= 4.5) {
      strengths.push('Satisfaction client excellente');
    } else if (satisfaction >= 3.5) {
      improvements.push('Satisfaction client à renforcer');
      recommendations.push({
        priority: 'moyenne',
        action: 'Former les chauffeurs à la relation client',
        impact: '+0.5 point de satisfaction'
      });
    } else {
      improvements.push('Satisfaction client critique');
      recommendations.push({
        priority: 'haute',
        action: 'Audit qualité immédiat et plan d\'action correctif',
        impact: 'Éviter la perte de contrats'
      });
    }

    // Analyse incidents
    if (incidents === 0) {
      strengths.push('Zéro incident ce mois');
    } else if (incidents <= 2) {
      improvements.push('Réduire les incidents');
      recommendations.push({
        priority: 'basse',
        action: 'Analyser les causes racines des incidents',
        impact: 'Prévention des récidives'
      });
    } else {
      improvements.push('Trop d\'incidents signalés');
      recommendations.push({
        priority: 'haute',
        action: 'Plan de formation sécurité et manipulation marchandises',
        impact: 'Réduction de 50% des incidents'
      });
    }

    // Recommandation générale selon score
    if (score < 60) {
      recommendations.push({
        priority: 'haute',
        action: 'Rendez-vous bilan avec le responsable exploitation',
        impact: 'Définir un plan de redressement'
      });
    } else if (score < 80) {
      recommendations.push({
        priority: 'moyenne',
        action: 'Optimiser la planification des tournées',
        impact: '+5-10% de productivité'
      });
    } else {
      recommendations.push({
        priority: 'basse',
        action: 'Maintenir les bonnes pratiques et partager avec l\'équipe',
        impact: 'Capitalisation des succès'
      });
    }

    // Déterminer la tendance
    let trend = 'stable';
    if (score >= 80 && punctuality >= 90 && incidents <= 1) {
      trend = 'hausse';
    } else if (score < 60 || punctuality < 80 || incidents > 3) {
      trend = 'baisse';
    }

    // Générer le résumé
    let summary = '';
    if (score >= 80) {
      summary = `${transporterName} affiche d'excellentes performances ce mois avec un score de ${score}/100. La qualité de service est au rendez-vous.`;
    } else if (score >= 60) {
      summary = `${transporterName} présente des performances correctes (${score}/100) mais des axes d'amélioration existent. Focus recommandé sur la ponctualité.`;
    } else {
      summary = `${transporterName} doit améliorer ses performances (${score}/100). Des actions correctives sont nécessaires rapidement.`;
    }

    return {
      summary,
      strengths: strengths.length > 0 ? strengths : ['Engagement dans la démarche qualité'],
      improvements: improvements.length > 0 ? improvements : ['Maintenir le niveau actuel'],
      recommendations: recommendations.slice(0, 3),
      trend
    };
  }
};

// ===========================================
// TARIFF CALCULATION SERVICE
// ===========================================
const TariffCalculationService = {
  /**
   * Calculer le prix d'une commande selon la grille tarifaire
   * Modes de tarification supportés:
   * - 'weight' / 'poids': Tarification au poids (€/kg ou €/tonne)
   * - 'palette' / 'pallet': Tarification à la palette (€/palette)
   * - 'complete' / 'complet' / 'ftl': Tarification au complet (forfait camion)
   * - 'distance': Tarification au km
   * - 'zone': Tarification par zone géographique
   *
   * @param {Object} order - Commande orders-api
   * @param {Object} tariffGrid - Grille tarifaire applicable
   * @returns {Object} Détail du calcul
   */
  calculateOrderPrice(order, tariffGrid) {
    const details = [];
    let totalHT = 0;

    // Extraire les données de la commande
    const distance = order.pricing?.breakdown?.distance || order.pricing?.distance || order.distance || 0;
    const weight = typeof order.cargo?.weight === 'number' ? order.cargo.weight :
                   order.cargo?.weight?.value || order.goods?.weight || 0;
    const pallets = order.cargo?.pallets || order.cargo?.quantity || order.goods?.palettes || order.goods?.quantity || 0;
    const volume = order.cargo?.volume?.value || order.goods?.volume || 0;

    let basePrice = 0;

    // Déterminer le mode de tarification
    const pricingMode = tariffGrid?.pricingMode || tariffGrid?.mode || 'distance';

    console.log(`[TARIF] Mode: ${pricingMode}, Distance: ${distance}km, Poids: ${weight}kg, Palettes: ${pallets}`);

    if (tariffGrid) {
      switch (pricingMode.toLowerCase()) {

        // ========== TARIFICATION AU POIDS ==========
        case 'weight':
        case 'poids':
        case 'kg':
        case 'tonne': {
          const weightRates = tariffGrid.weightRates || tariffGrid.baseRates || [];
          const weightInTonnes = weight / 1000;

          // Trouver le tarif applicable selon le poids
          let applicableRate = weightRates.find(rate => {
            const minWeight = rate.minWeight || rate.minKg || 0;
            const maxWeight = rate.maxWeight || rate.maxKg || Infinity;
            return weight >= minWeight && weight <= maxWeight;
          });

          if (applicableRate) {
            if (applicableRate.pricePerKg) {
              basePrice = weight * applicableRate.pricePerKg;
              details.push({
                item: 'Transport au poids',
                description: `${weight} kg x ${applicableRate.pricePerKg.toFixed(3)} €/kg`,
                quantity: weight,
                unitPrice: applicableRate.pricePerKg,
                total: basePrice
              });
            } else if (applicableRate.pricePerTonne) {
              basePrice = weightInTonnes * applicableRate.pricePerTonne;
              details.push({
                item: 'Transport au poids',
                description: `${weightInTonnes.toFixed(2)} T x ${applicableRate.pricePerTonne.toFixed(2)} €/T`,
                quantity: weightInTonnes,
                unitPrice: applicableRate.pricePerTonne,
                total: basePrice
              });
            } else if (applicableRate.fixedPrice) {
              basePrice = applicableRate.fixedPrice;
              details.push({
                item: 'Forfait poids',
                description: `Tranche ${applicableRate.minWeight || 0}-${applicableRate.maxWeight || '+'} kg`,
                quantity: 1,
                unitPrice: basePrice,
                total: basePrice
              });
            }
          }

          // Majoration distance si définie
          if (tariffGrid.distanceSurcharge && distance > 0) {
            const distancePrice = distance * (tariffGrid.distanceSurcharge.pricePerKm || 0);
            if (distancePrice > 0) {
              details.push({
                item: 'Supplément distance',
                description: `${distance} km x ${tariffGrid.distanceSurcharge.pricePerKm.toFixed(2)} €/km`,
                quantity: distance,
                unitPrice: tariffGrid.distanceSurcharge.pricePerKm,
                total: distancePrice
              });
              basePrice += distancePrice;
            }
          }
          break;
        }

        // ========== TARIFICATION À LA PALETTE ==========
        case 'palette':
        case 'pallet':
        case 'palettes': {
          const paletteRates = tariffGrid.paletteRates || tariffGrid.baseRates || [];

          // Chercher tarif par zone/distance si disponible
          let applicableRate = paletteRates.find(rate => {
            if (rate.zoneFrom && rate.zoneTo) {
              // Tarif par zone - vérifier si applicable
              return true; // Simplification, à améliorer avec géocodage
            }
            const minDist = rate.minKm || rate.minDistance || 0;
            const maxDist = rate.maxKm || rate.maxDistance || Infinity;
            return distance >= minDist && distance <= maxDist;
          });

          if (!applicableRate && paletteRates.length > 0) {
            applicableRate = paletteRates[0]; // Tarif par défaut
          }

          if (applicableRate) {
            const pricePerPalette = applicableRate.pricePerPalette || applicableRate.unitPrice || 25;
            basePrice = pallets * pricePerPalette;
            details.push({
              item: 'Transport palettes',
              description: `${pallets} palette(s) x ${pricePerPalette.toFixed(2)} €`,
              quantity: pallets,
              unitPrice: pricePerPalette,
              total: basePrice
            });

            // Minimum de facturation
            const minimum = applicableRate.minimumCharge || tariffGrid.minimumCharge || 0;
            if (basePrice < minimum) {
              const supplement = minimum - basePrice;
              details.push({
                item: 'Minimum facturation',
                description: `Complément minimum ${minimum.toFixed(2)} €`,
                quantity: 1,
                unitPrice: supplement,
                total: supplement
              });
              basePrice = minimum;
            }
          }

          // Supplément distance si hors zone
          if (tariffGrid.distanceSurcharge && distance > (tariffGrid.distanceSurcharge.freeKm || 0)) {
            const extraKm = distance - (tariffGrid.distanceSurcharge.freeKm || 0);
            const distancePrice = extraKm * (tariffGrid.distanceSurcharge.pricePerKm || 0.5);
            if (distancePrice > 0) {
              details.push({
                item: 'Supplément hors zone',
                description: `${extraKm} km supplémentaires x ${tariffGrid.distanceSurcharge.pricePerKm || 0.5} €/km`,
                quantity: extraKm,
                unitPrice: tariffGrid.distanceSurcharge.pricePerKm || 0.5,
                total: distancePrice
              });
              basePrice += distancePrice;
            }
          }
          break;
        }

        // ========== TARIFICATION AU COMPLET (FTL) ==========
        case 'complete':
        case 'complet':
        case 'ftl':
        case 'full_truck': {
          const ftlRates = tariffGrid.ftlRates || tariffGrid.completeRates || tariffGrid.baseRates || [];

          // Chercher tarif par distance ou zone
          let applicableRate = ftlRates.find(rate => {
            if (rate.zoneFrom && rate.zoneTo) {
              return true; // Simplification
            }
            const minDist = rate.minKm || rate.minDistance || 0;
            const maxDist = rate.maxKm || rate.maxDistance || Infinity;
            return distance >= minDist && distance <= maxDist;
          });

          if (!applicableRate && ftlRates.length > 0) {
            applicableRate = ftlRates[0];
          }

          if (applicableRate) {
            if (applicableRate.fixedPrice || applicableRate.price) {
              basePrice = applicableRate.fixedPrice || applicableRate.price;
              details.push({
                item: 'Camion complet',
                description: `Forfait ${applicableRate.vehicleType || 'standard'} - ${applicableRate.zoneName || distance + ' km'}`,
                quantity: 1,
                unitPrice: basePrice,
                total: basePrice
              });
            } else if (applicableRate.pricePerKm) {
              basePrice = distance * applicableRate.pricePerKm;
              const minPrice = applicableRate.minimumPrice || 200;
              if (basePrice < minPrice) {
                basePrice = minPrice;
                details.push({
                  item: 'Camion complet',
                  description: `Minimum facturation ${minPrice.toFixed(2)} €`,
                  quantity: 1,
                  unitPrice: minPrice,
                  total: minPrice
                });
              } else {
                details.push({
                  item: 'Camion complet',
                  description: `${distance} km x ${applicableRate.pricePerKm.toFixed(2)} €/km`,
                  quantity: distance,
                  unitPrice: applicableRate.pricePerKm,
                  total: basePrice
                });
              }
            }
          }
          break;
        }

        // ========== TARIFICATION PAR ZONE ==========
        case 'zone':
        case 'zones': {
          const zoneRates = tariffGrid.zoneRates || tariffGrid.baseRates || [];
          // Recherche par code postal
          const pickupPostal = order.pickup?.postalCode || order.pickupAddress?.postalCode || '';
          const deliveryPostal = order.delivery?.postalCode || order.deliveryAddress?.postalCode || '';

          const pickupZone = pickupPostal.substring(0, 2);
          const deliveryZone = deliveryPostal.substring(0, 2);

          let applicableRate = zoneRates.find(rate => {
            return rate.zoneFrom === pickupZone && rate.zoneTo === deliveryZone;
          });

          if (applicableRate) {
            basePrice = applicableRate.price || applicableRate.fixedPrice || 0;
            details.push({
              item: 'Transport inter-zones',
              description: `Zone ${pickupZone} → Zone ${deliveryZone}`,
              quantity: 1,
              unitPrice: basePrice,
              total: basePrice
            });
          }
          break;
        }

        // ========== TARIFICATION À LA DISTANCE (défaut) ==========
        case 'distance':
        case 'km':
        default: {
          const distanceRates = tariffGrid.baseRates || tariffGrid.distanceRates || [];

          let applicableRate = distanceRates.find(rate => {
            const minDist = rate.minKm || 0;
            const maxDist = rate.maxKm || Infinity;
            return distance >= minDist && distance <= maxDist;
          });

          if (applicableRate) {
            if (applicableRate.fixedPrice) {
              basePrice = applicableRate.fixedPrice;
              details.push({
                item: 'Prix forfaitaire',
                description: `Forfait ${applicableRate.minKm || 0}-${applicableRate.maxKm || '+'} km`,
                quantity: 1,
                unitPrice: basePrice,
                total: basePrice
              });
            } else if (applicableRate.pricePerKm) {
              basePrice = distance * applicableRate.pricePerKm;
              details.push({
                item: 'Transport',
                description: `${distance} km x ${applicableRate.pricePerKm.toFixed(2)} €/km`,
                quantity: distance,
                unitPrice: applicableRate.pricePerKm,
                total: basePrice
              });
            }
          }
          break;
        }
      }
    }

    // Si pas de prix calculé, utiliser le prix de la commande
    if (basePrice === 0 && (order.pricing?.finalCost || order.pricing?.final || order.pricing?.estimatedCost)) {
      basePrice = order.pricing.finalCost || order.pricing.final || order.pricing.estimatedCost;
      details.push({
        item: 'Prix commande',
        description: 'Prix négocié commande',
        quantity: 1,
        unitPrice: basePrice,
        total: basePrice
      });
    }

    totalHT += basePrice;

    // 2. Options et services
    const services = order.services || {};
    const options = tariffGrid?.options || {};

    // ADR (matières dangereuses)
    if (services.adr || order.cargo?.hazardous) {
      const adrPercent = options.adr || 15;
      const adrPrice = basePrice * (adrPercent / 100);
      details.push({
        item: 'Option ADR',
        description: `Majoration matières dangereuses (+${adrPercent}%)`,
        quantity: 1,
        unitPrice: adrPrice,
        total: adrPrice
      });
      totalHT += adrPrice;
    }

    // Hayon
    if (services.tailgate) {
      const hayonPrice = options.hayon || 35;
      details.push({
        item: 'Hayon élévateur',
        description: 'Service hayon',
        quantity: 1,
        unitPrice: hayonPrice,
        total: hayonPrice
      });
      totalHT += hayonPrice;
    }

    // Transport frigorifique
    if (services.temperature_controlled || order.cargo?.temperature) {
      const frigoPercent = options.frigo || 20;
      const frigoPrice = basePrice * (frigoPercent / 100);
      details.push({
        item: 'Frigorifique',
        description: `Transport température dirigée (+${frigoPercent}%)`,
        quantity: 1,
        unitPrice: frigoPrice,
        total: frigoPrice
      });
      totalHT += frigoPrice;
    }

    // Transport express
    if (order.transportType === 'express') {
      const expressPercent = options.express || 25;
      const expressPrice = basePrice * (expressPercent / 100);
      details.push({
        item: 'Express',
        description: `Majoration express (+${expressPercent}%)`,
        quantity: 1,
        unitPrice: expressPrice,
        total: expressPrice
      });
      totalHT += expressPrice;
    }

    // 3. Palettes échange (frais supplémentaires si échange de palettes)
    if (pallets > 0 && order.cargo?.type === 'palette') {
      const palletPrice = options.palettesEchange || 5;
      const palettesTotal = pallets * palletPrice;
      details.push({
        item: 'Palettes',
        description: `${pallets} palettes x ${palletPrice.toFixed(2)} €`,
        quantity: pallets,
        unitPrice: palletPrice,
        total: palettesTotal
      });
      totalHT += palettesTotal;
    }

    // 4. Temps d'attente (si disponible via tracking)
    // À intégrer avec tracking-api

    // 5. Majorations weekend/nuit
    const pickupDate = new Date(order.pickupDate);
    const dayOfWeek = pickupDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      const weekendPercent = options.weekend || 15;
      const weekendPrice = basePrice * (weekendPercent / 100);
      details.push({
        item: 'Majoration weekend',
        description: `Livraison weekend (+${weekendPercent}%)`,
        quantity: 1,
        unitPrice: weekendPrice,
        total: weekendPrice
      });
      totalHT += weekendPrice;
    }

    // Calcul TVA et TTC
    const tva = totalHT * TVA_RATE;
    const totalTTC = totalHT + tva;

    return {
      basePrice,
      distancePrice: basePrice,
      optionsPrice: totalHT - basePrice,
      waitingTimePrice: 0,
      palettesPrice: details.find(d => d.item === 'Palettes')?.total || 0,
      penalties: 0,
      surcharges: 0,
      discounts: 0,
      totalHT,
      tva,
      totalTTC,
      details
    };
  },

  /**
   * Trouver la grille tarifaire applicable pour un transporteur/client
   */
  async findApplicableTariffGrid(transporterId, clientId) {
    try {
      const TariffGrid = mongoose.model('TariffGrid');
      const now = new Date();

      const grid = await TariffGrid.findOne({
        transporterId,
        clientId,
        active: true,
        validFrom: { $lte: now },
        $or: [
          { validTo: { $exists: false } },
          { validTo: null },
          { validTo: { $gte: now } }
        ]
      }).sort({ validFrom: -1 });

      return grid;
    } catch (error) {
      console.error('[TARIFF] Error finding grid:', error.message);
      return null;
    }
  }
};

// ===========================================
// EMAIL CONFIGURATION (AWS SES + Nodemailer fallback)
// ===========================================
const EMAIL_CONFIG = {
  from: process.env.SMTP_FROM || 'noreply@symphoni-a.com',
  fromName: process.env.SMTP_FROM_NAME || 'SYMPHONI.A - Prefacturation',
  replyTo: process.env.SMTP_REPLY_TO || 'facturation@symphoni-a.com',
  // SMTP fallback (OVH)
  smtp: {
    host: process.env.SMTP_HOST || 'ssl0.ovh.net',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },
  // AWS SES (primary)
  useSES: process.env.USE_AWS_SES === 'true',
  awsRegion: process.env.AWS_REGION || 'eu-central-1'
};

// Initialize AWS SES client
let sesClient = null;
if (EMAIL_CONFIG.useSES) {
  sesClient = new SESClient({ region: EMAIL_CONFIG.awsRegion });
  console.log('[EMAIL] AWS SES initialized for region:', EMAIL_CONFIG.awsRegion);
}

// Initialize Nodemailer transporter (fallback)
let smtpTransporter = null;
if (EMAIL_CONFIG.smtp.user && EMAIL_CONFIG.smtp.pass) {
  smtpTransporter = nodemailer.createTransport({
    host: EMAIL_CONFIG.smtp.host,
    port: EMAIL_CONFIG.smtp.port,
    secure: EMAIL_CONFIG.smtp.secure,
    auth: {
      user: EMAIL_CONFIG.smtp.user,
      pass: EMAIL_CONFIG.smtp.pass
    }
  });
  console.log('[EMAIL] SMTP transporter initialized:', EMAIL_CONFIG.smtp.host);
}

// ===========================================
// EMAIL SERVICE (Mailgun SDK + OVH SMTP fallback)
// ===========================================
const MAILGUN_CONFIG = {
  apiKey: process.env.MAILGUN_API_KEY || 'e80d8b76-ff2acfa2',
  domain: process.env.MAILGUN_DOMAIN || 'rt-technologie.com',
  from: process.env.EMAIL_FROM || 'noreply@rt-technologie.com'
};

// Initialize Mailgun client
const mailgun = new Mailgun(FormData);
let mgClient = null;

function initMailgun() {
  if (MAILGUN_CONFIG.apiKey && MAILGUN_CONFIG.domain) {
    // Use US region by default (like notifications-eb), unless MAILGUN_HOST is set
    const clientConfig = {
      username: 'api',
      key: MAILGUN_CONFIG.apiKey
    };
    // Only add URL if explicitly configured for EU
    if (process.env.MAILGUN_HOST) {
      clientConfig.url = process.env.MAILGUN_HOST;
    }
    mgClient = mailgun.client(clientConfig);
    console.log('[EMAIL] Mailgun client initialized for domain:', MAILGUN_CONFIG.domain,
      process.env.MAILGUN_HOST ? `(${process.env.MAILGUN_HOST})` : '(US region)');
    return true;
  }
  console.warn('[EMAIL] Mailgun not configured - missing API key or domain');
  return false;
}

// Initialize on startup
initMailgun();

const EmailService = {
  // Send via AWS SES (Primary - verified identities available)
  async sendViaSES(to, subject, htmlBody) {
    if (!sesClient) {
      throw new Error('SES client not initialized');
    }

    const toAddresses = Array.isArray(to) ? to : [to];

    const command = new SendEmailCommand({
      Source: `${EMAIL_CONFIG.fromName} <${EMAIL_CONFIG.from}>`,
      Destination: {
        ToAddresses: toAddresses
      },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: htmlBody, Charset: 'UTF-8' }
        }
      },
      ReplyToAddresses: [EMAIL_CONFIG.replyTo]
    });

    const result = await sesClient.send(command);
    console.log('[EMAIL] AWS SES sent to:', toAddresses.join(', '), 'MessageId:', result.MessageId);
    return { success: true, messageId: result.MessageId, provider: 'ses' };
  },

  // Send via Mailgun SDK (Secondary)
  async sendViaMailgun(to, subject, htmlBody) {
    if (!mgClient) {
      throw new Error('Mailgun client not initialized');
    }

    const toAddresses = Array.isArray(to) ? to : [to];

    const result = await mgClient.messages.create(MAILGUN_CONFIG.domain, {
      from: `${EMAIL_CONFIG.fromName} <${MAILGUN_CONFIG.from}>`,
      to: toAddresses,
      subject: subject,
      html: htmlBody,
      'h:Reply-To': EMAIL_CONFIG.replyTo
    });

    console.log('[EMAIL] Mailgun sent to:', toAddresses.join(', '), 'ID:', result.id);
    return { success: true, messageId: result.id, provider: 'mailgun' };
  },

  // Send via SMTP OVH (Fallback)
  async sendViaSMTP(to, subject, htmlBody, textBody, attachments = []) {
    if (!smtpTransporter) {
      throw new Error('SMTP not configured');
    }

    const toAddresses = Array.isArray(to) ? to : [to];
    const mailOptions = {
      from: `${EMAIL_CONFIG.fromName} <${EMAIL_CONFIG.from}>`,
      to: toAddresses.join(', '),
      replyTo: EMAIL_CONFIG.replyTo,
      subject: subject,
      html: htmlBody,
      text: textBody || htmlBody.replace(/<[^>]*>/g, ''),
      attachments: attachments
    };

    const result = await smtpTransporter.sendMail(mailOptions);
    console.log('[EMAIL] OVH SMTP sent to:', toAddresses.join(', '), 'MessageId:', result.messageId);
    return { success: true, messageId: result.messageId, provider: 'smtp' };
  },

  // Main send function (SES first, then Mailgun, then SMTP fallback)
  async send(to, subject, htmlBody, textBody, attachments = []) {
    // Try AWS SES first (verified identities available)
    if (sesClient) {
      try {
        return await this.sendViaSES(to, subject, htmlBody);
      } catch (err) {
        console.warn('[EMAIL] AWS SES failed:', err.message);
      }
    }

    // Try Mailgun second
    if (mgClient) {
      try {
        return await this.sendViaMailgun(to, subject, htmlBody);
      } catch (err) {
        console.warn('[EMAIL] Mailgun failed:', err.message, err.details || '');
      }
    }

    // Fallback to SMTP OVH
    if (smtpTransporter) {
      try {
        return await this.sendViaSMTP(to, subject, htmlBody, textBody, attachments);
      } catch (err) {
        console.warn('[EMAIL] SMTP failed:', err.message);
      }
    }

    throw new Error('All email transports failed');
  }
};

// ===========================================
// EMAIL TEMPLATES
// ===========================================
const EmailTemplates = {
  // Header commun
  header: (title) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #1a237e 0%, #3949ab 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .header .subtitle { opacity: 0.9; font-size: 14px; margin-top: 5px; }
        .content { padding: 30px; color: #333; }
        .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }
        .btn { display: inline-block; padding: 12px 30px; background-color: #3949ab; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        .btn:hover { background-color: #303f9f; }
        .info-box { background-color: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 15px 0; }
        .warning-box { background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 15px 0; }
        .success-box { background-color: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 15px 0; }
        .error-box { background-color: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 15px 0; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
        th { background-color: #f8f9fa; font-weight: 600; }
        .amount { font-size: 24px; font-weight: bold; color: #1a237e; }
        .status { display: inline-block; padding: 5px 10px; border-radius: 3px; font-size: 12px; font-weight: 600; }
        .status-pending { background-color: #fff3e0; color: #e65100; }
        .status-validated { background-color: #e8f5e9; color: #2e7d32; }
        .status-contested { background-color: #ffebee; color: #c62828; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>SYMPHONI.A</h1>
          <div class="subtitle">${title}</div>
        </div>
        <div class="content">
  `,

  // Footer commun
  footer: () => `
        </div>
        <div class="footer">
          <p><strong>RT Technologie - SYMPHONI.A</strong></p>
          <p>Plateforme de gestion logistique et transport</p>
          <p>Cet email a ete envoye automatiquement, merci de ne pas repondre directement.</p>
          <p>Pour toute question: <a href="mailto:support@symphoni-a.com">support@symphoni-a.com</a></p>
        </div>
      </div>
    </body>
    </html>
  `,

  // Template: Nouvelle prefacturation pour transporteur
  newPrefacturationTransporter: (data) => {
    return EmailTemplates.header('Nouvelle Prefacturation') + `
      <p>Bonjour <strong>${data.transporterName}</strong>,</p>

      <p>Une nouvelle prefacturation a ete generee pour votre validation:</p>

      <table>
        <tr><th>Reference</th><td>${data.prefacturationId}</td></tr>
        <tr><th>Commande</th><td>${data.orderId}</td></tr>
        <tr><th>Client</th><td>${data.clientName}</td></tr>
        <tr><th>Date de livraison</th><td>${data.deliveryDate}</td></tr>
        <tr><th>Trajet</th><td>${data.pickupAddress} → ${data.deliveryAddress}</td></tr>
      </table>

      <div class="info-box">
        <p style="margin: 0;"><strong>Montant de la prefacturation:</strong></p>
        <p class="amount" style="margin: 10px 0 0 0;">${data.totalHT.toFixed(2)} EUR HT</p>
        <p style="margin: 5px 0 0 0; font-size: 14px;">TVA: ${data.tva.toFixed(2)} EUR | TTC: ${data.totalTTC.toFixed(2)} EUR</p>
      </div>

      <p>Vous avez <strong>7 jours</strong> pour valider ou contester cette prefacturation.</p>

      <p style="text-align: center;">
        <a href="${data.validationUrl}" class="btn">Valider la prefacturation</a>
      </p>

      <p>Sans reponse de votre part dans le delai imparti, la prefacturation sera automatiquement validee.</p>
    ` + EmailTemplates.footer();
  },

  // Template: Prefacturation validee (confirmation transporteur)
  prefacturationValidatedTransporter: (data) => {
    return EmailTemplates.header('Prefacturation Validee') + `
      <p>Bonjour <strong>${data.transporterName}</strong>,</p>

      <div class="success-box">
        <p style="margin: 0;">Votre prefacturation <strong>${data.prefacturationId}</strong> a ete validee avec succes.</p>
      </div>

      <table>
        <tr><th>Reference</th><td>${data.prefacturationId}</td></tr>
        <tr><th>Commande</th><td>${data.orderId}</td></tr>
        <tr><th>Montant HT</th><td>${data.totalHT.toFixed(2)} EUR</td></tr>
        <tr><th>TVA</th><td>${data.tva.toFixed(2)} EUR</td></tr>
        <tr><th>Montant TTC</th><td><strong>${data.totalTTC.toFixed(2)} EUR</strong></td></tr>
        <tr><th>Validee le</th><td>${data.validatedAt}</td></tr>
      </table>

      <p>Le paiement sera effectue selon les conditions convenues (delai: ${data.paymentTermDays || 30} jours).</p>
    ` + EmailTemplates.footer();
  },

  // Template: Prefacturation contestee
  prefacturationContested: (data) => {
    return EmailTemplates.header('Prefacturation Contestee') + `
      <p>Bonjour,</p>

      <div class="warning-box">
        <p style="margin: 0;">La prefacturation <strong>${data.prefacturationId}</strong> a ete contestee par le transporteur.</p>
      </div>

      <table>
        <tr><th>Reference</th><td>${data.prefacturationId}</td></tr>
        <tr><th>Transporteur</th><td>${data.transporterName}</td></tr>
        <tr><th>Commande</th><td>${data.orderId}</td></tr>
        <tr><th>Montant conteste</th><td>${data.totalHT.toFixed(2)} EUR HT</td></tr>
      </table>

      <div class="error-box">
        <p style="margin: 0;"><strong>Motif de contestation:</strong></p>
        <p style="margin: 10px 0 0 0;">${data.contestReason}</p>
      </div>

      <p>Merci de prendre contact avec le transporteur pour resoudre ce litige.</p>

      <p style="text-align: center;">
        <a href="${data.disputeUrl}" class="btn">Gerer le litige</a>
      </p>
    ` + EmailTemplates.footer();
  },

  // Template: Nouvelle prefacturation pour industriel
  newPrefacturationIndustrial: (data) => {
    return EmailTemplates.header('Nouvelle Prefacturation Transport') + `
      <p>Bonjour <strong>${data.clientName}</strong>,</p>

      <p>Une nouvelle prefacturation transport est disponible pour validation:</p>

      <table>
        <tr><th>Reference</th><td>${data.prefacturationId}</td></tr>
        <tr><th>Transporteur</th><td>${data.transporterName}</td></tr>
        <tr><th>Commande</th><td>${data.orderId}</td></tr>
        <tr><th>Date</th><td>${data.deliveryDate}</td></tr>
        <tr><th>Trajet</th><td>${data.pickupAddress} → ${data.deliveryAddress}</td></tr>
      </table>

      <div class="info-box">
        <p style="margin: 0;"><strong>Montant a regler:</strong></p>
        <p class="amount" style="margin: 10px 0 0 0;">${data.totalTTC.toFixed(2)} EUR TTC</p>
        <p style="margin: 5px 0 0 0; font-size: 14px;">HT: ${data.totalHT.toFixed(2)} EUR | TVA: ${data.tva.toFixed(2)} EUR</p>
      </div>

      <p style="text-align: center;">
        <a href="${data.validationUrl}" class="btn">Voir les details</a>
      </p>
    ` + EmailTemplates.footer();
  },

  // Template: Rappel de validation
  validationReminder: (data) => {
    return EmailTemplates.header('Rappel: Prefacturation en attente') + `
      <p>Bonjour <strong>${data.transporterName}</strong>,</p>

      <div class="warning-box">
        <p style="margin: 0;"><strong>Rappel:</strong> Une prefacturation est en attente de votre validation depuis ${data.daysPending} jours.</p>
      </div>

      <table>
        <tr><th>Reference</th><td>${data.prefacturationId}</td></tr>
        <tr><th>Commande</th><td>${data.orderId}</td></tr>
        <tr><th>Montant HT</th><td>${data.totalHT.toFixed(2)} EUR</td></tr>
        <tr><th>Date limite</th><td><strong>${data.deadline}</strong></td></tr>
      </table>

      <p><strong>Attention:</strong> Sans reponse avant le ${data.deadline}, la prefacturation sera automatiquement validee.</p>

      <p style="text-align: center;">
        <a href="${data.validationUrl}" class="btn">Valider maintenant</a>
      </p>
    ` + EmailTemplates.footer();
  },

  // Template: Export pret
  exportReady: (data) => {
    return EmailTemplates.header('Export Prefacturations Disponible') + `
      <p>Bonjour,</p>

      <div class="success-box">
        <p style="margin: 0;">L'export des prefacturations est pret.</p>
      </div>

      <table>
        <tr><th>Periode</th><td>${data.period}</td></tr>
        <tr><th>Nombre de prefacturations</th><td>${data.count}</td></tr>
        <tr><th>Montant total HT</th><td>${data.totalHT.toFixed(2)} EUR</td></tr>
        <tr><th>Montant total TTC</th><td>${data.totalTTC.toFixed(2)} EUR</td></tr>
        <tr><th>Format</th><td>${data.format}</td></tr>
      </table>

      <p style="text-align: center;">
        <a href="${data.downloadUrl}" class="btn">Telecharger l'export</a>
      </p>

      <p>Ce lien est valide pendant 24 heures.</p>
    ` + EmailTemplates.footer();
  },

  // Template: Ecart detecte
  discrepancyDetected: (data) => {
    return EmailTemplates.header('Ecart Tarifaire Detecte') + `
      <p>Bonjour,</p>

      <div class="error-box">
        <p style="margin: 0;">Un ecart tarifaire a ete detecte sur la prefacturation <strong>${data.prefacturationId}</strong>.</p>
      </div>

      <table>
        <tr><th>Reference</th><td>${data.prefacturationId}</td></tr>
        <tr><th>Transporteur</th><td>${data.transporterName}</td></tr>
        <tr><th>Type d'ecart</th><td>${data.discrepancyType}</td></tr>
        <tr><th>Valeur attendue</th><td>${data.expectedValue}</td></tr>
        <tr><th>Valeur recue</th><td>${data.actualValue}</td></tr>
        <tr><th>Difference</th><td><strong>${data.difference} (${data.differencePercent}%)</strong></td></tr>
      </table>

      <p>Merci de verifier et resoudre cet ecart.</p>

      <p style="text-align: center;">
        <a href="${data.reviewUrl}" class="btn">Examiner l'ecart</a>
      </p>
    ` + EmailTemplates.footer();
  }
};

// ===========================================
// PDF GENERATION SERVICE - Design Professionnel
// ===========================================
const PDFService = {
  // Couleurs corporate
  colors: {
    primary: '#1a237e',      // Bleu foncé
    secondary: '#3949ab',    // Bleu moyen
    accent: '#00bcd4',       // Cyan
    success: '#00c853',      // Vert
    warning: '#ff9800',      // Orange
    danger: '#f44336',       // Rouge
    dark: '#263238',         // Gris foncé
    medium: '#607d8b',       // Gris moyen
    light: '#eceff1',        // Gris clair
    white: '#ffffff'
  },

  /**
   * Dessine un rectangle arrondi
   */
  roundedRect(doc, x, y, width, height, radius) {
    doc.moveTo(x + radius, y)
       .lineTo(x + width - radius, y)
       .quadraticCurveTo(x + width, y, x + width, y + radius)
       .lineTo(x + width, y + height - radius)
       .quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
       .lineTo(x + radius, y + height)
       .quadraticCurveTo(x, y + height, x, y + height - radius)
       .lineTo(x, y + radius)
       .quadraticCurveTo(x, y, x + radius, y);
  },

  /**
   * Dessine une jauge de progression
   */
  drawGauge(doc, x, y, width, height, value, maxValue, color) {
    const percentage = Math.min((value / maxValue) * 100, 100);
    const fillWidth = (width * percentage) / 100;

    // Fond gris
    doc.fillColor(this.colors.light).rect(x, y, width, height).fill();
    // Barre de progression
    doc.fillColor(color).rect(x, y, fillWidth, height).fill();
  },

  /**
   * Génère un PDF de préfacturation avec design professionnel
   */
  async generatePrefacturationPDF(prefacturation) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 40,
          size: 'A4',
          bufferPages: true,
          info: {
            Title: `Préfacturation ${prefacturation.prefacturationId}`,
            Author: 'SYMPHONI.A - RT Technologie',
            Subject: 'Préfacturation Transport',
            Creator: 'SYMPHONI.A Billing System'
          }
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageWidth = 595;
        const margin = 40;
        const contentWidth = pageWidth - (margin * 2);

        // ============================================
        // EN-TÊTE AVEC BANDEAU
        // ============================================

        // Bandeau supérieur dégradé
        doc.rect(0, 0, pageWidth, 100).fill(this.colors.primary);
        doc.rect(0, 95, pageWidth, 8).fill(this.colors.accent);

        // Logo et titre
        doc.fillColor(this.colors.white);
        doc.fontSize(28).font('Helvetica-Bold').text('SYMPHONI.A', margin, 25);
        doc.fontSize(10).font('Helvetica').text('RT Technologie - Control Tower Logistique', margin, 55);

        // Infos document (droite)
        doc.fontSize(9).font('Helvetica');
        doc.text(`N° ${prefacturation.prefacturationId}`, pageWidth - margin - 150, 25, { width: 150, align: 'right' });
        doc.text(`Date: ${moment(prefacturation.createdAt || new Date()).format('DD/MM/YYYY')}`, { width: 150, align: 'right' });

        // Badge statut
        const statusColors = {
          'generated': this.colors.accent,
          'validated': this.colors.success,
          'contested': this.colors.warning,
          'finalized': this.colors.success,
          'draft': this.colors.medium
        };
        const statusColor = statusColors[prefacturation.status] || this.colors.medium;
        const statusText = (prefacturation.status || 'GÉNÉRÉ').toUpperCase();

        doc.fillColor(statusColor);
        doc.roundedRect(pageWidth - margin - 80, 55, 80, 20, 3);
        doc.fill();
        doc.fillColor(this.colors.white).fontSize(8).font('Helvetica-Bold');
        doc.text(statusText, pageWidth - margin - 78, 61, { width: 76, align: 'center' });

        // Titre document
        doc.fillColor(this.colors.dark).fontSize(18).font('Helvetica-Bold');
        doc.text('PRÉFACTURATION', margin, 120, { align: 'center', width: contentWidth });

        let yPos = 155;

        // ============================================
        // SECTION PARTIES (2 colonnes)
        // ============================================

        const colWidth = (contentWidth - 20) / 2;

        // Transporteur (gauche)
        doc.fillColor(this.colors.primary).fontSize(10).font('Helvetica-Bold');
        doc.text('TRANSPORTEUR', margin, yPos);
        yPos += 15;

        doc.fillColor(this.colors.light);
        this.roundedRect(doc, margin, yPos, colWidth, 55, 5);
        doc.fill();

        doc.fillColor(this.colors.dark).fontSize(9).font('Helvetica-Bold');
        doc.text(prefacturation.transporterName || 'Non spécifié', margin + 10, yPos + 8, { width: colWidth - 20 });
        doc.font('Helvetica').fillColor(this.colors.medium).fontSize(8);
        if (prefacturation.transporterSiret) {
          doc.text(`SIRET: ${prefacturation.transporterSiret}`, margin + 10, yPos + 22);
        }
        if (prefacturation.transporterEmail) {
          doc.text(prefacturation.transporterEmail, margin + 10, yPos + 34);
        }

        // Client (droite)
        doc.fillColor(this.colors.primary).fontSize(10).font('Helvetica-Bold');
        doc.text('CLIENT', margin + colWidth + 20, yPos - 15);

        doc.fillColor(this.colors.light);
        this.roundedRect(doc, margin + colWidth + 20, yPos, colWidth, 55, 5);
        doc.fill();

        doc.fillColor(this.colors.dark).fontSize(9).font('Helvetica-Bold');
        doc.text(prefacturation.clientName || 'Non spécifié', margin + colWidth + 30, yPos + 8, { width: colWidth - 20 });
        doc.font('Helvetica').fillColor(this.colors.medium).fontSize(8);
        if (prefacturation.clientSiret) {
          doc.text(`SIRET: ${prefacturation.clientSiret}`, margin + colWidth + 30, yPos + 22);
        }
        if (prefacturation.clientEmail) {
          doc.text(prefacturation.clientEmail, margin + colWidth + 30, yPos + 34);
        }

        yPos += 70;

        // ============================================
        // SECTION MISSION
        // ============================================

        doc.fillColor(this.colors.primary).fontSize(10).font('Helvetica-Bold');
        doc.text('DÉTAILS DE LA MISSION', margin, yPos);
        yPos += 15;

        // Encadré mission
        doc.fillColor(this.colors.light);
        this.roundedRect(doc, margin, yPos, contentWidth, 75, 5);
        doc.fill();

        // Icône et texte Enlèvement
        doc.fillColor(this.colors.success).fontSize(14);
        doc.text('●', margin + 10, yPos + 10);
        doc.fillColor(this.colors.dark).fontSize(8).font('Helvetica-Bold');
        doc.text('ENLÈVEMENT', margin + 25, yPos + 8);
        doc.font('Helvetica').fontSize(9).fillColor(this.colors.dark);
        const pickupAddr = prefacturation.pickupAddress || prefacturation.orderData?.pickupAddress || '-';
        doc.text(pickupAddr, margin + 25, yPos + 20, { width: contentWidth - 50 });
        if (prefacturation.orderData?.pickupDate) {
          doc.fontSize(8).fillColor(this.colors.medium);
          doc.text(moment(prefacturation.orderData.pickupDate).format('DD/MM/YYYY'), margin + 25, yPos + 35);
        }

        // Icône et texte Livraison
        doc.fillColor(this.colors.danger).fontSize(14);
        doc.text('●', margin + 10, yPos + 48);
        doc.fillColor(this.colors.dark).fontSize(8).font('Helvetica-Bold');
        doc.text('LIVRAISON', margin + 25, yPos + 46);
        doc.font('Helvetica').fontSize(9).fillColor(this.colors.dark);
        const deliveryAddr = prefacturation.deliveryAddress || prefacturation.orderData?.deliveryAddress || '-';
        doc.text(deliveryAddr, margin + 25, yPos + 58, { width: contentWidth - 50 });

        // Distance (droite)
        const distance = prefacturation.distance || prefacturation.orderData?.distance || 0;
        doc.fillColor(this.colors.primary).fontSize(20).font('Helvetica-Bold');
        doc.text(`${distance}`, pageWidth - margin - 80, yPos + 20, { width: 60, align: 'right' });
        doc.fontSize(10).text('km', pageWidth - margin - 20, yPos + 25);

        yPos += 90;

        // ============================================
        // SECTION MARCHANDISE
        // ============================================

        if (prefacturation.cargo && (prefacturation.cargo.description || prefacturation.cargo.weight || prefacturation.cargo.pallets)) {
          doc.fillColor(this.colors.primary).fontSize(10).font('Helvetica-Bold');
          doc.text('MARCHANDISE', margin, yPos);
          yPos += 15;

          // Badges marchandise
          const badges = [];
          if (prefacturation.cargo.weight) badges.push(`${prefacturation.cargo.weight} kg`);
          if (prefacturation.cargo.pallets) badges.push(`${prefacturation.cargo.pallets} pal.`);
          if (prefacturation.cargo.volume) badges.push(`${prefacturation.cargo.volume} m³`);
          if (prefacturation.cargo.isADR) badges.push('ADR');

          let badgeX = margin;
          badges.forEach(badge => {
            const badgeWidth = doc.widthOfString(badge) + 16;
            doc.fillColor(this.colors.light);
            this.roundedRect(doc, badgeX, yPos, badgeWidth, 20, 10);
            doc.fill();
            doc.fillColor(this.colors.dark).fontSize(9).font('Helvetica-Bold');
            doc.text(badge, badgeX + 8, yPos + 5);
            badgeX += badgeWidth + 8;
          });

          if (prefacturation.cargo.description) {
            yPos += 25;
            doc.fillColor(this.colors.medium).fontSize(8).font('Helvetica');
            doc.text(prefacturation.cargo.description, margin, yPos, { width: contentWidth });
          }

          yPos += 25;
        }

        // ============================================
        // TABLEAU DÉTAIL FACTURATION
        // ============================================

        doc.fillColor(this.colors.primary).fontSize(10).font('Helvetica-Bold');
        doc.text('DÉTAIL FACTURATION', margin, yPos);
        yPos += 15;

        // En-tête tableau
        doc.fillColor(this.colors.primary);
        this.roundedRect(doc, margin, yPos, contentWidth, 22, 3);
        doc.fill();

        doc.fillColor(this.colors.white).fontSize(8).font('Helvetica-Bold');
        doc.text('DÉSIGNATION', margin + 10, yPos + 7, { width: 250 });
        doc.text('QTÉ', margin + 280, yPos + 7, { width: 40, align: 'center' });
        doc.text('P.U. HT', margin + 330, yPos + 7, { width: 70, align: 'right' });
        doc.text('TOTAL HT', margin + 410, yPos + 7, { width: 90, align: 'right' });
        yPos += 25;

        // Lignes de détail - utiliser UNIQUEMENT calculationDetails
        doc.font('Helvetica').fillColor(this.colors.dark).fontSize(9);
        let rowIndex = 0;

        const lines = prefacturation.calculationDetails || [];

        lines.forEach((line, idx) => {
          // Vérifier si nouvelle page nécessaire
          if (yPos > 700) {
            doc.addPage();
            yPos = 50;
          }

          // Alternance couleur fond
          if (idx % 2 === 0) {
            doc.fillColor('#f8f9fa').rect(margin, yPos, contentWidth, 18).fill();
          }

          doc.fillColor(this.colors.dark).fontSize(9);
          const desc = line.description || line.item || '';
          const qty = line.quantity || 1;
          const unit = line.unitPrice || 0;
          const total = line.total || 0;

          doc.text(desc, margin + 10, yPos + 4, { width: 260 });
          doc.text(qty.toString(), margin + 280, yPos + 4, { width: 40, align: 'center' });
          doc.text(`${unit.toFixed(2)} €`, margin + 330, yPos + 4, { width: 70, align: 'right' });
          doc.font('Helvetica-Bold').text(`${total.toFixed(2)} €`, margin + 410, yPos + 4, { width: 90, align: 'right' });
          doc.font('Helvetica');
          yPos += 18;
          rowIndex++;
        });

        // Si pas de lignes, afficher message
        if (lines.length === 0) {
          doc.fillColor(this.colors.medium).fontSize(9).font('Helvetica-Oblique');
          doc.text('Aucun détail de facturation disponible', margin + 10, yPos + 4);
          yPos += 20;
        }

        yPos += 10;

        // ============================================
        // TOTAUX
        // ============================================

        const calc = prefacturation.calculation || {};
        const totalHT = calc.totalHT || 0;
        const tva = calc.tva || (totalHT * 0.2);
        const totalTTC = calc.totalTTC || (totalHT * 1.2);

        // Encadré totaux
        doc.fillColor(this.colors.light);
        this.roundedRect(doc, margin + contentWidth - 200, yPos, 200, 75, 5);
        doc.fill();

        doc.fillColor(this.colors.dark).fontSize(9).font('Helvetica');
        doc.text('Total HT:', margin + contentWidth - 190, yPos + 12, { width: 90 });
        doc.font('Helvetica-Bold').text(`${totalHT.toFixed(2)} €`, margin + contentWidth - 90, yPos + 12, { width: 80, align: 'right' });

        doc.font('Helvetica').text('TVA (20%):', margin + contentWidth - 190, yPos + 28, { width: 90 });
        doc.text(`${tva.toFixed(2)} €`, margin + contentWidth - 90, yPos + 28, { width: 80, align: 'right' });

        // Ligne séparation
        doc.strokeColor(this.colors.primary).lineWidth(1);
        doc.moveTo(margin + contentWidth - 190, yPos + 45).lineTo(margin + contentWidth - 10, yPos + 45).stroke();

        // Total TTC
        doc.fillColor(this.colors.primary).fontSize(12).font('Helvetica-Bold');
        doc.text('TOTAL TTC:', margin + contentWidth - 190, yPos + 52, { width: 90 });
        doc.text(`${totalTTC.toFixed(2)} €`, margin + contentWidth - 90, yPos + 52, { width: 80, align: 'right' });

        yPos += 90;

        // ============================================
        // SECTION KPI (si disponible)
        // ============================================

        if (prefacturation.kpiData) {
          // Nouvelle page si nécessaire
          if (yPos > 580) {
            doc.addPage();
            yPos = 50;
          }

          doc.fillColor(this.colors.primary).fontSize(10).font('Helvetica-Bold');
          doc.text('PERFORMANCE TRANSPORTEUR - MOIS PRÉCÉDENT', margin, yPos);
          yPos += 15;

          // Encadré KPI avec fond dégradé
          doc.fillColor('#e8eaf6');
          this.roundedRect(doc, margin, yPos, contentWidth, 120, 8);
          doc.fill();

          // Bordure colorée gauche
          doc.fillColor(this.colors.primary);
          doc.rect(margin, yPos + 5, 5, 110).fill();

          const kpi = prefacturation.kpiData;
          const kpiStartY = yPos + 15;
          const kpiColWidth = (contentWidth - 40) / 3;

          // KPI 1: Livraisons
          doc.fillColor(this.colors.medium).fontSize(8).font('Helvetica');
          doc.text('LIVRAISONS', margin + 20, kpiStartY);
          doc.fillColor(this.colors.dark).fontSize(22).font('Helvetica-Bold');
          doc.text(`${kpi.deliveries || 0}`, margin + 20, kpiStartY + 12);

          // KPI 2: Ponctualité avec jauge
          doc.fillColor(this.colors.medium).fontSize(8).font('Helvetica');
          doc.text('PONCTUALITÉ', margin + 20 + kpiColWidth, kpiStartY);
          const punctuality = kpi.onTimeRate || 0;
          const punctColor = punctuality >= 95 ? this.colors.success : punctuality >= 85 ? this.colors.warning : this.colors.danger;
          doc.fillColor(punctColor).fontSize(22).font('Helvetica-Bold');
          doc.text(`${punctuality.toFixed(0)}%`, margin + 20 + kpiColWidth, kpiStartY + 12);
          // Jauge
          this.drawGauge(doc, margin + 20 + kpiColWidth, kpiStartY + 38, 80, 6, punctuality, 100, punctColor);

          // KPI 3: Score global
          doc.fillColor(this.colors.medium).fontSize(8).font('Helvetica');
          doc.text('SCORE GLOBAL', margin + 20 + kpiColWidth * 2, kpiStartY);
          const score = kpi.globalScore || 0;
          const scoreColor = score >= 80 ? this.colors.success : score >= 60 ? this.colors.warning : this.colors.danger;
          doc.fillColor(scoreColor).fontSize(22).font('Helvetica-Bold');
          doc.text(`${score.toFixed(0)}/100`, margin + 20 + kpiColWidth * 2, kpiStartY + 12);
          // Jauge
          this.drawGauge(doc, margin + 20 + kpiColWidth * 2, kpiStartY + 38, 80, 6, score, 100, scoreColor);

          // Ligne 2: Stats supplémentaires
          const kpiLine2Y = kpiStartY + 55;

          // Incidents
          doc.fillColor(this.colors.medium).fontSize(8).font('Helvetica');
          doc.text('INCIDENTS', margin + 20, kpiLine2Y);
          doc.fillColor(this.colors.dark).fontSize(16).font('Helvetica-Bold');
          doc.text(`${kpi.incidents || 0}`, margin + 20, kpiLine2Y + 10);

          // Satisfaction
          doc.fillColor(this.colors.medium).fontSize(8).font('Helvetica');
          doc.text('SATISFACTION', margin + 20 + kpiColWidth, kpiLine2Y);
          const satisfaction = kpi.satisfactionRate || 0;
          const satColor = satisfaction >= 4 ? this.colors.success : satisfaction >= 3 ? this.colors.warning : this.colors.danger;
          doc.fillColor(satColor).fontSize(16).font('Helvetica-Bold');
          doc.text(`${satisfaction.toFixed(1)}/5`, margin + 20 + kpiColWidth, kpiLine2Y + 10);
          // Étoiles visuelles
          doc.fillColor(this.colors.warning).fontSize(10);
          const stars = Math.round(satisfaction);
          doc.text('★'.repeat(stars) + '☆'.repeat(5 - stars), margin + 20 + kpiColWidth + 45, kpiLine2Y + 12);

          // CA mensuel
          doc.fillColor(this.colors.medium).fontSize(8).font('Helvetica');
          doc.text('CA DU MOIS', margin + 20 + kpiColWidth * 2, kpiLine2Y);
          doc.fillColor(this.colors.dark).fontSize(16).font('Helvetica-Bold');
          const revenue = kpi.revenue || 0;
          doc.text(`${revenue.toLocaleString('fr-FR')} €`, margin + 20 + kpiColWidth * 2, kpiLine2Y + 10);

          yPos += 135;
        }

        // ============================================
        // SECTION ANALYSE IA & PRÉCONISATIONS
        // ============================================

        if (prefacturation.kpiAnalysis) {
          // Nouvelle page pour l'analyse
          doc.addPage();
          let analysisY = 50;

          // Titre section
          doc.fillColor(this.colors.primary).fontSize(14).font('Helvetica-Bold');
          doc.text('ANALYSE & PRÉCONISATIONS', margin, analysisY);
          doc.fillColor(this.colors.accent).fontSize(8).font('Helvetica');
          doc.text('Généré par Intelligence Artificielle SYMPHONI.A', margin, analysisY + 18);
          analysisY += 40;

          const analysis = prefacturation.kpiAnalysis;

          // Résumé avec icône tendance
          doc.fillColor(this.colors.light);
          this.roundedRect(doc, margin, analysisY, contentWidth, 50, 5);
          doc.fill();

          // Icône tendance
          const trendIcon = analysis.trend === 'hausse' ? '📈' : analysis.trend === 'baisse' ? '📉' : '➡️';
          const trendColor = analysis.trend === 'hausse' ? this.colors.success : analysis.trend === 'baisse' ? this.colors.danger : this.colors.warning;
          doc.fillColor(trendColor).fontSize(20);
          doc.text(trendIcon, margin + 15, analysisY + 15);

          doc.fillColor(this.colors.dark).fontSize(9).font('Helvetica');
          doc.text(analysis.summary || 'Analyse non disponible', margin + 50, analysisY + 12, {
            width: contentWidth - 70,
            lineGap: 3
          });
          analysisY += 65;

          // Points forts (vert)
          if (analysis.strengths && analysis.strengths.length > 0) {
            doc.fillColor(this.colors.success).fontSize(10).font('Helvetica-Bold');
            doc.text('✓ POINTS FORTS', margin, analysisY);
            analysisY += 15;

            doc.fillColor(this.colors.dark).fontSize(9).font('Helvetica');
            analysis.strengths.forEach(strength => {
              doc.text(`• ${strength}`, margin + 15, analysisY, { width: contentWidth - 30 });
              analysisY += 14;
            });
            analysisY += 10;
          }

          // Axes d'amélioration (orange)
          if (analysis.improvements && analysis.improvements.length > 0) {
            doc.fillColor(this.colors.warning).fontSize(10).font('Helvetica-Bold');
            doc.text('⚡ AXES D\'AMÉLIORATION', margin, analysisY);
            analysisY += 15;

            doc.fillColor(this.colors.dark).fontSize(9).font('Helvetica');
            analysis.improvements.forEach(improvement => {
              doc.text(`• ${improvement}`, margin + 15, analysisY, { width: contentWidth - 30 });
              analysisY += 14;
            });
            analysisY += 15;
          }

          // Préconisations (tableau)
          if (analysis.recommendations && analysis.recommendations.length > 0) {
            doc.fillColor(this.colors.primary).fontSize(10).font('Helvetica-Bold');
            doc.text('📋 PLAN D\'ACTION RECOMMANDÉ', margin, analysisY);
            analysisY += 20;

            // En-tête tableau
            doc.fillColor(this.colors.primary);
            this.roundedRect(doc, margin, analysisY, contentWidth, 20, 3);
            doc.fill();

            doc.fillColor(this.colors.white).fontSize(8).font('Helvetica-Bold');
            doc.text('PRIORITÉ', margin + 10, analysisY + 6, { width: 60 });
            doc.text('ACTION', margin + 80, analysisY + 6, { width: 280 });
            doc.text('IMPACT ATTENDU', margin + 370, analysisY + 6, { width: 130 });
            analysisY += 25;

            // Lignes recommandations
            analysis.recommendations.forEach((rec, idx) => {
              // Fond alterné
              if (idx % 2 === 0) {
                doc.fillColor('#f5f5f5').rect(margin, analysisY, contentWidth, 28).fill();
              }

              // Badge priorité
              const priorityColors = {
                'haute': this.colors.danger,
                'moyenne': this.colors.warning,
                'basse': this.colors.success
              };
              const priorityColor = priorityColors[rec.priority?.toLowerCase()] || this.colors.medium;

              doc.fillColor(priorityColor);
              this.roundedRect(doc, margin + 8, analysisY + 6, 50, 16, 8);
              doc.fill();
              doc.fillColor(this.colors.white).fontSize(7).font('Helvetica-Bold');
              doc.text((rec.priority || 'N/A').toUpperCase(), margin + 10, analysisY + 10, { width: 46, align: 'center' });

              // Action
              doc.fillColor(this.colors.dark).fontSize(8).font('Helvetica');
              doc.text(rec.action || '-', margin + 80, analysisY + 8, { width: 280 });

              // Impact
              doc.fillColor(this.colors.medium).fontSize(8).font('Helvetica-Oblique');
              doc.text(rec.impact || '-', margin + 370, analysisY + 8, { width: 130 });

              analysisY += 30;
            });
          }

          // Footer analyse
          analysisY += 20;
          doc.fillColor(this.colors.medium).fontSize(7).font('Helvetica-Oblique');
          doc.text(`Analyse générée le ${moment(analysis.generatedAt || new Date()).format('DD/MM/YYYY à HH:mm')} par ${analysis.generatedBy || 'SYMPHONI.A AI'}`, margin, analysisY, { align: 'center', width: contentWidth });
        }

        // ============================================
        // PIED DE PAGE
        // ============================================

        // Ligne de séparation
        doc.strokeColor(this.colors.light).lineWidth(1);
        doc.moveTo(margin, 780).lineTo(pageWidth - margin, 780).stroke();

        doc.fillColor(this.colors.medium).fontSize(7).font('Helvetica');
        doc.text('Document généré automatiquement par SYMPHONI.A - RT Technologie', margin, 788, { align: 'center', width: contentWidth });
        doc.text(`Référence: ${prefacturation.prefacturationId} | Généré le ${moment().format('DD/MM/YYYY à HH:mm')}`, margin, 798, { align: 'center', width: contentWidth });

        // Numéro de page si multiple pages
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
          doc.switchToPage(i);
          doc.fillColor(this.colors.medium).fontSize(8);
          doc.text(`Page ${i + 1}/${pages.count}`, pageWidth - margin - 50, 788, { width: 50, align: 'right' });
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
};

// ===========================================
// EMAIL SERVICE WITH ATTACHMENTS (SES Raw Email)
// ===========================================
/**
 * Envoie un email avec pièces jointes via SES (format raw MIME)
 */
async function sendEmailWithAttachment(to, subject, htmlBody, attachments = []) {
  const toAddresses = Array.isArray(to) ? to : [to];
  const boundary = `----=_Part_${Date.now().toString(36)}`;

  // Construire le message MIME
  let rawMessage = '';
  rawMessage += `From: ${EMAIL_CONFIG.fromName} <${EMAIL_CONFIG.from}>\r\n`;
  rawMessage += `To: ${toAddresses.join(', ')}\r\n`;
  rawMessage += `Reply-To: ${EMAIL_CONFIG.replyTo}\r\n`;
  rawMessage += `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=\r\n`;
  rawMessage += `MIME-Version: 1.0\r\n`;
  rawMessage += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

  // Partie HTML
  rawMessage += `--${boundary}\r\n`;
  rawMessage += `Content-Type: text/html; charset=UTF-8\r\n`;
  rawMessage += `Content-Transfer-Encoding: base64\r\n\r\n`;
  rawMessage += `${Buffer.from(htmlBody).toString('base64')}\r\n`;

  // Pièces jointes
  for (const attachment of attachments) {
    rawMessage += `--${boundary}\r\n`;
    rawMessage += `Content-Type: ${attachment.contentType || 'application/pdf'}; name="${attachment.filename}"\r\n`;
    rawMessage += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
    rawMessage += `Content-Transfer-Encoding: base64\r\n\r\n`;

    const content = attachment.content instanceof Buffer
      ? attachment.content.toString('base64')
      : attachment.content;
    rawMessage += `${content}\r\n`;
  }

  rawMessage += `--${boundary}--\r\n`;

  // Envoyer via SES Raw
  const command = new SendRawEmailCommand({
    RawMessage: {
      Data: Buffer.from(rawMessage)
    }
  });

  const result = await sesClient.send(command);
  console.log('[EMAIL] SES sent with attachment to:', toAddresses.join(', '), 'MessageId:', result.MessageId);
  return { success: true, messageId: result.MessageId, provider: 'ses-raw' };
}

// ===========================================
// MONGOOSE SCHEMAS
// ===========================================

// Schema Grille Tarifaire
const tariffGridSchema = new mongoose.Schema({
  gridId: { type: String, required: true, unique: true },
  transporterId: { type: String, required: true },
  clientId: { type: String, required: true },
  name: String,
  validFrom: { type: Date, required: true },
  validTo: Date,
  // Tarifs par zone/distance
  baseRates: [{
    zoneFrom: String,
    zoneTo: String,
    minKm: Number,
    maxKm: Number,
    pricePerKm: Number,
    fixedPrice: Number,
    currency: { type: String, default: 'EUR' }
  }],
  // Options et majorations
  options: {
    adr: { type: Number, default: 0 }, // % majoration ADR
    hayon: { type: Number, default: 0 },
    express: { type: Number, default: 0 },
    frigo: { type: Number, default: 0 },
    palettesEchange: { type: Number, default: 0 }, // prix/palette
    redescendeMateriel: { type: Number, default: 0 },
    weekend: { type: Number, default: 0 }, // % majoration weekend
    nuit: { type: Number, default: 0 }, // % majoration nuit
    horairesSpeciaux: { type: Number, default: 0 }
  },
  // Temps d'attente
  waitingTime: {
    freeMinutes: { type: Number, default: 30 },
    pricePerHour: { type: Number, default: 45 }
  },
  // Penalites
  penalties: {
    lateDeliveryPerHour: { type: Number, default: 25 },
    missingDocument: { type: Number, default: 50 },
    damagedGoods: { type: Number, default: 100 }
  },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Schema Prefacturation
const prefacturationSchema = new mongoose.Schema({
  prefacturationId: { type: String, required: true, unique: true },
  orderId: { type: String, required: true },
  transporterId: { type: String, required: true },
  transporterName: String,
  transporterEmail: String,
  transporterSiret: String,
  clientId: { type: String, required: true },
  clientName: String,
  clientEmail: String,
  clientSiret: String,
  // Statut workflow
  status: {
    type: String,
    enum: [
      'draft',
      'generated',
      'discrepancy_detected',
      'pending_validation',
      'validated',
      'contested',
      'conflict_closed',
      'blocked',
      'finalized',
      'exported',
      'archived'
    ],
    default: 'draft'
  },
  // Donnees de la course
  orderData: {
    pickupDate: Date,
    deliveryDate: Date,
    pickupAddress: String,
    deliveryAddress: String,
    pickupPostalCode: String,
    deliveryPostalCode: String,
    distance: Number, // km reels (Tracking IA)
    duration: Number, // minutes
    vehicleType: String,
    vehiclePlate: String,
    driverName: String
  },
  // Marchandise
  cargo: {
    description: String,
    weight: Number, // kg
    volume: Number, // m3
    pallets: Number,
    packages: Number,
    isADR: { type: Boolean, default: false },
    adrClass: String,
    temperature: Number // si frigo
  },
  // Options activees
  options: {
    adr: { type: Boolean, default: false },
    hayon: { type: Boolean, default: false },
    express: { type: Boolean, default: false },
    frigo: { type: Boolean, default: false },
    palettesEchange: { type: Number, default: 0 },
    redescendeMateriel: { type: Boolean, default: false },
    weekend: { type: Boolean, default: false },
    nuit: { type: Boolean, default: false }
  },
  // Temps d'attente (mesure Tracking IA)
  waitingTime: {
    pickup: { type: Number, default: 0 }, // minutes
    delivery: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    billable: { type: Number, default: 0 }
  },
  // Incidents
  incidents: [{
    type: { type: String },
    description: String,
    date: Date,
    penaltyApplied: Number
  }],
  // Calcul prefacturation
  calculation: {
    gridId: String,
    basePrice: { type: Number, default: 0 },
    distancePrice: { type: Number, default: 0 },
    optionsPrice: { type: Number, default: 0 },
    waitingTimePrice: { type: Number, default: 0 },
    palettesPrice: { type: Number, default: 0 },
    penalties: { type: Number, default: 0 },
    surcharges: { type: Number, default: 0 },
    discounts: { type: Number, default: 0 },
    totalHT: { type: Number, default: 0 },
    tva: { type: Number, default: 0 },
    totalTTC: { type: Number, default: 0 }
  },
  // Detail du calcul
  calculationDetails: [{
    item: String,
    description: String,
    quantity: Number,
    unitPrice: Number,
    total: Number
  }],
  // KPI transporteur (performance mois précédent)
  kpiData: {
    deliveries: Number,
    onTimeRate: Number,
    incidents: Number,
    satisfactionRate: Number,
    totalDistance: Number,
    revenue: Number,
    globalScore: Number
  },
  // Analyse IA des KPI
  kpiAnalysis: {
    summary: String,
    strengths: [String],
    improvements: [String],
    recommendations: [{
      priority: String,
      action: String,
      impact: String
    }],
    trend: String,
    generatedAt: Date,
    generatedBy: { type: String, default: 'claude-ai' }
  },
  // Prix transporteur (facture recue)
  carrierInvoice: {
    invoiceNumber: String,
    invoiceDate: Date,
    totalHT: Number,
    tva: Number,
    totalTTC: Number,
    pdfUrl: String,
    pdfBase64: String,
    ocrData: mongoose.Schema.Types.Mixed,
    uploadedAt: Date
  },
  // Ecarts detectes
  discrepancies: [{
    type: {
      type: String,
      enum: ['price_global', 'distance', 'options', 'palettes', 'waiting_time', 'volume', 'other']
    },
    description: String,
    expectedValue: mongoose.Schema.Types.Mixed,
    actualValue: mongoose.Schema.Types.Mixed,
    difference: Number,
    differencePercent: Number,
    status: { type: String, enum: ['detected', 'justified', 'contested', 'resolved'], default: 'detected' },
    resolution: String,
    resolvedAt: Date,
    resolvedBy: String
  }],
  // Blocages
  blocks: [{
    type: {
      type: String,
      enum: ['missing_documents', 'vigilance', 'pallets', 'late', 'manual']
    },
    reason: String,
    details: mongoose.Schema.Types.Mixed,
    blockedAt: { type: Date, default: Date.now },
    blockedBy: String,
    unlockedAt: Date,
    unlockedBy: String,
    active: { type: Boolean, default: true }
  }],
  // Documents requis
  documents: {
    pod: { present: Boolean, url: String, validatedAt: Date },
    cmr: { present: Boolean, url: String, signaturePresent: Boolean },
    ecmr: { present: Boolean, url: String },
    bl: { present: Boolean, url: String },
    photos: [{ url: String, type: String, uploadedAt: Date }]
  },
  // Validation transporteur
  carrierValidation: {
    status: { type: String, enum: ['pending', 'accepted', 'contested', 'timeout'], default: 'pending' },
    sentAt: Date,
    respondedAt: Date,
    timeoutAt: Date,
    contestReason: String,
    proposedAmount: Number,
    comments: String
  },
  // Facture finale
  finalInvoice: {
    invoiceId: String,
    invoiceNumber: String,
    generatedAt: Date,
    pdfUrl: String,
    pdfBase64: String,
    sentToERP: { type: Boolean, default: false },
    erpExportDate: Date,
    erpReference: String,
    erpSystem: String
  },
  // Archivage
  archive: {
    archivedAt: Date,
    retentionUntil: Date,
    archiveReference: String
  },
  // Audit trail
  auditTrail: [{
    action: String,
    performedBy: String,
    timestamp: { type: Date, default: Date.now },
    details: mongoose.Schema.Types.Mixed
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Schema Litige Facturation
const billingDisputeSchema = new mongoose.Schema({
  disputeId: { type: String, required: true, unique: true },
  prefacturationId: { type: String, required: true },
  orderId: String,
  transporterId: String,
  clientId: String,
  // Type et details
  type: {
    type: String,
    enum: ['price', 'distance', 'options', 'waiting_time', 'palettes', 'penalties', 'documents', 'other']
  },
  description: String,
  // Montants
  symphoniaAmount: Number, // Montant calcule SYMPHONI.A
  carrierAmount: Number, // Montant facture transporteur
  difference: Number,
  // Lignes contestees
  contestedItems: [{
    item: String,
    symphoniaValue: mongoose.Schema.Types.Mixed,
    carrierValue: mongoose.Schema.Types.Mixed,
    difference: Number,
    justification: String
  }],
  // Propositions
  proposals: [{
    proposedBy: String, // 'symphonia', 'carrier', 'client'
    amount: Number,
    justification: String,
    documents: [String],
    proposedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' }
  }],
  // Resolution
  status: {
    type: String,
    enum: ['open', 'pending_carrier', 'pending_client', 'negotiation', 'resolved', 'escalated', 'closed'],
    default: 'open'
  },
  resolution: {
    type: { type: String, enum: ['accepted_symphonia', 'accepted_carrier', 'compromise', 'timeout', 'escalated'] },
    finalAmount: Number,
    description: String,
    resolvedAt: Date,
    resolvedBy: String
  },
  // Timeline
  timeline: [{
    action: String,
    performedBy: String,
    timestamp: { type: Date, default: Date.now },
    details: mongoose.Schema.Types.Mixed
  }],
  // SLA
  slaDeadline: Date,
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Schema Blocage
const billingBlockSchema = new mongoose.Schema({
  blockId: { type: String, required: true, unique: true },
  prefacturationId: String,
  orderId: String,
  transporterId: String,
  clientId: String,
  // Type de blocage
  type: {
    type: String,
    enum: ['missing_documents', 'vigilance', 'pallets', 'late', 'manual'],
    required: true
  },
  // Details selon le type
  reason: { type: String, required: true },
  details: {
    // missing_documents
    missingDocs: [String], // ['BL', 'CMR', 'signature', 'eCMR']
    // vigilance
    expiredDocs: [{
      type: { type: String }, // 'urssaf', 'assurance', 'licence'
      expirationDate: Date
    }],
    // pallets
    palletDebt: Number,
    unrestitutedPallets: Number,
    palletDisputeId: String,
    // late
    delayMinutes: Number,
    expectedETA: Date,
    actualArrival: Date,
    justificationProvided: Boolean
  },
  // Statut
  active: { type: Boolean, default: true },
  blockedAt: { type: Date, default: Date.now },
  blockedBy: String,
  // Deblocage
  unlockedAt: Date,
  unlockedBy: String,
  unlockReason: String,
  // Event declenche
  eventTriggered: String,
  createdAt: { type: Date, default: Date.now }
});

// Schema Export ERP
const erpExportSchema = new mongoose.Schema({
  exportId: { type: String, required: true, unique: true },
  prefacturationId: String,
  invoiceId: String,
  // Configuration ERP
  erpSystem: {
    type: String,
    enum: ['sap', 'oracle', 'sage_x3', 'divalto', 'dynamics_365', 'odoo', 'generic_api'],
    required: true
  },
  erpConfig: {
    endpoint: String,
    apiKey: String,
    companyCode: String,
    costCenter: String
  },
  // Donnees exportees
  exportData: mongoose.Schema.Types.Mixed,
  exportFormat: { type: String, enum: ['json', 'xml', 'csv', 'idoc'], default: 'json' },
  // Statut
  status: {
    type: String,
    enum: ['pending', 'sent', 'acknowledged', 'failed', 'retry'],
    default: 'pending'
  },
  // Reponse ERP
  erpResponse: {
    status: Number,
    reference: String,
    message: String,
    receivedAt: Date
  },
  // Retry
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  nextRetry: Date,
  lastError: String,
  // Timestamps
  exportedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

// Schema Vigilance Transporteur (devoir de vigilance)
const carrierVigilanceSchema = new mongoose.Schema({
  vigilanceId: { type: String, required: true, unique: true },
  transporterId: { type: String, required: true },
  transporterName: String,
  // Documents obligatoires
  documents: {
    urssaf: {
      present: Boolean,
      documentUrl: String,
      validUntil: Date,
      verifiedAt: Date
    },
    assurance: {
      present: Boolean,
      documentUrl: String,
      validUntil: Date,
      coverageAmount: Number,
      verifiedAt: Date
    },
    licenceTransport: {
      present: Boolean,
      documentUrl: String,
      validUntil: Date,
      licenceNumber: String,
      verifiedAt: Date
    },
    kbis: {
      present: Boolean,
      documentUrl: String,
      issuedAt: Date,
      verifiedAt: Date
    }
  },
  // Statut global
  status: {
    type: String,
    enum: ['valid', 'expiring_soon', 'expired', 'incomplete'],
    default: 'incomplete'
  },
  // Alertes
  alerts: [{
    type: { type: String },
    message: String,
    expirationDate: Date,
    createdAt: { type: Date, default: Date.now }
  }],
  lastChecked: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Schema Webhook/Events
const billingWebhookSchema = new mongoose.Schema({
  webhookId: { type: String, required: true, unique: true },
  clientId: { type: String, required: true },
  name: String,
  url: { type: String, required: true },
  events: [{
    type: String,
    enum: [
      'prefacturation.generated',
      'prefacturation.discrepancy.detected',
      'prefacturation.carrier.validation.update',
      'billing.blocked.missing.documents',
      'billing.blocked.vigilance',
      'billing.blocked.pallets',
      'billing.blocked.late',
      'billing.unblocked',
      'billing.finalized',
      'billing.exported',
      'dispute.opened',
      'dispute.resolved'
    ]
  }],
  secret: String,
  active: { type: Boolean, default: true },
  failureCount: { type: Number, default: 0 },
  lastTriggeredAt: Date,
  createdAt: { type: Date, default: Date.now }
});

// Creation des modeles
const TariffGrid = mongoose.model('BillingTariffGrid', tariffGridSchema);
const Prefacturation = mongoose.model('Prefacturation', prefacturationSchema);
const BillingDispute = mongoose.model('BillingDispute', billingDisputeSchema);
const BillingBlock = mongoose.model('BillingBlock', billingBlockSchema);
const ERPExport = mongoose.model('ERPExport', erpExportSchema);
const CarrierVigilance = mongoose.model('CarrierVigilance', carrierVigilanceSchema);
const BillingWebhook = mongoose.model('BillingWebhook', billingWebhookSchema);

// ===========================================
// MIDDLEWARE AUTHENTIFICATION
// ===========================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Token requis' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Token invalide' });
    }
    req.user = user;
    next();
  });
};

// ===========================================
// SYSTEME DE NOTIFICATIONS (Webhooks)
// ===========================================
const sendBillingNotification = async (event, payload, clientIds) => {
  try {
    const webhooks = await BillingWebhook.find({
      clientId: { $in: clientIds },
      events: event,
      active: true,
      failureCount: { $lt: 5 }
    });

    for (const webhook of webhooks) {
      try {
        await axios.post(webhook.url, {
          event,
          timestamp: new Date().toISOString(),
          data: payload
        }, {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Event': event,
            'X-Webhook-Signature': webhook.secret ?
              require('crypto').createHmac('sha256', webhook.secret).update(JSON.stringify(payload)).digest('hex') : undefined
          },
          timeout: 10000
        });

        webhook.lastTriggeredAt = new Date();
        webhook.failureCount = 0;
        await webhook.save();
      } catch (error) {
        webhook.failureCount += 1;
        await webhook.save();
        console.error(`Webhook ${webhook.webhookId} failed:`, error.message);
      }
    }
  } catch (error) {
    console.error('Notification error:', error.message);
  }
};

// ===========================================
// BLOC 1: PREFACTURATION AUTOMATIQUE
// ===========================================

/**
 * Calculer le prix base sur la grille tarifaire
 */
const calculateBasePrice = async (orderData, options, tariffGrid) => {
  let details = [];
  let totalHT = 0;

  // 1. Prix de base / distance
  const distance = orderData.distance || 0;
  let basePrice = 0;
  let distancePrice = 0;

  for (const rate of tariffGrid.baseRates) {
    if (distance >= (rate.minKm || 0) && distance <= (rate.maxKm || 99999)) {
      if (rate.fixedPrice) {
        basePrice = rate.fixedPrice;
        details.push({
          item: 'Prix forfaitaire',
          description: `Zone ${rate.zoneFrom} - ${rate.zoneTo}`,
          quantity: 1,
          unitPrice: rate.fixedPrice,
          total: rate.fixedPrice
        });
      } else if (rate.pricePerKm) {
        distancePrice = distance * rate.pricePerKm;
        details.push({
          item: 'Prix kilometrique',
          description: `${distance} km x ${rate.pricePerKm} EUR/km`,
          quantity: distance,
          unitPrice: rate.pricePerKm,
          total: distancePrice
        });
      }
      break;
    }
  }

  totalHT += basePrice + distancePrice;

  // 2. Options et majorations
  let optionsPrice = 0;
  const baseForOptions = basePrice + distancePrice;

  if (options.adr && tariffGrid.options.adr) {
    const adrSurcharge = baseForOptions * (tariffGrid.options.adr / 100);
    optionsPrice += adrSurcharge;
    details.push({
      item: 'Majoration ADR',
      description: `${tariffGrid.options.adr}% sur prix de base`,
      quantity: 1,
      unitPrice: adrSurcharge,
      total: adrSurcharge
    });
  }

  if (options.hayon && tariffGrid.options.hayon) {
    optionsPrice += tariffGrid.options.hayon;
    details.push({
      item: 'Option Hayon',
      description: 'Hayon elevateur',
      quantity: 1,
      unitPrice: tariffGrid.options.hayon,
      total: tariffGrid.options.hayon
    });
  }

  if (options.express && tariffGrid.options.express) {
    const expressSurcharge = baseForOptions * (tariffGrid.options.express / 100);
    optionsPrice += expressSurcharge;
    details.push({
      item: 'Livraison Express',
      description: `${tariffGrid.options.express}% sur prix de base`,
      quantity: 1,
      unitPrice: expressSurcharge,
      total: expressSurcharge
    });
  }

  if (options.frigo && tariffGrid.options.frigo) {
    const frigoSurcharge = baseForOptions * (tariffGrid.options.frigo / 100);
    optionsPrice += frigoSurcharge;
    details.push({
      item: 'Transport Frigorifique',
      description: `${tariffGrid.options.frigo}% sur prix de base`,
      quantity: 1,
      unitPrice: frigoSurcharge,
      total: frigoSurcharge
    });
  }

  if (options.palettesEchange > 0 && tariffGrid.options.palettesEchange) {
    const palettesPrice = options.palettesEchange * tariffGrid.options.palettesEchange;
    optionsPrice += palettesPrice;
    details.push({
      item: 'Echange Palettes',
      description: `${options.palettesEchange} palettes x ${tariffGrid.options.palettesEchange} EUR`,
      quantity: options.palettesEchange,
      unitPrice: tariffGrid.options.palettesEchange,
      total: palettesPrice
    });
  }

  if (options.weekend && tariffGrid.options.weekend) {
    const weekendSurcharge = baseForOptions * (tariffGrid.options.weekend / 100);
    optionsPrice += weekendSurcharge;
    details.push({
      item: 'Majoration Week-end',
      description: `${tariffGrid.options.weekend}% sur prix de base`,
      quantity: 1,
      unitPrice: weekendSurcharge,
      total: weekendSurcharge
    });
  }

  if (options.nuit && tariffGrid.options.nuit) {
    const nightSurcharge = baseForOptions * (tariffGrid.options.nuit / 100);
    optionsPrice += nightSurcharge;
    details.push({
      item: 'Majoration Nuit',
      description: `${tariffGrid.options.nuit}% sur prix de base`,
      quantity: 1,
      unitPrice: nightSurcharge,
      total: nightSurcharge
    });
  }

  totalHT += optionsPrice;

  return {
    basePrice,
    distancePrice,
    optionsPrice,
    totalHT,
    details
  };
};

/**
 * Calculer le temps d'attente facturable
 */
const calculateWaitingTimePrice = (waitingTime, tariffGrid) => {
  const freeMinutes = tariffGrid.waitingTime?.freeMinutes || 30;
  const pricePerHour = tariffGrid.waitingTime?.pricePerHour || 45;

  const totalWaiting = waitingTime.total || 0;
  const billableMinutes = Math.max(0, totalWaiting - freeMinutes);
  const billableHours = billableMinutes / 60;
  const price = Math.ceil(billableHours * pricePerHour);

  return {
    totalMinutes: totalWaiting,
    freeMinutes,
    billableMinutes,
    pricePerHour,
    total: price,
    detail: billableMinutes > 0 ? {
      item: 'Temps d\'attente',
      description: `${billableMinutes} min au-dela des ${freeMinutes} min gratuites`,
      quantity: Math.ceil(billableHours * 10) / 10,
      unitPrice: pricePerHour,
      total: price
    } : null
  };
};

/**
 * Generer une prefacturation automatiquement
 */
const generatePrefacturation = async (orderId, orderData, transporterId, clientId, options = {}) => {
  // Trouver la grille tarifaire applicable
  const tariffGrid = await TariffGrid.findOne({
    transporterId,
    clientId,
    active: true,
    validFrom: { $lte: new Date() },
    $or: [
      { validTo: { $gte: new Date() } },
      { validTo: null }
    ]
  });

  if (!tariffGrid) {
    throw new Error('Aucune grille tarifaire active trouvee pour ce transporteur/client');
  }

  // Calculer le prix de base
  const baseCalc = await calculateBasePrice(orderData, options, tariffGrid);

  // Calculer le temps d'attente
  const waitingCalc = calculateWaitingTimePrice(options.waitingTime || {}, tariffGrid);

  // Calculer les penalites
  let penalties = 0;
  let penaltyDetails = [];
  if (options.incidents) {
    for (const incident of options.incidents) {
      let penalty = 0;
      if (incident.type === 'late' && tariffGrid.penalties.lateDeliveryPerHour) {
        penalty = (incident.delayHours || 1) * tariffGrid.penalties.lateDeliveryPerHour;
      } else if (incident.type === 'missing_document' && tariffGrid.penalties.missingDocument) {
        penalty = tariffGrid.penalties.missingDocument;
      } else if (incident.type === 'damaged' && tariffGrid.penalties.damagedGoods) {
        penalty = tariffGrid.penalties.damagedGoods;
      }
      if (penalty > 0) {
        penalties += penalty;
        penaltyDetails.push({
          item: `Penalite: ${incident.type}`,
          description: incident.description || incident.type,
          quantity: 1,
          unitPrice: penalty,
          total: penalty
        });
      }
    }
  }

  // Calculer totaux
  const totalHT = baseCalc.totalHT + (waitingCalc.total || 0) - penalties;
  const tva = Math.round(totalHT * TVA_RATE * 100) / 100;
  const totalTTC = Math.round((totalHT + tva) * 100) / 100;

  // Assembler les details
  let allDetails = [...baseCalc.details];
  if (waitingCalc.detail) allDetails.push(waitingCalc.detail);
  allDetails = [...allDetails, ...penaltyDetails];

  // Creer la prefacturation
  const prefacturation = new Prefacturation({
    prefacturationId: `PREF-${uuidv4().slice(0, 12).toUpperCase()}`,
    orderId,
    transporterId,
    transporterName: options.transporterName,
    clientId,
    clientName: options.clientName,
    status: 'generated',
    orderData,
    cargo: options.cargo || {},
    options,
    waitingTime: {
      ...options.waitingTime,
      billable: waitingCalc.billableMinutes
    },
    incidents: options.incidents || [],
    calculation: {
      gridId: tariffGrid.gridId,
      basePrice: baseCalc.basePrice,
      distancePrice: baseCalc.distancePrice,
      optionsPrice: baseCalc.optionsPrice,
      waitingTimePrice: waitingCalc.total || 0,
      palettesPrice: options.palettesEchange ? options.palettesEchange * (tariffGrid.options.palettesEchange || 0) : 0,
      penalties,
      totalHT: Math.round(totalHT * 100) / 100,
      tva,
      totalTTC
    },
    calculationDetails: allDetails,
    carrierValidation: {
      status: 'pending',
      timeoutAt: new Date(Date.now() + VALIDATION_TIMEOUT_DAYS * 24 * 60 * 60 * 1000)
    },
    auditTrail: [{
      action: 'PREFACTURATION_GENERATED',
      performedBy: 'system',
      timestamp: new Date(),
      details: { orderId, totalHT, totalTTC }
    }]
  });

  await prefacturation.save();

  // Envoyer notification
  await sendBillingNotification('prefacturation.generated', {
    prefacturationId: prefacturation.prefacturationId,
    orderId,
    transporterId,
    clientId,
    totalHT,
    totalTTC
  }, [clientId, transporterId]);

  return prefacturation;
};

// ===========================================
// BLOC 2: DETECTION D'ECARTS
// ===========================================

/**
 * Detecter les ecarts entre prefacturation et facture transporteur
 */
const detectDiscrepancies = async (prefacturation, carrierInvoiceData) => {
  const discrepancies = [];
  const tolerance = 0.02; // 2% de tolerance

  // 1. Ecart de prix global
  const expectedTotal = prefacturation.calculation.totalHT;
  const carrierTotal = carrierInvoiceData.totalHT;
  const priceDiff = carrierTotal - expectedTotal;
  const priceDiffPercent = Math.abs(priceDiff / expectedTotal);

  if (priceDiffPercent > tolerance) {
    discrepancies.push({
      type: 'price_global',
      description: `Ecart de prix global: ${carrierTotal.toFixed(2)} EUR facture vs ${expectedTotal.toFixed(2)} EUR calcule`,
      expectedValue: expectedTotal,
      actualValue: carrierTotal,
      difference: priceDiff,
      differencePercent: Math.round(priceDiffPercent * 100 * 100) / 100,
      status: 'detected'
    });
  }

  // 2. Ecart kilometrique (si disponible dans OCR)
  if (carrierInvoiceData.distance && prefacturation.orderData.distance) {
    const kmDiff = carrierInvoiceData.distance - prefacturation.orderData.distance;
    const kmDiffPercent = Math.abs(kmDiff / prefacturation.orderData.distance);

    if (kmDiffPercent > tolerance) {
      discrepancies.push({
        type: 'distance',
        description: `Ecart kilometrique: ${carrierInvoiceData.distance} km factures vs ${prefacturation.orderData.distance} km reels`,
        expectedValue: prefacturation.orderData.distance,
        actualValue: carrierInvoiceData.distance,
        difference: kmDiff,
        differencePercent: Math.round(kmDiffPercent * 100 * 100) / 100,
        status: 'detected'
      });
    }
  }

  // 3. Ecart options (ADR facture sans marchandise ADR, etc.)
  if (carrierInvoiceData.options) {
    for (const [option, billed] of Object.entries(carrierInvoiceData.options)) {
      const expected = prefacturation.options[option];
      if (billed && !expected) {
        discrepancies.push({
          type: 'options',
          description: `Option ${option} facturee mais non declaree`,
          expectedValue: false,
          actualValue: true,
          difference: null,
          status: 'detected'
        });
      }
    }
  }

  // 4. Ecart palettes
  if (carrierInvoiceData.palettes !== undefined && prefacturation.options.palettesEchange !== undefined) {
    const paletteDiff = carrierInvoiceData.palettes - prefacturation.options.palettesEchange;
    if (paletteDiff !== 0) {
      discrepancies.push({
        type: 'palettes',
        description: `Ecart palettes: ${carrierInvoiceData.palettes} facturees vs ${prefacturation.options.palettesEchange} enregistrees`,
        expectedValue: prefacturation.options.palettesEchange,
        actualValue: carrierInvoiceData.palettes,
        difference: paletteDiff,
        status: 'detected'
      });
    }
  }

  // 5. Ecart temps d'attente
  if (carrierInvoiceData.waitingTimeMinutes !== undefined && prefacturation.waitingTime.billable !== undefined) {
    const waitDiff = carrierInvoiceData.waitingTimeMinutes - prefacturation.waitingTime.billable;
    if (Math.abs(waitDiff) > 15) { // 15 min de tolerance
      discrepancies.push({
        type: 'waiting_time',
        description: `Ecart temps d'attente: ${carrierInvoiceData.waitingTimeMinutes} min facturees vs ${prefacturation.waitingTime.billable} min mesurees`,
        expectedValue: prefacturation.waitingTime.billable,
        actualValue: carrierInvoiceData.waitingTimeMinutes,
        difference: waitDiff,
        status: 'detected'
      });
    }
  }

  return discrepancies;
};

// ===========================================
// BLOC 3: VALIDATION TRANSPORTEUR
// ===========================================

/**
 * Simuler OCR sur facture PDF (en prod: Tesseract.js ou API externe)
 */
const performOCR = async (pdfBuffer) => {
  // En production, utiliser Tesseract.js ou une API OCR
  // Pour la demo, on retourne des donnees simulees
  return {
    invoiceNumber: `INV-${Date.now()}`,
    invoiceDate: new Date(),
    totalHT: 0,
    tva: 0,
    totalTTC: 0,
    distance: null,
    palettes: null,
    waitingTimeMinutes: null,
    options: {},
    rawText: '',
    confidence: 0.85
  };
};

/**
 * Traiter la facture transporteur uploadee
 */
const processCarrierInvoice = async (prefacturationId, invoiceData, pdfBuffer = null) => {
  const prefacturation = await Prefacturation.findOne({ prefacturationId });
  if (!prefacturation) {
    throw new Error('Prefacturation non trouvee');
  }

  // OCR si PDF fourni
  let ocrData = null;
  if (pdfBuffer) {
    ocrData = await performOCR(pdfBuffer);
    // Merger avec les donnees manuelles
    invoiceData = {
      ...ocrData,
      ...invoiceData // Les donnees manuelles priment
    };
  }

  // Enregistrer la facture transporteur
  prefacturation.carrierInvoice = {
    invoiceNumber: invoiceData.invoiceNumber,
    invoiceDate: invoiceData.invoiceDate || new Date(),
    totalHT: invoiceData.totalHT,
    tva: invoiceData.tva || invoiceData.totalHT * TVA_RATE,
    totalTTC: invoiceData.totalTTC || invoiceData.totalHT * (1 + TVA_RATE),
    pdfBase64: pdfBuffer ? pdfBuffer.toString('base64') : null,
    ocrData,
    uploadedAt: new Date()
  };

  // Detecter les ecarts
  const discrepancies = await detectDiscrepancies(prefacturation, invoiceData);
  prefacturation.discrepancies = discrepancies;

  // Mettre a jour le statut
  if (discrepancies.length > 0) {
    prefacturation.status = 'discrepancy_detected';

    // Envoyer notification ecart
    await sendBillingNotification('prefacturation.discrepancy.detected', {
      prefacturationId,
      discrepanciesCount: discrepancies.length,
      discrepancies: discrepancies.map(d => ({
        type: d.type,
        difference: d.difference,
        differencePercent: d.differencePercent
      }))
    }, [prefacturation.clientId, prefacturation.transporterId]);
  } else {
    prefacturation.status = 'validated';
  }

  prefacturation.auditTrail.push({
    action: 'CARRIER_INVOICE_PROCESSED',
    performedBy: 'system',
    timestamp: new Date(),
    details: {
      invoiceNumber: invoiceData.invoiceNumber,
      totalHT: invoiceData.totalHT,
      discrepanciesFound: discrepancies.length
    }
  });

  prefacturation.updatedAt = new Date();
  await prefacturation.save();

  return prefacturation;
};

// ===========================================
// BLOC 4: BLOCAGES AUTOMATIQUES
// ===========================================

/**
 * Verifier les blocages potentiels
 */
const checkBlocks = async (prefacturation) => {
  const blocks = [];

  // 1. Blocage documents manquants
  const docs = prefacturation.documents || {};
  const missingDocs = [];
  if (!docs.pod?.present) missingDocs.push('POD');
  if (!docs.cmr?.present) missingDocs.push('CMR');
  if (!docs.cmr?.signaturePresent) missingDocs.push('Signature CMR');
  if (!docs.ecmr?.present) missingDocs.push('eCMR');

  if (missingDocs.length > 0) {
    blocks.push({
      type: 'missing_documents',
      reason: `Documents manquants: ${missingDocs.join(', ')}`,
      details: { missingDocs },
      eventTriggered: 'billing.blocked.missing.documents'
    });
  }

  // 2. Blocage devoir de vigilance
  const vigilance = await CarrierVigilance.findOne({
    transporterId: prefacturation.transporterId
  });

  if (vigilance) {
    const expiredDocs = [];
    const now = new Date();

    if (vigilance.documents.urssaf?.validUntil && vigilance.documents.urssaf.validUntil < now) {
      expiredDocs.push({ type: 'urssaf', expirationDate: vigilance.documents.urssaf.validUntil });
    }
    if (vigilance.documents.assurance?.validUntil && vigilance.documents.assurance.validUntil < now) {
      expiredDocs.push({ type: 'assurance', expirationDate: vigilance.documents.assurance.validUntil });
    }
    if (vigilance.documents.licenceTransport?.validUntil && vigilance.documents.licenceTransport.validUntil < now) {
      expiredDocs.push({ type: 'licence', expirationDate: vigilance.documents.licenceTransport.validUntil });
    }

    if (expiredDocs.length > 0) {
      blocks.push({
        type: 'vigilance',
        reason: `Documents transporteur expires: ${expiredDocs.map(d => d.type).join(', ')}`,
        details: { expiredDocs },
        eventTriggered: 'billing.blocked.vigilance'
      });
    }
  }

  // 3. Blocage palettes (integration module palettes)
  // En prod, appeler l'API palettes-circular-api
  // Pour la demo, on simule
  if (prefacturation.options.palettesEchange > 0) {
    // Simuler verification dette palettes
    const palletDebt = 0; // En prod: await checkPalletDebt(prefacturation.transporterId)
    if (palletDebt > 0) {
      blocks.push({
        type: 'pallets',
        reason: `Dette palette non regularisee: ${palletDebt} palettes`,
        details: { palletDebt },
        eventTriggered: 'billing.blocked.pallets'
      });
    }
  }

  return blocks;
};

/**
 * Appliquer les blocages sur une prefacturation
 */
const applyBlocks = async (prefacturationId) => {
  const prefacturation = await Prefacturation.findOne({ prefacturationId });
  if (!prefacturation) {
    throw new Error('Prefacturation non trouvee');
  }

  const detectedBlocks = await checkBlocks(prefacturation);

  for (const blockData of detectedBlocks) {
    // Creer le blocage
    const block = new BillingBlock({
      blockId: `BLK-${uuidv4().slice(0, 8).toUpperCase()}`,
      prefacturationId,
      orderId: prefacturation.orderId,
      transporterId: prefacturation.transporterId,
      clientId: prefacturation.clientId,
      ...blockData,
      blockedBy: 'system'
    });
    await block.save();

    // Ajouter au registre de la prefacturation
    prefacturation.blocks.push({
      type: blockData.type,
      reason: blockData.reason,
      details: blockData.details,
      blockedAt: new Date(),
      blockedBy: 'system',
      active: true
    });

    // Envoyer notification
    await sendBillingNotification(blockData.eventTriggered, {
      prefacturationId,
      blockId: block.blockId,
      type: blockData.type,
      reason: blockData.reason
    }, [prefacturation.clientId, prefacturation.transporterId]);
  }

  if (detectedBlocks.length > 0) {
    prefacturation.status = 'blocked';
    prefacturation.auditTrail.push({
      action: 'PREFACTURATION_BLOCKED',
      performedBy: 'system',
      timestamp: new Date(),
      details: { blocksCount: detectedBlocks.length, types: detectedBlocks.map(b => b.type) }
    });
  }

  prefacturation.updatedAt = new Date();
  await prefacturation.save();

  return { prefacturation, blocks: detectedBlocks };
};

// ===========================================
// BLOC 5: FACTURE FINALE & EXPORT ERP
// ===========================================

/**
 * Generer la facture PDF finale
 */
const generateFinalInvoicePDF = async (prefacturation) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // En-tete
    doc.fontSize(20).text('FACTURE TRANSPORT', { align: 'center' });
    doc.moveDown();

    // Infos facture
    const invoiceNumber = `FAC-${Date.now()}-${prefacturation.prefacturationId.slice(-6)}`;
    doc.fontSize(12);
    doc.text(`Facture N°: ${invoiceNumber}`);
    doc.text(`Date: ${moment().format('DD/MM/YYYY')}`);
    doc.text(`Commande: ${prefacturation.orderId}`);
    doc.moveDown();

    // Client et transporteur
    doc.text(`Client: ${prefacturation.clientName || prefacturation.clientId}`);
    doc.text(`Transporteur: ${prefacturation.transporterName || prefacturation.transporterId}`);
    doc.moveDown();

    // Details de la course
    doc.fontSize(14).text('Details de la course', { underline: true });
    doc.fontSize(10);
    doc.text(`Date livraison: ${moment(prefacturation.orderData.deliveryDate).format('DD/MM/YYYY')}`);
    doc.text(`Distance: ${prefacturation.orderData.distance} km`);
    doc.text(`Vehicule: ${prefacturation.orderData.vehiclePlate || 'N/A'}`);
    doc.moveDown();

    // Lignes de facturation
    doc.fontSize(14).text('Detail facturation', { underline: true });
    doc.fontSize(10);

    let y = doc.y + 10;
    doc.text('Description', 50, y);
    doc.text('Qte', 300, y);
    doc.text('P.U.', 350, y);
    doc.text('Total', 450, y);

    y += 15;
    doc.moveTo(50, y).lineTo(550, y).stroke();
    y += 10;

    for (const detail of prefacturation.calculationDetails) {
      doc.text(detail.item, 50, y, { width: 240 });
      doc.text(String(detail.quantity || 1), 300, y);
      doc.text(`${detail.unitPrice?.toFixed(2) || '0.00'} EUR`, 350, y);
      doc.text(`${detail.total?.toFixed(2) || '0.00'} EUR`, 450, y);
      y += 20;
    }

    y += 10;
    doc.moveTo(50, y).lineTo(550, y).stroke();
    y += 15;

    // Totaux
    doc.fontSize(12);
    doc.text(`Total HT:`, 350, y);
    doc.text(`${prefacturation.calculation.totalHT.toFixed(2)} EUR`, 450, y);
    y += 20;
    doc.text(`TVA (20%):`, 350, y);
    doc.text(`${prefacturation.calculation.tva.toFixed(2)} EUR`, 450, y);
    y += 20;
    doc.fontSize(14).fillColor('blue');
    doc.text(`Total TTC:`, 350, y);
    doc.text(`${prefacturation.calculation.totalTTC.toFixed(2)} EUR`, 450, y);

    // Footer
    doc.fillColor('black').fontSize(8);
    doc.text('Document genere par SYMPHONI.A - RT Technologie', 50, 750, { align: 'center' });

    doc.end();
  });
};

/**
 * Finaliser et generer la facture
 */
const finalizeBilling = async (prefacturationId) => {
  const prefacturation = await Prefacturation.findOne({ prefacturationId });
  if (!prefacturation) {
    throw new Error('Prefacturation non trouvee');
  }

  // Verifier qu'il n'y a pas de blocages actifs
  const activeBlocks = prefacturation.blocks.filter(b => b.active);
  if (activeBlocks.length > 0) {
    throw new Error(`Facturation bloquee: ${activeBlocks.map(b => b.reason).join(', ')}`);
  }

  // Generer le PDF
  const pdfBuffer = await generateFinalInvoicePDF(prefacturation);
  const invoiceNumber = `FAC-${Date.now()}-${prefacturation.prefacturationId.slice(-6)}`;

  // Mettre a jour la prefacturation
  prefacturation.finalInvoice = {
    invoiceId: `INV-${uuidv4().slice(0, 8).toUpperCase()}`,
    invoiceNumber,
    generatedAt: new Date(),
    pdfBase64: pdfBuffer.toString('base64'),
    sentToERP: false
  };

  prefacturation.status = 'finalized';
  prefacturation.auditTrail.push({
    action: 'INVOICE_FINALIZED',
    performedBy: 'system',
    timestamp: new Date(),
    details: { invoiceNumber }
  });

  prefacturation.updatedAt = new Date();
  await prefacturation.save();

  // Notification
  await sendBillingNotification('billing.finalized', {
    prefacturationId,
    invoiceNumber,
    totalTTC: prefacturation.calculation.totalTTC
  }, [prefacturation.clientId]);

  return prefacturation;
};

/**
 * Exporter vers ERP
 */
const exportToERP = async (prefacturationId, erpConfig) => {
  const prefacturation = await Prefacturation.findOne({ prefacturationId });
  if (!prefacturation || !prefacturation.finalInvoice) {
    throw new Error('Facture non trouvee ou non finalisee');
  }

  // Preparer les donnees d'export selon le format ERP
  let exportData;
  const erpSystem = erpConfig.system || 'generic_api';

  switch (erpSystem) {
    case 'sap':
      exportData = {
        BUKRS: erpConfig.companyCode || '1000',
        BELNR: prefacturation.finalInvoice.invoiceNumber,
        BLDAT: moment(prefacturation.finalInvoice.generatedAt).format('YYYYMMDD'),
        LIFNR: prefacturation.transporterId,
        WRBTR: prefacturation.calculation.totalTTC,
        WAERS: 'EUR',
        KOSTL: erpConfig.costCenter || '',
        SGTXT: `Transport ${prefacturation.orderId}`,
        lines: prefacturation.calculationDetails.map(d => ({
          MATNR: d.item,
          MENGE: d.quantity,
          NETPR: d.unitPrice,
          NETWR: d.total
        }))
      };
      break;

    case 'odoo':
      exportData = {
        model: 'account.move',
        method: 'create',
        args: [{
          move_type: 'in_invoice',
          partner_id: prefacturation.transporterId,
          invoice_date: moment(prefacturation.finalInvoice.generatedAt).format('YYYY-MM-DD'),
          ref: prefacturation.orderId,
          invoice_line_ids: prefacturation.calculationDetails.map(d => [0, 0, {
            name: d.item,
            quantity: d.quantity,
            price_unit: d.unitPrice
          }])
        }]
      };
      break;

    default: // generic_api / JSON
      exportData = {
        invoice: {
          number: prefacturation.finalInvoice.invoiceNumber,
          date: prefacturation.finalInvoice.generatedAt,
          supplierId: prefacturation.transporterId,
          supplierName: prefacturation.transporterName,
          customerId: prefacturation.clientId,
          customerName: prefacturation.clientName,
          orderReference: prefacturation.orderId,
          currency: 'EUR',
          totalHT: prefacturation.calculation.totalHT,
          tva: prefacturation.calculation.tva,
          totalTTC: prefacturation.calculation.totalTTC,
          lines: prefacturation.calculationDetails
        },
        metadata: {
          source: 'SYMPHONIA',
          version: '1.0.0',
          exportedAt: new Date().toISOString()
        }
      };
  }

  // Creer l'enregistrement d'export
  const erpExport = new ERPExport({
    exportId: `EXP-${uuidv4().slice(0, 8).toUpperCase()}`,
    prefacturationId,
    invoiceId: prefacturation.finalInvoice.invoiceId,
    erpSystem,
    erpConfig: {
      endpoint: erpConfig.endpoint,
      companyCode: erpConfig.companyCode,
      costCenter: erpConfig.costCenter
    },
    exportData,
    exportFormat: erpSystem === 'sap' ? 'idoc' : 'json',
    status: 'pending'
  });

  // Tenter l'envoi si endpoint configure
  if (erpConfig.endpoint) {
    try {
      const response = await axios.post(erpConfig.endpoint, exportData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': erpConfig.apiKey ? `Bearer ${erpConfig.apiKey}` : undefined
        },
        timeout: 30000
      });

      erpExport.status = 'acknowledged';
      erpExport.erpResponse = {
        status: response.status,
        reference: response.data?.reference || response.data?.id,
        message: response.data?.message || 'OK',
        receivedAt: new Date()
      };
      erpExport.exportedAt = new Date();

      // Mettre a jour prefacturation
      prefacturation.finalInvoice.sentToERP = true;
      prefacturation.finalInvoice.erpExportDate = new Date();
      prefacturation.finalInvoice.erpReference = response.data?.reference;
      prefacturation.finalInvoice.erpSystem = erpSystem;
      prefacturation.status = 'exported';

    } catch (error) {
      erpExport.status = 'failed';
      erpExport.lastError = error.message;
      erpExport.attempts = 1;
      erpExport.nextRetry = new Date(Date.now() + 60 * 60 * 1000); // Retry dans 1h
    }
  } else {
    // Pas d'endpoint, juste generer les donnees
    erpExport.status = 'sent';
    erpExport.exportedAt = new Date();
  }

  await erpExport.save();

  prefacturation.auditTrail.push({
    action: 'ERP_EXPORT',
    performedBy: 'system',
    timestamp: new Date(),
    details: { exportId: erpExport.exportId, erpSystem, status: erpExport.status }
  });
  await prefacturation.save();

  // Notification
  await sendBillingNotification('billing.exported', {
    prefacturationId,
    exportId: erpExport.exportId,
    erpSystem,
    status: erpExport.status
  }, [prefacturation.clientId]);

  return { erpExport, exportData };
};

// ===========================================
// CRON JOBS
// ===========================================

const setupCronJobs = () => {
  // Timeout validation transporteur (tous les jours a 8h)
  cron.schedule('0 8 * * *', async () => {
    console.log('[CRON] Verification timeouts validation transporteur...');

    try {
      const timedOut = await Prefacturation.find({
        'carrierValidation.status': 'pending',
        'carrierValidation.timeoutAt': { $lt: new Date() }
      });

      for (const pref of timedOut) {
        pref.carrierValidation.status = 'timeout';
        pref.status = 'conflict_closed';
        pref.auditTrail.push({
          action: 'CARRIER_VALIDATION_TIMEOUT',
          performedBy: 'system',
          timestamp: new Date(),
          details: { message: 'Application automatique de la prefacturation SYMPHONI.A' }
        });
        await pref.save();

        console.log(`[CRON] Timeout: ${pref.prefacturationId}`);
      }

      console.log(`[CRON] ${timedOut.length} prefacturations en timeout traitees`);
    } catch (error) {
      console.error('[CRON] Erreur timeout:', error.message);
    }
  }, { timezone: 'Europe/Paris' });

  // Archivage (le 1er de chaque mois)
  cron.schedule('0 2 1 * *', async () => {
    console.log('[CRON] Archivage des factures anciennes...');

    try {
      const archiveDate = new Date();
      archiveDate.setFullYear(archiveDate.getFullYear() - ARCHIVE_RETENTION_YEARS);

      const toArchive = await Prefacturation.find({
        status: 'exported',
        'archive.archivedAt': null,
        'finalInvoice.generatedAt': { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // > 30 jours
      });

      for (const pref of toArchive) {
        pref.archive = {
          archivedAt: new Date(),
          retentionUntil: new Date(Date.now() + ARCHIVE_RETENTION_YEARS * 365 * 24 * 60 * 60 * 1000),
          archiveReference: `ARCH-${pref.prefacturationId}-${Date.now()}`
        };
        pref.status = 'archived';
        await pref.save();
      }

      console.log(`[CRON] ${toArchive.length} factures archivees`);
    } catch (error) {
      console.error('[CRON] Erreur archivage:', error.message);
    }
  }, { timezone: 'Europe/Paris' });

  console.log('[CRON] Taches planifiees configurees');
};


// ===========================================
// ROUTE API - SEED DATA (Demo/Dev)
// ===========================================

// Reseed: delete existing demo data
app.delete('/api/billing/seed', async (req, res) => {
  try {
    const deletedPref = await Prefacturation.deleteMany({ prefacturationId: /^PREF-2025-00/ });
    const deletedGrid = await TariffGrid.deleteMany({ gridId: /^GRID-DEMO-/ });
    const deletedVig = await CarrierVigilance.deleteMany({ vigilanceId: /^VIG-DEMO-/ });

    res.json({
      success: true,
      message: 'Demo data deleted',
      data: {
        prefacturations: deletedPref.deletedCount,
        tariffGrids: deletedGrid.deletedCount,
        vigilances: deletedVig.deletedCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/billing/seed', async (req, res) => {
  try {
    // Transporteurs demo avec emails de test
    const transporters = [
      { id: 'TR-001', name: 'NordTrans SARL', siret: '12345678901234', email: 'test-transporteur1@symphoni-a.com' },
      { id: 'TR-002', name: 'Express Logistics', siret: '98765432109876', email: 'test-transporteur2@symphoni-a.com' },
      { id: 'TR-003', name: 'TransEurope SA', siret: '45678901234567', email: 'test-transporteur3@symphoni-a.com' }
    ];

    // Industriels demo avec emails de test
    const industrials = [
      { id: 'IND-001', name: 'Acme Industries', siret: '11111111111111', email: 'test-industriel1@symphoni-a.com' },
      { id: 'IND-002', name: 'TechnoPlast SAS', siret: '22222222222222', email: 'test-industriel2@symphoni-a.com' }
    ];

    const prefacturations = [];
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Creer 10 prefacturations de demo
    for (let i = 0; i < 10; i++) {
      const transporter = transporters[i % transporters.length];
      const industrial = industrials[i % industrials.length];
      const baseAmount = Math.floor(Math.random() * 2000) + 500;
      const waitingAmount = Math.floor(Math.random() * 200);
      const totalHT = baseAmount + waitingAmount;
      const tva = totalHT * 0.20;
      const totalTTC = totalHT + tva;

      const statuses = ['draft', 'generated', 'pending_validation', 'validated', 'finalized', 'exported'];
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      const prefacturation = new Prefacturation({
        prefacturationId: `PREF-2025-${String(i + 1).padStart(4, '0')}`,
        orderId: `CMD-2025-${String(1000 + i).padStart(6, '0')}`,
        transporterId: transporter.id,
        transporterName: transporter.name,
        transporterSiret: transporter.siret,
        transporterEmail: transporter.email,
        clientId: industrial.id,
        clientName: industrial.name,
        clientSiret: industrial.siret,
        clientEmail: industrial.email,
        status: status,
        orderData: {
          pickupDate: new Date(currentYear, currentMonth - 1, Math.floor(Math.random() * 28) + 1),
          deliveryDate: new Date(currentYear, currentMonth - 1, Math.floor(Math.random() * 28) + 1),
          pickupAddress: 'Lyon 69001, France',
          deliveryAddress: 'Paris 75001, France',
          pickupPostalCode: '69001',
          deliveryPostalCode: '75001',
          distance: Math.floor(Math.random() * 500) + 100,
          duration: Math.floor(Math.random() * 8) + 2,
          vehicleType: ['Porteur', 'Semi', 'Fourgon'][Math.floor(Math.random() * 3)]
        },
        cargo: {
          weight: Math.floor(Math.random() * 20000) + 1000,
          volume: Math.floor(Math.random() * 80) + 10,
          pallets: Math.floor(Math.random() * 33) + 1,
          description: 'Marchandises diverses'
        },
        calculation: {
          basePrice: baseAmount,
          distancePrice: 0,
          optionsPrice: 0,
          waitingTimePrice: waitingAmount,
          palettesPrice: 0,
          penalties: 0,
          surcharges: 0,
          discounts: 0,
          totalHT: totalHT,
          tva: tva,
          totalTTC: totalTTC
        },
        payment: {
          dueDate: new Date(currentYear, currentMonth, 15),
          paymentTermDays: 30,
          iban: 'FR76' + Math.random().toString().slice(2, 25),
          bic: 'BNPAFRPP',
          bankName: 'BNP Paribas'
        },
        auditTrail: [{
          action: 'created',
          timestamp: new Date(),
          userId: 'system',
          details: { source: 'seed' }
        }],
        createdAt: new Date(currentYear, currentMonth - 1, Math.floor(Math.random() * 28) + 1)
      });

      await prefacturation.save();
      prefacturations.push(prefacturation);
    }

    // Creer des grilles tarifaires
    for (const transporter of transporters) {
      for (const industrial of industrials) {
        const existingGrid = await TariffGrid.findOne({
          transporterId: transporter.id,
          clientId: industrial.id
        });

        if (!existingGrid) {
          const tariffGrid = new TariffGrid({
            gridId: `GRID-${transporter.id}-${industrial.id}`,
            transporterId: transporter.id,
            clientId: industrial.id,
            name: `Grille ${transporter.name} - ${industrial.name}`,
            validFrom: new Date(currentYear, 0, 1),
            validTo: new Date(currentYear, 11, 31),
            baseRates: [
              { zoneFrom: 'FR-69', zoneTo: 'FR-75', minKm: 0, maxKm: 500, pricePerKm: 1.20, fixedPrice: 150 },
              { zoneFrom: 'FR-69', zoneTo: 'FR-13', minKm: 0, maxKm: 300, pricePerKm: 1.35, fixedPrice: 120 }
            ],
            options: {
              adr: 15,
              hayon: 50,
              express: 25,
              frigo: 20,
              palettesEchange: 8,
              weekend: 30,
              nuit: 20
            },
            waitingTime: {
              freeMinutes: 30,
              pricePerHour: 45
            }
          });
          await tariffGrid.save();
        }
      }
    }

    // Creer des vigilances transporteur
    for (const transporter of transporters) {
      const existingVigilance = await CarrierVigilance.findOne({ transporterId: transporter.id });

      if (!existingVigilance) {
        const vigilance = new CarrierVigilance({
          vigilanceId: `VIG-${transporter.id}`,
          transporterId: transporter.id,
          transporterName: transporter.name,
          documents: {
            urssaf: { present: true, validUntil: new Date(currentYear, 11, 31), verifiedAt: new Date() },
            assurance: { present: true, validUntil: new Date(currentYear, 11, 31), verifiedAt: new Date() },
            licenceTransport: { present: true, validUntil: new Date(currentYear + 2, 11, 31), verifiedAt: new Date() },
            kbis: { present: true, validUntil: new Date(currentYear, 11, 31), verifiedAt: new Date() }
          },
          globalStatus: 'valid',
          lastChecked: new Date()
        });
        await vigilance.save();
      }
    }

    res.json({
      success: true,
      message: 'Donnees de demonstration creees',
      data: {
        prefacturations: prefacturations.length,
        tariffGrids: transporters.length * industrials.length,
        vigilances: transporters.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint public pour lister les prefacturations (demo)
app.get('/api/billing/demo/prefacturations', async (req, res) => {
  try {
    const { clientId, transporterId, status, month, year, limit = 50 } = req.query;
    const filter = {};

    if (clientId) filter.clientId = clientId;
    if (transporterId) filter.transporterId = transporterId;
    if (status) filter.status = status;

    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);
      filter.createdAt = { $gte: startDate, $lte: endDate };
    }

    const prefacturations = await Prefacturation.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({ success: true, data: prefacturations, count: prefacturations.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint public pour stats (demo)
app.get('/api/billing/demo/stats', async (req, res) => {
  try {
    const { clientId, month, year } = req.query;
    const filter = {};

    if (clientId) filter.clientId = clientId;

    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);
      filter.createdAt = { $gte: startDate, $lte: endDate };
    }

    const total = await Prefacturation.countDocuments(filter);
    const byStatus = await Prefacturation.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const totalAmounts = await Prefacturation.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalHT: { $sum: '$calculation.totalHT' },
          totalTTC: { $sum: '$calculation.totalTTC' }
        }
      }
    ]);

    const pendingAmount = await Prefacturation.aggregate([
      { $match: { ...filter, status: { $nin: ['paid', 'archived'] } } },
      { $group: { _id: null, amount: { $sum: '$calculation.totalTTC' } } }
    ]);

    const paidAmount = await Prefacturation.aggregate([
      { $match: { ...filter, status: 'paid' } },
      { $group: { _id: null, amount: { $sum: '$calculation.totalTTC' } } }
    ]);

    res.json({
      success: true,
      data: {
        prefacturations: {
          total,
          byStatus: byStatus.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {})
        },
        amounts: {
          totalHT: totalAmounts[0]?.totalHT || 0,
          totalTTC: totalAmounts[0]?.totalTTC || 0,
          pending: pendingAmount[0]?.amount || 0,
          paid: paidAmount[0]?.amount || 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// SCENARIO DEMO - Demonstration du processus complet
// ===========================================

app.post('/api/billing/demo/scenario', async (req, res) => {
  try {
    const { userEmail } = req.body;

    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'userEmail requis pour recevoir les notifications du scenario'
      });
    }

    const scenario = {
      steps: [],
      prefacturation: null
    };

    // ETAPE 1: Creation de la prefacturation
    const prefacturationId = `PREF-DEMO-${Date.now()}`;
    const orderId = `CMD-DEMO-${Date.now()}`;

    const prefacturation = new Prefacturation({
      prefacturationId,
      orderId,
      transporterId: 'TR-DEMO-SCENARIO',
      transporterName: 'Transport Express Lyon SARL',
      transporterEmail: userEmail,
      transporterSiret: '12345678901234',
      clientId: 'IND-DEMO-SCENARIO',
      clientName: 'Carrefour Logistique SAS',
      clientEmail: userEmail,
      clientSiret: '98765432109876',
      status: 'generated',
      orderData: {
        pickupDate: new Date('2025-12-20T08:00:00Z'),
        deliveryDate: new Date('2025-12-20T14:30:00Z'),
        pickupAddress: 'Zone Industrielle Lyon-Est, 69800 Saint-Priest',
        deliveryAddress: 'Entrepot Carrefour, 75019 Paris',
        pickupPostalCode: '69800',
        deliveryPostalCode: '75019',
        distance: 465,
        duration: 330,
        vehicleType: 'Semi-remorque',
        vehiclePlate: 'AB-123-CD',
        driverName: 'Jean Dupont'
      },
      cargo: {
        description: 'Palettes produits alimentaires frais',
        weight: 18500,
        volume: 72,
        pallets: 33,
        packages: 0,
        isADR: false
      },
      calculation: {
        basePrice: 850,
        distancePrice: 232.50,
        optionsPrice: 0,
        waitingTimePrice: 45,
        palettesPrice: 165,
        penalties: 0,
        surcharges: 0,
        discounts: -50,
        totalHT: 1242.50,
        tva: 248.50,
        totalTTC: 1491
      },
      calculationDetails: [
        { item: 'Prix de base', description: 'Tarif grille Semi-remorque', quantity: 1, unitPrice: 850, total: 850 },
        { item: 'Distance', description: '465 km x 0.50 EUR/km', quantity: 465, unitPrice: 0.50, total: 232.50 },
        { item: 'Attente', description: '45 min facturable', quantity: 45, unitPrice: 1, total: 45 },
        { item: 'Palettes', description: '33 palettes x 5 EUR', quantity: 33, unitPrice: 5, total: 165 },
        { item: 'Remise', description: 'Remise fidelite client', quantity: 1, unitPrice: -50, total: -50 }
      ],
      kpiData: {
        deliveries: 47,
        onTimeRate: 92.5,
        incidents: 2,
        satisfactionRate: 4.6,
        totalDistance: 12500,
        revenue: 45000,
        globalScore: 87
      },
      payment: {
        dueDate: new Date('2026-01-20'),
        paymentTermDays: 30,
        iban: 'FR7630001007941234567890185',
        bic: 'BDFEFRPPCCT',
        bankName: 'Banque de France'
      },
      auditTrail: [{
        action: 'created',
        timestamp: new Date(),
        userId: 'demo-scenario',
        details: { source: 'scenario_demo', userEmail }
      }]
    });

    // Générer l'analyse IA des KPIs
    try {
      console.log('[DEMO SCENARIO] Generating AI analysis for Transport Express Lyon SARL');
      const kpiAnalysis = await ClaudeAIService.analyzeKPI(prefacturation.kpiData, 'Transport Express Lyon SARL');
      prefacturation.kpiAnalysis = {
        ...kpiAnalysis,
        generatedAt: new Date(),
        generatedBy: 'SYMPHONI.A AI'
      };
      console.log('[DEMO SCENARIO] AI analysis generated:', kpiAnalysis.trend);
    } catch (aiError) {
      console.error('[DEMO SCENARIO] AI analysis error:', aiError.message);
    }

    await prefacturation.save();
    scenario.steps.push({
      step: 1,
      name: 'Creation prefacturation',
      status: 'completed',
      details: {
        prefacturationId,
        orderId,
        montantHT: 1242.50,
        montantTTC: 1491
      }
    });

    // ETAPE 2: Envoi email au transporteur avec PDF
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'https://app.symphoni-a.com';
      const emailData = {
        prefacturationId,
        orderId,
        transporterName: prefacturation.transporterName,
        clientName: prefacturation.clientName,
        pickupAddress: prefacturation.orderData.pickupAddress,
        deliveryAddress: prefacturation.orderData.deliveryAddress,
        deliveryDate: '20/12/2025',
        totalHT: prefacturation.calculation.totalHT,
        tva: prefacturation.calculation.tva,
        totalTTC: prefacturation.calculation.totalTTC,
        validationUrl: `${frontendUrl}/billing/prefacturation/${prefacturationId}`
      };

      // Générer le PDF de préfacturation
      const pdfBuffer = await PDFService.generatePrefacturationPDF({
        ...prefacturation.toObject(),
        pickupAddress: prefacturation.orderData.pickupAddress,
        deliveryAddress: prefacturation.orderData.deliveryAddress,
        distance: prefacturation.orderData.distance
      });

      const html = EmailTemplates.newPrefacturationTransporter(emailData);

      // Envoyer avec pièce jointe PDF
      await sendEmailWithAttachment(
        userEmail,
        `[DEMO] Nouvelle prefacturation ${prefacturationId}`,
        html,
        [{
          filename: `Prefacturation_${prefacturationId}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }]
      );

      scenario.steps.push({
        step: 2,
        name: 'Email envoye au transporteur avec PDF',
        status: 'completed',
        details: { to: userEmail, type: 'new_prefacturation_transporter', pdfAttached: true }
      });

      prefacturation.auditTrail.push({
        action: 'email_sent',
        timestamp: new Date(),
        userId: 'demo-scenario',
        details: { type: 'new_prefacturation_transporter', to: userEmail, pdfAttached: true }
      });
      prefacturation.status = 'pending_validation';
      await prefacturation.save();

    } catch (emailError) {
      console.error('[DEMO] Email error:', emailError);
      scenario.steps.push({
        step: 2,
        name: 'Email au transporteur',
        status: 'failed',
        error: emailError.message
      });
    }

    // ETAPE 3: Simulation validation transporteur (apres 2 secondes)
    prefacturation.carrierValidation = {
      status: 'accepted',
      sentAt: new Date(),
      respondedAt: new Date(),
      comment: 'Montant conforme a notre facture'
    };
    prefacturation.status = 'validated';
    prefacturation.auditTrail.push({
      action: 'carrier_validated',
      timestamp: new Date(),
      userId: 'demo-scenario',
      details: { method: 'auto_demo' }
    });
    await prefacturation.save();

    scenario.steps.push({
      step: 3,
      name: 'Validation transporteur',
      status: 'completed',
      details: { validatedAt: new Date().toISOString(), comment: 'Montant conforme' }
    });

    // ETAPE 4: Email de confirmation
    try {
      const confirmData = {
        prefacturationId,
        orderId,
        transporterName: prefacturation.transporterName,
        totalHT: prefacturation.calculation.totalHT,
        tva: prefacturation.calculation.tva,
        totalTTC: prefacturation.calculation.totalTTC,
        validatedAt: new Date().toLocaleString('fr-FR'),
        paymentTermDays: 30
      };

      const confirmHtml = EmailTemplates.prefacturationValidatedTransporter(confirmData);
      await EmailService.send(userEmail, `[DEMO] Prefacturation ${prefacturationId} validee`, confirmHtml);

      scenario.steps.push({
        step: 4,
        name: 'Email confirmation validation',
        status: 'completed',
        details: { to: userEmail, type: 'validated' }
      });

    } catch (emailError) {
      scenario.steps.push({
        step: 4,
        name: 'Email confirmation',
        status: 'failed',
        error: emailError.message
      });
    }

    // ETAPE 5: Finalisation et pret pour export
    prefacturation.status = 'finalized';
    prefacturation.auditTrail.push({
      action: 'finalized',
      timestamp: new Date(),
      userId: 'demo-scenario',
      details: { readyForExport: true }
    });
    await prefacturation.save();

    scenario.steps.push({
      step: 5,
      name: 'Prefacturation finalisee',
      status: 'completed',
      details: { status: 'finalized', readyForExport: true }
    });

    scenario.prefacturation = {
      id: prefacturation._id,
      prefacturationId,
      orderId,
      transporterName: prefacturation.transporterName,
      clientName: prefacturation.clientName,
      status: prefacturation.status,
      montantHT: prefacturation.calculation.totalHT,
      montantTTC: prefacturation.calculation.totalTTC,
      trajet: `${prefacturation.orderData.pickupAddress} -> ${prefacturation.orderData.deliveryAddress}`,
      distance: `${prefacturation.orderData.distance} km`
    };

    res.json({
      success: true,
      message: 'Scenario de demonstration execute avec succes',
      scenario
    });

  } catch (error) {
    console.error('[DEMO SCENARIO] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint pour télécharger le PDF d'une préfacturation
app.get('/api/billing/prefacturations/:prefacturationId/pdf', async (req, res) => {
  try {
    const { prefacturationId } = req.params;
    const prefacturation = await Prefacturation.findOne({ prefacturationId });

    if (!prefacturation) {
      return res.status(404).json({ success: false, error: 'Prefacturation non trouvee' });
    }

    // Générer le PDF
    const pdfBuffer = await PDFService.generatePrefacturationPDF({
      ...prefacturation.toObject(),
      pickupAddress: prefacturation.orderData?.pickupAddress || prefacturation.pickupAddress,
      deliveryAddress: prefacturation.orderData?.deliveryAddress || prefacturation.deliveryAddress,
      distance: prefacturation.orderData?.distance || prefacturation.distance
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Prefacturation_${prefacturationId}.pdf"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('[PDF GENERATION] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Demo: Génération de préfacturation depuis une vraie commande
app.post('/api/billing/demo/generate-from-real-order', async (req, res) => {
  try {
    const { orderNumber, orderId, userEmail, includeKPI = true } = req.body;

    if (!orderNumber && !orderId) {
      return res.status(400).json({ success: false, error: 'orderNumber ou orderId requis' });
    }

    // 1. Récupérer la commande depuis orders-api
    let order;
    if (orderNumber) {
      order = await OrdersService.getOrderByNumber(orderNumber);
    } else {
      order = await OrdersService.getOrderById(orderId);
    }

    if (!order) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée dans orders-api' });
    }

    // 2. Récupérer la grille tarifaire applicable
    const carrierId = order.carrier?.id || order.assignedCarrier?.carrierId || 'default-carrier';
    const clientId = order.client?.id || order.organizationId || 'default-client';

    const tariffGrid = await TariffCalculationService.findApplicableTariffGrid(carrierId, clientId);

    // 3. Calculer le prix
    const calculation = TariffCalculationService.calculateOrderPrice(order, tariffGrid);

    // 4. Récupérer KPI (simulation si pas disponible)
    let kpiData = null;
    let kpiAnalysis = null;
    const transporterName = order.carrier?.name || order.assignedCarrier?.carrierName || 'Transporteur';

    if (includeKPI) {
      const lastMonth = moment().subtract(1, 'month');
      kpiData = await KPIService.getCarrierMonthlyKPI(carrierId, lastMonth.month() + 1, lastMonth.year());

      // Si pas de KPI réels, simuler pour la démo
      if (!kpiData) {
        kpiData = {
          deliveries: Math.floor(Math.random() * 50) + 20,
          onTimeRate: 85 + Math.random() * 14,
          incidents: Math.floor(Math.random() * 5),
          satisfactionRate: 3.5 + Math.random() * 1.5,
          totalDistance: Math.floor(Math.random() * 15000) + 5000,
          revenue: Math.floor(Math.random() * 50000) + 20000,
          globalScore: 70 + Math.floor(Math.random() * 25)
        };
      }

      // 4b. Générer l'analyse IA des KPI
      console.log('[KPI ANALYSIS] Generating AI analysis for', transporterName);
      kpiAnalysis = await ClaudeAIService.analyzeKPI(kpiData, transporterName);
      kpiAnalysis.generatedAt = new Date();
      kpiAnalysis.generatedBy = 'SYMPHONI.A AI';
      console.log('[KPI ANALYSIS] Analysis generated:', kpiAnalysis.trend);
    }

    // 5. Créer la préfacturation
    const prefacturationId = `PREF-REAL-${moment().format('YYYYMMDD')}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

    const prefacturation = new Prefacturation({
      prefacturationId,
      orderId: order.orderNumber || order.reference || order._id,
      externalReference: order.externalReference,
      transporterId: carrierId,
      transporterName: order.carrier?.name || order.assignedCarrier?.carrierName || 'Transporteur',
      transporterEmail: userEmail || order.carrier?.email,
      clientId: clientId,
      clientName: order.client?.name || 'Client',
      clientEmail: userEmail || order.client?.email,
      status: 'generated',

      orderData: {
        pickupDate: order.pickup?.scheduledDate || order.dates?.pickupDate || order.pickupDate,
        deliveryDate: order.delivery?.scheduledDate || order.dates?.deliveryDate || order.deliveryDate,
        pickupAddress: order.pickup?.company ? `${order.pickup.company}, ${order.pickup.city || ''}` :
                       (order.pickupAddress?.city ? `${order.pickupAddress.street || ''}, ${order.pickupAddress.city}` : ''),
        deliveryAddress: order.delivery?.company ? `${order.delivery.company}, ${order.delivery.city || ''}` :
                         (order.deliveryAddress?.city ? `${order.deliveryAddress.street || ''}, ${order.deliveryAddress.city}` : ''),
        pickupPostalCode: order.pickup?.postalCode || order.pickupAddress?.postalCode,
        deliveryPostalCode: order.delivery?.postalCode || order.deliveryAddress?.postalCode,
        // Calcul distance approximative si non fournie (via coordonnées si disponibles)
        distance: order.pricing?.distance || order.distance || (() => {
          // Calculer distance approximative via coordonnées GPS si disponibles
          const pickupCoords = order.pickup?.coordinates || order.pickupAddress?.coordinates;
          const deliveryCoords = order.delivery?.coordinates || order.deliveryAddress?.coordinates;
          if (pickupCoords?.latitude && deliveryCoords?.latitude) {
            const R = 6371; // Rayon Terre en km
            const dLat = (deliveryCoords.latitude - pickupCoords.latitude) * Math.PI / 180;
            const dLon = (deliveryCoords.longitude - pickupCoords.longitude) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(pickupCoords.latitude * Math.PI / 180) * Math.cos(deliveryCoords.latitude * Math.PI / 180) *
                      Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const distanceKm = Math.round(R * c * 1.3); // x1.3 pour route réelle approx
            return distanceKm;
          }
          return 0;
        })(),
        vehicleType: order.requirements?.vehicleType || order.vehicleType,
        driverName: order.driver?.name
      },

      cargo: {
        description: order.cargo?.description || order.goods?.description || '',
        weight: typeof order.cargo?.weight === 'number' ? order.cargo.weight :
                (order.cargo?.weight?.value || order.goods?.weight || 0),
        volume: typeof order.cargo?.volume === 'number' ? order.cargo.volume :
                (order.cargo?.volume?.value || order.goods?.volume || 0),
        pallets: order.cargo?.pallets || order.cargo?.quantity || order.goods?.palettes || order.goods?.quantity || 0,
        isADR: order.cargo?.hazardous || false,
        adrClass: order.cargo?.hazardousClass || order.cargo?.adrClass || null
      },

      options: {
        adr: order.services?.adr || order.cargo?.hazardous || false,
        hayon: order.services?.tailgate || order.requirements?.hayon || false,
        express: order.transportType === 'express',
        frigo: order.services?.temperature_controlled || false
      },

      calculation: {
        gridId: tariffGrid?.gridId || null,
        basePrice: calculation.basePrice,
        distancePrice: calculation.distancePrice,
        optionsPrice: calculation.optionsPrice,
        waitingTimePrice: calculation.waitingTimePrice,
        palettesPrice: calculation.palettesPrice,
        penalties: calculation.penalties,
        surcharges: calculation.surcharges,
        discounts: calculation.discounts,
        totalHT: calculation.totalHT,
        tva: calculation.tva,
        totalTTC: calculation.totalTTC
      },
      calculationDetails: calculation.details,

      kpiData: kpiData,
      kpiAnalysis: kpiAnalysis,

      payment: {
        dueDate: moment().add(30, 'days').toDate(),
        paymentTermDays: 30
      },

      auditTrail: [{
        action: 'demo_generated_from_real_order',
        timestamp: new Date(),
        performedBy: 'demo-user',
        details: { orderNumber: order.orderNumber, orderId: order._id }
      }]
    });

    await prefacturation.save();

    // 6. Générer le PDF et envoyer par email si demandé
    let emailSent = false;
    if (userEmail) {
      try {
        const pdfBuffer = await PDFService.generatePrefacturationPDF({
          ...prefacturation.toObject(),
          pickupAddress: prefacturation.orderData.pickupAddress,
          deliveryAddress: prefacturation.orderData.deliveryAddress,
          distance: prefacturation.orderData.distance
        });

        const emailData = {
          prefacturationId,
          orderId: order.orderNumber || order.reference,
          transporterName: prefacturation.transporterName,
          clientName: prefacturation.clientName,
          pickupAddress: prefacturation.orderData.pickupAddress,
          deliveryAddress: prefacturation.orderData.deliveryAddress,
          deliveryDate: moment(prefacturation.orderData.deliveryDate).format('DD/MM/YYYY'),
          totalHT: calculation.totalHT,
          tva: calculation.tva,
          totalTTC: calculation.totalTTC,
          validationUrl: `${process.env.FRONTEND_URL || 'https://app.symphoni-a.com'}/billing/prefacturation/${prefacturationId}`
        };

        const html = EmailTemplates.newPrefacturationTransporter(emailData);

        await sendEmailWithAttachment(
          userEmail,
          `Préfacturation ${prefacturationId} - Commande ${order.orderNumber || order.reference}`,
          html,
          [{
            filename: `Prefacturation_${prefacturationId}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }]
        );
        emailSent = true;
      } catch (emailErr) {
        console.error('[DEMO] Email error:', emailErr.message);
      }
    }

    console.log('[DEMO] Real order prefacturation generated:', prefacturationId);

    res.json({
      success: true,
      message: 'Préfacturation générée depuis commande réelle',
      data: {
        prefacturationId,
        orderId: order.orderNumber || order.reference,
        transporterName: prefacturation.transporterName,
        clientName: prefacturation.clientName,
        totalHT: calculation.totalHT,
        totalTTC: calculation.totalTTC,
        tariffGridUsed: tariffGrid?.name || 'Tarif par défaut',
        kpiIncluded: !!kpiData,
        emailSent,
        pdfUrl: `/api/billing/prefacturations/${prefacturationId}/pdf`
      }
    });

  } catch (error) {
    console.error('[DEMO] Real order error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Scenario de contestation
app.post('/api/billing/demo/scenario-contestation', async (req, res) => {
  try {
    const { userEmail, prefacturationId } = req.body;

    if (!userEmail) {
      return res.status(400).json({ success: false, error: 'userEmail requis' });
    }

    // Trouver une prefacturation existante ou en creer une
    let prefacturation;
    if (prefacturationId) {
      prefacturation = await Prefacturation.findOne({ prefacturationId });
    }

    if (!prefacturation) {
      // Creer une nouvelle pour le scenario
      prefacturation = new Prefacturation({
        prefacturationId: `PREF-CONTEST-${Date.now()}`,
        orderId: `CMD-CONTEST-${Date.now()}`,
        transporterId: 'TR-CONTEST',
        transporterName: 'TransContest SARL',
        transporterEmail: userEmail,
        clientId: 'IND-CONTEST',
        clientName: 'Client Industries',
        clientEmail: userEmail,
        status: 'pending_validation',
        orderData: {
          pickupAddress: 'Marseille',
          deliveryAddress: 'Lille',
          distance: 1000
        },
        calculation: {
          totalHT: 2500,
          tva: 500,
          totalTTC: 3000
        }
      });
      await prefacturation.save();
    }

    // Simuler contestation
    prefacturation.status = 'contested';
    prefacturation.carrierValidation = {
      status: 'contested',
      sentAt: new Date(),
      respondedAt: new Date(),
      comment: 'Ecart sur le nombre de kilometres - 1200 km effectues au lieu de 1000 km'
    };
    prefacturation.discrepancies.push({
      type: 'distance',
      description: 'Kilometrage conteste par transporteur',
      expectedValue: 1000,
      actualValue: 1200,
      difference: 200,
      differencePercent: 20,
      status: 'detected'
    });
    await prefacturation.save();

    // Envoyer email de contestation
    try {
      const contestData = {
        prefacturationId: prefacturation.prefacturationId,
        orderId: prefacturation.orderId,
        transporterName: prefacturation.transporterName,
        totalHT: prefacturation.calculation.totalHT,
        contestReason: 'Ecart sur le nombre de kilometres - 1200 km effectues au lieu de 1000 km declares',
        disputeUrl: `https://app.symphoni-a.com/billing/dispute/${prefacturation.prefacturationId}`
      };

      const html = EmailTemplates.prefacturationContested(contestData);
      await EmailService.send(userEmail, `[DEMO] Contestation prefacturation ${prefacturation.prefacturationId}`, html);
    } catch (e) {
      console.error('Email error:', e);
    }

    res.json({
      success: true,
      message: 'Scenario de contestation execute',
      prefacturation: {
        prefacturationId: prefacturation.prefacturationId,
        status: 'contested',
        motif: 'Ecart kilometrage +200km'
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - HEALTH CHECK
// ===========================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'billing-api',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/billing/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Module Prefacturation & Facturation Transport',
    version: '1.0.0',
    features: [
      'prefacturation-automatique',
      'detection-ecarts',
      'validation-transporteur',
      'blocages-automatiques',
      'export-erp',
      'archivage-10-ans'
    ],
    email: {
      mailgun: {
        configured: !!mgClient,
        domain: MAILGUN_CONFIG.domain,
        apiKeyPrefix: MAILGUN_CONFIG.apiKey ? MAILGUN_CONFIG.apiKey.substring(0, 10) + '...' : 'not set'
      },
      smtp: {
        configured: !!smtpTransporter,
        host: EMAIL_CONFIG.smtp.host
      }
    }
  });
});

// Debug email endpoint (no auth for testing)
app.post('/api/billing/debug/email', async (req, res) => {
  const { to } = req.body;
  const testEmail = to || 'r.tardy@rt-groupe.com';

  const results = {
    config: {
      ses: {
        configured: !!sesClient,
        region: EMAIL_CONFIG.awsRegion,
        from: EMAIL_CONFIG.from
      },
      mailgun: {
        domain: MAILGUN_CONFIG.domain,
        apiKeyPrefix: MAILGUN_CONFIG.apiKey ? MAILGUN_CONFIG.apiKey.substring(0, 10) + '...' : 'not set',
        clientInitialized: !!mgClient
      },
      smtp: {
        host: EMAIL_CONFIG.smtp.host,
        transporterInitialized: !!smtpTransporter
      }
    },
    tests: {}
  };

  // Test AWS SES (Primary)
  if (sesClient) {
    try {
      const sesResult = await EmailService.sendViaSES(
        testEmail,
        '[TEST] Billing API - AWS SES Test',
        '<h1>Test AWS SES</h1><p>Email de test depuis billing-api via AWS SES</p>'
      );
      results.tests.ses = { success: true, messageId: sesResult.messageId };
    } catch (err) {
      results.tests.ses = { success: false, error: err.message };
    }
  } else {
    results.tests.ses = { success: false, error: 'SES client not initialized' };
  }

  // Test Mailgun
  if (mgClient) {
    try {
      const mgResult = await mgClient.messages.create(MAILGUN_CONFIG.domain, {
        from: `Test <${MAILGUN_CONFIG.from}>`,
        to: [testEmail],
        subject: '[TEST] Billing API - Mailgun Test',
        html: '<h1>Test Mailgun</h1><p>Email de test depuis billing-api</p>'
      });
      results.tests.mailgun = { success: true, messageId: mgResult.id };
    } catch (err) {
      results.tests.mailgun = { success: false, error: err.message, details: err.details || err.status };
    }
  } else {
    results.tests.mailgun = { success: false, error: 'Mailgun client not initialized' };
  }

  // Test SMTP (skip for now as it's failing)
  results.tests.smtp = { success: false, error: 'SMTP OVH authentication issues - skipped' };

  res.json(results);
});

// ===========================================
// ROUTES API - GRILLES TARIFAIRES
// ===========================================

app.post('/api/billing/tariffs', authenticateToken, async (req, res) => {
  try {
    const tariff = new TariffGrid({
      gridId: `GRID-${uuidv4().slice(0, 8).toUpperCase()}`,
      ...req.body
    });
    await tariff.save();
    res.status(201).json({ success: true, data: tariff });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/billing/tariffs', authenticateToken, async (req, res) => {
  try {
    const { transporterId, clientId, active } = req.query;
    const filter = {};
    if (transporterId) filter.transporterId = transporterId;
    if (clientId) filter.clientId = clientId;
    if (active !== undefined) filter.active = active === 'true';

    const tariffs = await TariffGrid.find(filter);
    res.json({ success: true, data: tariffs, count: tariffs.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/billing/tariffs/:gridId', authenticateToken, async (req, res) => {
  try {
    const tariff = await TariffGrid.findOne({ gridId: req.params.gridId });
    if (!tariff) {
      return res.status(404).json({ success: false, error: 'Grille tarifaire non trouvee' });
    }
    res.json({ success: true, data: tariff });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - PREFACTURATION
// ===========================================

// Generer une prefacturation
app.post('/api/billing/prefacturation/generate', authenticateToken, async (req, res) => {
  try {
    const { orderId, orderData, transporterId, clientId, options } = req.body;

    if (!orderId || !transporterId || !clientId) {
      return res.status(400).json({
        success: false,
        error: 'orderId, transporterId et clientId requis'
      });
    }

    const prefacturation = await generatePrefacturation(
      orderId,
      orderData || {},
      transporterId,
      clientId,
      options || {}
    );

    res.status(201).json({
      success: true,
      data: prefacturation,
      message: 'Prefacturation generee avec succes'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtenir une prefacturation
app.get('/api/billing/prefacturation/:id', authenticateToken, async (req, res) => {
  try {
    const prefacturation = await Prefacturation.findOne({
      $or: [
        { prefacturationId: req.params.id },
        { orderId: req.params.id }
      ]
    });

    if (!prefacturation) {
      return res.status(404).json({ success: false, error: 'Prefacturation non trouvee' });
    }

    res.json({ success: true, data: prefacturation });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Lister les prefacturations
app.get('/api/billing/prefacturations', authenticateToken, async (req, res) => {
  try {
    const { transporterId, clientId, status, startDate, endDate, limit = 50 } = req.query;
    const filter = {};

    if (transporterId) filter.transporterId = transporterId;
    if (clientId) filter.clientId = clientId;
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const prefacturations = await Prefacturation.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({ success: true, data: prefacturations, count: prefacturations.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// GÉNÉRATION AUTOMATIQUE DE PRÉFACTURATION DEPUIS COMMANDE
// ===========================================

/**
 * Générer une préfacturation depuis une commande orders-api
 * Utilise les grilles tarifaires pour calculer le prix
 */
app.post('/api/billing/prefacturations/generate-from-order', authenticateToken, async (req, res) => {
  try {
    const { orderId, orderNumber, includeKPI = true } = req.body;

    if (!orderId && !orderNumber) {
      return res.status(400).json({ success: false, error: 'orderId ou orderNumber requis' });
    }

    // 1. Récupérer la commande depuis orders-api
    let order;
    if (orderNumber) {
      order = await OrdersService.getOrderByNumber(orderNumber);
    } else {
      order = await OrdersService.getOrderById(orderId);
    }

    if (!order) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée dans orders-api' });
    }

    // Vérifier si une préfacturation existe déjà
    const existingPrefact = await Prefacturation.findOne({
      orderId: order.orderNumber || order._id
    });
    if (existingPrefact) {
      return res.status(409).json({
        success: false,
        error: 'Une préfacturation existe déjà pour cette commande',
        prefacturationId: existingPrefact.prefacturationId
      });
    }

    // 2. Récupérer la grille tarifaire applicable
    const carrierId = order.assignedCarrier?.carrierId;
    const clientId = order.organizationId;

    const tariffGrid = await TariffCalculationService.findApplicableTariffGrid(carrierId, clientId);

    // 3. Calculer le prix selon la grille
    const calculation = TariffCalculationService.calculateOrderPrice(order, tariffGrid);

    // 4. Récupérer les KPI du mois précédent (optionnel)
    let kpiData = null;
    if (includeKPI && carrierId) {
      const lastMonth = moment().subtract(1, 'month');
      kpiData = await KPIService.getCarrierMonthlyKPI(
        carrierId,
        lastMonth.month() + 1,
        lastMonth.year()
      );
    }

    // 5. Créer la préfacturation
    const prefacturationId = `PREF-${moment().format('YYYYMM')}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

    const prefacturation = new Prefacturation({
      prefacturationId,
      orderId: order.orderNumber || order._id,
      externalReference: order.externalReference,
      transporterId: carrierId,
      transporterName: order.assignedCarrier?.carrierName,
      clientId: clientId,
      clientName: order.organizationName,
      status: 'generated',

      // Données de la commande
      orderData: {
        pickupDate: order.pickupDate,
        deliveryDate: order.deliveryDate,
        pickupAddress: `${order.pickup?.street || ''}, ${order.pickup?.postalCode || ''} ${order.pickup?.city || ''}`,
        deliveryAddress: `${order.delivery?.street || ''}, ${order.delivery?.postalCode || ''} ${order.delivery?.city || ''}`,
        pickupPostalCode: order.pickup?.postalCode,
        deliveryPostalCode: order.delivery?.postalCode,
        distance: order.pricing?.breakdown?.distance || 0,
        vehicleType: order.vehicleType,
        vehiclePlate: order.assignedCarrier?.vehiclePlate,
        driverName: order.assignedCarrier?.driverName
      },

      // Marchandise
      cargo: {
        description: order.cargo?.description,
        weight: order.cargo?.weight?.value || 0,
        volume: order.cargo?.volume?.value || 0,
        pallets: order.cargo?.type === 'palette' ? order.cargo?.quantity : 0,
        packages: order.cargo?.type === 'colis' ? order.cargo?.quantity : 0,
        isADR: order.cargo?.hazardous || false,
        adrClass: order.cargo?.hazardousClass
      },

      // Options
      options: {
        adr: order.services?.adr || order.cargo?.hazardous || false,
        hayon: order.services?.tailgate || false,
        express: order.transportType === 'express',
        frigo: order.services?.temperature_controlled || false
      },

      // Calcul
      calculation: {
        gridId: tariffGrid?.gridId || null,
        basePrice: calculation.basePrice,
        distancePrice: calculation.distancePrice,
        optionsPrice: calculation.optionsPrice,
        waitingTimePrice: calculation.waitingTimePrice,
        palettesPrice: calculation.palettesPrice,
        penalties: calculation.penalties,
        surcharges: calculation.surcharges,
        discounts: calculation.discounts,
        totalHT: calculation.totalHT,
        tva: calculation.tva,
        totalTTC: calculation.totalTTC
      },
      calculationDetails: calculation.details,

      // KPI (pour le PDF)
      kpiData: kpiData,

      // Paiement
      payment: {
        dueDate: moment().add(30, 'days').toDate(),
        paymentTermDays: 30
      },

      // Audit
      auditTrail: [{
        action: 'generated_from_order',
        timestamp: new Date(),
        performedBy: req.user?.userId || 'system',
        details: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          tariffGridUsed: tariffGrid?.gridId || 'none'
        }
      }]
    });

    await prefacturation.save();

    console.log('[BILLING] Prefacturation generated:', prefacturationId, 'from order:', order.orderNumber);

    res.status(201).json({
      success: true,
      message: 'Préfacturation générée avec succès',
      data: {
        prefacturationId,
        orderId: order.orderNumber,
        transporterName: order.assignedCarrier?.carrierName,
        clientName: order.organizationName,
        totalHT: calculation.totalHT,
        totalTTC: calculation.totalTTC,
        tariffGridUsed: tariffGrid?.name || 'Tarif par défaut',
        kpiIncluded: !!kpiData
      }
    });

  } catch (error) {
    console.error('[BILLING] Error generating prefacturation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Générer les préfacturations pour toutes les commandes livrées d'une période
 */
app.post('/api/billing/prefacturations/generate-batch', authenticateToken, async (req, res) => {
  try {
    const {
      carrierId,
      clientId,
      startDate,
      endDate,
      includeKPI = true,
      sendEmails = false
    } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'startDate et endDate requis' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Récupérer les commandes livrées
    let orders = [];
    if (carrierId) {
      orders = await OrdersService.getDeliveredOrdersByCarrier(carrierId, start, end);
    } else if (clientId) {
      orders = await OrdersService.getDeliveredOrdersByClient(clientId, start, end);
    } else {
      return res.status(400).json({ success: false, error: 'carrierId ou clientId requis' });
    }

    const results = {
      total: orders.length,
      generated: 0,
      skipped: 0,
      errors: [],
      prefacturations: []
    };

    for (const order of orders) {
      try {
        // Vérifier si préfacturation existe déjà
        const existing = await Prefacturation.findOne({ orderId: order.orderNumber || order._id });
        if (existing) {
          results.skipped++;
          continue;
        }

        // Récupérer grille tarifaire
        const tariffGrid = await TariffCalculationService.findApplicableTariffGrid(
          order.assignedCarrier?.carrierId,
          order.organizationId
        );

        // Calculer
        const calculation = TariffCalculationService.calculateOrderPrice(order, tariffGrid);

        // Créer préfacturation
        const prefacturationId = `PREF-${moment().format('YYYYMM')}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

        const prefacturation = new Prefacturation({
          prefacturationId,
          orderId: order.orderNumber || order._id,
          transporterId: order.assignedCarrier?.carrierId,
          transporterName: order.assignedCarrier?.carrierName,
          clientId: order.organizationId,
          status: 'generated',
          orderData: {
            pickupDate: order.pickupDate,
            deliveryDate: order.deliveryDate,
            pickupAddress: `${order.pickup?.street || ''}, ${order.pickup?.postalCode || ''} ${order.pickup?.city || ''}`,
            deliveryAddress: `${order.delivery?.street || ''}, ${order.delivery?.postalCode || ''} ${order.delivery?.city || ''}`,
            distance: order.pricing?.breakdown?.distance || 0
          },
          cargo: {
            description: order.cargo?.description,
            weight: order.cargo?.weight?.value || 0,
            pallets: order.cargo?.type === 'palette' ? order.cargo?.quantity : 0
          },
          calculation,
          calculationDetails: calculation.details,
          payment: { dueDate: moment().add(30, 'days').toDate(), paymentTermDays: 30 },
          auditTrail: [{
            action: 'batch_generated',
            timestamp: new Date(),
            performedBy: req.user?.userId || 'system'
          }]
        });

        await prefacturation.save();
        results.generated++;
        results.prefacturations.push({
          prefacturationId,
          orderId: order.orderNumber,
          totalHT: calculation.totalHT
        });

      } catch (err) {
        results.errors.push({ orderId: order.orderNumber || order._id, error: err.message });
      }
    }

    console.log('[BILLING] Batch generation completed:', results.generated, 'generated,', results.skipped, 'skipped');

    res.json({
      success: true,
      message: `${results.generated} préfacturations générées`,
      results
    });

  } catch (error) {
    console.error('[BILLING] Batch generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - FACTURES TRANSPORTEUR
// ===========================================

// Upload facture transporteur
app.post('/api/billing/invoice/upload', authenticateToken, upload.single('invoice'), async (req, res) => {
  try {
    const { prefacturationId, invoiceNumber, totalHT, tva, totalTTC, distance, palettes, waitingTimeMinutes } = req.body;

    if (!prefacturationId) {
      return res.status(400).json({ success: false, error: 'prefacturationId requis' });
    }

    const invoiceData = {
      invoiceNumber,
      totalHT: parseFloat(totalHT) || 0,
      tva: parseFloat(tva),
      totalTTC: parseFloat(totalTTC),
      distance: distance ? parseFloat(distance) : null,
      palettes: palettes ? parseInt(palettes) : null,
      waitingTimeMinutes: waitingTimeMinutes ? parseInt(waitingTimeMinutes) : null
    };

    const prefacturation = await processCarrierInvoice(
      prefacturationId,
      invoiceData,
      req.file?.buffer
    );

    res.json({
      success: true,
      data: prefacturation,
      message: prefacturation.discrepancies.length > 0
        ? `Facture traitee avec ${prefacturation.discrepancies.length} ecart(s) detecte(s)`
        : 'Facture traitee et validee'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Statut validation
app.get('/api/billing/invoice/status', authenticateToken, async (req, res) => {
  try {
    const { prefacturationId, transporterId } = req.query;
    const filter = {};

    if (prefacturationId) filter.prefacturationId = prefacturationId;
    if (transporterId) filter.transporterId = transporterId;

    const prefacturations = await Prefacturation.find(filter)
      .select('prefacturationId orderId status carrierValidation carrierInvoice discrepancies')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ success: true, data: prefacturations, count: prefacturations.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - ECARTS
// ===========================================

// Details d'un ecart
app.get('/api/billing/discrepancy/:id', authenticateToken, async (req, res) => {
  try {
    const prefacturation = await Prefacturation.findOne({ prefacturationId: req.params.id });
    if (!prefacturation) {
      return res.status(404).json({ success: false, error: 'Prefacturation non trouvee' });
    }

    res.json({
      success: true,
      data: {
        prefacturationId: prefacturation.prefacturationId,
        orderId: prefacturation.orderId,
        symphoniaAmount: prefacturation.calculation.totalHT,
        carrierAmount: prefacturation.carrierInvoice?.totalHT,
        discrepancies: prefacturation.discrepancies
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Resoudre un ecart
app.post('/api/billing/discrepancy/resolve', authenticateToken, async (req, res) => {
  try {
    const { prefacturationId, discrepancyIndex, resolution, resolvedAmount } = req.body;

    const prefacturation = await Prefacturation.findOne({ prefacturationId });
    if (!prefacturation) {
      return res.status(404).json({ success: false, error: 'Prefacturation non trouvee' });
    }

    if (discrepancyIndex !== undefined && prefacturation.discrepancies[discrepancyIndex]) {
      prefacturation.discrepancies[discrepancyIndex].status = 'resolved';
      prefacturation.discrepancies[discrepancyIndex].resolution = resolution;
      prefacturation.discrepancies[discrepancyIndex].resolvedAt = new Date();
      prefacturation.discrepancies[discrepancyIndex].resolvedBy = req.user?.userId;
    }

    // Verifier si tous les ecarts sont resolus
    const unresolvedCount = prefacturation.discrepancies.filter(d => d.status !== 'resolved').length;
    if (unresolvedCount === 0) {
      prefacturation.status = 'validated';
    }

    if (resolvedAmount !== undefined) {
      prefacturation.calculation.totalHT = resolvedAmount;
      prefacturation.calculation.tva = Math.round(resolvedAmount * TVA_RATE * 100) / 100;
      prefacturation.calculation.totalTTC = Math.round(resolvedAmount * (1 + TVA_RATE) * 100) / 100;
    }

    prefacturation.auditTrail.push({
      action: 'DISCREPANCY_RESOLVED',
      performedBy: req.user?.userId,
      timestamp: new Date(),
      details: { discrepancyIndex, resolution, resolvedAmount }
    });

    prefacturation.updatedAt = new Date();
    await prefacturation.save();

    res.json({
      success: true,
      data: prefacturation,
      message: 'Ecart resolu'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - BLOCAGES
// ===========================================

// Verifier et appliquer blocages
app.post('/api/billing/check-blocks', authenticateToken, async (req, res) => {
  try {
    const { prefacturationId } = req.body;
    const result = await applyBlocks(prefacturationId);

    res.json({
      success: true,
      data: result,
      message: result.blocks.length > 0
        ? `${result.blocks.length} blocage(s) applique(s)`
        : 'Aucun blocage detecte'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Blocage manuel
app.post('/api/billing/block', authenticateToken, async (req, res) => {
  try {
    const { prefacturationId, type, reason, details } = req.body;

    const prefacturation = await Prefacturation.findOne({ prefacturationId });
    if (!prefacturation) {
      return res.status(404).json({ success: false, error: 'Prefacturation non trouvee' });
    }

    const block = new BillingBlock({
      blockId: `BLK-${uuidv4().slice(0, 8).toUpperCase()}`,
      prefacturationId,
      orderId: prefacturation.orderId,
      transporterId: prefacturation.transporterId,
      clientId: prefacturation.clientId,
      type: type || 'manual',
      reason,
      details,
      blockedBy: req.user?.userId || 'manual'
    });
    await block.save();

    prefacturation.blocks.push({
      type: type || 'manual',
      reason,
      details,
      blockedAt: new Date(),
      blockedBy: req.user?.userId,
      active: true
    });
    prefacturation.status = 'blocked';
    prefacturation.updatedAt = new Date();
    await prefacturation.save();

    res.json({
      success: true,
      data: block,
      message: 'Blocage applique'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Lever un blocage
app.post('/api/billing/unblock', authenticateToken, async (req, res) => {
  try {
    const { blockId, prefacturationId, reason } = req.body;

    // Trouver le blocage
    let block;
    if (blockId) {
      block = await BillingBlock.findOne({ blockId });
    }

    if (!block && prefacturationId) {
      block = await BillingBlock.findOne({ prefacturationId, active: true });
    }

    if (!block) {
      return res.status(404).json({ success: false, error: 'Blocage non trouve' });
    }

    block.active = false;
    block.unlockedAt = new Date();
    block.unlockedBy = req.user?.userId;
    block.unlockReason = reason;
    await block.save();

    // Mettre a jour la prefacturation
    const prefacturation = await Prefacturation.findOne({ prefacturationId: block.prefacturationId });
    if (prefacturation) {
      const blockIndex = prefacturation.blocks.findIndex(b => b.blockedAt.getTime() === block.blockedAt.getTime());
      if (blockIndex >= 0) {
        prefacturation.blocks[blockIndex].active = false;
        prefacturation.blocks[blockIndex].unlockedAt = new Date();
        prefacturation.blocks[blockIndex].unlockedBy = req.user?.userId;
      }

      // Verifier s'il reste des blocages actifs
      const activeBlocks = prefacturation.blocks.filter(b => b.active);
      if (activeBlocks.length === 0) {
        prefacturation.status = 'pending_validation';
      }

      prefacturation.updatedAt = new Date();
      await prefacturation.save();

      // Notification
      await sendBillingNotification('billing.unblocked', {
        prefacturationId: prefacturation.prefacturationId,
        blockId: block.blockId,
        reason
      }, [prefacturation.clientId, prefacturation.transporterId]);
    }

    res.json({
      success: true,
      data: block,
      message: 'Blocage leve'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Lister les blocages
app.get('/api/billing/blocks', authenticateToken, async (req, res) => {
  try {
    const { transporterId, clientId, type, active } = req.query;
    const filter = {};

    if (transporterId) filter.transporterId = transporterId;
    if (clientId) filter.clientId = clientId;
    if (type) filter.type = type;
    if (active !== undefined) filter.active = active === 'true';

    const blocks = await BillingBlock.find(filter).sort({ blockedAt: -1 });
    res.json({ success: true, data: blocks, count: blocks.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - FACTURE FINALE & EXPORT
// ===========================================

// Finaliser la facturation
app.post('/api/billing/finalize', authenticateToken, async (req, res) => {
  try {
    const { prefacturationId } = req.body;
    const prefacturation = await finalizeBilling(prefacturationId);

    res.json({
      success: true,
      data: {
        prefacturationId: prefacturation.prefacturationId,
        invoiceNumber: prefacturation.finalInvoice.invoiceNumber,
        totalTTC: prefacturation.calculation.totalTTC,
        pdfAvailable: !!prefacturation.finalInvoice.pdfBase64
      },
      message: 'Facture finalisee avec succes'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Telecharger facture PDF
app.get('/api/billing/invoice/:id/pdf', authenticateToken, async (req, res) => {
  try {
    const prefacturation = await Prefacturation.findOne({ prefacturationId: req.params.id });
    if (!prefacturation || !prefacturation.finalInvoice?.pdfBase64) {
      return res.status(404).json({ success: false, error: 'Facture PDF non trouvee' });
    }

    const pdfBuffer = Buffer.from(prefacturation.finalInvoice.pdfBase64, 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${prefacturation.finalInvoice.invoiceNumber}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export vers ERP
app.post('/api/billing/export', authenticateToken, async (req, res) => {
  try {
    const { prefacturationId, erpConfig } = req.body;

    if (!prefacturationId || !erpConfig) {
      return res.status(400).json({
        success: false,
        error: 'prefacturationId et erpConfig requis'
      });
    }

    const result = await exportToERP(prefacturationId, erpConfig);

    res.json({
      success: true,
      data: {
        exportId: result.erpExport.exportId,
        status: result.erpExport.status,
        erpSystem: result.erpExport.erpSystem,
        erpReference: result.erpExport.erpResponse?.reference
      },
      exportData: result.exportData,
      message: `Export ${result.erpExport.status} vers ${result.erpExport.erpSystem}`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Historique exports
app.get('/api/billing/exports', authenticateToken, async (req, res) => {
  try {
    const { prefacturationId, erpSystem, status, limit = 50 } = req.query;
    const filter = {};

    if (prefacturationId) filter.prefacturationId = prefacturationId;
    if (erpSystem) filter.erpSystem = erpSystem;
    if (status) filter.status = status;

    const exports = await ERPExport.find(filter).sort({ createdAt: -1 }).limit(parseInt(limit));
    res.json({ success: true, data: exports, count: exports.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - VIGILANCE TRANSPORTEUR
// ===========================================

app.post('/api/billing/vigilance', authenticateToken, async (req, res) => {
  try {
    const vigilance = new CarrierVigilance({
      vigilanceId: `VIG-${uuidv4().slice(0, 8).toUpperCase()}`,
      ...req.body,
      lastChecked: new Date()
    });
    await vigilance.save();
    res.status(201).json({ success: true, data: vigilance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/billing/vigilance/:transporterId', authenticateToken, async (req, res) => {
  try {
    const vigilance = await CarrierVigilance.findOne({ transporterId: req.params.transporterId });
    if (!vigilance) {
      return res.status(404).json({ success: false, error: 'Vigilance non trouvee' });
    }
    res.json({ success: true, data: vigilance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/billing/vigilance/:transporterId', authenticateToken, async (req, res) => {
  try {
    const vigilance = await CarrierVigilance.findOneAndUpdate(
      { transporterId: req.params.transporterId },
      { ...req.body, lastChecked: new Date(), updatedAt: new Date() },
      { new: true }
    );
    if (!vigilance) {
      return res.status(404).json({ success: false, error: 'Vigilance non trouvee' });
    }
    res.json({ success: true, data: vigilance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - WEBHOOKS
// ===========================================

app.post('/api/billing/webhooks', authenticateToken, async (req, res) => {
  try {
    const webhook = new BillingWebhook({
      webhookId: `WH-${uuidv4().slice(0, 8).toUpperCase()}`,
      ...req.body,
      secret: req.body.secret || uuidv4()
    });
    await webhook.save();
    res.status(201).json({ success: true, data: webhook });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/billing/webhooks', authenticateToken, async (req, res) => {
  try {
    const { clientId } = req.query;
    const webhooks = await BillingWebhook.find(clientId ? { clientId } : {});
    res.json({ success: true, data: webhooks, count: webhooks.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - VALIDATION & PAIEMENT (Frontend Industry)
// ===========================================

// Valider une prefacturation (Transporteur ou Industriel)
app.post('/api/billing/prefacturation/:id/validate', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { comments, adjustments, comment, acceptedAmount } = req.body;

    const prefacturation = await Prefacturation.findOne({
      $or: [{ prefacturationId: id }, { _id: id }]
    });

    if (!prefacturation) {
      return res.status(404).json({ success: false, error: 'Prefacturation non trouvee' });
    }

    prefacturation.status = 'validated_industrial';
    prefacturation.carrierValidation = {
      ...prefacturation.carrierValidation,
      status: 'validated',
      respondedAt: new Date(),
      validatedBy: req.user?.id || 'system',
      comments: comments || comment || ''
    };

    if (adjustments && typeof adjustments === 'object') {
      if (adjustments.totalHT !== undefined) {
        prefacturation.calculation.totalHT = parseFloat(adjustments.totalHT);
        prefacturation.calculation.tva = prefacturation.calculation.totalHT * TVA_RATE;
        prefacturation.calculation.totalTTC = prefacturation.calculation.totalHT * (1 + TVA_RATE);
      }
    }

    if (acceptedAmount !== undefined) {
      prefacturation.carrierValidation.acceptedAmount = parseFloat(acceptedAmount);
    }

    prefacturation.auditTrail.push({
      action: 'validated_by_carrier',
      timestamp: new Date(),
      userId: req.user?.id || 'system',
      details: { comments: comments || comment, adjustments, acceptedAmount }
    });

    await prefacturation.save();

    // Envoyer email de confirmation au transporteur
    const transporterEmail = prefacturation.transporterEmail;
    if (transporterEmail) {
      try {
        const frontendUrl = process.env.FRONTEND_URL || 'https://app.symphoni-a.com';
        const validationData = {
          prefacturationId: prefacturation.prefacturationId,
          transporterName: prefacturation.transporterName || 'Transporteur',
          clientName: prefacturation.clientName || 'Client',
          totalHT: prefacturation.calculation.totalHT,
          totalTTC: prefacturation.calculation.totalTTC,
          uploadUrl: `${frontendUrl}/billing/upload/${prefacturation.prefacturationId}`
        };

        const html = EmailTemplates.prefacturationValidatedTransporter(validationData);
        await EmailService.send(transporterEmail, `Prefacture ${prefacturation.prefacturationId} validee - Uploadez votre facture`, html);
        console.log(`[VALIDATION] Email envoye au transporteur: ${transporterEmail}`);
      } catch (emailError) {
        console.error('[VALIDATION] Erreur envoi email transporteur:', emailError.message);
      }
    }

    // Envoyer notification a l'industriel
    const industrialEmail = prefacturation.clientEmail;
    if (industrialEmail) {
      try {
        const notifHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1a237e; color: white; padding: 20px; text-align: center;">
              <h1>SYMPHONI.A</h1>
            </div>
            <div style="padding: 30px; background: #f5f5f5;">
              <h2 style="color: #10b981;">Prefacture validee par le transporteur</h2>
              <p>Le transporteur <strong>${prefacturation.transporterName}</strong> a valide la prefacture <strong>${prefacturation.prefacturationId}</strong>.</p>
              <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Montant valide:</strong> ${prefacturation.calculation.totalTTC.toFixed(2)} EUR TTC</p>
                ${(comments || comment) ? `<p><strong>Commentaire:</strong> ${comments || comment}</p>` : ''}
              </div>
              <p style="color: #666;">Le transporteur va maintenant uploader sa facture. Vous recevrez une notification pour la validation finale.</p>
            </div>
            <div style="background: #263238; color: white; padding: 15px; text-align: center; font-size: 12px;">
              SYMPHONI.A - Plateforme Transport Intelligente
            </div>
          </div>
        `;
        await EmailService.send(industrialEmail, `Prefacture ${prefacturation.prefacturationId} validee par transporteur`, notifHtml);
        console.log(`[VALIDATION] Notification envoyee a l'industriel: ${industrialEmail}`);
      } catch (emailError) {
        console.error('[VALIDATION] Erreur envoi notification industriel:', emailError.message);
      }
    }

    res.json({ success: true, data: prefacturation, message: 'Prefacture validee avec succes' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Marquer comme paye
app.post('/api/billing/prefacturation/:id/mark-paid', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentReference, paymentDate, amount, paymentMethod } = req.body;

    const prefacturation = await Prefacturation.findOne({
      $or: [{ prefacturationId: id }, { _id: id }]
    });

    if (!prefacturation) {
      return res.status(404).json({ success: false, error: 'Prefacturation non trouvee' });
    }

    prefacturation.status = 'paid';
    prefacturation.payment = {
      status: 'paid',
      paidAt: paymentDate ? new Date(paymentDate) : new Date(),
      reference: paymentReference || `PAY-${Date.now()}`,
      amount: amount || prefacturation.calculation.totalTTC,
      method: paymentMethod || 'virement'
    };

    prefacturation.auditTrail.push({
      action: 'marked_as_paid',
      timestamp: new Date(),
      userId: req.user?.id || 'system',
      details: { paymentReference, paymentDate, amount, paymentMethod }
    });

    await prefacturation.save();
    res.json({ success: true, data: prefacturation });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Contester une prefacturation
app.post('/api/billing/prefacturation/:id/dispute', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, proposedAmount, category, details, amountDisputed } = req.body;

    const prefacturation = await Prefacturation.findOne({
      $or: [{ prefacturationId: id }, { _id: id }]
    });

    if (!prefacturation) {
      return res.status(404).json({ success: false, error: 'Prefacturation non trouvee' });
    }

    const disputeAmount = amountDisputed || proposedAmount || prefacturation.calculation.totalTTC;
    const dispute = new BillingDispute({
      disputeId: `DISP-${Date.now()}`,
      prefacturationId: prefacturation.prefacturationId,
      orderId: prefacturation.orderId,
      transporterId: prefacturation.transporterId,
      clientId: prefacturation.clientId,
      type: category || 'price',
      symphoniaAmount: prefacturation.calculation.totalTTC,
      carrierAmount: disputeAmount,
      difference: Math.abs(disputeAmount - prefacturation.calculation.totalTTC),
      contestedItems: [{ item: category || 'total', reason, details }],
      status: 'open',
      openedAt: new Date(),
      openedBy: req.user?.id || 'system'
    });

    await dispute.save();

    prefacturation.status = 'contested';
    prefacturation.auditTrail.push({
      action: 'dispute_opened',
      timestamp: new Date(),
      userId: req.user?.id || 'system',
      details: { disputeId: dispute.disputeId, reason, category, amountDisputed: disputeAmount }
    });

    await prefacturation.save();

    // Envoyer email automatique a l'industriel
    const industrialEmail = prefacturation.clientEmail;
    if (industrialEmail) {
      try {
        const frontendUrl = process.env.FRONTEND_URL || 'https://app.symphoni-a.com';
        const contestData = {
          prefacturationId: prefacturation.prefacturationId,
          transporterName: prefacturation.transporterName || 'Transporteur',
          clientName: prefacturation.clientName || 'Client',
          reason: reason,
          category: category || 'price',
          proposedAmount: disputeAmount,
          originalAmount: prefacturation.calculation.totalTTC,
          difference: Math.abs(disputeAmount - prefacturation.calculation.totalTTC),
          disputeUrl: `${frontendUrl}/billing/dispute/${dispute.disputeId}`,
          validationDeadline: moment().add(5, 'days').format('DD/MM/YYYY')
        };

        const html = EmailTemplates.prefacturationContested(contestData);
        await EmailService.send(industrialEmail, `[CONTESTATION] Prefacture ${prefacturation.prefacturationId}`, html);
        console.log(`[DISPUTE] Email envoye a l'industriel: ${industrialEmail}`);
      } catch (emailError) {
        console.error('[DISPUTE] Erreur envoi email industriel:', emailError.message);
      }
    }

    // Envoyer confirmation au transporteur
    const transporterEmail = prefacturation.transporterEmail;
    if (transporterEmail) {
      try {
        const confirmHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1a237e; color: white; padding: 20px; text-align: center;">
              <h1>SYMPHONI.A</h1>
            </div>
            <div style="padding: 30px; background: #f5f5f5;">
              <h2 style="color: #1a237e;">Contestation enregistree</h2>
              <p>Votre contestation pour la prefacture <strong>${prefacturation.prefacturationId}</strong> a bien ete enregistree.</p>
              <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Reference contestation:</strong> ${dispute.disputeId}</p>
                <p><strong>Categorie:</strong> ${category || 'Prix'}</p>
                <p><strong>Montant conteste:</strong> ${disputeAmount.toFixed(2)} EUR</p>
                <p><strong>Motif:</strong> ${reason}</p>
              </div>
              <p style="color: #666;">L'industriel dispose de 5 jours ouvrables pour examiner votre demande. Vous serez notifie par email de la resolution.</p>
            </div>
            <div style="background: #263238; color: white; padding: 15px; text-align: center; font-size: 12px;">
              SYMPHONI.A - Plateforme Transport Intelligente
            </div>
          </div>
        `;
        await EmailService.send(transporterEmail, `Contestation enregistree - ${prefacturation.prefacturationId}`, confirmHtml);
        console.log(`[DISPUTE] Confirmation envoyee au transporteur: ${transporterEmail}`);
      } catch (emailError) {
        console.error('[DISPUTE] Erreur envoi confirmation transporteur:', emailError.message);
      }
    }

    res.json({ success: true, data: { prefacturation, dispute }, message: 'Contestation soumise avec succes' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export pour paiement (CSV)
app.get('/api/billing/prefacturations/export', authenticateToken, async (req, res) => {
  try {
    const { status, month, year, clientId } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (clientId) filter.clientId = clientId;

    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);
      filter.createdAt = { $gte: startDate, $lte: endDate };
    }

    const prefacturations = await Prefacturation.find(filter).sort({ createdAt: -1 });

    const csvRows = [
      ['Reference', 'Transporteur', 'Date', 'Montant HT', 'TVA', 'Montant TTC', 'Statut', 'IBAN'].join(';')
    ];

    prefacturations.forEach(p => {
      csvRows.push([
        p.prefacturationId,
        p.transporterName || p.transporterId,
        moment(p.createdAt).format('DD/MM/YYYY'),
        (p.calculation?.totalHT || 0).toFixed(2),
        (p.calculation?.tva || 0).toFixed(2),
        (p.calculation?.totalTTC || 0).toFixed(2),
        p.status,
        p.payment?.iban || ''
      ].join(';'));
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="export-prefacturations-${month}-${year}.csv"`);
    res.send('\uFEFF' + csvRows.join('\n'));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - STATISTIQUES
// ===========================================

app.get('/api/billing/stats', authenticateToken, async (req, res) => {
  try {
    const { clientId, transporterId, startDate, endDate } = req.query;
    const filter = {};

    if (clientId) filter.clientId = clientId;
    if (transporterId) filter.transporterId = transporterId;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const total = await Prefacturation.countDocuments(filter);
    const byStatus = await Prefacturation.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const totalAmount = await Prefacturation.aggregate([
      { $match: { ...filter, status: { $in: ['finalized', 'exported', 'archived'] } } },
      { $group: { _id: null, totalHT: { $sum: '$calculation.totalHT' }, totalTTC: { $sum: '$calculation.totalTTC' } } }
    ]);

    const discrepancyRate = await Prefacturation.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          withDiscrepancy: { $sum: { $cond: [{ $gt: [{ $size: '$discrepancies' }, 0] }, 1, 0] } }
        }
      }
    ]);

    const blocksCount = await BillingBlock.countDocuments({ ...filter, active: true });

    res.json({
      success: true,
      data: {
        prefacturations: {
          total,
          byStatus: byStatus.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {})
        },
        amounts: totalAmount[0] || { totalHT: 0, totalTTC: 0 },
        discrepancyRate: discrepancyRate[0]
          ? Math.round((discrepancyRate[0].withDiscrepancy / discrepancyRate[0].total) * 100)
          : 0,
        activeBlocks: blocksCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// EMAIL ENDPOINTS
// ===========================================

// Envoyer un email de notification prefacturation
app.post('/api/billing/email/send', authenticateToken, async (req, res) => {
  try {
    const { prefacturationId, type, additionalRecipients } = req.body;

    if (!prefacturationId || !type) {
      return res.status(400).json({ success: false, error: 'prefacturationId et type requis' });
    }

    const prefacturation = await Prefacturation.findOne({ prefacturationId });
    if (!prefacturation) {
      return res.status(404).json({ success: false, error: 'Prefacturation non trouvee' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://app.symphoni-a.com';
    const emailData = {
      prefacturationId: prefacturation.prefacturationId,
      orderId: prefacturation.orderId,
      transporterName: prefacturation.transporterName,
      transporterEmail: prefacturation.transporterEmail,
      clientName: prefacturation.clientName,
      clientEmail: prefacturation.clientEmail,
      pickupAddress: prefacturation.orderData?.pickupAddress || '',
      deliveryAddress: prefacturation.orderData?.deliveryAddress || '',
      deliveryDate: moment(prefacturation.orderData?.deliveryDate).format('DD/MM/YYYY'),
      totalHT: prefacturation.calculation?.totalHT || 0,
      tva: prefacturation.calculation?.tva || 0,
      totalTTC: prefacturation.calculation?.totalTTC || 0,
      validationUrl: `${frontendUrl}/billing/prefacturation/${prefacturation.prefacturationId}`,
      validatedAt: moment().format('DD/MM/YYYY HH:mm'),
      paymentTermDays: prefacturation.payment?.paymentTermDays || 30
    };

    let html, subject, recipients;

    switch (type) {
      case 'new_prefacturation_transporter':
        html = EmailTemplates.newPrefacturationTransporter(emailData);
        subject = `Nouvelle prefacturation ${prefacturation.prefacturationId} - Validation requise`;
        recipients = [prefacturation.transporterEmail];
        break;

      case 'new_prefacturation_industrial':
        html = EmailTemplates.newPrefacturationIndustrial(emailData);
        subject = `Nouvelle prefacturation transport ${prefacturation.prefacturationId}`;
        recipients = [prefacturation.clientEmail];
        break;

      case 'validated':
        html = EmailTemplates.prefacturationValidatedTransporter(emailData);
        subject = `Prefacturation ${prefacturation.prefacturationId} validee`;
        recipients = [prefacturation.transporterEmail];
        break;

      case 'contested':
        emailData.contestReason = req.body.contestReason || 'Non specifie';
        emailData.disputeUrl = `${frontendUrl}/billing/dispute/${prefacturation.prefacturationId}`;
        html = EmailTemplates.prefacturationContested(emailData);
        subject = `Contestation prefacturation ${prefacturation.prefacturationId}`;
        recipients = [prefacturation.clientEmail];
        break;

      case 'reminder':
        const createdAt = moment(prefacturation.createdAt);
        const deadline = createdAt.add(VALIDATION_TIMEOUT_DAYS, 'days');
        emailData.daysPending = moment().diff(createdAt, 'days');
        emailData.deadline = deadline.format('DD/MM/YYYY');
        html = EmailTemplates.validationReminder(emailData);
        subject = `Rappel: Prefacturation ${prefacturation.prefacturationId} en attente`;
        recipients = [prefacturation.transporterEmail];
        break;

      default:
        return res.status(400).json({ success: false, error: 'Type email inconnu' });
    }

    // Add additional recipients if provided
    if (additionalRecipients && Array.isArray(additionalRecipients)) {
      recipients = [...recipients, ...additionalRecipients];
    }

    // Filter out empty/invalid emails
    recipients = recipients.filter(email => email && email.includes('@'));

    if (recipients.length === 0) {
      return res.status(400).json({ success: false, error: 'Aucun destinataire valide' });
    }

    await EmailService.send(recipients, subject, html);

    // Log in audit trail
    prefacturation.auditTrail.push({
      action: 'email_sent',
      timestamp: new Date(),
      userId: req.user?.userId || 'system',
      details: { type, recipients, subject }
    });
    await prefacturation.save();

    res.json({
      success: true,
      message: 'Email envoye avec succes',
      data: { recipients, type, subject }
    });
  } catch (error) {
    console.error('[EMAIL] Error sending:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Envoyer un email de test
app.post('/api/billing/email/test', authenticateToken, async (req, res) => {
  try {
    const { to, template } = req.body;

    if (!to) {
      return res.status(400).json({ success: false, error: 'Destinataire (to) requis' });
    }

    const testData = {
      prefacturationId: 'PREF-2025-TEST',
      orderId: 'CMD-2025-TEST',
      transporterName: 'Test Transporteur SARL',
      transporterEmail: to,
      clientName: 'Test Client Industries',
      clientEmail: to,
      pickupAddress: 'Lyon 69001, France',
      deliveryAddress: 'Paris 75001, France',
      deliveryDate: moment().format('DD/MM/YYYY'),
      totalHT: 1500,
      tva: 300,
      totalTTC: 1800,
      validationUrl: 'https://app.symphoni-a.com/billing/test',
      validatedAt: moment().format('DD/MM/YYYY HH:mm'),
      paymentTermDays: 30,
      contestReason: 'Ceci est un test de contestation',
      disputeUrl: 'https://app.symphoni-a.com/billing/dispute/test',
      daysPending: 5,
      deadline: moment().add(2, 'days').format('DD/MM/YYYY')
    };

    let html, subject;
    const templateName = template || 'new_prefacturation_transporter';

    switch (templateName) {
      case 'new_prefacturation_transporter':
        html = EmailTemplates.newPrefacturationTransporter(testData);
        subject = '[TEST] Nouvelle prefacturation - Validation requise';
        break;
      case 'new_prefacturation_industrial':
        html = EmailTemplates.newPrefacturationIndustrial(testData);
        subject = '[TEST] Nouvelle prefacturation transport';
        break;
      case 'validated':
        html = EmailTemplates.prefacturationValidatedTransporter(testData);
        subject = '[TEST] Prefacturation validee';
        break;
      case 'contested':
        html = EmailTemplates.prefacturationContested(testData);
        subject = '[TEST] Contestation prefacturation';
        break;
      case 'reminder':
        html = EmailTemplates.validationReminder(testData);
        subject = '[TEST] Rappel prefacturation';
        break;
      default:
        html = EmailTemplates.newPrefacturationTransporter(testData);
        subject = '[TEST] Email template test';
    }

    await EmailService.send(to, subject, html);

    res.json({
      success: true,
      message: 'Email de test envoye',
      data: { to, template: templateName, subject }
    });
  } catch (error) {
    console.error('[EMAIL] Test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Configuration email status
app.get('/api/billing/email/status', authenticateToken, async (req, res) => {
  try {
    const status = {
      sesConfigured: EMAIL_CONFIG.useSES && sesClient !== null,
      smtpConfigured: smtpTransporter !== null,
      from: EMAIL_CONFIG.from,
      fromName: EMAIL_CONFIG.fromName,
      replyTo: EMAIL_CONFIG.replyTo,
      awsRegion: EMAIL_CONFIG.awsRegion,
      smtpHost: EMAIL_CONFIG.smtp.host
    };

    // Test SMTP connection if configured
    if (smtpTransporter) {
      try {
        await smtpTransporter.verify();
        status.smtpStatus = 'connected';
      } catch (err) {
        status.smtpStatus = 'error: ' + err.message;
      }
    }

    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Envoyer emails en masse (batch)
app.post('/api/billing/email/batch', authenticateToken, async (req, res) => {
  try {
    const { prefacturationIds, type } = req.body;

    if (!prefacturationIds || !Array.isArray(prefacturationIds) || !type) {
      return res.status(400).json({ success: false, error: 'prefacturationIds (array) et type requis' });
    }

    const results = [];
    for (const prefacturationId of prefacturationIds) {
      try {
        const response = await axios.post(
          `http://localhost:${PORT}/api/billing/email/send`,
          { prefacturationId, type },
          { headers: { Authorization: req.headers.authorization } }
        );
        results.push({ prefacturationId, success: true });
      } catch (err) {
        results.push({ prefacturationId, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({
      success: true,
      message: `${successCount}/${prefacturationIds.length} emails envoyes`,
      data: results
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// CONNEXION MONGODB & DEMARRAGE SERVEUR
// ===========================================

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB connecte - Billing API');

    setupCronJobs();

    app.listen(PORT, () => {
      console.log(`
========================================
  Module Prefacturation & Facturation
  RT Technologie - SYMPHONI.A v1.0.0
========================================
  Port: ${PORT}
  MongoDB: ${MONGODB_URI}

  5 Blocs implementes:
  1. Prefacturation Automatique
  2. Detection Ecarts Tarifaires
  3. Validation Transporteur (OCR)
  4. Blocages Automatiques
  5. Facture Finale & Export ERP

  Endpoints principaux:
  - POST /api/billing/prefacturation/generate
  - POST /api/billing/invoice/upload
  - GET  /api/billing/discrepancy/:id
  - POST /api/billing/discrepancy/resolve
  - POST /api/billing/block
  - POST /api/billing/unblock
  - POST /api/billing/finalize
  - POST /api/billing/export

  Connecteurs ERP:
  - SAP, Oracle, Sage X3, Divalto
  - Microsoft Dynamics 365, Odoo
  - API generique JSON/XML

  Archivage: ${ARCHIVE_RETENTION_YEARS} ans
========================================
      `);
    });
  })
  .catch(err => {
    console.error('Erreur connexion MongoDB:', err);
    process.exit(1);
  });

module.exports = app;
