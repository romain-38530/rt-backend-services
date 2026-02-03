/**
 * Service d'invitation des transporteurs Dashdoc vers Symphonia
 *
 * 2 types d'invitations :
 * 1. Transporteurs connus dans Dashdoc mais PAS dans Symphonia
 *    → Email avec historique routes/prix + lien inscription/connexion
 *
 * 2. Conquête pure : transporteurs non connus
 *    → Email informant des transports disponibles sur leurs routes
 */

const axios = require('axios');
const PriceHistory = require('../models/PriceHistory');
const AwsSesEmailService = require('./aws-ses-email.service');
const crypto = require('crypto');

class DashdocCarrierInvitationService {
  constructor() {
    this.dashdocApiUrl = process.env.DASHDOC_API_URL || 'https://api.dashdoc.eu/api/v4';
    this.dashdocApiKey = process.env.DASHDOC_API_KEY;
    this.symphoniaAuthzUrl = process.env.SYMPHONIA_AUTHZ_URL || 'https://symphonia-authz-prod.eba-nwzuqemk.eu-west-3.elasticbeanstalk.com/api/v1';
    this.frontendUrl = process.env.SYMPHONIA_URL || 'https://transporteur.symphonia-controltower.com';

    // Service email AWS SES
    this.emailService = AwsSesEmailService;
  }

  /**
   * Identifier les transporteurs Dashdoc qui ne sont PAS dans Symphonia
   */
  async identifyDashdocCarriersNotInSymphonia() {
    try {
      console.log('[DASHDOC INVITATION] Identification des transporteurs Dashdoc...');

      // 1. Récupérer tous les carriers uniques depuis PriceHistory (déjà importés de Dashdoc)
      const dashdocCarriers = await PriceHistory.aggregate([
        { $match: { 'dashdocImport.imported': true } },
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
            avgPrice: { $avg: '$price.final' },
            minPrice: { $min: '$price.final' },
            maxPrice: { $max: '$price.final' },
            lastTransport: { $max: '$completedAt' }
          }
        },
        { $sort: { totalTransports: -1 } }
      ]);

      console.log(`[DASHDOC INVITATION] ${dashdocCarriers.length} transporteurs Dashdoc trouvés`);

      // 2. Pour chaque carrier, vérifier s'il existe dans Symphonia
      const carriersNotInSymphonia = [];

      for (const carrier of dashdocCarriers) {
        // Vérifier si email ou SIREN existe déjà dans Symphonia
        const existsInSymphonia = await this.checkCarrierExistsInSymphonia(
          carrier.carrierEmail,
          carrier.carrierSiren
        );

        if (!existsInSymphonia) {
          carriersNotInSymphonia.push(carrier);
        }
      }

      console.log(`[DASHDOC INVITATION] ${carriersNotInSymphonia.length} transporteurs NON présents dans Symphonia`);

      return {
        total: dashdocCarriers.length,
        notInSymphonia: carriersNotInSymphonia.length,
        carriers: carriersNotInSymphonia
      };

    } catch (error) {
      console.error('[DASHDOC INVITATION] Erreur identification carriers:', error);
      throw error;
    }
  }

  /**
   * Vérifier si un transporteur existe déjà dans Symphonia
   */
  async checkCarrierExistsInSymphonia(email, siren) {
    try {
      // Requête vers Symphonia Authz pour vérifier si carrier existe
      const response = await axios.get(`${this.symphoniaAuthzUrl}/carriers/check`, {
        params: { email, siren },
        timeout: 5000
      });

      return response.data.exists || false;
    } catch (error) {
      if (error.response?.status === 404) {
        return false; // N'existe pas
      }
      console.error('[DASHDOC INVITATION] Erreur vérification carrier:', error.message);
      return false; // En cas d'erreur, on considère qu'il n'existe pas
    }
  }

  /**
   * Générer un token d'invitation personnalisé
   */
  generateInvitationToken(carrierData) {
    const payload = {
      carrierId: carrierData._id,
      carrierName: carrierData.carrierName,
      carrierEmail: carrierData.carrierEmail,
      carrierSiren: carrierData.carrierSiren,
      source: 'dashdoc',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 jours
    };

    // Encoder en base64
    const token = Buffer.from(JSON.stringify(payload)).toString('base64url');

    return token;
  }

  /**
   * TYPE 1: Envoyer invitation aux transporteurs connus dans Dashdoc
   * Inclut historique routes/prix avec dates
   */
  async sendInvitationToKnownCarrier(carrierData, options = {}) {
    try {
      if (!carrierData.carrierEmail) {
        console.log(`⚠️ [DASHDOC INVITATION] Pas d'email pour ${carrierData.carrierName}`);
        return { success: false, reason: 'no_email' };
      }

      console.log(`[DASHDOC INVITATION] Envoi invitation à ${carrierData.carrierName} (${carrierData.carrierEmail})`);

      // Générer token d'invitation
      const invitationToken = this.generateInvitationToken(carrierData);

      // Lien d'inscription/connexion
      const invitationUrl = `${this.frontendUrl}/invitation/dashdoc/${invitationToken}`;

      // Préparer les routes avec meilleurs prix
      const topRoutes = carrierData.routes
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5); // Top 5 routes récentes

      // Générer HTML email
      const emailHtml = this.generateKnownCarrierEmailHtml({
        carrierName: carrierData.carrierName,
        contactName: carrierData.carrierContact ?
          `${carrierData.carrierContact.firstName} ${carrierData.carrierContact.lastName}` :
          null,
        totalTransports: carrierData.totalTransports,
        routes: topRoutes,
        avgPrice: carrierData.avgPrice,
        invitationUrl
      });

      // Envoyer email via AWS SES
      if (!options.dryRun) {
        await this.emailService.sendEmail({
          to: carrierData.carrierEmail,
          subject: `🚛 ${carrierData.carrierName} - Accédez à nos offres de transport sur vos routes habituelles`,
          html: emailHtml
        });

        console.log(`✅ [DASHDOC INVITATION] Email envoyé à ${carrierData.carrierEmail}`);
      } else {
        console.log(`[DRY RUN] Email généré pour ${carrierData.carrierEmail}`);
      }

      return {
        success: true,
        carrierEmail: carrierData.carrierEmail,
        invitationToken,
        invitationUrl
      };

    } catch (error) {
      console.error(`[DASHDOC INVITATION] Erreur envoi email à ${carrierData.carrierEmail}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * TYPE 2: Email de conquête pure pour transporteurs non connus
   * Informe des transports disponibles sur routes qu'ils réalisent
   */
  async sendConquestEmailToCarrier(carrierData, availableOrders = [], options = {}) {
    try {
      if (!carrierData.carrierEmail) {
        console.log(`⚠️ [DASHDOC CONQUEST] Pas d'email pour ${carrierData.carrierName}`);
        return { success: false, reason: 'no_email' };
      }

      console.log(`[DASHDOC CONQUEST] Envoi email conquête à ${carrierData.carrierName} (${carrierData.carrierEmail})`);

      // Générer token d'inscription
      const signupToken = this.generateInvitationToken(carrierData);

      // Lien d'inscription Vigilance
      const signupUrl = `${this.frontendUrl}/signup/carrier?source=dashdoc&token=${signupToken}`;

      // Générer HTML email
      const emailHtml = this.generateConquestEmailHtml({
        carrierName: carrierData.carrierName,
        contactName: carrierData.carrierContact ?
          `${carrierData.carrierContact.firstName} ${carrierData.carrierContact.lastName}` :
          null,
        routes: carrierData.routes.slice(0, 3), // Top 3 routes
        availableOrders: availableOrders.slice(0, 5), // Max 5 offres disponibles
        signupUrl
      });

      // Envoyer email via AWS SES
      if (!options.dryRun) {
        await this.emailService.sendEmail({
          to: carrierData.carrierEmail,
          subject: `🚀 Nouvelles offres de transport sur vos routes - Rejoignez SYMPHONI.A`,
          html: emailHtml
        });

        console.log(`✅ [DASHDOC CONQUEST] Email envoyé à ${carrierData.carrierEmail}`);
      } else {
        console.log(`[DRY RUN] Email conquête généré pour ${carrierData.carrierEmail}`);
      }

      return {
        success: true,
        carrierEmail: carrierData.carrierEmail,
        signupToken,
        signupUrl
      };

    } catch (error) {
      console.error(`[DASHDOC CONQUEST] Erreur envoi email à ${carrierData.carrierEmail}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Générer HTML pour email TYPE 1 (transporteur connu)
   */
  generateKnownCarrierEmailHtml(data) {
    const { carrierName, contactName, totalTransports, routes, avgPrice, invitationUrl } = data;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .logo { font-size: 48px; font-weight: bold; margin-bottom: 10px; letter-spacing: 2px; text-shadow: 2px 2px 4px rgba(0,0,0,0.2); }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .route-card { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #667eea; border-radius: 5px; }
    .price { color: #667eea; font-weight: bold; font-size: 18px; }
    .date { color: #666; font-size: 14px; }
    .btn { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
    .btn:hover { background: #5568d3; }
    .stats { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">SYMPHONI.A</div>
      <p>Plateforme intelligente d'affrètement</p>
    </div>

    <div class="content">
      <h2>Bonjour ${contactName || carrierName} 👋</h2>

      <p>Nous avons une excellente nouvelle pour vous !</p>

      <p>
        Nous avons analysé vos <strong>${totalTransports} transports réalisés</strong> et identifié
        plusieurs opportunités d'affaires sur vos routes habituelles via notre plateforme <strong>SYMPHONI.A</strong>.
      </p>

      <div class="stats">
        <h3>📊 Votre Activité</h3>
        <ul>
          <li><strong>${totalTransports}</strong> transports réalisés</li>
          <li><strong>${routes.length}</strong> routes identifiées</li>
        </ul>
      </div>

      <h3>🛣️ Vos Routes Principales</h3>

      ${routes.map(route => `
        <div class="route-card">
          <strong>${route.fromCity} (${route.from}) → ${route.toCity} (${route.to})</strong>
          <br>
          <span class="price">${route.price}€</span>
          <span class="date">• Réalisé le ${new Date(route.date).toLocaleDateString('fr-FR')}</span>
        </div>
      `).join('')}

      <p style="margin-top: 30px;">
        <strong>Pourquoi rejoindre SYMPHONI.A ?</strong>
      </p>

      <ul>
        <li>✅ <strong>Accès prioritaire</strong> aux offres sur vos routes habituelles</li>
        <li>✅ <strong>Négociation intelligente</strong> basée sur vos prix historiques</li>
        <li>✅ <strong>Paiement garanti</strong> sous 30 jours</li>
        <li>✅ <strong>Affret.IA</strong> vous propose automatiquement les meilleures offres</li>
      </ul>

      <center>
        <a href="${invitationUrl}" class="btn">
          🚀 Accéder à mon espace SYMPHONI.A
        </a>
      </center>

      <p style="margin-top: 30px; padding: 15px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 5px;">
        <strong>💡 Bon à savoir :</strong> Nous connaissons déjà votre historique de prix.
        Affret.IA vous proposera automatiquement des tarifs cohérents avec ce que vous avez déjà pratiqué.
      </p>

      <p style="margin-top: 20px; font-size: 14px; color: #666;">
        Cette invitation est valable <strong>30 jours</strong>.
        Ne manquez pas l'opportunité d'accéder à de nouvelles offres sur vos routes !
      </p>
    </div>

    <div class="footer">
      <p>SYMPHONI.A - Affret.IA</p>
      <p>Intelligence artificielle au service du transport</p>
      <p style="font-size: 11px; color: #999;">
        Vous recevez cet email car vous avez réalisé des transports avec nos partenaires.
        <a href="${invitationUrl}" style="color: #667eea;">Se désinscrire</a>
      </p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Générer HTML pour email TYPE 2 (conquête)
   */
  generateConquestEmailHtml(data) {
    const { carrierName, contactName, routes, availableOrders, signupUrl } = data;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .logo { font-size: 48px; font-weight: bold; margin-bottom: 10px; letter-spacing: 2px; text-shadow: 2px 2px 4px rgba(0,0,0,0.2); }
    .testimonial { background: #e8f5e9; padding: 15px; border-left: 4px solid #4caf50; border-radius: 5px; margin: 20px 0; font-style: italic; color: #2e7d32; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .order-card { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #11998e; border-radius: 5px; }
    .price { color: #11998e; font-weight: bold; font-size: 18px; }
    .badge { display: inline-block; background: #38ef7d; color: white; padding: 5px 10px; border-radius: 3px; font-size: 12px; margin-right: 5px; }
    .btn { display: inline-block; background: #11998e; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
    .btn:hover { background: #0d7a70; }
    .highlight { background: #d4edda; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #28a745; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">SYMPHONI.A</div>
      <p>Nouvelles opportunités de transport disponibles</p>
    </div>

    <div class="content">
      <h2>Bonjour ${contactName || carrierName} 👋</h2>

      <div class="testimonial">
        💼 <strong>${carrierName}</strong> a choisi SYMPHONI.A pour l'accompagner dans la gestion de ses flux
      </div>

      <p>
        Nous avons détecté que vous réalisez régulièrement des transports sur des routes
        où nous avons actuellement <strong>${availableOrders.length} offres disponibles</strong>.
      </p>

      ${availableOrders.length > 0 ? `
        <h3>📦 Offres Disponibles sur Vos Routes</h3>

        ${availableOrders.map(order => `
          <div class="order-card">
            <div style="margin-bottom: 10px;">
              <span class="badge">URGENT</span>
              <span class="badge">Chargement ${new Date(order.pickupDate).toLocaleDateString('fr-FR')}</span>
            </div>
            <strong>${order.pickup.city} (${order.pickup.postalCode}) → ${order.delivery.city} (${order.delivery.postalCode})</strong>
            <br>
            <span class="price">${order.estimatedPrice}€</span>
            <br>
            <small>${order.cargo.palettes} palettes • ${order.cargo.weight} kg</small>
          </div>
        `).join('')}
      ` : ''}

      <div class="highlight">
        <h3 style="margin-top: 0;">💰 Offre de Lancement Exclusive</h3>
        <ul style="margin: 10px 0;">
          <li><strong>10 consultations de transports gratuit</strong></li>
          <li><strong>Accès immédiat</strong> aux offres sur vos routes</li>
          <li><strong>Paiement garanti</strong> sous 30 jours</li>
          <li><strong>Aucun engagement</strong>, aucun abonnement</li>
        </ul>
      </div>

      <h3>🤖 Affret.IA - Votre Assistant Personnel</h3>

      <p>
        Notre intelligence artificielle analyse automatiquement :
      </p>
      <ul>
        <li>✅ Les offres compatibles avec vos routes habituelles</li>
        <li>✅ Les prix du marché en temps réel</li>
        <li>✅ Votre disponibilité et vos préférences</li>
        <li>✅ Les meilleures opportunités de retour à vide</li>
      </ul>

      <p style="margin-top: 20px;">
        <strong>Comment ça marche ?</strong>
      </p>
      <ol>
        <li>Inscrivez-vous en 2 minutes (gratuit)</li>
        <li>Affret.IA vous propose automatiquement les offres pertinentes</li>
        <li>Acceptez ou refusez en un clic</li>
        <li>Recevez les détails et réalisez le transport</li>
      </ol>

      <center>
        <a href="${signupUrl}" class="btn">
          🚀 Créer mon compte gratuitement
        </a>
      </center>

      <p style="margin-top: 20px; font-size: 14px; color: #666;">
        Rejoignez déjà <strong>500+ transporteurs</strong> qui utilisent SYMPHONI.A pour optimiser
        leur activité et réduire les retours à vide.
      </p>
    </div>

    <div class="footer">
      <p>SYMPHONI.A - Affret.IA</p>
      <p>Intelligence artificielle au service du transport</p>
      <p style="font-size: 11px; color: #999;">
        Vous recevez cet email car vous êtes un professionnel du transport.
        <a href="${signupUrl}" style="color: #11998e;">Se désinscrire</a>
      </p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Campagne d'invitation massive
   * Envoie invitations à tous les carriers Dashdoc non présents dans Symphonia
   */
  async runInvitationCampaign(options = {}) {
    try {
      const {
        maxInvitations = 100,
        delayBetweenEmails = 2000, // 2 secondes entre chaque email
        dryRun = false,
        type = 'known' // 'known' ou 'conquest'
      } = options;

      console.log(`[DASHDOC INVITATION] Démarrage campagne ${type}...`);

      // 1. Identifier carriers non présents
      const { carriers } = await this.identifyDashdocCarriersNotInSymphonia();

      const carriersToInvite = carriers.slice(0, maxInvitations);

      console.log(`[DASHDOC INVITATION] ${carriersToInvite.length} invitations à envoyer`);

      const results = {
        total: carriersToInvite.length,
        sent: 0,
        failed: 0,
        noEmail: 0,
        errors: []
      };

      // 2. Envoyer invitations avec délai
      for (const carrier of carriersToInvite) {
        let result;

        if (type === 'known') {
          result = await this.sendInvitationToKnownCarrier(carrier, { dryRun });
        } else {
          // Pour conquest, on pourrait récupérer les offres disponibles sur ses routes
          result = await this.sendConquestEmailToCarrier(carrier, [], { dryRun });
        }

        if (result.success) {
          results.sent++;
        } else if (result.reason === 'no_email') {
          results.noEmail++;
        } else {
          results.failed++;
          results.errors.push({
            carrier: carrier.carrierName,
            error: result.error
          });
        }

        // Délai entre emails pour ne pas surcharger SMTP
        if (!dryRun) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenEmails));
        }
      }

      console.log(`[DASHDOC INVITATION] Campagne terminée:`);
      console.log(`  ✅ ${results.sent} emails envoyés`);
      console.log(`  ⚠️ ${results.noEmail} sans email`);
      console.log(`  ❌ ${results.failed} erreurs`);

      return results;

    } catch (error) {
      console.error('[DASHDOC INVITATION] Erreur campagne:', error);
      throw error;
    }
  }
}

module.exports = new DashdocCarrierInvitationService();
