import { db } from '../lib/db.js';
import { sessionManager } from '../lib/redis.js';
import {
  hashPassword,
  verifyPassword,
  generateAuthTokens,
  generateSecureToken,
  isValidEmail,
  isValidPassword,
  type TokenPayload,
  type AuthTokens,
} from '../lib/auth.js';

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
  };
  tokens: AuthTokens;
}

/**
 * Register a new user
 */
export async function register(input: RegisterInput): Promise<AuthResult> {
  // Validate input
  if (!isValidEmail(input.email)) {
    throw new Error('Invalid email format');
  }

  const passwordValidation = isValidPassword(input.password);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.error || 'Invalid password');
  }

  // Check if user already exists
  const existingUser = await db.user.findUnique({
    where: { email: input.email },
  });

  if (existingUser) {
    throw new Error('User with this email already exists');
  }

  // Hash password
  const hashedPassword = await hashPassword(input.password);

  // Create user
  const user = await db.user.create({
    data: {
      email: input.email,
      password: hashedPassword,
      name: input.name,
    },
  });

  // Generate tokens
  const tokenPayload: TokenPayload = {
    userId: user.id,
    email: user.email,
  };
  const tokens = generateAuthTokens(tokenPayload);

  // Store session in Redis
  await sessionManager.setSession(tokens.refreshToken, user.id);

  // Store session in database
  await db.session.create({
    data: {
      token: tokens.refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  // Update last login
  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    },
    tokens,
  };
}

/**
 * Login an existing user
 */
export async function login(input: LoginInput): Promise<AuthResult> {
  // Find user
  const user = await db.user.findUnique({
    where: { email: input.email },
  });

  if (!user || !user.password) {
    throw new Error('Invalid email or password');
  }

  // Verify password
  const isPasswordValid = await verifyPassword(input.password, user.password);
  if (!isPasswordValid) {
    throw new Error('Invalid email or password');
  }

  // Generate tokens
  const tokenPayload: TokenPayload = {
    userId: user.id,
    email: user.email,
  };
  const tokens = generateAuthTokens(tokenPayload);

  // Store session in Redis
  await sessionManager.setSession(tokens.refreshToken, user.id);

  // Store session in database
  await db.session.create({
    data: {
      token: tokens.refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  // Update last login
  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    },
    tokens,
  };
}

/**
 * Logout user (invalidate session)
 */
export async function logout(refreshToken: string): Promise<void> {
  // Remove from Redis
  await sessionManager.deleteSession(refreshToken);

  // Remove from database
  await db.session.deleteMany({
    where: { token: refreshToken },
  });
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
  // Check Redis first
  const userId = await sessionManager.getSession(refreshToken);
  if (!userId) {
    throw new Error('Invalid or expired refresh token');
  }

  // Verify session exists in database
  const session = await db.session.findUnique({
    where: { token: refreshToken },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    // Clean up expired session
    await sessionManager.deleteSession(refreshToken);
    await db.session.deleteMany({ where: { token: refreshToken } });
    throw new Error('Invalid or expired refresh token');
  }

  // Generate new tokens
  const tokenPayload: TokenPayload = {
    userId: session.user.id,
    email: session.user.email,
  };
  const tokens = generateAuthTokens(tokenPayload);

  // Update Redis with new refresh token
  await sessionManager.deleteSession(refreshToken);
  await sessionManager.setSession(tokens.refreshToken, session.user.id);

  // Update database session
  await db.session.delete({ where: { id: session.id } });
  await db.session.create({
    data: {
      token: tokens.refreshToken,
      userId: session.user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return tokens;
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      githubUsername: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  return user;
}
