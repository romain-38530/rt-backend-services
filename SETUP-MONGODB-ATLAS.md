# Configuration MongoDB Atlas - Guide Rapide

## Étape 1 : Créer un compte MongoDB Atlas

1. Va sur https://www.mongodb.com/cloud/atlas/register
2. Inscris-toi avec ton email (ou connecte-toi avec Google)
3. Choisis le plan **gratuit M0** (0€/mois)

## Étape 2 : Créer un cluster (GRATUIT)

1. Après connexion, clique sur **"Build a Database"**
2. Sélectionne **M0 FREE** (cluster gratuit)
3. Choisis la région **AWS / eu-central-1 (Frankfurt)** (proche de la France)
4. Nomme ton cluster : **rt-technologie-cluster**
5. Clique sur **"Create Deployment"**

⏱️ **Attente : 1-3 minutes** pour la création du cluster

## Étape 3 : Configurer l'accès

### A. Créer un utilisateur de base de données

1. Dans la fenêtre **"Database Access"**, clique sur **"Create Database User"**
   - Username : `rtadmin`
   - Password : Génère un mot de passe sécurisé (note-le !)
   - Ou utilise : `rtAdmin2026!Secure`
   - **Database User Privileges** : `Read and write to any database`
2. Clique sur **"Add User"**

### B. Autoriser l'accès réseau

1. Dans **"Network Access"**, clique sur **"Add IP Address"**
2. Clique sur **"ALLOW ACCESS FROM ANYWHERE"** (pour dev/test)
   - IP : `0.0.0.0/0`
3. Clique sur **"Confirm"**

⚠️ **Note** : En production, limite les IPs à celles de tes serveurs AWS

## Étape 4 : Obtenir l'URI de connexion

1. Retourne sur **"Database"** (menu gauche)
2. Clique sur **"Connect"** sur ton cluster
3. Sélectionne **"Connect your application"**
4. Copie l'URI qui ressemble à :

```
mongodb+srv://rtadmin:<password>@rt-technologie-cluster.xxxxx.mongodb.net/rt-technologie?retryWrites=true&w=majority
```

5. **Remplace `<password>`** par ton mot de passe (ex: `rtAdmin2026!Secure`)

## Étape 5 : Mettre à jour le fichier .env

Ouvre le fichier `.env` dans `rt-backend-services` et modifie :

**AVANT** :
```env
MONGODB_URI=mongodb://admin:admin123@localhost:27017/rt-technologie?authSource=admin
```

**APRÈS** :
```env
MONGODB_URI=mongodb+srv://rtadmin:rtAdmin2026!Secure@rt-technologie-cluster.xxxxx.mongodb.net/rt-technologie?retryWrites=true&w=majority
```

## Étape 6 : Tester la connexion

### Test rapide avec Node.js

```javascript
// test-mongodb-atlas.js
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb+srv://rtadmin:rtAdmin2026!Secure@rt-technologie-cluster.xxxxx.mongodb.net/rt-technologie';

async function testConnection() {
  const client = new MongoClient(uri);

  try {
    console.log('🔄 Connexion à MongoDB Atlas...');
    await client.connect();
    console.log('✅ Connecté à MongoDB Atlas !');

    const db = client.db('rt-technologie');
    const collections = await db.listCollections().toArray();

    console.log(`\n📊 Collections trouvées : ${collections.length}`);
    collections.forEach(col => console.log(`  - ${col.name}`));

  } catch (error) {
    console.error('❌ Erreur :', error.message);
  } finally {
    await client.close();
  }
}

testConnection();
```

Lance le test :
```bash
cd rt-backend-services
node test-mongodb-atlas.js
```

## Étape 7 : Démarrer le service TMS Sync

```bash
cd services/tms-sync-eb
node index.js
```

Tu devrais voir :
```
✅ MongoDB connected successfully
🚀 RT TMS Sync API v2.1.1 listening on port 3000
```

## Étape 8 : Lancer les tests

```bash
cd services/tms-sync-eb
node test-advanced-sync.js
```

## 🎯 Avantages de MongoDB Atlas

✅ **Pas de Docker nécessaire**
✅ **Accessible de n'importe où**
✅ **Backups automatiques**
✅ **Monitoring inclus**
✅ **Scaling facile**
✅ **SSL/TLS par défaut**
✅ **Gratuit jusqu'à 512 MB**

## 📊 Monitoring

Sur MongoDB Atlas, tu peux :
- Voir les requêtes en temps réel
- Monitorer les performances
- Créer des alertes
- Voir les connexions actives

## 🔒 Sécurité

### Pour la production

1. **Limiter les IPs** : Remplace `0.0.0.0/0` par les IPs AWS de tes services
2. **Utiliser des variables d'environnement** : Ne jamais commiter l'URI
3. **Rotation des mots de passe** : Change le mot de passe régulièrement
4. **Activer l'audit** : Active les logs d'audit dans Atlas

## 🆘 En cas de problème

### Erreur "authentication failed"
- Vérifie que le mot de passe est correct dans l'URI
- Assure-toi qu'il n'y a pas de caractères spéciaux non encodés

### Erreur "connection timeout"
- Vérifie que `0.0.0.0/0` est autorisé dans Network Access
- Vérifie ta connexion internet

### Erreur "database not found"
- La base de données sera créée automatiquement au premier insert

## 📝 URI de connexion complète

Format complet :
```
mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority
```

Exemple :
```
mongodb+srv://rtadmin:rtAdmin2026!Secure@rt-technologie-cluster.abc123.mongodb.net/rt-technologie?retryWrites=true&w=majority
```

## 🔄 Revenir à MongoDB local plus tard

Si tu veux revenir à MongoDB local (via Docker) plus tard, change simplement l'URI dans `.env` :

```env
MONGODB_URI=mongodb://admin:admin123@localhost:27017/rt-technologie?authSource=admin
```

---

**Temps total : 5-10 minutes**
**Coût : Gratuit**
**Prêt pour la production : Oui** (avec ajustements sécurité)
