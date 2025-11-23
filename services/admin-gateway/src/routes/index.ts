import express from 'express';
import axios from 'axios';

const router = express.Router();

// Service URLs (from environment or defaults)
const SERVICES = {
  authz: process.env.AUTHZ_URL || 'http://localhost:3002',
  orders: process.env.CORE_ORDERS_URL || 'http://localhost:3007',
  notifications: process.env.NOTIFICATIONS_URL || 'http://localhost:3004',
  planning: process.env.PLANNING_URL || 'http://localhost:3005',
  tmsSync: process.env.TMS_SYNC_URL || 'http://localhost:3006',
  palette: process.env.PALETTE_URL || 'http://localhost:3009',
  vigilance: process.env.VIGILANCE_URL || 'http://localhost:3008',
  affretIA: process.env.AFFRET_IA_URL || 'http://localhost:3010',
  training: process.env.TRAINING_URL || 'http://localhost:3012',
  ecpmr: process.env.ECPMR_URL || 'http://localhost:3014',
  storageMarket: process.env.STORAGE_MARKET_URL || 'http://localhost:3015',
  geoTracking: process.env.GEO_TRACKING_URL || 'http://localhost:3016',
  chatbot: process.env.CHATBOT_URL || 'http://localhost:3019',
};

// Proxy function
async function proxyRequest(
  serviceUrl: string,
  path: string,
  method: string,
  data?: any,
  headers?: any
) {
  try {
    const response = await axios({
      method,
      url: `${serviceUrl}${path}`,
      data,
      headers,
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw {
        status: error.response.status,
        data: error.response.data,
      };
    }
    throw error;
  }
}

// Orders routes
router.all('/v1/orders*', async (req, res, next) => {
  try {
    const path = req.url.replace('/v1/orders', '');
    const data = await proxyRequest(
      SERVICES.orders,
      `/api/orders${path}`,
      req.method,
      req.body,
      req.headers
    );
    res.json(data);
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json(error.data);
    } else {
      next(error);
    }
  }
});

// Notifications routes
router.all('/v1/notifications*', async (req, res, next) => {
  try {
    const path = req.url.replace('/v1/notifications', '');
    const data = await proxyRequest(
      SERVICES.notifications,
      `/api/notifications${path}`,
      req.method,
      req.body,
      req.headers
    );
    res.json(data);
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json(error.data);
    } else {
      next(error);
    }
  }
});

// Chatbot routes
router.all('/v1/chatbot*', async (req, res, next) => {
  try {
    const path = req.url.replace('/v1/chatbot', '');
    const data = await proxyRequest(
      SERVICES.chatbot,
      `/api/chatbot${path}`,
      req.method,
      req.body,
      req.headers
    );
    res.json(data);
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json(error.data);
    } else {
      next(error);
    }
  }
});

// Geo Tracking routes
router.all('/v1/tracking*', async (req, res, next) => {
  try {
    const path = req.url.replace('/v1/tracking', '');
    const data = await proxyRequest(
      SERVICES.geoTracking,
      `/api/tracking${path}`,
      req.method,
      req.body,
      req.headers
    );
    res.json(data);
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json(error.data);
    } else {
      next(error);
    }
  }
});

// Planning routes
router.all('/v1/planning*', async (req, res, next) => {
  try {
    const path = req.url.replace('/v1/planning', '');
    const data = await proxyRequest(SERVICES.planning, `/api/planning${path}`, req.method, req.body, req.headers);
    res.json(data);
  } catch (error: any) {
    if (error.status) res.status(error.status).json(error.data);
    else next(error);
  }
});

// Palette routes
router.all('/v1/palette*', async (req, res, next) => {
  try {
    const path = req.url.replace('/v1/palette', '');
    const data = await proxyRequest(SERVICES.palette, `/api/palette${path}`, req.method, req.body, req.headers);
    res.json(data);
  } catch (error: any) {
    if (error.status) res.status(error.status).json(error.data);
    else next(error);
  }
});

// Vigilance routes
router.all('/v1/vigilance*', async (req, res, next) => {
  try {
    const path = req.url.replace('/v1/vigilance', '');
    const data = await proxyRequest(SERVICES.vigilance, `/api/vigilance${path}`, req.method, req.body, req.headers);
    res.json(data);
  } catch (error: any) {
    if (error.status) res.status(error.status).json(error.data);
    else next(error);
  }
});

// Affret IA routes
router.all('/v1/affret-ia*', async (req, res, next) => {
  try {
    const path = req.url.replace('/v1/affret-ia', '');
    const data = await proxyRequest(SERVICES.affretIA, `/api/affret-ia${path}`, req.method, req.body, req.headers);
    res.json(data);
  } catch (error: any) {
    if (error.status) res.status(error.status).json(error.data);
    else next(error);
  }
});

// Storage Market routes
router.all('/v1/storage-market*', async (req, res, next) => {
  try {
    const path = req.url.replace('/v1/storage-market', '');
    const data = await proxyRequest(SERVICES.storageMarket, `/api/storage-market${path}`, req.method, req.body, req.headers);
    res.json(data);
  } catch (error: any) {
    if (error.status) res.status(error.status).json(error.data);
    else next(error);
  }
});

// API info
router.get('/v1', (req, res) => {
  res.json({
    name: 'RT Technologie API Gateway',
    version: '1.0.0',
    services: Object.keys(SERVICES),
    endpoints: [
      '/api/v1/orders',
      '/api/v1/notifications',
      '/api/v1/chatbot',
      '/api/v1/tracking',
      '/api/v1/planning',
      '/api/v1/palette',
      '/api/v1/vigilance',
      '/api/v1/affret-ia',
      '/api/v1/storage-market',
    ],
  });
});

export { router as routes };
