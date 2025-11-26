# 📋 Template Enregistrements DNS - symphonia-controltower.com

**Date:** 26 Novembre 2025
**Domaine:** symphonia-controltower.com
**Usage:** Copier-coller dans votre gestionnaire DNS

---

## 🎯 Instructions

1. Connectez-vous à votre gestionnaire DNS (OVH, Cloudflare, AWS Route 53, etc.)
2. Accédez à la zone DNS de **symphonia-controltower.com**
3. Copiez-collez les enregistrements ci-dessous
4. Sauvegardez les modifications
5. Attendez 1-48h pour la propagation
6. Vérifiez avec `node scripts/verifier-dns.js`

---

## 📝 Enregistrements à Ajouter

### 1️⃣ SPF (Sender Policy Framework)

```
┌─────────────────────────────────────────────────────────┐
│  ENREGISTREMENT SPF                                     │
└─────────────────────────────────────────────────────────┘

Type:     TXT
Nom:      @
Valeur:   v=spf1 include:mx.ovh.net ~all
TTL:      3600

───────────────────────────────────────────────────────────
```

#### 💡 Formats selon votre hébergeur

**OVH Manager:**
```
Type DNS:     TXT
Sous-domaine: [laisser vide ou @]
Cible:        v=spf1 include:mx.ovh.net ~all
```

**Cloudflare:**
```
Type:    TXT
Name:    @
Content: v=spf1 include:mx.ovh.net ~all
TTL:     Auto
```

**AWS Route 53:**
```
Record name:  [laisser vide]
Record type:  TXT
Value:        "v=spf1 include:mx.ovh.net ~all"
TTL:          3600
```

**Google Domains:**
```
Host name:    @
Type:         TXT
TTL:          3600
Data:         v=spf1 include:mx.ovh.net ~all
```

#### ✅ Vérification

Après 1-2 heures, vérifiez avec:
```bash
nslookup -type=txt symphonia-controltower.com
```

Résultat attendu:
```
symphonia-controltower.com text = "v=spf1 include:mx.ovh.net ~all"
```

---

### 2️⃣ DKIM (DomainKeys Identified Mail)

```
┌─────────────────────────────────────────────────────────┐
│  ENREGISTREMENT DKIM                                    │
└─────────────────────────────────────────────────────────┘

⚠️  IMPORTANT: Les valeurs DKIM sont fournies par OVH
    après activation dans l'espace client.

Étape 1: Activer DKIM sur OVH
──────────────────────────────────────────────────────────
1. https://www.ovh.com/manager/
2. Web Cloud → Emails
3. Sélectionner: symphonia-controltower.com
4. Section DKIM
5. Cliquer: Activer DKIM

Étape 2: Récupérer les enregistrements
──────────────────────────────────────────────────────────
OVH va vous fournir 1-3 enregistrements DNS.

Exemple d'enregistrement fourni:
──────────────────────────────────────────────────────────
Type:     TXT ou CNAME
Nom:      default._domainkey
Valeur:   v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4...
TTL:      3600

⚠️  COPIEZ EXACTEMENT les valeurs fournies par OVH

Étape 3: Ajouter dans votre zone DNS
──────────────────────────────────────────────────────────
Ajoutez les enregistrements fournis par OVH dans votre
gestionnaire DNS.
```

#### 💡 Si DNS chez OVH

Les enregistrements DKIM sont souvent ajoutés **automatiquement**.
Vérifiez dans: Zone DNS → Rechercher "_domainkey"

#### 💡 Si DNS ailleurs (Cloudflare, AWS, etc.)

Ajoutez **manuellement** chaque enregistrement fourni par OVH:

**Format général:**
```
Type:    TXT (ou CNAME selon OVH)
Name:    default._domainkey.symphonia-controltower.com
Content: [valeur fournie par OVH]
TTL:     3600
```

#### ✅ Vérification

Après 24-48 heures, vérifiez:

**Via OVH Manager:**
- Emails → symphonia-controltower.com → DKIM
- Status doit être: ✅ Actif

**Via ligne de commande:**
```bash
nslookup -type=txt default._domainkey.symphonia-controltower.com
```

---

### 3️⃣ DMARC (Domain-based Message Authentication)

```
┌─────────────────────────────────────────────────────────┐
│  ENREGISTREMENT DMARC                                   │
└─────────────────────────────────────────────────────────┘

Type:     TXT
Nom:      _dmarc
Valeur:   v=DMARC1; p=quarantine; rua=mailto:admin@symphonia-controltower.com; pct=100
TTL:      3600

───────────────────────────────────────────────────────────
```

#### 💡 Formats selon votre hébergeur

**OVH Manager:**
```
Type DNS:     TXT
Sous-domaine: _dmarc
Cible:        v=DMARC1; p=quarantine; rua=mailto:admin@symphonia-controltower.com; pct=100
```

**Cloudflare:**
```
Type:    TXT
Name:    _dmarc
Content: v=DMARC1; p=quarantine; rua=mailto:admin@symphonia-controltower.com; pct=100
TTL:     Auto
```

**AWS Route 53:**
```
Record name:  _dmarc
Record type:  TXT
Value:        "v=DMARC1; p=quarantine; rua=mailto:admin@symphonia-controltower.com; pct=100"
TTL:          3600
```

**Google Domains:**
```
Host name:    _dmarc
Type:         TXT
TTL:          3600
Data:         v=DMARC1; p=quarantine; rua=mailto:admin@symphonia-controltower.com; pct=100
```

#### 💡 Variantes de DMARC

**Version Complète (Recommandée):**
```
v=DMARC1; p=quarantine; rua=mailto:admin@symphonia-controltower.com; ruf=mailto:admin@symphonia-controltower.com; pct=100; adkim=r; aspf=r
```

**Version Minimale (Si problèmes):**
```
v=DMARC1; p=none; rua=mailto:admin@symphonia-controltower.com
```

**Version Stricte (Pour experts):**
```
v=DMARC1; p=reject; rua=mailto:admin@symphonia-controltower.com; pct=100
```

#### ✅ Vérification

Après 1-2 heures, vérifiez avec:
```bash
nslookup -type=txt _dmarc.symphonia-controltower.com
```

Résultat attendu:
```
_dmarc.symphonia-controltower.com text = "v=DMARC1; p=quarantine; rua=mailto:admin@symphonia-controltower.com..."
```

---

## ✅ Checklist de Configuration

### Avant Configuration
- [ ] Compte OVH avec accès aux emails
- [ ] Accès au gestionnaire DNS
- [ ] Email admin@symphonia-controltower.com créé (pour rapports DMARC)

### Configuration SPF
- [ ] Enregistrement TXT créé (Type: TXT, Nom: @)
- [ ] Valeur copiée: `v=spf1 include:mx.ovh.net ~all`
- [ ] Sauvegardé
- [ ] Vérifié après 1-2h (nslookup)

### Configuration DKIM
- [ ] DKIM activé dans espace client OVH
- [ ] Enregistrements DNS récupérés depuis OVH
- [ ] Enregistrements ajoutés dans zone DNS
- [ ] Sauvegardé
- [ ] Vérifié après 24-48h (OVH Manager → Status: Actif)

### Configuration DMARC
- [ ] Enregistrement TXT créé (Type: TXT, Nom: _dmarc)
- [ ] Valeur copiée avec bon email de rapports
- [ ] Sauvegardé
- [ ] Vérifié après 1-2h (nslookup)

### Vérification Finale
- [ ] Script de vérification exécuté: `node scripts/verifier-dns.js`
- [ ] Score 3/3 obtenu
- [ ] Test mxtoolbox.com effectué (SPF, DKIM, DMARC)
- [ ] Test email envoyé (arrive en boîte de réception)

---

## 🧪 Tests de Vérification

### 1. Script Automatique

```bash
node scripts/verifier-dns.js
```

**Résultat attendu:**
```
✅ SPF:   SPF configuré correctement pour OVH
✅ DKIM:  DKIM configuré (sélecteur: default)
✅ DMARC: DMARC configuré correctement

Score: 3/3 configurations valides

🎉 EXCELLENT ! Toutes les configurations DNS sont valides.
```

### 2. Outils en Ligne

**MXToolbox:**
```
SPF:   https://mxtoolbox.com/spf.aspx?domain=symphonia-controltower.com
DKIM:  https://mxtoolbox.com/dkim.aspx?domain=symphonia-controltower.com
       (Sélecteur: default)
DMARC: https://mxtoolbox.com/dmarc.aspx?domain=symphonia-controltower.com
```

**Résultats attendus:**
- ✅ SPF Record Published
- ✅ DKIM Record Published
- ✅ DMARC Record Published

### 3. Test Email Réel

Envoyez un email via votre système:

```bash
curl -X POST http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/carriers/invite \
  -H "Content-Type: application/json" \
  -d '{
    "email": "votre-email@gmail.com",
    "companyName": "Test DNS",
    "siret": "11111111111111",
    "invitedBy": "Admin",
    "referenceMode": "direct"
  }'
```

**Vérifications:**
1. Email reçu dans les 2 minutes
2. Email en **boîte de réception** (PAS en SPAM)
3. Headers email contiennent:
   - `spf=pass`
   - `dkim=pass`
   - `dmarc=pass`

---

## ⏰ Timeline de Propagation

| Configuration | Temps Action | Temps Propagation | Total |
|---------------|--------------|-------------------|-------|
| **SPF** | 2 min | 1-2 heures | ~2h |
| **DKIM** | 5 min | 24-48 heures | ~48h |
| **DMARC** | 2 min | 1-2 heures | ~2h |

**⚠️ Important:** DKIM est le plus long (24-48h). Configurez-le en premier !

---

## 📊 Impact Attendu

### Avant Configuration DNS
```
📧 100 emails envoyés
   ├─ 20 en boîte de réception (20%)
   ├─ 70 en SPAM (70%)
   └─ 10 rejetés (10%)

Réputation: ❌ Faible
Conformité: ❌ Non
```

### Après Configuration DNS (48h)
```
📧 100 emails envoyés
   ├─ 92 en boîte de réception (92%)
   ├─ 6 en SPAM (6%)
   └─ 2 rejetés (2%)

Réputation: ✅ Bonne
Conformité: ✅ Oui
```

**Amélioration:** +360% de délivrabilité en boîte de réception ! 🔥

---

## 🆘 Aide et Support

### Problèmes Courants

**SPF ne fonctionne pas**
→ Vérifiez qu'il n'y a qu'un seul enregistrement TXT SPF
→ Respectez exactement la syntaxe: `v=spf1 include:mx.ovh.net ~all`

**DKIM reste inactif après 48h**
→ Contactez le support OVH
→ Vérifiez que les enregistrements DNS sont bien ajoutés

**DMARC non reconnu**
→ Vérifiez le nom: `_dmarc` (avec underscore _)
→ Vérifiez qu'il n'y a pas d'espace dans la valeur

### Documentation

- **Guide étape par étape:** [CONFIGURATION_DNS_ETAPES.md](CONFIGURATION_DNS_ETAPES.md)
- **Guide complet:** [GUIDE_CONFIGURATION_DNS.md](GUIDE_CONFIGURATION_DNS.md)
- **Script de vérification:** `scripts/verifier-dns.js`

### Support OVH

- **Espace client:** https://www.ovh.com/manager/
- **Documentation DKIM:** https://docs.ovh.com/fr/emails/activer-dkim/
- **Support:** Via l'espace client OVH

---

**Version:** v3.1.0-with-emails
**Domaine:** symphonia-controltower.com
**Date:** 26 Novembre 2025

---

📋 **Utilisez ce template pour configurer rapidement et sans erreur vos DNS !**
