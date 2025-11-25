# 🗄️ Configuration MongoDB Atlas

**Service:** Subscriptions-Contracts
**Status:** À configurer
**Version:** 1.0.0

---

## 🎯 Objectif

Migrer la base de données MongoDB de localhost vers MongoDB Atlas pour la production.

---

## 📋 Étapes de Configuration

### 1. Créer un Compte MongoDB Atlas

1. Aller sur https://www.mongodb.com/cloud/atlas
2. Créer un compte (gratuit)
3. Créer une nouvelle organisation "RT Technologies"

### 2. Créer un Cluster

1. **Cliquer sur "Build a Database"**
2. **Choisir le plan:**
   - **M0 (Free)** - Pour développement/test
   - **M10** - Pour production (recommandé)
   - Région: **eu-west-3 (Paris)** ou **eu-central-1 (Frankfurt)**

3. **Nommer le cluster:** `rt-subscriptions-cluster`

4. **Attendre le déploiement** (2-5 minutes)

### 3. Configurer la Sécurité

#### A. Créer un Utilisateur Database

1. Security → Database Access → Add New Database User
2. **Username:** `rt-subscriptions-admin`
3. **Password:** Générer un mot de passe fort (sauvegarder!)
4. **Database User Privileges:** "Read and write to any database"
5. Cliquer "Add User"

#### B. Configurer Network Access

1. Security → Network Access → Add IP Address
2. **Pour production:**
   - Option 1: Ajouter l'IP de l'instance Elastic Beanstalk
   - Option 2: "Allow access from anywhere" (0.0.0.0/0) - Moins sécurisé mais plus simple

3. Cliquer "Confirm"

### 4. Obtenir l'URI de Connexion

1. Database → Connect → Drivers
2. **Driver:** Node.js
3. **Version:** 6.3 or later
4. **Copier l'URI:**
   ```
   mongodb+srv://rt-subscriptions-admin:<password>@rt-subscriptions-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

5. **Remplacer `<password>`** par le mot de passe créé

6. **Ajouter le nom de la base de données:**
   ```
   mongodb+srv://rt-subscriptions-admin:<password>@rt-subscriptions-cluster.xxxxx.mongodb.net/rt-subscriptions-contracts?retryWrites=true&w=majority
   ```

### 5. Configurer Elastic Beanstalk

```bash
cd services/subscriptions-contracts-eb

# Configurer l'URI MongoDB
eb setenv MONGODB_URI="mongodb+srv://rt-subscriptions-admin:YOUR_PASSWORD@rt-subscriptions-cluster.xxxxx.mongodb.net/rt-subscriptions-contracts?retryWrites=true&w=majority"

# Redéployer
eb deploy
```

### 6. Vérifier la Connexion

```bash
# Tester le health check
curl https://dgze8l03lwl5h.cloudfront.net/health

# Vérifier que mongodb.connected = true
```

**Réponse attendue:**
```json
{
  "status": "healthy",
  "mongodb": {
    "configured": true,
    "connected": true,
    "status": "active"
  }
}
```

---

## 📊 Collections à Créer

MongoDB Atlas créera automatiquement les collections lors de la première insertion. Voici les collections utilisées:

### Collections Abonnements
- `subscription_plans` - Plans d'abonnement
- `subscriptions` - Abonnements actifs
- `invoices` - Factures
- `payments` - Paiements
- `usage` - Suivi utilisation

### Collections Contrats
- `contract_templates` - Modèles de contrats
- `contracts` - Contrats créés
- `signatures` - Signatures électroniques
- `signing_workflows` - Workflows de signature
- `contract_audit_logs` - Logs d'audit

---

## 🔐 Sécurité Recommandée

### 1. Variables d'Environnement

**Ne jamais** hardcoder l'URI MongoDB dans le code. Toujours utiliser des variables d'environnement:

```bash
# Production
eb setenv MONGODB_URI="mongodb+srv://..."

# Développement local
# .env
MONGODB_URI=mongodb+srv://...
```

### 2. Whitelist IP Elastic Beanstalk

Pour obtenir l'IP de l'instance EB:
```bash
# SSH vers l'instance
eb ssh

# Obtenir l'IP publique
curl ifconfig.me
```

Ajouter cette IP dans MongoDB Atlas → Network Access

### 3. Activer Audit Logs (Optionnel)

Dans MongoDB Atlas:
1. Security → Advanced → Database Auditing
2. Activer pour tracer toutes les opérations

---

## 🧪 Tester MongoDB Atlas

### Test 1: Créer un Plan
```bash
curl -X POST https://dgze8l03lwl5h.cloudfront.net/api/plans \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Plan Test Atlas",
    "type": "PRO",
    "description": "Test MongoDB Atlas",
    "price": 49.99,
    "billingInterval": "MONTHLY",
    "features": {
      "maxApiCalls": 10000,
      "maxUsers": 10,
      "maxVehicles": 50
    }
  }'
```

**Réponse attendue:**
```json
{
  "success": true,
  "data": {
    "_id": "67434....",
    "name": "Plan Test Atlas",
    "type": "PRO",
    "price": 49.99,
    "isActive": true,
    "createdAt": "2025-11-24T..."
  }
}
```

### Test 2: Lister les Plans
```bash
curl https://dgze8l03lwl5h.cloudfront.net/api/plans
```

### Test 3: Créer un Abonnement
```bash
curl -X POST https://dgze8l03lwl5h.cloudfront.net/api/subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "planId": "67434....",
    "billingInterval": "MONTHLY",
    "startTrial": true
  }'
```

### Test 4: Créer un Contrat
```bash
curl -X POST https://dgze8l03lwl5h.cloudfront.net/api/contracts \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Contract MongoDB Atlas",
    "type": "TRANSPORT",
    "content": "<h1>Test</h1>",
    "parties": [
      {
        "type": "COMPANY",
        "name": "Test Company",
        "email": "test@example.com",
        "role": "SENDER",
        "signatureRequired": true
      }
    ],
    "effectiveDate": "2025-12-01"
  }'
```

---

## 📊 Monitoring MongoDB Atlas

### Dashboard MongoDB Atlas

1. **Metrics** - Utilisation CPU, mémoire, connexions
2. **Alerts** - Configurer alertes (connexions, stockage, etc.)
3. **Performance Advisor** - Recommandations index
4. **Real-time Performance Panel** - Voir les queries en temps réel

### Créer des Index (Recommandé)

Pour optimiser les performances:

```javascript
// Collection: subscriptions
db.subscriptions.createIndex({ userId: 1 });
db.subscriptions.createIndex({ status: 1 });
db.subscriptions.createIndex({ planId: 1 });

// Collection: contracts
db.contracts.createIndex({ userId: 1 });
db.contracts.createIndex({ status: 1 });
db.contracts.createIndex({ createdAt: -1 });

// Collection: subscription_plans
db.subscription_plans.createIndex({ type: 1 });
db.subscription_plans.createIndex({ isActive: 1 });
```

### Configurer Alertes

Dans MongoDB Atlas → Alerts:
1. **Storage Usage** - Alerte à 80% d'utilisation
2. **Connections** - Alerte si > 80% des connexions
3. **Replication Lag** - Alerte si lag > 5 secondes

---

## 💰 Tarification

### Plan M0 (Gratuit)
- **Stockage:** 512 MB
- **RAM:** Partagée
- **Connexions:** Jusqu'à 500 simultanées
- **Backup:** Non inclus
- **Idéal pour:** Développement, tests

### Plan M10 (Production - Recommandé)
- **Prix:** ~$57/mois
- **Stockage:** 10 GB
- **RAM:** 2 GB
- **Connexions:** 1000+ simultanées
- **Backup:** Automatique
- **Idéal pour:** Production

### Calculer les Besoins

**Pour ~1000 utilisateurs actifs:**
- Subscriptions: ~1000 documents × 2 KB = 2 MB
- Contracts: ~500 documents × 10 KB = 5 MB
- Plans: ~10 documents × 1 KB = 10 KB
- **Total estimé:** ~50 MB (très confortable avec M10)

---

## 🔄 Migration depuis Localhost

Si vous avez des données en local:

### 1. Export depuis Localhost
```bash
mongodump --db rt-subscriptions-contracts --out ./backup
```

### 2. Import vers Atlas
```bash
mongorestore --uri "mongodb+srv://rt-subscriptions-admin:PASSWORD@cluster.mongodb.net" ./backup
```

---

## 🚨 Troubleshooting

### Problème: Connection Timeout
**Solution:**
1. Vérifier Network Access (IP whitelistée)
2. Vérifier l'URI (password, cluster name)
3. Vérifier que le cluster est démarré

### Problème: Authentication Failed
**Solution:**
1. Vérifier le username/password
2. Vérifier les privilèges de l'utilisateur
3. Recréer l'utilisateur si nécessaire

### Problème: Too Many Connections
**Solution:**
1. Augmenter la taille du cluster
2. Optimiser les connexions (connection pooling)
3. Vérifier qu'il n'y a pas de fuites de connexions

---

## ✅ Checklist Configuration

- [ ] Compte MongoDB Atlas créé
- [ ] Cluster créé et déployé
- [ ] Utilisateur database créé
- [ ] Network Access configuré (IP whitelistée)
- [ ] URI de connexion obtenue
- [ ] Variable MONGODB_URI configurée dans EB
- [ ] Service redéployé
- [ ] Health check vérifié (mongodb.connected = true)
- [ ] Tests de création (plan, abonnement, contrat) effectués
- [ ] Index créés pour performance
- [ ] Alertes configurées
- [ ] Backup automatique activé (M10+)

---

## 📞 Support

**MongoDB Atlas Support:**
- Documentation: https://docs.atlas.mongodb.com/
- Support: https://support.mongodb.com/

**RT Technologies:**
- Voir documentation principale

---

**Dernière mise à jour:** 24 novembre 2025
**Version:** 1.0.0
