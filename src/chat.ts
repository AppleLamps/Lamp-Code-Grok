// Chat functionality and OpenRouter integration module
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { ChatMessage, ContextMessage, ContextStats } from './types.js';
import { loadHistory, saveHistory } from './storage.js';
import { el } from './utils.js';
import type { SettingsManager } from './settings.js';

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
  private contextProvider: (() => { contextMessage?: ContextMessage; contextStats?: ContextStats }) | null = null;

  constructor(settingsManager: SettingsManager) {
    this.settingsManager = settingsManager;
    this.messages = loadHistory();
  }

  setContextProvider(provider: () => { contextMessage?: ContextMessage; contextStats?: ContextStats }): void {
    this.contextProvider = provider;
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

  private createSystemPrompt(): string {
    return `You are a Senior Software Engineer and Code Assistant with expertise in multiple programming languages, frameworks, and software development best practices. You are designed to help developers with:

**Core Capabilities:**
- Code analysis, debugging, and optimization
- Architecture design and technical decision-making
- Code review and best practices recommendations
- Refactoring and modernization suggestions
- Performance optimization and security improvements
- Testing strategies and implementation
- Documentation and code explanation

**Response Guidelines:**
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

    // Create system message
    const systemMessage = { role: 'system' as const, content: this.createSystemPrompt() };
    
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
      this.abortController = null;
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
