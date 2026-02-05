/**
 * Vehicle Document Service
 *
 * Gestion des documents véhicules:
 * - Upload vers S3
 * - OCR avec Textract
 * - Extraction des données (carte grise, assurance, CT)
 * - Alertes d'expiration
 */

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const path = require('path');

const OcrService = require('./ocr/ocr.service');
const { VehicleDocument, Vehicle } = require('../../models/vehicles-datalake');

class VehicleDocumentService {
  constructor(config = {}) {
    this.region = config.region || process.env.AWS_REGION || 'eu-west-3';
    this.bucket = config.bucket || process.env.S3_DOCUMENTS_BUCKET || 'rt-vehicle-documents';

    this.s3Client = new S3Client({
      region: this.region,
      credentials: config.credentials,
    });

    this.ocrService = new OcrService(config);

    // Mapping types de documents vers parsers OCR
    this.documentParsers = {
      'carte_grise': this.parseCarteGrise.bind(this),
      'assurance': this.parseAssurance.bind(this),
      'ct': this.parseControlesTechniques.bind(this),
      'mines': this.parseMines.bind(this),
      'speed_limiter_certificate': this.parseSpeedLimiter.bind(this),
      'tachograph_calibration': this.parseTachograph.bind(this),
    };
  }

  /**
   * Upload un document et lance l'OCR
   */
  async uploadDocument(file, metadata) {
    const {
      vehicleId,
      licensePlate,
      documentType,
      organizationId,
      uploadedBy,
      issueDate,
      expiryDate,
    } = metadata;

    console.log(`[DOCUMENT-SERVICE] Upload ${documentType} pour ${licensePlate || vehicleId}`);

    // 1. Générer le chemin S3
    const fileExt = path.extname(file.originalname || file.name || '.pdf');
    const fileName = `${documentType}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${fileExt}`;
    const s3Key = `${organizationId}/vehicles/${licensePlate || vehicleId}/${documentType}/${fileName}`;

    // 2. Upload vers S3
    const uploadParams = {
      Bucket: this.bucket,
      Key: s3Key,
      Body: file.buffer || file,
      ContentType: file.mimetype || this.getMimeType(fileExt),
      Metadata: {
        'organization-id': organizationId,
        'vehicle-id': vehicleId?.toString() || '',
        'license-plate': licensePlate || '',
        'document-type': documentType,
        'uploaded-by': uploadedBy || '',
      },
    };

    await this.s3Client.send(new PutObjectCommand(uploadParams));

    // 3. Générer l'URL du fichier
    const fileUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${s3Key}`;

    // 4. Créer l'entrée en base
    const document = new VehicleDocument({
      vehicleId,
      licensePlate,
      documentType,
      documentName: file.originalname || fileName,
      fileUrl,
      fileName,
      fileSize: file.size || file.buffer?.length,
      mimeType: file.mimetype || this.getMimeType(fileExt),
      s3Key,
      s3Bucket: this.bucket,
      issueDate,
      expiryDate,
      organizationId,
      uploadedBy,
      uploadedAt: new Date(),
    });

    await document.save();

    // 5. Lancer l'OCR en arrière-plan
    this.processOcrAsync(document._id, s3Key, documentType);

    return {
      documentId: document._id,
      fileUrl,
      s3Key,
      status: 'uploaded',
      ocrStatus: 'pending',
    };
  }

  /**
   * Traite l'OCR de manière asynchrone
   */
  async processOcrAsync(documentId, s3Key, documentType) {
    try {
      console.log(`[DOCUMENT-SERVICE] Démarrage OCR pour document ${documentId}`);

      // Analyser le document
      const ocrResult = await this.ocrService.analyzeDocumentFromS3(this.bucket, s3Key, {
        features: ['FORMS', 'TABLES'],
      });

      // Parser selon le type de document
      const parser = this.documentParsers[documentType];
      let extractedData = {};

      if (parser) {
        extractedData = await parser(ocrResult);
      }

      // Mettre à jour le document
      await VehicleDocument.findByIdAndUpdate(documentId, {
        $set: {
          ocrProcessed: true,
          ocrProcessedAt: new Date(),
          ocrConfidence: ocrResult.confidence,
          ocrFields: ocrResult.keyValuePairs.map(kv => ({
            fieldName: kv.key,
            value: kv.value,
            confidence: (kv.keyConfidence + kv.valueConfidence) / 2,
          })),
          extractedData: { [documentType]: extractedData },
        },
      });

      // Si on a extrait une date d'expiration, mettre à jour
      if (extractedData.dateValidite || extractedData.dateEcheance) {
        const expiryDate = extractedData.dateValidite || extractedData.dateEcheance;
        await VehicleDocument.findByIdAndUpdate(documentId, {
          $set: { expiryDate },
        });
      }

      // Si on a extrait l'immatriculation, mettre à jour le lien véhicule
      if (extractedData.immatriculation) {
        await this.linkDocumentToVehicle(documentId, extractedData.immatriculation);
      }

      console.log(`[DOCUMENT-SERVICE] OCR terminé pour document ${documentId}`, {
        confidence: ocrResult.confidence,
        fieldsExtracted: Object.keys(extractedData).length,
      });

    } catch (error) {
      console.error(`[DOCUMENT-SERVICE] Erreur OCR document ${documentId}:`, error.message);

      await VehicleDocument.findByIdAndUpdate(documentId, {
        $set: {
          ocrProcessed: true,
          ocrProcessedAt: new Date(),
          ocrError: error.message,
        },
      });
    }
  }

  /**
   * Parser pour carte grise
   */
  async parseCarteGrise(ocrResult) {
    const text = ocrResult.rawText;
    const kvPairs = ocrResult.keyValuePairs;

    const data = {
      immatriculation: null,
      titulaire: null,
      adresse: null,
      datePremiereImmat: null,
      marque: null,
      typeVariante: null,
      denomination: null,
      typeVehicule: null,
      vin: null,
      ptac: null,
      ptra: null,
      pv: null,
      puissanceFiscale: null,
      puissanceMoteur: null,
      energie: null,
      nbPlaces: null,
      co2: null,
    };

    // Extraction par clé-valeur
    for (const kv of kvPairs) {
      const key = kv.key.toLowerCase();
      const value = kv.value;

      if (key.includes('a') && !key.includes('b')) data.immatriculation = value;
      if (key.includes('c.1')) data.titulaire = value;
      if (key.includes('c.3')) data.adresse = value;
      if (key.includes('b')) data.datePremiereImmat = this.parseDate(value);
      if (key.includes('d.1')) data.marque = value;
      if (key.includes('d.2')) data.typeVariante = value;
      if (key.includes('d.3')) data.denomination = value;
      if (key.includes('j')) data.typeVehicule = value;
      if (key.includes('e')) data.vin = this.extractVin(value);
      if (key.includes('f.1')) data.ptac = this.parseNumber(value);
      if (key.includes('f.2')) data.ptra = this.parseNumber(value);
      if (key.includes('g')) data.pv = this.parseNumber(value);
      if (key.includes('p.1')) data.puissanceFiscale = this.parseNumber(value);
      if (key.includes('p.2')) data.puissanceMoteur = this.parseNumber(value);
      if (key.includes('p.3')) data.energie = value;
      if (key.includes('s.1')) data.nbPlaces = this.parseNumber(value);
      if (key.includes('v.7')) data.co2 = this.parseNumber(value);
    }

    // Fallback: extraction depuis texte brut
    if (!data.immatriculation) {
      const plate = this.ocrService.extractLicensePlate(text);
      if (plate) data.immatriculation = plate.normalized;
    }

    if (!data.vin) {
      const vin = this.ocrService.extractVin(text);
      if (vin) data.vin = vin.vin;
    }

    return data;
  }

  /**
   * Parser pour attestation d'assurance
   */
  async parseAssurance(ocrResult) {
    const text = ocrResult.rawText;
    const kvPairs = ocrResult.keyValuePairs;

    const data = {
      compagnie: null,
      numeroPolice: null,
      dateEffet: null,
      dateEcheance: null,
      conducteurPrincipal: null,
      typeContrat: null,
      immatriculation: null,
    };

    // Extraction par clé-valeur
    for (const kv of kvPairs) {
      const key = kv.key.toLowerCase();
      const value = kv.value;

      if (key.includes('compagnie') || key.includes('assureur')) data.compagnie = value;
      if (key.includes('police') || key.includes('contrat')) data.numeroPolice = value;
      if (key.includes('effet') || key.includes('début')) data.dateEffet = this.parseDate(value);
      if (key.includes('échéance') || key.includes('fin')) data.dateEcheance = this.parseDate(value);
      if (key.includes('conducteur') || key.includes('souscripteur')) data.conducteurPrincipal = value;
      if (key.includes('garantie') || key.includes('formule')) data.typeContrat = value;
    }

    // Immatriculation depuis texte
    const plate = this.ocrService.extractLicensePlate(text);
    if (plate) data.immatriculation = plate.normalized;

    // Dates depuis texte
    const dates = this.ocrService.extractDates(text);
    if (!data.dateEffet && dates.length >= 1) data.dateEffet = dates[0].date;
    if (!data.dateEcheance && dates.length >= 2) data.dateEcheance = dates[1].date;

    return data;
  }

  /**
   * Parser pour contrôle technique
   */
  async parseControlesTechniques(ocrResult) {
    const text = ocrResult.rawText;
    const kvPairs = ocrResult.keyValuePairs;

    const data = {
      centre: null,
      adresseCentre: null,
      dateControle: null,
      dateValidite: null,
      resultat: null,
      kilometrage: null,
      immatriculation: null,
      observations: [],
      defauts: [],
    };

    // Extraction par clé-valeur
    for (const kv of kvPairs) {
      const key = kv.key.toLowerCase();
      const value = kv.value;

      if (key.includes('centre')) data.centre = value;
      if (key.includes('date') && key.includes('contrôle')) data.dateControle = this.parseDate(value);
      if (key.includes('validité') || key.includes('limite')) data.dateValidite = this.parseDate(value);
      if (key.includes('km') || key.includes('kilométrage')) data.kilometrage = this.parseNumber(value);
    }

    // Résultat
    const textLower = text.toLowerCase();
    if (textLower.includes('favorable') && !textLower.includes('défavorable')) {
      data.resultat = 'favorable';
    } else if (textLower.includes('défavorable')) {
      data.resultat = 'defavorable';
    } else if (textLower.includes('contre-visite') || textLower.includes('contrevisite')) {
      data.resultat = 'contrevisite';
    }

    // Immatriculation
    const plate = this.ocrService.extractLicensePlate(text);
    if (plate) data.immatriculation = plate.normalized;

    // Kilométrage
    const mileage = this.ocrService.extractMileage(text);
    if (mileage && !data.kilometrage) data.kilometrage = mileage.value;

    return data;
  }

  /**
   * Parser pour visite des mines
   */
  async parseMines(ocrResult) {
    const text = ocrResult.rawText;

    const data = {
      centre: null,
      dateControle: null,
      dateValidite: null,
      resultat: null,
      immatriculation: null,
      observations: [],
    };

    // Immatriculation
    const plate = this.ocrService.extractLicensePlate(text);
    if (plate) data.immatriculation = plate.normalized;

    // Dates
    const dates = this.ocrService.extractDates(text);
    if (dates.length >= 1) data.dateControle = dates[0].date;
    if (dates.length >= 2) data.dateValidite = dates[1].date;

    // Résultat
    const textLower = text.toLowerCase();
    if (textLower.includes('conforme') || textLower.includes('favorable')) {
      data.resultat = 'favorable';
    } else if (textLower.includes('non conforme') || textLower.includes('défavorable')) {
      data.resultat = 'defavorable';
    }

    return data;
  }

  /**
   * Parser pour certificat limiteur de vitesse
   */
  async parseSpeedLimiter(ocrResult) {
    const text = ocrResult.rawText;

    const data = {
      centre: null,
      dateVerification: null,
      dateValidite: null,
      vitesseLimitee: null,
      conforme: null,
      immatriculation: null,
    };

    // Immatriculation
    const plate = this.ocrService.extractLicensePlate(text);
    if (plate) data.immatriculation = plate.normalized;

    // Vitesse limitée (généralement 90 km/h)
    const speedMatch = text.match(/(\d{2,3})\s*km\/?h/i);
    if (speedMatch) data.vitesseLimitee = parseInt(speedMatch[1], 10);

    // Conformité
    const textLower = text.toLowerCase();
    data.conforme = textLower.includes('conforme') && !textLower.includes('non conforme');

    // Dates
    const dates = this.ocrService.extractDates(text);
    if (dates.length >= 1) data.dateVerification = dates[0].date;
    if (dates.length >= 2) data.dateValidite = dates[1].date;

    return data;
  }

  /**
   * Parser pour étalonnage chronotachygraphe
   */
  async parseTachograph(ocrResult) {
    const text = ocrResult.rawText;

    const data = {
      centre: null,
      dateCalibration: null,
      dateValidite: null,
      numeroAppareil: null,
      marqueAppareil: null,
      constanteW: null,
      coefficientK: null,
      circonferenceL: null,
      immatriculation: null,
    };

    // Immatriculation
    const plate = this.ocrService.extractLicensePlate(text);
    if (plate) data.immatriculation = plate.normalized;

    // Constante W
    const wMatch = text.match(/W\s*[=:]\s*(\d+(?:\.\d+)?)/i);
    if (wMatch) data.constanteW = parseFloat(wMatch[1]);

    // Coefficient K
    const kMatch = text.match(/K\s*[=:]\s*(\d+(?:\.\d+)?)/i);
    if (kMatch) data.coefficientK = parseFloat(kMatch[1]);

    // Circonférence L
    const lMatch = text.match(/L\s*[=:]\s*(\d+(?:\.\d+)?)/i);
    if (lMatch) data.circonferenceL = parseFloat(lMatch[1]);

    // Marques connues
    const brands = ['VDO', 'SIEMENS', 'STONERIDGE', 'CONTINENTAL', 'ACTIA'];
    for (const brand of brands) {
      if (text.toUpperCase().includes(brand)) {
        data.marqueAppareil = brand;
        break;
      }
    }

    // Dates
    const dates = this.ocrService.extractDates(text);
    if (dates.length >= 1) data.dateCalibration = dates[0].date;
    if (dates.length >= 2) data.dateValidite = dates[1].date;

    return data;
  }

  /**
   * Lie un document à un véhicule par immatriculation
   */
  async linkDocumentToVehicle(documentId, licensePlate) {
    const normalizedPlate = licensePlate.replace(/[^A-Z0-9]/gi, '').toUpperCase();

    const document = await VehicleDocument.findById(documentId);
    if (!document) return;

    const vehicle = await Vehicle.findOne({
      organizationId: document.organizationId,
      licensePlate: normalizedPlate,
    });

    if (vehicle) {
      await VehicleDocument.findByIdAndUpdate(documentId, {
        $set: {
          vehicleId: vehicle._id,
          licensePlate: normalizedPlate,
        },
      });

      console.log(`[DOCUMENT-SERVICE] Document ${documentId} lié au véhicule ${normalizedPlate}`);
    }
  }

  /**
   * Récupère les documents d'un véhicule
   */
  async getVehicleDocuments(vehicleId, options = {}) {
    const { documentType, includeExpired = true } = options;

    const query = { vehicleId };
    if (documentType) query.documentType = documentType;
    if (!includeExpired) {
      query.expiryDate = { $gte: new Date() };
    }

    return VehicleDocument.find(query).sort({ uploadedAt: -1 });
  }

  /**
   * Récupère les documents expirant bientôt
   */
  async getExpiringDocuments(organizationId, daysAhead = 30) {
    return VehicleDocument.findExpiring(daysAhead, organizationId);
  }

  /**
   * Génère une URL signée pour téléchargement
   */
  async getDownloadUrl(documentId, expiresIn = 3600) {
    const document = await VehicleDocument.findById(documentId);
    if (!document) throw new Error('Document non trouvé');

    const command = new GetObjectCommand({
      Bucket: document.s3Bucket || this.bucket,
      Key: document.s3Key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Supprime un document
   */
  async deleteDocument(documentId) {
    const document = await VehicleDocument.findById(documentId);
    if (!document) throw new Error('Document non trouvé');

    // Supprimer de S3
    await this.s3Client.send(new DeleteObjectCommand({
      Bucket: document.s3Bucket || this.bucket,
      Key: document.s3Key,
    }));

    // Supprimer de la base
    await VehicleDocument.findByIdAndDelete(documentId);

    return { success: true, deleted: documentId };
  }

  /**
   * Valide manuellement un document
   */
  async validateDocument(documentId, userId, notes = '') {
    return VehicleDocument.findByIdAndUpdate(
      documentId,
      {
        $set: {
          isValidated: true,
          validatedBy: userId,
          validatedAt: new Date(),
          validationNotes: notes,
        },
      },
      { new: true }
    );
  }

  // --- Utilitaires ---

  getMimeType(ext) {
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.tiff': 'image/tiff',
      '.tif': 'image/tiff',
    };
    return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
  }

  parseDate(text) {
    if (!text) return null;
    const dates = this.ocrService.extractDates(text);
    return dates.length > 0 ? dates[0].date : null;
  }

  parseNumber(text) {
    if (!text) return null;
    const cleaned = text.replace(/[^\d.,]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  extractVin(text) {
    if (!text) return null;
    const vin = this.ocrService.extractVin(text);
    return vin?.vin || null;
  }
}

module.exports = VehicleDocumentService;
