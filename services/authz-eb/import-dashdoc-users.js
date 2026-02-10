/**
 * Script d'importation des utilisateurs Dashdoc vers SubUsers Symphonia
 *
 * Usage: Appeler via endpoint API POST /api/subusers/import-dashdoc
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Importe les utilisateurs SETT Transports depuis le fichier JSON
 *
 * @param {Object} SubUserModel - Modèle Mongoose SubUser
 * @param {Object} UserModel - Modèle Mongoose User
 * @param {String} parentUserId - ID du compte parent (optionnel)
 * @returns {Promise<Object>} Résultat de l'importation
 */
async function importSETTUsersFromFile(SubUserModel, UserModel, parentUserId) {
  const result = {
    success: false,
    imported: 0,
    skipped: 0,
    failed: 0,
    details: {
      imported: [],
      skipped: [],
      failed: []
    }
  };

  try {
    // Charger les utilisateurs depuis le fichier
    const filePath = path.join(__dirname, '../../sett-users.json');

    if (!fs.existsSync(filePath)) {
      throw new Error(`Fichier non trouvé: ${filePath}`);
    }

    const rawData = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(rawData);

    // Extraire les utilisateurs (ignorer "Total" si présent)
    const settUsers = Array.isArray(data) ? data : [];

    // Filtrer pour ne garder que SARL SETT TRANSPORTS
    const filteredUsers = settUsers.filter(u =>
      u.companyName === 'SARL SETT TRANSPORTS' &&
      u.email &&
      u.email.trim() !== ''
    );

    console.log(`[DashdocImport] Chargement de ${filteredUsers.length} utilisateurs SETT Transports`);

    // Trouver ou créer le compte parent si non fourni
    if (!parentUserId) {
      parentUserId = await findOrCreateSETTParentAccount(UserModel);
    }

    // Vérifier que le parent existe
    const parentUser = await UserModel.findById(parentUserId);
    if (!parentUser) {
      throw new Error(`Compte parent non trouvé: ${parentUserId}`);
    }

    console.log(`[DashdocImport] Importation pour le compte parent: ${parentUser.email}`);

    // Importer chaque utilisateur
    for (const dashdocUser of filteredUsers) {
      try {
        const email = dashdocUser.email.toLowerCase().trim();

        if (!email || !dashdocUser.firstName || !dashdocUser.lastName) {
          result.skipped++;
          result.details.skipped.push({
            email: dashdocUser.email,
            reason: 'Données manquantes (email, firstName ou lastName)'
          });
          continue;
        }

        // Vérifier si l'utilisateur existe déjà
        const existingUser = await UserModel.findOne({ email });
        const existingSubUser = await SubUserModel.findOne({ email });

        if (existingUser || existingSubUser) {
          result.skipped++;
          result.details.skipped.push({
            email,
            reason: existingUser ? 'Existe déjà comme User' : 'Existe déjà comme SubUser'
          });
          continue;
        }

        // Générer le token d'activation
        const activationToken = crypto.randomBytes(32).toString('hex');

        // Créer le SubUser
        const subUser = await SubUserModel.create({
          parentUserId,
          email,
          firstName: dashdocUser.firstName,
          lastName: dashdocUser.lastName,
          phone: dashdocUser.phone || '',
          accessLevel: 'editor',
          universes: ['transporter'],
          status: 'pending',
          activationToken,
          invitedAt: new Date()
        });

        result.imported++;
        result.details.imported.push({
          email,
          id: subUser._id.toString()
        });

        console.log(`[DashdocImport] ✓ Importé: ${email}`);

      } catch (error) {
        result.failed++;
        result.details.failed.push({
          email: dashdocUser.email,
          error: error.message
        });
        console.error(`[DashdocImport] ✗ Échec pour ${dashdocUser.email}:`, error.message);
      }
    }

    result.success = result.failed === 0;

    console.log(`[DashdocImport] Import terminé:`, {
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed
    });

    return result;

  } catch (error) {
    console.error('[DashdocImport] Erreur lors de l\'importation:', error);
    throw error;
  }
}

/**
 * Trouve ou crée le compte parent SETT Transports
 *
 * @param {Object} UserModel - Modèle Mongoose User
 * @returns {Promise<String>} ID du compte parent
 */
async function findOrCreateSETTParentAccount(UserModel) {
  // Chercher un compte SETT existant
  let settUser = await UserModel.findOne({
    email: {
      $in: [
        'r.tardy@rt-groupe.com',
        'contact@sett-transports.com',
        'exploitation@rt-groupe.com'
      ]
    }
  });

  if (settUser) {
    console.log(`[DashdocImport] Compte parent SETT trouvé: ${settUser.email}`);
    return settUser._id.toString();
  }

  // Créer un compte parent si aucun n'existe
  console.log('[DashdocImport] Création d\'un nouveau compte parent SETT');

  settUser = await UserModel.create({
    email: 'exploitation@rt-groupe.com',
    password: crypto.randomBytes(32).toString('hex'), // Mot de passe temporaire aléatoire
    name: 'SETT Transports',
    role: 'admin',
    portal: 'transporter'
  });

  console.log(`[DashdocImport] Compte parent créé: ${settUser.email} (ID: ${settUser._id})`);

  return settUser._id.toString();
}

/**
 * Compte les SubUsers par statut
 *
 * @param {Object} SubUserModel - Modèle Mongoose SubUser
 * @param {String} parentUserId - ID du compte parent
 * @returns {Promise<Object>} Compteurs par statut
 */
async function countSubUsers(SubUserModel, parentUserId) {
  const [total, active, pending, inactive] = await Promise.all([
    SubUserModel.countDocuments({ parentUserId }),
    SubUserModel.countDocuments({ parentUserId, status: 'active' }),
    SubUserModel.countDocuments({ parentUserId, status: 'pending' }),
    SubUserModel.countDocuments({ parentUserId, status: 'inactive' })
  ]);

  return { total, active, pending, inactive };
}

module.exports = {
  importSETTUsersFromFile,
  findOrCreateSETTParentAccount,
  countSubUsers
};
