// Settings validation and management module
import { Settings, VALIDATION_RULES, ValidationResult } from './types.js';
import { loadSettings, saveSettings } from './storage.js';
import { trapFocus } from './utils.js';

export class SettingsManager {
  private settings: Settings;
  private focusTrap: (() => void) | null = null;

  constructor() {
    this.settings = loadSettings();
  }

  getSettings(): Settings {
    return { ...this.settings };
  }

  validateField(field: keyof typeof VALIDATION_RULES, value: string): ValidationResult {
    const rules = VALIDATION_RULES[field];
    
    if (rules.required && !value.trim()) {
      return { valid: false, message: `${field} is required` };
    }
    
    if (value.trim() && rules.pattern && !rules.pattern.test(value.trim())) {
      return { valid: false, message: rules.message };
    }
    
    if (value.trim() && rules.maxLength && value.trim().length > rules.maxLength) {
      return { valid: false, message: rules.message };
    }
    
    return { valid: true };
  }

  private showValidationError(fieldId: string, message: string): void {
    // Remove existing error
    const existingError = document.querySelector(`#${fieldId}-error`);
    if (existingError) existingError.remove();
    
    // Add new error
    const field = document.getElementById(fieldId);
    if (field) {
      field.classList.add('error');
      const errorDiv = document.createElement('div');
      errorDiv.id = `${fieldId}-error`;
      errorDiv.className = 'field-error';
      errorDiv.textContent = message;
      errorDiv.setAttribute('role', 'alert');
      field.parentNode?.appendChild(errorDiv);
    }
  }

  private clearValidationError(fieldId: string): void {
    const field = document.getElementById(fieldId);
    const error = document.querySelector(`#${fieldId}-error`);
    if (field) field.classList.remove('error');
    if (error) error.remove();
  }

  private validateAllSettings(): boolean {
    let isValid = true;
    
    // Clear all errors first
    ['openrouterKey', 'openrouterReferer', 'openrouterTitle'].forEach(id => 
      this.clearValidationError(id)
    );
    
    // Validate API key
    const keyInput = document.getElementById('openrouterKey') as HTMLInputElement;
    const keyValidation = this.validateField('apiKey', keyInput?.value || '');
    if (!keyValidation.valid) {
      this.showValidationError('openrouterKey', keyValidation.message!);
      isValid = false;
    }
    
    // Validate referer if provided
    const refererInput = document.getElementById('openrouterReferer') as HTMLInputElement;
    const refererValue = refererInput?.value || '';
    if (refererValue.trim()) {
      const refererValidation = this.validateField('referer', refererValue);
      if (!refererValidation.valid) {
        this.showValidationError('openrouterReferer', refererValidation.message!);
        isValid = false;
      }
    }
    
    // Validate title if provided
    const titleInput = document.getElementById('openrouterTitle') as HTMLInputElement;
    const titleValue = titleInput?.value || '';
    if (titleValue.trim()) {
      const titleValidation = this.validateField('title', titleValue);
      if (!titleValidation.valid) {
        this.showValidationError('openrouterTitle', titleValidation.message!);
        isValid = false;
      }
    }
    
    return isValid;
  }

  private showAlert(message: string, type: 'success' | 'error'): void {
    const existingAlert = document.querySelector('#settings-alert');
    if (existingAlert) existingAlert.remove();
    
    const alert = document.createElement('div');
    alert.id = 'settings-alert';
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    alert.setAttribute('role', 'alert');
    
    const settingsModal = document.getElementById('settingsModal');
    const settingsContent = settingsModal?.querySelector('.modal-content');
    if (settingsContent) {
      settingsContent.insertBefore(alert, settingsContent.firstChild?.nextSibling);
      if (type === 'success') {
        setTimeout(() => alert.remove(), 3000);
      }
    }
  }

  openSettingsModal(): void {
    const settingsModal = document.getElementById('settingsModal');
    const keyInput = document.getElementById('openrouterKey') as HTMLInputElement;
    const refererInput = document.getElementById('openrouterReferer') as HTMLInputElement;
    const titleInput = document.getElementById('openrouterTitle') as HTMLInputElement;

    // Populate form fields
    if (keyInput && this.settings.apiKey) keyInput.value = this.settings.apiKey;
    if (refererInput && this.settings.referer) refererInput.value = this.settings.referer;
    if (titleInput && this.settings.title) titleInput.value = this.settings.title;

    settingsModal?.removeAttribute('hidden');
    if (settingsModal) {
      this.focusTrap = trapFocus(settingsModal);
    }
  }

  closeSettingsModal(): void {
    const settingsModal = document.getElementById('settingsModal');
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    
    settingsModal?.setAttribute('hidden', '');
    if (this.focusTrap) {
      this.focusTrap();
      this.focusTrap = null;
    }
    openSettingsBtn?.focus();
  }

  saveSettingsFromForm(): boolean {
    if (!this.validateAllSettings()) {
      return false;
    }
    
    try {
      const keyInput = document.getElementById('openrouterKey') as HTMLInputElement;
      const refererInput = document.getElementById('openrouterReferer') as HTMLInputElement;
      const titleInput = document.getElementById('openrouterTitle') as HTMLInputElement;

      // Update settings object
      if (keyInput) this.settings.apiKey = keyInput.value.trim();
      if (refererInput) this.settings.referer = refererInput.value.trim();
      if (titleInput) this.settings.title = titleInput.value.trim();
      
      // Save to storage
      saveSettings(this.settings);
      
      // Show success feedback
      this.showAlert('Settings saved successfully!', 'success');
      return true;
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showAlert('Failed to save settings. Please try again.', 'error');
      return false;
    }
  }

  buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.settings.apiKey) headers['Authorization'] = `Bearer ${this.settings.apiKey}`;
    if (this.settings.referer) headers['HTTP-Referer'] = this.settings.referer;
    if (this.settings.title) headers['X-Title'] = this.settings.title;
    return headers;
  }

  getModel(): string {
    return this.settings.model || 'x-ai/grok-code-fast-1';
  }

  setupEventListeners(): void {
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const settingsModal = document.getElementById('settingsModal');

    openSettingsBtn?.addEventListener('click', () => this.openSettingsModal());
    closeSettingsBtn?.addEventListener('click', () => this.closeSettingsModal());
    settingsModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => this.closeSettingsModal());
    
    saveSettingsBtn?.addEventListener('click', () => {
      if (this.saveSettingsFromForm()) {
        setTimeout(() => this.closeSettingsModal(), 1000); // Give time to see success message
      }
    });

    // Security notice learn more link
    const securityLearnMoreLink = document.getElementById('securityLearnMoreLink');
    securityLearnMoreLink?.addEventListener('click', (e) => {
      e.preventDefault();
      alert('For production, implement a backend proxy that stores API keys securely and forwards requests to OpenRouter. This prevents exposing keys to client-side code.');
    });
  }
}
