// Main application entry point - coordinates all modules
import { SettingsManager } from './settings.js';
import { ChatManager } from './chat.js';
import { ContextManager } from './context.js';
import { ExplorerManager } from './explorer.js';
import { UIManager } from './ui.js';
import { EditorManager } from './editor.js';

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize managers
  const settingsManager = new SettingsManager();
  const explorerManager = new ExplorerManager();
  const contextManager = new ContextManager(explorerManager.getWorkspace());
  const chatManager = new ChatManager(settingsManager);
  const uiManager = new UIManager();
  const editorManager = new EditorManager();

  // Set up dependencies
  uiManager.setDependencies({
    settingsManager,
    chatManager,
    explorerManager,
    contextManager
  });

  // Connect editor with explorer
  explorerManager.setEditorManager(editorManager);

  // Connect chat with context provider
  chatManager.setContextProvider(() => contextManager.buildContextMessage());

  // Load workspace session if available
  console.log('🚀 App initialization: checking for saved workspace...');
  if (!explorerManager.loadWorkspaceSession()) {
    console.log('🆕 No saved workspace found, showing empty state');
    explorerManager.renderTree(); // Will show empty state
  } else {
    console.log('🔄 Workspace loaded from session, calling renderTree...');
    contextManager.initializeSelection(); // Initialize context selection for loaded files
    explorerManager.renderTree();
  }

  // Set up event listeners for all managers
  settingsManager.setupEventListeners();
  chatManager.setupEventListeners();
  contextManager.setupEventListeners();
  explorerManager.setupEventListeners();

  // Initialize UI and editor
  uiManager.init();
  await editorManager.init();

  // Render initial messages
  chatManager.renderInitialMessages();

  // Setup debug helpers
  explorerManager.setupDebugHelpers();

  console.log('✅ Application initialized successfully');
});
