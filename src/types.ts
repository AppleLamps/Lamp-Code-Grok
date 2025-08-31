// Shared type definitions across the LampCode IDE application

export interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  ts: number;
}

export interface Settings {
  apiKey?: string;
  referer?: string;
  title?: string;
  model?: string;
}

export interface WorkspaceFile {
  path: string;
  name: string;
  isDir: boolean;
  size: number;
  text?: string;
  selected?: boolean;
  estTokens?: number;
}

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  file?: WorkspaceFile;
  children: Map<string, TreeNode>;
  expanded: boolean;
  level: number;
}

export interface Workspace {
  name: string | null;
  files: WorkspaceFile[];
  byPath: Map<string, WorkspaceFile>;
  tree: TreeNode | null;
}

export interface ContextSettings {
  enabled: boolean;
  selectedPaths: string[];
  maxContextTokens: number;
  maxFiles: number;
  maxTokensPerFile: number;
  maxOutputTokens?: number;
}

export interface SerializedTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  expanded: boolean;
  level: number;
  children: SerializedTreeNode[];
}

export interface WorkspaceSession {
  name: string | null;
  files: WorkspaceFile[];
  tree: SerializedTreeNode | null;
  timestamp: number;
}

export interface VirtualScrollState {
  scrollTop: number;
  startIndex: number;
  endIndex: number;
  totalItems: number;
  flatNodes: TreeNode[];
  scrollTimer: ReturnType<typeof setTimeout> | null;
}

export interface ValidationRule {
  required?: boolean;
  pattern?: RegExp;
  message?: string;
  maxLength?: number;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export interface ContextMessage {
  role: 'user';
  content: string;
}

export interface ContextStats {
  selected: number;
  tokens: number;
  truncated: number;
}

export interface EventLogEntry {
  id: string;
  ts: number;
  type: string;
  [key: string]: unknown;
}

// Monaco Editor types
export interface MonacoEditor {
  dispose(): void;
  onDidChangeModelContent(listener: () => void): void;
  getValue(): string;
  setValue(value: string): void;
  getModel(): any;
  setModel(model: any): void;
  focus(): void;
  layout(): void;
}

export interface MonacoEnvironment {
  getWorker(workerId: string, label: string): Worker;
}

// Manager interface types for dependency injection
export interface SettingsManagerInterface {
  openSettingsModal(): void;
  closeSettingsModal(): void;
  getApiKey(): string;
  getModel(): string;
}

export interface ChatManagerInterface {
  clearHistory(): void;
  sendMessage(message: string): Promise<void>;
  renderInitialMessages(): void;
  setupEventListeners(): void;
}

export interface ExplorerManagerInterface {
  getWorkspace(): Workspace;
  setEditorManager(editorManager: any): void;
  loadWorkspaceSession(): boolean;
  renderTree(): void;
  setupEventListeners(): void;
  setupDebugHelpers(): void;
}

export interface ContextManagerInterface {
  openContextModal(): void;
  buildContextMessage(): ContextMessage;
  initializeSelection(): void;
  setupEventListeners(): void;
}

export interface UIManagerDependencies {
  settingsManager: SettingsManagerInterface;
  chatManager: ChatManagerInterface;
  explorerManager: ExplorerManagerInterface;
  contextManager: ContextManagerInterface;
}

// Debug configuration
export interface DebugConfig {
  enabled: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
}

// Event tracking with proper typing
export interface TrackingEvent {
  id: string;
  ts: number;
  type: string;
  details: Record<string, unknown>;
}

// Constants
export const LS_KEYS = {
  settings: 'openrouter_settings',
  history: 'chat_history',
  context: 'context_settings',
  workspace: 'workspace_session',
} as const;

export const VIRTUAL_SCROLL_CONFIG = {
  itemHeight: 28,
  visibleCount: 20,
  bufferCount: 5,
};

export const DEFAULT_CONTEXT_SETTINGS: ContextSettings = {
  enabled: true,
  selectedPaths: [],
  maxContextTokens: 256000,
  maxFiles: 200,
  maxTokensPerFile: 64000,
  maxOutputTokens: 10000,
};

export const VALIDATION_RULES: Record<string, ValidationRule> = {
  apiKey: {
    required: true,
    pattern: /^sk-or-v1-[a-zA-Z0-9]{32,}$/,
    message: 'API key must start with "sk-or-v1-" followed by at least 32 characters'
  },
  referer: {
    required: false,
    pattern: /^https?:\/\/[^\s]+$/,
    message: 'HTTP-Referer must be a valid URL starting with http:// or https://'
  },
  title: {
    required: false,
    maxLength: 100,
    message: 'Title must be 100 characters or less'
  }
};

// Debug configuration
export const DEBUG_CONFIG: DebugConfig = {
  enabled: process.env.NODE_ENV !== 'production',
  logLevel: process.env.NODE_ENV === 'production' ? 'error' : 'debug'
};
