/**
 * Routes de gestion des sous-utilisateurs
 */

import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import SubUser, { AccessLevel, Universe } from '../models/SubUser';
import User from '../models/User';
import { AuthRequest, authenticateUser } from '../middleware/auth';
import { canCreateSubUser, getSubUserLimitInfo } from '../services/subscription-limits';

const router = Router();

router.use(authenticateUser);

/**
 * GET /api/subusers
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const subUsers = await SubUser.find({ parentUserId: userId })
      .select('-password -activationToken')
      .sort({ createdAt: -1 });

    const limitInfo = await getSubUserLimitInfo(userId);

    res.json({
      success: true,
      data: {
        subUsers: subUsers.map(u => ({
          id: u._id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          accessLevel: u.accessLevel,
          universes: u.universes,
          status: u.status,
          invitedAt: u.invitedAt
        })),
        limit: {
          current: limitInfo.currentCount,
          max: limitInfo.maxAllowed,
          remaining: limitInfo.remaining,
          plan: limitInfo.plan,
          canAdd: limitInfo.allowed
        }
      }
    });
  } catch (error: any) {
    console.error('Error fetching subusers', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la recuperation des membres'
    });
  }
});

/**
 * GET /api/subusers/:id
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const subUser = await SubUser.findOne({
      _id: id,
      parentUserId: userId
    }).select('-password -activationToken');

    if (!subUser) {
      return res.status(404).json({
        success: false,
        error: 'Membre non trouve'
      });
    }

    res.json({
      success: true,
      data: {
        id: subUser._id,
        email: subUser.email,
        firstName: subUser.firstName,
        lastName: subUser.lastName,
        accessLevel: subUser.accessLevel,
        universes: subUser.universes,
        status: subUser.status,
        invitedAt: subUser.invitedAt
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la recuperation du membre'
    });
  }
});

/**
 * POST /api/subusers
 */
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { email, firstName, lastName, accessLevel, universes, phone } = req.body;

    if (!email || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        error: 'Email, prenom et nom sont requis'
      });
    }

    const limitCheck = await canCreateSubUser(userId);
    if (!limitCheck.allowed) {
      return res.status(403).json({
        success: false,
        error: limitCheck.message,
        limit: {
          current: limitCheck.currentCount,
          max: limitCheck.maxAllowed,
          plan: limitCheck.plan
        }
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    const existingSubUser = await SubUser.findOne({ email: email.toLowerCase() });

    if (existingUser || existingSubUser) {
      return res.status(409).json({
        success: false,
        error: 'Cet email est deja utilise'
      });
    }

    const validAccessLevels: AccessLevel[] = ['admin', 'editor', 'reader'];
    const level: AccessLevel = validAccessLevels.includes(accessLevel) ? accessLevel : 'reader';

    const validUniverses: Universe[] = ['industry', 'logistician', 'transporter', 'forwarder', 'supplier', 'recipient'];
    const selectedUniverses: Universe[] = Array.isArray(universes)
      ? universes.filter((u: string) => validUniverses.includes(u as Universe))
      : validUniverses;

    const activationToken = crypto.randomBytes(32).toString('hex');

    const subUser = await SubUser.create({
      parentUserId: userId,
      email: email.toLowerCase(),
      firstName,
      lastName,
      phone,
      accessLevel: level,
      universes: selectedUniverses,
      status: 'pending',
      activationToken,
      invitedAt: new Date()
    });

    console.log('SubUser created', { subUserId: subUser._id, email, parentUserId: userId });

    res.status(201).json({
      success: true,
      message: 'Invitation envoyee',
      data: {
        id: subUser._id,
        email: subUser.email,
        firstName: subUser.firstName,
        lastName: subUser.lastName,
        accessLevel: subUser.accessLevel,
        universes: subUser.universes,
        status: subUser.status,
        invitedAt: subUser.invitedAt
      }
    });
  } catch (error: any) {
    console.error('Error creating subuser', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la creation du membre'
    });
  }
});

/**
 * PUT /api/subusers/:id
 */
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { firstName, lastName, accessLevel, universes, phone, status } = req.body;

    const subUser = await SubUser.findOne({
      _id: id,
      parentUserId: userId
    });

    if (!subUser) {
      return res.status(404).json({
        success: false,
        error: 'Membre non trouve'
      });
    }

    if (firstName) subUser.firstName = firstName;
    if (lastName) subUser.lastName = lastName;
    if (phone !== undefined) subUser.phone = phone;

    const validAccessLevels: AccessLevel[] = ['admin', 'editor', 'reader'];
    if (accessLevel && validAccessLevels.includes(accessLevel)) {
      subUser.accessLevel = accessLevel;
    }

    const validUniverses: Universe[] = ['industry', 'logistician', 'transporter', 'forwarder', 'supplier', 'recipient'];
    if (Array.isArray(universes)) {
      subUser.universes = universes.filter((u: string) => validUniverses.includes(u as Universe));
    }

    if (status && ['active', 'inactive'].includes(status)) {
      subUser.status = status;
    }

    await subUser.save();

    res.json({
      success: true,
      message: 'Membre mis a jour',
      data: {
        id: subUser._id,
        email: subUser.email,
        firstName: subUser.firstName,
        lastName: subUser.lastName,
        accessLevel: subUser.accessLevel,
        universes: subUser.universes,
        status: subUser.status
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise a jour du membre'
    });
  }
});

/**
 * DELETE /api/subusers/:id
 */
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const subUser = await SubUser.findOneAndDelete({
      _id: id,
      parentUserId: userId
    });

    if (!subUser) {
      return res.status(404).json({
        success: false,
        error: 'Membre non trouve'
      });
    }

    res.json({
      success: true,
      message: 'Membre supprime'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression du membre'
    });
  }
});

/**
 * POST /api/subusers/:id/resend-invite
 */
router.post('/:id/resend-invite', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const subUser = await SubUser.findOne({
      _id: id,
      parentUserId: userId,
      status: 'pending'
    });

    if (!subUser) {
      return res.status(404).json({
        success: false,
        error: 'Membre non trouve ou deja active'
      });
    }

    const activationToken = crypto.randomBytes(32).toString('hex');
    subUser.activationToken = activationToken;
    subUser.invitedAt = new Date();
    await subUser.save();

    res.json({
      success: true,
      message: 'Invitation renvoyee'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors du renvoi de l\'invitation'
    });
  }
});

/**
 * GET /api/subusers/limit/info
 */
router.get('/limit/info', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const limitInfo = await getSubUserLimitInfo(userId);

    res.json({
      success: true,
      data: {
        current: limitInfo.currentCount,
        max: limitInfo.maxAllowed,
        remaining: limitInfo.remaining,
        plan: limitInfo.plan,
        canAdd: limitInfo.allowed
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la recuperation des limites'
    });
  }
});

export default router;
