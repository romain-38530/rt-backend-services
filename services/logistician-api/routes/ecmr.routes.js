/**
 * Routes e-CMR - Gestion des lettres de voiture électroniques
 * Logistician API - SYMPHONI.A
 */

import express from 'express';
import { ObjectId } from 'mongodb';
import { generateECMRPdf } from '../utils/ecmr-pdf.js';

const router = express.Router();

// Middleware d'authentification
const authenticateLogistician = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token manquant' });
    }
    // Pour simplifier, on passe - en prod, vérifier le JWT
    next();
  } catch (error) {
    res.status(401).json({ error: 'Non autorisé' });
  }
};

// GET /api/ecmr - Liste des e-CMR
router.get('/ecmr', authenticateLogistician, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { status, date, search, limit = 50 } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: startOfDay, $lte: endOfDay };
    }

    if (search) {
      query.$or = [
        { cmrNumber: { $regex: search, $options: 'i' } },
        { 'carrier.name': { $regex: search, $options: 'i' } },
        { 'recipient.name': { $regex: search, $options: 'i' } },
        { orderRef: { $regex: search, $options: 'i' } }
      ];
    }

    const documents = await db.collection('ecmr_documents')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .toArray();

    res.json({ documents, total: documents.length });
  } catch (error) {
    console.error('Error fetching e-CMR:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/ecmr/:id - Détail d'un e-CMR
router.get('/ecmr/:id', authenticateLogistician, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    let document;
    try {
      document = await db.collection('ecmr_documents').findOne({ _id: new ObjectId(id) });
    } catch {
      document = await db.collection('ecmr_documents').findOne({ cmrNumber: id });
    }

    if (!document) {
      return res.status(404).json({ error: 'e-CMR non trouvé' });
    }

    res.json(document);
  } catch (error) {
    console.error('Error fetching e-CMR:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/ecmr - Créer un e-CMR
router.post('/ecmr', authenticateLogistician, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { orderId, orderRef, sender, carrier, recipient, goods, pickupDate, deliveryDate } = req.body;

    // Générer le numéro CMR
    const count = await db.collection('ecmr_documents').countDocuments();
    const cmrNumber = `CMR-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    const newDocument = {
      cmrNumber,
      orderId: orderId || null,
      orderRef: orderRef || null,
      status: 'draft',
      sender: sender || { name: '', address: '', city: '', country: 'France' },
      carrier: carrier || { name: '', address: '', vehiclePlate: '', driverName: '' },
      recipient: recipient || { name: '', address: '', city: '', country: 'France' },
      goods: goods || { description: '', quantity: 0, weight: 0, packaging: 'Palettes', pallets: 0 },
      pickupDate: pickupDate ? new Date(pickupDate) : null,
      deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
      signatures: {},
      reservations: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('ecmr_documents').insertOne(newDocument);
    newDocument._id = result.insertedId;

    res.status(201).json(newDocument);
  } catch (error) {
    console.error('Error creating e-CMR:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/ecmr/:id - Mettre à jour un e-CMR
router.put('/ecmr/:id', authenticateLogistician, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;
    const updates = req.body;

    delete updates._id;
    delete updates.cmrNumber;
    updates.updatedAt = new Date();

    const result = await db.collection('ecmr_documents').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updates },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({ error: 'e-CMR non trouvé' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error updating e-CMR:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/ecmr/:id/sign - Signer un e-CMR
router.post('/ecmr/:id/sign', authenticateLogistician, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { type, signatureData, name } = req.body;

    if (!['sender', 'carrier', 'recipient'].includes(type)) {
      return res.status(400).json({ error: 'Type de signature invalide' });
    }

    const signature = {
      name,
      date: new Date().toISOString(),
      signature: signatureData,
      ip: req.ip || req.connection?.remoteAddress
    };

    // Déterminer le nouveau statut
    let newStatus;
    if (type === 'sender') newStatus = 'pending_carrier';
    else if (type === 'carrier') newStatus = 'pending_recipient';
    else if (type === 'recipient') newStatus = 'completed';

    const result = await db.collection('ecmr_documents').findOneAndUpdate(
      { _id: new ObjectId(id) },
      {
        $set: {
          [`signatures.${type}`]: signature,
          status: newStatus,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({ error: 'e-CMR non trouvé' });
    }

    res.json({ success: true, document: result });
  } catch (error) {
    console.error('Error signing e-CMR:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/ecmr/:id/reservations - Ajouter une réserve
router.post('/ecmr/:id/reservations', authenticateLogistician, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { type, description, photo, createdBy } = req.body;

    const reservation = {
      type: type || 'other',
      description,
      photo: photo || null,
      createdAt: new Date().toISOString(),
      createdBy: createdBy || 'Utilisateur'
    };

    const result = await db.collection('ecmr_documents').findOneAndUpdate(
      { _id: new ObjectId(id) },
      {
        $push: { reservations: reservation },
        $set: { status: 'disputed', updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({ error: 'e-CMR non trouvé' });
    }

    res.json({ success: true, document: result });
  } catch (error) {
    console.error('Error adding reservation:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/ecmr/:id/pdf - Télécharger le PDF
router.get('/ecmr/:id/pdf', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    let document;
    try {
      document = await db.collection('ecmr_documents').findOne({ _id: new ObjectId(id) });
    } catch {
      document = await db.collection('ecmr_documents').findOne({ cmrNumber: id });
    }

    if (!document) {
      return res.status(404).json({ error: 'e-CMR non trouvé' });
    }

    // Générer le PDF
    const pdfBuffer = await generateECMRPdf(document, {
      baseUrl: process.env.LOGISTICIAN_PORTAL_URL || 'https://logisticien.symphonia-controltower.com',
      includeQRCode: true
    });

    // Envoyer le PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${document.cmrNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Erreur lors de la génération du PDF', details: error.message });
  }
});

// GET /api/ecmr/:cmrNumber/verify - Vérifier l'authenticité d'un e-CMR
router.get('/ecmr/:cmrNumber/verify', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { cmrNumber } = req.params;

    const document = await db.collection('ecmr_documents').findOne({ cmrNumber });

    if (!document) {
      return res.status(404).json({
        valid: false,
        error: 'e-CMR non trouvé'
      });
    }

    res.json({
      valid: true,
      cmrNumber: document.cmrNumber,
      status: document.status,
      createdAt: document.createdAt,
      signatures: {
        sender: !!document.signatures?.sender,
        carrier: !!document.signatures?.carrier,
        recipient: !!document.signatures?.recipient
      },
      hasReservations: document.reservations?.length > 0
    });
  } catch (error) {
    console.error('Error verifying e-CMR:', error);
    res.status(500).json({ valid: false, error: 'Erreur serveur' });
  }
});

export default router;
