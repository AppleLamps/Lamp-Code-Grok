// Code editor management module with tab support
import { WorkspaceFile, MonacoEditor, MonacoEnvironment } from './types.js';
import { logger } from './utils.js';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

export interface EditorTab {
  id: string;
  file: WorkspaceFile;
  isDirty: boolean;
  isActive: boolean;
}

export class EditorManager {
  private tabs: EditorTab[] = [];
  private activeTabId: string | null = null;
  private editorInstance: MonacoEditor | null = null;
  private monacoLoaded = false;

  constructor() {}

  async init(): Promise<void> {
    // Load Monaco Editor
    await this.loadMonacoEditor();
    this.setupEventListeners();
  }

  private async loadMonacoEditor(): Promise<void> {
    if (this.monacoLoaded) return;

    try {
      // Configure Monaco Editor workers for Vite
      const monacoEnvironment: MonacoEnvironment = {
        getWorker(_workerId: string, label: string): Worker {
          try {
            if (label === 'json') {
              return new jsonWorker();
            }
            if (label === 'css' || label === 'scss' || label === 'less') {
              return new cssWorker();
            }
            if (label === 'html' || label === 'handlebars' || label === 'razor') {
              return new htmlWorker();
            }
            if (label === 'typescript' || label === 'javascript') {
              return new tsWorker();
            }
            return new editorWorker();
          } catch (error) {
            console.error('Failed to load Monaco worker:', label, error);
            // Fallback to editor worker for any failed loads
            return new editorWorker();
          }
        },
      };

      // Assign to window with proper typing
      (window as any).MonacoEnvironment = monacoEnvironment;
      (window as any).monaco = monaco;
      
      // Define custom theme that matches the application's color scheme
      monaco.editor.defineTheme('lamp-theme', {
        base: 'vs',
        inherit: true,
        rules: [
          { token: '', foreground: '57534E', background: 'F5F3ED' },
          { token: 'comment', foreground: '78716C', fontStyle: 'italic' },
          { token: 'keyword', foreground: '8B7355', fontStyle: 'bold' },
          { token: 'string', foreground: '6B5B47' },
          { token: 'number', foreground: '7C6B54' },
          { token: 'identifier', foreground: '57534E' },
          { token: 'type', foreground: '8B7355' },
        ],
        colors: {
          'editor.background': '#F5F3ED',
          'editor.foreground': '#57534E',
          'editor.lineHighlightBackground': '#EAE8E1',
          'editor.selectionBackground': '#D1CCC1',
          'editor.inactiveSelectionBackground': '#E5E2DB',
          'editorLineNumber.foreground': '#78716C',
          'editorLineNumber.activeForeground': '#57534E',
          'editorCursor.foreground': '#57534E',
          'editorGutter.background': '#EAE8E1',
          'editorIndentGuide.background': '#D6D3CE',
          'editorIndentGuide.activeBackground': '#78716C',
          'editorWhitespace.foreground': '#D6D3CE',
          'scrollbarSlider.background': '#D1CCC1',
          'scrollbarSlider.hoverBackground': '#C7C1B6',
          'scrollbar.shadow': '#D6D3CE',
          'editorWidget.background': '#EAE8E1',
          'editorWidget.border': '#D6D3CE',
          'editorHoverWidget.background': '#EAE8E1',
          'editorHoverWidget.border': '#D6D3CE',
        }
      });
      
      this.monacoLoaded = true;
      logger.info('Monaco Editor loaded successfully');
    } catch (error) {
      logger.error('Failed to load Monaco Editor:', error);
      throw error;
    }
  }

  openFile(file: WorkspaceFile): void {
    logger.debug('Opening file:', file.path);

    // Check if file is already open
    const existingTab = this.tabs.find(tab => tab.file.path === file.path);
    if (existingTab) {
      this.setActiveTab(existingTab.id);
      return;
    }

    // Create new tab
    const newTab: EditorTab = {
      id: this.generateTabId(),
      file,
      isDirty: false,
      isActive: true
    };

    // Set all other tabs to inactive
    this.tabs.forEach(tab => tab.isActive = false);

    // Add new tab
    this.tabs.push(newTab);
    this.activeTabId = newTab.id;

    // Show editor if this is the first tab
    if (this.tabs.length === 1) {
      this.showEditor();
    }

    // Render tabs and load content
    this.renderTabs();
    this.loadFileInEditor(file);
  }

  closeFile(tabId: string): void {
    const tabIndex = this.tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) return;

    const tab = this.tabs[tabIndex];
    const wasActive = tab.isActive;

    // Remove the tab
    this.tabs.splice(tabIndex, 1);

    // If we closed the active tab, activate another one
    if (wasActive && this.tabs.length > 0) {
      // Activate the tab to the left, or the first tab if none to the left
      const newActiveIndex = Math.max(0, tabIndex - 1);
      this.setActiveTab(this.tabs[newActiveIndex].id);
    } else if (this.tabs.length === 0) {
      // No tabs left, hide editor
      this.hideEditor();
      this.activeTabId = null;
    }

    this.renderTabs();
  }

  setActiveTab(tabId: string): void {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Set all tabs to inactive
    this.tabs.forEach(t => t.isActive = false);
    
    // Set the selected tab to active
    tab.isActive = true;
    this.activeTabId = tabId;

    // Load the file content in editor
    this.loadFileInEditor(tab.file);
    this.renderTabs();
  }

  private generateTabId(): string {
    return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private showEditor(): void {
    const centerPanel = document.querySelector('.center-panel') as HTMLElement;
    const welcomeScreen = document.querySelector('.welcome-screen') as HTMLElement;
    const editorContainer = document.getElementById('editorContainer');

    if (welcomeScreen) {
      welcomeScreen.style.display = 'none';
    }

    if (!editorContainer) {
      // Create editor container
      const editorHTML = `
        <div id="editorContainer" class="editor-container">
          <div id="editorTabs" class="editor-tabs"></div>
          <div id="editorContent" class="editor-content">
            <div id="monacoEditor" class="monaco-editor-wrapper"></div>
          </div>
        </div>
      `;
      centerPanel.innerHTML = editorHTML;
    }

    if (centerPanel) {
      centerPanel.style.alignItems = 'stretch';
      centerPanel.style.justifyContent = 'stretch';
    }
  }

  private hideEditor(): void {
    const centerPanel = document.querySelector('.center-panel') as HTMLElement;
    const welcomeScreen = document.querySelector('.welcome-screen') as HTMLElement;
    const editorContainer = document.getElementById('editorContainer');

    if (editorContainer) {
      editorContainer.remove();
    }

    if (welcomeScreen) {
      welcomeScreen.style.display = 'block';
    }

    if (centerPanel) {
      centerPanel.style.alignItems = 'center';
      centerPanel.style.justifyContent = 'center';
    }

    // Dispose Monaco editor instance
    if (this.editorInstance) {
      this.editorInstance.dispose();
      this.editorInstance = null;
    }
  }

  private renderTabs(): void {
    const tabsContainer = document.getElementById('editorTabs');
    if (!tabsContainer) return;

    tabsContainer.innerHTML = '';

    this.tabs.forEach(tab => {
      const tabElement = document.createElement('div');
      tabElement.className = `editor-tab ${tab.isActive ? 'active' : ''}`;
      tabElement.dataset.tabId = tab.id;

      const fileName = tab.file.name;
      const isDirtyIndicator = tab.isDirty ? '●' : '';
      
      tabElement.innerHTML = `
        <span class="tab-icon">${this.getFileIcon(tab.file)}</span>
        <span class="tab-label" title="${tab.file.path}">${fileName}</span>
        <span class="tab-dirty">${isDirtyIndicator}</span>
        <button class="tab-close" title="Close tab">×</button>
      `;

      tabsContainer.appendChild(tabElement);
    });
  }

  private getFileIcon(file: WorkspaceFile): string {
    const ext = file.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return '<i class="fa-brands fa-js" style="color: #007ACC;"></i>';
      case 'js':
      case 'jsx':
        return '<i class="fa-brands fa-js" style="color: #F7DF1E;"></i>';
      case 'html':
        return '<i class="fa-brands fa-html5" style="color: #E34F26;"></i>';
      case 'css':
      case 'scss':
      case 'sass':
        return '<i class="fa-brands fa-css3-alt" style="color: #1572B6;"></i>';
      case 'json':
        return '<i class="fa-solid fa-file-code" style="color: #F7DF1E;"></i>';
      case 'md':
        return '<i class="fa-brands fa-markdown" style="color: #083FA1;"></i>';
      case 'py':
        return '<i class="fa-brands fa-python" style="color: #306998;"></i>';
      case 'java':
        return '<i class="fa-brands fa-java" style="color: #ED8B00;"></i>';
      default:
        return '<i class="fa-solid fa-file-lines"></i>';
    }
  }

  private async loadFileInEditor(file: WorkspaceFile): Promise<void> {
    if (!this.monacoLoaded) {
      logger.warn('Monaco Editor not loaded yet');
      return;
    }

    const editorElement = document.getElementById('monacoEditor');
    if (!editorElement) {
      logger.warn('Monaco editor element not found');
      return;
    }

    // Dispose existing editor
    if (this.editorInstance) {
      this.editorInstance.dispose();
    }

    // Get language from file extension
    const language = this.getLanguageFromExtension(file.name);

    // Create new Monaco editor instance with proper typing
    this.editorInstance = (window as any).monaco.editor.create(editorElement, {
      value: file.text || '',
      language: language,
      theme: 'lamp-theme',
      fontSize: 14,
      lineNumbers: 'on',
      renderWhitespace: 'selection',
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      wordWrap: 'on',
      readOnly: false,
      folding: true,
      // Compact gutter settings for VS Code-like appearance
      lineDecorationsWidth: 6,        // Reduced from 20 to 6 (minimal space for decorations)
      lineNumbersMinChars: 2,         // Reduced from 3 to 2 (auto-adjusts based on content)
      glyphMargin: false,             // Keep disabled to save space
      // Additional compact settings
      overviewRulerBorder: false,     // Remove border on overview ruler
      hideCursorInOverviewRuler: true, // Hide cursor indicator in overview ruler
      overviewRulerLanes: 2,          // Reduce overview ruler lanes
      // Improved scrollbar appearance
      scrollbar: {
        vertical: 'auto',
        horizontal: 'auto',
        verticalScrollbarSize: 12,    // Thinner scrollbar
        horizontalScrollbarSize: 12
      }
    });

    // Listen for content changes
    this.editorInstance.onDidChangeModelContent(() => {
      this.markTabAsDirty(this.activeTabId!);
    });
  }

  private getLanguageFromExtension(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      case 'scss':
        return 'scss';
      case 'sass':
        return 'sass';
      case 'json':
        return 'json';
      case 'md':
        return 'markdown';
      case 'py':
        return 'python';
      case 'java':
        return 'java';
      case 'xml':
        return 'xml';
      case 'yaml':
      case 'yml':
        return 'yaml';
      case 'sql':
        return 'sql';
      case 'sh':
        return 'shell';
      default:
        return 'plaintext';
    }
  }

  private markTabAsDirty(tabId: string): void {
    const tab = this.tabs.find(t => t.id === tabId);
    if (tab && !tab.isDirty) {
      tab.isDirty = true;
      this.renderTabs();
    }
  }

  private setupEventListeners(): void {
    // Delegate event listener for tab interactions
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      
      // Handle tab close button
      if (target.classList.contains('tab-close')) {
        e.stopPropagation();
        const tabElement = target.closest('.editor-tab') as HTMLElement;
        const tabId = tabElement?.dataset.tabId;
        if (tabId) {
          this.closeFile(tabId);
        }
        return;
      }

      // Handle tab click
      const tabElement = target.closest('.editor-tab') as HTMLElement;
      if (tabElement) {
        const tabId = tabElement.dataset.tabId;
        if (tabId) {
          this.setActiveTab(tabId);
        }
        return;
      }
    });

    // Handle keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl+W: Close current tab
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        if (this.activeTabId) {
          this.closeFile(this.activeTabId);
        }
      }

      // Ctrl+Tab: Switch to next tab
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        this.switchToNextTab();
      }

      // Ctrl+Shift+Tab: Switch to previous tab
      if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        this.switchToPreviousTab();
      }
    });
  }

  private switchToNextTab(): void {
    if (this.tabs.length <= 1) return;
    
    const currentIndex = this.tabs.findIndex(tab => tab.isActive);
    const nextIndex = (currentIndex + 1) % this.tabs.length;
    this.setActiveTab(this.tabs[nextIndex].id);
  }

  private switchToPreviousTab(): void {
    if (this.tabs.length <= 1) return;
    
    const currentIndex = this.tabs.findIndex(tab => tab.isActive);
    const prevIndex = (currentIndex - 1 + this.tabs.length) % this.tabs.length;
    this.setActiveTab(this.tabs[prevIndex].id);
  }

  // Public API methods
  getOpenTabs(): EditorTab[] {
    return [...this.tabs];
  }

  getActiveTab(): EditorTab | null {
    return this.tabs.find(tab => tab.isActive) || null;
  }

  getCurrentContent(): string {
    return this.editorInstance?.getValue() || '';
  }

  saveCurrentFile(): void {
    const activeTab = this.getActiveTab();
    if (!activeTab || !this.editorInstance) return;

    // In a real implementation, this would save to the file system
    // For now, we'll just mark the tab as clean
    activeTab.isDirty = false;
    activeTab.file.text = this.getCurrentContent();
    this.renderTabs();
    
    console.log('💾 File saved:', activeTab.file.path);
  }
}
