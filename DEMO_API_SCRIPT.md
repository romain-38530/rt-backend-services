# SYMPHONI.A - Script de Démo API Live

## Configuration

```bash
# URLs de production
export AUTH_API="http://rt-auth-api-prod.eba-g2psqhq5.eu-central-1.elasticbeanstalk.com"
export ORDERS_API="http://rt-orders-api-prod.eba-dbgatxmk.eu-central-1.elasticbeanstalk.com"
export TRACKING_API="http://rt-tracking-api-prod.eba-mttbqqhw.eu-central-1.elasticbeanstalk.com"
export SUPPLIER_API="http://rt-supplier-space-prod.eba-ka46t2mz.eu-central-1.elasticbeanstalk.com"
export RECIPIENT_API="http://rt-recipient-space-prod.eba-xir23y3r.eu-central-1.elasticbeanstalk.com"
export AFFRET_IA_API="http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com"
export KPI_API="http://rt-kpi-api-prod.eba-sfwqzd4j.eu-central-1.elasticbeanstalk.com"
export ECMR_API="http://rt-ecmr-api-prod.eba-43ngua6v.eu-central-1.elasticbeanstalk.com"
```

---

## Étape 1 : Vérification santé des services

```bash
# Health check de tous les services principaux
echo "=== SYMPHONI.A Health Check ==="

curl -s $AUTH_API/health | jq '.status'
curl -s $ORDERS_API/health | jq '.status'
curl -s $TRACKING_API/health | jq '.status'
curl -s $SUPPLIER_API/health | jq '.status'
curl -s $RECIPIENT_API/health | jq '.status'
curl -s $AFFRET_IA_API/health | jq '.status'
```

**Résultat attendu :** Tous les services affichent "healthy"

---

## Étape 2 : Authentification

```bash
# Login industriel
curl -X POST $AUTH_API/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@agrofrance.fr",
    "password": "Demo2024!"
  }' | jq

# Sauvegarder le token
export TOKEN="eyJhbGciOiJIUzI1NiIs..."
```

---

## Étape 3 : Créer une commande de transport

```bash
# Nouvelle commande
curl -X POST $ORDERS_API/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "type": "transport",
    "reference": "CMD-DEMO-001",
    "pickup": {
      "address": "Zone Industrielle, 69007 Lyon",
      "contact": "Jean Dupont",
      "phone": "+33612345678",
      "date": "2024-12-02T06:00:00Z",
      "instructions": "Quai 3, sonner à l arrivée"
    },
    "delivery": {
      "address": "MIN de Rungis, 94150 Rungis",
      "contact": "Marie Martin",
      "phone": "+33687654321",
      "date": "2024-12-02T12:00:00Z",
      "instructions": "Hall A, porte 12"
    },
    "cargo": {
      "description": "Produits frais",
      "pallets": 12,
      "weight": 8000,
      "volume": 28,
      "temperature": {
        "min": 2,
        "max": 4
      }
    },
    "requirements": {
      "vehicleType": "frigo",
      "hayon": false,
      "adr": false
    }
  }' | jq

# Sauvegarder l'ID de la commande
export ORDER_ID="ord_abc123..."
```

---

## Étape 4 : AFFRET.IA - Recommandation transporteur

```bash
# Demander des recommandations à l'IA
curl -X POST $AFFRET_IA_API/api/v1/recommend \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "orderId": "'$ORDER_ID'",
    "criteria": {
      "maxPrice": 1000,
      "priorityScore": true,
      "minRating": 4.0
    }
  }' | jq
```

**Réponse attendue :**
```json
{
  "success": true,
  "recommendations": [
    {
      "carrierId": "carrier_001",
      "name": "TransportExpress",
      "score": 94,
      "price": 850,
      "eta": "2024-12-02T11:45:00Z",
      "strengths": ["ponctualité", "frigo certifié", "prix compétitif"]
    },
    {
      "carrierId": "carrier_002",
      "name": "FrigoRoute",
      "score": 89,
      "price": 920,
      "eta": "2024-12-02T11:30:00Z",
      "strengths": ["rapidité", "assurance premium"]
    }
  ],
  "aiInsights": {
    "weatherRisk": "low",
    "trafficPrediction": "normal",
    "recommendation": "TransportExpress optimal pour ce trajet"
  }
}
```

---

## Étape 5 : Attribuer la commande

```bash
# Attribution au transporteur
curl -X POST $ORDERS_API/api/v1/orders/$ORDER_ID/assign \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "carrierId": "carrier_001",
    "price": 850,
    "currency": "EUR"
  }' | jq
```

---

## Étape 6 : Espace Fournisseur - Valider le créneau

```bash
# Login fournisseur
curl -X POST $SUPPLIER_API/api/v1/supplier/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "logistique@usine-lyon.fr",
    "password": "Demo2024!"
  }' | jq

export SUPPLIER_TOKEN="..."

# Voir les commandes à préparer
curl -s $SUPPLIER_API/api/v1/supplier/orders?status=to_prepare \
  -H "Authorization: Bearer $SUPPLIER_TOKEN" | jq

# Valider le créneau de chargement
curl -X POST $SUPPLIER_API/api/v1/supplier/slots/$ORDER_ID/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPPLIER_TOKEN" \
  -d '{
    "slotStart": "2024-12-02T06:00:00Z",
    "slotEnd": "2024-12-02T07:00:00Z",
    "dock": "Quai 3"
  }' | jq
```

---

## Étape 7 : Signature électronique du chargement

```bash
# Signature du BL au chargement
curl -X POST $SUPPLIER_API/api/v1/supplier/orders/$ORDER_ID/signature \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPPLIER_TOKEN" \
  -d '{
    "type": "loading",
    "signatureData": "data:image/png;base64,iVBORw0KGgo...",
    "signerName": "Jean Dupont",
    "signerRole": "Responsable expédition",
    "palletsLoaded": 12,
    "photos": [
      "https://storage.symphonia.io/photos/loading_001.jpg",
      "https://storage.symphonia.io/photos/loading_002.jpg"
    ],
    "comments": "Chargement conforme, palettes en bon état"
  }' | jq
```

---

## Étape 8 : Tracking en temps réel

```bash
# Obtenir la position actuelle
curl -s $TRACKING_API/api/v1/tracking/$ORDER_ID \
  -H "Authorization: Bearer $TOKEN" | jq

# Réponse type
{
  "orderId": "ord_abc123",
  "status": "in_transit",
  "currentPosition": {
    "lat": 46.2044,
    "lng": 4.0859,
    "timestamp": "2024-12-02T09:30:00Z"
  },
  "eta": {
    "estimated": "2024-12-02T11:47:00Z",
    "confidence": 0.92
  },
  "temperature": {
    "current": 3.2,
    "min": 2.8,
    "max": 3.5
  },
  "route": {
    "totalDistance": 465,
    "remainingDistance": 187,
    "completedPercent": 60
  }
}

# Historique des positions
curl -s "$TRACKING_API/api/v1/tracking/$ORDER_ID/history?from=2024-12-02T06:00:00Z" \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

## Étape 9 : Espace Destinataire - Réception

```bash
# Login destinataire
curl -X POST $RECIPIENT_API/api/v1/recipient/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "reception@rungis-client.fr",
    "password": "Demo2024!"
  }' | jq

export RECIPIENT_TOKEN="..."

# Voir les livraisons attendues
curl -s $RECIPIENT_API/api/v1/recipient/deliveries?status=expected \
  -H "Authorization: Bearer $RECIPIENT_TOKEN" | jq

# Obtenir l'ETA avec tracking IA
curl -s $RECIPIENT_API/api/v1/recipient/deliveries/$ORDER_ID/tracking \
  -H "Authorization: Bearer $RECIPIENT_TOKEN" | jq
```

---

## Étape 10 : Signature de livraison

```bash
# Validation QR Code (simulé)
curl -X POST $RECIPIENT_API/api/v1/recipient/signature/validate-qr \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RECIPIENT_TOKEN" \
  -d '{
    "qrCode": "SYMPH-ORD-abc123-DELIVERY",
    "orderId": "'$ORDER_ID'"
  }' | jq

# Signature finale de livraison
curl -X POST $RECIPIENT_API/api/v1/recipient/deliveries/$ORDER_ID/signature \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RECIPIENT_TOKEN" \
  -d '{
    "signatureData": "data:image/png;base64,iVBORw0KGgo...",
    "signerName": "Marie Martin",
    "signerRole": "Réceptionnaire",
    "palletsReceived": 12,
    "condition": "good",
    "temperatureCheck": {
      "value": 3.1,
      "compliant": true
    },
    "photos": [
      "https://storage.symphonia.io/photos/delivery_001.jpg"
    ],
    "comments": "Livraison conforme"
  }' | jq
```

---

## Étape 11 : Déclarer un incident

```bash
# Déclaration d'incident (palette endommagée)
curl -X POST $RECIPIENT_API/api/v1/recipient/deliveries/$ORDER_ID/incident \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RECIPIENT_TOKEN" \
  -d '{
    "type": "damaged_packaging",
    "severity": "minor",
    "affectedPallets": 1,
    "description": "Coin palette écrasé, 2 cartons abîmés",
    "photos": [
      "https://storage.symphonia.io/photos/incident_001.jpg",
      "https://storage.symphonia.io/photos/incident_002.jpg"
    ],
    "estimatedDamage": 85
  }' | jq

# Réponse automatique
{
  "success": true,
  "incidentId": "INC-2024-1247",
  "status": "opened",
  "billingBlocked": true,
  "notificationsSent": [
    "carrier@transportexpress.fr",
    "logistique@agrofrance.fr"
  ],
  "nextSteps": "Le transporteur a 48h pour répondre"
}
```

---

## Étape 12 : KPIs et Analytics

```bash
# Tableau de bord KPIs
curl -s $KPI_API/api/v1/dashboard \
  -H "Authorization: Bearer $TOKEN" | jq

# Réponse
{
  "period": "2024-12",
  "metrics": {
    "totalShipments": 487,
    "onTimeDelivery": 94.2,
    "incidentRate": 1.8,
    "avgDeliveryTime": 12.3,
    "customerSatisfaction": 4.6
  },
  "trends": {
    "onTimeDelivery": "+2.1%",
    "incidentRate": "-0.5%"
  },
  "topCarriers": [
    {"name": "TransportExpress", "score": 94, "shipments": 127},
    {"name": "FrigoRoute", "score": 89, "shipments": 98}
  ]
}

# Rapport détaillé
curl -s "$KPI_API/api/v1/reports/monthly?month=2024-12" \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

## Étape 13 : eCMR électronique

```bash
# Générer l'eCMR final
curl -s $ECMR_API/api/v1/ecmr/$ORDER_ID \
  -H "Authorization: Bearer $TOKEN" | jq

# Télécharger le PDF
curl -s "$ECMR_API/api/v1/ecmr/$ORDER_ID/pdf" \
  -H "Authorization: Bearer $TOKEN" \
  -o ecmr_CMD-DEMO-001.pdf

# Vérifier les signatures
curl -s "$ECMR_API/api/v1/ecmr/$ORDER_ID/signatures" \
  -H "Authorization: Bearer $TOKEN" | jq

# Réponse
{
  "signatures": [
    {
      "party": "sender",
      "name": "Jean Dupont",
      "timestamp": "2024-12-02T06:45:00Z",
      "verified": true
    },
    {
      "party": "carrier",
      "name": "Pierre Martin",
      "timestamp": "2024-12-02T06:47:00Z",
      "verified": true
    },
    {
      "party": "recipient",
      "name": "Marie Martin",
      "timestamp": "2024-12-02T11:52:00Z",
      "verified": true
    }
  ],
  "status": "completed",
  "archiveUrl": "https://archive.symphonia.io/ecmr/..."
}
```

---

## Commandes utiles pour la démo

```bash
# Tester tous les health endpoints
for service in auth orders tracking supplier-space recipient-space affret-ia-v4 kpi ecmr billing notifications; do
  echo -n "$service: "
  curl -s "http://rt-${service}-api-prod.*.eu-central-1.elasticbeanstalk.com/health" | jq -r '.status'
done

# Voir les 31 services en un coup d'oeil
aws elasticbeanstalk describe-environments --region eu-central-1 \
  --query "Environments[?Status=='Ready'].{Name:EnvironmentName,Health:Health}" \
  --output table
```

---

*Script de démo SYMPHONI.A - Version 1.0*
