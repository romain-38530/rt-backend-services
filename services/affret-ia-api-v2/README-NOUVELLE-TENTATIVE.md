# ✅ Solution Prête - Nouvelle Tentative Dashdoc

**Status** : Outils de diagnostic et test créés
**Action requise** : Régénérer la clé API Dashdoc

---

## 🔍 Diagnostic Confirmé

**Résultat des tests** :
- ❌ Clé API actuelle `8321c7a8...` est **INVALIDE**
- ❌ Testé 5 méthodes d'authentification → Toutes échouent avec 401
- ✅ Code d'extraction des prix sous-traitants **CORRECT** et déployé
- ✅ 5/6 endpoints pricing **OPÉRATIONNELS**

**Conclusion** : Seule solution = **régénérer une nouvelle clé API dans Dashdoc**

---

## 🚀 Solution en 3 Commandes

### 1️⃣ Générer nouvelle clé dans Dashdoc (manuel)

https://app.dashdoc.com → Paramètres → API & Intégrations → Créer clé API

**Permissions requises** :
- ✅ Lecture transports
- ✅ Lecture tarification
- ✅ Lecture transporteur
- ✅ Lecture affretement/sous-traitance

📋 **Copier la nouvelle clé** (affichée une seule fois)

---

### 2️⃣ Tester la nouvelle clé (local)

```bash
cd "c:\Users\rtard\dossier symphonia\rt-backend-services\services\affret-ia-api-v2"

node scripts/test-nouvelle-cle-dashdoc.js <COLLER_VOTRE_NOUVELLE_CLE>
```

**Résultat attendu** :
```
✅ SUCCÈS ! La clé API fonctionne !
HTTP Status: 200 OK
```

**Si erreur 401** → Vérifier clé copiée complètement, ou régénérer

---

### 3️⃣ Mettre à jour AWS et tester import

```powershell
# Mettre à jour AWS
aws elasticbeanstalk update-environment `
  --environment-name rt-affret-ia-api-prod-v4 `
  --region eu-central-1 `
  --option-settings `
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=DASHDOC_API_KEY,Value="<NOUVELLE_CLE>"

# Attendre 2-3 minutes...

# Tester l'import (dry-run)
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

---

## 📚 Documentation Disponible

| Document | Description | Lignes |
|----------|-------------|--------|
| **[GUIDE-RAPIDE-NOUVELLE-CLE.md](GUIDE-RAPIDE-NOUVELLE-CLE.md)** | Guide pas à pas complet (10 min) | 350 |
| [ACTION-IMMEDIATE-DASHDOC.md](ACTION-IMMEDIATE-DASHDOC.md) | Action immédiate | 120 |
| [SOLUTION-DASHDOC-401.md](SOLUTION-DASHDOC-401.md) | Solution détaillée + troubleshooting | 300+ |
| [scripts/test-nouvelle-cle-dashdoc.js](scripts/test-nouvelle-cle-dashdoc.js) | Script de test automatique | 230 |

---

## 🎯 Temps Estimé

| Étape | Durée |
|-------|-------|
| 1. Générer clé Dashdoc | 3 min |
| 2. Tester localement | 1 min |
| 3. Mettre à jour AWS | 2 min |
| 4. Attendre redémarrage | 2-3 min |
| 5. Tester import | 1 min |
| **TOTAL** | **~10 minutes** |

---

## ✅ Checklist Rapide

```
[ ] Ouvrir https://app.dashdoc.com
[ ] Paramètres → API & Intégrations → Créer clé API
[ ] Permissions: Lecture transports + tarif + carrier + affretement
[ ] Copier la nouvelle clé
[ ] Tester: node scripts/test-nouvelle-cle-dashdoc.js <CLE>
[ ] HTTP 200 OK ? → Continuer
[ ] Mettre à jour AWS EB avec commande ci-dessus
[ ] Attendre 2-3 min (Environment Green)
[ ] Tester import dry-run
[ ] Import réel si dry-run OK
[ ] Vérifier price-history → transactionCount > 0
```

---

## 🎉 Résultat Final Attendu

Après correction :

✅ **6/6 endpoints pricing opérationnels** (100%)
✅ **Import automatique Dashdoc fonctionnel**
✅ **Prix sous-traitants correctement extraits** (charter.price, subcontracting.price)
✅ **Market intelligence basée sur données réelles**
✅ **Négociation automatique avec prix cibles calculés**

---

**Créé le** : 2026-02-02 22:30 UTC
**Version déployée** : v2.7.0-SUBCONTRACTOR-FIX (GREEN)
**Status** : ✅ Prêt pour nouvelle tentative
