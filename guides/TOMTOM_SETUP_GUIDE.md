# Guide de Configuration TomTom Telematics API

Version: 1.0.0
Date: 2025-11-26
Auteur: RT SYMPHONI.A Team
Durée estimée: 15 minutes

---

## Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Prérequis](#prérequis)
3. [Coûts et Tarification](#coûts-et-tarification)
4. [Guide Étape par Étape](#guide-étape-par-étape)
5. [Configuration dans l'Application](#configuration-dans-lapplication)
6. [Tests et Validation](#tests-et-validation)
7. [Dépannage](#dépannage)
8. [FAQ](#faq)

---

## Vue d'Ensemble

TomTom Telematics API fournit des services de:
- **Calcul d'itinéraires** optimisés pour camions
- **Géocodage** (adresse → GPS)
- **Reverse Geocoding** (GPS → adresse)
- **Informations trafic** en temps réel
- **Tracking GPS** des véhicules
- **Geofencing** (détection de zones)

### Architecture de l'Intégration

```
┌──────────────────┐
│  RT SYMPHONI.A   │
│   Application    │
└────────┬─────────┘
         │ HTTPS
         │ API Key
         ▼
┌──────────────────┐
│   TomTom API     │
│   Gateway        │
└────────┬─────────┘
         │
    ┌────┴────┬────────────┐
    ▼         ▼            ▼
┌─────────┐ ┌──────┐  ┌──────────┐
│ Routing │ │Search│  │ Traffic  │
│   API   │ │ API  │  │   API    │
└─────────┘ └──────┘  └──────────┘
```

---

## Prérequis

### Compte et Accès
- [ ] Email valide
- [ ] Carte bancaire (pour abonnement payant optionnel)
- [ ] Accès à Internet

### Environnement Technique
- [ ] Node.js v20+ installé
- [ ] Navigateur web récent
- [ ] Éditeur de texte

---

## Coûts et Tarification

### Option 1: Free Tier (Recommandé pour débuter)

```
┌─────────────────────────────────────────────┐
│  TomTom Free Tier                           │
├─────────────────────────────────────────────┤
│  Coût mensuel:        0€                    │
│  Requêtes/jour:       2,500                 │
│  Requêtes/mois:       75,000                │
│  APIs incluses:       Toutes                │
│  Support:             Community             │
└─────────────────────────────────────────────┘
```

**Suffisant pour:**
- Phase de développement
- Tests et validation
- Petit volume de production (<2,500 requêtes/jour)

### Option 2: Pay-as-you-go

```
┌─────────────────────────────────────────────┐
│  TomTom Pay-as-you-go                       │
├─────────────────────────────────────────────┤
│  Coût de base:        0€/mois               │
│  Routing API:         0.70€ / 1,000 req     │
│  Search API:          0.50€ / 1,000 req     │
│  Traffic API:         0.50€ / 1,000 req     │
│  Support:             Email                 │
└─────────────────────────────────────────────┘
```

**Estimation pour RT SYMPHONI.A (8,000 docs/mois):**
- Routing: ~2,400 requêtes → 1.68€
- Search: ~1,600 requêtes → 0.80€
- **Total: ~2.50€/mois**

### Option 3: Abonnement Professionnel

```
┌─────────────────────────────────────────────┐
│  TomTom Telematics Professional             │
├─────────────────────────────────────────────┤
│  Coût mensuel:        20€                   │
│  Véhicules trackés:   5                     │
│  Requêtes illimitées                        │
│  Support:             24/7                  │
│  SLA:                 99.9%                 │
└─────────────────────────────────────────────┘
```

**Recommandé si:**
- Volume >75,000 requêtes/mois
- Besoin de tracking en temps réel
- Support premium requis

---

## Guide Étape par Étape

### Étape 1: Créer un Compte TomTom Developer

**Durée: 3 minutes**

1. Visitez: https://developer.tomtom.com/

2. Cliquez sur **"Sign up"** en haut à droite

   ```
   ┌────────────────────────────────────┐
   │  TomTom Developer Portal           │
   │                       [Sign up] ◄── Cliquez ici
   └────────────────────────────────────┘
   ```

3. Remplissez le formulaire:

   | Champ              | Valeur                        |
   |--------------------|-------------------------------|
   | Email              | votre-email@entreprise.com    |
   | Password           | (min. 8 caractères)           |
   | First Name         | Prénom                        |
   | Last Name          | Nom                           |
   | Company            | RT SYMPHONI.A                 |
   | Country            | France                        |

4. Acceptez les conditions d'utilisation

5. Cliquez sur **"Create Account"**

6. **Vérifiez votre email** et cliquez sur le lien de confirmation

---

### Étape 2: Se Connecter au Developer Portal

**Durée: 1 minute**

1. Visitez: https://developer.tomtom.com/user/login

2. Entrez vos identifiants

3. Vous êtes maintenant sur votre **Dashboard**

   ```
   ┌──────────────────────────────────────────────┐
   │  TomTom Developer Dashboard                  │
   ├──────────────────────────────────────────────┤
   │  My Apps                                     │
   │  [+ Create a new app]  ◄── Prochaine étape   │
   │                                              │
   │  No apps yet                                 │
   └──────────────────────────────────────────────┘
   ```

---

### Étape 3: Créer une Application

**Durée: 3 minutes**

1. Cliquez sur **"Create a new app"**

2. Remplissez le formulaire:

   ```
   ┌──────────────────────────────────────┐
   │  Create New App                      │
   ├──────────────────────────────────────┤
   │  App name:                           │
   │  [RT SYMPHONI.A]                     │
   │                                      │
   │  Description (optional):             │
   │  [Système de gestion de transport]   │
   │                                      │
   │  Platform:                           │
   │  ● Web                               │
   │  ○ Mobile                            │
   │  ○ Backend                           │
   └──────────────────────────────────────┘
   ```

3. Sélectionnez les **APIs requises**:

   - [x] **Routing API** (calcul d'itinéraires)
   - [x] **Search API** (géocodage)
   - [x] **Traffic API** (info trafic)
   - [ ] Maps API (optionnel)
   - [ ] Geofencing API (optionnel)

4. Cliquez sur **"Create"**

---

### Étape 4: Obtenir votre API Key

**Durée: 2 minutes**

1. Après création, vous êtes redirigé vers la page de l'app

   ```
   ┌──────────────────────────────────────────────┐
   │  RT SYMPHONI.A                               │
   ├──────────────────────────────────────────────┤
   │  Consumer Key (API Key):                     │
   │  ┌────────────────────────────────────────┐  │
   │  │ ZQ9AaXfe1bDR3egvxV0I5owWAl9q2JBU      │  │
   │  │                            [Copy]  ◄────── Copiez cette clé
   │  └────────────────────────────────────────┘  │
   │                                              │
   │  Request statistics:                         │
   │  ├─ Today:      0 / 2,500                    │
   │  └─ This month: 0 / 75,000                   │
   └──────────────────────────────────────────────┘
   ```

2. **Copiez l'API Key** (32 caractères alphanumériques)

3. **Gardez-la en sécurité** - ne la partagez jamais publiquement

---

### Étape 5: Tester l'API Key

**Durée: 2 minutes**

Testez immédiatement votre clé avec cette commande:

```bash
# Linux/Mac
curl "https://api.tomtom.com/search/2/geocode/Paris,France.json?key=VOTRE_API_KEY"

# Windows PowerShell
Invoke-WebRequest "https://api.tomtom.com/search/2/geocode/Paris,France.json?key=VOTRE_API_KEY"
```

**Réponse attendue:**
```json
{
  "summary": {
    "query": "paris france",
    "queryType": "NON_NEAR",
    "queryTime": 42,
    "numResults": 1
  },
  "results": [
    {
      "type": "Geography",
      "position": {
        "lat": 48.85693,
        "lon": 2.3412
      },
      "address": {
        "freeformAddress": "Paris, France"
      }
    }
  ]
}
```

Si vous voyez cette réponse: **API Key valide!** ✅

---

## Configuration dans l'Application

### Option A: Configuration Automatique (Recommandé)

Utilisez le script interactif:

```bash
cd /chemin/vers/rt-backend-services
node scripts/setup-external-services-interactive.js
```

Suivez les instructions à l'écran et collez votre API Key quand demandé.

### Option B: Configuration Manuelle

1. Ouvrez le fichier `.env.external-services`:

   ```bash
   cd /chemin/vers/rt-backend-services/services/subscriptions-contracts-eb
   nano .env.external-services
   ```

2. Remplacez la valeur:

   ```bash
   # Avant
   TOMTOM_API_KEY=your-tomtom-api-key-here

   # Après
   TOMTOM_API_KEY=ZQ9AaXfe1bDR3egvxV0I5owWAl9q2JBU
   ```

3. Sauvegardez et fermez

4. Vérifiez la configuration:

   ```bash
   node scripts/test-tomtom-connection.js
   ```

---

## Tests et Validation

### Test 1: Configuration de l'API Key

```bash
cd services/subscriptions-contracts-eb
node scripts/test-tomtom-connection.js
```

**Résultat attendu:**
```
╔══════════════════════════════════════════════════════════════════╗
║  RT SYMPHONI.A - Test de Connexion TomTom Telematics API        ║
╚══════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test 1: Configuration de l'API Key TomTom
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ API Key TomTom configurée
ℹ️  Longueur de la clé : 32 caractères
```

### Test 2: Calcul d'Itinéraire

**Résultat attendu:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test 2: Calcul d'itinéraire (Paris → Lyon)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Itinéraire calculé avec succès
ℹ️  Distance : 463.15 km
ℹ️  Durée : 269 minutes
ℹ️  Retard trafic : 12 minutes
ℹ️  Temps de réponse : 847 ms
```

### Test 3: Géocodage

**Résultat attendu:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test 4: Géocodage (Adresse → GPS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Géocodage réussi
ℹ️  Coordonnées : lat=48.8698, lng=2.3358
ℹ️  Confiance : High
```

### Résumé des Tests

Si tous les tests passent:
```
🎉 TOUS LES TESTS SONT PASSÉS !
✅ TomTom Telematics API est opérationnel
```

---

## Dépannage

### Problème 1: "Invalid API Key"

**Symptôme:**
```
❌ Échec du calcul d'itinéraire: Invalid API Key
```

**Solutions:**

1. Vérifiez que l'API Key est bien copiée (32 caractères)
2. Vérifiez qu'il n'y a pas d'espaces avant/après
3. Vérifiez que l'app a bien les APIs activées
4. Régénérez l'API Key si nécessaire

**Commande de vérification:**
```bash
echo $TOMTOM_API_KEY | wc -c
# Résultat attendu: 33 (32 + retour ligne)
```

---

### Problème 2: "Rate Limit Exceeded"

**Symptôme:**
```
❌ Erreur: 429 Too Many Requests
```

**Explication:**
Vous avez dépassé votre quota journalier (2,500 requêtes/jour en Free Tier)

**Solutions:**

1. Attendez le lendemain (reset à minuit UTC)
2. Passez à un plan payant
3. Optimisez votre code pour réduire les requêtes

**Monitoring du quota:**
```bash
# Vérifier le quota restant
curl -I "https://api.tomtom.com/search/2/geocode/Paris.json?key=YOUR_KEY" | grep X-Rate-Limit
```

---

### Problème 3: Temps de Réponse Élevé

**Symptôme:**
```
⚠️  Temps de réponse élevé (>5s)
```

**Solutions:**

1. Vérifiez votre connexion Internet
2. Utilisez le serveur TomTom le plus proche (Europe)
3. Activez le cache Redis pour les résultats
4. Utilisez le fallback Haversine pour les distances simples

---

### Problème 4: Géocodage Imprécis

**Symptôme:**
Adresses mal géocodées ou coordonnées incorrectes

**Solutions:**

1. Formatez mieux les adresses (inclure code postal et pays)
2. Utilisez le paramètre `countrySet=FR` pour limiter à la France
3. Augmentez le niveau de confiance minimum

**Exemple:**
```javascript
// Mauvais
await tomtom.geocodeAddress('10 rue paix');

// Bon
await tomtom.geocodeAddress('10 Rue de la Paix, 75002 Paris, France');
```

---

## FAQ

### Q1: L'API Key est-elle gratuite ?

**R:** Oui, le Free Tier est gratuit à vie avec 75,000 requêtes/mois.

### Q2: Puis-je utiliser TomTom en production ?

**R:** Oui, le Free Tier est utilisable en production si vous restez sous les quotas.

### Q3: Combien de temps pour activer l'API Key ?

**R:** Immédiat, dès la création de l'application.

### Q4: Puis-je changer de plan plus tard ?

**R:** Oui, vous pouvez upgrader/downgrader à tout moment depuis le dashboard.

### Q5: Les quotas se cumulent-ils ?

**R:** Non, ils se réinitialisent chaque jour/mois.

### Q6: Puis-je avoir plusieurs API Keys ?

**R:** Oui, créez plusieurs applications dans votre compte.

### Q7: Comment révoquer une API Key ?

**R:** Dans le dashboard, supprimez ou régénérez l'application.

### Q8: TomTom supporte-t-il les camions ?

**R:** Oui, utilisez `vehicleType: 'truck'` dans les options de routing.

### Q9: Y a-t-il un SLA sur le Free Tier ?

**R:** Non, le SLA 99.9% est réservé aux plans payants.

### Q10: Comment contacter le support ?

**R:** Community Forum: https://developer.tomtom.com/forum
Email (plans payants): apisupport@tomtom.com

---

## Ressources Supplémentaires

### Documentation Officielle

- **API Reference:** https://developer.tomtom.com/routing-api/documentation
- **SDK JavaScript:** https://developer.tomtom.com/maps-sdk-web-js
- **Exemples:** https://developer.tomtom.com/maps-sdk-web-js/functional-examples

### Outils Utiles

- **API Explorer:** https://developer.tomtom.com/api-explorer
- **Pricing Calculator:** https://developer.tomtom.com/pricing
- **Status Page:** https://status.tomtom.com/

### Code Samples

Repository GitHub: https://github.com/tomtom-international/tomtom-api-code-samples

---

## Prochaines Étapes

Après avoir configuré TomTom:

1. [ ] Configurer AWS Textract OCR (guides/AWS_TEXTRACT_SETUP_GUIDE.md)
2. [ ] Configurer Google Vision API (guides/GOOGLE_VISION_SETUP_GUIDE.md)
3. [ ] Tester tous les services ensemble
4. [ ] Déployer sur AWS Elastic Beanstalk
5. [ ] Configurer le monitoring des quotas

---

**Besoin d'aide ?**
Consultez la documentation complète: `CONFIGURATION_EXTERNE_AUTOMATISEE.md`

**Questions ?**
Contactez l'équipe RT SYMPHONI.A

---

*Ce guide est maintenu par l'équipe RT SYMPHONI.A*
*Dernière mise à jour: 2025-11-26*
