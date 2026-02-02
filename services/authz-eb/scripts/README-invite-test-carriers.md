# Script d'Invitation Transporteurs Test - Jour 12

## Description

Ce script crée des transporteurs de test de A à Z pour valider tout le workflow SYMPHONI.A :

1. Création de carriers via l'API
2. Génération automatique de 6 documents PDF par carrier
3. Upload des documents vers S3
4. Vérification automatique des documents
5. Calcul du score
6. Check éligibilité Affret.IA
7. Génération d'un rapport JSON détaillé

## Prérequis

- Node.js installé
- MongoDB accessible
- API SYMPHONI.A démarrée
- Variables d'environnement configurées (.env)
- Au moins un utilisateur industriel/admin dans la base

## Installation

```bash
cd rt-backend-services/services/authz-eb
npm install  # Si pas déjà fait
```

## Configuration

Le script utilise les variables d'environnement suivantes :

```env
# Dans .env
MONGODB_URI=mongodb://localhost:27017/rt-authz
API_URL=http://localhost:3001
AWS_REGION=eu-central-1
S3_DOCUMENTS_BUCKET=rt-carrier-documents
```

## Usage

```bash
node scripts/invite-test-carriers.cjs
```

Le script vous demandera :

1. **Nombre de carriers** (1-5)
   - Exemple : `3`

2. **Prefix email**
   - Exemple : `test` → générera test1@example.com, test2@example.com, test3@example.com

## Workflow Complet

### Étape 1 : Création du Carrier
- POST `/api/carriers/invite`
- Données générées automatiquement :
  - Nom d'entreprise fictif
  - Email avec prefix
  - SIRET valide (14 chiffres)
  - Téléphone français (+336...)
  - Adresse complète

### Étape 2 : Génération des Documents

6 types de documents PDF sont générés automatiquement :

| Document | Type | Expiration |
|----------|------|------------|
| Kbis | Document légal | +6 mois |
| URSSAF | Attestation sociale | +12 mois |
| Assurance RC Pro | Assurance | +12 mois |
| Licence Transport | Licence | +12 mois |
| Carte Grise | Véhicule | +12 mois |
| Attestation Vigilance | Vigilance | +6 mois |

### Étape 3 : Upload S3

Pour chaque document :
1. POST `/api/carriers/:id/documents/upload-url` → Obtenir URL présignée
2. PUT vers S3 → Upload du PDF
3. POST `/api/carriers/:id/documents/confirm-upload` → Confirmer

### Étape 4 : Vérification

- POST `/api/carriers/:id/documents/:docId/verify`
- Tous les documents sont approuvés automatiquement

### Étape 5 : Calcul du Score

- POST `/api/carriers/:id/calculate-score`
- Le score est calculé selon les règles SYMPHONI.A

### Étape 6 : Éligibilité Affret.IA

- Vérification : score >= 70
- Si éligible, marqué dans le rapport

## Rapport Final

Le script génère un rapport JSON détaillé :

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "carriersCreated": 3,
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
    }
  ],
  "summary": {
    "avgScore": 82.4,
    "affretIAEligible": 2,
    "totalDocuments": 18
  },
  "errors": []
}
```

Le rapport est sauvegardé dans :
```
scripts/invite-report-YYYY-MM-DDTHH-mm-ss.json
```

## Exemple d'Exécution

```bash
$ node scripts/invite-test-carriers.cjs

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

[████████████████████] 33% - Création du carrier...
ℹ️ Création du carrier: Transport Express 1
✅ Carrier créé: 65a4b2c3d4e5f6g7h8i9j0k1

[████████████████████] 66% - Upload des documents...
✅   [1/6] Kbis
✅   [2/6] URSSAF
✅   [3/6] Assurance RC Pro
✅   [4/6] Licence Transport
✅   [5/6] Carte Grise
✅   [6/6] Attestation Vigilance

[████████████████████] 100% - Vérification des documents...
✅ Document vérifié: Kbis
✅ Document vérifié: URSSAF
...

✅ Carrier Transport Express 1 traité avec succès

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
               RAPPORT FINAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Carriers créés: 3
Score moyen: 82.4/100
Éligibles Affret.IA: 2/3
Documents uploadés: 18

✅ Rapport sauvegardé: scripts/invite-report-2024-01-15T10-30-00.json

✅ Script terminé avec succès !
```

## Gestion d'Erreurs

Le script continue même si un carrier échoue :

- Try/catch sur chaque étape
- Logging détaillé des erreurs
- Les erreurs sont enregistrées dans le rapport
- Le script ne s'arrête pas au premier échec

## Interactivité

- Prompts avec readline
- Barre de progression colorée
- Emojis pour la lisibilité
- Couleurs ANSI pour les différents statuts :
  - ✅ Vert : Succès
  - ❌ Rouge : Erreur
  - ⚠️ Jaune : Avertissement
  - ℹ️ Bleu : Information

## Limites

- Maximum 5 carriers par exécution (pour éviter la surcharge)
- Délais de 200ms entre chaque opération API
- PDFs générés sont minimaux (pas d'OCR réel)
- Les documents sont auto-approuvés

## Debugging

Pour débugger, vérifiez :

1. **Logs API** : Vérifier les logs du serveur
2. **MongoDB** : Vérifier les collections `carriers` et `carrier_documents`
3. **S3** : Vérifier le bucket `rt-carrier-documents`
4. **Rapport JSON** : Voir les erreurs détaillées

## Nettoyage

Pour supprimer les carriers de test créés :

```bash
# Connexion MongoDB
mongo rt-authz

# Supprimer les carriers de test
db.carriers.deleteMany({
  email: { $regex: /^demo.*@example\.com$/ }
})

# Supprimer les documents associés
db.carrier_documents.deleteMany({
  carrierId: { $in: [/* IDs des carriers supprimés */] }
})
```

## Support

Pour toute question ou problème :
- Vérifier les logs dans la console
- Consulter le rapport JSON généré
- Vérifier la configuration .env
- S'assurer que l'API est accessible

## Prochaines Améliorations

- [ ] Support de plus de 5 carriers
- [ ] Mode batch (sans prompts)
- [ ] Génération de PDFs plus réalistes
- [ ] Tests d'OCR réels
- [ ] Envoi réel des emails d'invitation
- [ ] Support de webhooks
- [ ] Mode nettoyage automatique
