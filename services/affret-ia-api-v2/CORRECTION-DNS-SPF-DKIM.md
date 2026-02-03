# Correction DNS pour Sortir du SPAM

## État Actuel

### ✅ Ce qui est déjà configuré :

```dns
# SPF actuel (INCOMPLET)
v=spf1 include:mx.ovh.com include:spf.protection.outlook.com ~all

# DMARC (OK)
v=DMARC1; p=none; sp=none; rua=mailto:support@symphonia-controltower.com
```

### ❌ Ce qui MANQUE :
- **AWS SES** n'est pas inclus dans le SPF
- **DKIM** n'est pas configuré

---

## 🔧 ACTION 1 : Modifier le SPF (URGENT)

### Enregistrement DNS à Modifier

**Type** : TXT
**Nom** : `symphonia-controltower.com` (ou `@`)
**TTL** : 3600

**ANCIENNE valeur** :
```
v=spf1 include:mx.ovh.com include:spf.protection.outlook.com ~all
```

**NOUVELLE valeur** :
```
v=spf1 include:mx.ovh.com include:spf.protection.outlook.com include:amazonses.com ~all
```

### Où modifier ?

1. **Si hébergé chez OVH** :
   - Se connecter à https://www.ovh.com/manager/
   - Aller dans **Web Cloud** → **Noms de domaine**
   - Sélectionner `symphonia-controltower.com`
   - Onglet **Zone DNS**
   - Chercher l'enregistrement TXT avec SPF
   - Cliquer sur **Modifier**
   - Ajouter `include:amazonses.com` avant `~all`
   - Sauvegarder

2. **Si hébergé chez CloudFlare** :
   - Dashboard CloudFlare
   - Sélectionner domaine
   - Section **DNS**
   - Modifier enregistrement TXT SPF
   - Ajouter `include:amazonses.com`

3. **Autre hébergeur** :
   - Accéder au panneau de gestion DNS
   - Modifier l'enregistrement TXT SPF
   - Ajouter `include:amazonses.com` avant `~all`

### Vérification après modification

Attendre **10-15 minutes** puis vérifier :

```bash
# PowerShell
nslookup -type=TXT symphonia-controltower.com

# Résultat attendu :
# v=spf1 include:mx.ovh.com include:spf.protection.outlook.com include:amazonses.com ~all
```

---

## 🔐 ACTION 2 : Activer DKIM dans AWS SES

### Étape 1 : Vérifier/Ajouter le Domaine dans SES

1. **Aller sur AWS SES Console** :
   ```
   https://console.aws.amazon.com/ses/home?region=eu-central-1#verified-senders-domain:
   ```

2. **Vérifier si le domaine existe** :
   - Chercher `symphonia-controltower.com` dans la liste
   - Si présent → Passer à l'étape 2
   - Si absent → Cliquer **Create identity**

3. **Si création nécessaire** :
   - **Identity type** : Domain
   - **Domain** : `symphonia-controltower.com`
   - ✅ Cocher **Use a default DKIM signing key**
   - Cliquer **Create identity**

### Étape 2 : Activer DKIM

1. **Cliquer sur le domaine** `symphonia-controltower.com`

2. **Onglet "DKIM"** (ou "Authentication")

3. **Cliquer sur "Enable DKIM"** (si pas déjà activé)

4. **AWS va générer 3 enregistrements CNAME**

   Exemple (vos valeurs seront différentes) :
   ```
   Name: abcdef123456._domainkey.symphonia-controltower.com
   Value: abcdef123456.dkim.amazonses.com

   Name: ghijkl789012._domainkey.symphonia-controltower.com
   Value: ghijkl789012.dkim.amazonses.com

   Name: mnopqr345678._domainkey.symphonia-controltower.com
   Value: mnopqr345678.dkim.amazonses.com
   ```

5. **Copier ces 3 enregistrements**

### Étape 3 : Ajouter les CNAME DKIM dans votre DNS

**Pour chaque enregistrement CNAME** (3 au total) :

**Type** : CNAME
**Nom** : `xxx._domainkey.symphonia-controltower.com` (fourni par AWS)
**Valeur** : `xxx.dkim.amazonses.com` (fourni par AWS)
**TTL** : 3600

#### Exemple OVH :
1. Se connecter au manager OVH
2. Zone DNS de `symphonia-controltower.com`
3. **Ajouter une entrée** → Type **CNAME**
4. **Sous-domaine** : `xxx._domainkey` (sans le .symphonia-controltower.com)
5. **Cible** : `xxx.dkim.amazonses.com`
6. Répéter pour les 3 enregistrements

#### Exemple CloudFlare :
1. Dashboard DNS
2. **Add record**
3. Type : **CNAME**
4. Name : `xxx._domainkey` (juste le préfixe)
5. Target : `xxx.dkim.amazonses.com`
6. Proxy status : **DNS only** (gris)
7. Répéter 3 fois

### Étape 4 : Vérifier DKIM

**Attendre 30-60 minutes** après ajout des CNAME, puis :

1. Retourner dans AWS SES Console
2. Vérifier le domaine `symphonia-controltower.com`
3. **Status** devrait passer à **Verified** (✓)
4. **DKIM** devrait afficher **Successful** ou **Enabled**

**Vérification manuelle** :
```bash
# PowerShell
nslookup -type=CNAME xxx._domainkey.symphonia-controltower.com

# Doit retourner : xxx.dkim.amazonses.com
```

---

## 📋 Récapitulatif des Modifications DNS

| Type | Nom | Valeur | TTL | Action |
|------|-----|--------|-----|--------|
| **TXT** | `@` ou domaine | `v=spf1 include:mx.ovh.com include:spf.protection.outlook.com include:amazonses.com ~all` | 3600 | **Modifier** |
| **CNAME** | `xxx._domainkey` | `xxx.dkim.amazonses.com` | 3600 | **Ajouter** |
| **CNAME** | `yyy._domainkey` | `yyy.dkim.amazonses.com` | 3600 | **Ajouter** |
| **CNAME** | `zzz._domainkey` | `zzz.dkim.amazonses.com` | 3600 | **Ajouter** |

---

## ⏱️ Temps de Propagation

| Modification | Délai |
|--------------|-------|
| **SPF (modification)** | 10-30 minutes |
| **DKIM CNAME (création)** | 30-60 minutes |
| **Vérification AWS SES** | Jusqu'à 72h (généralement < 2h) |

---

## ✅ Vérification Finale

### Script de Vérification PowerShell

```powershell
# Vérifier SPF
Write-Host "=== SPF ===" -ForegroundColor Cyan
$spf = Resolve-DnsName -Name symphonia-controltower.com -Type TXT | Where-Object { $_.Strings -like "*v=spf1*" }
if ($spf.Strings -like "*amazonses.com*") {
    Write-Host "✅ SPF inclut amazonses.com" -ForegroundColor Green
} else {
    Write-Host "❌ SPF ne contient PAS amazonses.com" -ForegroundColor Red
}
Write-Host ""

# Vérifier DMARC
Write-Host "=== DMARC ===" -ForegroundColor Cyan
$dmarc = Resolve-DnsName -Name _dmarc.symphonia-controltower.com -Type TXT -ErrorAction SilentlyContinue
if ($dmarc) {
    Write-Host "✅ DMARC configuré" -ForegroundColor Green
} else {
    Write-Host "❌ DMARC manquant" -ForegroundColor Red
}
Write-Host ""

# Note : Pour DKIM, utiliser les selectors fournis par AWS SES
Write-Host "=== DKIM ===" -ForegroundColor Cyan
Write-Host "⚠️  Vérifier dans AWS SES Console que DKIM = Verified" -ForegroundColor Yellow
```

### Test sur Mail-Tester

Une fois SPF + DKIM configurés (attendre 1h) :

1. Générer une adresse de test sur https://www.mail-tester.com
2. Envoyer un email de test à cette adresse
3. Vérifier le score (objectif : **> 8/10**)

**Script test** :
```bash
# Depuis le projet
cd "c:\Users\rtard\dossier symphonia\rt-backend-services\services\affret-ia-api-v2"

# Remplacer test-XXXXX@mail-tester.com par l'adresse générée
node -e "
const DashdocCarrierInvitationService = require('./services/dashdoc-carrier-invitation.service');
DashdocCarrierInvitationService.sendInvitationToKnownCarrier({
  carrierName: 'TEST',
  carrierEmail: 'test-XXXXX@mail-tester.com',
  carrierContact: { firstName: 'Test', lastName: 'User' },
  totalTransports: 10,
  routes: [],
  avgPrice: 100
}, { dryRun: false });
"
```

---

## 🎯 Résultat Attendu

### Après Configuration Complète

**Score Mail-Tester** : > 8/10

**Vérifications** :
- ✅ SPF : PASS (include amazonses.com)
- ✅ DKIM : PASS (3 signatures valides)
- ✅ DMARC : PASS (politique configurée)
- ✅ Version texte : présente
- ✅ Lien désinscription : présent

**Délivrabilité** :
- Gmail : Boîte principale (pas spam)
- Outlook : Boîte principale
- Yahoo : Boîte principale

---

## 🚨 Si Problèmes Persistent

### 1. SPF Non Reconnu

**Cause** : Propagation DNS lente
**Solution** : Attendre 24h, vérifier avec `nslookup`

### 2. DKIM Status = "Pending"

**Cause** : CNAME pas encore propagés
**Solution** : Attendre 1-2h, vérifier CNAME avec `nslookup`

### 3. Emails Toujours en SPAM

**Cause** : Nouveau domaine = pas de réputation
**Solution** :
- Warm-up progressif (10 → 50 → 100 emails sur 7 jours)
- Attendre 48h après config DNS
- Vérifier sur mail-tester.com

---

## 📞 Support

**AWS SES Support** :
- https://console.aws.amazon.com/support/home

**Vérifier réputation domaine** :
- https://www.senderscore.org/
- https://talosintelligence.com/reputation_center

**Tester DNS** :
- https://mxtoolbox.com/SuperTool.aspx

---

## ✅ Checklist

- [ ] 1. Modifier SPF (ajouter `include:amazonses.com`)
- [ ] 2. Vérifier SPF avec `nslookup` (attendre 15 min)
- [ ] 3. Aller sur AWS SES Console
- [ ] 4. Vérifier/Ajouter domaine `symphonia-controltower.com`
- [ ] 5. Activer DKIM
- [ ] 6. Copier les 3 CNAME générés
- [ ] 7. Ajouter les 3 CNAME dans votre DNS
- [ ] 8. Attendre 1h propagation
- [ ] 9. Vérifier DKIM status = "Verified" dans AWS
- [ ] 10. Tester sur mail-tester.com (score > 8/10)
- [ ] 11. Lancer campagne test (10 emails)
- [ ] 12. Vérifier arrivée en boîte principale (pas spam)

---

**Auteur** : Claude Sonnet 4.5
**Date** : 2026-02-03
**Version** : 1.0
