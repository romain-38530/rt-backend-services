/**
 * Service d'importation des utilisateurs Dashdoc vers Symphonia SubUsers
 *
 * Ce service permet d'importer automatiquement les contacts Dashdoc
 * comme membres d'équipe (SubUsers) dans Symphonia avec système d'invitation par email.
 */

import crypto from 'crypto';
import SubUser, { AccessLevel, Universe } from '../models/SubUser';
import User from '../models/User';

interface DashdocUser {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  companyName: string;
  companyId: number;
  source: string;
}

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  failed: number;
  details: {
    imported: Array<{ email: string; id: string }>;
    skipped: Array<{ email: string; reason: string }>;
    failed: Array<{ email: string; error: string }>;
  };
}

export class DashdocUserImportService {
  /**
   * Importe les utilisateurs Dashdoc comme SubUsers
   *
   * @param parentUserId - ID du compte parent (SETT Transports)
   * @param dashdocUsers - Liste des utilisateurs Dashdoc à importer
   * @param options - Options d'importation
   * @returns Résultat de l'importation avec statistiques
   */
  async importDashdocUsers(
    parentUserId: string,
    dashdocUsers: DashdocUser[],
    options: {
      defaultAccessLevel?: AccessLevel;
      defaultUniverses?: Universe[];
      skipExisting?: boolean;
      sendInvitations?: boolean;
    } = {}
  ): Promise<ImportResult> {
    const {
      defaultAccessLevel = 'editor',
      defaultUniverses = ['transporter'],
      skipExisting = true,
      sendInvitations = false,
    } = options;

    const result: ImportResult = {
      success: false,
      imported: 0,
      skipped: 0,
      failed: 0,
      details: {
        imported: [],
        skipped: [],
        failed: [],
      },
    };

    // Vérifier que le parent user existe
    const parentUser = await User.findById(parentUserId);
    if (!parentUser) {
      throw new Error(`Parent user not found: ${parentUserId}`);
    }

    console.log(`[DashdocImport] Starting import of ${dashdocUsers.length} users for parent ${parentUser.email}`);

    for (const dashdocUser of dashdocUsers) {
      try {
        const email = dashdocUser.email.toLowerCase().trim();

        if (!email || !dashdocUser.firstName || !dashdocUser.lastName) {
          result.skipped++;
          result.details.skipped.push({
            email: dashdocUser.email,
            reason: 'Email, firstName, or lastName missing',
          });
          continue;
        }

        // Vérifier si l'utilisateur existe déjà
        const existingUser = await User.findOne({ email });
        const existingSubUser = await SubUser.findOne({ email });

        if (existingUser || existingSubUser) {
          if (skipExisting) {
            result.skipped++;
            result.details.skipped.push({
              email,
              reason: existingUser ? 'Already exists as User' : 'Already exists as SubUser',
            });
            continue;
          } else {
            // Mettre à jour le SubUser existant
            if (existingSubUser && existingSubUser.parentUserId.toString() === parentUserId) {
              existingSubUser.firstName = dashdocUser.firstName;
              existingSubUser.lastName = dashdocUser.lastName;
              existingSubUser.phone = dashdocUser.phone;
              await existingSubUser.save();

              result.skipped++;
              result.details.skipped.push({
                email,
                reason: 'Updated existing SubUser',
              });
              continue;
            } else {
              result.skipped++;
              result.details.skipped.push({
                email,
                reason: 'Belongs to different parent or is main User',
              });
              continue;
            }
          }
        }

        // Générer le token d'activation
        const activationToken = crypto.randomBytes(32).toString('hex');

        // Créer le SubUser
        const subUser = await SubUser.create({
          parentUserId,
          email,
          firstName: dashdocUser.firstName,
          lastName: dashdocUser.lastName,
          phone: dashdocUser.phone || '',
          accessLevel: defaultAccessLevel,
          universes: defaultUniverses,
          status: 'pending',
          activationToken,
          invitedAt: new Date(),
        });

        result.imported++;
        result.details.imported.push({
          email,
          id: subUser._id.toString(),
        });

        console.log(`[DashdocImport] ✓ Imported: ${email}`);

        // TODO: Envoyer l'email d'invitation si sendInvitations = true
        if (sendInvitations) {
          await this.sendInvitationEmail(subUser, parentUser, activationToken);
        }
      } catch (error: any) {
        result.failed++;
        result.details.failed.push({
          email: dashdocUser.email,
          error: error.message,
        });
        console.error(`[DashdocImport] ✗ Failed to import ${dashdocUser.email}:`, error.message);
      }
    }

    result.success = result.failed === 0;

    console.log(`[DashdocImport] Import complete:`, {
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
    });

    return result;
  }

  /**
   * Trouve ou crée le compte parent SETT Transports
   *
   * @returns L'ID du compte parent
   */
  async findOrCreateSETTParentAccount(): Promise<string> {
    // Chercher un compte SETT Transports existant
    let settUser = await User.findOne({
      email: { $in: ['r.tardy@rt-groupe.com', 'contact@sett-transports.com', 'exploitation@rt-groupe.com'] },
    });

    if (settUser) {
      console.log(`[DashdocImport] Found existing SETT parent account: ${settUser.email}`);
      return settUser._id.toString();
    }

    // Créer un compte parent si aucun n'existe
    console.log('[DashdocImport] Creating new SETT parent account');

    settUser = await User.create({
      email: 'exploitation@rt-groupe.com',
      password: crypto.randomBytes(32).toString('hex'), // Mot de passe temporaire aléatoire
      name: 'SETT Transports',
      role: 'admin',
      portal: 'transporter',
    });

    console.log(`[DashdocImport] Created SETT parent account: ${settUser.email} (ID: ${settUser._id})`);

    return settUser._id.toString();
  }

  /**
   * Importe les utilisateurs SETT Transports depuis le fichier JSON
   *
   * @param parentUserId - ID du compte parent (optionnel, sera créé si absent)
   * @returns Résultat de l'importation
   */
  async importSETTUsersFromFile(parentUserId?: string): Promise<ImportResult> {
    try {
      // Charger les utilisateurs depuis le fichier
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, '../../../../sett-users.json');

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const rawData = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(rawData);

      // Extraire uniquement les utilisateurs SETT (ignorer le "Total" en début de fichier)
      const settUsers = Array.isArray(data) ? data : [];

      // Filtrer pour ne garder que les utilisateurs "SARL SETT TRANSPORTS"
      const filteredUsers = settUsers.filter((u: DashdocUser) =>
        u.companyName === 'SARL SETT TRANSPORTS' && u.email && u.email.trim() !== ''
      );

      console.log(`[DashdocImport] Loaded ${filteredUsers.length} SETT Transports users from file`);

      // Trouver ou créer le compte parent si non fourni
      if (!parentUserId) {
        parentUserId = await this.findOrCreateSETTParentAccount();
      }

      // Importer les utilisateurs
      return await this.importDashdocUsers(parentUserId, filteredUsers, {
        defaultAccessLevel: 'editor',
        defaultUniverses: ['transporter'],
        skipExisting: true,
        sendInvitations: false, // On n'envoie pas encore les emails automatiquement
      });
    } catch (error: any) {
      console.error('[DashdocImport] Error loading SETT users from file:', error);
      throw error;
    }
  }

  /**
   * Envoie un email d'invitation à un SubUser
   *
   * @param subUser - Le SubUser à inviter
   * @param parentUser - Le compte parent
   * @param activationToken - Le token d'activation
   */
  private async sendInvitationEmail(
    subUser: any,
    parentUser: any,
    activationToken: string
  ): Promise<void> {
    // TODO: Implémenter l'envoi d'email via AWS SES ou autre service
    // Pour l'instant, on log simplement le lien d'activation

    const activationUrl = `https://transporter.symphonia-controltower.com/activate?token=${activationToken}&email=${encodeURIComponent(subUser.email)}`;

    console.log(`[DashdocImport] Invitation email for ${subUser.email}:`);
    console.log(`  Activation URL: ${activationUrl}`);
    console.log(`  Parent: ${parentUser.name} (${parentUser.email})`);

    // TODO: Appeler le service d'envoi d'email ici
    // await emailService.sendInvitation(subUser.email, {
    //   firstName: subUser.firstName,
    //   activationUrl,
    //   parentCompany: 'SETT Transports'
    // });
  }

  /**
   * Compte le nombre de SubUsers pour un parent
   *
   * @param parentUserId - ID du compte parent
   * @returns Nombre de SubUsers (tous statuts confondus)
   */
  async countSubUsers(parentUserId: string): Promise<{
    total: number;
    active: number;
    pending: number;
    inactive: number;
  }> {
    const [total, active, pending, inactive] = await Promise.all([
      SubUser.countDocuments({ parentUserId }),
      SubUser.countDocuments({ parentUserId, status: 'active' }),
      SubUser.countDocuments({ parentUserId, status: 'pending' }),
      SubUser.countDocuments({ parentUserId, status: 'inactive' }),
    ]);

    return { total, active, pending, inactive };
  }
}

// Export singleton instance
export const dashdocUserImportService = new DashdocUserImportService();
