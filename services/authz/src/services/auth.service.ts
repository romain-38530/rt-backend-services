import {
  UserProfile,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  ApiErrorCode,
  UserStatus,
} from '@rt/contracts';
import { UserRepository } from '@rt/data-mongo';
import { hashPassword, comparePassword, generateTokenPair } from '@rt/security';
import { logger } from '@rt/utils';

export class AuthService {
  private userRepo: UserRepository;

  constructor() {
    this.userRepo = new UserRepository();
  }

  /**
   * Login user
   */
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const { email, password } = credentials;

    // Find user
    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      logger.warn('Login failed - user not found', { email });
      throw {
        code: ApiErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      };
    }

    // Check if user is active
    if (user.status !== UserStatus.ACTIVE) {
      logger.warn('Login failed - user not active', { email, status: user.status });
      throw {
        code: ApiErrorCode.FORBIDDEN,
        message: 'Account is not active',
      };
    }

    // Verify password
    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      logger.warn('Login failed - invalid password', { email });
      throw {
        code: ApiErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      };
    }

    // Update last login
    await this.userRepo.updateLastLogin(user._id);

    // Generate tokens
    const userProfile = this.toUserProfile(user);
    const tokens = generateTokenPair(userProfile);

    logger.info('User logged in successfully', { userId: user._id, email });

    return {
      user: userProfile,
      ...tokens,
    };
  }

  /**
   * Register new user
   */
  async register(data: RegisterRequest): Promise<LoginResponse> {
    const { email, password, ...userData } = data;

    // Check if email already exists
    const exists = await this.userRepo.emailExists(email);
    if (exists) {
      throw {
        code: ApiErrorCode.ALREADY_EXISTS,
        message: 'Email already registered',
        field: 'email',
      };
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await this.userRepo.createUser({
      email,
      password: hashedPassword,
      ...userData,
    });

    logger.info('User registered successfully', { userId: user._id, email });

    // Generate tokens
    const userProfile = this.toUserProfile(user);
    const tokens = generateTokenPair(userProfile);

    return {
      user: userProfile,
      ...tokens,
    };
  }

  /**
   * Get user profile
   */
  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw {
        code: ApiErrorCode.NOT_FOUND,
        message: 'User not found',
      };
    }

    return this.toUserProfile(user);
  }

  /**
   * Verify user exists and is active
   */
  async verifyUser(userId: string): Promise<boolean> {
    const user = await this.userRepo.findById(userId);
    return user !== null && user.status === UserStatus.ACTIVE;
  }

  /**
   * Convert user document to profile
   */
  private toUserProfile(user: any): UserProfile {
    return {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      type: user.type,
      role: user.role,
      status: user.status,
      companyId: user.companyId,
      avatar: user.avatar,
      createdAt: user.createdAt,
    };
  }
}
