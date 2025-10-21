/**
 * Tab Navigation Component
 * Manages tab switching with smooth transitions and lazy loading
 */

import { fadeIn, fadeOut } from '../core/utils.js';

export class TabManager {
  constructor(containerSelector) {
    this.container = typeof containerSelector === 'string'
      ? document.querySelector(containerSelector)
      : containerSelector;

    if (!this.container) {
      throw new Error('Tab container not found');
    }

    this.tabs = new Map();
    this.currentTab = null;
    this.currentView = null;
    this.isTransitioning = false;
  }

  /**
   * Register a tab with lazy loading
   */
  registerTab(name, loadFn) {
    this.tabs.set(name, {
      loadFn,
      instance: null,
      loaded: false
    });
  }

  /**
   * Register multiple tabs at once
   */
  registerAll(tabs) {
    Object.entries(tabs).forEach(([name, loadFn]) => {
      this.registerTab(name, loadFn);
    });
  }

  /**
   * Switch to a tab
   */
  async switchTo(tabName) {
    console.log(`TabManager: Switching to tab "${tabName}"`);

    // Prevent concurrent transitions
    if (this.isTransitioning) {
      console.warn('Tab transition already in progress');
      return false;
    }

    // Already on this tab
    if (this.currentTab === tabName) {
      console.log(`TabManager: Already on tab "${tabName}"`);
      return false;
    }

    // Check if tab exists
    const tab = this.tabs.get(tabName);
    if (!tab) {
      console.error(`Tab "${tabName}" not registered`);
      return false;
    }

    this.isTransitioning = true;

    try {
      console.log('TabManager: Clearing current content...');
      // Clear current content immediately (no fade out for initial load)
      if (this.container.firstChild) {
        if (this.currentTab !== null) {
          // Only fade out if switching between tabs (not initial load)
          await fadeOut(this.container.firstChild, 200);
        }
        this.container.innerHTML = '';
      }

      // Cleanup previous view
      if (this.currentView?.destroy) {
        console.log('TabManager: Destroying previous view...');
        await this.currentView.destroy();
      }

      // Lazy load module if not loaded
      if (!tab.loaded) {
        console.log(`TabManager: Loading module for "${tabName}"...`);
        const module = await tab.loadFn();
        tab.instance = module.default || module;
        tab.loaded = true;
        console.log(`TabManager: Module loaded for "${tabName}"`);
      }

      // Create view container
      console.log('TabManager: Creating view container...');
      const viewElement = document.createElement('div');
      viewElement.className = 'tab-view';
      viewElement.style.width = '100%';
      viewElement.style.height = '100%';

      // Start with opacity 0 for animation, but visible
      const isInitialLoad = this.currentTab === null;
      if (isInitialLoad) {
        // Skip animation on first load
        viewElement.style.opacity = '1';
      } else {
        viewElement.style.opacity = '0';
      }

      this.container.appendChild(viewElement);

      // Initialize view (pass container and any data)
      console.log(`TabManager: Initializing view for "${tabName}"...`);
      const ViewClass = tab.instance;
      this.currentView = new ViewClass(viewElement);

      // Render view
      if (this.currentView.render) {
        console.log(`TabManager: Rendering view for "${tabName}"...`);
        await this.currentView.render();
      }

      // Fade in new content (only if not initial load)
      if (!isInitialLoad) {
        console.log('TabManager: Fading in new content...');
        await fadeIn(viewElement, 300);
      } else {
        console.log('TabManager: Initial load, skipping fade animation');
      }

      // Update current tab
      this.currentTab = tabName;

      // Emit event
      this._onTabChange?.(tabName);

      console.log(`TabManager: Successfully switched to "${tabName}"`);
      return true;

    } catch (error) {
      console.error('Error switching tabs:', error, error.stack);
      return false;
    } finally {
      this.isTransitioning = false;
    }
  }

  /**
   * Refresh current tab
   */
  async refresh() {
    if (!this.currentTab) return;

    const tab = this.tabs.get(this.currentTab);
    if (!tab) return;

    // Mark as not loaded to force reload
    tab.loaded = false;
    tab.instance = null;

    // Switch to same tab (will reload)
    const prevTab = this.currentTab;
    this.currentTab = null;
    await this.switchTo(prevTab);
  }

  /**
   * Get current tab name
   */
  getCurrentTab() {
    return this.currentTab;
  }

  /**
   * Check if a tab is loaded
   */
  isLoaded(tabName) {
    const tab = this.tabs.get(tabName);
    return tab?.loaded || false;
  }

  /**
   * Preload a tab without showing it
   */
  async preload(tabName) {
    const tab = this.tabs.get(tabName);
    if (!tab || tab.loaded) return;

    try {
      const module = await tab.loadFn();
      tab.instance = module.default || module;
      tab.loaded = true;
    } catch (error) {
      console.error(`Error preloading tab "${tabName}":`, error);
    }
  }

  /**
   * Unload a tab (clear from memory)
   */
  unload(tabName) {
    const tab = this.tabs.get(tabName);
    if (!tab) return;

    // Cleanup if it's the current view
    if (this.currentTab === tabName && this.currentView?.destroy) {
      this.currentView.destroy();
      this.currentView = null;
      this.currentTab = null;
    }

    // Reset tab state
    tab.loaded = false;
    tab.instance = null;
  }

  /**
   * Destroy tab manager
   */
  destroy() {
    if (this.currentView?.destroy) {
      this.currentView.destroy();
    }
    this.tabs.clear();
    this.container.innerHTML = '';
    this.currentTab = null;
    this.currentView = null;
  }

  /**
   * Set tab change callback
   */
  setOnTabChange(callback) {
    this._onTabChange = callback;
  }
}

/**
 * Base View Class
 * All tab views should extend this
 */
export class BaseView {
  constructor(container) {
    this.container = container;
    this.listeners = [];
  }

  /**
   * Render the view (override in subclass)
   */
  async render() {
    throw new Error('render() must be implemented in subclass');
  }

  /**
   * Add event listener and track for cleanup
   */
  addEventListener(element, event, handler) {
    element.addEventListener(event, handler);
    this.listeners.push({ element, event, handler });
  }

  /**
   * Cleanup (called when switching tabs)
   */
  destroy() {
    // Remove all event listeners
    this.listeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.listeners = [];

    // Clear container
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  /**
   * Show loading state
   */
  showLoading() {
    this.container.innerHTML = `
      <div class="flex items-center justify-center p-16">
        <div class="spinner spinner-lg"></div>
      </div>
    `;
  }

  /**
   * Show error state
   */
  showError(message) {
    this.container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <h3 class="empty-state-title">Error</h3>
        <p class="empty-state-description">${message}</p>
      </div>
    `;
  }

  /**
   * Show empty state
   */
  showEmpty(title, description, action = null) {
    this.container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <h3 class="empty-state-title">${title}</h3>
        <p class="empty-state-description">${description}</p>
        ${action ? `<button class="btn btn-primary">${action.text}</button>` : ''}
      </div>
    `;

    if (action?.onClick) {
      const btn = this.container.querySelector('.btn');
      this.addEventListener(btn, 'click', action.onClick);
    }
  }
}

export default TabManager;
