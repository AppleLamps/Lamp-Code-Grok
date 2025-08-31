# LampCode IDE

A modern, web-based IDE that combines AI-powered assistance with traditional code editing capabilities. LampCode features an integrated Monaco code editor, file explorer, and AI chat interface powered by OpenRouter's API.

## 🚀 Features

### 💬 AI-Powered Chat
- Real-time AI assistance through OpenRouter API integration
- Streaming responses for immediate feedback
- Context-aware conversations using selected project files
- Support for multiple AI models through OpenRouter
- Markdown rendering with syntax highlighting

### 📝 Code Editor
- **Monaco Editor Integration** - The same editor that powers VS Code
- **Multi-tab Support** - Open and edit multiple files simultaneously
- **Syntax Highlighting** - Support for TypeScript, JavaScript, HTML, CSS, Python, Java, and more
- **Language Detection** - Automatic language detection based on file extensions
- **Auto-completion** - Intelligent code completion and suggestions
- **Dirty State Tracking** - Visual indicators for unsaved changes

### 🗂️ File Management
- **File Explorer** - Hierarchical file browser with folder expansion/collapse
- **Drag & Drop Support** - Import files and folders by dragging them into the interface
- **Virtual Scrolling** - Efficient rendering for large directory structures
- **Workspace Persistence** - Automatic saving and restoration of workspace state
- **Click-to-Open** - Single-click file opening in the code editor

### 🎛️ Context System
- **Selective File Sharing** - Choose which files to include in AI conversations
- **Token Management** - Intelligent token counting and file truncation
- **Preview Modal** - Review and manage context files before sending
- **Auto-selection** - Smart defaults for file inclusion

### ⚙️ Configuration & UI
- **Settings Management** - Secure API key storage with encryption
- **Keyboard Shortcuts** - Comprehensive shortcut system for productivity
- **Resizable Panels** - Customizable layout with persistent panel sizes
- **Accessibility** - ARIA labels and keyboard navigation support
- **Responsive Design** - Clean, modern interface that adapts to different screen sizes

## 🏗️ Architecture

### Core Modules

```
src/
├── main.ts          # Application entry point and initialization
├── types.ts         # Shared TypeScript type definitions
├── editor.ts        # NEW: Monaco Editor integration with tab management
├── chat.ts          # AI chat functionality and OpenRouter integration
├── explorer.ts      # File explorer and workspace management
├── context.ts       # Context selection and file processing
├── settings.ts      # Settings validation and API configuration
├── ui.ts            # UI utilities, keyboard shortcuts, panel management
├── storage.ts       # LocalStorage management and data persistence
└── utils.ts         # General utility functions and helpers
```

### Manager Classes Architecture

Each feature area is encapsulated in a dedicated manager class:

- **`EditorManager`** - Monaco Editor integration, tab management, file editing
- **`ChatManager`** - AI chat functionality, streaming responses, message handling
- **`ExplorerManager`** - File tree rendering, workspace management, file operations
- **`ContextManager`** - File selection for AI context, token management
- **`SettingsManager`** - Configuration validation, secure storage
- **`UIManager`** - Keyboard shortcuts, panel resizing, modal management

### Module Dependencies

```
main.ts
├── editor.ts (Monaco Editor CDN loading)
├── chat.ts (depends on settings.ts)
├── explorer.ts (depends on storage.ts, utils.ts, types.ts, editor.ts)
├── context.ts (depends on storage.ts, utils.ts)
├── settings.ts (depends on storage.ts, utils.ts)
├── ui.ts (depends on storage.ts)
└── utils.ts, storage.ts, types.ts (shared utilities)
```

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + L` | Focus chat input (Code with Lamper) |
| `Ctrl + I` | Open context preview modal |
| `Ctrl + /` | Open settings |
| `Ctrl + O` | Open folder/workspace |
| `Ctrl + K` | Clear chat history |
| `Ctrl + W` | Close current editor tab |
| `Ctrl + Tab` | Switch to next editor tab |
| `Ctrl + Shift + Tab` | Switch to previous editor tab |
| `Ctrl + Enter` | Send chat message |
| `Escape` | Close modals or focus chat |

## 🛠️ Technical Stack

### Frontend
- **TypeScript** - Type-safe JavaScript with modern ES6+ features
- **Vite** - Fast build tool and development server
- **Monaco Editor** - Full-featured code editor (VS Code engine)
- **Marked** - Markdown parsing for chat messages
- **DOMPurify** - XSS protection for rendered HTML
- **Font Awesome** - Icon library for UI elements

### Architecture Patterns
- **Manager Pattern** - Feature encapsulation with dedicated manager classes
- **Dependency Injection** - Clean separation of concerns and testability
- **Event-Driven Design** - Decoupled communication between modules
- **Virtual Scrolling** - Performance optimization for large file trees
- **State Persistence** - LocalStorage with encryption for sensitive data

## 🚀 Getting Started

### Prerequisites
- Node.js 16+ 
- npm or yarn package manager

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
3. **Optional**: Configure HTTP-Referer and X-Title headers
4. **Save Settings** - Settings are encrypted and stored locally

### Usage

1. **Open a Project**
   - Click "Open Folder" or press `Ctrl + O`
   - Drag and drop files/folders into the explorer
   - Upload individual files using the upload button

2. **Edit Code**
   - Click any file in the explorer to open it in the editor
   - Multiple files open in tabs
   - Use standard editor shortcuts for navigation

3. **Chat with AI**
   - Press `Ctrl + L` to focus the chat input
   - Type your question about the codebase
   - AI responses include the selected files as context

4. **Manage Context**
   - Press `Ctrl + I` to preview context files
   - Select/deselect files to include in AI conversations
   - Monitor token usage and limits

## 🏗️ Development Guide

### Adding New Features

1. **Create a new module** (e.g., `src/newFeature.ts`)
2. **Define types** in `src/types.ts` if needed
3. **Create a manager class** following the established pattern:
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

### Code Style
- TypeScript strict mode enabled
- ES6 imports/exports with `.js` extensions for compatibility
- Manager classes for feature encapsulation
- Event-driven architecture
- Comprehensive error handling

### Testing
- Each manager can be tested in isolation
- Mock dependencies for unit testing
- Integration tests for cross-module functionality

## 📁 Project Structure

```
lamp-code-grok/
├── src/                 # Source code modules
├── dist/                # Built application (generated)
├── node_modules/        # Dependencies (generated)
├── index.html          # Main HTML template
├── style.css           # Global styles and Monaco Editor themes
├── package.json        # Project dependencies and scripts
├── tsconfig.json       # TypeScript configuration
├── vite.config.ts      # Vite build configuration
└── README.md           # This file
```

## 🔒 Security

- **API Keys** - Encrypted storage in browser localStorage
- **XSS Protection** - DOMPurify sanitization for all rendered content
- **Content Security** - No arbitrary code execution
- **Client-Side Only** - All processing happens in the browser

**Note**: For production use, consider implementing a server-side proxy to protect API keys from client-side exposure.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Follow the established architecture patterns
4. Add appropriate types and error handling
5. Test your changes thoroughly
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**LampCode IDE** - Where AI meets code editing. Built with ❤️ for developers.