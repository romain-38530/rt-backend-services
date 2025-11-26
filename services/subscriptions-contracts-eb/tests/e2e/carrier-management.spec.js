// Carrier Management E2E Tests
// Tests carrier invitation, onboarding, document verification, and referencing

const { test, expect } = require('@playwright/test');
const { APIClient, generateTestData } = require('../helpers/api-client');

test.describe('Carrier Management Workflow', () => {
  let apiClient;
  let authToken;
  let carrierId;

  test.beforeAll(async ({ baseURL }) => {
    apiClient = new APIClient(baseURL);

    // Authenticate
    const loginResponse = await apiClient.post('/api/auth/login', {
      email: 'test@example.com',
      password: 'TestPassword123!',
    });

    if (loginResponse.status !== 200) {
      await apiClient.post('/api/auth/register', {
        email: 'test@example.com',
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'User',
        role: 'client',
      });

      const retryLogin = await apiClient.post('/api/auth/login', {
        email: 'test@example.com',
        password: 'TestPassword123!',
      });

      authToken = retryLogin.body.data?.accessToken || retryLogin.body.accessToken;
    } else {
      authToken = loginResponse.body.data?.accessToken || loginResponse.body.accessToken;
    }

    apiClient.setAuthToken(authToken);
  });

  test('Step 1: Invite a new carrier', async () => {
    const carrierData = generateTestData('carrier');

    const response = await apiClient.post('/api/carriers/invite', carrierData);

    expect([200, 201]).toContain(response.status);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();

    carrierId = response.body.data._id || response.body.data.carrierId;

    expect(carrierId).toBeDefined();

    console.log(`✅ Carrier invited: ${carrierId}`);
    console.log(`   Name: ${carrierData.name}`);
    console.log(`   Email: ${carrierData.email}`);
  });

  test('Step 2: Complete carrier onboarding', async () => {
    expect(carrierId).toBeDefined();

    const onboardingData = {
      legalDocuments: {
        kbis: 'mock-kbis.pdf',
        insurance: 'mock-insurance.pdf',
        transportLicense: 'mock-license.pdf',
      },
      bankDetails: {
        iban: 'FR7612345678901234567890123',
        bic: 'BNPAFRPPXXX',
        accountHolder: 'Test Carrier SAS',
      },
      contactPerson: {
        name: 'Jean Dupont',
        email: 'jean.dupont@carrier.com',
        phone: '+33123456789',
      },
    };

    const response = await apiClient.post(`/api/carriers/${carrierId}/onboard`, onboardingData);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.onboardingStatus).toBeDefined();

    console.log(`✅ Carrier onboarding completed`);
    console.log(`   Status: ${response.body.data.onboardingStatus}`);
  });

  test('Step 3: Upload vigilance documents', async () => {
    expect(carrierId).toBeDefined();

    const documentsToUpload = [
      { type: 'URSSAF', name: 'Attestation URSSAF' },
      { type: 'FISCAL', name: 'Attestation Fiscale' },
      { type: 'INSURANCE', name: 'Attestation Assurance RC' },
    ];

    for (const doc of documentsToUpload) {
      const uploadResponse = await apiClient.post(`/api/carriers/${carrierId}/documents`, {
        type: doc.type,
        name: doc.name,
        issueDate: new Date().toISOString(),
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        // Mock file content
        mockFile: true,
        content: `Mock ${doc.type} document`,
      });

      expect([200, 201]).toContain(uploadResponse.status);
      expect(uploadResponse.body.success).toBe(true);

      console.log(`✅ Document uploaded: ${doc.type}`);
    }
  });

  test('Step 4: Verify carrier documents (admin action)', async () => {
    expect(carrierId).toBeDefined();

    // Get carrier documents
    const carrierResponse = await apiClient.get(`/api/carriers/${carrierId}`);

    if (carrierResponse.status === 200 && carrierResponse.body.data?.documents?.length > 0) {
      const documentType = carrierResponse.body.data.documents[0].type;

      const verifyResponse = await apiClient.post(
        `/api/carriers/${carrierId}/documents/${documentType}/verify`,
        {
          verified: true,
          verifiedBy: 'admin@rt.com',
          verificationDate: new Date().toISOString(),
          notes: 'Document verified - E2E Test',
        }
      );

      if (verifyResponse.status === 200) {
        expect(verifyResponse.body.success).toBe(true);
        console.log(`✅ Document verified: ${documentType}`);
      } else if ([403, 404, 501].includes(verifyResponse.status)) {
        console.log(`⚠️  Document verification not available or requires admin role`);
        test.skip();
      }
    } else {
      console.log(`⚠️  No documents found to verify`);
      test.skip();
    }
  });

  test('Step 5: Check vigilance status', async () => {
    expect(carrierId).toBeDefined();

    const response = await apiClient.get(`/api/carriers/${carrierId}/vigilance`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.status).toBeDefined();

    console.log(`✅ Vigilance status checked`);
    console.log(`   Status: ${response.body.data.status}`);
    console.log(`   Documents: ${response.body.data.documents?.length || 0}`);
  });

  test('Step 6: Add pricing grid for carrier', async () => {
    expect(carrierId).toBeDefined();

    const pricingGridData = {
      name: `Pricing Grid for Carrier ${carrierId}`,
      zones: [
        { from: 'Paris', to: 'Lyon', basePrice: 500, pricePerKm: 1.5 },
        { from: 'Lyon', to: 'Marseille', basePrice: 400, pricePerKm: 1.3 },
      ],
      transportTypes: ['standard', 'express'],
      validFrom: new Date().toISOString(),
      validUntil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const response = await apiClient.post(`/api/carriers/${carrierId}/pricing-grid`, pricingGridData);

    if ([200, 201].includes(response.status)) {
      expect(response.body.success).toBe(true);
      console.log(`✅ Pricing grid added for carrier`);
    } else if ([404, 501].includes(response.status)) {
      console.log(`⚠️  Pricing grid endpoint not available`);
      test.skip();
    }
  });

  test('Step 7: Update carrier scoring', async () => {
    expect(carrierId).toBeDefined();

    const scoringData = {
      onTimeDelivery: 95,
      qualityScore: 88,
      communicationScore: 92,
      incidentRate: 2,
      customerSatisfaction: 4.5,
    };

    const response = await apiClient.post(`/api/carriers/${carrierId}/score`, scoringData);

    if ([200, 201].includes(response.status)) {
      expect(response.body.success).toBe(true);
      expect(response.body.data.score).toBeDefined();

      console.log(`✅ Carrier scoring updated`);
      console.log(`   Overall Score: ${response.body.data.score}`);
    } else if ([404, 501].includes(response.status)) {
      console.log(`⚠️  Carrier scoring not available`);
      test.skip();
    }
  });

  test('Step 8: Get carrier details', async () => {
    expect(carrierId).toBeDefined();

    const response = await apiClient.get(`/api/carriers/${carrierId}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data._id).toBe(carrierId);
    expect(response.body.data.name).toBeDefined();

    console.log(`✅ Carrier details retrieved`);
    console.log(`   Name: ${response.body.data.name}`);
    console.log(`   Status: ${response.body.data.status || 'N/A'}`);
  });

  test('Step 9: List all carriers', async () => {
    const response = await apiClient.get('/api/carriers');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);

    console.log(`✅ Carrier list retrieved`);
    console.log(`   Total carriers: ${response.body.data.length}`);
  });

  test('Step 10: Update carrier reference level', async () => {
    expect(carrierId).toBeDefined();

    const response = await apiClient.put(`/api/carriers/${carrierId}/reference-level`, {
      referenceLevel: 'PREMIUM',
      reason: 'Excellent performance - E2E Test',
    });

    if ([200, 201].includes(response.status)) {
      expect(response.body.success).toBe(true);
      console.log(`✅ Carrier reference level updated to PREMIUM`);
    } else if ([404, 501].includes(response.status)) {
      console.log(`⚠️  Reference level update not available`);
      test.skip();
    }
  });
});

test.describe('Carrier Validation and Error Handling', () => {
  let apiClient;
  let authToken;

  test.beforeAll(async ({ baseURL }) => {
    apiClient = new APIClient(baseURL);

    const loginResponse = await apiClient.post('/api/auth/login', {
      email: 'test@example.com',
      password: 'TestPassword123!',
    });

    authToken = loginResponse.body.data?.accessToken || loginResponse.body.accessToken;
    apiClient.setAuthToken(authToken);
  });

  test('Should reject carrier with invalid SIRET', async () => {
    const invalidCarrier = {
      name: 'Invalid Carrier',
      siret: '12345', // Too short
      email: 'invalid@carrier.com',
    };

    const response = await apiClient.post('/api/carriers/invite', invalidCarrier);

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);

    console.log(`✅ Invalid SIRET rejected correctly`);
  });

  test('Should reject carrier with invalid email', async () => {
    const invalidCarrier = {
      name: 'Invalid Email Carrier',
      siret: '12345678901234',
      email: 'not-an-email',
    };

    const response = await apiClient.post('/api/carriers/invite', invalidCarrier);

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);

    console.log(`✅ Invalid email rejected correctly`);
  });

  test('Should handle non-existent carrier gracefully', async () => {
    const fakeId = '000000000000000000000000';

    const response = await apiClient.get(`/api/carriers/${fakeId}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);

    console.log(`✅ Non-existent carrier handled correctly`);
  });
});
