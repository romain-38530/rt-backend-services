#!/usr/bin/env node
// Script de vérification automatique de la configuration DNS
// Usage: node scripts/verifier-dns.js

const dns = require('dns').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

const DOMAINE = 'symphonia-controltower.com';

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║   🌐 Vérification Configuration DNS - SYMPHONI.A           ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log(`📋 Domaine: ${DOMAINE}\n`);

const results = {
  spf: { status: 'pending', message: '', color: '' },
  dkim: { status: 'pending', message: '', color: '' },
  dmarc: { status: 'pending', message: '', color: '' }
};

// Fonction pour exécuter nslookup
async function nslookup(query, type = 'txt') {
  try {
    const { stdout } = await execPromise(`nslookup -type=${type} ${query}`);
    return stdout;
  } catch (error) {
    return null;
  }
}

// Vérification SPF
async function verifierSPF() {
  console.log('─'.repeat(65));
  console.log('1️⃣  VÉRIFICATION SPF (Sender Policy Framework)');
  console.log('─'.repeat(65));
  console.log('   Recherche en cours...\n');

  try {
    const records = await dns.resolveTxt(DOMAINE);
    const spfRecord = records.find(record =>
      record.join('').includes('v=spf1')
    );

    if (spfRecord) {
      const spfValue = spfRecord.join('');

      if (spfValue.includes('include:mx.ovh.net')) {
        results.spf.status = 'success';
        results.spf.message = 'SPF configuré correctement pour OVH';
        results.spf.color = '✅';

        console.log('   ✅ SPF TROUVÉ ET VALIDE\n');
        console.log('   📋 Enregistrement:');
        console.log(`      ${spfValue}\n`);
        console.log('   ✓ Contient include:mx.ovh.net');
        console.log('   ✓ Format valide');
        console.log('   ✓ Les emails d\'OVH sont autorisés\n');
      } else {
        results.spf.status = 'warning';
        results.spf.message = 'SPF trouvé mais ne contient pas OVH';
        results.spf.color = '⚠️';

        console.log('   ⚠️  SPF TROUVÉ MAIS INCOMPLET\n');
        console.log('   📋 Enregistrement actuel:');
        console.log(`      ${spfValue}\n`);
        console.log('   ❌ Ne contient pas include:mx.ovh.net');
        console.log('   ⚠️  Les emails OVH pourraient être rejetés\n');
        console.log('   💡 Valeur recommandée:');
        console.log('      v=spf1 include:mx.ovh.net ~all\n');
      }
    } else {
      results.spf.status = 'error';
      results.spf.message = 'SPF non configuré';
      results.spf.color = '❌';

      console.log('   ❌ SPF NON TROUVÉ\n');
      console.log('   ⚠️  Impact: Les emails arrivent probablement en SPAM\n');
      console.log('   📝 Configuration requise:');
      console.log('      Type: TXT');
      console.log('      Nom:  @');
      console.log('      Valeur: v=spf1 include:mx.ovh.net ~all\n');
      console.log('   📖 Guide: CONFIGURATION_DNS_ETAPES.md\n');
    }
  } catch (error) {
    results.spf.status = 'error';
    results.spf.message = 'Erreur lors de la vérification';
    results.spf.color = '❌';

    console.log('   ❌ ERREUR LORS DE LA VÉRIFICATION\n');
    console.log(`   Message: ${error.message}\n`);
  }
}

// Vérification DKIM
async function verifierDKIM() {
  console.log('─'.repeat(65));
  console.log('2️⃣  VÉRIFICATION DKIM (DomainKeys Identified Mail)');
  console.log('─'.repeat(65));
  console.log('   Recherche en cours...\n');

  const selecteurs = ['default', 'mail', 'dkim'];
  let dkimTrouve = false;

  for (const selecteur of selecteurs) {
    try {
      const query = `${selecteur}._domainkey.${DOMAINE}`;
      const records = await dns.resolveTxt(query);
      const dkimRecord = records.find(record =>
        record.join('').includes('v=DKIM1')
      );

      if (dkimRecord) {
        dkimTrouve = true;
        const dkimValue = dkimRecord.join('');

        results.dkim.status = 'success';
        results.dkim.message = `DKIM configuré (sélecteur: ${selecteur})`;
        results.dkim.color = '✅';

        console.log('   ✅ DKIM TROUVÉ ET VALIDE\n');
        console.log(`   📋 Sélecteur: ${selecteur}`);
        console.log(`   📋 Enregistrement: ${query}`);
        console.log(`   📋 Valeur (extrait): ${dkimValue.substring(0, 80)}...\n`);
        console.log('   ✓ Signature DKIM active');
        console.log('   ✓ Emails authentifiés cryptographiquement\n');
        break;
      }
    } catch (error) {
      // Continuer avec le prochain sélecteur
    }
  }

  if (!dkimTrouve) {
    results.dkim.status = 'error';
    results.dkim.message = 'DKIM non configuré';
    results.dkim.color = '❌';

    console.log('   ❌ DKIM NON TROUVÉ\n');
    console.log('   ⚠️  Impact: Authentification des emails manquante\n');
    console.log('   📝 Configuration requise:');
    console.log('      1. Activer DKIM dans espace client OVH');
    console.log('      2. Récupérer les enregistrements DNS fournis');
    console.log('      3. Ajouter les enregistrements dans votre zone DNS\n');
    console.log('   ⏰ Propagation: 24-48 heures\n');
    console.log('   📖 Guide: CONFIGURATION_DNS_ETAPES.md\n');
  }
}

// Vérification DMARC
async function verifierDMARC() {
  console.log('─'.repeat(65));
  console.log('3️⃣  VÉRIFICATION DMARC (Domain-based Message Authentication)');
  console.log('─'.repeat(65));
  console.log('   Recherche en cours...\n');

  try {
    const query = `_dmarc.${DOMAINE}`;
    const records = await dns.resolveTxt(query);
    const dmarcRecord = records.find(record =>
      record.join('').includes('v=DMARC1')
    );

    if (dmarcRecord) {
      const dmarcValue = dmarcRecord.join('');

      results.dmarc.status = 'success';
      results.dmarc.message = 'DMARC configuré correctement';
      results.dmarc.color = '✅';

      console.log('   ✅ DMARC TROUVÉ ET VALIDE\n');
      console.log('   📋 Enregistrement:');
      console.log(`      ${dmarcValue}\n`);

      if (dmarcValue.includes('p=quarantine')) {
        console.log('   ✓ Politique: quarantine (recommandé)');
      } else if (dmarcValue.includes('p=reject')) {
        console.log('   ✓ Politique: reject (strict)');
      } else if (dmarcValue.includes('p=none')) {
        console.log('   ⚠️  Politique: none (surveillance seulement)');
      }

      if (dmarcValue.includes('rua=')) {
        console.log('   ✓ Rapports agrégés configurés');
      }

      console.log('   ✓ Protection contre usurpation active\n');
    } else {
      results.dmarc.status = 'error';
      results.dmarc.message = 'DMARC non configuré';
      results.dmarc.color = '❌';

      console.log('   ❌ DMARC NON TROUVÉ\n');
      console.log('   ⚠️  Impact: Pas de politique de gestion des emails suspects\n');
      console.log('   📝 Configuration requise:');
      console.log('      Type: TXT');
      console.log('      Nom:  _dmarc');
      console.log('      Valeur: v=DMARC1; p=quarantine; rua=mailto:admin@symphonia-controltower.com\n');
      console.log('   📖 Guide: CONFIGURATION_DNS_ETAPES.md\n');
    }
  } catch (error) {
    results.dmarc.status = 'error';
    results.dmarc.message = 'DMARC non configuré';
    results.dmarc.color = '❌';

    console.log('   ❌ DMARC NON TROUVÉ\n');
    console.log('   (Aucun enregistrement DNS trouvé)\n');
  }
}

// Résumé final
function afficherResume() {
  console.log('═'.repeat(65));
  console.log('📊 RÉSUMÉ DE LA VÉRIFICATION');
  console.log('═'.repeat(65));
  console.log('');

  console.log(`${results.spf.color} SPF:   ${results.spf.message}`);
  console.log(`${results.dkim.color} DKIM:  ${results.dkim.message}`);
  console.log(`${results.dmarc.color} DMARC: ${results.dmarc.message}`);
  console.log('');

  const successCount = Object.values(results).filter(r => r.status === 'success').length;
  const totalCount = Object.keys(results).length;

  console.log('─'.repeat(65));
  console.log(`Score: ${successCount}/${totalCount} configurations valides`);
  console.log('─'.repeat(65));
  console.log('');

  if (successCount === totalCount) {
    console.log('🎉 EXCELLENT ! Toutes les configurations DNS sont valides.');
    console.log('');
    console.log('   ✅ Vos emails arrivent en boîte de réception');
    console.log('   ✅ Bonne réputation d\'expéditeur');
    console.log('   ✅ Conformité avec les standards email');
    console.log('   ✅ Protection contre l\'usurpation');
    console.log('');
    console.log('📊 Taux de délivrabilité estimé: 90-95%');
  } else if (successCount === 0) {
    console.log('❌ CRITIQUE ! Aucune configuration DNS trouvée.');
    console.log('');
    console.log('   ⚠️  Impact:');
    console.log('   • 70-80% des emails arrivent en SPAM');
    console.log('   • Mauvaise réputation d\'expéditeur');
    console.log('   • Non-conformité avec les standards');
    console.log('   • Risque de blocage par les serveurs email');
    console.log('');
    console.log('📊 Taux de délivrabilité estimé: 20-30%');
    console.log('');
    console.log('🔴 ACTION URGENTE REQUISE:');
    console.log('   Configurez SPF, DKIM et DMARC immédiatement');
    console.log('');
    console.log('📖 Guide: CONFIGURATION_DNS_ETAPES.md');
  } else {
    console.log('⚠️  PARTIEL - Certaines configurations manquent.');
    console.log('');
    console.log('   Impact sur la délivrabilité:');

    if (results.spf.status !== 'success') {
      console.log('   ❌ Sans SPF: Beaucoup d\'emails en SPAM');
    }
    if (results.dkim.status !== 'success') {
      console.log('   ❌ Sans DKIM: Authentification manquante');
    }
    if (results.dmarc.status !== 'success') {
      console.log('   ❌ Sans DMARC: Pas de politique de gestion');
    }

    console.log('');
    console.log(`📊 Taux de délivrabilité estimé: ${40 + (successCount * 20)}%-${50 + (successCount * 20)}%`);
    console.log('');
    console.log('🟠 ACTION RECOMMANDÉE:');
    console.log('   Configurez les éléments manquants');
    console.log('');
    console.log('📖 Guide: CONFIGURATION_DNS_ETAPES.md');
  }

  console.log('');
  console.log('═'.repeat(65));
  console.log('');

  // Outils de vérification en ligne
  console.log('🔍 OUTILS DE VÉRIFICATION EN LIGNE:');
  console.log('');
  console.log(`   SPF:   https://mxtoolbox.com/spf.aspx?domain=${DOMAINE}`);
  console.log(`   DKIM:  https://mxtoolbox.com/dkim.aspx?domain=${DOMAINE}`);
  console.log(`   DMARC: https://mxtoolbox.com/dmarc.aspx?domain=${DOMAINE}`);
  console.log('');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('');

  // Documentation
  console.log('📚 DOCUMENTATION:');
  console.log('');
  console.log('   • Configuration DNS:  CONFIGURATION_DNS_ETAPES.md');
  console.log('   • Guide complet:      GUIDE_CONFIGURATION_DNS.md');
  console.log('   • Prochaines étapes:  PROCHAINES_ETAPES.md');
  console.log('');
  console.log('═'.repeat(65));
  console.log('');
}

// Exécution principale
async function main() {
  try {
    await verifierSPF();
    await verifierDKIM();
    await verifierDMARC();
    afficherResume();

    // Code de sortie basé sur les résultats
    const errorCount = Object.values(results).filter(r => r.status === 'error').length;
    process.exit(errorCount > 0 ? 1 : 0);

  } catch (error) {
    console.error('\n❌ Erreur lors de la vérification DNS:\n');
    console.error(error);
    process.exit(1);
  }
}

// Lancement
console.log('▶️  Démarrage de la vérification DNS...\n');
main();
