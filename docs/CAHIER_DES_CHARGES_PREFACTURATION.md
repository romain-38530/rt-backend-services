# Cahier des Charges - Module Préfacturation Transport

**Version:** 1.0
**Date:** 2025-12-24
**Auteur:** Claude Code / RT Technologie

---

## 1. CONTEXTE ET OBJECTIFS

### 1.1 Situation Actuelle
Le module de préfacturation transport est partiellement opérationnel :
- **Backend billing-api** : Déployé et fonctionnel sur `https://d1ciol606nbfs0.cloudfront.net`
- **Frontend web-industry** : Interface affichée mais **non connectée** au bon backend
- **Problème** : Le frontend appelle `/api/v1/preinvoices` sur orders-api (inexistant) au lieu de billing-api

### 1.2 Objectif
Rétablir la connexion frontend-backend pour que le module de préfacturation soit pleinement opérationnel.

---

## 2. ARCHITECTURE CIBLE

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  web-industry   │  web-transporter │  web-logistician            │
│  (Industriels)  │  (Transporteurs) │  (Logisticiens)             │
└────────┬────────┴────────┬─────────┴────────────┬───────────────┘
         │                 │                       │
         ▼                 ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CLOUDFRONT CDN                                │
├─────────────────┬───────────────────────────────────────────────┤
│ dh9acecfz0wg0   │ d1ciol606nbfs0                                │
│ (Orders API)    │ (Billing API)                                 │
└────────┬────────┴────────┬──────────────────────────────────────┘
         │                 │
         ▼                 ▼
┌─────────────────┐ ┌─────────────────────────────────────────────┐
│  orders-api-v2  │ │              billing-api                     │
│  - Commandes    │ │  - /api/billing/prefacturations              │
│  - Tracking     │ │  - /api/billing/tariffs                      │
│  - eCMR         │ │  - /api/billing/invoice/*                    │
│                 │ │  - /api/billing/discrepancy/*                │
│                 │ │  - /api/billing/export                       │
└────────┬────────┘ └────────┬────────────────────────────────────┘
         │                   │
         └─────────┬─────────┘
                   ▼
         ┌─────────────────┐
         │    MongoDB      │
         │  (Atlas Cloud)  │
         └─────────────────┘
```

---

## 3. MODIFICATIONS À EFFECTUER

### 3.1 Frontend web-industry (`apps/web-industry/`)

#### 3.1.1 Fichier `lib/api.ts`
**Action:** Créer `preinvoicesApi` utilisant `BILLING_API` au lieu de `ORDERS_API`

```typescript
// AVANT (cassé)
export const preinvoicesApi = {
  list: (params) => fetch(`${API_CONFIG.ORDERS_API}/preinvoices?...`)
}

// APRÈS (corrigé)
export const preinvoicesApi = {
  list: (params) => fetch(`${API_CONFIG.BILLING_API}/billing/prefacturations?...`)
}
```

#### 3.1.2 Mapping des endpoints

| Frontend (actuel)                | Backend billing-api (cible)           |
|----------------------------------|---------------------------------------|
| `/api/v1/preinvoices`            | `/api/billing/prefacturations`        |
| `/api/v1/preinvoices/stats`      | `/api/billing/stats`                  |
| `/api/v1/preinvoices/:id`        | `/api/billing/prefacturation/:id`     |
| `/api/v1/preinvoices/:id/validate` | `/api/billing/prefacturation/:id/validate` |
| `/api/v1/preinvoices/:id/mark-paid` | `/api/billing/prefacturation/:id/mark-paid` |
| `/api/v1/preinvoices/export`     | `/api/billing/export`                 |

### 3.2 Frontend web-transporter (`apps/web-transporter/`)

#### 3.2.1 Fichier `amplify.yml`
**Action:** Corriger le nom de la variable d'environnement

```yaml
# AVANT (incorrect)
NEXT_PUBLIC_BILLING_API: 'https://d1ciol606nbfs0.cloudfront.net'

# APRÈS (correct)
NEXT_PUBLIC_BILLING_API_URL: 'https://d1ciol606nbfs0.cloudfront.net/api'
```

### 3.3 Backend billing-api (`services/billing-api/`)

#### 3.3.1 Endpoints à ajouter/vérifier

| Endpoint | Méthode | Fonction | Status |
|----------|---------|----------|--------|
| `/api/billing/prefacturation/:id/validate` | POST | Validation industriel | À vérifier |
| `/api/billing/prefacturation/:id/mark-paid` | POST | Marquer comme payé | À ajouter |
| `/api/billing/stats` | GET | Statistiques dashboard | À vérifier |

---

## 4. PLAN DE DÉPLOIEMENT

### Phase 1 : Correction Frontend (Priorité Haute)
1. Modifier `web-industry/lib/api.ts` - Mapper vers billing-api
2. Modifier `web-industry/pages/billing.tsx` - Adapter les appels
3. Commit et push → Déploiement Amplify automatique

### Phase 2 : Correction Configuration (Priorité Moyenne)
1. Modifier `web-transporter/amplify.yml` - Corriger variable
2. Commit et push → Déploiement Amplify automatique

### Phase 3 : Enrichissement Backend (Si nécessaire)
1. Ajouter endpoints manquants dans billing-api
2. Créer bundle et déployer sur Elastic Beanstalk
3. Invalider cache CloudFront

---

## 5. TESTS DE VALIDATION

### 5.1 Tests Fonctionnels

| Test | Action | Résultat Attendu |
|------|--------|------------------|
| T1 | Accéder à /billing | Dashboard avec KPIs |
| T2 | Cliquer "Actualiser" | Liste des préfactures chargée |
| T3 | Filtrer par mois | Préfactures filtrées |
| T4 | Valider une préfacture | Status "validated_industrial" |
| T5 | Marquer comme payé | Status "paid" avec référence |
| T6 | Exporter CSV | Fichier téléchargé |

### 5.2 Tests Techniques

```bash
# Test endpoint billing-api
curl -s "https://d1ciol606nbfs0.cloudfront.net/api/billing/prefacturations" \
  -H "Authorization: Bearer <token>"

# Réponse attendue
{
  "success": true,
  "data": [...],
  "total": N
}
```

---

## 6. RISQUES ET MITIGATIONS

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Incompatibilité format données | Élevé | Adapter le mapping dans le frontend |
| Authentification différente | Moyen | Utiliser le même token JWT |
| Cache CloudFront | Faible | Invalidation après déploiement |

---

## 7. LIVRABLES

1. ✅ Cahier des charges (ce document)
2. ⬜ Code frontend corrigé (web-industry)
3. ⬜ Configuration amplify.yml corrigée (web-transporter)
4. ⬜ Endpoints backend ajoutés si nécessaire
5. ⬜ Documentation mise à jour

---

## 8. VALIDATION

**Critères d'acceptation :**
- [ ] Dashboard affiche les KPIs en temps réel
- [ ] Liste des préfactures se charge correctement
- [ ] Validation d'une préfacture fonctionne
- [ ] Export CSV génère un fichier valide
- [ ] Aucune erreur 404 dans la console

---

*Document généré automatiquement - RT Technologie*
