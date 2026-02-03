# 🆘 Questions pour le Support Dashdoc

**Date** : 2026-02-03
**Contexte** : Intégration API Dashdoc v4 dans Affret.IA
**Problème** : Erreur 401 malgré clé API confirmée opérationnelle

---

## 📋 Résumé du Problème

**Clé API fournie** : `8321c7a8f7fe8f75192fa15a6c883a11758e0084`

**Statut selon équipes Dashdoc** : ✅ Opérationnelle

**Résultat de nos tests** : ❌ Toutes les requêtes retournent 401 Unauthorized

**Configurations testées** : 10 différentes méthodes d'authentification

---

## 🧪 Tests Effectués

### Test 1: Authorization: Bearer

```bash
curl -X GET "https://api.dashdoc.com/api/v4/transports/?page_size=1" \
  -H "Authorization: Bearer 8321c7a8f7fe8f75192fa15a6c883a11758e0084" \
  -H "Content-Type: application/json"
```

**Résultat** : 401
```json
{
  "detail": "Informations d'authentification non fournies."
}
```

**Headers de réponse** :
```
www-authenticate: Token
```

---

### Test 2: Authorization: Token

```bash
curl -X GET "https://api.dashdoc.com/api/v4/transports/?page_size=1" \
  -H "Authorization: Token 8321c7a8f7fe8f75192fa15a6c883a11758e0084" \
  -H "Content-Type: application/json"
```

**Résultat** : 401
```json
{
  "detail": "Token invalide"
}
```

---

### Autres tests effectués (tous échouent avec 401)

3. X-API-Key header
4. Bearer + Accept: application/json
5. Bearer sans Content-Type
6. Bearer + User-Agent personnalisé
7. Endpoint /me/ (404 Not Found)
8. Endpoint /companies/ (401)
9. API v3 au lieu de v4 (401)
10. Sans query params (401)

---

## ❓ Questions pour le Support Dashdoc

### 1. Format d'Authentification

**Q1 : Quel est le format exact d'authentification requis ?**

Options testées sans succès :
- ❌ `Authorization: Bearer <token>`
- ❌ `Authorization: Token <token>`
- ❌ `X-API-Key: <token>`

**Q2 : Pouvez-vous fournir un exemple de requête curl qui fonctionne avec cette clé ?**

Exemple attendu :
```bash
curl -X GET "https://api.dashdoc.com/api/v4/transports/?page_size=1" \
  -H "Authorization: ???" \
  -H "???"
```

---

### 2. Permissions de la Clé API

**Q3 : Quelles permissions sont actuellement activées sur cette clé ?**

Permissions requises pour notre cas d'usage :
- ✅ Lecture des transports (transports:read)
- ✅ Accès aux données de tarification (pricing:read)
- ✅ Accès aux informations transporteur (carrier:read)
- ✅ Accès aux données d'affretement (charter:read, subcontracting:read)

**Q4 : Y a-t-il des restrictions IP ou domaine sur cette clé ?**

Notre serveur effectue les requêtes depuis :
- IP : AWS Elastic Beanstalk (eu-central-1)
- User-Agent : Node.js/axios

---

### 3. Environnement API

**Q5 : Cette clé est-elle active pour l'environnement Production ?**

URLs testées :
- ❌ https://api.dashdoc.com/api/v4 (Production)
- ❌ https://api.dashdoc.com/api/v3
- ⚠️ https://api.staging.dashdoc.com/api/v4 (non testé)
- ⚠️ https://api.sandbox.dashdoc.com/api/v4 (non testé)

**Q6 : Devons-nous utiliser une URL différente ?**

---

### 4. Structure de la Clé

**Q7 : Le format de la clé fournie est-il correct ?**

Clé fournie : `8321c7a8f7fe8f75192fa15a6c883a11758e0084` (40 caractères hexadécimaux)

**Q8 : Y a-t-il un préfixe manquant ?**

Exemples possibles :
- `dashdoc_8321c7a8...`
- `dd_8321c7a8...`
- Autre ?

---

### 5. Headers Additionnels

**Q9 : Y a-t-il des headers supplémentaires requis ?**

Headers testés :
- Content-Type: application/json
- Accept: application/json
- User-Agent: Affret.IA/2.7.0

Headers manquants possibles :
- X-Company-ID ?
- X-Organization-ID ?
- Autre ?

---

### 6. Endpoint de Test

**Q10 : Quel endpoint devons-nous utiliser pour tester l'authentification ?**

Endpoints testés :
- ❌ GET /transports/ (401)
- ❌ GET /companies/ (401)
- ❌ GET /me/ (404)

Endpoint recommandé pour test simple ?

---

## 🔍 Observations Importantes

### Header www-authenticate

Toutes les réponses 401 incluent ce header :
```
www-authenticate: Token
```

**Cela signifie-t-il** que l'API attend un format d'authentification spécifique "Token" ?

---

### Message d'Erreur Différent

**Avec `Authorization: Bearer`** :
```json
{
  "detail": "Informations d'authentification non fournies."
}
```
→ L'API ne reconnaît pas le header Authorization

**Avec `Authorization: Token`** :
```json
{
  "detail": "Token invalide"
}
```
→ L'API reconnaît le format mais rejette le token

**Cela suggère-t-il** que le format `Token` est correct mais que la clé est invalide ?

---

## 📝 Informations Complémentaires

### Notre Configuration Actuelle

**Service** : Affret.IA v2.7.0 (Node.js 20)
**Hébergement** : AWS Elastic Beanstalk (eu-central-1)
**Librairie HTTP** : axios 1.6.2

**Code utilisé** :
```javascript
const response = await axios.get('https://api.dashdoc.com/api/v4/transports/', {
  headers: {
    'Authorization': `Bearer ${DASHDOC_API_KEY}`,
    'Content-Type': 'application/json'
  },
  params: {
    status: 'done',
    is_subcontracted: true,
    page_size: 100
  }
});
```

---

### Cas d'Usage

**Objectif** : Importer les transports sous-traités complétés pour analyse de marché

**Filtre requis** :
```
status=done
is_subcontracted=true
```

**Champs nécessaires** :
- `charter.price` ou `subcontracting.price` (prix sous-traitant)
- `charter.carrier` ou `subcontracting.carrier` (info transporteur)
- `origin.address` et `destination.address` (géographie)
- `created`, `delivery_date` (dates)

---

## 🎯 Demande Spécifique

**Pouvez-vous nous fournir** :

1. ✅ **Un exemple de requête curl fonctionnelle** avec cette clé API
2. ✅ **La documentation d'authentification** pour l'API v4
3. ✅ **Confirmation des permissions** activées sur cette clé
4. ✅ **Le bon endpoint de test** pour vérifier l'authentification

---

## 📧 Contact

**Projet** : Affret.IA - Intelligence de marché pour le transport
**URL Production** : http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com
**Environnement** : AWS Elastic Beanstalk (eu-central-1)

**Documentation technique créée** :
- Tests diagnostic : scripts/test-dashdoc-verified-key.js
- Rapport complet : RAPPORT-TEST-GRANDEUR-NATURE.md
- Guide intégration : docs/DASHDOC-AFFRETEMENT.md (634 lignes)

---

## ⏱️ Urgence

**Priorité** : Moyenne

**Impact** :
- ✅ Système Affret.IA opérationnel à 82% (5/6 endpoints pricing fonctionnels)
- ❌ Import automatique Dashdoc bloqué
- ⚠️ Workaround : Enregistrement manuel des prix fonctionnel

**Délai souhaité** : 48-72h pour résolution

---

## 🔗 Ressources

**Documentation API Dashdoc** : https://api.dashdoc.com/docs/
**Support Dashdoc** : support@dashdoc.com

**Tests complets disponibles** :
- [test-dashdoc-verified-key.js](scripts/test-dashdoc-verified-key.js) - 10 configurations testées
- [test-dashdoc-simple.js](scripts/test-dashdoc-simple.js) - Diagnostic détaillé
- [test-nouvelle-cle-dashdoc.js](scripts/test-nouvelle-cle-dashdoc.js) - Test nouvelle clé

---

**Merci pour votre aide !** 🙏

Nous sommes prêts à tester toute nouvelle configuration que vous suggérerez.
