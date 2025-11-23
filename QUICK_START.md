# 🚀 Quick Start - Backend Services

## Prérequis

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Docker Desktop (pour MongoDB et Redis)

## Installation

```bash
# Installer les dépendances
pnpm install

# Copier le fichier .env
cp .env.example .env
# Ou utiliser le .env déjà créé
```

## Démarrage rapide avec Docker

```bash
# Démarrer MongoDB et Redis
docker-compose up -d mongodb redis

# Vérifier que les conteneurs sont lancés
docker ps

# Lancer les services en dev
pnpm dev
```

## Services disponibles

### Services core (prêts à utiliser)

1. **admin-gateway** - Port 3001
   - API Gateway principal
   - Health: http://localhost:3001/health
   - Routes: `/api/v1/*`

2. **authz** - Port 3002
   - Authentification & autorisation
   - Health: http://localhost:3002/health
   - Routes:
     - `POST /api/auth/login` - Se connecter
     - `POST /api/auth/register` - S'inscrire
     - `GET /api/auth/me` - Profil utilisateur (protégé)
     - `GET /api/auth/verify` - Vérifier token (protégé)

3. **core-orders** - Port 3007
   - Gestion des commandes
   - Health: http://localhost:3007/health
   - Routes (toutes protégées):
     - `GET /api/orders` - Liste des commandes
     - `POST /api/orders` - Créer une commande
     - `GET /api/orders/:id` - Détails commande
     - `PATCH /api/orders/:id` - Modifier commande
     - `DELETE /api/orders/:id` - Supprimer commande

## Communication avec le frontend rt-frontend-apps

### Configuration CORS

Le backend est configuré pour accepter les requêtes de :
- `http://localhost:3000` (Next.js)
- `http://localhost:5173` (Vite)
- `http://localhost:5174` (Vite alternative)

### Endpoints API

Depuis votre frontend **rt-frontend-apps**, utilisez :

```typescript
// Configuration de base
const API_URL = 'http://localhost:3001/api/v1';

// Authentification
POST ${API_URL}/auth/login
POST ${API_URL}/auth/register
GET  ${API_URL}/auth/me

// Commandes
GET    ${API_URL}/orders
POST   ${API_URL}/orders
GET    ${API_URL}/orders/:id
PATCH  ${API_URL}/orders/:id
DELETE ${API_URL}/orders/:id
```

### Exemple de login

```typescript
// Login
const response = await fetch('http://localhost:3001/api/v1/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'Password123'
  })
});

const { data } = await response.json();
// data.token - JWT token
// data.user - User profile
```

### Exemple avec token

```typescript
const response = await fetch('http://localhost:3001/api/v1/orders', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
});
```

## Créer un premier utilisateur

```bash
# Avec curl
curl -X POST http://localhost:3002/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@rt-technologie.com",
    "password": "Password123",
    "firstName": "Admin",
    "lastName": "RT",
    "type": "ADMIN"
  }'
```

## Logs et debugging

```bash
# Voir les logs d'un service spécifique
pnpm --filter @rt/service-authz dev

# Voir les logs MongoDB
docker logs rt-mongodb

# Voir les logs Redis
docker logs rt-redis
```

## Arrêt

```bash
# Arrêter les services Node.js
Ctrl+C

# Arrêter Docker
docker-compose down
```

## Architecture

```
rt-backend-services/
├── packages/                # Packages partagés
│   ├── contracts/          # Types, schemas, enums
│   ├── utils/              # Logger, validation, helpers
│   ├── security/           # JWT, crypto, permissions
│   └── data-mongo/         # MongoDB repositories
│
├── services/               # Microservices
│   ├── admin-gateway/      # ✅ API Gateway
│   ├── authz/              # ✅ Auth service
│   └── core-orders/        # ✅ Orders service
│
└── docker-compose.yml      # MongoDB + Redis
```

## Prochaines étapes

1. Tester les endpoints depuis rt-frontend-apps
2. Créer d'autres services selon les besoins
3. Déployer sur AWS ECS (scripts dans `infra/`)
