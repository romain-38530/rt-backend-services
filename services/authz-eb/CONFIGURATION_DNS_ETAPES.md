# 🚀 Configuration DNS - Guide Étape par Étape

**Domaine:** symphonia-controltower.com
**Temps estimé:** 15-20 minutes
**Niveau:** ⭐ Facile

---

## ✅ Checklist de Configuration

```
┌─────────────────────────────────────────────────────────┐
│  CONFIGURATION DNS POUR EMAILS SYMPHONI.A              │
└─────────────────────────────────────────────────────────┘

Étape 1: SPF (5 minutes)              [ ] À faire
Étape 2: DKIM (10 minutes)            [ ] À faire
Étape 3: DMARC (5 minutes)            [ ] À faire
Étape 4: Vérification (après 24-48h)  [ ] À faire
```

---

## 📋 ÉTAPE 1 : Configuration SPF (5 minutes)

### ✅ Ce que vous devez faire

1. **Accéder à votre gestionnaire DNS**
   - OVH: https://www.ovh.com/manager/ → Domaines → symphonia-controltower.com → Zone DNS
   - Autre: Connectez-vous à votre gestionnaire DNS

2. **Ajouter un enregistrement TXT**
   ```
   Nom/Host:  @
   Type:      TXT
   Valeur:    v=spf1 include:mx.ovh.net ~all
   TTL:       3600
   ```

3. **Sauvegarder**

### ✅ Comment vérifier (après 10 minutes)

```bash
nslookup -type=txt symphonia-controltower.com
```

**Résultat attendu:**
```
symphonia-controltower.com. TXT "v=spf1 include:mx.ovh.net ~all"
```

### ✅ Marquer comme complété

- [ ] Enregistrement TXT ajouté
- [ ] Sauvegardé
- [ ] Vérifié après 10 minutes

---

## 📋 ÉTAPE 2 : Configuration DKIM (10 minutes)

### ✅ Ce que vous devez faire

1. **Activer DKIM sur OVH**
   - Allez sur https://www.ovh.com/manager/
   - **Web Cloud** → **Emails**
   - Cliquez sur **symphonia-controltower.com**
   - Section **DKIM**
   - Cliquez sur **Activer DKIM**

2. **Récupérer les enregistrements DNS**
   - OVH va vous fournir 1-3 enregistrements DNS
   - **COPIEZ-LES EXACTEMENT**

   Exemple:
   ```
   Nom:    default._domainkey
   Type:   TXT
   Valeur: v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBA...
   ```

3. **Ajouter les enregistrements dans votre zone DNS**
   - Si DNS chez OVH: souvent ajouté automatiquement
   - Si DNS ailleurs: ajoutez manuellement chaque enregistrement

4. **Sauvegarder**

### ✅ Comment vérifier (après 24-48h)

**Via OVH Manager:**
- Retournez dans **Emails** → **symphonia-controltower.com**
- Section **DKIM**
- Status doit être : ✅ **Actif**

**Via ligne de commande:**
```bash
nslookup -type=txt default._domainkey.symphonia-controltower.com
```

### ✅ Marquer comme complété

- [ ] DKIM activé dans espace client OVH
- [ ] Enregistrements DNS copiés
- [ ] Enregistrements DNS ajoutés
- [ ] Sauvegardé
- [ ] Vérifié après 24-48h (Status: Actif)

---

## 📋 ÉTAPE 3 : Configuration DMARC (5 minutes)

### ✅ Ce que vous devez faire

1. **Accéder à votre zone DNS**
   - Même endroit que pour SPF

2. **Ajouter un enregistrement TXT**
   ```
   Nom/Host:  _dmarc
   Type:      TXT
   Valeur:    v=DMARC1; p=quarantine; rua=mailto:admin@symphonia-controltower.com; pct=100
   TTL:       3600
   ```

3. **Sauvegarder**

### ✅ Comment vérifier (après 10 minutes)

```bash
nslookup -type=txt _dmarc.symphonia-controltower.com
```

**Résultat attendu:**
```
_dmarc.symphonia-controltower.com. TXT "v=DMARC1; p=quarantine; rua=mailto:admin@symphonia-controltower.com..."
```

### ✅ Marquer comme complété

- [ ] Enregistrement TXT ajouté
- [ ] Email de rapports configuré
- [ ] Sauvegardé
- [ ] Vérifié après 10 minutes

---

## 📋 ÉTAPE 4 : Vérification Finale (après 24-48h)

### ✅ Test Complet de Délivrabilité

#### 1. Envoyer un Email de Test

Utilisez votre système SYMPHONI.A pour envoyer un email :

```bash
curl -X POST http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/carriers/invite \
  -H "Content-Type: application/json" \
  -d '{
    "email": "votre-email-test@gmail.com",
    "companyName": "Test DNS Configuration",
    "siret": "99999999999999",
    "invitedBy": "Admin Test",
    "referenceMode": "direct"
  }'
```

#### 2. Vérifier la Réception

- [ ] Email reçu
- [ ] Email en **boîte de réception** (PAS dans SPAM)
- [ ] Temps de réception < 2 minutes

#### 3. Vérifier les Headers Email

**Gmail:**
1. Ouvrir l'email
2. Cliquer sur les 3 points (⋮)
3. **Afficher l'original**

**Rechercher ces lignes:**
```
Authentication-Results: ...
  spf=pass
  dkim=pass
  dmarc=pass
```

**Checklist:**
- [ ] `spf=pass` ✅
- [ ] `dkim=pass` ✅
- [ ] `dmarc=pass` ✅

#### 4. Outils de Vérification en Ligne

Testez sur ces sites:

**SPF:**
- https://mxtoolbox.com/spf.aspx
- Entrez: `symphonia-controltower.com`
- Résultat attendu: ✅ **SPF Record Published**

**DKIM:**
- https://mxtoolbox.com/dkim.aspx
- Sélecteur: `default`
- Domaine: `symphonia-controltower.com`
- Résultat attendu: ✅ **DKIM Record Published**

**DMARC:**
- https://mxtoolbox.com/dmarc.aspx
- Entrez: `symphonia-controltower.com`
- Résultat attendu: ✅ **DMARC Record Published**

### ✅ Marquer comme complété

- [ ] Email de test envoyé
- [ ] Email reçu en boîte de réception
- [ ] Headers vérifiés (spf/dkim/dmarc = pass)
- [ ] Tests en ligne réussis (mxtoolbox.com)

---

## 📊 Résumé Visual du Progrès

```
CONFIGURATION DNS - PROGRESSION
═══════════════════════════════════════════════════════════

[ ] SPF         Configuration rapide (5 min)
    ↓
[ ] DKIM        Activation et DNS (10 min)
    ↓
[ ] DMARC       Configuration finale (5 min)
    ↓
    ⏰ ATTENDRE 24-48H pour propagation complète
    ↓
[ ] TEST        Vérification délivrabilité
    ↓
✅ TERMINÉ      Emails arrivent en boîte de réception !

═══════════════════════════════════════════════════════════
```

---

## 🎯 Résultats Attendus

### Avant Configuration DNS
```
📧 Email envoyé
   ↓
   70% → 📪 Dossier SPAM
   20% → 📫 Boîte de réception
   10% → ❌ Rejeté
```

### Après Configuration DNS (24-48h)
```
📧 Email envoyé
   ↓
   90% → ✅ Boîte de réception
   8%  → 📪 Dossier SPAM
   2%  → ❌ Rejeté
```

---

## 💡 Conseils Importants

### ⏰ Timing

| Configuration | Temps Action | Temps Propagation | Temps Total |
|---------------|--------------|-------------------|-------------|
| SPF | 5 min | 1-2 heures | ~2 heures |
| DKIM | 10 min | 24-48 heures | ~48 heures |
| DMARC | 5 min | 1-2 heures | ~2 heures |

**⚠️ N'oubliez pas:** DKIM prend jusqu'à 48h pour être complètement actif

### ✅ Bonnes Pratiques

1. **Configurez les 3 en même temps** (SPF + DKIM + DMARC)
2. **Attendez 48h** avant de tester la délivrabilité
3. **Testez d'abord** avec quelques emails (10-20)
4. **Augmentez progressivement** le volume d'envoi
5. **Surveillez les rapports DMARC** quotidiens

### ⚠️ À Éviter

- ❌ Ne modifiez pas les enregistrements DNS existants sans backup
- ❌ Ne testez pas avec un volume élevé immédiatement après configuration
- ❌ N'utilisez pas `p=reject` en DMARC au début (utilisez `p=quarantine`)
- ❌ Ne configurez pas plusieurs enregistrements SPF (un seul suffit)

---

## 📞 Support

### Problèmes Courants

| Problème | Solution Rapide |
|----------|-----------------|
| SPF ne fonctionne pas | Vérifiez la syntaxe exacte: `v=spf1 include:mx.ovh.net ~all` |
| DKIM reste inactif | Attendez 48h, puis contactez support OVH |
| DMARC non reconnu | Vérifiez le nom: `_dmarc` (avec underscore) |
| Emails toujours en SPAM | Attendez 1 semaine pour construction de réputation |

### Besoin d'Aide ?

Consultez le guide complet : [GUIDE_CONFIGURATION_DNS.md](GUIDE_CONFIGURATION_DNS.md)

---

## ✅ Checklist Finale Complète

### Configuration Technique
- [ ] SPF configuré et vérifié
- [ ] DKIM activé sur OVH
- [ ] DKIM enregistrements DNS ajoutés
- [ ] DMARC configuré et vérifié
- [ ] Propagation DNS complète (48h)

### Tests de Validation
- [ ] Email de test envoyé
- [ ] Email reçu en boîte de réception (pas SPAM)
- [ ] Headers vérifiés: spf=pass, dkim=pass, dmarc=pass
- [ ] Tests mxtoolbox.com réussis

### Monitoring
- [ ] Rapports DMARC configurés (admin@symphonia-controltower.com)
- [ ] Premier rapport DMARC reçu
- [ ] Surveillance continue active

---

**Status:** En attente de configuration
**Priorité:** 🔴 Haute - Configuration recommandée dans les 48h
**Impact:** Améliore la délivrabilité de 70% à 95%

---

🌐 **Suivez ces étapes pour garantir que vos emails arrivent toujours en boîte de réception !**
