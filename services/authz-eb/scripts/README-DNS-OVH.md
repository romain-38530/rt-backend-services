# Scripts de Gestion DNS via API OVH

## Vue d'ensemble

Ces scripts permettent de gérer automatiquement les enregistrements DNS de `symphonia-controltower.com` via l'API OVH, spécifiquement pour la configuration anti-spam des emails envoyés via AWS SES.

---

## Configuration Requise

### 1. Credentials OVH

Les scripts utilisent les variables d'environnement suivantes dans `.env`:

```bash
# API OVH - Configuration DNS automatique
OVH_ENDPOINT=ovh-eu
OVH_APP_KEY=7467b1935c28b05e
OVH_APP_SECRET=5dd42ebb267e3e2b97bbaa57fc8329e5
OVH_CONSUMER_KEY=67ee183f23f404a43d4fc8504f8648b6
```

### 2. Permissions OVH Consumer Key

Le consumer key doit avoir les droits suivants:

- `GET /domain/zone/*`
- `POST /domain/zone/*`
- `PUT /domain/zone/*`
- `DELETE /domain/zone/*`

---

## Scripts Disponibles

### 1. `fix-complete-spf.js` ✨ **RECOMMANDÉ**

**Objectif**: Restaurer le SPF complet avec tous les includes nécessaires

**SPF cible**:
```
v=spf1 include:mx.ovh.com include:spf.protection.outlook.com include:amazonses.com ~all
```

**Utilisation**:
```bash
cd services/authz-eb
node scripts/fix-complete-spf.js
```

**Résultat**:
- Supprime l'ancien SPF
- Ajoute le nouveau SPF complet
- Rafraîchit la zone DNS
- Propagation: 10-30 minutes

---

### 2. `add-amazonses-to-spf.js`

**Objectif**: Ajouter AWS SES au SPF existant sans supprimer les autres includes

**Utilisation**:
```bash
cd services/authz-eb
node scripts/add-amazonses-to-spf.js
```

**Logique**:
- Récupère le SPF actuel
- Vérifie si `amazonses.com` est déjà présent
- Si absent, ajoute `include:amazonses.com` avant `~all`
- Préserve les autres includes existants

---

### 3. `verify-dns-antispam.js` 🔍

**Objectif**: Vérifier la configuration DNS anti-spam complète

**Utilisation**:
```bash
cd services/authz-eb
node scripts/verify-dns-antispam.js
```

**Vérifie**:
- ✅ **SPF**: Présence de mx.ovh.com, spf.protection.outlook.com, amazonses.com
- ✅ **DMARC**: Configuration DMARC1
- ✅ **DKIM**: Recherche selectors DKIM

**Rapport**:
- Score global /6
- État de chaque composant
- Prochaines étapes recommandées

---

### 4. `corriger-spf.js` ⚠️ **OBSOLÈTE**

**Objectif**: Remplacer SPF par `v=spf1 include:mx.ovh.net ~all`

⚠️ **Ne pas utiliser**: Ce script supprime les autres includes (Outlook, AWS SES)

**Alternative**: Utiliser `fix-complete-spf.js` à la place

---

## Workflow Recommandé

### Étape 1: Corriger le SPF

```bash
cd services/authz-eb
node scripts/fix-complete-spf.js
```

**Résultat attendu**:
```
✅ SPF complet restauré avec succès !

Valeur SPF:
  v=spf1 include:mx.ovh.com include:spf.protection.outlook.com include:amazonses.com ~all

Inclut maintenant:
  ✓ mx.ovh.com (serveurs email OVH)
  ✓ spf.protection.outlook.com (Microsoft 365)
  ✓ amazonses.com (AWS SES)

⏰ Propagation DNS: 10-30 minutes
```

---

### Étape 2: Vérifier la propagation

**Attendre 15 minutes**, puis:

```bash
node scripts/verify-dns-antispam.js
```

**Résultat attendu**:
```
1. SPF (Sender Policy Framework)
  Valeur: v=spf1 include:mx.ovh.com include:spf.protection.outlook.com include:amazonses.com ~all

  Vérifications:
    ✓ OVH (mx.ovh.com)
    ✓ Microsoft 365 (spf.protection.outlook.com)
    ✓ AWS SES (amazonses.com)
    ✓ Politique (~all)
  ✓ SPF complet et correct
```

**Alternative (vérification manuelle)**:
```bash
nslookup -type=TXT symphonia-controltower.com
```

---

### Étape 3: Activer DKIM dans AWS SES

⚠️ **DKIM ne peut pas être configuré via script OVH** car AWS SES génère des selectors uniques.

**Procédure manuelle**:

1. **Aller sur AWS SES Console (eu-central-1)**:
   ```
   https://console.aws.amazon.com/ses/home?region=eu-central-1#verified-senders-domain:
   ```

2. **Sélectionner le domaine** `symphonia-controltower.com`

3. **Activer DKIM**:
   - Onglet "DKIM"
   - Cliquer "Enable DKIM"
   - AWS génère **3 enregistrements CNAME**

4. **Copier les 3 CNAME** (exemple):
   ```
   Name: abcdef123456._domainkey.symphonia-controltower.com
   Value: abcdef123456.dkim.amazonses.com

   Name: ghijkl789012._domainkey.symphonia-controltower.com
   Value: ghijkl789012.dkim.amazonses.com

   Name: mnopqr345678._domainkey.symphonia-controltower.com
   Value: mnopqr345678.dkim.amazonses.com
   ```

5. **Option A - Ajouter via Console OVH** (manuel):
   - Se connecter à https://www.ovh.com/manager/
   - Web Cloud → Noms de domaine → symphonia-controltower.com
   - Zone DNS → Ajouter une entrée → Type CNAME
   - Répéter 3 fois

6. **Option B - Ajouter via API OVH** (script):

   Créer un script `add-dkim-cnames.js`:
   ```javascript
   const cnames = [
     { selector: 'abcdef123456', target: 'abcdef123456.dkim.amazonses.com' },
     { selector: 'ghijkl789012', target: 'ghijkl789012.dkim.amazonses.com' },
     { selector: 'mnopqr345678', target: 'mnopqr345678.dkim.amazonses.com' }
   ];

   for (const cname of cnames) {
     await callOvhApi('POST', `/domain/zone/${DOMAINE}/record`, {
       fieldType: 'CNAME',
       subDomain: `${cname.selector}._domainkey`,
       target: cname.target,
       ttl: 3600
     });
   }

   await callOvhApi('POST', `/domain/zone/${DOMAINE}/refresh`);
   ```

7. **Vérifier dans AWS SES** (après 1-2h):
   - Status DKIM: **Successful** ✅

---

### Étape 4: Tester sur Mail-Tester

**Attendre 1-2 heures** après configuration DKIM complète, puis:

1. Aller sur https://www.mail-tester.com
2. Copier l'adresse email de test (ex: `test-abc123@mail-tester.com`)
3. Envoyer un email de test:

   ```bash
   cd services/affret-ia-api-v2
   node scripts/send-test-emails-to-rtardy.js  # Modifier email destinataire
   ```

4. Vérifier le score sur mail-tester.com

**Score attendu**: **> 8/10**

**Vérifications mail-tester**:
- ✅ SPF: PASS
- ✅ DKIM: PASS
- ✅ DMARC: PASS
- ✅ Version texte: présente
- ✅ Lien désinscription: présent

---

## Dépannage

### Erreur: "API Error 403"

**Cause**: Consumer key OVH sans droits suffisants

**Solution**: Générer nouveau consumer key avec droits `/domain/zone/*`

---

### Erreur: "API Error 400: Field subDomain is invalid"

**Cause**: Format subdomain incorrect pour CNAME DKIM

**Solution**:
- ✅ Correct: `abcdef123456._domainkey` (sans domaine)
- ❌ Incorrect: `abcdef123456._domainkey.symphonia-controltower.com`

---

### SPF ne se propage pas

**Cause**: Cache DNS local

**Solution**:
1. Attendre 30 minutes
2. Vérifier avec serveur DNS public:
   ```bash
   nslookup -type=TXT symphonia-controltower.com 8.8.8.8
   ```
3. Ou utiliser https://mxtoolbox.com/SuperTool.aspx

---

### DKIM Status = "Pending" dans AWS SES

**Cause**: CNAME pas encore propagés

**Solution**:
1. Vérifier CNAME avec:
   ```bash
   nslookup -type=CNAME abcdef123456._domainkey.symphonia-controltower.com
   ```
2. Attendre 1-2 heures
3. Si toujours pending après 24h, vérifier que les CNAME sont exacts

---

## Architecture API OVH

### Endpoints Utilisés

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/domain/zone/{domain}/record?fieldType=TXT` | Liste enregistrements TXT |
| `GET` | `/domain/zone/{domain}/record/{id}` | Détails d'un enregistrement |
| `POST` | `/domain/zone/{domain}/record` | Créer enregistrement |
| `PUT` | `/domain/zone/{domain}/record/{id}` | Modifier enregistrement |
| `DELETE` | `/domain/zone/{domain}/record/{id}` | Supprimer enregistrement |
| `POST` | `/domain/zone/{domain}/refresh` | Rafraîchir zone DNS |

### Signature OVH

Chaque requête nécessite une signature SHA1:

```javascript
const signature = crypto
  .createHash('sha1')
  .update([
    appSecret,
    consumerKey,
    method,
    `https://eu.api.ovh.com/1.0${path}`,
    bodyStr,
    timestamp
  ].join('+'))
  .digest('hex');
```

Headers requis:
```javascript
{
  'X-Ovh-Application': appKey,
  'X-Ovh-Consumer': consumerKey,
  'X-Ovh-Timestamp': timestamp,
  'X-Ovh-Signature': '$1$' + signature
}
```

---

## Références

- **Documentation API OVH**: https://api.ovh.com/console/
- **Guide AWS SES DKIM**: https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-dkim.html
- **RFC SPF**: https://datatracker.ietf.org/doc/html/rfc7208
- **RFC DMARC**: https://datatracker.ietf.org/doc/html/rfc7489
- **Guide anti-spam complet**: `services/affret-ia-api-v2/CORRECTION-DNS-SPF-DKIM.md`

---

## Logs et Monitoring

### Vérifier les modifications DNS récentes

```bash
# Via API OVH
curl -X GET "https://eu.api.ovh.com/1.0/domain/zone/symphonia-controltower.com/record" \
  -H "X-Ovh-Application: $OVH_APP_KEY" \
  -H "X-Ovh-Consumer: $OVH_CONSUMER_KEY" \
  -H "X-Ovh-Timestamp: $(date +%s)" \
  -H "X-Ovh-Signature: $SIGNATURE"
```

### Monitoring propagation DNS

Utiliser https://dnschecker.org/ pour vérifier la propagation mondiale

---

## Checklist Complète

- [ ] 1. Exécuter `node scripts/fix-complete-spf.js`
- [ ] 2. Attendre 15 minutes
- [ ] 3. Vérifier avec `node scripts/verify-dns-antispam.js`
- [ ] 4. Confirmer SPF complet (4/4 checks verts)
- [ ] 5. Activer DKIM dans AWS SES Console (eu-central-1)
- [ ] 6. Copier les 3 CNAME DKIM générés
- [ ] 7. Ajouter les 3 CNAME dans DNS (console OVH ou script)
- [ ] 8. Attendre 1-2 heures
- [ ] 9. Vérifier DKIM Status = "Successful" dans AWS SES
- [ ] 10. Tester sur https://www.mail-tester.com (score > 8/10)
- [ ] 11. Lancer campagne test (5-10 transporteurs)
- [ ] 12. Valider réception en boîte principale (pas spam)
- [ ] 13. Lancer campagne complète (84 transporteurs)

---

**Auteur**: Claude Sonnet 4.5
**Date**: 2026-02-03
**Version**: 1.0
