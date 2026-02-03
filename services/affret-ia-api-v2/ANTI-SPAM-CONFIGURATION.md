# Configuration Anti-Spam pour AWS SES

## Problème : Emails en SPAM

Les emails AWS SES arrivent en spam pour plusieurs raisons :

### ✅ Solutions Immédiates

---

## 1. Vérifier Configuration DNS du Domaine

### A. SPF (Sender Policy Framework)

**Action** : Ajouter enregistrement TXT sur `symphonia-controltower.com`

```dns
Type: TXT
Name: @ (ou symphonia-controltower.com)
Value: v=spf1 include:amazonses.com ~all
TTL: 3600
```

**Vérifier** :
```bash
nslookup -type=TXT symphonia-controltower.com
```

---

### B. DKIM (DomainKeys Identified Mail)

**Action** : Activer DKIM dans AWS SES Console

1. Aller sur : https://console.aws.amazon.com/ses/home?region=eu-central-1#verified-senders-domain:
2. Sélectionner `symphonia-controltower.com`
3. Onglet **DKIM**
4. Cliquer **Enable DKIM**
5. Copier les 3 enregistrements CNAME générés

**Ajouter dans DNS** :
```dns
Type: CNAME
Name: xxx._domainkey.symphonia-controltower.com
Value: xxx.dkim.amazonses.com

Type: CNAME
Name: yyy._domainkey.symphonia-controltower.com
Value: yyy.dkim.amazonses.com

Type: CNAME
Name: zzz._domainkey.symphonia-controltower.com
Value: zzz.dkim.amazonses.com
```

**Attendre** : 24-48h pour propagation DNS

---

### C. DMARC (Domain-based Message Authentication)

**Action** : Ajouter enregistrement TXT

```dns
Type: TXT
Name: _dmarc.symphonia-controltower.com
Value: v=DMARC1; p=none; rua=mailto:dmarc-reports@symphonia-controltower.com
TTL: 3600
```

**Politique progressive** :
- **Phase 1 (actuel)** : `p=none` → Monitoring uniquement
- **Phase 2 (après 2 semaines)** : `p=quarantine` → Mettre en spam si échec
- **Phase 3 (après 1 mois)** : `p=reject` → Rejeter si échec

---

## 2. Améliorer le Contenu de l'Email

### A. Mots Déclencheurs de SPAM à Éviter

❌ **Éviter dans sujet et contenu** :
- "GRATUIT", "OFFERT", "SANS COMMISSION"
- "URGENT", "EXCLUSIF", "LIMITÉ"
- Trop de majuscules
- Trop de points d'exclamation !!!
- "Cliquez ici", "Agissez maintenant"

✅ **Remplacer par** :
- "Offre de bienvenue" au lieu de "GRATUIT"
- "Nouveau" au lieu de "URGENT"
- Utiliser un ton professionnel B2B

### B. Ratio Texte/HTML

**Problème actuel** : 100% HTML, 0% texte brut

**Solution** : Ajouter version texte

Je vais modifier le service pour inclure une version texte :

---

## 3. Warm-Up du Domaine

### Problème : Nouveau domaine = pas de réputation

**Solution** : Augmenter progressivement le volume d'envoi

| Jour | Volume | Action |
|------|--------|--------|
| **Jour 1** | 10 emails | Test à des adresses connues |
| **Jour 2** | 20 emails | Augmentation progressive |
| **Jour 3** | 50 emails | Vérifier taux d'ouverture |
| **Jour 4** | 100 emails | Analyser bounces |
| **Jour 5-7** | 200 emails | Stabilisation |
| **Semaine 2** | 500 emails | Volume nominal |

**Règle d'or** : Ne JAMAIS envoyer > 200 emails/jour les 7 premiers jours

---

## 4. Ajouter Lien de Désinscription Clair

### Requis par AWS SES

**Action** : Ajouter en footer de chaque email

```html
<p style="font-size: 11px; color: #999;">
  Vous recevez cet email car vous avez réalisé des transports avec nos partenaires.
  <a href="https://transporteur.symphonia-controltower.com/unsubscribe?email={{EMAIL}}"
     style="color: #667eea;">
    Se désinscrire
  </a>
</p>
```

---

## 5. Vérifier Réputation IP AWS SES

**Action** : Vérifier sur AWS Console

```bash
# Via AWS CLI
aws ses get-account-sending-enabled --region eu-central-1
```

**Métriques à surveiller** :
- **Bounce rate < 5%** (taux de rebond)
- **Complaint rate < 0.1%** (signalements spam)
- **Open rate > 20%** (taux d'ouverture)

---

## 6. Utiliser Custom MAIL FROM Domain

### Problème Actuel

Emails envoyés depuis : `affret-ia@symphonia-controltower.com`
Mais **MAIL FROM** = `amazonses.com` → déclencheur de spam

### Solution

**Configurer Custom MAIL FROM** :

1. AWS SES Console → Verified identities
2. Sélectionner `symphonia-controltower.com`
3. Onglet **Custom MAIL FROM domain**
4. Entrer : `mail.symphonia-controltower.com`
5. Copier enregistrements MX et TXT

**Ajouter dans DNS** :
```dns
Type: MX
Name: mail.symphonia-controltower.com
Value: 10 feedback-smtp.eu-central-1.amazonses.com
Priority: 10

Type: TXT
Name: mail.symphonia-controltower.com
Value: v=spf1 include:amazonses.com ~all
```

---

## 7. Tests Spam Score

### A. Tester avec Mail-Tester

**Action** :
1. Envoyer email test à : `test-XXXXX@mail-tester.com`
2. Aller sur : https://www.mail-tester.com
3. Analyser le score

**Objectif** : Score > 8/10

### B. Tester avec GlockApps

**URL** : https://glockapps.com/spam-testing/

**Test** : Vérifier délivrabilité sur Gmail, Outlook, Yahoo

---

## 8. Checklist Anti-Spam

### Configuration DNS (Critique)
- [ ] SPF ajouté sur domaine principal
- [ ] DKIM activé et configuré (3 CNAME)
- [ ] DMARC configuré (monitoring)
- [ ] Custom MAIL FROM configuré (MX + TXT)
- [ ] DNS propagés (vérifier avec `dig` ou `nslookup`)

### Contenu Email
- [ ] Version texte brut incluse
- [ ] Lien de désinscription visible en footer
- [ ] Pas de mots déclencheurs de spam
- [ ] Ratio texte/images > 60/40
- [ ] Sujet < 50 caractères
- [ ] Expéditeur cohérent avec domaine

### Réputation
- [ ] Warm-up progressif (10 → 200 emails sur 7 jours)
- [ ] Bounce rate < 5%
- [ ] Complaint rate < 0.1%
- [ ] IP dédiée (si volume > 1000 emails/jour)

### Conformité
- [ ] Adresse physique dans footer
- [ ] Mention RGPD si applicable
- [ ] Consentement opt-in (B2B relation existante OK)

---

## 9. Script de Vérification DNS

**Créer** : `scripts/check-dns-antispam.sh`

```bash
#!/bin/bash

DOMAIN="symphonia-controltower.com"

echo "==================================================="
echo "  VÉRIFICATION DNS ANTI-SPAM - $DOMAIN"
echo "==================================================="
echo ""

# SPF
echo "1. SPF Record:"
dig TXT $DOMAIN +short | grep "v=spf1"
echo ""

# DKIM (remplacer par les vrais selectors)
echo "2. DKIM Records:"
dig TXT _domainkey.$DOMAIN +short
echo ""

# DMARC
echo "3. DMARC Record:"
dig TXT _dmarc.$DOMAIN +short
echo ""

# MX (Custom MAIL FROM)
echo "4. Custom MAIL FROM MX:"
dig MX mail.$DOMAIN +short
echo ""

echo "==================================================="
echo "  FIN VÉRIFICATION"
echo "==================================================="
```

**Exécuter** :
```bash
chmod +x scripts/check-dns-antispam.sh
./scripts/check-dns-antispam.sh
```

---

## 10. Actions Immédiates MAINTENANT

### Étape 1 : Vérifier DNS Actuel

```bash
# SPF
nslookup -type=TXT symphonia-controltower.com

# DKIM
nslookup -type=CNAME xxx._domainkey.symphonia-controltower.com

# DMARC
nslookup -type=TXT _dmarc.symphonia-controltower.com
```

### Étape 2 : Si DNS Manquants

**Contacter** : Responsable DNS / Administrateur système

**Demander** :
1. Ajouter SPF : `v=spf1 include:amazonses.com ~all`
2. Activer DKIM dans AWS SES Console
3. Ajouter les 3 CNAME DKIM fournis par AWS
4. Ajouter DMARC : `v=DMARC1; p=none; rua=mailto:dmarc@symphonia-controltower.com`

### Étape 3 : Pendant Attente DNS (24-48h)

**Envoyer uniquement à** :
- Adresses internes (@symphonia-controltower.com)
- Contacts ayant déjà une relation commerciale
- Whitelist email test (r.tardy@rt-groupe.com)

**Volume limité** : Max 10 emails/jour

### Étape 4 : Après Propagation DNS

**Tester** :
1. Mail-tester.com → Score > 8/10
2. Envoyer 10 emails test à différents fournisseurs (Gmail, Outlook, Yahoo)
3. Vérifier arrivée en boîte principale (pas spam)

**Si OK** :
- Lancer warm-up (10 → 200 emails sur 7 jours)
- Campagne complète après 7 jours

---

## Support

**AWS SES Support** :
- https://console.aws.amazon.com/support/home

**Vérifier réputation domaine** :
- https://www.senderscore.org/
- https://talosintelligence.com/reputation_center

**Tester emails** :
- https://www.mail-tester.com
- https://mxtoolbox.com/emailhealth/

---

**Auteur** : Claude Sonnet 4.5
**Date** : 2026-02-03
**Version** : 1.0
