/**
 * Test des liens dans les emails envoyés
 * Vérifie l'accessibilité des URLs
 */

const axios = require('axios');

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

function header(title) {
  console.log(`\n${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  log(title, 'bright');
  console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
}

// Liens utilisés dans les emails
const emailLinks = [
  {
    name: 'Onboarding Transporteur',
    url: 'https://transporteur.symphonia-controltower.com/onboarding',
    description: 'Accepter invitation et créer compte',
    email: 'Invitation Transporteur'
  },
  {
    name: 'Mise à jour Documents',
    url: 'https://transporteur.symphonia-controltower.com/documents',
    description: 'Interface de dépôt de documents',
    email: 'Alerte Vigilance'
  },
  {
    name: 'Dashboard Transporteur',
    url: 'https://transporteur.symphonia-controltower.com/dashboard',
    description: 'Tableau de bord transporteur',
    email: 'Document Vérifié'
  },
  {
    name: 'Affret.IA Dashboard',
    url: 'https://transporteur.symphonia-controltower.com/affret-ia/dashboard',
    description: 'Interface Affret.IA',
    email: 'Activation Affret.IA'
  },
  {
    name: 'Affret.IA Activation',
    url: 'https://transporteur.symphonia-controltower.com/affret-ia',
    description: 'Page d\'activation Affret.IA',
    email: 'Document Vérifié (si éligible)'
  }
];

async function testLink(link) {
  try {
    const startTime = Date.now();
    const response = await axios.get(link.url, {
      timeout: 10000,
      validateStatus: (status) => status < 500, // Accepter redirections
      maxRedirects: 5
    });
    const responseTime = Date.now() - startTime;

    return {
      success: true,
      status: response.status,
      responseTime,
      finalUrl: response.request?.res?.responseUrl || link.url,
      contentType: response.headers['content-type']
    };
  } catch (error) {
    return {
      success: false,
      error: error.code || error.message,
      status: error.response?.status
    };
  }
}

async function main() {
  try {
    header('TEST DES LIENS DANS LES EMAILS');

    log('Liens à tester:', 'cyan');
    emailLinks.forEach((link, i) => {
      log(`  ${i + 1}. ${link.name} - ${link.url}`, 'cyan');
    });

    header('RÉSULTATS DES TESTS');

    const results = [];

    for (const link of emailLinks) {
      log(`\nTest: ${link.name}`, 'bright');
      log(`  URL: ${link.url}`, 'cyan');
      log(`  Email: ${link.email}`, 'cyan');
      log(`  Description: ${link.description}`, 'cyan');
      log('  Vérification...', 'yellow');

      const result = await testLink(link);

      if (result.success) {
        const statusColor = result.status === 200 ? 'green' :
                           result.status >= 300 && result.status < 400 ? 'yellow' : 'red';

        log(`  ✓ Status: ${result.status}`, statusColor);
        log(`  ✓ Temps de réponse: ${result.responseTime}ms`, 'green');

        if (result.finalUrl !== link.url) {
          log(`  ↪ Redirection vers: ${result.finalUrl}`, 'yellow');
        }

        if (result.contentType) {
          log(`  ✓ Content-Type: ${result.contentType}`, 'cyan');
        }

        results.push({
          name: link.name,
          status: 'OK',
          httpStatus: result.status,
          responseTime: result.responseTime
        });

      } else {
        log(`  ✗ Erreur: ${result.error}`, 'red');
        if (result.status) {
          log(`  ✗ HTTP Status: ${result.status}`, 'red');
        }

        results.push({
          name: link.name,
          status: 'ERREUR',
          error: result.error,
          httpStatus: result.status
        });
      }
    }

    header('RÉSUMÉ');

    const successful = results.filter(r => r.status === 'OK').length;
    const failed = results.filter(r => r.status === 'ERREUR').length;

    console.log(`${colors.bright}Résultats:${colors.reset}`);
    log(`  Total testé: ${results.length}`, 'cyan');
    log(`  Succès: ${successful}`, successful === results.length ? 'green' : 'yellow');
    log(`  Échecs: ${failed}`, failed === 0 ? 'green' : 'red');

    console.log(`\n${colors.bright}Détails:${colors.reset}`);
    results.forEach((result, i) => {
      const statusIcon = result.status === 'OK' ? '✓' : '✗';
      const statusColor = result.status === 'OK' ? 'green' : 'red';

      log(`  ${i + 1}. ${statusIcon} ${result.name}`, statusColor);

      if (result.status === 'OK') {
        log(`     HTTP ${result.httpStatus} - ${result.responseTime}ms`, 'cyan');
      } else {
        log(`     ${result.error}`, 'red');
      }
    });

    // Recommandations
    header('RECOMMANDATIONS');

    if (failed > 0) {
      log('⚠️ Certains liens ne sont pas accessibles', 'yellow');
      log('\nActions recommandées:', 'cyan');

      results.filter(r => r.status === 'ERREUR').forEach((result, i) => {
        log(`\n${i + 1}. ${result.name}:`, 'yellow');

        if (result.error === 'ENOTFOUND') {
          log('   → Le domaine n\'existe pas ou n\'est pas résolvable', 'red');
          log('   → Vérifier la configuration DNS', 'cyan');
          log('   → Ou remplacer par l\'URL correcte dans les templates', 'cyan');
        } else if (result.error === 'ECONNREFUSED') {
          log('   → Le serveur refuse la connexion', 'red');
          log('   → Vérifier que l\'application frontend est déployée', 'cyan');
        } else if (result.httpStatus === 404) {
          log('   → Page non trouvée', 'red');
          log('   → Créer la route dans l\'application frontend', 'cyan');
        } else if (result.httpStatus >= 500) {
          log('   → Erreur serveur', 'red');
          log('   → Vérifier les logs de l\'application', 'cyan');
        } else {
          log(`   → Erreur: ${result.error}`, 'red');
        }
      });

      log('\n💡 Solutions temporaires:', 'cyan');
      log('   1. Utiliser des liens de développement (localhost)', 'cyan');
      log('   2. Déployer l\'application frontend transporteur', 'cyan');
      log('   3. Configurer les DNS pour symphonia-controltower.com', 'cyan');
      log('   4. Ou désactiver les liens dans les emails de test', 'cyan');

    } else {
      log('✅ Tous les liens fonctionnent correctement!', 'green');
      log('\nL\'infrastructure frontend est opérationnelle:', 'cyan');
      emailLinks.forEach(link => {
        log(`  ✓ ${link.url}`, 'green');
      });
    }

    // Vérification domaine
    header('VÉRIFICATION DNS');

    log('Test de résolution DNS pour symphonia-controltower.com...', 'yellow');

    try {
      await axios.get('https://symphonia-controltower.com', { timeout: 5000 });
      log('✓ Domaine principal accessible', 'green');
    } catch (error) {
      if (error.code === 'ENOTFOUND') {
        log('✗ Domaine non résolu par DNS', 'red');
        log('  → Configurer les enregistrements DNS:', 'cyan');
        log('     A record: symphonia-controltower.com → IP serveur', 'cyan');
        log('     A record: transporteur.symphonia-controltower.com → IP serveur', 'cyan');
      } else if (error.response?.status === 404) {
        log('✓ Domaine résolu mais pas de site à la racine (normal)', 'yellow');
      } else {
        log(`⚠️ ${error.message}`, 'yellow');
      }
    }

    console.log('');

  } catch (error) {
    console.error(`\n${colors.red}❌ ERREUR:${colors.reset}`);
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack:', error.stack);
    }
    process.exit(1);
  }
}

main();
