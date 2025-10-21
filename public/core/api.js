/**
 * Unified API Client
 * Centralized fetch wrapper with auth, error handling, and caching
 */

class APIClient {
  constructor() {
    this.baseURL = '/api';
    this.cache = new Map();
    this.defaultCacheTTL = 60000; // 1 minute
  }

  /**
   * Get auth token from localStorage
   */
  getToken() {
    return localStorage.getItem('github_session') || localStorage.getItem('accessToken');
  }

  /**
   * Main request method
   */
  async request(endpoint, options = {}) {
    const token = this.getToken();
    const url = `${this.baseURL}${endpoint}`;

    // Build headers
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Check cache for GET requests
    if (options.method === 'GET' || !options.method) {
      const cached = this.getFromCache(url);
      if (cached && !options.skipCache) {
        return cached;
      }
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle unauthorized
      if (response.status === 401) {
        this.handleUnauthorized();
        throw new APIError('Unauthorized', 401);
      }

      // Handle errors
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new APIError(error.error || error.message || 'Request failed', response.status, error);
      }

      const data = await response.json();

      // Cache GET requests
      if (options.method === 'GET' || !options.method) {
        this.setCache(url, data, options.cacheTTL);
      }

      return data;

    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(error.message || 'Network error', 0, error);
    }
  }

  /**
   * GET request
   */
  async get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * PATCH request
   */
  async patch(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * DELETE request
   */
  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * Cache management
   */
  setCache(key, value, ttl = this.defaultCacheTTL) {
    const expiresAt = Date.now() + ttl;
    this.cache.set(key, { value, expiresAt });
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached.value;
  }

  clearCache(pattern = null) {
    if (pattern) {
      // Clear cache entries matching pattern
      for (const [key] of this.cache) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /**
   * Handle unauthorized (logout)
   */
  handleUnauthorized() {
    localStorage.removeItem('github_session');
    localStorage.removeItem('github_username');
    localStorage.removeItem('accessToken');

    // Redirect to login if not already there
    if (!window.location.pathname.includes('index.html') && window.location.pathname !== '/') {
      window.location.href = '/';
    }
  }

  /**
   * Server-Sent Events helper
   */
  createEventSource(endpoint, handlers = {}) {
    const token = this.getToken();
    const url = `${this.baseURL}${endpoint}${endpoint.includes('?') ? '&' : '?'}token=${token}`;

    const eventSource = new EventSource(url);

    // Register handlers
    Object.entries(handlers).forEach(([event, handler]) => {
      eventSource.addEventListener(event, (e) => {
        try {
          const data = JSON.parse(e.data);
          handler(data);
        } catch (error) {
          console.error(`Error parsing SSE data for ${event}:`, error);
        }
      });
    });

    // Handle errors
    eventSource.onerror = (error) => {
      console.error('EventSource error:', error);
      handlers.error?.(error);
      eventSource.close();
    };

    return eventSource;
  }

  /**
   * Upload file helper
   */
  async uploadFile(endpoint, file, options = {}) {
    const token = this.getToken();
    const url = `${this.baseURL}${endpoint}`;

    const formData = new FormData();
    formData.append('file', file);

    // Add additional fields
    if (options.fields) {
      Object.entries(options.fields).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new APIError(error.error || 'Upload failed', response.status);
    }

    return response.json();
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const response = await fetch('/api/health');
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Custom API Error class
 */
class APIError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.details = details;
  }

  isUnauthorized() {
    return this.status === 401;
  }

  isForbidden() {
    return this.status === 403;
  }

  isNotFound() {
    return this.status === 404;
  }

  isServerError() {
    return this.status >= 500;
  }
}

// Export singleton instance
export const api = new APIClient();
export { APIError };
