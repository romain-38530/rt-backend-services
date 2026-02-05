/**
 * Invoice Parser - Extraction des données de factures fournisseurs
 *
 * Parse les factures de maintenance/entretien pour extraire:
 * - Immatriculation du véhicule
 * - Montants (HT, TTC, TVA)
 * - Numéro de facture
 * - Date de facture
 * - Kilométrage
 * - Lignes de détail (prestations, pièces)
 */

const OcrService = require('./ocr.service');

class InvoiceParser {
  constructor(config = {}) {
    this.ocrService = new OcrService(config);

    // Mots-clés pour identifier le type de prestation
    this.serviceKeywords = {
      maintenance: [
        'vidange', 'huile', 'filtre', 'révision', 'entretien',
        'graissage', 'niveau', 'contrôle',
      ],
      brake: [
        'frein', 'plaquette', 'disque', 'mâchoire', 'tambour',
        'étrier', 'liquide de frein',
      ],
      tires: [
        'pneu', 'pneumatique', 'gomme', 'recreusage', 'équilibrage',
        'géométrie', 'parallélisme',
      ],
      engine: [
        'moteur', 'injection', 'turbo', 'courroie', 'distribution',
        'joint de culasse', 'bougies', 'démarreur', 'alternateur',
      ],
      transmission: [
        'boîte de vitesse', 'embrayage', 'transmission', 'pont',
        'différentiel', 'cardan',
      ],
      electrical: [
        'électrique', 'batterie', 'éclairage', 'phare', 'feu',
        'climatisation', 'clim', 'ventilateur',
      ],
      body: [
        'carrosserie', 'tôle', 'peinture', 'pare-brise', 'vitre',
        'rétroviseur', 'pare-chocs',
      ],
      exhaust: [
        'échappement', 'pot', 'catalyseur', 'silencieux', 'FAP',
        'filtre à particules',
      ],
      suspension: [
        'suspension', 'amortisseur', 'ressort', 'bras', 'rotule',
        'silent bloc', 'barre stabilisatrice',
      ],
    };

    // Mots-clés pour la main d'œuvre
    this.laborKeywords = [
      'main d\'œuvre', 'main d\'oeuvre', 'mo', 'm.o.', 'forfait',
      'heure', 'h.', 'travaux', 'intervention',
    ];
  }

  /**
   * Parse une facture depuis un buffer (image ou PDF)
   */
  async parseFromBuffer(buffer, options = {}) {
    console.log('[INVOICE-PARSER] Début analyse facture...');

    // 1. OCR du document
    const ocrResult = await this.ocrService.analyzeDocumentFromBuffer(buffer, {
      features: ['TABLES', 'FORMS'],
    });

    // 2. Extraction des données
    const invoiceData = this.extractData(ocrResult);

    // 3. Enrichissement et validation
    const enrichedData = this.enrichAndValidate(invoiceData, ocrResult);

    console.log('[INVOICE-PARSER] Analyse terminée', {
      licensePlate: enrichedData.licensePlate?.normalized,
      invoiceNumber: enrichedData.invoiceNumber,
      totalTtc: enrichedData.amounts?.ttc,
      confidence: enrichedData.confidence,
    });

    return enrichedData;
  }

  /**
   * Parse une facture depuis S3
   */
  async parseFromS3(bucket, key, options = {}) {
    console.log(`[INVOICE-PARSER] Début analyse facture S3: ${bucket}/${key}`);

    const ocrResult = await this.ocrService.analyzeDocumentFromS3(bucket, key, {
      features: ['TABLES', 'FORMS'],
    });

    const invoiceData = this.extractData(ocrResult);
    return this.enrichAndValidate(invoiceData, ocrResult);
  }

  /**
   * Extraction des données principales
   */
  extractData(ocrResult) {
    const text = ocrResult.rawText;

    return {
      // Données véhicule
      licensePlate: this.ocrService.extractLicensePlate(text),
      vin: this.ocrService.extractVin(text),
      mileage: this.ocrService.extractMileage(text),

      // Données facture
      invoiceNumber: this.ocrService.extractInvoiceNumber(text),
      invoiceDate: this.extractInvoiceDate(ocrResult),
      dueDate: this.extractDueDate(ocrResult),

      // Fournisseur
      supplier: this.extractSupplierInfo(ocrResult),

      // Montants
      amounts: this.ocrService.extractAmounts(text),

      // Lignes de détail
      lineItems: this.extractLineItems(ocrResult),

      // Type de prestation
      serviceTypes: this.detectServiceTypes(text),

      // Main d'œuvre
      laborDetails: this.extractLaborDetails(ocrResult),

      // Métadonnées OCR
      ocrConfidence: ocrResult.confidence,
      rawText: text,
    };
  }

  /**
   * Enrichit et valide les données extraites
   */
  enrichAndValidate(data, ocrResult) {
    const enriched = { ...data };

    // 1. Tentative de récupération d'immat depuis les clé-valeurs
    if (!enriched.licensePlate) {
      enriched.licensePlate = this.findLicensePlateInKeyValues(ocrResult.keyValuePairs);
    }

    // 2. Calcul de la confiance globale
    enriched.confidence = this.calculateConfidence(enriched);

    // 3. Catégorisation automatique
    enriched.category = this.categorizeInvoice(enriched);

    // 4. Validation des montants
    enriched.amountsValidation = this.validateAmounts(enriched.amounts, enriched.lineItems);

    // 5. Extraction des numéros de référence
    enriched.references = this.extractReferences(ocrResult);

    // 6. Déterminer si c'est une facture de pièces ou main d'œuvre
    enriched.invoiceType = this.determineInvoiceType(enriched);

    return enriched;
  }

  /**
   * Extrait la date de facture depuis les clé-valeurs
   */
  extractInvoiceDate(ocrResult) {
    const dateKeywords = ['date', 'facture', 'émission', 'emission', 'le'];

    // Chercher dans les clé-valeurs
    for (const kv of ocrResult.keyValuePairs) {
      const keyLower = kv.key.toLowerCase();
      if (dateKeywords.some(k => keyLower.includes(k))) {
        const dates = this.ocrService.extractDates(kv.value);
        if (dates.length > 0) {
          return dates[0];
        }
      }
    }

    // Fallback: première date trouvée
    const allDates = this.ocrService.extractDates(ocrResult.rawText);
    return allDates.length > 0 ? allDates[0] : null;
  }

  /**
   * Extrait la date d'échéance
   */
  extractDueDate(ocrResult) {
    const dueKeywords = ['échéance', 'echeance', 'paiement', 'règlement', 'reglement'];

    for (const kv of ocrResult.keyValuePairs) {
      const keyLower = kv.key.toLowerCase();
      if (dueKeywords.some(k => keyLower.includes(k))) {
        const dates = this.ocrService.extractDates(kv.value);
        if (dates.length > 0) {
          return dates[0];
        }
      }
    }

    return null;
  }

  /**
   * Extrait les informations du fournisseur
   */
  extractSupplierInfo(ocrResult) {
    const supplier = {
      name: null,
      siret: null,
      tvaNumber: null,
      address: null,
      phone: null,
    };

    // SIRET
    const siret = this.ocrService.extractSiret(ocrResult.rawText);
    if (siret) supplier.siret = siret.siret;

    // Numéro TVA
    const tvaMatch = ocrResult.rawText.match(/FR\s?[0-9A-Z]{2}\s?\d{9}/i);
    if (tvaMatch) supplier.tvaNumber = tvaMatch[0].replace(/\s/g, '');

    // Téléphone
    const phoneMatch = ocrResult.rawText.match(/(?:tél|tel|téléphone|telephone|phone)[:\s]*([0-9\s\.]{10,14})/i);
    if (phoneMatch) supplier.phone = phoneMatch[1].replace(/[\s\.]/g, '');

    // Nom (difficile, prendre la première ligne en haut)
    const lines = ocrResult.lines.slice(0, 5);
    for (const line of lines) {
      if (line.text.length > 5 && !line.text.match(/facture|invoice|date|siret|tva/i)) {
        supplier.name = line.text;
        break;
      }
    }

    return supplier;
  }

  /**
   * Extrait les lignes de détail depuis les tableaux
   */
  extractLineItems(ocrResult) {
    const items = [];

    // Parser chaque tableau
    for (const table of ocrResult.tables) {
      const tableItems = this.parseTableAsLineItems(table);
      items.push(...tableItems);
    }

    // Si pas de tableau, essayer d'extraire depuis le texte
    if (items.length === 0) {
      const textItems = this.extractLineItemsFromText(ocrResult.rawText);
      items.push(...textItems);
    }

    return items;
  }

  /**
   * Parse un tableau comme lignes de facture
   */
  parseTableAsLineItems(table) {
    const items = [];
    if (!table.matrix || table.matrix.length < 2) return items;

    // Identifier les colonnes (première ligne = en-têtes)
    const headers = table.matrix[0].map(h => h?.toLowerCase() || '');
    const colIndex = {
      description: headers.findIndex(h => h.includes('désign') || h.includes('design') || h.includes('libel') || h.includes('description')),
      quantity: headers.findIndex(h => h.includes('qté') || h.includes('qty') || h.includes('quantit')),
      unitPrice: headers.findIndex(h => h.includes('prix') || h.includes('p.u.') || h.includes('unitaire')),
      total: headers.findIndex(h => h.includes('total') || h.includes('montant') || h.includes('ht')),
      reference: headers.findIndex(h => h.includes('réf') || h.includes('ref') || h.includes('code')),
    };

    // Parser les lignes de données
    for (let i = 1; i < table.matrix.length; i++) {
      const row = table.matrix[i];
      const item = {
        description: colIndex.description >= 0 ? row[colIndex.description] : row[0],
        quantity: null,
        unitPrice: null,
        totalPrice: null,
        reference: null,
        type: 'unknown',
      };

      // Quantité
      if (colIndex.quantity >= 0 && row[colIndex.quantity]) {
        item.quantity = parseFloat(row[colIndex.quantity].replace(',', '.'));
      }

      // Prix unitaire
      if (colIndex.unitPrice >= 0 && row[colIndex.unitPrice]) {
        item.unitPrice = this.ocrService.parseAmount(row[colIndex.unitPrice]);
      }

      // Total
      if (colIndex.total >= 0 && row[colIndex.total]) {
        item.totalPrice = this.ocrService.parseAmount(row[colIndex.total]);
      }

      // Référence
      if (colIndex.reference >= 0) {
        item.reference = row[colIndex.reference];
      }

      // Déterminer le type
      if (item.description) {
        item.type = this.detectItemType(item.description);
      }

      // Ajouter seulement si description non vide
      if (item.description && item.description.trim().length > 2) {
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Extrait les lignes depuis le texte brut (fallback)
   */
  extractLineItemsFromText(text) {
    const items = [];
    const lines = text.split('\n');

    // Pattern: description + montant
    const linePattern = /^(.+?)\s+(\d{1,3}(?:[.,]\d{2})?)\s*€?\s*$/;

    for (const line of lines) {
      const match = line.match(linePattern);
      if (match) {
        items.push({
          description: match[1].trim(),
          totalPrice: parseFloat(match[2].replace(',', '.')),
          type: this.detectItemType(match[1]),
        });
      }
    }

    return items;
  }

  /**
   * Détecte le type d'une ligne (pièce, main d'œuvre, etc.)
   */
  detectItemType(description) {
    const descLower = description.toLowerCase();

    // Main d'œuvre
    if (this.laborKeywords.some(k => descLower.includes(k))) {
      return 'labor';
    }

    // Catégories de pièces/services
    for (const [category, keywords] of Object.entries(this.serviceKeywords)) {
      if (keywords.some(k => descLower.includes(k))) {
        return `part_${category}`;
      }
    }

    return 'part_other';
  }

  /**
   * Détecte les types de prestations dans la facture
   */
  detectServiceTypes(text) {
    const textLower = text.toLowerCase();
    const detected = [];

    for (const [category, keywords] of Object.entries(this.serviceKeywords)) {
      if (keywords.some(k => textLower.includes(k))) {
        detected.push(category);
      }
    }

    return [...new Set(detected)];
  }

  /**
   * Extrait les détails de main d'œuvre
   */
  extractLaborDetails(ocrResult) {
    const labor = {
      hours: null,
      rate: null,
      total: null,
    };

    // Chercher heures de MO
    const hoursMatch = ocrResult.rawText.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:h|heure|heures)/i);
    if (hoursMatch) {
      labor.hours = parseFloat(hoursMatch[1].replace(',', '.'));
    }

    // Chercher taux horaire
    const rateMatch = ocrResult.rawText.match(/(\d+(?:[.,]\d{2})?)\s*€?\s*\/?\s*h/i);
    if (rateMatch) {
      labor.rate = parseFloat(rateMatch[1].replace(',', '.'));
    }

    // Chercher total MO dans clé-valeurs
    for (const kv of ocrResult.keyValuePairs) {
      if (this.laborKeywords.some(k => kv.key.toLowerCase().includes(k))) {
        labor.total = this.ocrService.parseAmount(kv.value);
      }
    }

    return labor;
  }

  /**
   * Cherche l'immatriculation dans les clé-valeurs
   */
  findLicensePlateInKeyValues(keyValuePairs) {
    const plateKeywords = ['immat', 'plaque', 'véhicule', 'vehicule', 'registration'];

    for (const kv of keyValuePairs) {
      const keyLower = kv.key.toLowerCase();
      if (plateKeywords.some(k => keyLower.includes(k))) {
        const plate = this.ocrService.extractLicensePlate(kv.value);
        if (plate) return plate;
      }
    }

    return null;
  }

  /**
   * Calcule un score de confiance global
   */
  calculateConfidence(data) {
    let score = 0;
    let factors = 0;

    // Immatriculation trouvée: +30%
    if (data.licensePlate) {
      score += 30;
    }
    factors++;

    // Numéro de facture: +15%
    if (data.invoiceNumber) {
      score += 15;
    }
    factors++;

    // Montant TTC: +20%
    if (data.amounts?.ttc) {
      score += 20;
    }
    factors++;

    // Date de facture: +15%
    if (data.invoiceDate) {
      score += 15;
    }
    factors++;

    // Lignes de détail: +10%
    if (data.lineItems && data.lineItems.length > 0) {
      score += 10;
    }
    factors++;

    // Confiance OCR: +10% proportionnel
    if (data.ocrConfidence) {
      score += (data.ocrConfidence / 100) * 10;
    }
    factors++;

    return Math.round(score);
  }

  /**
   * Catégorise la facture
   */
  categorizeInvoice(data) {
    if (data.serviceTypes.includes('maintenance')) return 'maintenance';
    if (data.serviceTypes.includes('brake')) return 'brake_repair';
    if (data.serviceTypes.includes('tires')) return 'tire_service';
    if (data.serviceTypes.includes('engine')) return 'engine_repair';
    if (data.serviceTypes.includes('body')) return 'body_repair';
    if (data.serviceTypes.includes('electrical')) return 'electrical';
    if (data.serviceTypes.includes('transmission')) return 'transmission';
    if (data.serviceTypes.includes('exhaust')) return 'exhaust';
    if (data.serviceTypes.includes('suspension')) return 'suspension';

    return 'general';
  }

  /**
   * Valide la cohérence des montants
   */
  validateAmounts(amounts, lineItems) {
    const validation = {
      isValid: true,
      issues: [],
    };

    if (!amounts) return validation;

    // Vérifier HT + TVA = TTC
    if (amounts.ht && amounts.tva && amounts.ttc) {
      const expectedTtc = Math.round((amounts.ht + amounts.tva) * 100) / 100;
      if (Math.abs(expectedTtc - amounts.ttc) > 0.02) {
        validation.isValid = false;
        validation.issues.push(`HT (${amounts.ht}) + TVA (${amounts.tva}) ≠ TTC (${amounts.ttc})`);
      }
    }

    // Vérifier somme des lignes = total
    if (lineItems && lineItems.length > 0) {
      const sumLines = lineItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
      if (amounts.ht && Math.abs(sumLines - amounts.ht) > 1) {
        validation.issues.push(`Somme lignes (${sumLines.toFixed(2)}) ≠ Total HT (${amounts.ht})`);
      }
    }

    return validation;
  }

  /**
   * Extrait les numéros de référence (bon de commande, etc.)
   */
  extractReferences(ocrResult) {
    const refs = {};

    const patterns = {
      orderNumber: /(?:commande|order|bc|bon)\s*(?:n°|n°|#|:)?\s*([A-Z0-9\-\/]+)/gi,
      quoteNumber: /(?:devis|quote)\s*(?:n°|n°|#|:)?\s*([A-Z0-9\-\/]+)/gi,
      customerRef: /(?:réf|ref)\.?\s*(?:client|customer)\s*(?::)?\s*([A-Z0-9\-\/]+)/gi,
    };

    for (const [refType, pattern] of Object.entries(patterns)) {
      const matches = ocrResult.rawText.matchAll(pattern);
      for (const match of matches) {
        refs[refType] = match[1].trim();
        break; // Prendre la première occurrence
      }
    }

    return refs;
  }

  /**
   * Détermine le type de facture (pièces, MO, mixte)
   */
  determineInvoiceType(data) {
    const hasLabor = data.laborDetails?.hours || data.laborDetails?.total;
    const hasParts = data.lineItems?.some(i => i.type.startsWith('part_'));

    if (hasLabor && hasParts) return 'mixed';
    if (hasLabor) return 'labor_only';
    if (hasParts) return 'parts_only';

    return 'unknown';
  }

  /**
   * Formate le résultat pour sauvegarde en base
   */
  formatForDatabase(parsedInvoice) {
    return {
      // Véhicule
      extractedLicensePlate: parsedInvoice.licensePlate?.normalized || null,
      licensePlateConfidence: parsedInvoice.licensePlate?.confidence || 0,
      extractedVin: parsedInvoice.vin?.vin || null,
      extractedMileage: parsedInvoice.mileage?.value || null,

      // Facture
      extractedInvoiceNumber: parsedInvoice.invoiceNumber?.number || null,
      extractedDate: parsedInvoice.invoiceDate?.date || null,
      extractedDueDate: parsedInvoice.dueDate?.date || null,

      // Montants
      extractedAmountHt: parsedInvoice.amounts?.ht || null,
      extractedAmountTtc: parsedInvoice.amounts?.ttc || null,
      extractedAmountTva: parsedInvoice.amounts?.tva || null,

      // Fournisseur
      extractedSupplierName: parsedInvoice.supplier?.name || null,
      extractedSupplierSiret: parsedInvoice.supplier?.siret || null,

      // Détails
      extractedLineItems: parsedInvoice.lineItems || [],
      extractedServiceTypes: parsedInvoice.serviceTypes || [],
      extractedLaborHours: parsedInvoice.laborDetails?.hours || null,
      extractedLaborRate: parsedInvoice.laborDetails?.rate || null,

      // Catégorisation
      invoiceCategory: parsedInvoice.category,
      invoiceType: parsedInvoice.invoiceType,

      // Références
      extractedOrderNumber: parsedInvoice.references?.orderNumber || null,
      extractedQuoteNumber: parsedInvoice.references?.quoteNumber || null,

      // Métadonnées OCR
      ocrConfidence: parsedInvoice.ocrConfidence,
      extractionConfidence: parsedInvoice.confidence,
      ocrRawText: parsedInvoice.rawText,
    };
  }
}

module.exports = InvoiceParser;
