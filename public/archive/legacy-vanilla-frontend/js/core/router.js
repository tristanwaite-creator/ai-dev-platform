/**
 * Hash-based Router
 * Simple client-side routing for tab navigation
 */

class Router {
  constructor() {
    this.routes = new Map();
    this.currentRoute = null;
    this.beforeNavigate = null;
    this.afterNavigate = null;

    // Listen for hash changes
    window.addEventListener('hashchange', () => this.handleRoute());
    window.addEventListener('load', () => this.handleRoute());
  }

  /**
   * Register a route
   */
  register(path, handler) {
    this.routes.set(path, handler);
  }

  /**
   * Register multiple routes
   */
  registerAll(routes) {
    Object.entries(routes).forEach(([path, handler]) => {
      this.register(path, handler);
    });
  }

  /**
   * Navigate to a route
   */
  navigate(path, state = {}) {
    // Call before navigate hook
    if (this.beforeNavigate) {
      const shouldContinue = this.beforeNavigate(path, this.currentRoute);
      if (shouldContinue === false) return;
    }

    // Update hash
    window.location.hash = path;

    // Store state
    if (Object.keys(state).length > 0) {
      history.replaceState(state, '', `#${path}`);
    }
  }

  /**
   * Go back
   */
  back() {
    window.history.back();
  }

  /**
   * Handle route change
   */
  async handleRoute() {
    const hash = window.location.hash.slice(1) || '';
    const [route, ...params] = hash.split('/');

    const handler = this.routes.get(route) || this.routes.get('*');

    if (handler) {
      try {
        await handler(params, this.getState());
        this.currentRoute = route;

        // Call after navigate hook
        if (this.afterNavigate) {
          this.afterNavigate(route, params);
        }
      } catch (error) {
        console.error('Route handler error:', error);
        this.handleError(error);
      }
    } else {
      console.warn(`No handler found for route: ${route}`);
      this.navigate('', {}); // Navigate to default route
    }
  }

  /**
   * Get current state from history
   */
  getState() {
    return history.state || {};
  }

  /**
   * Get current route
   */
  getCurrentRoute() {
    return window.location.hash.slice(1) || '';
  }

  /**
   * Get route params
   */
  getParams() {
    const hash = window.location.hash.slice(1) || '';
    const [, ...params] = hash.split('/');
    return params;
  }

  /**
   * Get query params from URL
   */
  getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const result = {};
    for (const [key, value] of params) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Set query params without reload
   */
  setQueryParams(params) {
    const url = new URL(window.location);
    Object.entries(params).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, value);
      }
    });
    window.history.replaceState({}, '', url);
  }

  /**
   * Set before navigate hook
   */
  setBeforeNavigate(fn) {
    this.beforeNavigate = fn;
  }

  /**
   * Set after navigate hook
   */
  setAfterNavigate(fn) {
    this.afterNavigate = fn;
  }

  /**
   * Handle routing errors
   */
  handleError(error) {
    console.error('Router error:', error);
    // Could navigate to error page or show error UI
  }

  /**
   * Check if current route matches
   */
  isActive(route) {
    return this.getCurrentRoute() === route;
  }
}

// Export singleton
export const router = new Router();
export default router;
