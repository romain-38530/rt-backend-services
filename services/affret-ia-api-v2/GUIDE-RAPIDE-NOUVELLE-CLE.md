# Guide Rapide - Régénérer et Tester Nouvelle Clé Dashdoc

**Temps estimé** : 10 minutes
**Difficulté** : Facile

---

## 🎯 Objectif

Remplacer la clé API Dashdoc invalide par une nouvelle clé fonctionnelle.

---

## 📋 Étape 1 : Générer la nouvelle clé (3 min)

### 1.1 Se connecter à Dashdoc

Ouvrir : [https://app.dashdoc.com](https://app.dashdoc.com)

### 1.2 Accéder aux clés API

1. Cliquer sur votre profil (en haut à droite)
2. **Paramètres** (ou **Settings**)
3. **API & Intégrations**
4. Section **Clés API**

### 1.3 Créer la nouvelle clé

Cliquer sur **Créer une clé API** (ou **Create API Key**)

Remplir :

| Champ | Valeur |
|-------|--------|
| **Nom** | `Affret.IA Production - Sous-traitance` |
| **Description** | `Import automatique transports sous-traités pour market intelligence` |
| **Permissions** | ✅ Lecture transports<br>✅ Lecture tarification<br>✅ Lecture transporteur<br>✅ Lecture affretement |
| **Environnement** | **Production** |
| **Expiration** | 1 an (ou jamais) |

Cliquer sur **Générer** ou **Create**

### 1.4 Copier la clé

⚠️ **IMPORTANT** : La clé ne sera affichée **qu'une seule fois** !

```
Exemple : a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
```

📋 **Copier la clé complète** (sans espaces avant/après)

---

## 🧪 Étape 2 : Tester la nouvelle clé (2 min)

### Option A : Test rapide avec script Node.js (recommandé)

```bash
cd "c:\Users\rtard\dossier symphonia\rt-backend-services\services\affret-ia-api-v2"

node scripts/test-nouvelle-cle-dashdoc.js <COLLER_VOTRE_NOUVELLE_CLE>
```

**Résultat attendu** :
```
✅ SUCCÈS ! La clé API fonctionne !
HTTP Status: 200 OK
Nombre total de transports: 1234
```

**Si erreur 401** :
- Vérifier que la clé a été copiée complètement (sans espaces)
- Vérifier les permissions dans Dashdoc
- Régénérer une nouvelle clé si nécessaire

### Option B : Test manuel avec curl

```bash
curl -X GET "https://api.dashdoc.com/api/v4/transports/?page_size=1" \
  -H "Authorization: Bearer <VOTRE_NOUVELLE_CLE>" \
  -H "Content-Type: application/json"
```

**Résultat attendu** : Code HTTP 200 + JSON avec `"count": ...`

---

## 🔧 Étape 3 : Mettre à jour sur AWS (3 min)

### 3.1 Mettre à jour la variable d'environnement

**PowerShell** :

```powershell
aws elasticbeanstalk update-environment `
  --environment-name rt-affret-ia-api-prod-v4 `
  --region eu-central-1 `
  --option-settings `
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=DASHDOC_API_KEY,Value="<VOTRE_NOUVELLE_CLE>"
```

**Bash** :

```bash
aws elasticbeanstalk update-environment \
  --environment-name rt-affret-ia-api-prod-v4 \
  --region eu-central-1 \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=DASHDOC_API_KEY,Value="<VOTRE_NOUVELLE_CLE>"
```

### 3.2 Attendre le redémarrage

⏳ **Attendre 2-3 minutes** que l'environnement redémarre

Vérifier le statut :

```bash
aws elasticbeanstalk describe-environment-health \
  --environment-name rt-affret-ia-api-prod-v4 \
  --region eu-central-1 \
  --attribute-names Status,Health,Color \
  --output table
```

Attendre `Health: Ok` et `Color: Green`

---

## ✅ Étape 4 : Tester l'import (2 min)

### 4.1 Test dry-run (simulation)

```bash
curl -X POST "http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/import/dashdoc" \
  -H "Content-Type: application/json" \
  -d '{"organizationId":"test-org","months":6,"dryRun":true}'
```

**Résultat attendu** :
```json
{
  "success": true,
  "message": "DRY RUN - 15 transports seraient importés",
  "imported": 15,
  "skipped": 2
}
```

### 4.2 Import réel (si test réussi)

```bash
curl -X POST "http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/import/dashdoc" \
  -H "Content-Type: application/json" \
  -d '{"organizationId":"YOUR_ORG_ID","months":6,"dryRun":false}'
```

**Résultat attendu** :
```json
{
  "success": true,
  "message": "15 prix importés depuis Dashdoc",
  "imported": 15,
  "skipped": 2,
  "errors": 0
}
```

### 4.3 Vérifier les données importées

```bash
curl -X POST "http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/price-history" \
  -H "Content-Type: application/json" \
  -d '{"route":{"from":"75000","to":"69000"}}'
```

**Vérifier** : `"transactionCount"` > 0 ✅

---

## 🎉 Résultat Final

Si tous les tests réussissent :

✅ **Clé API Dashdoc fonctionnelle**
✅ **Import automatique opérationnel**
✅ **6/6 endpoints pricing fonctionnels**
✅ **Market intelligence basée sur données réelles**

---

## 🆘 En cas de problème

### Erreur 401 après mise à jour AWS

**Causes** :
1. Mauvaise clé copiée (espaces, caractères manquants)
2. Environnement AWS pas encore redémarré
3. Permissions insuffisantes sur la clé

**Solutions** :
1. Vérifier la clé avec le script de test
2. Attendre 5 minutes supplémentaires
3. Vérifier les logs AWS :
   ```bash
   aws logs tail "/aws/elasticbeanstalk/rt-affret-ia-api-prod-v4/var/log/web.stdout.log" \
     --region eu-central-1 \
     --since 5m \
     --follow
   ```

### Erreur 403 (Permissions)

La clé n'a pas les bonnes permissions.

**Solution** :
1. Retourner dans Dashdoc → API & Intégrations
2. Modifier les permissions de la clé
3. Ajouter toutes les permissions de lecture nécessaires

### Import réussit mais 0 transports importés

**Causes** :
1. Pas de transports sous-traités dans la période
2. Filtre `is_subcontracted=true` trop restrictif
3. Tous les transports déjà importés (pas de doublons)

**Solutions** :
1. Vérifier manuellement sur Dashdoc s'il y a des transports sous-traités
2. Augmenter la période : `"months": 12`
3. C'est normal si déjà importés (pas de doublons créés)

---

## 📞 Support

**Documentation** :
- [ACTION-IMMEDIATE-DASHDOC.md](ACTION-IMMEDIATE-DASHDOC.md) - Guide d'action rapide
- [SOLUTION-DASHDOC-401.md](SOLUTION-DASHDOC-401.md) - Guide complet détaillé
- [SYNTHESE-DASHDOC-INTEGRATION.md](SYNTHESE-DASHDOC-INTEGRATION.md) - État de l'intégration

**Support Dashdoc** :
- Email : support@dashdoc.com
- Documentation : https://api.dashdoc.com/docs/

---

## 📊 Checklist

- [ ] Se connecter à Dashdoc
- [ ] Créer nouvelle clé API avec permissions complètes
- [ ] Copier la nouvelle clé (sans espaces)
- [ ] Tester la clé avec `test-nouvelle-cle-dashdoc.js`
- [ ] Clé fonctionne → HTTP 200 ✅
- [ ] Mettre à jour AWS EB avec commande ci-dessus
- [ ] Attendre 2-3 minutes (statut Green)
- [ ] Tester import dry-run → "DRY RUN - X transports..." ✅
- [ ] Import réel → "X prix importés..." ✅
- [ ] Vérifier price-history → transactionCount > 0 ✅

---

**Dernière mise à jour** : 2026-02-02
**Version** : v2.7.0-SUBCONTRACTOR-FIX
