/**
 * Global State Manager
 * Lightweight reactive state management
 */

class StateManager {
  constructor(initialState = {}) {
    this.state = initialState;
    this.listeners = new Set();
    this.history = [];
    this.maxHistory = 10;
  }

  /**
   * Get current state
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Get specific state value
   */
  get(key) {
    return this.state[key];
  }

  /**
   * Set state (merge with existing)
   */
  setState(updates) {
    // Save to history
    this.history.push({ ...this.state });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Update state
    const prevState = { ...this.state };
    this.state = { ...this.state, ...updates };

    // Notify listeners
    this.notify(updates, prevState);
  }

  /**
   * Replace entire state
   */
  replaceState(newState) {
    this.history.push({ ...this.state });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const prevState = { ...this.state };
    this.state = newState;

    this.notify(newState, prevState);
  }

  /**
   * Reset state to initial or provided state
   */
  reset(initialState = {}) {
    this.replaceState(initialState);
    this.history = [];
  }

  /**
   * Undo last state change
   */
  undo() {
    if (this.history.length === 0) return false;

    const prevState = this.history.pop();
    this.state = prevState;
    this.notify(this.state, null);

    return true;
  }

  /**
   * Subscribe to state changes
   * Returns unsubscribe function
   */
  subscribe(listener, keys = null) {
    const wrappedListener = (updates, prevState) => {
      if (keys) {
        // Only notify if specified keys changed
        const hasChanges = keys.some(key => updates[key] !== undefined);
        if (hasChanges) {
          listener(this.state, updates, prevState);
        }
      } else {
        listener(this.state, updates, prevState);
      }
    };

    this.listeners.add(wrappedListener);

    // Return unsubscribe function
    return () => this.listeners.delete(wrappedListener);
  }

  /**
   * Notify all listeners
   */
  notify(updates, prevState) {
    this.listeners.forEach(listener => {
      try {
        listener(updates, prevState);
      } catch (error) {
        console.error('State listener error:', error);
      }
    });
  }

  /**
   * Compute derived state
   */
  computed(fn) {
    return fn(this.state);
  }

  /**
   * Persist state to localStorage
   */
  persist(key = 'app-state', keys = null) {
    const stateToPersist = keys
      ? keys.reduce((acc, k) => ({ ...acc, [k]: this.state[k] }), {})
      : this.state;

    localStorage.setItem(key, JSON.stringify(stateToPersist));
  }

  /**
   * Restore state from localStorage
   */
  restore(key = 'app-state') {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.setState(parsed);
        return true;
      }
    } catch (error) {
      console.error('Error restoring state:', error);
    }
    return false;
  }

  /**
   * Clear persisted state
   */
  clearPersisted(key = 'app-state') {
    localStorage.removeItem(key);
  }

  /**
   * Debug helper
   */
  debug() {
    console.log('Current State:', this.state);
    console.log('History:', this.history);
    console.log('Listeners:', this.listeners.size);
  }
}

// Create global store with initial state
const store = new StateManager({
  // User
  user: null,
  isAuthenticated: false,

  // Current project
  project: null,
  projectId: null,

  // Views
  activeTab: 'research',

  // Research data
  researchSessions: [],
  activeSession: null,

  // Kanban data
  board: {
    research: [],
    building: [],
    testing: [],
    done: []
  },

  // UI state
  isLoading: false,
  sidebarOpen: true,
  theme: 'light',

  // Stats
  stats: {
    researchSessions: 0,
    tasks: 0,
    generations: 0
  }
});

// Auto-persist certain keys
store.subscribe((state, updates) => {
  const keysToPersist = ['theme', 'sidebarOpen'];
  const shouldPersist = keysToPersist.some(key => updates[key] !== undefined);

  if (shouldPersist) {
    store.persist('ui-state', keysToPersist);
  }
});

// Restore UI state on init
store.restore('ui-state');

// Export singleton
export { store };
export default store;
