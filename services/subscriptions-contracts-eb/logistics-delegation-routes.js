/**
 * Logistics Delegation Routes
 * SYMPHONI.A - RT Technologie
 *
 * Routes pour la gestion des partenaires logistiques 3PL/4PL
 * et la configuration de la delegation des operations
 */

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Middleware d'authentification
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requis' });
  }
  // TODO: Implement proper JWT verification
  req.user = { organizationId: 'demo-org-id' };
  next();
};

/**
 * Schema pour les partenaires logistiques
 */
const LogisticsPartnerSchema = {
  partnerId: String,        // ID unique du partenaire
  partnerName: String,      // Nom commercial
  partnerType: String,      // '3PL' | '4PL'
  contactEmail: String,
  contactPhone: String,
  managedOperations: Array, // ['pickup', 'delivery', 'both']
  partnerSites: Array,      // Sites geres par ce partenaire
  contractStartDate: Date,
  contractEndDate: Date,
  isActive: Boolean,
  organizationId: String,   // L'industriel qui a cree ce partenariat
  createdAt: Date,
  updatedAt: Date
};

/**
 * GET /api/logistics-delegation/partners
 * Liste tous les partenaires logistiques de l'organisation
 */
router.get('/partners', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const organizationId = req.user.organizationId || req.query.organizationId;

    const partners = await db.collection('logistics_partners')
      .find({ organizationId })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      success: true,
      partners,
      total: partners.length
    });
  } catch (error) {
    console.error('Error fetching logistics partners:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation des partenaires' });
  }
});

/**
 * GET /api/logistics-delegation/partners/:id
 * Recupere un partenaire specifique
 */
router.get('/partners/:id', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const partner = await db.collection('logistics_partners').findOne({
      _id: new ObjectId(req.params.id),
      organizationId: req.user.organizationId
    });

    if (!partner) {
      return res.status(404).json({ error: 'Partenaire non trouve' });
    }

    res.json({ success: true, partner });
  } catch (error) {
    console.error('Error fetching partner:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation du partenaire' });
  }
});

/**
 * POST /api/logistics-delegation/partners
 * Cree un nouveau partenaire logistique
 */
router.post('/partners', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const {
      partnerId,
      partnerName,
      partnerType,
      contactEmail,
      contactPhone,
      managedOperations,
      partnerSites,
      contractStartDate,
      contractEndDate,
      isActive
    } = req.body;

    // Validation
    if (!partnerName || !partnerType || !contactEmail || !managedOperations) {
      return res.status(400).json({
        error: 'Champs requis: partnerName, partnerType, contactEmail, managedOperations'
      });
    }

    if (!['3PL', '4PL'].includes(partnerType)) {
      return res.status(400).json({ error: 'partnerType doit etre 3PL ou 4PL' });
    }

    // Verifier l'unicite du partnerId pour cette organisation
    if (partnerId) {
      const existing = await db.collection('logistics_partners').findOne({
        partnerId,
        organizationId: req.user.organizationId
      });
      if (existing) {
        return res.status(400).json({ error: 'Un partenaire avec cet ID existe deja' });
      }
    }

    const newPartner = {
      partnerId: partnerId || `LOG${Date.now()}`,
      partnerName,
      partnerType,
      contactEmail,
      contactPhone: contactPhone || null,
      managedOperations: managedOperations || ['both'],
      partnerSites: partnerSites || [],
      contractStartDate: contractStartDate ? new Date(contractStartDate) : new Date(),
      contractEndDate: contractEndDate ? new Date(contractEndDate) : null,
      isActive: isActive !== false,
      organizationId: req.user.organizationId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('logistics_partners').insertOne(newPartner);

    res.status(201).json({
      success: true,
      message: 'Partenaire cree avec succes',
      partner: { ...newPartner, _id: result.insertedId }
    });
  } catch (error) {
    console.error('Error creating partner:', error);
    res.status(500).json({ error: 'Erreur lors de la creation du partenaire' });
  }
});

/**
 * PUT /api/logistics-delegation/partners/:id
 * Met a jour un partenaire logistique
 */
router.put('/partners/:id', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const {
      partnerId,
      partnerName,
      partnerType,
      contactEmail,
      contactPhone,
      managedOperations,
      partnerSites,
      contractStartDate,
      contractEndDate,
      isActive
    } = req.body;

    const updateData = {
      updatedAt: new Date()
    };

    if (partnerId !== undefined) updateData.partnerId = partnerId;
    if (partnerName !== undefined) updateData.partnerName = partnerName;
    if (partnerType !== undefined) {
      if (!['3PL', '4PL'].includes(partnerType)) {
        return res.status(400).json({ error: 'partnerType doit etre 3PL ou 4PL' });
      }
      updateData.partnerType = partnerType;
    }
    if (contactEmail !== undefined) updateData.contactEmail = contactEmail;
    if (contactPhone !== undefined) updateData.contactPhone = contactPhone;
    if (managedOperations !== undefined) updateData.managedOperations = managedOperations;
    if (partnerSites !== undefined) updateData.partnerSites = partnerSites;
    if (contractStartDate !== undefined) updateData.contractStartDate = new Date(contractStartDate);
    if (contractEndDate !== undefined) updateData.contractEndDate = contractEndDate ? new Date(contractEndDate) : null;
    if (isActive !== undefined) updateData.isActive = isActive;

    const result = await db.collection('logistics_partners').findOneAndUpdate(
      {
        _id: new ObjectId(req.params.id),
        organizationId: req.user.organizationId
      },
      { $set: updateData },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({ error: 'Partenaire non trouve' });
    }

    res.json({
      success: true,
      message: 'Partenaire mis a jour avec succes',
      partner: result.value
    });
  } catch (error) {
    console.error('Error updating partner:', error);
    res.status(500).json({ error: 'Erreur lors de la mise a jour du partenaire' });
  }
});

/**
 * PATCH /api/logistics-delegation/partners/:id/toggle-active
 * Active/desactive un partenaire
 */
router.patch('/partners/:id/toggle-active', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const partner = await db.collection('logistics_partners').findOne({
      _id: new ObjectId(req.params.id),
      organizationId: req.user.organizationId
    });

    if (!partner) {
      return res.status(404).json({ error: 'Partenaire non trouve' });
    }

    const result = await db.collection('logistics_partners').findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      {
        $set: {
          isActive: !partner.isActive,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    res.json({
      success: true,
      message: `Partenaire ${result.value.isActive ? 'active' : 'desactive'} avec succes`,
      partner: result.value
    });
  } catch (error) {
    console.error('Error toggling partner status:', error);
    res.status(500).json({ error: 'Erreur lors du changement de statut' });
  }
});

/**
 * DELETE /api/logistics-delegation/partners/:id
 * Supprime un partenaire logistique
 */
router.delete('/partners/:id', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const result = await db.collection('logistics_partners').deleteOne({
      _id: new ObjectId(req.params.id),
      organizationId: req.user.organizationId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Partenaire non trouve' });
    }

    res.json({
      success: true,
      message: 'Partenaire supprime avec succes'
    });
  } catch (error) {
    console.error('Error deleting partner:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du partenaire' });
  }
});

/**
 * POST /api/logistics-delegation/partners/:id/sites
 * Ajoute un site a un partenaire
 */
router.post('/partners/:id/sites', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const { siteName, address, city, postalCode, country, isActive } = req.body;

    if (!siteName || !address || !city) {
      return res.status(400).json({
        error: 'Champs requis: siteName, address, city'
      });
    }

    const newSite = {
      siteId: `SITE${Date.now()}`,
      siteName,
      address,
      city,
      postalCode: postalCode || '',
      country: country || 'France',
      isActive: isActive !== false
    };

    const result = await db.collection('logistics_partners').findOneAndUpdate(
      {
        _id: new ObjectId(req.params.id),
        organizationId: req.user.organizationId
      },
      {
        $push: { partnerSites: newSite },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({ error: 'Partenaire non trouve' });
    }

    res.status(201).json({
      success: true,
      message: 'Site ajoute avec succes',
      site: newSite,
      partner: result.value
    });
  } catch (error) {
    console.error('Error adding site:', error);
    res.status(500).json({ error: 'Erreur lors de l\'ajout du site' });
  }
});

/**
 * DELETE /api/logistics-delegation/partners/:id/sites/:siteId
 * Supprime un site d'un partenaire
 */
router.delete('/partners/:id/sites/:siteId', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    const result = await db.collection('logistics_partners').findOneAndUpdate(
      {
        _id: new ObjectId(req.params.id),
        organizationId: req.user.organizationId
      },
      {
        $pull: { partnerSites: { siteId: req.params.siteId } },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({ error: 'Partenaire non trouve' });
    }

    res.json({
      success: true,
      message: 'Site supprime avec succes',
      partner: result.value
    });
  } catch (error) {
    console.error('Error removing site:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du site' });
  }
});

/**
 * GET /api/logistics-delegation/routing-config
 * Recupere la configuration de routage pour les RDV
 */
router.get('/routing-config', authMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database non disponible' });
    }

    // Recuperer tous les partenaires actifs
    const activePartners = await db.collection('logistics_partners')
      .find({
        organizationId: req.user.organizationId,
        isActive: true
      })
      .toArray();

    // Construire la configuration de routage
    const routingConfig = {
      hasActiveDelegation: activePartners.length > 0,
      partners: activePartners.map(p => ({
        partnerId: p.partnerId,
        partnerName: p.partnerName,
        partnerType: p.partnerType,
        managedOperations: p.managedOperations,
        sites: p.partnerSites.filter(s => s.isActive)
      })),
      pickupDelegation: activePartners.find(p =>
        p.managedOperations.includes('pickup') || p.managedOperations.includes('both')
      ) || null,
      deliveryDelegation: activePartners.find(p =>
        p.managedOperations.includes('delivery') || p.managedOperations.includes('both')
      ) || null
    };

    res.json({
      success: true,
      routingConfig
    });
  } catch (error) {
    console.error('Error fetching routing config:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation de la configuration' });
  }
});

module.exports = router;
