import Redis, { type RedisOptions } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Redis configuration with graceful degradation
let redis: Redis;
let redisAvailable = true;

if (process.env.REDIS_URL) {
  // Use cloud Redis (like Upstash) with connection string
  redis = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null, // Don't retry
  });
} else {
  // Use local Redis with connection options
  const config: RedisOptions = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null, // Don't retry, fail fast
  };
  redis = new Redis(config);
}

export { redis };

// Try to connect, but don't fail if Redis is unavailable
redis.connect().catch(() => {
  redisAvailable = false;
  console.log('⚠️  Redis not available - continuing without cache');
});

// Handle connection events
redis.on('connect', () => {
  console.log('✓ Redis connected');
  redisAvailable = true;
});

redis.on('error', (err) => {
  // Silently mark Redis as unavailable
  redisAvailable = false;
});

// Session management utilities (with graceful Redis fallback)
export const sessionManager = {
  /**
   * Store a session token
   */
  async setSession(token: string, userId: string, expiresIn: number = 7 * 24 * 60 * 60) {
    try {
      if (redisAvailable) {
        await redis.setex(`session:${token}`, expiresIn, userId);
      }
    } catch (error) {
      // Redis unavailable, continue without cache
    }
  },

  /**
   * Get user ID from session token
   */
  async getSession(token: string): Promise<string | null> {
    try {
      if (redisAvailable) {
        return await redis.get(`session:${token}`);
      }
    } catch (error) {
      // Redis unavailable, fall back to database only
    }
    return null;
  },

  /**
   * Delete a session token
   */
  async deleteSession(token: string) {
    try {
      if (redisAvailable) {
        await redis.del(`session:${token}`);
      }
    } catch (error) {
      // Redis unavailable, continue
    }
  },

  /**
   * Extend session expiration
   */
  async extendSession(token: string, expiresIn: number = 7 * 24 * 60 * 60) {
    try {
      if (redisAvailable) {
        await redis.expire(`session:${token}`, expiresIn);
      }
    } catch (error) {
      // Redis unavailable, continue
    }
  },
};

// In-memory fallback cache for when Redis is unavailable
const memoryCache = new Map<string, { value: any; expiresAt: number }>();

// Cleanup expired in-memory cache entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt < now) {
      memoryCache.delete(key);
    }
  }
}, 60000);

// Cache utilities with Redis and in-memory fallback
export const cache = {
  /**
   * Set cache value with TTL
   */
  async set(key: string, value: any, ttl: number = 3600) {
    try {
      if (redisAvailable) {
        const serialized = JSON.stringify(value);
        await redis.setex(key, ttl, serialized);
      } else {
        // Fallback to in-memory cache
        memoryCache.set(key, {
          value,
          expiresAt: Date.now() + (ttl * 1000),
        });
      }
    } catch (error) {
      // Use in-memory fallback
      memoryCache.set(key, {
        value,
        expiresAt: Date.now() + (ttl * 1000),
      });
    }
  },

  /**
   * Get cache value
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (redisAvailable) {
        const value = await redis.get(key);
        if (!value) return null;
        return JSON.parse(value) as T;
      } else {
        // Use in-memory fallback
        const entry = memoryCache.get(key);
        if (!entry || entry.expiresAt < Date.now()) {
          memoryCache.delete(key);
          return null;
        }
        return entry.value as T;
      }
    } catch (error) {
      // Try in-memory fallback
      const entry = memoryCache.get(key);
      if (!entry || entry.expiresAt < Date.now()) {
        memoryCache.delete(key);
        return null;
      }
      return entry.value as T;
    }
  },

  /**
   * Delete cache key
   */
  async delete(key: string) {
    try {
      if (redisAvailable) {
        await redis.del(key);
      }
    } catch (error) {
      // Ignore errors
    }
    memoryCache.delete(key);
  },

  /**
   * Delete multiple keys by pattern
   */
  async deletePattern(pattern: string) {
    try {
      if (redisAvailable) {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      }
    } catch (error) {
      // Ignore errors
    }
    // Clean up in-memory cache (simple pattern match)
    for (const key of memoryCache.keys()) {
      if (key.includes(pattern.replace('*', ''))) {
        memoryCache.delete(key);
      }
    }
  },
};

// Sandbox tracking utilities (for E2B)
export const sandboxTracker = {
  /**
   * Track active sandbox for a project
   */
  async trackSandbox(projectId: string, sandboxId: string, ttl: number = 3600) {
    await redis.setex(`sandbox:${projectId}`, ttl, sandboxId);
  },

  /**
   * Get sandbox ID for project
   */
  async getSandbox(projectId: string): Promise<string | null> {
    return await redis.get(`sandbox:${projectId}`);
  },

  /**
   * Remove sandbox tracking
   */
  async removeSandbox(projectId: string) {
    await redis.del(`sandbox:${projectId}`);
  },

  /**
   * Track sandbox usage
   */
  async incrementSandboxUsage(sandboxId: string) {
    await redis.incr(`sandbox:usage:${sandboxId}`);
  },
};

export default redis;
