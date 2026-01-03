/**
 * Service de Prospection Commerciale AFFRET.IA
 * Trouve des transporteurs via B2PWeb scraping et les convertit en clients Premium
 */

const { MongoClient } = require('mongodb');
const ProspectCarrier = require('../models/ProspectCarrier');

// AWS SES SDK
let sesClient = null;
try {
  const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
  sesClient = new SESClient({
    region: process.env.AWS_REGION || 'eu-central-1'
  });
} catch (err) {
  console.warn('[PROSPECTION SERVICE] AWS SES SDK not available');
}

class ProspectionService {
  constructor() {
    this.b2pwebDbUri = process.env.B2PWEB_MONGODB_URI || process.env.MONGODB_URI?.replace(/\/[^/]+\?/, '/affret_ia?');
    this.sesFromEmail = process.env.SES_FROM_EMAIL || 'affret-ia@symphonia-controltower.com';
    this.sesFromName = process.env.SES_FROM_NAME || 'AFFRET.IA SYMPHONI.A';
    this.b2pwebClient = null;
    this.symphoniaUrl = process.env.SYMPHONIA_URL || 'https://transporteur.symphonia-controltower.com';
  }

  /**
   * Extraire le nom/prenom depuis une adresse email
   * Retourne null si le format n'est pas reconnu (ex: contact@, info@, exploit@)
   */
  parseContactNameFromEmail(email) {
    if (!email) return null;

    const localPart = email.split('@')[0];
    if (!localPart) return null;

    // Patterns a ignorer (emails generiques)
    const genericPatterns = [
      /^(contact|info|commercial|exploit|exploitation|affret|affretement|dispo|dispatch)$/i,
      /^(admin|support|service|secretariat|direction|compta|comptabilite)$/i,
      /^(transport|transports|logistique|logistic|office|bureau)$/i,
      /^[a-z]{1,2}$/, // Initiales seules (ex: "jd@...")
      /^\d+$/, // Que des chiffres
      /^[a-z]+\d+$/i // Texte + chiffres (ex: "exploit04")
    ];

    for (const pattern of genericPatterns) {
      if (pattern.test(localPart)) return null;
    }

    // Separateurs courants: point, underscore, tiret
    const separators = /[._-]/;
    const parts = localPart.split(separators).filter(p => p.length > 1);

    if (parts.length >= 2) {
      // Format prenom.nom ou nom.prenom
      const firstName = this.capitalizeWord(parts[0]);
      const lastName = this.capitalizeWord(parts[parts.length - 1]);

      // Verifier que ca ressemble a des noms (pas de chiffres, longueur raisonnable)
      if (this.isValidName(firstName) && this.isValidName(lastName)) {
        return `${firstName} ${lastName.toUpperCase()}`;
      }
    } else if (parts.length === 1 && parts[0].length >= 3) {
      // Un seul mot - pourrait etre un prenom seul
      const name = this.capitalizeWord(parts[0]);
      if (this.isValidName(name) && name.length >= 3) {
        return name;
      }
    }

    return null;
  }

  /**
   * Capitaliser un mot (premiere lettre majuscule)
   */
  capitalizeWord(word) {
    if (!word) return '';
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }

  /**
   * Verifier si une chaine ressemble a un nom/prenom valide
   */
  isValidName(str) {
    if (!str || str.length < 2) return false;
    // Que des lettres (avec accents) et tirets
    return /^[a-zA-ZÀ-ÿ-]+$/.test(str);
  }

  /**
   * Connexion a la base B2PWeb scraping
   */
  async connectToB2PWeb() {
    if (!this.b2pwebClient) {
      this.b2pwebClient = new MongoClient(this.b2pwebDbUri);
      await this.b2pwebClient.connect();
      console.log('[PROSPECTION SERVICE] Connected to B2PWeb database');
    }
    return this.b2pwebClient.db('affret_ia');
  }

  /**
   * Synchroniser les transporteurs depuis B2PWeb vers ProspectCarrier
   */
  async syncCarriersFromB2PWeb() {
    try {
      const db = await this.connectToB2PWeb();
      const carriersCollection = db.collection('carrier_interactions');

      // Aggregation pour obtenir les transporteurs uniques avec leurs stats
      const carriers = await carriersCollection.aggregate([
        {
          $group: {
            _id: '$carrier_email',
            carrier_name: { $first: '$carrier_name' },
            carrier_phone: { $first: '$carrier_phone' },
            interaction_count: { $sum: 1 },
            first_seen: { $min: '$interaction_date' },
            last_seen: { $max: '$interaction_date' },
            routes: {
              $push: {
                from: '$from_city',
                to: '$to_city',
                fromPostal: { $substr: ['$reference', 0, 2] }
              }
            }
          }
        },
        { $match: { _id: { $ne: null, $ne: '' } } }
      ]).toArray();

      let created = 0;
      let updated = 0;

      for (const carrier of carriers) {
        // Verifier si existe deja
        let prospect = await ProspectCarrier.findOne({ carrierEmail: carrier._id });

        // Extraire le nom du contact depuis l'email (seulement si format reconnu)
        const contactName = this.parseContactNameFromEmail(carrier._id);

        if (!prospect) {
          // Creer nouveau prospect
          const prospectData = {
            carrierName: carrier.carrier_name,
            carrierEmail: carrier._id,
            carrierPhone: carrier.carrier_phone,
            source: {
              type: 'b2pweb',
              firstSeenAt: carrier.first_seen,
              lastSeenAt: carrier.last_seen,
              interactionCount: carrier.interaction_count
            },
            activityZones: this.extractActivityZones(carrier.routes)
          };

          // Ajouter contactName seulement si detecte
          if (contactName) {
            prospectData.contactName = contactName;
          }

          prospect = new ProspectCarrier(prospectData);
          await prospect.save();
          created++;
        } else {
          // Mettre a jour
          prospect.source.lastSeenAt = carrier.last_seen;
          prospect.source.interactionCount = carrier.interaction_count;
          prospect.activityZones = this.mergeActivityZones(
            prospect.activityZones,
            this.extractActivityZones(carrier.routes)
          );

          // Ajouter contactName si pas deja present et detecte
          if (contactName && !prospect.contactName) {
            prospect.contactName = contactName;
          }

          await prospect.save();
          updated++;
        }
      }

      console.log(`[PROSPECTION SERVICE] Sync complete: ${created} created, ${updated} updated`);
      return { created, updated, total: carriers.length };

    } catch (error) {
      console.error('[PROSPECTION SERVICE] Sync error:', error);
      throw error;
    }
  }

  /**
   * Extraire les zones d'activite a partir des routes
   */
  extractActivityZones(routes) {
    const zonesMap = new Map();

    for (const route of routes) {
      if (!route.from || !route.to) continue;
      const key = `${route.from}-${route.to}`;

      if (zonesMap.has(key)) {
        zonesMap.get(key).frequency++;
      } else {
        zonesMap.set(key, {
          fromCity: route.from,
          toCity: route.to,
          fromPostalCode: route.fromPostal || '',
          toPostalCode: '',
          frequency: 1
        });
      }
    }

    return Array.from(zonesMap.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10); // Top 10 zones
  }

  /**
   * Fusionner les zones d'activite existantes avec nouvelles
   */
  mergeActivityZones(existing, newZones) {
    const merged = new Map();

    // Ajouter existantes
    for (const zone of existing) {
      const key = `${zone.fromCity}-${zone.toCity}`;
      merged.set(key, zone);
    }

    // Fusionner nouvelles
    for (const zone of newZones) {
      const key = `${zone.fromCity}-${zone.toCity}`;
      if (merged.has(key)) {
        merged.get(key).frequency += zone.frequency;
      } else {
        merged.set(key, zone);
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 15);
  }

  /**
   * Trouver des transporteurs prospects pour un transport non pris
   */
  async findProspectsForTransport(transport) {
    try {
      const { pickupCity, pickupPostalCode, deliveryCity, deliveryPostalCode, weight, vehicleType } = transport;

      // Rechercher dans les prospects existants
      const prospects = await ProspectCarrier.find({
        prospectionStatus: { $in: ['new', 'contacted', 'interested', 'trial_active'] },
        blocked: { $ne: true },
        $or: [
          { 'activityZones.fromCity': { $regex: new RegExp(pickupCity, 'i') } },
          { 'activityZones.toCity': { $regex: new RegExp(deliveryCity, 'i') } },
          { 'activityZones.fromPostalCode': { $regex: `^${pickupPostalCode?.substring(0, 2)}` } }
        ]
      })
      .sort({ 'engagementScore.value': -1 })
      .limit(30);

      // Enrichir avec score de matching
      const enrichedProspects = prospects.map(p => ({
        ...p.toObject(),
        matchScore: this.calculateMatchScore(p, transport)
      }));

      // Trier par score de matching
      enrichedProspects.sort((a, b) => b.matchScore - a.matchScore);

      return enrichedProspects.slice(0, 20);

    } catch (error) {
      console.error('[PROSPECTION SERVICE] Find prospects error:', error);
      throw error;
    }
  }

  /**
   * Calculer le score de matching prospect/transport
   */
  calculateMatchScore(prospect, transport) {
    let score = 0;

    // Base engagement score (30% max)
    score += (prospect.engagementScore?.value || 0) * 0.3;

    // Zone matching (40% max)
    const zoneMatch = prospect.activityZones?.some(z =>
      z.fromCity?.toLowerCase() === transport.pickupCity?.toLowerCase() ||
      z.toCity?.toLowerCase() === transport.deliveryCity?.toLowerCase()
    );
    if (zoneMatch) score += 40;

    // Frequence d'activite (20% max)
    const interactionScore = Math.min(prospect.source?.interactionCount || 0, 10) * 2;
    score += interactionScore;

    // Statut de prospection (10% max)
    const statusBonus = {
      'trial_active': 10,
      'interested': 8,
      'contacted': 5,
      'new': 3
    };
    score += statusBonus[prospect.prospectionStatus] || 0;

    return Math.round(score);
  }

  /**
   * Envoyer email de prospection initial
   */
  async sendProspectionEmail(prospectId, transport) {
    try {
      const prospect = await ProspectCarrier.findById(prospectId);
      if (!prospect) throw new Error('Prospect not found');

      if (!sesClient) throw new Error('SES not configured');

      const emailContent = this.generateProspectionEmail(prospect, transport);

      const { SendEmailCommand } = require('@aws-sdk/client-ses');
      const params = {
        Source: `${this.sesFromName} <${this.sesFromEmail}>`,
        Destination: { ToAddresses: [prospect.carrierEmail] },
        Message: {
          Subject: { Data: emailContent.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: emailContent.html, Charset: 'UTF-8' },
            Text: { Data: emailContent.text, Charset: 'UTF-8' }
          }
        },
        Tags: [
          { Name: 'Application', Value: 'AFFRET-IA' },
          { Name: 'Type', Value: 'PROSPECTION' },
          { Name: 'ProspectId', Value: prospectId.toString() }
        ]
      };

      const command = new SendEmailCommand(params);
      const response = await sesClient.send(command);

      // Enregistrer la communication
      prospect.addCommunication('email', 'prospection_initial', emailContent.subject, response.MessageId);
      await prospect.save();

      console.log(`[PROSPECTION SERVICE] Email sent to ${prospect.carrierEmail}, MessageId: ${response.MessageId}`);

      return {
        success: true,
        messageId: response.MessageId,
        prospectId: prospect._id
      };

    } catch (error) {
      console.error('[PROSPECTION SERVICE] Send email error:', error);
      throw error;
    }
  }

  /**
   * Generer l'email de prospection
   * Optimise pour eviter les spams et avec les bonnes informations commerciales
   */
  generateProspectionEmail(prospect, transport) {
    const trialUrl = `${this.symphoniaUrl}/inscription?ref=affretia&email=${encodeURIComponent(prospect.carrierEmail)}&trial=10`;

    // Sujet professionnel sans majuscules excessives
    const subject = `SYMPHONI.A - Opportunite de collaboration transport pour ${prospect.carrierName}`;

    const html = `
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
            <td style="background-color: #1a365d; padding: 30px 40px; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: normal;">SYMPHONI.A</h1>
              <p style="margin: 8px 0 0 0; color: #a0aec0; font-size: 14px;">Control Tower du Transport</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0;">Bonjour,</p>

              <p style="margin: 0 0 20px 0;">
                Nous sommes <strong>SYMPHONI.A</strong>, une plateforme de mise en relation entre industriels et transporteurs.
                Suite a votre activite sur le marche du transport, nous souhaiterions vous proposer de rejoindre notre reseau.
              </p>

              <!-- Offre -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f0fdf4; border-radius: 8px; margin: 25px 0;">
                <tr>
                  <td style="padding: 25px; border-left: 4px solid #22c55e;">
                    <h2 style="margin: 0 0 10px 0; color: #166534; font-size: 20px;">Offre de bienvenue : 10 transports offerts</h2>
                    <p style="margin: 0; color: #15803d;">Decouvrez notre plateforme sans engagement avec 10 transports gratuits pendant 30 jours.</p>
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
                      ${transport.vehicleType ? ` - ${transport.vehicleType}` : ''}
                    </p>
                  </td>
                </tr>
              </table>
              ` : ''}

              <!-- Avantages -->
              <h3 style="margin: 30px 0 15px 0; color: #1a365d; font-size: 18px;">Ce que nous vous proposons :</h3>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding: 8px 0;">
                    <span style="color: #22c55e; font-weight: bold;">&#10003;</span>
                    <span style="margin-left: 10px;"><strong>Aucune commission</strong> sur vos transports</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;">
                    <span style="color: #22c55e; font-weight: bold;">&#10003;</span>
                    <span style="margin-left: 10px;"><strong>Acces direct</strong> aux chargeurs industriels de notre reseau</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;">
                    <span style="color: #22c55e; font-weight: bold;">&#10003;</span>
                    <span style="margin-left: 10px;"><strong>Matching intelligent</strong> selon vos zones d'activite</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;">
                    <span style="color: #22c55e; font-weight: bold;">&#10003;</span>
                    <span style="margin-left: 10px;"><strong>Paiement a 30 jours</strong> selon les conditions du donneur d'ordre</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;">
                    <span style="color: #22c55e; font-weight: bold;">&#10003;</span>
                    <span style="margin-left: 10px;"><strong>eCMR integree</strong> - Gestion documentaire simplifiee</span>
                  </td>
                </tr>
              </table>

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
                        <td style="padding: 8px 0; font-size: 14px; color: #6b7280;">
                          Acces aux transports et outils de base
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 15px 0 8px 0; border-bottom: 1px solid #e5e7eb;">
                          <strong style="color: #1a365d;">Abonnement Premium (modules industriels)</strong>
                          <span style="float: right; color: #059669; font-weight: bold;">699 EUR/mois</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; font-size: 14px; color: #6b7280;">
                          Acces complet avec planification, KPI, tracking avance...
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${trialUrl}" style="display: inline-block; background-color: #1a365d; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">Decouvrir SYMPHONI.A</a>
                  </td>
                </tr>
              </table>

              <p style="margin: 25px 0 0 0;">
                N'hesitez pas a nous contacter pour toute question.
              </p>

              <p style="margin: 20px 0 0 0;">
                Cordialement,<br>
                <strong>L'equipe SYMPHONI.A</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 25px 40px; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 10px 0; color: #64748b; font-size: 13px;">
                <strong>SYMPHONI.A</strong><br>
                Plateforme de gestion du transport
              </p>
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                Cet email a ete envoye a ${prospect.carrierEmail}<br>
                <a href="${this.symphoniaUrl}/desinscription?email=${encodeURIComponent(prospect.carrierEmail)}" style="color: #94a3b8;">Se desinscrire de nos communications</a>
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

    const text = `Bonjour,

Nous sommes SYMPHONI.A, une plateforme de mise en relation entre industriels et transporteurs.
Suite a votre activite sur le marche du transport, nous souhaiterions vous proposer de rejoindre notre reseau.

OFFRE DE BIENVENUE : 10 TRANSPORTS OFFERTS
Decouvrez notre plateforme sans engagement avec 10 transports gratuits pendant 30 jours.
${transport ? `
Exemple de transport disponible :
${transport.pickupCity || 'Depart'} -> ${transport.deliveryCity || 'Arrivee'}
${transport.pickupDate ? `Date : ${new Date(transport.pickupDate).toLocaleDateString('fr-FR')}` : ''}${transport.weight ? ` - Poids : ${transport.weight} T` : ''}
` : ''}
CE QUE NOUS VOUS PROPOSONS :
- Aucune commission sur vos transports
- Acces direct aux chargeurs industriels de notre reseau
- Matching intelligent selon vos zones d'activite
- Paiement a 30 jours selon les conditions du donneur d'ordre
- eCMR integree - Gestion documentaire simplifiee

TARIFS APRES VOTRE PERIODE D'ESSAI :
- Abonnement Transporteur : 200 EUR/mois (acces aux transports et outils de base)
- Abonnement Premium : 699 EUR/mois (acces complet avec planification, KPI, tracking avance)

Decouvrez SYMPHONI.A : ${trialUrl}

N'hesitez pas a nous contacter pour toute question.

Cordialement,
L'equipe SYMPHONI.A

---
SYMPHONI.A
Cet email a ete envoye a ${prospect.carrierEmail}
    `;

    return { subject, html, text };
  }

  /**
   * Envoyer email de relance pour conversion Premium
   */
  async sendConversionEmail(prospectId) {
    try {
      const prospect = await ProspectCarrier.findById(prospectId);
      if (!prospect) throw new Error('Prospect not found');

      if (!sesClient) throw new Error('SES not configured');

      const premiumUrl = `${this.symphoniaUrl}/premium?ref=affretia&email=${encodeURIComponent(prospect.carrierEmail)}`;
      const usedCount = prospect.trialOffer?.transportsUsed || 0;
      const remaining = (prospect.trialOffer?.transportsLimit || 10) - usedCount;

      const subject = `SYMPHONI.A - Plus que ${remaining} transports gratuits pour ${prospect.carrierName}`;

      const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fin de periode d'essai - SYMPHONI.A</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333333; background-color: #f4f4f4;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4;">
    <tr>
      <td style="padding: 20px 0;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">

          <!-- Header -->
          <tr>
            <td style="background-color: #e67e22; padding: 30px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: bold;">Votre essai gratuit touche a sa fin</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px;">Bonjour <strong>${prospect.carrierName}</strong>,</p>

              <!-- Stats Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fff5f5; border-radius: 8px; margin: 25px 0;">
                <tr>
                  <td style="padding: 25px; text-align: center;">
                    <div style="font-size: 48px; color: #e74c3c; font-weight: bold;">${remaining}</div>
                    <p style="margin: 5px 0 0 0; font-size: 18px; color: #333;">transports gratuits restants</p>
                    <p style="margin: 10px 0 0 0; font-size: 14px; color: #666;">Vous avez deja utilise ${usedCount} transports avec succes</p>
                  </td>
                </tr>
              </table>

              <p style="margin: 20px 0; font-size: 16px;">Ne perdez pas l'acces a nos opportunites de transport !</p>

              <p style="margin: 20px 0 10px 0; font-size: 16px;"><strong>Continuez avec un abonnement :</strong></p>

              <!-- Pricing Table -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 20px 0;">
                <tr>
                  <td style="padding: 15px; background-color: #f8fafc; border-radius: 8px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                          <strong style="color: #1a365d;">Abonnement Transporteur</strong>
                          <span style="float: right; color: #059669; font-weight: bold;">200 EUR/mois</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0 10px 15px; color: #666; font-size: 14px;">
                          Acces illimite aux transports SYMPHONI.A
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                          <strong style="color: #1a365d;">Abonnement Premium</strong>
                          <span style="float: right; color: #059669; font-weight: bold;">699 EUR/mois</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0 10px 15px; color: #666; font-size: 14px;">
                          Tous les modules industriels : planification, tracking, KPI, etc.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Avantages -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 20px 0;">
                <tr>
                  <td style="padding: 8px 0;">✓ Aucune commission sur les transports</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;">✓ Paiement a 30 jours selon conditions du donneur d'ordre</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;">✓ Priorite sur les meilleures offres</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;">✓ Support dedie</td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${premiumUrl}" style="display: inline-block; background-color: #667eea; color: #ffffff; padding: 15px 35px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">Souscrire maintenant</a>
                  </td>
                </tr>
              </table>

              <p style="margin: 20px 0 0 0; font-size: 16px;">Cordialement,<br><strong>L'equipe SYMPHONI.A</strong></p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 25px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #6b7280;">SYMPHONI.A - La Control Tower du transport</p>
              <p style="margin: 10px 0 0 0; font-size: 11px; color: #9ca3af;">Cet email a ete envoye a ${prospect.carrierEmail}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `;

      const text = `
Bonjour ${prospect.carrierName},

Votre essai gratuit touche a sa fin !

Il vous reste ${remaining} transports gratuits sur SYMPHONI.A.
Vous avez deja utilise ${usedCount} transports avec succes.

Ne perdez pas l'acces a nos opportunites de transport !

CONTINUEZ AVEC UN ABONNEMENT :

- Abonnement Transporteur : 200 EUR/mois
  Acces illimite aux transports SYMPHONI.A

- Abonnement Premium : 699 EUR/mois
  Tous les modules industriels : planification, tracking, KPI, etc.

VOS AVANTAGES :
- Aucune commission sur les transports
- Paiement a 30 jours selon conditions du donneur d'ordre
- Priorite sur les meilleures offres
- Support dedie

Souscrire maintenant : ${premiumUrl}

Cordialement,
L'equipe SYMPHONI.A

---
SYMPHONI.A
Cet email a ete envoye a ${prospect.carrierEmail}
      `;

      const { SendEmailCommand } = require('@aws-sdk/client-ses');
      const params = {
        Source: `${this.sesFromName} <${this.sesFromEmail}>`,
        Destination: { ToAddresses: [prospect.carrierEmail] },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: html, Charset: 'UTF-8' },
            Text: { Data: text, Charset: 'UTF-8' }
          }
        },
        Tags: [
          { Name: 'Application', Value: 'AFFRET-IA' },
          { Name: 'Type', Value: 'CONVERSION' }
        ]
      };

      const command = new SendEmailCommand(params);
      const response = await sesClient.send(command);

      prospect.addCommunication('email', 'conversion_reminder', subject, response.MessageId);
      await prospect.save();

      return { success: true, messageId: response.MessageId };

    } catch (error) {
      console.error('[PROSPECTION SERVICE] Conversion email error:', error);
      throw error;
    }
  }

  /**
   * Lancer une campagne de prospection pour un transport non pris
   */
  async launchProspectionCampaign(transport, maxProspects = 10) {
    try {
      // Synchroniser d'abord les nouveaux transporteurs
      await this.syncCarriersFromB2PWeb();

      // Trouver les prospects matching
      const prospects = await this.findProspectsForTransport(transport);

      const results = {
        total: prospects.length,
        contacted: 0,
        failed: 0,
        details: []
      };

      // Envoyer emails aux top prospects
      for (const prospect of prospects.slice(0, maxProspects)) {
        try {
          // Ne pas recontacter si deja contacte recemment (< 7 jours)
          const recentComm = prospect.communications?.find(c =>
            c.sentAt && (Date.now() - new Date(c.sentAt).getTime()) < 7 * 24 * 60 * 60 * 1000
          );

          if (recentComm) {
            results.details.push({
              prospectId: prospect._id,
              email: prospect.carrierEmail,
              status: 'skipped',
              reason: 'Contacted recently'
            });
            continue;
          }

          const emailResult = await this.sendProspectionEmail(prospect._id, transport);
          results.contacted++;
          results.details.push({
            prospectId: prospect._id,
            email: prospect.carrierEmail,
            status: 'sent',
            messageId: emailResult.messageId
          });

        } catch (err) {
          results.failed++;
          results.details.push({
            prospectId: prospect._id,
            email: prospect.carrierEmail,
            status: 'failed',
            error: err.message
          });
        }
      }

      console.log(`[PROSPECTION SERVICE] Campaign complete: ${results.contacted} contacted, ${results.failed} failed`);
      return results;

    } catch (error) {
      console.error('[PROSPECTION SERVICE] Campaign error:', error);
      throw error;
    }
  }

  /**
   * Obtenir les statistiques de prospection
   */
  async getProspectionStats() {
    try {
      const stats = await ProspectCarrier.getProspectionStats();

      const totalProspects = await ProspectCarrier.countDocuments();
      const trialsActive = await ProspectCarrier.countDocuments({ prospectionStatus: 'trial_active' });
      const converted = await ProspectCarrier.countDocuments({ prospectionStatus: 'converted' });

      // Revenue potentiel des conversions
      const conversions = await ProspectCarrier.find({ prospectionStatus: 'converted' });
      const totalRevenue = conversions.reduce((sum, c) => sum + (c.conversionTracking?.monthlyValue || 0), 0);

      return {
        total: totalProspects,
        byStatus: stats.reduce((acc, s) => {
          acc[s._id] = { count: s.count, avgEngagement: Math.round(s.avgEngagement || 0) };
          return acc;
        }, {}),
        trialsActive,
        converted,
        conversionRate: totalProspects > 0 ? ((converted / totalProspects) * 100).toFixed(2) : 0,
        monthlyRevenue: totalRevenue
      };

    } catch (error) {
      console.error('[PROSPECTION SERVICE] Stats error:', error);
      throw error;
    }
  }
}

module.exports = new ProspectionService();
