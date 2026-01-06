/**
 * ICPE Routes - Gestion des Installations Classees pour la Protection de l'Environnement
 * SYMPHONI.A - RT Technologie
 *
 * Routes pour la gestion ICPE des entrepots logisticiens
 */

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Import des constantes ICPE
const {
  ICPEStatus,
  ICPERegime,
  ICPE_RUBRIQUES,
  LogisticianDocumentTypes,
  vigilanceDocumentsConfig
} = require('./logisticien-models');

// Middleware d'authentification
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requis' });
  }
  // TODO: Implement proper JWT verification
  // Pour l'instant on extrait les infos du token
  try {
    const token = authHeader.split(' ')[1];
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    req.user = {
      id: payload.sub || payload.id || payload._id,
      organizationId: payload.organizationId || payload.org,
      role: payload.role || 'user',
      organizationType: payload.organizationType || 'logistician'
    };
  } catch (e) {
    req.user = { organizationId: 'demo-org-id', role: 'user' };
  }
  next();
};

// ============================================
// ROUTES RUBRIQUES ICPE (Reference)
// ============================================

/**
 * GET /api/icpe/rubriques
 * Liste toutes les rubriques ICPE disponibles
 */
router.get('/rubriques', (req, res) => {
  try {
    const rubriques = Object.entries(ICPE_RUBRIQUES).map(([code, data]) => ({
      code,
      ...data
    }));

    res.json({
      success: true,
      rubriques,
      count: rubriques.length
    });
  } catch (error) {
    console.error('Error fetching ICPE rubriques:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation des rubriques' });
  }
});

/**
 * GET /api/icpe/rubriques/:code
 * Recupere une rubrique specifique avec ses seuils
 */
router.get('/rubriques/:code', (req, res) => {
  try {
    const rubrique = ICPE_RUBRIQUES[req.params.code];
    if (!rubrique) {
      return res.status(404).json({ error: 'Rubrique non trouvee' });
    }

    res.json({
      success: true,
      rubrique: {
        code: req.params.code,
        ...rubrique
      }
    });
  } catch (error) {
    console.error('Error fetching rubrique:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation de la rubrique' });
  }
});

/**
 * POST /api/icpe/rubriques/calculate-regime
 * Calcule le regime ICPE en fonction du volume declare
 */
router.post('/rubriques/calculate-regime', (req, res) => {
  try {
    const { rubriqueCode, volume } = req.body;

    if (!rubriqueCode || volume === undefined) {
      return res.status(400).json({ error: 'rubriqueCode et volume requis' });
    }

    const rubrique = ICPE_RUBRIQUES[rubriqueCode];
    if (!rubrique) {
      return res.status(404).json({ error: 'Rubrique non trouvee' });
    }

    let regime = null;
    let regimeLabel = null;

    const seuils = rubrique.seuils;

    if (seuils.declaration && volume >= seuils.declaration.min && (seuils.declaration.max === null || volume < seuils.declaration.max)) {
      regime = 'D';
      regimeLabel = 'Declaration';
    } else if (seuils.enregistrement && volume >= seuils.enregistrement.min && (seuils.enregistrement.max === null || volume < seuils.enregistrement.max)) {
      regime = 'E';
      regimeLabel = 'Enregistrement';
    } else if (seuils.autorisation && volume >= seuils.autorisation.min) {
      regime = 'A';
      regimeLabel = 'Autorisation';
    } else if (volume < (seuils.declaration?.min || 0)) {
      regime = 'NC';
      regimeLabel = 'Non Classe';
    }

    res.json({
      success: true,
      rubriqueCode,
      volume,
      unite: rubrique.unite,
      regime,
      regimeLabel,
      seveso: rubrique.seveso || false,
      seuils: rubrique.seuils
    });
  } catch (error) {
    console.error('Error calculating regime:', error);
    res.status(500).json({ error: 'Erreur lors du calcul du regime' });
  }
});

// ============================================
// ROUTES ENTREPOTS ICPE (Logisticien)
// ============================================

/**
 * GET /api/icpe/warehouses
 * Liste tous les entrepots du logisticien avec leurs donnees ICPE
 */
router.get('/warehouses', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const logisticianId = req.user.id || req.user.organizationId;

    const logistician = await db.collection('logisticians').findOne({
      $or: [
        { _id: new ObjectId(logisticianId) },
        { email: logisticianId }
      ]
    });

    if (!logistician) {
      // Retourner liste vide si logisticien non trouve
      return res.json({
        success: true,
        warehouses: [],
        count: 0
      });
    }

    const warehouses = logistician.warehouses || [];

    res.json({
      success: true,
      warehouses: warehouses.map(w => ({
        ...w,
        icpeAlerts: calculateICPEAlerts(w)
      })),
      count: warehouses.length
    });
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation des entrepots' });
  }
});

/**
 * GET /api/icpe/warehouses/:warehouseId
 * Recupere un entrepot specifique avec ses donnees ICPE detaillees
 */
router.get('/warehouses/:warehouseId', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const logisticianId = req.user.id || req.user.organizationId;

    const logistician = await db.collection('logisticians').findOne({
      $or: [
        { _id: new ObjectId(logisticianId) },
        { email: logisticianId }
      ],
      'warehouses.warehouseId': req.params.warehouseId
    });

    if (!logistician) {
      return res.status(404).json({ error: 'Entrepot non trouve' });
    }

    const warehouse = logistician.warehouses.find(w => w.warehouseId === req.params.warehouseId);

    res.json({
      success: true,
      warehouse: {
        ...warehouse,
        icpeAlerts: calculateICPEAlerts(warehouse)
      }
    });
  } catch (error) {
    console.error('Error fetching warehouse:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation de l\'entrepot' });
  }
});

/**
 * POST /api/icpe/warehouses
 * Cree un nouvel entrepot avec configuration ICPE
 */
router.post('/warehouses', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const logisticianId = req.user.id || req.user.organizationId;
    const {
      name,
      address,
      surface,
      dockCount,
      icpeStatus,
      icpeNumero,
      icpePrefecture,
      icpeDateDeclaration,
      icpeProchainControle,
      icpeRubriques
    } = req.body;

    if (!name || !address) {
      return res.status(400).json({ error: 'name et address requis' });
    }

    const warehouseId = `WH${Date.now()}`;

    const newWarehouse = {
      warehouseId,
      name,
      address,
      surface: surface || 0,
      dockCount: dockCount || 1,
      icpeStatus: icpeStatus || null,
      icpeNumero: icpeNumero || null,
      icpePrefecture: icpePrefecture || null,
      icpeDateDeclaration: icpeDateDeclaration ? new Date(icpeDateDeclaration) : null,
      icpeProchainControle: icpeProchainControle ? new Date(icpeProchainControle) : null,
      icpeRubriques: icpeRubriques || [],
      icpeVolumes: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Upsert logistician avec le nouvel entrepot
    const result = await db.collection('logisticians').findOneAndUpdate(
      {
        $or: [
          { _id: new ObjectId(logisticianId) },
          { email: logisticianId }
        ]
      },
      {
        $push: { warehouses: newWarehouse },
        $set: { updatedAt: new Date() },
        $setOnInsert: {
          createdAt: new Date(),
          status: 'active'
        }
      },
      { upsert: true, returnDocument: 'after' }
    );

    res.status(201).json({
      success: true,
      message: 'Entrepot cree avec succes',
      warehouse: newWarehouse
    });
  } catch (error) {
    console.error('Error creating warehouse:', error);
    res.status(500).json({ error: 'Erreur lors de la creation de l\'entrepot' });
  }
});

/**
 * PUT /api/icpe/warehouses/:warehouseId
 * Met a jour un entrepot et ses donnees ICPE
 */
router.put('/warehouses/:warehouseId', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const logisticianId = req.user.id || req.user.organizationId;
    const { warehouseId } = req.params;
    const updateData = req.body;

    // Construire l'objet de mise a jour
    const setFields = {};
    const allowedFields = [
      'name', 'address', 'surface', 'dockCount', 'gpsCoordinates',
      'icpeStatus', 'icpeNumero', 'icpePrefecture', 'icpeDateDeclaration',
      'icpeProchainControle', 'icpeRubriques'
    ];

    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        if (field.includes('Date') || field.includes('Controle')) {
          setFields[`warehouses.$.${field}`] = updateData[field] ? new Date(updateData[field]) : null;
        } else {
          setFields[`warehouses.$.${field}`] = updateData[field];
        }
      }
    });

    setFields['warehouses.$.updatedAt'] = new Date();

    const result = await db.collection('logisticians').findOneAndUpdate(
      {
        $or: [
          { _id: new ObjectId(logisticianId) },
          { email: logisticianId }
        ],
        'warehouses.warehouseId': warehouseId
      },
      { $set: setFields },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({ error: 'Entrepot non trouve' });
    }

    const updatedWarehouse = result.value.warehouses.find(w => w.warehouseId === warehouseId);

    res.json({
      success: true,
      message: 'Entrepot mis a jour avec succes',
      warehouse: updatedWarehouse
    });
  } catch (error) {
    console.error('Error updating warehouse:', error);
    res.status(500).json({ error: 'Erreur lors de la mise a jour de l\'entrepot' });
  }
});

// ============================================
// ROUTES RUBRIQUES ENTREPOT
// ============================================

/**
 * POST /api/icpe/warehouses/:warehouseId/rubriques
 * Ajoute une rubrique ICPE a un entrepot
 */
router.post('/warehouses/:warehouseId/rubriques', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const logisticianId = req.user.id || req.user.organizationId;
    const { warehouseId } = req.params;
    const { rubrique, volume, dateDeclaration } = req.body;

    if (!rubrique || volume === undefined) {
      return res.status(400).json({ error: 'rubrique et volume requis' });
    }

    const rubriqueInfo = ICPE_RUBRIQUES[rubrique];
    if (!rubriqueInfo) {
      return res.status(400).json({ error: 'Rubrique invalide' });
    }

    // Calculer le regime
    let regime = 'NC';
    const seuils = rubriqueInfo.seuils;
    if (seuils.declaration && volume >= seuils.declaration.min && (seuils.declaration.max === null || volume < seuils.declaration.max)) {
      regime = 'D';
    } else if (seuils.enregistrement && volume >= seuils.enregistrement.min && (seuils.enregistrement.max === null || volume < seuils.enregistrement.max)) {
      regime = 'E';
    } else if (seuils.autorisation && volume >= seuils.autorisation.min) {
      regime = 'A';
    }

    const newRubrique = {
      rubrique,
      libelle: rubriqueInfo.libelle,
      regime,
      seuilMax: volume,
      unite: rubriqueInfo.unite,
      dateDeclaration: dateDeclaration ? new Date(dateDeclaration) : new Date(),
      seveso: rubriqueInfo.seveso || false,
      createdAt: new Date()
    };

    const result = await db.collection('logisticians').findOneAndUpdate(
      {
        $or: [
          { _id: new ObjectId(logisticianId) },
          { email: logisticianId }
        ],
        'warehouses.warehouseId': warehouseId
      },
      {
        $push: { 'warehouses.$.icpeRubriques': newRubrique },
        $set: { 'warehouses.$.updatedAt': new Date() }
      },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({ error: 'Entrepot non trouve' });
    }

    res.status(201).json({
      success: true,
      message: 'Rubrique ajoutee avec succes',
      rubrique: newRubrique
    });
  } catch (error) {
    console.error('Error adding rubrique:', error);
    res.status(500).json({ error: 'Erreur lors de l\'ajout de la rubrique' });
  }
});

/**
 * PUT /api/icpe/warehouses/:warehouseId/rubriques/:rubriqueCode
 * Met a jour une rubrique d'un entrepot
 */
router.put('/warehouses/:warehouseId/rubriques/:rubriqueCode', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const logisticianId = req.user.id || req.user.organizationId;
    const { warehouseId, rubriqueCode } = req.params;
    const { volume, dateDeclaration } = req.body;

    const rubriqueInfo = ICPE_RUBRIQUES[rubriqueCode];
    if (!rubriqueInfo) {
      return res.status(400).json({ error: 'Rubrique invalide' });
    }

    // Recalculer le regime si volume change
    let regime = 'NC';
    if (volume !== undefined) {
      const seuils = rubriqueInfo.seuils;
      if (seuils.declaration && volume >= seuils.declaration.min && (seuils.declaration.max === null || volume < seuils.declaration.max)) {
        regime = 'D';
      } else if (seuils.enregistrement && volume >= seuils.enregistrement.min && (seuils.enregistrement.max === null || volume < seuils.enregistrement.max)) {
        regime = 'E';
      } else if (seuils.autorisation && volume >= seuils.autorisation.min) {
        regime = 'A';
      }
    }

    // Recuperer le logisticien et l'entrepot
    const logistician = await db.collection('logisticians').findOne({
      $or: [
        { _id: new ObjectId(logisticianId) },
        { email: logisticianId }
      ],
      'warehouses.warehouseId': warehouseId
    });

    if (!logistician) {
      return res.status(404).json({ error: 'Entrepot non trouve' });
    }

    const warehouse = logistician.warehouses.find(w => w.warehouseId === warehouseId);
    const rubriques = warehouse.icpeRubriques || [];
    const rubriqueIndex = rubriques.findIndex(r => r.rubrique === rubriqueCode);

    if (rubriqueIndex === -1) {
      return res.status(404).json({ error: 'Rubrique non trouvee sur cet entrepot' });
    }

    // Mettre a jour la rubrique
    rubriques[rubriqueIndex] = {
      ...rubriques[rubriqueIndex],
      seuilMax: volume !== undefined ? volume : rubriques[rubriqueIndex].seuilMax,
      regime: volume !== undefined ? regime : rubriques[rubriqueIndex].regime,
      dateDeclaration: dateDeclaration ? new Date(dateDeclaration) : rubriques[rubriqueIndex].dateDeclaration,
      updatedAt: new Date()
    };

    const result = await db.collection('logisticians').findOneAndUpdate(
      {
        $or: [
          { _id: new ObjectId(logisticianId) },
          { email: logisticianId }
        ],
        'warehouses.warehouseId': warehouseId
      },
      {
        $set: {
          'warehouses.$.icpeRubriques': rubriques,
          'warehouses.$.updatedAt': new Date()
        }
      },
      { returnDocument: 'after' }
    );

    res.json({
      success: true,
      message: 'Rubrique mise a jour avec succes',
      rubrique: rubriques[rubriqueIndex]
    });
  } catch (error) {
    console.error('Error updating rubrique:', error);
    res.status(500).json({ error: 'Erreur lors de la mise a jour de la rubrique' });
  }
});

/**
 * DELETE /api/icpe/warehouses/:warehouseId/rubriques/:rubriqueCode
 * Supprime une rubrique d'un entrepot
 */
router.delete('/warehouses/:warehouseId/rubriques/:rubriqueCode', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const logisticianId = req.user.id || req.user.organizationId;
    const { warehouseId, rubriqueCode } = req.params;

    const result = await db.collection('logisticians').findOneAndUpdate(
      {
        $or: [
          { _id: new ObjectId(logisticianId) },
          { email: logisticianId }
        ],
        'warehouses.warehouseId': warehouseId
      },
      {
        $pull: { 'warehouses.$.icpeRubriques': { rubrique: rubriqueCode } },
        $set: { 'warehouses.$.updatedAt': new Date() }
      },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({ error: 'Entrepot non trouve' });
    }

    res.json({
      success: true,
      message: 'Rubrique supprimee avec succes'
    });
  } catch (error) {
    console.error('Error deleting rubrique:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la rubrique' });
  }
});

// ============================================
// ROUTES VOLUMES ICPE
// ============================================

/**
 * POST /api/icpe/warehouses/:warehouseId/volumes
 * Declare un volume pour une rubrique (tracking periodique)
 */
router.post('/warehouses/:warehouseId/volumes', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const logisticianId = req.user.id || req.user.organizationId;
    const { warehouseId } = req.params;
    const { rubrique, volume, date, comment } = req.body;

    if (!rubrique || volume === undefined) {
      return res.status(400).json({ error: 'rubrique et volume requis' });
    }

    const volumeEntry = {
      volumeId: `VOL${Date.now()}`,
      rubrique,
      volume,
      date: date ? new Date(date) : new Date(),
      comment: comment || null,
      declaredBy: req.user.id,
      createdAt: new Date()
    };

    const result = await db.collection('logisticians').findOneAndUpdate(
      {
        $or: [
          { _id: new ObjectId(logisticianId) },
          { email: logisticianId }
        ],
        'warehouses.warehouseId': warehouseId
      },
      {
        $push: { 'warehouses.$.icpeVolumes': volumeEntry },
        $set: { 'warehouses.$.updatedAt': new Date() }
      },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({ error: 'Entrepot non trouve' });
    }

    // Verifier les alertes
    const warehouse = result.value.warehouses.find(w => w.warehouseId === warehouseId);
    const alerts = calculateICPEAlerts(warehouse);

    // Creer des alertes si necessaire
    if (alerts.length > 0) {
      await db.collection('icpe_alerts').insertMany(
        alerts.map(alert => ({
          ...alert,
          logisticianId: result.value._id,
          warehouseId,
          volumeEntryId: volumeEntry.volumeId,
          createdAt: new Date(),
          status: 'active'
        }))
      );
    }

    res.status(201).json({
      success: true,
      message: 'Volume declare avec succes',
      volume: volumeEntry,
      alerts
    });
  } catch (error) {
    console.error('Error declaring volume:', error);
    res.status(500).json({ error: 'Erreur lors de la declaration du volume' });
  }
});

/**
 * GET /api/icpe/warehouses/:warehouseId/volumes
 * Historique des volumes declares pour un entrepot
 */
router.get('/warehouses/:warehouseId/volumes', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const logisticianId = req.user.id || req.user.organizationId;
    const { warehouseId } = req.params;
    const { rubrique, startDate, endDate, limit = 100 } = req.query;

    const logistician = await db.collection('logisticians').findOne({
      $or: [
        { _id: new ObjectId(logisticianId) },
        { email: logisticianId }
      ],
      'warehouses.warehouseId': warehouseId
    });

    if (!logistician) {
      return res.status(404).json({ error: 'Entrepot non trouve' });
    }

    const warehouse = logistician.warehouses.find(w => w.warehouseId === warehouseId);
    let volumes = warehouse.icpeVolumes || [];

    // Filtres
    if (rubrique) {
      volumes = volumes.filter(v => v.rubrique === rubrique);
    }
    if (startDate) {
      volumes = volumes.filter(v => new Date(v.date) >= new Date(startDate));
    }
    if (endDate) {
      volumes = volumes.filter(v => new Date(v.date) <= new Date(endDate));
    }

    // Trier par date decroissante et limiter
    volumes = volumes
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, parseInt(limit));

    res.json({
      success: true,
      volumes,
      count: volumes.length
    });
  } catch (error) {
    console.error('Error fetching volumes:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation des volumes' });
  }
});

// ============================================
// ROUTES ALERTES ICPE
// ============================================

/**
 * GET /api/icpe/alerts
 * Liste les alertes ICPE actives du logisticien
 */
router.get('/alerts', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const logisticianId = req.user.id || req.user.organizationId;
    const { warehouseId, status, severity } = req.query;

    const query = {
      $or: [
        { logisticianId: new ObjectId(logisticianId) },
        { logisticianId: logisticianId }
      ]
    };

    if (warehouseId) query.warehouseId = warehouseId;
    if (status) query.status = status;
    if (severity) query.severity = severity;

    const alerts = await db.collection('icpe_alerts')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    res.json({
      success: true,
      alerts,
      count: alerts.length
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation des alertes' });
  }
});

/**
 * PUT /api/icpe/alerts/:alertId/acknowledge
 * Acquitte une alerte
 */
router.put('/alerts/:alertId/acknowledge', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const { comment } = req.body;

    const result = await db.collection('icpe_alerts').findOneAndUpdate(
      { _id: new ObjectId(req.params.alertId) },
      {
        $set: {
          status: 'acknowledged',
          acknowledgedAt: new Date(),
          acknowledgedBy: req.user.id,
          acknowledgementComment: comment || null
        }
      },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({ error: 'Alerte non trouvee' });
    }

    res.json({
      success: true,
      message: 'Alerte acquittee',
      alert: result.value
    });
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({ error: 'Erreur lors de l\'acquittement de l\'alerte' });
  }
});

// ============================================
// ROUTES INDUSTRIE (Vue des logisticiens)
// ============================================

/**
 * GET /api/icpe/industrial/logisticians
 * Liste les logisticiens partenaires avec leurs donnees ICPE (pour industriels)
 */
router.get('/industrial/logisticians', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const industrialId = req.user.organizationId;

    // Recuperer les partenaires logistiques de cet industriel
    const partners = await db.collection('logistics_partners')
      .find({ organizationId: industrialId, isActive: true })
      .toArray();

    // Pour chaque partenaire, recuperer les infos ICPE
    const logisticiansWithICPE = await Promise.all(
      partners.map(async (partner) => {
        const logistician = await db.collection('logisticians').findOne({
          email: partner.contactEmail
        });

        return {
          partnerId: partner.partnerId,
          partnerName: partner.partnerName,
          partnerType: partner.partnerType,
          contactEmail: partner.contactEmail,
          warehouses: logistician?.warehouses?.map(w => ({
            warehouseId: w.warehouseId,
            name: w.name,
            address: w.address,
            surface: w.surface,
            icpeStatus: w.icpeStatus,
            icpeNumero: w.icpeNumero,
            icpeRubriques: w.icpeRubriques || [],
            icpeProchainControle: w.icpeProchainControle,
            alerts: calculateICPEAlerts(w)
          })) || [],
          totalAlerts: logistician?.warehouses?.reduce((sum, w) => sum + calculateICPEAlerts(w).length, 0) || 0
        };
      })
    );

    res.json({
      success: true,
      logisticians: logisticiansWithICPE,
      count: logisticiansWithICPE.length
    });
  } catch (error) {
    console.error('Error fetching industrial logisticians:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation des logisticiens' });
  }
});

/**
 * GET /api/icpe/industrial/dashboard
 * Dashboard ICPE pour industriel (vue globale)
 */
router.get('/industrial/dashboard', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const industrialId = req.user.organizationId;

    // Stats globales
    const partners = await db.collection('logistics_partners')
      .find({ organizationId: industrialId, isActive: true })
      .toArray();

    let totalWarehouses = 0;
    let totalAlertsWarning = 0;
    let totalAlertsCritical = 0;
    let warehousesByStatus = {
      DECLARATION: 0,
      ENREGISTREMENT: 0,
      AUTORISATION: 0,
      SEVESO_SB: 0,
      SEVESO_SH: 0
    };
    let upcomingInspections = [];

    for (const partner of partners) {
      const logistician = await db.collection('logisticians').findOne({
        email: partner.contactEmail
      });

      if (logistician?.warehouses) {
        totalWarehouses += logistician.warehouses.length;

        for (const warehouse of logistician.warehouses) {
          if (warehouse.icpeStatus) {
            warehousesByStatus[warehouse.icpeStatus] = (warehousesByStatus[warehouse.icpeStatus] || 0) + 1;
          }

          const alerts = calculateICPEAlerts(warehouse);
          totalAlertsWarning += alerts.filter(a => a.severity === 'warning').length;
          totalAlertsCritical += alerts.filter(a => a.severity === 'critical').length;

          if (warehouse.icpeProchainControle) {
            const daysUntil = Math.ceil((new Date(warehouse.icpeProchainControle) - new Date()) / (1000 * 60 * 60 * 24));
            if (daysUntil <= 90 && daysUntil > 0) {
              upcomingInspections.push({
                warehouseName: warehouse.name,
                partnerName: partner.partnerName,
                date: warehouse.icpeProchainControle,
                daysUntil
              });
            }
          }
        }
      }
    }

    upcomingInspections.sort((a, b) => a.daysUntil - b.daysUntil);

    res.json({
      success: true,
      dashboard: {
        totalPartners: partners.length,
        totalWarehouses,
        alerts: {
          warning: totalAlertsWarning,
          critical: totalAlertsCritical,
          total: totalAlertsWarning + totalAlertsCritical
        },
        warehousesByStatus,
        upcomingInspections: upcomingInspections.slice(0, 10)
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation du dashboard' });
  }
});

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Calcule les alertes ICPE pour un entrepot
 */
function calculateICPEAlerts(warehouse) {
  const alerts = [];

  if (!warehouse) return alerts;

  // Alertes sur les rubriques
  const rubriques = warehouse.icpeRubriques || [];
  const volumes = warehouse.icpeVolumes || [];

  for (const rubrique of rubriques) {
    // Trouver le dernier volume declare pour cette rubrique
    const lastVolume = volumes
      .filter(v => v.rubrique === rubrique.rubrique)
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

    if (lastVolume && rubrique.seuilMax) {
      const ratio = lastVolume.volume / rubrique.seuilMax;

      if (ratio >= 1) {
        alerts.push({
          type: 'icpe_seuil_critical',
          severity: 'critical',
          rubrique: rubrique.rubrique,
          libelle: rubrique.libelle,
          message: `Depassement du seuil autorise pour ${rubrique.libelle} (${lastVolume.volume}/${rubrique.seuilMax} ${rubrique.unite})`,
          volume: lastVolume.volume,
          seuilMax: rubrique.seuilMax,
          ratio
        });
      } else if (ratio >= 0.8) {
        alerts.push({
          type: 'icpe_seuil_warning',
          severity: 'warning',
          rubrique: rubrique.rubrique,
          libelle: rubrique.libelle,
          message: `Approche du seuil autorise pour ${rubrique.libelle} (${Math.round(ratio * 100)}%)`,
          volume: lastVolume.volume,
          seuilMax: rubrique.seuilMax,
          ratio
        });
      }
    }
  }

  // Alerte prochain controle
  if (warehouse.icpeProchainControle) {
    const daysUntil = Math.ceil((new Date(warehouse.icpeProchainControle) - new Date()) / (1000 * 60 * 60 * 24));

    if (daysUntil <= 0) {
      alerts.push({
        type: 'inspection_overdue',
        severity: 'critical',
        message: `Controle ICPE en retard de ${Math.abs(daysUntil)} jours`,
        dueDate: warehouse.icpeProchainControle
      });
    } else if (daysUntil <= 30) {
      alerts.push({
        type: 'inspection_due',
        severity: 'warning',
        message: `Controle ICPE dans ${daysUntil} jours`,
        dueDate: warehouse.icpeProchainControle
      });
    }
  }

  return alerts;
}

module.exports = router;
module.exports.calculateICPEAlerts = calculateICPEAlerts;
