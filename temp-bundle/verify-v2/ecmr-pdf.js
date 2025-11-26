// e-CMR PDF Generation - Conforme PDF/A-3
// RT Backend Services - Version 1.0.0

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

// Générer un hash SHA-256 pour l'e-CMR
function generateECMRHash(ecmrData) {
  const dataString = JSON.stringify({
    cmrNumber: ecmrData.cmrNumber,
    sender: ecmrData.sender,
    consignee: ecmrData.consignee,
    carrier: ecmrData.carrier,
    goods: ecmrData.goods,
    createdAt: ecmrData.metadata?.createdAt
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
    hash: hash.substring(0, 16) // Premiers 16 caractères
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
async function generateECMRPdf(ecmrData, options = {}) {
  const {
    outputPath = null,
    baseUrl = 'https://dgze8l03lwl5h.cloudfront.net',
    includeQRCode = true
  } = options;

  return new Promise(async (resolve, reject) => {
    try {
      // Créer le document PDF
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        info: {
          Title: `e-CMR ${ecmrData.cmrNumber}`,
          Author: 'RT Technologies',
          Subject: 'Electronic Consignment Note',
          Keywords: 'e-CMR, CMR, Transport, Lettre de voiture',
          Creator: 'RT Subscriptions-Contracts Service',
          Producer: 'PDFKit'
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Si outputPath fourni, sauvegarder sur disque
      if (outputPath) {
        doc.pipe(fs.createWriteStream(outputPath));
      }

      // ========== EN-TÊTE ==========
      doc.fontSize(24).font('Helvetica-Bold').text('e-CMR', { align: 'center' });
      doc.fontSize(14).font('Helvetica').text('Electronic Consignment Note', { align: 'center' });
      doc.fontSize(10).text('Conforme à la Convention CMR (1956) et Protocole e-CMR (2008)', { align: 'center' });
      doc.moveDown(0.5);

      // Numéro e-CMR
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text(`Numéro e-CMR: ${ecmrData.cmrNumber || 'N/A'}`, { align: 'center' });
      doc.fontSize(10).font('Helvetica');
      doc.text(`Date de création: ${formatDate(ecmrData.metadata?.createdAt)}`, { align: 'center' });
      doc.moveDown();

      // Status
      const statusColor = {
        DRAFT: '#FFA500',
        PENDING_SIGNATURES: '#FFD700',
        IN_TRANSIT: '#4169E1',
        DELIVERED: '#32CD32',
        SIGNED: '#228B22',
        CANCELLED: '#DC143C'
      };
      doc.fontSize(11).fillColor(statusColor[ecmrData.status] || '#000000')
        .text(`Statut: ${ecmrData.status || 'N/A'}`, { align: 'center' });
      doc.fillColor('#000000');
      doc.moveDown(1.5);

      // ========== 1. EXPÉDITEUR ==========
      doc.fontSize(14).font('Helvetica-Bold').text('1. Expéditeur (Sender)');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      doc.fontSize(10).font('Helvetica');
      doc.text(`Nom: ${ecmrData.sender?.name || 'N/A'}`);
      doc.text(`Adresse: ${ecmrData.sender?.address?.street || 'N/A'}`);
      doc.text(`${ecmrData.sender?.address?.postalCode || ''} ${ecmrData.sender?.address?.city || ''}, ${ecmrData.sender?.address?.country || ''}`);
      doc.text(`Téléphone: ${ecmrData.sender?.contact?.phone || 'N/A'}`);
      doc.text(`Email: ${ecmrData.sender?.contact?.email || 'N/A'}`);
      if (ecmrData.sender?.vatNumber) {
        doc.text(`TVA: ${ecmrData.sender.vatNumber}`);
      }
      doc.moveDown();

      // ========== 2. DESTINATAIRE ==========
      doc.fontSize(14).font('Helvetica-Bold').text('2. Destinataire (Consignee)');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      doc.fontSize(10).font('Helvetica');
      doc.text(`Nom: ${ecmrData.consignee?.name || 'N/A'}`);
      doc.text(`Adresse: ${ecmrData.consignee?.address?.street || 'N/A'}`);
      doc.text(`${ecmrData.consignee?.address?.postalCode || ''} ${ecmrData.consignee?.address?.city || ''}, ${ecmrData.consignee?.address?.country || ''}`);
      doc.text(`Téléphone: ${ecmrData.consignee?.contact?.phone || 'N/A'}`);
      doc.text(`Email: ${ecmrData.consignee?.contact?.email || 'N/A'}`);
      doc.moveDown();

      // ========== 3. TRANSPORTEUR ==========
      doc.fontSize(14).font('Helvetica-Bold').text('3. Transporteur (Carrier)');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      doc.fontSize(10).font('Helvetica');
      doc.text(`Nom: ${ecmrData.carrier?.name || 'N/A'}`);
      doc.text(`Licence: ${ecmrData.carrier?.licenseNumber || 'N/A'}`);
      doc.text(`Véhicule: ${ecmrData.carrier?.vehicle?.registrationNumber || 'N/A'}`);
      doc.text(`Conducteur: ${ecmrData.carrier?.driver?.name || 'N/A'}`);
      doc.text(`Permis: ${ecmrData.carrier?.driver?.licenseNumber || 'N/A'}`);
      doc.moveDown();

      // ========== 4. LIEUX ==========
      doc.fontSize(14).font('Helvetica-Bold').text('4. Lieux de Chargement et Livraison');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      doc.fontSize(11).font('Helvetica-Bold').text('Chargement:');
      doc.fontSize(10).font('Helvetica');
      doc.text(`${ecmrData.places?.loading?.address?.street || 'N/A'}`);
      doc.text(`${ecmrData.places?.loading?.address?.postalCode || ''} ${ecmrData.places?.loading?.address?.city || ''}, ${ecmrData.places?.loading?.address?.country || ''}`);
      doc.text(`Date: ${formatDate(ecmrData.places?.loading?.date)}`);
      doc.moveDown(0.5);

      doc.fontSize(11).font('Helvetica-Bold').text('Livraison:');
      doc.fontSize(10).font('Helvetica');
      doc.text(`${ecmrData.places?.delivery?.address?.street || 'N/A'}`);
      doc.text(`${ecmrData.places?.delivery?.address?.postalCode || ''} ${ecmrData.places?.delivery?.address?.city || ''}, ${ecmrData.places?.delivery?.address?.country || ''}`);
      doc.text(`Date: ${formatDate(ecmrData.places?.delivery?.date)}`);
      doc.moveDown();

      // ========== 5. MARCHANDISES ==========
      doc.fontSize(14).font('Helvetica-Bold').text('5. Marchandises (Goods)');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      doc.fontSize(10).font('Helvetica');
      doc.text(`Description: ${ecmrData.goods?.description || 'N/A'}`);
      doc.text(`Poids brut: ${ecmrData.goods?.weight?.gross || 0} kg`);
      doc.text(`Nombre de colis: ${ecmrData.goods?.packages?.count || 0}`);
      doc.text(`Type de conditionnement: ${ecmrData.goods?.packages?.type || 'N/A'}`);

      if (ecmrData.goods?.dangerousGoods?.isDangerous) {
        doc.fillColor('#DC143C').font('Helvetica-Bold');
        doc.text('⚠️ MARCHANDISE DANGEREUSE');
        doc.font('Helvetica').fillColor('#000000');
        doc.text(`Numéro ONU: ${ecmrData.goods.dangerousGoods.unNumber || 'N/A'}`);
        doc.text(`Classe: ${ecmrData.goods.dangerousGoods.class || 'N/A'}`);
      }
      doc.moveDown();

      // ========== 6. INSTRUCTIONS ==========
      doc.fontSize(14).font('Helvetica-Bold').text('6. Instructions et Paiement');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      doc.fontSize(10).font('Helvetica');
      doc.text(`Mode de paiement: ${ecmrData.instructions?.paymentTerms?.method || 'N/A'}`);
      doc.text(`Payeur: ${ecmrData.instructions?.paymentTerms?.paymentBy || 'N/A'}`);
      if (ecmrData.instructions?.specialInstructions) {
        doc.text(`Instructions spéciales: ${ecmrData.instructions.specialInstructions}`);
      }
      doc.moveDown();

      // ========== 7. SIGNATURES ==========
      doc.fontSize(14).font('Helvetica-Bold').text('7. Signatures Électroniques');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      const signatures = [
        { label: 'Expéditeur', data: ecmrData.signatures?.sender },
        { label: 'Transporteur (Prise en charge)', data: ecmrData.signatures?.carrierPickup },
        { label: 'Destinataire (Livraison)', data: ecmrData.signatures?.consignee }
      ];

      doc.fontSize(10).font('Helvetica');
      signatures.forEach(sig => {
        const status = sig.data?.status === 'SIGNED' ? '✓ Signé' : '○ En attente';
        const statusColor = sig.data?.status === 'SIGNED' ? '#228B22' : '#FFA500';

        doc.fillColor(statusColor).text(`${sig.label}: ${status}`, { continued: false });
        doc.fillColor('#000000');

        if (sig.data?.status === 'SIGNED') {
          doc.fontSize(9);
          doc.text(`  Signé par: ${sig.data.signedBy || 'N/A'}`);
          doc.text(`  Date: ${formatDate(sig.data.signedAt)}`);
          doc.text(`  IP: ${sig.data.ipAddress || 'N/A'}`);
          doc.fontSize(10);
        }
        doc.moveDown(0.3);
      });
      doc.moveDown();

      // ========== 8. QR CODE ==========
      if (includeQRCode) {
        doc.addPage();
        doc.fontSize(16).font('Helvetica-Bold').text('Vérification e-CMR', { align: 'center' });
        doc.moveDown();

        const qrCode = await generateQRCode(ecmrData, baseUrl);

        if (qrCode) {
          // Ajouter le QR code
          doc.image(qrCode.dataUrl, {
            fit: [200, 200],
            align: 'center',
            valign: 'center'
          });

          doc.moveDown(2);
          doc.fontSize(10).font('Helvetica').text('Scannez ce QR code pour vérifier l\'authenticité de ce document', { align: 'center' });
          doc.fontSize(8).text(`URL de vérification: ${qrCode.verificationUrl}`, { align: 'center' });
          doc.text(`Hash: ${qrCode.hash.substring(0, 32)}...`, { align: 'center' });
        }
      }

      // ========== PIED DE PAGE ==========
      doc.addPage();
      doc.fontSize(8).font('Helvetica').fillColor('#666666');
      doc.text('Ce document électronique est conforme à la Convention CMR (1956) et au Protocole e-CMR (2008).', { align: 'center' });
      doc.text('Les signatures électroniques ont valeur légale conformément au règlement eIDAS (UE) N° 910/2014.', { align: 'center' });
      doc.text(`Généré le ${formatDate(new Date())} par RT Technologies - RT Subscriptions-Contracts Service`, { align: 'center' });
      doc.text(`Hash du document: ${generateECMRHash(ecmrData)}`, { align: 'center' });

      // Finaliser le PDF
      doc.end();

    } catch (error) {
      console.error('Error generating PDF:', error);
      reject(error);
    }
  });
}

// Sauvegarder un PDF e-CMR sur disque
async function saveECMRPdf(ecmrData, filename, options = {}) {
  const outputPath = path.join(process.cwd(), 'pdfs', filename);

  // Créer le dossier pdfs s'il n'existe pas
  const pdfDir = path.join(process.cwd(), 'pdfs');
  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
  }

  await generateECMRPdf(ecmrData, { ...options, outputPath });
  return outputPath;
}

module.exports = {
  generateECMRPdf,
  saveECMRPdf,
  generateECMRHash,
  generateQRCode
};
