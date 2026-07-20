# Electron Integration Documentation

## Overview
This document describes the integration between the React frontend and Electron backend for DevLauncher.

## Architecture

### 1. IPC Layer (`src/utils/ipcRenderer.js`)
Central wrapper for all Electron IPC communications with:
- Automatic detection of Electron availability
- Fallback to mock data in browser mode
- Clean API for all project, process, and config operations
- Event listener management with cleanup functions

### 2. Custom Hooks (`src/hooks/`)

#### `useProjects()`
Manages project CRUD operations:
- `projects` - Array of all projects
- `loading` - Loading state
- `error` - Error state
- `addProject(data)` - Add new project
- `updateProject(id, updates)` - Update project
- `deleteProject(id)` - Delete project
- `refreshProjects()` - Reload from storage
- `browseFolder()` - Open folder picker
- `detectProjectType(path)` - Auto-detect project type

#### `useProcesses(projects, onProjectUpdate)`
Manages process lifecycle and events:
- `startProject(id)` - Start a project
- `stopProject(id)` - Stop a project
- `restartProject(id)` - Restart a project
- `startAll()` - Start all projects
- `stopAll()` - Stop all projects
- `getStatus(id)` - Get process status
- `getLogs(id)` - Get logs for project
- `clearLogs(id)` - Clear logs

Automatically subscribes to:
- Process status changes
- Process logs
- Process errors
- Process exits

#### `useElectronConfig()`
Manages application configuration:
- `config` - Current configuration object
- `loading` - Loading state
- `error` - Error state
- `updateConfig(updates)` - Update multiple settings
- `updateSingle(key, value)` - Update single setting
- `loadConfig()` - Reload from storage

## Data Flow

### Project Lifecycle
```
1. App.jsx loads → useProjects() → IPC getProjects() → StorageManager
2. User adds project → addProject() → IPC add-project → StorageManager.saveProjects()
3. User starts project → startProject() → IPC start-project → ProcessManager.startProcess()
4. Process emits events → process-status → onProcessStatus listener → updateProject()
5. UI updates with new status
```

### Configuration Updates
```
1. User changes setting → updateConfig() → IPC update-config → StorageManager.updateConfig()
2. Config persisted to config.json
3. Local state updated
4. UI reflects changes
```

## Browser Development Mode

When running in browser (without Electron):
- All IPC calls use mock data
- Console warnings indicate browser mode
- Full UI functionality available for development
- No persistent storage

Check with `isElectronAvailable()` to conditionally enable features.

## Component Integration

### App.jsx
- Uses all three hooks at top level
- Manages global state and routing
- Passes handlers down to views
- Coordinates between hooks

### SettingsView.jsx
- Uses `useElectronConfig()` directly
- No prop drilling needed
- Auto-persists changes

### Dashboard/Projects Views
- Receive projects and handlers via props
- Don't need direct hook access
- Maintain separation of concerns

## Event Subscriptions

All event listeners are automatically cleaned up on unmount:

```javascript
useEffect(() => {
  const cleanup = ipc.onProcessStatus((projectId, status) => {
    // Handle status update
  });
  return cleanup; // Removes listener
}, []);
```

## Error Handling

All IPC calls return:
```javascript
{
  success: boolean,
  error?: string,
  data?: any
}
```

Hooks handle errors internally and expose error state.
Components should check results and show appropriate feedback.

## Testing Checklist

### Basic Operations
- [ ] Projects load from storage on app start
- [ ] Adding a project persists to storage
- [ ] Updating a project persists changes
- [ ] Deleting a project removes from storage
- [ ] Settings changes persist across restarts

### Process Management
- [ ] Starting a project spawns the process
- [ ] Stopping a project kills the process
- [ ] Restarting a project works correctly
- [ ] Multiple projects can run simultaneously
- [ ] Process status updates in real-time

### Real-time Events
- [ ] Terminal logs stream correctly
- [ ] Process status changes update UI
- [ ] Error messages appear on crashes
- [ ] Exit codes are captured

### Browser Mode
- [ ] App works in browser with mock data
- [ ] Console warnings appear for IPC calls
- [ ] No errors when Electron APIs unavailable

## Future Enhancements

1. **Activity Feed**: Capture project events (start/stop/crash) and populate activities list
2. **Process Metrics**: Add CPU/memory tracking via process-status events
3. **Log Management**: Implement log retention and clearing
4. **Port Conflict Detection**: Handle port conflicts and show PortConflictModal
5. **Auto-start Projects**: Start configured projects on app launch
