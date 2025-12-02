# SYMPHONI.A - Comptes de Démonstration

> **Mot de passe universel : `Demo2024!`**

---

## 1. PORTAIL INDUSTRIEL (Clients Principaux)

**URL Production :** http://rt-auth-api-prod.eba-g2psqhq5.eu-central-1.elasticbeanstalk.com

| Email | Entreprise | Rôle | Description |
|-------|------------|------|-------------|
| `demo@agrofrance.fr` | AgroFrance Industries | Admin | Industriel agroalimentaire - 500 expéditions/jour |
| `logistique@agrofrance.fr` | AgroFrance Industries | Logistics Manager | Responsable logistique |
| `demo@pharmalog.fr` | PharmaLog SA | Admin | Industrie pharmaceutique - Température contrôlée |
| `demo@autoparts.fr` | AutoParts Distribution | Admin | Distribution pièces automobiles - Just-in-time |

### Scénarios de démo Industriel :
- Créer une commande de transport
- Attribuer à un transporteur (via AFFRET.IA)
- Suivre en temps réel
- Consulter les KPIs

---

## 2. ESPACE FOURNISSEUR (Expéditeurs)

**URL Production :** http://rt-supplier-space-prod.eba-ka46t2mz.eu-central-1.elasticbeanstalk.com

| Email | Entreprise | Contact | Localisation |
|-------|------------|---------|--------------|
| `expedition@usine-lyon.fr` | Usine Lyon Production | Paul Moreau | Lyon (69) |
| `logistique@entrepot-marseille.fr` | Entrepôt Marseille Sud | Lucie Blanc | Marseille (13) |
| `expedition@pharma-bordeaux.fr` | Pharma Bordeaux Lab | Thomas Petit | Bordeaux (33) |
| `stock@fournisseur-paris.fr` | Stock Express Paris | Emma Rousseau | Roissy (95) |

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

**URL Production :** http://rt-tracking-api-prod.eba-mttbqqhw.eu-central-1.elasticbeanstalk.com

| Email | Entreprise | Contact | Flotte | Spécialités |
|-------|------------|---------|--------|-------------|
| `dispatch@transport-express.fr` | Transport Express France | Jacques Martin | 150 véhicules | Frigo, Express, Palettes |
| `planning@frigoroute.fr` | FrigoRoute International | Hans Schmidt | 80 véhicules | Frigo, International, Pharma |
| `exploitation@rapido-log.fr` | Rapido Logistique | Ahmed Benali | 200 véhicules | Express, Messagerie, Palettes |

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
# Industriel
curl -X POST http://rt-auth-api-prod.eba-g2psqhq5.eu-central-1.elasticbeanstalk.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@agrofrance.fr","password":"Demo2024!"}'

# Fournisseur
curl -X POST http://rt-supplier-space-prod.eba-ka46t2mz.eu-central-1.elasticbeanstalk.com/api/v1/supplier/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"expedition@usine-lyon.fr","password":"Demo2024!"}'

# Destinataire
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

*Document généré le 01/12/2024*
*SYMPHONI.A - Comptes de démonstration*
