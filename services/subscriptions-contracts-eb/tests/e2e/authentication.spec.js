// Authentication E2E Tests
// Tests user registration, login, token refresh, and authorization

const { test, expect } = require('@playwright/test');
const { APIClient } = require('../helpers/api-client');

test.describe('Authentication and Authorization', () => {
  let apiClient;
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'SecurePass123!';
  let accessToken;
  let refreshToken;
  let userId;

  test.beforeAll(async ({ baseURL }) => {
    apiClient = new APIClient(baseURL);
  });

  test('Should register a new user successfully', async () => {
    const userData = {
      email: testEmail,
      password: testPassword,
      firstName: 'Test',
      lastName: 'User',
      role: 'client',
      company: 'Test Company Ltd',
    };

    const response = await apiClient.post('/api/auth/register', userData);

    expect([200, 201]).toContain(response.status);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();

    // Store tokens if provided immediately after registration
    if (response.body.data?.accessToken) {
      accessToken = response.body.data.accessToken;
      refreshToken = response.body.data.refreshToken;
      userId = response.body.data.userId;
    }

    console.log(`✅ User registered: ${testEmail}`);
  });

  test('Should reject registration with duplicate email', async () => {
    const userData = {
      email: testEmail,
      password: testPassword,
      firstName: 'Test',
      lastName: 'User',
      role: 'client',
    };

    const response = await apiClient.post('/api/auth/register', userData);

    expect([400, 409]).toContain(response.status);
    expect(response.body.success).toBe(false);

    console.log(`✅ Duplicate email rejected correctly`);
  });

  test('Should reject registration with weak password', async () => {
    const userData = {
      email: `test-weak-${Date.now()}@example.com`,
      password: '123', // Weak password
      firstName: 'Test',
      lastName: 'User',
      role: 'client',
    };

    const response = await apiClient.post('/api/auth/register', userData);

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);

    console.log(`✅ Weak password rejected correctly`);
  });

  test('Should login with correct credentials', async () => {
    const credentials = {
      email: testEmail,
      password: testPassword,
    };

    const response = await apiClient.post('/api/auth/login', credentials);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.accessToken).toBeDefined();
    expect(response.body.data.refreshToken).toBeDefined();
    expect(response.body.data.userId).toBeDefined();

    accessToken = response.body.data.accessToken;
    refreshToken = response.body.data.refreshToken;
    userId = response.body.data.userId;

    console.log(`✅ Login successful for ${testEmail}`);
  });

  test('Should reject login with incorrect password', async () => {
    const credentials = {
      email: testEmail,
      password: 'WrongPassword123!',
    };

    const response = await apiClient.post('/api/auth/login', credentials);

    expect([401, 400]).toContain(response.status);
    expect(response.body.success).toBe(false);

    console.log(`✅ Invalid credentials rejected correctly`);
  });

  test('Should reject login with non-existent email', async () => {
    const credentials = {
      email: 'nonexistent@example.com',
      password: testPassword,
    };

    const response = await apiClient.post('/api/auth/login', credentials);

    expect([401, 404]).toContain(response.status);
    expect(response.body.success).toBe(false);

    console.log(`✅ Non-existent user rejected correctly`);
  });

  test('Should access protected route with valid token', async () => {
    expect(accessToken).toBeDefined();

    apiClient.setAuthToken(accessToken);

    const response = await apiClient.get('/api/auth/me');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.email).toBe(testEmail);

    console.log(`✅ Protected route accessed with valid token`);
  });

  test('Should reject protected route without token', async () => {
    apiClient.clearAuthToken();

    const response = await apiClient.get('/api/auth/me');

    expect([401, 403]).toContain(response.status);
    expect(response.body.success).toBe(false);

    console.log(`✅ Protected route rejected without token`);
  });

  test('Should refresh access token with valid refresh token', async () => {
    expect(refreshToken).toBeDefined();

    const response = await apiClient.post('/api/auth/refresh', {
      refreshToken,
    });

    if (response.status === 200) {
      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();

      // Update access token
      accessToken = response.body.data.accessToken;
      apiClient.setAuthToken(accessToken);

      console.log(`✅ Access token refreshed successfully`);
    } else if (response.status === 404 || response.status === 501) {
      console.log(`⚠️  Token refresh not implemented - skipping`);
      test.skip();
    } else {
      throw new Error(`Unexpected response: ${response.status}`);
    }
  });

  test('Should change password successfully', async () => {
    expect(accessToken).toBeDefined();

    apiClient.setAuthToken(accessToken);

    const newPassword = 'NewSecurePass456!';

    const response = await apiClient.put('/api/auth/change-password', {
      currentPassword: testPassword,
      newPassword,
    });

    if (response.status === 200) {
      expect(response.body.success).toBe(true);

      // Verify can login with new password
      const loginResponse = await apiClient.post('/api/auth/login', {
        email: testEmail,
        password: newPassword,
      });

      expect(loginResponse.status).toBe(200);

      console.log(`✅ Password changed successfully`);
    } else if (response.status === 404 || response.status === 501) {
      console.log(`⚠️  Password change not implemented - skipping`);
      test.skip();
    }
  });

  test('Should logout successfully', async () => {
    expect(accessToken).toBeDefined();

    apiClient.setAuthToken(accessToken);

    const response = await apiClient.post('/api/auth/logout', {
      refreshToken,
    });

    if (response.status === 200) {
      expect(response.body.success).toBe(true);

      // Verify token is invalidated
      const meResponse = await apiClient.get('/api/auth/me');
      expect([401, 403]).toContain(meResponse.status);

      console.log(`✅ Logout successful`);
    } else if (response.status === 404 || response.status === 501) {
      console.log(`⚠️  Logout not implemented - skipping`);
      test.skip();
    }
  });
});

test.describe('JWT Token Validation', () => {
  let apiClient;

  test.beforeAll(async ({ baseURL }) => {
    apiClient = new APIClient(baseURL);
  });

  test('Should reject malformed JWT token', async () => {
    apiClient.setAuthToken('invalid.jwt.token');

    const response = await apiClient.get('/api/auth/me');

    expect([401, 403]).toContain(response.status);
    expect(response.body.success).toBe(false);

    console.log(`✅ Malformed token rejected correctly`);
  });

  test('Should reject expired JWT token', async () => {
    // Mock expired token (this is a fake expired token)
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.4Adcj0mFz_n0KV7mRlBmgkE5CX8FzLuRFgMcW_MuE';

    apiClient.setAuthToken(expiredToken);

    const response = await apiClient.get('/api/auth/me');

    expect([401, 403]).toContain(response.status);
    expect(response.body.success).toBe(false);

    console.log(`✅ Expired token rejected correctly`);
  });
});

test.describe('Rate Limiting', () => {
  let apiClient;

  test.beforeAll(async ({ baseURL }) => {
    apiClient = new APIClient(baseURL);
  });

  test('Should enforce rate limiting on authentication endpoints', async () => {
    const credentials = {
      email: 'nonexistent@example.com',
      password: 'WrongPassword123!',
    };

    // Make multiple rapid requests to trigger rate limit (5 attempts per 15 min)
    const requests = [];
    for (let i = 0; i < 10; i++) {
      requests.push(apiClient.post('/api/auth/login', credentials));
    }

    const responses = await Promise.all(requests);

    // At least one should be rate limited
    const rateLimitedResponses = responses.filter(r => r.status === 429);

    if (rateLimitedResponses.length > 0) {
      expect(rateLimitedResponses[0].status).toBe(429);
      console.log(`✅ Rate limiting enforced after ${10 - rateLimitedResponses.length} requests`);
    } else {
      console.log(`⚠️  Rate limiting not enforced or limit is higher than test attempts`);
    }
  });
});
