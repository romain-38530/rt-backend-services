/**
 * OCR Service - AWS Textract
 *
 * Service d'extraction de texte depuis des documents (factures, carte grise, etc.)
 * Utilise AWS Textract pour l'OCR
 */

const {
  TextractClient,
  DetectDocumentTextCommand,
  AnalyzeDocumentCommand,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
  StartDocumentAnalysisCommand,
  GetDocumentAnalysisCommand,
} = require('@aws-sdk/client-textract');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

class OcrService {
  constructor(config = {}) {
    this.region = config.region || process.env.AWS_REGION || 'eu-west-3';

    this.textractClient = new TextractClient({
      region: this.region,
      credentials: config.credentials,
    });

    this.s3Client = new S3Client({
      region: this.region,
      credentials: config.credentials,
    });

    // Patterns regex pour extraction
    this.patterns = {
      // Immatriculation française (ancien et nouveau format)
      licensePlate: [
        /([A-Z]{2}[-\s]?\d{3}[-\s]?[A-Z]{2})/gi, // Nouveau format: AA-123-BB
        /(\d{1,4}[-\s]?[A-Z]{2,3}[-\s]?\d{2})/gi, // Ancien format: 1234 AB 75
      ],

      // SIRET
      siret: /\b(\d{14}|\d{3}\s?\d{3}\s?\d{3}\s?\d{5})\b/g,

      // TVA
      tvaNumber: /FR\s?[0-9A-Z]{2}\s?\d{9}/gi,

      // Montants
      amount: /(\d{1,3}(?:[\s,]\d{3})*(?:[.,]\d{2})?)\s*€/g,
      amountTTC: /(?:TTC|TOTAL)\s*[:\s]*(\d{1,3}(?:[\s,]\d{3})*(?:[.,]\d{2})?)\s*€?/gi,
      amountHT: /(?:HT|H\.T\.)\s*[:\s]*(\d{1,3}(?:[\s,]\d{3})*(?:[.,]\d{2})?)\s*€?/gi,

      // Dates
      date: /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/g,
      dateText: /(\d{1,2}\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{4})/gi,

      // Numéro de facture
      invoiceNumber: /(?:facture|invoice|n°|num[ée]ro)\s*[:\s#]*([A-Z0-9\-\/]+)/gi,

      // Kilométrage
      mileage: /(?:km|kilom[ée]tr(?:es?|age))\s*[:\s]*(\d{1,3}(?:[\s.]\d{3})*)/gi,

      // VIN
      vin: /\b([A-HJ-NPR-Z0-9]{17})\b/g,
    };
  }

  /**
   * Analyse un document depuis S3
   */
  async analyzeDocumentFromS3(bucket, key, options = {}) {
    const { features = ['TABLES', 'FORMS'] } = options;

    try {
      const command = new AnalyzeDocumentCommand({
        Document: {
          S3Object: {
            Bucket: bucket,
            Name: key,
          },
        },
        FeatureTypes: features,
      });

      const response = await this.textractClient.send(command);
      return this.processTextractResponse(response);
    } catch (error) {
      console.error('[OCR] Erreur analyse S3:', error.message);
      throw error;
    }
  }

  /**
   * Analyse un document depuis un buffer (image ou PDF)
   */
  async analyzeDocumentFromBuffer(buffer, options = {}) {
    const { features = ['FORMS'] } = options;

    try {
      const command = new AnalyzeDocumentCommand({
        Document: {
          Bytes: buffer,
        },
        FeatureTypes: features,
      });

      const response = await this.textractClient.send(command);
      return this.processTextractResponse(response);
    } catch (error) {
      console.error('[OCR] Erreur analyse buffer:', error.message);
      throw error;
    }
  }

  /**
   * Détection de texte simple (sans analyse de structure)
   */
  async detectTextFromBuffer(buffer) {
    try {
      const command = new DetectDocumentTextCommand({
        Document: {
          Bytes: buffer,
        },
      });

      const response = await this.textractClient.send(command);
      return this.processTextractResponse(response);
    } catch (error) {
      console.error('[OCR] Erreur détection texte:', error.message);
      throw error;
    }
  }

  /**
   * Analyse asynchrone pour documents volumineux (PDF multi-pages)
   */
  async startAsyncAnalysis(bucket, key, options = {}) {
    const { features = ['TABLES', 'FORMS'], notificationChannel } = options;

    const params = {
      DocumentLocation: {
        S3Object: {
          Bucket: bucket,
          Name: key,
        },
      },
      FeatureTypes: features,
    };

    if (notificationChannel) {
      params.NotificationChannel = notificationChannel;
    }

    const command = new StartDocumentAnalysisCommand(params);
    const response = await this.textractClient.send(command);

    return {
      jobId: response.JobId,
      status: 'STARTED',
    };
  }

  /**
   * Récupère le résultat d'une analyse asynchrone
   */
  async getAsyncAnalysisResult(jobId) {
    let nextToken = null;
    const allBlocks = [];

    do {
      const command = new GetDocumentAnalysisCommand({
        JobId: jobId,
        NextToken: nextToken,
      });

      const response = await this.textractClient.send(command);

      if (response.JobStatus === 'IN_PROGRESS') {
        return { status: 'IN_PROGRESS', jobId };
      }

      if (response.JobStatus === 'FAILED') {
        return {
          status: 'FAILED',
          jobId,
          error: response.StatusMessage,
        };
      }

      if (response.Blocks) {
        allBlocks.push(...response.Blocks);
      }

      nextToken = response.NextToken;
    } while (nextToken);

    return this.processBlocks(allBlocks);
  }

  /**
   * Traite la réponse Textract
   */
  processTextractResponse(response) {
    const blocks = response.Blocks || [];
    return this.processBlocks(blocks);
  }

  /**
   * Traite les blocs Textract
   */
  processBlocks(blocks) {
    const lines = [];
    const words = [];
    const keyValuePairs = [];
    const tables = [];

    // Map des blocs par ID pour résolution des relations
    const blockMap = new Map();
    blocks.forEach(block => blockMap.set(block.Id, block));

    for (const block of blocks) {
      if (block.BlockType === 'LINE') {
        lines.push({
          text: block.Text,
          confidence: block.Confidence,
          boundingBox: block.Geometry?.BoundingBox,
        });
      }

      if (block.BlockType === 'WORD') {
        words.push({
          text: block.Text,
          confidence: block.Confidence,
          boundingBox: block.Geometry?.BoundingBox,
        });
      }

      if (block.BlockType === 'KEY_VALUE_SET' && block.EntityTypes?.includes('KEY')) {
        const keyValue = this.extractKeyValuePair(block, blockMap);
        if (keyValue) {
          keyValuePairs.push(keyValue);
        }
      }

      if (block.BlockType === 'TABLE') {
        const table = this.extractTable(block, blockMap);
        if (table) {
          tables.push(table);
        }
      }
    }

    // Texte brut complet
    const rawText = lines.map(l => l.text).join('\n');

    // Confiance moyenne
    const avgConfidence = lines.length > 0
      ? lines.reduce((sum, l) => sum + l.confidence, 0) / lines.length
      : 0;

    return {
      rawText,
      lines,
      words,
      keyValuePairs,
      tables,
      confidence: avgConfidence,
      blockCount: blocks.length,
    };
  }

  /**
   * Extrait une paire clé-valeur
   */
  extractKeyValuePair(keyBlock, blockMap) {
    // Trouver le texte de la clé
    const keyText = this.getTextFromBlock(keyBlock, blockMap);

    // Trouver le bloc valeur associé
    const valueRelation = keyBlock.Relationships?.find(r => r.Type === 'VALUE');
    if (!valueRelation) return null;

    const valueBlock = blockMap.get(valueRelation.Ids?.[0]);
    if (!valueBlock) return null;

    const valueText = this.getTextFromBlock(valueBlock, blockMap);

    return {
      key: keyText,
      value: valueText,
      keyConfidence: keyBlock.Confidence,
      valueConfidence: valueBlock.Confidence,
    };
  }

  /**
   * Récupère le texte d'un bloc (résout les enfants WORD/SELECTION)
   */
  getTextFromBlock(block, blockMap) {
    if (block.Text) return block.Text;

    const childRelation = block.Relationships?.find(r => r.Type === 'CHILD');
    if (!childRelation) return '';

    return childRelation.Ids
      .map(id => blockMap.get(id))
      .filter(b => b && (b.BlockType === 'WORD' || b.BlockType === 'SELECTION_ELEMENT'))
      .map(b => b.Text || (b.SelectionStatus === 'SELECTED' ? '☑' : '☐'))
      .join(' ');
  }

  /**
   * Extrait un tableau
   */
  extractTable(tableBlock, blockMap) {
    const cells = [];
    const childRelation = tableBlock.Relationships?.find(r => r.Type === 'CHILD');
    if (!childRelation) return null;

    for (const cellId of childRelation.Ids) {
      const cellBlock = blockMap.get(cellId);
      if (cellBlock?.BlockType === 'CELL') {
        cells.push({
          rowIndex: cellBlock.RowIndex,
          columnIndex: cellBlock.ColumnIndex,
          rowSpan: cellBlock.RowSpan || 1,
          columnSpan: cellBlock.ColumnSpan || 1,
          text: this.getTextFromBlock(cellBlock, blockMap),
          confidence: cellBlock.Confidence,
        });
      }
    }

    // Reconstruire le tableau en matrice
    const maxRow = Math.max(...cells.map(c => c.rowIndex));
    const maxCol = Math.max(...cells.map(c => c.columnIndex));
    const matrix = Array(maxRow).fill(null).map(() => Array(maxCol).fill(''));

    for (const cell of cells) {
      if (cell.rowIndex <= maxRow && cell.columnIndex <= maxCol) {
        matrix[cell.rowIndex - 1][cell.columnIndex - 1] = cell.text;
      }
    }

    return {
      rows: maxRow,
      columns: maxCol,
      cells,
      matrix,
    };
  }

  /**
   * Extrait l'immatriculation depuis le texte OCR
   */
  extractLicensePlate(text) {
    const plates = [];

    for (const pattern of this.patterns.licensePlate) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const normalized = match[1].replace(/[\s\-]/g, '').toUpperCase();

        // Valider le format
        if (this.isValidLicensePlate(normalized)) {
          plates.push({
            raw: match[0],
            normalized,
            format: this.getLicensePlateFormat(normalized),
            confidence: 0.9, // Confiance par défaut
          });
        }
      }
    }

    // Dédupliquer et retourner la meilleure correspondance
    const unique = [...new Map(plates.map(p => [p.normalized, p])).values()];
    return unique.length > 0 ? unique[0] : null;
  }

  /**
   * Valide un numéro d'immatriculation français
   */
  isValidLicensePlate(plate) {
    // Nouveau format: AA-123-BB (2009+)
    const newFormat = /^[A-Z]{2}\d{3}[A-Z]{2}$/;
    // Ancien format: 1234 AB 75
    const oldFormat = /^\d{1,4}[A-Z]{2,3}\d{2}$/;

    return newFormat.test(plate) || oldFormat.test(plate);
  }

  /**
   * Détermine le format d'immatriculation
   */
  getLicensePlateFormat(plate) {
    if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(plate)) return 'new';
    if (/^\d{1,4}[A-Z]{2,3}\d{2}$/.test(plate)) return 'old';
    return 'unknown';
  }

  /**
   * Extrait les montants depuis le texte OCR
   */
  extractAmounts(text) {
    const amounts = {
      ht: null,
      ttc: null,
      tva: null,
      all: [],
    };

    // Montant TTC
    const ttcMatches = text.matchAll(this.patterns.amountTTC);
    for (const match of ttcMatches) {
      const value = this.parseAmount(match[1]);
      if (value) amounts.ttc = value;
    }

    // Montant HT
    const htMatches = text.matchAll(this.patterns.amountHT);
    for (const match of htMatches) {
      const value = this.parseAmount(match[1]);
      if (value) amounts.ht = value;
    }

    // Tous les montants
    const allMatches = text.matchAll(this.patterns.amount);
    for (const match of allMatches) {
      const value = this.parseAmount(match[1]);
      if (value) amounts.all.push(value);
    }

    // Calculer TVA si HT et TTC disponibles
    if (amounts.ht && amounts.ttc) {
      amounts.tva = Math.round((amounts.ttc - amounts.ht) * 100) / 100;
    }

    return amounts;
  }

  /**
   * Parse un montant texte en nombre
   */
  parseAmount(text) {
    if (!text) return null;
    // Remplacer espaces et virgules
    const cleaned = text.replace(/\s/g, '').replace(',', '.');
    const value = parseFloat(cleaned);
    return isNaN(value) ? null : value;
  }

  /**
   * Extrait les dates depuis le texte OCR
   */
  extractDates(text) {
    const dates = [];

    // Format numérique
    const numericMatches = text.matchAll(this.patterns.date);
    for (const match of numericMatches) {
      const parsed = this.parseDate(match[1]);
      if (parsed) dates.push({ raw: match[0], date: parsed, format: 'numeric' });
    }

    // Format texte
    const textMatches = text.matchAll(this.patterns.dateText);
    for (const match of textMatches) {
      const parsed = this.parseFrenchDate(match[1]);
      if (parsed) dates.push({ raw: match[0], date: parsed, format: 'text' });
    }

    return dates;
  }

  /**
   * Parse une date numérique
   */
  parseDate(text) {
    const parts = text.split(/[\/\-\.]/);
    if (parts.length !== 3) return null;

    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);

    // Année sur 2 chiffres
    if (year < 100) {
      year += year > 50 ? 1900 : 2000;
    }

    // Valider
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;

    return new Date(year, month - 1, day);
  }

  /**
   * Parse une date en français
   */
  parseFrenchDate(text) {
    const months = {
      'janvier': 0, 'février': 1, 'mars': 2, 'avril': 3,
      'mai': 4, 'juin': 5, 'juillet': 6, 'août': 7,
      'septembre': 8, 'octobre': 9, 'novembre': 10, 'décembre': 11,
    };

    const match = text.match(/(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/i);
    if (!match) return null;

    const day = parseInt(match[1], 10);
    const month = months[match[2].toLowerCase()];
    const year = parseInt(match[3], 10);

    return new Date(year, month, day);
  }

  /**
   * Extrait le numéro de facture
   */
  extractInvoiceNumber(text) {
    const matches = text.matchAll(this.patterns.invoiceNumber);
    for (const match of matches) {
      if (match[1] && match[1].length >= 3) {
        return {
          raw: match[0],
          number: match[1].trim(),
        };
      }
    }
    return null;
  }

  /**
   * Extrait le kilométrage
   */
  extractMileage(text) {
    const matches = text.matchAll(this.patterns.mileage);
    for (const match of matches) {
      const value = parseInt(match[1].replace(/[\s.]/g, ''), 10);
      if (value > 0 && value < 10000000) { // Max 10M km
        return {
          raw: match[0],
          value,
        };
      }
    }
    return null;
  }

  /**
   * Extrait le SIRET
   */
  extractSiret(text) {
    const matches = text.matchAll(this.patterns.siret);
    for (const match of matches) {
      const siret = match[1].replace(/\s/g, '');
      if (siret.length === 14 && this.isValidSiret(siret)) {
        return {
          raw: match[0],
          siret,
        };
      }
    }
    return null;
  }

  /**
   * Valide un numéro SIRET (algorithme de Luhn)
   */
  isValidSiret(siret) {
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      let digit = parseInt(siret[i], 10);
      if (i % 2 === 0) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    return sum % 10 === 0;
  }

  /**
   * Extrait le VIN
   */
  extractVin(text) {
    const matches = text.matchAll(this.patterns.vin);
    for (const match of matches) {
      const vin = match[1].toUpperCase();
      if (this.isValidVin(vin)) {
        return {
          raw: match[0],
          vin,
        };
      }
    }
    return null;
  }

  /**
   * Valide un VIN basique
   */
  isValidVin(vin) {
    // Exclure I, O, Q
    return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
  }

  /**
   * Extraction complète de toutes les données d'une facture
   */
  extractInvoiceData(ocrResult) {
    const text = ocrResult.rawText;

    return {
      licensePlate: this.extractLicensePlate(text),
      invoiceNumber: this.extractInvoiceNumber(text),
      amounts: this.extractAmounts(text),
      dates: this.extractDates(text),
      mileage: this.extractMileage(text),
      siret: this.extractSiret(text),
      vin: this.extractVin(text),

      // Données structurées (clé-valeur)
      keyValuePairs: ocrResult.keyValuePairs,
      tables: ocrResult.tables,

      // Métadonnées
      confidence: ocrResult.confidence,
      rawText: text,
    };
  }
}

module.exports = OcrService;
