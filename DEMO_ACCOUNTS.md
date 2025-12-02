# SYMPHONI.A - Comptes de Démonstration

> **Mot de passe universel : `Demo2024!`**
> **Dernière mise à jour : 02/12/2024**
> **Statut : ✅ COMPTES CRÉÉS ET OPÉRATIONNELS**

---

## 1. PORTAIL INDUSTRIEL (Clients Principaux)

**URL Production :** http://rt-auth-api-prod.eba-g2psqhq5.eu-central-1.elasticbeanstalk.com
**Portail :** `industry`

| Email | Nom | Entreprise | Statut |
|-------|-----|------------|--------|
| `demo@agrofrance.fr` | Jean Dupont | AgroFrance Industries | ✅ Créé |
| `logistique@agrofrance.fr` | Marie Martin | AgroFrance Logistique | ✅ Créé |
| `demo@pharmalog.fr` | Pierre Bernard | PharmaLog SA | ✅ Créé |
| `demo@autoparts.fr` | Sophie Leroy | AutoParts Distribution | ✅ Créé |

### Scénarios de démo Industriel :
- Créer une commande de transport
- Attribuer à un transporteur (via AFFRET.IA)
- Suivre en temps réel
- Consulter les KPIs

---

## 2. ESPACE FOURNISSEUR (Expéditeurs)

**URL Production :** http://rt-supplier-space-prod.eba-ka46t2mz.eu-central-1.elasticbeanstalk.com
**Portail :** `supplier`

| Email | Nom | Entreprise | Statut |
|-------|-----|------------|--------|
| `expedition@usine-lyon.fr` | Paul Moreau | Usine Lyon Production | ✅ Créé |
| `logistique@entrepot-marseille.fr` | Lucie Blanc | Entrepôt Marseille Sud | ✅ Créé |
| `expedition@pharma-bordeaux.fr` | Thomas Petit | Pharma Bordeaux Lab | ⏳ Invitation envoyée |
| `stock@fournisseur-paris.fr` | Emma Rousseau | Stock Express Paris | ⏳ Invitation envoyée |

### Scénarios de démo Fournisseur :
- Voir les commandes à préparer
- Valider un créneau de chargement
- Signer électroniquement le BL
- Chatter avec le transporteur
- Déclarer un retard de production

---

## 3. ESPACE DESTINATAIRE (Réceptionnaires)

**URL Production :** http://rt-recipient-space-prod.eba-xir23y3r.eu-central-1.elasticbeanstalk.com

| Email | Entreprise | Contact | Localisation |
|-------|------------|---------|--------------|
| `reception@rungis-client.fr` | MIN Rungis - Hall A | François Dubois | Rungis (94) |
| `quai@supermarche-nord.fr` | Supermarché Distribution Nord | Claire Simon | Lille (59) |
| `reception@hopital-paris.fr` | CHU Paris Centre | Dr. Antoine Lefevre | Paris (75) |
| `magasin@garage-toulouse.fr` | Garage Central Toulouse | Marc Garcia | Toulouse (31) |

### Scénarios de démo Destinataire :
- Voir les livraisons attendues avec ETA
- Scanner le QR Code à l'arrivée
- Signer la réception
- Déclarer un incident (palette endommagée)
- Suivre un litige

---

## 4. TRANSPORTEURS

**URL Production :** http://rt-auth-api-prod.eba-g2psqhq5.eu-central-1.elasticbeanstalk.com
**Portail :** `transporter`

| Email | Nom | Entreprise | Statut |
|-------|-----|------------|--------|
| `dispatch@transport-express.fr` | Jacques Martin | Transport Express France | ✅ Créé |
| `planning@frigoroute.fr` | Hans Schmidt | FrigoRoute International | ✅ Créé |
| `exploitation@rapido-log.fr` | Ahmed Benali | Rapido Logistique | ✅ Créé |

### Scénarios de démo Transporteur :
- Voir les missions assignées
- Accepter/refuser une mission
- Mettre à jour le statut (chargé, en route, livré)
- Signer l'eCMR
- Déclarer une réserve

---

## 5. SCÉNARIO DE DÉMO COMPLET

### Étape 1 : Création commande (Industriel)
```
Login: demo@agrofrance.fr
Action: Créer commande Lyon → Paris, 12 palettes frigo
```

### Étape 2 : Préparation (Fournisseur)
```
Login: expedition@usine-lyon.fr
Action: Valider créneau 6h00, signer BL
```

### Étape 3 : Transport (Transporteur)
```
Login: dispatch@transport-express.fr
Action: Accepter mission, démarrer tracking
```

### Étape 4 : Suivi (Industriel)
```
Login: demo@agrofrance.fr
Action: Voir position GPS, ETA, température
```

### Étape 5 : Réception (Destinataire)
```
Login: reception@rungis-client.fr
Action: Scanner QR, contrôler, signer
```

### Étape 6 : Incident (optionnel)
```
Login: reception@rungis-client.fr
Action: Déclarer 1 palette endommagée
```

---

## 6. APIs DE TEST

### Health Check
```bash
# Tous les services
curl http://rt-auth-api-prod.eba-g2psqhq5.eu-central-1.elasticbeanstalk.com/health
curl http://rt-supplier-space-prod.eba-ka46t2mz.eu-central-1.elasticbeanstalk.com/health
curl http://rt-recipient-space-prod.eba-xir23y3r.eu-central-1.elasticbeanstalk.com/health
```

### Login Test
```bash
# Industriel (via auth-api)
curl -X POST http://rt-auth-api-prod.eba-g2psqhq5.eu-central-1.elasticbeanstalk.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@agrofrance.fr","password":"Demo2024!"}'

# Transporteur (via auth-api)
curl -X POST http://rt-auth-api-prod.eba-g2psqhq5.eu-central-1.elasticbeanstalk.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dispatch@transport-express.fr","password":"Demo2024!"}'

# Fournisseur (via supplier-space-api)
curl -X POST http://rt-supplier-space-prod.eba-ka46t2mz.eu-central-1.elasticbeanstalk.com/api/v1/supplier/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"expedition@usine-lyon.fr","password":"Demo2024!"}'

# Destinataire (via recipient-space-api)
curl -X POST http://rt-recipient-space-prod.eba-xir23y3r.eu-central-1.elasticbeanstalk.com/api/v1/recipient/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"reception@rungis-client.fr","password":"Demo2024!"}'
```

---

## 7. NOTES IMPORTANTES

### Données de démo
- Les comptes sont pré-configurés avec des données fictives
- Les commandes de démo sont renouvelées chaque jour
- Les incidents sont automatiquement clôturés après 24h

### Limitations
- Pas d'envoi réel d'emails (mode sandbox)
- Pas de paiement réel (Stripe test mode)
- GPS simulé pour les véhicules

### Reset des données
Pour réinitialiser les données de démo :
```bash
node scripts/seed-demo-users.js
```

---

*Document mis à jour le 02/12/2024*
*SYMPHONI.A - Comptes de démonstration*

---

## 8. RÉSUMÉ DES COMPTES CRÉÉS

### Comptes opérationnels (auth-api)
| Portail | Email | Statut |
|---------|-------|--------|
| industry | demo@agrofrance.fr | ✅ |
| industry | logistique@agrofrance.fr | ✅ |
| industry | demo@pharmalog.fr | ✅ |
| industry | demo@autoparts.fr | ✅ |
| transporter | dispatch@transport-express.fr | ✅ |
| transporter | planning@frigoroute.fr | ✅ |
| transporter | exploitation@rapido-log.fr | ✅ |

### Comptes fournisseurs (supplier-space-api)
| Email | Statut |
|-------|--------|
| expedition@usine-lyon.fr | ✅ |
| logistique@entrepot-marseille.fr | ✅ |

**Total : 9 comptes actifs et opérationnels**
