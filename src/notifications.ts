// In-app notification system - replaces browser alerts, confirms, and prompts
import { logger } from './utils.js';

export interface NotificationOptions {
  title?: string;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  duration?: number; // milliseconds, 0 for persistent
  actions?: NotificationAction[];
}

export interface NotificationAction {
  label: string;
  action: () => void;
  primary?: boolean;
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'warning' | 'danger' | 'info';
}

export interface PromptOptions {
  title?: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  validator?: (value: string) => string | null; // returns error message or null if valid
  confirmText?: string;
  cancelText?: string;
}

export class NotificationManager {
  private container: HTMLElement;
  private nextId = 1;

  constructor() {
    this.container = this.createContainer();
    this.setupGlobalStyles();
  }

  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'notification-container';
    document.body.appendChild(container);
    return container;
  }

  private setupGlobalStyles(): void {
    // Add styles if they don't exist
    if (!document.getElementById('notification-styles')) {
      const style = document.createElement('style');
      style.id = 'notification-styles';
      style.textContent = `
        .notification-container {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 10000;
          pointer-events: none;
          max-width: 400px;
        }

        .toast-notification {
          background: var(--bg-elevated);
          border: 1px solid var(--border-light);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          margin-bottom: var(--space-3);
          padding: var(--space-4);
          pointer-events: auto;
          animation: slideInRight 0.3s ease-out;
          position: relative;
          overflow: hidden;
        }

        .toast-notification.removing {
          animation: slideOutRight 0.3s ease-in;
        }

        .toast-notification.success {
          border-left: 4px solid var(--success);
        }

        .toast-notification.error {
          border-left: 4px solid var(--error);
        }

        .toast-notification.warning {
          border-left: 4px solid var(--warning);
        }

        .toast-notification.info {
          border-left: 4px solid var(--accent-primary);
        }

        .toast-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: var(--space-2);
        }

        .toast-title {
          font-weight: 600;
          font-size: 14px;
          color: var(--text-primary);
          margin: 0;
        }

        .toast-close {
          background: none;
          border: none;
          color: var(--text-tertiary);
          cursor: pointer;
          font-size: 16px;
          padding: 0;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-sm);
          transition: all var(--transition-fast);
        }

        .toast-close:hover {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .toast-message {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.4;
          margin: 0;
        }

        .toast-actions {
          display: flex;
          gap: var(--space-2);
          margin-top: var(--space-3);
          justify-content: flex-end;
        }

        .toast-action {
          padding: var(--space-2) var(--space-3);
          font-size: 12px;
          font-weight: 500;
          border: 1px solid var(--border-light);
          border-radius: var(--radius-md);
          background: var(--bg-elevated);
          color: var(--text-primary);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .toast-action:hover {
          background: var(--bg-secondary);
          border-color: var(--border-medium);
        }

        .toast-action.primary {
          background: var(--accent-primary);
          border-color: var(--accent-primary);
          color: white;
        }

        .toast-action.primary:hover {
          background: var(--accent-hover);
          border-color: var(--accent-hover);
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-4);
          animation: fadeIn 0.2s ease-out;
        }

        .modal-dialog {
          background: var(--bg-elevated);
          border-radius: var(--radius-xl);
          box-shadow: var(--shadow-lg);
          max-width: 500px;
          width: 100%;
          animation: scaleIn 0.2s ease-out;
        }

        .modal-dialog-header {
          padding: var(--space-6) var(--space-6) var(--space-4);
          border-bottom: 1px solid var(--border-light);
        }

        .modal-dialog-title {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .modal-dialog-body {
          padding: var(--space-4) var(--space-6);
        }

        .modal-dialog-message {
          font-size: 14px;
          color: var(--text-secondary);
          line-height: 1.5;
          margin: 0 0 var(--space-4);
        }

        .modal-dialog-input {
          width: 100%;
          padding: var(--space-3) var(--space-4);
          border: 1px solid var(--border-light);
          border-radius: var(--radius-lg);
          background: var(--bg-elevated);
          font-size: 14px;
          font-family: var(--font-family);
          transition: all var(--transition-fast);
          box-shadow: var(--shadow-sm);
        }

        .modal-dialog-input:focus {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px var(--accent-subtle);
          outline: none;
        }

        .modal-dialog-input.error {
          border-color: var(--error);
          background-color: var(--error-bg);
        }

        .modal-dialog-error {
          font-size: 12px;
          color: var(--error);
          margin-top: var(--space-2);
          display: flex;
          align-items: center;
          gap: var(--space-1);
        }

        .modal-dialog-error::before {
          content: "⚠";
          font-size: 14px;
        }

        .modal-dialog-footer {
          padding: var(--space-4) var(--space-6) var(--space-6);
          display: flex;
          gap: var(--space-3);
          justify-content: flex-end;
          border-top: 1px solid var(--border-light);
        }

        .modal-dialog-button {
          padding: var(--space-3) var(--space-5);
          font-size: 14px;
          font-weight: 500;
          border: 1px solid var(--border-light);
          border-radius: var(--radius-lg);
          background: var(--bg-elevated);
          color: var(--text-primary);
          cursor: pointer;
          transition: all var(--transition-fast);
          min-width: 80px;
        }

        .modal-dialog-button:hover {
          background: var(--bg-secondary);
          border-color: var(--border-medium);
        }

        .modal-dialog-button.primary {
          background: var(--accent-primary);
          border-color: var(--accent-primary);
          color: white;
        }

        .modal-dialog-button.primary:hover {
          background: var(--accent-hover);
          border-color: var(--accent-hover);
        }

        .modal-dialog-button.danger {
          background: var(--error);
          border-color: var(--error);
          color: white;
        }

        .modal-dialog-button.danger:hover {
          background: #b91c1c;
          border-color: #b91c1c;
        }

        .modal-dialog-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .modal-dialog-button:disabled:hover {
          background: var(--bg-elevated);
          border-color: var(--border-light);
        }

        .modal-dialog-button.primary:disabled:hover {
          background: var(--accent-primary);
          border-color: var(--accent-primary);
        }

        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes slideOutRight {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes scaleIn {
          from { 
            opacity: 0;
            transform: scale(0.9);
          }
          to { 
            opacity: 1;
            transform: scale(1);
          }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // Toast Notifications
  toast(options: NotificationOptions): void {
    const id = this.nextId++;
    const toast = this.createToastElement(id, options);
    this.container.appendChild(toast);

    // Auto-dismiss after specified duration (default 5000ms)
    const duration = options.duration !== undefined ? options.duration : 5000;
    if (duration > 0) {
      setTimeout(() => {
        this.removeToast(id);
      }, duration);
    }

    logger.debug('Toast notification shown', { id, type: options.type, message: options.message });
  }

  private createToastElement(id: number, options: NotificationOptions): HTMLElement {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${options.type || 'info'}`;
    toast.dataset.id = id.toString();

    const header = document.createElement('div');
    header.className = 'toast-header';

    if (options.title) {
      const title = document.createElement('h4');
      title.className = 'toast-title';
      title.textContent = options.title;
      header.appendChild(title);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '×';
    closeBtn.onclick = () => this.removeToast(id);
    header.appendChild(closeBtn);

    const message = document.createElement('p');
    message.className = 'toast-message';
    message.textContent = options.message;

    toast.appendChild(header);
    toast.appendChild(message);

    if (options.actions && options.actions.length > 0) {
      const actionsContainer = document.createElement('div');
      actionsContainer.className = 'toast-actions';

      options.actions.forEach(action => {
        const button = document.createElement('button');
        button.className = `toast-action ${action.primary ? 'primary' : ''}`;
        button.textContent = action.label;
        button.onclick = () => {
          action.action();
          this.removeToast(id);
        };
        actionsContainer.appendChild(button);
      });

      toast.appendChild(actionsContainer);
    }

    return toast;
  }

  private removeToast(id: number): void {
    const toast = this.container.querySelector(`[data-id="${id}"]`);
    if (toast) {
      toast.classList.add('removing');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }
  }

  // Success notification shortcut
  success(message: string, title?: string, duration?: number): void {
    this.toast({
      type: 'success',
      title: title || 'Success',
      message,
      duration
    });
  }

  // Error notification shortcut
  error(message: string, title?: string, duration?: number): void {
    this.toast({
      type: 'error',
      title: title || 'Error',
      message,
      duration: duration || 0 // Errors persist by default
    });
  }

  // Warning notification shortcut
  warning(message: string, title?: string, duration?: number): void {
    this.toast({
      type: 'warning',
      title: title || 'Warning',
      message,
      duration
    });
  }

  // Info notification shortcut
  info(message: string, title?: string, duration?: number): void {
    this.toast({
      type: 'info',
      title: title || 'Info',
      message,
      duration
    });
  }

  // Confirmation Dialog
  async confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = this.createModalOverlay();
      const dialog = this.createConfirmDialog(options, (result) => {
        document.body.removeChild(overlay);
        resolve(result);
      });

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // Focus the cancel button by default for safety
      const cancelBtn = dialog.querySelector('.modal-dialog-button:not(.primary)') as HTMLButtonElement;
      cancelBtn?.focus();

      // Close on overlay click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          document.body.removeChild(overlay);
          resolve(false);
        }
      });

      // Close on escape key
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', handleEscape);
          document.body.removeChild(overlay);
          resolve(false);
        }
      };
      document.addEventListener('keydown', handleEscape);
    });
  }

  private createModalOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    return overlay;
  }

  private createConfirmDialog(options: ConfirmOptions, callback: (result: boolean) => void): HTMLElement {
    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';

    if (options.title) {
      const header = document.createElement('div');
      header.className = 'modal-dialog-header';
      const title = document.createElement('h3');
      title.className = 'modal-dialog-title';
      title.textContent = options.title;
      header.appendChild(title);
      dialog.appendChild(header);
    }

    const body = document.createElement('div');
    body.className = 'modal-dialog-body';
    const message = document.createElement('p');
    message.className = 'modal-dialog-message';
    message.textContent = options.message;
    body.appendChild(message);
    dialog.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'modal-dialog-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-dialog-button';
    cancelBtn.textContent = options.cancelText || 'Cancel';
    cancelBtn.onclick = () => callback(false);

    const confirmBtn = document.createElement('button');
    confirmBtn.className = `modal-dialog-button primary ${options.type === 'danger' ? 'danger' : ''}`;
    confirmBtn.textContent = options.confirmText || 'Confirm';
    confirmBtn.onclick = () => callback(true);

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    dialog.appendChild(footer);

    return dialog;
  }

  // Input Prompt Dialog
  async prompt(options: PromptOptions): Promise<string | null> {
    return new Promise((resolve) => {
      const overlay = this.createModalOverlay();
      const dialog = this.createPromptDialog(options, (result) => {
        document.body.removeChild(overlay);
        resolve(result);
      });

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // Focus the input
      const input = dialog.querySelector('.modal-dialog-input') as HTMLInputElement;
      input?.focus();
      input?.select();

      // Close on overlay click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          document.body.removeChild(overlay);
          resolve(null);
        }
      });

      // Close on escape key
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', handleEscape);
          document.body.removeChild(overlay);
          resolve(null);
        }
      };
      document.addEventListener('keydown', handleEscape);
    });
  }

  private createPromptDialog(options: PromptOptions, callback: (result: string | null) => void): HTMLElement {
    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';

    if (options.title) {
      const header = document.createElement('div');
      header.className = 'modal-dialog-header';
      const title = document.createElement('h3');
      title.className = 'modal-dialog-title';
      title.textContent = options.title;
      header.appendChild(title);
      dialog.appendChild(header);
    }

    const body = document.createElement('div');
    body.className = 'modal-dialog-body';

    const message = document.createElement('p');
    message.className = 'modal-dialog-message';
    message.textContent = options.message;
    body.appendChild(message);

    const input = document.createElement('input');
    input.className = 'modal-dialog-input';
    input.type = 'text';
    input.placeholder = options.placeholder || '';
    input.value = options.defaultValue || '';
    body.appendChild(input);

    const errorDiv = document.createElement('div');
    errorDiv.className = 'modal-dialog-error';
    errorDiv.style.display = 'none';
    body.appendChild(errorDiv);

    dialog.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'modal-dialog-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-dialog-button';
    cancelBtn.textContent = options.cancelText || 'Cancel';
    cancelBtn.onclick = () => callback(null);

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'modal-dialog-button primary';
    confirmBtn.textContent = options.confirmText || 'OK';

    const validateAndSubmit = () => {
      const value = input.value.trim();
      
      if (options.validator) {
        const error = options.validator(value);
        if (error) {
          errorDiv.textContent = error;
          errorDiv.style.display = 'flex';
          input.classList.add('error');
          input.focus();
          return;
        }
      }

      callback(value);
    };

    confirmBtn.onclick = validateAndSubmit;

    // Handle Enter key in input
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        validateAndSubmit();
      }
    });

    // Clear error on input change
    input.addEventListener('input', () => {
      errorDiv.style.display = 'none';
      input.classList.remove('error');
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    dialog.appendChild(footer);

    return dialog;
  }
}

// Create a global instance
export const notifications = new NotificationManager();
