export interface VATValidationRequest {
  countryCode: string;
  vatNumber: string;
}

export interface VATValidationResponse {
  valid: boolean;
  countryCode: string;
  vatNumber: string;
  requestDate: string;
  name?: string;
  address?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface VIESResponse {
  isValid: boolean;
  requestDate: string;
  userError: string;
  name: string;
  address: string;
  requestIdentifier: string;
  originalRequest: {
    countryCode: string;
    vatNumber: string;
  };
  valid: boolean;
  traderName: string;
  traderAddress: string;
  traderStreet: string;
  traderPostcode: string;
  traderCity: string;
  traderCompanyType: string;
  traderCountryCode: string;
}

export enum VATCountryCode {
  AT = 'AT', // Austria
  BE = 'BE', // Belgium
  BG = 'BG', // Bulgaria
  CY = 'CY', // Cyprus
  CZ = 'CZ', // Czech Republic
  DE = 'DE', // Germany
  DK = 'DK', // Denmark
  EE = 'EE', // Estonia
  EL = 'EL', // Greece
  ES = 'ES', // Spain
  FI = 'FI', // Finland
  FR = 'FR', // France
  HR = 'HR', // Croatia
  HU = 'HU', // Hungary
  IE = 'IE', // Ireland
  IT = 'IT', // Italy
  LT = 'LT', // Lithuania
  LU = 'LU', // Luxembourg
  LV = 'LV', // Latvia
  MT = 'MT', // Malta
  NL = 'NL', // Netherlands
  PL = 'PL', // Poland
  PT = 'PT', // Portugal
  RO = 'RO', // Romania
  SE = 'SE', // Sweden
  SI = 'SI', // Slovenia
  SK = 'SK', // Slovakia
}

export const VAT_PATTERNS: Record<string, RegExp> = {
  AT: /^U\d{8}$/,
  BE: /^\d{10}$/,
  BG: /^\d{9,10}$/,
  CY: /^\d{8}[A-Z]$/,
  CZ: /^\d{8,10}$/,
  DE: /^\d{9}$/,
  DK: /^\d{8}$/,
  EE: /^\d{9}$/,
  EL: /^\d{9}$/,
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^\d{8}$/,
  FR: /^[A-Z0-9]{2}\d{9}$/,
  HR: /^\d{11}$/,
  HU: /^\d{8}$/,
  IE: /^[A-Z0-9]\d{6}[A-Z]{1,2}$/,
  IT: /^\d{11}$/,
  LT: /^(\d{9}|\d{12})$/,
  LU: /^\d{8}$/,
  LV: /^\d{11}$/,
  MT: /^\d{8}$/,
  NL: /^\d{9}B\d{2}$/,
  PL: /^\d{10}$/,
  PT: /^\d{9}$/,
  RO: /^\d{2,10}$/,
  SE: /^\d{12}$/,
  SI: /^\d{8}$/,
  SK: /^\d{10}$/,
};
