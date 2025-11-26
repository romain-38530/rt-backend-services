# SYMPHONI.A Orders API v2.0

API complète de gestion des commandes de transport avec fonctionnalités avancées d'import/export, templates récurrents et détection de doublons.

## Nouvelles fonctionnalités v2.0

- ✅ **Import batch CSV/XML** - Importez des centaines de commandes en une fois
- ✅ **Templates de commandes** - Créez des templates pour vos commandes récurrentes
- ✅ **Planification automatique** - Créez automatiquement des commandes quotidiennes/hebdomadaires/mensuelles
- ✅ **Export CSV** - Exportez vos commandes pour analyse
- ✅ **Détection de doublons** - Évitez les commandes en double
- ✅ **WebSocket integration** - Événements temps réel pour chaque action

## Installation

```bash
cd /c/Users/rtard/rt-backend-services/services/orders-api-v2
npm install
```

## Configuration

```env
PORT=3011
MONGODB_URI=mongodb+srv://...
WEBSOCKET_URL=https://websocket.symphonia.com
JWT_SECRET=your-secret
```

## Endpoints

### CRUD Commandes

#### POST /api/v1/orders
Créer une nouvelle commande.

```json
{
  "organizationId": "org-123",
  "createdBy": "user-456",
  "pickup": {
    "name": "Société Expéditeur",
    "street": "10 Rue de la Paix",
    "city": "Paris",
    "postalCode": "75001"
  },
  "delivery": {
    "name": "Société Destinataire",
    "street": "25 Avenue des Champs",
    "city": "Lyon",
    "postalCode": "69001"
  },
  "pickupDate": "2024-11-25",
  "deliveryDate": "2024-11-26",
  "cargo": {
    "type": "palette",
    "quantity": 10,
    "weight": { "value": 500, "unit": "kg" }
  }
}
```

#### GET /api/v1/orders
Lister les commandes avec filtres.

Query params:
- `organizationId` - Filtrer par organisation
- `status` - Filtrer par statut
- `startDate` - Date de début
- `endDate` - Date de fin
- `page` - Numéro de page (défaut: 1)
- `limit` - Résultats par page (défaut: 50)

#### GET /api/v1/orders/:id
Obtenir une commande par ID.

#### PUT /api/v1/orders/:id
Mettre à jour une commande.

#### DELETE /api/v1/orders/:id
Supprimer une commande.

### Import Batch

#### POST /api/v1/orders/import/csv
Importer des commandes depuis un fichier CSV.

```bash
curl -X POST https://orders.symphonia.com/api/v1/orders/import/csv \
  -F "file=@commandes.csv" \
  -F "organizationId=org-123" \
  -F "createdBy=user-456"
```

Réponse:
```json
{
  "success": true,
  "summary": {
    "total": 100,
    "imported": 95,
    "failed": 5
  },
  "results": {
    "success": [...],
    "errors": [...]
  }
}
```

#### POST /api/v1/orders/import/xml
Importer des commandes depuis un fichier XML.

#### GET /api/v1/orders/import/template/csv
Télécharger un template CSV d'import.

#### GET /api/v1/orders/import/template/xml
Télécharger un template XML d'import.

### Templates

#### POST /api/v1/orders/templates
Créer un template de commande.

```json
{
  "name": "Livraison Paris-Lyon hebdomadaire",
  "organizationId": "org-123",
  "createdBy": "user-456",
  "templateData": {
    "pickup": {...},
    "delivery": {...},
    "cargo": {...}
  },
  "recurrence": {
    "frequency": "weekly",
    "dayOfWeek": 1,
    "time": "08:00",
    "advanceDays": 2
  }
}
```

#### GET /api/v1/orders/templates
Lister les templates.

Query params:
- `organizationId` - Filtrer par organisation
- `isActive` - Filtrer par statut actif

#### POST /api/v1/orders/templates/:id/create-order
Créer une commande à partir d'un template.

### Export

#### GET /api/v1/orders/export/csv
Exporter les commandes en CSV.

Query params:
- `organizationId` - Filtrer par organisation
- `status` - Filtrer par statut
- `startDate` - Date de début
- `endDate` - Date de fin

### Détection de doublons

#### GET /api/v1/orders/:id/duplicates
Vérifier si une commande a des doublons potentiels.

Critères de détection:
- Même organisation
- Même code postal départ/arrivée
- Date d'enlèvement à ±1 jour
- Même type de marchandise

## Format CSV d'import

Le fichier CSV doit contenir les colonnes suivantes (séparateur `;`):

```csv
reference;pickup_name;pickup_street;pickup_city;pickup_postal;delivery_name;delivery_street;delivery_city;delivery_postal;pickup_date;delivery_date;cargo_type;quantity;weight;description
CMD001;Société A;10 Rue...;Paris;75001;Société B;25 Ave...;Lyon;69001;25/11/2024;26/11/2024;palette;10;500;Marchandises
```

[Télécharger le template CSV](http://localhost:3011/api/v1/orders/import/template/csv)

## Format XML d'import

```xml
<?xml version="1.0" encoding="UTF-8"?>
<orders>
  <order>
    <reference>CMD001</reference>
    <pickup>
      <name>Société Expéditeur</name>
      <street>10 Rue de la Paix</street>
      <city>Paris</city>
      <postalCode>75001</postalCode>
    </pickup>
    <delivery>
      <name>Société Destinataire</name>
      <street>25 Avenue des Champs</street>
      <city>Lyon</city>
      <postalCode>69001</postalCode>
    </delivery>
    <pickupDate>2024-11-25</pickupDate>
    <deliveryDate>2024-11-26</deliveryDate>
    <cargo>
      <type>palette</type>
      <quantity>10</quantity>
      <weight>500</weight>
    </cargo>
  </order>
</orders>
```

[Télécharger le template XML](http://localhost:3011/api/v1/orders/import/template/xml)

## Commandes récurrentes

Les templates peuvent créer automatiquement des commandes selon une planification:

### Fréquences disponibles

- **daily** - Tous les jours
- **weekly** - Toutes les semaines (spécifier `dayOfWeek`: 0-6)
- **monthly** - Tous les mois (spécifier `dayOfMonth`: 1-31)
- **manual** - Création manuelle uniquement

### Exemple: Livraison hebdomadaire

```json
{
  "name": "Livraison hebdo lundi",
  "recurrence": {
    "frequency": "weekly",
    "dayOfWeek": 1,
    "time": "08:00",
    "advanceDays": 2
  }
}
```

Cela créera automatiquement une commande tous les lundis à 8h, avec une date d'enlèvement prévue 2 jours plus tard (mercredi).

## Cron Jobs

Le service exécute automatiquement:

- **Tous les jours à minuit** - Création des commandes récurrentes planifiées

## Événements WebSocket émis

- `order.created` - Nouvelle commande créée
- `order.updated` - Commande mise à jour
- `order.deleted` - Commande supprimée

## Déploiement AWS Elastic Beanstalk

```bash
zip -r deploy.zip . -x "*.git*" "node_modules/*" "uploads/*"
eb deploy
```

## Limites

- Import CSV/XML: 1000 lignes max par fichier
- Export CSV: 10 000 commandes max
- Taille fichier upload: 10 MB max

## Support

Contact: tech@symphonia.com
