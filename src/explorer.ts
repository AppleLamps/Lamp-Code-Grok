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
  private virtualScrollState: VirtualScrollState;
  private editorManager: any = null; // Will be injected

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
      li.innerHTML = `<i class="chevron fa-solid ${chevron}" aria-hidden="true"></i> ${iconForFile(node.name, node.isDir)} ${node.name}`;
    } else {
      li.innerHTML = `<span class="chevron-spacer" aria-hidden="true"></span> ${iconForFile(node.name, node.isDir)} ${node.name}`;
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
    
    // Set container height to enable scrolling
    const totalHeight = totalItems * itemHeight;
    fileTreeEl.style.height = `${Math.min(totalHeight, 400)}px`; // Max height of 400px
    fileTreeEl.style.position = 'relative';
    fileTreeEl.style.overflowY = 'auto';
    
    // Create virtual scroller wrapper
    fileTreeEl.innerHTML = '';
    const virtualContainer = document.createElement('div');
    virtualContainer.style.height = `${totalHeight}px`;
    virtualContainer.style.position = 'relative';
    
    // Render visible items
    for (let i = startIndex; i <= endIndex; i++) {
      if (i >= 0 && i < flatNodes.length) {
        const node = flatNodes[i];
        const li = this.createTreeItem(node);
        li.style.position = 'absolute';
        li.style.top = `${i * itemHeight}px`;
        li.style.width = '100%';
        li.style.height = `${itemHeight}px`;
        virtualContainer.appendChild(li);
      }
    }
    
    fileTreeEl.appendChild(virtualContainer);
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

    // Enable virtual scrolling for large trees (more than 100 items)
    const useVirtualScrolling = nodes.length > 100;

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

  setupEventListeners(): void {
    const openFolderBtn = document.getElementById('openFolderBtn');
    const emptyOpenFolderBtn = document.getElementById('emptyOpenFolderBtn');
    const folderInput = document.getElementById('folderInput') as HTMLInputElement;
    const uploadFilesInput = document.getElementById('uploadFilesInput') as HTMLInputElement;
    const dropzone = document.getElementById('explorerDropzone');
    const fileTreeEl = document.getElementById('fileTree');

    // Folder selection
    openFolderBtn?.addEventListener('click', () => this.triggerOpenFolder());
    emptyOpenFolderBtn?.addEventListener('click', () => this.triggerOpenFolder());

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
    fileTreeEl?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const treeItem = target.closest('.tree-item') as HTMLElement;
      if (!treeItem) return;

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

    // Virtual scroll handler
    fileTreeEl?.addEventListener('scroll', (e) => {
      const target = e.target as HTMLElement;
      this.virtualScrollState.scrollTop = target.scrollTop;
      
      // Throttle re-rendering
      clearTimeout(this.virtualScrollState.scrollTimer);
      this.virtualScrollState.scrollTimer = setTimeout(() => {
        if (this.virtualScrollState.totalItems > 100) {
          this.renderVirtualTree();
        }
      }, 16); // ~60fps
    });
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
