# RT Authentication API

Service d'authentification centralisé pour toutes les applications RT Technologie.

## Installation

```bash
cd apps/api-auth
pnpm install
```

## Configuration

Créez un fichier `.env` basé sur `.env.example`:

```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/rt-auth
JWT_SECRET=your-secret-key-change-in-production
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000,http://localhost:3002
```

## Développement

```bash
pnpm dev
```

## Production

```bash
pnpm build
pnpm start
```

## Endpoints

### POST /api/auth/register
Créer un nouveau compte utilisateur

### POST /api/auth/login
Se connecter

### GET /api/auth/me
Obtenir les informations de l'utilisateur connecté

### GET /health
Vérifier l'état du service
