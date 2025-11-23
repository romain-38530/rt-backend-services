# 🚀 Guide de Déploiement - RT Backend

## 📋 Prérequis

- ✅ Node.js >= 20.0.0
- ✅ pnpm >= 8.0.0
- ✅ Docker Desktop installé et lancé
- ✅ Git installé

## 🎬 Étape 1 : Démarrer l'Infrastructure

### Sur Windows (PowerShell ou cmd)

```cmd
# Double-cliquer sur le fichier
START-INFRA.bat

# Ou en ligne de commande
docker compose up -d mongodb redis
```

### Vérifier que tout est lancé

```cmd
# Lister les conteneurs
docker ps

# Devrait afficher:
# - rt-mongodb (port 27017)
# - rt-redis (port 6379)
```

### Vérifier la connexion MongoDB

```cmd
docker exec rt-mongodb mongosh --eval "db.adminCommand('ping')"
```

### Vérifier Redis

```cmd
docker exec rt-redis redis-cli ping
# Devrait afficher: PONG
```

## 🎯 Étape 2 : Démarrer les Services Backend

### Option A : Tous les services

```bash
pnpm dev
```

Cela démarre :
- admin-gateway (3001)
- authz (3002)
- core-orders (3007)
- notifications (3004)
- planning (3005)
- ... tous les autres services

### Option B : Services essentiels seulement

```bash
# Dans 3 terminaux séparés:

# Terminal 1 - API Gateway
pnpm --filter @rt/service-admin-gateway dev

# Terminal 2 - Auth Service
pnpm --filter @rt/service-authz dev

# Terminal 3 - Orders Service
pnpm --filter @rt/service-core-orders dev
```

## 👤 Étape 3 : Créer le Premier Utilisateur

### Attendre que les services soient démarrés

Vérifier que le service auth répond :

```cmd
curl http://localhost:3002/health
```

### Créer l'utilisateur admin

```cmd
# Double-cliquer sur
CREATE-FIRST-USER.bat

# Ou avec curl
curl -X POST http://localhost:3002/api/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@rt-technologie.com\",\"password\":\"Admin123\",\"firstName\":\"Admin\",\"lastName\":\"RT\",\"type\":\"ADMIN\"}"
```

**Credentials créés** :
- Email: `admin@rt-technologie.com`
- Password: `Admin123`

## ✅ Étape 4 : Tester la Connexion

### Test Login

```cmd
curl -X POST http://localhost:3001/api/v1/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@rt-technologie.com\",\"password\":\"Admin123\"}"
```

Devrait retourner :
```json
{
  "success": true,
  "data": {
    "user": { ... },
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "...",
    "expiresIn": 86400
  }
}
```

### Test avec Token

```cmd
# Remplacer YOUR_TOKEN par le token reçu
curl http://localhost:3001/api/v1/orders ^
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🌐 Étape 5 : Intégration Frontend (rt-frontend-apps)

### Configuration dans votre frontend

```typescript
// config/api.ts
export const API_BASE_URL = 'http://localhost:3001/api/v1';

// Exemple de login
const response = await fetch(`${API_BASE_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@rt-technologie.com',
    password: 'Admin123'
  })
});

const { data } = await response.json();
const token = data.token;

// Stocker le token
localStorage.setItem('token', token);

// Utiliser le token pour les requêtes suivantes
const ordersResponse = await fetch(`${API_BASE_URL}/orders`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

## 🔍 Vérification des Services

### Health Checks

```bash
# Gateway
curl http://localhost:3001/health

# Auth
curl http://localhost:3002/health

# Orders
curl http://localhost:3007/health

# Notifications
curl http://localhost:3004/health

# Planning
curl http://localhost:3005/health

# TMS Sync
curl http://localhost:3006/health

# Vigilance
curl http://localhost:3008/health

# Palette
curl http://localhost:3009/health

# Affret IA
curl http://localhost:3010/health

# Training
curl http://localhost:3012/health

# eCMR
curl http://localhost:3014/health

# Storage Market
curl http://localhost:3015/health

# Geo Tracking
curl http://localhost:3016/health

# Chatbot
curl http://localhost:3019/health
```

### Logs

```bash
# Logs MongoDB
docker logs rt-mongodb -f

# Logs Redis
docker logs rt-redis -f

# Logs des services
# Visible directement dans les terminaux où vous avez lancé pnpm dev
```

## 🛑 Arrêter Tout

### Arrêter les services backend

```bash
# Ctrl+C dans les terminaux où tourne pnpm dev
```

### Arrêter l'infrastructure

```cmd
# Double-cliquer sur
STOP-INFRA.bat

# Ou en ligne de commande
docker compose down
```

### Nettoyage complet (données incluses)

```cmd
docker compose down -v
```

## 🐛 Troubleshooting

### MongoDB ne démarre pas

```bash
# Vérifier les logs
docker logs rt-mongodb

# Redémarrer
docker compose restart mongodb
```

### Service auth ne démarre pas

```bash
# Vérifier que MongoDB est accessible
docker exec rt-mongodb mongosh --eval "db.adminCommand('ping')"

# Vérifier le .env
cat .env | grep MONGODB_URI
```

### Port déjà utilisé

```bash
# Trouver quel processus utilise le port 3001
netstat -ano | findstr :3001

# Tuer le processus (remplacer PID)
taskkill /PID <PID> /F
```

### CORS errors depuis le frontend

Vérifier que les origins sont bien configurés dans [.env](.env) :
```
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:5174
```

## 📚 Ressources

- [README_FINAL.md](README_FINAL.md) - Documentation complète
- [QUICK_START.md](QUICK_START.md) - Guide rapide
- [STATUS.md](STATUS.md) - Status de tous les services
- [.env](.env) - Configuration

## ✅ Checklist de Déploiement

- [ ] Docker Desktop lancé
- [ ] `docker compose up -d mongodb redis` exécuté
- [ ] MongoDB accessible (test avec mongosh)
- [ ] Redis accessible (test avec redis-cli)
- [ ] `pnpm install` exécuté
- [ ] `pnpm dev` lancé
- [ ] Services health checks OK
- [ ] Premier utilisateur créé
- [ ] Login teste avec curl
- [ ] Token valide reçu
- [ ] Requête avec token testée
- [ ] Frontend configuré avec la bonne API URL
- [ ] CORS configuré correctement

---

**🎉 Une fois ces étapes complétées, votre backend est 100% opérationnel !**
