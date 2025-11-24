// e-CMR Archivage S3 Glacier - Archivage légal 10 ans
// RT Backend Services - Version 1.0.0

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { GlacierClient, UploadArchiveCommand } = require('@aws-sdk/client-glacier');
const { generateECMRPdf, generateECMRHash } = require('./ecmr-pdf');

// Configuration AWS
const AWS_REGION = process.env.AWS_REGION || 'eu-central-1';
const S3_BUCKET = process.env.S3_ECMR_BUCKET || 'rt-ecmr-archive';
const GLACIER_VAULT = process.env.GLACIER_VAULT || 'rt-ecmr-vault';

// Clients AWS
const s3Client = new S3Client({ region: AWS_REGION });
const glacierClient = new GlacierClient({ region: AWS_REGION });

/**
 * Archiver un e-CMR dans S3 (stockage standard)
 * Utiliser pour archivage intermédiaire (1-2 ans) avant Glacier
 */
async function archiveToS3(ecmrData, pdfBuffer) {
  try {
    const key = `ecmr/${ecmrData.cmrNumber}/${Date.now()}.pdf`;
    const hash = generateECMRHash(ecmrData);

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      Metadata: {
        'cmr-number': ecmrData.cmrNumber,
        'cmr-status': ecmrData.status,
        'document-hash': hash,
        'archived-at': new Date().toISOString(),
        'retention-years': '10' // Rétention légale 10 ans
      },
      // Classe de stockage S3 (Standard ou Glacier)
      StorageClass: 'STANDARD_IA', // Infrequent Access (moins cher que Standard)
      // Ou: 'GLACIER' ou 'DEEP_ARCHIVE'

      // Tags pour le cycle de vie
      Tagging: `cmr-number=${ecmrData.cmrNumber}&archived=true&year=${new Date().getFullYear()}`
    });

    const result = await s3Client.send(command);

    return {
      success: true,
      s3Key: key,
      bucket: S3_BUCKET,
      etag: result.ETag,
      location: `s3://${S3_BUCKET}/${key}`,
      hash
    };
  } catch (error) {
    console.error('Error archiving to S3:', error);
    throw error;
  }
}

/**
 * Archiver directement dans Glacier (stockage à long terme)
 * Utiliser pour archivage définitif (10 ans minimum)
 * Coût: ~0.004$/GB/mois (très économique)
 */
async function archiveToGlacier(ecmrData, pdfBuffer) {
  try {
    const archiveDescription = JSON.stringify({
      cmrNumber: ecmrData.cmrNumber,
      status: ecmrData.status,
      sender: ecmrData.sender?.name,
      consignee: ecmrData.consignee?.name,
      carrier: ecmrData.carrier?.name,
      archivedAt: new Date().toISOString(),
      hash: generateECMRHash(ecmrData)
    });

    const command = new UploadArchiveCommand({
      vaultName: GLACIER_VAULT,
      body: pdfBuffer,
      archiveDescription
    });

    const result = await glacierClient.send(command);

    return {
      success: true,
      archiveId: result.archiveId,
      location: result.location,
      checksum: result.checksum,
      vault: GLACIER_VAULT
    };
  } catch (error) {
    console.error('Error archiving to Glacier:', error);
    throw error;
  }
}

/**
 * Workflow complet d'archivage e-CMR
 * 1. Générer le PDF
 * 2. Archiver dans S3 (accès rapide, 1-2 ans)
 * 3. Archiver dans Glacier (archivage long terme, 10 ans)
 * 4. Mettre à jour MongoDB avec les références
 */
async function archiveECMR(ecmrData, mongoDb, options = {}) {
  const {
    useS3 = true,
    useGlacier = false, // Glacier optionnel (à activer en production)
    includeQRCode = true
  } = options;

  try {
    // 1. Générer le PDF
    console.log(`Generating PDF for e-CMR ${ecmrData.cmrNumber}...`);
    const pdfBuffer = await generateECMRPdf(ecmrData, {
      includeQRCode,
      baseUrl: process.env.BASE_URL || 'https://dgze8l03lwl5h.cloudfront.net'
    });

    const archiveResults = {};

    // 2. Archiver dans S3 (si activé)
    if (useS3) {
      console.log(`Archiving to S3...`);
      archiveResults.s3 = await archiveToS3(ecmrData, pdfBuffer);
      console.log(`✅ S3 archive: ${archiveResults.s3.s3Key}`);
    }

    // 3. Archiver dans Glacier (si activé)
    if (useGlacier) {
      console.log(`Archiving to Glacier...`);
      archiveResults.glacier = await archiveToGlacier(ecmrData, pdfBuffer);
      console.log(`✅ Glacier archive: ${archiveResults.glacier.archiveId}`);
    }

    // 4. Mettre à jour MongoDB
    const updateData = {
      'metadata.archived': true,
      'metadata.archivedAt': new Date(),
      'metadata.pdfGenerated': true,
      'metadata.pdfHash': generateECMRHash(ecmrData)
    };

    if (archiveResults.s3) {
      updateData['metadata.s3Key'] = archiveResults.s3.s3Key;
      updateData['metadata.s3Bucket'] = archiveResults.s3.bucket;
    }

    if (archiveResults.glacier) {
      updateData['metadata.archiveId'] = archiveResults.glacier.archiveId;
      updateData['metadata.glacierVault'] = archiveResults.glacier.vault;
    }

    await mongoDb.collection('contracts').updateOne(
      { _id: ecmrData._id },
      { $set: updateData }
    );

    console.log(`✅ e-CMR ${ecmrData.cmrNumber} archived successfully`);

    return {
      success: true,
      cmrNumber: ecmrData.cmrNumber,
      pdfSize: pdfBuffer.length,
      archives: archiveResults,
      archivedAt: new Date()
    };
  } catch (error) {
    console.error(`Error archiving e-CMR ${ecmrData.cmrNumber}:`, error);
    throw error;
  }
}

/**
 * Récupérer un PDF archivé depuis S3
 */
async function retrieveFromS3(s3Key) {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key
    });

    const result = await s3Client.send(command);

    // Convertir le stream en buffer
    const chunks = [];
    for await (const chunk of result.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    return {
      success: true,
      buffer,
      contentType: result.ContentType,
      metadata: result.Metadata
    };
  } catch (error) {
    console.error('Error retrieving from S3:', error);
    throw error;
  }
}

/**
 * Configuration du cycle de vie S3 (optionnel)
 * Transition automatique vers Glacier après X jours
 */
const S3_LIFECYCLE_POLICY = {
  Rules: [
    {
      Id: 'ecmr-archive-lifecycle',
      Status: 'Enabled',
      Prefix: 'ecmr/',

      Transitions: [
        {
          Days: 90, // Après 90 jours, transition vers GLACIER
          StorageClass: 'GLACIER'
        },
        {
          Days: 365, // Après 1 an, transition vers DEEP_ARCHIVE
          StorageClass: 'DEEP_ARCHIVE'
        }
      ],

      Expiration: {
        Days: 3650 // Supprimer après 10 ans (rétention légale)
      }
    }
  ]
};

/**
 * Instructions pour configurer S3 et Glacier
 */
const SETUP_INSTRUCTIONS = `
# Configuration S3 et Glacier pour e-CMR

## 1. Créer un bucket S3
aws s3 mb s3://rt-ecmr-archive --region eu-central-1

## 2. Activer le versioning
aws s3api put-bucket-versioning \\
  --bucket rt-ecmr-archive \\
  --versioning-configuration Status=Enabled

## 3. Configurer le cycle de vie (transition vers Glacier)
aws s3api put-bucket-lifecycle-configuration \\
  --bucket rt-ecmr-archive \\
  --lifecycle-configuration file://lifecycle-policy.json

## 4. Créer un vault Glacier
aws glacier create-vault \\
  --vault-name rt-ecmr-vault \\
  --account-id - \\
  --region eu-central-1

## 5. Configurer les variables d'environnement sur Elastic Beanstalk
eb setenv \\
  AWS_REGION="eu-central-1" \\
  S3_ECMR_BUCKET="rt-ecmr-archive" \\
  GLACIER_VAULT="rt-ecmr-vault"

## 6. Configurer les permissions IAM
Ajouter ces permissions au rôle Elastic Beanstalk:
- s3:PutObject
- s3:GetObject
- s3:ListBucket
- glacier:UploadArchive
- glacier:InitiateJob (pour récupération)

## Coûts estimés (pour 1000 e-CMR/mois, ~1MB chacun = 1GB total):
- S3 Standard-IA: ~0.0125$/GB/mois = 0.0125$/mois
- Glacier: ~0.004$/GB/mois = 0.004$/mois
- Glacier Deep Archive: ~0.00099$/GB/mois = 0.001$/mois

Recommandation: Utiliser S3 Standard-IA pour les 90 premiers jours,
puis transition automatique vers Glacier pour les 10 ans.
`;

module.exports = {
  archiveToS3,
  archiveToGlacier,
  archiveECMR,
  retrieveFromS3,
  S3_LIFECYCLE_POLICY,
  SETUP_INSTRUCTIONS
};
