# Plan Module Gestion Véhicules

## Architecture Cible

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SOURCES DE DONNÉES                              │
├─────────────────────┬─────────────────────┬─────────────────────────────────┤
│     DASHDOC API     │    VEHIZEN API      │        UPLOADS MANUELS          │
│  - Véhicules        │  - Kilométrage réel │  - Cartes grises (OCR)          │
│  - Remorques        │  - Positions GPS    │  - Attestations assurance       │
│  - Chauffeurs       │  - Alertes          │  - Factures fournisseurs (OCR)  │
└─────────┬───────────┴─────────┬───────────┴─────────────────┬───────────────┘
          │                     │                             │
          ▼                     ▼                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VEHICLES DATA LAKE (MongoDB)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  Collections:                                                                │
│  - vehicles              Véhicules avec données fusionnées                  │
│  - vehicle_documents     Cartes grises, assurances, CT                      │
│  - vehicle_maintenance   Entretiens planifiés et réalisés                   │
│  - vehicle_breakdowns    Pannes et réparations                              │
│  - vehicle_mileage       Historique kilométrage                             │
│  - vehicle_inspections   Contrôles techniques, mines                        │
│  - vehicle_tachograph    Données chronotachygraphe                          │
│  - vehicle_invoices      Factures fournisseurs (avec OCR)                   │
│  - vehicle_alerts        Alertes (CT, assurance, entretien)                 │
└─────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API ENDPOINTS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  /api/v1/vehicles                    Liste, recherche, détails             │
│  /api/v1/vehicles/:id/documents      Gestion documents                      │
│  /api/v1/vehicles/:id/maintenance    Entretiens                             │
│  /api/v1/vehicles/:id/breakdowns     Pannes                                 │
│  /api/v1/vehicles/:id/mileage        Kilométrage                            │
│  /api/v1/vehicles/:id/inspections    CT, mines, limiteur vitesse            │
│  /api/v1/vehicles/:id/tachograph     Chronotachygraphe                      │
│  /api/v1/vehicles/invoices           Factures fournisseurs + OCR            │
│  /api/v1/vehicles/alerts             Alertes à traiter                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Collections MongoDB

### 1. vehicles (Véhicule principal)
```javascript
{
  // Identifiants
  licensePlate: String,           // Immatriculation (clé unique)
  vin: String,                    // Numéro de série

  // Sources de données
  dashdocPk: Number,              // ID Dashdoc
  vehizenId: String,              // ID Vehizen

  // Infos véhicule
  brand: String,                  // Marque
  model: String,                  // Modèle
  type: String,                   // truck, van, trailer
  year: Number,                   // Année
  firstRegistrationDate: Date,    // Date 1ère immatriculation

  // Technique
  fuelType: String,               // diesel, electric, etc
  tankCapacity: Number,           // Capacité réservoir (L)
  ptac: Number,                   // PTAC (kg)
  ptra: Number,                   // PTRA (kg)
  payload: Number,                // Charge utile (kg)
  euroNorm: String,               // Euro 5, Euro 6, etc
  emissionClass: String,          // Classe émission

  // Kilométrage
  currentMileage: Number,         // Km actuel
  lastMileageUpdate: Date,        // Date dernière MAJ
  mileageSource: String,          // vehizen, manual, dashdoc
  averageMonthlyMileage: Number,  // Moyenne mensuelle

  // Statut
  status: String,                 // active, maintenance, breakdown, sold
  assignedDriver: String,         // Chauffeur assigné

  // Alertes actives
  alerts: [{
    type: String,
    message: String,
    dueDate: Date,
    severity: String
  }],

  // Coûts cumulés
  costs: {
    totalMaintenance: Number,
    totalBreakdowns: Number,
    totalFuel: Number,
    totalToll: Number,
    lastYearTotal: Number
  },

  // Métadonnées
  organizationId: String,
  syncedAt: Date,
  _rawDashdoc: Object,
  _rawVehizen: Object
}
```

### 2. vehicle_documents (Documents véhicule)
```javascript
{
  vehicleId: ObjectId,
  licensePlate: String,

  documentType: String,           // carte_grise, assurance, ct, mines, other
  documentName: String,

  // Fichier
  fileUrl: String,                // URL S3
  fileName: String,
  fileSize: Number,
  mimeType: String,

  // Dates
  issueDate: Date,                // Date émission
  expiryDate: Date,               // Date expiration

  // Données extraites (OCR)
  ocrData: {
    extracted: Boolean,
    confidence: Number,
    fields: Object                // Champs extraits
  },

  // Métadonnées
  uploadedBy: String,
  uploadedAt: Date,
  organizationId: String
}
```

### 3. vehicle_maintenance (Entretiens)
```javascript
{
  vehicleId: ObjectId,
  licensePlate: String,

  // Type d'entretien
  maintenanceType: String,        // vidange, freins, pneus, revision, etc
  description: String,

  // Planification
  status: String,                 // scheduled, in_progress, completed, cancelled
  scheduledDate: Date,
  scheduledMileage: Number,

  // Réalisation
  completedDate: Date,
  completedMileage: Number,

  // Coûts
  laborCost: Number,              // Coût main d'oeuvre
  partsCost: Number,              // Coût pièces
  totalCost: Number,

  // Temps
  estimatedHours: Number,
  actualHours: Number,

  // Fournisseur/Garage
  supplierId: String,
  supplierName: String,
  invoiceId: ObjectId,            // Lien vers facture

  // Récurrence
  isRecurring: Boolean,
  recurringInterval: {
    type: String,                 // months, km
    value: Number
  },
  nextDueDate: Date,
  nextDueMileage: Number,

  // Notes et pièces jointes
  notes: String,
  attachments: [String],          // URLs S3

  organizationId: String,
  createdAt: Date,
  updatedAt: Date
}
```

### 4. vehicle_breakdowns (Pannes)
```javascript
{
  vehicleId: ObjectId,
  licensePlate: String,

  // Détails panne
  breakdownType: String,          // moteur, transmission, electricite, etc
  description: String,
  severity: String,               // minor, major, critical

  // Localisation
  location: {
    address: String,
    city: String,
    coordinates: [Number]
  },

  // Dates
  reportedAt: Date,
  repairedAt: Date,

  // Statut
  status: String,                 // reported, diagnosed, repairing, repaired, closed

  // Diagnostic
  diagnosis: String,
  rootCause: String,

  // Réparation
  repairDescription: String,
  partsReplaced: [{
    partName: String,
    partNumber: String,
    quantity: Number,
    unitCost: Number
  }],

  // Coûts
  laborCost: Number,
  partsCost: Number,
  towingCost: Number,
  otherCosts: Number,
  totalCost: Number,

  // Temps
  downtime: Number,               // Heures d'immobilisation
  repairHours: Number,

  // Fournisseur
  supplierId: String,
  supplierName: String,
  invoiceId: ObjectId,

  // Impact
  tripsCancelled: Number,
  revenueImpact: Number,

  organizationId: String,
  createdAt: Date,
  updatedAt: Date
}
```

### 5. vehicle_invoices (Factures fournisseurs)
```javascript
{
  // Identifiants
  invoiceNumber: String,

  // Fichier
  fileUrl: String,
  fileName: String,

  // OCR
  ocrProcessed: Boolean,
  ocrConfidence: Number,
  ocrExtractedData: {
    invoiceNumber: String,
    invoiceDate: Date,
    supplierName: String,
    supplierSiret: String,
    licensePlate: String,         // IMPORTANT: Immatriculation extraite
    totalHT: Number,
    totalTTC: Number,
    tva: Number,
    lineItems: [{
      description: String,
      quantity: Number,
      unitPrice: Number,
      total: Number
    }]
  },

  // Données validées
  validatedData: {
    vehicleId: ObjectId,
    licensePlate: String,
    supplierId: String,
    supplierName: String,
    invoiceDate: Date,
    totalHT: Number,
    totalTTC: Number
  },

  // Type
  invoiceType: String,            // maintenance, breakdown, parts, other
  linkedMaintenanceId: ObjectId,
  linkedBreakdownId: ObjectId,

  // Statut
  status: String,                 // pending, validated, rejected, paid
  validatedBy: String,
  validatedAt: Date,

  organizationId: String,
  uploadedAt: Date,
  uploadedBy: String
}
```

### 6. vehicle_inspections (Contrôles techniques)
```javascript
{
  vehicleId: ObjectId,
  licensePlate: String,

  inspectionType: String,         // ct, mines, speed_limiter, tachograph_calibration

  // Dates
  inspectionDate: Date,
  expiryDate: Date,
  nextDueDate: Date,

  // Résultat
  result: String,                 // pass, fail, pending
  observations: [String],
  defects: [{
    code: String,
    description: String,
    severity: String
  }],

  // Centre
  centerName: String,
  centerAddress: String,

  // Document
  certificateUrl: String,
  certificateNumber: String,

  // Coût
  cost: Number,

  organizationId: String,
  createdAt: Date
}
```

### 7. vehicle_tachograph (Chronotachygraphe)
```javascript
{
  vehicleId: ObjectId,
  licensePlate: String,

  // Appareil
  tachographType: String,         // analog, digital
  tachographBrand: String,
  tachographModel: String,
  serialNumber: String,

  // Calibration
  lastCalibrationDate: Date,
  nextCalibrationDate: Date,
  calibrationCenter: String,
  calibrationCertificateUrl: String,

  // Downloads (relevés)
  downloads: [{
    downloadDate: Date,
    periodFrom: Date,
    periodTo: Date,
    fileUrl: String,
    processedData: {
      totalDrivingTime: Number,
      totalRestTime: Number,
      violations: [{
        type: String,
        date: Date,
        description: String
      }]
    }
  }],

  organizationId: String
}
```

## Fichiers à créer

```
services/tms-sync-eb/
├── connectors/
│   └── vehizen.connector.js              # API Vehizen
│
├── models/vehicles-datalake/
│   ├── index.js
│   ├── Vehicle.model.js
│   ├── VehicleDocument.model.js
│   ├── VehicleMaintenance.model.js
│   ├── VehicleBreakdown.model.js
│   ├── VehicleInvoice.model.js
│   ├── VehicleInspection.model.js
│   ├── VehicleTachograph.model.js
│   ├── VehicleMileage.model.js
│   └── VehicleAlert.model.js
│
├── services/vehicles-datalake/
│   ├── index.js
│   ├── vehicles-sync.service.js          # Sync Dashdoc + Vehizen
│   ├── vehicles-documents.service.js     # Upload + OCR documents
│   ├── vehicles-maintenance.service.js   # Gestion entretiens
│   ├── vehicles-breakdowns.service.js    # Gestion pannes
│   ├── vehicles-invoices.service.js      # Factures + OCR
│   ├── vehicles-alerts.service.js        # Alertes automatiques
│   └── ocr/
│       ├── ocr.service.js                # Service OCR principal
│       ├── carte-grise.parser.js         # Parser carte grise
│       ├── assurance.parser.js           # Parser assurance
│       └── invoice.parser.js             # Parser factures
│
├── routes/
│   └── vehicles.routes.js                # Routes API véhicules
│
└── scripts/
    └── setup-vehicles-module.js          # Script d'initialisation
```

## Intégration OCR

Pour l'extraction des données des documents, on utilisera:
- **AWS Textract** pour l'OCR avancé des factures
- **Regex patterns** pour extraire les immatriculations
- **Validation** par correspondance avec les véhicules en base

### Pattern Immatriculation
```javascript
// Formats français
const PLATE_PATTERNS = [
  /[A-Z]{2}[-\s]?\d{3}[-\s]?[A-Z]{2}/gi,  // AA-123-BB (nouveau)
  /\d{3,4}[-\s]?[A-Z]{2,3}[-\s]?\d{2}/gi, // 1234 AB 75 (ancien)
];
```

## Alertes automatiques

Le système génèrera des alertes pour:
- CT/Mines expirés ou à venir (30j, 15j, 7j)
- Assurance expirée ou à venir
- Entretien prévu (par date ou km)
- Calibration tachygraphe à venir
- Limiteur de vitesse à vérifier

## Prochaines étapes

1. Créer les modèles MongoDB
2. Créer le connecteur Vehizen
3. Créer le service de sync véhicules
4. Créer le module documents avec OCR
5. Créer le module entretiens/pannes
6. Créer les routes API
7. Intégrer et déployer
