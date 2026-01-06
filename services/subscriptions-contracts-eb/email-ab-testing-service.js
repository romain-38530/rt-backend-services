/**
 * Service A/B Testing Emails - Optimisation templates prospection B2P
 * v4.2.3 - Test et optimisation des emails de prospection
 */

const crypto = require('crypto');

// ============================================================================
// CONFIGURATION DES VARIANTES
// ============================================================================

const EMAIL_VARIANTS = {
  // Variantes de sujet d'email
  subjects: {
    variant_a: {
      id: 'subject_formal',
      template: 'SYMPHONI.A - Opportunite de collaboration transport pour {{carrierName}}',
      description: 'Sujet formel avec nom de la plateforme'
    },
    variant_b: {
      id: 'subject_direct',
      template: '{{carrierName}}, 10 transports gratuits vous attendent',
      description: 'Sujet direct avec offre immediate'
    },
    variant_c: {
      id: 'subject_question',
      template: '{{carrierName}} - Cherchez-vous de nouveaux clients industriels ?',
      description: 'Sujet sous forme de question'
    },
    variant_d: {
      id: 'subject_urgency',
      template: 'Offre limitee : Acces gratuit a notre reseau industriel',
      description: 'Sujet avec sentiment d\'urgence'
    }
  },

  // Variantes de CTA (Call to Action)
  cta: {
    variant_a: {
      id: 'cta_discover',
      text: 'Decouvrir SYMPHONI.A',
      color: '#1a365d',
      description: 'CTA standard decouverte'
    },
    variant_b: {
      id: 'cta_start_trial',
      text: 'Commencer mon essai gratuit',
      color: '#22c55e',
      description: 'CTA essai gratuit vert'
    },
    variant_c: {
      id: 'cta_see_offers',
      text: 'Voir les transports disponibles',
      color: '#2563eb',
      description: 'CTA voir offres bleu'
    },
    variant_d: {
      id: 'cta_join_now',
      text: 'Rejoindre le reseau maintenant',
      color: '#dc2626',
      description: 'CTA urgent rouge'
    }
  },

  // Variantes de mise en page
  layout: {
    variant_a: {
      id: 'layout_classic',
      headerColor: '#1a365d',
      showPricing: true,
      showTestimonial: false,
      description: 'Layout classique avec tarifs'
    },
    variant_b: {
      id: 'layout_minimal',
      headerColor: '#059669',
      showPricing: false,
      showTestimonial: false,
      description: 'Layout minimal sans tarifs'
    },
    variant_c: {
      id: 'layout_social_proof',
      headerColor: '#7c3aed',
      showPricing: true,
      showTestimonial: true,
      description: 'Layout avec temoignage client'
    }
  },

  // Variantes d'offre
  offer: {
    variant_a: {
      id: 'offer_10_transports',
      transportsCount: 10,
      duration: '30 jours',
      bonus: null,
      description: 'Offre standard 10 transports'
    },
    variant_b: {
      id: 'offer_15_transports',
      transportsCount: 15,
      duration: '30 jours',
      bonus: null,
      description: 'Offre genereuse 15 transports'
    },
    variant_c: {
      id: 'offer_10_extended',
      transportsCount: 10,
      duration: '45 jours',
      bonus: null,
      description: 'Offre 10 transports duree etendue'
    },
    variant_d: {
      id: 'offer_10_bonus',
      transportsCount: 10,
      duration: '30 jours',
      bonus: 'Support prioritaire pendant l\'essai',
      description: 'Offre avec bonus support'
    }
  }
};

// ============================================================================
// SERVICE A/B TESTING
// ============================================================================

class EmailABTestingService {
  constructor() {
    this.activeTests = new Map();
    this.testResults = new Map();
  }

  /**
   * Creer un nouveau test A/B
   */
  createTest(testConfig) {
    const testId = `test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const test = {
      testId,
      name: testConfig.name || 'Unnamed Test',
      description: testConfig.description || '',
      category: testConfig.category, // 'subjects', 'cta', 'layout', 'offer'
      variants: testConfig.variants || ['variant_a', 'variant_b'],
      trafficSplit: testConfig.trafficSplit || this.equalSplit(testConfig.variants?.length || 2),
      status: 'active',
      startedAt: new Date(),
      endsAt: testConfig.endsAt || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 jours par defaut
      minSampleSize: testConfig.minSampleSize || 100,
      metrics: {
        sent: {},
        delivered: {},
        opened: {},
        clicked: {},
        converted: {}
      },
      createdBy: testConfig.createdBy
    };

    // Initialiser les metriques pour chaque variante
    test.variants.forEach(v => {
      test.metrics.sent[v] = 0;
      test.metrics.delivered[v] = 0;
      test.metrics.opened[v] = 0;
      test.metrics.clicked[v] = 0;
      test.metrics.converted[v] = 0;
    });

    this.activeTests.set(testId, test);
    return test;
  }

  /**
   * Repartition egale du trafic
   */
  equalSplit(count) {
    const split = {};
    const percentage = Math.floor(100 / count);
    for (let i = 0; i < count; i++) {
      split[`variant_${String.fromCharCode(97 + i)}`] = percentage;
    }
    return split;
  }

  /**
   * Selectionner une variante pour un prospect
   * Utilise un hash deterministe pour assurer la coherence
   */
  selectVariant(testId, prospectEmail) {
    const test = this.activeTests.get(testId);
    if (!test || test.status !== 'active') {
      return 'variant_a'; // Fallback
    }

    // Hash deterministe base sur l'email
    const hash = crypto.createHash('md5').update(prospectEmail + testId).digest('hex');
    const hashValue = parseInt(hash.substring(0, 8), 16) % 100;

    // Selectionner la variante selon le traffic split
    let cumulative = 0;
    for (const [variant, percentage] of Object.entries(test.trafficSplit)) {
      cumulative += percentage;
      if (hashValue < cumulative) {
        return variant;
      }
    }

    return test.variants[0];
  }

  /**
   * Obtenir la configuration complete d'une variante
   */
  getVariantConfig(category, variantId) {
    const categoryConfig = EMAIL_VARIANTS[category];
    if (!categoryConfig) return null;
    return categoryConfig[variantId] || null;
  }

  /**
   * Generer le contenu d'email avec les variantes selectionnees
   */
  generateEmailWithVariants(prospect, transport, testSelections) {
    const config = {
      subject: EMAIL_VARIANTS.subjects[testSelections.subject || 'variant_a'],
      cta: EMAIL_VARIANTS.cta[testSelections.cta || 'variant_a'],
      layout: EMAIL_VARIANTS.layout[testSelections.layout || 'variant_a'],
      offer: EMAIL_VARIANTS.offer[testSelections.offer || 'variant_a']
    };

    // Remplacer les variables dans le sujet
    let subject = config.subject.template
      .replace('{{carrierName}}', prospect.carrierName || 'Transporteur');

    // Generer l'URL avec tracking
    const trackingParams = new URLSearchParams({
      ref: 'affretia',
      email: prospect.carrierEmail,
      trial: config.offer.transportsCount.toString(),
      test: JSON.stringify(testSelections)
    });
    const trialUrl = `https://transporteur.symphonia-controltower.com/inscription?${trackingParams}`;

    // Construire le HTML
    const html = this.buildEmailHtml(prospect, transport, config, trialUrl);
    const text = this.buildEmailText(prospect, transport, config, trialUrl);

    return {
      subject,
      html,
      text,
      variants: testSelections,
      config
    };
  }

  /**
   * Construire le HTML de l'email
   */
  buildEmailHtml(prospect, transport, config, trialUrl) {
    const { layout, cta, offer } = config;

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Opportunite SYMPHONI.A</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; color: #333333; background-color: #f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background-color: ${layout.headerColor}; padding: 30px 40px; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: normal;">SYMPHONI.A</h1>
              <p style="margin: 8px 0 0 0; color: #a0aec0; font-size: 14px;">Control Tower du Transport</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0;">Bonjour${prospect.contactName ? ' ' + prospect.contactName : ''},</p>

              <p style="margin: 0 0 20px 0;">
                Nous sommes <strong>SYMPHONI.A</strong>, une plateforme de mise en relation entre industriels et transporteurs.
                Suite a votre activite sur le marche du transport, nous souhaiterions vous proposer de rejoindre notre reseau.
              </p>

              <!-- Offre -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f0fdf4; border-radius: 8px; margin: 25px 0;">
                <tr>
                  <td style="padding: 25px; border-left: 4px solid #22c55e;">
                    <h2 style="margin: 0 0 10px 0; color: #166534; font-size: 20px;">
                      Offre de bienvenue : ${offer.transportsCount} transports offerts
                    </h2>
                    <p style="margin: 0; color: #15803d;">
                      Decouvrez notre plateforme sans engagement avec ${offer.transportsCount} transports gratuits pendant ${offer.duration}.
                      ${offer.bonus ? '<br><strong>Bonus : ' + offer.bonus + '</strong>' : ''}
                    </p>
                  </td>
                </tr>
              </table>

              ${transport ? `
              <!-- Transport disponible -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #eff6ff; border-radius: 8px; margin: 25px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px 0; color: #1e40af; font-weight: bold; font-size: 14px;">Exemple de transport disponible :</p>
                    <p style="margin: 0; font-size: 18px; color: #1e3a8a;"><strong>${transport.pickupCity || 'Depart'}</strong> &rarr; <strong>${transport.deliveryCity || 'Arrivee'}</strong></p>
                    <p style="margin: 8px 0 0 0; color: #64748b; font-size: 14px;">
                      ${transport.pickupDate ? `Date : ${new Date(transport.pickupDate).toLocaleDateString('fr-FR')}` : ''}
                      ${transport.weight ? ` - Poids : ${transport.weight} T` : ''}
                    </p>
                  </td>
                </tr>
              </table>
              ` : ''}

              ${layout.showTestimonial ? `
              <!-- Temoignage -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #faf5ff; border-radius: 8px; margin: 25px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0; font-style: italic; color: #6b21a8;">
                      "Depuis que nous utilisons SYMPHONI.A, nous avons augmente notre chiffre d'affaires de 30%. La plateforme nous met en relation directe avec des industriels de qualite."
                    </p>
                    <p style="margin: 10px 0 0 0; color: #7c3aed; font-weight: bold;">
                      - Transport Martin, Utilisateur Premium
                    </p>
                  </td>
                </tr>
              </table>
              ` : ''}

              <!-- Avantages -->
              <h3 style="margin: 30px 0 15px 0; color: #1a365d; font-size: 18px;">Ce que nous vous proposons :</h3>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr><td style="padding: 8px 0;"><span style="color: #22c55e; font-weight: bold;">&#10003;</span> <span style="margin-left: 10px;"><strong>Aucune commission</strong> sur vos transports</span></td></tr>
                <tr><td style="padding: 8px 0;"><span style="color: #22c55e; font-weight: bold;">&#10003;</span> <span style="margin-left: 10px;"><strong>Acces direct</strong> aux chargeurs industriels</span></td></tr>
                <tr><td style="padding: 8px 0;"><span style="color: #22c55e; font-weight: bold;">&#10003;</span> <span style="margin-left: 10px;"><strong>Matching intelligent</strong> selon vos zones</span></td></tr>
                <tr><td style="padding: 8px 0;"><span style="color: #22c55e; font-weight: bold;">&#10003;</span> <span style="margin-left: 10px;"><strong>eCMR integree</strong> - Gestion simplifiee</span></td></tr>
              </table>

              ${layout.showPricing ? `
              <!-- Tarifs -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #fafafa; border-radius: 8px; margin: 25px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <h4 style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">Apres votre periode d'essai :</h4>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                          <strong style="color: #1a365d;">Abonnement Transporteur</strong>
                          <span style="float: right; color: #059669; font-weight: bold;">200 EUR/mois</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                          <strong style="color: #1a365d;">Abonnement Premium</strong>
                          <span style="float: right; color: #059669; font-weight: bold;">699 EUR/mois</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              ` : ''}

              <!-- CTA -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${trialUrl}" style="display: inline-block; background-color: ${cta.color}; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">${cta.text}</a>
                  </td>
                </tr>
              </table>

              <p style="margin: 20px 0 0 0;">Cordialement,<br><strong>L'equipe SYMPHONI.A</strong></p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 25px 40px; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                Cet email a ete envoye a ${prospect.carrierEmail}<br>
                <a href="https://transporteur.symphonia-controltower.com/desinscription?email=${encodeURIComponent(prospect.carrierEmail)}" style="color: #94a3b8;">Se desinscrire</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  /**
   * Construire le texte de l'email
   */
  buildEmailText(prospect, transport, config, trialUrl) {
    const { offer } = config;

    return `
Bonjour${prospect.contactName ? ' ' + prospect.contactName : ''},

Nous sommes SYMPHONI.A, une plateforme de mise en relation entre industriels et transporteurs.

OFFRE DE BIENVENUE : ${offer.transportsCount} TRANSPORTS OFFERTS
Decouvrez notre plateforme sans engagement avec ${offer.transportsCount} transports gratuits pendant ${offer.duration}.
${offer.bonus ? 'Bonus : ' + offer.bonus : ''}

${transport ? `
TRANSPORT DISPONIBLE :
${transport.pickupCity || 'Depart'} -> ${transport.deliveryCity || 'Arrivee'}
${transport.pickupDate ? `Date : ${new Date(transport.pickupDate).toLocaleDateString('fr-FR')}` : ''}
` : ''}

VOS AVANTAGES :
- Aucune commission sur vos transports
- Acces direct aux chargeurs industriels
- Matching intelligent selon vos zones
- eCMR integree

Decouvrir : ${trialUrl}

Cordialement,
L'equipe SYMPHONI.A

---
Cet email a ete envoye a ${prospect.carrierEmail}
    `;
  }

  /**
   * Enregistrer un evenement de tracking
   */
  recordEvent(testId, variant, eventType, prospectEmail) {
    const test = this.activeTests.get(testId);
    if (!test) return false;

    if (test.metrics[eventType] && test.metrics[eventType][variant] !== undefined) {
      test.metrics[eventType][variant]++;
      return true;
    }
    return false;
  }

  /**
   * Calculer les resultats d'un test
   */
  calculateTestResults(testId) {
    const test = this.activeTests.get(testId);
    if (!test) return null;

    const results = {
      testId: test.testId,
      name: test.name,
      category: test.category,
      status: test.status,
      duration: {
        startedAt: test.startedAt,
        endsAt: test.endsAt,
        daysRunning: Math.ceil((new Date() - test.startedAt) / (1000 * 60 * 60 * 24))
      },
      variants: {}
    };

    // Calculer les metriques pour chaque variante
    test.variants.forEach(variant => {
      const sent = test.metrics.sent[variant] || 0;
      const delivered = test.metrics.delivered[variant] || 0;
      const opened = test.metrics.opened[variant] || 0;
      const clicked = test.metrics.clicked[variant] || 0;
      const converted = test.metrics.converted[variant] || 0;

      results.variants[variant] = {
        sent,
        delivered,
        opened,
        clicked,
        converted,
        rates: {
          deliveryRate: sent > 0 ? ((delivered / sent) * 100).toFixed(2) : 0,
          openRate: delivered > 0 ? ((opened / delivered) * 100).toFixed(2) : 0,
          clickRate: opened > 0 ? ((clicked / opened) * 100).toFixed(2) : 0,
          conversionRate: clicked > 0 ? ((converted / clicked) * 100).toFixed(2) : 0,
          overallConversion: sent > 0 ? ((converted / sent) * 100).toFixed(2) : 0
        }
      };
    });

    // Determiner le gagnant
    results.winner = this.determineWinner(results.variants);
    results.confidence = this.calculateStatisticalSignificance(results.variants);

    return results;
  }

  /**
   * Determiner la variante gagnante
   */
  determineWinner(variants) {
    let winner = null;
    let bestConversion = 0;

    for (const [variantId, data] of Object.entries(variants)) {
      const conversion = parseFloat(data.rates.overallConversion);
      if (conversion > bestConversion) {
        bestConversion = conversion;
        winner = variantId;
      }
    }

    return {
      variant: winner,
      conversionRate: bestConversion
    };
  }

  /**
   * Calculer la significativite statistique (simplifie)
   */
  calculateStatisticalSignificance(variants) {
    const variantData = Object.values(variants);
    if (variantData.length < 2) return 0;

    const totalSamples = variantData.reduce((sum, v) => sum + v.sent, 0);
    const minSamples = Math.min(...variantData.map(v => v.sent));

    // Significativite basee sur la taille de l'echantillon
    if (minSamples < 30) return 0;
    if (minSamples < 100) return 50;
    if (minSamples < 500) return 75;
    if (minSamples < 1000) return 90;
    return 95;
  }

  /**
   * Obtenir tous les tests actifs
   */
  getActiveTests() {
    return Array.from(this.activeTests.values())
      .filter(t => t.status === 'active');
  }

  /**
   * Arreter un test
   */
  stopTest(testId) {
    const test = this.activeTests.get(testId);
    if (test) {
      test.status = 'completed';
      test.completedAt = new Date();
      return this.calculateTestResults(testId);
    }
    return null;
  }

  /**
   * Obtenir les variantes disponibles
   */
  getAvailableVariants() {
    return EMAIL_VARIANTS;
  }
}

// Instance singleton
const emailABTestingService = new EmailABTestingService();

module.exports = {
  EmailABTestingService,
  emailABTestingService,
  EMAIL_VARIANTS
};
