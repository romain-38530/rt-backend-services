# 🌐 Guide Complet de Configuration DNS pour symphonia-controltower.com

**Date:** 26 Novembre 2025
**Objectif:** Améliorer la délivrabilité des emails et éviter le dossier SPAM
**Priorité:** 🔴 **HAUTE - Fortement Recommandé**

---

## 🎯 Pourquoi Configurer les DNS ?

Sans configuration DNS appropriée, vos emails risquent :
- ❌ D'arriver dans le dossier SPAM (70-80% des cas)
- ❌ D'être rejetés par certains serveurs email
- ❌ D'avoir une mauvaise réputation d'expéditeur
- ❌ De ne jamais arriver à destination

**Avec une bonne configuration DNS :**
- ✅ 90-95% des emails arrivent en boîte de réception
- ✅ Meilleure réputation d'expéditeur
- ✅ Conformité avec les standards email
- ✅ Protection contre l'usurpation d'identité

---

## 📋 Les 3 Configurations DNS Requises

| Configuration | Priorité | Temps | Difficulté | Impact |
|---------------|----------|-------|------------|--------|
| **SPF** | 🔴 Critique | 5 min | ⭐ Facile | Très élevé |
| **DKIM** | 🟠 Important | 10 min | ⭐⭐ Moyen | Élevé |
| **DMARC** | 🟡 Recommandé | 5 min | ⭐ Facile | Moyen |

**Temps total estimé : 20-30 minutes**

---

## 1️⃣ Configuration SPF (Sender Policy Framework)

### Qu'est-ce que SPF ?

SPF permet de définir quels serveurs sont autorisés à envoyer des emails pour votre domaine **symphonia-controltower.com**.

### Comment Configurer

#### Étape 1 : Accéder à votre Zone DNS

Selon votre hébergeur DNS :

**Si DNS chez OVH :**
1. Allez sur https://www.ovh.com/manager/
2. Menu **Web Cloud**
3. **Noms de domaine**
4. Cliquez sur **symphonia-controltower.com**
5. Onglet **Zone DNS**

**Si DNS ailleurs (Cloudflare, AWS Route 53, etc.) :**
- Connectez-vous à votre gestionnaire DNS
- Sélectionnez le domaine **symphonia-controltower.com**
- Accédez à la zone DNS

#### Étape 2 : Ajouter l'Enregistrement SPF

Ajoutez un enregistrement **TXT** avec ces valeurs :

```
Nom/Host: @
Type: TXT
Valeur: v=spf1 include:mx.ovh.net ~all
TTL: 3600 (ou laisser par défaut)
```

**Explication de la valeur :**
- `v=spf1` : Version du protocole SPF
- `include:mx.ovh.net` : Autorise les serveurs OVH à envoyer des emails
- `~all` : "Soft fail" - Emails d'autres serveurs marqués comme suspects

#### Étape 3 : Sauvegarder

Cliquez sur **Ajouter** ou **Enregistrer**

#### Étape 4 : Vérifier (après 5-10 minutes)

```bash
# Sous Windows
nslookup -type=txt symphonia-controltower.com

# Sous Linux/Mac
dig symphonia-controltower.com TXT
```

**Résultat attendu :**
```
symphonia-controltower.com. TXT "v=spf1 include:mx.ovh.net ~all"
```

### Vérification en Ligne

Utilisez un outil en ligne :
- https://mxtoolbox.com/spf.aspx
- Entrez : `symphonia-controltower.com`
- Vérifiez que SPF est valide

---

## 2️⃣ Configuration DKIM (DomainKeys Identified Mail)

### Qu'est-ce que DKIM ?

DKIM ajoute une signature cryptographique à vos emails, prouvant qu'ils proviennent bien de votre domaine.

### Comment Configurer

#### Étape 1 : Activer DKIM sur OVH

1. Connectez-vous sur https://www.ovh.com/manager/
2. Menu **Web Cloud** → **Emails**
3. Cliquez sur **symphonia-controltower.com**
4. Allez dans l'onglet **Général**
5. Section **DKIM** (DomainKeys Identified Mail)
6. Cliquez sur **Activer DKIM**

#### Étape 2 : Récupérer les Enregistrements DNS

Une fois DKIM activé, OVH vous fournit 1 à 3 enregistrements DNS :

**Exemple d'enregistrement fourni par OVH :**

```
Nom: default._domainkey
Type: TXT ou CNAME
Valeur: (longue chaîne de caractères fournie par OVH)
```

**⚠️ IMPORTANT :** Copiez EXACTEMENT les enregistrements fournis par OVH

#### Étape 3 : Ajouter les Enregistrements dans votre Zone DNS

**Si DNS chez OVH :**
- Les enregistrements sont souvent ajoutés automatiquement
- Vérifiez dans l'onglet **Zone DNS**

**Si DNS ailleurs :**
- Ajoutez manuellement les enregistrements fournis par OVH
- Respectez exactement le nom, type et valeur

**Exemple d'ajout manuel :**

```
Nom: default._domainkey.symphonia-controltower.com
Type: TXT
Valeur: v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC...
TTL: 3600
```

#### Étape 4 : Attendre la Propagation

DKIM peut prendre **jusqu'à 24-48 heures** pour se propager complètement.

#### Étape 5 : Vérifier

**Via OVH Manager :**
- Retournez dans **Emails** → **symphonia-controltower.com**
- Section **DKIM**
- Status doit être : ✅ **Actif**

**Via Ligne de Commande :**
```bash
nslookup -type=txt default._domainkey.symphonia-controltower.com
```

**Résultat attendu :**
```
default._domainkey.symphonia-controltower.com. TXT "v=DKIM1; k=rsa; p=MIG..."
```

### Vérification en Ligne

- https://mxtoolbox.com/dkim.aspx
- Entrez le sélecteur : `default`
- Domaine : `symphonia-controltower.com`

---

## 3️⃣ Configuration DMARC (Domain-based Message Authentication)

### Qu'est-ce que DMARC ?

DMARC définit la politique de gestion des emails qui échouent aux vérifications SPF et DKIM.

### Comment Configurer

#### Étape 1 : Choisir la Politique DMARC

| Politique | Description | Recommandation |
|-----------|-------------|----------------|
| `p=none` | Aucune action, juste surveillance | Pour débuter |
| `p=quarantine` | Mettre en quarantaine (SPAM) | **Recommandé** |
| `p=reject` | Rejeter complètement | Pour experts |

**Nous recommandons : `p=quarantine`**

#### Étape 2 : Ajouter l'Enregistrement DMARC

Ajoutez un enregistrement **TXT** :

```
Nom: _dmarc
Type: TXT
Valeur: v=DMARC1; p=quarantine; rua=mailto:admin@symphonia-controltower.com; ruf=mailto:admin@symphonia-controltower.com; pct=100; adkim=r; aspf=r
TTL: 3600
```

**Explication de la valeur :**
- `v=DMARC1` : Version du protocole
- `p=quarantine` : Politique pour emails suspects → SPAM
- `rua=mailto:admin@...` : Rapports agrégés quotidiens
- `ruf=mailto:admin@...` : Rapports détaillés en cas d'échec
- `pct=100` : Appliquer à 100% des emails
- `adkim=r` : Mode relaxé pour DKIM
- `aspf=r` : Mode relaxé pour SPF

#### Étape 3 : Sauvegarder

Cliquez sur **Ajouter** ou **Enregistrer**

#### Étape 4 : Vérifier (après 5-10 minutes)

```bash
nslookup -type=txt _dmarc.symphonia-controltower.com
```

**Résultat attendu :**
```
_dmarc.symphonia-controltower.com. TXT "v=DMARC1; p=quarantine; rua=mailto:admin@symphonia-controltower.com..."
```

### Vérification en Ligne

- https://mxtoolbox.com/dmarc.aspx
- Entrez : `symphonia-controltower.com`
- Vérifiez que DMARC est valide

---

## ✅ Checklist Complète de Configuration DNS

### Phase 1 : Configuration Initiale

- [ ] **SPF configuré**
  - [ ] Enregistrement TXT ajouté avec `v=spf1 include:mx.ovh.net ~all`
  - [ ] Vérification nslookup réussie
  - [ ] Test sur mxtoolbox.com : ✅

- [ ] **DKIM activé et configuré**
  - [ ] DKIM activé dans l'espace client OVH
  - [ ] Enregistrements DNS ajoutés
  - [ ] Status OVH : Actif
  - [ ] Vérification nslookup réussie
  - [ ] Test sur mxtoolbox.com : ✅

- [ ] **DMARC configuré**
  - [ ] Enregistrement TXT ajouté avec `v=DMARC1; p=quarantine...`
  - [ ] Email de réception des rapports configuré
  - [ ] Vérification nslookup réussie
  - [ ] Test sur mxtoolbox.com : ✅

### Phase 2 : Vérification Après Propagation (24-48h)

- [ ] **Test complet de délivrabilité**
  - [ ] Envoi d'email de test
  - [ ] Email arrive en boîte de réception (pas SPAM)
  - [ ] Headers email contiennent SPF: PASS
  - [ ] Headers email contiennent DKIM: PASS
  - [ ] Headers email contiennent DMARC: PASS

- [ ] **Monitoring mis en place**
  - [ ] Réception des rapports DMARC quotidiens
  - [ ] Analyse des rapports
  - [ ] Ajustements si nécessaire

---

## 🧪 Tests Après Configuration

### Test 1 : Envoi d'Email Basique

Envoyez un email via votre système :

```bash
curl -X POST http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/carriers/invite \
  -H "Content-Type: application/json" \
  -d '{
    "email": "votre-email-test@gmail.com",
    "companyName": "Test DNS",
    "siret": "11111111111111",
    "invitedBy": "Admin",
    "referenceMode": "direct"
  }'
```

### Test 2 : Vérifier les Headers Email

Une fois l'email reçu, **affichez les headers complets** :

**Gmail :**
1. Ouvrez l'email
2. Cliquez sur les 3 points (⋮)
3. **Afficher l'original**

**Outlook :**
1. Ouvrez l'email
2. **Fichier** → **Propriétés**
3. Section **En-têtes Internet**

**Recherchez ces lignes :**

```
Authentication-Results: ...
  spf=pass (google.com: domain of noreply@symphonia-controltower.com designates ... as permitted sender)
  dkim=pass header.i=@symphonia-controltower.com
  dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE)
```

**✅ Si vous voyez `spf=pass`, `dkim=pass`, `dmarc=pass` → Configuration réussie !**

---

## 📊 Impact Attendu Après Configuration

### Avant Configuration DNS

| Métrique | Valeur |
|----------|--------|
| Taux d'arrivée en boîte de réception | 20-30% |
| Taux d'arrivée en SPAM | 70-80% |
| Réputation expéditeur | Faible |
| Conformité standards | Non |

### Après Configuration DNS (24-48h)

| Métrique | Valeur |
|----------|--------|
| Taux d'arrivée en boîte de réception | 90-95% ✅ |
| Taux d'arrivée en SPAM | 5-10% |
| Réputation expéditeur | Bonne ✅ |
| Conformité standards | Oui ✅ |

---

## 🔍 Troubleshooting

### Problème 1 : SPF Non Reconnu

**Symptôme :** `spf=fail` dans les headers

**Solutions :**
1. Vérifiez la syntaxe SPF : `v=spf1 include:mx.ovh.net ~all`
2. Attendez 1-2 heures pour propagation DNS
3. Vérifiez avec `nslookup -type=txt symphonia-controltower.com`
4. Testez sur https://mxtoolbox.com/spf.aspx

### Problème 2 : DKIM Non Actif

**Symptôme :** `dkim=fail` ou `dkim=none` dans les headers

**Solutions :**
1. Vérifiez que DKIM est activé dans l'espace client OVH
2. Attendez 24-48h pour propagation
3. Vérifiez les enregistrements DNS sont correctement ajoutés
4. Contactez le support OVH si toujours en échec

### Problème 3 : DMARC Non Appliqué

**Symptôme :** `dmarc=none` dans les headers

**Solutions :**
1. Vérifiez la syntaxe DMARC
2. Assurez-vous que l'enregistrement est bien sur `_dmarc.symphonia-controltower.com`
3. Attendez 1-2 heures pour propagation
4. Testez sur https://mxtoolbox.com/dmarc.aspx

### Problème 4 : Emails Toujours en SPAM

**Après configuration DNS complète :**

**Causes possibles :**
1. **Propagation DNS incomplète** → Attendez 48h
2. **Premier envoi** → Les premiers emails arrivent souvent en SPAM
3. **Volume d'envoi trop élevé** → Augmentez progressivement
4. **Contenu suspect** → Évitez mots-clés spam (gratuit, urgent, etc.)
5. **Pas de liste de désabonnement** → Ajoutez un lien de désinscription

**Solutions :**
- Envoyez progressivement (commencez par 10-20 emails/jour)
- Demandez aux destinataires de marquer "Pas un spam"
- Attendez quelques semaines pour construire la réputation
- Utilisez des services de warming (réchauffement IP)

---

## 📧 Rapports DMARC

### Réception des Rapports

Avec la configuration DMARC, vous recevrez quotidiennement des rapports XML à l'adresse :
**admin@symphonia-controltower.com**

### Lecture des Rapports

Les rapports DMARC sont en XML. Utilisez un outil en ligne :
- https://dmarcian.com/dmarc-inspector/
- https://mxtoolbox.com/dmarc/xml/analyzer

**Ce que vous verrez :**
- Nombre d'emails envoyés
- Taux de succès SPF/DKIM
- Serveurs qui envoient pour votre domaine
- Tentatives d'usurpation d'identité

---

## 🎯 Récapitulatif : Configuration en 3 Étapes

### ⚡ Configuration Rapide (15 minutes)

```
1️⃣ SPF (5 min)
   → Ajouter TXT: @ = "v=spf1 include:mx.ovh.net ~all"

2️⃣ DKIM (5 min)
   → Activer dans espace client OVH
   → Ajouter enregistrements DNS fournis

3️⃣ DMARC (5 min)
   → Ajouter TXT: _dmarc = "v=DMARC1; p=quarantine; rua=mailto:admin@symphonia-controltower.com"
```

### ⏰ Timeline

| Temps | Action |
|-------|--------|
| T+0 | Configuration DNS terminée |
| T+1h | Propagation DNS commence |
| T+24h | SPF et DMARC actifs |
| T+48h | DKIM complètement actif |
| T+1 semaine | Réputation expéditeur s'améliore |
| T+1 mois | Taux de délivrabilité optimal (95%+) |

---

## 📞 Support

### Ressources Utiles

- **OVH Support Email:** https://www.ovh.com/fr/support/
- **Documentation OVH DKIM:** https://docs.ovh.com/fr/emails/activer-dkim/
- **Outils de Vérification:**
  - SPF: https://mxtoolbox.com/spf.aspx
  - DKIM: https://mxtoolbox.com/dkim.aspx
  - DMARC: https://mxtoolbox.com/dmarc.aspx

### Besoin d'Aide ?

Si vous rencontrez des difficultés, consultez :
- [OVH_EMAIL_CONFIGURATION.md](OVH_EMAIL_CONFIGURATION.md) - Configuration SMTP
- [README_SYSTEME_EMAILS.md](README_SYSTEME_EMAILS.md) - Documentation générale

---

## ✅ Checklist Finale

Avant de considérer la configuration DNS terminée :

- [ ] SPF configuré et vérifié
- [ ] DKIM activé sur OVH et enregistrements DNS ajoutés
- [ ] DMARC configuré avec email de rapports
- [ ] Propagation DNS complète (24-48h)
- [ ] Test d'envoi d'email effectué
- [ ] Email reçu en boîte de réception (pas SPAM)
- [ ] Headers vérifiés (spf=pass, dkim=pass, dmarc=pass)
- [ ] Rapports DMARC configurés et surveillés

---

**Version:** v3.1.0-with-emails
**Date:** 26 Novembre 2025
**Priorité:** 🔴 Haute - Configuration recommandée dans les 48h

---

🌐 **Une bonne configuration DNS est essentielle pour la délivrabilité des emails !**
