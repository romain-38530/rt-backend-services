# Jour 12 - Script d'Invitation Transporteurs Test

## Résumé

Le script `invite-test-carriers.cjs` a été créé avec succès pour automatiser la création de transporteurs de test de bout en bout.

## Fichiers Créés

### 1. Script Principal
**📄 `scripts/invite-test-carriers.cjs`** (20 KB)
- Script complet et fonctionnel
- Workflow de A à Z
- Gestion d'erreurs robuste
- Interface interactive avec prompts
- Barre de progression et couleurs
- Génération de rapport JSON

### 2. Script de Test
**📄 `scripts/test-invite-script.cjs`** (8.5 KB)
- Vérification de la configuration
- Test MongoDB, API, AWS
- Validation des dépendances
- Rapport pré-exécution

### 3. Documentation
**📄 `scripts/README-invite-test-carriers.md`** (7.6 KB)
- Guide d'utilisation complet
- Exemples de configuration
- Workflow détaillé
- Troubleshooting

**📄 `scripts/EXEMPLE-RAPPORT.md`** (14.4 KB)
- Exemples de rapports JSON
- Sortie console détaillée
- Interprétation des résultats
- Commandes d'analyse

**📄 `scripts/INDEX-SCRIPTS.md`** (7.2 KB)
- Index de tous les scripts
- Ordre d'exécution recommandé
- Variables d'environnement
- Documentation associée

## Caractéristiques du Script

### Workflow Complet

```
1. Prompt utilisateur
   ├─ Nombre de carriers (1-5)
   └─ Prefix email

2. Génération données
   ├─ Noms d'entreprises fictifs
   ├─ Emails avec prefix
   ├─ SIRET valides (14 chiffres)
   ├─ Téléphones français (+336...)
   └─ Adresses complètes

3. Création carriers
   └─ POST /api/carriers/invite

4. Génération documents (6 types)
   ├─ Kbis (expire +6 mois)
   ├─ URSSAF (expire +12 mois)
   ├─ Assurance RC Pro (expire +12 mois)
   ├─ Licence Transport (expire +12 mois)
   ├─ Carte Grise (expire +12 mois)
   └─ Attestation Vigilance (expire +6 mois)

5. Upload S3
   ├─ POST /api/carriers/:id/documents/upload-url
   ├─ PUT vers S3
   └─ POST /api/carriers/:id/documents/confirm-upload

6. Vérification documents
   └─ POST /api/carriers/:id/documents/:docId/verify

7. Calcul score
   └─ POST /api/carriers/:id/calculate-score

8. Check Affret.IA
   └─ Vérification score >= 70

9. Rapport JSON
   └─ scripts/invite-report-{timestamp}.json
```

### Fonctionnalités Clés

✅ **Interface Interactive**
- Prompts utilisateur avec readline
- Validation des entrées
- Messages colorés et emojis

✅ **Génération Automatique**
- PDFs valides avec contenu
- Données cohérentes (SIRET, téléphone, adresse)
- Dates d'expiration réalistes

✅ **Gestion d'Erreurs**
- Try/catch sur chaque étape
- Continue même si un carrier échoue
- Logging détaillé des erreurs
- Rapport final avec erreurs

✅ **Rapport Détaillé**
- Format JSON structuré
- Statistiques globales
- Détails par carrier
- Liste des erreurs

✅ **Performance**
- Délais entre requêtes (200ms)
- Évite de surcharger l'API
- Gestion asynchrone optimisée

## Structure du Rapport

```json
{
  "timestamp": "ISO 8601",
  "carriersCreated": 3,
  "carriers": [
    {
      "id": "MongoDB ObjectId",
      "companyName": "Nom entreprise",
      "email": "email@example.com",
      "siret": "14 chiffres",
      "phone": "+336xxxxxxxx",
      "score": 85,
      "level": "referenced|guest",
      "affretIAEligible": true|false,
      "documentsUploaded": 6,
      "documentsVerified": 6,
      "errors": ["liste erreurs"]
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

## Exemples d'Utilisation

### Création Simple

```bash
node scripts/invite-test-carriers.cjs

# Nombre de carriers à créer (1-5): 3
# Prefix email: demo
# → Crée demo1@example.com, demo2@example.com, demo3@example.com
```

### Test Rapide

```bash
node scripts/invite-test-carriers.cjs

# Nombre de carriers à créer (1-5): 1
# Prefix email: quicktest
# → Crée quicktest1@example.com
```

### Test Complet

```bash
node scripts/invite-test-carriers.cjs

# Nombre de carriers à créer (1-5): 5
# Prefix email: full
# → Crée full1 à full5@example.com
```

## Vérification Avant Exécution

```bash
# 1. Vérifier la configuration
node scripts/test-invite-script.cjs

# Si tous les tests passent :
# ✅ Tous les tests sont passés !
# Vous pouvez exécuter le script:
# node scripts/invite-test-carriers.cjs
```

## API Endpoints Utilisés

| Endpoint | Méthode | Usage |
|----------|---------|-------|
| `/api/carriers/invite` | POST | Créer un carrier |
| `/api/carriers/:id/documents/upload-url` | POST | Obtenir URL S3 |
| `/api/carriers/:id/documents/confirm-upload` | POST | Confirmer upload |
| `/api/carriers/:id/documents/:docId/verify` | POST | Vérifier document |
| `/api/carriers/:id/calculate-score` | POST | Calculer score |
| `/api/carriers/:id` | GET | Récupérer infos |

## Dépendances

```json
{
  "dependencies": {
    "dotenv": "^16.0.0",
    "mongodb": "^6.0.0",
    "node-fetch": "^2.6.7",
    "readline": "built-in"
  }
}
```

## Variables d'Environnement

```env
# Requis
MONGODB_URI=mongodb://localhost:27017/rt-authz
AWS_REGION=eu-central-1
S3_DOCUMENTS_BUCKET=rt-carrier-documents

# Optionnel (avec valeurs par défaut)
API_URL=http://localhost:3001  # Default
```

## Limitations et Contraintes

- **Maximum 5 carriers** par exécution
- **PDFs minimaux** (pas d'OCR réel possible)
- **Auto-vérification** (tous les documents approuvés)
- **Pas d'envoi email** (uniquement création)
- **Délais fixes** (200ms entre requêtes)

## Cas d'Usage

### 1. Tests Fonctionnels

Valider le workflow complet d'onboarding :
```bash
node scripts/invite-test-carriers.cjs
# → 1 carrier pour tester rapidement
```

### 2. Tests de Charge

Créer plusieurs carriers pour tester la performance :
```bash
node scripts/invite-test-carriers.cjs
# → 5 carriers pour tester la charge
```

### 3. Démo Client

Préparer des données de démonstration :
```bash
node scripts/invite-test-carriers.cjs
# Prefix: demo
# → Carriers de démonstration prêts
```

### 4. Tests d'Intégration

Valider les intégrations S3, MongoDB, API :
```bash
node scripts/test-invite-script.cjs
node scripts/invite-test-carriers.cjs
# → Validation complète
```

## Intégration avec Autres Scripts

Le script s'intègre avec :

- **test-systeme-complet.js** : Vérification système avant
- **test-webhooks.cjs** : Test webhooks après création
- **test-email-metrics.cjs** : Analyse des emails envoyés
- **vigilance-cron.js** : Vérification vigilance des carriers

## Maintenance

### Nettoyage des Carriers Test

```javascript
// MongoDB
db.carriers.deleteMany({
  email: { $regex: /^(demo|test|quicktest|full).*@example\.com$/ }
})

// Ou via API
DELETE /api/carriers/:id
```

### Vérification des Données

```javascript
// Compter les carriers test
db.carriers.count({
  email: { $regex: /@example\.com$/ }
})

// Voir les scores
db.carriers.find(
  { email: { $regex: /@example\.com$/ } },
  { companyName: 1, score: 1, level: 1 }
).pretty()
```

## Tests de Validation

### Test 1 : Création Carrier

```bash
node scripts/invite-test-carriers.cjs
# Input: 1 carrier, prefix "validation1"
# Expected: 1 carrier créé, 6 documents, score > 0
```

### Test 2 : Upload Documents

```bash
# Vérifier dans S3
aws s3 ls s3://rt-carrier-documents/carriers/ --recursive
# Expected: 6 fichiers PDF par carrier
```

### Test 3 : Score Calculation

```bash
# Vérifier dans MongoDB
db.carriers.find({ email: /validation1/ }, { score: 1, scoreDetails: 1 })
# Expected: score entre 70-100
```

### Test 4 : Rapport JSON

```bash
cat scripts/invite-report-*.json | jq '.summary'
# Expected: avgScore > 70, affretIAEligible > 0
```

## Métriques de Succès

- ✅ **Création**: 100% des carriers créés
- ✅ **Documents**: 6/6 uploadés et vérifiés
- ✅ **Score**: Moyenne >= 70
- ✅ **Affret.IA**: Majorité éligible
- ✅ **Erreurs**: 0 erreur fatale

## Prochaines Améliorations

### Court Terme

- [ ] Support > 5 carriers (mode batch)
- [ ] Mode non-interactif (arguments CLI)
- [ ] Génération de PDFs plus réalistes
- [ ] Envoi réel des emails d'invitation

### Moyen Terme

- [ ] Tests d'OCR réels avec Textract
- [ ] Support de webhooks
- [ ] Mode nettoyage automatique
- [ ] Export rapport en HTML/PDF

### Long Terme

- [ ] Interface web pour exécution
- [ ] Planification (cron jobs)
- [ ] Analytics et statistiques
- [ ] Intégration CI/CD

## Documentation Associée

- [README-invite-test-carriers.md](./scripts/README-invite-test-carriers.md)
- [EXEMPLE-RAPPORT.md](./scripts/EXEMPLE-RAPPORT.md)
- [INDEX-SCRIPTS.md](./scripts/INDEX-SCRIPTS.md)
- [CARRIER_SYSTEM_DOCUMENTATION.md](./CARRIER_SYSTEM_DOCUMENTATION.md)

## Ressources

### Fichiers Principaux

```
scripts/
├── invite-test-carriers.cjs         ⭐ Script principal
├── test-invite-script.cjs           🧪 Test config
├── README-invite-test-carriers.md   📖 Guide
├── EXEMPLE-RAPPORT.md               📊 Exemples
└── INDEX-SCRIPTS.md                 📑 Index
```

### Rapports Générés

```
scripts/
└── invite-report-YYYY-MM-DDTHH-mm-ss.json
```

## Support

Pour toute question ou problème :

1. Consulter [README-invite-test-carriers.md](./scripts/README-invite-test-carriers.md)
2. Vérifier [EXEMPLE-RAPPORT.md](./scripts/EXEMPLE-RAPPORT.md)
3. Exécuter `node scripts/test-invite-script.cjs`
4. Consulter les logs de l'API
5. Vérifier MongoDB et S3

## Conclusion

Le script `invite-test-carriers.cjs` est :

- ✅ **Complet** : Workflow de A à Z
- ✅ **Robuste** : Gestion d'erreurs complète
- ✅ **Documenté** : 4 fichiers de documentation
- ✅ **Testé** : Script de validation inclus
- ✅ **Interactif** : Interface utilisateur intuitive
- ✅ **Professionnel** : Couleurs, emojis, rapports

Le script est prêt pour :
- Tests fonctionnels
- Démonstrations clients
- Tests d'intégration
- Validation du workflow complet

---

**Date de création**: 2024-02-01 (Jour 12)
**Version**: 1.0.0
**Statut**: ✅ Production Ready
