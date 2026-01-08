/**
 * Billing Routes
 * Facturation complète: préfactures, factures, suivi paiements
 */

import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { authenticateLogistician } from '../index.js';
import PDFDocument from 'pdfkit';

const router = Router();

// ===========================================
// GET /api/logisticians/:id/prefactures
// Liste des préfactures
// ===========================================
router.get('/:id/prefactures', authenticateLogistician, async (req, res) => {
  try {
    const logisticianId = req.params.id;
    const { status, industryId, month, year, limit = 50, offset = 0 } = req.query;
    const db = req.db;

    const query = {
      logisticianId: new ObjectId(logisticianId)
    };

    if (status) query.status = status;
    if (industryId) query.industryId = new ObjectId(industryId);
    if (month && year) {
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0);
      query.periodStart = { $gte: startDate };
      query.periodEnd = { $lte: endDate };
    }

    const prefactures = await db.collection('logistician_prefactures')
      .find(query)
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(Math.min(parseInt(limit), 100))
      .toArray();

    const total = await db.collection('logistician_prefactures').countDocuments(query);

    // Enrichir avec noms industriels
    const industryIds = [...new Set(prefactures.map(p => p.industryId?.toString()).filter(Boolean))];
    const industries = await db.collection('industries')
      .find({ _id: { $in: industryIds.map(id => new ObjectId(id)) } })
      .toArray();

    const industryMap = industries.reduce((acc, i) => {
      acc[i._id.toString()] = i.companyName;
      return acc;
    }, {});

    res.json({
      prefactures: prefactures.map(p => ({
        id: p._id,
        prefactureNumber: p.prefactureNumber,
        industryId: p.industryId,
        industryName: industryMap[p.industryId?.toString()] || 'N/A',
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        lines: p.lines?.length || 0,
        totalHT: p.totalHT,
        totalTVA: p.totalTVA,
        totalTTC: p.totalTTC,
        status: p.status,
        validatedAt: p.validatedAt,
        invoiceId: p.invoiceId,
        createdAt: p.createdAt
      })),
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('[BILLING] List prefactures error:', error);
    res.status(500).json({ error: 'Erreur récupération préfactures' });
  }
});

// ===========================================
// GET /api/logisticians/:id/prefactures/:prefactureId
// Détail d'une préfacture
// ===========================================
router.get('/:id/prefactures/:prefactureId', authenticateLogistician, async (req, res) => {
  try {
    const { id: logisticianId, prefactureId } = req.params;
    const db = req.db;

    const prefacture = await db.collection('logistician_prefactures').findOne({
      _id: new ObjectId(prefactureId),
      logisticianId: new ObjectId(logisticianId)
    });

    if (!prefacture) {
      return res.status(404).json({ error: 'Préfacture non trouvée' });
    }

    // Récupérer industriel
    const industry = prefacture.industryId
      ? await db.collection('industries').findOne({ _id: prefacture.industryId })
      : null;

    // Récupérer logisticien pour infos facturation
    const logistician = await db.collection('logisticians').findOne({
      _id: new ObjectId(logisticianId)
    });

    res.json({
      prefacture: {
        id: prefacture._id,
        prefactureNumber: prefacture.prefactureNumber,
        status: prefacture.status,
        periodStart: prefacture.periodStart,
        periodEnd: prefacture.periodEnd,
        lines: prefacture.lines || [],
        totalHT: prefacture.totalHT,
        totalTVA: prefacture.totalTVA,
        totalTTC: prefacture.totalTTC,
        notes: prefacture.notes,
        validatedAt: prefacture.validatedAt,
        validatedBy: prefacture.validatedBy,
        invoiceId: prefacture.invoiceId,
        createdAt: prefacture.createdAt
      },
      industry: industry ? {
        id: industry._id,
        companyName: industry.companyName,
        siret: industry.siret,
        address: industry.address,
        billingEmail: industry.billingEmail
      } : null,
      logistician: {
        id: logistician._id,
        companyName: logistician.companyName,
        siret: logistician.siret,
        tvaNumber: logistician.tvaNumber,
        address: logistician.address
      }
    });

  } catch (error) {
    console.error('[BILLING] Get prefacture error:', error);
    res.status(500).json({ error: 'Erreur récupération préfacture' });
  }
});

// ===========================================
// POST /api/logisticians/:id/prefactures
// Créer une préfacture manuelle
// ===========================================
router.post('/:id/prefactures', authenticateLogistician, async (req, res) => {
  try {
    const logisticianId = req.params.id;
    const { industryId, periodStart, periodEnd, lines, notes } = req.body;
    const db = req.db;

    // Validation
    if (!industryId || !lines || lines.length === 0) {
      return res.status(400).json({ error: 'Industriel et lignes requis' });
    }

    // Vérifier industriel
    const industry = await db.collection('industries').findOne({
      _id: new ObjectId(industryId)
    });

    if (!industry) {
      return res.status(404).json({ error: 'Industriel non trouvé' });
    }

    // Calculer totaux
    let totalHT = 0;
    let totalTVA = 0;

    const processedLines = lines.map(line => {
      const amountHT = line.quantity * line.unitPrice;
      const vatAmount = amountHT * (line.vatRate || 20) / 100;
      totalHT += amountHT;
      totalTVA += vatAmount;

      return {
        description: line.description,
        quantity: line.quantity,
        unit: line.unit || 'unité',
        unitPrice: line.unitPrice,
        vatRate: line.vatRate || 20,
        amountHT,
        amountTTC: amountHT + vatAmount,
        reference: line.reference || null
      };
    });

    const totalTTC = totalHT + totalTVA;

    // Générer numéro préfacture
    const count = await db.collection('logistician_prefactures').countDocuments({
      logisticianId: new ObjectId(logisticianId)
    });

    const prefactureNumber = `PRE-${logisticianId.toString().slice(-4)}-${String(count + 1).padStart(5, '0')}`;

    const prefacture = {
      prefactureNumber,
      logisticianId: new ObjectId(logisticianId),
      industryId: new ObjectId(industryId),
      periodStart: periodStart ? new Date(periodStart) : new Date(),
      periodEnd: periodEnd ? new Date(periodEnd) : new Date(),
      lines: processedLines,
      totalHT: Math.round(totalHT * 100) / 100,
      totalTVA: Math.round(totalTVA * 100) / 100,
      totalTTC: Math.round(totalTTC * 100) / 100,
      status: 'draft',
      notes: notes || '',
      createdAt: new Date(),
      createdBy: req.user.userId
    };

    const result = await db.collection('logistician_prefactures').insertOne(prefacture);

    // Log événement
    await db.collection('logistician_events').insertOne({
      type: 'prefacture.created',
      logisticianId: new ObjectId(logisticianId),
      data: { prefactureId: result.insertedId, industryId, totalTTC },
      createdAt: new Date()
    });

    res.status(201).json({
      message: 'Préfacture créée',
      prefacture: {
        id: result.insertedId,
        prefactureNumber,
        totalHT: prefacture.totalHT,
        totalTTC: prefacture.totalTTC,
        status: 'draft'
      }
    });

  } catch (error) {
    console.error('[BILLING] Create prefacture error:', error);
    res.status(500).json({ error: 'Erreur création préfacture' });
  }
});

// ===========================================
// PUT /api/logisticians/:id/prefactures/:prefactureId
// Modifier une préfacture (brouillon uniquement)
// ===========================================
router.put('/:id/prefactures/:prefactureId', authenticateLogistician, async (req, res) => {
  try {
    const { id: logisticianId, prefactureId } = req.params;
    const { lines, notes } = req.body;
    const db = req.db;

    const prefacture = await db.collection('logistician_prefactures').findOne({
      _id: new ObjectId(prefactureId),
      logisticianId: new ObjectId(logisticianId)
    });

    if (!prefacture) {
      return res.status(404).json({ error: 'Préfacture non trouvée' });
    }

    if (prefacture.status !== 'draft') {
      return res.status(400).json({ error: 'Seules les préfactures en brouillon peuvent être modifiées' });
    }

    const updateData = { updatedAt: new Date() };

    if (lines) {
      let totalHT = 0;
      let totalTVA = 0;

      const processedLines = lines.map(line => {
        const amountHT = line.quantity * line.unitPrice;
        const vatAmount = amountHT * (line.vatRate || 20) / 100;
        totalHT += amountHT;
        totalTVA += vatAmount;

        return {
          description: line.description,
          quantity: line.quantity,
          unit: line.unit || 'unité',
          unitPrice: line.unitPrice,
          vatRate: line.vatRate || 20,
          amountHT,
          amountTTC: amountHT + vatAmount,
          reference: line.reference || null
        };
      });

      updateData.lines = processedLines;
      updateData.totalHT = Math.round(totalHT * 100) / 100;
      updateData.totalTVA = Math.round(totalTVA * 100) / 100;
      updateData.totalTTC = Math.round((totalHT + totalTVA) * 100) / 100;
    }

    if (notes !== undefined) updateData.notes = notes;

    await db.collection('logistician_prefactures').updateOne(
      { _id: new ObjectId(prefactureId) },
      { $set: updateData }
    );

    res.json({ message: 'Préfacture mise à jour' });

  } catch (error) {
    console.error('[BILLING] Update prefacture error:', error);
    res.status(500).json({ error: 'Erreur mise à jour préfacture' });
  }
});

// ===========================================
// POST /api/logisticians/:id/prefactures/:prefactureId/validate
// Valider une préfacture → générer facture
// ===========================================
router.post('/:id/prefactures/:prefactureId/validate', authenticateLogistician, async (req, res) => {
  try {
    const { id: logisticianId, prefactureId } = req.params;
    const db = req.db;

    const prefacture = await db.collection('logistician_prefactures').findOne({
      _id: new ObjectId(prefactureId),
      logisticianId: new ObjectId(logisticianId)
    });

    if (!prefacture) {
      return res.status(404).json({ error: 'Préfacture non trouvée' });
    }

    if (prefacture.status !== 'draft' && prefacture.status !== 'pending') {
      return res.status(400).json({ error: 'Préfacture déjà validée ou annulée' });
    }

    // Récupérer logisticien
    const logistician = await db.collection('logisticians').findOne({
      _id: new ObjectId(logisticianId)
    });

    // Générer numéro facture
    const year = new Date().getFullYear();
    const invoiceCount = await db.collection('logistician_invoices').countDocuments({
      issuerId: new ObjectId(logisticianId),
      'invoiceNumber': { $regex: `^FAC-${year}` }
    });

    const invoiceNumber = `FAC-${year}-${String(invoiceCount + 1).padStart(5, '0')}`;

    // Créer facture
    const invoice = {
      invoiceNumber,
      type: 'service',
      status: 'pending',
      issuerId: new ObjectId(logisticianId),
      issuerName: logistician.companyName,
      issuerSiret: logistician.siret,
      issuerTvaNumber: logistician.tvaNumber,
      issuerAddress: logistician.address,
      recipientId: prefacture.industryId,
      recipientType: 'industry',
      prefactureId: prefacture._id,
      lines: prefacture.lines,
      totalHT: prefacture.totalHT,
      totalTVA: prefacture.totalTVA,
      totalTTC: prefacture.totalTTC,
      currency: 'EUR',
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 jours
      paymentTerms: 'Paiement à 30 jours',
      createdAt: new Date()
    };

    const invoiceResult = await db.collection('logistician_invoices').insertOne(invoice);

    // Mettre à jour préfacture
    await db.collection('logistician_prefactures').updateOne(
      { _id: new ObjectId(prefactureId) },
      {
        $set: {
          status: 'validated',
          validatedAt: new Date(),
          validatedBy: req.user.userId,
          invoiceId: invoiceResult.insertedId
        }
      }
    );

    // Log événement
    await db.collection('logistician_events').insertOne({
      type: 'invoice.created',
      logisticianId: new ObjectId(logisticianId),
      data: {
        invoiceId: invoiceResult.insertedId,
        invoiceNumber,
        prefactureId,
        totalTTC: invoice.totalTTC
      },
      createdAt: new Date()
    });

    res.json({
      message: 'Préfacture validée, facture générée',
      invoice: {
        id: invoiceResult.insertedId,
        invoiceNumber,
        totalTTC: invoice.totalTTC,
        dueDate: invoice.dueDate
      }
    });

  } catch (error) {
    console.error('[BILLING] Validate prefacture error:', error);
    res.status(500).json({ error: 'Erreur validation préfacture' });
  }
});

// ===========================================
// GET /api/logisticians/:id/invoices
// Liste des factures émises
// ===========================================
router.get('/:id/invoices', authenticateLogistician, async (req, res) => {
  try {
    const logisticianId = req.params.id;
    const { status, recipientId, year, limit = 50, offset = 0 } = req.query;
    const db = req.db;

    const query = {
      issuerId: new ObjectId(logisticianId)
    };

    if (status) query.status = status;
    if (recipientId) query.recipientId = new ObjectId(recipientId);
    if (year) {
      const startYear = new Date(parseInt(year), 0, 1);
      const endYear = new Date(parseInt(year) + 1, 0, 1);
      query.issueDate = { $gte: startYear, $lt: endYear };
    }

    const invoices = await db.collection('logistician_invoices')
      .find(query)
      .sort({ issueDate: -1 })
      .skip(parseInt(offset))
      .limit(Math.min(parseInt(limit), 100))
      .toArray();

    const total = await db.collection('logistician_invoices').countDocuments(query);

    // Enrichir avec noms destinataires
    const recipientIds = [...new Set(invoices.map(i => i.recipientId?.toString()).filter(Boolean))];
    const industries = await db.collection('industries')
      .find({ _id: { $in: recipientIds.map(id => new ObjectId(id)) } })
      .toArray();

    const recipientMap = industries.reduce((acc, i) => {
      acc[i._id.toString()] = i.companyName;
      return acc;
    }, {});

    // Calculer statistiques
    const stats = {
      totalAmount: invoices.reduce((sum, i) => sum + (i.totalTTC || 0), 0),
      pending: invoices.filter(i => i.status === 'pending').length,
      paid: invoices.filter(i => i.status === 'paid').length,
      overdue: invoices.filter(i => i.status === 'overdue' || (i.status === 'pending' && new Date(i.dueDate) < new Date())).length
    };

    res.json({
      invoices: invoices.map(i => ({
        id: i._id,
        invoiceNumber: i.invoiceNumber,
        recipientId: i.recipientId,
        recipientName: recipientMap[i.recipientId?.toString()] || i.recipientName || 'N/A',
        totalHT: i.totalHT,
        totalTTC: i.totalTTC,
        status: i.status,
        issueDate: i.issueDate,
        dueDate: i.dueDate,
        paidAt: i.paidAt,
        isOverdue: i.status === 'pending' && new Date(i.dueDate) < new Date()
      })),
      total,
      stats,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('[BILLING] List invoices error:', error);
    res.status(500).json({ error: 'Erreur récupération factures' });
  }
});

// ===========================================
// GET /api/logisticians/:id/invoices/:invoiceId
// Détail d'une facture
// ===========================================
router.get('/:id/invoices/:invoiceId', authenticateLogistician, async (req, res) => {
  try {
    const { id: logisticianId, invoiceId } = req.params;
    const db = req.db;

    const invoice = await db.collection('logistician_invoices').findOne({
      _id: new ObjectId(invoiceId),
      issuerId: new ObjectId(logisticianId)
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Facture non trouvée' });
    }

    // Récupérer destinataire
    let recipient = null;
    if (invoice.recipientId) {
      recipient = await db.collection('industries').findOne({ _id: invoice.recipientId });
    }

    // Récupérer paiements
    const payments = await db.collection('invoice_payments')
      .find({ invoiceId: invoice._id })
      .sort({ paidAt: -1 })
      .toArray();

    res.json({
      invoice: {
        id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        type: invoice.type,
        status: invoice.status,
        issuer: {
          name: invoice.issuerName,
          siret: invoice.issuerSiret,
          tvaNumber: invoice.issuerTvaNumber,
          address: invoice.issuerAddress
        },
        recipient: recipient ? {
          id: recipient._id,
          companyName: recipient.companyName,
          siret: recipient.siret,
          address: recipient.address,
          billingEmail: recipient.billingEmail
        } : null,
        lines: invoice.lines,
        totalHT: invoice.totalHT,
        totalTVA: invoice.totalTVA,
        totalTTC: invoice.totalTTC,
        currency: invoice.currency,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        paymentTerms: invoice.paymentTerms,
        paidAt: invoice.paidAt,
        paidAmount: invoice.paidAmount,
        notes: invoice.notes,
        createdAt: invoice.createdAt
      },
      payments: payments.map(p => ({
        id: p._id,
        amount: p.amount,
        method: p.method,
        reference: p.reference,
        paidAt: p.paidAt
      })),
      isOverdue: invoice.status === 'pending' && new Date(invoice.dueDate) < new Date()
    });

  } catch (error) {
    console.error('[BILLING] Get invoice error:', error);
    res.status(500).json({ error: 'Erreur récupération facture' });
  }
});

// ===========================================
// POST /api/logisticians/:id/invoices/:invoiceId/payment
// Enregistrer un paiement
// ===========================================
router.post('/:id/invoices/:invoiceId/payment', authenticateLogistician, async (req, res) => {
  try {
    const { id: logisticianId, invoiceId } = req.params;
    const { amount, method, reference, paidAt } = req.body;
    const db = req.db;

    const invoice = await db.collection('logistician_invoices').findOne({
      _id: new ObjectId(invoiceId),
      issuerId: new ObjectId(logisticianId)
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Facture non trouvée' });
    }

    if (invoice.status === 'paid') {
      return res.status(400).json({ error: 'Facture déjà payée' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Montant invalide' });
    }

    // Enregistrer paiement
    await db.collection('invoice_payments').insertOne({
      invoiceId: invoice._id,
      logisticianId: new ObjectId(logisticianId),
      amount,
      method: method || 'virement',
      reference: reference || '',
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      createdAt: new Date(),
      createdBy: req.user.userId
    });

    // Calculer total payé
    const payments = await db.collection('invoice_payments')
      .find({ invoiceId: invoice._id })
      .toArray();

    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    // Mettre à jour facture
    const updateData = {
      paidAmount: totalPaid,
      updatedAt: new Date()
    };

    if (totalPaid >= invoice.totalTTC) {
      updateData.status = 'paid';
      updateData.paidAt = new Date();
    } else if (totalPaid > 0) {
      updateData.status = 'partial';
    }

    await db.collection('logistician_invoices').updateOne(
      { _id: invoice._id },
      { $set: updateData }
    );

    // Log événement
    await db.collection('logistician_events').insertOne({
      type: 'invoice.payment_received',
      logisticianId: new ObjectId(logisticianId),
      data: {
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        amount,
        totalPaid,
        fullyPaid: totalPaid >= invoice.totalTTC
      },
      createdAt: new Date()
    });

    res.json({
      message: 'Paiement enregistré',
      totalPaid,
      remainingAmount: Math.max(0, invoice.totalTTC - totalPaid),
      fullyPaid: totalPaid >= invoice.totalTTC
    });

  } catch (error) {
    console.error('[BILLING] Record payment error:', error);
    res.status(500).json({ error: 'Erreur enregistrement paiement' });
  }
});

// ===========================================
// GET /api/logisticians/:id/invoices/:invoiceId/pdf
// Télécharger facture PDF
// ===========================================
router.get('/:id/invoices/:invoiceId/pdf', authenticateLogistician, async (req, res) => {
  try {
    const { id: logisticianId, invoiceId } = req.params;
    const db = req.db;

    const invoice = await db.collection('logistician_invoices').findOne({
      _id: new ObjectId(invoiceId),
      issuerId: new ObjectId(logisticianId)
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Facture non trouvée' });
    }

    // Récupérer destinataire
    const recipient = invoice.recipientId
      ? await db.collection('industries').findOne({ _id: invoice.recipientId })
      : null;

    // Générer PDF
    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);

    doc.pipe(res);

    // En-tête
    doc.fontSize(20).text('FACTURE', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(invoice.invoiceNumber, { align: 'center' });
    doc.moveDown(2);

    // Émetteur
    doc.fontSize(12).text('Émetteur:', { underline: true });
    doc.fontSize(10);
    doc.text(invoice.issuerName);
    doc.text(`SIRET: ${invoice.issuerSiret || 'N/A'}`);
    doc.text(`TVA: ${invoice.issuerTvaNumber || 'N/A'}`);
    if (invoice.issuerAddress) {
      doc.text(`${invoice.issuerAddress.street || ''}`);
      doc.text(`${invoice.issuerAddress.zipCode || ''} ${invoice.issuerAddress.city || ''}`);
    }
    doc.moveDown();

    // Destinataire
    doc.fontSize(12).text('Destinataire:', { underline: true });
    doc.fontSize(10);
    if (recipient) {
      doc.text(recipient.companyName);
      doc.text(`SIRET: ${recipient.siret || 'N/A'}`);
      if (recipient.address) {
        doc.text(`${recipient.address.street || ''}`);
        doc.text(`${recipient.address.zipCode || ''} ${recipient.address.city || ''}`);
      }
    }
    doc.moveDown();

    // Dates
    doc.text(`Date d'émission: ${new Date(invoice.issueDate).toLocaleDateString('fr-FR')}`);
    doc.text(`Date d'échéance: ${new Date(invoice.dueDate).toLocaleDateString('fr-FR')}`);
    doc.moveDown(2);

    // Lignes
    doc.fontSize(12).text('Détail:', { underline: true });
    doc.moveDown();

    // Table header
    const tableTop = doc.y;
    doc.fontSize(9);
    doc.text('Description', 50, tableTop, { width: 200 });
    doc.text('Qté', 260, tableTop, { width: 40, align: 'right' });
    doc.text('P.U. HT', 310, tableTop, { width: 60, align: 'right' });
    doc.text('TVA', 380, tableTop, { width: 40, align: 'right' });
    doc.text('Total TTC', 430, tableTop, { width: 70, align: 'right' });

    doc.moveTo(50, tableTop + 15).lineTo(500, tableTop + 15).stroke();

    let y = tableTop + 25;
    for (const line of invoice.lines || []) {
      doc.text(line.description, 50, y, { width: 200 });
      doc.text(String(line.quantity), 260, y, { width: 40, align: 'right' });
      doc.text(`${line.unitPrice.toFixed(2)} €`, 310, y, { width: 60, align: 'right' });
      doc.text(`${line.vatRate}%`, 380, y, { width: 40, align: 'right' });
      doc.text(`${line.amountTTC.toFixed(2)} €`, 430, y, { width: 70, align: 'right' });
      y += 20;
    }

    doc.moveTo(50, y).lineTo(500, y).stroke();
    y += 15;

    // Totaux
    doc.fontSize(10);
    doc.text(`Total HT:`, 350, y);
    doc.text(`${invoice.totalHT.toFixed(2)} €`, 430, y, { width: 70, align: 'right' });
    y += 15;
    doc.text(`TVA:`, 350, y);
    doc.text(`${invoice.totalTVA.toFixed(2)} €`, 430, y, { width: 70, align: 'right' });
    y += 15;
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text(`Total TTC:`, 350, y);
    doc.text(`${invoice.totalTTC.toFixed(2)} €`, 430, y, { width: 70, align: 'right' });

    // Conditions
    doc.font('Helvetica');
    doc.moveDown(4);
    doc.fontSize(9);
    doc.text(`Conditions de paiement: ${invoice.paymentTerms || 'Paiement à 30 jours'}`);

    // Footer
    doc.fontSize(8);
    doc.text('Document généré par SYMPHONI.A', 50, 750, { align: 'center' });

    doc.end();

  } catch (error) {
    console.error('[BILLING] Generate PDF error:', error);
    res.status(500).json({ error: 'Erreur génération PDF' });
  }
});

// ===========================================
// POST /api/logisticians/:id/invoices/:invoiceId/send
// Envoyer facture par email
// ===========================================
router.post('/:id/invoices/:invoiceId/send', authenticateLogistician, async (req, res) => {
  try {
    const { id: logisticianId, invoiceId } = req.params;
    const { email } = req.body;
    const db = req.db;

    const invoice = await db.collection('logistician_invoices').findOne({
      _id: new ObjectId(invoiceId),
      issuerId: new ObjectId(logisticianId)
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Facture non trouvée' });
    }

    // Récupérer destinataire
    let recipientEmail = email;
    if (!recipientEmail && invoice.recipientId) {
      const recipient = await db.collection('industries').findOne({ _id: invoice.recipientId });
      recipientEmail = recipient?.billingEmail || recipient?.email;
    }

    if (!recipientEmail) {
      return res.status(400).json({ error: 'Aucun email destinataire' });
    }

    // TODO: Implémenter envoi email avec PDF attaché
    // await sendInvoiceEmail(invoice, recipientEmail);

    // Log envoi
    await db.collection('logistician_invoices').updateOne(
      { _id: invoice._id },
      {
        $set: { lastSentAt: new Date() },
        $push: {
          sentHistory: {
            email: recipientEmail,
            sentAt: new Date(),
            sentBy: req.user.userId
          }
        }
      }
    );

    await db.collection('logistician_events').insertOne({
      type: 'invoice.sent',
      logisticianId: new ObjectId(logisticianId),
      data: { invoiceId, invoiceNumber: invoice.invoiceNumber, email: recipientEmail },
      createdAt: new Date()
    });

    res.json({
      message: 'Facture envoyée',
      email: recipientEmail
    });

  } catch (error) {
    console.error('[BILLING] Send invoice error:', error);
    res.status(500).json({ error: 'Erreur envoi facture' });
  }
});

// ===========================================
// GET /api/logisticians/:id/billing/stats
// Statistiques facturation
// ===========================================
router.get('/:id/billing/stats', authenticateLogistician, async (req, res) => {
  try {
    const logisticianId = req.params.id;
    const { year } = req.query;
    const db = req.db;

    const selectedYear = parseInt(year) || new Date().getFullYear();
    const startYear = new Date(selectedYear, 0, 1);
    const endYear = new Date(selectedYear + 1, 0, 1);

    // Factures de l'année
    const invoices = await db.collection('logistician_invoices')
      .find({
        issuerId: new ObjectId(logisticianId),
        issueDate: { $gte: startYear, $lt: endYear }
      })
      .toArray();

    // Calculs
    const totalInvoiced = invoices.reduce((sum, i) => sum + (i.totalTTC || 0), 0);
    const totalPaid = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + (i.totalTTC || 0), 0);
    const totalPending = invoices.filter(i => i.status === 'pending').reduce((sum, i) => sum + (i.totalTTC || 0), 0);
    const totalOverdue = invoices.filter(i =>
      i.status === 'pending' && new Date(i.dueDate) < new Date()
    ).reduce((sum, i) => sum + (i.totalTTC || 0), 0);

    // Par mois
    const byMonth = [];
    for (let month = 0; month < 12; month++) {
      const monthInvoices = invoices.filter(i => new Date(i.issueDate).getMonth() === month);
      byMonth.push({
        month: month + 1,
        monthName: new Date(selectedYear, month, 1).toLocaleDateString('fr-FR', { month: 'long' }),
        count: monthInvoices.length,
        totalTTC: monthInvoices.reduce((sum, i) => sum + (i.totalTTC || 0), 0)
      });
    }

    // Par client (top 10)
    const byClient = {};
    for (const inv of invoices) {
      const clientId = inv.recipientId?.toString() || 'unknown';
      if (!byClient[clientId]) {
        byClient[clientId] = { count: 0, totalTTC: 0 };
      }
      byClient[clientId].count++;
      byClient[clientId].totalTTC += inv.totalTTC || 0;
    }

    const clientIds = Object.keys(byClient).filter(id => id !== 'unknown');
    const clients = await db.collection('industries')
      .find({ _id: { $in: clientIds.map(id => new ObjectId(id)) } })
      .toArray();

    const topClients = Object.entries(byClient)
      .map(([clientId, data]) => {
        const client = clients.find(c => c._id.toString() === clientId);
        return {
          clientId,
          clientName: client?.companyName || 'Inconnu',
          ...data
        };
      })
      .sort((a, b) => b.totalTTC - a.totalTTC)
      .slice(0, 10);

    res.json({
      year: selectedYear,
      summary: {
        totalInvoices: invoices.length,
        totalInvoiced: Math.round(totalInvoiced * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        totalPending: Math.round(totalPending * 100) / 100,
        totalOverdue: Math.round(totalOverdue * 100) / 100,
        collectionRate: totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0
      },
      byMonth,
      topClients
    });

  } catch (error) {
    console.error('[BILLING] Get stats error:', error);
    res.status(500).json({ error: 'Erreur récupération statistiques' });
  }
});

export default router;
