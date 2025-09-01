// Context selection and processing module
import { 
  ContextSettings, 
  ContextMessage, 
  ContextStats, 
  WorkspaceFile, 
  DEFAULT_CONTEXT_SETTINGS 
} from './types.js';
import { loadContextSettings, saveContextSettings } from './storage.js';
import { truncateToTokens, trapFocus } from './utils.js';

export class ContextManager {
  private ctx: ContextSettings;
  private workspace: { files: WorkspaceFile[] };
  private focusTrap: (() => void) | null = null;

  constructor(workspace: { files: WorkspaceFile[] }) {
    this.ctx = loadContextSettings();
    this.workspace = workspace;
  }

  getContextSettings(): ContextSettings {
    return { ...this.ctx };
  }

  updateContextToggleUI(): void {
    const toggleContextBtn = document.getElementById('toggleContextBtn');
    if (toggleContextBtn) {
      const count = this.workspace.files.filter(f => f.selected).length;
      toggleContextBtn.textContent = `Context: ${this.ctx.enabled ? `On (${count})` : 'Off'}`;
      toggleContextBtn.setAttribute('aria-pressed', this.ctx.enabled.toString());
    }
  }

  toggleContext(): void {
    this.ctx.enabled = !this.ctx.enabled;
    this.saveSettings();
  }

  private saveSettings(): void {
    saveContextSettings(this.ctx);
    this.updateContextToggleUI();
  }

  applyGuardrailsSelection(): void {
    // Enforce max file count and overall token budget by auto-deselecting overflow at the end
    let selectedCount = 0;
    let tokenBudget = this.ctx.maxContextTokens;
    const selected: WorkspaceFile[] = [];
    
    for (const wf of this.workspace.files) {
      if (!wf.selected) continue;
      selectedCount++;
      selected.push(wf);
    }
    
    // If too many files, keep earliest up to maxFiles
    if (selectedCount > this.ctx.maxFiles) {
      const toKeep = new Set(selected.slice(0, this.ctx.maxFiles).map(f => f.path));
      for (const wf of this.workspace.files) {
        wf.selected = wf.selected && toKeep.has(wf.path);
      }
    }
    
    // Recompute after file cap
    const selectedAfterCap = this.workspace.files.filter(f => f.selected);
    
    // Enforce token budget: walk and keep until budget exhausted
    let used = 0;
    for (const wf of selectedAfterCap) {
      const take = Math.min(wf.estTokens || 0, this.ctx.maxTokensPerFile);
      if (used + take <= tokenBudget) {
        used += take;
      } else {
        // Deselect files that would exceed budget
        wf.selected = false;
      }
    }
    
    // Persist selection paths
    this.ctx.selectedPaths = this.workspace.files.filter(f => f.selected).map(f => f.path);
    this.saveSettings();
  }

  private buildContextSummary(): string {
    const selected = this.workspace.files.filter(f => f.selected);
    const totalTokens = selected.reduce((acc, f) => acc + Math.min(f.estTokens || 0, this.ctx.maxTokensPerFile), 0);
    const overFiles = selected.length > this.ctx.maxFiles;
    const overTokens = totalTokens > this.ctx.maxContextTokens;
    
    const parts: string[] = [];
    parts.push(`${selected.length} selected / ${this.workspace.files.length} files`);
    parts.push(`~${totalTokens} tokens (max ${this.ctx.maxContextTokens})`);
    if (overFiles) parts.push('exceeds file limit');
    if (overTokens) parts.push('exceeds token budget');
    
    return parts.join(' • ');
  }

  openContextModal(): void {
    const contextModal = document.getElementById('contextModal');
    const contextListEl = document.getElementById('contextList');
    const contextSummaryEl = document.getElementById('contextSummary');
    
    if (!contextModal || !contextListEl || !contextSummaryEl) return;
    
    contextModal.removeAttribute('hidden');
    if (contextModal) {
      this.focusTrap = trapFocus(contextModal);
    }

    const summary = this.buildContextSummary();
    contextSummaryEl.textContent = summary;

    // Build list with checkboxes
    const frag = document.createDocumentFragment();
    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '6px';

    for (const wf of this.workspace.files) {
      const row = document.createElement('label');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.fontSize = '12px';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!wf.selected;
      cb.id = `file-${wf.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
      cb.setAttribute('aria-describedby', `meta-${cb.id}`);
      cb.addEventListener('change', () => {
        wf.selected = cb.checked;
        // Do not auto-enforce on every toggle; allow over-selection and show warning in summary
        contextSummaryEl.textContent = this.buildContextSummary();
      });

      const name = document.createElement('span');
      name.textContent = wf.path;

      const meta = document.createElement('span');
      meta.style.color = '#78716C';
      meta.id = `meta-${cb.id}`;
      meta.textContent = `(${wf.size} bytes, ~${wf.estTokens ?? 0} tokens)`;

      row.setAttribute('for', cb.id);
      row.appendChild(cb);
      row.appendChild(name);
      row.appendChild(meta);
      list.appendChild(row);
    }

    frag.appendChild(list);
    contextListEl.innerHTML = '';
    contextListEl.appendChild(frag);
  }

  closeContextModal(): void {
    const contextModal = document.getElementById('contextModal');
    const previewContextBtn = document.getElementById('previewContextBtn');
    
    contextModal?.setAttribute('hidden', '');
    if (this.focusTrap) {
      this.focusTrap();
      this.focusTrap = null;
    }
    previewContextBtn?.focus();
  }

  saveContextSelection(): void {
    // Apply guardrails and persist selection
    this.applyGuardrailsSelection();
    const contextSummaryEl = document.getElementById('contextSummary');
    if (contextSummaryEl) {
      contextSummaryEl.textContent = this.buildContextSummary();
    }
    this.closeContextModal();
  }

  buildContextMessage(): { contextMessage?: ContextMessage; contextStats?: ContextStats } {
    if (!this.ctx.enabled) return {};
    const selected = this.workspace.files.filter(f => f.selected);
    if (!selected.length) return {};

    // Enforce limits at send time: include files until budget; allow last file partial truncate
    let remaining = this.ctx.maxContextTokens;
    const lines: string[] = [];
    let included = 0;
    let totalTokens = 0;
    let truncatedCount = 0;

    for (const wf of selected) {
      if (!wf.text) continue;
      if (remaining <= 0) break;
      
      const fileBudget = Math.min(this.ctx.maxTokensPerFile, remaining);
      const { text, tokens, truncated } = truncateToTokens(wf.text, fileBudget);
      if (tokens <= 0) continue;
      
      lines.push(`File: ${wf.path}\n\n\`\`\`\n${text}\n\`\`\``);
      remaining -= tokens;
      totalTokens += tokens;
      included += 1;
      if (truncated) truncatedCount += 1;
      if (included >= this.ctx.maxFiles) break;
    }

    if (!lines.length) return {};

    const header = `**CODEBASE CONTEXT**

The following files from the workspace are provided for your analysis. Please:

- **Analyze the structure**: Consider how these files relate to each other, their imports, exports, and dependencies
- **Understand the architecture**: Identify patterns, frameworks, and coding conventions used
- **Reference specific locations**: When making suggestions, reference specific files and line numbers
- **Consider impact**: Think about how changes might affect other parts of the codebase
- **Provide context-aware solutions**: Ensure your recommendations fit within the existing project structure

**Workspace Files:**

`;
    const content = header + lines.join('\n\n');
    return { 
      contextMessage: { role: 'user', content }, 
      contextStats: { selected: included, tokens: totalTokens, truncated: truncatedCount } 
    };
  }

  // Initialize context selection when workspace is loaded
  initializeSelection(): void {
    if (this.ctx.selectedPaths.length) {
      const selectedSet = new Set(this.ctx.selectedPaths);
      for (const wf of this.workspace.files) {
        wf.selected = selectedSet.has(wf.path);
      }
    } else {
      for (const wf of this.workspace.files) {
        wf.selected = true;
      }
    }
    this.applyGuardrailsSelection();
  }

  setupEventListeners(): void {
    const toggleContextBtn = document.getElementById('toggleContextBtn');
    const previewContextBtn = document.getElementById('previewContextBtn');
    const closeContextBtn = document.getElementById('closeContextBtn');
    const saveContextSelectionBtn = document.getElementById('saveContextSelectionBtn');
    const contextModal = document.getElementById('contextModal');

    toggleContextBtn?.addEventListener('click', () => this.toggleContext());
    previewContextBtn?.addEventListener('click', () => this.openContextModal());
    closeContextBtn?.addEventListener('click', () => this.closeContextModal());
    contextModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => this.closeContextModal());
    saveContextSelectionBtn?.addEventListener('click', () => this.saveContextSelection());

    // Initialize UI
    this.updateContextToggleUI();
  }
}
