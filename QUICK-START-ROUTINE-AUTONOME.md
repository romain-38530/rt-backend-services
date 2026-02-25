# ⚡ Quick Start - Routine Autonome AWS

**Mise en route rapide en 5 minutes**

---

## 🚀 Démarrage Ultra-Rapide

### Étape 1: Installation (2 min)

```bash
# Exécuter le script de setup
bash setup-autonomous-optimizer.sh
```

Le script va :
- ✅ Vérifier AWS CLI et jq
- ✅ Tester vos credentials AWS
- ✅ Faire un premier dry-run
- ✅ Proposer de configurer le cron

### Étape 2: Voir le Rapport (1 min)

```bash
# Afficher le dernier rapport
cat autonomous-optimizer-report-$(date +%Y%m%d).txt
```

Vous verrez :
- 💰 Économies potentielles détectées
- 📊 Liste des ressources à optimiser
- ⚡ Actions recommandées

### Étape 3: Tester en Auto (2 min)

```bash
# Exécuter les optimisations automatiquement
./autonomous-optimizer.sh --auto
```

Les optimisations sûres seront appliquées automatiquement !

---

## 📋 Les 3 Commandes Essentielles

```bash
# 1. Simulation (voir sans modifier)
./autonomous-optimizer.sh --dry-run

# 2. Rapport uniquement
./autonomous-optimizer.sh --report-only

# 3. Automatique (applique les optimisations)
./autonomous-optimizer.sh --auto
```

---

## 💰 Économies Attendues

| Ce que ça détecte | Économie Typique |
|-------------------|------------------|
| Elastic IPs non utilisées | 10-20€/mois |
| Instances arrêtées anciennes | 20-50€/mois |
| Volumes EBS détachés | 5-15€/mois |
| CloudFront non optimisé | 100-200€/mois |
| Load Balancers inutilisés | 20-40€/mois |
| Instances sous-utilisées | 50-100€/mois |

**TOTAL : 210-435€/mois en économies continues**

---

## ⏰ Configuration Cron (Optionnel)

Pour que ça tourne automatiquement chaque nuit à 2h :

```bash
# Éditer le cron
crontab -e

# Ajouter cette ligne
0 2 * * * /chemin/vers/autonomous-optimizer.sh --auto >> /var/log/aws-optimizer.log 2>&1
```

---

## 📊 Suivi des Économies

```bash
# Voir toutes les économies du mois
grep "ÉCONOMIE" autonomous-optimizer-report-*.txt

# Calculer le total
grep "ÉCONOMIE TOTALE" autonomous-optimizer-report-*.txt | \
  awk '{sum+=$4} END {print "Total économisé: " sum "€"}'
```

---

## 🔒 Sécurité

✅ **Backups automatiques** - Avant chaque modification
✅ **Mode dry-run** - Tester sans risque
✅ **Logs complets** - Traçabilité totale
✅ **Rollback possible** - Annuler si besoin

---

## 📚 Documentation Complète

Pour aller plus loin :
- [AUTONOMOUS-OPTIMIZER-GUIDE.md](./AUTONOMOUS-OPTIMIZER-GUIDE.md) - Guide complet (450+ lignes)
- [ROUTINE-AUTONOME-RAPPORT.md](./ROUTINE-AUTONOME-RAPPORT.md) - Rapport technique détaillé

---

## 🆘 Besoin d'Aide ?

### Erreur AWS CLI
```bash
aws --version
# Si erreur: installer AWS CLI v2
```

### Erreur jq
```bash
jq --version
# Si erreur: sudo apt-get install jq
```

### Erreur Credentials
```bash
aws sts get-caller-identity
# Si erreur: aws configure
```

---

## ✅ Checklist Rapide

- [ ] Exécuter `bash setup-autonomous-optimizer.sh`
- [ ] Vérifier le rapport généré
- [ ] Tester `./autonomous-optimizer.sh --dry-run`
- [ ] Si OK, lancer `./autonomous-optimizer.sh --auto`
- [ ] Configurer cron pour exécution quotidienne
- [ ] Valider économies dans AWS Cost Explorer (7 jours)

---

**C'est tout ! Votre optimiseur autonome est maintenant actif.** 🎉

Il détectera et optimisera automatiquement votre infrastructure AWS chaque jour, vous faisant économiser 210-435€/mois sans intervention manuelle.

---

**Créé le :** 23 février 2026
**Version :** 1.0
