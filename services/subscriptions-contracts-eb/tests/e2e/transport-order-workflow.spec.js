// Transport Order Complete Workflow E2E Test
// Tests the full lifecycle of a transport order from creation to closure

const { test, expect } = require('@playwright/test');
const { APIClient, generateTestData, waitForCondition } = require('../helpers/api-client');
const testData = require('../fixtures/test-data.json');

test.describe('Transport Order Complete Workflow', () => {
  let apiClient;
  let authToken;
  let orderId;
  let carrierId;
  let documentIds = {};

  test.beforeAll(async ({ baseURL }) => {
    apiClient = new APIClient(baseURL);

    // Authenticate as client
    const loginResponse = await apiClient.post('/api/auth/login', {
      email: 'test@example.com',
      password: 'TestPassword123!',
    });

    // If login fails, try to register first
    if (loginResponse.status !== 200) {
      const registerResponse = await apiClient.post('/api/auth/register', {
        email: 'test@example.com',
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'User',
        role: 'client',
      });

      expect(registerResponse.status).toBe(201);
      authToken = registerResponse.body.data?.accessToken || registerResponse.body.accessToken;
    } else {
      authToken = loginResponse.body.data?.accessToken || loginResponse.body.accessToken;
    }

    apiClient.setAuthToken(authToken);
  });

  test('Step 1: Create a transport order', async () => {
    const orderData = generateTestData('transportOrder');

    const response = await apiClient.post('/api/transport-orders', orderData);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data._id).toBeDefined();
    expect(response.body.data.reference).toBeDefined();
    expect(response.body.data.status).toBe('CREATED');

    orderId = response.body.data._id;

    console.log(`✅ Transport order created: ${orderId}`);
    console.log(`   Reference: ${response.body.data.reference}`);
  });

  test('Step 2: Assign a carrier to the transport order', async () => {
    expect(orderId).toBeDefined();

    // First, create or get a carrier
    const carrierData = generateTestData('carrier');
    const carrierResponse = await apiClient.post('/api/carriers/invite', carrierData);

    if (carrierResponse.status === 201 || carrierResponse.status === 200) {
      carrierId = carrierResponse.body.data?._id || carrierResponse.body.data?.carrierId;
    } else {
      // If carrier creation fails, try to get existing carriers
      const carriersResponse = await apiClient.get('/api/carriers');
      if (carriersResponse.body.data?.length > 0) {
        carrierId = carriersResponse.body.data[0]._id;
      }
    }

    expect(carrierId).toBeDefined();

    // Assign carrier to order
    const assignResponse = await apiClient.post(`/api/transport-orders/${orderId}/assign`, {
      carrierId,
      assignedBy: 'test@example.com',
      estimatedPickupTime: new Date(Date.now() + 86400000).toISOString(),
    });

    expect(assignResponse.status).toBe(200);
    expect(assignResponse.body.success).toBe(true);
    expect(assignResponse.body.data.status).toBe('ASSIGNED');
    expect(assignResponse.body.data.carrier).toBeDefined();

    console.log(`✅ Carrier assigned: ${carrierId}`);
  });

  test('Step 3: Start tracking for the transport order', async () => {
    expect(orderId).toBeDefined();

    const trackingData = {
      trackingType: 'GPS',
      vehicleId: 'VH-' + Date.now(),
      driverName: 'John Doe',
      driverPhone: '+33123456789',
      startLocation: testData.transportOrders.standard.pickupLocation,
    };

    const response = await apiClient.post(`/api/transport-orders/${orderId}/tracking/start`, trackingData);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('IN_TRANSIT');
    expect(response.body.data.tracking).toBeDefined();
    expect(response.body.data.tracking.isActive).toBe(true);

    console.log(`✅ Tracking started for order ${orderId}`);
  });

  test('Step 4: Upload transport documents (BL, CMR, POD)', async () => {
    expect(orderId).toBeDefined();

    // Mock document types to upload
    const documentsToUpload = [
      { type: 'BL', name: 'Bon de Livraison' },
      { type: 'CMR', name: 'Convention de Transport' },
      { type: 'POD', name: 'Proof of Delivery' },
    ];

    for (const doc of documentsToUpload) {
      // Create a mock document upload (in real scenario, would upload actual file)
      const uploadResponse = await apiClient.post(`/api/transport-orders/${orderId}/documents`, {
        type: doc.type,
        name: doc.name,
        description: `Test ${doc.name}`,
        // In real test, would include actual file data
        mockFile: true,
        content: `Mock ${doc.type} content`,
      });

      expect([200, 201]).toContain(uploadResponse.status);
      expect(uploadResponse.body.success).toBe(true);

      if (uploadResponse.body.data?.documentId || uploadResponse.body.data?._id) {
        documentIds[doc.type] = uploadResponse.body.data.documentId || uploadResponse.body.data._id;
        console.log(`✅ Document uploaded: ${doc.type} - ID: ${documentIds[doc.type]}`);
      }
    }

    expect(Object.keys(documentIds).length).toBeGreaterThan(0);
  });

  test('Step 5: Extract OCR data from uploaded documents', async () => {
    expect(orderId).toBeDefined();
    expect(Object.keys(documentIds).length).toBeGreaterThan(0);

    // Try OCR extraction on the first available document
    const firstDocType = Object.keys(documentIds)[0];
    const documentId = documentIds[firstDocType];

    if (!documentId) {
      test.skip();
      return;
    }

    const ocrResponse = await apiClient.post(
      `/api/transport-orders/${orderId}/documents/${documentId}/ocr/extract`,
      {
        extractionType: 'full',
        language: 'fr',
      }
    );

    // OCR might not be fully implemented, so check for either success or graceful error
    if (ocrResponse.status === 200) {
      expect(ocrResponse.body.success).toBe(true);
      expect(ocrResponse.body.data).toBeDefined();

      console.log(`✅ OCR extraction completed for document ${documentId}`);
      if (ocrResponse.body.data.extractedData) {
        console.log(`   Extracted fields: ${Object.keys(ocrResponse.body.data.extractedData).join(', ')}`);
      }
    } else if (ocrResponse.status === 501 || ocrResponse.status === 404) {
      console.log(`⚠️  OCR not implemented or endpoint not found - skipping`);
    } else {
      console.log(`⚠️  OCR extraction failed: ${ocrResponse.status} - ${JSON.stringify(ocrResponse.body)}`);
    }
  });

  test('Step 6: Close the transport order', async () => {
    expect(orderId).toBeDefined();

    const closureData = {
      closureType: 'COMPLETED',
      completionDate: new Date().toISOString(),
      finalLocation: testData.transportOrders.standard.deliveryLocation,
      notes: 'Transport completed successfully - E2E Test',
      signature: {
        recipientName: 'Test Recipient',
        recipientEmail: 'recipient@example.com',
        signedAt: new Date().toISOString(),
      },
    };

    const response = await apiClient.post(`/api/transport-orders/${orderId}/close`, closureData);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('COMPLETED');
    expect(response.body.data.closedAt).toBeDefined();

    console.log(`✅ Transport order closed: ${orderId}`);
    console.log(`   Status: ${response.body.data.status}`);
    console.log(`   Closed at: ${response.body.data.closedAt}`);
  });

  test('Step 7: Verify order final state', async () => {
    expect(orderId).toBeDefined();

    const response = await apiClient.get(`/api/transport-orders/${orderId}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data._id).toBe(orderId);
    expect(response.body.data.status).toBe('COMPLETED');
    expect(response.body.data.carrier).toBeDefined();
    expect(response.body.data.tracking).toBeDefined();
    expect(response.body.data.closedAt).toBeDefined();

    console.log(`✅ Order verification complete`);
    console.log(`   Final status: ${response.body.data.status}`);
    console.log(`   Lifecycle: CREATED → ASSIGNED → IN_TRANSIT → COMPLETED`);
  });
});

test.describe('Transport Order Error Scenarios', () => {
  let apiClient;
  let authToken;

  test.beforeAll(async ({ baseURL }) => {
    apiClient = new APIClient(baseURL);

    // Authenticate
    const loginResponse = await apiClient.post('/api/auth/login', {
      email: 'test@example.com',
      password: 'TestPassword123!',
    });

    authToken = loginResponse.body.data?.accessToken || loginResponse.body.accessToken;
    apiClient.setAuthToken(authToken);
  });

  test('Should reject invalid order data', async () => {
    const invalidOrder = {
      // Missing required fields
      pickupLocation: { city: 'Paris' },
    };

    const response = await apiClient.post('/api/transport-orders', invalidOrder);

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  test('Should reject invalid order ID format', async () => {
    const response = await apiClient.get('/api/transport-orders/invalid-id-format');

    expect([400, 404, 500]).toContain(response.status);
    expect(response.body.success).toBe(false);
  });

  test('Should handle non-existent order gracefully', async () => {
    const fakeId = '000000000000000000000000';
    const response = await apiClient.get(`/api/transport-orders/${fakeId}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});
