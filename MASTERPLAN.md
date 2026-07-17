# DevLauncher - Master Plan

**Project Name**: DevLauncher  
**Tech Stack**: Electron + React + Vite + TailwindCSS  
**Target Platform**: Windows (with .exe output)  
**Start Date**: 2024  
**Working Directory**: `/d/working/gatrion/gatrion_dev`

---

## 1. Project Overview

Desktop application untuk mengelola dan menjalankan multiple development projects dari berbagai tech stack (Next.js, React, Vue, Laravel, Go, Node.js) dalam satu interface.

### Core Features:
- ✅ Sidebar navigation (Dashboard, Projects, Settings)
- ✅ List running projects di sidebar
- ✅ Start/Stop individual projects
- ✅ Start All / Stop All functionality
- ✅ Real-time terminal output viewer
- ✅ Auto-detect project type
- ✅ Custom command configuration
- ✅ Process status monitoring

---

## 2. Architecture

```
DevLauncher/
├── electron/                    # Main Process (Node.js)
│   ├── main.js                 # Entry point, window management
│   ├── preload.js              # IPC bridge (contextBridge)
│   ├── managers/
│   │   ├── ProcessManager.js   # Spawn & manage child processes
│   │   ├── ProjectDetector.js  # Auto-detect project type
│   │   └── StorageManager.js   # Save/load projects & config
│   └── handlers/
│       ├── projectHandlers.js  # IPC: CRUD projects
│       └── processHandlers.js  # IPC: Start/stop processes
│
├── src/                        # Renderer Process (React)
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── Sidebar.jsx           # Left navigation
│   │   │   ├── TopBar.jsx            # Action bar
│   │   │   └── MainLayout.jsx        # Layout wrapper
│   │   ├── Pages/
│   │   │   ├── DashboardPage.jsx     # Overview stats
│   │   │   ├── ProjectsPage.jsx      # Grid all projects
│   │   │   ├── ProjectDetail.jsx     # Single project + logs
│   │   │   └── SettingsPage.jsx      # App settings
│   │   ├── Project/
│   │   │   ├── ProjectCard.jsx       # Project card UI
│   │   │   ├── ProjectGrid.jsx       # Grid layout
│   │   │   └── AddProjectModal.jsx   # Add/Edit form
│   │   ├── Terminal/
│   │   │   └── TerminalViewer.jsx    # Log output display
│   │   └── Common/
│   │       ├── StatusIndicator.jsx   # 🟢/⚫ status dot
│   │       ├── Button.jsx
│   │       └── IconButton.jsx
│   ├── hooks/
│   │   ├── useProjects.js      # Project CRUD operations
│   │   ├── useProcesses.js     # Process management
│   │   └── useNavigation.js    # Sidebar navigation
│   ├── store/
│   │   └── appStore.js         # Zustand global state
│   ├── utils/
│   │   ├── projectTypes.js     # Project type definitions
│   │   └── ipcRenderer.js      # IPC helper functions
│   ├── styles/
│   │   └── index.css           # Global + Tailwind
│   ├── App.jsx                 # Root component
│   └── main.jsx                # React entry point
│
├── public/
│   ├── icon.png
│   └── icon.ico
│
├── build/                      # Build resources
│   ├── icon.ico
│   └── icon.png
│
├── package.json
├── vite.config.js              # Vite configuration
├── electron-builder.json       # Build configuration
├── tailwind.config.js
├── postcss.config.js
└── README.md
```

---

## 3. Data Models

### Project Schema
```javascript
{
  id: 'uuid-v4',                    // Unique identifier
  name: 'E-commerce Website',       // Display name
  type: 'NEXTJS',                   // Project type enum
  path: 'C:/projects/ecommerce',    // Absolute path
  command: 'npm run dev',           // Start command
  port: 3000,                       // Port number (optional)
  env: {                            // Environment variables
    NODE_ENV: 'development',
    API_URL: 'http://localhost:8080'
  },
  autoStart: false,                 // Start on app launch
  icon: 'nextjs',                   // Icon identifier
  color: '#000000',                 // Theme color for UI
  createdAt: '2024-01-01T00:00:00Z',
  lastRun: '2024-01-15T10:30:00Z'
}
```

### Process State
```javascript
{
  projectId: 'uuid-v4',
  status: 'RUNNING',    // STOPPED | STARTING | RUNNING | STOPPING | ERROR
  pid: 12345,           // Process ID
  startedAt: 1234567890,
  logs: [],             // Array of log lines (last 1000)
  stats: {              // Resource usage
    cpu: 2.5,           // Percentage
    memory: 180         // MB
  }
}
```

### App Config
```javascript
{
  theme: 'dark',                  // dark | light
  sidebarExpanded: true,
  startOnBoot: false,
  minimizeToTray: true,
  autoStartProjects: false,
  notifications: {
    onStart: true,
    onError: true,
    sound: false
  },
  terminal: {
    fontSize: 14,
    maxLines: 1000,
    autoScroll: true
  }
}
```

---

## 4. Supported Project Types

```javascript
const PROJECT_TYPES = {
  NEXTJS: {
    name: 'Next.js',
    detector: ['package.json contains "next"'],
    defaultCommand: 'npm run dev',
    defaultPort: 3000,
    icon: '⚡',
    color: '#000000'
  },
  REACT_VITE: {
    name: 'React (Vite)',
    detector: ['package.json contains "vite"', 'vite.config.js exists'],
    defaultCommand: 'npm run dev',
    defaultPort: 5173,
    icon: '⚛️',
    color: '#61DAFB'
  },
  VUE: {
    name: 'Vue.js',
    detector: ['package.json contains "vue"'],
    defaultCommand: 'npm run dev',
    defaultPort: 5173,
    icon: '🟢',
    color: '#42B883'
  },
  LARAVEL: {
    name: 'Laravel',
    detector: ['artisan file exists', 'composer.json contains "laravel/framework"'],
    defaultCommand: 'php artisan serve',
    defaultPort: 8000,
    icon: '🔴',
    color: '#FF2D20'
  },
  GOLANG: {
    name: 'Go',
    detector: ['go.mod exists', 'main.go exists'],
    defaultCommand: 'go run .',
    defaultPort: 8080,
    icon: '🐹',
    color: '#00ADD8'
  },
  NODEJS: {
    name: 'Node.js',
    detector: ['package.json exists'],
    defaultCommand: 'npm start',
    defaultPort: 3000,
    icon: '🟩',
    color: '#339933'
  },
  CUSTOM: {
    name: 'Custom',
    detector: [],
    defaultCommand: '',
    defaultPort: null,
    icon: '⚙️',
    color: '#6B7280'
  }
}
```

---

## 5. UI Layout Specification

### Main Window
- **Size**: 1280x800 (default), resizable
- **Min Size**: 1024x600
- **Frame**: Custom (frameless with custom titlebar)

### Sidebar
- **Width (Expanded)**: 220px
- **Width (Collapsed)**: 60px
- **Sections**:
  1. **Top Menu** (fixed):
     - Dashboard
     - Projects
     - Settings
  2. **Divider**
  3. **Running Projects** (scrollable):
     - Dynamic list of running projects
     - Click to open detail view
     - Empty state: "No running projects"

### Content Area
- **Pages**:
  - **Dashboard**: Overview stats, resource usage, recent activity
  - **Projects**: Grid of all projects (3-4 columns)
  - **Project Detail**: Full page with terminal output
  - **Settings**: Configuration options

### TopBar (Action Bar)
- **Left**: Breadcrumb / Page title
- **Right**: 
  - [+ Add Project] button
  - [▶ Start All] button
  - [■ Stop All] button
  - [⚙] Settings icon

---

## 6. IPC Communication

### Renderer → Main

```javascript
// Project Management
window.electron.addProject(projectData)
window.electron.updateProject(projectId, updates)
window.electron.deleteProject(projectId)
window.electron.getProjects()

// Process Management
window.electron.startProject(projectId)
window.electron.stopProject(projectId)
window.electron.restartProject(projectId)
window.electron.startAllProjects()
window.electron.stopAllProjects()
window.electron.getProcessStatus(projectId)

// Project Detection
window.electron.detectProjectType(projectPath)
window.electron.browseFolder()

// Config
window.electron.getConfig()
window.electron.updateConfig(updates)
```

### Main → Renderer (Events)

```javascript
// Process Events
window.electron.onProcessStatus((projectId, status) => {})
window.electron.onProcessLog((projectId, logLine) => {})
window.electron.onProcessError((projectId, error) => {})
window.electron.onProcessExit((projectId, code) => {})

// Project Events
window.electron.onProjectsUpdated((projects) => {})
```

---

## 7. Storage

### Location
```
Windows: %APPDATA%/DevLauncher/
├── config.json          # App settings
├── projects.json        # Project configurations
└── logs/
    ├── app.log          # Application logs
    └── [projectId]/     # Per-project logs
        └── 2024-01-15.log
```

### Backup
- Auto-backup `projects.json` sebelum write
- Keep last 5 backups

---

## 8. Development Phases

### Phase 1: Foundation (MVP) ✅ PRIORITY
**Goal**: Basic functional app

**Tasks**:
1. ✅ Project setup (Electron + React + Vite)
2. ✅ Basic layout (Sidebar + TopBar + Content)
3. ✅ ProcessManager implementation
4. ✅ Add/Remove project functionality
5. ✅ Start/Stop single project
6. ✅ Basic terminal output viewer
7. ✅ Project type auto-detection
8. ✅ Storage (save/load projects)

**Deliverable**: Working app yang bisa add project, start/stop, dan lihat logs.

---

### Phase 2: Core Features
**Goal**: Complete feature set

**Tasks**:
1. ⬜ Dashboard page (stats, activity)
2. ⬜ Start All / Stop All functionality
3. ⬜ Settings page
4. ⬜ Sidebar running projects list
5. ⬜ Project detail page
6. ⬜ Edit project functionality
7. ⬜ Port conflict detection
8. ⬜ Error handling & notifications

**Deliverable**: Full-featured app sesuai design.

---

### Phase 3: Polish
**Goal**: Production-ready

**Tasks**:
1. ⬜ Resource monitoring (CPU, RAM)
2. ⬜ Auto-scroll terminal
3. ⬜ Export logs functionality
4. ⬜ Keyboard shortcuts
5. ⬜ Dark/Light theme
6. ⬜ System tray integration
7. ⬜ Auto-start on boot option
8. ⬜ Crash recovery

**Deliverable**: Stable, polished app.

---

### Phase 4: Build & Distribution
**Goal**: Installer & portable .exe

**Tasks**:
1. ⬜ electron-builder configuration
2. ⬜ App icon & assets
3. ⬜ NSIS installer setup
4. ⬜ Auto-update mechanism (optional)
5. ⬜ Code signing (optional)
6. ⬜ Build CI/CD pipeline

**Deliverable**: `DevLauncher Setup.exe` & `DevLauncher Portable.exe`

---

## 9. Technical Stack Details

### Dependencies

**Production**:
```json
{
  "electron": "^28.0.0",
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "zustand": "^4.4.0",
  "uuid": "^9.0.0",
  "tailwindcss": "^3.4.0"
}
```

**Development**:
```json
{
  "vite": "^5.0.0",
  "@vitejs/plugin-react": "^4.2.0",
  "electron-builder": "^24.9.0",
  "concurrently": "^8.2.0",
  "autoprefixer": "^10.4.0",
  "postcss": "^8.4.0"
}
```

### Build Configuration

**electron-builder.json**:
```json
{
  "appId": "com.devlauncher.app",
  "productName": "DevLauncher",
  "directories": {
    "output": "dist",
    "buildResources": "build"
  },
  "win": {
    "target": [
      {
        "target": "nsis",
        "arch": ["x64"]
      },
      {
        "target": "portable",
        "arch": ["x64"]
      }
    ],
    "icon": "build/icon.ico",
    "artifactName": "${productName}-Setup-${version}.${ext}"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true
  },
  "files": [
    "electron/**/*",
    "dist-react/**/*",
    "package.json"
  ]
}
```

---

## 10. Testing Strategy

### Unit Tests
- ProcessManager methods
- ProjectDetector logic
- Storage read/write

### Integration Tests
- IPC communication
- Process spawn/kill
- State management

### Manual Testing Checklist
- [ ] Add project (all types)
- [ ] Start/Stop project
- [ ] Start All / Stop All
- [ ] Terminal output streaming
- [ ] Edit project
- [ ] Delete project
- [ ] Port conflict handling
- [ ] Crash recovery
- [ ] Settings persistence
- [ ] Window resize/minimize
- [ ] Build & install .exe

---

## 11. Future Enhancements (Post-MVP)

### Phase 5: Advanced Features
- 🔗 Project groups (start multiple related projects)
- 📦 Docker container support
- 🌐 Quick open browser button
- 📊 Better resource monitoring charts
- 🔔 Desktop notifications
- 📈 Uptime tracking & analytics
- ☁️ Cloud sync (Google Drive, Dropbox)
- 🎨 Custom themes
- 🔐 Environment variable encryption

### Phase 6: Team Features
- 👥 Shared project configurations
- 🔄 Project templates
- 📝 Project documentation integration
- 🔗 Git integration (branch, commit info)
- 📦 Dependency version checking

---

## 12. Known Limitations & Considerations

### Current Limitations:
1. **Windows Only**: Initial release (Mac/Linux later)
2. **No Remote Execution**: All projects must be local
3. **Basic Terminal**: No input support (read-only logs)
4. **Single Instance**: Can't run multiple DevLauncher instances
5. **No Container Support**: Docker/Podman not yet supported

### Security Considerations:
1. No shell injection (use spawn, not exec)
2. Validate all file paths
3. Sanitize terminal output
4. No eval() of user input
5. Secure storage for env variables (future: encryption)

### Performance Considerations:
1. Limit log lines per project (default: 1000)
2. Debounce log streaming (100ms)
3. Virtual scrolling for project grid if >50 projects
4. Lazy load project details
5. Background process cleanup on app exit

---

## 13. Timeline Estimate

| Phase | Duration | Start | End |
|-------|----------|-------|-----|
| Phase 1: Foundation (MVP) | 8-12 hours | Day 1 | Day 2 |
| Phase 2: Core Features | 6-8 hours | Day 3 | Day 3 |
| Phase 3: Polish | 4-6 hours | Day 4 | Day 4 |
| Phase 4: Build & Dist | 2-3 hours | Day 5 | Day 5 |
| **Total** | **20-29 hours** | | **~1 week** |

---

## 14. Success Metrics

### MVP Success Criteria:
- ✅ Can add 5+ projects of different types
- ✅ Can start/stop projects reliably
- ✅ Terminal output streams in real-time
- ✅ Projects persist after app restart
- ✅ No memory leaks after 1 hour usage
- ✅ Build produces working .exe

### Production-Ready Criteria:
- ✅ All MVP criteria
- ✅ Start All / Stop All works with 10+ projects
- ✅ Resource monitoring shows accurate stats
- ✅ Settings persist correctly
- ✅ Handles process crashes gracefully
- ✅ Installer works on clean Windows 10/11
- ✅ App size < 200MB

---

## 15. Getting Started

### Development Setup

```bash
# 1. Initialize project
npm init -y
npm install electron react react-dom zustand uuid
npm install -D vite @vitejs/plugin-react electron-builder concurrently tailwindcss postcss autoprefixer

# 2. Initialize Tailwind
npx tailwindcss init -p

# 3. Create folder structure
mkdir -p electron/managers electron/handlers
mkdir -p src/components/Layout src/components/Pages src/components/Project src/components/Terminal src/components/Common
mkdir -p src/hooks src/store src/utils src/styles
mkdir -p build public

# 4. Start development
npm run dev

# 5. Build for production
npm run build
```

### Package.json Scripts

```json
{
  "scripts": {
    "dev": "concurrently \"vite\" \"electron .\"",
    "build": "vite build && electron-builder",
    "build:win": "vite build && electron-builder --win --x64",
    "preview": "vite preview"
  }
}
```

---

## 16. Contributing Guidelines

### Code Style
- Use ES6+ features
- Use functional components (React Hooks)
- Use Tailwind for styling (no inline styles)
- Use async/await (no callbacks)
- Use descriptive variable names

### Commit Convention
```
feat: Add project auto-detection
fix: Resolve terminal scrolling issue
refactor: Simplify ProcessManager logic
docs: Update README with setup instructions
chore: Update dependencies
```

### File Naming
- Components: PascalCase (e.g., `ProjectCard.jsx`)
- Utilities: camelCase (e.g., `projectTypes.js`)
- Hooks: camelCase with `use` prefix (e.g., `useProjects.js`)

---

## 17. Support & Documentation

### README.md
- Installation instructions
- Basic usage guide
- Supported project types
- Troubleshooting

### In-App Help
- Tooltips on buttons
- Empty states with guidance
- Error messages with solutions

### FAQ
- How to add custom commands?
- Port already in use error
- Project not starting
- Logs not showing

---

## 18. License & Credits

**License**: MIT  
**Author**: Gatrion Dev  
**Repository**: TBD  
**Issues**: TBD  

**Credits**:
- Electron Team
- React Team
- Vite Team
- Tailwind CSS Team

---

## 19. Changelog

### v1.0.0 (Planned)
- Initial release
- Basic project management
- Process spawning & monitoring
- Terminal output viewer
- Settings page
- Windows .exe build

### v1.1.0 (Future)
- Resource monitoring
- Docker support
- Project groups
- Auto-update

---

## 20. Contact & Feedback

**Issues**: [GitHub Issues]  
**Discussions**: [GitHub Discussions]  
**Email**: TBD

---

**Last Updated**: 2024-01-15  
**Status**: 🚧 In Development - Phase 1 (Foundation)
