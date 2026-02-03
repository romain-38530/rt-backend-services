# 🔍 Détails Techniques des Tests - Pour Support Dashdoc

**Date** : 2026-02-03
**Clé API** : `8321c7a8f7fe8f75192fa15a6c883a11758e0084`

---

## 1️⃣ Outil Utilisé

### Node.js + axios

**Version Node.js** : `20.x`
**Librairie HTTP** : `axios 1.6.2`
**OS** : Windows 11 (dev) + AWS Linux 2 (production)
**Région** : Europe (eu-central-1 pour production)

**Script de test** : `scripts/test-dashdoc-support-format.js`

---

## 2️⃣ Endpoints Appelés

### Endpoint 1 : Liste des transports (simple)

**URL** : `https://api.dashdoc.com/api/v4/transports/?page_size=1`

**Méthode** : `GET`

**Headers** :
```
Authorization: Token 8321c7a8f7fe8f75192fa15a6c883a11758e0084
Accept: application/json
Content-Type: application/json
```

**Code Node.js** :
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

**Résultat** : ❌ 401 "Token invalide"

---

### Endpoint 2 : Transports sous-traités (notre cas d'usage)

**URL** : `https://api.dashdoc.com/api/v4/transports/?status=done&is_subcontracted=true&page_size=10`

**Méthode** : `GET`

**Headers** :
```
Authorization: Token 8321c7a8f7fe8f75192fa15a6c883a11758e0084
Accept: application/json
Content-Type: application/json
```

**Code Node.js** :
```javascript
const response = await axios.get('https://api.dashdoc.com/api/v4/transports/', {
  headers: {
    'Authorization': 'Token 8321c7a8f7fe8f75192fa15a6c883a11758e0084',
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  },
  params: {
    status: 'done',
    is_subcontracted: true,
    page_size: 10
  },
  timeout: 15000
});
```

**Résultat** : ❌ 401 "Token invalide"

---

### Endpoint 3 : Avec période (6 derniers mois)

**URL** : `https://api.dashdoc.com/api/v4/transports/?status=done&is_subcontracted=true&created_after=2025-08-07T00:00:00Z&page_size=100`

**Méthode** : `GET`

**Headers** :
```
Authorization: Token 8321c7a8f7fe8f75192fa15a6c883a11758e0084
Accept: application/json
Content-Type: application/json
```

**Résultat** : ❌ 401 "Token invalide"

---

## 3️⃣ Équivalent cURL

### cURL Test 1 (simple)

```bash
curl -X GET "https://api.dashdoc.com/api/v4/transports/?page_size=1" \
  -H "Authorization: Token 8321c7a8f7fe8f75192fa15a6c883a11758e0084" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -v
```

### cURL Test 2 (avec filtres)

```bash
curl -X GET "https://api.dashdoc.com/api/v4/transports/?status=done&is_subcontracted=true&page_size=10" \
  -H "Authorization: Token 8321c7a8f7fe8f75192fa15a6c883a11758e0084" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -v
```

---

## 4️⃣ Réponse Serveur Dashdoc

**Status HTTP** : `401 Unauthorized`

**Body** :
```json
{
  "detail": "Token invalide"
}
```

**Headers de réponse** :
```
www-authenticate: Token
content-type: application/json
```

---

## 5️⃣ Environnement Réseau

### Environnement de Développement (Windows)

- **OS** : Windows 11
- **IP** : IP publique résidentielle française
- **Fournisseur** : FAI français standard
- **Firewall** : Windows Defender (autorisant Node.js)

### Environnement de Production (AWS)

- **Service** : AWS Elastic Beanstalk
- **Région** : eu-central-1 (Frankfurt, Allemagne)
- **OS** : Amazon Linux 2
- **IP** : Dynamique AWS (plage eu-central-1)
- **Sortie Internet** : Via AWS Internet Gateway

**URL Production** : http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com

---

## 6️⃣ Ce qui Fonctionne de Notre Côté

### DNS Resolution

```bash
nslookup api.dashdoc.com
```

✅ Résolution DNS : OK

### HTTPS Connection

```bash
curl -I https://api.dashdoc.com
```

✅ Connexion HTTPS : OK (certificat valide)

### Endpoint sans Auth

```bash
curl -X GET "https://api.dashdoc.com/api/v4/" -v
```

✅ API accessible (retourne erreur auth attendue)

---

## 7️⃣ Questions pour le Support

### Q1 : Quel outil utilisez-vous pour tester ?

- curl ?
- Postman ?
- Python ?
- Autre ?

**Pouvez-vous nous fournir la commande EXACTE qui fonctionne chez vous ?**

### Q2 : Quelle URL exacte testez-vous ?

Exemple de ce que nous testons :
```
https://api.dashdoc.com/api/v4/transports/?page_size=1
```

### Q3 : Y a-t-il des restrictions ?

- **Whitelist IP** : La clé est-elle restreinte à certaines IPs ?
- **Whitelist domaine/user-agent** : Y a-t-il des filtres sur le User-Agent ?
- **Rate limiting** : Sommes-nous bloqués par rate limiting ?

### Q4 : Pouvez-vous tester depuis notre IP ?

**Notre IP de test actuelle** : (Windows dev - je peux la fournir si besoin)
**Notre IP production AWS** : Dynamique eu-central-1

Pouvez-vous tester avec cette clé depuis une IP AWS eu-central-1 ?

### Q5 : Format exact du header

Nous utilisons :
```
Authorization: Token 8321c7a8f7fe8f75192fa15a6c883a11758e0084
```

- Est-ce correct ?
- Y a-t-il un espace spécifique ?
- Le mot "Token" est-il case-sensitive ?

---

## 8️⃣ Test de Comparaison Demandé

**Pouvez-vous exécuter cette commande de votre côté et nous envoyer le résultat complet ?**

```bash
curl -X GET "https://api.dashdoc.com/api/v4/transports/?page_size=1" \
  -H "Authorization: Token 8321c7a8f7fe8f75192fa15a6c883a11758e0084" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -v
```

**Résultat attendu si ça fonctionne** :
```json
{
  "count": XXX,
  "next": "...",
  "previous": null,
  "results": [...]
}
```

**Notre résultat actuel** :
```json
{
  "detail": "Token invalide"
}
```

---

## 9️⃣ Informations Complémentaires

### Version axios

```json
{
  "axios": "1.6.2"
}
```

### User-Agent envoyé par axios

Par défaut, axios envoie :
```
User-Agent: axios/1.6.2
```

**Question** : Le User-Agent est-il filtré ? Devons-nous utiliser un User-Agent spécifique ?

### Timeout

Nous utilisons un timeout de **15 secondes**.

La réponse 401 arrive **instantanément** (~100-200ms), ce qui suggère un rejet au niveau de l'authentification, pas un timeout réseau.

---

## 🔟 Demande Spécifique

**Pouvez-vous nous fournir** :

1. ✅ **Un exemple de requête curl qui FONCTIONNE** avec cette clé `8321c7a8f7fe8f75192fa15a6c883a11758e0084`
2. ✅ **Le résultat complet** (avec `-v` pour voir les headers)
3. ✅ **L'outil que vous utilisez** (curl, Postman, Python, etc.)
4. ✅ **Votre IP source** (pour comparer avec la nôtre)

---

## 📊 Synthèse

| Élément | Notre Configuration | Résultat |
|---------|---------------------|----------|
| URL | `https://api.dashdoc.com/api/v4/transports/` | ✅ Correct |
| Méthode | `GET` | ✅ Correct |
| Header Auth | `Authorization: Token 8321c7a8...` | ✅ Format confirmé par support |
| Header Accept | `application/json` | ✅ Correct |
| Header Content-Type | `application/json` | ✅ Correct |
| Outil | Node.js axios 1.6.2 | ❓ À comparer |
| IP source | Windows (dev) / AWS eu-central-1 (prod) | ❓ Whitelist ? |
| Résultat | ❌ 401 "Token invalide" | ❌ Échec |

**Hypothèse** : Restriction IP ou User-Agent non compatible ?

---

**Merci pour votre aide !**

Nous sommes prêts à tester toute commande curl ou configuration que vous nous fournirez.
