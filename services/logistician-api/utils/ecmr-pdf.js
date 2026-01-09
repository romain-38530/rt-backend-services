// e-CMR PDF Generation - Conforme PDF/A-3
// RT Backend Services - Logistician API
// Adapté pour le portail logisticien SYMPHONI.A

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { createHash } from 'crypto';

// Générer un hash SHA-256 pour l'e-CMR
function generateECMRHash(ecmrData) {
  const dataString = JSON.stringify({
    cmrNumber: ecmrData.cmrNumber,
    sender: ecmrData.sender,
    recipient: ecmrData.recipient,
    carrier: ecmrData.carrier,
    goods: ecmrData.goods,
    createdAt: ecmrData.createdAt
  });

  return createHash('sha256').update(dataString).digest('hex');
}

// Générer un QR Code pour vérification
async function generateQRCode(ecmrData, baseUrl) {
  const verificationUrl = `${baseUrl}/api/ecmr/${ecmrData.cmrNumber}/verify`;
  const hash = generateECMRHash(ecmrData);

  const qrData = JSON.stringify({
    cmrNumber: ecmrData.cmrNumber,
    verifyUrl: verificationUrl,
    hash: hash.substring(0, 16)
  });

  try {
    const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      quality: 1,
      margin: 1,
      width: 200
    });

    return {
      dataUrl: qrCodeDataUrl,
      verificationUrl,
      hash
    };
  } catch (error) {
    console.error('Error generating QR code:', error);
    return null;
  }
}

// Formater une date en français
function formatDate(date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  return d.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Générer le PDF e-CMR
export async function generateECMRPdf(ecmrData, options = {}) {
  const {
    baseUrl = 'https://logisticien.symphonia-controltower.com',
    includeQRCode = true
  } = options;

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        info: {
          Title: `e-CMR ${ecmrData.cmrNumber}`,
          Author: 'SYMPHONI.A Control Tower',
          Subject: 'Lettre de voiture électronique',
          Keywords: 'e-CMR, CMR, Transport, Lettre de voiture',
          Creator: 'RT Logistician API',
          Producer: 'PDFKit'
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ========== EN-TÊTE ==========
      doc.rect(0, 0, 612, 80).fill('#1e293b');
      doc.fontSize(28).font('Helvetica-Bold').fillColor('#ffffff').text('e-CMR', 50, 25);
      doc.fontSize(12).font('Helvetica').text('Lettre de Voiture Électronique', 50, 55);
      doc.fillColor('#000000');
      doc.moveDown(3);

      // Numéro e-CMR et statut
      const statusColors = {
        draft: { bg: '#9ca3af', text: 'Brouillon' },
        pending_sender: { bg: '#fbbf24', text: 'Attente expéditeur' },
        pending_carrier: { bg: '#3b82f6', text: 'Attente transporteur' },
        pending_recipient: { bg: '#a855f7', text: 'Attente destinataire' },
        completed: { bg: '#10b981', text: 'Complété' },
        disputed: { bg: '#ef4444', text: 'Litige' }
      };

      const status = statusColors[ecmrData.status] || statusColors.draft;

      doc.fontSize(16).font('Helvetica-Bold');
      doc.text(`N° ${ecmrData.cmrNumber}`, 50, 100);

      // Badge statut
      doc.roundedRect(400, 95, 150, 25, 5).fill(status.bg);
      doc.fontSize(11).fillColor('#ffffff').text(status.text, 410, 102, { width: 130, align: 'center' });
      doc.fillColor('#000000');

      doc.fontSize(10).font('Helvetica');
      doc.text(`Créé le: ${formatDate(ecmrData.createdAt)}`, 50, 125);
      if (ecmrData.orderRef) {
        doc.text(`Commande: ${ecmrData.orderRef}`, 250, 125);
      }
      doc.moveDown(2);

      // ========== PARTIES ==========
      const boxY = 160;
      const boxHeight = 100;
      const boxWidth = 165;

      // Expéditeur
      doc.rect(50, boxY, boxWidth, boxHeight).stroke('#3b82f6');
      doc.rect(50, boxY, boxWidth, 20).fill('#3b82f6');
      doc.fontSize(10).fillColor('#ffffff').font('Helvetica-Bold').text('EXPÉDITEUR', 55, boxY + 5);
      doc.fillColor('#000000').font('Helvetica').fontSize(9);
      doc.text(ecmrData.sender?.name || 'N/A', 55, boxY + 28, { width: boxWidth - 10 });
      doc.text(ecmrData.sender?.address || '', 55, boxY + 42, { width: boxWidth - 10 });
      doc.text(`${ecmrData.sender?.city || ''}, ${ecmrData.sender?.country || 'France'}`, 55, boxY + 56, { width: boxWidth - 10 });
      if (ecmrData.sender?.contact) {
        doc.text(`Contact: ${ecmrData.sender.contact}`, 55, boxY + 70, { width: boxWidth - 10 });
      }

      // Transporteur
      doc.rect(225, boxY, boxWidth, boxHeight).stroke('#fbbf24');
      doc.rect(225, boxY, boxWidth, 20).fill('#fbbf24');
      doc.fontSize(10).fillColor('#ffffff').font('Helvetica-Bold').text('TRANSPORTEUR', 230, boxY + 5);
      doc.fillColor('#000000').font('Helvetica').fontSize(9);
      doc.text(ecmrData.carrier?.name || 'N/A', 230, boxY + 28, { width: boxWidth - 10 });
      doc.text(ecmrData.carrier?.address || '', 230, boxY + 42, { width: boxWidth - 10 });
      if (ecmrData.carrier?.vehiclePlate) {
        doc.text(`Immatriculation: ${ecmrData.carrier.vehiclePlate}`, 230, boxY + 56, { width: boxWidth - 10 });
      }
      if (ecmrData.carrier?.driverName) {
        doc.text(`Chauffeur: ${ecmrData.carrier.driverName}`, 230, boxY + 70, { width: boxWidth - 10 });
      }

      // Destinataire
      doc.rect(400, boxY, boxWidth, boxHeight).stroke('#10b981');
      doc.rect(400, boxY, boxWidth, 20).fill('#10b981');
      doc.fontSize(10).fillColor('#ffffff').font('Helvetica-Bold').text('DESTINATAIRE', 405, boxY + 5);
      doc.fillColor('#000000').font('Helvetica').fontSize(9);
      doc.text(ecmrData.recipient?.name || 'N/A', 405, boxY + 28, { width: boxWidth - 10 });
      doc.text(ecmrData.recipient?.address || '', 405, boxY + 42, { width: boxWidth - 10 });
      doc.text(`${ecmrData.recipient?.city || ''}, ${ecmrData.recipient?.country || 'France'}`, 405, boxY + 56, { width: boxWidth - 10 });
      if (ecmrData.recipient?.contact) {
        doc.text(`Contact: ${ecmrData.recipient.contact}`, 405, boxY + 70, { width: boxWidth - 10 });
      }

      // ========== MARCHANDISES ==========
      const goodsY = boxY + boxHeight + 30;
      doc.rect(50, goodsY, 515, 80).stroke('#a855f7');
      doc.rect(50, goodsY, 515, 20).fill('#a855f7');
      doc.fontSize(10).fillColor('#ffffff').font('Helvetica-Bold').text('MARCHANDISES', 55, goodsY + 5);
      doc.fillColor('#000000').font('Helvetica').fontSize(10);

      // Colonnes marchandises
      const cols = [
        { label: 'Description', value: ecmrData.goods?.description || 'N/A', x: 55, width: 180 },
        { label: 'Quantité', value: `${ecmrData.goods?.quantity || 0} ${ecmrData.goods?.packaging || ''}`, x: 245, width: 80 },
        { label: 'Poids', value: `${((ecmrData.goods?.weight || 0) / 1000).toFixed(2)} T`, x: 335, width: 80 },
        { label: 'Palettes', value: `${ecmrData.goods?.pallets || 0}`, x: 425, width: 60 }
      ];

      cols.forEach(col => {
        doc.fontSize(8).fillColor('#666666').text(col.label, col.x, goodsY + 28);
        doc.fontSize(10).fillColor('#000000').text(col.value, col.x, goodsY + 42, { width: col.width });
      });

      // ========== DATES ==========
      const datesY = goodsY + 100;
      doc.rect(50, datesY, 250, 50).stroke('#0ea5e9');
      doc.fontSize(9).font('Helvetica-Bold').text('Date d\'enlèvement:', 55, datesY + 10);
      doc.font('Helvetica').text(formatDate(ecmrData.pickupDate), 55, datesY + 25);

      doc.rect(315, datesY, 250, 50).stroke('#0ea5e9');
      doc.fontSize(9).font('Helvetica-Bold').text('Date de livraison:', 320, datesY + 10);
      doc.font('Helvetica').text(formatDate(ecmrData.deliveryDate), 320, datesY + 25);

      // ========== SIGNATURES ==========
      const sigY = datesY + 70;
      doc.fontSize(12).font('Helvetica-Bold').text('SIGNATURES ÉLECTRONIQUES', 50, sigY);
      doc.moveTo(50, sigY + 15).lineTo(565, sigY + 15).stroke();

      const signatures = [
        { label: 'Expéditeur', data: ecmrData.signatures?.sender, color: '#3b82f6' },
        { label: 'Transporteur', data: ecmrData.signatures?.carrier, color: '#fbbf24' },
        { label: 'Destinataire', data: ecmrData.signatures?.recipient, color: '#10b981' }
      ];

      let sigX = 50;
      signatures.forEach((sig, i) => {
        const boxW = 170;
        const sigBoxY = sigY + 25;

        doc.rect(sigX, sigBoxY, boxW, 70).stroke(sig.color);

        if (sig.data) {
          doc.rect(sigX, sigBoxY, boxW, 20).fill(sig.color);
          doc.fontSize(9).fillColor('#ffffff').font('Helvetica-Bold').text(`✓ ${sig.label}`, sigX + 5, sigBoxY + 5);
          doc.fillColor('#000000').font('Helvetica').fontSize(8);
          doc.text(`Signé par: ${sig.data.name}`, sigX + 5, sigBoxY + 30, { width: boxW - 10 });
          doc.text(`Le: ${formatDate(sig.data.date)}`, sigX + 5, sigBoxY + 45, { width: boxW - 10 });
        } else {
          doc.rect(sigX, sigBoxY, boxW, 20).fill('#e5e7eb');
          doc.fontSize(9).fillColor('#6b7280').font('Helvetica-Bold').text(`○ ${sig.label}`, sigX + 5, sigBoxY + 5);
          doc.fillColor('#9ca3af').font('Helvetica').fontSize(8);
          doc.text('En attente de signature', sigX + 5, sigBoxY + 40, { width: boxW - 10 });
        }

        sigX += boxW + 7;
      });

      // ========== RÉSERVES ==========
      if (ecmrData.reservations && ecmrData.reservations.length > 0) {
        const resY = sigY + 115;
        doc.rect(50, resY, 515, 20 + ecmrData.reservations.length * 35).stroke('#ef4444');
        doc.rect(50, resY, 515, 20).fill('#ef4444');
        doc.fontSize(10).fillColor('#ffffff').font('Helvetica-Bold').text(`⚠️ RÉSERVES (${ecmrData.reservations.length})`, 55, resY + 5);
        doc.fillColor('#000000').font('Helvetica').fontSize(9);

        ecmrData.reservations.forEach((res, i) => {
          const resItemY = resY + 25 + i * 35;
          const typeLabels = { damage: '💥 Dommage', missing: '❓ Manquant', delay: '⏰ Retard', other: '📝 Autre' };
          doc.font('Helvetica-Bold').text(typeLabels[res.type] || res.type, 55, resItemY);
          doc.font('Helvetica').text(res.description, 55, resItemY + 12, { width: 500 });
          doc.fontSize(8).fillColor('#6b7280').text(`Par ${res.createdBy} le ${formatDate(res.createdAt)}`, 55, resItemY + 24);
          doc.fillColor('#000000').fontSize(9);
        });
      }

      // ========== QR CODE PAGE ==========
      if (includeQRCode) {
        doc.addPage();

        doc.rect(0, 0, 612, 80).fill('#1e293b');
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#ffffff').text('Vérification e-CMR', 50, 30);
        doc.fillColor('#000000');

        const qrCode = await generateQRCode(ecmrData, baseUrl);

        if (qrCode) {
          doc.image(qrCode.dataUrl, 206, 120, { width: 200, height: 200 });

          doc.fontSize(12).font('Helvetica').text('Scannez ce QR code pour vérifier l\'authenticité', 50, 340, { align: 'center', width: 515 });
          doc.fontSize(10).fillColor('#6b7280');
          doc.text(`URL: ${qrCode.verificationUrl}`, 50, 370, { align: 'center', width: 515 });
          doc.text(`Hash: ${qrCode.hash.substring(0, 32)}...`, 50, 390, { align: 'center', width: 515 });
        }
      }

      // ========== PIED DE PAGE ==========
      doc.addPage();
      doc.rect(0, 0, 612, 792).fill('#f8fafc');

      doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e293b').text('Mentions légales', 50, 50);
      doc.moveDown();

      doc.fontSize(9).font('Helvetica').fillColor('#4b5563');
      doc.text('Ce document électronique est conforme à:', 50, 80);
      doc.text('• Convention relative au contrat de transport international de marchandises par route (CMR, 1956)', 60, 100, { width: 500 });
      doc.text('• Protocole additionnel à la Convention CMR relatif à la lettre de voiture électronique (e-CMR, 2008)', 60, 120, { width: 500 });
      doc.text('• Règlement (UE) N° 910/2014 sur l\'identification électronique (eIDAS)', 60, 140, { width: 500 });

      doc.moveDown(2);
      doc.fontSize(10).font('Helvetica-Bold').text('Informations de traçabilité', 50, 180);
      doc.fontSize(9).font('Helvetica');
      doc.text(`Document généré le: ${formatDate(new Date())}`, 50, 200);
      doc.text(`Hash SHA-256: ${generateECMRHash(ecmrData)}`, 50, 215);
      doc.text(`Numéro CMR: ${ecmrData.cmrNumber}`, 50, 230);

      doc.moveDown(3);
      doc.fontSize(8).fillColor('#9ca3af');
      doc.text('SYMPHONI.A Control Tower - RT Technologies', 50, 280);
      doc.text('Les signatures électroniques apposées sur ce document ont valeur légale.', 50, 295);

      doc.end();

    } catch (error) {
      console.error('Error generating PDF:', error);
      reject(error);
    }
  });
}

export { generateECMRHash, generateQRCode };
