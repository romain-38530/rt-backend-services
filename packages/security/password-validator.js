/**
 * Password Validator
 * SYMPHONI.A - RT Technologie
 *
 * Validation robuste des mots de passe avec vérification de complexité,
 * liste noire de mots de passe courants, et calcul de force.
 *
 * @version 1.0.0
 * @security CRITICAL - Politique de mot de passe
 */

// Top 100 mots de passe les plus courants (à étendre en production)
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'password1234',
  '123456', '12345678', '123456789', '1234567890',
  'qwerty', 'qwerty123', 'azerty', 'azerty123',
  'abc123', 'abcd1234', 'letmein', 'welcome',
  'monkey', 'dragon', 'master', 'login',
  'admin', 'admin123', 'root', 'toor',
  'pass', 'pass123', 'pass1234', 'passw0rd',
  'iloveyou', 'sunshine', 'princess', 'football',
  'baseball', 'soccer', 'hockey', 'batman',
  'superman', 'trustno1', 'shadow', 'ashley',
  'michael', 'daniel', 'jessica', 'charlie',
  '654321', '666666', '696969', '000000',
  '111111', '121212', '123123', '123321',
  'qazwsx', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
  'changeme', 'secret', 'god', 'sex',
  'money', 'freedom', 'ninja', 'killer',
  'test', 'test123', 'test1234', 'testing',
  'hello', 'hello123', 'welcome1', 'welcome123',
  'demo', 'demo123', 'sample', 'example',
  'guest', 'guest123', 'user', 'user123',
  'temp', 'temp123', 'temporary', 'default',
  'symphonia', 'rttechnologie', 'rttech', 'transport',
  'logistique', 'transporteur', 'industriel', 'carrier'
]);

// Configuration par défaut
const DEFAULT_CONFIG = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  specialChars: '@$!%*?&#^()_\\-+=',
  checkCommonPasswords: true,
  checkUserContext: true
};

/**
 * Classe de validation de mot de passe
 */
class PasswordValidator {
  /**
   * @param {Object} config - Configuration personnalisée
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Valide un mot de passe
   *
   * @param {string} password - Mot de passe à valider
   * @param {Object} userContext - Contexte utilisateur (email, username, etc.)
   * @returns {Object} Résultat de validation
   *
   * @example
   * const validator = new PasswordValidator();
   * const result = validator.validate('MyP@ssw0rd123', { email: 'user@example.com' });
   * if (!result.isValid) {
   *   console.log(result.errors);
   * }
   */
  validate(password, userContext = {}) {
    const errors = [];
    const warnings = [];

    // Vérification de type
    if (typeof password !== 'string') {
      return {
        isValid: false,
        errors: ['Password must be a string'],
        warnings: [],
        strength: 'invalid'
      };
    }

    // Longueur minimale
    if (password.length < this.config.minLength) {
      errors.push(`Password must be at least ${this.config.minLength} characters long`);
    }

    // Longueur maximale
    if (password.length > this.config.maxLength) {
      errors.push(`Password must not exceed ${this.config.maxLength} characters`);
    }

    // Majuscule requise
    if (this.config.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    // Minuscule requise
    if (this.config.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    // Chiffre requis
    if (this.config.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    // Caractère spécial requis
    if (this.config.requireSpecialChars) {
      const specialCharsRegex = new RegExp(`[${this.config.specialChars.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&')}]`);
      if (!specialCharsRegex.test(password)) {
        errors.push(`Password must contain at least one special character (${this.config.specialChars})`);
      }
    }

    // Vérification des mots de passe courants
    if (this.config.checkCommonPasswords) {
      if (COMMON_PASSWORDS.has(password.toLowerCase())) {
        errors.push('This password is too common and easily guessable');
      }
    }

    // Vérification du contexte utilisateur
    if (this.config.checkUserContext && userContext) {
      const contextValues = this._extractContextValues(userContext);

      for (const value of contextValues) {
        if (value && password.toLowerCase().includes(value.toLowerCase())) {
          errors.push('Password cannot contain your personal information (email, name, etc.)');
          break;
        }
      }
    }

    // Vérification des séquences répétitives
    if (/(.)\1{2,}/.test(password)) {
      warnings.push('Password contains repeating characters which may weaken it');
    }

    // Vérification des séquences communes
    const sequences = ['123', '234', '345', '456', '567', '678', '789', '890',
      'abc', 'bcd', 'cde', 'def', 'efg', 'fgh', 'ghi', 'hij',
      'qwe', 'wer', 'ert', 'rty', 'tyu', 'yui', 'uio', 'iop',
      'asd', 'sdf', 'dfg', 'fgh', 'ghj', 'hjk', 'jkl',
      'zxc', 'xcv', 'cvb', 'vbn', 'bnm'];

    for (const seq of sequences) {
      if (password.toLowerCase().includes(seq)) {
        warnings.push('Password contains keyboard sequences which may weaken it');
        break;
      }
    }

    // Calculer la force du mot de passe
    const strength = this._calculateStrength(password, errors.length);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      strength,
      score: this._calculateScore(password)
    };
  }

  /**
   * Extrait les valeurs du contexte utilisateur à vérifier
   * @private
   */
  _extractContextValues(context) {
    const values = [];

    if (context.email) {
      const emailParts = context.email.split('@');
      values.push(emailParts[0]); // Username part
      if (emailParts[1]) {
        values.push(emailParts[1].split('.')[0]); // Domain name
      }
    }

    if (context.username) {
      values.push(context.username);
    }

    if (context.firstName) {
      values.push(context.firstName);
    }

    if (context.lastName) {
      values.push(context.lastName);
    }

    if (context.companyName) {
      values.push(context.companyName);
      // Aussi vérifier les mots individuels de plus de 3 caractères
      const words = context.companyName.split(/\s+/);
      for (const word of words) {
        if (word.length > 3) {
          values.push(word);
        }
      }
    }

    return values.filter(v => v && v.length >= 3);
  }

  /**
   * Calcule la force du mot de passe
   * @private
   */
  _calculateStrength(password, errorCount) {
    if (errorCount > 0) {
      return 'weak';
    }

    const score = this._calculateScore(password);

    if (score >= 80) return 'very_strong';
    if (score >= 60) return 'strong';
    if (score >= 40) return 'medium';
    return 'weak';
  }

  /**
   * Calcule un score numérique pour le mot de passe
   * @private
   */
  _calculateScore(password) {
    let score = 0;

    // Points pour la longueur
    if (password.length >= 8) score += 10;
    if (password.length >= 12) score += 15;
    if (password.length >= 16) score += 15;
    if (password.length >= 20) score += 10;

    // Points pour la diversité de caractères
    if (/[a-z]/.test(password)) score += 10;
    if (/[A-Z]/.test(password)) score += 10;
    if (/\d/.test(password)) score += 10;
    if (/[^A-Za-z0-9]/.test(password)) score += 15;

    // Points pour les caractères uniques
    const uniqueChars = new Set(password.toLowerCase()).size;
    const uniqueRatio = uniqueChars / password.length;
    score += Math.round(uniqueRatio * 15);

    // Pénalités
    if (/(.)\1{2,}/.test(password)) score -= 10; // Répétitions
    if (/^[A-Za-z]+$/.test(password)) score -= 10; // Lettres uniquement
    if (/^\d+$/.test(password)) score -= 20; // Chiffres uniquement

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Génère un mot de passe sécurisé
   *
   * @param {number} length - Longueur du mot de passe (défaut: 16)
   * @returns {string} Mot de passe généré
   */
  static generate(length = 16) {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const special = '@$!%*?&#^()_-+=';
    const allChars = lowercase + uppercase + numbers + special;

    // S'assurer qu'au moins un caractère de chaque type est inclus
    let password = '';
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Compléter avec des caractères aléatoires
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Mélanger le mot de passe
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }
}

/**
 * Valide un mot de passe avec la configuration par défaut
 *
 * @param {string} password - Mot de passe à valider
 * @param {Object} userContext - Contexte utilisateur
 * @returns {Object} Résultat de validation
 */
function validatePassword(password, userContext = {}) {
  const validator = new PasswordValidator();
  return validator.validate(password, userContext);
}

/**
 * Vérifie si un mot de passe est suffisamment fort
 *
 * @param {string} password - Mot de passe à vérifier
 * @returns {boolean} True si le mot de passe est valide
 */
function isPasswordValid(password) {
  const result = validatePassword(password);
  return result.isValid;
}

/**
 * Retourne les exigences de mot de passe pour affichage
 *
 * @param {Object} config - Configuration (optionnelle)
 * @returns {Object} Exigences formatées
 */
function getPasswordRequirements(config = DEFAULT_CONFIG) {
  return {
    minLength: config.minLength,
    maxLength: config.maxLength,
    requirements: [
      `At least ${config.minLength} characters`,
      config.requireUppercase && 'At least one uppercase letter (A-Z)',
      config.requireLowercase && 'At least one lowercase letter (a-z)',
      config.requireNumbers && 'At least one number (0-9)',
      config.requireSpecialChars && `At least one special character (${config.specialChars})`,
      'Cannot be a common password',
      'Cannot contain your email or username'
    ].filter(Boolean)
  };
}

module.exports = {
  PasswordValidator,
  validatePassword,
  isPasswordValid,
  getPasswordRequirements,
  COMMON_PASSWORDS,
  DEFAULT_CONFIG
};
