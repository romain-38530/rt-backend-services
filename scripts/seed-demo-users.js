/**
 * SYMPHONI.A - Script de création des utilisateurs de démonstration
 * Crée des comptes sur tous les univers pour les démos client
 */

const https = require('https');
const http = require('http');

// Configuration des APIs
const APIS = {
  auth: 'http://rt-auth-api-prod.eba-g2psqhq5.eu-central-1.elasticbeanstalk.com',
  supplier: 'http://rt-supplier-space-prod.eba-ka46t2mz.eu-central-1.elasticbeanstalk.com',
  recipient: 'http://rt-recipient-space-prod.eba-xir23y3r.eu-central-1.elasticbeanstalk.com',
  orders: 'http://rt-orders-api-prod.eba-dbgatxmk.eu-central-1.elasticbeanstalk.com'
};

// Utilisateurs de démonstration à créer
const DEMO_USERS = {
  // ========== INDUSTRIELS (Clients principaux) ==========
  industrials: [
    {
      email: 'demo@agrofrance.fr',
      password: 'Demo2024!',
      company: 'AgroFrance Industries',
      role: 'admin',
      firstName: 'Jean',
      lastName: 'Dupont',
      phone: '+33612345678',
      description: 'Industriel agroalimentaire - 500 expéditions/jour'
    },
    {
      email: 'logistique@agrofrance.fr',
      password: 'Demo2024!',
      company: 'AgroFrance Industries',
      role: 'logistics_manager',
      firstName: 'Marie',
      lastName: 'Martin',
      phone: '+33623456789',
      description: 'Responsable logistique'
    },
    {
      email: 'demo@pharmalog.fr',
      password: 'Demo2024!',
      company: 'PharmaLog SA',
      role: 'admin',
      firstName: 'Pierre',
      lastName: 'Bernard',
      phone: '+33634567890',
      description: 'Industrie pharmaceutique - Transport température contrôlée'
    },
    {
      email: 'demo@autoparts.fr',
      password: 'Demo2024!',
      company: 'AutoParts Distribution',
      role: 'admin',
      firstName: 'Sophie',
      lastName: 'Leroy',
      phone: '+33645678901',
      description: 'Distribution pièces automobiles - Just-in-time'
    }
  ],

  // ========== FOURNISSEURS (Expéditeurs) ==========
  suppliers: [
    {
      email: 'expedition@usine-lyon.fr',
      password: 'Demo2024!',
      company: 'Usine Lyon Production',
      contactName: 'Paul Moreau',
      phone: '+33656789012',
      address: 'Zone Industrielle Sud, 69007 Lyon',
      industrialClient: 'AgroFrance Industries',
      description: 'Site de production Lyon - Produits frais'
    },
    {
      email: 'logistique@entrepot-marseille.fr',
      password: 'Demo2024!',
      company: 'Entrepôt Marseille Sud',
      contactName: 'Lucie Blanc',
      phone: '+33667890123',
      address: 'Port de Marseille, 13002 Marseille',
      industrialClient: 'AgroFrance Industries',
      description: 'Plateforme logistique Marseille'
    },
    {
      email: 'expedition@pharma-bordeaux.fr',
      password: 'Demo2024!',
      company: 'Pharma Bordeaux Lab',
      contactName: 'Thomas Petit',
      phone: '+33678901234',
      address: 'Parc Technologique, 33700 Mérignac',
      industrialClient: 'PharmaLog SA',
      description: 'Laboratoire pharmaceutique - Produits sensibles'
    },
    {
      email: 'stock@fournisseur-paris.fr',
      password: 'Demo2024!',
      company: 'Stock Express Paris',
      contactName: 'Emma Rousseau',
      phone: '+33689012345',
      address: 'Zone Logistique Roissy, 95700 Roissy',
      industrialClient: 'AutoParts Distribution',
      description: 'Stockage pièces automobiles'
    }
  ],

  // ========== DESTINATAIRES (Réceptionnaires) ==========
  recipients: [
    {
      email: 'reception@rungis-client.fr',
      password: 'Demo2024!',
      company: 'MIN Rungis - Hall A',
      contactName: 'François Dubois',
      phone: '+33690123456',
      address: 'MIN de Rungis, 94150 Rungis',
      industrialClient: 'AgroFrance Industries',
      description: 'Marché International Rungis'
    },
    {
      email: 'quai@supermarche-nord.fr',
      password: 'Demo2024!',
      company: 'Supermarché Distribution Nord',
      contactName: 'Claire Simon',
      phone: '+33601234567',
      address: 'Centre Logistique, 59000 Lille',
      industrialClient: 'AgroFrance Industries',
      description: 'Plateforme distribution GMS'
    },
    {
      email: 'reception@hopital-paris.fr',
      password: 'Demo2024!',
      company: 'CHU Paris Centre',
      contactName: 'Dr. Antoine Lefevre',
      phone: '+33612345670',
      address: '1 Place du Parvis, 75004 Paris',
      industrialClient: 'PharmaLog SA',
      description: 'Réception produits pharmaceutiques'
    },
    {
      email: 'magasin@garage-toulouse.fr',
      password: 'Demo2024!',
      company: 'Garage Central Toulouse',
      contactName: 'Marc Garcia',
      phone: '+33623456780',
      address: 'Avenue des Minimes, 31200 Toulouse',
      industrialClient: 'AutoParts Distribution',
      description: 'Réception pièces détachées'
    }
  ],

  // ========== TRANSPORTEURS ==========
  carriers: [
    {
      email: 'dispatch@transport-express.fr',
      password: 'Demo2024!',
      company: 'Transport Express France',
      contactName: 'Jacques Martin',
      phone: '+33634567801',
      fleet: '150 véhicules',
      specialties: ['Frigo', 'Express', 'Palettes'],
      description: 'Transport frigorifique national'
    },
    {
      email: 'planning@frigoroute.fr',
      password: 'Demo2024!',
      company: 'FrigoRoute International',
      contactName: 'Hans Schmidt',
      phone: '+33645678012',
      fleet: '80 véhicules',
      specialties: ['Frigo', 'International', 'Pharma'],
      description: 'Transport température contrôlée EU'
    },
    {
      email: 'exploitation@rapido-log.fr',
      password: 'Demo2024!',
      company: 'Rapido Logistique',
      contactName: 'Ahmed Benali',
      phone: '+33656780123',
      fleet: '200 véhicules',
      specialties: ['Express', 'Messagerie', 'Palettes'],
      description: 'Messagerie et express national'
    }
  ]
};

// Fonction pour faire des requêtes HTTP
function makeRequest(url, method, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// Créer les utilisateurs industriels
async function createIndustrials() {
  console.log('\n========== CRÉATION INDUSTRIELS ==========\n');

  for (const user of DEMO_USERS.industrials) {
    console.log(`Creating: ${user.email} (${user.company})`);
    try {
      const result = await makeRequest(
        `${APIS.auth}/api/v1/auth/register`,
        'POST',
        {
          email: user.email,
          password: user.password,
          companyName: user.company,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          role: user.role
        }
      );
      console.log(`  ✓ Status: ${result.status}`);
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
    }
  }
}

// Créer les fournisseurs via invitations
async function createSuppliers() {
  console.log('\n========== CRÉATION FOURNISSEURS ==========\n');

  for (const supplier of DEMO_USERS.suppliers) {
    console.log(`Creating: ${supplier.email} (${supplier.company})`);
    try {
      // Étape 1: Créer invitation
      const invitation = await makeRequest(
        `${APIS.supplier}/api/v1/supplier/invitations`,
        'POST',
        {
          industrialId: 'demo-industrial-001',
          industrialName: supplier.industrialClient,
          supplierEmail: supplier.email,
          supplierCompanyName: supplier.company
        }
      );
      console.log(`  ✓ Invitation: ${invitation.status}`);

      // Étape 2: Onboarding Step 1 (création compte)
      if (invitation.data && invitation.data.token) {
        const step1 = await makeRequest(
          `${APIS.supplier}/api/v1/supplier/onboarding/step1`,
          'POST',
          {
            token: invitation.data.token,
            email: supplier.email,
            password: supplier.password,
            companyName: supplier.company,
            siret: '12345678901234',
            vatNumber: 'FR12345678901',
            phone: supplier.phone,
            address: {
              street: supplier.address.split(',')[0],
              city: supplier.address.split(',')[1]?.trim() || 'France',
              postalCode: '00000',
              country: 'France'
            }
          }
        );
        console.log(`  ✓ Onboarding Step 1: ${step1.status}`);
      }
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
    }
  }
}

// Créer les destinataires via invitations
async function createRecipients() {
  console.log('\n========== CRÉATION DESTINATAIRES ==========\n');

  for (const recipient of DEMO_USERS.recipients) {
    console.log(`Creating: ${recipient.email} (${recipient.company})`);
    try {
      // Étape 1: Créer invitation
      const invitation = await makeRequest(
        `${APIS.recipient}/api/v1/recipient/invitations`,
        'POST',
        {
          industrialId: 'demo-industrial-001',
          industrialName: recipient.industrialClient,
          recipientEmail: recipient.email,
          recipientCompanyName: recipient.company
        }
      );
      console.log(`  ✓ Invitation: ${invitation.status}`);

      // Étape 2: Onboarding Step 1
      if (invitation.data && invitation.data.token) {
        const step1 = await makeRequest(
          `${APIS.recipient}/api/v1/recipient/onboarding/step1`,
          'POST',
          {
            token: invitation.data.token,
            email: recipient.email,
            password: recipient.password,
            companyName: recipient.company,
            siret: '12345678901234',
            phone: recipient.phone,
            address: {
              street: recipient.address.split(',')[0],
              city: recipient.address.split(',')[1]?.trim() || 'France',
              postalCode: '00000',
              country: 'France'
            }
          }
        );
        console.log(`  ✓ Onboarding Step 1: ${step1.status}`);
      }
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
    }
  }
}

// Afficher le récapitulatif
function printSummary() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              SYMPHONI.A - COMPTES DE DÉMONSTRATION                         ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════╣');
  console.log('║                                                                            ║');
  console.log('║  PORTAIL INDUSTRIEL (Client Principal)                                     ║');
  console.log('║  URL: https://app.symphonia.io                                             ║');
  console.log('║  ──────────────────────────────────────────────────────────────────────    ║');
  DEMO_USERS.industrials.forEach(u => {
    console.log(`║  • ${u.email.padEnd(35)} | ${u.company.substring(0,25).padEnd(25)} ║`);
  });
  console.log('║                                                                            ║');
  console.log('║  ESPACE FOURNISSEUR (Expéditeurs)                                          ║');
  console.log('║  URL: https://fournisseur.symphonia.io                                     ║');
  console.log('║  ──────────────────────────────────────────────────────────────────────    ║');
  DEMO_USERS.suppliers.forEach(u => {
    console.log(`║  • ${u.email.padEnd(35)} | ${u.company.substring(0,25).padEnd(25)} ║`);
  });
  console.log('║                                                                            ║');
  console.log('║  ESPACE DESTINATAIRE (Réceptionnaires)                                     ║');
  console.log('║  URL: https://destinataire.symphonia.io                                    ║');
  console.log('║  ──────────────────────────────────────────────────────────────────────    ║');
  DEMO_USERS.recipients.forEach(u => {
    console.log(`║  • ${u.email.padEnd(35)} | ${u.company.substring(0,25).padEnd(25)} ║`);
  });
  console.log('║                                                                            ║');
  console.log('║  TRANSPORTEURS                                                             ║');
  console.log('║  URL: https://transporteur.symphonia.io                                    ║');
  console.log('║  ──────────────────────────────────────────────────────────────────────    ║');
  DEMO_USERS.carriers.forEach(u => {
    console.log(`║  • ${u.email.padEnd(35)} | ${u.company.substring(0,25).padEnd(25)} ║`);
  });
  console.log('║                                                                            ║');
  console.log('║  Mot de passe universel: Demo2024!                                         ║');
  console.log('║                                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
}

// Main
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     SYMPHONI.A - Création des utilisateurs de démonstration    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  await createIndustrials();
  await createSuppliers();
  await createRecipients();

  printSummary();
}

main().catch(console.error);
