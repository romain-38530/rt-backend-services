/**
 * Fonctions utilitaires pour l'intégration Frontend
 * RT Backend Services - Version 2.2.0
 *
 * Copiez ce fichier dans votre projet frontend:
 * src/lib/api.ts
 */

import type {
  API_CONFIG,
  VATValidationRequest,
  VATValidationResponse,
  VATFormatValidationRequest,
  VATFormatValidationResponse,
  PriceCalculationRequest,
  PriceCalculationResponse,
  HealthCheckResponse,
  APIInfoResponse,
  APIError,
} from './frontend-types';

// Importez votre configuration
const API_BASE_URL = 'https://d2i50a1vlg138w.cloudfront.net';
const API_TIMEOUT = 10000;

// ==================== Gestion d'Erreurs ====================

export function handleAPIError(error: unknown): APIError {
  if (error instanceof Error && 'code' in error) {
    return error as APIError;
  }

  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      name: 'APIError',
      code: 'NETWORK_ERROR',
      message: 'Erreur de connexion au serveur',
      status: 0,
    } as APIError;
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return {
      name: 'APIError',
      code: 'TIMEOUT',
      message: 'La requête a expiré',
      status: 0,
    } as APIError;
  }

  return {
    name: 'APIError',
    code: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : 'Une erreur inconnue est survenue',
    status: 500,
  } as APIError;
}

// ==================== Fonctions Fetch Génériques ====================

async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw {
        name: 'APIError',
        code: errorData.error?.code || `HTTP_${response.status}`,
        message: errorData.error?.message || `Erreur ${response.status}`,
        status: response.status,
        details: errorData,
      };
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw handleAPIError(error);
  }
}

// ==================== Health & Info ====================

/**
 * Vérifie l'état de santé de l'API
 */
export async function checkHealth(): Promise<HealthCheckResponse> {
  return fetchAPI<HealthCheckResponse>('/health');
}

/**
 * Récupère les informations de l'API
 */
export async function getAPIInfo(): Promise<APIInfoResponse> {
  return fetchAPI<APIInfoResponse>('/');
}

// ==================== Validation TVA ====================

/**
 * Valide le format d'un numéro TVA (sans appel API externe)
 * Rapide, recommandé pour la validation côté client avant soumission
 */
export async function validateVATFormat(
  vatNumber: string
): Promise<VATFormatValidationResponse> {
  return fetchAPI<VATFormatValidationResponse>('/api/vat/validate-format', {
    method: 'POST',
    body: JSON.stringify({ vatNumber } satisfies VATFormatValidationRequest),
  });
}

/**
 * Valide un numéro TVA avec vérification complète
 * Utilise le système de fallback multi-API (VIES → AbstractAPI → APILayer)
 * Retourne les informations de l'entreprise si valide
 */
export async function validateVAT(
  vatNumber: string
): Promise<VATValidationResponse> {
  return fetchAPI<VATValidationResponse>('/api/vat/validate', {
    method: 'POST',
    body: JSON.stringify({ vatNumber } satisfies VATValidationRequest),
  });
}

/**
 * Version avec cache local pour optimiser les appels répétés
 */
const vatCache = new Map<string, { data: VATValidationResponse; timestamp: number }>();
const CACHE_DURATION = 3600000; // 1 heure

export async function validateVATCached(
  vatNumber: string
): Promise<VATValidationResponse> {
  const cached = vatCache.get(vatNumber);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  const result = await validateVAT(vatNumber);

  if (result.success && result.valid) {
    vatCache.set(vatNumber, { data: result, timestamp: now });
  }

  return result;
}

// ==================== Calcul de Prix ====================

/**
 * Calcule le prix TTC à partir d'un prix HT et d'un code pays
 * Utilise les taux de TVA en vigueur dans le pays
 */
export async function calculatePriceWithVAT(
  amount: number,
  countryCode: string
): Promise<PriceCalculationResponse> {
  return fetchAPI<PriceCalculationResponse>('/api/vat/calculate-price', {
    method: 'POST',
    body: JSON.stringify({ amount, countryCode } satisfies PriceCalculationRequest),
  });
}

/**
 * Calcule les prix pour plusieurs pays en parallèle
 */
export async function calculatePricesMultipleCountries(
  amount: number,
  countryCodes: string[]
): Promise<Map<string, PriceCalculationResponse>> {
  const results = await Promise.allSettled(
    countryCodes.map((code) => calculatePriceWithVAT(amount, code))
  );

  const priceMap = new Map<string, PriceCalculationResponse>();

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      priceMap.set(countryCodes[index], result.value);
    }
  });

  return priceMap;
}

// ==================== Hooks React ====================

/**
 * Hook React pour la validation TVA
 * Usage:
 *
 * const { validate, loading, result, error } = useVATValidation();
 * await validate('FR12345678901');
 */
export function useVATValidation() {
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<VATValidationResponse | null>(null);
  const [error, setError] = React.useState<APIError | null>(null);

  const validate = async (vatNumber: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await validateVAT(vatNumber);
      setResult(data);
      return data;
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError);
      throw apiError;
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
  };

  return { validate, loading, result, error, reset };
}

/**
 * Hook React pour le calcul de prix
 * Usage:
 *
 * const { calculate, loading, result, error } = usePriceCalculation();
 * await calculate(100, 'FR');
 */
export function usePriceCalculation() {
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<PriceCalculationResponse | null>(null);
  const [error, setError] = React.useState<APIError | null>(null);

  const calculate = async (amount: number, countryCode: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await calculatePriceWithVAT(amount, countryCode);
      setResult(data);
      return data;
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError);
      throw apiError;
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
  };

  return { calculate, loading, result, error, reset };
}

// ==================== Validation Côté Client ====================

/**
 * Valide le format d'un numéro TVA côté client (sans API)
 * Retourne true si le format est potentiellement valide
 */
export function isValidVATFormat(vatNumber: string): boolean {
  if (!vatNumber) return false;

  const cleaned = vatNumber.replace(/\s/g, '').toUpperCase();

  // Doit commencer par 2 lettres et avoir entre 8 et 12 chiffres
  if (!/^[A-Z]{2}\d{8,12}$/.test(cleaned)) {
    return false;
  }

  // Vérifier que le code pays est dans l'UE
  const countryCode = cleaned.substring(0, 2);
  const euCountries = [
    'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES',
    'FI', 'FR', 'GB', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV',
    'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
  ];

  return euCountries.includes(countryCode);
}

/**
 * Extrait le code pays d'un numéro TVA
 */
export function extractCountryCode(vatNumber: string): string | null {
  if (!vatNumber) return null;

  const cleaned = vatNumber.replace(/\s/g, '').toUpperCase();
  const match = cleaned.match(/^([A-Z]{2})/);

  return match ? match[1] : null;
}

/**
 * Extrait le numéro sans le code pays
 */
export function extractVATNumber(vatNumber: string): string | null {
  if (!vatNumber) return null;

  const cleaned = vatNumber.replace(/\s/g, '').toUpperCase();
  const match = cleaned.match(/^[A-Z]{2}(\d+)$/);

  return match ? match[1] : null;
}

// ==================== Formatage ====================

/**
 * Formate un numéro TVA pour l'affichage
 * Exemple: FR12345678901 → FR 123 456 789 01
 */
export function formatVATNumber(vatNumber: string): string {
  if (!vatNumber) return '';

  const cleaned = vatNumber.replace(/\s/g, '').toUpperCase();
  const countryCode = cleaned.substring(0, 2);
  const number = cleaned.substring(2);

  // Ajouter un espace tous les 3 chiffres
  const formatted = number.replace(/(\d{3})(?=\d)/g, '$1 ');

  return `${countryCode} ${formatted}`.trim();
}

/**
 * Formate un montant en euros
 */
export function formatPrice(amount: number, currency: string = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Formate une date ISO en date lisible
 */
export function formatDate(isoDate: string, locale: string = 'fr-FR'): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoDate));
}

// ==================== Calculs Locaux ====================

/**
 * Calcule le montant de TVA
 */
export function calculateVATAmount(priceExcl: number, vatRate: number): number {
  return (priceExcl * vatRate) / 100;
}

/**
 * Calcule le prix TTC local (sans API)
 */
export function calculatePriceIncl(priceExcl: number, vatRate: number): number {
  return priceExcl * (1 + vatRate / 100);
}

/**
 * Calcule le prix HT local (sans API)
 */
export function calculatePriceExcl(priceIncl: number, vatRate: number): number {
  return priceIncl / (1 + vatRate / 100);
}

// ==================== Monitoring (Optionnel) ====================

/**
 * Track API calls pour analytics
 */
export function trackAPICall(
  endpoint: string,
  duration: number,
  status: 'success' | 'error'
) {
  // Exemple avec Google Analytics
  if (typeof window !== 'undefined' && 'gtag' in window) {
    (window as any).gtag('event', 'api_call', {
      endpoint,
      duration,
      status,
    });
  }

  // Ou avec votre service d'analytics
  console.log(`[API] ${endpoint} - ${duration}ms - ${status}`);
}

/**
 * Wrapper fetch avec monitoring
 */
export async function monitoredFetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const start = Date.now();
  let status: 'success' | 'error' = 'error';

  try {
    const result = await fetchAPI<T>(endpoint, options);
    status = 'success';
    return result;
  } finally {
    const duration = Date.now() - start;
    trackAPICall(endpoint, duration, status);
  }
}

// ==================== Export par défaut ====================

export default {
  // Health & Info
  checkHealth,
  getAPIInfo,

  // VAT Validation
  validateVATFormat,
  validateVAT,
  validateVATCached,

  // Price Calculation
  calculatePriceWithVAT,
  calculatePricesMultipleCountries,

  // Client-side validation
  isValidVATFormat,
  extractCountryCode,
  extractVATNumber,

  // Formatting
  formatVATNumber,
  formatPrice,
  formatDate,

  // Local calculations
  calculateVATAmount,
  calculatePriceIncl,
  calculatePriceExcl,

  // Error handling
  handleAPIError,

  // Monitoring
  trackAPICall,
  monitoredFetchAPI,
};
