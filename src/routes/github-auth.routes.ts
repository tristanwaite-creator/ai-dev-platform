import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { db } from '../lib/db.js';
import { encrypt } from '../lib/encryption.js';
import { cache } from '../lib/redis.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL!;

// ============================================
// GitHub OAuth Flow
// ============================================

/**
 * Step 1: Initiate OAuth flow
 * GET /api/auth/github
 *
 * Supports both header-based auth and query parameter token for browser redirects
 */
router.get('/github', asyncHandler(async (req, res) => {
  // Try to get user from authenticate middleware or query parameter
  let userId: string | undefined;

  // First try the Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      userId = decoded.userId;
    } catch (error) {
      // Token invalid, try query parameter
    }
  }

  // If no header token, try query parameter (for browser redirects)
  if (!userId && req.query.token) {
    try {
      const decoded = jwt.verify(req.query.token as string, process.env.JWT_SECRET!) as { userId: string };
      userId = decoded.userId;
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  if (!userId) {
    return res.status(401).json({ error: 'No token provided' });
  }

  // Generate CSRF state token
  const state = crypto.randomBytes(32).toString('hex');

  // Store state in cache with 10-minute expiration
  await cache.set(`github_oauth_state:${state}`, userId, 600);

  // Redirect to GitHub OAuth
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_CALLBACK_URL,
    scope: 'repo user:email',
    state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
}));

/**
 * Step 2: OAuth callback
 * GET /api/auth/github/callback
 */
router.get('/github/callback', asyncHandler(async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.redirect('/error?message=Missing code or state parameter');
  }

  // Verify CSRF state token
  const userId = await cache.get<string>(`github_oauth_state:${state}`);
  if (!userId) {
    return res.redirect('/error?message=Invalid or expired state token');
  }

  // Delete used state token
  await cache.delete(`github_oauth_state:${state}`);

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_CALLBACK_URL,
      }),
    });

    const tokenData = await tokenResponse.json() as any;

    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }

    const accessToken = tokenData.access_token;

    // Fetch GitHub user profile
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    const githubUser = await userResponse.json() as any;

    // Encrypt and store token
    const encryptedToken = encrypt(accessToken);

    await db.user.update({
      where: { id: userId },
      data: {
        githubId: String(githubUser.id),
        githubUsername: githubUser.login,
        githubAccessToken: encryptedToken,
        avatarUrl: githubUser.avatar_url,
      },
    });

    // Redirect to frontend success page
    res.redirect('/github-connected?success=true');
  } catch (error: any) {
    console.error('GitHub OAuth error:', error);
    res.redirect(`/error?message=${encodeURIComponent(error.message)}`);
  }
}));

/**
 * Step 1: Initiate OAuth flow (No authentication required - for anonymous users)
 * GET /api/auth/github/login
 */
router.get('/github/login', asyncHandler(async (req, res) => {
  // Generate CSRF state token
  const state = crypto.randomBytes(32).toString('hex');

  // Store state in cache with 10-minute expiration
  await cache.set(`github_oauth_anon_state:${state}`, 'anonymous', 600);

  // Redirect to GitHub OAuth
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_CALLBACK_URL + '-anon',
    scope: 'repo user:email',
    state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
}));

/**
 * Step 2: OAuth callback for anonymous users
 * GET /api/auth/github/callback-anon
 */
router.get('/github/callback-anon', asyncHandler(async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.redirect('/error?message=Missing code or state parameter');
  }

  // Verify CSRF state token
  const validState = await cache.get<string>(`github_oauth_anon_state:${state}`);
  if (!validState) {
    return res.redirect('/error?message=Invalid or expired state token');
  }

  // Delete used state token
  await cache.delete(`github_oauth_anon_state:${state}`);

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_CALLBACK_URL + '-anon',
      }),
    });

    const tokenData = await tokenResponse.json() as any;

    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }

    const accessToken = tokenData.access_token;

    // Fetch GitHub user profile
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    const githubUser = await userResponse.json() as any;

    // Find or create user
    let user = await db.user.findFirst({
      where: { githubId: String(githubUser.id) },
    });

    if (!user) {
      // Create new user with GitHub OAuth
      user = await db.user.create({
        data: {
          email: githubUser.email || `github-${githubUser.id}@temp.local`,
          password: null, // OAuth users don't need passwords
          name: githubUser.name || githubUser.login,
          githubId: String(githubUser.id),
          githubUsername: githubUser.login,
          githubAccessToken: encrypt(accessToken),
          avatarUrl: githubUser.avatar_url,
        },
      });
    } else {
      // Update existing user's token
      user = await db.user.update({
        where: { id: user.id },
        data: {
          githubAccessToken: encrypt(accessToken),
          avatarUrl: githubUser.avatar_url,
        },
      });
    }

    // Create JWT session token
    const sessionToken = jwt.sign(
      { userId: user.id, githubUsername: githubUser.login },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    // Store session in cache
    await cache.set(`github_session:${user.id}`, sessionToken, 604800); // 7 days

    // Redirect to frontend with session info
    const redirectUrl = new URL('/', `http://localhost:${process.env.PORT || 3000}`);
    redirectUrl.searchParams.set('github_auth', 'success');
    redirectUrl.searchParams.set('session', sessionToken);
    redirectUrl.searchParams.set('username', githubUser.login);
    redirectUrl.searchParams.set('userId', user.id);

    res.redirect(redirectUrl.toString());
  } catch (error: any) {
    console.error('GitHub OAuth error:', error);
    res.redirect(`/error?message=${encodeURIComponent(error.message)}`);
  }
}));

/**
 * Disconnect GitHub
 * POST /api/auth/github/disconnect
 */
router.post('/github/disconnect', authenticate, asyncHandler(async (req, res) => {
  await db.user.update({
    where: { id: req.user!.id },
    data: {
      githubId: null,
      githubUsername: null,
      githubAccessToken: null,
    },
  });

  res.json({ success: true, message: 'GitHub disconnected successfully' });
}));

/**
 * Get GitHub connection status
 * GET /api/auth/github/status
 */
router.get('/github/status', authenticate, asyncHandler(async (req, res) => {
  const user = await db.user.findUnique({
    where: { id: req.user!.id },
    select: {
      githubId: true,
      githubUsername: true,
      avatarUrl: true,
    },
  });

  res.json({
    connected: !!user?.githubId,
    username: user?.githubUsername,
    avatarUrl: user?.avatarUrl,
  });
}));

export default router;
