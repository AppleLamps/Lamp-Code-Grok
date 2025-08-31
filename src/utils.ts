// Utility functions used across the LampCode IDE application

// DOM utility functions
export const el = (tag: string, cls?: string, text?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

// Token estimation (rough heuristic: ~4 characters per token)
export const estimateTokens = (text: string | undefined | null): number => {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
};

// Simple XOR encryption for localStorage (better than plain text, not production-secure)
const ENCRYPTION_KEY = 'LampCodeStorageKey2024';

export const encrypt = (text: string): string => {
  return btoa(text.split('').map((char, i) => 
    String.fromCharCode(char.charCodeAt(0) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length))
  ).join(''));
};

export const decrypt = (encrypted: string): string => {
  try {
    return atob(encrypted).split('').map((char, i) => 
      String.fromCharCode(char.charCodeAt(0) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length))
    ).join('');
  } catch {
    return '';
  }
};

// File icon utility
export const iconForFile = (name: string, isDir: boolean): string => {
  if (isDir) return '<i class="fa-solid fa-folder"></i>';
  const lower = name.toLowerCase();
  if (lower.endsWith('.html')) return '<i class="fa-brands fa-html5"></i>';
  if (lower.endsWith('.css')) return '<i class="fa-brands fa-css3-alt"></i>';
  if (lower.endsWith('.js')) return '<i class="fa-brands fa-js"></i>';
  if (lower.endsWith('.ts')) return '<i class="fa-brands fa-js"></i>';
  if (lower.endsWith('.json')) return '<i class="fa-solid fa-file-code"></i>';
  if (lower.endsWith('.md')) return '<i class="fa-brands fa-markdown"></i>';
  return '<i class="fa-solid fa-file"></i>';
};

// Text truncation utility
export const truncateToTokens = (text: string, maxTokens: number): { 
  text: string; 
  tokens: number; 
  truncated: boolean; 
} => {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return { text, tokens: estimateTokens(text), truncated: false };
  const truncated = text.slice(0, maxChars);
  return { text: truncated, tokens: estimateTokens(truncated), truncated: true };
};

// Focus trap helper for modals
export const trapFocus = (element: HTMLElement): (() => void) => {
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  ) as NodeListOf<HTMLElement>;
  
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  const handleTabKey = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    }
  };

  element.addEventListener('keydown', handleTabKey);
  firstFocusable?.focus();
  
  return () => element.removeEventListener('keydown', handleTabKey);
};

// Event tracking utility
const eventLog: Array<{ id: string; ts: number; type: string; [key: string]: unknown }> = [];

export const track = (type: string, details: Record<string, unknown> = {}): { 
  id: string; 
  ts: number; 
  type: string; 
  [key: string]: unknown; 
} => {
  const entry = { 
    id: (crypto as any).randomUUID?.() || String(Date.now()), 
    ts: Date.now(), 
    type, 
    ...details 
  };
  eventLog.push(entry);
  (window as any).__explorerEventLog = eventLog;
  return entry;
};
