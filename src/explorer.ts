// File explorer and workspace management module
import {
  Workspace,
  WorkspaceFile,
  TreeNode,
  VirtualScrollState,
  WorkspaceSession,
  VIRTUAL_SCROLL_CONFIG,
  DEBUG_CONFIG
} from './types.js';
import {
  loadWorkspaceSession,
  saveWorkspaceSession,
  serializeTree,
  deserializeTree
} from './storage.js';
import { estimateTokens, iconForFile, track, logger } from './utils.js';

export class ExplorerManager {
  private workspace: Workspace;
  private virtualItemsPool: HTMLLIElement[] = [];
  private virtualScrollState: VirtualScrollState;
  private editorManager: any = null; // Will be injected
  private notificationManager: any = null; // Will be injected
  private contextMenuTarget: string | null = null; // Track which file the context menu is for

  constructor() {
    this.workspace = {
      name: null,
      files: [],
      byPath: new Map<string, WorkspaceFile>(),
      tree: null
    };

    this.virtualScrollState = {
      scrollTop: 0,
      startIndex: 0,
      endIndex: 0,
      totalItems: 0,
      flatNodes: [],
      scrollTimer: null
    };
  }

  getWorkspace(): Workspace {
    return this.workspace;
  }

  setEditorManager(editorManager: any): void {
    this.editorManager = editorManager;
  }

  setNotificationManager(notificationManager: any): void {
    this.notificationManager = notificationManager;
  }

  private renderEmpty(): void {
    logger.debug('Rendering empty state - no files in workspace');
    const emptyStateEl = document.getElementById('explorerEmptyState');
    const fileTreeEl = document.getElementById('fileTree');

    if (emptyStateEl) {
      emptyStateEl.hidden = false;
      emptyStateEl.style.display = 'flex';
      logger.debug('Showing empty state element');
    }
    if (fileTreeEl) {
      fileTreeEl.hidden = true;
      fileTreeEl.style.display = 'none';
      fileTreeEl.innerHTML = '';
      logger.debug('Hiding file tree element');
    }
  }

  private buildTree(files: WorkspaceFile[]): TreeNode | null {
    if (!files.length) return null;

    const root: TreeNode = {
      name: 'root',
      path: '',
      isDir: true,
      children: new Map(),
      expanded: true,
      level: -1
    };

    for (const file of files) {
      const pathParts = file.path.split('/').filter(part => part.length > 0);
      let currentNode = root;
      let currentPath = '';

      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLastPart = i === pathParts.length - 1;
        const isDir = !isLastPart;

        if (!currentNode.children.has(part)) {
          const node: TreeNode = {
            name: part,
            path: currentPath,
            isDir,
            children: new Map(),
            expanded: false,
            level: i,
            ...(isLastPart && !isDir ? { file } : {})
          };
          currentNode.children.set(part, node);
        }

        currentNode = currentNode.children.get(part)!;
        if (isLastPart && !isDir) {
          currentNode.file = file;
        }
      }
    }

    return root;
  }

  private flattenTreeForDisplay(node: TreeNode): TreeNode[] {
    const result: TreeNode[] = [];
    
    const traverse = (node: TreeNode) => {
      if (node.level >= 0) { // Skip root node
        result.push(node);
      }
      
      if (node.expanded || node.level < 0) {
        const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
          // Directories first, then files
          if (a.isDir && !b.isDir) return -1;
          if (!a.isDir && b.isDir) return 1;
          return a.name.localeCompare(b.name);
        });
        
        for (const child of sortedChildren) {
          traverse(child);
        }
      }
    };

    traverse(node);
    return result;
  }

  private updateVirtualScrollIndices(): void {
    const { itemHeight, visibleCount, bufferCount } = VIRTUAL_SCROLL_CONFIG;
    const scrollTop = this.virtualScrollState.scrollTop;
    
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferCount);
    const endIndex = Math.min(
      this.virtualScrollState.totalItems - 1,
      startIndex + visibleCount + bufferCount * 2
    );
    
    this.virtualScrollState.startIndex = startIndex;
    this.virtualScrollState.endIndex = endIndex;
  }

  private createTreeItem(node: TreeNode): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'tree-item';
    li.style.paddingLeft = `${node.level * 16 + 8}px`;
    li.dataset.path = node.path;
    li.dataset.isDir = String(node.isDir);
    
    // Add ARIA attributes for tree navigation
    li.setAttribute('role', 'treeitem');
    li.setAttribute('tabindex', '-1');
    li.setAttribute('aria-label', `${node.isDir ? 'Folder' : 'File'}: ${node.name}`);
    
    if (node.isDir) {
      li.setAttribute('aria-expanded', node.expanded.toString());
      const chevron = node.expanded ? 'fa-chevron-down' : 'fa-chevron-right';
      li.innerHTML = `<i class="chevron fa-solid ${chevron}" aria-hidden="true"></i> ${iconForFile(node.name, node.isDir)} <span class="tree-item-name">${node.name}</span><i class="tree-item-delete fa-solid fa-trash" aria-hidden="true" title="Delete folder"></i>`;
    } else {
      li.innerHTML = `<span class="chevron-spacer" aria-hidden="true"></span> ${iconForFile(node.name, node.isDir)} <span class="tree-item-name">${node.name}</span><i class="tree-item-delete fa-solid fa-trash" aria-hidden="true" title="Delete file"></i>`;
    }

    return li;
  }

  private renderRegularTree(nodes: TreeNode[]): void {
    const fileTreeEl = document.getElementById('fileTree');
    if (!fileTreeEl) return;
    
    fileTreeEl.innerHTML = '';
    fileTreeEl.style.height = 'auto';

    for (const node of nodes) {
      const li = this.createTreeItem(node);
      fileTreeEl.appendChild(li);
    }
  }

  private renderVirtualTree(): void {
    const fileTreeEl = document.getElementById('fileTree');
    if (!fileTreeEl) return;

    this.updateVirtualScrollIndices();

    const { itemHeight } = VIRTUAL_SCROLL_CONFIG;
    const { startIndex, endIndex, totalItems, flatNodes } = this.virtualScrollState;

    // Handle empty or small lists
    if (totalItems === 0) {
      fileTreeEl.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">No files to display</div>';
      return;
    }

    // For small lists, use regular rendering to avoid virtual scrolling overhead
    if (totalItems <= 50) {
      this.renderRegularTree(flatNodes);
      return;
    }

    // Set container height to enable scrolling
    const totalHeight = totalItems * itemHeight;
    fileTreeEl.style.height = `${Math.min(totalHeight, 400)}px`; // Max height of 400px
    fileTreeEl.style.position = 'relative';
    fileTreeEl.style.overflowY = 'auto';

    // Create or reuse virtual container
    let virtualContainer = fileTreeEl.querySelector('.virtual-container') as HTMLElement;
    if (!virtualContainer) {
      virtualContainer = document.createElement('div');
      virtualContainer.className = 'virtual-container';
      fileTreeEl.appendChild(virtualContainer);
    }
    virtualContainer.style.height = `${totalHeight}px`;
    virtualContainer.style.position = 'relative';

    // Render or update visible items
    const visibleCount = endIndex - startIndex + 1;
    while (this.virtualItemsPool.length < visibleCount) {
      this.virtualItemsPool.push(this.createTreeItem({} as TreeNode)); // Create pool items
    }

    for (let i = 0; i < visibleCount; i++) {
      const nodeIndex = startIndex + i;
      if (nodeIndex >= flatNodes.length) break;

      const node = flatNodes[nodeIndex];
      const li = this.virtualItemsPool[i];

      // Update item content and styles
      li.style.position = 'absolute';
      li.style.top = `${nodeIndex * itemHeight}px`;
      li.style.width = '100%';
      li.style.height = `${itemHeight}px`;
      li.style.boxSizing = 'border-box';
      li.style.paddingLeft = `${node.level * 16 + 8}px`;
      li.dataset.path = node.path;
      li.dataset.isDir = String(node.isDir);

      if (node.isDir) {
        const chevron = node.expanded ? 'fa-chevron-down' : 'fa-chevron-right';
        li.innerHTML = `<i class="chevron fa-solid ${chevron}" aria-hidden="true"></i> ${iconForFile(node.name, node.isDir)} <span class="tree-item-name">${node.name}</span><i class="tree-item-delete fa-solid fa-trash" aria-hidden="true" title="Delete folder"></i>`;
        li.setAttribute('aria-expanded', node.expanded.toString());
      } else {
        li.innerHTML = `<span class="chevron-spacer" aria-hidden="true"></span> ${iconForFile(node.name, node.isDir)} <span class="tree-item-name">${node.name}</span><i class="tree-item-delete fa-solid fa-trash" aria-hidden="true" title="Delete file"></i>`;
      }

      virtualContainer.appendChild(li);
    }

    // Remove excess items
    while (virtualContainer.children.length > visibleCount) {
      virtualContainer.lastChild?.remove();
    }
  }

  renderTree(): void {
    logger.debug('Rendering tree, workspace files count:', this.workspace.files.length);

    if (!this.workspace.files.length) {
      logger.debug('No files in workspace, showing empty state');
      return this.renderEmpty();
    }

    logger.debug('Rendering tree with files:', this.workspace.files.map(f => f.path).slice(0, 5));

    // Prepare UI elements
    if (!this.prepareTreeUI()) {
      return;
    }

    // Build tree structure if needed
    this.ensureTreeStructure();

    if (!this.workspace.tree) {
      logger.warn('Failed to build tree structure');
      return;
    }

    // Render the tree
    this.renderTreeContent();
  }

  private prepareTreeUI(): boolean {
    const emptyStateEl = document.getElementById('explorerEmptyState');
    const fileTreeEl = document.getElementById('fileTree');

    if (emptyStateEl) {
      emptyStateEl.hidden = true;
      emptyStateEl.style.display = 'none';
      logger.debug('Hiding empty state element');
    }

    if (!fileTreeEl) {
      logger.error('File tree element not found');
      return false;
    }

    fileTreeEl.hidden = false;
    fileTreeEl.style.display = 'block';
    logger.debug('Showing file tree element');

    return true;
  }

  private ensureTreeStructure(): void {
    if (!this.workspace.tree) {
      logger.debug('Building tree structure from files');
      this.workspace.tree = this.buildTree(this.workspace.files);
    }
  }

  private renderTreeContent(): void {
    if (!this.workspace.tree) return;

    const nodes = this.flattenTreeForDisplay(this.workspace.tree);
    this.virtualScrollState.flatNodes = nodes;
    this.virtualScrollState.totalItems = nodes.length;

    // Enable virtual scrolling for large trees (more than 50 items)
    // The renderVirtualTree method will handle the fallback logic internally
    const useVirtualScrolling = nodes.length > 50;

    logger.debug(`Rendering ${nodes.length} nodes, virtual scrolling: ${useVirtualScrolling}`);

    if (useVirtualScrolling) {
      this.renderVirtualTree();
    } else {
      this.renderRegularTree(nodes);
    }
  }

  private toggleFolder(path: string): void {
    if (!this.workspace.tree) return;

    const findNode = (node: TreeNode, targetPath: string): TreeNode | null => {
      if (node.path === targetPath) return node;
      for (const child of node.children.values()) {
        const found = findNode(child, targetPath);
        if (found) return found;
      }
      return null;
    };

    const node = findNode(this.workspace.tree, path);
    if (node && node.isDir) {
      node.expanded = !node.expanded;
      this.renderTree();
      this.saveWorkspaceSession(); // Save expansion state
    }
  }

  async setWorkspaceFromFileList(fileList: File[], source = 'unknown'): Promise<void> {
    console.log('🗂️ setWorkspaceFromFileList called:', { fileListLength: fileList?.length, source });
    if (!fileList || !fileList.length) {
      console.log('❌ No files provided or empty file list');
      return;
    }
    
    let rootName: string | null = null;
    const first = fileList[0] as any;
    if (first.webkitRelativePath) {
      const parts = (first.webkitRelativePath as string).split('/');
      rootName = parts[0] || null;
    }
    
    console.log('📁 Setting workspace:', { rootName, fileCount: fileList.length });
    this.workspace.name = rootName;
    this.workspace.files = [];
    this.workspace.byPath.clear();
    this.workspace.tree = null;

    // Read all files' text in parallel
    const entries = await Promise.all(
      fileList.map(async (f) => {
        const path = (f as any).webkitRelativePath || f.name;
        let text = '';
        try { text = await (f as File).text(); } catch { text = ''; }
        const estTokens = estimateTokens(text);
        const wf: WorkspaceFile = { 
          path, 
          name: f.name, 
          isDir: false, 
          size: (f as File).size || 0, 
          text, 
          selected: true, 
          estTokens 
        };
        return wf;
      })
    );

    // Sort by path and populate workspace
    entries.sort((a, b) => a.path.localeCompare(b.path));
    for (const wf of entries) {
      this.workspace.files.push(wf);
      this.workspace.byPath.set(wf.path, wf);
    }

    logger.info('Workspace populated:', {
      totalFiles: this.workspace.files.length,
      samplePaths: this.workspace.files.slice(0, 3).map(f => f.path)
    });

    track('workspace:set', { source, fileCount: this.workspace.files.length, name: this.workspace.name });
    logger.debug('Calling renderTree with', this.workspace.files.length, 'files');
    this.renderTree();
    this.saveWorkspaceSession();
  }

  private triggerOpenFolder(): void {
    track('ui:click_open_folder');
    const folderInput = document.getElementById('folderInput') as HTMLInputElement;
    folderInput?.click();
  }

  loadWorkspaceSession(): boolean {
    const session = loadWorkspaceSession();
    if (!session) return false;

    this.workspace.name = session.name;
    this.workspace.files = session.files;
    this.workspace.byPath.clear();
    
    for (const file of this.workspace.files) {
      this.workspace.byPath.set(file.path, file);
    }

    console.log('✅ Session loaded successfully:', { 
      totalFiles: this.workspace.files.length,
      samplePaths: this.workspace.files.slice(0, 3).map(f => f.path)
    });

    if (session.tree) {
      this.workspace.tree = deserializeTree(session.tree);
    }

    return true;
  }

  saveWorkspaceSession(): void {
    const session: WorkspaceSession = {
      name: this.workspace.name,
      files: this.workspace.files,
      tree: this.workspace.tree ? serializeTree(this.workspace.tree) : null,
      timestamp: Date.now()
    };

    saveWorkspaceSession(session);
  }

  async initializeNewWorkspace(projectName?: string): Promise<void> {
    // Generate a default workspace name based on current date/time or use provided name
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
    const defaultName = projectName || `my-project-${dateStr}-${timeStr}`;

    // Initialize workspace structure
    this.workspace.name = defaultName;
    this.workspace.files = [];
    this.workspace.byPath.clear();
    this.workspace.tree = null;

    // Notify user about auto-workspace creation
    if (this.notificationManager) {
      this.notificationManager.success(`Created new workspace: ${defaultName}`, 'Auto-Workspace Created', 4000);
    }

    logger.info('Auto-initialized new workspace:', { name: defaultName });
    track('workspace:auto-created', { name: defaultName });
  }

  async initializeProjectTemplate(projectType: 'web' | 'react' | 'node' | 'python' | 'basic', projectName?: string): Promise<void> {
    // Initialize workspace first
    await this.initializeNewWorkspace(projectName);

    // Create template files based on project type
    const templates = this.getProjectTemplates();
    const template = templates[projectType] || templates.basic;

    for (const file of template.files) {
      await this.createFileDirectly(file.path, file.content);
    }

    // Invalidate tree to force rebuild and re-render
    this.workspace.tree = null;
    this.renderTree();
    this.saveWorkspaceSession();

    if (this.notificationManager) {
      this.notificationManager.success(`${template.name} project initialized with ${template.files.length} files`, 'Project Template Created', 4000);
    }

    logger.info('Project template created:', { projectType, fileCount: template.files.length });
    track('workspace:template-created', { projectType, name: this.workspace.name });
  }

  private async createFileDirectly(path: string, content: string): Promise<void> {
    // Internal method to create files without checking workspace state or triggering UI updates
    const name = path.split('/').pop() || '';
    const file: WorkspaceFile = {
      path,
      name,
      isDir: false,
      size: content.length,
      text: content,
      selected: true,
      estTokens: estimateTokens(content)
    };
    this.workspace.files.push(file);
    this.workspace.byPath.set(path, file);
  }

  private getProjectTemplates() {
    return {
      web: {
        name: 'Web Project',
        files: [
          {
            path: 'index.html',
            content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Web Project</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header>
        <h1>Welcome to My Web Project</h1>
    </header>
    <main>
        <p>This is a starter template for your web project.</p>
    </main>
    <script src="script.js"></script>
</body>
</html>`
          },
          {
            path: 'styles.css',
            content: `/* Reset and base styles */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: Arial, sans-serif;
    line-height: 1.6;
    color: #333;
    background-color: #f4f4f4;
}

header {
    background-color: #333;
    color: white;
    text-align: center;
    padding: 1rem;
}

main {
    max-width: 1200px;
    margin: 2rem auto;
    padding: 0 1rem;
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    padding: 2rem;
}

h1 {
    margin-bottom: 1rem;
}`
          },
          {
            path: 'script.js',
            content: `// Main JavaScript file
console.log('Web project loaded successfully!');

// Add your JavaScript code here
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded');
    // Your initialization code goes here
});`
          }
        ]
      },
      react: {
        name: 'React Project',
        files: [
          {
            path: 'package.json',
            content: `{
  "name": "my-react-app",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  }
}`
          },
          {
            path: 'src/App.js',
            content: `import React from 'react';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Welcome to React</h1>
        <p>Edit src/App.js and save to reload.</p>
      </header>
    </div>
  );
}

export default App;`
          },
          {
            path: 'src/App.css',
            content: `.App {
  text-align: center;
}

.App-header {
  background-color: #282c34;
  padding: 20px;
  color: white;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: calc(10px + 2vmin);
}

h1 {
  margin-bottom: 1rem;
}`
          },
          {
            path: 'src/index.js',
            content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`
          },
          {
            path: 'public/index.html',
            content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>React App</title>
</head>
<body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
</body>
</html>`
          }
        ]
      },
      basic: {
        name: 'Basic Project',
        files: [
          {
            path: 'README.md',
            content: `# My Project

Welcome to my project! This is a basic template to get you started.

## Getting Started

1. Edit this README file to describe your project
2. Add your project files
3. Start building something amazing!

## File Structure

- \`README.md\` - This file
- Add more files as needed for your project
`
          }
        ]
      }
    };
  }

  setupEventListeners(): void {
    const openFolderBtn = document.getElementById('openFolderBtn');
    const emptyOpenFolderBtn = document.getElementById('emptyOpenFolderBtn');
    const newFileBtn = document.getElementById('newFileBtn');
    const folderInput = document.getElementById('folderInput') as HTMLInputElement;
    const uploadFilesInput = document.getElementById('uploadFilesInput') as HTMLInputElement;
    const dropzone = document.getElementById('explorerDropzone');
    const fileTreeEl = document.getElementById('fileTree');

    // Folder selection
    openFolderBtn?.addEventListener('click', () => this.triggerOpenFolder());
    emptyOpenFolderBtn?.addEventListener('click', () => this.triggerOpenFolder());

    // New file button
    newFileBtn?.addEventListener('click', () => this.showNewFileModal());

    // File inputs
    folderInput?.addEventListener('change', async (e) => {
      const target = e.target as HTMLInputElement;
      const files = Array.from(target.files || []);
      track('input:folder_selected', { count: files.length });
      await this.setWorkspaceFromFileList(files, 'folder-input');
      target.value = '';
    });

    uploadFilesInput?.addEventListener('change', async (e) => {
      const target = e.target as HTMLInputElement;
      const files = Array.from(target.files || []);
      track('input:files_selected', { count: files.length });
      await this.setWorkspaceFromFileList(files, 'file-input');
      target.value = '';
    });

    // Drag and drop
    const preventDefaults = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((evt) => {
      dropzone?.addEventListener(evt, preventDefaults, false);
    });
    
    dropzone?.addEventListener('dragover', () => dropzone.classList.add('dragover'));
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone?.addEventListener('drop', (e: DragEvent) => {
      dropzone.classList.remove('dragover');
      const dt = e.dataTransfer;
      const items = dt?.items;
      
      if (items && items.length) {
        const files: File[] = [];
        Array.from(items).forEach((it) => {
          if (it.kind === 'file') {
            const f = it.getAsFile();
            if (f) files.push(f);
          }
        });
        track('dnd:drop_items', { count: files.length });
        this.setWorkspaceFromFileList(files, 'drag-drop');
      } else if (dt?.files?.length) {
        const files = Array.from(dt.files) as unknown as File[];
        track('dnd:drop_files', { count: files.length });
        this.setWorkspaceFromFileList(files, 'drag-drop');
      }
    });

    // Tree click handler for expand/collapse and file opening
    fileTreeEl?.addEventListener('click', async (e: Event) => {
      const target = e.target as HTMLElement;
      const treeItem = target.closest('.tree-item') as HTMLElement;
      if (!treeItem) return;

      // Check if the click was on the delete button
      if (target.classList.contains('tree-item-delete')) {
        e.preventDefault();
        e.stopPropagation();
        
        const path = treeItem.dataset.path;
        const isDir = treeItem.dataset.isDir === 'true';
        
        if (path) {
          await this.confirmAndDeleteItem(path, isDir);
        }
        return;
      }

      const path = treeItem.dataset.path;
      const isDir = treeItem.dataset.isDir === 'true';

      if (isDir && path) {
        // Handle folder expand/collapse
        this.toggleFolder(path);
      } else if (!isDir && path) {
        // Handle file opening in editor
        const file = this.workspace.byPath.get(path);
        if (file && this.editorManager) {
          console.log('🗂️ Opening file in editor:', path);
          this.editorManager.openFile(file);
          track('file:open', { path: file.path, name: file.name });
        }
      }
    });

    // Tree right-click handler for context menu
    fileTreeEl?.addEventListener('contextmenu', (e) => {
      const target = e.target as HTMLElement;
      const treeItem = target.closest('.tree-item') as HTMLElement;
      if (!treeItem) return;

      const path = treeItem.dataset.path;
      const isDir = treeItem.dataset.isDir === 'true';

      // Only show context menu for files, not directories
      if (!isDir && path) {
        this.showContextMenu(e, path);
      }
    });

    // Virtual scroll handler
    fileTreeEl?.addEventListener('scroll', (e) => {
      const target = e.target as HTMLElement;
      this.virtualScrollState.scrollTop = target.scrollTop;

      // Throttle re-rendering
      clearTimeout(this.virtualScrollState.scrollTimer);
      this.virtualScrollState.scrollTimer = setTimeout(() => {
        if (this.virtualScrollState.totalItems > 50) {
          this.renderVirtualTree();
        }
      }, 16); // ~60fps
    });

    // New file modal event listeners
    const createFileBtn = document.getElementById('createFileBtn');
    const cancelNewFileBtn = document.getElementById('cancelNewFileBtn');
    const newFileNameInput = document.getElementById('newFileName') as HTMLInputElement;

    createFileBtn?.addEventListener('click', () => this.createNewFileFromModal());
    cancelNewFileBtn?.addEventListener('click', () => this.hideNewFileModal());

    // Allow Enter key to create file
    newFileNameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.createNewFileFromModal();
      } else if (e.key === 'Escape') {
        this.hideNewFileModal();
      }
    });

    // Context menu event listeners
    const contextRenameBtn = document.getElementById('contextRenameFile');
    const contextDeleteBtn = document.getElementById('contextDeleteFile');

    contextRenameBtn?.addEventListener('click', async () => await this.renameFile());
    contextDeleteBtn?.addEventListener('click', async () => await this.deleteFileWithConfirmation());

    // Hide context menu when clicking elsewhere
    document.addEventListener('click', (e) => {
      const contextMenu = document.getElementById('fileContextMenu');
      if (contextMenu && !contextMenu.contains(e.target as Node)) {
        this.hideContextMenu();
      }
    });

    // Hide new file modal when clicking backdrop
    const newFileModal = document.getElementById('newFileModal');
    newFileModal?.addEventListener('click', (e) => {
      if (e.target === newFileModal) {
        this.hideNewFileModal();
      }
    });
  }

  async createFile(path: string, content: string): Promise<void> {
    // If no workspace is loaded, initialize a new one
    if (!this.workspace.name && this.workspace.files.length === 0) {
      await this.initializeNewWorkspace();
    }

    if (this.workspace.byPath.has(path)) {
      throw new Error(`File already exists at path: ${path}`);
    }
    const name = path.split('/').pop() || '';
    const file: WorkspaceFile = {
      path,
      name,
      isDir: false,
      size: content.length,
      text: content,
      selected: true,
      estTokens: estimateTokens(content)
    };
    this.workspace.files.push(file);
    this.workspace.byPath.set(path, file);
    this.workspace.tree = null; // Invalidate tree to force rebuild
    this.renderTree(); // Re-render to show the new files
    this.saveWorkspaceSession();
  }

  async updateFileContent(path: string, newContent: string): Promise<void> {
    const file = this.workspace.byPath.get(path);
    if (!file) {
      throw new Error(`File not found at path: ${path}`);
    }
    file.text = newContent;
    file.size = newContent.length;
    file.estTokens = estimateTokens(newContent);

    // If the file is open in the editor, update it
    if (this.editorManager) {
        const openTabs = this.editorManager.getOpenTabs();
        const openTab = openTabs.find((tab: any) => tab.file.path === path);
        if(openTab) {
            this.editorManager.openFile(file);
        }
    }
    this.saveWorkspaceSession();
  }

  async deleteFile(path: string): Promise<void> {
    if (!this.workspace.byPath.has(path)) {
      throw new Error(`File not found at path: ${path}`);
    }
    this.workspace.files = this.workspace.files.filter(f => f.path !== path);
    this.workspace.byPath.delete(path);

    // Close the tab if it's open in the editor
    if (this.editorManager) {
        const openTabs = this.editorManager.getOpenTabs();
        const openTab = openTabs.find((tab: any) => tab.file.path === path);
        if(openTab) {
            this.editorManager.closeFile(openTab.id);
        }
    }

    this.workspace.tree = null; // Invalidate tree to force rebuild
    this.saveWorkspaceSession();
  }

  backupWorkspaceState(): void {
    const session: WorkspaceSession = {
      name: this.workspace.name,
      files: this.workspace.files,
      tree: this.workspace.tree ? serializeTree(this.workspace.tree) : null,
      timestamp: Date.now()
    };
    this.saveWorkspaceBackup(session);
    const undoBtn = document.getElementById('undoChangesBtn') as HTMLButtonElement;
    if (undoBtn) undoBtn.disabled = false;
  }

  restoreWorkspaceState(): void {
    const backup = this.loadWorkspaceBackup();
    if (backup) {
      this.workspace.name = backup.name;
      this.workspace.files = backup.files;
      this.workspace.byPath.clear();
      for (const file of this.workspace.files) {
        this.workspace.byPath.set(file.path, file);
      }
      this.workspace.tree = backup.tree ? deserializeTree(backup.tree) : null;

      this.renderTree();
      this.saveWorkspaceSession();
      this.clearWorkspaceBackup(); // Backup is a one-time use
      const undoBtn = document.getElementById('undoChangesBtn') as HTMLButtonElement;
      if (undoBtn) undoBtn.disabled = true;
      console.log('Workspace state restored from backup.');
    }
  }

  private saveWorkspaceBackup(session: WorkspaceSession): void {
    try {
      localStorage.setItem('lamp_workspace_backup_v1', JSON.stringify(session));
    } catch (error) {
      console.error('Failed to save workspace backup:', error);
    }
  }

  private loadWorkspaceBackup(): WorkspaceSession | null {
    try {
      const raw = localStorage.getItem('lamp_workspace_backup_v1');
      if (raw) return JSON.parse(raw) as WorkspaceSession;
    } catch (error) {
      console.warn('Failed to load workspace backup:', error);
    }
    return null;
  }

  private clearWorkspaceBackup(): void {
    localStorage.removeItem('lamp_workspace_backup_v1');
  }

  // Show new file modal
  showNewFileModal(): void {
    const modal = document.getElementById('newFileModal');
    const input = document.getElementById('newFileName') as HTMLInputElement;
    if (modal && input) {
      modal.style.display = 'grid';
      input.value = '';
      input.focus();
    }
  }

  // Hide new file modal
  hideNewFileModal(): void {
    const modal = document.getElementById('newFileModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  // Create new file from modal input
  async createNewFileFromModal(): Promise<void> {
    const input = document.getElementById('newFileName') as HTMLInputElement;
    const fileName = input.value.trim();

    if (!fileName) {
      this.notificationManager?.error('Please enter a file name');
      return;
    }

    // Validate file name
    if (fileName.includes('/') || fileName.includes('\\')) {
      this.notificationManager?.error('File name cannot contain path separators. Use only the file name.');
      return;
    }

    try {
      await this.createFile(fileName, '');
      this.hideNewFileModal();

      // Open the new file in the editor
      const file = this.workspace.byPath.get(fileName);
      if (file && this.editorManager) {
        this.editorManager.openFile(file);
      }
    } catch (error) {
      this.notificationManager?.error(`Failed to create file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Show context menu for file operations
  showContextMenu(event: MouseEvent, filePath: string): void {
    event.preventDefault();
    event.stopPropagation();

    const contextMenu = document.getElementById('fileContextMenu');
    if (!contextMenu) return;

    this.contextMenuTarget = filePath;

    // Position the context menu
    contextMenu.style.display = 'block';
    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.top = `${event.clientY}px`;

    // Adjust position if menu would go off screen
    const rect = contextMenu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (rect.right > viewportWidth) {
      contextMenu.style.left = `${event.clientX - rect.width}px`;
    }
    if (rect.bottom > viewportHeight) {
      contextMenu.style.top = `${event.clientY - rect.height}px`;
    }
  }

  // Hide context menu
  hideContextMenu(): void {
    const contextMenu = document.getElementById('fileContextMenu');
    if (contextMenu) {
      contextMenu.style.display = 'none';
    }
    this.contextMenuTarget = null;
  }

  // Delete file with confirmation
  async deleteFileWithConfirmation(): Promise<void> {
    if (!this.contextMenuTarget) return;

    const file = this.workspace.byPath.get(this.contextMenuTarget);
    if (!file) return;

    const confirmed = await this.notificationManager?.confirm({
      title: 'Delete File',
      message: `Are you sure you want to delete "${file.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });
    if (!confirmed) return;

    try {
      await this.deleteFile(this.contextMenuTarget);
      this.hideContextMenu();
    } catch (error) {
      this.notificationManager?.error(`Failed to delete file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Confirm and delete item (file or directory) from tree
  async confirmAndDeleteItem(path: string, isDirectory: boolean): Promise<void> {
    const itemType = isDirectory ? 'folder' : 'file';
    const itemName = path.split('/').pop() || path;
    
    let confirmMessage = `Are you sure you want to delete the ${itemType} "${itemName}"?`;
    if (isDirectory) {
      confirmMessage += ` This will delete all files and subfolders within it.`;
    }
    confirmMessage += ` This action cannot be undone.`;

    const confirmed = await this.notificationManager?.confirm({
      title: `Delete ${itemType}`,
      message: confirmMessage,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });
    if (!confirmed) return;

    try {
      if (isDirectory) {
        await this.deleteDirectory(path);
      } else {
        await this.deleteFile(path);
      }
      this.renderTree(); // Re-render the tree after deletion
      track('item:delete', { path, isDirectory, name: itemName });
    } catch (error) {
      this.notificationManager?.error(`Failed to delete ${itemType}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Delete directory and all its contents
  async deleteDirectory(dirPath: string): Promise<void> {
    // Find all files that start with this directory path
    const filesToDelete = this.workspace.files.filter(file => 
      file.path === dirPath || file.path.startsWith(dirPath + '/')
    );

    if (filesToDelete.length === 0) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    // Close any open tabs for files in this directory
    if (this.editorManager) {
      const openTabs = this.editorManager.getOpenTabs();
      for (const file of filesToDelete) {
        const openTab = openTabs.find((tab: any) => tab.file.path === file.path);
        if (openTab) {
          this.editorManager.closeFile(openTab.id);
        }
      }
    }

    // Remove all files in the directory
    for (const file of filesToDelete) {
      this.workspace.files = this.workspace.files.filter(f => f.path !== file.path);
      this.workspace.byPath.delete(file.path);
    }

    this.workspace.tree = null; // Invalidate tree to force rebuild
    this.saveWorkspaceSession();
  }

  // Rename file (placeholder for future implementation)
  async renameFile(): Promise<void> {
    if (!this.contextMenuTarget) return;

    const file = this.workspace.byPath.get(this.contextMenuTarget);
    if (!file) return;

    const newName = await this.notificationManager?.prompt({
      title: 'Rename File',
      message: `Rename "${file.name}" to:`,
      defaultValue: file.name,
      placeholder: 'Enter new file name',
      confirmText: 'Rename',
      cancelText: 'Cancel'
    });
    if (!newName || newName === file.name) return;

    // For now, just show a message that this feature is coming soon
    this.notificationManager?.info('Rename functionality is coming soon! For now, you can delete the file and create a new one with the desired name.');
  }

  // Debug helpers - only available in debug mode
  setupDebugHelpers(): void {
    if (!DEBUG_CONFIG.enabled) return;

    (window as any).__debugWorkspace = () => {
      const workspaceState = {
        name: this.workspace.name,
        fileCount: this.workspace.files.length,
        files: this.workspace.files.map(f => ({ path: f.path, size: f.size })),
        tree: this.workspace.tree ? 'exists' : 'null',
        byPath: this.workspace.byPath.size + ' entries'
      };
      logger.info('Current workspace state:', workspaceState);
      return workspaceState;
    };

    (window as any).__debugUI = () => {
      const emptyEl = document.getElementById('explorerEmptyState');
      const treeEl = document.getElementById('fileTree');
      const uiState = {
        emptyState: {
          exists: !!emptyEl,
          hidden: emptyEl?.hidden,
          display: emptyEl?.style.display,
          visible: emptyEl && !emptyEl.hidden && emptyEl.style.display !== 'none'
        },
        fileTree: {
          exists: !!treeEl,
          hidden: treeEl?.hidden,
          display: treeEl?.style.display,
          visible: treeEl && !treeEl.hidden && treeEl.style.display !== 'none',
          hasContent: (treeEl?.innerHTML?.length || 0) > 0
        }
      };
      logger.info('UI Elements state:', uiState);
      return uiState;
    };
  }
}
