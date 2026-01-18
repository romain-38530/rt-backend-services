/**
 * Auth Sync Service
 * SYMPHONI.A - RT Technologie
 *
 * Service de synchronisation des comptes entre rt-subscriptions et rt-auth.
 * Permet aux utilisateurs inscrits via subscriptions-contracts-eb de se connecter
 * sur les portails frontend (transporteur, industrie, etc.) qui utilisent authz-eb.
 *
 * @version 1.0.0
 */

const { MongoClient } = require('mongodb');

// Connection URI pour la base rt-auth (celle utilisée par authz-eb)
const AUTH_DB_URI = process.env.AUTH_DB_URI || process.env.MONGODB_URI;
const AUTH_DB_NAME = 'rt-auth';

let authDbClient = null;
let authDb = null;
let isConnected = false;

/**
 * Initialise la connexion à la base rt-auth
 * Cette base est séparée de rt-subscriptions et est utilisée par authz-eb
 */
async function initAuthDbConnection() {
  if (isConnected && authDbClient) {
    return authDb;
  }

  try {
    // Créer une nouvelle connexion spécifiquement pour rt-auth
    authDbClient = new MongoClient(AUTH_DB_URI);
    await authDbClient.connect();
    authDb = authDbClient.db(AUTH_DB_NAME);
    isConnected = true;
    console.log('[AuthSync] Connected to rt-auth database');
    return authDb;
  } catch (error) {
    console.error('[AuthSync] Failed to connect to rt-auth:', error.message);
    isConnected = false;
    throw error;
  }
}

/**
 * Ferme la connexion à rt-auth
 */
async function closeAuthDbConnection() {
  if (authDbClient) {
    await authDbClient.close();
    authDbClient = null;
    authDb = null;
    isConnected = false;
    console.log('[AuthSync] Disconnected from rt-auth database');
  }
}

/**
 * Mappe le rôle de subscriptions-contracts vers le portal de authz-eb
 * @param {string} role - Role dans subscriptions-contracts (carrier, industrial, admin)
 * @returns {string} Portal dans authz-eb
 */
function mapRoleToPortal(role) {
  const roleMapping = {
    'carrier': 'transporter',
    'transporter': 'transporter',
    'industrial': 'industry',
    'industry': 'industry',
    'supplier': 'supplier',
    'recipient': 'recipient',
    'forwarder': 'forwarder',
    'logistician': 'logistician',
    'admin': 'backoffice'
  };
  return roleMapping[role] || 'transporter';
}

/**
 * Synchronise un utilisateur vers la base rt-auth
 * Crée ou met à jour l'utilisateur dans rt-auth pour permettre la connexion sur les portails
 *
 * @param {Object} user - Données utilisateur à synchroniser
 * @param {string} user.email - Email de l'utilisateur
 * @param {string} user.password - Mot de passe hashé (bcrypt)
 * @param {string} user.name - Nom complet
 * @param {string} user.firstName - Prénom
 * @param {string} user.lastName - Nom de famille
 * @param {string} user.role - Rôle (carrier, industrial, admin)
 * @param {string} user.companyName - Nom de l'entreprise
 * @param {Object} user.organization - Détails organisation (siret, vatNumber, address)
 * @param {Object} user.subscription - Infos abonnement
 * @returns {Object} Résultat de la synchronisation
 */
async function syncUserToAuthDb(user) {
  try {
    // Initialiser la connexion si nécessaire
    const db = await initAuthDbConnection();
    const usersCollection = db.collection('users');

    // Mapper le role vers le portal
    const portal = mapRoleToPortal(user.role);

    // Chercher si l'utilisateur existe déjà dans rt-auth
    const existingUser = await usersCollection.findOne({
      email: user.email.toLowerCase()
    });

    const now = new Date();

    if (existingUser) {
      // Mettre à jour l'utilisateur existant
      await usersCollection.updateOne(
        { _id: existingUser._id },
        {
          $set: {
            password: user.password,
            name: user.name || existingUser.name,
            firstName: user.firstName || existingUser.firstName,
            lastName: user.lastName || existingUser.lastName,
            portal: portal,
            role: user.role === 'admin' ? 'admin' : 'user',
            companyName: user.companyName || existingUser.companyName,
            phone: user.phone || existingUser.phone,
            organization: user.organization || existingUser.organization,
            modules: user.modules || existingUser.modules,
            subscription: user.subscription || existingUser.subscription,
            accountType: user.accountType || existingUser.accountType,
            accountStatus: user.accountStatus || 'active',
            updatedAt: now,
            syncedAt: now,
            syncedFrom: 'subscriptions-contracts-eb'
          }
        }
      );

      console.log(`[AuthSync] Updated user ${user.email} in rt-auth (ID: ${existingUser._id})`);
      return {
        success: true,
        action: 'updated',
        userId: existingUser._id.toString(),
        email: user.email
      };
    } else {
      // Créer un nouvel utilisateur dans rt-auth
      const newAuthUser = {
        email: user.email.toLowerCase().trim(),
        password: user.password,
        name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || null,
        firstName: user.firstName || null,
        lastName: user.lastName || null,
        portal: portal,
        role: user.role === 'admin' ? 'admin' : 'user',
        companyName: user.companyName || null,
        phone: user.phone || null,
        organization: user.organization || null,
        modules: user.modules || {},
        subscription: user.subscription || null,
        accountType: user.accountType || 'standard',
        accountStatus: user.accountStatus || 'active',
        createdAt: now,
        updatedAt: now,
        syncedAt: now,
        syncedFrom: 'subscriptions-contracts-eb'
      };

      const result = await usersCollection.insertOne(newAuthUser);

      console.log(`[AuthSync] Created user ${user.email} in rt-auth (ID: ${result.insertedId})`);
      return {
        success: true,
        action: 'created',
        userId: result.insertedId.toString(),
        email: user.email
      };
    }
  } catch (error) {
    console.error(`[AuthSync] Failed to sync user ${user.email}:`, error.message);
    return {
      success: false,
      error: error.message,
      email: user.email
    };
  }
}

/**
 * Supprime un utilisateur de la base rt-auth
 * Utilisé lors de la suppression d'un compte
 *
 * @param {string} email - Email de l'utilisateur à supprimer
 * @returns {Object} Résultat de la suppression
 */
async function deleteUserFromAuthDb(email) {
  try {
    const db = await initAuthDbConnection();
    const usersCollection = db.collection('users');

    const result = await usersCollection.deleteOne({
      email: email.toLowerCase()
    });

    if (result.deletedCount > 0) {
      console.log(`[AuthSync] Deleted user ${email} from rt-auth`);
      return { success: true, deleted: true, email };
    } else {
      console.log(`[AuthSync] User ${email} not found in rt-auth`);
      return { success: true, deleted: false, email };
    }
  } catch (error) {
    console.error(`[AuthSync] Failed to delete user ${email}:`, error.message);
    return { success: false, error: error.message, email };
  }
}

/**
 * Met à jour le mot de passe d'un utilisateur dans rt-auth
 *
 * @param {string} email - Email de l'utilisateur
 * @param {string} hashedPassword - Nouveau mot de passe hashé (bcrypt)
 * @returns {Object} Résultat de la mise à jour
 */
async function updatePasswordInAuthDb(email, hashedPassword) {
  try {
    const db = await initAuthDbConnection();
    const usersCollection = db.collection('users');

    const result = await usersCollection.updateOne(
      { email: email.toLowerCase() },
      {
        $set: {
          password: hashedPassword,
          updatedAt: new Date(),
          syncedAt: new Date()
        }
      }
    );

    if (result.matchedCount > 0) {
      console.log(`[AuthSync] Updated password for ${email} in rt-auth`);
      return { success: true, updated: true, email };
    } else {
      console.log(`[AuthSync] User ${email} not found in rt-auth for password update`);
      return { success: true, updated: false, email };
    }
  } catch (error) {
    console.error(`[AuthSync] Failed to update password for ${email}:`, error.message);
    return { success: false, error: error.message, email };
  }
}

/**
 * Met à jour l'abonnement d'un utilisateur dans rt-auth
 *
 * @param {string} email - Email de l'utilisateur
 * @param {Object} subscription - Nouvelles données d'abonnement
 * @returns {Object} Résultat de la mise à jour
 */
async function updateSubscriptionInAuthDb(email, subscription) {
  try {
    const db = await initAuthDbConnection();
    const usersCollection = db.collection('users');

    const result = await usersCollection.updateOne(
      { email: email.toLowerCase() },
      {
        $set: {
          subscription: subscription,
          updatedAt: new Date(),
          syncedAt: new Date()
        }
      }
    );

    if (result.matchedCount > 0) {
      console.log(`[AuthSync] Updated subscription for ${email} in rt-auth`);
      return { success: true, updated: true, email };
    } else {
      console.log(`[AuthSync] User ${email} not found in rt-auth for subscription update`);
      return { success: true, updated: false, email };
    }
  } catch (error) {
    console.error(`[AuthSync] Failed to update subscription for ${email}:`, error.message);
    return { success: false, error: error.message, email };
  }
}

/**
 * Vérifie si un utilisateur existe dans rt-auth
 *
 * @param {string} email - Email de l'utilisateur
 * @returns {Object} Résultat de la vérification
 */
async function checkUserExistsInAuthDb(email) {
  try {
    const db = await initAuthDbConnection();
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne(
      { email: email.toLowerCase() },
      { projection: { _id: 1, email: 1, portal: 1, accountStatus: 1 } }
    );

    return {
      success: true,
      exists: !!user,
      user: user || null
    };
  } catch (error) {
    console.error(`[AuthSync] Failed to check user ${email}:`, error.message);
    return { success: false, error: error.message, exists: false };
  }
}

module.exports = {
  initAuthDbConnection,
  closeAuthDbConnection,
  syncUserToAuthDb,
  deleteUserFromAuthDb,
  updatePasswordInAuthDb,
  updateSubscriptionInAuthDb,
  checkUserExistsInAuthDb,
  mapRoleToPortal
};
