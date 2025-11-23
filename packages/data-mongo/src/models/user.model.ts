import { User, UserType, UserRole, UserStatus } from '@rt/contracts';

/**
 * MongoDB User document interface
 */
export interface UserDocument extends Omit<User, 'id'> {
  _id: string;
}

/**
 * User creation data
 */
export interface CreateUserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  type: UserType;
  role: UserRole;
  status?: UserStatus;
  companyId?: string;
  avatar?: string;
}

/**
 * User update data
 */
export interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatar?: string;
  status?: UserStatus;
  role?: UserRole;
  preferences?: User['preferences'];
  lastLoginAt?: Date;
}
