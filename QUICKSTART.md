# DevLauncher - Quick Start Guide

## 🚀 Getting Started

### Prerequisites
- Node.js 16+ installed
- npm or yarn package manager

### Installation

```bash
# Install dependencies
npm install

# Or with yarn
yarn install
```

## 🎯 Development Modes

### 1. Browser Development Mode (Fast UI Testing)
```bash
npm run dev:vite
```
- React-only development server
- Hot module replacement
- Mock data for testing UI
- Fast iteration
- Open http://localhost:5173

**Use this when:**
- Building UI components
- Testing layouts and styles
- Rapid prototyping
- No backend needed

### 2. Full Electron Development Mode
```bash
npm run dev
```
- Starts both Vite dev server and Electron
- Real IPC communication
- Actual process management
- File system access
- Full app functionality

**Use this when:**
- Testing backend integration
- Process management features
- Settings persistence
- Real project detection

### 3. Production Build
```bash
npm run build
```
- Builds React production bundle
- Packages Electron app
- Creates distributable in `dist/`

## 📁 Project Structure

```
gatrion_dev/
├── electron/                    # Electron backend
│   ├── main.js                 # Main process
│   ├── preload.js             # IPC bridge
│   ├── managers/              # Core managers
│   │   ├── ProcessManager.js
│   │   ├── StorageManager.js
│   │   └── ProjectDetector.js
│   └── handlers/              # IPC handlers
│       ├── processHandlers.js
│       └── projectHandlers.js
│
├── src/                        # React frontend
│   ├── App.jsx                # Main app component
│   ├── hooks/                 # Custom hooks
│   │   ├── useProjects.js
│   │   ├── useProcesses.js
│   │   └── useElectronConfig.js
│   ├── utils/                 # Utilities
│   │   └── ipcRenderer.js     # IPC wrapper
│   └── components/            # UI components
│       ├── Dashboard/
│       ├── Projects/
│       ├── Settings/
│       └── ...
│
└── storage/                    # App data (created at runtime)
    ├── projects.json
    └── config.json
```

## 🔧 Key Features

### ✅ Project Management
- Add projects by browsing folders
- Auto-detect project type (React, Vue, Node, etc.)
- Edit project settings
- Delete projects

### ✅ Process Management
- Start/stop/restart projects
- View real-time terminal logs
- Monitor CPU/memory usage
- Bulk operations (start/stop all)

### ✅ Configuration
- Persist settings to disk
- Theme switching (dark/light)
- Terminal customization
- System integration options

## 🧪 Testing the Integration

### 1. Test in Browser Mode
```bash
npm run dev:vite
```
- Should show mock projects
- Console warnings: "Running in browser mode"
- All UI functionality works
- No errors in console

### 2. Test in Electron Mode
```bash
npm run dev
```

**Projects Tab:**
1. Click "Add Project"
2. Browse to a project folder
3. Should detect project type
4. Click "Start" on a project
5. Verify process starts
6. Check terminal logs appear

**Settings Tab:**
1. Change theme (dark/light)
2. Toggle settings
3. Click "Save Settings"
4. Restart app → settings should persist

**Dashboard:**
1. View running projects
2. Check stats update
3. View activity feed
4. Monitor resource usage

### 3. Console Test Helper
In Electron DevTools console:
```javascript
// Load test helper
const script = document.createElement('script');
script.src = '/test-integration.js';
document.head.appendChild(script);

// Or run directly
window.electron.getProjects().then(console.log);
window.electron.getConfig().then(console.log);
```

## 🐛 Troubleshooting

### "Electron APIs not available"
- Make sure you're running `npm run dev`, not `npm run dev:vite`
- Check Electron opened successfully
- Look for main process errors in terminal

### Projects not persisting
- Check `storage/projects.json` exists
- Verify file permissions
- Check Electron logs for storage errors

### Process won't start
- Verify project path is correct
- Check if port is already in use
- Review process logs in terminal

### Build fails
- Clear `dist-react/` and `dist/` folders
- Run `npm install` again
- Check for Node.js version compatibility

## 📚 Documentation

- `INTEGRATION_SUMMARY.md` - Integration overview
- `ELECTRON_INTEGRATION.md` - Detailed architecture docs
- `test-integration.js` - Browser test helper

## 🎨 UI Development Tips

### Adding New Components
1. Create component in `src/components/`
2. Use existing design tokens
3. Follow naming conventions
4. Export from index.js

### Styling
- Uses Tailwind CSS v4
- Custom design tokens in `index.css`
- Dark/light theme support via `data-theme` attribute

### State Management
- Local state with `useState`
- Custom hooks for Electron data
- No global state library needed

## 🔑 Keyboard Shortcuts

- `Ctrl/Cmd + K` - Command palette
- `?` - Show shortcuts
- `Esc` - Close modals

## 📦 Building for Production

### Windows
```bash
npm run build:win
```
Output: `dist/DevLauncher Setup 1.0.0.exe`

### Cross-platform
```bash
npm run build
```
Builds for current platform.

## 🚦 Next Steps

After basic testing works:
1. Test with multiple projects
2. Test process crashes and restarts
3. Test port conflicts
4. Test settings persistence
5. Add more project templates
6. Implement activity feed
7. Add process metrics tracking

## 💡 Tips

- Use browser mode for fast UI iteration
- Use Electron mode for integration testing
- Check both React and Electron console logs
- Storage files are in `./storage/`
- Logs are in `./logs/` (when implemented)

## 🆘 Need Help?

Check the documentation files:
- Integration issues → `ELECTRON_INTEGRATION.md`
- Architecture questions → `INTEGRATION_SUMMARY.md`
- General setup → This file

Happy coding! 🎉
