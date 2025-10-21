import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  register,
  login,
  logout,
  refreshAccessToken,
  getUserById,
  type RegisterInput,
  type LoginInput,
} from '../services/auth.service.js';

const router = Router();

/**
 * POST /auth/register
 * Register a new user
 */
router.post(
  '/register',
  asyncHandler(async (req: Request, res: Response) => {
    const input: RegisterInput = req.body;

    if (!input.email || !input.password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const result = await register(input);

    res.status(201).json({
      message: 'User registered successfully',
      user: result.user,
      tokens: result.tokens,
    });
  })
);

/**
 * POST /auth/login
 * Login an existing user
 */
router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const input: LoginInput = req.body;

    if (!input.email || !input.password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const result = await login(input);

    res.json({
      message: 'Login successful',
      user: result.user,
      tokens: result.tokens,
    });
  })
);

/**
 * POST /auth/logout
 * Logout user (invalidate refresh token)
 */
router.post(
  '/logout',
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }

    await logout(refreshToken);

    res.json({ message: 'Logout successful' });
  })
);

/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 */
router.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }

    const tokens = await refreshAccessToken(refreshToken);

    res.json({ tokens });
  })
);

/**
 * GET /auth/me
 * Get current user info (requires authentication)
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const user = await getUserById(req.userId);

    res.json({ user });
  })
);

export default router;
