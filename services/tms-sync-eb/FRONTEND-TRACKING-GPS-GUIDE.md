# Guide Frontend - Tracking GPS + Alertes Chauffeurs

## 🎯 Objectif

Remplacer l'envoi automatique de SMS par :
1. **Affichage positions GPS en temps réel** (Vehizen)
2. **Envoi manuel de SMS** uniquement pour gros retards (> 2h)

---

## 📡 Nouvelles APIs Backend

### 1. Récupérer Position GPS d'un Transport

```javascript
// GET /api/v1/tracking-gps/transport/:transportUid
const response = await fetch(
  `https://rt-tms-sync-api-prod.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com/api/v1/tracking-gps/transport/${transportUid}`
);

const data = await response.json();

// Réponse:
{
  "success": true,
  "transport": {
    "uid": "abc-123",
    "sequentialId": 33156996,
    "status": "ongoing",
    "vehiclePlate": "AB-123-CD"
  },
  "position": {
    "latitude": 48.8566,
    "longitude": 2.3522,
    "timestamp": "2026-02-26T10:15:00Z",
    "speed": 85,
    "heading": 180,
    "ageMinutes": 5,
    "isRecent": true
  }
}
```

### 2. Évaluer un Retard

```javascript
// POST /api/v1/driver-alerts/evaluate
const response = await fetch(
  'https://rt-tms-sync-api-prod.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com/api/v1/driver-alerts/evaluate',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delayMinutes: 45 })
  }
);

const data = await response.json();

// Réponse:
{
  "success": true,
  "delayMinutes": 45,
  "level": "minor",
  "action": "ui_alert",
  "message": "Retard modéré, surveiller via GPS"
}
```

### 3. Envoyer SMS Manuel (Seulement Gros Retard)

```javascript
// POST /api/v1/driver-alerts/send-sms
const response = await fetch(
  'https://rt-tms-sync-api-prod.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com/api/v1/driver-alerts/send-sms',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transportUid: "abc-123",
      driverPhone: "+33612345678",
      message: "Transport retardé de 2h. Peux-tu confirmer ton ETA ?",
      delayMinutes: 120,
      userId: "user-123",
      userName: "Jean Dupont"
    })
  }
);

const data = await response.json();

// Réponse:
{
  "success": true,
  "messageId": "sns-msg-123",
  "message": "SMS envoyé avec succès"
}
```

---

## 🎨 Composant React - Exemple

### TrackingGPSCard.jsx

```jsx
import React, { useState, useEffect } from 'react';
import { MapPin, Phone, AlertTriangle } from 'lucide-react';

function TrackingGPSCard({ transportUid, delayMinutes }) {
  const [position, setPosition] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGPSPosition();
    evaluateDelay();

    // Rafraîchir toutes les 30 secondes
    const interval = setInterval(fetchGPSPosition, 30000);
    return () => clearInterval(interval);
  }, [transportUid, delayMinutes]);

  const fetchGPSPosition = async () => {
    try {
      const response = await fetch(
        `/api/v1/tracking-gps/transport/${transportUid}`
      );
      const data = await response.json();

      if (data.success) {
        setPosition(data.position);
      }
    } catch (error) {
      console.error('Erreur GPS:', error);
    } finally {
      setLoading(false);
    }
  };

  const evaluateDelay = async () => {
    if (!delayMinutes) return;

    try {
      const response = await fetch('/api/v1/driver-alerts/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delayMinutes })
      });
      const data = await response.json();

      if (data.success) {
        setEvaluation(data);
      }
    } catch (error) {
      console.error('Erreur évaluation:', error);
    }
  };

  const sendManualSMS = async () => {
    if (!evaluation || evaluation.level === 'none' || evaluation.level === 'minor') {
      alert('SMS autorisé uniquement pour retards > 60 minutes');
      return;
    }

    const message = prompt('Message à envoyer au chauffeur:');
    if (!message) return;

    try {
      const response = await fetch('/api/v1/driver-alerts/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transportUid,
          driverPhone: "+33612345678", // À récupérer depuis assignedCarrier
          message,
          delayMinutes,
          userId: "current-user-id",
          userName: "Current User Name"
        })
      });

      const data = await response.json();

      if (data.success) {
        alert('SMS envoyé avec succès');
      } else {
        alert(`Erreur: ${data.error}`);
      }
    } catch (error) {
      console.error('Erreur envoi SMS:', error);
      alert('Erreur lors de l\'envoi du SMS');
    }
  };

  if (loading) {
    return <div>Chargement position GPS...</div>;
  }

  return (
    <div className="tracking-gps-card">
      {/* Position GPS */}
      {position && position.isRecent ? (
        <div className="gps-position">
          <MapPin className="icon" />
          <div>
            <div className="location">
              Lat: {position.latitude.toFixed(4)},
              Lon: {position.longitude.toFixed(4)}
            </div>
            <div className="speed">
              Vitesse: {position.speed} km/h
            </div>
            <div className="timestamp">
              Mis à jour il y a {position.ageMinutes} min
            </div>
          </div>
        </div>
      ) : (
        <div className="no-gps">
          <AlertTriangle className="icon" />
          Position GPS non disponible
        </div>
      )}

      {/* Évaluation Retard */}
      {evaluation && evaluation.level !== 'none' && (
        <div className={`delay-alert level-${evaluation.level}`}>
          <AlertTriangle className="icon" />
          <div>
            <div className="level">Retard: {delayMinutes} min</div>
            <div className="message">{evaluation.message}</div>
          </div>
        </div>
      )}

      {/* Bouton SMS Manuel */}
      {evaluation && (evaluation.level === 'high' || evaluation.level === 'critical') && (
        <button
          className="btn-send-sms"
          onClick={sendManualSMS}
        >
          <Phone className="icon" />
          Envoyer SMS Manuel
        </button>
      )}
    </div>
  );
}

export default TrackingGPSCard;
```

---

## 🔧 Modifications à Faire dans Symphonia Frontend

### 1. **Désactiver Envoi Automatique SMS**

Chercher et **supprimer/commenter** le code qui envoie automatiquement des SMS :

```javascript
// ❌ SUPPRIMER CE CODE:
if (delayMinutes > 30) {
  await sendSMS(driverPhone, message);
}
```

### 2. **Ajouter Composant GPS**

Dans la page de détail du transport, ajouter :

```jsx
<TrackingGPSCard
  transportUid={transport.uid}
  delayMinutes={calculateDelay(transport)}
/>
```

### 3. **Carte Interactive avec Positions**

Intégrer Leaflet ou Google Maps pour afficher la position GPS :

```jsx
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';

<MapContainer
  center={[position.latitude, position.longitude]}
  zoom={13}
>
  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
  <Marker position={[position.latitude, position.longitude]}>
    <Popup>
      Véhicule {vehiclePlate}<br/>
      Vitesse: {position.speed} km/h
    </Popup>
  </Marker>
</MapContainer>
```

---

## 📊 Règles de Gestion

| Retard | Niveau | Action |
|--------|--------|--------|
| < 30 min | None | Aucune alerte, suivi GPS normal |
| 30-60 min | Minor | Alerte UI jaune, surveiller GPS |
| 60-120 min | Medium | Alerte UI orange + Bouton SMS manuel |
| 120-180 min | High | Alerte UI rouge + SMS recommandé |
| > 180 min | Critical | Alerte critique + Intervention requise |

---

## ✅ Checklist Migration

- [ ] Backend: Intégrer nouvelles routes dans index.js
- [ ] Backend: Déployer version mise à jour
- [ ] Frontend: Désactiver envoi automatique SMS
- [ ] Frontend: Ajouter composant TrackingGPSCard
- [ ] Frontend: Intégrer carte avec positions GPS
- [ ] Frontend: Ajouter bouton SMS manuel (retards > 2h)
- [ ] Test: Vérifier positions GPS temps réel
- [ ] Test: Vérifier envoi SMS manuel fonctionne
- [ ] Test: Vérifier aucun SMS automatique envoyé

---

## 🚀 Déploiement

1. **Backend** : Intégrer les routes et redéployer
2. **Frontend** : Modifier les composants et déployer
3. **Test** : Vérifier sur un transport en cours
4. **Monitoring** : Surveiller les logs AWS SNS

---

*Guide créé le 26/02/2026*
