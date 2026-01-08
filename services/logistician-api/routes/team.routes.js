/**
 * Team Management Routes
 * Gestion des sub-utilisateurs (collaborateurs) logisticien
 */

import { Router } from 'express';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { authenticateLogistician } from '../index.js';

const router = Router();

// Permissions par rôle
const ROLE_PERMISSIONS = {
  viewer: [
    'orders.read',
    'rdv.read',
    'ecmr.read',
    'icpe.read',
    'tracking.read'
  ],
  editor: [
    'orders.read',
    'orders.write',
    'rdv.read',
    'rdv.write',
    'ecmr.read',
    'ecmr.sign',
    'icpe.read',
    'icpe.declare',
    'tracking.read'
  ],
  admin: [
    'orders.read',
    'orders.write',
    'rdv.read',
    'rdv.write',
    'ecmr.read',
    'ecmr.sign',
    'icpe.read',
    'icpe.declare',
    'tracking.read',
    'team.manage',
    'billing.manage',
    'settings.manage'
  ]
};

// Limite membres par plan
function getMaxMembersByPlan(plan) {
  switch (plan) {
    case 'enterprise': return 999;
    case 'pro': return 10;
    default: return 3;
  }
}

// Middleware vérification admin
async function requireAdmin(req, res, next) {
  const db = req.db;
  const logisticianId = req.params.id;

  // Vérifier si l'utilisateur est admin de cette organisation
  const member = await db.collection('logistician_team_members').findOne({
    userId: new ObjectId(req.user.userId),
    logisticianId: new ObjectId(logisticianId),
    role: 'admin',
    status: 'active'
  });

  // Ou si c'est le propriétaire
  const logistician = await db.collection('logisticians').findOne({
    _id: new ObjectId(logisticianId)
  });

  if (!member && logistician?.ownerId?.toString() !== req.user.userId) {
    return res.status(403).json({ error: 'Accès admin requis' });
  }

  next();
}

// ===========================================
// GET /api/logisticians/:id/team
// Liste des membres de l'équipe
// ===========================================
router.get('/:id/team', authenticateLogistician, async (req, res) => {
  try {
    const logisticianId = req.params.id;
    const db = req.db;

    const members = await db.collection('logistician_team_members')
      .find({ logisticianId: new ObjectId(logisticianId) })
      .project({ invitationToken: 0 })
      .sort({ createdAt: 1 })
      .toArray();

    const logistician = await db.collection('logisticians').findOne({
      _id: new ObjectId(logisticianId)
    });

    const maxMembers = getMaxMembersByPlan(logistician?.subscription?.plan || 'base');

    // Récupérer les entrepôts pour le mapping
    const warehouses = logistician?.warehouses || [];

    res.json({
      members: members.map(m => ({
        id: m._id,
        email: m.email,
        firstName: m.firstName,
        lastName: m.lastName,
        fullName: `${m.firstName} ${m.lastName}`,
        role: m.role,
        roleName: m.role === 'admin' ? 'Administrateur' : m.role === 'editor' ? 'Éditeur' : 'Lecteur',
        permissions: m.permissions,
        warehouses: m.warehouses?.length > 0
          ? warehouses.filter(w => m.warehouses.some(mw => mw.equals(w.warehouseId)))
          : warehouses, // Tous si vide
        status: m.status,
        lastLogin: m.lastLogin,
        createdAt: m.createdAt
      })),
      maxMembers,
      currentCount: members.length,
      canAddMore: members.length < maxMembers
    });

  } catch (error) {
    console.error('[TEAM] List error:', error);
    res.status(500).json({ error: 'Erreur récupération équipe' });
  }
});

// ===========================================
// POST /api/logisticians/:id/team/invite
// Inviter un collaborateur
// ===========================================
router.post('/:id/team/invite', authenticateLogistician, requireAdmin, async (req, res) => {
  try {
    const { email, firstName, lastName, role, warehouses } = req.body;
    const logisticianId = req.params.id;
    const db = req.db;

    // Validation
    if (!email || !firstName || !lastName || !role) {
      return res.status(400).json({ error: 'Champs requis: email, firstName, lastName, role' });
    }

    if (!['viewer', 'editor', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide' });
    }

    // Vérifier limite
    const currentCount = await db.collection('logistician_team_members')
      .countDocuments({ logisticianId: new ObjectId(logisticianId) });

    const logistician = await db.collection('logisticians').findOne({
      _id: new ObjectId(logisticianId)
    });

    const maxMembers = getMaxMembersByPlan(logistician?.subscription?.plan || 'base');

    if (currentCount >= maxMembers) {
      return res.status(400).json({
        error: 'Limite de collaborateurs atteinte',
        maxMembers,
        currentCount,
        upgrade: 'Passez au plan Pro ou Enterprise pour plus de collaborateurs'
      });
    }

    // Vérifier email pas déjà utilisé dans cette organisation
    const existing = await db.collection('logistician_team_members').findOne({
      logisticianId: new ObjectId(logisticianId),
      email: email.toLowerCase()
    });

    if (existing) {
      return res.status(400).json({ error: 'Cet email est déjà utilisé dans votre équipe' });
    }

    // Générer token invitation (valide 7 jours)
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const invitationExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Créer membre
    const member = {
      logisticianId: new ObjectId(logisticianId),
      email: email.toLowerCase(),
      firstName,
      lastName,
      role,
      permissions: ROLE_PERMISSIONS[role],
      warehouses: warehouses?.map(id => new ObjectId(id)) || [],
      status: 'invited',
      invitationToken,
      invitationExpiry,
      createdAt: new Date(),
      createdBy: new ObjectId(req.user.userId)
    };

    const result = await db.collection('logistician_team_members').insertOne(member);

    // Log event
    await db.collection('logistician_events').insertOne({
      type: 'team.member_invited',
      logisticianId: new ObjectId(logisticianId),
      data: { email, role, memberId: result.insertedId },
      userId: new ObjectId(req.user.userId),
      createdAt: new Date()
    });

    // TODO: Envoyer email d'invitation
    const invitationUrl = `${process.env.LOGISTICIAN_PORTAL_URL}/invitation/${invitationToken}`;
    console.log(`[TEAM] Invitation URL: ${invitationUrl}`);

    res.status(201).json({
      message: 'Invitation envoyée',
      memberId: result.insertedId,
      invitationUrl // En dev seulement
    });

  } catch (error) {
    console.error('[TEAM] Invite error:', error);
    res.status(500).json({ error: 'Erreur envoi invitation' });
  }
});

// ===========================================
// GET /api/logisticians/team/invitation/:token
// Vérifier token d'invitation
// ===========================================
router.get('/team/invitation/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const db = req.db;

    const member = await db.collection('logistician_team_members').findOne({
      invitationToken: token,
      status: 'invited',
      invitationExpiry: { $gt: new Date() }
    });

    if (!member) {
      return res.status(404).json({
        valid: false,
        error: 'Invitation invalide ou expirée'
      });
    }

    // Récupérer nom logisticien
    const logistician = await db.collection('logisticians').findOne({
      _id: member.logisticianId
    });

    res.json({
      valid: true,
      email: member.email,
      firstName: member.firstName,
      lastName: member.lastName,
      role: member.role,
      logisticianName: logistician?.companyName || 'Organisation'
    });

  } catch (error) {
    console.error('[TEAM] Check invitation error:', error);
    res.status(500).json({ error: 'Erreur vérification invitation' });
  }
});

// ===========================================
// POST /api/logisticians/team/invitation/:token/accept
// Accepter invitation et créer compte
// ===========================================
router.post('/team/invitation/:token/accept', async (req, res) => {
  try {
    const { token } = req.params;
    const { password, phone } = req.body;
    const db = req.db;
    const mongoClient = req.mongoClient;

    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Mot de passe requis (min 8 caractères)' });
    }

    // Trouver invitation
    const member = await db.collection('logistician_team_members').findOne({
      invitationToken: token,
      status: 'invited',
      invitationExpiry: { $gt: new Date() }
    });

    if (!member) {
      return res.status(404).json({ error: 'Invitation invalide ou expirée' });
    }

    // Créer user dans rt-auth
    const authDb = mongoClient.db('rt-auth');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Vérifier si user existe déjà
    const existingUser = await authDb.collection('users').findOne({
      email: member.email
    });

    let userId;

    if (existingUser) {
      // Mettre à jour user existant
      userId = existingUser._id;
      await authDb.collection('users').updateOne(
        { _id: existingUser._id },
        {
          $set: {
            password: hashedPassword,
            name: `${member.firstName} ${member.lastName}`,
            phone: phone || existingUser.phone,
            portal: 'logistician',
            isActive: true,
            updatedAt: new Date()
          }
        }
      );
    } else {
      // Créer nouveau user
      const userResult = await authDb.collection('users').insertOne({
        email: member.email,
        password: hashedPassword,
        name: `${member.firstName} ${member.lastName}`,
        phone,
        role: 'user',
        portal: 'logistician',
        isActive: true,
        createdAt: new Date()
      });
      userId = userResult.insertedId;
    }

    // Mettre à jour membre
    await db.collection('logistician_team_members').updateOne(
      { _id: member._id },
      {
        $set: {
          userId: userId,
          status: 'active',
          phone,
          activatedAt: new Date(),
          updatedAt: new Date()
        },
        $unset: {
          invitationToken: '',
          invitationExpiry: ''
        }
      }
    );

    // Log event
    await db.collection('logistician_events').insertOne({
      type: 'team.member_activated',
      logisticianId: member.logisticianId,
      data: { memberId: member._id, email: member.email },
      createdAt: new Date()
    });

    res.json({
      message: 'Compte activé avec succès',
      email: member.email
    });

  } catch (error) {
    console.error('[TEAM] Accept invitation error:', error);
    res.status(500).json({ error: 'Erreur activation compte' });
  }
});

// ===========================================
// PUT /api/logisticians/:id/team/:memberId
// Modifier rôle/permissions d'un membre
// ===========================================
router.put('/:id/team/:memberId', authenticateLogistician, requireAdmin, async (req, res) => {
  try {
    const { id: logisticianId, memberId } = req.params;
    const { role, warehouses } = req.body;
    const db = req.db;

    // Vérifier membre existe
    const member = await db.collection('logistician_team_members').findOne({
      _id: new ObjectId(memberId),
      logisticianId: new ObjectId(logisticianId)
    });

    if (!member) {
      return res.status(404).json({ error: 'Membre non trouvé' });
    }

    // Ne pas permettre de modifier son propre rôle admin
    if (member.userId?.toString() === req.user.userId && member.role === 'admin' && role !== 'admin') {
      return res.status(400).json({ error: 'Impossible de rétrograder votre propre rôle admin' });
    }

    // Construire update
    const update = { updatedAt: new Date() };

    if (role && ['viewer', 'editor', 'admin'].includes(role)) {
      update.role = role;
      update.permissions = ROLE_PERMISSIONS[role];
    }

    if (warehouses !== undefined) {
      update.warehouses = warehouses.map(id => new ObjectId(id));
    }

    await db.collection('logistician_team_members').updateOne(
      { _id: new ObjectId(memberId) },
      { $set: update }
    );

    // Log event
    await db.collection('logistician_events').insertOne({
      type: 'team.member_updated',
      logisticianId: new ObjectId(logisticianId),
      data: { memberId, changes: update },
      userId: new ObjectId(req.user.userId),
      createdAt: new Date()
    });

    res.json({ message: 'Membre mis à jour' });

  } catch (error) {
    console.error('[TEAM] Update member error:', error);
    res.status(500).json({ error: 'Erreur mise à jour membre' });
  }
});

// ===========================================
// DELETE /api/logisticians/:id/team/:memberId
// Retirer un membre de l'équipe
// ===========================================
router.delete('/:id/team/:memberId', authenticateLogistician, requireAdmin, async (req, res) => {
  try {
    const { id: logisticianId, memberId } = req.params;
    const db = req.db;
    const mongoClient = req.mongoClient;

    // Vérifier membre existe
    const member = await db.collection('logistician_team_members').findOne({
      _id: new ObjectId(memberId),
      logisticianId: new ObjectId(logisticianId)
    });

    if (!member) {
      return res.status(404).json({ error: 'Membre non trouvé' });
    }

    // Ne pas permettre de se supprimer soi-même
    if (member.userId?.toString() === req.user.userId) {
      return res.status(400).json({ error: 'Impossible de vous supprimer vous-même' });
    }

    // Supprimer membre
    await db.collection('logistician_team_members').deleteOne({
      _id: new ObjectId(memberId)
    });

    // Désactiver user dans rt-auth si existe
    if (member.userId) {
      const authDb = mongoClient.db('rt-auth');
      await authDb.collection('users').updateOne(
        { _id: member.userId },
        { $set: { isActive: false, updatedAt: new Date() } }
      );
    }

    // Log event
    await db.collection('logistician_events').insertOne({
      type: 'team.member_removed',
      logisticianId: new ObjectId(logisticianId),
      data: { memberId, email: member.email },
      userId: new ObjectId(req.user.userId),
      createdAt: new Date()
    });

    res.json({ message: 'Membre supprimé' });

  } catch (error) {
    console.error('[TEAM] Remove member error:', error);
    res.status(500).json({ error: 'Erreur suppression membre' });
  }
});

// ===========================================
// POST /api/logisticians/:id/team/:memberId/resend-invitation
// Renvoyer email d'invitation
// ===========================================
router.post('/:id/team/:memberId/resend-invitation', authenticateLogistician, requireAdmin, async (req, res) => {
  try {
    const { id: logisticianId, memberId } = req.params;
    const db = req.db;

    const member = await db.collection('logistician_team_members').findOne({
      _id: new ObjectId(memberId),
      logisticianId: new ObjectId(logisticianId),
      status: 'invited'
    });

    if (!member) {
      return res.status(404).json({ error: 'Invitation non trouvée ou déjà acceptée' });
    }

    // Générer nouveau token
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const invitationExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.collection('logistician_team_members').updateOne(
      { _id: new ObjectId(memberId) },
      {
        $set: {
          invitationToken,
          invitationExpiry,
          updatedAt: new Date()
        }
      }
    );

    // TODO: Envoyer email
    const invitationUrl = `${process.env.LOGISTICIAN_PORTAL_URL}/invitation/${invitationToken}`;
    console.log(`[TEAM] New invitation URL: ${invitationUrl}`);

    res.json({
      message: 'Invitation renvoyée',
      invitationUrl // En dev seulement
    });

  } catch (error) {
    console.error('[TEAM] Resend invitation error:', error);
    res.status(500).json({ error: 'Erreur renvoi invitation' });
  }
});

export default router;
