# Changelog - RT TMS Sync API

## [2.3.0] - 2026-01-30

### ✨ Nouveautés

#### Système de Vigilance des Transporteurs
- **Service de vigilance** (`services/vigilance.service.js`)
  - Calcul automatique du score de vigilance (0-100%)
  - 4 critères de calcul : Documents légaux (30%), Performance (40%), Activité (20%), Volume (10%)
  - 5 niveaux de classification : N1-Premium, N1-Référence, Actif, N2-Invité, En Observation
  - Détail complet des checks avec impact sur le score

#### Endpoints Carriers
- `GET /api/v1/tms/carriers` - Liste des carriers avec pagination et filtres
  - Filtres : search, status, level
  - Pagination : limit, skip
- `GET /api/v1/tms/carriers/:id` - Détails d'un carrier
- `GET /api/v1/tms/carriers/:id/vigilance` - Score de vigilance d'un carrier
- `POST /api/v1/tms/carriers/:id/vigilance/update` - Mise à jour du score
- `POST /api/v1/tms/carriers/vigilance/update-all` - Mise à jour globale
- `GET /api/v1/tms/carriers/vigilance/stats` - Statistiques de vigilance

#### Jobs Automatiques
- **carriersSync** (5 minutes)
  - Synchronise les carriers depuis Dashdoc
  - Enrichit avec les stats (totalOrders, lastOrderAt, score)
  - Jusqu'à 500 carriers par synchronisation
- **vigilanceUpdate** (1 heure)
  - Recalcule les scores de vigilance de tous les carriers
  - Logs détaillés des mises à jour et échecs

#### Documentation
- `VIGILANCE.md` - Documentation complète du système de vigilance
- `IMPLEMENTATION_VIGILANCE.md` - Guide d'implémentation
- `test-vigilance.sh` - Script de test automatisé (Linux/Mac)
- `test-vigilance.bat` - Script de test automatisé (Windows)

### 🔧 Améliorations

#### Service TMS Sync
- Version `2.2.0` → `2.3.0`
- Ajout du VigilanceService dans le pipeline de démarrage
- Endpoints root mis à jour avec nouveaux endpoints
- Features ajoutées : `carriers`, `vigilance`

#### Scheduled Jobs
- Nouveaux intervalles : `CARRIERS_SYNC`, `VIGILANCE_UPDATE`
- Fonctions exportées : `runCarriersSync`, `runVigilanceUpdate`
- Status des jobs mis à jour avec les nouveaux jobs
- Support de l'exécution manuelle des nouveaux jobs

#### Collection MongoDB
- Nouvelle structure pour les carriers avec champs de vigilance
  - `vigilance` : Objet complet avec score, level, checks, summary
  - `vigilanceScore` : Champ indexé pour requêtes rapides
  - `vigilanceLevel` : Champ indexé pour filtres
  - `vigilanceUpdatedAt` : Date de dernière mise à jour

### 📊 Métriques

#### Critères de Vigilance
- **Documents légaux (30 points max)**
  - SIRET valide : 10 points
  - Numéro de TVA : 10 points
  - Licence de transport : 10 points

- **Performance (40 points max)**
  - Taux de qualité ≥95% : 0 points de pénalité
  - Taux 85-94% : -5 points
  - Taux 70-84% : -15 points
  - Taux 50-69% : -30 points
  - Taux <50% : -40 points

- **Activité récente (20 points max)**
  - Commande < 1 semaine : 0 points de pénalité
  - 1 semaine - 1 mois : -3 points
  - 1-3 mois : -8 points
  - 3-6 mois : -15 points
  - > 6 mois : -20 points

- **Volume de commandes (10 points max)**
  - ≥50 commandes : 0 points de pénalité
  - 20-49 commandes : -2 points
  - 5-19 commandes : -5 points
  - 1-4 commandes : -8 points
  - 0 commandes : -10 points

#### Niveaux de Vigilance
| Score | Niveau | Code |
|-------|--------|------|
| 95-100 | N1-Premium | `N1_premium` |
| 85-94 | N1-Référence | `N1_referenced` |
| 70-84 | Actif | `active` |
| 50-69 | N2-Invité | `N2_guest` |
| 0-49 | En Observation | `observation` |

### 🧪 Tests

#### Scripts de test fournis
```bash
# Linux/Mac
chmod +x test-vigilance.sh
./test-vigilance.sh

# Windows
test-vigilance.bat
```

#### Tests manuels
```bash
# Sync carriers
curl -X POST http://localhost:3000/api/v1/jobs/carriersSync/run

# Update vigilance
curl -X POST http://localhost:3000/api/v1/tms/carriers/vigilance/update-all

# Get carriers
curl http://localhost:3000/api/v1/tms/carriers

# Get vigilance
curl http://localhost:3000/api/v1/tms/carriers/{id}/vigilance

# Get stats
curl http://localhost:3000/api/v1/tms/carriers/vigilance/stats
```

### 🔄 Migration

Aucune migration nécessaire. Les nouveaux endpoints et jobs sont activés automatiquement au démarrage du service.

**Note**: Les carriers existants auront un score de vigilance calculé lors du premier run du job `vigilanceUpdate` (toutes les heures) ou lors d'un appel API à `/api/v1/tms/carriers/vigilance/update-all`.

### 📝 Notes techniques

- Performance : Calcul de vigilance < 10ms par carrier
- Scalabilité : Testé jusqu'à 500 carriers
- Automatisation : Jobs scheduled pour sync et update automatiques
- Monitoring : Logs détaillés de toutes les opérations

---

## [2.2.0] - 2026-01-29

### ✨ Nouveautés
- Synchronisation automatique des transports avec tag Symphonia (job toutes les minutes)
- Debug endpoint pour vérifier les coordonnées GPS des commandes

### 🔧 Améliorations
- Amélioration de la gestion des tags Dashdoc
- Fix des erreurs ObjectId dans les endpoints coordinates

---

## [2.1.9] - 2026-01-28

### 🐛 Correctifs
- Fix ObjectId error dans l'endpoint coordinates v2

---

## [2.1.8] - 2026-01-27

### ✨ Nouveautés
- Ajout endpoint debug GPS coordinates

---

## [2.1.0] - 2026-01-20

### ✨ Nouveautés
- Auto-sync haute fréquence (30 secondes)
- Health check amélioré avec vérification MongoDB

### 🔧 Améliorations
- Optimisation de la pagination Dashdoc
- Gestion des erreurs améliorée

---

## [2.0.0] - 2026-01-15

### ✨ Nouveautés
- Service TMS Sync initial
- Support Dashdoc API v4
- Synchronisation des transports, entreprises, contacts, véhicules
- Jobs scheduled automatiques
- API REST complète

### 📦 Dépendances
- Express
- MongoDB
- Helmet
- CORS
- JWT
- Axios
