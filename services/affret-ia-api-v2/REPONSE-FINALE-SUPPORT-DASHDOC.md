# 📧 Réponse Finale au Support Dashdoc

**Date** : 2026-02-03
**Clé API** : `8321c7a8f7fe8f75192fa15a6c883a11758e0084`
**Format utilisé** : `Authorization: Token <token>` (comme indiqué par votre support)

---

## ✅ Confirmation : Format Correct Testé

Merci pour votre réponse confirmant que **la clé fonctionne de votre côté** et le format d'authentification.

Nous avons immédiatement testé avec **2 outils différents** :

---

## 🔧 Outil 1 : Node.js + axios

### Configuration

**Version Node.js** : `20.x`
**Librairie HTTP** : `axios 1.6.2`
**Environnement** : Windows 11 (dev) + AWS Linux 2 (production)

### Code Exact

```javascript
const axios = require('axios');

const response = await axios.get('https://api.dashdoc.com/api/v4/transports/', {
  headers: {
    'Authorization': 'Token 8321c7a8f7fe8f75192fa15a6c883a11758e0084',
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  },
  params: {
    page_size: 1
  },
  timeout: 15000
});
```

### Résultat

❌ **HTTP 401 Unauthorized**

```json
{
  "detail": "Token invalide"
}
```

**Headers de réponse** :
```
www-authenticate: Token
```

---

## 🔧 Outil 2 : PowerShell Invoke-RestMethod

### Configuration

**Version PowerShell** : `5.1` (Windows 11)
**Méthode HTTP** : Invoke-RestMethod (natif .NET)

### Code Exact

```powershell
$headers = @{
  "Authorization" = "Token 8321c7a8f7fe8f75192fa15a6c883a11758e0084"
  "Accept" = "application/json"
  "Content-Type" = "application/json"
}

$response = Invoke-RestMethod `
  -Uri "https://api.dashdoc.com/api/v4/transports/?page_size=1" `
  -Method Get `
  -Headers $headers `
  -TimeoutSec 15
```

### Résultat

❌ **HTTP 401 Unauthorized**

**Même résultat qu'avec Node.js/axios**

---

## 🌍 Endpoints Testés

### Endpoint 1 : Liste simple

**URL complète** :
```
https://api.dashdoc.com/api/v4/transports/?page_size=1
```

**Méthode** : `GET`

**Headers** :
```
Authorization: Token 8321c7a8f7fe8f75192fa15a6c883a11758e0084
Accept: application/json
Content-Type: application/json
```

**Résultat** : ❌ HTTP 401

---

### Endpoint 2 : Avec filtres (notre cas d'usage)

**URL complète** :
```
https://api.dashdoc.com/api/v4/transports/?status=done&is_subcontracted=true&page_size=10
```

**Méthode** : `GET`

**Headers** :
```
Authorization: Token 8321c7a8f7fe8f75192fa15a6c883a11758e0084
Accept: application/json
Content-Type: application/json
```

**Résultat** : ❌ HTTP 401

---

### Endpoint 3 : Avec période (6 derniers mois)

**URL complète** :
```
https://api.dashdoc.com/api/v4/transports/?status=done&is_subcontracted=true&created_after=2025-08-07T00:00:00Z&page_size=100
```

**Méthode** : `GET`

**Headers** :
```
Authorization: Token 8321c7a8f7fe8f75192fa15a6c883a11758e0084
Accept: application/json
Content-Type: application/json
```

**Résultat** : ❌ HTTP 401

---

## 📍 Informations Réseau

### IP Source (Développement)

**IP publique** : `77.205.88.170`

Cette IP est notre IP de développement depuis laquelle nous effectuons tous les tests.

**Question** : Y a-t-il une **whitelist IP** sur cette clé API ?

---

### IP Source (Production AWS)

**Service** : AWS Elastic Beanstalk
**Région** : eu-central-1 (Frankfurt, Allemagne)
**IP** : Dynamique (plage AWS eu-central-1)

**URL Production** :
```
http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com
```

**Question** : La clé est-elle restreinte à certaines plages IP AWS ?

---

## 🔍 Ce qui Fonctionne

### DNS et Connectivité

✅ **Résolution DNS** : OK

```bash
nslookup api.dashdoc.com
# → Adresse IP résolue correctement
```

✅ **Connexion HTTPS** : OK

```bash
curl -I https://api.dashdoc.com
# → HTTP 200, certificat valide
```

✅ **API accessible** : OK

```bash
curl https://api.dashdoc.com/api/v4/
# → L'API répond (erreur auth attendue)
```

---

## ❓ Questions Critiques pour le Support

### Q1 : Quel outil utilisez-vous pour tester ?

Vous avez dit "Cela fonctionne de notre côté".

**Quel outil utilisez-vous exactement ?**
- curl ?
- Postman ?
- Python requests ?
- JavaScript fetch ?
- Autre ?

**Pouvez-vous nous fournir la commande EXACTE** (curl par exemple) qui fonctionne chez vous ?

---

### Q2 : Depuis quelle IP testez-vous ?

**Pouvez-vous nous indiquer votre IP source** quand vous testez avec succès ?

Cela nous permettra de comparer avec nos IPs :
- Dev : `77.205.88.170`
- Prod AWS : Dynamique eu-central-1

---

### Q3 : Restrictions IP sur la clé ?

**La clé `8321c7a8f7fe8f75192fa15a6c883a11758e0084` a-t-elle des restrictions IP ?**

Si oui, pouvez-vous :
- Soit **retirer les restrictions IP**
- Soit **ajouter nos IPs** :
  - `77.205.88.170` (dev)
  - Plage AWS eu-central-1 (prod)

---

### Q4 : User-Agent filtré ?

**Y a-t-il un filtre sur le User-Agent ?**

Nos outils envoient :
- Node.js axios : `User-Agent: axios/1.6.2`
- PowerShell : `User-Agent: Mozilla/5.0 (Windows NT; Windows NT 10.0; fr-FR) WindowsPowerShell/5.1.22621.2506`

**Devons-nous utiliser un User-Agent spécifique ?**

---

### Q5 : Environnement de la clé ?

**Pour quel environnement cette clé est-elle configurée ?**

- Production : `https://api.dashdoc.com` ← **ce que nous utilisons**
- Staging : `https://api.staging.dashdoc.com`
- Sandbox : `https://api.sandbox.dashdoc.com`

Si ce n'est pas Production, pouvez-vous nous fournir une clé pour Production ?

---

### Q6 : Permissions de la clé ?

**Quelles permissions exactes sont activées sur cette clé ?**

Permissions requises pour notre cas d'usage :
- ✅ Lecture des transports
- ✅ Lecture de la tarification
- ✅ Lecture des transporteurs
- ✅ Lecture des données d'affretement/sous-traitance

---

### Q7 : Test de comparaison ?

**Pouvez-vous exécuter EXACTEMENT cette commande curl et nous envoyer le résultat complet ?**

```bash
curl -X GET "https://api.dashdoc.com/api/v4/transports/?page_size=1" \
  -H "Authorization: Token 8321c7a8f7fe8f75192fa15a6c883a11758e0084" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -v
```

**Résultat attendu si ça fonctionne** :
```
< HTTP/2 200
...
{
  "count": XXX,
  "results": [...]
}
```

**Notre résultat actuel** :
```
< HTTP/2 401
...
{
  "detail": "Token invalide"
}
```

Si votre résultat est différent, cela confirme un problème de restriction IP/User-Agent/environnement.

---

## 🎯 Solutions Possibles

### Option A : Corriger Restrictions

Si la clé a des **restrictions IP ou User-Agent** :
1. Les retirer complètement
2. Ou ajouter nos IPs (dev: `77.205.88.170` + prod: AWS eu-central-1)

### Option B : Nouvelle Clé

Si la clé ne peut pas être corrigée, fournir une **nouvelle clé API** avec :
- ✅ Environnement : **Production** (`api.dashdoc.com`)
- ✅ Permissions : Lecture transports + pricing + carriers + affretement
- ✅ **Aucune restriction IP**
- ✅ **Aucune restriction User-Agent**
- ✅ Durée : Permanente ou minimum 1 an

---

## 📊 Tableau Récapitulatif

| Élément | Notre Configuration | Votre Côté | Résultat |
|---------|---------------------|------------|----------|
| **URL** | `https://api.dashdoc.com/api/v4/transports/` | ❓ | ✅ Correct |
| **Méthode** | `GET` | ❓ | ✅ Correct |
| **Header Auth** | `Authorization: Token 8321...` | ❓ | ✅ Format confirmé |
| **Header Accept** | `application/json` | ❓ | ✅ Correct |
| **Outil 1** | Node.js axios 1.6.2 | ❓ | ❌ 401 |
| **Outil 2** | PowerShell Invoke-RestMethod | ❓ | ❌ 401 |
| **IP source dev** | `77.205.88.170` | ❓ | ❌ Bloquée ? |
| **IP source prod** | AWS eu-central-1 (dynamique) | ❓ | ❌ Bloquée ? |
| **User-Agent** | axios/1.6.2 ou PowerShell | ❓ | ❌ Bloqué ? |
| **Résultat** | ❌ HTTP 401 "Token invalide" | ✅ Fonctionne | ❌ Échec |

**Hypothèse** : **Restriction IP ou User-Agent** côté Dashdoc bloquant nos requêtes.

---

## 📝 Scripts de Test Disponibles

Nous avons créé plusieurs scripts de test que vous pouvez utiliser :

1. **Node.js** : `scripts/test-dashdoc-support-format.js`
2. **PowerShell** : `scripts/test-dashdoc-simple-ps.ps1`

**Commande pour tester** :
```powershell
# Windows PowerShell
cd "c:\Users\rtard\dossier symphonia\rt-backend-services\services\affret-ia-api-v2"
powershell -ExecutionPolicy Bypass -File scripts/test-dashdoc-simple-ps.ps1
```

---

## 🚨 Urgence

**Impact** : Notre système Affret.IA est opérationnel à **82%** (5/6 endpoints fonctionnels)

Seul l'import automatique Dashdoc est bloqué.

**Workaround actuel** : Enregistrement manuel des prix (fonctionnel)

**Délai souhaité** : 24-48h pour résolution

---

## 🙏 Demande Finale

**Pour débloquer rapidement, nous avons besoin de 3 informations** :

1. ✅ **Votre commande curl exacte** qui fonctionne avec cette clé
2. ✅ **Votre IP source** quand vous testez avec succès
3. ✅ **Confirmation** : La clé a-t-elle des restrictions IP ?

**OU**

Une **nouvelle clé API sans restrictions IP/User-Agent** pour Production.

---

**Merci pour votre aide rapide !** 🙏

Nous sommes disponibles pour tout test supplémentaire que vous suggérez.

---

**Contact** :
- Organisation : RT Transport Solutions
- Projet : Affret.IA v2.7.0
- URL Production : http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com
- IP Dev : 77.205.88.170
- IP Prod : AWS eu-central-1 (dynamique)
