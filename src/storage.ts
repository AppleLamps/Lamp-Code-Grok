// Storage management for persistence and session handling
import { 
  Settings, 
  ChatMessage, 
  ContextSettings, 
  WorkspaceSession, 
  SerializedTreeNode, 
  TreeNode, 
  LS_KEYS, 
  DEFAULT_CONTEXT_SETTINGS 
} from './types.js';
import { encrypt, decrypt } from './utils.js';

const STORAGE_KEY = 'lamp_app_key_v1';

// Settings storage
export const loadSettings = (): Settings => {
  const defaultSettings: Settings = { model: 'x-ai/grok-code-fast-1' };
  
  try {
    // Try to load from encrypted storage first
    const encryptedRaw = localStorage.getItem(STORAGE_KEY);
    if (encryptedRaw) {
      const decrypted = decrypt(encryptedRaw);
      if (decrypted) {
        return { ...defaultSettings, ...(JSON.parse(decrypted) as Settings) };
      }
    } else {
      // Fallback to old unencrypted storage and migrate
      const raw = localStorage.getItem(LS_KEYS.settings);
      if (raw) {
        const settings = { ...defaultSettings, ...(JSON.parse(raw) as Settings) };
        // Migrate to encrypted storage
        saveSettings(settings);
        localStorage.removeItem(LS_KEYS.settings);
        return settings;
      }
    }
  } catch (error) {
    console.warn('Failed to load settings:', error);
  }
  
  return defaultSettings;
};

export const saveSettings = (settings: Settings): void => {
  try {
    const encrypted = encrypt(JSON.stringify(settings));
    localStorage.setItem(STORAGE_KEY, encrypted);
  } catch (error) {
    console.error('Failed to save settings:', error);
    throw error;
  }
};

// Chat history storage
export const loadHistory = (): ChatMessage[] => {
  try {
    const raw = localStorage.getItem(LS_KEYS.history);
    if (raw) return JSON.parse(raw) as ChatMessage[];
  } catch (error) {
    console.warn('Failed to load chat history:', error);
  }
  return [];
};

export const saveHistory = (messages: ChatMessage[]): void => {
  try {
    localStorage.setItem(LS_KEYS.history, JSON.stringify(messages));
  } catch (error) {
    console.error('Failed to save chat history:', error);
  }
};

// Context settings storage
export const loadContextSettings = (): ContextSettings => {
  try {
    const raw = localStorage.getItem(LS_KEYS.context);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<ContextSettings>;
      return { ...DEFAULT_CONTEXT_SETTINGS, ...stored };
    }
  } catch (error) {
    console.warn('Failed to load context settings:', error);
  }
  return { ...DEFAULT_CONTEXT_SETTINGS };
};

export const saveContextSettings = (ctx: ContextSettings): void => {
  try {
    localStorage.setItem(LS_KEYS.context, JSON.stringify(ctx));
  } catch (error) {
    console.error('Failed to save context settings:', error);
  }
};

// Tree serialization utilities
export const serializeTree = (node: TreeNode): SerializedTreeNode => {
  return {
    name: node.name,
    path: node.path,
    isDir: node.isDir,
    expanded: node.expanded,
    level: node.level,
    children: Array.from(node.children.values()).map(serializeTree)
  };
};

export const deserializeTree = (serialized: SerializedTreeNode): TreeNode => {
  const node: TreeNode = {
    name: serialized.name,
    path: serialized.path,
    isDir: serialized.isDir,
    expanded: serialized.expanded,
    level: serialized.level,
    children: new Map()
  };

  for (const child of serialized.children) {
    const childNode = deserializeTree(child);
    node.children.set(child.name, childNode);
  }

  return node;
};

// Workspace session storage
export const loadWorkspaceSession = (): WorkspaceSession | null => {
  console.log('💾 Attempting to load workspace session...');
  try {
    const raw = localStorage.getItem(LS_KEYS.workspace);
    if (!raw) {
      console.log('🚫 No saved workspace session found');
      return null;
    }

    const session = JSON.parse(raw) as WorkspaceSession;
    console.log('📂 Found saved session:', { 
      name: session.name, 
      fileCount: session.files?.length || 0, 
      timestamp: new Date(session.timestamp).toLocaleString() 
    });
    
    // Check if session is not too old (older than 7 days)
    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    if (session.timestamp < weekAgo) {
      console.log('⏰ Session too old, removing');
      localStorage.removeItem(LS_KEYS.workspace);
      return null;
    }

    return session;
  } catch (error) {
    console.warn('Failed to load workspace session:', error);
    localStorage.removeItem(LS_KEYS.workspace);
    return null;
  }
};

export const saveWorkspaceSession = (session: WorkspaceSession): void => {
  if (!session.files.length) {
    localStorage.removeItem(LS_KEYS.workspace);
    return;
  }

  try {
    localStorage.setItem(LS_KEYS.workspace, JSON.stringify(session));
  } catch (error) {
    console.error('Failed to save workspace session:', error);
  }
};

// Panel sizes storage
export const loadPanelSizes = (): { leftWidth?: number; rightWidth?: number } => {
  try {
    const saved = localStorage.getItem('panel_sizes');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.warn('Failed to load panel sizes:', error);
  }
  return {};
};

export const savePanelSizes = (sizes: { leftWidth: number; rightWidth: number }): void => {
  try {
    localStorage.setItem('panel_sizes', JSON.stringify(sizes));
  } catch (error) {
    console.warn('Failed to save panel sizes:', error);
  }
};
