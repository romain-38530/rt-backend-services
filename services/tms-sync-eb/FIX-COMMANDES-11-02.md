# 🔧 Fix Commandes du 11/02 - Guide de Réparation

## ⚡ Actions Rapides (TL;DR)

```bash
# 1. Ajouter l'IP dans MongoDB Atlas
#    → https://cloud.mongodb.com
#    → Network Access → Add IP: 3.125.160.174/32 (ou 0.0.0.0/0)

# 2. Attendre 2 minutes puis vérifier connexion
curl -s http://awseb-e-z-AWSEBLoa-ZPJXYR9FE1NP-105816728.eu-central-1.elb.amazonaws.com/health | grep connected

# 3. Re-synchroniser les commandes
cd "c:\Users\rtard\dossier symphonia\rt-backend-services\services\tms-sync-eb"
node force-resync-orders.js 2026-02-11 2026-02-15
```

**Durée totale**: ~5 minutes

---

## 📋 Problème Identifié
Les commandes du 11 février apparaissent comme "non organisées" alors qu'elles sont déjà organisées et livrées.

**Causes**:
1. ❌ MongoDB non connecté → API ne peut pas synchroniser
2. ❌ Données anciennes (avant déploiement) pas mises à jour avec `assignedCarrier`

**Status actuel**:
- ✅ Fix code déployé (v2.8.1-COMPLETE)
- ✅ Nouveau mapping `assignedCarrier` actif
- ❌ MongoDB déconnecté → Bloque toute synchronisation
- ❌ Données historiques (11/02) pas re-synchronisées

---

## ✅ Solution Rapide (2 minutes)

### ÉTAPE 1: Débloquer MongoDB Atlas

L'instance Elastic Beanstalk ne peut pas se connecter car son IP n'est pas autorisée.

**🎯 Action immédiate**:

1. Connectez-vous à [MongoDB Atlas](https://cloud.mongodb.com)
2. Cluster `stagingrt` → **Network Access**
3. **Add IP Address**
4. Entrez: `3.125.160.174/32` *(IP de l'instance EB)*
5. Cliquez **Confirm**

**OU (plus simple)**:
- Entrez: `0.0.0.0/0` pour autoriser toutes les IPs

**✅ Vérification (2 minutes après)**:
```bash
curl -s http://awseb-e-z-AWSEBLoa-ZPJXYR9FE1NP-105816728.eu-central-1.elb.amazonaws.com/health | grep connected

# Résultat attendu:
# "connected": true
```

---

### ÉTAPE 2: Re-synchroniser les Commandes Historiques

Une fois MongoDB connecté, lancez la re-synchronisation pour appliquer le mapping `assignedCarrier` aux commandes du 11/02.

**🚀 Commande à exécuter**:

```bash
cd "c:\Users\rtard\dossier symphonia\rt-backend-services\services\tms-sync-eb"

node force-resync-orders.js 2026-02-11 2026-02-15
```

**Ce que fait le script**:
1. ✅ Récupère les transports du 11 au 15 février depuis Dashdoc
2. ✅ Mappe les données avec le nouveau champ `assignedCarrier`
3. ✅ Met à jour le Data Lake MongoDB
4. ✅ Met à jour les commandes Symphonia existantes
5. ✅ Affiche la progression en temps réel

**Durée estimée**: 1-3 minutes (selon le nombre de commandes)

**Alternative (automatique)**:
Si vous ne lancez pas le script, les synchronisations automatiques mettront à jour les données progressivement (toutes les 25 secondes). Cela peut prendre 1-2 heures pour les commandes anciennes.

---

## 🎯 Résultat Final

Après les 2 étapes, les commandes du 11/02 afficheront:

| Avant | Après |
|-------|-------|
| ❌ "Sans chauffeur" | ✅ "Antoine Sassoukas" |
| ❌ "Sans véhicule" | ✅ "BJ DTS 47" |
| ❌ Transporteur manquant | ✅ Nom du transporteur |
| ❌ Non organisée (incorrect) | ✅ Organisée (correct) |

---

## 📊 Vérifications

### 1. MongoDB Connecté ✅
```bash
curl -s http://awseb-e-z-AWSEBLoa-ZPJXYR9FE1NP-105816728.eu-central-1.elb.amazonaws.com/health | grep -o '"connected":[^,]*'
```
**Attendu**: `"connected":true`

### 2. Script Exécuté ✅
Après avoir lancé `force-resync-orders.js`, vous verrez:
```
🔄 Force re-sync commandes 2026-02-11 → 2026-02-15
✅ MongoDB connecté (native + mongoose)
📋 1 connexions TMS trouvées

🔄 Sync [Organisation]...
   📦 X transports Dashdoc récupérés
   ✅ Transports mappés avec assignedCarrier
   ✅ Data Lake: X/X transports
   ✅ Symphonia: X commandes mises à jour

🎉 Re-synchronisation terminée!
```

### 3. Données Visibles dans Symphonia ✅
Dans l'interface Symphonia, ouvrez une commande du 11/02:
- ✅ Section "Transporteur" remplie
- ✅ Nom du chauffeur visible
- ✅ Plaque du véhicule visible
- ✅ Status "Organisée" correct

---

## 🚨 Si problèmes persistent

- Vérifier les logs EB pour erreurs MongoDB
- Vérifier la liste d'accès IP dans MongoDB Atlas
- Contacter le support MongoDB Atlas si IP bloquée
- Vérifier les credentials MongoDB (URI correct)

---

**Fix déployé**: v2.8.1-COMPLETE
**Date**: 2026-02-25
**Commit**: 64d515e
**Status**: ✅ Production Ready (attente connexion MongoDB)
