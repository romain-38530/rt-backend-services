/**
 * Service de gestion des limites d'abonnement
 * Verifie les quotas de sous-utilisateurs selon le plan
 */

import mongoose from 'mongoose';
import SubUser from '../models/SubUser';
import User from '../models/User';

export type SubscriptionPlan = 'starter' | 'pro' | 'enterprise' | 'trial';

export const SUBUSER_LIMITS: Record<SubscriptionPlan, number> = {
  trial: 1,
  starter: 2,
  pro: 10,
  enterprise: -1
};

export interface SubscriptionLimitResult {
  allowed: boolean;
  currentCount: number;
  maxAllowed: number;
  plan: SubscriptionPlan;
  remaining: number;
  message?: string;
}

export async function getUserPlan(userId: mongoose.Types.ObjectId | string): Promise<SubscriptionPlan> {
  try {
    const user = await User.findById(userId);

    if (!user) {
      return 'trial';
    }

    // Check role field (single value)
    if (user.role === 'super_admin' || user.role === 'admin') {
      return 'enterprise';
    }

    if (user.role === 'manager') {
      return 'pro';
    }

    return 'starter';
  } catch (error) {
    return 'starter';
  }
}

export async function canCreateSubUser(parentUserId: mongoose.Types.ObjectId | string): Promise<SubscriptionLimitResult> {
  const plan = await getUserPlan(parentUserId);
  const maxAllowed = SUBUSER_LIMITS[plan];

  if (maxAllowed === -1) {
    const currentCount = await SubUser.countDocuments({
      parentUserId,
      status: { $ne: 'inactive' }
    });

    return {
      allowed: true,
      currentCount,
      maxAllowed: -1,
      plan,
      remaining: -1
    };
  }

  const currentCount = await SubUser.countDocuments({
    parentUserId,
    status: { $ne: 'inactive' }
  });

  const remaining = maxAllowed - currentCount;
  const allowed = currentCount < maxAllowed;

  return {
    allowed,
    currentCount,
    maxAllowed,
    plan,
    remaining: Math.max(0, remaining),
    message: allowed
      ? undefined
      : `Limite de ${maxAllowed} membres atteinte pour le plan. Passez au plan superieur pour ajouter plus de membres.`
  };
}

export async function getSubUserLimitInfo(parentUserId: mongoose.Types.ObjectId | string): Promise<SubscriptionLimitResult> {
  const plan = await getUserPlan(parentUserId);
  const maxAllowed = SUBUSER_LIMITS[plan];

  const currentCount = await SubUser.countDocuments({
    parentUserId,
    status: { $ne: 'inactive' }
  });

  if (maxAllowed === -1) {
    return {
      allowed: true,
      currentCount,
      maxAllowed: -1,
      plan,
      remaining: -1
    };
  }

  return {
    allowed: currentCount < maxAllowed,
    currentCount,
    maxAllowed,
    plan,
    remaining: Math.max(0, maxAllowed - currentCount)
  };
}
