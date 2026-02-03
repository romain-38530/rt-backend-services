# 📧 Réponse au Support Dashdoc - Clé API Invalide

**Date** : 2026-02-03
**Clé API testée** : `8321c7a8f7fe8f75192fa15a6c883a11758e0084`
**Format utilisé** : `Authorization: Token <token>` (comme indiqué par votre support)

---

## ✅ Confirmation : Format Correct

Merci pour votre réponse rapide confirmant le format d'authentification :

```
Authorization: Token <token>
```

Nous avons immédiatement testé avec ce format exact.

---

## ❌ Problème : Token Invalide

Malgré l'utilisation du **format correct**, toutes nos requêtes échouent avec :

**Erreur HTTP** : `401 Unauthorized`
**Message** : `"detail": "Token invalide"`
**Header** : `WWW-Authenticate: Token`

### Tests Effectués (Format Exact du Support)

**Test 1** : Endpoint de base
```bash
curl -X GET "https://api.dashdoc.com/api/v4/transports/?page_size=1" \
  -H "Authorization: Token 8321c7a8f7fe8f75192fa15a6c883a11758e0084" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```
**Résultat** : ❌ 401 "Token invalide"

---

**Test 2** : Notre cas d'usage (transports sous-traités)
```bash
curl -X GET "https://api.dashdoc.com/api/v4/transports/?status=done&is_subcontracted=true&page_size=10" \
  -H "Authorization: Token 8321c7a8f7fe8f75192fa15a6c883a11758e0084" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```
**Résultat** : ❌ 401 "Token invalide"

---

**Test 3** : Avec période (6 derniers mois)
```bash
curl -X GET "https://api.dashdoc.com/api/v4/transports/?status=done&is_subcontracted=true&created_after=2025-08-07T00:00:00Z&page_size=100" \
  -H "Authorization: Token 8321c7a8f7fe8f75192fa15a6c883a11758e0084" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```
**Résultat** : ❌ 401 "Token invalide"

---

## 🤔 Analyse

Puisque :
- ✅ Le **format** est correct (confirmé par votre support)
- ✅ L'**endpoint** est correct (`https://api.dashdoc.com/api/v4`)
- ✅ Les **headers** sont corrects
- ❌ Mais l'API retourne **"Token invalide"**

**Hypothèses** :
1. 🔴 La clé est **révoquée** ou **expirée**
2. 🔴 La clé n'est **pas active** pour l'environnement Production
3. 🔴 La clé a des **restrictions IP** bloquant nos serveurs AWS
4. 🔴 La clé a des **permissions insuffisantes**

---

## 🙏 Demande de Vérification

**Pouvez-vous vérifier côté Dashdoc** :

### 1. Status de la Clé

```
Clé : 8321c7a8f7fe8f75192fa15a6c883a11758e0084
```

- ❓ Est-elle **ACTIVE** ?
- ❓ Date de création ?
- ❓ Date d'expiration (si applicable) ?
- ❓ A-t-elle été **révoquée** ?

### 2. Environnement

- ❓ Pour quel environnement est-elle configurée ?
  - Production (`api.dashdoc.com`) ← **ce que nous utilisons**
  - Staging (`api.staging.dashdoc.com`)
  - Sandbox (`api.sandbox.dashdoc.com`)

### 3. Permissions

- ❓ Quelles permissions sont activées sur cette clé ?

**Permissions requises pour notre cas d'usage** :
- ✅ Lecture des transports (`transports:read`)
- ✅ Lecture de la tarification (`pricing:read`)
- ✅ Lecture des transporteurs (`carriers:read`)
- ✅ Lecture des données d'affretement/sous-traitance (`charter:read`, `subcontracting:read`)

### 4. Restrictions

- ❓ Y a-t-il des **restrictions IP** ?
- ❓ Y a-t-il des **restrictions de domaine** ?

**Notre infrastructure** :
- Serveurs AWS Elastic Beanstalk
- Région : `eu-central-1` (Frankfurt)
- IP dynamiques AWS (pas d'IP fixe)

### 5. Test de Validation

**Pouvez-vous tester cette clé de votre côté** et nous confirmer qu'elle fonctionne ?

Si oui, pourriez-vous nous fournir **l'exemple de requête curl exact** que vous avez utilisé avec succès ?

---

## 🎯 Solution Attendue

### Option A : Corriger la Clé Existante

Si la clé `8321c7a8f7fe8f75192fa15a6c883a11758e0084` peut être réactivée/corrigée :
1. Activer pour l'environnement **Production**
2. Assigner les permissions requises (transports, pricing, carriers, charter/subcontracting)
3. Retirer toute restriction IP (ou autoriser AWS eu-central-1)

### Option B : Nouvelle Clé API

Si la clé actuelle ne peut pas être corrigée, pouvez-vous nous fournir une **nouvelle clé API** avec :
- ✅ Environnement : **Production** (`api.dashdoc.com`)
- ✅ Permissions : Lecture transports + pricing + carriers + affretement
- ✅ Pas de restriction IP (ou whitelist AWS eu-central-1)
- ✅ Durée de validité : Permanente (ou au minimum 1 an)

---

## 📊 Contexte de Notre Intégration

**Projet** : Affret.IA - Intelligence de marché pour le transport routier
**Objectif** : Importer automatiquement les données de sous-traitance depuis Dashdoc

**Filtre API requis** :
```javascript
{
  status: 'done',              // Transports terminés
  is_subcontracted: true,      // Uniquement les sous-traitances
  created_after: '<date>',     // 6 derniers mois
  page_size: 100
}
```

**Champs nécessaires** (par transport) :
- `charter.price` ou `subcontracting.price` → Prix payé au sous-traitant (CRITIQUE)
- `charter.carrier` ou `subcontracting.carrier` → Infos transporteur
- `origin.address` et `destination.address` → Route (ville, code postal)
- `created`, `delivery_date` → Dates

**Fréquence d'import** : Hebdomadaire (via cron job)

---

## 🚀 Urgence

**Priorité** : Moyenne
**Impact** : Notre système Affret.IA est opérationnel à **82%** (5/6 endpoints fonctionnels)

Seul l'import automatique Dashdoc est bloqué.

**Workaround actuel** : Enregistrement manuel des prix via notre API (fonctionnel)

**Délai souhaité** : 24-48h pour résolution

---

## 📞 Contact

**Organisation** : RT Transport Solutions
**Projet** : Affret.IA v2.7.0
**Environnement Production** : http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com

**Tests effectués** : 15+ configurations d'authentification testées
**Documentation créée** : 3000+ lignes (guides, scripts de test, documentation technique)

**Scripts de test disponibles** :
- [test-dashdoc-support-format.js](scripts/test-dashdoc-support-format.js) - Test format exact du support
- [test-dashdoc-verified-key.js](scripts/test-dashdoc-verified-key.js) - 10 configurations testées
- [test-nouvelle-cle-dashdoc.js](scripts/test-nouvelle-cle-dashdoc.js) - Script pour tester nouvelle clé

---

## ✅ Ce que Nous Avons Déjà Fait

1. ✅ Testé 15+ méthodes d'authentification différentes
2. ✅ Confirmé le format `Authorization: Token` (selon votre support)
3. ✅ Testé sur 3 endpoints différents (`/transports/`, `/companies/`, `/me/`)
4. ✅ Vérifié l'URL de l'API (Production: `api.dashdoc.com`)
5. ✅ Testé avec et sans paramètres de requête
6. ✅ Vérifié les headers (Accept, Content-Type, User-Agent)
7. ✅ Créé une documentation technique complète
8. ✅ Implémenté correctement l'extraction des prix sous-traitants dans notre code

---

## 🙏 Merci

Merci d'avance pour votre aide rapide. Nous sommes prêts à tester toute nouvelle clé ou configuration que vous nous fournirez.

N'hésitez pas à nous contacter si vous avez besoin d'informations complémentaires.

---

**Généré le** : 2026-02-03
**Version Affret.IA** : v2.7.0-SUBCONTRACTOR-FIX ✅ GREEN
