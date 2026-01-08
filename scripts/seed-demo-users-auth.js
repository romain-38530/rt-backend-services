/**
 * SYMPHONI.A - Seed Demo Users for Authentication
 *
 * Ce script cree les utilisateurs de demo dans la base d'authentification (rt-auth)
 * avec les mots de passe hashes correctement.
 *
 * Usage: node scripts/seed-demo-users-auth.js
 */

import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';

// Configuration - Base d'authentification
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-auth?retryWrites=true&w=majority&appName=StagingRT';
const DB_NAME = 'rt-auth';

// Couleurs console
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

async function main() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    log('green', '=== Connexion MongoDB (rt-auth) etablie ===\n');

    const db = client.db(DB_NAME);
    const usersCollection = db.collection('users');

    // Mot de passe par defaut pour tous les utilisateurs de demo
    const defaultPassword = 'Demo2025!';
    const hashedPassword = await hashPassword(defaultPassword);

    log('yellow', '>>> Creation des utilisateurs de demo...\n');

    // Utilisateurs de demo
    const demoUsers = [
      // Portail Industriel
      {
        email: 'demo.industrie@symphonia.com',
        name: 'Marie Dupont',
        role: 'admin',
        portal: 'industry'
      },
      {
        email: 'logistique@acme-industries.fr',
        name: 'Pierre Martin',
        role: 'user',
        portal: 'industry'
      },
      {
        email: 'comptabilite@acme-industries.fr',
        name: 'Claire Durand',
        role: 'user',
        portal: 'industry'
      },

      // Portail Transporteur
      {
        email: 'demo.transporteur@symphonia.com',
        name: 'Jean Durand',
        role: 'admin',
        portal: 'transporter'
      },
      {
        email: 'dispatch@trans-express.fr',
        name: 'Lucas Bernard',
        role: 'user',
        portal: 'transporter'
      },
      {
        email: 'michel.bernard@trans-express.fr',
        name: 'Michel Bernard',
        role: 'user',
        portal: 'transporter'
      },
      {
        email: 'paul.petit@trans-express.fr',
        name: 'Paul Petit',
        role: 'user',
        portal: 'transporter'
      },
      {
        email: 'admin@logispeed.fr',
        name: 'Thomas Garcia',
        role: 'admin',
        portal: 'transporter'
      },

      // Portail Logisticien
      {
        email: 'demo.logisticien@symphonia.com',
        name: 'Sophie Leroy',
        role: 'admin',
        portal: 'logistician'
      },
      {
        email: 'icpe@logistock.fr',
        name: 'Antoine Moreau',
        role: 'user',
        portal: 'logistician'
      },
      {
        email: 'rdv@logistock.fr',
        name: 'Emma Dubois',
        role: 'user',
        portal: 'logistician'
      }
    ];

    for (const user of demoUsers) {
      // Verifier si l'utilisateur existe deja
      const existing = await usersCollection.findOne({ email: user.email });

      if (existing) {
        // Mettre a jour le mot de passe
        await usersCollection.updateOne(
          { email: user.email },
          {
            $set: {
              password: hashedPassword,
              name: user.name,
              role: user.role,
              portal: user.portal
            }
          }
        );
        log('cyan', `  - ${user.name} (${user.portal}) - MIS A JOUR`);
      } else {
        // Creer l'utilisateur
        await usersCollection.insertOne({
          email: user.email,
          password: hashedPassword,
          name: user.name,
          role: user.role,
          portal: user.portal,
          createdAt: new Date()
        });
        log('cyan', `  - ${user.name} (${user.portal}) - CREE`);
      }
    }

    log('green', '\n>>> Utilisateurs de demo crees avec succes!\n');

    // Resume
    log('magenta', '╔════════════════════════════════════════════════════════════════╗');
    log('magenta', '║                    CODES D\'ACCES DEMO                           ║');
    log('magenta', '╚════════════════════════════════════════════════════════════════╝\n');

    log('green', '  PORTAIL INDUSTRIEL (https://industry.symphonia-controltower.com):');
    log('cyan', '    Email: demo.industrie@symphonia.com');
    log('cyan', '    Mot de passe: Demo2025!');

    log('green', '\n  PORTAIL TRANSPORTEUR (https://transporter.symphonia-controltower.com):');
    log('cyan', '    Email: demo.transporteur@symphonia.com');
    log('cyan', '    Mot de passe: Demo2025!');

    log('green', '\n  PORTAIL LOGISTICIEN (https://logistician.symphonia-controltower.com):');
    log('cyan', '    Email: demo.logisticien@symphonia.com');
    log('cyan', '    Mot de passe: Demo2025!');

    log('green', '\n  APPLICATION CHAUFFEUR:');
    log('cyan', '    Email: michel.bernard@trans-express.fr');
    log('cyan', '    Mot de passe: Demo2025!');

    log('magenta', '\n════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    log('red', `ERREUR: ${error.message}`);
    throw error;
  } finally {
    await client.close();
    log('yellow', 'Connexion MongoDB fermee');
  }
}

main().catch(console.error);
