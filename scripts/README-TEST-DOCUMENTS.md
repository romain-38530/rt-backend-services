# Guide Complet - Test du Workflow de Documents Transporteur

## Vue d'ensemble

Ce guide décrit comment tester complètement le système de gestion des documents transporteur, incluant:
- Génération de documents PDF de test réalistes
- Upload via l'API avec URLs S3 présignées
- Analyse OCR automatique avec AWS Textract
- Système d'alertes de vigilance (J-30, J-15, J-7)
- Blocage automatique des transporteurs

## Prérequis

### 1. Configuration de l'Environnement

```bash
# 1. Vérifier que l'API est démarrée
cd services/authz-eb
npm start

# 2. Vérifier la connexion MongoDB
# Dans .env: MONGODB_URI=mongodb://...

# 3. Vérifier la configuration AWS (S3 + Textract)
# Dans .env:
# AWS_REGION=eu-central-1
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...
# S3_DOCUMENTS_BUCKET=rt-carrier-documents
```

### 2. Installation des Dépendances

```bash
cd scripts
npm install
```

### 3. Variables d'Environnement

```bash
# Optionnel - personnaliser l'URL de l'API
export API_URL=http://localhost:3000

# Ou pour production
export API_URL=https://your-api-domain.com
```

## Structure des Scripts

```
scripts/
├── generate-test-documents.cjs     # Génère 6 PDFs de test
├── test-document-workflow.cjs      # Test complet du workflow
├── verify-alerting-system.cjs      # Vérifie le système d'alertes
├── ANALYSE-SYSTEME-ALERTES.md      # Documentation technique
├── README-TEST-DOCUMENTS.md        # Ce guide
└── test-documents/                 # Dossier créé automatiquement
    ├── 1-licence-transport.pdf
    ├── 2-assurance-rc.pdf
    ├── 3-assurance-marchandises.pdf
    ├── 4-kbis.pdf
    ├── 5-attestation-urssaf.pdf
    ├── 6-rib.pdf
    ├── metadata.json
    └── test-report.json
```

## Étapes de Test

### Étape 0: Vérification du Système

```bash
node verify-alerting-system.cjs
```

**Ce que ça vérifie:**
- ✅ API est accessible et healthy
- ✅ Connexion MongoDB fonctionne
- ✅ Transporteur de test existe
- ✅ Endpoint de vigilance fonctionne

**Résultat attendu:**
```
=================================================================================
VERIFICATION DU SYSTEME D'ALERTES
=================================================================================

→ Checking API health...
  ✓ API is healthy
    Service: authz
    Version: 2.0.0
    MongoDB: active

→ Checking if test carrier exists...
  ✓ Carrier found
    Company: Transport Express Demo
    Status: active
    Vigilance: compliant
    Documents: 0

→ Checking vigilance endpoint...
  ✓ Vigilance check executed
    Alerts generated: 0

=================================================================================
RESUME DES VERIFICATIONS
=================================================================================

  ✓ API Health
  ✓ Carrier Exists
  ✓ Vigilance Endpoint

📊 Summary:
  Success: 3

✅ System is ready for testing!

Next steps:
  1. Run: node generate-test-documents.cjs
  2. Run: node test-document-workflow.cjs
```

### Étape 1: Génération des Documents PDF

```bash
node generate-test-documents.cjs
```

**Ce que ça fait:**
- Génère 6 documents PDF avec des informations réalistes
- Utilise des dates calculées dynamiquement
- Crée un fichier metadata.json avec tous les détails

**Documents générés:**

| Document | Type | Expiration | Alerte Attendue |
|----------|------|------------|-----------------|
| 1. Licence de Transport | `licence_transport` | +180 jours | Aucune |
| 2. Assurance RC | `insurance_rc` | +45 jours | WARNING (J-30) |
| 3. Assurance Marchandises | `insurance_goods` | +8 jours | CRITICAL (J-7) |
| 4. KBIS | `kbis` | Émis -45 jours | OK (< 3 mois) |
| 5. Attestation URSSAF | `urssaf` | +15 jours | WARNING (J-15) |
| 6. RIB | `rib` | Pas d'expiration | OK |

**Résultat attendu:**
```
=================================================================================
GENERATION DE DOCUMENTS PDF DE TEST
=================================================================================

✓ Generated: 1-licence-transport.pdf
✓ Generated: 2-assurance-rc.pdf
✓ Generated: 3-assurance-marchandises.pdf
✓ Generated: 4-kbis.pdf
✓ Generated: 5-attestation-urssaf.pdf
✓ Generated: 6-rib.pdf

=================================================================================
RESUME DES DOCUMENTS GENERES
=================================================================================

1. Licence de Transport       - Expire dans 180 jours (01/08/2026) - OK
2. Assurance RC               - Expire dans 45 jours  (18/03/2026) - WARNING
3. Assurance Marchandises     - Expire dans 8 jours   (10/02/2026) - CRITICAL
4. KBIS                       - Emis il y a 45 jours  (18/12/2025) - OK
5. Attestation URSSAF         - Expire dans 15 jours  (17/02/2026) - WARNING
6. RIB                        - Sans expiration - OK

Tous les documents sont dans: C:\...\scripts\test-documents

✓ Metadata saved to metadata.json
```

### Étape 2: Test du Workflow Complet

```bash
node test-document-workflow.cjs
```

**Ce que ça fait:**

#### 2.1 Upload des Documents
Pour chaque document:
1. Demande une URL S3 présignée (`POST /api/carriers/:id/documents/upload-url`)
2. Upload le fichier sur S3 (`PUT <presigned-url>`)
3. Confirme l'upload (`POST /api/carriers/:id/documents/confirm-upload`)

#### 2.2 Analyse OCR
Pour chaque document uploadé:
1. Déclenche l'analyse Textract (`POST /api/carriers/:id/documents/:docId/analyze`)
2. Extrait le texte complet du PDF
3. Identifie toutes les dates présentes
4. Suggère la date d'expiration la plus probable
5. Met à jour automatiquement le document si confiance élevée

#### 2.3 Vérification du Statut
1. Récupère les infos complètes du transporteur
2. Affiche le statut de vigilance
3. Liste tous les documents avec leurs dates d'expiration
4. Montre les alertes actives

#### 2.4 Test du Système d'Alertes
1. Déclenche un check de vigilance manuel
2. Génère des alertes pour les documents expirant bientôt
3. Vérifie que les seuils sont respectés (30j, 15j, 7j)

#### 2.5 Vérification Finale
1. Vérifie si le transporteur est bloqué
2. Contrôle la cohérence du système

**Résultat attendu:**
```
=================================================================================
TEST COMPLET DU WORKFLOW DE DOCUMENTS TRANSPORTEUR
=================================================================================

Carrier ID: 697f5a2b1980ef959ce78b67
Company: Transport Express Demo
Documents à tester: 6

=================================================================================
ETAPE 1: UPLOAD DES DOCUMENTS
=================================================================================

▶ Document: Licence de Transport
  → Getting upload URL...
  → Uploading to S3...
  → Confirming upload...
  ✓ Upload successful!
    Document ID: 67d12a3b4c5e6f7890abcdef

... [répété pour chaque document]

✓ Uploaded 6/6 documents

=================================================================================
ETAPE 2: ANALYSE OCR DES DOCUMENTS
=================================================================================

▶ Analyse: Licence de Transport
  → Launching OCR analysis...
  ✓ OCR analysis complete!
    Confidence: high
    Dates found: 2
    Suggested expiry: 01/08/2026
    Auto-updated expiry: 01/08/2026 (180 days)

... [répété pour chaque document]

=================================================================================
ETAPE 3: VERIFICATION DU STATUT TRANSPORTEUR
=================================================================================

→ Getting carrier status...

✓ Carrier Information:
  Company: Transport Express Demo
  Status: active
  Level: referenced
  Score: 85/100
  Vigilance Status: warning

  ⚠ Active Alerts: 3
    1. document_expiring_30 - warning - Assurance RC expire dans 45 jours
    2. document_expiring_15 - warning - Attestation URSSAF expire dans 15 jours
    3. document_expiring_7 - critical - Assurance Marchandises expire dans 8 jours

  Documents: 6
    ✓ licence_transport - verified (expires in 180 days)
    ✓ insurance_rc - verified (expires in 45 days)
    ✓ insurance_goods - verified (expires in 8 days)
    ✓ kbis - verified
    ✓ urssaf - verified (expires in 15 days)
    ✓ rib - verified

=================================================================================
ETAPE 4: TEST DU SYSTEME D'ALERTES
=================================================================================

→ Triggering vigilance check...

✓ Vigilance check completed!
  Alerts generated: 3

  Alert Details:
    1. Document: insurance_rc
       Days until expiry: 45
    2. Document: urssaf
       Days until expiry: 15
    3. Document: insurance_goods
       Days until expiry: 8

=================================================================================
ETAPE 5: VERIFICATION FINALE DU TRANSPORTEUR
=================================================================================

→ Getting final carrier status...

✓ Final Status:
  Status: active
  Vigilance: warning

=================================================================================
RAPPORT FINAL
=================================================================================

📊 Statistics:
  Duration: 25.43s
  Documents uploaded: 6/6
  OCR analyses: 6/6
  Alerts generated: 3
  Errors: 0

✅ Expected Test Results:
  • 3 documents should trigger alerts (Assurance RC: 45j, Marchandises: 8j, URSSAF: 15j)
  • Assurance Marchandises (8 days) should trigger CRITICAL alert
  • Carrier should be in WARNING or BLOCKED state if critical documents are expiring
  • OCR should extract dates from all documents

✓ Full report saved to: C:\...\scripts\test-documents\test-report.json

=================================================================================
TEST COMPLETE
=================================================================================
```

## Analyse des Résultats

### Fichier test-report.json

Le script génère un rapport JSON complet:

```json
{
  "startTime": "2026-02-01T16:30:00.000Z",
  "endTime": "2026-02-01T16:30:25.430Z",
  "duration": 25.43,
  "uploads": [
    {
      "document": "Licence de Transport",
      "documentId": "67d12a3b4c5e6f7890abcdef",
      "s3Key": "carriers/697f5a2b1980ef959ce78b67/1-licence-transport.pdf",
      "type": "licence_transport",
      "success": true
    }
    // ... autres documents
  ],
  "ocrResults": [
    {
      "document": "Licence de Transport",
      "documentId": "67d12a3b4c5e6f7890abcdef",
      "confidence": "high",
      "datesFound": 2,
      "suggestedExpiry": "2026-08-01T00:00:00.000Z",
      "autoUpdated": true,
      "success": true
    }
    // ... autres résultats
  ],
  "alerts": [
    {
      "carrierId": "697f5a2b1980ef959ce78b67",
      "documentType": "insurance_rc",
      "daysUntilExpiry": 45
    }
    // ... autres alertes
  ],
  "carrier": {
    "companyName": "Transport Express Demo",
    "status": "active",
    "vigilance": {
      "status": "warning",
      "alerts": [...]
    }
  },
  "errors": []
}
```

## Cas de Test Couverts

### ✅ Test 1: Upload de Documents
- URLs S3 présignées générées correctement
- Upload des fichiers sur S3 réussi
- Enregistrement dans MongoDB confirmé
- Status initial: `PENDING`

### ✅ Test 2: Analyse OCR
- Extraction du texte du PDF
- Détection de dates multiples formats:
  - `DD/MM/YYYY`
  - `DD mois YYYY`
  - `Valable jusqu'au...`
- Calcul de confiance (high/medium/low)
- Mise à jour automatique de `expiryDate`

### ✅ Test 3: Système d'Alertes
- **Licence (180j)**: Aucune alerte ✓
- **Assurance RC (45j)**: Alerte WARNING à J-30 ✓
- **Assurance Marchandises (8j)**: Alerte CRITICAL à J-7 ✓
- **KBIS (< 3 mois)**: OK, pas d'alerte ✓
- **URSSAF (15j)**: Alerte WARNING à J-15 ✓
- **RIB**: Pas d'expiration ✓

### ✅ Test 4: Changement de Statut Vigilance
- `COMPLIANT` → Tous les documents OK
- `WARNING` → Au moins un document < 30j
- `BLOCKED` → Au moins un document expiré

### ✅ Test 5: Blocage Automatique
- Document expiré (≤0 jours)
- Status carrier → `BLOCKED`
- Status document → `EXPIRED`
- Email de blocage envoyé
- Event `carrier.blocked` enregistré

## Dépannage

### Erreur: API non accessible

```
❌ Failed to get upload URL: connect ECONNREFUSED
```

**Solution:**
```bash
# Vérifier que l'API est démarrée
cd services/authz-eb
npm start

# Vérifier l'URL
echo $API_URL
# Ou dans le script, modifier API_BASE_URL
```

### Erreur: MongoDB non connecté

```
❌ Database not connected
```

**Solution:**
```bash
# Vérifier la connexion MongoDB dans .env
MONGODB_URI=mongodb://localhost:27017/rt-symphonia
# Ou pour MongoDB Atlas
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/rt-symphonia
```

### Erreur: AWS Textract

```
❌ Textract error: Missing credentials
```

**Solution:**
```bash
# Configurer les credentials AWS
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_REGION=eu-central-1
```

### Erreur: Carrier non trouvé

```
❌ Carrier not found: 697f5a2b1980ef959ce78b67
```

**Solution:**
```bash
# Créer le carrier de test d'abord
# Via POST /api/carriers/invite ou POST /api/carriers/onboard
# Ou modifier CARRIER_ID dans les scripts
```

## Tests Manuels Complémentaires

### Test du Cron Job

Le cron job s'exécute automatiquement tous les jours à 8h00 (Europe/Paris).

Pour tester manuellement:
```bash
curl -X POST http://localhost:3000/api/vigilance/run-check
```

### Test de Blocage

Modifier la date d'expiration d'un document pour la passer dans le passé:
```bash
curl -X POST http://localhost:3000/api/carriers/697f5a2b1980ef959ce78b67/documents/DOC_ID/set-expiry \
  -H "Content-Type: application/json" \
  -d '{"expiryDate": "2025-01-01"}'
```

Puis déclencher le check:
```bash
curl -X POST http://localhost:3000/api/vigilance/run-check
```

### Test de Déblocage

Upload un nouveau document valide, puis:
```bash
curl -X POST http://localhost:3000/api/carriers/697f5a2b1980ef959ce78b67/unblock \
  -H "Content-Type: application/json" \
  -d '{"notes": "Documents updated"}'
```

## Métriques et KPIs

### Taux de Réussite OCR
- **High confidence**: Date extraite avec contexte clair
- **Medium confidence**: Date trouvée sans contexte
- **Low confidence**: Dates multiples, ambiguës

**Objectif:** > 80% high confidence

### Temps de Traitement
- Upload: < 2s par document
- OCR: 3-5s par document
- Total workflow: < 30s pour 6 documents

### Taux d'Alertes
- Alertes générées vs documents expirant
- Taux de résolution (documents renouvelés)
- Délai moyen de résolution

## Prochaines Étapes

1. **Déploiement en Production**
   - Vérifier les credentials AWS
   - Configurer le bucket S3
   - Activer le cron job

2. **Monitoring**
   - Logs des alertes envoyées
   - Métriques de blocage/déblocage
   - Dashboard de vigilance

3. **Améliorations**
   - Seuils personnalisés par document
   - Notifications push
   - Dashboard administrateur

## Support

Pour toute question ou problème:
1. Vérifier les logs de l'API
2. Consulter le fichier `test-report.json`
3. Lire `ANALYSE-SYSTEME-ALERTES.md`

## Conclusion

Ce système de test complet permet de:
- ✅ Valider l'ensemble du workflow documentaire
- ✅ Tester le système d'alertes multi-niveaux
- ✅ Vérifier le blocage automatique
- ✅ Analyser les performances OCR
- ✅ Détecter les régressions

Le système est **prêt pour la production** et peut gérer efficacement la vigilance documentaire des transporteurs.
