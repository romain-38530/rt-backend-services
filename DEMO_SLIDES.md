# SYMPHONI.A - Slides Présentation

---

## SLIDE 1 : Titre

# SYMPHONI.A
### La plateforme logistique intelligente

*Visibilité - Automatisation - Collaboration*

---

## SLIDE 2 : Le problème

### Les défis logistiques d'aujourd'hui

- **Manque de visibilité** sur les expéditions en cours
- **Litiges fréquents** et difficiles à résoudre
- **Communication fragmentée** (emails, téléphone, fax)
- **Processus manuels** chronophages
- **Données dispersées** dans plusieurs systèmes

> *"Où est mon camion ?" - La question posée 50x/jour*

---

## SLIDE 3 : La solution

### SYMPHONI.A - Tout-en-un

```
┌─────────────────────────────────────────────────────┐
│                    SYMPHONI.A                        │
├─────────────┬─────────────┬─────────────────────────┤
│  VISIBILITÉ │ AUTOMATION  │     COLLABORATION       │
├─────────────┼─────────────┼─────────────────────────┤
│ - Tracking  │ - IA        │ - Portail Fournisseur   │
│ - ETA       │ - eCMR      │ - Portail Destinataire  │
│ - Alertes   │ - Facturation│ - Chat intégré         │
│ - KPIs      │ - Litiges   │ - Notifications         │
└─────────────┴─────────────┴─────────────────────────┘
```

---

## SLIDE 4 : Architecture

### 31 Microservices interconnectés

```
        ┌──────────────────┐
        │   INDUSTRIEL     │
        └────────┬─────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
    ▼            ▼            ▼
┌───────┐  ┌──────────┐  ┌──────────┐
│ORDERS │  │ TRACKING │  │ BILLING  │
└───────┘  └──────────┘  └──────────┘
    │            │            │
    └────────────┼────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
  ┌───────────┐    ┌─────────────┐
  │FOURNISSEUR│    │DESTINATAIRE │
  └───────────┘    └─────────────┘
```

---

## SLIDE 5 : AFFRET.IA

### L'intelligence artificielle au service de votre logistique

| Fonctionnalité | Bénéfice |
|----------------|----------|
| **Scoring transporteurs** | Choix optimal automatique |
| **Prédiction ETA** | Anticipation des retards |
| **Détection anomalies** | Alertes proactives |
| **Optimisation planning** | -15% coûts transport |
| **Recommandations** | Amélioration continue |

---

## SLIDE 6 : Espace Fournisseur

### Portail dédié aux expéditeurs

**Fonctionnalités clés :**
- Onboarding en 3 clics
- Gestion des RDV chargement
- Signature électronique
- Chat avec transporteur
- Documents dématérialisés

**Résultat :**
> Temps de chargement réduit de 40%

---

## SLIDE 7 : Espace Destinataire

### Portail dédié aux réceptionnaires

**Fonctionnalités clés :**
- ETA temps réel
- Planification des quais
- Signature QR Code
- Déclaration d'incidents
- Gestion des litiges

**Résultat :**
> Litiges résolus 3x plus vite

---

## SLIDE 8 : Tracking temps réel

### Visibilité de bout en bout

```
ENLÈVEMENT ──► TRANSPORT ──► LIVRAISON
    │              │             │
    ▼              ▼             ▼
 ✓ Signé      📍 GPS Live    ✓ Réceptionné
 📸 Photos    🌡️ Température  📸 Photos
 📄 eCMR      ⏱️ ETA          📄 eCMR final
```

- Position GPS toutes les 30 secondes
- ETA recalculée toutes les 5 minutes
- Alertes automatiques en cas de retard

---

## SLIDE 9 : eCMR électronique

### Lettre de voiture 100% dématérialisée

**Avantages :**
- Zéro papier
- Signature multi-parties
- Horodatage certifié
- Archivage légal 10 ans
- Intégration comptable

**Conformité :**
- Protocole eCMR ONU
- RGPD compliant
- Valeur probante

---

## SLIDE 10 : KPIs et Analytics

### Tableau de bord décisionnel

| Indicateur | Objectif | Réel |
|------------|----------|------|
| Ponctualité | > 95% | 94.2% |
| Litiges | < 2% | 1.8% |
| Temps réception | < 15 min | 12 min |
| NPS Transporteurs | > 4.5 | 4.6 |

+ Rapports automatiques hebdomadaires
+ Export Excel/PDF
+ API pour BI externe

---

## SLIDE 11 : Intégrations

### Connecté à votre écosystème

```
┌─────────┐  ┌─────────┐  ┌─────────┐
│   ERP   │  │   TMS   │  │   WMS   │
│  (SAP)  │  │(Transics)│ │(Reflex) │
└────┬────┘  └────┬────┘  └────┬────┘
     │            │            │
     └────────────┼────────────┘
                  │
                  ▼
          ┌──────────────┐
          │  SYMPHONI.A  │
          │     API      │
          └──────────────┘
```

- API REST complète
- Webhooks temps réel
- Connecteurs natifs SAP, Oracle, etc.

---

## SLIDE 12 : Sécurité

### Vos données protégées

- **Hébergement** : AWS Frankfurt (EU)
- **Chiffrement** : AES-256 + TLS 1.3
- **Authentification** : OAuth 2.0 + MFA
- **Conformité** : RGPD, ISO 27001
- **SLA** : 99.9% disponibilité
- **Backup** : Toutes les 6 heures

---

## SLIDE 13 : ROI

### Retour sur investissement prouvé

| Poste | Économie |
|-------|----------|
| Réduction litiges | -60% |
| Temps administratif | -40% |
| Coûts transport | -15% |
| Délai facturation | -12 jours |

**ROI moyen : 15-25%**
*Retour positif dès le 3ème mois*

---

## SLIDE 14 : Tarification

### Modèle simple et transparent

| Offre | Prix | Inclus |
|-------|------|--------|
| **Fournisseur Free** | 0€ | Portail basique |
| **Fournisseur Premium** | 499€/mois | Toutes fonctionnalités |
| **Destinataire Free** | 0€ | Portail basique |
| **Destinataire Premium** | 499€/mois | Toutes fonctionnalités |
| **Industriel** | Sur devis | À partir de 0.50€/expédition |

*Pas d'engagement - Facturation à l'usage*

---

## SLIDE 15 : Déploiement

### Opérationnel en 4-6 semaines

```
Semaine 1-2     Semaine 3-4     Semaine 5-6
    │               │               │
    ▼               ▼               ▼
┌────────┐    ┌──────────┐    ┌─────────┐
│ SETUP  │───►│FORMATION │───►│  LIVE   │
│Technique│    │ Équipes  │    │Production│
└────────┘    └──────────┘    └─────────┘
```

- Configuration personnalisée
- Import données existantes
- Formation utilisateurs
- Support dédié 3 mois

---

## SLIDE 16 : Références

### Ils nous font confiance

- **Agroalimentaire** : 5 industriels
- **Distribution** : 3 enseignes
- **Industrie** : 8 sites
- **Transport** : 150+ transporteurs

> *"SYMPHONI.A a transformé notre supply chain"*
> — Directeur Logistique, Client Grand Compte

---

## SLIDE 17 : Prochaines étapes

### Comment démarrer ?

1. **POC gratuit 30 jours**
   - Périmètre limité
   - Sans engagement

2. **Workshop technique**
   - Avec votre équipe IT
   - Étude des intégrations

3. **Business case**
   - ROI personnalisé
   - Avec vos données

---

## SLIDE 18 : Contact

# Merci !

### Questions ?

**Commercial** : commercial@symphonia.io
**Technique** : tech@symphonia.io
**Site web** : www.symphonia.io

---

*SYMPHONI.A - La logistique intelligente*
