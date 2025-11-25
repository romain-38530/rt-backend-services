// Document Management Service - Gestion des Documents de Transport
// RT Backend Services - SYMPHONI.A Suite
// Version 1.0.0

const { ObjectId } = require('mongodb');
const { EventTypes, OrderStatus } = require('./transport-orders-models');

/**
 * Types de documents
 */
const DocumentTypes = {
  BL: 'BL',                 // Bon de Livraison
  CMR: 'CMR',               // Convention Marchandises Routières
  POD: 'POD',               // Proof of Delivery
  INVOICE: 'INVOICE',       // Facture
  PACKING_LIST: 'PACKING_LIST', // Liste de colisage
  OTHER: 'OTHER'
};

/**
 * Statuts de document
 */
const DocumentStatus = {
  PENDING: 'PENDING',       // En attente de validation
  VALIDATED: 'VALIDATED',   // Validé
  REJECTED: 'REJECTED',     // Rejeté
  ARCHIVED: 'ARCHIVED'      // Archivé
};

/**
 * Upload un document pour une commande
 * @param {Object} db - MongoDB database
 * @param {String} orderId - ID de la commande
 * @param {Object} documentData - Données du document
 * @returns {Promise<Object>} Résultat de l'upload
 */
async function uploadDocument(db, orderId, documentData) {
  try {
    const {
      type = DocumentTypes.POD,
      fileName,
      fileUrl,
      fileSize,
      mimeType,
      uploadedBy,
      metadata = {}
    } = documentData;

    // Vérifier que la commande existe
    const order = await db.collection('transport_orders')
      .findOne({ _id: new ObjectId(orderId) });

    if (!order) {
      return {
        success: false,
        error: 'Order not found'
      };
    }

    // Créer le document
    const document = {
      orderId: new ObjectId(orderId),
      reference: order.reference,
      type,
      fileName,
      fileUrl,
      fileSize,
      mimeType,
      uploadedBy,
      uploadedAt: new Date(),
      status: DocumentStatus.PENDING,
      metadata,
      ocrData: null,
      validationErrors: [],
      validatedAt: null,
      validatedBy: null,
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null
    };

    const result = await db.collection('documents').insertOne(document);

    // Créer l'événement
    await db.collection('transport_events').insertOne({
      orderId: new ObjectId(orderId),
      eventType: EventTypes.DOCUMENTS_UPLOADED,
      timestamp: new Date(),
      data: {
        documentId: result.insertedId.toString(),
        type,
        fileName,
        uploadedBy
      },
      metadata: {
        source: 'API'
      }
    });

    // Mettre à jour le statut de la commande
    const updateData = {
      status: OrderStatus.DOCUMENTS_UPLOADED,
      updatedAt: new Date()
    };

    // Ajouter le document ID à la liste
    await db.collection('transport_orders').updateOne(
      { _id: new ObjectId(orderId) },
      {
        $set: updateData,
        $push: { documentIds: result.insertedId }
      }
    );

    return {
      success: true,
      documentId: result.insertedId.toString(),
      document: {
        ...document,
        _id: result.insertedId
      }
    };

  } catch (error) {
    console.error('Error uploading document:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Valider un document
 * @param {Object} db - MongoDB database
 * @param {String} documentId - ID du document
 * @param {Object} validationData - Données de validation
 * @returns {Promise<Object>} Résultat de la validation
 */
async function validateDocument(db, documentId, validationData) {
  try {
    const { validatedBy, notes = '' } = validationData;

    // Récupérer le document
    const document = await db.collection('documents')
      .findOne({ _id: new ObjectId(documentId) });

    if (!document) {
      return {
        success: false,
        error: 'Document not found'
      };
    }

    // Effectuer les validations
    const validationErrors = performDocumentValidation(document);

    const isValid = validationErrors.length === 0;
    const newStatus = isValid ? DocumentStatus.VALIDATED : DocumentStatus.REJECTED;

    // Mettre à jour le document
    const updateData = {
      status: newStatus,
      validationErrors,
      validatedAt: new Date(),
      validatedBy,
      notes
    };

    if (!isValid) {
      updateData.rejectedAt = new Date();
      updateData.rejectedBy = validatedBy;
      updateData.rejectionReason = validationErrors.join(', ');
    }

    await db.collection('documents').updateOne(
      { _id: new ObjectId(documentId) },
      { $set: updateData }
    );

    // Si validé, créer événement et mettre à jour la commande
    if (isValid) {
      await db.collection('transport_events').insertOne({
        orderId: document.orderId,
        eventType: EventTypes.DOCUMENTS_VALIDATED,
        timestamp: new Date(),
        data: {
          documentId: documentId,
          type: document.type,
          validatedBy
        },
        metadata: {
          source: 'API'
        }
      });

      // Vérifier si tous les documents sont validés
      const allDocuments = await db.collection('documents')
        .find({ orderId: document.orderId })
        .toArray();

      const allValidated = allDocuments.every(doc =>
        doc.status === DocumentStatus.VALIDATED || doc._id.toString() === documentId
      );

      if (allValidated) {
        // Mettre à jour le statut de la commande
        await db.collection('transport_orders').updateOne(
          { _id: document.orderId },
          {
            $set: {
              status: OrderStatus.DOCUMENTS_VALIDATED,
              updatedAt: new Date()
            }
          }
        );
      }
    }

    return {
      success: true,
      validated: isValid,
      errors: validationErrors,
      document: {
        ...document,
        ...updateData
      }
    };

  } catch (error) {
    console.error('Error validating document:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Effectuer les validations sur un document
 * @param {Object} document - Document à valider
 * @returns {Array} Liste des erreurs de validation
 */
function performDocumentValidation(document) {
  const errors = [];

  // Validation 1: Fichier présent
  if (!document.fileUrl) {
    errors.push('Missing file URL');
  }

  // Validation 2: Type de document valide
  if (!Object.values(DocumentTypes).includes(document.type)) {
    errors.push('Invalid document type');
  }

  // Validation 3: Taille de fichier raisonnable
  if (document.fileSize && document.fileSize > 10 * 1024 * 1024) {
    errors.push('File size too large (max 10MB)');
  }

  // Validation 4: Format de fichier acceptable
  const acceptedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/jpg'
  ];

  if (document.mimeType && !acceptedMimeTypes.includes(document.mimeType)) {
    errors.push('Invalid file format (only PDF, JPEG, PNG accepted)');
  }

  // Validation 5: POD doit avoir des données OCR si disponibles
  if (document.type === DocumentTypes.POD && document.ocrData) {
    if (!document.ocrData.signature) {
      errors.push('POD missing signature');
    }
    if (!document.ocrData.deliveryDate) {
      errors.push('POD missing delivery date');
    }
  }

  return errors;
}

/**
 * Extraire les données OCR d'un document (placeholder)
 * @param {Object} db - MongoDB database
 * @param {String} documentId - ID du document
 * @returns {Promise<Object>} Données OCR extraites
 */
async function extractOCRData(db, documentId) {
  try {
    const document = await db.collection('documents')
      .findOne({ _id: new ObjectId(documentId) });

    if (!document) {
      return {
        success: false,
        error: 'Document not found'
      };
    }

    // TODO: Intégrer un service OCR (AWS Textract, Google Vision, etc.)
    // Pour l'instant, retourner des données mockées
    const ocrData = {
      extracted: true,
      confidence: 0.85,
      fields: {
        documentNumber: null,
        date: null,
        signature: false,
        quantity: null,
        reserves: null
      }
    };

    // Mettre à jour le document avec les données OCR
    await db.collection('documents').updateOne(
      { _id: new ObjectId(documentId) },
      { $set: { ocrData, ocrExtractedAt: new Date() } }
    );

    return {
      success: true,
      ocrData
    };

  } catch (error) {
    console.error('Error extracting OCR data:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtenir tous les documents d'une commande
 * @param {Object} db - MongoDB database
 * @param {String} orderId - ID de la commande
 * @returns {Promise<Object>} Liste des documents
 */
async function getOrderDocuments(db, orderId) {
  try {
    const documents = await db.collection('documents')
      .find({ orderId: new ObjectId(orderId) })
      .sort({ uploadedAt: -1 })
      .toArray();

    return {
      success: true,
      documents,
      count: documents.length
    };

  } catch (error) {
    console.error('Error getting order documents:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtenir un document spécifique
 * @param {Object} db - MongoDB database
 * @param {String} documentId - ID du document
 * @returns {Promise<Object>} Document
 */
async function getDocument(db, documentId) {
  try {
    const document = await db.collection('documents')
      .findOne({ _id: new ObjectId(documentId) });

    if (!document) {
      return {
        success: false,
        error: 'Document not found'
      };
    }

    return {
      success: true,
      document
    };

  } catch (error) {
    console.error('Error getting document:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Archiver un document
 * @param {Object} db - MongoDB database
 * @param {String} documentId - ID du document
 * @returns {Promise<Object>} Résultat de l'archivage
 */
async function archiveDocument(db, documentId) {
  try {
    const result = await db.collection('documents').updateOne(
      { _id: new ObjectId(documentId) },
      {
        $set: {
          status: DocumentStatus.ARCHIVED,
          archivedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return {
        success: false,
        error: 'Document not found'
      };
    }

    return {
      success: true,
      archived: true
    };

  } catch (error) {
    console.error('Error archiving document:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Supprimer un document
 * @param {Object} db - MongoDB database
 * @param {String} documentId - ID du document
 * @returns {Promise<Object>} Résultat de la suppression
 */
async function deleteDocument(db, documentId) {
  try {
    // Récupérer le document pour obtenir l'orderId
    const document = await db.collection('documents')
      .findOne({ _id: new ObjectId(documentId) });

    if (!document) {
      return {
        success: false,
        error: 'Document not found'
      };
    }

    // Supprimer le document
    await db.collection('documents').deleteOne({ _id: new ObjectId(documentId) });

    // Retirer le document ID de la commande
    await db.collection('transport_orders').updateOne(
      { _id: document.orderId },
      { $pull: { documentIds: new ObjectId(documentId) } }
    );

    return {
      success: true,
      deleted: true
    };

  } catch (error) {
    console.error('Error deleting document:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ==================== EXPORTS ====================

module.exports = {
  DocumentTypes,
  DocumentStatus,
  uploadDocument,
  validateDocument,
  extractOCRData,
  getOrderDocuments,
  getDocument,
  archiveDocument,
  deleteDocument
};
