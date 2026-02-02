# Exemple de Rapport - invite-test-carriers.cjs

## Rapport JSON Complet

Voici un exemple de rapport généré par le script `invite-test-carriers.cjs` :

```json
{
  "timestamp": "2024-01-15T14:30:45.123Z",
  "carriersCreated": 3,
  "carriers": [
    {
      "id": "65a4b2c3d4e5f6g7h8i9j0k1",
      "companyName": "Transport Express 1",
      "email": "demo1@example.com",
      "siret": "12345678901234",
      "phone": "+33612345678",
      "score": 85,
      "level": "referenced",
      "affretIAEligible": true,
      "documentsUploaded": 6,
      "documentsVerified": 6,
      "errors": []
    },
    {
      "id": "65a4b2c3d4e5f6g7h8i9j0k2",
      "companyName": "Logistique Rapide 2",
      "email": "demo2@example.com",
      "siret": "98765432109876",
      "phone": "+33687654321",
      "score": 72,
      "level": "referenced",
      "affretIAEligible": true,
      "documentsUploaded": 6,
      "documentsVerified": 6,
      "errors": []
    },
    {
      "id": "65a4b2c3d4e5f6g7h8i9j0k3",
      "companyName": "Fret International 3",
      "email": "demo3@example.com",
      "siret": "45678912345678",
      "phone": "+33645678912",
      "score": 90,
      "level": "referenced",
      "affretIAEligible": true,
      "documentsUploaded": 6,
      "documentsVerified": 6,
      "errors": []
    }
  ],
  "summary": {
    "avgScore": 82.33,
    "affretIAEligible": 3,
    "totalDocuments": 18
  },
  "errors": []
}
```

## Rapport avec Erreurs

Exemple lorsqu'il y a des erreurs lors du traitement :

```json
{
  "timestamp": "2024-01-15T15:22:10.456Z",
  "carriersCreated": 2,
  "carriers": [
    {
      "id": "65a4b2c3d4e5f6g7h8i9j0k1",
      "companyName": "Transport Express 1",
      "email": "test1@example.com",
      "siret": "12345678901234",
      "phone": "+33612345678",
      "score": 85,
      "level": "referenced",
      "affretIAEligible": true,
      "documentsUploaded": 6,
      "documentsVerified": 6,
      "errors": []
    },
    {
      "id": "65a4b2c3d4e5f6g7h8i9j0k2",
      "companyName": "Logistique Rapide 2",
      "email": "test2@example.com",
      "siret": "98765432109876",
      "phone": "+33687654321",
      "score": 65,
      "level": "guest",
      "affretIAEligible": false,
      "documentsUploaded": 5,
      "documentsVerified": 4,
      "errors": [
        "Upload Carte Grise: Failed to get upload URL: 500",
        "Verify Licence Transport: Failed to verify document: 400"
      ]
    }
  ],
  "summary": {
    "avgScore": 75.0,
    "affretIAEligible": 1,
    "totalDocuments": 11
  },
  "errors": []
}
```

## Sortie Console - Succès Complet

```
╔═══════════════════════════════════════════════════╗
║                                                   ║
║   Script d'Invitation Transporteurs Test         ║
║              Jour 12 - SYMPHONI.A                 ║
║                                                   ║
╚═══════════════════════════════════════════════════╝

Configuration:

Nombre de carriers à créer (1-5): 3
Prefix email (ex: "test" → test1@example.com): demo

ℹ️ Configuration: 3 carrier(s) avec prefix "demo"
ℹ️ API: http://localhost:3001
ℹ️ MongoDB: mongodb://localhost:27017/rt-authz

ℹ️ Connexion à MongoDB...
✅ Connecté à MongoDB
✅ Industriel trouvé: admin@symphonia.com

ℹ️ Génération des données carriers...
✅ 3 carrier(s) généré(s)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Carrier 1/3: Transport Express 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[████░░░░░░░░░░░░░░░░] 16% - Création du carrier...
ℹ️ Création du carrier: Transport Express 1
✅ Carrier créé: 65a4b2c3d4e5f6g7h8i9j0k1

[████████░░░░░░░░░░░░] 33% - Upload des documents...
✅   [1/6] Kbis
✅   [2/6] URSSAF
✅   [3/6] Assurance RC Pro
✅   [4/6] Licence Transport
✅   [5/6] Carte Grise
✅   [6/6] Attestation Vigilance

[████████████░░░░░░░░] 50% - Vérification des documents...
✅ Document vérifié: Kbis
✅ Document vérifié: URSSAF
✅ Document vérifié: Assurance RC Pro
✅ Document vérifié: Licence Transport
✅ Document vérifié: Carte Grise
✅ Document vérifié: Attestation Vigilance

[████████████████░░░░] 66% - Calcul du score...
✅ Score calculé: 85/100

[████████████████████] 83% - Check éligibilité Affret.IA...
✅ Éligible Affret.IA (score >= 70)

[████████████████████] 100% - Récupération des infos finales...
✅ Niveau final: referenced

✅ Carrier Transport Express 1 traité avec succès

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Carrier 2/3: Logistique Rapide 2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[████░░░░░░░░░░░░░░░░] 16% - Création du carrier...
ℹ️ Création du carrier: Logistique Rapide 2
✅ Carrier créé: 65a4b2c3d4e5f6g7h8i9j0k2

[████████░░░░░░░░░░░░] 33% - Upload des documents...
✅   [1/6] Kbis
✅   [2/6] URSSAF
✅   [3/6] Assurance RC Pro
✅   [4/6] Licence Transport
✅   [5/6] Carte Grise
✅   [6/6] Attestation Vigilance

[████████████░░░░░░░░] 50% - Vérification des documents...
✅ Document vérifié: Kbis
✅ Document vérifié: URSSAF
✅ Document vérifié: Assurance RC Pro
✅ Document vérifié: Licence Transport
✅ Document vérifié: Carte Grise
✅ Document vérifié: Attestation Vigilance

[████████████████░░░░] 66% - Calcul du score...
✅ Score calculé: 72/100

[████████████████████] 83% - Check éligibilité Affret.IA...
✅ Éligible Affret.IA (score >= 70)

[████████████████████] 100% - Récupération des infos finales...
✅ Niveau final: referenced

✅ Carrier Logistique Rapide 2 traité avec succès

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Carrier 3/3: Fret International 3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[████░░░░░░░░░░░░░░░░] 16% - Création du carrier...
ℹ️ Création du carrier: Fret International 3
✅ Carrier créé: 65a4b2c3d4e5f6g7h8i9j0k3

[████████░░░░░░░░░░░░] 33% - Upload des documents...
✅   [1/6] Kbis
✅   [2/6] URSSAF
✅   [3/6] Assurance RC Pro
✅   [4/6] Licence Transport
✅   [5/6] Carte Grise
✅   [6/6] Attestation Vigilance

[████████████░░░░░░░░] 50% - Vérification des documents...
✅ Document vérifié: Kbis
✅ Document vérifié: URSSAF
✅ Document vérifié: Assurance RC Pro
✅ Document vérifié: Licence Transport
✅ Document vérifié: Carte Grise
✅ Document vérifié: Attestation Vigilance

[████████████████░░░░] 66% - Calcul du score...
✅ Score calculé: 90/100

[████████████████████] 83% - Check éligibilité Affret.IA...
✅ Éligible Affret.IA (score >= 70)

[████████████████████] 100% - Récupération des infos finales...
✅ Niveau final: referenced

✅ Carrier Fret International 3 traité avec succès

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
               RAPPORT FINAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Carriers créés: 3
Score moyen: 82.3/100
Éligibles Affret.IA: 3/3
Documents uploadés: 18

Détails par carrier:

✅ 1. Transport Express 1
   Email: demo1@example.com
   Score: 85/100 | Niveau: referenced
   Documents: 6/6 vérifiés
   Affret.IA: Oui

✅ 2. Logistique Rapide 2
   Email: demo2@example.com
   Score: 72/100 | Niveau: referenced
   Documents: 6/6 vérifiés
   Affret.IA: Oui

✅ 3. Fret International 3
   Email: demo3@example.com
   Score: 90/100 | Niveau: referenced
   Documents: 6/6 vérifiés
   Affret.IA: Oui

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Rapport sauvegardé: scripts/invite-report-2024-01-15T14-30-45.json

✅ Script terminé avec succès !
ℹ️ Connexion MongoDB fermée
```

## Sortie Console - Avec Erreurs

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Carrier 2/2: Logistique Rapide 2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[████░░░░░░░░░░░░░░░░] 16% - Création du carrier...
ℹ️ Création du carrier: Logistique Rapide 2
✅ Carrier créé: 65a4b2c3d4e5f6g7h8i9j0k2

[████████░░░░░░░░░░░░] 33% - Upload des documents...
✅   [1/6] Kbis
✅   [2/6] URSSAF
✅   [3/6] Assurance RC Pro
✅   [4/6] Licence Transport
❌ Erreur upload document Carte Grise: Failed to get upload URL: 500
⚠️   [5/6] Carte Grise - ÉCHEC
✅   [6/6] Attestation Vigilance

[████████████░░░░░░░░] 50% - Vérification des documents...
✅ Document vérifié: Kbis
✅ Document vérifié: URSSAF
✅ Document vérifié: Assurance RC Pro
❌ Erreur vérification document Licence Transport: Failed to verify document: 400
✅ Document vérifié: Attestation Vigilance

[████████████████░░░░] 66% - Calcul du score...
⚠️ Score: 65/100

[████████████████████] 83% - Check éligibilité Affret.IA...
ℹ️ Non éligible Affret.IA (score < 70)

[████████████████████] 100% - Récupération des infos finales...
✅ Niveau final: guest

✅ Carrier Logistique Rapide 2 traité avec succès

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
               RAPPORT FINAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Carriers créés: 2
Score moyen: 75.0/100
Éligibles Affret.IA: 1/2
Documents uploadés: 11

Détails par carrier:

✅ 1. Transport Express 1
   Email: test1@example.com
   Score: 85/100 | Niveau: referenced
   Documents: 6/6 vérifiés
   Affret.IA: Oui

⚠️ 2. Logistique Rapide 2
   Email: test2@example.com
   Score: 65/100 | Niveau: guest
   Documents: 4/5 vérifiés
   Affret.IA: Non
   Erreurs: 2
     - Upload Carte Grise: Failed to get upload URL: 500
     - Verify Licence Transport: Failed to verify document: 400

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Rapport sauvegardé: scripts/invite-report-2024-01-15T15-22-10.json

✅ Script terminé avec succès !
```

## Interprétation des Résultats

### Score

- **85-100** : Excellent - Carrier éligible Affret.IA
- **70-84** : Bon - Carrier éligible Affret.IA
- **50-69** : Moyen - Non éligible Affret.IA
- **0-49** : Faible - Documents manquants

### Niveau

- **referenced** : Tous les documents vérifiés, score > 70
- **guest** : Carrier invité, documents incomplets

### Affret.IA

Éligibilité au système Affret.IA :
- ✅ **true** : Score >= 70
- ❌ **false** : Score < 70

### Documents

- **documentsUploaded** : Nombre de documents uploadés sur S3
- **documentsVerified** : Nombre de documents vérifiés et approuvés
- Ratio optimal : 6/6

## Utilisation du Rapport

### 1. Analyse des Performances

```bash
# Compter les carriers éligibles
jq '.summary.affretIAEligible' invite-report-*.json

# Trouver le meilleur score
jq '.carriers | max_by(.score)' invite-report-*.json

# Lister les erreurs
jq '.carriers[] | select(.errors | length > 0) | {companyName, errors}' invite-report-*.json
```

### 2. Export CSV

Convertir le JSON en CSV pour analyse Excel :

```bash
jq -r '.carriers[] | [.companyName, .email, .score, .level, .affretIAEligible] | @csv' invite-report-*.json > carriers.csv
```

### 3. Vérification MongoDB

```javascript
// Vérifier dans MongoDB
db.carriers.find({ email: { $regex: /^demo.*@example\.com$/ } })
  .project({ companyName: 1, email: 1, score: 1, level: 1 })
  .pretty()
```

### 4. Vérification S3

```bash
# Lister les documents uploadés
aws s3 ls s3://rt-carrier-documents/carriers/ --recursive | grep demo
```

## Troubleshooting

### Aucun carrier créé

- Vérifier que l'API est démarrée
- Vérifier qu'un utilisateur industriel existe
- Vérifier les logs de l'API

### Documents non uploadés

- Vérifier les credentials AWS
- Vérifier le bucket S3 existe
- Vérifier les permissions IAM

### Score à 0

- Vérifier que les documents sont bien vérifiés
- Relancer le calcul du score manuellement
- Vérifier les règles de scoring

### Email non reçu

- Vérifier la configuration SMTP
- Vérifier les logs email dans MongoDB
- Le script actuel ne déclenche pas l'envoi automatique
