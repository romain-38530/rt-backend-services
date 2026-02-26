# 🎯 Solution SMS + GPS Tracking - Résumé Complet

**Date**: 26 février 2026
**Problème**: Trop de SMS automatiques envoyés aux chauffeurs + SMS ne fonctionnent pas
**Solution**: Remplacer SMS automatiques par tracking GPS Vehizen + SMS manuels seulement

---

## 📋 Problèmes Résolus

### Avant ❌
- ✗ SMS automatiques envoyés pour chaque petit retard (30min, 45min, etc.)
- ✗ Trop de messages → Chauffeurs spammés
- ✗ SMS ne fonctionnent pas → Chauffeurs ne reçoivent rien
- ✗ Pas de tracking GPS → Aucune visibilité position réelle

### Après ✅
- ✓ **Aucun SMS automatique** → Envoi manuel uniquement
- ✓ **Tracking GPS en temps réel** → Positions Vehizen affichées
- ✓ **Seuils intelligents** → SMS autorisé seulement si retard > 2h
- ✓ **Cooldown 24h** → Max 1 SMS par transport par jour
- ✓ **Historique SMS** → Traçabilité complète

---

## 🔧 Fichiers Créés (Backend)

### 1. Routes API

| Fichier | Description | Endpoints |
|---------|-------------|-----------|
| `routes/tracking-gps.routes.js` | Positions GPS Vehizen | `/api/v1/tracking-gps/*` |
| `routes/driver-alerts.routes.js` | Gestion SMS manuels | `/api/v1/driver-alerts/*` |

### 2. Services

| Fichier | Description |
|---------|-------------|
| `services/driver-alerts.service.js` | Logique métier alertes (seuils, cooldown, envoi SMS) |

### 3. Documentation

| Fichier | Description |
|---------|-------------|
| `FRONTEND-TRACKING-GPS-GUIDE.md` | Guide complet intégration frontend |
| `SOLUTION-SMS-GPS-TRACKING.md` | Ce fichier |

---

## 📡 Nouvelles APIs Disponibles

### Tracking GPS

```bash
# Position GPS d'un transport
GET /api/v1/tracking-gps/transport/:transportUid

# Position GPS d'un véhicule
GET /api/v1/tracking-gps/vehicle/:licensePlate

# Toutes les positions actives
GET /api/v1/tracking-gps/active
```

### Alertes Chauffeurs

```bash
# Évaluer un retard
POST /api/v1/driver-alerts/evaluate
Body: { "delayMinutes": 45 }

# Envoyer SMS manuel
POST /api/v1/driver-alerts/send-sms
Body: {
  "transportUid": "...",
  "driverPhone": "+33...",
  "message": "...",
  "delayMinutes": 120,
  "userId": "...",
  "userName": "..."
}

# Vérifier si SMS possible (cooldown)
GET /api/v1/driver-alerts/can-send/:transportUid

# Historique SMS d'un transport
GET /api/v1/driver-alerts/history/:transportUid

# Statistiques SMS
GET /api/v1/driver-alerts/stats?period=7d

# Seuils configurés
GET /api/v1/driver-alerts/thresholds
```

---

## ⚙️ Règles de Gestion

### Seuils de Retard

| Retard | Niveau | Action UI | SMS Autorisé |
|--------|--------|-----------|--------------|
| < 30 min | None | Aucune alerte | ❌ Non |
| 30-60 min | Minor | Alerte jaune | ❌ Non |
| 60-120 min | Medium | Alerte orange + Bouton | ⚠️ Optionnel |
| 120-180 min | High | Alerte rouge + Recommandé | ✅ Oui |
| > 180 min | Critical | Alerte critique | ✅ Oui (Urgent) |

### Cooldown SMS

- **24 heures** entre 2 SMS pour le même transport
- Empêche le spam même en cas d'envoi manuel

### Validation

- Retard minimum **60 minutes** pour autoriser SMS
- Numéro téléphone chauffeur obligatoire
- Message personnalisé obligatoire
- Traçabilité complète (qui, quand, pourquoi)

---

## 🚀 Modifications Backend

### index.js

```javascript
// Nouvelles routes ajoutées:
app.use('/api/v1/tracking-gps', authenticateToken, trackingGPSRoutes);
app.use('/api/v1/driver-alerts', authenticateToken, driverAlertsRoutes);

// Initialisation databases:
trackingGPSRoutes.setDatabases(db, null); // TODO: ajouter ordersDb
driverAlertsRoutes.setDatabase(db);
```

---

## 🎨 Modifications Frontend Nécessaires

### 1. Désactiver SMS Automatiques

Chercher et **SUPPRIMER** dans le code frontend:

```javascript
// ❌ Code à SUPPRIMER:
if (delayMinutes > 30) {
  await sendSMS(driverPhone, message);
}

// ❌ Aussi SUPPRIMER toute logique d'envoi automatique
onDelayDetected() {
  this.sendAutomaticSMS(); // SUPPRIMER
}
```

### 2. Ajouter Composant GPS

```jsx
import TrackingGPSCard from './components/TrackingGPSCard';

// Dans la page de détail transport:
<TrackingGPSCard
  transportUid={transport.uid}
  delayMinutes={calculateDelay(transport)}
  driverPhone={transport.assignedCarrier?.carrierPhone}
/>
```

### 3. Intégrer Carte GPS

```jsx
import { MapContainer, TileLayer, Marker } from 'react-leaflet';

// Afficher position sur carte:
{position && (
  <MapContainer center={[position.latitude, position.longitude]} zoom={13}>
    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <Marker position={[position.latitude, position.longitude]}>
      <Popup>Véhicule {vehiclePlate}</Popup>
    </Marker>
  </MapContainer>
)}
```

---

## 📊 Exemple Flux Utilisateur

### Scénario: Transport en retard de 90 minutes

1. **UI affiche**:
   - 🗺️ Position GPS en temps réel du véhicule
   - ⚠️ Badge orange "Retard 90 min"
   - 📱 Bouton "Envoyer SMS Manuel" (activé car > 60min)

2. **Utilisateur clique** "Envoyer SMS Manuel"

3. **Modal s'ouvre**:
   - Message pré-rempli: "Transport retardé de 90min. Peux-tu confirmer ton ETA ?"
   - Possibilité de personnaliser
   - Warning: "Max 1 SMS par 24h"

4. **Backend valide**:
   - Retard > 60min ✅
   - Pas de SMS envoyé dans les 24h ✅
   - Numéro téléphone valide ✅

5. **SMS envoyé via AWS SNS**:
   - Chauffeur reçoit le SMS
   - Historique enregistré en base
   - Cooldown activé (24h)

6. **UI mise à jour**:
   - ✅ "SMS envoyé à 11:34"
   - Bouton désactivé pendant 24h
   - Historique visible

---

## 🔐 Sécurité

- **Authentification** : Toutes les routes nécessitent token JWT
- **Rate Limiting** : Cooldown 24h par transport
- **Validation** : Seuils minimums obligatoires
- **Audit Trail** : Tous les SMS enregistrés en base
- **AWS SNS** : Service géré, sécurisé, fiable

---

## 📦 Déploiement

### Backend

```bash
# Commit
git add routes/ services/ index.js
git commit -m "feat(tracking): Add GPS tracking + manual SMS alerts

- Add GPS tracking from Vehizen data lake
- Replace automatic SMS with manual-only alerts
- Add delay thresholds and 24h cooldown
- Add SMS history and statistics"

# Déployer
git push origin main
# Puis déployer sur Elastic Beanstalk (voir procédure habituelle)
```

### Frontend

```bash
# Désactiver SMS automatiques
# Ajouter composant TrackingGPSCard
# Intégrer carte GPS
# Déployer sur CloudFront/Amplify
```

---

## ✅ Checklist Mise en Production

### Backend
- [x] Routes tracking-gps créées
- [x] Routes driver-alerts créées
- [x] Service driver-alerts créé
- [x] Integration dans index.js
- [ ] Déploiement Elastic Beanstalk
- [ ] Test API endpoints
- [ ] Vérification AWS SNS permissions

### Frontend
- [ ] Désactiver envoi automatique SMS
- [ ] Ajouter composant TrackingGPSCard
- [ ] Intégrer carte GPS (Leaflet/Google Maps)
- [ ] Ajouter bouton SMS manuel
- [ ] Tester workflow complet
- [ ] Déploiement production

### Tests
- [ ] Test position GPS temps réel
- [ ] Test évaluation retards (tous niveaux)
- [ ] Test envoi SMS manuel
- [ ] Test cooldown 24h
- [ ] Test historique SMS
- [ ] Test aucun SMS automatique

### Monitoring
- [ ] Logs AWS SNS
- [ ] Métriques envoi SMS
- [ ] Dashboard positions GPS
- [ ] Alertes erreurs SMS

---

## 📞 Support

En cas de problème:
1. Vérifier logs Elastic Beanstalk: `/api/v1/monitoring/dashdoc`
2. Vérifier permissions AWS SNS
3. Vérifier connexion Vehizen data lake
4. Consulter historique SMS: `/api/v1/driver-alerts/stats`

---

**Auteur**: Claude Sonnet 4.5
**Date**: 26 février 2026
**Version**: 1.0
