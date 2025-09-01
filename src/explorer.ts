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
    const emptyStateEl = document.getElementById('explorerEmptyState');
    const fileTreeEl = document.getElementById('fileTree');
    if (emptyStateEl) {
      emptyStateEl.hidden = false;
      emptyStateEl.style.display = 'flex';
    }
    if (fileTreeEl) {
      fileTreeEl.hidden = true;
      fileTreeEl.style.display = 'none';
      fileTreeEl.innerHTML = '';
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
      const parts = file.path.split('/').filter(Boolean);
      let current = root;
      let currentPath = '';
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLast = i === parts.length - 1;
        if (!current.children.has(part)) {
          current.children.set(part, {
            name: part,
            path: currentPath,
            isDir: !isLast,
            children: new Map(),
            expanded: false,
            level: i,
            ...(isLast ? { file } : {})
          });
        }
        current = current.children.get(part)!;
        if (isLast) current.file = file;
      }
    }
    return root;
  }

  private flattenTreeForDisplay(node: TreeNode): TreeNode[] {
    const result: TreeNode[] = [];
    const stack: TreeNode[] = [];
    const pushChildren = (parent: TreeNode) => {
      const children = Array.from(parent.children.values()).sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    };
    pushChildren(node);
    while (stack.length) {
      const cur = stack.pop()!;
      result.push(cur);
      if (cur.isDir && cur.expanded) pushChildren(cur);
    }
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
    li.setAttribute('role', 'treeitem');
    li.setAttribute('tabindex', '-1');
    li.setAttribute('aria-label', `${node.isDir ? 'Folder' : 'File'}: ${node.name}`);
    if (node.isDir) {
      li.setAttribute('aria-expanded', node.expanded.toString());
      const chevron = node.expanded ? 'fa-chevron-down' : 'fa-chevron-right';
      li.innerHTML = `<i class="chevron fa-solid ${chevron}" aria-hidden="true"></i> ${iconForFile(node.name, node.isDir)} <span class="tree-item-name">${node.name}</span>`;
    } else {
      li.innerHTML = `<span class="chevron-spacer" aria-hidden="true"></span> ${iconForFile(node.name, node.isDir)} <span class="tree-item-name">${node.name}</span>`;
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
    if (totalItems === 0) {
      fileTreeEl.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">No files to display</div>';
      return;
    }
    if (totalItems <= 50) {
      this.renderRegularTree(flatNodes);
      return;
    }
    const totalHeight = totalItems * itemHeight;
    fileTreeEl.style.height = `${Math.min(totalHeight, 400)}px`;
    fileTreeEl.style.position = 'relative';
    fileTreeEl.style.overflowY = 'auto';
    let virtualContainer = fileTreeEl.querySelector('.virtual-container') as HTMLElement;
    if (!virtualContainer) {
      virtualContainer = document.createElement('div');
      virtualContainer.className = 'virtual-container';
      fileTreeEl.appendChild(virtualContainer);
    }
    virtualContainer.style.height = `${totalHeight}px`;
    virtualContainer.style.position = 'relative';
    const visibleCount = endIndex - startIndex + 1;
    while (this.virtualItemsPool.length < visibleCount) {
      this.virtualItemsPool.push(this.createTreeItem({} as TreeNode));
    }
    for (let i = 0; i < visibleCount; i++) {
      const nodeIndex = startIndex + i;
      if (nodeIndex >= flatNodes.length) break;
      const node = flatNodes[nodeIndex];
      const li = this.virtualItemsPool[i];
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
        li.innerHTML = `<i class="chevron fa-solid ${chevron}" aria-hidden="true"></i> ${iconForFile(node.name, node.isDir)} <span class="tree-item-name">${node.name}</span>`;
        li.setAttribute('aria-expanded', node.expanded.toString());
      } else {
        li.innerHTML = `<span class="chevron-spacer" aria-hidden="true"></span> ${iconForFile(node.name, node.isDir)} <span class="tree-item-name">${node.name}</span>`;
      }
      virtualContainer.appendChild(li);
    }
    while (virtualContainer.children.length > visibleCount) {
      virtualContainer.lastChild?.remove();
    }
  }

  renderTree(): void {
    if (!this.workspace.files.length) {
      return this.renderEmpty();
    }
    if (!this.prepareTreeUI()) return;
    this.ensureTreeStructure();
    if (!this.workspace.tree) return;
    this.renderTreeContent();
  }

  private prepareTreeUI(): boolean {
    const emptyStateEl = document.getElementById('explorerEmptyState');
    const fileTreeEl = document.getElementById('fileTree');
    if (emptyStateEl) {
      emptyStateEl.hidden = true;
      emptyStateEl.style.display = 'none';
    }
    if (!fileTreeEl) return false;
    fileTreeEl.hidden = false;
    fileTreeEl.style.display = 'block';
    return true;
  }

  private ensureTreeStructure(): void {
    if (!this.workspace.tree) {
      this.workspace.tree = this.buildTree(this.workspace.files);
    }
  }

  private renderTreeContent(): void {
    if (!this.workspace.tree) return;
    const nodes = this.flattenTreeForDisplay(this.workspace.tree);
    this.virtualScrollState.flatNodes = nodes;
    this.virtualScrollState.totalItems = nodes.length;
    const useVirtualScrolling = nodes.length > 50;
    if (useVirtualScrolling) {
      this.renderVirtualTree();
    } else {
      this.renderRegularTree(nodes);
    }
  }

  private toggleFolder(path: string): void {
    if (!this.workspace.tree) return;
    const findNode = (node: TreeNode, target: string): TreeNode | null => {
      if (node.path === target) return node;
      for (const child of node.children.values()) {
        const found = findNode(child, target);
        if (found) return found;
      }
      return null;
    };
    const node = findNode(this.workspace.tree, path);
    if (node && node.isDir) {
      node.expanded = !node.expanded;
      this.renderTree();
      this.saveWorkspaceSession();
    }
  }

  async setWorkspaceFromFileList(fileList: File[], source = 'unknown'): Promise<void> {
    if (!fileList || !fileList.length) return;
    let rootName: string | null = null;
    const first = fileList[0] as any;
    if (first.webkitRelativePath) {
      const parts = (first.webkitRelativePath as string).split('/');
      rootName = parts[0] || null;
    }
    this.workspace.name = rootName;
    this.workspace.files = [];
    this.workspace.byPath.clear();
    this.workspace.tree = null;
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
    entries.sort((a, b) => a.path.localeCompare(b.path));
    for (const wf of entries) {
      this.workspace.files.push(wf);
      this.workspace.byPath.set(wf.path, wf);
    }
    track('workspace:set', { source, fileCount: this.workspace.files.length, name: this.workspace.name });
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

    openFolderBtn?.addEventListener('click', () => this.triggerOpenFolder());
    emptyOpenFolderBtn?.addEventListener('click', () => this.triggerOpenFolder());

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

    fileTreeEl?.addEventListener('click', async (e: Event) => {
      const target = e.target as HTMLElement;
      const treeItem = target.closest('.tree-item') as HTMLElement;
      if (!treeItem) return;
      const path = treeItem.dataset.path;
      const isDir = treeItem.dataset.isDir === 'true';
      if (isDir && path) {
        this.toggleFolder(path);
      } else if (!isDir && path) {
        const file = this.workspace.byPath.get(path);
        if (file && this.editorManager) {
          this.editorManager.openFile(file);
          track('file:open', { path: file.path, name: file.name });
        }
      }
    });

    fileTreeEl?.addEventListener('scroll', (e) => {
      const target = e.target as HTMLElement;
      this.virtualScrollState.scrollTop = target.scrollTop;
      clearTimeout(this.virtualScrollState.scrollTimer);
      this.virtualScrollState.scrollTimer = setTimeout(() => {
        if (this.virtualScrollState.totalItems > 50) {
          this.renderVirtualTree();
        }
      }, 16);
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
  }
}
