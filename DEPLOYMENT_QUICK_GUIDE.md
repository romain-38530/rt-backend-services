# Guide de déploiement rapide

Guide condensé pour déployer rapidement les APIs RT Technologie.

## Déploiement initial d'une nouvelle API

```bash
# 1. Aller dans le dossier de l'API
cd services/{api-name}

# 2. Créer le fichier .env
cp ../../.env.example .env
# Éditer .env avec les bonnes valeurs (PORT et database name)

# 3. Tester localement
npm install
npm run dev

# 4. Initialiser Elastic Beanstalk
eb init -p "Node.js 20" -r eu-central-1

# 5. Créer l'environnement de production
eb create rt-{api-name}-prod \
  --region eu-central-1 \
  --platform "Node.js 20" \
  --instance-type t3.micro \
  --single

# 6. Configurer les variables d'environnement
eb setenv \
  MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-{database}?retryWrites=true&w=majority" \
  PORT="3000" \
  CORS_ORIGIN="https://main.dntbizetlc7bm.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com,..."

# 7. Vérifier le déploiement
eb status
eb open
```

## Redéploiement après modifications

```bash
# 1. Aller dans le dossier de l'API
cd services/{api-name}

# 2. Déployer
eb deploy

# 3. Vérifier
eb status
eb logs
```

## Commandes utiles

```bash
# Statut de l'environnement
eb status

# Ouvrir l'app dans le navigateur
eb open

# Voir les logs
eb logs
eb logs --stream  # En temps réel

# Voir les variables d'environnement
eb printenv

# Mettre à jour les variables
eb setenv KEY=VALUE

# SSH dans l'instance
eb ssh

# Terminer un environnement
eb terminate {env-name}
```

## Variables d'environnement par API

### api-auth (Port 3000)
```bash
eb setenv \
  MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-auth?retryWrites=true&w=majority" \
  PORT="3000" \
  JWT_SECRET="rt-super-secret-jwt-key-2024" \
  JWT_EXPIRES_IN="7d" \
  CORS_ORIGIN="..."
```

### api-orders (Port 3030)
```bash
eb setenv \
  MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-orders?retryWrites=true&w=majority" \
  PORT="3030" \
  CORS_ORIGIN="..."
```

### api-planning (Port 3040)
```bash
eb setenv \
  MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-planning?retryWrites=true&w=majority" \
  PORT="3040" \
  CORS_ORIGIN="..."
```

### api-ecmr (Port 3050)
```bash
eb setenv \
  MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-ecmr?retryWrites=true&w=majority" \
  PORT="3050" \
  CORS_ORIGIN="..."
```

### api-palettes (Port 3055)
```bash
eb setenv \
  MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-palettes?retryWrites=true&w=majority" \
  PORT="3055" \
  CORS_ORIGIN="..."
```

### api-storage (Port 3060)
```bash
eb setenv \
  MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-storage?retryWrites=true&w=majority" \
  PORT="3060" \
  CORS_ORIGIN="..."
```

### api-chatbot (Port 3070)
```bash
eb setenv \
  MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-chatbot?retryWrites=true&w=majority" \
  PORT="3070" \
  CORS_ORIGIN="..."
```

## URLs de production

| API | Environment | URL |
|-----|------------|-----|
| Auth | rt-auth-api-prod | http://rt-auth-api-prod.eba-g2psqhq5.eu-central-1.elasticbeanstalk.com |
| Orders | rt-orders-api-prod | http://rt-orders-api-prod.eba-dbgatxmk.eu-central-1.elasticbeanstalk.com |
| Planning | rt-planning-api-prod | http://rt-planning-api-prod.eba-gbhspa2p.eu-central-1.elasticbeanstalk.com |
| eCMR | rt-ecmr-api-prod | http://rt-ecmr-api-prod.eba-43ngua6v.eu-central-1.elasticbeanstalk.com |
| Palettes | rt-palettes-api-prod | http://rt-palettes-api-prod.eba-peea8hx2.eu-central-1.elasticbeanstalk.com |
| Storage | rt-storage-api-prod | Pending (EIP quota) |
| Chatbot | rt-chatbot-api-prod | Pending (EIP quota) |

## Troubleshooting rapide

### npm install échoue
Vérifier `.npmrc`:
```
legacy-peer-deps=true
workspaces=false
```

### Build TypeScript échoue
Vérifier `.ebignore` n'exclut pas `src/` et `tsconfig.json`

### Quota EIP atteint
Demander augmentation dans AWS Console > Service Quotas

### CORS errors
Vérifier `CORS_ORIGIN` contient toutes les URLs Amplify

### 502 Bad Gateway
```bash
eb logs
# Vérifier que le port dans l'app correspond au PORT env var
```

## Checklist de déploiement

- [ ] Code testé localement
- [ ] `.env.example` à jour
- [ ] `.npmrc` présent avec `workspaces=false`
- [ ] `.ebignore` ne bloque pas `src/` et `tsconfig.json`
- [ ] `package.json` a `postinstall: npm run build`
- [ ] Variables d'environnement configurées sur EB
- [ ] Déploiement réussi (`eb status` = Green)
- [ ] API répond sur `/` endpoint
- [ ] Logs vérifiés (`eb logs`)
- [ ] Code poussé sur GitHub
