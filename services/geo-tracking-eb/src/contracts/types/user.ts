import { BaseEntity } from './common.js';
import { UserType, UserRole, UserStatus } from '../enums/index.js';

export interface User extends BaseEntity {
  email: string;
  password: string; // hashed
  firstName: string;
  lastName: string;
  phone?: string;
  type: UserType;
  role: UserRole;
  status: UserStatus;
  companyId?: string;
  avatar?: string;
  preferences?: UserPreferences;
  lastLoginAt?: Date;
}

export interface UserPreferences {
  language: string;
  timezone: string;
  notifications: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  type: UserType;
  role: UserRole;
  status: UserStatus;
  companyId?: string;
  avatar?: string;
  createdAt: Date;
}

// Auth
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: UserProfile;
  token: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  type: UserType;
  companyId?: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ResetPasswordRequest {
  email: string;
}

export interface ConfirmResetPasswordRequest {
  token: string;
  newPassword: string;
}
