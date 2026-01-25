# Services MongoDB - RT Backend

## 📍 Configuration actuelle

**URI MongoDB** (fichier `.env`):
```
mongodb://admin:admin123@localhost:27017/rt-technologie?authSource=admin
```

- **Host**: localhost:27017
- **Database**: rt-technologie
- **User**: admin
- **Password**: admin123
- **Auth Source**: admin

## 📋 Services utilisant MongoDB (30 services)

### 1. TMS Sync
**Fichier**: `services/tms-sync-eb/index.js`
- Gestion des connexions TMS (Dashdoc, Transporeon)
- Synchronisation automatique des commandes
- Filtrage avancé des ordres de transport
- **Collections**: `tmsConnections`, `orders`, `companies`, `contacts`, `tmsSyncLogs`

### 2. Subscriptions & Contracts
**Fichier**: `services/subscriptions-contracts-eb/index.js`
- Gestion des abonnements
- Contrats clients
- Synchronisation auth
- **Collections**: `subscriptions`, `contracts`, `invoices`, `organizations`

### 3. Notifications
**Fichier**: `services/notifications-eb/index.js`
- Envoi de notifications
- Alertes système
- **Collections**: `notifications`, `notificationTemplates`, `emailLogs`

### 4. Orders
**Fichiers**:
- `services/orders-eb/index.js`
- `services/orders-eb/extract-v4.2.1/index.js`
- Gestion des commandes de transport
- **Collections**: `orders`, `orderHistory`, `orderDocuments`

### 5. Storage Market
**Fichier**: `services/storage-market-eb/index.js`
- Marché de stockage
- **Collections**: `storageOffers`, `storageBookings`

### 6. Planning
**Fichier**: `services/planning-eb/index.js`
- Planification des transports
- Optimisation des itinéraires
- **Collections**: `plannings`, `routes`, `assignments`

### 7. Geo Tracking
**Fichier**: `services/geo-tracking-eb/index.js`
- Suivi géolocalisé des transports
- Tracking en temps réel
- **Collections**: `trackingData`, `vehicles`, `positions`

### 8. eCMR Signature
**Fichier**: `services/ecmr-signature-api/index.js`
- Signature électronique des CMR
- **Collections**: `ecmrDocuments`, `signatures`

### 9. Affret IA
**Fichiers**:
- `services/affret-ia-api-v2/services/prospection.service.js`
- IA pour l'affrètement
- **Collections**: `affretSessions`, `carrierProposals`, `trackingSessions`

### 10. Authorization
**Fichier**: `services/authz-eb/index.js`
- Gestion des autorisations
- Contrôle d'accès
- **Collections**: `users`, `roles`, `permissions`

### 11. Logistician API
**Fichier**: `services/logistician-api/index.js`
- API pour les logisticiens
- **Collections**: `logisticians`, `clientAccounts`

### 12. Pricing Grids API
**Fichier**: `services/pricing-grids-api/index.js`
- Grilles de tarification
- **Collections**: `pricingGrids`, `priceRules`

## 🔧 Scripts MongoDB

### Scripts de gestion
1. `scripts/sync-scraping-to-affretia.js` - Synchronisation données scraping
2. `scripts/cleanup-affretia-sessions.js` - Nettoyage sessions Affret IA
3. `scripts/seed-demo-users-auth.js` - Création utilisateurs démo
4. `scripts/reset-and-seed-demo.js` - Reset et seed base de données

### Scripts de maintenance
1. `services/subscriptions-contracts-eb/clean-sett-orders.js` - Nettoyage commandes
2. `services/subscriptions-contracts-eb/check-all-fields.js` - Vérification champs
3. `services/subscriptions-contracts-eb/check-sett-account.js` - Vérification comptes
4. `services/subscriptions-contracts-eb/fix-sett-account.js` - Correction comptes

## 🚀 Démarrage de MongoDB

### Option 1: Via Docker (Recommandé)
```bash
# Démarrer MongoDB et Redis
START-INFRA.bat

# Ou avec le script d'attente
powershell -ExecutionPolicy Bypass -File wait-for-docker.ps1
```

### Option 2: Docker Compose manuel
```bash
docker compose up -d mongodb redis
```

### Option 3: MongoDB standalone
```bash
mongod --dbpath C:\data\db --port 27017
```

## 📊 Collections MongoDB par service

| Service | Collections principales |
|---------|------------------------|
| tms-sync-eb | tmsConnections, orders, companies, contacts, tmsSyncLogs |
| subscriptions-contracts-eb | subscriptions, contracts, invoices, organizations |
| notifications-eb | notifications, notificationTemplates, emailLogs |
| orders-eb | orders, orderHistory, orderDocuments |
| storage-market-eb | storageOffers, storageBookings |
| planning-eb | plannings, routes, assignments |
| geo-tracking-eb | trackingData, vehicles, positions |
| ecmr-signature-api | ecmrDocuments, signatures |
| affret-ia-api-v2 | affretSessions, carrierProposals, trackingSessions |
| authz-eb | users, roles, permissions, organizations |
| logistician-api | logisticians, clientAccounts |
| pricing-grids-api | pricingGrids, priceRules |

## 🔍 Vérifier la connexion MongoDB

### Test de connexion
```javascript
const { MongoClient } = require('mongodb');

async function testConnection() {
  const uri = 'mongodb://admin:admin123@localhost:27017/rt-technologie?authSource=admin';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ MongoDB connected successfully');

    const db = client.db('rt-technologie');
    const collections = await db.listCollections().toArray();
    console.log(`📊 Found ${collections.length} collections`);

    collections.forEach(col => {
      console.log(`  - ${col.name}`);
    });
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
  } finally {
    await client.close();
  }
}

testConnection();
```

### Commandes MongoDB utiles
```bash
# Se connecter à MongoDB
mongo mongodb://admin:admin123@localhost:27017/rt-technologie?authSource=admin

# Lister les databases
show dbs

# Utiliser la database rt-technologie
use rt-technologie

# Lister les collections
show collections

# Compter les documents dans orders
db.orders.countDocuments()

# Voir les commandes "À planifier"
db.orders.countDocuments({ status: { $in: ['DRAFT', 'PENDING'] } })
```

## 🛠️ Résolution de problèmes

### MongoDB n'est pas accessible
1. Vérifier que Docker Desktop est en cours d'exécution
2. Vérifier que le conteneur MongoDB tourne: `docker ps | grep mongodb`
3. Vérifier les logs: `docker logs rt-mongodb`

### Connexion refusée
- Vérifier le port 27017: `netstat -ano | findstr :27017`
- Redémarrer MongoDB: `docker restart rt-mongodb`

### Authentification échouée
- Vérifier les credentials dans `.env`
- S'assurer que `authSource=admin` est présent

## 📝 Configuration Docker Compose

**Fichier**: `docker-compose.yml`

```yaml
services:
  mongodb:
    image: mongo:7.0
    container_name: rt-mongodb
    restart: always
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: admin123
      MONGO_INITDB_DATABASE: rt-technologie
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db

volumes:
  mongodb_data:
```

## 🎯 Prochaines étapes

1. **Démarrer MongoDB** (via Docker ou standalone)
2. **Tester la connexion** avec le script ci-dessus
3. **Démarrer les services** qui en ont besoin
4. **Vérifier les collections** créées automatiquement

---

**Note**: Tous les services ci-dessus nécessitent MongoDB pour fonctionner. Assurez-vous que MongoDB est démarré avant de lancer un service.
