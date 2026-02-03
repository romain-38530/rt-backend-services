# Guide de Test Manuel - Synchronisation Affret.IA → Dashdoc

## 📋 Prérequis

Avant de tester, vous devez avoir:
1. **Un orderId** - ID MongoDB d'une commande provenant de Dashdoc
2. **Un carrierId** - ID MongoDB d'un transporteur Dashdoc
3. **Le JWT token** - Token d'authentification pour TMS Sync API

## 🔑 Token d'Authentification

```
Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlIjoidG1zLXN5bmMiLCJzY29wZSI6ImFmZnJldGlhLXN5bmMiLCJpYXQiOjE3MzgzODMzMzksImV4cCI6MTc3MDAwNTczOX0.nEGwm-VyIGpJGFj2XR1-Z1AVNO4MWieCXmk90iS0vxo
```

**Validité**: jusqu'au 3 février 2027

---

## ✅ TEST 1: Vérifier le Statut du Service

### Endpoint
```
GET https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com/api/v1/tms/affretia-sync/status
```

### Headers
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlIjoidG1zLXN5bmMiLCJzY29wZSI6ImFmZnJldGlhLXN5bmMiLCJpYXQiOjE3MzgzODMzMzksImV4cCI6MTc3MDAwNTczOX0.nEGwm-VyIGpJGFj2XR1-Z1AVNO4MWieCXmk90iS0vxo
Content-Type: application/json
```

### Réponse Attendue
```json
{
  "status": "operational",
  "service": "affretia-dashdoc-sync",
  "mongodb": true,
  "dashdocConnectors": 1,
  "timestamp": "2026-02-03T15:30:00.000Z"
}
```

### Test avec cURL
```bash
curl -X GET \
  "https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com/api/v1/tms/affretia-sync/status" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlIjoidG1zLXN5bmMiLCJzY29wZSI6ImFmZnJldGlhLXN5bmMiLCJpYXQiOjE3MzgzODMzMzksImV4cCI6MTc3MDAwNTczOX0.nEGwm-VyIGpJGFj2XR1-Z1AVNO4MWieCXmk90iS0vxo" \
  -H "Content-Type: application/json"
```

### Test avec PowerShell
```powershell
$headers = @{
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlIjoidG1zLXN5bmMiLCJzY29wZSI6ImFmZnJldGlhLXN5bmMiLCJpYXQiOjE3MzgzODMzMzksImV4cCI6MTc3MDAwNTczOX0.nEGwm-VyIGpJGFj2XR1-Z1AVNO4MWieCXmk90iS0vxo"
    "Content-Type" = "application/json"
}

Invoke-RestMethod -Uri "https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com/api/v1/tms/affretia-sync/status" -Headers $headers -Method Get
```

---

## 🔄 TEST 2: Simuler un Webhook carrier.assigned

### Endpoint
```
POST https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com/api/v1/tms/affretia-sync/webhook
```

### Headers
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlIjoidG1zLXN5bmMiLCJzY29wZSI6ImFmZnJldGlhLXN5bmMiLCJpYXQiOjE3MzgzODMzMzksImV4cCI6MTc3MDAwNTczOX0.nEGwm-VyIGpJGFj2XR1-Z1AVNO4MWieCXmk90iS0vxo
Content-Type: application/json
```

### Body
```json
{
  "eventName": "carrier.assigned",
  "data": {
    "orderId": "VOTRE_ORDER_ID_ICI",
    "carrierId": "VOTRE_CARRIER_ID_ICI",
    "price": 450.00,
    "sessionId": "test-session-12345"
  }
}
```

### Remplacer les IDs
- `orderId`: ID MongoDB d'une commande provenant de Dashdoc (24 caractères hex)
- `carrierId`: ID MongoDB d'un transporteur Dashdoc (24 caractères hex)
- `price`: Prix négocié (en euros)

### Exemple avec des IDs réels
```json
{
  "eventName": "carrier.assigned",
  "data": {
    "orderId": "65f3a1b2c3d4e5f6a7b8c9d0",
    "carrierId": "65e2a1b2c3d4e5f6a7b8c9d1",
    "price": 450.00,
    "sessionId": "test-session-12345"
  }
}
```

### Test avec cURL
```bash
curl -X POST \
  "https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com/api/v1/tms/affretia-sync/webhook" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlIjoidG1zLXN5bmMiLCJzY29wZSI6ImFmZnJldGlhLXN5bmMiLCJpYXQiOjE3MzgzODMzMzksImV4cCI6MTc3MDAwNTczOX0.nEGwm-VyIGpJGFj2XR1-Z1AVNO4MWieCXmk90iS0vxo" \
  -H "Content-Type: application/json" \
  -d '{
    "eventName": "carrier.assigned",
    "data": {
      "orderId": "VOTRE_ORDER_ID",
      "carrierId": "VOTRE_CARRIER_ID",
      "price": 450.00,
      "sessionId": "test-session-12345"
    }
  }'
```

### Test avec PowerShell
```powershell
$headers = @{
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlIjoidG1zLXN5bmMiLCJzY29wZSI6ImFmZnJldGlhLXN5bmMiLCJpYXQiOjE3MzgzODMzMzksImV4cCI6MTc3MDAwNTczOX0.nEGwm-VyIGpJGFj2XR1-Z1AVNO4MWieCXmk90iS0vxo"
    "Content-Type" = "application/json"
}

$body = @{
    eventName = "carrier.assigned"
    data = @{
        orderId = "VOTRE_ORDER_ID"
        carrierId = "VOTRE_CARRIER_ID"
        price = 450.00
        sessionId = "test-session-12345"
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com/api/v1/tms/affretia-sync/webhook" -Headers $headers -Method Post -Body $body
```

### Réponse Attendue (Succès)
```json
{
  "success": true,
  "message": "Événement carrier.assigned traité",
  "result": {
    "success": true,
    "transportUid": "ABC123",
    "metadata": {
      "orderId": "65f3a1b2c3d4e5f6a7b8c9d0",
      "carrierId": "65e2a1b2c3d4e5f6a7b8c9d1",
      "sessionId": "test-session-12345"
    },
    "retriesUsed": 0
  }
}
```

### Réponse Attendue (Erreur - Commande non trouvée)
```json
{
  "success": false,
  "error": "Order not found"
}
```

---

## 🧪 TEST 3: Synchronisation Manuelle

### Endpoint
```
POST https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com/api/v1/tms/affretia-sync/test
```

### Headers
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlIjoidG1zLXN5bmMiLCJzY29wZSI6ImFmZnJldGlhLXN5bmMiLCJpYXQiOjE3MzgzODMzMzksImV4cCI6MTc3MDAwNTczOX0.nEGwm-VyIGpJGFj2XR1-Z1AVNO4MWieCXmk90iS0vxo
Content-Type: application/json
```

### Body
```json
{
  "orderId": "VOTRE_ORDER_ID",
  "carrierId": "VOTRE_CARRIER_ID",
  "price": 450.00
}
```

### Test avec cURL
```bash
curl -X POST \
  "https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com/api/v1/tms/affretia-sync/test" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlIjoidG1zLXN5bmMiLCJzY29wZSI6ImFmZnJldGlhLXN5bmMiLCJpYXQiOjE3MzgzODMzMzksImV4cCI6MTc3MDAwNTczOX0.nEGwm-VyIGpJGFj2XR1-Z1AVNO4MWieCXmk90iS0vxo" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "VOTRE_ORDER_ID",
    "carrierId": "VOTRE_CARRIER_ID",
    "price": 450.00
  }'
```

---

## 🔍 TEST 4: Vérifier dans Dashdoc

Après avoir envoyé l'événement de synchronisation:

1. **Connectez-vous à Dashdoc**

2. **Accédez au transport** correspondant à l'orderId

3. **Vérifiez les informations mises à jour**:
   - ✅ Transporteur assigné (carrier_address)
   - ✅ Prix d'achat (purchasing_price)
   - ✅ Statut = "assigned"

4. **Vérifiez dans l'historique** du transport:
   - Date de modification
   - Qui a modifié (devrait être "API")

---

## 📊 Visualiser les Logs de Synchronisation

### Dans CloudWatch (AWS)
```bash
aws logs tail /aws/elasticbeanstalk/symphonia-tms-sync-prod/var/log/nodejs/nodejs.log \
  --region eu-west-3 \
  --follow \
  --filter-pattern "Affret.IA"
```

### Dans MongoDB
```javascript
// Collection TMSSyncLog
db.tmsSyncLogs.find({
  syncType: 'affretia_assignment',
  direction: 'symphonia_to_dashdoc'
}).sort({ createdAt: -1 }).limit(10)
```

---

## 🚨 Dépannage

### Erreur: "Access token required"
➡️ Vérifiez que le header Authorization contient le Bearer token

### Erreur: "Order not found"
➡️ L'orderId n'existe pas dans MongoDB ou n'a pas d'externalSource='dashdoc'

### Erreur: "Carrier not found"
➡️ Le carrierId n'existe pas dans MongoDB ou n'a pas d'externalSource='dashdoc'

### Erreur: "No Dashdoc connector for organization"
➡️ Aucune connexion TMS Dashdoc active n'est configurée pour l'organisation

### Timeout
➡️ Le service peut être en train de démarrer, réessayez dans 30 secondes

---

## 📝 Obtenir des IDs de Test Réels

### Depuis MongoDB Compass ou CLI

**Trouver une commande Dashdoc**:
```javascript
db.orders.findOne({
  externalSource: 'dashdoc',
  externalId: { $exists: true }
})
```

**Trouver un transporteur Dashdoc**:
```javascript
db.carriers.findOne({
  externalSource: 'dashdoc',
  externalId: { $exists: true }
})
```

**Copier les _id** et les utiliser dans vos tests.

---

## ✅ Checklist de Test

- [ ] Test 1: Statut service → Répond 200 OK
- [ ] Test 2: Webhook avec IDs réels → Succès
- [ ] Test 3: Vérification Dashdoc → Transport mis à jour
- [ ] Test 4: Logs CloudWatch → Événements enregistrés
- [ ] Test 5: Logs MongoDB → TMSSyncLog créé

---

**Date**: 2026-02-03
**Version**: 1.0
**Services**:
- TMS Sync API: v2.4.9 (Green)
- Affret.IA API: v2.7.1 (Green)
