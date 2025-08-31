// UI utilities, modal management, and keyboard shortcuts module
import { loadPanelSizes, savePanelSizes } from './storage.js';
import JSZip from 'jszip';
import {
  UIManagerDependencies,
  SettingsManagerInterface,
  ChatManagerInterface,
  ExplorerManagerInterface,
  ContextManagerInterface
} from './types.js';

export class UIManager {
  private settingsManager: SettingsManagerInterface | null = null;
  private chatManager: ChatManagerInterface | null = null;
  private explorerManager: ExplorerManagerInterface | null = null;
  private contextManager: ContextManagerInterface | null = null;

  constructor() {
    // Dependencies will be injected after creation
  }

  setDependencies(deps: UIManagerDependencies): void {
    this.settingsManager = deps.settingsManager;
    this.chatManager = deps.chatManager;
    this.explorerManager = deps.explorerManager;
    this.contextManager = deps.contextManager;
  }

  initKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      // Don't trigger shortcuts when typing in inputs/textareas (except specific cases)
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      if (isInput) {
        // Allow Ctrl+Enter to send message from chat input
        if (e.ctrlKey && e.key === 'Enter' && e.target.id === 'chatInput') {
          e.preventDefault();
          e.stopPropagation();
          const chatForm = document.getElementById('chatForm');
          const event = new Event('submit', { bubbles: true, cancelable: true });
          chatForm?.dispatchEvent(event);
          return;
        }
        // Allow other shortcuts in inputs if they're not conflicting
        if (!this.isConflictingShortcut(e)) {
          return;
        }
        return;
      }

      // Prevent default for all our shortcuts to avoid browser conflicts
      if (this.isOurShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
      }

      // Global shortcuts
      switch (true) {
        // Ctrl+L: Focus chat input (Code with Lamper)
        case e.ctrlKey && e.key === 'l':
          this.focusChatInput();
          break;

        // Ctrl+I: Focus context preview (Edit code inline equivalent)
        case e.ctrlKey && e.key === 'i':
          this.contextManager?.openContextModal();
          break;

        // Ctrl+/: Open settings
        case e.ctrlKey && e.key === '/':
          this.settingsManager?.openSettingsModal();
          break;

        // Ctrl+K: Clear chat
        case e.ctrlKey && e.key === 'k':
          this.chatManager?.clearHistory();
          break;

        // Ctrl+O: Open folder
        case e.ctrlKey && e.key === 'o':
          this.triggerOpenFolder();
          break;

        // Escape: Close modals or focus chat input
        case e.key === 'Escape':
          const openModal = document.querySelector('.modal:not([hidden])');
          if (openModal) {
            openModal.setAttribute('hidden', '');
          } else {
            this.focusChatInput();
          }
          break;

        // Ctrl+Enter: Send message (global)
        case e.ctrlKey && e.key === 'Enter':
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

  private isOurShortcut(e: KeyboardEvent): boolean {
    // Check if this is one of our defined shortcuts
    return (
      (e.ctrlKey && e.key === 'l') ||
      (e.ctrlKey && e.key === 'i') ||
      (e.ctrlKey && e.key === '/') ||
      (e.ctrlKey && e.key === 'k') ||
      (e.ctrlKey && e.key === 'o') ||
      (e.ctrlKey && e.key === 'Enter') ||
      (e.key === 'Escape')
    );
  }

  private isConflictingShortcut(e: KeyboardEvent): boolean {
    // Define shortcuts that might conflict with browser/system shortcuts
    // These should be prevented even in input fields
    return (
      (e.ctrlKey && e.key === 'l') || // Browser location bar
      (e.ctrlKey && e.key === 'k') || // Browser search
      (e.ctrlKey && e.key === 'o')    // Browser open file
    );
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
    this.initResponsiveHeaders();

    // Connect the new file button
    const newFileBtn = document.getElementById('newFileBtn');
    newFileBtn?.addEventListener('click', () => {
      this.explorerManager?.showNewFileModal();
    });

    // Connect the new Undo button
    const undoBtn = document.getElementById('undoChangesBtn');
    undoBtn?.addEventListener('click', () => {
      this.explorerManager?.restoreWorkspaceState();
    });

    // Connect the new Download ZIP button
    const downloadBtn = document.getElementById('downloadZipBtn');
    downloadBtn?.addEventListener('click', () => this.downloadWorkspaceAsZip());

    // Auto-focus chat input when app loads
    setTimeout(() => this.focusChatInput(), 100);
  }

  private initResponsiveHeaders(): void {
    // Set up ResizeObserver to monitor panel width changes
    if ('ResizeObserver' in window) {
      const leftPanel = document.querySelector('.left-panel') as HTMLElement;
      const rightPanel = document.querySelector('.right-panel') as HTMLElement;

      if (leftPanel) {
        const leftResizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            this.updateHeaderResponsiveness(entry.target as HTMLElement, entry.contentRect.width);
          }
        });
        leftResizeObserver.observe(leftPanel);
      }

      if (rightPanel) {
        const rightResizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            this.updateHeaderResponsiveness(entry.target as HTMLElement, entry.contentRect.width);
          }
        });
        rightResizeObserver.observe(rightPanel);
      }
    } else {
      // Fallback for browsers without ResizeObserver
      this.initResponsiveHeadersFallback();
    }
  }

  private updateHeaderResponsiveness(panel: HTMLElement, width: number): void {
    const header = panel.querySelector('.panel-header') as HTMLElement;
    if (!header) return;

    // Define breakpoints for different responsive states
    const isNarrow = width < 280;
    const isVeryNarrow = width < 220;

    // Update header attributes for CSS targeting
    if (isVeryNarrow) {
      header.setAttribute('data-narrow', 'very');
    } else if (isNarrow) {
      header.setAttribute('data-narrow', 'true');
    } else {
      header.removeAttribute('data-narrow');
    }

    // Update button text visibility
    const buttons = header.querySelectorAll('.action-btn.small');
    buttons.forEach((button) => {
      const btn = button as HTMLElement;
      if (isVeryNarrow) {
        btn.classList.add('icon-only');
        btn.setAttribute('data-original-text', btn.textContent?.trim() || '');
        // Keep only the icon, remove text content
        const icon = btn.querySelector('i');
        if (icon) {
          btn.innerHTML = '';
          btn.appendChild(icon);
        }
      } else if (isNarrow) {
        btn.classList.add('compact');
      } else {
        btn.classList.remove('icon-only', 'compact');
        // Restore original text if it was hidden
        const originalText = btn.getAttribute('data-original-text');
        if (originalText && !btn.textContent?.includes(originalText)) {
          const icon = btn.querySelector('i');
          btn.textContent = originalText;
          if (icon) {
            btn.insertBefore(icon, btn.firstChild);
          }
        }
      }
    });
  }

  private initResponsiveHeadersFallback(): void {
    // Fallback using window resize events and manual width checking
    const checkResponsiveness = () => {
      const leftPanel = document.querySelector('.left-panel') as HTMLElement;
      const rightPanel = document.querySelector('.right-panel') as HTMLElement;

      if (leftPanel) {
        this.updateHeaderResponsiveness(leftPanel, leftPanel.offsetWidth);
      }
      if (rightPanel) {
        this.updateHeaderResponsiveness(rightPanel, rightPanel.offsetWidth);
      }
    };

    // Check on window resize
    window.addEventListener('resize', checkResponsiveness);

    // Initial check
    setTimeout(checkResponsiveness, 100);

    // Periodic check for manual resizing
    setInterval(checkResponsiveness, 1000);
  }

  private async downloadWorkspaceAsZip(): Promise<void> {
    const workspace = this.explorerManager?.getWorkspace();
    if (!workspace || workspace.files.length === 0) {
      alert('Workspace is empty. Nothing to download.');
      return;
    }

    const zip = new JSZip();
    workspace.files.forEach(file => {
      // Use file.text if available, otherwise it will be an empty file
      zip.file(file.path, file.text || '');
    });

    zip.generateAsync({ type: 'blob' }).then(content => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      const workspaceName = workspace.name || 'lampcode-workspace';
      link.download = `${workspaceName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }
}
