#!/usr/bin/env node
/**
 * Script de génération de documents PDF de test pour le workflow transporteur
 * Génère 6 documents avec des dates d'expiration variées pour tester le système d'alertes
 */

const fs = require('fs');
const path = require('path');

// Simple PDF generator (no dependencies needed)
function generateSimplePDF(content, outputPath) {
  // Basic PDF structure
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources 4 0 R /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >>
endobj
5 0 obj
<< /Length ${content.length + 50} >>
stream
BT
/F2 16 Tf
50 750 Td
${content}
ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000214 00000 n
0000000343 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${450 + content.length}
%%EOF`;

  fs.writeFileSync(outputPath, pdf);
  console.log(`✓ Generated: ${path.basename(outputPath)}`);
}

// Calculate dates
const today = new Date();

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDateLong(date) {
  const months = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
                  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// Create output directory
const outputDir = path.join(__dirname, 'test-documents');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('='.repeat(80));
console.log('GENERATION DE DOCUMENTS PDF DE TEST');
console.log('='.repeat(80));
console.log('');

// Document 1: Licence de transport (180 jours - OK)
const licenceExpiry = addDays(today, 180);
const licenceContent = `(REPUBLIQUE FRANCAISE) Tj
0 -30 Td
(MINISTERE DES TRANSPORTS) Tj
0 -40 Td
(/F2 20 Tf) Tj
(LICENCE DE TRANSPORT) Tj
0 -40 Td
(/F1 12 Tf) Tj
(Numero: LT-2024-123456) Tj
0 -30 Td
(Entreprise: Transport Express Demo) Tj
0 -20 Td
(SIRET: 12345678901234) Tj
0 -30 Td
(Date d'emission: ${formatDate(today)}) Tj
0 -20 Td
(/F2 12 Tf) Tj
(Date d'expiration: ${formatDate(licenceExpiry)}) Tj
0 -20 Td
(/F1 12 Tf) Tj
(Valable jusqu'au ${formatDateLong(licenceExpiry)}) Tj
0 -30 Td
(Type: Transport routier de marchandises) Tj
0 -20 Td
(Capacite: Illimitee) Tj`;

generateSimplePDF(licenceContent, path.join(outputDir, '1-licence-transport.pdf'));

// Document 2: Assurance RC (45 jours - WARNING)
const rcExpiry = addDays(today, 45);
const rcContent = `(COMPAGNIE D'ASSURANCES GENERALES) Tj
0 -30 Td
(/F2 18 Tf) Tj
(ATTESTATION D'ASSURANCE) Tj
0 -25 Td
(RESPONSABILITE CIVILE) Tj
0 -40 Td
(/F1 12 Tf) Tj
(Police n: RC-2024-789012) Tj
0 -30 Td
(Assure: Transport Express Demo) Tj
0 -20 Td
(SIRET: 12345678901234) Tj
0 -20 Td
(Adresse: 123 Avenue de la Logistique, 75001 Paris) Tj
0 -30 Td
(Date d'effet: ${formatDate(addDays(today, -365))}) Tj
0 -20 Td
(/F2 12 Tf) Tj
(Date d'echeance: ${formatDate(rcExpiry)}) Tj
0 -20 Td
(/F1 12 Tf) Tj
(Valable jusqu'au ${formatDateLong(rcExpiry)}) Tj
0 -30 Td
(Montant garanti: 1 500 000 EUR) Tj
0 -20 Td
(Franchise: 500 EUR) Tj`;

generateSimplePDF(rcContent, path.join(outputDir, '2-assurance-rc.pdf'));

// Document 3: Assurance Marchandises (8 jours - CRITICAL)
const goodsExpiry = addDays(today, 8);
const goodsContent = `(ASSURANCE TRANSPORT INTERNATIONAL) Tj
0 -30 Td
(/F2 18 Tf) Tj
(POLICE D'ASSURANCE MARCHANDISES) Tj
0 -40 Td
(/F1 12 Tf) Tj
(Reference: AM-2024-345678) Tj
0 -30 Td
(Souscripteur: Transport Express Demo) Tj
0 -20 Td
(SIRET: 12345678901234) Tj
0 -30 Td
(Type de couverture: Tous risques) Tj
0 -20 Td
(Zone geographique: Europe) Tj
0 -30 Td
(Date de souscription: ${formatDate(addDays(today, -365))}) Tj
0 -20 Td
(/F2 12 Tf) Tj
(ATTENTION: Expire le ${formatDate(goodsExpiry)}) Tj
0 -20 Td
(/F1 12 Tf) Tj
(Date limite de validite: ${formatDateLong(goodsExpiry)}) Tj
0 -30 Td
(Montant maximum par expedition: 500 000 EUR) Tj`;

generateSimplePDF(goodsContent, path.join(outputDir, '3-assurance-marchandises.pdf'));

// Document 4: KBIS (récent < 3 mois)
const kbisDate = addDays(today, -45);
const kbisContent = `(EXTRAIT DU REGISTRE DU COMMERCE ET DES SOCIETES) Tj
0 -30 Td
(/F2 16 Tf) Tj
(EXTRAIT K-BIS) Tj
0 -40 Td
(/F1 12 Tf) Tj
(Greffe du Tribunal de Commerce de Paris) Tj
0 -30 Td
(Date d'emission: ${formatDate(kbisDate)}) Tj
0 -30 Td
(Denomination: TRANSPORT EXPRESS DEMO) Tj
0 -20 Td
(Forme juridique: SARL) Tj
0 -20 Td
(Capital social: 50 000 EUR) Tj
0 -30 Td
(SIRET: 12345678901234) Tj
0 -20 Td
(SIREN: 123456789) Tj
0 -20 Td
(N TVA Intracommunautaire: FR12123456789) Tj
0 -30 Td
(Siege social: 123 Avenue de la Logistique) Tj
0 -20 Td
(75001 PARIS) Tj
0 -30 Td
(Activite principale: Transport routier de fret) Tj
0 -20 Td
(Code APE: 4941A) Tj
0 -30 Td
(Date immatriculation: 15/03/2020) Tj`;

generateSimplePDF(kbisContent, path.join(outputDir, '4-kbis.pdf'));

// Document 5: Attestation URSSAF (15 jours - WARNING)
const urssafExpiry = addDays(today, 15);
const urssafContent = `(UNION DE RECOUVREMENT DES COTISATIONS) Tj
0 -20 Td
(DE SECURITE SOCIALE ET D'ALLOCATIONS FAMILIALES) Tj
0 -30 Td
(/F2 16 Tf) Tj
(ATTESTATION DE VIGILANCE) Tj
0 -40 Td
(/F1 12 Tf) Tj
(Etablie le: ${formatDate(today)}) Tj
0 -30 Td
(Raison sociale: TRANSPORT EXPRESS DEMO) Tj
0 -20 Td
(SIRET: 12345678901234) Tj
0 -20 Td
(Adresse: 123 Avenue de la Logistique, 75001 Paris) Tj
0 -30 Td
(La presente atteste que l'entreprise citee ci-dessus) Tj
0 -20 Td
(est a jour de ses obligations declaratives et de paiement) Tj
0 -20 Td
(des cotisations et contributions sociales.) Tj
0 -30 Td
(/F2 12 Tf) Tj
(Validite: jusqu'au ${formatDate(urssafExpiry)}) Tj
0 -20 Td
(/F1 12 Tf) Tj
(Date limite: ${formatDateLong(urssafExpiry)}) Tj
0 -30 Td
(Code de verification: URF-${today.getFullYear()}-${Math.floor(Math.random() * 100000)}) Tj`;

generateSimplePDF(urssafContent, path.join(outputDir, '5-attestation-urssaf.pdf'));

// Document 6: RIB (sans expiration)
const ribContent = `(/F2 16 Tf) Tj
(RELEVE D'IDENTITE BANCAIRE) Tj
0 -40 Td
(/F1 12 Tf) Tj
(Titulaire: TRANSPORT EXPRESS DEMO) Tj
0 -20 Td
(SIRET: 12345678901234) Tj
0 -30 Td
(Domiciliation: BANQUE COMMERCIALE DE FRANCE) Tj
0 -20 Td
(Agence Paris Opera - 00123) Tj
0 -20 Td
(75002 PARIS) Tj
0 -40 Td
(/F2 14 Tf) Tj
(COORDONNEES BANCAIRES) Tj
0 -30 Td
(/F1 12 Tf) Tj
(Code banque: 30004) Tj
0 -20 Td
(Code guichet: 00123) Tj
0 -20 Td
(Numero de compte: 12345678901) Tj
0 -20 Td
(Cle RIB: 23) Tj
0 -30 Td
(/F2 12 Tf) Tj
(IBAN: FR76 3000 4001 2312 3456 7890 123) Tj
0 -20 Td
(BIC: BNPAFRPPXXX) Tj
0 -40 Td
(/F1 10 Tf) Tj
(Date d'edition: ${formatDate(today)}) Tj`;

generateSimplePDF(ribContent, path.join(outputDir, '6-rib.pdf'));

console.log('');
console.log('='.repeat(80));
console.log('RESUME DES DOCUMENTS GENERES');
console.log('='.repeat(80));
console.log('');
console.log(`1. Licence de Transport       - Expire dans 180 jours (${formatDate(licenceExpiry)}) - OK`);
console.log(`2. Assurance RC               - Expire dans 45 jours  (${formatDate(rcExpiry)}) - WARNING`);
console.log(`3. Assurance Marchandises     - Expire dans 8 jours   (${formatDate(goodsExpiry)}) - CRITICAL`);
console.log(`4. KBIS                       - Emis il y a 45 jours  (${formatDate(kbisDate)}) - OK`);
console.log(`5. Attestation URSSAF         - Expire dans 15 jours  (${formatDate(urssafExpiry)}) - WARNING`);
console.log(`6. RIB                        - Sans expiration - OK`);
console.log('');
console.log(`Tous les documents sont dans: ${outputDir}`);
console.log('');
console.log('='.repeat(80));

// Export metadata for test script
const metadata = {
  carrierId: '697f5a2b1980ef959ce78b67',
  companyName: 'Transport Express Demo',
  siret: '12345678901234',
  documents: [
    {
      file: '1-licence-transport.pdf',
      type: 'licence_transport',
      name: 'Licence de Transport',
      expiryDate: licenceExpiry.toISOString(),
      daysUntilExpiry: 180,
      expectedAlert: 'none'
    },
    {
      file: '2-assurance-rc.pdf',
      type: 'insurance_rc',
      name: 'Assurance RC',
      expiryDate: rcExpiry.toISOString(),
      daysUntilExpiry: 45,
      expectedAlert: 'warning'
    },
    {
      file: '3-assurance-marchandises.pdf',
      type: 'insurance_goods',
      name: 'Assurance Marchandises',
      expiryDate: goodsExpiry.toISOString(),
      daysUntilExpiry: 8,
      expectedAlert: 'critical'
    },
    {
      file: '4-kbis.pdf',
      type: 'kbis',
      name: 'Extrait KBIS',
      issueDate: kbisDate.toISOString(),
      noExpiry: false
    },
    {
      file: '5-attestation-urssaf.pdf',
      type: 'urssaf',
      name: 'Attestation URSSAF',
      expiryDate: urssafExpiry.toISOString(),
      daysUntilExpiry: 15,
      expectedAlert: 'warning'
    },
    {
      file: '6-rib.pdf',
      type: 'rib',
      name: 'RIB',
      noExpiry: true
    }
  ],
  generatedAt: new Date().toISOString()
};

fs.writeFileSync(
  path.join(outputDir, 'metadata.json'),
  JSON.stringify(metadata, null, 2)
);

console.log('✓ Metadata saved to metadata.json');
console.log('');
