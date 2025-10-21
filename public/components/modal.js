/**
 * Modal Dialog Component
 * Accessible, animated modal dialogs
 */

import { fadeIn, fadeOut } from '../core/utils.js';

class ModalManager {
  constructor() {
    this.modals = new Map();
    this.activeModal = null;
    this.setupKeyboardListeners();
  }

  /**
   * Create and show a modal
   */
  show(options = {}) {
    const {
      title = '',
      content = '',
      size = 'md', // sm, md, lg, xl
      showClose = true,
      closeOnBackdrop = true,
      closeOnEscape = true,
      footer = null,
      onClose = null
    } = options;

    const id = `modal-${Date.now()}`;

    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.dataset.modalId = id;

    // Create modal
    const modal = document.createElement('div');
    modal.className = `modal modal-${size}`;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    if (title) modal.setAttribute('aria-labelledby', `${id}-title`);

    // Build modal HTML
    modal.innerHTML = `
      <div class="modal-header">
        <h2 id="${id}-title" class="modal-title">${title}</h2>
        ${showClose ? `
          <button class="modal-close" aria-label="Close modal">
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
            </svg>
          </button>
        ` : ''}
      </div>
      <div class="modal-body">
        ${typeof content === 'string' ? content : ''}
      </div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    `;

    // Append to backdrop
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    // If content is an element, append it
    if (content instanceof HTMLElement) {
      const body = modal.querySelector('.modal-body');
      body.innerHTML = '';
      body.appendChild(content);
    }

    // Setup close handlers
    const closeModal = () => this.close(id);

    if (showClose) {
      const closeBtn = modal.querySelector('.modal-close');
      closeBtn?.addEventListener('click', closeModal);
    }

    if (closeOnBackdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal();
      });
    }

    // Store modal info
    this.modals.set(id, {
      backdrop,
      modal,
      options,
      onClose,
      closeOnEscape
    });

    // Set as active
    this.activeModal = id;

    // Animate in
    fadeIn(backdrop, 200);
    setTimeout(() => modal.classList.add('animate-scaleIn'), 50);

    // Focus first focusable element
    this.focusFirstElement(modal);

    return {
      id,
      element: modal,
      close: () => this.close(id),
      update: (newContent) => this.update(id, newContent)
    };
  }

  /**
   * Close a modal
   */
  async close(id) {
    const modalInfo = this.modals.get(id);
    if (!modalInfo) return;

    const { backdrop, modal, onClose } = modalInfo;

    // Call onClose callback
    if (onClose) {
      const shouldClose = await onClose();
      if (shouldClose === false) return;
    }

    // Animate out
    modal.classList.remove('animate-scaleIn');
    modal.classList.add('animate-scaleOut');

    await fadeOut(backdrop, 150);

    // Remove from DOM
    backdrop.remove();

    // Remove from map
    this.modals.delete(id);

    // Update active modal
    if (this.activeModal === id) {
      this.activeModal = null;
    }
  }

  /**
   * Close all modals
   */
  closeAll() {
    this.modals.forEach((_, id) => this.close(id));
  }

  /**
   * Update modal content
   */
  update(id, content) {
    const modalInfo = this.modals.get(id);
    if (!modalInfo) return;

    const body = modalInfo.modal.querySelector('.modal-body');
    if (typeof content === 'string') {
      body.innerHTML = content;
    } else if (content instanceof HTMLElement) {
      body.innerHTML = '';
      body.appendChild(content);
    }
  }

  /**
   * Confirm dialog
   */
  confirm(options = {}) {
    const {
      title = 'Confirm',
      message = 'Are you sure?',
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      confirmType = 'primary', // primary, danger
      onConfirm = null,
      onCancel = null
    } = options;

    return new Promise((resolve) => {
      const content = `<p class="text-secondary">${message}</p>`;
      const footer = `
        <button class="btn btn-secondary" data-action="cancel">${cancelText}</button>
        <button class="btn btn-${confirmType}" data-action="confirm">${confirmText}</button>
      `;

      const modal = this.show({
        title,
        content,
        footer,
        size: 'sm',
        closeOnBackdrop: false,
        closeOnEscape: true,
        onClose: () => {
          if (onCancel) onCancel();
          resolve(false);
        }
      });

      // Setup button handlers
      const confirmBtn = modal.element.querySelector('[data-action="confirm"]');
      const cancelBtn = modal.element.querySelector('[data-action="cancel"]');

      confirmBtn?.addEventListener('click', () => {
        if (onConfirm) onConfirm();
        resolve(true);
        this.close(modal.id);
      });

      cancelBtn?.addEventListener('click', () => {
        if (onCancel) onCancel();
        resolve(false);
        this.close(modal.id);
      });
    });
  }

  /**
   * Alert dialog
   */
  alert(options = {}) {
    const {
      title = 'Alert',
      message = '',
      okText = 'OK',
      type = 'info' // info, success, warning, error
    } = options;

    return new Promise((resolve) => {
      const icons = {
        info: '💡',
        success: '✅',
        warning: '⚠️',
        error: '❌'
      };

      const content = `
        <div class="text-center">
          <div class="text-4xl mb-4">${icons[type] || icons.info}</div>
          <p class="text-secondary">${message}</p>
        </div>
      `;

      const footer = `
        <button class="btn btn-primary" data-action="ok">${okText}</button>
      `;

      const modal = this.show({
        title,
        content,
        footer,
        size: 'sm',
        closeOnBackdrop: false,
        onClose: () => resolve()
      });

      const okBtn = modal.element.querySelector('[data-action="ok"]');
      okBtn?.addEventListener('click', () => {
        resolve();
        this.close(modal.id);
      });
    });
  }

  /**
   * Setup keyboard listeners for modals
   */
  setupKeyboardListeners() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.activeModal) {
        const modalInfo = this.modals.get(this.activeModal);
        if (modalInfo?.closeOnEscape) {
          this.close(this.activeModal);
        }
      }

      // Trap focus in modal
      if (e.key === 'Tab' && this.activeModal) {
        const modalInfo = this.modals.get(this.activeModal);
        if (modalInfo) {
          this.trapFocus(e, modalInfo.modal);
        }
      }
    });
  }

  /**
   * Trap focus within modal
   */
  trapFocus(event, modal) {
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  /**
   * Focus first focusable element in modal
   */
  focusFirstElement(modal) {
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length > 0) {
      setTimeout(() => focusableElements[0].focus(), 100);
    }
  }
}

// Create singleton
const modalManager = new ModalManager();

// Export convenience functions
export const showModal = (options) => modalManager.show(options);
export const closeModal = (id) => modalManager.close(id);
export const confirmModal = (options) => modalManager.confirm(options);
export const alertModal = (options) => modalManager.alert(options);

export default modalManager;
