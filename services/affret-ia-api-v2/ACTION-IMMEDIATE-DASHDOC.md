# 🚨 ACTION IMMÉDIATE - Clé API Dashdoc invalide

**Date** : 2 février 2026
**Urgence** : ⚠️ **HAUTE** - Bloque l'import automatique des prix

---

## ❌ Problème identifié

La clé API Dashdoc `8321c7a8f7fe8f75192fa15a6c883a11758e0084` est **INVALIDE**.

**Diagnostic complet effectué** :
- ✅ Testé 5 méthodes d'authentification différentes
- ✅ Toutes retournent erreur 401 "Informations d'authentification non fournies" ou "Token invalide"
- ✅ Conclusion : La clé est expirée, révoquée ou invalide

**Impact** :
- ❌ Import automatique Dashdoc bloqué
- ✅ Les 5 autres endpoints pricing fonctionnent (enregistrement manuel OK)
- ⚠️ Pas de données historiques Dashdoc pour le market intelligence

---

## ✅ Solution en 3 étapes (10 minutes)

### ÉTAPE 1 : Régénérer la clé API Dashdoc

1. **Se connecter** : [https://app.dashdoc.com](https://app.dashdoc.com)

2. **Aller dans** : Paramètres → API & Intégrations → Clés API

3. **Créer une nouvelle clé** :
   - **Nom** : `Affret.IA - Production - Sous-traitance`
   - **Permissions** :
     - ✅ Lecture des transports
     - ✅ Accès aux données de tarification
     - ✅ Accès aux informations transporteur
     - ✅ Accès aux données d'affretement/sous-traitance
   - **Environnement** : Production
   - **Expiration** : 1 an

4. **📋 COPIER LA CLÉ** (elle ne sera affichée qu'une seule fois !)

---

### ÉTAPE 2 : Mettre à jour sur AWS

**Ouvrir PowerShell** et exécuter :

```powershell
aws elasticbeanstalk update-environment `
  --environment-name rt-affret-ia-api-prod-v4 `
  --region eu-central-1 `
  --option-settings `
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=DASHDOC_API_KEY,Value="<COLLER_LA_NOUVELLE_CLE_ICI>"
```

⏳ **Attendre 2-3 minutes** que l'environnement redémarre.

---

### ÉTAPE 3 : Tester l'import

**Test 1 - Dry run** (simulation sans sauvegarder) :

```bash
curl -X POST "http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/import/dashdoc" -H "Content-Type: application/json" -d "{\"organizationId\":\"test-org\",\"months\":6,\"dryRun\":true}"
```

**Résultat attendu** :
```json
{
  "success": true,
  "message": "DRY RUN - 15 transports seraient importés",
  "imported": 15
}
```

**Si ça fonctionne** → Lancer l'import réel :

```bash
curl -X POST "http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/import/dashdoc" -H "Content-Type: application/json" -d "{\"organizationId\":\"YOUR_ORG_ID\",\"months\":6,\"dryRun\":false}"
```

---

## 📋 Checklist rapide

- [ ] Se connecter à Dashdoc
- [ ] Créer nouvelle clé API avec permissions complètes
- [ ] Copier la nouvelle clé
- [ ] Mettre à jour AWS EB avec la commande ci-dessus
- [ ] Attendre 2-3 minutes
- [ ] Tester avec dry-run
- [ ] Si OK → Import réel

---

## 🆘 Besoin d'aide ?

**Documentations créées** :
1. [SOLUTION-DASHDOC-401.md](SOLUTION-DASHDOC-401.md) - Guide complet pas à pas (200 lignes)
2. [scripts/test-dashdoc-simple.js](scripts/test-dashdoc-simple.js) - Script de diagnostic
3. [SYNTHESE-DASHDOC-INTEGRATION.md](SYNTHESE-DASHDOC-INTEGRATION.md) - État de l'intégration

**Support Dashdoc** :
- Email : support@dashdoc.com
- Documentation : https://api.dashdoc.com/docs/

---

## ✅ Ce qui fonctionne DÉJÀ

**Version déployée** : v2.7.0-SUBCONTRACTOR-FIX (GREEN)

**Endpoints opérationnels (5/6)** :
- ✅ `record-price` - Enregistrement manuel des prix
- ✅ `price-history` - Historique des prix
- ✅ `calculate-target-price` - Calcul prix cible ±10%
- ✅ `preferred-subcontractors` - Sous-traitants préférés
- ✅ `search-carriers` - Recherche transporteurs

**Fix critique déployé** :
- ✅ Extraction correcte des prix **sous-traitants** (charter.price, subcontracting.price)
- ✅ Validation stricte : ignore les transports sans prix sous-traitant
- ✅ Traçabilité complète avec priceSource

**Workaround temporaire** :
En attendant la correction de la clé API, vous pouvez **enregistrer les prix manuellement** via l'endpoint `record-price` (voir exemples dans [VALIDATION-v2.7.0.md](VALIDATION-v2.7.0.md)).

---

**Généré le** : 2026-02-02 22:15 UTC
**Par** : Claude Sonnet 4.5
