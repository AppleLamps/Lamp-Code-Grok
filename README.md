# LampCode IDE

A **powerful, web-based IDE** that combines AI-powered assistance with traditional code editing capabilities. LampCode features an integrated Monaco code editor, file explorer, and **revolutionary AI file operation system** powered by OpenRouter's API.

## ✨ What Makes LampCode Special

🤖 **AI File Operations**: Ask AI to create, edit, or delete files - it actually does it automatically  
🔄 **Universal Model Support**: Works with Grok, GPT-4, Claude, and any OpenRouter model  
🛡️ **Enterprise Safety**: Undo operations, confirmation prompts, and comprehensive error handling  
🎯 **Smart Parsing**: Advanced pattern recognition works regardless of AI response format  
📱 **Real-time Feedback**: Live notifications, progress tracking, and detailed error reporting  

---

## 🚀 Features

### 🤖 AI-Powered File Operations **NEW!**

**Revolutionary feature**: Ask AI to create, edit, or delete files and **it actually does it automatically**.

#### ✅ **What Works**
- **"Create a simple HTML page called index.html"** → File created automatically
- **"Add CSS styling to styles.css"** → File created with content  
- **"Edit the main.js file to add error handling"** → File updated automatically
- **"Delete the old config.json file"** → File removed safely
- **"Build me a complete React component"** → Multiple files created at once

#### 🔧 **How It Works**
1. **Model Detection**: Automatically detects if your model supports structured outputs
2. **Smart Parsing**: Uses 7+ different parsing strategies for maximum compatibility
3. **Safety First**: Confirms destructive operations before executing
4. **Real-time Feedback**: Shows progress and results as operations happen
5. **One-Click Undo**: Easily revert all changes if something goes wrong

#### 🎯 **Model Compatibility**
- **OpenAI Models** (GPT-4o, GPT-4o-mini): Uses structured JSON outputs
- **Grok Models** (x-ai/grok-*): Uses advanced markdown parsing
- **Claude Models**: Uses structured outputs when available
- **Any OpenRouter Model**: Fallback parsing ensures compatibility

#### 🛡️ **Safety Features**
- **Confirmation Prompts**: Warns before deleting or overwriting files
- **Automatic Backup**: Creates restore points before operations
- **Conflict Resolution**: Auto-renames files to prevent overwrites
- **Detailed Logging**: See exactly what operations were performed
- **Error Recovery**: Graceful handling of partial failures

### 💬 Advanced AI Chat

- **Streaming Responses**: Real-time AI assistance with live typing
- **Context-Aware**: Uses selected project files for better responses  
- **Multi-Model Support**: Switch between GPT-4, Claude, Grok, and 100+ models
- **Conversation Memory**: Maintains chat history across sessions
- **Markdown Rendering**: Rich text with syntax highlighting and copy buttons
- **Token Management**: Smart context optimization and usage tracking

### 📝 Professional Code Editor

- **Monaco Editor**: The same engine that powers VS Code
- **Multi-Tab Support**: Edit multiple files simultaneously with tab management
- **Language Support**: TypeScript, JavaScript, HTML, CSS, Python, Java, Go, Rust, and 50+ languages
- **Intelligent Features**: Auto-completion, syntax highlighting, error detection
- **Dirty State Tracking**: Visual indicators for unsaved changes
- **Find & Replace**: Advanced search and replace functionality

### 🗂️ Advanced File Management

- **File Explorer**: Hierarchical browser with expand/collapse and context menus
- **Drag & Drop**: Import files and folders by dragging into the interface
- **Virtual Scrolling**: Handles large directory structures efficiently
- **Workspace Persistence**: Automatic save/restore of entire workspace state
- **Bulk Operations**: Create, edit, delete multiple files at once
- **File Upload**: Direct file upload with progress tracking

### 🔔 Smart Notification System **NEW!**

- **Toast Notifications**: Non-intrusive success/error/warning messages
- **Action Buttons**: Click to undo, view details, or take action
- **Confirmation Dialogs**: Safe prompts for destructive operations
- **Progress Tracking**: Real-time feedback during file operations
- **Auto-dismiss**: Smart timing based on message importance

### 🎛️ Context Management

- **Selective Sharing**: Choose exactly which files to include in AI conversations
- **Token Optimization**: Intelligent truncation and file prioritization
- **Preview Modal**: Review context before sending to AI
- **Auto-selection**: Smart defaults based on project structure
- **Usage Monitoring**: Track token consumption and costs

### ⚙️ Configuration & Customization

- **Secure Settings**: Encrypted API key storage with validation
- **Model Selection**: Easy switching between AI models
- **Keyboard Shortcuts**: Comprehensive shortcut system for power users
- **Resizable Panels**: Customizable layout with persistent sizing
- **Debug Mode**: Advanced debugging for file operations (`F12 + Shift`)

---

## 🎯 How to Use File Operations

### Basic Examples

```
You: "Create a simple HTML page called index.html"
AI: Creates index.html with basic HTML structure ✅

You: "Add a CSS file with basic styling" 
AI: Creates styles.css with starter styles ✅

You: "Delete the old config file"
AI: Removes config.json after confirmation ✅
```

### Advanced Examples

```
You: "Build me a React component for a todo list"
AI: Creates TodoList.js, TodoItem.js, and styles.css ✅

You: "Refactor the authentication code into separate files"
AI: Creates auth.js, login.js, validates.js with split code ✅

You: "Set up a basic Express server with routes"
AI: Creates server.js, routes folder, and configuration files ✅
```

### Natural Language Support

The system understands many ways to request file operations:

- **Create**: "create", "add", "new", "build", "generate", "make"
- **Edit**: "edit", "update", "modify", "change", "fix", "refactor"  
- **Delete**: "delete", "remove", "get rid of", "clean up"

### Debug Mode

Press **`F12 + Shift`** to toggle debug mode and see:
- Which parsing method was used (JSON vs Markdown)
- Detailed operation logs
- Real-time processing information
- Error diagnostics

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + L` | Focus chat input (Code with AI) |
| `Ctrl + I` | Open context preview modal |
| `Ctrl + /` | Open settings |
| `Ctrl + O` | Open folder/workspace |
| `Ctrl + K` | Clear chat history |
| `Ctrl + W` | Close current editor tab |
| `Ctrl + Tab` | Switch to next editor tab |
| `Ctrl + Shift + Tab` | Switch to previous editor tab |
| `Ctrl + Enter` | Send chat message |
| `F12 + Shift` | Toggle debug mode |
| `Escape` | Close modals or focus chat |

---

## 🏗️ Architecture

### Core Modules

```
src/
├── main.ts          # Application entry point and initialization
├── types.ts         # Shared TypeScript type definitions
├── editor.ts        # Monaco Editor integration with tab management
├── chat.ts          # AI chat + FILE OPERATIONS SYSTEM
├── explorer.ts      # File explorer and workspace management
├── context.ts       # Context selection and file processing
├── settings.ts      # Settings validation and API configuration
├── notifications.ts # In-app notification and feedback system
├── ui.ts            # UI utilities, shortcuts, panel management
├── storage.ts       # LocalStorage management and persistence
└── utils.ts         # General utility functions and helpers
```

### Manager Classes

- **`ChatManager`** - AI chat, streaming, and **file operations system**
- **`EditorManager`** - Monaco Editor integration and tab management
- **`ExplorerManager`** - File tree rendering and workspace management
- **`ContextManager`** - File selection for AI context and token management
- **`SettingsManager`** - Configuration validation and secure storage
- **`UIManager`** - Keyboard shortcuts, panel resizing, modal management
- **`NotificationManager`** - Toast notifications, confirmations, and prompts

### File Operations Architecture

```
File Operation Request
        ↓
Model Detection (Grok vs GPT-4 vs Claude)
        ↓
Strategy Selection (JSON Schema vs Markdown Parsing)
        ↓
Multi-Pattern Extraction (7+ parsing patterns)
        ↓
Validation & Security Checks
        ↓
User Confirmation (for destructive operations)
        ↓
Workspace Backup (for undo functionality)  
        ↓
Operation Execution (with real-time feedback)
        ↓
Success Notification (with undo option)
```

---

## 🛠️ Technical Stack

### Frontend
- **TypeScript 5.6+** - Type-safe JavaScript with strict mode
- **Vite 5.4+** - Lightning-fast build tool and dev server
- **Monaco Editor 0.52+** - Full VS Code editor engine
- **Marked 9.1+** - Markdown parsing for chat messages
- **DOMPurify 3.0+** - XSS protection for rendered HTML
- **Font Awesome 7.0+** - Professional icon library
- **JSZip 3.10+** - File compression and archive handling

### Architecture Patterns
- **Manager Pattern** - Feature encapsulation with dedicated classes
- **Dependency Injection** - Clean separation and testability
- **Event-Driven Design** - Decoupled communication between modules
- **State Persistence** - LocalStorage with encryption for security
- **Virtual Scrolling** - Performance optimization for large datasets
- **Multi-Strategy Parsing** - Robust AI response handling

### AI Integration
- **OpenRouter API** - Access to 100+ AI models
- **Structured Outputs** - JSON Schema for compatible models
- **Fallback Parsing** - Advanced markdown parsing for all models
- **Context Management** - Intelligent file inclusion and token optimization
- **Streaming Responses** - Real-time AI communication

---

## 🚀 Getting Started

### Prerequisites
- **Node.js 16+** 
- **npm or yarn** package manager
- **OpenRouter API Key** (get free at [openrouter.ai](https://openrouter.ai/))

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd lamp-code-grok
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Open in browser**
   Navigate to `http://localhost:5173`

### Configuration

1. **Open Settings** (`Ctrl + /`)
2. **Enter OpenRouter API Key** - Get your key from [OpenRouter](https://openrouter.ai/)
3. **Select AI Model** - Choose from GPT-4, Claude, Grok, or 100+ others
4. **Optional**: Configure HTTP-Referer and X-Title headers
5. **Save Settings** - Settings are encrypted and stored locally

### Quick Start Guide

#### 1. Set Up Your Workspace
- Click "Open Folder" or press `Ctrl + O`
- Drag and drop files/folders into the explorer
- Files automatically open in the Monaco editor

#### 2. Chat with AI
- Press `Ctrl + L` to focus the chat input
- Type your question or request
- AI has access to your selected files for context

#### 3. Use File Operations
```
Type: "Create a React component for a user profile"
Result: AI creates UserProfile.js automatically ✅

Type: "Add some CSS styling for the profile"  
Result: AI creates UserProfile.css with styles ✅

Type: "Delete the old test files"
Result: AI removes test files after confirmation ✅
```

#### 4. Manage Context
- Press `Ctrl + I` to open context preview
- Select/deselect files to include in AI conversations
- Monitor token usage and optimize for cost

---

## 🔧 Advanced Usage

### Model Recommendations

**For File Operations:**
- **GPT-4o-mini** - Fast, cheap, excellent file operations
- **Claude 3.5 Sonnet** - Best code quality and reasoning
- **Grok** - Good for conversational coding (using fallback parsing)

**For Complex Tasks:**
- **GPT-4o** - Best overall performance
- **Claude 3.5 Sonnet** - Superior code analysis
- **Deepseek Coder** - Specialized programming model

### File Operation Tips

1. **Be Specific**: "Create index.html with a contact form" vs "make a webpage"
2. **Use Natural Language**: "Add error handling to the login function"
3. **Batch Operations**: "Create a React component with JSX, CSS, and tests"
4. **Check Context**: Ensure relevant files are selected for better results

### Debugging File Operations

1. **Enable Debug Mode**: Press `F12 + Shift`
2. **Check Console**: See detailed parsing and execution logs
3. **Review Notifications**: Click "Show Details" on error messages
4. **Use Undo**: Click "Undo" button if something goes wrong

---

## 🏗️ Development Guide

### Adding New Features

1. **Create a new module** (e.g., `src/newFeature.ts`)
2. **Define types** in `src/types.ts` if needed
3. **Create a manager class**:
   ```typescript
   export class NewFeatureManager {
     constructor() {}
     
     setupEventListeners(): void {}
     
     // Feature-specific methods
   }
   ```
4. **Wire up in main.ts**:
   ```typescript
   const newFeatureManager = new NewFeatureManager();
   newFeatureManager.setupEventListeners();
   ```

### Extending File Operations

To add new parsing patterns:

1. **Add pattern** to `extractFileOperationsFromMarkdown()`
2. **Test with various models** to ensure compatibility
3. **Add validation** for new operation types
4. **Update confirmation prompts** if needed

### Code Style Guidelines

- **TypeScript strict mode** enabled
- **ES6 imports/exports** with `.js` extensions
- **Manager classes** for feature encapsulation  
- **Event-driven architecture** for decoupling
- **Comprehensive error handling** with user feedback
- **Security-first approach** for all user inputs

---

## 📁 Project Structure

```
lamp-code-grok/
├── src/
│   ├── main.ts              # App initialization and manager setup
│   ├── chat.ts              # AI chat + FILE OPERATIONS SYSTEM
│   ├── editor.ts            # Monaco Editor with tab management
│   ├── explorer.ts          # File tree and workspace management
│   ├── context.ts           # Context selection and optimization
│   ├── settings.ts          # Configuration and API validation
│   ├── notifications.ts     # Toast notifications and prompts
│   ├── ui.ts                # Keyboard shortcuts and panel management
│   ├── storage.ts           # Encrypted localStorage management
│   ├── utils.ts             # Shared utility functions
│   └── types.ts             # TypeScript type definitions
├── dist/                    # Built application (auto-generated)
├── node_modules/            # Dependencies (auto-generated)
├── index.html              # Main HTML template
├── style.css               # Global styles and Monaco themes
├── package.json            # Dependencies and build scripts
├── tsconfig.json           # TypeScript configuration
├── vite.config.ts          # Vite build configuration
└── README.md               # This comprehensive guide
```

---

## 🔒 Security

### Data Protection
- **API Keys**: AES-encrypted storage in browser localStorage
- **XSS Protection**: DOMPurify sanitization for all rendered content
- **Content Security**: No arbitrary code execution allowed
- **Client-Side Only**: All processing happens in your browser

### File Operation Security
- **Path Validation**: Prevents directory traversal attacks
- **Operation Confirmation**: User approval for destructive actions
- **Backup System**: Automatic restore points before changes
- **Error Isolation**: Failed operations don't affect others

**Production Note**: For enterprise use, implement a server-side proxy to protect API keys from client-side exposure.

---

## 🐛 Troubleshooting

### File Operations Not Working?

1. **Check Your Model**: Some models don't support structured outputs
   - ✅ Works: GPT-4o, Claude 3.5, GPT-4o-mini
   - ⚠️ Fallback: Grok (uses markdown parsing)

2. **Enable Debug Mode**: Press `F12 + Shift` to see detailed logs

3. **Check API Key**: Ensure valid OpenRouter API key in settings

4. **Try Different Phrasing**: 
   - ❌ "make file" → ✅ "create a file called example.js"

### Common Issues

- **"No operations detected"**: Use more specific language
- **"File already exists"**: AI will auto-rename or ask for confirmation  
- **"Operation failed"**: Check file permissions and disk space
- **"Model not responding"**: Verify API key and internet connection

---

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Follow our architecture patterns** (Manager classes, TypeScript strict mode)
4. **Add comprehensive error handling** and user feedback
5. **Test with multiple AI models** if touching file operations
6. **Update documentation** for new features
7. **Commit your changes** (`git commit -m 'Add amazing feature'`)
8. **Push to the branch** (`git push origin feature/amazing-feature`)
9. **Open a Pull Request** with detailed description

### Areas for Contribution

- **New AI Models**: Add support for additional providers
- **File Operations**: Extend parsing patterns for better compatibility
- **Editor Features**: Add more Monaco Editor integrations
- **UI Improvements**: Enhance the interface and user experience
- **Performance**: Optimize large file handling and virtual scrolling

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 🙏 Acknowledgments

- **Monaco Editor** team for the amazing code editor
- **OpenRouter** for providing access to multiple AI models
- **Vite** team for the blazing-fast build tool
- **TypeScript** team for type safety and developer experience

---

**LampCode IDE** - Where AI meets professional development. Built with ❤️ for developers who want their AI to actually **do** things, not just **talk** about them.

[![Get Started](https://img.shields.io/badge/Get%20Started-🚀-blue?style=for-the-badge)](http://localhost:5173)
[![OpenRouter](https://img.shields.io/badge/Powered%20by-OpenRouter-green?style=for-the-badge)](https://openrouter.ai/)
[![TypeScript](https://img.shields.io/badge/Built%20with-TypeScript-blue?style=for-the-badge)](https://www.typescriptlang.org/)