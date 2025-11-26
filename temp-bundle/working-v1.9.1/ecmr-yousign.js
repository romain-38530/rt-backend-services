// e-CMR Yousign Integration - Signature électronique qualifiée
// RT Backend Services - Version 1.0.0
// À activer quand la clé API Yousign sera disponible

/**
 * IMPORTANT: Ce module nécessite un compte Yousign
 * Coût: ~1-2€ par signature
 * Conformité: eIDAS (signature électronique qualifiée)
 * Site: https://yousign.com/
 */

const YOUSIGN_ENABLED = process.env.YOUSIGN_API_KEY && process.env.YOUSIGN_API_KEY !== 'your_yousign_api_key';

// Configuration Yousign
const YOUSIGN_CONFIG = {
  apiKey: process.env.YOUSIGN_API_KEY || 'your_yousign_api_key',
  baseUrl: process.env.YOUSIGN_ENV === 'production'
    ? 'https://api.yousign.com'
    : 'https://staging-api.yousign.com',
  webhookUrl: process.env.YOUSIGN_WEBHOOK_URL || 'https://dgze8l03lwl5h.cloudfront.net/api/webhooks/yousign'
};

/**
 * Initialiser une procédure de signature Yousign pour un e-CMR
 *
 * @param {Object} ecmrData - Données e-CMR complètes
 * @param {Buffer} pdfBuffer - PDF généré de l'e-CMR
 * @returns {Promise<Object>} - Résultat avec signatureUrl et procedureId
 */
async function createYousignProcedure(ecmrData, pdfBuffer) {
  if (!YOUSIGN_ENABLED) {
    throw new Error('Yousign is not configured. Please set YOUSIGN_API_KEY environment variable.');
  }

  try {
    // Note: Cette implémentation sera activée quand Yousign sera configuré
    // Pour l'instant, on retourne une structure simulée

    console.log('⚠️  Yousign not yet configured - returning mock response');

    return {
      success: false,
      enabled: false,
      message: 'Yousign integration ready but API key not configured',
      procedure: {
        procedureId: `MOCK-${Date.now()}`,
        status: 'draft',
        signers: [
          {
            role: 'sender',
            email: ecmrData.sender?.contact?.email,
            signatureUrl: null
          },
          {
            role: 'carrier',
            email: ecmrData.carrier?.contact?.email,
            signatureUrl: null
          },
          {
            role: 'consignee',
            email: ecmrData.consignee?.contact?.email,
            signatureUrl: null
          }
        ]
      }
    };

    /*
    // IMPLEMENTATION REELLE (à activer avec la clé API)

    const fetch = require('node-fetch');

    // 1. Upload du PDF
    const uploadResponse = await fetch(`${YOUSIGN_CONFIG.baseUrl}/files`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${YOUSIGN_CONFIG.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `e-CMR-${ecmrData.cmrNumber}.pdf`,
        content: pdfBuffer.toString('base64')
      })
    });

    const fileData = await uploadResponse.json();

    // 2. Créer la procédure de signature
    const procedureResponse = await fetch(`${YOUSIGN_CONFIG.baseUrl}/procedures`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${YOUSIGN_CONFIG.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `e-CMR ${ecmrData.cmrNumber}`,
        description: `Signature électronique e-CMR ${ecmrData.cmrNumber}`,
        members: [
          {
            firstname: ecmrData.sender?.name?.split(' ')[0] || 'Sender',
            lastname: ecmrData.sender?.name?.split(' ').slice(1).join(' ') || 'Company',
            email: ecmrData.sender?.contact?.email,
            phone: ecmrData.sender?.contact?.phone,
            fileObjects: [{
              file: fileData.id,
              page: 1,
              position: '100,100,300,200', // Position de la signature
              mention: 'Lu et approuvé',
              mention2: 'Signature expéditeur'
            }]
          },
          {
            firstname: ecmrData.carrier?.driver?.name?.split(' ')[0] || 'Driver',
            lastname: ecmrData.carrier?.driver?.name?.split(' ').slice(1).join(' ') || 'Carrier',
            email: ecmrData.carrier?.contact?.email,
            phone: ecmrData.carrier?.driver?.phone,
            fileObjects: [{
              file: fileData.id,
              page: 1,
              position: '100,300,300,400',
              mention: 'Lu et approuvé',
              mention2: 'Signature transporteur'
            }]
          },
          {
            firstname: ecmrData.consignee?.name?.split(' ')[0] || 'Consignee',
            lastname: ecmrData.consignee?.name?.split(' ').slice(1).join(' ') || 'Company',
            email: ecmrData.consignee?.contact?.email,
            phone: ecmrData.consignee?.contact?.phone,
            fileObjects: [{
              file: fileData.id,
              page: 1,
              position: '100,500,300,600',
              mention: 'Lu et approuvé',
              mention2: 'Signature destinataire'
            }]
          }
        ],
        config: {
          email: {
            'member.started': [{
              subject: 'Signature e-CMR requise',
              message: 'Veuillez signer l\'e-CMR électroniquement'
            }],
            'member.finished': [{
              subject: 'e-CMR signé',
              message: 'Votre signature a été enregistrée'
            }],
            'procedure.finished': [{
              subject: 'e-CMR complet',
              message: 'Toutes les signatures ont été collectées'
            }]
          },
          webhook: {
            'member.finished': [{ url: YOUSIGN_CONFIG.webhookUrl }],
            'procedure.finished': [{ url: YOUSIGN_CONFIG.webhookUrl }]
          }
        }
      })
    });

    const procedureData = await procedureResponse.json();

    return {
      success: true,
      enabled: true,
      procedure: {
        procedureId: procedureData.id,
        status: procedureData.status,
        signers: procedureData.members.map(member => ({
          memberId: member.id,
          email: member.email,
          status: member.status,
          signatureUrl: member.status === 'pending' ? member.iframe : null
        }))
      }
    };
    */

  } catch (error) {
    console.error('Error creating Yousign procedure:', error);
    throw error;
  }
}

/**
 * Vérifier le statut d'une procédure Yousign
 */
async function checkYousignStatus(procedureId) {
  if (!YOUSIGN_ENABLED) {
    return {
      success: false,
      enabled: false,
      message: 'Yousign not configured'
    };
  }

  /*
  // IMPLEMENTATION REELLE
  const fetch = require('node-fetch');

  const response = await fetch(`${YOUSIGN_CONFIG.baseUrl}/procedures/${procedureId}`, {
    headers: {
      'Authorization': `Bearer ${YOUSIGN_CONFIG.apiKey}`
    }
  });

  const data = await response.json();

  return {
    success: true,
    status: data.status,
    members: data.members,
    finishedAt: data.finishedAt
  };
  */

  return {
    success: false,
    message: 'Not implemented yet'
  };
}

/**
 * Webhook handler pour les événements Yousign
 */
async function handleYousignWebhook(event, mongoDb) {
  console.log('Yousign webhook received:', event.eventName);

  try {
    switch (event.eventName) {
      case 'member.finished':
        // Un signataire a terminé
        console.log(`Member ${event.member.id} finished signing`);

        // Mettre à jour MongoDB
        const party = event.member.email === ecmrData.sender?.contact?.email ? 'sender' :
                      event.member.email === ecmrData.carrier?.contact?.email ? 'carrierPickup' :
                      'consignee';

        await mongoDb.collection('contracts').updateOne(
          { cmrNumber: event.procedure.name.split(' ')[1] },
          {
            $set: {
              [`signatures.${party}.status`]: 'SIGNED',
              [`signatures.${party}.signatureType`]: 'QUALIFIED',
              [`signatures.${party}.certificateId`]: event.member.id,
              [`signatures.${party}.signedAt`]: new Date(event.member.finishedAt)
            }
          }
        );
        break;

      case 'procedure.finished':
        // Toutes les signatures complètes
        console.log(`Procedure ${event.procedure.id} finished`);

        await mongoDb.collection('contracts').updateOne(
          { cmrNumber: event.procedure.name.split(' ')[1] },
          {
            $set: {
              status: 'SIGNED',
              'metadata.yousignProcedureId': event.procedure.id,
              'metadata.updatedAt': new Date()
            }
          }
        );
        break;

      default:
        console.log('Unhandled Yousign event:', event.eventName);
    }

    return { success: true };
  } catch (error) {
    console.error('Error handling Yousign webhook:', error);
    throw error;
  }
}

/**
 * Instructions de configuration Yousign
 */
const YOUSIGN_SETUP = `
# Configuration Yousign pour e-CMR

## 1. Créer un compte Yousign
https://yousign.com/fr/signup

## 2. Obtenir la clé API
1. Se connecter au dashboard Yousign
2. Aller dans Paramètres → API
3. Générer une nouvelle clé API

## 3. Configurer sur Elastic Beanstalk
eb setenv \\
  YOUSIGN_API_KEY="votre_cle_api_yousign" \\
  YOUSIGN_ENV="production" \\
  YOUSIGN_WEBHOOK_URL="https://dgze8l03lwl5h.cloudfront.net/api/webhooks/yousign"

## 4. Configurer le webhook dans Yousign
URL: https://dgze8l03lwl5h.cloudfront.net/api/webhooks/yousign
Événements à activer:
- member.finished
- procedure.finished

## 5. Installer la dépendance (si pas déjà fait)
npm install node-fetch

## 6. Activer dans le code
Décommenter l'implémentation réelle dans ecmr-yousign.js

## Coûts
- Plan Essentiel: 1€/signature (50 signatures/mois minimum = 50€/mois)
- Plan Pro: 1.50€/signature + fonctionnalités avancées

## Avantages
- ✅ Signature qualifiée conforme eIDAS
- ✅ Valeur légale maximale
- ✅ Certificat numérique inclus
- ✅ Horodatage qualifié
- ✅ Audit trail complet
- ✅ Conservation légale 10 ans

## Alternative moins chère pour débuter
Utiliser la signature simple (actuelle) pendant les tests,
puis activer Yousign pour la production.
`;

module.exports = {
  createYousignProcedure,
  checkYousignStatus,
  handleYousignWebhook,
  YOUSIGN_ENABLED,
  YOUSIGN_SETUP
};
