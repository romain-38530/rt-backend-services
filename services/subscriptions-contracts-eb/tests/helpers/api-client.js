// API Client Helper for E2E Tests
// Provides reusable methods for API interactions

const { request } = require('@playwright/test');

/**
 * API Client for RT SYMPHONI.A
 */
class APIClient {
  constructor(baseURL, authToken = null) {
    this.baseURL = baseURL;
    this.authToken = authToken;
  }

  /**
   * Get request headers with optional auth
   */
  getHeaders(additionalHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...additionalHeaders,
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  /**
   * Make a GET request
   */
  async get(endpoint, options = {}) {
    const context = await request.newContext({
      baseURL: this.baseURL,
      extraHTTPHeaders: this.getHeaders(options.headers),
    });

    const response = await context.get(endpoint);
    const body = await response.json().catch(() => ({}));

    return {
      status: response.status(),
      body,
      response,
    };
  }

  /**
   * Make a POST request
   */
  async post(endpoint, data = {}, options = {}) {
    const context = await request.newContext({
      baseURL: this.baseURL,
      extraHTTPHeaders: this.getHeaders(options.headers),
    });

    const response = await context.post(endpoint, {
      data,
      ...options,
    });

    const body = await response.json().catch(() => ({}));

    return {
      status: response.status(),
      body,
      response,
    };
  }

  /**
   * Make a PUT request
   */
  async put(endpoint, data = {}, options = {}) {
    const context = await request.newContext({
      baseURL: this.baseURL,
      extraHTTPHeaders: this.getHeaders(options.headers),
    });

    const response = await context.put(endpoint, {
      data,
      ...options,
    });

    const body = await response.json().catch(() => ({}));

    return {
      status: response.status(),
      body,
      response,
    };
  }

  /**
   * Make a DELETE request
   */
  async delete(endpoint, options = {}) {
    const context = await request.newContext({
      baseURL: this.baseURL,
      extraHTTPHeaders: this.getHeaders(options.headers),
    });

    const response = await context.delete(endpoint);
    const body = await response.json().catch(() => ({}));

    return {
      status: response.status(),
      body,
      response,
    };
  }

  /**
   * Upload a file
   */
  async uploadFile(endpoint, filePath, fieldName = 'file', additionalData = {}) {
    const context = await request.newContext({
      baseURL: this.baseURL,
      extraHTTPHeaders: {
        'Authorization': this.authToken ? `Bearer ${this.authToken}` : undefined,
      },
    });

    const response = await context.post(endpoint, {
      multipart: {
        [fieldName]: {
          name: filePath.split('/').pop(),
          mimeType: 'application/pdf',
          buffer: require('fs').readFileSync(filePath),
        },
        ...additionalData,
      },
    });

    const body = await response.json().catch(() => ({}));

    return {
      status: response.status(),
      body,
      response,
    };
  }

  /**
   * Set authentication token
   */
  setAuthToken(token) {
    this.authToken = token;
  }

  /**
   * Clear authentication token
   */
  clearAuthToken() {
    this.authToken = null;
  }
}

/**
 * Create test user for authentication
 */
async function createTestUser(client, userData = {}) {
  const defaultUser = {
    email: `test-${Date.now()}@example.com`,
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'User',
    role: 'client',
    ...userData,
  };

  const response = await client.post('/api/auth/register', defaultUser);

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Failed to create test user: ${JSON.stringify(response.body)}`);
  }

  return {
    ...defaultUser,
    userId: response.body.data?.userId || response.body.userId,
    token: response.body.data?.accessToken || response.body.accessToken,
  };
}

/**
 * Login with credentials
 */
async function loginUser(client, email, password) {
  const response = await client.post('/api/auth/login', {
    email,
    password,
  });

  if (response.status !== 200) {
    throw new Error(`Failed to login: ${JSON.stringify(response.body)}`);
  }

  return {
    token: response.body.data?.accessToken || response.body.accessToken,
    refreshToken: response.body.data?.refreshToken || response.body.refreshToken,
    userId: response.body.data?.userId || response.body.userId,
  };
}

/**
 * Wait for condition with polling
 */
async function waitForCondition(checkFn, options = {}) {
  const {
    timeout = 30000,
    interval = 1000,
    errorMessage = 'Condition not met within timeout',
  } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await checkFn();
    if (result) {
      return result;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(errorMessage);
}

/**
 * Generate random test data
 */
function generateTestData(type) {
  const timestamp = Date.now();

  const templates = {
    transportOrder: {
      reference: `TO-${timestamp}`,
      clientId: `client-${timestamp}`,
      pickupLocation: {
        address: '123 Test Street',
        city: 'Paris',
        postalCode: '75001',
        country: 'FR',
        coordinates: { lat: 48.8566, lng: 2.3522 },
      },
      deliveryLocation: {
        address: '456 Test Avenue',
        city: 'Lyon',
        postalCode: '69001',
        country: 'FR',
        coordinates: { lat: 45.7640, lng: 4.8357 },
      },
      goods: [
        {
          description: 'Test Package',
          weight: 100,
          quantity: 1,
          dimensions: { length: 50, width: 50, height: 50 },
        },
      ],
      pickupDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      deliveryDate: new Date(Date.now() + 2 * 86400000).toISOString(), // Day after tomorrow
    },
    carrier: {
      name: `Carrier ${timestamp}`,
      siret: `${timestamp}`.padStart(14, '0').slice(0, 14),
      email: `carrier-${timestamp}@example.com`,
      phone: '+33123456789',
      vatNumber: `FR${timestamp}`.slice(0, 13),
      address: {
        street: '789 Carrier Road',
        city: 'Marseille',
        postalCode: '13001',
        country: 'FR',
      },
    },
  };

  return templates[type] || {};
}

module.exports = {
  APIClient,
  createTestUser,
  loginUser,
  waitForCondition,
  generateTestData,
};
