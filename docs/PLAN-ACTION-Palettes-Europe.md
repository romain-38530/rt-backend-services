# Plan d'Action Technique - Module Palettes Europe

## SYMPHONI.A - RT Technologie
**Date:** 26 Decembre 2025

---

## PROBLEMES IDENTIFIES LORS DE L'AUDIT

### Probleme 1: CloudFront mal configure (CRITIQUE)
```
CloudFront: d2o4ng8nutcmou.cloudfront.net
├── Pointe vers: rt-palettes-api-prod (ANCIEN service - API differente)
└── Devrait pointer vers: rt-palettes-circular-prod (NOUVEAU service v1.1.0)
```

**Impact:** Les 3 frontends ne peuvent pas communiquer avec l'API → Dashboard vide

### Probleme 2: Deux environnements EB en conflit
```
eu-central-1:
├── rt-palettes-api-prod      (ancien, routes differentes)
└── rt-palettes-circular-prod (nouveau, v1.1.0 complet)
```

### Probleme 3: Aucune donnee de test
- 0 sites de restitution
- 0 cheques-palette
- 0 entreprises dans le module

---

## TACHES A REALISER

### PHASE 1: CORRECTION CLOUDFRONT (Priorite: URGENTE)

#### Tache 1.1: Mettre a jour l'origine CloudFront
```bash
# Option A: Via AWS CLI
aws cloudfront get-distribution-config --id E3OZ7N2ZYEBYM7 > cf-config.json

# Modifier l'origine dans cf-config.json:
# "DomainName": "rt-palettes-circular-prod.eba-mqjpbjmp.eu-central-1.elasticbeanstalk.com"

aws cloudfront update-distribution --id E3OZ7N2ZYEBYM7 --distribution-config file://cf-config-updated.json --if-match <ETAG>
```

#### Tache 1.2: Alternative - Mettre a jour les URLs frontend
Si CloudFront trop complexe, modifier directement:

**web-industry/pages/palettes.tsx:**
```typescript
const apiUrl = process.env.NEXT_PUBLIC_PALETTES_API_URL ||
  'http://rt-palettes-circular-prod.eba-mqjpbjmp.eu-central-1.elasticbeanstalk.com';
```

**web-transporter/pages/palettes.tsx:**
```typescript
const apiUrl = process.env.NEXT_PUBLIC_PALETTES_API_URL ||
  'http://rt-palettes-circular-prod.eba-mqjpbjmp.eu-central-1.elasticbeanstalk.com';
```

**web-logistician/pages/palettes.tsx:**
```typescript
const apiUrl = process.env.NEXT_PUBLIC_PALETTES_API_URL ||
  'http://rt-palettes-circular-prod.eba-mqjpbjmp.eu-central-1.elasticbeanstalk.com';
```

#### Tache 1.3: Configurer HTTPS pour l'EB
```bash
# Ajouter certificat SSL via ACM
aws acm request-certificate --domain-name palettes-api.symphonia-controltower.com --validation-method DNS

# Configurer le load balancer EB pour HTTPS
```

---

### PHASE 2: DONNEES DE DEMONSTRATION

#### Tache 2.1: Script de seed des entreprises
```javascript
// seed-companies.js
const companies = [
  {
    companyId: 'COMP-IND001',
    name: 'Usine Carrefour Lyon',
    type: 'industriel',
    siret: '45678901234567',
    address: {
      street: '15 Rue de la Logistique',
      city: 'Lyon',
      postalCode: '69007',
      country: 'FR',
      coordinates: { latitude: 45.7578, longitude: 4.8320 }
    },
    contact: { email: 'logistique@carrefour-lyon.fr', phone: '+33472000001' }
  },
  {
    companyId: 'COMP-TRANS001',
    name: 'Transport Express Lyon SARL',
    type: 'transporteur',
    siret: '12345678901234',
    address: {
      street: '10 Avenue des Transporteurs',
      city: 'Villeurbanne',
      postalCode: '69100',
      country: 'FR',
      coordinates: { latitude: 45.7676, longitude: 4.8798 }
    },
    contact: { email: 'contact@transport-express-lyon.fr', phone: '+33478000001' }
  },
  {
    companyId: 'COMP-LOG001',
    name: 'Logistique Rhone-Alpes',
    type: 'logisticien',
    siret: '98765432109876',
    address: {
      street: '25 Zone Industrielle',
      city: 'Saint-Priest',
      postalCode: '69800',
      country: 'FR',
      coordinates: { latitude: 45.6967, longitude: 4.9478 }
    },
    contact: { email: 'reception@log-rhonealpes.fr', phone: '+33472000002' }
  }
];
```

#### Tache 2.2: Script de seed des sites
```javascript
// seed-sites.js
const sites = [
  {
    siteId: 'SITE-LYO001',
    companyId: 'COMP-LOG001',
    name: 'Entrepot Lyon Sud',
    type: 'entrepot',
    address: {
      street: '25 Zone Industrielle',
      city: 'Saint-Priest',
      postalCode: '69800',
      country: 'FR',
      coordinates: { latitude: 45.6967, longitude: 4.9478 }
    },
    quota: { dailyMax: 200, currentDaily: 0 },
    openingHours: {
      monday: { open: '06:00', close: '20:00', available: true },
      tuesday: { open: '06:00', close: '20:00', available: true },
      wednesday: { open: '06:00', close: '20:00', available: true },
      thursday: { open: '06:00', close: '20:00', available: true },
      friday: { open: '06:00', close: '20:00', available: true },
      saturday: { open: '08:00', close: '12:00', available: true },
      sunday: { open: '00:00', close: '00:00', available: false }
    },
    priority: 'network',
    acceptsExternalPalettes: true,
    preferredZones: ['69', '38', '01'],
    active: true
  },
  {
    siteId: 'SITE-PAR001',
    companyId: 'COMP-LOG001',
    name: 'Plateforme Paris-Rungis',
    type: 'plateforme',
    address: {
      street: '1 Rue du MIN',
      city: 'Rungis',
      postalCode: '94150',
      country: 'FR',
      coordinates: { latitude: 48.7469, longitude: 2.3514 }
    },
    quota: { dailyMax: 500, currentDaily: 0 },
    openingHours: {
      monday: { open: '04:00', close: '22:00', available: true },
      tuesday: { open: '04:00', close: '22:00', available: true },
      wednesday: { open: '04:00', close: '22:00', available: true },
      thursday: { open: '04:00', close: '22:00', available: true },
      friday: { open: '04:00', close: '22:00', available: true },
      saturday: { open: '04:00', close: '14:00', available: true },
      sunday: { open: '00:00', close: '00:00', available: false }
    },
    priority: 'public',
    acceptsExternalPalettes: true,
    preferredZones: ['75', '92', '93', '94'],
    active: true
  },
  {
    siteId: 'SITE-MAR001',
    companyId: 'COMP-LOG001',
    name: 'Hub Marseille Fos',
    type: 'quai',
    address: {
      street: 'Port de Fos',
      city: 'Fos-sur-Mer',
      postalCode: '13270',
      country: 'FR',
      coordinates: { latitude: 43.4344, longitude: 4.9306 }
    },
    quota: { dailyMax: 300, currentDaily: 0 },
    openingHours: {
      monday: { open: '07:00', close: '19:00', available: true },
      tuesday: { open: '07:00', close: '19:00', available: true },
      wednesday: { open: '07:00', close: '19:00', available: true },
      thursday: { open: '07:00', close: '19:00', available: true },
      friday: { open: '07:00', close: '19:00', available: true },
      saturday: { open: '00:00', close: '00:00', available: false },
      sunday: { open: '00:00', close: '00:00', available: false }
    },
    priority: 'network',
    acceptsExternalPalettes: true,
    preferredZones: ['13', '84', '83'],
    active: true
  }
];
```

#### Tache 2.3: Script de seed des cheques
```javascript
// seed-cheques.js - Generer 20 cheques de demo
const cheques = [];
for (let i = 1; i <= 20; i++) {
  cheques.push({
    chequeId: `CHQ-DEMO${String(i).padStart(4, '0')}`,
    orderId: `ORD-2024${String(i).padStart(4, '0')}`,
    palletType: ['EURO_EPAL', 'EURO_EPAL_2', 'DEMI_PALETTE'][i % 3],
    quantity: 10 + (i * 2),
    transporterId: 'COMP-TRANS001',
    transporterName: 'Transport Express Lyon SARL',
    vehiclePlate: `AB-${100 + i}-CD`,
    driverName: `Chauffeur ${i}`,
    destinationSiteId: ['SITE-LYO001', 'SITE-PAR001', 'SITE-MAR001'][i % 3],
    destinationSiteName: ['Entrepot Lyon Sud', 'Plateforme Paris-Rungis', 'Hub Marseille Fos'][i % 3],
    status: ['EMIS', 'DEPOSE', 'RECU', 'RECU', 'RECU'][i % 5],
    timestamps: {
      emittedAt: new Date(Date.now() - (20 - i) * 24 * 60 * 60 * 1000),
      depositedAt: i % 5 >= 1 ? new Date(Date.now() - (19 - i) * 24 * 60 * 60 * 1000) : null,
      receivedAt: i % 5 >= 2 ? new Date(Date.now() - (18 - i) * 24 * 60 * 60 * 1000) : null
    }
  });
}
```

---

### PHASE 3: INTERCONNEXIONS MODULES

#### Tache 3.1: Integration avec core-orders
**Fichier:** `services/core-orders/routes/orders.js`

```javascript
// Ajouter dans le schema Order:
palletTracking: {
  enabled: { type: Boolean, default: false },
  palletType: String,
  expectedQuantity: Number,
  chequeId: String,  // Reference vers palettes-circular-api
  pickup: {
    quantity: Number,
    confirmedAt: Date,
    confirmedBy: String
  },
  delivery: {
    quantity: Number,
    status: String,  // confirmed | disputed
    confirmedAt: Date
  }
}

// Endpoint pour lier commande et cheque
router.post('/api/v1/orders/:orderId/link-pallet-cheque', async (req, res) => {
  const { chequeId } = req.body;
  // Appeler palettes-circular-api pour verifier le cheque
  // Mettre a jour l'ordre avec la reference
});
```

#### Tache 3.2: Integration avec billing-api
**Fichier:** `services/billing-api/index.js`

```javascript
// Ajouter un endpoint pour facturer les operations palettes
app.post('/api/billing/pallet-operations', async (req, res) => {
  const { companyId, month, year } = req.body;

  // Recuperer stats palettes depuis palettes-circular-api
  const palletStats = await axios.get(
    `${PALETTES_API_URL}/api/palettes/stats?companyId=${companyId}&startDate=...&endDate=...`
  );

  // Generer ligne de facturation
  const palletLine = {
    description: `Operations palettes - ${month}/${year}`,
    quantity: palletStats.data.cheques.total,
    unitPrice: 0.50, // 0.50 EUR par cheque
    amount: palletStats.data.cheques.total * 0.50
  };

  // Ajouter a la prefacturation
});
```

#### Tache 3.3: Integration avec kpi-api
**Fichier:** `services/kpi-api/index.js`

```javascript
// Ajouter KPIs palettes dans le calcul
const getPalletKPIs = async (carrierId, period) => {
  const stats = await axios.get(
    `${PALETTES_API_URL}/api/palettes/stats?companyId=${carrierId}&...`
  );

  return {
    totalChequesEmis: stats.data.cheques.total,
    palettesRestitues: stats.data.palettes.totalRestitues,
    tauxLitiges: stats.data.litiges.total / stats.data.cheques.total * 100,
    tauxResolution: stats.data.litiges.tauxResolution,
    balanceNette: stats.data.ledger?.balances?.EURO_EPAL || 0
  };
};
```

---

### PHASE 4: AMELIORATIONS FRONTEND

#### Tache 4.1: Chargement initial des donnees
**Probleme:** Le useEffect ne charge pas les donnees au demarrage

**web-industry/pages/palettes.tsx:**
```typescript
useEffect(() => {
  if (!mounted) return;
  if (!isAuthenticated()) { router.push('/login'); return; }

  // AJOUTER: Charger les donnees
  const loadAllData = async () => {
    await Promise.all([
      loadLedger(),
      loadCheques(),
      loadDisputes(),
      loadNearbySites()
    ]);
  };
  loadAllData();
}, [mounted]);
```

#### Tache 4.2: Gestion des erreurs API
```typescript
const apiCall = async (endpoint: string, method: string = 'GET', body?: any) => {
  try {
    const token = getAuthToken();
    const response = await fetch(`${apiUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Erreur ${response.status}`);
    }

    return response.json();
  } catch (error: any) {
    // Afficher erreur utilisateur
    setError(`Erreur API: ${error.message}`);
    throw error;
  }
};
```

#### Tache 4.3: Indicateur de chargement global
```typescript
const [isInitialLoading, setIsInitialLoading] = useState(true);

useEffect(() => {
  // ...
  const loadAllData = async () => {
    setIsInitialLoading(true);
    try {
      await Promise.all([...]);
    } finally {
      setIsInitialLoading(false);
    }
  };
}, [mounted]);

// Dans le render:
{isInitialLoading ? (
  <div className="flex items-center justify-center h-64">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
    <span className="ml-4">Chargement des donnees palettes...</span>
  </div>
) : (
  // Contenu normal
)}
```

---

### PHASE 5: TESTS ET VALIDATION

#### Tache 5.1: Tests API (Postman/Jest)
```javascript
// tests/palettes-api.test.js
describe('Palettes Circular API', () => {
  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });
  });

  describe('Sites', () => {
    it('should list active sites', async () => {
      const res = await request(app).get('/api/palettes/sites?active=true');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('Cheques', () => {
    it('should emit a new cheque', async () => {
      const res = await request(app)
        .post('/api/palettes/cheques')
        .set('Authorization', `Bearer ${token}`)
        .send({
          transporterId: 'COMP-TRANS001',
          destinationSiteId: 'SITE-LYO001',
          palletType: 'EURO_EPAL',
          quantity: 10
        });
      expect(res.status).toBe(201);
      expect(res.body.data.chequeId).toBeDefined();
    });
  });
});
```

#### Tache 5.2: Tests E2E (Cypress)
```javascript
// cypress/e2e/palettes.cy.js
describe('Module Palettes - Industriel', () => {
  beforeEach(() => {
    cy.login('industriel@test.com', 'password');
    cy.visit('/palettes');
  });

  it('should display dashboard with KPIs', () => {
    cy.contains('Balance Totale').should('be.visible');
    cy.contains('Cheques ce Mois').should('be.visible');
    cy.contains('Litiges Actifs').should('be.visible');
  });

  it('should create a recovery request', () => {
    cy.get('[data-testid="tab-requests"]').click();
    cy.get('select[name="type"]').select('recuperation');
    cy.get('input[name="quantity"]').clear().type('50');
    cy.get('input[name="preferredDate"]').type('2025-01-15');
    cy.get('button').contains('Creer la Demande').click();
    cy.contains('Demande creee avec succes').should('be.visible');
  });
});
```

---

## CHECKLIST DE DEPLOIEMENT

### Pre-deploiement
- [ ] Backup base MongoDB
- [ ] Documenter configuration actuelle CloudFront
- [ ] Preparer rollback plan

### Deploiement Phase 1
- [ ] Modifier origine CloudFront
- [ ] Invalider cache CloudFront
- [ ] Tester depuis les 3 frontends
- [ ] Verifier logs EB

### Deploiement Phase 2
- [ ] Executer scripts de seed
- [ ] Verifier donnees en base
- [ ] Tester dashboard avec donnees

### Post-deploiement
- [ ] Monitoring 24h
- [ ] Verifier metriques CloudWatch
- [ ] Collecter feedback utilisateurs

---

## COMMANDES UTILES

```bash
# Tester API directement
curl http://rt-palettes-circular-prod.eba-mqjpbjmp.eu-central-1.elasticbeanstalk.com/health

# Logs Elastic Beanstalk
eb logs --environment rt-palettes-circular-prod

# Invalider cache CloudFront
aws cloudfront create-invalidation --distribution-id E3OZ7N2ZYEBYM7 --paths "/*"

# Deployer nouvelle version
cd services/palettes-circular-api
eb deploy rt-palettes-circular-prod
```

---

*Document technique - RT Technologie SYMPHONI.A*
