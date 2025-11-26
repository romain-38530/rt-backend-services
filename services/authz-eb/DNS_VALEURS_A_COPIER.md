# 📋 Valeurs DNS à Copier-Coller

**Domaine:** symphonia-controltower.com
**Date:** 26 Novembre 2025

---

## 🎯 IMPORTANT : 2 Options pour Configurer

### Option 1 : Assistant Interactif (RECOMMANDÉ) ⭐

```bash
node scripts/assistant-dns.js
```

L'assistant vous guide étape par étape et vérifie en temps réel vos configurations.

---

### Option 2 : Configuration Manuelle

Utilisez les valeurs ci-dessous dans votre gestionnaire DNS (OVH Manager).

---

## 📝 ENREGISTREMENT 1/3 : SPF

```
┌────────────────────────────────────────────────────────────┐
│                      ENREGISTREMENT SPF                     │
└────────────────────────────────────────────────────────────┘

Type:        TXT
Nom/Host:    @
Valeur:      v=spf1 include:mx.ovh.net ~all
TTL:         3600

```

**Comment ajouter :**

1. **OVH Manager** → https://www.ovh.com/manager/
2. **Web Cloud** → **Domaines** → **symphonia-controltower.com**
3. **Zone DNS** → **Ajouter une entrée** → **TXT**
4. Sous-domaine: `@` (ou laisser vide)
5. Valeur: `v=spf1 include:mx.ovh.net ~all`
6. **Valider** → **Confirmer**

**Vérifier après 10 minutes :**
```bash
nslookup -type=txt symphonia-controltower.com
```

---

## 🔐 ENREGISTREMENT 2/3 : DKIM

```
┌────────────────────────────────────────────────────────────┐
│                     ENREGISTREMENT DKIM                     │
└────────────────────────────────────────────────────────────┘

⚠️  IMPORTANT: Les valeurs DKIM sont générées par OVH
    après activation dans l'espace client.

VOUS NE POUVEZ PAS COPIER-COLLER UNE VALEUR DKIM ICI.

```

**Étapes pour configurer DKIM :**

### Étape A : Activer DKIM sur OVH (OBLIGATOIRE)

1. **OVH Manager** → https://www.ovh.com/manager/
2. **Web Cloud** → **Emails**
3. Cliquez sur **symphonia-controltower.com**
4. Onglet **DKIM**
5. Cliquez sur **Activer DKIM**

### Étape B : Récupérer les Enregistrements DNS

OVH va générer automatiquement les enregistrements DKIM.

**Si votre DNS est chez OVH :**
- ✅ Les enregistrements sont ajoutés automatiquement
- ✅ Rien à faire manuellement
- ⏰ Attendre 24-48h pour activation

**Si votre DNS est ailleurs (Cloudflare, AWS, etc.) :**
- 📋 OVH affichera les enregistrements à ajouter manuellement
- 📝 Copiez EXACTEMENT les valeurs fournies
- ➕ Ajoutez-les dans votre gestionnaire DNS
- ⏰ Attendre 24-48h pour activation

**Vérifier après 24-48h :**
```bash
nslookup -type=txt default._domainkey.symphonia-controltower.com
```

Ou vérifiez dans **OVH Manager → Emails → DKIM → Status doit être "Actif"**

---

## 🛡️ ENREGISTREMENT 3/3 : DMARC

```
┌────────────────────────────────────────────────────────────┐
│                    ENREGISTREMENT DMARC                     │
└────────────────────────────────────────────────────────────┘

Type:        TXT
Nom/Host:    _dmarc
Valeur:      v=DMARC1; p=quarantine; rua=mailto:admin@symphonia-controltower.com; pct=100
TTL:         3600

```

**Comment ajouter :**

1. **OVH Manager** → **Zone DNS** (même endroit que SPF)
2. **Ajouter une entrée** → **TXT**
3. Sous-domaine: `_dmarc`
4. Valeur: `v=DMARC1; p=quarantine; rua=mailto:admin@symphonia-controltower.com; pct=100`
5. **Valider** → **Confirmer**

⚠️ **IMPORTANT :** Assurez-vous que l'adresse **admin@symphonia-controltower.com** existe
                 pour recevoir les rapports DMARC !

**Vérifier après 10 minutes :**
```bash
nslookup -type=txt _dmarc.symphonia-controltower.com
```

---

## ✅ Checklist Rapide

### Configuration
- [ ] SPF ajouté (Type: TXT, Nom: @)
- [ ] DKIM activé sur OVH Manager
- [ ] DKIM enregistrements DNS ajoutés (si DNS externe)
- [ ] DMARC ajouté (Type: TXT, Nom: _dmarc)
- [ ] Email admin@symphonia-controltower.com créé (pour rapports)

### Vérification Immédiate (10 min après)
- [ ] SPF vérifié avec nslookup
- [ ] DMARC vérifié avec nslookup

### Vérification Différée (24-48h après)
- [ ] DKIM vérifié avec nslookup
- [ ] DKIM status "Actif" dans OVH Manager
- [ ] Test complet avec: `node scripts/test-systeme-complet.js`

---

## 🧪 Commandes de Vérification

### Vérification Complète Automatique
```bash
# Assistant interactif (vérifie en temps réel)
node scripts/assistant-dns.js

# Vérification simple
node scripts/verifier-dns.js

# Test système complet
node scripts/test-systeme-complet.js --send-test-email
```

### Vérifications Manuelles (Windows)

**SPF :**
```cmd
nslookup -type=txt symphonia-controltower.com
```

**DKIM :**
```cmd
nslookup -type=txt default._domainkey.symphonia-controltower.com
```

**DMARC :**
```cmd
nslookup -type=txt _dmarc.symphonia-controltower.com
```

### Vérifications en Ligne

**MXToolbox (Recommandé) :**
- SPF: https://mxtoolbox.com/spf.aspx?domain=symphonia-controltower.com
- DKIM: https://mxtoolbox.com/dkim.aspx?domain=symphonia-controltower.com (Sélecteur: default)
- DMARC: https://mxtoolbox.com/dmarc.aspx?domain=symphonia-controltower.com

---

## ⏰ Timeline de Propagation

| Configuration | Temps d'Action | Propagation DNS | Total | Vérification |
|---------------|----------------|-----------------|-------|--------------|
| **SPF**       | 5 minutes      | 10 min - 2h     | ~2h   | Immédiate    |
| **DKIM**      | 10 minutes     | 24-48 heures    | ~48h  | Après 48h    |
| **DMARC**     | 5 minutes      | 10 min - 2h     | ~2h   | Immédiate    |

**Conseil :** Configurez les 3 en même temps, puis vérifiez :
- SPF et DMARC après 2 heures
- DKIM après 48 heures

---

## 📊 Impact Attendu

### Avant Configuration DNS
```
📧 100 emails envoyés
   ├─ 20 en boîte de réception (20%) ✉️
   ├─ 70 en SPAM (70%) 🚫
   └─ 10 rejetés (10%) ❌

Réputation: ⚠️ Faible
Score DNS: 0/3
```

### Après Configuration DNS (48h)
```
📧 100 emails envoyés
   ├─ 92 en boîte de réception (92%) ✅
   ├─ 6 en SPAM (6%) ⚠️
   └─ 2 rejetés (2%) ❌

Réputation: ✅ Bonne
Score DNS: 3/3
```

**Amélioration : +360% de délivrabilité ! 🔥**

---

## 🆘 Problèmes Courants

### SPF ne fonctionne pas
**Symptôme :** `nslookup` ne trouve pas le SPF après 2h

**Solutions :**
1. Vérifiez qu'il n'y a qu'UN SEUL enregistrement TXT SPF
2. Vérifiez la syntaxe exacte : `v=spf1 include:mx.ovh.net ~all`
3. Vérifiez que le sous-domaine est bien `@` ou vide
4. Attendez encore 1-2 heures (propagation lente parfois)

---

### DKIM reste inactif après 48h
**Symptôme :** Status "En cours" dans OVH Manager

**Solutions :**
1. Vérifiez que DKIM est bien activé dans OVH Manager
2. Si DNS externe : vérifiez que les enregistrements sont bien ajoutés
3. Contactez le support OVH (peut nécessiter intervention manuelle)
4. Vérifiez les logs d'erreur dans OVH Manager

---

### DMARC non reconnu
**Symptôme :** `nslookup` ne trouve pas le DMARC

**Solutions :**
1. Vérifiez le nom : `_dmarc` (avec underscore `_` au début)
2. Vérifiez qu'il n'y a pas d'espace dans la valeur
3. Vérifiez que le type est bien TXT
4. Attendez 1-2 heures pour propagation

---

## 📞 Aide et Support

### Documentation Complète
- **Guide détaillé :** [GUIDE_CONFIGURATION_DNS.md](GUIDE_CONFIGURATION_DNS.md)
- **Guide pas à pas :** [CONFIGURATION_DNS_ETAPES.md](CONFIGURATION_DNS_ETAPES.md)
- **Template complet :** [ENREGISTREMENTS_DNS_TEMPLATE.md](ENREGISTREMENTS_DNS_TEMPLATE.md)

### Scripts d'Aide
```bash
# Assistant interactif (RECOMMANDÉ)
node scripts/assistant-dns.js

# Vérification DNS
node scripts/verifier-dns.js

# Test système complet
node scripts/test-systeme-complet.js
```

### Support OVH
- **Espace client :** https://www.ovh.com/manager/
- **Documentation DKIM :** https://docs.ovh.com/fr/emails/activer-dkim/
- **Support :** Via l'espace client OVH (section Support)

---

## 🎯 Prochaines Étapes Après Configuration DNS

Une fois les 3 enregistrements configurés et vérifiés :

1. **Attendre la propagation complète** (48h pour DKIM)

2. **Tester le système :**
   ```bash
   node scripts/test-systeme-complet.js --send-test-email
   ```

3. **Inviter un transporteur test :**
   ```bash
   curl -X POST http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/carriers/invite \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@example.com",
       "companyName": "Transport Test",
       "siret": "12345678901234",
       "invitedBy": "Admin",
       "referenceMode": "direct"
     }'
   ```

4. **Vérifier la délivrabilité :**
   - Email reçu en boîte de réception (pas SPAM)
   - Headers contiennent : `spf=pass`, `dkim=pass`, `dmarc=pass`

5. **Suivre votre progression :**
   ```bash
   cat TABLEAU_BORD_PROGRESSION.md
   ```

---

**Version:** v3.1.0-with-emails
**Date:** 26 Novembre 2025
**Domaine:** symphonia-controltower.com

---

📋 **Utilisez l'assistant interactif pour être guidé pas à pas !**

```bash
node scripts/assistant-dns.js
```
