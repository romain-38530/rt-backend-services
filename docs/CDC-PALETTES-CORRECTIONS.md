# Cahier des Charges - Corrections Module Economie Circulaire Palettes

**Version:** 1.0
**Date:** 11 janvier 2026
**Projet:** SYMPHONI.A TMS - Module Palettes
**Statut:** A corriger

---

## 1. RESUME EXECUTIF

### 1.1 Contexte
Le module "Economie Circulaire Palettes" du portail logisticien permet la gestion des cheques-palettes, le suivi des comptes palettes entre partenaires, et la resolution des litiges. L'audit du 11/01/2026 a revele plusieurs dysfonctionnements critiques empechant l'utilisation en production.

### 1.2 Objectif
Corriger l'ensemble des erreurs identifiees pour rendre le module pleinement operationnel.

### 1.3 Perimetre
- Frontend: `web-logistician/pages/palettes.tsx`
- Backend: `rt-palettes-circular-api`
- Infrastructure: CloudFront distribution `d2o4ng8nutcmou`

---

## 2. ETAT DES LIEUX

### 2.1 Architecture Actuelle

```
┌─────────────────────────────────────────────────────────────────┐
│                    PORTAIL LOGISTICIEN                          │
│         https://logisticien.symphonia-controltower.com          │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CLOUDFRONT (HTTPS)                            │
│              d2o4ng8nutcmou.cloudfront.net                      │
│                    STATUS: ERREUR SSL                           │
└─────────────────────────┬───────────────────────────────────────┘
                          │ ✗ Connection failed
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│               ELASTIC BEANSTALK (HTTP)                          │
│   rt-palettes-circular-prod.eba-mqjpbjmp.eu-central-1.eb.com    │
│                    STATUS: HEALTHY (Green)                      │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Fonctionnalites par Onglet

| Onglet | Description | Etat Actuel |
|--------|-------------|-------------|
| Reception | Scanner/recevoir cheques-palettes | NON FONCTIONNEL |
| Mes Sites | Gestion des sites de reception | NON FONCTIONNEL |
| Grand Livre | Solde compte palettes | NON FONCTIONNEL |
| Litiges | Gestion des contestations | NON FONCTIONNEL |
| Statistiques | KPIs et metriques | NON FONCTIONNEL |
| Scanner | Scan QR code cheques | NON FONCTIONNEL |
| Carte | Visualisation geographique | NON FONCTIONNEL |

---

## 3. ERREURS IDENTIFIEES

### 3.1 ERREUR CRITIQUE #1 - CloudFront Non Configure

**Severite:** BLOQUANT
**Impact:** Module entierement inaccessible

**Description:**
La distribution CloudFront `d2o4ng8nutcmou` ne route pas correctement vers l'API Elastic Beanstalk. Erreur SSL/TLS (exit code 35).

**Evidence:**
```bash
# Echec
$ curl https://d2o4ng8nutcmou.cloudfront.net/health
# Exit code 35 (SSL handshake failed)

# Succes direct
$ curl http://rt-palettes-circular-prod.eba-mqjpbjmp.eu-central-1.elasticbeanstalk.com/health
# {"status":"healthy","service":"palettes-circular-api","version":"1.0.0"}
```

**Correction Requise:**
1. Verifier la configuration origin dans CloudFront
2. Configurer le protocole origin (HTTP only vers EB)
3. Verifier le certificat SSL CloudFront
4. Tester la connectivite end-to-end

---

### 3.2 ERREUR CRITIQUE #2 - CompanyId Hardcode

**Severite:** BLOQUANT
**Impact:** Tous les utilisateurs partagent le meme compte

**Fichier:** `web-logistician/pages/palettes.tsx` (ligne ~205)

**Code Actuel:**
```typescript
const companyId = 'LOG-001'; // TODO: Get from auth context
```

**Correction Requise:**
```typescript
// Recuperer le companyId depuis le contexte d'authentification
const { user } = useAuth();
const companyId = user?.companyId || user?.company?.id;

if (!companyId) {
  return <ErrorPage message="Compte entreprise non configure" />;
}
```

---

### 3.3 ERREUR MAJEURE #3 - Geolocalisation Sans Fallback

**Severite:** MAJEUR
**Impact:** Reception impossible si geolocalisation refusee

**Fichiers:** `palettes.tsx` (lignes ~296-298, ~496-497)

**Code Actuel:**
```typescript
navigator.geolocation.getCurrentPosition((pos) => {
  // Utilise la position
}, (err) => {
  // Pas de fallback - silencieux
});
```

**Correction Requise:**
```typescript
const getLocationOrFallback = async (): Promise<{lat: number, lng: number} | null> => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.warn('Geolocation non supportee');
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        console.warn('Geolocation refusee:', err.message);
        // Fallback: utiliser l'adresse du site selectionne
        resolve(null);
      },
      { timeout: 5000, enableHighAccuracy: false }
    );
  });
};
```

---

### 3.4 ERREUR MAJEURE #4 - Sites Non Modifiables

**Severite:** MAJEUR
**Impact:** Impossible de corriger les informations d'un site

**Description:**
Apres creation, tous les champs d'un site sont en lecture seule. Seuls le statut actif/inactif et les quotas peuvent etre modifies.

**Correction Requise:**
1. Ajouter un mode edition pour les sites existants
2. Permettre la modification de: nom, adresse, coordonnees, capacites
3. Conserver l'historique des modifications (audit trail)

---

### 3.5 ERREUR MAJEURE #5 - Pattern N+1 Statistiques

**Severite:** MAJEUR
**Impact:** Performance degradee avec beaucoup de sites

**Code Actuel:**
```typescript
// Pour chaque site, un appel API
sites.forEach(async (site) => {
  const stats = await fetch(`/api/palettes/sites/${site.id}/stats`);
});
```

**Correction Requise:**
```typescript
// Un seul appel API pour tous les sites
const stats = await fetch(`/api/palettes/stats?companyId=${companyId}`);
```

**Backend a creer:**
```javascript
// GET /api/palettes/stats?companyId=XXX
router.get('/stats', async (req, res) => {
  const { companyId } = req.query;
  const sites = await db.collection('palettes_sites').find({ companyId }).toArray();
  const stats = await Promise.all(sites.map(site => calculateSiteStats(site)));
  res.json({ success: true, data: { sites: stats, summary: calculateSummary(stats) } });
});
```

---

### 3.6 ERREUR MOYENNE #6 - Pas de Donnees de Test

**Severite:** MOYEN
**Impact:** Impossible de tester/demontrer le module

**Correction Requise:**
Creer un jeu de donnees de demonstration:

```javascript
// Donnees mock a inserer
const mockData = {
  sites: [
    { id: 'SITE-001', name: 'Entrepot Lyon', city: 'Lyon', capacity: { EURO_EPAL: 500 } },
    { id: 'SITE-002', name: 'Plateforme Paris', city: 'Paris', capacity: { EURO_EPAL: 800 } }
  ],
  cheques: [
    { id: 'CHQ-2026-001', status: 'DEPOSE', quantity: 50, type: 'EURO_EPAL', transporteur: 'Transport Express' }
  ],
  ledger: {
    balances: { EURO_EPAL: 150, EURO_EPAL_2: 25, DEMI_PALETTE: 10, PALETTE_PERDUE: -5 }
  }
};
```

---

### 3.7 ERREUR MOYENNE #7 - Gestion Erreurs API

**Severite:** MOYEN
**Impact:** Messages d'erreur generiques non informatifs

**Code Actuel:**
```typescript
catch (error) {
  setError('Une erreur est survenue');
}
```

**Correction Requise:**
```typescript
catch (error: any) {
  const message = error.response?.data?.error?.message
    || error.message
    || 'Erreur de connexion au serveur';
  setError(message);

  // Log pour debug
  console.error('[Palettes]', error);
}
```

---

### 3.8 ERREUR MINEURE #8 - Pas de Filtres sur Cheques

**Severite:** MINEUR
**Impact:** Liste longue difficile a naviguer

**Correction Requise:**
Ajouter des filtres:
- Par date (debut/fin)
- Par statut
- Par type de palette
- Par transporteur
- Recherche texte

---

### 3.9 ERREUR MINEURE #9 - Pas d'Actions Groupees

**Severite:** MINEUR
**Impact:** Operations repetitives pour plusieurs cheques

**Correction Requise:**
- Selection multiple de cheques
- Reception groupee
- Export filtre (date range, statut)

---

### 3.10 ERREUR MINEURE #10 - Pas de Mode Hors-Ligne

**Severite:** MINEUR
**Impact:** Inutilisable sans connexion internet

**Correction Requise (Phase 2):**
- Cache local des donnees
- Queue des operations en attente
- Synchronisation au retour online

---

## 4. PLAN DE CORRECTION

### 4.1 Phase 1 - Corrections Critiques (Priorite P0)

| Tache | Description | Effort | Responsable |
|-------|-------------|--------|-------------|
| P0-1 | Corriger CloudFront distribution | 2h | DevOps |
| P0-2 | Corriger companyId depuis auth | 1h | Frontend |
| P0-3 | Tester connectivite end-to-end | 1h | QA |

**Livrable:** Module accessible et fonctionnel basique

---

### 4.2 Phase 2 - Corrections Majeures (Priorite P1)

| Tache | Description | Effort | Responsable |
|-------|-------------|--------|-------------|
| P1-1 | Ajouter fallback geolocalisation | 2h | Frontend |
| P1-2 | Permettre edition sites existants | 4h | Frontend + Backend |
| P1-3 | Creer endpoint stats batch | 3h | Backend |
| P1-4 | Inserer donnees de demonstration | 2h | Backend |
| P1-5 | Ameliorer gestion erreurs | 2h | Frontend |

**Livrable:** Module pleinement fonctionnel

---

### 4.3 Phase 3 - Ameliorations (Priorite P2)

| Tache | Description | Effort | Responsable |
|-------|-------------|--------|-------------|
| P2-1 | Ajouter filtres sur liste cheques | 3h | Frontend |
| P2-2 | Implementer actions groupees | 4h | Frontend + Backend |
| P2-3 | Ajouter export avec filtres | 2h | Frontend |

**Livrable:** Experience utilisateur amelioree

---

### 4.4 Phase 4 - Fonctionnalites Avancees (Priorite P3)

| Tache | Description | Effort | Responsable |
|-------|-------------|--------|-------------|
| P3-1 | Mode hors-ligne (PWA) | 8h | Frontend |
| P3-2 | Notifications temps reel | 4h | Backend + Frontend |
| P3-3 | Analytics et rapports | 6h | Full Stack |

**Livrable:** Module enterprise-ready

---

## 5. SPECIFICATIONS TECHNIQUES

### 5.1 Correction CloudFront (P0-1)

**Actions AWS Console:**

```bash
# 1. Verifier la distribution
aws cloudfront get-distribution --id E_DISTRIBUTION_ID

# 2. Mettre a jour l'origin
aws cloudfront update-distribution --id E_DISTRIBUTION_ID \
  --distribution-config file://cloudfront-config.json
```

**Configuration Origin:**
```json
{
  "Origins": {
    "Items": [{
      "Id": "palettes-api-origin",
      "DomainName": "rt-palettes-circular-prod.eba-mqjpbjmp.eu-central-1.elasticbeanstalk.com",
      "CustomOriginConfig": {
        "HTTPPort": 80,
        "HTTPSPort": 443,
        "OriginProtocolPolicy": "http-only",
        "OriginSslProtocols": { "Items": ["TLSv1.2"] }
      }
    }]
  }
}
```

---

### 5.2 Correction Auth Context (P0-2)

**Fichier:** `web-logistician/pages/palettes.tsx`

```typescript
import { useAuth } from '@/lib/auth';

export default function PalettesPage() {
  const { user, isAuthenticated } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login?redirect=/palettes');
      return;
    }

    // Recuperer companyId depuis le token ou user object
    const id = user?.companyId || user?.company?.id || localStorage.getItem('companyId');

    if (!id) {
      setAuthError('Votre compte n\'est pas associe a une entreprise. Contactez l\'administrateur.');
      return;
    }

    setCompanyId(id);
  }, [user]);

  if (authError) {
    return (
      <div className="error-container">
        <h2>Configuration requise</h2>
        <p>{authError}</p>
        <button onClick={() => router.push('/profile')}>Configurer mon compte</button>
      </div>
    );
  }

  if (!companyId) {
    return <LoadingSpinner />;
  }

  // ... reste du composant
}
```

---

### 5.3 Endpoint Stats Batch (P1-3)

**Fichier:** `rt-palettes-circular-api/index.js`

```javascript
// GET /api/palettes/stats - Statistiques globales
router.get('/api/palettes/stats', async (req, res) => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'companyId requis' });
    }

    const db = mongoClient.db();

    // Recuperer tous les sites
    const sites = await db.collection('palettes_sites')
      .find({ companyId, active: true })
      .toArray();

    // Calculer stats par site en parallele
    const siteStats = await Promise.all(sites.map(async (site) => {
      const [chequesPending, chequesReceived, capacity] = await Promise.all([
        db.collection('palettes_cheques').countDocuments({
          destinationSiteId: site._id,
          status: 'DEPOSE'
        }),
        db.collection('palettes_cheques').countDocuments({
          destinationSiteId: site._id,
          status: 'RECU',
          receivedAt: { $gte: new Date(Date.now() - 24*60*60*1000) }
        }),
        db.collection('palettes_capacity').findOne({ siteId: site._id })
      ]);

      return {
        siteId: site._id,
        siteName: site.name,
        city: site.city,
        pending: chequesPending,
        receivedToday: chequesReceived,
        quotaDaily: site.quotaDaily || 100,
        quotaUsed: chequesReceived,
        capacity: capacity?.current || {},
        maxCapacity: site.capacity || {}
      };
    }));

    // Calculer resume global
    const summary = {
      totalSites: sites.length,
      activeSites: sites.filter(s => s.active).length,
      totalPending: siteStats.reduce((sum, s) => sum + s.pending, 0),
      totalReceivedToday: siteStats.reduce((sum, s) => sum + s.receivedToday, 0),
      totalCapacity: {
        EURO_EPAL: siteStats.reduce((sum, s) => sum + (s.maxCapacity.EURO_EPAL || 0), 0),
        EURO_EPAL_2: siteStats.reduce((sum, s) => sum + (s.maxCapacity.EURO_EPAL_2 || 0), 0)
      }
    };

    res.json({
      success: true,
      data: {
        summary,
        sites: siteStats
      }
    });

  } catch (error) {
    console.error('[Stats] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

---

### 5.4 Donnees de Demonstration (P1-4)

**Script:** `scripts/seed-palettes-demo.js`

```javascript
const { MongoClient } = require('mongodb');

const DEMO_COMPANY_ID = 'DEMO-LOGISTICIEN';

const demoData = {
  sites: [
    {
      _id: 'SITE-DEMO-001',
      companyId: DEMO_COMPANY_ID,
      name: 'Entrepot Lyon Gerland',
      address: '15 Avenue Jean Jaures',
      city: 'Lyon',
      postalCode: '69007',
      country: 'France',
      coordinates: { lat: 45.7275, lng: 4.8303 },
      capacity: { EURO_EPAL: 500, EURO_EPAL_2: 200, DEMI_PALETTE: 100 },
      quotaDaily: 50,
      quotaWeekly: 200,
      openingHours: { start: '06:00', end: '20:00' },
      active: true,
      priority: 1,
      createdAt: new Date()
    },
    {
      _id: 'SITE-DEMO-002',
      companyId: DEMO_COMPANY_ID,
      name: 'Plateforme Paris Rungis',
      address: '1 Rue de la Logistique',
      city: 'Rungis',
      postalCode: '94150',
      country: 'France',
      coordinates: { lat: 48.7469, lng: 2.3514 },
      capacity: { EURO_EPAL: 1000, EURO_EPAL_2: 400, DEMI_PALETTE: 200 },
      quotaDaily: 100,
      quotaWeekly: 500,
      openingHours: { start: '04:00', end: '22:00' },
      active: true,
      priority: 2,
      createdAt: new Date()
    }
  ],

  cheques: [
    {
      _id: 'CHQ-2026-DEMO-001',
      companyId: DEMO_COMPANY_ID,
      destinationSiteId: 'SITE-DEMO-001',
      type: 'EURO_EPAL',
      quantity: 50,
      status: 'DEPOSE',
      transporteur: {
        name: 'Transport Express Lyon',
        vehiclePlate: 'AB-123-CD',
        driverName: 'Jean Dupont'
      },
      depositedAt: new Date(Date.now() - 2*60*60*1000),
      createdAt: new Date(Date.now() - 24*60*60*1000)
    },
    {
      _id: 'CHQ-2026-DEMO-002',
      companyId: DEMO_COMPANY_ID,
      destinationSiteId: 'SITE-DEMO-001',
      type: 'EURO_EPAL',
      quantity: 30,
      status: 'DEPOSE',
      transporteur: {
        name: 'Geodis',
        vehiclePlate: 'EF-456-GH',
        driverName: 'Pierre Martin'
      },
      depositedAt: new Date(Date.now() - 1*60*60*1000),
      createdAt: new Date(Date.now() - 12*60*60*1000)
    },
    {
      _id: 'CHQ-2026-DEMO-003',
      companyId: DEMO_COMPANY_ID,
      destinationSiteId: 'SITE-DEMO-002',
      type: 'EURO_EPAL_2',
      quantity: 25,
      status: 'DEPOSE',
      transporteur: {
        name: 'DHL Freight',
        vehiclePlate: 'IJ-789-KL',
        driverName: 'Marie Durand'
      },
      depositedAt: new Date(),
      createdAt: new Date()
    }
  ],

  ledger: {
    _id: 'LEDGER-DEMO-001',
    companyId: DEMO_COMPANY_ID,
    balances: {
      EURO_EPAL: 150,
      EURO_EPAL_2: 45,
      DEMI_PALETTE: 20,
      PALETTE_PERDUE: -12
    },
    adjustments: [
      {
        date: new Date(Date.now() - 7*24*60*60*1000),
        type: 'RECEPTION',
        paletteType: 'EURO_EPAL',
        quantity: 50,
        reason: 'Reception CHQ-2026-0001',
        balanceAfter: 150
      },
      {
        date: new Date(Date.now() - 5*24*60*60*1000),
        type: 'EMISSION',
        paletteType: 'EURO_EPAL',
        quantity: -30,
        reason: 'Emission vers Carrefour',
        balanceAfter: 120
      },
      {
        date: new Date(Date.now() - 3*24*60*60*1000),
        type: 'AJUSTEMENT',
        paletteType: 'PALETTE_PERDUE',
        quantity: -12,
        reason: 'Palettes endommagees - Litige #LIT-001',
        balanceAfter: -12
      }
    ],
    updatedAt: new Date()
  },

  disputes: [
    {
      _id: 'LIT-DEMO-001',
      companyId: DEMO_COMPANY_ID,
      chequeId: 'CHQ-2026-0098',
      type: 'QUANTITE_INCORRECTE',
      status: 'ouvert',
      claimedQuantity: 50,
      actualQuantity: 38,
      description: 'Ecart de 12 palettes constate a la reception',
      initiatorId: DEMO_COMPANY_ID,
      respondentId: 'TRANS-001',
      createdAt: new Date(Date.now() - 2*24*60*60*1000)
    }
  ]
};

async function seedDemoData() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();

  console.log('Insertion des donnees de demonstration...');

  // Sites
  await db.collection('palettes_sites').deleteMany({ companyId: DEMO_COMPANY_ID });
  await db.collection('palettes_sites').insertMany(demoData.sites);
  console.log(`- ${demoData.sites.length} sites inseres`);

  // Cheques
  await db.collection('palettes_cheques').deleteMany({ companyId: DEMO_COMPANY_ID });
  await db.collection('palettes_cheques').insertMany(demoData.cheques);
  console.log(`- ${demoData.cheques.length} cheques inseres`);

  // Ledger
  await db.collection('palettes_ledger').deleteMany({ companyId: DEMO_COMPANY_ID });
  await db.collection('palettes_ledger').insertOne(demoData.ledger);
  console.log('- Ledger insere');

  // Disputes
  await db.collection('palettes_disputes').deleteMany({ companyId: DEMO_COMPANY_ID });
  await db.collection('palettes_disputes').insertMany(demoData.disputes);
  console.log(`- ${demoData.disputes.length} litiges inseres`);

  console.log('\nDonnees de demonstration inserees avec succes!');
  console.log(`CompanyId de test: ${DEMO_COMPANY_ID}`);

  await client.close();
}

seedDemoData().catch(console.error);
```

---

## 6. TESTS DE VALIDATION

### 6.1 Tests Fonctionnels

| ID | Scenario | Resultat Attendu |
|----|----------|------------------|
| TF-01 | Acceder au module Palettes | Page chargee sans erreur |
| TF-02 | Afficher liste cheques en attente | Liste non vide avec donnees demo |
| TF-03 | Scanner un cheque (manuel) | Details du cheque affiches |
| TF-04 | Recevoir un cheque | Statut passe a RECU |
| TF-05 | Creer un nouveau site | Site visible dans liste |
| TF-06 | Modifier un site existant | Modifications sauvegardees |
| TF-07 | Consulter le Grand Livre | Soldes affiches correctement |
| TF-08 | Ouvrir un litige | Litige cree avec statut "ouvert" |
| TF-09 | Proposer resolution litige | Resolution enregistree |
| TF-10 | Voir statistiques | Stats calculees sans erreur |
| TF-11 | Afficher carte | Carte avec marqueurs sites |
| TF-12 | Export PDF | PDF telecharge |

### 6.2 Tests Techniques

| ID | Test | Critere |
|----|------|---------|
| TT-01 | Latence API | < 500ms pour 95% des requetes |
| TT-02 | Erreur CloudFront | 0 erreurs SSL |
| TT-03 | Auth token | Token valide transmis |
| TT-04 | Geolocation fallback | Fonctionne si refusee |
| TT-05 | Responsive | Mobile/Tablet/Desktop OK |

---

## 7. CRITERES D'ACCEPTATION

### 7.1 Definition of Done

- [ ] CloudFront route correctement vers l'API
- [ ] CompanyId recupere depuis l'authentification
- [ ] Tous les onglets chargent sans erreur
- [ ] Donnees de demonstration visibles
- [ ] Actions CRUD fonctionnelles
- [ ] Messages d'erreur explicites
- [ ] Tests fonctionnels passes
- [ ] Code review effectuee
- [ ] Documentation mise a jour

### 7.2 Metriques de Succes

| Metrique | Objectif |
|----------|----------|
| Disponibilite | > 99.5% |
| Temps de chargement | < 2s |
| Taux d'erreur API | < 1% |
| Satisfaction utilisateur | > 4/5 |

---

## 8. PLANNING PREVISIONNEL

```
Semaine 1 (S03-2026)
├── Lun: P0-1 CloudFront fix + tests
├── Mar: P0-2 Auth context fix
├── Mer: P1-1 Geolocation fallback
├── Jeu: P1-2 Edition sites (backend)
└── Ven: P1-2 Edition sites (frontend)

Semaine 2 (S04-2026)
├── Lun: P1-3 Endpoint stats batch
├── Mar: P1-4 Donnees demonstration
├── Mer: P1-5 Gestion erreurs
├── Jeu: Tests integration
└── Ven: Deploiement + validation
```

---

## 9. ANNEXES

### 9.1 Endpoints API Palettes

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | /api/palettes/cheques | Liste des cheques |
| POST | /api/palettes/cheques/:id/receive | Recevoir un cheque |
| GET | /api/palettes/sites | Liste des sites |
| POST | /api/palettes/sites | Creer un site |
| PUT | /api/palettes/sites/:id | Modifier un site |
| GET | /api/palettes/ledger/:companyId | Grand livre |
| GET | /api/palettes/disputes | Liste des litiges |
| POST | /api/palettes/disputes | Ouvrir un litige |
| POST | /api/palettes/disputes/:id/propose-resolution | Proposer resolution |
| POST | /api/palettes/disputes/:id/validate | Valider resolution |
| GET | /api/palettes/stats | Statistiques globales (NOUVEAU) |

### 9.2 Variables d'Environnement

```env
# Frontend (.env.production)
NEXT_PUBLIC_PALETTES_API_URL=https://d2o4ng8nutcmou.cloudfront.net

# Backend
MONGODB_URI=mongodb+srv://...
PORT=3000
```

### 9.3 Contacts

| Role | Nom | Contact |
|------|-----|---------|
| Product Owner | - | - |
| Tech Lead | - | - |
| DevOps | - | - |

---

**Document genere le:** 11 janvier 2026
**Auteur:** Claude Code Assistant
**Version:** 1.0
