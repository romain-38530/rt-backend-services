# Mise à Jour OVH_DOMAIN pour symphonia-controltower.com

**Date** : 28 novembre 2025

---

## 🎯 Objectif

Mettre à jour la variable d'environnement `OVH_DOMAIN` dans le service `subscriptions-contracts-eb` pour utiliser le domaine `symphonia-controltower.com` au lieu de `rt-symphonia.com`.

---

## 🔧 Méthode 1 : AWS Elastic Beanstalk Console

### Étapes :

1. Aller sur AWS EB Console : https://eu-central-1.console.aws.amazon.com/elasticbeanstalk/

2. Sélectionner l'environnement **rt-subscriptions-api-prod**

3. Aller dans **Configuration** → **Software** → **Edit**

4. Ajouter/Modifier la variable d'environnement :
   ```
   OVH_DOMAIN = symphonia-controltower.com
   ```

5. Cliquer **Apply** (redémarrage automatique du service)

---

## 🔧 Méthode 2 : AWS EB CLI

```bash
cd services/subscriptions-contracts-eb

eb setenv OVH_DOMAIN=symphonia-controltower.com

eb deploy
```

---

## ✅ Vérification

Après redéploiement, tester l'API :

```bash
curl http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/api/ovhcloud/status
```

**Attendu** :
```json
{
  "success": true,
  "data": {
    "configured": true,
    "domain": "symphonia-controltower.com",
    "info": { ... }
  }
}
```

---

## 📋 Après Configuration

Une fois `OVH_DOMAIN` mis à jour, vous pouvez exécuter le script de configuration DNS :

```bash
cd rt-backend-services
node configure-production-dns.js --dry-run    # Tester
node configure-production-dns.js --execute    # Exécuter
```

---

**Important** : Cette variable doit être configurée AVANT d'exécuter le script de configuration DNS.
