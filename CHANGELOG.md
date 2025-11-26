# Changelog - SYMPHONI.A

Historique des versions et modifications du projet SYMPHONI.A.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---

## [1.6.2-mailgun-fixed] - 2025-11-25

### ✨ Ajouté
- **Intégration Mailgun complète** pour tracking basic email
  - Remplacement de SendGrid par Mailgun
  - Fonction `sendMailgunEmail()` dans tracking-basic-service.js
  - Support des templates HTML personnalisés
- **Dépendances:** mailgun.js v9.4.1, form-data v4.0.5

### 🔧 Modifié
- tracking-basic-service.js: Intégration Mailgun (lignes 8-9, 95-147)
- package.json: Ajout mailgun.js et form-data

### 📝 Documentation
- Mise à jour CONFIGURATION_SENDGRID_EMAIL.md (obsolète)
- Note sur migration SendGrid → Mailgun

### 🐛 Corrigé
- Fix placeholder TODO pour envoi d'emails
- Configuration variables d'environnement Mailgun

**Commit:** `b6676f2`, `a967e7c`
**Déploiement:** rt-subscriptions-api-prod (Green)

---

## [1.6.1-fixed] - 2025-11-25

### 🐛 Corrigé
- **Bundle corruption Windows:** Remplacement tar -a par PowerShell Compress-Archive
- Validation bundle avec unzip -t avant déploiement
- Script create-bundle-v1.6.1-fixed.js avec fallback 7zip

### 🚀 Déploiement
- Bundle 106 KB (vs 490 KB corrompu)
- Tous les 30 fichiers JS correctement packagés
- Déploiement réussi après fix

**Commit:** `7cd7336`
**Issue:** ZIP End-of-central-directory signature not found

---

## [1.6.0-complete] - 2025-11-25

### ✨ Ajouté

#### Tracking Basic Email (50€/mois)
- **tracking-basic-service.js** (740 lignes)
  - Envoi emails Mailgun avec 7 liens de mise à jour statut
  - 3 liens upload documents (BL, CMR, POD)
  - Tokens sécurisés SHA-256 avec expiration 24h
  - Anti-replay protection avec nonce
  - 6 statuts: En route, Arrivé, Chargement, Chargé, Livraison, Livré

#### OCR Integration (AWS + Google)
- **ocr-integration-service.js** (644 lignes)
  - AWS Textract intégration (primaire)
  - Google Vision API fallback
  - Extraction automatique: BL numbers, dates, quantités, signatures
  - Détection réserves et anomalies
  - Support formats: PDF, PNG, JPG, TIFF

### 🔧 Modifié
- **transport-orders-routes.js:** +507 lignes (25+ nouveaux endpoints)
  - 3 endpoints tracking basic email
  - 2 endpoints OCR extraction/résultats
  - Intégration services v1.5.0

### 📊 Statut
- **Conformité:** 100% (14/14 modules)
- **Endpoints:** 50+ opérationnels
- **Services:** 30 fichiers JS déployés

**Commit:** `7e2e2b8`
**Déploiement:** rt-subscriptions-api-prod v1.6.0-complete

---

## [1.5.0-services] - 2025-11-25

### ✨ Ajouté

#### 5 Nouveaux Services (2,800+ lignes)

1. **document-management-service.js** (464 lignes)
   - Upload documents (BL, CMR, POD)
   - Validation manuelle/automatique
   - Stockage S3 avec URLs signées
   - Versioning et historique

2. **carrier-scoring-service.js** (495 lignes)
   - Calcul score 0-100 points
   - 6 critères: Ponctualité (25%), RDV (15%), Tracking (15%), POD (15%), Chargement (20%), Incidents (10%)
   - Historique et évolution
   - Badges et certifications

3. **order-closure-service.js** (528 lignes)
   - Workflow 8 étapes de clôture
   - Archivage légal 10 ans
   - Génération preuve de transport
   - Synchronisation ERP
   - Statistiques industrielles

4. **rdv-management-service.js** (415 lignes)
   - Demande rendez-vous chargement/livraison
   - Confirmation/annulation
   - Notifications automatiques
   - Gestion créneaux horaires

5. **eta-monitoring-service.js** (427 lignes)
   - Calcul ETA temps réel
   - Détection retards (WARNING: 30min, CRITICAL: 60min)
   - Recalcul automatique toutes les 5 min
   - Historique et prédictions

### 📝 Documentation
- 5 nouveaux endpoints par service (~25 total)
- Exemples curl et Postman

**Commit:** `7daf60d`
**Déploiement:** rt-subscriptions-api-prod v1.5.0-services (Green)

---

## [1.4.0] - 2025-11-XX

### ✨ Ajouté
- **dispatch-chain-service.js:** Cascade de dispatch automatique
  - Notification 5 transporteurs max en séquence
  - Timeout 30 minutes par transporteur
  - Escalade automatique vers Affret.IA si échec
  - Scoring et matching intelligent

### 🔧 Modifié
- Ajout logique priorité transporteurs (score + lane affinity)

**Endpoints:**
- POST /api/transport-orders/:orderId/dispatch/chain
- GET /api/transport-orders/:orderId/dispatch/chain
- POST /api/transport-orders/:orderId/dispatch/carrier/:carrierId/respond
- POST /api/transport-orders/:orderId/dispatch/escalate

---

## [1.3.2] - 2025-11-XX

### ✨ Ajouté
- **lane-matching-service.js:** Matching intelligent des lanes
  - Clustering géographique (rayon 50km)
  - Calcul score de match 0-100
  - Historique et fréquence lanes
  - Optimisation routes

### 🔧 Modifié
- Algorithme de distance géographique amélioré
- Index MongoDB sur coordinates pour performance

**Endpoints:**
- POST /api/transport-orders/lanes
- GET /api/transport-orders/lanes
- GET /api/transport-orders/:orderId/lane-match
- PUT /api/transport-orders/lanes/:laneId
- DELETE /api/transport-orders/lanes/:laneId

---

## [1.2.0] - 2025-11-XX

### ✨ Ajouté
- **geofencing-service.js:** Zones géographiques
  - 4 zones configurables: 500m, 1km, 2km, 5km
  - Détection entrée/sortie automatique
  - Notifications multi-canaux (email, SMS, webhook)
  - Historique des événements

### 📊 Métriques
- Temps de détection: < 30 secondes
- Précision: ±10 mètres

**Endpoints:**
- POST /api/transport-orders/:orderId/geofences
- GET /api/transport-orders/:orderId/geofences
- POST /api/transport-orders/:orderId/geofences/:geofenceId/check

---

## [1.1.0] - 2025-11-XX

### ✨ Ajouté
- **tracking-service.js:** Tracking GPS Premium TomTom
  - Intégration TomTom Telematics API
  - Position temps réel (mise à jour 30s)
  - Calcul route optimale avec traffic
  - ETA dynamique
  - Historique 90 jours

### 💰 Coût
- 4€/véhicule/mois

**Endpoints:**
- POST /api/transport-orders/:orderId/tracking/start
- POST /api/transport-orders/:orderId/tracking/update
- GET /api/transport-orders/:orderId/tracking
- POST /api/transport-orders/:orderId/tracking/stop

---

## [1.0.0] - 2025-11-XX

### ✨ Ajouté
- **transport-orders-service.js:** CRUD commandes de transport
  - Création, lecture, mise à jour, suppression
  - Gestion statuts (8 états)
  - Assignation transporteurs
  - Validation données

### 🗄️ Collections MongoDB
- `transport_orders`
- `tracking_events`
- `geofences`
- `lanes`

**Endpoints:**
- POST /api/transport-orders
- GET /api/transport-orders/:orderId
- PUT /api/transport-orders/:orderId
- DELETE /api/transport-orders/:orderId
- GET /api/transport-orders
- POST /api/transport-orders/:orderId/assign
- PUT /api/transport-orders/:orderId/status/:status

---

## [2.3.1-fixed] - 2025-11-25 (authz-eb)

### 🐛 Corrigé
- **Bundle corruption:** Même fix que subscriptions-eb
- PowerShell Compress-Archive au lieu de tar
- Bundle 30 KB (vs corrompu)

**Déploiement:** rt-authz-api-prod (Green)

---

## [2.3.0-onboarding] - 2025-11-25 (authz-eb)

### ✨ Ajouté
- **Endpoint onboarding:** POST /api/onboarding/submit
  - Inscription nouveaux utilisateurs/sociétés
  - Validation email + company name
  - Détection doublons (email unique)
  - Capture IP + User-Agent pour audit
  - Collection MongoDB `onboarding_requests`

### 📝 Schéma Données
```javascript
{
  email: String (required, unique, lowercase),
  companyName: String (required),
  siret: String (optional),
  vatNumber: String (optional),
  phone: String (optional),
  address: Object (optional),
  subscriptionType: String (optional),
  source: String (default: 'WEB'),
  status: String (default: 'pending'),
  createdAt: Date,
  updatedAt: Date
}
```

### 🔧 Validation
- Format email: regex
- Lowercase automatique
- Trimming strings
- Code erreur 409 pour doublons

**Commit:** `b12fa35`
**Tests:** 6 inscriptions réussies

---

## [2.0.1] - 2025-11-XX (authz-eb)

### 🐛 Corrigé
- **Validation TVA VIES:** Utilisation champ `isValid` au lieu de `valid`
- Gestion timeout API VIES (15 secondes)
- Fallback validation format si VIES indisponible

### 🔧 Modifié
- Amélioration error handling VIES API
- Logs détaillés pour debugging

**Commit:** `6de015d`
**Issue:** TVA valides marquées comme invalides

---

## [2.0.0] - 2025-11-XX (authz-eb)

### ✨ Ajouté
- **Validation TVA intracommunautaire**
  - POST /api/vat/validate-format: Validation format (regex par pays)
  - POST /api/vat/validate: Validation VIES REST API (existence)
  - POST /api/vat/calculate-price: Calcul prix TTC avec TVA par pays
  - Support 27 pays UE + UK

### 📊 Taux TVA
- France: 20%
- Allemagne: 19%
- Belgique: 21%
- etc. (27 pays configurés)

---

## Versions à Venir

### [2.0.0-dashboard] - Prévu Q1 2026
- Dashboard web temps réel Next.js
- Carte interactive Mapbox
- WebSocket pour updates temps réel
- Analytics et rapports
- Système d'alertes configurable

**Durée estimée:** 10 semaines

### [2.0.0-mobile] - Prévu Q1 2026
- Application mobile React Native
- GPS tracking en arrière-plan
- QR Code pairing
- Upload photos documents
- Mode offline

**Durée estimée:** 8 semaines

### [3.0.0-ai] - Prévu Q2 2026
- Machine Learning prédiction retards
- Recommandation transporteurs
- Optimisation routes multi-points
- Chatbot support client

---

## Notes de Version

### Politique de Versioning

**Format:** MAJOR.MINOR.PATCH

- **MAJOR:** Changements incompatibles avec versions précédentes
- **MINOR:** Nouvelles fonctionnalités rétro-compatibles
- **PATCH:** Corrections de bugs rétro-compatibles

### Tags Git

```bash
# Lister les tags
git tag

# Voir les détails d'un tag
git show v1.6.2

# Créer un nouveau tag
git tag -a v1.7.0 -m "Release v1.7.0: WebSocket server"
git push origin v1.7.0
```

---

**Dernière mise à jour:** 26 novembre 2025

🤖 Generated with [Claude Code](https://claude.com/claude-code)
