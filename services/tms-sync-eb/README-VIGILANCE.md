# Système de Vigilance des Transporteurs - Guide Complet

## 🎯 Vue d'ensemble

Le système de vigilance évalue automatiquement la fiabilité et la performance des transporteurs (carriers) synchronisés depuis Dashdoc. Il calcule un **score de 0 à 100%** basé sur 4 critères clés.

### Fonctionnalités principales
- ✅ Calcul automatique du score de vigilance
- ✅ Classification par niveau (N1-Premium, N1-Référence, Actif, N2-Invité, En Observation)
- ✅ API REST complète pour le frontend
- ✅ Synchronisation automatique toutes les 5 minutes
- ✅ Mise à jour des scores toutes les heures
- ✅ Statistiques globales de vigilance

---

## 📊 Score de Vigilance

### Critères de calcul (100 points max)

| Critère | Poids | Détail |
|---------|-------|--------|
| **Documents légaux** | 30% | SIRET (10), TVA (10), Licence (10) |
| **Performance** | 40% | Taux de ponctualité/qualité |
| **Activité récente** | 20% | Date de dernière commande |
| **Volume de commandes** | 10% | Nombre total de commandes |

### Niveaux de vigilance

| Score | Niveau | Description |
|-------|--------|-------------|
| 95-100% | **N1-Premium** | Excellent partenaire, tous critères au vert |
| 85-94% | **N1-Référence** | Bon partenaire de confiance |
| 70-84% | **Actif** | Partenaire actif avec quelques points à améliorer |
| 50-69% | **N2-Invité** | Partenaire occasionnel, vigilance requise |
| 0-49% | **En Observation** | Partenaire à surveiller |

---

## 🚀 Démarrage rapide

### 1. Le service est déjà actif
Le système de vigilance est intégré dans TMS Sync v2.3.0 et démarre automatiquement.

### 2. Tester la synchronisation
```bash
# Windows
test-vigilance.bat

# Linux/Mac
chmod +x test-vigilance.sh
./test-vigilance.sh
```

### 3. Tests manuels

#### Synchroniser les carriers depuis Dashdoc
```bash
curl -X POST http://localhost:3000/api/v1/jobs/carriersSync/run
```

#### Calculer les scores de vigilance
```bash
curl -X POST http://localhost:3000/api/v1/tms/carriers/vigilance/update-all
```

#### Récupérer les carriers
```bash
curl http://localhost:3000/api/v1/tms/carriers
```

#### Voir le score d'un carrier
```bash
curl http://localhost:3000/api/v1/tms/carriers/{id}/vigilance
```

---

## 📡 API Endpoints

### Liste des carriers
```http
GET /api/v1/tms/carriers?limit=50&skip=0&search=ACME&level=N1_premium
```

**Query params:**
- `limit`: Nombre de résultats (défaut: 50)
- `skip`: Offset pagination (défaut: 0)
- `search`: Recherche par nom ou SIRET
- `status`: Filtre par statut
- `level`: Filtre par niveau (`N1_premium`, `N1_referenced`, `active`, `N2_guest`, `observation`)

### Détails d'un carrier
```http
GET /api/v1/tms/carriers/:id
```

### Score de vigilance
```http
GET /api/v1/tms/carriers/:id/vigilance
```

### Mettre à jour un carrier
```http
POST /api/v1/tms/carriers/:id/vigilance/update
```

### Mettre à jour tous les carriers
```http
POST /api/v1/tms/carriers/vigilance/update-all
```

### Statistiques globales
```http
GET /api/v1/tms/carriers/vigilance/stats
```

---

## 🤖 Jobs automatiques

### carriersSync (5 minutes)
- Synchronise les carriers depuis Dashdoc
- Enrichit avec les statistiques de transports
- Calcule le nombre de commandes et le taux de qualité

### vigilanceUpdate (1 heure)
- Recalcule les scores de vigilance de tous les carriers
- Met à jour les niveaux de classification
- Génère des logs détaillés

### Exécution manuelle
```bash
# Sync carriers
curl -X POST http://localhost:3000/api/v1/jobs/carriersSync/run

# Update vigilance
curl -X POST http://localhost:3000/api/v1/jobs/vigilanceUpdate/run

# Voir le statut
curl http://localhost:3000/api/v1/jobs/status
```

---

## 📁 Structure des fichiers

```
services/tms-sync-eb/
├── index.js                           # API Express (MODIFIÉ)
├── scheduled-jobs.js                  # Jobs automatiques (MODIFIÉ)
├── services/
│   ├── tms-connection.service.js
│   └── vigilance.service.js           # ⭐ NOUVEAU - Service de vigilance
├── connectors/
│   └── dashdoc.connector.js           # Connector Dashdoc (existant)
│
├── VIGILANCE.md                       # ⭐ Documentation API
├── ARCHITECTURE_VIGILANCE.md          # ⭐ Architecture détaillée
├── IMPLEMENTATION_VIGILANCE.md        # ⭐ Guide d'implémentation
├── CHANGELOG.md                       # ⭐ Historique des versions
├── README-VIGILANCE.md                # ⭐ Ce fichier
│
├── test-vigilance.sh                  # ⭐ Tests Linux/Mac
└── test-vigilance.bat                 # ⭐ Tests Windows
```

---

## 💾 MongoDB

### Collection: carriers

```javascript
{
  _id: ObjectId("..."),
  companyName: "ACME Transport",
  siret: "12345678901234",
  vatNumber: "FR12345678901",
  totalOrders: 125,
  lastOrderAt: ISODate("2026-01-25T..."),
  score: 92,  // Taux Dashdoc

  // Score de vigilance
  vigilance: {
    score: 85,
    level: "N1-Référence",
    levelCode: "N1_referenced",
    checks: [...],
    calculatedAt: ISODate("...")
  },

  // Indexés pour requêtes rapides
  vigilanceScore: 85,
  vigilanceLevel: "N1_referenced",
  vigilanceUpdatedAt: ISODate("...")
}
```

### Indexation recommandée
```javascript
db.carriers.createIndex({ "vigilanceLevel": 1 });
db.carriers.createIndex({ "vigilanceScore": -1 });
db.carriers.createIndex({ "companyName": "text", "siret": "text" });
```

---

## 🎨 Intégration Frontend

### Exemple React

```jsx
import { useState, useEffect } from 'react';

function CarriersList() {
  const [carriers, setCarriers] = useState([]);

  useEffect(() => {
    fetch('/api/v1/tms/carriers?limit=50')
      .then(res => res.json())
      .then(data => setCarriers(data.carriers));
  }, []);

  const getScoreBadge = (score) => {
    if (score >= 90) return { color: 'green', label: 'Excellent' };
    if (score >= 75) return { color: 'blue', label: 'Bon' };
    if (score >= 50) return { color: 'orange', label: 'Moyen' };
    return { color: 'red', label: 'Faible' };
  };

  return (
    <table>
      <thead>
        <tr>
          <th>Nom</th>
          <th>Score</th>
          <th>Niveau</th>
        </tr>
      </thead>
      <tbody>
        {carriers.map(carrier => {
          const badge = getScoreBadge(carrier.vigilanceScore);
          return (
            <tr key={carrier._id}>
              <td>{carrier.companyName}</td>
              <td>
                <span className={`badge-${badge.color}`}>
                  {carrier.vigilanceScore}%
                </span>
              </td>
              <td>{carrier.vigilance?.level}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

### Filtres par niveau

```jsx
// Récupérer uniquement les N1-Premium
fetch('/api/v1/tms/carriers?level=N1_premium')

// Recherche
fetch('/api/v1/tms/carriers?search=ACME')

// Combinaison
fetch('/api/v1/tms/carriers?level=N1_premium&search=Transport')
```

---

## 📈 Monitoring

### Vérifier le statut des jobs
```bash
curl http://localhost:3000/api/v1/jobs/status | jq '.status.jobs'
```

### Voir les statistiques
```bash
curl http://localhost:3000/api/v1/tms/carriers/vigilance/stats | jq '.'
```

### Logs Docker
```bash
docker logs tms-sync-eb --tail=100 -f
```

Les logs affichent:
```
🔄 [CRON] Running carriers sync...
✅ [CRON CARRIERS] 125 carriers synchronized

🔄 [CRON] Running vigilance update...
[VIGILANCE] ✓ ACME Transport: 85% (N1-Référence)
[VIGILANCE] ✓ XYZ Logistics: 92% (N1-Premium)
✅ [CRON VIGILANCE] 124/125 carriers updated
```

---

## 🔍 Détail du calcul

### Documents légaux (30 points)
```
✅ SIRET valide (14 chiffres):     0 pénalité
❌ SIRET manquant/invalide:        -10 points

✅ Numéro TVA présent:              0 pénalité
❌ TVA manquante:                   -10 points

✅ Licence de transport présente:   0 pénalité
❌ Licence manquante:               -10 points
```

### Performance (40 points)
```
Taux de qualité >= 95%:    0 pénalité
Taux 85-94%:               -5 points
Taux 70-84%:               -15 points
Taux 50-69%:               -30 points
Taux < 50%:                -40 points
```

### Activité récente (20 points)
```
Dernière commande < 1 semaine:      0 pénalité
1 semaine - 1 mois:                 -3 points
1-3 mois:                           -8 points
3-6 mois:                           -15 points
> 6 mois:                           -20 points
Aucune commande:                    -20 points
```

### Volume de commandes (10 points)
```
>= 50 commandes:           0 pénalité
20-49 commandes:           -2 points
5-19 commandes:            -5 points
1-4 commandes:             -8 points
0 commandes:               -10 points
```

---

## ✅ Checklist de déploiement

- [x] Service de vigilance créé (`services/vigilance.service.js`)
- [x] Endpoints carriers ajoutés dans `index.js`
- [x] Jobs scheduled configurés dans `scheduled-jobs.js`
- [x] Documentation complète créée
- [x] Scripts de test fournis
- [x] Version mise à jour (2.2.0 → 2.3.0)

---

## 🆘 Support

### Documentation
- **API**: Voir `VIGILANCE.md`
- **Architecture**: Voir `ARCHITECTURE_VIGILANCE.md`
- **Implémentation**: Voir `IMPLEMENTATION_VIGILANCE.md`
- **Changelog**: Voir `CHANGELOG.md`

### Problèmes courants

#### Les carriers ne se synchronisent pas
```bash
# Vérifier la connexion Dashdoc
curl http://localhost:3000/api/v1/tms/connections

# Lancer une sync manuelle
curl -X POST http://localhost:3000/api/v1/jobs/carriersSync/run
```

#### Les scores ne se mettent pas à jour
```bash
# Vérifier que les carriers existent
curl http://localhost:3000/api/v1/tms/carriers

# Lancer le calcul manuellement
curl -X POST http://localhost:3000/api/v1/tms/carriers/vigilance/update-all
```

#### Vérifier les jobs
```bash
# Voir le statut
curl http://localhost:3000/api/v1/jobs/status

# Voir les logs
docker logs tms-sync-eb
```

---

## 🔮 Prochaines étapes

### Améliorations possibles
- [ ] Historique des scores de vigilance
- [ ] Alertes email quand un score descend
- [ ] Configuration des poids des critères
- [ ] Export PDF des rapports de vigilance
- [ ] Dashboard avec graphiques d'évolution
- [ ] Badges/certifications automatiques

### Feedback
Pour toute suggestion ou question, consulter la documentation ou contacter l'équipe de développement.

---

## 📝 Notes de version

**Version actuelle**: 2.3.0 (2026-01-30)

**Nouveautés**:
- Système de vigilance complet
- 6 nouveaux endpoints API
- 2 nouveaux jobs automatiques
- Documentation exhaustive
- Scripts de test

**Compatibilité**:
- TMS Sync API v2.3.0+
- MongoDB 4.4+
- Dashdoc API v4
- Node.js 18+

---

## 🎓 Exemples d'utilisation

### Scénario 1: Afficher tous les carriers N1-Premium
```bash
curl "http://localhost:3000/api/v1/tms/carriers?level=N1_premium&limit=100" | jq '.carriers[] | {name: .companyName, score: .vigilanceScore}'
```

### Scénario 2: Rechercher un carrier et voir son score
```bash
# Rechercher
CARRIER_ID=$(curl -s "http://localhost:3000/api/v1/tms/carriers?search=ACME" | jq -r '.carriers[0]._id')

# Voir la vigilance
curl "http://localhost:3000/api/v1/tms/carriers/$CARRIER_ID/vigilance" | jq '.'
```

### Scénario 3: Dashboard de vigilance
```bash
# Stats globales
curl "http://localhost:3000/api/v1/tms/carriers/vigilance/stats" | jq '.stats'

# Répartition par niveau
curl "http://localhost:3000/api/v1/tms/carriers/vigilance/stats" | jq '.stats.byLevel'

# Score moyen
curl "http://localhost:3000/api/v1/tms/carriers/vigilance/stats" | jq '.stats.averageScore'
```

---

**Documentation mise à jour le 30 janvier 2026**
