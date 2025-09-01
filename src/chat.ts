// Chat functionality and OpenRouter integration module
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { ChatMessage, ContextMessage, ContextStats } from './types.js';
import { loadHistory, saveHistory } from './storage.js';
import { el } from './utils.js';
import type { SettingsManager } from './settings.js';
import type { ExplorerManager } from './explorer.js';

// JSON Schema for file operations using OpenRouter's Structured Outputs
const FILE_OPERATIONS_SCHEMA = {
  name: 'file_operations',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: ['create_file', 'edit_file', 'delete_file'],
              description: "The type of file operation to perform."
            },
            path: {
              type: 'string',
              description: "The full path of the file to operate on."
            },
            content: {
              type: 'string',
              description: "The file content. Required for 'create_file' and 'edit_file'."
            }
          },
          required: ['operation', 'path']
        }
      }
    },
    required: ['operations']
  }
};

// Configure DOMPurify to add security attributes to links
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('rel', 'noopener noreferrer');
    if (!node.getAttribute('target')) {
      node.setAttribute('target', '_blank');
    }
  }
});

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Create a safe markdown renderer function
const renderMarkdown = (content: string): string => {
  const html = marked.parse(content);
  return DOMPurify.sanitize(html);
};

// Add copy functionality to code blocks
const addCopyButtons = (element: HTMLElement): void => {
  const preElements = element.querySelectorAll('pre');
  preElements.forEach((pre) => {
    // Skip if already has a copy button
    if (pre.querySelector('.copy-button')) return;

    // Wrap pre in a container
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';
    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    // Create copy button
    const copyButton = document.createElement('button');
    copyButton.className = 'copy-button';
    copyButton.textContent = 'Copy';
    copyButton.setAttribute('aria-label', 'Copy code to clipboard');

    // Add click handler
    copyButton.addEventListener('click', async () => {
      const code = pre.textContent || '';
      try {
        await navigator.clipboard.writeText(code);
        copyButton.textContent = 'Copied!';
        copyButton.classList.add('copied');
        setTimeout(() => {
          copyButton.textContent = 'Copy';
          copyButton.classList.remove('copied');
        }, 2000);
      } catch (err) {
        console.error('Failed to copy code:', err);
        copyButton.textContent = 'Failed';
        setTimeout(() => {
          copyButton.textContent = 'Copy';
        }, 2000);
      }
    });

    wrapper.appendChild(copyButton);
  });
};

export class ChatManager {
  private messages: ChatMessage[] = [];
  private abortController: AbortController | null = null;
  private settingsManager: SettingsManager;
  private explorerManager: ExplorerManager;
  private contextProvider: (() => { contextMessage?: ContextMessage; contextStats?: ContextStats }) | null = null;
  private lastExecutedOperations: any[] = [];
  private notificationManager: any = null; // Will be injected
  private debugMode: boolean = false;

  constructor(settingsManager: SettingsManager, explorerManager: ExplorerManager) {
    this.settingsManager = settingsManager;
    this.explorerManager = explorerManager;
    this.messages = loadHistory();
  }

  setContextProvider(provider: () => { contextMessage?: ContextMessage; contextStats?: ContextStats }): void {
    this.contextProvider = provider;
  }

  setNotificationManager(notificationManager: any): void {
    this.notificationManager = notificationManager;
  }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    if (this.debugMode && this.notificationManager) {
      this.notificationManager.info('Debug mode enabled for file operations', 'Debug Mode');
    } else if (!this.debugMode && this.notificationManager) {
      this.notificationManager.info('Debug mode disabled for file operations', 'Debug Mode');
    }
  }

  get isDebugMode(): boolean {
    return this.debugMode;
  }

  private cleanCodeContent(content: string): string {
    if (!content) return '';
    
    return content
      // Remove opening code fence with optional language
      .replace(/^```[\w]*\s*\n?/gm, '')
      // Remove closing code fence
      .replace(/\n?```\s*$/gm, '')
      // Remove filename comments (common AI patterns)
      .replace(/^\/\/ filename:.*$/gmi, '')
      .replace(/^# .*\.(js|ts|html|css|py|java|cpp|c|h|php|rb|go|rs|swift|kt|dart|vue|jsx|tsx|json|xml|yaml|yml|md|txt|sh|bat|ps1)\s*$/gmi, '')
      // Remove "file: path" comments
      .replace(/^\/\/ file: .*$/gmi, '')
      .replace(/^<!-- file: .* -->$/gmi, '')
      // Clean up extra whitespace
      .replace(/^\s*\n+/, '') // Remove leading newlines
      .replace(/\n+\s*$/, '') // Remove trailing newlines
      .trim();
  }

  private isValidFilePath(path: string): boolean {
    if (!path || typeof path !== 'string') return false;
    
    // Remove quotes and trim
    path = path.replace(/[`"']/g, '').trim();
    
    // Basic security checks
    if (path.includes('..') || path.startsWith('/') || path.includes('\\')) return false;
    
    // Must have a valid extension
    if (!/\.[a-zA-Z0-9]+$/.test(path)) return false;
    
    // Must not be empty after cleaning
    if (path.length === 0) return false;
    
    return true;
  }

  private extractFileOperationsFromMarkdown(content: string): any[] {
    const operations: any[] = [];
    
    // Pattern 1: **FILE OPERATION:** format (preferred)
    const operationPattern = /\*\*FILE OPERATION:\s*(CREATE|EDIT|DELETE)\*\*\s*\n?Path:\s*([^\n]+)\s*\n?(```[\w]*\s*\n?([\s\S]*?)```)?/gi;
    
    // Pattern 2: "Create file: path" format  
    const createPattern = /(?:create|add|new)\s+(?:file|a file):?\s*[`"]?([^`"\n]+)[`"]?\s*[\n\r]*```[\w]*\s*\n?([\s\S]*?)```/gi;
    
    // Pattern 3: "Edit file: path" format
    const editPattern = /(?:edit|update|modify)\s+(?:file|a file):?\s*[`"]?([^`"\n]+)[`"]?\s*[\n\r]*```[\w]*\s*\n?([\s\S]*?)```/gi;
    
    // Pattern 4: "Delete file: path" format
    const deletePattern = /(?:delete|remove)\s+(?:file|a file):?\s*[`"]?([^`"\n]+)[`"]?/gi;
    
    // Pattern 5: Heading-based pattern (filename as heading followed by code block)
    const headingPattern = /^#+\s*([^\n]+\.(js|ts|html|css|py|java|cpp|c|h|php|rb|go|rs|swift|kt|dart|vue|jsx|tsx|json|xml|yaml|yml|md|txt|sh|bat|ps1))\s*\n+```[\w]*\s*\n?([\s\S]*?)```/gmi;
    
    // Pattern 6: Inline code pattern (filename in backticks followed by content)
    const inlinePattern = /`([^`]+\.(js|ts|html|css|py|java|cpp|c|h|php|rb|go|rs|swift|kt|dart|vue|jsx|tsx|json|xml|yaml|yml|md|txt|sh|bat|ps1))`[:\s]*\n*```[\w]*\s*\n?([\s\S]*?)```/gi;
    
    // Pattern 7: Save/write file pattern
    const savePattern = /(?:save|write)\s+(?:to|as|file|this as):?\s*[`"]?([^`"\n]+)[`"]?\s*[\n\r]*```[\w]*\s*\n?([\s\S]*?)```/gi;
    
    let match;
    
    // Apply Pattern 1 (preferred format)
    while ((match = operationPattern.exec(content)) !== null) {
      const operation = match[1].toLowerCase() + '_file';
      const path = match[2].trim().replace(/[`"']/g, '');
      const fileContent = match[4] ? this.cleanCodeContent(match[4]) : '';
      
      if (this.isValidFilePath(path)) {
        operations.push({
          operation,
          path,
          content: fileContent || undefined
        });
      }
    }
    
    // Apply other patterns if no preferred format found
    if (operations.length === 0) {
      // Pattern 2: Create format
      createPattern.lastIndex = 0;
      while ((match = createPattern.exec(content)) !== null) {
        const path = match[1].trim().replace(/[`"']/g, '');
        const fileContent = match[2] ? this.cleanCodeContent(match[2]) : '';
        
        if (this.isValidFilePath(path)) {
          operations.push({
            operation: 'create_file',
            path: path,
            content: fileContent
          });
        }
      }
      
      // Pattern 3: Edit format
      editPattern.lastIndex = 0;
      while ((match = editPattern.exec(content)) !== null) {
        const path = match[1].trim().replace(/[`"']/g, '');
        const fileContent = match[2] ? this.cleanCodeContent(match[2]) : '';
        
        if (this.isValidFilePath(path)) {
          operations.push({
            operation: 'edit_file',
            path: path,
            content: fileContent
          });
        }
      }
      
      // Pattern 4: Delete format
      deletePattern.lastIndex = 0;
      while ((match = deletePattern.exec(content)) !== null) {
        const path = match[1].trim().replace(/[`"']/g, '');
        
        if (this.isValidFilePath(path)) {
          operations.push({
            operation: 'delete_file',
            path: path
          });
        }
      }
    }
    
    // Apply additional patterns if still no operations found
    if (operations.length === 0) {
      // Pattern 5: Heading-based
      headingPattern.lastIndex = 0;
      while ((match = headingPattern.exec(content)) !== null) {
        const path = match[1].trim().replace(/[`"']/g, '');
        const fileContent = match[3] ? this.cleanCodeContent(match[3]) : '';
        
        if (this.isValidFilePath(path)) {
          operations.push({
            operation: 'create_file', // Default to create for heading-based
            path: path,
            content: fileContent
          });
        }
      }
      
      // Pattern 6: Inline code
      inlinePattern.lastIndex = 0;
      while ((match = inlinePattern.exec(content)) !== null) {
        const path = match[1].trim();
        const fileContent = match[3] ? this.cleanCodeContent(match[3]) : '';
        
        if (this.isValidFilePath(path)) {
          operations.push({
            operation: 'create_file', // Default to create for inline
            path: path,
            content: fileContent
          });
        }
      }
      
      // Pattern 7: Save/write format
      savePattern.lastIndex = 0;
      while ((match = savePattern.exec(content)) !== null) {
        const path = match[1].trim().replace(/[`"']/g, '');
        const fileContent = match[2] ? this.cleanCodeContent(match[2]) : '';
        
        if (this.isValidFilePath(path)) {
          operations.push({
            operation: 'create_file',
            path: path,
            content: fileContent
          });
        }
      }
    }
    
    return operations;
  }

  private extractLoosePatterns(content: string): any[] {
    const operations: any[] = [];
    
    // Very loose pattern: any code block with a filename-like string nearby
    // This is the last resort for edge cases
    const loosePattern = /(?:^|\n)([^\n]*(?:create|make|add|build|generate|write).*?([a-zA-Z0-9_-]+\.[a-zA-Z0-9]+).*?)(?:\n|\s)*```[\w]*\s*\n?([\s\S]*?)```/gim;
    
    let match;
    while ((match = loosePattern.exec(content)) !== null) {
      const contextLine = match[1];
      const potentialPath = match[2];
      const fileContent = match[3] ? this.cleanCodeContent(match[3]) : '';
      
      // Only proceed if it looks like a file creation request
      if (this.isValidFilePath(potentialPath) && 
          /(?:create|make|add|build|generate|write)/i.test(contextLine)) {
        operations.push({
          operation: 'create_file',
          path: potentialPath,
          content: fileContent
        });
      }
    }
    
    return operations;
  }

  private handleFileNameConflicts(path: string): string {
    // Generate unique filename if file already exists
    if (!this.explorerManager.getWorkspace().byPath.has(path)) {
      return path;
    }
    
    const lastDotIndex = path.lastIndexOf('.');
    const nameWithoutExt = path.substring(0, lastDotIndex);
    const extension = path.substring(lastDotIndex);
    
    let counter = 1;
    let newPath = `${nameWithoutExt}_${counter}${extension}`;
    
    while (this.explorerManager.getWorkspace().byPath.has(newPath)) {
      counter++;
      newPath = `${nameWithoutExt}_${counter}${extension}`;
    }
    
    return newPath;
  }

  private async undoLastOperations(): Promise<void> {
    if (this.lastExecutedOperations.length === 0) {
      if (this.notificationManager) {
        this.notificationManager.warning('No operations to undo', 'Undo');
      }
      return;
    }

    if (this.notificationManager) {
      const confirmed = await this.notificationManager.confirm({
        title: 'Confirm Undo',
        message: `This will undo ${this.lastExecutedOperations.length} file operation(s). This action cannot be undone itself.`,
        confirmText: 'Undo',
        cancelText: 'Keep Changes',
        type: 'warning'
      });

      if (!confirmed) return;
    }

    // Note: A full undo system would require tracking file content before changes
    // For now, we'll restore from the backup made before operations
    try {
      this.explorerManager.restoreWorkspaceState();
      this.explorerManager.renderTree();
      
      if (this.notificationManager) {
        this.notificationManager.success(`Undid ${this.lastExecutedOperations.length} operation(s)`, 'Undo Complete');
      }
      
      this.lastExecutedOperations = [];
    } catch (error) {
      console.error('Failed to undo operations:', error);
      if (this.notificationManager) {
        this.notificationManager.error('Failed to undo operations. Some changes may remain.', 'Undo Failed');
      }
    }
  }

  private showFailureDetails(failedOperations: any[]): void {
    const details = failedOperations.map(op => 
      `• ${op.operation.replace('_', ' ')} "${op.path}": ${op.reason}`
    ).join('\n');
    
    console.group('Failed File Operations Details:');
    failedOperations.forEach(op => {
      console.error(`${op.operation} "${op.path}":`, op.reason);
    });
    console.groupEnd();

    if (this.notificationManager) {
      this.notificationManager.toast({
        type: 'error',
        title: 'Operation Failure Details',
        message: details,
        duration: 0
      });
    }
  }

  private async getLastExecutionResult(): Promise<any[]> {
    return this.lastExecutedOperations;
  }

  private debugLog(message: string, data?: any): void {
    if (this.debugMode) {
      console.log(`[File Operations Debug] ${message}`, data);
      if (this.notificationManager) {
        this.notificationManager.info(`Debug: ${message}`, 'File Operations', 3000);
      }
    }
  }

  private async confirmDestructiveOperation(operations: any[]): Promise<boolean> {
    const destructiveOps = operations.filter(op => 
      op.operation === 'delete_file' || 
      (op.operation === 'edit_file' && this.explorerManager.getWorkspace().byPath.has(op.path))
    );
    
    if (destructiveOps.length === 0) return true;
    
    if (!this.notificationManager) return true; // Proceed if no notification system
    
    const message = destructiveOps.length === 1
      ? `This will ${destructiveOps[0].operation === 'delete_file' ? 'delete' : 'overwrite'} "${destructiveOps[0].path}". This action cannot be undone.`
      : `This will modify or delete ${destructiveOps.length} existing files. This action cannot be undone.`;
    
    return await this.notificationManager.confirm({
      title: 'Confirm File Operations',
      message,
      confirmText: 'Proceed',
      cancelText: 'Cancel',
      type: 'warning'
    });
  }

  private async executeFileOperations(content: string): Promise<boolean> {
    try {
      // Validate content is a non-empty string
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        console.error('Invalid content provided to executeFileOperations');
        return false;
      }

      let ops: any[] = [];
      let operationSource = 'unknown';

      // Strategy 1: Try JSON parsing first (for structured outputs)
      if (content.trim().startsWith('{')) {
        try {
          const parsedContent = JSON.parse(content);
          if (parsedContent && typeof parsedContent === 'object' && Array.isArray(parsedContent.operations)) {
            ops = parsedContent.operations;
            operationSource = 'json';
          }
        } catch (parseError) {
          console.log('JSON parsing failed, trying markdown extraction');
        }
      }

      // Strategy 2: Try markdown extraction if JSON failed or no JSON detected
      if (ops.length === 0) {
        ops = this.extractFileOperationsFromMarkdown(content);
        operationSource = 'markdown';
      }

      // Strategy 3: Try loose pattern matching as final fallback
      if (ops.length === 0) {
        ops = this.extractLoosePatterns(content);
        operationSource = 'loose';
      }

      // If no operations found, return false
      if (!ops || ops.length === 0) {
        this.debugLog('No file operations detected in content');
        return false;
      }

      console.log(`Found ${ops.length} operations via ${operationSource} parsing`);
      this.debugLog(`Extracted ${ops.length} operations`, { operations: ops, source: operationSource });

      // Validate each operation has required fields
      for (const op of ops) {
        if (!op || typeof op !== 'object' || !op.operation || !op.path) {
          console.error('Invalid operation structure:', op);
          return false;
        }

        // Validate operation type
        if (!['create_file', 'edit_file', 'delete_file'].includes(op.operation)) {
          console.error('Unknown operation type:', op.operation);
          return false;
        }

        // Validate path is a string and doesn't contain dangerous characters
        if (typeof op.path !== 'string' || op.path.includes('..') || op.path.startsWith('/')) {
          console.error('Invalid path:', op.path);
          return false;
        }

        // For create_file and edit_file, validate content exists
        if ((op.operation === 'create_file' || op.operation === 'edit_file') && typeof op.content !== 'string') {
          console.error('Missing or invalid content for operation:', op.operation);
          return false;
        }
      }

      // Ask for user confirmation for destructive operations
      const shouldProceed = await this.confirmDestructiveOperation(ops);
      if (!shouldProceed) {
        if (this.notificationManager) {
          this.notificationManager.info('File operations cancelled by user', 'Cancelled');
        }
        return false;
      }

      // Show initial notification for non-destructive operations
      if (this.notificationManager) {
        const summary = ops.map(op => `${op.operation.replace('_', ' ')} ${op.path}`).join(', ');
        this.notificationManager.info(`Executing file operations: ${summary}`, 'File Operations', 2000);
      }

      // First, save the current state for undo functionality
      this.explorerManager.backupWorkspaceState();

      const executedOperations: any[] = [];
      const failedOperations: any[] = [];
      
      // Clear previous execution results
      this.lastExecutedOperations = [];

      for (const op of ops) {
        try {
          this.debugLog(`Executing operation: ${op.operation} on ${op.path}`);
          
          switch (op.operation) {
            case 'create_file':
              // Handle file conflicts for create operations
              let createPath = op.path;
              if (this.explorerManager.getWorkspace().byPath.has(op.path)) {
                createPath = this.handleFileNameConflicts(op.path);
                console.log(`File ${op.path} already exists, creating as ${createPath}`);
                if (this.notificationManager) {
                  this.notificationManager.warning(`File ${op.path} already exists, creating as ${createPath}`, 'File Conflict', 3000);
                }
              }
              await this.explorerManager.createFile(createPath, op.content || '');
              executedOperations.push({ ...op, path: createPath });
              
              if (this.notificationManager) {
                this.notificationManager.success(`Created ${createPath}`, 'File Created', 2000);
              }
              break;
              
            case 'edit_file':
              // Check if file exists before editing
              if (!this.explorerManager.getWorkspace().byPath.has(op.path)) {
                console.warn(`File ${op.path} not found for editing, creating instead`);
                if (this.notificationManager) {
                  this.notificationManager.warning(`File ${op.path} not found, creating new file instead`, 'File Not Found', 3000);
                }
                await this.explorerManager.createFile(op.path, op.content || '');
                executedOperations.push({ operation: 'create_file', path: op.path, content: op.content });
                
                if (this.notificationManager) {
                  this.notificationManager.success(`Created ${op.path}`, 'File Created', 2000);
                }
              } else {
                await this.explorerManager.updateFileContent(op.path, op.content || '');
                executedOperations.push(op);
                
                if (this.notificationManager) {
                  this.notificationManager.success(`Updated ${op.path}`, 'File Updated', 2000);
                }
              }
              break;
              
            case 'delete_file':
              // Check if file exists before deleting
              if (this.explorerManager.getWorkspace().byPath.has(op.path)) {
                await this.explorerManager.deleteFile(op.path);
                executedOperations.push(op);
                
                if (this.notificationManager) {
                  this.notificationManager.success(`Deleted ${op.path}`, 'File Deleted', 2000);
                }
              } else {
                console.warn(`File ${op.path} not found for deletion`);
                failedOperations.push({ ...op, reason: 'File not found' });
                
                if (this.notificationManager) {
                  this.notificationManager.warning(`Cannot delete ${op.path}: file not found`, 'Delete Failed', 3000);
                }
              }
              break;
              
            default:
              console.warn(`Unknown operation: ${op.operation}`);
              failedOperations.push({ ...op, reason: 'Unknown operation' });
              
              if (this.notificationManager) {
                this.notificationManager.error(`Unknown operation: ${op.operation}`, 'Operation Failed');
              }
        }
        } catch (error) {
          console.error(`Failed to execute ${op.operation} for ${op.path}:`, error);
          failedOperations.push({ ...op, reason: error.message });
          
          if (this.notificationManager) {
            this.notificationManager.error(`Failed to ${op.operation.replace('_', ' ')} ${op.path}: ${error.message}`, 'Operation Failed');
          }
        }
      }

      // Store execution results for confirmation message
      this.lastExecutedOperations = executedOperations;

      // Enhanced result summary with undo option
      if (executedOperations.length > 0) {
        console.log(`Successfully executed ${executedOperations.length} operations`);
        
        if (this.notificationManager) {
          const successMessage = `Successfully completed ${executedOperations.length} file operation(s)`;
          this.notificationManager.toast({
            type: 'success',
            title: 'Operations Complete',
            message: successMessage,
            duration: 0,
            actions: [
              {
                label: 'Undo',
                action: () => this.undoLastOperations(),
                primary: false
              }
            ]
          });
        }
      }

      if (failedOperations.length > 0) {
        console.warn(`Failed to execute ${failedOperations.length} operations:`, failedOperations);
        
        if (this.notificationManager) {
          const failureMessage = `${failedOperations.length} operation(s) failed. Check console for details.`;
          this.notificationManager.toast({
            type: 'error',
            title: 'Operation Errors',
            message: failureMessage,
            duration: 0,
            actions: [
              {
                label: 'Show Details',
                action: () => this.showFailureDetails(failedOperations),
                primary: true
              }
            ]
          });
        }
      }

      // Re-render the file tree to show changes
      this.explorerManager.renderTree();
      this.debugLog('File operations execution completed', { 
        executed: executedOperations.length, 
        failed: failedOperations.length 
      });
      
      return executedOperations.length > 0; // Return true only if at least one operation succeeded
    } catch (error) {
      console.error('Failed to parse or execute file operations:', error);
      // Don't restore state on parsing error as nothing was changed
      return false;
    }
  }

  private renderMessages(): void {
    const chatMessagesEl = document.getElementById('chatMessages');
    if (!chatMessagesEl) return;

    chatMessagesEl.innerHTML = '';
    for (const m of this.messages) {
      const wrapper = el('div', `message ${m.role}`);
      const meta = el('div', 'meta', `${m.role} • ${new Date(m.ts).toLocaleTimeString()}`);
      const body = el('div');

      // Render markdown for assistant messages, plain text for others
      if (m.role === 'assistant') {
        body.innerHTML = renderMarkdown(m.content);
        body.classList.add('markdown-content');
        // Add copy buttons to code blocks
        addCopyButtons(body);
      } else {
        body.textContent = m.content;
      }

      wrapper.appendChild(meta);
      wrapper.appendChild(body);
      chatMessagesEl.appendChild(wrapper);
    }
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }

  private pushMessage(role: ChatMessage['role'], content: string): ChatMessage {
    const m: ChatMessage = { id: crypto.randomUUID(), role, content, ts: Date.now() };
    this.messages.push(m);
    saveHistory(this.messages);
    this.renderMessages();
    return m;
  }

  private setBusy(busy: boolean): void {
    const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
    const cancelBtn = document.getElementById('cancelBtn') as HTMLButtonElement;
    const chatInput = document.getElementById('chatInput') as HTMLTextAreaElement;
    
    if (sendBtn) sendBtn.disabled = busy;
    if (cancelBtn) cancelBtn.disabled = !busy;
    if (chatInput) chatInput.disabled = busy;
  }

  private setUsage(text: string): void {
    const usageInfoEl = document.getElementById('usageInfo');
    if (usageInfoEl) usageInfoEl.textContent = text;
  }

  private supportsStructuredOutputs(model: string): boolean {
    // Models known to support structured outputs with json_schema
    const supportedModels = [
      'openai/gpt-4o',
      'openai/gpt-4o-mini', 
      'openai/gpt-4-turbo',
      'openai/gpt-4-turbo-preview',
      'anthropic/claude-3-5-sonnet',
      'anthropic/claude-3-5-haiku'
    ];
    return supportedModels.some(supported => model.toLowerCase().includes(supported.toLowerCase()));
  }

  private createSystemPrompt(includeFileOperationInstructions: boolean = false): string {
    // Get workspace state information
    const workspace = this.explorerManager.getWorkspace();
    const hasWorkspace = workspace.name || workspace.files.length > 0;
    const workspaceInfo = hasWorkspace 
      ? `**Current Workspace:** "${workspace.name || 'Unnamed'}" with ${workspace.files.length} files`
      : `**Current Workspace:** No workspace is currently loaded`;

    let prompt = `You are a Senior Software Engineer and Code Assistant with expertise in multiple programming languages, frameworks, and software development best practices. You are designed to help developers with:

**Core Capabilities:**
- Code analysis, debugging, and optimization
- Architecture design and technical decision-making
- Code review and best practices recommendations
- Refactoring and modernization suggestions
- Performance optimization and security improvements
- Testing strategies and implementation
- Documentation and code explanation

**Workspace Context:**
${workspaceInfo}

${!hasWorkspace ? `**Auto-Workspace Creation:** When you need to create files but no workspace is loaded, the system will automatically create a new workspace with a generated name. You can freely create files even when starting from an empty state.

` : ''}**Response Guidelines:**
- Provide clear, accurate, and actionable advice
- Reference specific files and line numbers when analyzing code
- Offer multiple solutions when appropriate, explaining trade-offs
- Include runnable code examples and implementation details
- Consider project context, dependencies, and existing patterns
- Suggest improvements while respecting current architecture

**Code Analysis Instructions:**
When working with provided code files:
- Analyze file relationships, imports, and dependencies
- Understand the overall project structure and patterns
- Consider how changes affect other parts of the codebase
- Reference specific files and line numbers in your responses
- Provide context-aware suggestions that fit the existing codebase

**Safety and Best Practices:**
- Always consider security implications of suggested changes
- Recommend proper error handling and validation
- Suggest appropriate testing approaches
- Consider performance and scalability implications
- Follow language-specific conventions and best practices

You are working with a codebase context system that may provide you with relevant files. Use this context to give more accurate, specific, and helpful responses.`;

    if (includeFileOperationInstructions) {
      prompt += `

**FILE OPERATION INSTRUCTIONS:**
When the user requests to create, edit, or delete files, use this EXACT format:

For creating files:
**FILE OPERATION: CREATE**
Path: filename.ext
\`\`\`language
file content here
\`\`\`

For editing files:
**FILE OPERATION: EDIT**
Path: existing-file.ext
\`\`\`language
updated file content here
\`\`\`

For deleting files:
**FILE OPERATION: DELETE**
Path: file-to-delete.ext

IMPORTANT: Always use the exact headers "**FILE OPERATION: CREATE**", "**FILE OPERATION: EDIT**", or "**FILE OPERATION: DELETE**" followed by "Path:" and the file path. For create and edit operations, include the complete file content in a code block.`;
    }

    return prompt;
  }

  private extractUsageAndCache(obj: any): void {
    const usage = obj?.usage;
    const cacheDiscount = obj?.cache_discount;
    let text = '';
    if (usage) {
      const pt = usage.prompt_tokens ?? usage.total_prompt_tokens ?? usage.total_tokens_prompt;
      const ct = usage.completion_tokens;
      const tt = usage.total_tokens ?? (pt && ct ? pt + ct : undefined);
      text += `tokens: ${pt ?? '?'} + ${ct ?? '?'} = ${tt ?? '?'} `;
    }
    if (typeof cacheDiscount === 'number') {
      const pct = Math.round(cacheDiscount * 100);
      text += `(cache: ${pct}% discount)`;
    }
    this.setUsage(text.trim());
  }

  // SSE parsing helper
  private async* parseSSE(reader: ReadableStreamDefaultReader<Uint8Array>) {
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trimEnd();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        if (line.startsWith(':')) {
          // comment such as ": OPENROUTER PROCESSING"
          yield { type: 'comment', data: line.slice(1).trim() };
          continue;
        }
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          yield { type: 'data', data };
        }
      }
    }
    if (buffer.length) {
      const line = buffer.trim();
      if (line.startsWith('data: ')) yield { type: 'data', data: line.slice(6) };
    }
  }

  async streamChat(userText: string): Promise<void> {
    const model = this.settingsManager.getModel();

    // Check if this is a file modification request
    const isFileModificationRequest = userText.toLowerCase().includes('create file')
        || userText.toLowerCase().includes('edit file')
        || userText.toLowerCase().includes('delete file')
        || userText.toLowerCase().includes('add file')
        || userText.toLowerCase().includes('modify file')
        || userText.toLowerCase().includes('update file')
        || userText.toLowerCase().includes('remove file');

    // Determine if we should use structured outputs or fallback mode
    const useStructuredOutputs = isFileModificationRequest && this.supportsStructuredOutputs(model);
    const useMarkdownMode = isFileModificationRequest && !useStructuredOutputs;

    // Create system message with appropriate instructions
    const systemMessage = { role: 'system' as const, content: this.createSystemPrompt(useMarkdownMode) };

    // Get conversation history (exclude any existing system messages)
    const historyMessages = this.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    // Build context message with enhanced instructions
    const { contextMessage, contextStats } = this.contextProvider ? this.contextProvider() : {};

    // Construct final message array: system prompt first, then history, then context, then user message
    const requestMessages = [systemMessage];
    requestMessages.push(...historyMessages);
    if (contextMessage) {
      requestMessages.push(contextMessage);
    }
    requestMessages.push({ role: 'user' as const, content: userText });

    if (contextStats)
      this.setUsage(`ctx: ${contextStats.selected} files, ~${contextStats.tokens} tokens${contextStats.truncated > 0 ? `, truncated ${contextStats.truncated}` : ''}`);

    const payload = {
      model,
      messages: requestMessages,
      stream: true,
      usage: { include: true },
    } as any;

    // Add structured output for compatible models only
    if (useStructuredOutputs) {
      payload.response_format = {
        type: "json_schema",
        json_schema: FILE_OPERATIONS_SCHEMA
      };
      console.log('Using structured outputs for file operations');
    } else if (useMarkdownMode) {
      console.log('Using markdown fallback mode for file operations');
    }

    this.abortController = new AbortController();
    this.setBusy(true);
    this.setUsage('');

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: this.settingsManager.buildHeaders(),
        body: JSON.stringify(payload),
        signal: this.abortController.signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${res.statusText} ${txt}`);
      }

      // Prepare assistant message placeholder
      const assistant: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', ts: Date.now() };
      this.messages.push({ id: crypto.randomUUID(), role: 'user', content: userText, ts: Date.now() });
      this.messages.push(assistant);
      saveHistory(this.messages);
      this.renderMessages();

      const reader = res.body.getReader();
      for await (const evt of this.parseSSE(reader)) {
        if (evt.type === 'comment') {
          continue;
        }
        if (evt.type === 'data') {
          if (evt.data === '[DONE]') break;
          try {
            const obj = JSON.parse(evt.data);
            const delta = obj?.choices?.[0]?.delta?.content || obj?.choices?.[0]?.message?.content || '';
            if (delta) {
              assistant.content += delta;
              this.renderMessages();
            }
            if (obj?.usage || obj?.cache_discount) this.extractUsageAndCache(obj);
          } catch {
            // ignore non-JSON payloads
          }
        }
      }

      saveHistory(this.messages);
      this.renderMessages();
    } catch (err: any) {
      this.pushMessage('system', `Error: ${err?.message || String(err)}`);
    } finally {
      this.setBusy(false);
      // Ensure AbortController is properly cleaned up
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }

      // After stream is complete, check for and execute file operations
      const lastMessage = this.messages[this.messages.length - 1];
      if (lastMessage && lastMessage.role === 'assistant' && isFileModificationRequest) {
        const wasExecuted = await this.executeFileOperations(lastMessage.content);
        if (wasExecuted) {
          // Extract the operations that were actually executed (with modifications)
          const executionResult = await this.getLastExecutionResult();
          const operationCounts = executionResult.reduce((acc: any, op: any) => {
            acc[op.operation] = (acc[op.operation] || 0) + 1;
            return acc;
          }, {});
          
          let confirmationMessage = "✅ File operations completed successfully:\n";
          if (operationCounts.create_file) confirmationMessage += `• Created ${operationCounts.create_file} file(s)\n`;
          if (operationCounts.edit_file) confirmationMessage += `• Edited ${operationCounts.edit_file} file(s)\n`;
          if (operationCounts.delete_file) confirmationMessage += `• Deleted ${operationCounts.delete_file} file(s)\n`;
          
          // Add parsing method info for debugging
          const parseMethod = lastMessage.content.trim().startsWith('{') ? 'JSON' : 'Markdown';
          confirmationMessage += `\n🔧 Detected via ${parseMethod} parsing`;
          
          // Replace the raw response with user-friendly confirmation
          lastMessage.content = confirmationMessage.trim();
          this.renderMessages();
          saveHistory(this.messages);
        }
      }
    }
  }

  cancelStream(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.setUsage('Cancelled');
    }
  }

  clearHistory(): void {
    this.messages = [];
    saveHistory(this.messages);
    this.renderMessages();
    this.setUsage('');
  }

  renderInitialMessages(): void {
    this.renderMessages();
  }

  setupEventListeners(): void {
    const chatForm = document.getElementById('chatForm') as HTMLFormElement;
    const chatInput = document.getElementById('chatInput') as HTMLTextAreaElement;
    const cancelBtn = document.getElementById('cancelBtn');
    const clearChatBtn = document.getElementById('clearChatBtn');

    chatForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput?.value.trim();
      if (!text) return;
      chatInput!.value = '';
      this.streamChat(text);
    });

    cancelBtn?.addEventListener('click', () => this.cancelStream());
    clearChatBtn?.addEventListener('click', () => this.clearHistory());
  }
}
