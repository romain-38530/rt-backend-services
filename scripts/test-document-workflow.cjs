#!/usr/bin/env node
/**
 * Script de test complet du workflow de documents transporteur
 *
 * Ce script:
 * 1. Charge les métadonnées des documents générés
 * 2. Upload chaque document via l'API
 * 3. Déclenche l'analyse OCR
 * 4. Vérifie les dates extraites
 * 5. Teste le système d'alertes
 * 6. Vérifie le blocage automatique
 * 7. Génère un rapport détaillé
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

// Configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const CARRIER_ID = '697f5a2b1980ef959ce78b67';
const TEST_DOCS_DIR = path.join(__dirname, 'test-documents');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(message) {
  const line = '='.repeat(80);
  log('\n' + line, 'cyan');
  log(message, 'bright');
  log(line, 'cyan');
  console.log('');
}

function subheader(message) {
  log(`\n▶ ${message}`, 'blue');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Load metadata
function loadMetadata() {
  const metadataPath = path.join(TEST_DOCS_DIR, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    log('❌ Metadata file not found. Please run generate-test-documents.cjs first.', 'red');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
}

// Step 1: Get presigned URL for upload
async function getUploadUrl(carrierId, fileName, contentType, documentType) {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/carriers/${carrierId}/documents/upload-url`,
      {
        fileName,
        contentType,
        documentType
      }
    );
    return response.data;
  } catch (error) {
    throw new Error(`Failed to get upload URL: ${error.message}`);
  }
}

// Step 2: Upload file to S3
async function uploadToS3(presignedUrl, filePath, contentType) {
  try {
    const fileContent = fs.readFileSync(filePath);
    await axios.put(presignedUrl, fileContent, {
      headers: {
        'Content-Type': contentType
      }
    });
    return true;
  } catch (error) {
    throw new Error(`Failed to upload to S3: ${error.message}`);
  }
}

// Step 3: Confirm upload
async function confirmUpload(carrierId, s3Key, documentType, fileName, expiresAt, notes) {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/carriers/${carrierId}/documents/confirm-upload`,
      {
        s3Key,
        documentType,
        fileName,
        expiresAt,
        notes
      }
    );
    return response.data;
  } catch (error) {
    throw new Error(`Failed to confirm upload: ${error.message}`);
  }
}

// Step 4: Analyze document with OCR
async function analyzeDocument(carrierId, documentId) {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/carriers/${carrierId}/documents/${documentId}/analyze`
    );
    return response.data;
  } catch (error) {
    throw new Error(`Failed to analyze document: ${error.message}`);
  }
}

// Step 5: Get carrier details
async function getCarrier(carrierId) {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/carriers/${carrierId}`);
    return response.data;
  } catch (error) {
    throw new Error(`Failed to get carrier: ${error.message}`);
  }
}

// Step 6: Trigger vigilance check
async function triggerVigilanceCheck() {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/vigilance/run-check`);
    return response.data;
  } catch (error) {
    throw new Error(`Failed to trigger vigilance check: ${error.message}`);
  }
}

// Main test workflow
async function runTests() {
  header('TEST COMPLET DU WORKFLOW DE DOCUMENTS TRANSPORTEUR');

  const metadata = loadMetadata();
  log(`Carrier ID: ${metadata.carrierId}`, 'cyan');
  log(`Company: ${metadata.companyName}`, 'cyan');
  log(`Documents à tester: ${metadata.documents.length}`, 'cyan');

  const results = {
    startTime: new Date(),
    uploads: [],
    ocrResults: [],
    alerts: [],
    carrier: null,
    errors: []
  };

  // =======================================================================
  // ETAPE 1: UPLOAD DES DOCUMENTS
  // =======================================================================
  header('ETAPE 1: UPLOAD DES DOCUMENTS');

  for (const doc of metadata.documents) {
    subheader(`Document: ${doc.name}`);

    const filePath = path.join(TEST_DOCS_DIR, doc.file);
    if (!fs.existsSync(filePath)) {
      log(`  ❌ File not found: ${doc.file}`, 'red');
      results.errors.push({ step: 'upload', document: doc.name, error: 'File not found' });
      continue;
    }

    try {
      // Get upload URL
      log(`  → Getting upload URL...`);
      const uploadData = await getUploadUrl(
        metadata.carrierId,
        doc.file,
        'application/pdf',
        doc.type
      );

      log(`  → Uploading to S3...`);
      await uploadToS3(uploadData.uploadUrl, filePath, 'application/pdf');

      log(`  → Confirming upload...`);
      const confirmData = await confirmUpload(
        metadata.carrierId,
        uploadData.s3Key,
        doc.type,
        doc.name,
        doc.expiryDate || null,
        `Test document - Generated on ${new Date().toISOString()}`
      );

      log(`  ✓ Upload successful!`, 'green');
      log(`    Document ID: ${confirmData.document.id}`, 'cyan');

      results.uploads.push({
        document: doc.name,
        documentId: confirmData.document.id,
        s3Key: uploadData.s3Key,
        type: doc.type,
        success: true
      });

      // Wait a bit between uploads
      await sleep(1000);

    } catch (error) {
      log(`  ❌ Upload failed: ${error.message}`, 'red');
      results.errors.push({ step: 'upload', document: doc.name, error: error.message });
    }
  }

  log(`\n✓ Uploaded ${results.uploads.length}/${metadata.documents.length} documents`, 'green');

  // =======================================================================
  // ETAPE 2: ANALYSE OCR
  // =======================================================================
  header('ETAPE 2: ANALYSE OCR DES DOCUMENTS');

  for (const upload of results.uploads) {
    subheader(`Analyse: ${upload.document}`);

    try {
      log(`  → Launching OCR analysis...`);
      const ocrResult = await analyzeDocument(metadata.carrierId, upload.documentId);

      if (ocrResult.success) {
        log(`  ✓ OCR analysis complete!`, 'green');
        log(`    Confidence: ${ocrResult.ocrAnalysis.confidence}`, 'cyan');
        log(`    Dates found: ${ocrResult.ocrAnalysis.dates?.length || 0}`, 'cyan');

        if (ocrResult.ocrAnalysis.suggestedExpiryDate) {
          const suggestedDate = new Date(ocrResult.ocrAnalysis.suggestedExpiryDate);
          log(`    Suggested expiry: ${suggestedDate.toLocaleDateString('fr-FR')}`, 'cyan');
        }

        if (ocrResult.document.expiresAt) {
          const expiryDate = new Date(ocrResult.document.expiresAt);
          const daysUntil = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
          log(`    Auto-updated expiry: ${expiryDate.toLocaleDateString('fr-FR')} (${daysUntil} days)`, 'cyan');
        }

        results.ocrResults.push({
          document: upload.document,
          documentId: upload.documentId,
          confidence: ocrResult.ocrAnalysis.confidence,
          datesFound: ocrResult.ocrAnalysis.dates?.length || 0,
          suggestedExpiry: ocrResult.ocrAnalysis.suggestedExpiryDate,
          autoUpdated: !!ocrResult.document.expiresAt,
          success: true
        });
      } else {
        log(`  ⚠ OCR analysis failed`, 'yellow');
        results.ocrResults.push({
          document: upload.document,
          success: false,
          error: ocrResult.error
        });
      }

      // Wait between analyses
      await sleep(2000);

    } catch (error) {
      log(`  ❌ OCR failed: ${error.message}`, 'red');
      results.errors.push({ step: 'ocr', document: upload.document, error: error.message });
    }
  }

  // =======================================================================
  // ETAPE 3: VERIFICATION DU STATUT TRANSPORTEUR
  // =======================================================================
  header('ETAPE 3: VERIFICATION DU STATUT TRANSPORTEUR');

  try {
    log(`→ Getting carrier status...`);
    const carrier = await getCarrier(metadata.carrierId);
    results.carrier = carrier;

    log(`\n✓ Carrier Information:`, 'green');
    log(`  Company: ${carrier.companyName}`, 'cyan');
    log(`  Status: ${carrier.status}`, carrier.status === 'active' ? 'green' : 'yellow');
    log(`  Level: ${carrier.level}`, 'cyan');
    log(`  Score: ${carrier.score?.currentScore || 'N/A'}/100`, 'cyan');

    if (carrier.vigilance) {
      log(`  Vigilance Status: ${carrier.vigilance.status}`,
        carrier.vigilance.status === 'compliant' ? 'green' : 'red');

      if (carrier.vigilance.alerts && carrier.vigilance.alerts.length > 0) {
        log(`\n  ⚠ Active Alerts: ${carrier.vigilance.alerts.length}`, 'yellow');
        carrier.vigilance.alerts.forEach((alert, i) => {
          log(`    ${i + 1}. ${alert.type} - ${alert.severity} - ${alert.message}`, 'yellow');
        });
      }
    }

    if (carrier.documents) {
      log(`\n  Documents: ${carrier.documents.length}`, 'cyan');
      carrier.documents.forEach(doc => {
        const status = doc.status === 'verified' ? '✓' :
                      doc.status === 'expired' ? '✗' :
                      doc.status === 'pending' ? '⋯' : '?';
        const statusColor = doc.status === 'verified' ? 'green' :
                           doc.status === 'expired' ? 'red' : 'yellow';

        let info = `    ${status} ${doc.type} - ${doc.status}`;
        if (doc.expiresAt) {
          const expiry = new Date(doc.expiresAt);
          const days = Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24));
          info += ` (expires in ${days} days)`;
        }
        log(info, statusColor);
      });
    }

  } catch (error) {
    log(`❌ Failed to get carrier status: ${error.message}`, 'red');
    results.errors.push({ step: 'carrier-status', error: error.message });
  }

  // =======================================================================
  // ETAPE 4: TEST DU SYSTEME D'ALERTES
  // =======================================================================
  header('ETAPE 4: TEST DU SYSTEME D\'ALERTES');

  try {
    log(`→ Triggering vigilance check...`);
    const vigilanceResult = await triggerVigilanceCheck();

    if (vigilanceResult.success) {
      log(`\n✓ Vigilance check completed!`, 'green');
      log(`  Alerts generated: ${vigilanceResult.alertsCount}`, 'cyan');

      if (vigilanceResult.alerts && vigilanceResult.alerts.length > 0) {
        log(`\n  Alert Details:`, 'yellow');
        vigilanceResult.alerts.forEach((alert, i) => {
          log(`    ${i + 1}. Document: ${alert.documentType}`, 'yellow');
          log(`       Days until expiry: ${alert.daysUntilExpiry}`, 'yellow');
        });
      }

      results.alerts = vigilanceResult.alerts || [];
    }

  } catch (error) {
    log(`❌ Vigilance check failed: ${error.message}`, 'red');
    results.errors.push({ step: 'vigilance', error: error.message });
  }

  // =======================================================================
  // ETAPE 5: VERIFICATION FINALE
  // =======================================================================
  header('ETAPE 5: VERIFICATION FINALE DU TRANSPORTEUR');

  try {
    log(`→ Getting final carrier status...`);
    const finalCarrier = await getCarrier(metadata.carrierId);

    log(`\n✓ Final Status:`, 'green');
    log(`  Status: ${finalCarrier.status}`, finalCarrier.status === 'active' ? 'green' : 'red');
    log(`  Vigilance: ${finalCarrier.vigilance?.status || 'unknown'}`,
      finalCarrier.vigilance?.status === 'compliant' ? 'green' : 'red');

    if (finalCarrier.vigilance?.status === 'blocked') {
      log(`\n  ⚠ CARRIER IS BLOCKED`, 'red');
      log(`    Reason: ${finalCarrier.vigilance.blockReason}`, 'red');
    }

  } catch (error) {
    log(`❌ Failed to get final status: ${error.message}`, 'red');
    results.errors.push({ step: 'final-check', error: error.message });
  }

  // =======================================================================
  // RAPPORT FINAL
  // =======================================================================
  results.endTime = new Date();
  results.duration = (results.endTime - results.startTime) / 1000;

  header('RAPPORT FINAL');

  log(`\n📊 Statistics:`, 'bright');
  log(`  Duration: ${results.duration.toFixed(2)}s`, 'cyan');
  log(`  Documents uploaded: ${results.uploads.length}/${metadata.documents.length}`, 'cyan');
  log(`  OCR analyses: ${results.ocrResults.filter(r => r.success).length}/${results.ocrResults.length}`, 'cyan');
  log(`  Alerts generated: ${results.alerts.length}`, 'cyan');
  log(`  Errors: ${results.errors.length}`, results.errors.length > 0 ? 'red' : 'green');

  if (results.errors.length > 0) {
    log(`\n❌ Errors encountered:`, 'red');
    results.errors.forEach((err, i) => {
      log(`  ${i + 1}. [${err.step}] ${err.document || ''}: ${err.error}`, 'red');
    });
  }

  log(`\n✅ Expected Test Results:`, 'bright');
  log(`  • 3 documents should trigger alerts (Assurance RC: 45j, Marchandises: 8j, URSSAF: 15j)`, 'cyan');
  log(`  • Assurance Marchandises (8 days) should trigger CRITICAL alert`, 'cyan');
  log(`  • Carrier should be in WARNING or BLOCKED state if critical documents are expiring`, 'cyan');
  log(`  • OCR should extract dates from all documents`, 'cyan');

  // Save report
  const reportPath = path.join(TEST_DOCS_DIR, 'test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  log(`\n✓ Full report saved to: ${reportPath}`, 'green');

  header('TEST COMPLETE');
}

// Run tests
runTests().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
