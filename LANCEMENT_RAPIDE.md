# 🚀 Lancement Rapide - Configuration Services Externes

**Temps total: 30 minutes**

---

## Étape 1: Lancer le Configurateur (1 minute)

```bash
cd rt-backend-services
node scripts/setup-external-services-interactive.js
```

---

## Étape 2: Suivre les Instructions (25 minutes)

Le script vous guidera automatiquement pour:

### TomTom (~10 min)
1. Créer compte sur https://developer.tomtom.com/
2. Créer une application
3. Copier l'API Key
4. ✅ Validation automatique

### AWS Textract (~10 min)
1. **Option A (Recommandé):** Automatique
   - Le script exécute `create-aws-textract-user.sh`
   - Copier les credentials affichés

2. **Option B:** Manuel
   - Suivre le guide dans la console AWS

3. ✅ Validation automatique

### Google Vision (~10 min - Optionnel)
1. Créer projet Google Cloud
2. Activer Vision API
3. Créer Service Account
4. Télécharger fichier JSON
5. ✅ Validation automatique

---

## Étape 3: Tests (2 minutes)

Le script lance automatiquement les tests.

**Résultat attendu:**
```
🎉 TOUS LES TESTS SONT PASSÉS !
✅ TomTom Telematics API est opérationnel
✅ AWS Textract OCR est opérationnel
✅ Google Vision API est opérationnel
```

---

## Étape 4: Déploiement (2 minutes)

```bash
# Copier les variables vers EB
eb setenv $(cat .env.external | xargs)

# Déployer
eb deploy
```

---

## ✅ C'est Tout !

**Services configurés:**
- ✅ TomTom (Tracking GPS)
- ✅ AWS Textract (OCR)
- ✅ Google Vision (OCR Fallback)

**Coût mensuel estimé: 47-67€**

---

## Prochaines Étapes

### Automatiser le Monitoring

**Linux/Mac:**
```bash
crontab -e

# Ajouter:
0 8 * * * cd /chemin/vers/rt-backend-services && node scripts/monitor-quotas.js
0 18 * * * cd /chemin/vers/rt-backend-services && node scripts/budget-alerts.js
```

**Windows:** Utiliser le Planificateur de tâches

---

## Documentation Complète

- **Guide Complet:** [CONFIGURATION_EXTERNE_AUTOMATISEE.md](CONFIGURATION_EXTERNE_AUTOMATISEE.md)
- **Rapport Final:** [RAPPORT_CONFIGURATION_AUTOMATISEE_FINALE.md](RAPPORT_CONFIGURATION_AUTOMATISEE_FINALE.md)
- **Guide TomTom:** [guides/TOMTOM_SETUP_GUIDE.md](guides/TOMTOM_SETUP_GUIDE.md)
- **Guide AWS:** [guides/AWS_TEXTRACT_SETUP_GUIDE.md](guides/AWS_TEXTRACT_SETUP_GUIDE.md)
- **Guide Google:** [guides/GOOGLE_VISION_SETUP_GUIDE.md](guides/GOOGLE_VISION_SETUP_GUIDE.md)

---

## Besoin d'Aide ?

**Email:** support@rt-symphonia.com

**Documentation:** Consultez les fichiers ci-dessus

---

**🎉 Bonne configuration !**

*RT SYMPHONI.A Team - 2025*
