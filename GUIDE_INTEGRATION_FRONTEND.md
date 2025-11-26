# GUIDE D'INTÉGRATION FRONTEND - SYMPHONI.A API

## 🎯 Vue d'ensemble

Ce guide complet vous permettra d'intégrer les **50+ endpoints** de l'API SYMPHONI.A dans votre application **Next.js/React**.

**API Base URLs:**
- **Production (HTTPS):** `https://d2i50a1vlg138w.cloudfront.net`
- **Direct EB (HTTP):** `http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com`
- **Auth API:** `https://d2i50a1vlg138w.cloudfront.net` (même domaine)

---

## 📦 Installation & Configuration

### 1. Installation des dépendances

```bash
npm install axios
# OU
pnpm add axios
# OU
yarn add axios
```

### 2. Configuration des variables d'environnement

**Fichier `.env.local` (développement):**
```env
NEXT_PUBLIC_API_URL=https://d2i50a1vlg138w.cloudfront.net
NEXT_PUBLIC_API_TIMEOUT=30000
NEXT_PUBLIC_ENABLE_API_LOGS=true
```

**Fichier `.env.production` (production):**
```env
NEXT_PUBLIC_API_URL=https://d2i50a1vlg138w.cloudfront.net
NEXT_PUBLIC_API_TIMEOUT=30000
NEXT_PUBLIC_ENABLE_API_LOGS=false
```

### 3. Créer le client API

**Fichier `lib/api-client.ts`:**

```typescript
import axios, { AxiosInstance, AxiosError } from 'axios';

// Configuration de base
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://d2i50a1vlg138w.cloudfront.net';
const API_TIMEOUT = parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT || '30000');

// Créer l'instance Axios
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercepteur de requête (pour ajouter le token JWT)
apiClient.interceptors.request.use(
  (config) => {
    // Récupérer le token depuis localStorage, cookies, ou state management
    const token = localStorage.getItem('auth_token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Logs en développement
    if (process.env.NEXT_PUBLIC_ENABLE_API_LOGS === 'true') {
      console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, config.data);
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Intercepteur de réponse (gestion globale des erreurs)
apiClient.interceptors.response.use(
  (response) => {
    // Logs en développement
    if (process.env.NEXT_PUBLIC_ENABLE_API_LOGS === 'true') {
      console.log(`[API] Response:`, response.data);
    }
    return response;
  },
  (error: AxiosError) => {
    // Gestion des erreurs communes
    if (error.response) {
      const status = error.response.status;

      switch (status) {
        case 401:
          // Non autorisé - rediriger vers login
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
          break;
        case 403:
          console.error('Accès refusé');
          break;
        case 404:
          console.error('Ressource non trouvée');
          break;
        case 500:
          console.error('Erreur serveur');
          break;
        default:
          console.error(`Erreur API (${status}):`, error.response.data);
      }
    } else if (error.request) {
      console.error('Pas de réponse du serveur');
    } else {
      console.error('Erreur de configuration:', error.message);
    }

    return Promise.reject(error);
  }
);

export default apiClient;
```

---

## 🚀 1. Gestion des Commandes de Transport

### Créer une commande

```typescript
// lib/api/orders.ts
import apiClient from '../api-client';

export interface CreateOrderData {
  reference?: string; // Généré auto si non fourni
  industrialId: string;
  pickupAddress: {
    street: string;
    city: string;
    postalCode: string;
    country: string;
    coordinates?: { lat: number; lng: number };
  };
  deliveryAddress: {
    street: string;
    city: string;
    postalCode: string;
    country: string;
    coordinates?: { lat: number; lng: number };
  };
  pickupDate: string; // ISO 8601: "2025-11-26T10:00:00.000Z"
  deliveryDate: string;
  weight: number; // en kg
  pallets: number;
  volume?: number; // en m³
  constraints?: string[]; // ['HAYON', 'FRIGO', 'ADR']
  notes?: string;
}

export interface Order {
  _id: string;
  reference: string;
  industrialId: string;
  status: string;
  pickupAddress: any;
  deliveryAddress: any;
  pickupDate: string;
  deliveryDate: string;
  weight: number;
  pallets: number;
  createdAt: string;
  updatedAt: string;
}

export const createOrder = async (data: CreateOrderData): Promise<Order> => {
  const response = await apiClient.post('/api/transport-orders', data);
  return response.data.order;
};

// Exemple d'utilisation dans un composant React
export function CreateOrderForm() {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (formData: CreateOrderData) => {
    try {
      setLoading(true);

      const order = await createOrder(formData);

      console.log('Commande créée:', order);
      alert(`Commande créée avec succès! Référence: ${order.reference}`);

      // Rediriger vers la page de détail
      router.push(`/orders/${order._id}`);
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la création de la commande');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Formulaire */}
    </form>
  );
}
```

### Récupérer une commande

```typescript
export const getOrder = async (orderId: string): Promise<Order> => {
  const response = await apiClient.get(`/api/transport-orders/${orderId}`);
  return response.data.order;
};

// Hook React personnalisé
export function useOrder(orderId: string) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        setLoading(true);
        const data = await getOrder(orderId);
        setOrder(data);
      } catch (err) {
        setError('Erreur lors du chargement de la commande');
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId]);

  return { order, loading, error };
}

// Utilisation dans un composant
export function OrderDetailPage({ orderId }: { orderId: string }) {
  const { order, loading, error } = useOrder(orderId);

  if (loading) return <div>Chargement...</div>;
  if (error) return <div>Erreur: {error}</div>;
  if (!order) return <div>Commande non trouvée</div>;

  return (
    <div>
      <h1>Commande {order.reference}</h1>
      <p>Status: {order.status}</p>
      <p>Poids: {order.weight} kg</p>
      {/* Affichage des détails */}
    </div>
  );
}
```

### Lister les commandes

```typescript
export interface OrdersFilter {
  status?: string;
  industrialId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export const listOrders = async (filter: OrdersFilter = {}): Promise<Order[]> => {
  const params = new URLSearchParams();

  if (filter.status) params.append('status', filter.status);
  if (filter.industrialId) params.append('industrialId', filter.industrialId);
  if (filter.startDate) params.append('startDate', filter.startDate);
  if (filter.endDate) params.append('endDate', filter.endDate);
  if (filter.page) params.append('page', filter.page.toString());
  if (filter.limit) params.append('limit', filter.limit.toString());

  const response = await apiClient.get(`/api/transport-orders?${params.toString()}`);
  return response.data.orders;
};

// Hook avec pagination
export function useOrders(filter: OrdersFilter = {}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const data = await listOrders({ ...filter, page, limit: 20 });
      setOrders(data);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [page, filter]);

  return { orders, loading, page, setPage, refresh: fetchOrders };
}
```

---

## 🧠 2. Lane Matching & Dispatch Chain

### Détecter les lanes pour un industriel

```typescript
export interface Lane {
  _id: string;
  industrialId: string;
  pickupZone: {
    city: string;
    coordinates: { lat: number; lng: number };
    radius: number;
  };
  deliveryZone: {
    city: string;
    coordinates: { lat: number; lng: number };
    radius: number;
  };
  frequency: number;
  avgWeight: number;
  avgPallets: number;
  constraints: string[];
  preferredCarriers: string[];
}

export const detectLanes = async (industrialId: string): Promise<Lane[]> => {
  const response = await apiClient.post('/api/transport-orders/lanes/detect', {
    industrialId,
    minFrequency: 3, // Minimum 3 commandes pour détecter une lane
    daysRange: 90 // Analyser les 90 derniers jours
  });
  return response.data.lanes;
};
```

### Matcher une commande avec une lane

```typescript
export const matchOrderToLane = async (orderId: string) => {
  const response = await apiClient.post(`/api/transport-orders/${orderId}/lane-match`);
  return response.data;
};
```

### Générer une dispatch chain

```typescript
export interface DispatchChainOptions {
  orderId: string;
  minCarrierScore?: number; // Score minimum (0-100)
  maxCarriers?: number; // Nombre max de transporteurs dans la chaîne
  timeout?: number; // Timeout par transporteur (en millisecondes)
}

export const generateDispatchChain = async (options: DispatchChainOptions) => {
  const { orderId, ...params } = options;

  const response = await apiClient.post(
    `/api/transport-orders/${orderId}/dispatch/chain`,
    params
  );

  return response.data.chain;
};

// Composant React
export function DispatchChainView({ orderId }: { orderId: string }) {
  const [chain, setChain] = useState<any>(null);

  useEffect(() => {
    const fetchChain = async () => {
      const data = await generateDispatchChain({
        orderId,
        minCarrierScore: 70,
        maxCarriers: 5,
        timeout: 7200000 // 2 heures
      });
      setChain(data);
    };
    fetchChain();
  }, [orderId]);

  if (!chain) return <div>Génération de la chaîne...</div>;

  return (
    <div>
      <h2>Chaîne d'affectation</h2>
      <p>Nombre de transporteurs éligibles: {chain.eligibleCarriers}</p>
      {chain.carriers.map((carrier: any, index: number) => (
        <div key={carrier.carrierId}>
          <h3>#{index + 1} - {carrier.carrierName}</h3>
          <p>Score: {carrier.totalScore}/100</p>
          <p>Prix estimé: {carrier.estimatedPrice}€</p>
        </div>
      ))}
    </div>
  );
}
```

---

## 📍 3. Tracking (3 Niveaux)

### A. Tracking Premium (TomTom API)

```typescript
export const startTracking = async (orderId: string, vehicleId: string) => {
  const response = await apiClient.post(`/api/transport-orders/${orderId}/tracking/start`, {
    vehicleId,
    trackingType: 'PREMIUM'
  });
  return response.data;
};

export const updateTrackingPosition = async (
  orderId: string,
  position: { lat: number; lng: number }
) => {
  const response = await apiClient.post(`/api/transport-orders/${orderId}/tracking/update`, {
    position,
    timestamp: new Date().toISOString()
  });
  return response.data;
};

export const getTrackingHistory = async (orderId: string) => {
  const response = await apiClient.get(`/api/transport-orders/${orderId}/tracking`);
  return response.data.tracking;
};
```

### B. Tracking Basic (Email)

```typescript
export const sendTrackingEmail = async (
  orderId: string,
  carrierEmail: string,
  carrierName?: string
) => {
  const response = await apiClient.post(
    `/api/transport-orders/${orderId}/tracking/email/send`,
    {
      carrierEmail,
      carrierName: carrierName || 'Transporteur'
    }
  );
  return response.data;
};

// Composant pour envoyer l'email
export function SendTrackingEmailButton({ orderId }: { orderId: string }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    try {
      await sendTrackingEmail(orderId, email);
      setSent(true);
      alert('Email de tracking envoyé avec succès !');
    } catch (error) {
      alert('Erreur lors de l\'envoi de l\'email');
    }
  };

  return (
    <div>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email du transporteur"
      />
      <button onClick={handleSend} disabled={sent}>
        {sent ? '✓ Email envoyé' : 'Envoyer l\'email de tracking'}
      </button>
    </div>
  );
}
```

### C. Tracking Smartphone (GPS)

```typescript
// À implémenter avec l'application React Native
// Les endpoints sont prêts côté backend
```

---

## 📄 4. Gestion des Documents & OCR

### Upload d'un document

```typescript
export interface DocumentUpload {
  type: 'BL' | 'CMR' | 'POD';
  fileName: string;
  fileUrl: string; // URL S3 ou CDN du fichier uploadé
  uploadedBy?: string;
}

export const uploadDocument = async (orderId: string, doc: DocumentUpload) => {
  const response = await apiClient.post(`/api/transport-orders/${orderId}/documents`, doc);
  return response.data;
};

// Hook pour upload avec S3 presigned URL
export function useDocumentUpload(orderId: string) {
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File, type: 'BL' | 'CMR' | 'POD') => {
    try {
      setUploading(true);

      // 1. Obtenir un presigned URL (à implémenter côté backend)
      // const { uploadUrl, fileUrl } = await getPresignedUploadUrl(file.name);

      // 2. Upload le fichier vers S3
      // await axios.put(uploadUrl, file, { headers: { 'Content-Type': file.type } });

      // 3. Simulé pour l'exemple
      const fileUrl = `https://s3.amazonaws.com/rt-documents/${file.name}`;

      // 4. Enregistrer le document dans l'API
      const result = await uploadDocument(orderId, {
        type,
        fileName: file.name,
        fileUrl
      });

      return result;
    } catch (error) {
      throw error;
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading };
}
```

### Lancer l'extraction OCR

```typescript
export const extractOCR = async (
  orderId: string,
  documentId: string,
  provider: 'AWS_TEXTRACT' | 'GOOGLE_VISION' = 'AWS_TEXTRACT'
) => {
  const response = await apiClient.post(
    `/api/transport-orders/${orderId}/documents/${documentId}/ocr/extract`,
    { provider }
  );
  return response.data;
};

export const getOCRResults = async (orderId: string, documentId: string) => {
  const response = await apiClient.get(
    `/api/transport-orders/${orderId}/documents/${documentId}/ocr/results`
  );
  return response.data;
};

// Composant avec extraction automatique
export function DocumentWithOCR({ orderId, documentId }: any) {
  const [ocrData, setOcrData] = useState<any>(null);
  const [extracting, setExtracting] = useState(false);

  const handleExtract = async () => {
    try {
      setExtracting(true);
      await extractOCR(orderId, documentId, 'AWS_TEXTRACT');

      // Attendre 5 secondes puis récupérer les résultats
      setTimeout(async () => {
        const results = await getOCRResults(orderId, documentId);
        setOcrData(results.ocrData);
        setExtracting(false);
      }, 5000);
    } catch (error) {
      setExtracting(false);
      alert('Erreur OCR');
    }
  };

  return (
    <div>
      <button onClick={handleExtract} disabled={extracting}>
        {extracting ? 'Extraction en cours...' : 'Extraire les données (OCR)'}
      </button>

      {ocrData && (
        <div>
          <h3>Données extraites:</h3>
          <p>Numéro BL: {ocrData.blNumber}</p>
          <p>Date: {ocrData.deliveryDate}</p>
          <p>Quantité: {ocrData.quantity}</p>
          <p>Confiance: {ocrData.confidence}%</p>
        </div>
      )}
    </div>
  );
}
```

---

## 📅 5. Gestion des Rendez-vous (RDV)

### Demander un RDV

```typescript
export interface RDVRequest {
  type: 'PICKUP' | 'DELIVERY';
  proposedSlot: {
    start: string; // ISO 8601
    end: string;
  };
  requestedBy: string;
  notes?: string;
}

export const requestRDV = async (orderId: string, rdv: RDVRequest) => {
  const response = await apiClient.post(`/api/transport-orders/${orderId}/rdv`, rdv);
  return response.data;
};

export const confirmRDV = async (orderId: string, rdvId: string, confirmedBy: string) => {
  const response = await apiClient.put(
    `/api/transport-orders/${orderId}/rdv/${rdvId}/confirm`,
    { confirmedBy }
  );
  return response.data;
};

export const getOrderRDVs = async (orderId: string) => {
  const response = await apiClient.get(`/api/transport-orders/${orderId}/rdv`);
  return response.data.rdvs;
};
```

---

## ⏱️ 6. Monitoring ETA & Retards

```typescript
export const updateETA = async (
  orderId: string,
  currentPosition: { lat: number; lng: number }
) => {
  const response = await apiClient.post(`/api/transport-orders/${orderId}/eta/update`, {
    currentPosition
  });
  return response.data;
};

export const getETAHistory = async (orderId: string) => {
  const response = await apiClient.get(`/api/transport-orders/${orderId}/eta/history`);
  return response.data;
};

// Hook avec polling automatique (rafraîchissement toutes les 30 sec)
export function useRealTimeETA(orderId: string) {
  const [eta, setEta] = useState<any>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await getETAHistory(orderId);
        setEta(data.currentETA);
      } catch (error) {
        console.error('Erreur ETA:', error);
      }
    }, 30000); // 30 secondes

    return () => clearInterval(interval);
  }, [orderId]);

  return eta;
}
```

---

## ⭐ 7. Scoring & Clôture

### Calculer le score transporteur

```typescript
export const calculateCarrierScore = async (orderId: string) => {
  const response = await apiClient.post(`/api/transport-orders/${orderId}/score`);
  return response.data;
};
```

### Clôturer une commande

```typescript
export const closeOrder = async (orderId: string, options = {}) => {
  const response = await apiClient.post(`/api/transport-orders/${orderId}/close`, options);
  return response.data;
};

export const getClosureStatus = async (orderId: string) => {
  const response = await apiClient.get(`/api/transport-orders/${orderId}/closure-status`);
  return response.data;
};
```

---

## 🔐 8. Authentication (Onboarding)

### Soumettre une demande d'onboarding

```typescript
export interface OnboardingData {
  email: string;
  companyName: string;
  siret?: string;
  vatNumber?: string;
  phone?: string;
  address?: any;
  subscriptionType?: string;
}

export const submitOnboarding = async (data: OnboardingData) => {
  const response = await apiClient.post('/api/onboarding/submit', data);
  return response.data;
};

// Formulaire complet
export function OnboardingForm() {
  const [formData, setFormData] = useState<OnboardingData>({
    email: '',
    companyName: '',
    siret: '',
    vatNumber: '',
    phone: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const result = await submitOnboarding(formData);

      alert(`Demande soumise avec succès! ID: ${result.requestId}`);

      // Rediriger vers page de confirmation
      router.push('/onboarding/success');
    } catch (error: any) {
      if (error.response?.data?.error?.code === 'DUPLICATE_REQUEST') {
        alert('Cette adresse email est déjà enregistrée');
      } else {
        alert('Erreur lors de la soumission');
      }
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        required
        placeholder="Email"
      />
      <input
        type="text"
        value={formData.companyName}
        onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
        required
        placeholder="Nom de société"
      />
      <button type="submit">Soumettre</button>
    </form>
  );
}
```

---

## 🔔 9. Webhooks & Événements Temps Réel

### Configurer un webhook

```typescript
// Configuration côté serveur (Next.js API Route)
// pages/api/webhooks/transport-events.ts
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const event = req.body;

  console.log('Événement reçu:', event.eventType);

  switch (event.eventType) {
    case 'order.created':
      // Nouvelle commande créée
      break;
    case 'tracking.started':
      // Tracking commencé
      break;
    case 'order.delivered':
      // Commande livrée
      break;
    case 'documents.uploaded':
      // Documents uploadés
      break;
    case 'carrier.scored':
      // Score transporteur calculé
      break;
    case 'order.closed':
      // Commande clôturée
      break;
    default:
      console.log('Événement non géré:', event.eventType);
  }

  res.status(200).json({ received: true });
}
```

### WebSocket pour temps réel (optionnel)

```typescript
// lib/websocket-client.ts
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const connectWebSocket = (orderId: string) => {
  if (socket) return socket;

  socket = io(process.env.NEXT_PUBLIC_WS_URL || 'wss://your-websocket-server.com', {
    query: { orderId }
  });

  socket.on('connect', () => {
    console.log('WebSocket connecté');
  });

  socket.on('tracking.update', (data) => {
    console.log('Mise à jour position:', data);
  });

  socket.on('status.changed', (data) => {
    console.log('Changement de statut:', data);
  });

  return socket;
};

// Hook React
export function useWebSocketTracking(orderId: string) {
  const [position, setPosition] = useState<any>(null);

  useEffect(() => {
    const ws = connectWebSocket(orderId);

    ws.on('tracking.update', (data) => {
      setPosition(data.position);
    });

    return () => {
      ws.off('tracking.update');
    };
  }, [orderId]);

  return position;
}
```

---

## 🛠️ 10. Gestion des Erreurs

### Types d'erreurs

```typescript
export interface APIError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export const handleAPIError = (error: any): string => {
  if (error.response?.data?.error) {
    const { code, message } = error.response.data.error;

    switch (code) {
      case 'DATABASE_UNAVAILABLE':
        return 'Base de données temporairement indisponible';
      case 'INVALID_INPUT':
        return 'Données invalides';
      case 'ORDER_NOT_FOUND':
        return 'Commande non trouvée';
      case 'UNAUTHORIZED':
        return 'Accès non autorisé';
      case 'DUPLICATE_REQUEST':
        return 'Cette demande existe déjà';
      default:
        return message || 'Une erreur est survenue';
    }
  }

  return 'Erreur de connexion au serveur';
};

// Utilisation
try {
  await createOrder(data);
} catch (error) {
  const errorMessage = handleAPIError(error);
  alert(errorMessage);
}
```

---

## ✅ Checklist d'Intégration

**Configuration de base:**
- [ ] Variables d'environnement configurées (.env.local, .env.production)
- [ ] Client API créé (lib/api-client.ts)
- [ ] Intercepteurs configurés (token JWT, logs, erreurs)

**Modules intégrés:**
- [ ] Création/gestion des commandes
- [ ] Lane matching & dispatch chain
- [ ] Tracking (Premium, Basic, ou Smartphone)
- [ ] Upload & OCR des documents
- [ ] Gestion des RDV
- [ ] Monitoring ETA & retards
- [ ] Scoring transporteur
- [ ] Clôture des commandes
- [ ] Onboarding

**Fonctionnalités avancées:**
- [ ] Webhooks configurés
- [ ] WebSocket (temps réel) implémenté
- [ ] Gestion des erreurs complète
- [ ] Logs & monitoring

---

## 📚 Ressources

- [Documentation API complète](./ANALYSE_CONFORMITE_CAHIER_DES_CHARGES.md)
- [Configuration OCR](./CONFIGURATION_OCR_AWS_GOOGLE.md)
- [Configuration Email](./CONFIGURATION_SENDGRID_EMAIL.md)
- [Webhooks & Événements](./DOCUMENTATION_WEBHOOKS_EVENTS.md) (à venir)

---

**Guide créé le:** 25 novembre 2025
**Par:** Claude Code (Anthropic)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
