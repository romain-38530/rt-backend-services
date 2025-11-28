# Règles Git - RT Technologie

## Configuration Utilisateur

**Nom d'utilisateur** : `julienSpitaleri`
**Email** : `julien.spitaleri@gmail.com`

Les commits doivent toujours être faits avec ces informations.

## Workflow des Branches

### Branche `main`
- **Protégée** : Ne jamais commiter directement sur `main`
- **Stable** : Contient uniquement le code validé et testé
- **Production** : Cette branche est déployée automatiquement sur AWS Elastic Beanstalk

### Branche `julien`
- **Branche de développement** : Tous les commits de travail vont ici
- **Tests et corrections** : Utilisée pour tester les modifications
- **Pull Request** : Une fois validé, créer une PR vers `main`

## Règles pour Claude Code

Lorsque Claude Code effectue des modifications :

1. ✅ **Toujours travailler sur la branche `julien`**
   ```bash
   git checkout julien
   ```

2. ✅ **Utiliser l'identité Git correcte**
   ```bash
   git config user.name "julienSpitaleri"
   git config user.email "julien.spitaleri@gmail.com"
   ```

3. ✅ **Créer des commits clairs et descriptifs**
   - Format : `type: description courte`
   - Types : `fix`, `feat`, `docs`, `refactor`, `test`, `chore`

4. ❌ **Ne JAMAIS commiter sur `main`**

5. ✅ **Pousser régulièrement sur `julien`**
   ```bash
   git push origin julien
   ```

## Processus de Merge

Une fois les modifications validées sur `julien` :

1. Créer une Pull Request sur GitHub
2. Réviser les changements
3. Merger vers `main` via l'interface GitHub
4. AWS Elastic Beanstalk déploiera automatiquement les changements

## Commandes Utiles

### Vérifier la branche actuelle
```bash
git branch
```

### Basculer vers julien
```bash
git checkout julien
```

### Voir les commits récents
```bash
git log --oneline -5
```

### Vérifier l'identité configurée
```bash
git config user.name
git config user.email
```

### Synchroniser avec main
```bash
git checkout julien
git pull origin main
```

## Structure des Repos

### rt-frontend-apps
- **main** : Production
- **julien** : Développement

### rt-backend-services
- **main** : Production
- **julien** : Développement

---

**Date de création** : 28 novembre 2025
**Auteur** : Claude Code
**Dernière mise à jour** : 28 novembre 2025
