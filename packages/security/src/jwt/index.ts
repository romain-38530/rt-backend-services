import jwt from 'jsonwebtoken';
import { UserProfile } from '@rt/contracts';

export interface JwtPayload {
  id: string;
  email: string;
  role: string;
  type: string;
}

export interface TokenPair {
  token: string;
  refreshToken: string;
  expiresIn: number;
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * Generate access token
 */
export function generateToken(user: UserProfile): string {
  const payload: JwtPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
    type: user.type,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as string,
  } as jwt.SignOptions);
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(userId: string): string {
  return jwt.sign({ id: userId, type: 'refresh' }, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN as string,
  } as jwt.SignOptions);
}

/**
 * Generate both access and refresh tokens
 */
export function generateTokenPair(user: UserProfile): TokenPair {
  const token = generateToken(user);
  const refreshToken = generateRefreshToken(user.id);

  // Calculate expiration time in seconds
  const decoded = jwt.decode(token) as any;
  const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);

  return {
    token,
    refreshToken,
    expiresIn,
  };
}

/**
 * Verify and decode token
 */
export function verifyToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('TOKEN_EXPIRED');
    }
    throw new Error('INVALID_TOKEN');
  }
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token: string): { id: string } {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload.type !== 'refresh') {
      throw new Error('INVALID_TOKEN');
    }
    return { id: payload.id };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('TOKEN_EXPIRED');
    }
    throw new Error('INVALID_TOKEN');
  }
}

/**
 * Decode token without verification (for debugging)
 */
export function decodeToken(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload;
  } catch {
    return null;
  }
}
