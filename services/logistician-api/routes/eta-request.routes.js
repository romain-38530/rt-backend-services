/**
 * ETA Request Routes
 * Demandes ETA par email aux transporteurs
 */

import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { authenticateLogistician, notifyLogistician } from '../index.js';

const router = Router();

// ===========================================
// POST /api/logisticians/:id/tracking/request-eta/:rdvId
// Demande ETA par email au transporteur
// ===========================================
router.post('/:id/tracking/request-eta/:rdvId', authenticateLogistician, async (req, res) => {
  try {
    const { id: logisticianId, rdvId } = req.params;
    const db = req.db;

    // Récupérer le RDV
    const rdv = await db.collection('rdv').findOne({
      _id: new ObjectId(rdvId)
    });

    if (!rdv) {
      return res.status(404).json({ error: 'RDV non trouvé' });
    }

    // Vérifier que le RDV concerne un entrepôt du logisticien
    const warehouse = await db.collection('warehouses').findOne({
      _id: rdv.warehouseId,
      logisticianId: new ObjectId(logisticianId)
    });

    if (!warehouse) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Récupérer le transporteur
    const transporter = rdv.transporterId
      ? await db.collection('transporters').findOne({ _id: new ObjectId(rdv.transporterId) })
      : null;

    if (!transporter || !transporter.email) {
      return res.status(400).json({ error: 'Transporteur ou email non trouvé' });
    }

    // Récupérer le logisticien pour le nom
    const logistician = await db.collection('logisticians').findOne({
      _id: new ObjectId(logisticianId)
    });

    // Générer un token unique pour la réponse
    const crypto = await import('crypto');
    const responseToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    // Sauvegarder la demande
    await db.collection('eta_requests').insertOne({
      rdvId: new ObjectId(rdvId),
      logisticianId: new ObjectId(logisticianId),
      transporterId: transporter._id,
      warehouseId: warehouse._id,
      responseToken,
      status: 'pending',
      expiresAt,
      createdAt: new Date()
    });

    // URL de réponse
    const responseUrl = `${process.env.CARRIER_PORTAL_URL || 'https://transporteur.symphonia-controltower.com'}/eta-response?token=${responseToken}`;

    // Envoyer l'email via AWS SES
    const { sendEmail, wrapEmailTemplate, ctaButton, infoBox, alertBox } = await import('../../subscriptions-contracts-eb/aws-ses-email-service.js');

    const rdvDate = new Date(rdv.date);
    const formattedDate = rdvDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const formattedTime = rdv.slotStart || rdvDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const emailContent = `
      <h2 style="color: #1f2937; margin-top: 0;">Demande d'ETA - RDV du ${formattedDate}</h2>
      <p>Bonjour,</p>
      <p><strong>${logistician?.companyName || 'Un logisticien'}</strong> souhaite connaître votre heure d'arrivée estimée pour le RDV suivant :</p>
      ${infoBox({
        'N° RDV': rdv.rdvNumber || `RDV-${rdv._id.toString().slice(-6)}`,
        'Site': warehouse.name,
        'Adresse': warehouse.address?.full || warehouse.address || 'Non renseignée',
        'Date': formattedDate,
        'Créneau': formattedTime,
        'Référence commande': rdv.orderReference || '-'
      })}
      ${alertBox('info', 'Action requise', 'Merci de nous communiquer votre ETA en cliquant sur le bouton ci-dessous.')}
      ${ctaButton('Communiquer mon ETA', responseUrl, '#2563eb')}
      <p style="color: #6b7280; font-size: 14px;">Ce lien est valide pendant 24 heures.</p>
      <p style="color: #6b7280; font-size: 14px;">Vous pouvez également répondre à cet email avec votre ETA estimée.</p>
    `;

    const emailResult = await sendEmail({
      to: transporter.email,
      subject: `[SYMPHONI.A] Demande ETA - RDV ${rdv.rdvNumber || rdv._id.toString().slice(-6)} du ${formattedDate}`,
      html: wrapEmailTemplate(emailContent, '#2563eb'),
      senderType: 'notifications',
      replyTo: logistician?.email || undefined
    });

    if (!emailResult.success) {
      console.error('[ETA-REQUEST] Email send failed:', emailResult.error);
      return res.status(500).json({ error: 'Erreur envoi email', details: emailResult.error });
    }

    // Logger l'envoi
    await db.collection('tracking_events').insertOne({
      rdvId: new ObjectId(rdvId),
      type: 'eta_requested',
      message: `Demande ETA envoyée à ${transporter.companyName || transporter.email}`,
      timestamp: new Date()
    });

    // Notifier le logisticien
    notifyLogistician(logisticianId, {
      type: 'tracking.eta_requested',
      rdvId: rdvId,
      rdvNumber: rdv.rdvNumber,
      transporterName: transporter.companyName,
      warehouseName: warehouse.name,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: `Demande ETA envoyée à ${transporter.companyName || transporter.email}`,
      messageId: emailResult.messageId
    });

  } catch (error) {
    console.error('[ETA-REQUEST] Request ETA error:', error);
    res.status(500).json({ error: 'Erreur envoi demande ETA' });
  }
});

// ===========================================
// POST /api/eta-response
// Réponse ETA du transporteur (public avec token)
// ===========================================
router.post('/eta-response', async (req, res) => {
  try {
    const { token, eta, etaDate, etaTime, message, status } = req.body;
    const db = req.db;

    if (!token) {
      return res.status(400).json({ error: 'Token requis' });
    }

    // Trouver la demande
    const etaRequest = await db.collection('eta_requests').findOne({
      responseToken: token,
      status: 'pending',
      expiresAt: { $gt: new Date() }
    });

    if (!etaRequest) {
      return res.status(404).json({ error: 'Demande expirée ou invalide' });
    }

    // Calculer l'ETA
    let calculatedEta = null;
    if (eta) {
      calculatedEta = new Date(eta);
    } else if (etaDate && etaTime) {
      calculatedEta = new Date(`${etaDate}T${etaTime}`);
    }

    // Mettre à jour la demande
    await db.collection('eta_requests').updateOne(
      { _id: etaRequest._id },
      {
        $set: {
          status: status || 'responded',
          eta: calculatedEta,
          message: message || null,
          respondedAt: new Date()
        }
      }
    );

    // Mettre à jour le tracking
    if (calculatedEta) {
      await db.collection('driver_tracking').updateOne(
        { rdvId: etaRequest.rdvId },
        {
          $set: {
            eta: calculatedEta,
            etaSource: 'transporter_response',
            updatedAt: new Date()
          },
          $setOnInsert: {
            rdvId: etaRequest.rdvId,
            warehouseId: etaRequest.warehouseId,
            status: 'en_route',
            active: true,
            createdAt: new Date()
          }
        },
        { upsert: true }
      );
    }

    // Créer événement
    await db.collection('tracking_events').insertOne({
      rdvId: etaRequest.rdvId,
      type: 'eta_received',
      message: calculatedEta
        ? `ETA reçue du transporteur: ${calculatedEta.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
        : message || 'Réponse transporteur reçue',
      eta: calculatedEta,
      timestamp: new Date()
    });

    // Notifier le logisticien
    notifyLogistician(etaRequest.logisticianId.toString(), {
      type: 'tracking.eta_received',
      rdvId: etaRequest.rdvId.toString(),
      eta: calculatedEta,
      message: message,
      timestamp: new Date()
    });

    // Récupérer infos pour l'email de confirmation au logisticien
    const rdv = await db.collection('rdv').findOne({ _id: etaRequest.rdvId });
    const warehouse = await db.collection('warehouses').findOne({ _id: etaRequest.warehouseId });
    const logistician = await db.collection('logisticians').findOne({ _id: etaRequest.logisticianId });
    const transporter = await db.collection('transporters').findOne({ _id: etaRequest.transporterId });

    // Envoyer email de notification au logisticien
    if (logistician?.email) {
      const { sendEmail, wrapEmailTemplate, infoBox, alertBox } = await import('../../subscriptions-contracts-eb/aws-ses-email-service.js');

      const emailContent = `
        <h2 style="color: #1f2937; margin-top: 0;">ETA reçue du transporteur</h2>
        <p>Bonjour,</p>
        <p>Le transporteur <strong>${transporter?.companyName || 'N/A'}</strong> a répondu à votre demande d'ETA.</p>
        ${alertBox('success', 'ETA Confirmée', calculatedEta
          ? `Arrivée prévue: ${calculatedEta.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
          : message || 'Voir détails ci-dessous'
        )}
        ${infoBox({
          'RDV': rdv?.rdvNumber || `RDV-${etaRequest.rdvId.toString().slice(-6)}`,
          'Site': warehouse?.name || '-',
          'ETA': calculatedEta ? calculatedEta.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '-',
          'Message': message || '-'
        })}
      `;

      await sendEmail({
        to: logistician.email,
        subject: `[SYMPHONI.A] ETA reçue - ${transporter?.companyName || 'Transporteur'} - RDV ${rdv?.rdvNumber || ''}`,
        html: wrapEmailTemplate(emailContent, '#10b981'),
        senderType: 'notifications'
      });
    }

    res.json({
      success: true,
      message: 'ETA enregistrée avec succès'
    });

  } catch (error) {
    console.error('[ETA-REQUEST] ETA response error:', error);
    res.status(500).json({ error: 'Erreur enregistrement ETA' });
  }
});

// ===========================================
// GET /api/eta-response
// Page de réponse ETA (pour formulaire côté transporteur)
// ===========================================
router.get('/eta-response', async (req, res) => {
  try {
    const { token } = req.query;
    const db = req.db;

    if (!token) {
      return res.status(400).json({ error: 'Token requis' });
    }

    // Trouver la demande
    const etaRequest = await db.collection('eta_requests').findOne({
      responseToken: token,
      expiresAt: { $gt: new Date() }
    });

    if (!etaRequest) {
      return res.status(404).json({ error: 'Demande expirée ou invalide' });
    }

    // Récupérer infos
    const rdv = await db.collection('rdv').findOne({ _id: etaRequest.rdvId });
    const warehouse = await db.collection('warehouses').findOne({ _id: etaRequest.warehouseId });
    const logistician = await db.collection('logisticians').findOne({ _id: etaRequest.logisticianId });

    res.json({
      status: etaRequest.status,
      rdv: {
        id: rdv?._id,
        rdvNumber: rdv?.rdvNumber || `RDV-${etaRequest.rdvId.toString().slice(-6)}`,
        date: rdv?.date,
        slotStart: rdv?.slotStart,
        slotEnd: rdv?.slotEnd,
        type: rdv?.type
      },
      warehouse: {
        name: warehouse?.name,
        address: warehouse?.address?.full || warehouse?.address
      },
      logistician: {
        name: logistician?.companyName
      },
      respondedEta: etaRequest.eta,
      respondedAt: etaRequest.respondedAt
    });

  } catch (error) {
    console.error('[ETA-REQUEST] Get ETA request error:', error);
    res.status(500).json({ error: 'Erreur récupération demande' });
  }
});

export default router;
