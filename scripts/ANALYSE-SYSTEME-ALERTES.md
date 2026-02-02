# Analyse du Système d'Alertes de Vigilance - SYMPHONI.A

## Vue d'ensemble

Le système d'alertes de vigilance pour les documents transporteur est implémenté dans `services/authz-eb/carriers.js`.

## Architecture Actuelle

### 1. Statuts de Vigilance

```javascript
const VIGILANCE_STATUS = {
  COMPLIANT: 'compliant',    // Tous les documents OK
  WARNING: 'warning',        // Documents expirant bientôt (≤30 jours)
  BLOCKED: 'blocked',        // Documents expirés ou rejetés
  PENDING: 'pending'         // Aucun document fourni
};
```

### 2. Fonction `checkVigilanceStatus(db, carrierId)`

**Localisation:** Ligne 582-618

**Objectif:** Vérifier le statut de vigilance d'un transporteur basé sur ses documents.

**Logique:**
- Si aucun document → `PENDING`
- Si document expiré ou rejeté → `BLOCKED`
- Si document expire dans ≤30 jours → `WARNING`
- Sinon → `COMPLIANT`

**Points forts:**
✅ Logique claire et simple
✅ Vérifie tous les documents
✅ Retourne les issues détaillées

**Points faibles:**
❌ Seuil unique de 30 jours (pas de granularité 7j, 15j, 30j)
❌ Ne distingue pas les niveaux de sévérité

### 3. Fonction `checkAndSendVigilanceAlerts(db)`

**Localisation:** Ligne 2336-2428

**Objectif:** Cron job quotidien pour envoyer les alertes de vigilance.

**Logique:**
1. Récupère tous les documents avec date d'expiration
2. Calcule les jours restants avant expiration
3. Envoie des alertes aux jalons: **J-30, J-15, J-7, J-3, J-1**
4. Bloque automatiquement le transporteur si document expiré (≤0 jours)

**Niveaux de sévérité:**
- **CRITICAL** (≤7 jours) → Risque de blocage imminent
- **WARNING** (≤15 jours) → Action requise prochainement
- **INFO** (≤30 jours) → Information préventive

**Système de déduplication:**
- Vérifie si une alerte similaire a été envoyée dans les dernières 24h
- Évite les spams quotidiens pour le même document

**Blocage automatique:**
- Marque le document comme `EXPIRED`
- Change le statut transporteur en `BLOCKED`
- Définit le `vigilanceStatus` à `BLOCKED`
- Enregistre la raison: `BLOCKING_REASONS.DOCUMENTS_EXPIRED`
- Envoie un email de notification

**Points forts:**
✅ Système de jalons complet (30, 15, 7, 3, 1 jours)
✅ Déduplication des alertes (évite le spam)
✅ Blocage automatique à l'expiration
✅ Emails de notification
✅ Enregistrement dans `vigilance_alerts` collection
✅ Logging des événements avec `CARRIER_EVENTS.BLOCKED`

**Points faibles:**
❌ Pas de notification aux industriels
❌ Pas de système de résolution d'alertes
❌ Pas d'agrégation des alertes par transporteur

## Workflow Complet

### Phase 1: Upload de Document

```
User uploads document
    ↓
POST /api/carriers/:id/documents/upload-url
    → Génère URL S3 présignée
    ↓
User uploads to S3
    ↓
POST /api/carriers/:id/documents/confirm-upload
    → Crée enregistrement document dans MongoDB
    → Status: PENDING
```

### Phase 2: Analyse OCR (Optionnel)

```
POST /api/carriers/:id/documents/:docId/analyze
    ↓
AWS Textract détecte le texte
    ↓
Extraction des dates avec patterns
    ↓
Suggestion de date d'expiration
    ↓
Mise à jour automatique si confiance élevée
```

### Phase 3: Vérification Manuelle

```
POST /api/carriers/:id/documents/:docId/verify
    ↓
Admin approuve ou rejette
    ↓
Status: VERIFIED ou REJECTED
    ↓
Mise à jour vigilanceStatus du carrier
```

### Phase 4: Surveillance Automatique (Cron Daily à 8h00)

```
checkAndSendVigilanceAlerts() exécuté quotidiennement
    ↓
Pour chaque document avec expiryDate:
    │
    ├─ daysUntilExpiry == 30, 15, 7, 3, ou 1?
    │   ↓ OUI
    │   ├─ Créer alerte dans vigilance_alerts
    │   ├─ Déterminer sévérité (info/warning/critical)
    │   └─ Envoyer email au transporteur
    │
    └─ daysUntilExpiry <= 0?
        ↓ OUI
        ├─ Marquer document EXPIRED
        ├─ Bloquer transporteur
        └─ Envoyer email de blocage
```

## Collections MongoDB

### `carrier_documents`

```javascript
{
  _id: ObjectId,
  carrierId: ObjectId,
  documentType: String,  // 'kbis', 'urssaf', 'insurance_rc', etc.
  name: String,
  s3Key: String,
  s3Url: String,
  status: String,        // 'pending', 'verified', 'rejected', 'expired'
  expiryDate: Date,
  uploadedAt: Date,
  verifiedAt: Date,
  verifiedBy: ObjectId,
  ocrAnalysis: {
    fullText: String,
    dates: Array,
    suggestedExpiryDate: Date,
    confidence: String   // 'high', 'medium', 'low', 'none'
  }
}
```

### `vigilance_alerts`

```javascript
{
  _id: ObjectId,
  carrierId: String,
  industrielId: ObjectId,
  type: String,          // 'document_expiring_30', 'document_expiring_15', 'document_expiring_7'
  severity: String,      // 'info', 'warning', 'critical'
  title: String,
  message: String,
  documentType: String,
  documentId: String,
  actionRequired: Boolean,
  actionLabel: String,
  notificationChannels: Array,  // ['email', 'in_app']
  isResolved: Boolean,
  autoBlockAt: Date,
  createdAt: Date
}
```

### `carriers`

```javascript
{
  _id: ObjectId,
  companyName: String,
  email: String,
  status: String,              // 'active', 'blocked', 'pending_validation', etc.
  vigilanceStatus: String,     // 'compliant', 'warning', 'blocked', 'pending'
  blockedReason: String,       // 'documents_expired', 'insurance_lapsed', etc.
  blockedAt: Date,
  documents: [ObjectId],       // Références aux documents
  score: {
    overall: Number,
    details: Object
  }
}
```

## Tests Requis

### Test 1: Alertes Préventives
- ✅ Document expirant dans 180 jours → Aucune alerte
- ✅ Document expirant dans 45 jours → Alerte INFO à J-30
- ✅ Document expirant dans 15 jours → Alerte WARNING à J-15
- ✅ Document expirant dans 8 jours → Alerte CRITICAL à J-7
- ✅ Document expirant dans 1 jour → Alerte CRITICAL à J-1

### Test 2: Blocage Automatique
- ✅ Document expiré (0 jours) → Transporteur BLOCKED
- ✅ Email de blocage envoyé
- ✅ Event `carrier.blocked` enregistré
- ✅ Status document → EXPIRED

### Test 3: Résolution
- ✅ Upload nouveau document → Déblocage si plus d'issues
- ✅ Vérification automatique du vigilanceStatus
- ✅ Déblocage manuel possible via `/api/carriers/:id/unblock`

### Test 4: OCR
- ✅ Extraction des dates multiples formats
- ✅ Détection mots-clés de validité
- ✅ Suggestion de date d'expiration
- ✅ Mise à jour automatique si confiance élevée

## Seuils d'Alerte Recommandés

| Document | Seuil Info | Seuil Warning | Seuil Critical | Action |
|----------|-----------|---------------|----------------|--------|
| Assurance RC | 60 jours | 30 jours | 7 jours | Blocage à J-0 |
| Assurance Marchandises | 60 jours | 30 jours | 7 jours | Blocage à J-0 |
| Licence Transport | 90 jours | 45 jours | 15 jours | Blocage à J-0 |
| Attestation URSSAF | 45 jours | 15 jours | 7 jours | Blocage à J-0 |
| KBIS | 90 jours (3 mois) | N/A | N/A | Warning seule |
| RIB | N/A | N/A | N/A | Pas d'expiration |

## Améliorations Possibles

### Court Terme
1. ✅ **Implémenter les seuils par type de document** (actuellement seuil unique)
2. ✅ **Ajouter notification aux industriels** (actuellement seul le transporteur)
3. ✅ **Dashboard d'alertes** pour backoffice
4. ✅ **Métriques d'alertes** (nombre, résolution, délais)

### Moyen Terme
1. **Système de rappels** (notifications in-app + emails)
2. **Historique des alertes** par transporteur
3. **Prédiction d'expiration** basée sur historique
4. **Auto-renouvellement** pour documents récurrents

### Long Terme
1. **IA pour validation automatique** des documents
2. **Intégration APIs externes** (vérification URSSAF, assurances)
3. **Scoring de fiabilité** basé sur respect des deadlines
4. **Notifications SMS/WhatsApp** pour alertes critiques

## Conclusion

Le système actuel est **fonctionnel et robuste** avec:
- ✅ Surveillance automatique quotidienne
- ✅ Système d'alertes à plusieurs niveaux
- ✅ Blocage automatique à l'expiration
- ✅ Emails de notification
- ✅ Déduplication des alertes

Points d'amélioration prioritaires:
1. Seuils personnalisés par type de document
2. Notifications aux industriels
3. Dashboard de monitoring
4. Métriques et reporting

Le système est prêt pour la production et peut gérer efficacement le workflow de vigilance documentaire.
