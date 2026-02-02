# Quick Start - Script d'Invitation Transporteurs Test

## En 3 Minutes

### 1. Voir la Démo (30 secondes)

```bash
node scripts/demo-invite-carriers.cjs
```

Cela montre visuellement comment le script fonctionne.

### 2. Vérifier la Configuration (1 minute)

```bash
node scripts/test-invite-script.cjs
```

Si tous les tests passent ✅, continuez.

### 3. Créer vos Transporteurs Test (1-2 minutes)

```bash
node scripts/invite-test-carriers.cjs
```

Répondez aux prompts :
- **Nombre**: 1-5
- **Prefix**: ex: "demo" → demo1@example.com, demo2@example.com

## C'est Tout !

Le script va :
- ✅ Créer les carriers
- ✅ Générer 6 documents PDF par carrier
- ✅ Uploader vers S3
- ✅ Vérifier automatiquement
- ✅ Calculer les scores
- ✅ Générer un rapport JSON

## Vérifier les Résultats

### Rapport JSON

```bash
# Voir le dernier rapport
ls -lt scripts/invite-report-*.json | head -1

# Lire le rapport
cat scripts/invite-report-*.json | jq '.'
```

### MongoDB

```javascript
// Se connecter
mongo rt-authz

// Voir les carriers créés
db.carriers.find({ email: { $regex: /@example\.com$/ } })
  .project({ companyName: 1, email: 1, score: 1, level: 1 })
  .pretty()
```

### S3

```bash
# Lister les documents uploadés
aws s3 ls s3://rt-carrier-documents/carriers/ --recursive
```

## Problèmes ?

### Erreur MongoDB

```bash
# Vérifier que MongoDB est démarré
mongo --eval "db.runCommand({ ping: 1 })"

# Si non démarré
mongod --dbpath /path/to/data
```

### Erreur API

```bash
# Vérifier que l'API est démarrée
curl http://localhost:3001/health

# Si non démarrée
cd rt-backend-services/services/authz-eb
npm start
```

### Erreur AWS S3

```bash
# Vérifier les credentials
aws sts get-caller-identity

# Vérifier le bucket existe
aws s3 ls s3://rt-carrier-documents/
```

## Commandes Utiles

### Créer 1 Carrier Rapide

```bash
# Dans invite-test-carriers.cjs
# Nombre: 1
# Prefix: test
```

### Créer 5 Carriers pour Tests

```bash
# Dans invite-test-carriers.cjs
# Nombre: 5
# Prefix: demo
```

### Analyser le Rapport

```bash
# Score moyen
jq '.summary.avgScore' invite-report-*.json

# Carriers éligibles Affret.IA
jq '.summary.affretIAEligible' invite-report-*.json

# Meilleur score
jq '.carriers | max_by(.score)' invite-report-*.json

# Lister les erreurs
jq '.carriers[] | select(.errors | length > 0)' invite-report-*.json
```

### Nettoyer les Données Test

```javascript
// MongoDB
db.carriers.deleteMany({
  email: { $regex: /^(demo|test).*@example\.com$/ }
})

db.carrier_documents.deleteMany({
  carrierId: { $in: [/* IDs carriers supprimés */] }
})
```

```bash
# S3
aws s3 rm s3://rt-carrier-documents/carriers/ --recursive --dryrun
# Enlever --dryrun pour vraiment supprimer
```

## Documentation Complète

| Document | Description |
|----------|-------------|
| [README-invite-test-carriers.md](./README-invite-test-carriers.md) | Guide complet |
| [EXEMPLE-RAPPORT.md](./EXEMPLE-RAPPORT.md) | Exemples de rapports |
| [INDEX-SCRIPTS.md](./INDEX-SCRIPTS.md) | Tous les scripts |
| [../JOUR_12_SCRIPT_INVITATION.md](../JOUR_12_SCRIPT_INVITATION.md) | Résumé Jour 12 |

## Flux de Travail Recommandé

```
1. DEMO
   ├─ node scripts/demo-invite-carriers.cjs
   └─ Voir comment ça fonctionne

2. TEST CONFIGURATION
   ├─ node scripts/test-invite-script.cjs
   └─ Vérifier que tout est OK

3. CRÉATION
   ├─ node scripts/invite-test-carriers.cjs
   └─ Créer les carriers

4. VÉRIFICATION
   ├─ Consulter le rapport JSON
   ├─ Vérifier MongoDB
   └─ Vérifier S3

5. ANALYSE (optionnel)
   ├─ jq queries sur le rapport
   └─ Tests d'intégration

6. NETTOYAGE (optionnel)
   └─ Supprimer les données test
```

## Tips & Tricks

### Exécution Rapide

```bash
# Créer un alias
alias invite-carriers='node scripts/invite-test-carriers.cjs'

# Utiliser
invite-carriers
```

### Mode Batch (Futur)

```bash
# Actuellement non supporté, prochainement:
node scripts/invite-test-carriers.cjs --batch --count 5 --prefix demo
```

### Logging

```bash
# Sauvegarder les logs
node scripts/invite-test-carriers.cjs 2>&1 | tee invite-carriers.log
```

### CI/CD Integration

```bash
# Dans votre pipeline
npm run test:invite-carriers || exit 1
```

## Variables d'Environnement

Créer un fichier `.env` :

```env
MONGODB_URI=mongodb://localhost:27017/rt-authz
API_URL=http://localhost:3001
AWS_REGION=eu-central-1
S3_DOCUMENTS_BUCKET=rt-carrier-documents
```

## FAQ

### Combien de temps ça prend ?

- 1 carrier : ~30 secondes
- 3 carriers : ~1-2 minutes
- 5 carriers : ~2-3 minutes

### Puis-je créer plus de 5 carriers ?

Non, actuellement limité à 5 pour éviter la surcharge.
Pour plus, exécutez le script plusieurs fois.

### Les emails sont-ils envoyés ?

Non, le script crée les carriers mais n'envoie pas les emails.
Pour envoyer les emails, utilisez l'endpoint API manuellement.

### Les PDFs sont-ils réalistes ?

Les PDFs sont minimaux mais valides. Ils contiennent :
- Type de document
- Nom entreprise
- Date d'expiration
- Texte de test

### Puis-je personnaliser les données ?

Oui, modifiez les constantes dans `invite-test-carriers.cjs` :
- `COMPANY_NAMES` : Noms d'entreprises
- `DOCUMENT_TYPES` : Types de documents
- `AFFRET_IA_MIN_SCORE` : Score minimum

### Comment débugger ?

1. Vérifier les logs console (colorés)
2. Consulter le rapport JSON (section errors)
3. Vérifier les logs de l'API
4. Consulter MongoDB directement

## Support

Problème ? Consultez dans l'ordre :

1. [README-invite-test-carriers.md](./README-invite-test-carriers.md) - Guide complet
2. [EXEMPLE-RAPPORT.md](./EXEMPLE-RAPPORT.md) - Exemples et troubleshooting
3. Logs du script (console)
4. Rapport JSON généré
5. Logs de l'API

## Exemples Réels

### Exemple 1 : Test Rapide

```bash
$ node scripts/invite-test-carriers.cjs
Nombre de carriers à créer (1-5): 1
Prefix email: quicktest
# → quicktest1@example.com créé en 30s
```

### Exemple 2 : Démo Client

```bash
$ node scripts/invite-test-carriers.cjs
Nombre de carriers à créer (1-5): 3
Prefix email: demo
# → demo1, demo2, demo3 créés avec scores élevés
```

### Exemple 3 : Tests Complets

```bash
$ node scripts/invite-test-carriers.cjs
Nombre de carriers à créer (1-5): 5
Prefix email: integration
# → 5 carriers pour tests d'intégration complets
```

## Prochaines Étapes

Après avoir créé vos carriers test :

1. **Tester l'API**
   ```bash
   curl http://localhost:3001/api/carriers
   ```

2. **Tester les Webhooks**
   ```bash
   node scripts/test-webhooks.cjs
   ```

3. **Tester les Emails**
   ```bash
   node scripts/test-all-emails.js
   ```

4. **Tests Système Complet**
   ```bash
   node scripts/test-systeme-complet.js
   ```

---

**Quick Start créé le**: 2024-02-01
**Pour**: SYMPHONI.A Jour 12
**Version**: 1.0.0
