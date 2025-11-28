#!/usr/bin/env node

/**
 * Script de Configuration DNS Production - RT SYMPHONI.A
 *
 * Utilise l'API OVH intégrée dans subscriptions-contracts-eb
 * pour configurer automatiquement tous les enregistrements DNS
 */

const axios = require('axios');

// URL de l'API subscriptions-contracts (déjà déployée sur AWS EB)
const API_BASE_URL = 'http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com';

const DOMAIN = 'symphonia-controltower.com';

// Configuration DNS
const DNS_CONFIG = {
  frontend: {
    'app': 'julien.dntbizetlc7bm.amplifyapp.com',
    'industrie': 'julien.dbg6okncuyyiw.amplifyapp.com',
    'transporteur': 'julien.d1tb834u144p4r.amplifyapp.com',
    'destinataire': 'julien.d3b6p09ihn5w7r.amplifyapp.com',
    'fournisseur': 'julien.dzvo8973zaqb.amplifyapp.com',
    'transitaire': 'julien.d3hz3xvddrl94o.amplifyapp.com',
    'logisticien': 'julien.d31p7m90ewg4xm.amplifyapp.com'
  },
  backend: {
    'auth': 'rt-auth-api-prod.eba-g2psqhq5.eu-central-1.elasticbeanstalk.com',
    'authz': 'rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com',
    'orders': 'rt-orders-api-prod.eba-dbgatxmk.eu-central-1.elasticbeanstalk.com',
    'notifications': 'rt-notifications-api-prod.eba-usjgee8u.eu-central-1.elasticbeanstalk.com',
    'planning': 'rt-planning-api-prod.eba-gbhspa2p.eu-central-1.elasticbeanstalk.com',
    'tracking': 'rt-geo-tracking-api-prod.eba-3mi2pcfi.eu-central-1.elasticbeanstalk.com',
    'ecmr': 'rt-ecmr-api-prod.eba-43ngua6v.eu-central-1.elasticbeanstalk.com',
    'palettes': 'rt-palettes-api-prod.eba-peea8hx2.eu-central-1.elasticbeanstalk.com',
    'vigilance': 'rt-vigilance-api-prod.eba-kmvyig6m.eu-central-1.elasticbeanstalk.com',
    'affretia': 'rt-affret-ia-api-prod-v2.eba-quc9udpr.eu-central-1.elasticbeanstalk.com',
    'ws': 'rt-websocket-api-prod.eba-nedjyqk3.eu-central-1.elasticbeanstalk.com'
  }
};

/**
 * Créer un enregistrement DNS CNAME
 */
async function createCNAME(subDomain, target) {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/ovhcloud/dns/records`, {
      subDomain,
      fieldType: 'CNAME',
      target: target.endsWith('.') ? target : target + '.',
      ttl: 3600
    });
    console.log(`  ✅ ${subDomain}.${DOMAIN} → ${target}`);
    return response.data;
  } catch (error) {
    if (error.response?.data) {
      console.error(`  ❌ ${subDomain}.${DOMAIN} : ${error.response.data.message || error.message}`);
    } else {
      console.error(`  ❌ ${subDomain}.${DOMAIN} : ${error.message}`);
    }
    return null;
  }
}

/**
 * Lister les enregistrements DNS existants
 */
async function listDNSRecords() {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/ovhcloud/dns/records`);
    return response.data.data || [];
  } catch (error) {
    console.error('Erreur lors de la récupération des enregistrements DNS:', error.message);
    return [];
  }
}

/**
 * Vérifier le statut de l'API OVH
 */
async function checkAPIStatus() {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/ovhcloud/status`);
    return response.data.success;
  } catch (error) {
    console.error('API OVH non accessible:', error.message);
    return false;
  }
}

/**
 * Fonction principale
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || !args.includes('--execute');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Configuration DNS Production - RT SYMPHONI.A');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();
  console.log(`Domaine    : ${DOMAIN}`);
  console.log(`API OVH    : ${API_BASE_URL}`);
  console.log(`Mode       : ${dryRun ? '🔍 DRY RUN' : '⚡ EXECUTION'}`);
  console.log();

  // Vérifier le statut de l'API
  console.log('📡 Vérification de l\'API OVH...');
  const apiOk = await checkAPIStatus();

  if (!apiOk) {
    console.error('❌ L\'API OVH n\'est pas accessible');
    console.error('   Vérifier que le service subscriptions-contracts est déployé');
    process.exit(1);
  }
  console.log('✅ API OVH accessible');
  console.log();

  if (dryRun) {
    // Mode simulation - afficher ce qui serait créé
    console.log('─────────────────────────────────────────────────────────');
    console.log('📋 FRONTEND - Portails Amplify (7 CNAME)');
    console.log('─────────────────────────────────────────────────────────');
    for (const [sub, target] of Object.entries(DNS_CONFIG.frontend)) {
      console.log(`  ${sub.padEnd(15)} → ${target}`);
    }

    console.log();
    console.log('─────────────────────────────────────────────────────────');
    console.log('🔧 BACKEND - APIs Elastic Beanstalk (11 CNAME)');
    console.log('─────────────────────────────────────────────────────────');
    for (const [sub, target] of Object.entries(DNS_CONFIG.backend)) {
      console.log(`  ${sub.padEnd(15)} → ${target}`);
    }

    console.log();
    console.log('💡 Pour exécuter la configuration :');
    console.log('   node configure-production-dns.js --execute');
    console.log();
  } else {
    // Mode exécution
    console.log('⚡ Création des enregistrements DNS...');
    console.log();

    console.log('📋 Frontend (Amplify) :');
    for (const [sub, target] of Object.entries(DNS_CONFIG.frontend)) {
      await createCNAME(sub, target);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
    }

    console.log();
    console.log('🔧 Backend (Elastic Beanstalk) :');
    for (const [sub, target] of Object.entries(DNS_CONFIG.backend)) {
      await createCNAME(sub, target);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
    }

    console.log();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ✅ Configuration DNS terminée !');
    console.log('═══════════════════════════════════════════════════════════');
    console.log();
    console.log('⏳ Propagation DNS : 15 minutes à 24 heures');
    console.log();
    console.log('🔍 Vérifier la propagation :');
    console.log('   dig app.symphonia-controltower.com');
    console.log('   nslookup auth.symphonia-controltower.com');
    console.log();
    console.log('📋 Lister les enregistrements :');
    console.log(`   curl ${API_BASE_URL}/api/ovhcloud/dns/records`);
    console.log();
  }
}

// Exécution
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  });
}
