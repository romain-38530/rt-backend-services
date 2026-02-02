/**
 * Test manuel d'upload d'un document
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_URL = 'http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com';
const CARRIER_ID = '697f5a2b1980ef959ce78b67';

async function testUpload() {
  try {
    console.log('=== TEST D\'UPLOAD MANUEL ===\n');

    // Étape 1: Obtenir l'URL présignée
    console.log('Étape 1: Obtention de l\'URL présignée...');
    const urlResponse = await axios.post(
      `${API_URL}/api/carriers/${CARRIER_ID}/documents/upload-url`,
      {
        fileName: '1-licence-transport.pdf',
        contentType: 'application/pdf',
        documentType: 'licence_transport'
      }
    );

    console.log('✓ URL présignée obtenue:');
    console.log(`  - Bucket: ${urlResponse.data.bucket}`);
    console.log(`  - S3 Key: ${urlResponse.data.s3Key}`);
    console.log(`  - Expire dans: ${urlResponse.data.expiresIn}s\n`);

    const { uploadUrl, s3Key } = urlResponse.data;

    // Étape 2: Lire le fichier PDF
    console.log('Étape 2: Lecture du fichier PDF...');
    const pdfPath = path.join(__dirname, 'test-documents', '1-licence-transport.pdf');

    if (!fs.existsSync(pdfPath)) {
      throw new Error(`Fichier non trouvé: ${pdfPath}`);
    }

    const pdfBuffer = fs.readFileSync(pdfPath);
    console.log(`✓ Fichier lu: ${pdfBuffer.length} octets\n`);

    // Étape 3: Upload direct vers S3
    console.log('Étape 3: Upload vers S3...');
    await axios.put(uploadUrl, pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf'
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    console.log('✓ Fichier uploadé sur S3\n');

    // Étape 4: Confirmer l'upload
    console.log('Étape 4: Confirmation de l\'upload...');
    const metadata = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-documents', 'metadata.json'), 'utf8'));
    const docMetadata = metadata.documents.find(d => d.file === '1-licence-transport.pdf');

    const confirmResponse = await axios.post(
      `${API_URL}/api/carriers/${CARRIER_ID}/documents/confirm-upload`,
      {
        s3Key,
        documentType: 'licence_transport',
        fileName: '1-licence-transport.pdf',
        expiresAt: docMetadata.expiryDate,
        notes: 'Document de test généré automatiquement'
      }
    );

    console.log('✓ Upload confirmé:');
    console.log(`  - Document ID: ${confirmResponse.data.document.id}`);
    console.log(`  - Type: ${confirmResponse.data.document.type}`);
    console.log(`  - Status: ${confirmResponse.data.document.status}`);
    console.log(`  - Expire le: ${confirmResponse.data.document.expiresAt}\n`);

    // Étape 5: Vérifier que le document est enregistré
    console.log('Étape 5: Vérification du document...');
    const carrierResponse = await axios.get(`${API_URL}/api/carriers/${CARRIER_ID}`);
    const documents = carrierResponse.data.carrier.documents || [];

    console.log(`✓ Le transporteur a maintenant ${documents.length} document(s):`);
    documents.forEach((doc, i) => {
      console.log(`  ${i + 1}. ${doc.documentType} - ${doc.status}`);
    });

    console.log('\n=== TEST RÉUSSI ===');

  } catch (error) {
    console.error('\n❌ ERREUR:');
    console.error(`Message: ${error.message}`);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data:`, error.response.data);
    }
    if (error.stack) {
      console.error('\nStack:', error.stack);
    }
    process.exit(1);
  }
}

testUpload();
