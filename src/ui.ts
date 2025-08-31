// UI utilities, modal management, and keyboard shortcuts module
import { loadPanelSizes, savePanelSizes } from './storage.js';

export class UIManager {
  private settingsManager: any;
  private chatManager: any;
  private explorerManager: any;
  private contextManager: any;

  constructor() {
    // Dependencies will be injected after creation
  }

  setDependencies(deps: {
    settingsManager: any;
    chatManager: any;
    explorerManager: any;
    contextManager: any;
  }): void {
    this.settingsManager = deps.settingsManager;
    this.chatManager = deps.chatManager;
    this.explorerManager = deps.explorerManager;
    this.contextManager = deps.contextManager;
  }

  initKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      // Don't trigger shortcuts when typing in inputs/textareas (except Ctrl+Enter)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        // Allow Ctrl+Enter to send message from chat input
        if (e.ctrlKey && e.key === 'Enter' && e.target.id === 'chatInput') {
          e.preventDefault();
          const chatForm = document.getElementById('chatForm');
          const event = new Event('submit', { bubbles: true, cancelable: true });
          chatForm?.dispatchEvent(event);
          return;
        }
        return;
      }

      // Global shortcuts
      switch (true) {
        // Ctrl+L: Focus chat input (Code with Lamper)
        case e.ctrlKey && e.key === 'l':
          e.preventDefault();
          this.focusChatInput();
          break;

        // Ctrl+I: Focus context preview (Edit code inline equivalent)
        case e.ctrlKey && e.key === 'i':
          e.preventDefault();
          this.contextManager?.openContextModal();
          break;

        // Ctrl+/: Open settings
        case e.ctrlKey && e.key === '/':
          e.preventDefault();
          this.settingsManager?.openSettingsModal();
          break;

        // Ctrl+K: Clear chat
        case e.ctrlKey && e.key === 'k':
          e.preventDefault();
          this.chatManager?.clearHistory();
          break;

        // Ctrl+O: Open folder
        case e.ctrlKey && e.key === 'o':
          e.preventDefault();
          this.triggerOpenFolder();
          break;

        // Escape: Close modals or focus chat input
        case e.key === 'Escape':
          e.preventDefault();
          const openModal = document.querySelector('.modal:not([hidden])');
          if (openModal) {
            openModal.setAttribute('hidden', '');
          } else {
            this.focusChatInput();
          }
          break;

        // Ctrl+Enter: Send message (global)
        case e.ctrlKey && e.key === 'Enter':
          e.preventDefault();
          const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
          if (!sendBtn?.disabled) {
            const chatForm = document.getElementById('chatForm');
            const event = new Event('submit', { bubbles: true, cancelable: true });
            chatForm?.dispatchEvent(event);
          }
          break;
      }
    });
  }

  private focusChatInput(): void {
    const chatInput = document.getElementById('chatInput') as HTMLTextAreaElement;
    chatInput?.focus();
  }

  private triggerOpenFolder(): void {
    const folderInput = document.getElementById('folderInput') as HTMLInputElement;
    folderInput?.click();
  }

  initPanelResizing(): void {
    const leftPanel = document.querySelector('.left-panel') as HTMLElement;
    const rightPanel = document.querySelector('.right-panel') as HTMLElement;
    const leftResizeHandle = document.getElementById('leftResizeHandle') as HTMLElement;
    const rightResizeHandle = document.getElementById('rightResizeHandle') as HTMLElement;

    if (!leftPanel || !rightPanel || !leftResizeHandle || !rightResizeHandle) return;

    // Panel size constraints
    const PANEL_CONSTRAINTS = {
      left: { min: 200, max: 600 },
      right: { min: 200, max: 500 }
    };

    // Load saved panel sizes
    const loadSizes = () => {
      try {
        const sizes = loadPanelSizes();
        if (sizes.leftWidth) {
          leftPanel.style.width = `${Math.max(PANEL_CONSTRAINTS.left.min, Math.min(PANEL_CONSTRAINTS.left.max, sizes.leftWidth))}px`;
        }
        if (sizes.rightWidth) {
          rightPanel.style.width = `${Math.max(PANEL_CONSTRAINTS.right.min, Math.min(PANEL_CONSTRAINTS.right.max, sizes.rightWidth))}px`;
        }
      } catch (error) {
        console.warn('Failed to load panel sizes:', error);
      }
    };

    // Save panel sizes
    const saveSizes = () => {
      try {
        const sizes = {
          leftWidth: parseInt(leftPanel.style.width || '320'),
          rightWidth: parseInt(rightPanel.style.width || '280')
        };
        savePanelSizes(sizes);
      } catch (error) {
        console.warn('Failed to save panel sizes:', error);
      }
    };

    // Resize state
    let isResizing = false;
    let currentHandle: HTMLElement | null = null;
    let startX = 0;
    let startWidth = 0;

    // Start resize
    const startResize = (e: MouseEvent, handle: HTMLElement, panel: HTMLElement) => {
      isResizing = true;
      currentHandle = handle;
      startX = e.clientX;
      startWidth = panel.offsetWidth;
      
      handle.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      // Prevent text selection while dragging
      e.preventDefault();
    };

    // Handle resize
    const handleResize = (e: MouseEvent) => {
      if (!isResizing || !currentHandle) return;
      
      e.preventDefault();
      
      const diff = e.clientX - startX;
      let newWidth: number;
      let constraints: { min: number; max: number };

      if (currentHandle === leftResizeHandle) {
        newWidth = startWidth + diff;
        constraints = PANEL_CONSTRAINTS.left;
      } else {
        newWidth = startWidth - diff;
        constraints = PANEL_CONSTRAINTS.right;
      }

      // Apply constraints
      newWidth = Math.max(constraints.min, Math.min(constraints.max, newWidth));
      
      const targetPanel = currentHandle === leftResizeHandle ? leftPanel : rightPanel;
      targetPanel.style.width = `${newWidth}px`;
    };

    // End resize
    const endResize = () => {
      if (!isResizing) return;
      
      isResizing = false;
      if (currentHandle) {
        currentHandle.classList.remove('resizing');
      }
      currentHandle = null;
      
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      // Save the new sizes
      saveSizes();
    };

    // Event listeners
    leftResizeHandle.addEventListener('mousedown', (e) => startResize(e, leftResizeHandle, leftPanel));
    rightResizeHandle.addEventListener('mousedown', (e) => startResize(e, rightResizeHandle, rightPanel));
    
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', endResize);
    
    // Handle escape key to cancel resize
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isResizing) {
        endResize();
      }
    });

    // Load saved sizes on init
    loadSizes();
  }

  // Initialize all UI components
  init(): void {
    this.initKeyboardShortcuts();
    this.initPanelResizing();
    
    // Auto-focus chat input when app loads
    setTimeout(() => this.focusChatInput(), 100);
  }
}
