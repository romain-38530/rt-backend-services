/**
 * Two-Factor Authentication Service (2FA)
 * SYMPHONI.A - RT Technologie
 *
 * Service d'authentification à deux facteurs par email.
 * Après une connexion réussie, un code OTP est envoyé par email
 * et doit être saisi pour obtenir le token d'accès final.
 *
 * @version 1.0.0
 * @security CRITICAL
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');

// ============================================================================
// CONFIGURATION
// ============================================================================

const TWO_FA_CONFIG = {
  // OTP Settings
  otpLength: 6,                     // 6 chiffres
  otpExpiryMinutes: 5,              // 5 minutes de validité
  maxAttempts: 3,                   // 3 tentatives max
  cooldownSeconds: 60,              // 60s entre les renvois

  // Session Settings
  pendingSessionExpiry: 10 * 60 * 1000,  // 10 minutes pour compléter le 2FA

  // Blocage progressif
  blockThresholds: [
    { attempts: 5, blockMinutes: 15 },
    { attempts: 10, blockMinutes: 60 },
    { attempts: 20, blockMinutes: 1440 }  // 24 heures
  ],

  // Hashing
  bcryptRounds: 10
};

// ============================================================================
// SERVICE 2FA
// ============================================================================

class TwoFactorAuthService {
  /**
   * @param {Db} db - Instance MongoDB
   * @param {Function} sendEmailFn - Fonction d'envoi d'email
   */
  constructor(db, sendEmailFn = null) {
    this.db = db;
    this.sendEmail = sendEmailFn;
    this.pendingSessions = db.collection('two_fa_sessions');
    this.blockList = db.collection('two_fa_blocks');

    // Créer les index nécessaires
    this._createIndexes();
  }

  /**
   * Crée les index MongoDB
   * @private
   */
  async _createIndexes() {
    try {
      // Index pour les sessions en attente
      await this.pendingSessions.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0 }
      );
      await this.pendingSessions.createIndex({ sessionId: 1 }, { unique: true });
      await this.pendingSessions.createIndex({ userId: 1 });

      // Index pour les blocages
      await this.blockList.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0 }
      );
      await this.blockList.createIndex({ identifier: 1 });
    } catch (error) {
      console.warn('[2FA] Index creation warning:', error.message);
    }
  }

  /**
   * Génère un code OTP sécurisé
   * @returns {string} Code OTP
   * @private
   */
  _generateOTP() {
    const buffer = crypto.randomBytes(4);
    const num = buffer.readUInt32BE(0);
    const max = Math.pow(10, TWO_FA_CONFIG.otpLength);
    return (num % max).toString().padStart(TWO_FA_CONFIG.otpLength, '0');
  }

  /**
   * Génère un ID de session unique
   * @returns {string} Session ID
   * @private
   */
  _generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Vérifie si un utilisateur/IP est bloqué
   * @param {string} identifier - Email ou IP
   * @returns {Promise<Object|null>} Info de blocage ou null
   */
  async checkBlock(identifier) {
    const block = await this.blockList.findOne({
      identifier: identifier.toLowerCase(),
      expiresAt: { $gt: new Date() }
    });

    if (block) {
      const remainingMinutes = Math.ceil(
        (block.expiresAt.getTime() - Date.now()) / 60000
      );
      return {
        blocked: true,
        reason: block.reason,
        remainingMinutes,
        expiresAt: block.expiresAt
      };
    }

    return null;
  }

  /**
   * Incrémente le compteur d'échecs et applique un blocage si nécessaire
   * @param {string} identifier - Email ou IP
   * @param {string} reason - Raison de l'échec
   * @private
   */
  async _incrementFailures(identifier, reason = 'too_many_attempts') {
    const key = identifier.toLowerCase();

    // Incrémenter le compteur
    const result = await this.blockList.findOneAndUpdate(
      { identifier: key, type: 'counter' },
      {
        $inc: { attempts: 1 },
        $set: { lastAttempt: new Date() },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true, returnDocument: 'after' }
    );

    const attempts = result.attempts || 1;

    // Vérifier si un blocage est nécessaire
    for (const threshold of TWO_FA_CONFIG.blockThresholds) {
      if (attempts >= threshold.attempts) {
        const expiresAt = new Date(Date.now() + threshold.blockMinutes * 60000);

        await this.blockList.updateOne(
          { identifier: key, type: 'block' },
          {
            $set: {
              reason,
              expiresAt,
              attempts,
              updatedAt: new Date()
            },
            $setOnInsert: { createdAt: new Date() }
          },
          { upsert: true }
        );

        console.warn(`[2FA] Blocked ${key} for ${threshold.blockMinutes} minutes after ${attempts} attempts`);
        break;
      }
    }
  }

  /**
   * Réinitialise le compteur d'échecs après une réussite
   * @param {string} identifier - Email ou IP
   * @private
   */
  async _resetFailures(identifier) {
    const key = identifier.toLowerCase();
    await this.blockList.deleteMany({ identifier: key });
  }

  /**
   * Initie le processus 2FA après une connexion réussie
   *
   * @param {Object} user - Utilisateur authentifié
   * @param {Object} options - Options
   * @param {string} options.ip - Adresse IP
   * @param {string} options.userAgent - User Agent
   * @returns {Promise<Object>} Résultat avec sessionId
   */
  async initiate2FA(user, options = {}) {
    const { ip, userAgent } = options;

    // Vérifier les blocages
    const emailBlock = await this.checkBlock(user.email);
    if (emailBlock) {
      return {
        success: false,
        error: {
          code: '2FA_BLOCKED',
          message: `Trop de tentatives. Réessayez dans ${emailBlock.remainingMinutes} minutes.`,
          blockedUntil: emailBlock.expiresAt
        }
      };
    }

    if (ip) {
      const ipBlock = await this.checkBlock(ip);
      if (ipBlock) {
        return {
          success: false,
          error: {
            code: '2FA_BLOCKED',
            message: `Trop de tentatives depuis cette adresse IP. Réessayez dans ${ipBlock.remainingMinutes} minutes.`,
            blockedUntil: ipBlock.expiresAt
          }
        };
      }
    }

    // Vérifier le cooldown (empêcher le spam de codes)
    const recentSession = await this.pendingSessions.findOne({
      userId: user._id.toString(),
      createdAt: { $gte: new Date(Date.now() - TWO_FA_CONFIG.cooldownSeconds * 1000) }
    });

    if (recentSession) {
      const waitSeconds = Math.ceil(
        (recentSession.createdAt.getTime() + TWO_FA_CONFIG.cooldownSeconds * 1000 - Date.now()) / 1000
      );
      return {
        success: false,
        error: {
          code: '2FA_COOLDOWN',
          message: `Veuillez patienter ${waitSeconds} secondes avant de demander un nouveau code.`,
          retryAfter: waitSeconds
        }
      };
    }

    // Générer OTP et session
    const otp = this._generateOTP();
    const sessionId = this._generateSessionId();
    const otpHash = await bcrypt.hash(otp, TWO_FA_CONFIG.bcryptRounds);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TWO_FA_CONFIG.pendingSessionExpiry);
    const otpExpiresAt = new Date(now.getTime() + TWO_FA_CONFIG.otpExpiryMinutes * 60000);

    // Invalider les sessions précédentes
    await this.pendingSessions.updateMany(
      { userId: user._id.toString(), verified: false },
      { $set: { invalidated: true, invalidatedAt: now } }
    );

    // Créer la nouvelle session
    const session = {
      _id: new ObjectId(),
      sessionId,
      userId: user._id.toString(),
      email: user.email.toLowerCase(),
      otpHash,
      otpExpiresAt,
      attempts: 0,
      maxAttempts: TWO_FA_CONFIG.maxAttempts,
      verified: false,
      invalidated: false,
      createdAt: now,
      expiresAt,
      metadata: {
        ip: ip || null,
        userAgent: userAgent || null
      },
      // Stocker les infos user pour générer le token après vérification
      userPayload: {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        companyName: user.companyName
      }
    };

    await this.pendingSessions.insertOne(session);

    // Envoyer l'email avec le code OTP
    if (this.sendEmail) {
      try {
        await this.sendEmail({
          to: user.email,
          subject: '[SYMPHONI.A] Votre code de vérification',
          html: this._generateEmailHTML(otp, user, options),
          text: this._generateEmailText(otp, user)
        });
      } catch (emailError) {
        console.error('[2FA] Failed to send OTP email:', emailError.message);
        // Ne pas bloquer - le code est créé, juste l'email a échoué
      }
    } else {
      // En développement, logger le code
      console.log(`[2FA] Code for ${user.email}: ${otp} (expires in ${TWO_FA_CONFIG.otpExpiryMinutes} min)`);
    }

    return {
      success: true,
      message: 'Code de vérification envoyé par email',
      data: {
        sessionId,
        email: this._maskEmail(user.email),
        expiresIn: TWO_FA_CONFIG.otpExpiryMinutes * 60,
        expiresAt: otpExpiresAt,
        // En dev uniquement
        ...(process.env.NODE_ENV !== 'production' && { _devOTP: otp })
      }
    };
  }

  /**
   * Vérifie le code OTP et complète l'authentification 2FA
   *
   * @param {string} sessionId - ID de session 2FA
   * @param {string} otp - Code OTP saisi
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultat avec userPayload si succès
   */
  async verify2FA(sessionId, otp, options = {}) {
    const { ip } = options;

    // Vérifier les blocages
    if (ip) {
      const ipBlock = await this.checkBlock(ip);
      if (ipBlock) {
        return {
          success: false,
          error: {
            code: '2FA_BLOCKED',
            message: `Trop de tentatives. Réessayez dans ${ipBlock.remainingMinutes} minutes.`
          }
        };
      }
    }

    // Récupérer la session
    const session = await this.pendingSessions.findOne({
      sessionId,
      verified: false,
      invalidated: { $ne: true }
    });

    if (!session) {
      return {
        success: false,
        error: {
          code: '2FA_SESSION_NOT_FOUND',
          message: 'Session invalide ou expirée. Veuillez vous reconnecter.'
        }
      };
    }

    // Vérifier l'expiration du code OTP
    if (session.otpExpiresAt < new Date()) {
      return {
        success: false,
        error: {
          code: '2FA_CODE_EXPIRED',
          message: 'Le code a expiré. Veuillez demander un nouveau code.'
        }
      };
    }

    // Vérifier le nombre de tentatives
    if (session.attempts >= session.maxAttempts) {
      await this.pendingSessions.updateOne(
        { _id: session._id },
        { $set: { invalidated: true, invalidatedAt: new Date(), invalidatedReason: 'max_attempts' } }
      );

      await this._incrementFailures(session.email, 'max_otp_attempts');

      return {
        success: false,
        error: {
          code: '2FA_MAX_ATTEMPTS',
          message: 'Nombre maximum de tentatives atteint. Veuillez vous reconnecter.'
        }
      };
    }

    // Vérifier le code OTP
    const isValid = await bcrypt.compare(otp.trim(), session.otpHash);

    if (!isValid) {
      // Incrémenter les tentatives
      await this.pendingSessions.updateOne(
        { _id: session._id },
        { $inc: { attempts: 1 }, $set: { lastAttemptAt: new Date() } }
      );

      const remainingAttempts = session.maxAttempts - session.attempts - 1;

      if (remainingAttempts <= 0) {
        await this._incrementFailures(session.email, 'max_otp_attempts');
      }

      return {
        success: false,
        error: {
          code: '2FA_INVALID_CODE',
          message: remainingAttempts > 0
            ? `Code incorrect. ${remainingAttempts} tentative(s) restante(s).`
            : 'Code incorrect. Veuillez vous reconnecter.'
        },
        remainingAttempts
      };
    }

    // Code valide - marquer la session comme vérifiée
    await this.pendingSessions.updateOne(
      { _id: session._id },
      {
        $set: {
          verified: true,
          verifiedAt: new Date(),
          attempts: session.attempts + 1
        }
      }
    );

    // Réinitialiser les compteurs d'échecs
    await this._resetFailures(session.email);
    if (ip) {
      await this._resetFailures(ip);
    }

    return {
      success: true,
      message: 'Authentification à deux facteurs réussie',
      data: {
        userPayload: session.userPayload,
        verifiedAt: new Date()
      }
    };
  }

  /**
   * Renvoie un nouveau code OTP pour une session existante
   *
   * @param {string} sessionId - ID de session 2FA
   * @returns {Promise<Object>} Résultat
   */
  async resendOTP(sessionId) {
    const session = await this.pendingSessions.findOne({
      sessionId,
      verified: false,
      invalidated: { $ne: true }
    });

    if (!session) {
      return {
        success: false,
        error: {
          code: '2FA_SESSION_NOT_FOUND',
          message: 'Session invalide ou expirée. Veuillez vous reconnecter.'
        }
      };
    }

    // Vérifier le cooldown
    if (session.lastResendAt) {
      const timeSinceLastResend = Date.now() - session.lastResendAt.getTime();
      if (timeSinceLastResend < TWO_FA_CONFIG.cooldownSeconds * 1000) {
        const waitSeconds = Math.ceil((TWO_FA_CONFIG.cooldownSeconds * 1000 - timeSinceLastResend) / 1000);
        return {
          success: false,
          error: {
            code: '2FA_COOLDOWN',
            message: `Veuillez patienter ${waitSeconds} secondes.`,
            retryAfter: waitSeconds
          }
        };
      }
    }

    // Générer nouveau code
    const otp = this._generateOTP();
    const otpHash = await bcrypt.hash(otp, TWO_FA_CONFIG.bcryptRounds);
    const otpExpiresAt = new Date(Date.now() + TWO_FA_CONFIG.otpExpiryMinutes * 60000);

    // Mettre à jour la session
    await this.pendingSessions.updateOne(
      { _id: session._id },
      {
        $set: {
          otpHash,
          otpExpiresAt,
          attempts: 0,
          lastResendAt: new Date()
        },
        $inc: { resendCount: 1 }
      }
    );

    // Envoyer l'email
    if (this.sendEmail) {
      try {
        await this.sendEmail({
          to: session.email,
          subject: '[SYMPHONI.A] Nouveau code de vérification',
          html: this._generateEmailHTML(otp, { email: session.email }, {}),
          text: this._generateEmailText(otp, { email: session.email })
        });
      } catch (emailError) {
        console.error('[2FA] Failed to resend OTP email:', emailError.message);
      }
    } else {
      console.log(`[2FA] New code for ${session.email}: ${otp}`);
    }

    return {
      success: true,
      message: 'Nouveau code envoyé',
      data: {
        email: this._maskEmail(session.email),
        expiresIn: TWO_FA_CONFIG.otpExpiryMinutes * 60,
        ...(process.env.NODE_ENV !== 'production' && { _devOTP: otp })
      }
    };
  }

  /**
   * Vérifie si le 2FA est activé pour un utilisateur
   * @param {Object} user - Utilisateur
   * @returns {boolean}
   */
  is2FAEnabled(user) {
    // Par défaut, 2FA activé pour tous les utilisateurs
    // Peut être personnalisé selon les préférences utilisateur
    if (user.twoFactorEnabled === false) {
      return false;
    }

    // Toujours activer pour les admins
    if (user.role === 'admin') {
      return true;
    }

    // Activer par défaut en production
    return process.env.NODE_ENV === 'production' || user.twoFactorEnabled === true;
  }

  /**
   * Masque partiellement un email
   * @private
   */
  _maskEmail(email) {
    const [local, domain] = email.split('@');
    if (local.length <= 2) {
      return `${local[0]}***@${domain}`;
    }
    return `${local.substring(0, 2)}***${local.slice(-1)}@${domain}`;
  }

  /**
   * Génère le HTML de l'email OTP
   * @private
   */
  _generateEmailHTML(otp, user, options) {
    const { ip, userAgent } = options;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code de vérification</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">SYMPHONI.A</h1>
    <p style="color: #a3c4e8; margin: 10px 0 0 0;">Authentification à deux facteurs</p>
  </div>

  <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
    <h2 style="color: #1e3a5f; margin-top: 0;">Votre code de vérification</h2>

    <p>Une tentative de connexion a été détectée sur votre compte.</p>

    <div style="background: white; border: 2px solid #1e3a5f; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0;">
      <span style="font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #1e3a5f;">${otp}</span>
    </div>

    <p style="color: #666; font-size: 14px;">
      <strong>Ce code expire dans ${TWO_FA_CONFIG.otpExpiryMinutes} minutes.</strong>
    </p>

    ${ip ? `
    <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 5px; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; font-size: 13px; color: #856404;">
        <strong>Détails de la connexion:</strong><br>
        IP: ${ip}<br>
        ${userAgent ? `Navigateur: ${userAgent.substring(0, 50)}...` : ''}
      </p>
    </div>
    ` : ''}

    <p style="color: #dc3545; font-size: 14px;">
      <strong>Si vous n'êtes pas à l'origine de cette connexion</strong>, ignorez cet email et changez immédiatement votre mot de passe.
    </p>

    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">

    <p style="color: #999; font-size: 12px; text-align: center;">
      Cet email a été envoyé automatiquement par SYMPHONI.A.<br>
      Ne répondez pas à cet email et ne partagez jamais votre code.
    </p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Génère le texte de l'email OTP
   * @private
   */
  _generateEmailText(otp, user) {
    return `
SYMPHONI.A - Authentification à deux facteurs

Votre code de vérification: ${otp}

Ce code expire dans ${TWO_FA_CONFIG.otpExpiryMinutes} minutes.

Si vous n'êtes pas à l'origine de cette connexion, ignorez cet email et changez immédiatement votre mot de passe.

---
Cet email a été envoyé automatiquement par SYMPHONI.A.
Ne partagez jamais votre code avec qui que ce soit.
    `;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  TwoFactorAuthService,
  TWO_FA_CONFIG
};
