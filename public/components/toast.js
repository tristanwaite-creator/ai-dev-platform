/**
 * Toast Notification System
 * FANG-level polished notifications
 */

class ToastManager {
  constructor() {
    this.container = null;
    this.toasts = new Map();
    this.init();
  }

  init() {
    // Create container if it doesn't exist
    if (!document.getElementById('toastContainer')) {
      this.container = document.createElement('div');
      this.container.id = 'toastContainer';
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    } else {
      this.container = document.getElementById('toastContainer');
    }
  }

  /**
   * Show a toast notification
   */
  show(message, type = 'info', options = {}) {
    const {
      duration = 5000,
      title = null,
      action = null,
      closable = true
    } = options;

    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type} animate-slideInRight`;
    toast.id = id;

    // Icon based on type
    const icons = {
      success: `<svg class="toast-icon" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
      </svg>`,
      error: `<svg class="toast-icon" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
      </svg>`,
      warning: `<svg class="toast-icon" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>`,
      info: `<svg class="toast-icon" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
      </svg>`
    };

    toast.innerHTML = `
      ${icons[type] || icons.info}
      <div class="toast-content">
        ${title ? `<div class="toast-title">${title}</div>` : ''}
        <div class="toast-message">${message}</div>
      </div>
      ${action ? `<button class="btn btn-sm btn-ghost toast-action">${action.text}</button>` : ''}
      ${closable ? `
        <button class="toast-close" aria-label="Close">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
          </svg>
        </button>
      ` : ''}
    `;

    // Add to container
    this.container.appendChild(toast);

    // Store reference
    this.toasts.set(id, {
      element: toast,
      type,
      message,
      timeout: null
    });

    // Setup close button
    if (closable) {
      const closeBtn = toast.querySelector('.toast-close');
      closeBtn.addEventListener('click', () => this.remove(id));
    }

    // Setup action button
    if (action?.onClick) {
      const actionBtn = toast.querySelector('.toast-action');
      actionBtn.addEventListener('click', () => {
        action.onClick();
        this.remove(id);
      });
    }

    // Auto remove after duration
    if (duration > 0) {
      const timeout = setTimeout(() => this.remove(id), duration);
      this.toasts.get(id).timeout = timeout;
    }

    return id;
  }

  /**
   * Remove a toast
   */
  remove(id) {
    const toast = this.toasts.get(id);
    if (!toast) return;

    // Clear timeout
    if (toast.timeout) {
      clearTimeout(toast.timeout);
    }

    // Animate out
    toast.element.classList.add('removing');

    setTimeout(() => {
      if (toast.element.parentNode) {
        toast.element.parentNode.removeChild(toast.element);
      }
      this.toasts.delete(id);
    }, 200); // Match animation duration
  }

  /**
   * Remove all toasts
   */
  removeAll() {
    this.toasts.forEach((_, id) => this.remove(id));
  }

  /**
   * Convenience methods
   */
  success(message, options = {}) {
    return this.show(message, 'success', options);
  }

  error(message, options = {}) {
    return this.show(message, 'error', { duration: 7000, ...options });
  }

  warning(message, options = {}) {
    return this.show(message, 'warning', options);
  }

  info(message, options = {}) {
    return this.show(message, 'info', options);
  }

  /**
   * Show promise toast (loading, success, error)
   */
  async promise(promise, messages = {}) {
    const {
      loading = 'Loading...',
      success = 'Success!',
      error = 'Error occurred'
    } = messages;

    const loadingId = this.info(loading, { duration: 0, closable: false });

    try {
      const result = await promise;
      this.remove(loadingId);
      this.success(typeof success === 'function' ? success(result) : success);
      return result;
    } catch (err) {
      this.remove(loadingId);
      this.error(typeof error === 'function' ? error(err) : error);
      throw err;
    }
  }
}

// Create singleton instance
const toastManager = new ToastManager();

// Export convenience functions
export const showToast = (message, type, options) => toastManager.show(message, type, options);
export const toast = {
  show: (message, type, options) => toastManager.show(message, type, options),
  success: (message, options) => toastManager.success(message, options),
  error: (message, options) => toastManager.error(message, options),
  warning: (message, options) => toastManager.warning(message, options),
  info: (message, options) => toastManager.info(message, options),
  promise: (promise, messages) => toastManager.promise(promise, messages),
  remove: (id) => toastManager.remove(id),
  removeAll: () => toastManager.removeAll()
};

export default toast;
