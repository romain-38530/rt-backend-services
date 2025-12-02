# SYMPHONI.A - Scénario de Démonstration Client

## Durée estimée : 45-60 minutes

---

## 1. INTRODUCTION (5 minutes)

### Accroche
> "Imaginez pouvoir suivre en temps réel chaque palette, chaque camion, chaque livraison de votre supply chain, avec une IA qui anticipe les retards avant qu'ils ne se produisent..."

### Présentation rapide
- **SYMPHONI.A** : Plateforme logistique intelligente tout-en-un
- **31 microservices** interconnectés
- **Architecture cloud** AWS haute disponibilité
- **IA intégrée** (AFFRET.IA) pour l'optimisation et la prédiction

### Les 3 piliers
1. **Visibilité totale** - Tracking temps réel de bout en bout
2. **Automatisation intelligente** - IA pour réduire les tâches manuelles
3. **Collaboration simplifiée** - Portails dédiés fournisseurs/destinataires

---

## 2. SCÉNARIO DE DÉMONSTRATION

### Contexte du scénario
> **Client fictif** : "AgroFrance" - Industriel agroalimentaire
> **Volume** : 500 expéditions/jour vers 2000 points de livraison
> **Problèmes actuels** : Manque de visibilité, litiges fréquents, coordination difficile

---

### ACTE 1 : Création d'une commande transport (10 minutes)

#### 1.1 Connexion au portail industriel
```
URL: https://app.symphonia.io/login
Utilisateur: demo@agrofrance.fr
```

**Points à montrer :**
- Interface intuitive et moderne
- Dashboard personnalisé avec KPIs temps réel
- Alertes et notifications en cours

#### 1.2 Nouvelle commande de transport
**Scénario :** Expédition de 12 palettes de produits frais
- Lyon (usine) → Paris (entrepôt client)
- Température contrôlée : 2-4°C
- Livraison J+1 avant 14h00

**Actions :**
1. Cliquer sur "Nouvelle commande"
2. Remplir les informations :
   - Enlèvement : Usine Lyon, demain 6h00
   - Livraison : Entrepôt Rungis, demain 12h00
   - Marchandise : 12 palettes, 8 tonnes, frigo
3. **AFFRET.IA suggère automatiquement :**
   - 3 transporteurs qualifiés avec scoring
   - Prix estimé : 850€ - 920€
   - Risque météo : Faible

**Point de valeur :**
> "L'IA analyse 50+ critères pour vous recommander le meilleur transporteur : historique de ponctualité, équipements, prix, disponibilité..."

#### 1.3 Attribution automatique
- Le système sélectionne "TransportExpress" (score 94/100)
- Notification envoyée au transporteur
- eCMR pré-généré automatiquement

---

### ACTE 2 : Espace Fournisseur - Préparation (8 minutes)

#### 2.1 Vue fournisseur (usine Lyon)
```
URL: https://fournisseur.symphonia.io
Utilisateur: logistique@usine-lyon.fr
```

**Dashboard fournisseur :**
- Commandes à préparer aujourd'hui : 47
- RDV chargement confirmés : 42
- En attente de confirmation : 5

#### 2.2 Gestion du RDV de chargement
**Actions :**
1. Voir la commande AgroFrance dans "À préparer"
2. Valider le créneau de chargement : 6h00-7h00
3. Scanner les palettes avec smartphone
4. Joindre les documents :
   - Certificat sanitaire
   - Fiche température

**Point de valeur :**
> "Le fournisseur gère tout depuis son smartphone. Fini les appels téléphoniques et les emails perdus."

#### 2.3 Signature électronique du chargement
- Le chauffeur arrive à 6h15
- Scan du QR code par le chauffeur
- Signature électronique du BL sur tablette
- Photos des palettes chargées
- eCMR signé automatiquement (partie expéditeur)

---

### ACTE 3 : Suivi en temps réel (10 minutes)

#### 3.1 Tracking live
**Retour au portail industriel AgroFrance**

**Vue carte :**
- Position GPS du camion en temps réel
- Trajet prévu vs trajet réel
- ETA dynamique : 11h47 (en avance de 13 min)

**Point de valeur :**
> "L'ETA est recalculé toutes les 5 minutes en fonction du trafic réel, de la météo et du comportement du chauffeur."

#### 3.2 Alertes intelligentes
**Simulation d'événement :**
> "Alerte : Ralentissement A6 - Accident km 287"
> "Impact estimé : +25 minutes"
> "Nouvelle ETA : 12h12"

**Actions automatiques du système :**
- Notification push au destinataire
- Email au responsable logistique
- Mise à jour du planning de réception

#### 3.3 Monitoring température (IoT)
- Graphique température en temps réel : 3.2°C
- Seuil d'alerte configuré : < 1°C ou > 5°C
- Historique complet pour traçabilité HACCP

---

### ACTE 4 : Espace Destinataire - Réception (8 minutes)

#### 4.1 Vue destinataire
```
URL: https://destinataire.symphonia.io
Utilisateur: reception@rungis-client.fr
```

**Dashboard réception :**
- Livraisons attendues aujourd'hui : 23
- En approche (< 1h) : 5
- Arrivée imminente : 2

#### 4.2 Préparation de la réception
- Voir l'ETA mise à jour : 12h12
- Réserver le quai 7
- Affecter un réceptionnaire

#### 4.3 Processus de livraison (5 étapes)
1. **Arrivée camion** - Scan QR code d'entrée
2. **Contrôle documentaire** - Vérification eCMR
3. **Déchargement** - Comptage palettes (12/12)
4. **Contrôle qualité** - Température OK, emballages OK
5. **Signature finale** - eCMR complété

**Tout OK :** Livraison validée en 8 minutes

---

### ACTE 5 : Gestion d'incident (5 minutes)

#### 5.1 Simulation d'anomalie
> "1 palette endommagée détectée"

**Actions du réceptionnaire :**
1. Déclarer l'incident
2. Type : "Emballage endommagé"
3. Photos de la palette
4. Description : "Coin palette écrasé, 2 cartons abîmés"

**Automatisations système :**
- Alerte immédiate au transporteur
- Alerte à l'expéditeur (AgroFrance)
- **Blocage automatique de la facturation** sur cette palette
- Ouverture dossier litige #LIT-2024-1247

#### 5.2 Résolution du litige
- Chat intégré entre les 3 parties
- Proposition d'avoir : 85€
- Validation par le client
- Clôture du litige en 24h

**Point de valeur :**
> "Les litiges sont résolus 3x plus vite grâce à la traçabilité complète et aux preuves horodatées (photos, signatures, températures)."

---

### ACTE 6 : Facturation et KPIs (5 minutes)

#### 6.1 Facturation automatique
- Facture générée automatiquement
- Déduction de l'avoir litige : -85€
- Total : 835€ HT
- Envoi automatique au service comptable

#### 6.2 Tableau de bord KPIs
**Indicateurs temps réel :**
| KPI | Valeur | Tendance |
|-----|--------|----------|
| Taux de ponctualité | 94.2% | +2.1% |
| Litiges | 1.8% | -0.5% |
| Temps moyen réception | 12 min | -3 min |
| Satisfaction transporteurs | 4.6/5 | +0.2 |

#### 6.3 AFFRET.IA - Recommandations
> "L'IA a détecté que les livraisons du vendredi après-midi ont 23% plus de retards. Recommandation : décaler les RDV critiques au vendredi matin."

---

## 3. MODULES COMPLÉMENTAIRES À MENTIONNER

### Gestion des palettes Europe
- Suivi du parc palettes en temps réel
- Économie circulaire intégrée
- Réconciliation automatique

### eCMR électronique
- 100% dématérialisé
- Signature multi-parties
- Archivage légal 10 ans

### Marketplace Stockage
- Mutualisation des espaces disponibles
- Réservation en ligne
- Optimisation des coûts logistiques

### Chatbot IA intégré
- Assistance 24/7
- Réponses instantanées
- Escalade automatique si nécessaire

---

## 4. ARGUMENTS CLÉS PAR PROFIL

### Pour le DAF (Directeur Financier)
- ROI moyen : 15-25% d'économies logistiques
- Réduction des litiges : -60%
- Facturation accélérée : cycle réduit de 12 jours
- Pas d'investissement infrastructure (SaaS)

### Pour le Directeur Supply Chain
- Visibilité temps réel sur 100% des flux
- KPIs automatisés et fiables
- Réduction du temps de traitement des commandes : -40%
- Intégration TMS/WMS/ERP native

### Pour le Directeur IT
- Architecture microservices moderne
- API REST complètes et documentées
- Sécurité : chiffrement, RGPD compliant
- SLA 99.9% disponibilité

### Pour le Directeur Commercial
- Amélioration satisfaction client
- Avantage concurrentiel
- Différenciation sur le marché

---

## 5. OBJECTIONS COURANTES ET RÉPONSES

### "C'est trop complexe à mettre en place"
> "Déploiement en 4-6 semaines. Notre équipe accompagne la migration. Interface intuitive, formation incluse."

### "Nos transporteurs ne vont pas adopter"
> "Application mobile gratuite pour les transporteurs. Ils gagnent du temps sur l'administratif. 95% d'adoption en 3 mois."

### "Et la confidentialité de nos données ?"
> "Données hébergées en Europe (AWS Frankfurt). RGPD compliant. Chiffrement AES-256. Vous restez propriétaire de vos données."

### "On a déjà un TMS"
> "SYMPHONI.A s'intègre à votre TMS existant via API. Vous ajoutez la couche visibilité et collaboration sans tout changer."

### "C'est trop cher"
> "Modèle à l'usage : vous payez par expédition. ROI positif dès le 3ème mois en moyenne. Pas de coût d'infrastructure."

---

## 6. TARIFICATION À PRÉSENTER

### Version Gratuite (Fournisseurs/Destinataires)
- Portail basique
- Notifications email
- Signature électronique
- **0€/mois**

### Version Premium (Fournisseurs/Destinataires)
- Toutes les fonctionnalités
- Chat intégré
- API accès
- Reporting avancé
- **499€/mois**

### Version Industriel
- Sur devis selon volume
- À partir de **0.50€/expédition**
- Dégressif selon volume

---

## 7. PROCHAINES ÉTAPES PROPOSÉES

1. **POC gratuit 30 jours** sur un périmètre limité
2. **Workshop technique** avec votre équipe IT
3. **Business case personnalisé** avec vos données
4. **Visite référence client** (sur demande)

---

## 8. CONTACTS

- **Commercial** : commercial@symphonia.io
- **Support technique** : support@symphonia.io
- **Documentation API** : docs.symphonia.io

---

## ANNEXE : URLs de démonstration

### Environnements de démo
| Portail | URL | Credentials |
|---------|-----|-------------|
| Industriel | https://demo.symphonia.io | demo@client.fr / Demo2024! |
| Fournisseur | https://fournisseur.demo.symphonia.io | demo@fournisseur.fr / Demo2024! |
| Destinataire | https://destinataire.demo.symphonia.io | demo@destinataire.fr / Demo2024! |

### APIs (Postman)
Collection Postman disponible : `SYMPHONIA_API_Demo.postman_collection.json`

---

*Document généré le 01/12/2024 - Version 1.0*
*SYMPHONI.A - La logistique intelligente*
