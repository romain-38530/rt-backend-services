import { Filter } from 'mongodb';
import { BaseRepository } from './base.repository.js';
import {
  UserDocument,
  CreateUserData,
  UpdateUserData,
} from '../models/user.model.js';
import { UserStatus, UserType } from '@rt/contracts';

export class UserRepository extends BaseRepository<UserDocument> {
  constructor() {
    super('users');
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.findOne({ email } as Filter<UserDocument>);
  }

  /**
   * Find users by company
   */
  async findByCompany(companyId: string): Promise<UserDocument[]> {
    return this.findMany({ companyId } as Filter<UserDocument>);
  }

  /**
   * Find users by type
   */
  async findByType(type: UserType): Promise<UserDocument[]> {
    return this.findMany({ type } as Filter<UserDocument>);
  }

  /**
   * Find active users
   */
  async findActiveUsers(): Promise<UserDocument[]> {
    return this.findMany({ status: UserStatus.ACTIVE } as Filter<UserDocument>);
  }

  /**
   * Create user
   */
  async createUser(data: CreateUserData): Promise<UserDocument> {
    const user: Partial<UserDocument> = {
      ...data,
      status: data.status || UserStatus.ACTIVE,
      preferences: {
        language: 'fr',
        timezone: 'Europe/Paris',
        notifications: {
          email: true,
          sms: true,
          push: true,
        },
      },
    };

    return this.create(user as UserDocument);
  }

  /**
   * Update user
   */
  async updateUser(
    id: string,
    data: UpdateUserData
  ): Promise<UserDocument | null> {
    return this.updateById(id, { $set: data as any });
  }

  /**
   * Update last login
   */
  async updateLastLogin(id: string): Promise<void> {
    await this.updateById(id, {
      $set: { lastLoginAt: new Date() } as any,
    });
  }

  /**
   * Check if email exists
   */
  async emailExists(email: string, excludeId?: string): Promise<boolean> {
    const filter: Filter<UserDocument> = { email } as any;
    if (excludeId) {
      filter._id = { $ne: excludeId } as any;
    }
    return this.exists(filter);
  }
}
