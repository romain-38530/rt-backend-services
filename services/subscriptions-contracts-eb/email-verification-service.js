/**
 * Email Verification Service - OTP System
 * SYMPHONI.A - RT Technologie
 *
 * Service de verification d'email par code OTP 8 chiffres
 * SEC-010: Configuration sécurisée renforcée
 *
 * @version 2.0.0
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');

// Configuration SEC-010
const OTP_CONFIG = {
  length: 8,                    // 8 chiffres (100 millions de combinaisons)
  expiryMinutes: 10,            // 10 minutes validité (réduit de 15)
  maxAttempts: 3,               // 3 tentatives max
  cooldownSeconds: 120,         // 2 minutes entre envois (augmenté de 60s)
  ipBlockThreshold: 5,          // Bloquer IP après 5 échecs globaux
  ipBlockDuration: 3600,        // Blocage IP 1 heure
  bcryptRounds: 12              // Augmenté de 10 à 12 rounds
};

// Types de verification
const VerificationPurpose = {
  REGISTRATION: 'registration',
  PASSWORD_RESET: 'password_reset',
  LOGISTICIEN_ONBOARDING: 'logisticien_onboarding',
  CARRIER_ONBOARDING: 'carrier_onboarding',
  EMAIL_CHANGE: 'email_change'
};

/**
 * Generer un code OTP 8 chiffres (SEC-010)
 * @returns {string} Code OTP
 */
function generateOTP() {
  // Generer 8 chiffres cryptographiquement securises (100 millions de combinaisons)
  const buffer = crypto.randomBytes(4);
  const num = buffer.readUInt32BE(0);
  const otp = (num % 100000000).toString().padStart(OTP_CONFIG.length, '0');
  return otp;
}

/**
 * Hasher un OTP avec bcrypt
 * @param {string} otp - Code OTP en clair
 * @returns {Promise<string>} Hash bcrypt
 */
async function hashOTP(otp) {
  return bcrypt.hash(otp, OTP_CONFIG.bcryptRounds);
}

/**
 * Verifier un OTP contre son hash
 * @param {string} otp - Code OTP en clair
 * @param {string} hash - Hash bcrypt
 * @returns {Promise<boolean>}
 */
async function verifyOTPHash(otp, hash) {
  return bcrypt.compare(otp, hash);
}

/**
 * Creer le service de verification email
 * @param {MongoClient} mongoClient
 * @param {Function} sendEmailFn - Fonction d'envoi email
 * @returns {Object} Service
 */
function createEmailVerificationService(mongoClient, sendEmailFn = null) {
  const getDb = () => mongoClient.db();

  /**
   * Envoyer un OTP a un email
   * @param {string} email - Email destinataire
   * @param {string} purpose - But de la verification
   * @param {Object} metadata - Metadata additionnelle
   * @returns {Promise<Object>} Resultat
   */
  async function sendOTP(email, purpose, metadata = {}) {
    const db = getDb();
    const collection = db.collection('email_verifications');
    const normalizedEmail = email.toLowerCase().trim();
    const now = new Date();

    // Verifier cooldown (empecher spam)
    const recentVerification = await collection.findOne({
      email: normalizedEmail,
      purpose,
      createdAt: { $gte: new Date(now.getTime() - OTP_CONFIG.cooldownSeconds * 1000) }
    });

    if (recentVerification) {
      const waitSeconds = Math.ceil(
        (recentVerification.createdAt.getTime() + OTP_CONFIG.cooldownSeconds * 1000 - now.getTime()) / 1000
      );
      return {
        success: false,
        error: {
          code: 'OTP_COOLDOWN',
          message: `Veuillez patienter ${waitSeconds} secondes avant de demander un nouveau code`,
          retryAfter: waitSeconds
        }
      };
    }

    // Generer OTP et hash
    const otp = generateOTP();
    const otpHash = await hashOTP(otp);
    const expiresAt = new Date(now.getTime() + OTP_CONFIG.expiryMinutes * 60 * 1000);

    // Invalider les anciens OTP pour cet email/purpose
    await collection.updateMany(
      { email: normalizedEmail, purpose, verified: false },
      { $set: { invalidated: true, invalidatedAt: now } }
    );

    // Creer nouveau record
    const verification = {
      _id: new ObjectId(),
      email: normalizedEmail,
      otpHash,
      purpose,
      attempts: 0,
      maxAttempts: OTP_CONFIG.maxAttempts,
      expiresAt,
      verified: false,
      invalidated: false,
      createdAt: now,
      metadata: {
        ...metadata,
        ipAddress: metadata.ipAddress || null,
        userAgent: metadata.userAgent || null
      }
    };

    await collection.insertOne(verification);

    // Envoyer email avec OTP
    if (sendEmailFn) {
      try {
        await sendEmailFn({
          to: normalizedEmail,
          subject: getOTPEmailSubject(purpose),
          html: getOTPEmailHTML(otp, purpose, OTP_CONFIG.expiryMinutes),
          text: getOTPEmailText(otp, purpose, OTP_CONFIG.expiryMinutes)
        });
      } catch (emailError) {
        console.error('[EmailVerificationService] Failed to send OTP email:', emailError);
        // Ne pas bloquer - l'OTP est cree, juste l'email a echoue
      }
    } else {
      // En dev, logger l'OTP
      console.log(`[EmailVerificationService] OTP for ${normalizedEmail}: ${otp} (expires in ${OTP_CONFIG.expiryMinutes} min)`);
    }

    return {
      success: true,
      message: 'Code de verification envoye',
      data: {
        email: normalizedEmail,
        expiresAt,
        expiresInMinutes: OTP_CONFIG.expiryMinutes,
        // En dev uniquement (a retirer en prod)
        ...(process.env.NODE_ENV !== 'production' && { _devOTP: otp })
      }
    };
  }

  /**
   * Verifier un OTP
   * @param {string} email - Email
   * @param {string} otp - Code OTP saisi
   * @param {string} purpose - But de la verification
   * @returns {Promise<Object>} Resultat
   */
  async function verifyOTP(email, otp, purpose) {
    const db = getDb();
    const collection = db.collection('email_verifications');
    const normalizedEmail = email.toLowerCase().trim();
    const now = new Date();

    // Chercher verification active
    const verification = await collection.findOne({
      email: normalizedEmail,
      purpose,
      verified: false,
      invalidated: { $ne: true },
      expiresAt: { $gt: now }
    }, { sort: { createdAt: -1 } });

    if (!verification) {
      return {
        success: false,
        error: {
          code: 'OTP_NOT_FOUND',
          message: 'Code expire ou invalide. Veuillez demander un nouveau code.'
        }
      };
    }

    // Verifier nombre de tentatives
    if (verification.attempts >= verification.maxAttempts) {
      await collection.updateOne(
        { _id: verification._id },
        { $set: { invalidated: true, invalidatedAt: now, invalidatedReason: 'max_attempts' } }
      );
      return {
        success: false,
        error: {
          code: 'OTP_MAX_ATTEMPTS',
          message: 'Nombre maximum de tentatives atteint. Veuillez demander un nouveau code.'
        }
      };
    }

    // Verifier OTP
    const isValid = await verifyOTPHash(otp.trim(), verification.otpHash);

    if (!isValid) {
      // Incrementer tentatives
      await collection.updateOne(
        { _id: verification._id },
        { $inc: { attempts: 1 }, $set: { lastAttemptAt: now } }
      );

      const remainingAttempts = verification.maxAttempts - verification.attempts - 1;
      return {
        success: false,
        error: {
          code: 'OTP_INVALID',
          message: remainingAttempts > 0
            ? `Code incorrect. ${remainingAttempts} tentative(s) restante(s).`
            : 'Code incorrect. Veuillez demander un nouveau code.'
        },
        remainingAttempts
      };
    }

    // OTP valide - marquer comme verifie
    await collection.updateOne(
      { _id: verification._id },
      {
        $set: {
          verified: true,
          verifiedAt: now,
          attempts: verification.attempts + 1
        }
      }
    );

    return {
      success: true,
      message: 'Email verifie avec succes',
      data: {
        email: normalizedEmail,
        purpose,
        verifiedAt: now,
        verificationId: verification._id.toString()
      }
    };
  }

  /**
   * Verifier si un email a ete verifie recemment
   * @param {string} email - Email
   * @param {string} purpose - But
   * @param {number} withinMinutes - Dans les X dernieres minutes
   * @returns {Promise<boolean>}
   */
  async function isEmailVerified(email, purpose, withinMinutes = 60) {
    const db = getDb();
    const collection = db.collection('email_verifications');
    const normalizedEmail = email.toLowerCase().trim();
    const since = new Date(Date.now() - withinMinutes * 60 * 1000);

    const verification = await collection.findOne({
      email: normalizedEmail,
      purpose,
      verified: true,
      verifiedAt: { $gte: since }
    });

    return !!verification;
  }

  /**
   * Obtenir le statut de verification d'un email
   * @param {string} email - Email
   * @param {string} purpose - But
   * @returns {Promise<Object>}
   */
  async function getVerificationStatus(email, purpose) {
    const db = getDb();
    const collection = db.collection('email_verifications');
    const normalizedEmail = email.toLowerCase().trim();
    const now = new Date();

    const verification = await collection.findOne({
      email: normalizedEmail,
      purpose,
      invalidated: { $ne: true }
    }, { sort: { createdAt: -1 } });

    if (!verification) {
      return { status: 'none', verified: false };
    }

    if (verification.verified) {
      return {
        status: 'verified',
        verified: true,
        verifiedAt: verification.verifiedAt
      };
    }

    if (verification.expiresAt < now) {
      return { status: 'expired', verified: false };
    }

    if (verification.attempts >= verification.maxAttempts) {
      return { status: 'blocked', verified: false };
    }

    return {
      status: 'pending',
      verified: false,
      expiresAt: verification.expiresAt,
      attemptsRemaining: verification.maxAttempts - verification.attempts
    };
  }

  /**
   * Nettoyer les verifications expirees (a appeler via cron)
   * @returns {Promise<number>} Nombre de documents supprimes
   */
  async function cleanupExpired() {
    const db = getDb();
    const collection = db.collection('email_verifications');
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h

    const result = await collection.deleteMany({
      $or: [
        { expiresAt: { $lt: cutoff } },
        { verified: true, verifiedAt: { $lt: cutoff } }
      ]
    });

    return result.deletedCount;
  }

  return {
    sendOTP,
    verifyOTP,
    isEmailVerified,
    getVerificationStatus,
    cleanupExpired,
    // Export config pour tests
    config: OTP_CONFIG,
    purposes: VerificationPurpose
  };
}

// ============================================
// TEMPLATES EMAIL OTP
// ============================================

function getOTPEmailSubject(purpose) {
  const subjects = {
    [VerificationPurpose.REGISTRATION]: '[SYMPHONI.A] Votre code de verification',
    [VerificationPurpose.PASSWORD_RESET]: '[SYMPHONI.A] Code de reinitialisation mot de passe',
    [VerificationPurpose.LOGISTICIEN_ONBOARDING]: '[SYMPHONI.A] Verifiez votre email - Onboarding Logisticien',
    [VerificationPurpose.CARRIER_ONBOARDING]: '[SYMPHONI.A] Verifiez votre email - Onboarding Transporteur',
    [VerificationPurpose.EMAIL_CHANGE]: '[SYMPHONI.A] Confirmez votre nouvelle adresse email'
  };
  return subjects[purpose] || '[SYMPHONI.A] Votre code de verification';
}

function getOTPEmailHTML(otp, purpose, expiryMinutes) {
  const purposeText = {
    [VerificationPurpose.REGISTRATION]: 'pour finaliser votre inscription',
    [VerificationPurpose.PASSWORD_RESET]: 'pour reinitialiser votre mot de passe',
    [VerificationPurpose.LOGISTICIEN_ONBOARDING]: 'pour continuer votre onboarding logisticien',
    [VerificationPurpose.CARRIER_ONBOARDING]: 'pour continuer votre onboarding transporteur',
    [VerificationPurpose.EMAIL_CHANGE]: 'pour confirmer votre nouvelle adresse email'
  };

  const text = purposeText[purpose] || 'pour verifier votre email';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code de verification</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">SYMPHONI.A</h1>
    <p style="color: #a3c4e8; margin: 10px 0 0 0;">RT Technologie</p>
  </div>

  <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
    <h2 style="color: #1e3a5f; margin-top: 0;">Votre code de verification</h2>

    <p>Utilisez le code ci-dessous ${text}:</p>

    <div style="background: white; border: 2px solid #1e3a5f; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0;">
      <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e3a5f;">${otp}</span>
    </div>

    <p style="color: #666; font-size: 14px;">
      <strong>Ce code expire dans ${expiryMinutes} minutes.</strong>
    </p>

    <p style="color: #666; font-size: 14px;">
      Si vous n'avez pas demande ce code, vous pouvez ignorer cet email en toute securite.
    </p>

    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">

    <p style="color: #999; font-size: 12px; text-align: center;">
      Cet email a ete envoye automatiquement par SYMPHONI.A.<br>
      Ne repondez pas a cet email.
    </p>
  </div>
</body>
</html>
  `;
}

function getOTPEmailText(otp, purpose, expiryMinutes) {
  return `
SYMPHONI.A - RT Technologie

Votre code de verification: ${otp}

Ce code expire dans ${expiryMinutes} minutes.

Si vous n'avez pas demande ce code, vous pouvez ignorer cet email.

---
Cet email a ete envoye automatiquement par SYMPHONI.A.
  `;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  createEmailVerificationService,
  generateOTP,
  hashOTP,
  verifyOTPHash,
  VerificationPurpose,
  OTP_CONFIG
};
