import { UserRole } from '@rt/contracts';

/**
 * Permission matrix for role-based access control
 */

export enum Permission {
  // User management
  USER_READ = 'USER_READ',
  USER_CREATE = 'USER_CREATE',
  USER_UPDATE = 'USER_UPDATE',
  USER_DELETE = 'USER_DELETE',

  // Order management
  ORDER_READ = 'ORDER_READ',
  ORDER_CREATE = 'ORDER_CREATE',
  ORDER_UPDATE = 'ORDER_UPDATE',
  ORDER_DELETE = 'ORDER_DELETE',
  ORDER_ASSIGN = 'ORDER_ASSIGN',

  // Tracking
  TRACKING_READ = 'TRACKING_READ',
  TRACKING_UPDATE = 'TRACKING_UPDATE',

  // Notifications
  NOTIFICATION_READ = 'NOTIFICATION_READ',
  NOTIFICATION_SEND = 'NOTIFICATION_SEND',

  // Reports & Analytics
  REPORT_READ = 'REPORT_READ',
  REPORT_EXPORT = 'REPORT_EXPORT',

  // System
  SYSTEM_CONFIG = 'SYSTEM_CONFIG',
  SYSTEM_LOGS = 'SYSTEM_LOGS',
}

/**
 * Role permissions mapping
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.SUPER_ADMIN]: Object.values(Permission),

  [UserRole.ADMIN]: [
    Permission.USER_READ,
    Permission.USER_CREATE,
    Permission.USER_UPDATE,
    Permission.ORDER_READ,
    Permission.ORDER_CREATE,
    Permission.ORDER_UPDATE,
    Permission.ORDER_DELETE,
    Permission.ORDER_ASSIGN,
    Permission.TRACKING_READ,
    Permission.TRACKING_UPDATE,
    Permission.NOTIFICATION_READ,
    Permission.NOTIFICATION_SEND,
    Permission.REPORT_READ,
    Permission.REPORT_EXPORT,
  ],

  [UserRole.MANAGER]: [
    Permission.USER_READ,
    Permission.ORDER_READ,
    Permission.ORDER_CREATE,
    Permission.ORDER_UPDATE,
    Permission.ORDER_ASSIGN,
    Permission.TRACKING_READ,
    Permission.TRACKING_UPDATE,
    Permission.NOTIFICATION_READ,
    Permission.NOTIFICATION_SEND,
    Permission.REPORT_READ,
  ],

  [UserRole.OPERATOR]: [
    Permission.ORDER_READ,
    Permission.ORDER_UPDATE,
    Permission.TRACKING_READ,
    Permission.TRACKING_UPDATE,
    Permission.NOTIFICATION_READ,
  ],

  [UserRole.VIEWER]: [
    Permission.ORDER_READ,
    Permission.TRACKING_READ,
    Permission.NOTIFICATION_READ,
  ],

  [UserRole.DRIVER]: [
    Permission.ORDER_READ,
    Permission.TRACKING_UPDATE,
    Permission.NOTIFICATION_READ,
  ],

  [UserRole.CLIENT]: [
    Permission.ORDER_READ,
    Permission.ORDER_CREATE,
    Permission.TRACKING_READ,
    Permission.NOTIFICATION_READ,
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

/**
 * Check if a role has any of the specified permissions
 */
export function hasAnyPermission(
  role: UserRole,
  permissions: Permission[]
): boolean {
  return permissions.some((permission) => hasPermission(role, permission));
}

/**
 * Check if a role has all of the specified permissions
 */
export function hasAllPermissions(
  role: UserRole,
  permissions: Permission[]
): boolean {
  return permissions.every((permission) => hasPermission(role, permission));
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if user can access resource based on ownership
 */
export function canAccessResource(
  userId: string,
  resourceOwnerId: string,
  role: UserRole
): boolean {
  // Super admin and admin can access all resources
  if (role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN) {
    return true;
  }

  // Users can access their own resources
  return userId === resourceOwnerId;
}
