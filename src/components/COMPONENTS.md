# DevLauncher Components

React components for the DevLauncher project management interface, based on the exact template at `template/devlauncher-template.html`.

## Projects Components (`src/components/Projects/`)

### 1. FilterBar.jsx
Search input, type/status filters, sort dropdown, and view toggle (grid/list).

**Props:**
- `onSearch` - Callback for search input changes
- `onFilterType` - Callback for type filter changes
- `onFilterStatus` - Callback for status filter changes
- `onSort` - Callback for sort option changes
- `viewMode` - Current view mode ('grid' or 'list')
- `onViewModeChange` - Callback for view mode toggle

### 2. BulkToolbar.jsx
Sticky toolbar showing when projects are selected.

**Props:**
- `selectedCount` - Number of selected projects
- `onClearSelection` - Callback to clear all selections
- `onBulkStart` - Callback to start selected projects
- `onBulkStop` - Callback to stop selected projects
- `onBulkDelete` - Callback to delete selected projects

**Behavior:** Hidden when `selectedCount === 0`

### 3. ProjectGridCard.jsx
Grid view project card with checkbox, sparkline chart, and actions.

**Props:**
- `project` - Project object containing:
  - `id`, `name`, `type`, `port`, `emoji`, `color`
  - `status` - 'running' | 'error' | 'stopped'
  - `uptime` - Running uptime string (e.g., "2h 14m")
  - `idleTime` - Idle time string (e.g., "2d")
  - `sparklinePoints` - SVG polyline points string
  - `errorMessage` - Error message for crashed projects
  - `onStart`, `onStop`, `onRestart`, `onShowMenu` - Action callbacks
- `isSelected` - Boolean selection state
- `onToggleSelect` - Callback for checkbox toggle
- `onShowDetail` - Callback to show project detail view

### 4. ProjectListRow.jsx
List view project row (compact horizontal layout).

**Props:**
- `project` - Same as ProjectGridCard
- `isSelected` - Boolean selection state
- `onToggleSelect` - Callback for checkbox toggle
- `onShowDetail` - Callback to show project detail view

### 5. ProjectsView.jsx
Main projects view that assembles FilterBar, BulkToolbar, and grid/list view.

**Props:**
- `projects` - Array of project objects
- `onOpenModal` - Callback to open the "Add Project" modal
- `onConfirmDelete` - Callback to show delete confirmation

**Features:**
- View mode switching (grid/list)
- Bulk selection state management
- Filter and search state management

---

## ProjectDetail Components (`src/components/ProjectDetail/`)

### 6. ProjectDetailHeader.jsx
Large project header with emoji, name, status, metadata, and action buttons.

**Props:**
- `project` - Project object with:
  - `emoji`, `name`, `status`, `uptime`, `path`, `type`, `port`, `pid`
- `onStop` - Stop button callback
- `onRestart` - Restart button callback
- `onOpenBrowser` - Open browser button callback
- `onShowMenu` - Dropdown menu button callback

### 7. CrashBanner.jsx
Persistent dismissible error banner.

**Props:**
- `message` - Error message (e.g., "Process crashed unexpectedly (2 days ago)")
- `timestamp` - Crash details timestamp
- `onRestart` - Restart button callback
- `onDismiss` - Dismiss (X) button callback

### 8. TabNavigation.jsx
Tab buttons for Logs, Environment, Settings.

**Props:**
- `activeTab` - Current active tab ID ('logs' | 'env' | 'settings')
- `onTabChange` - Callback for tab selection

### 9. LogsTab.jsx
Terminal viewer with filter input and auto-scroll checkbox.

**Props:**
- `logs` - Array of log objects:
  - `timestamp` - Log timestamp (e.g., "14:22:01")
  - `level` - Log level ('info' | 'ready' | 'warn' | 'error')
  - `message` - Log message text
- `onFilterChange` - Filter input change callback
- `autoScroll` - Boolean auto-scroll state
- `onAutoScrollChange` - Auto-scroll checkbox callback

### 10. EnvironmentTab.jsx
Environment variables editor with add/remove functionality.

**Props:**
- `envVars` - Array of `{ key, value }` objects
- `onAdd` - Add new variable callback
- `onRemove` - Remove variable callback (receives index)
- `onChange` - Change variable callback (receives index, field, value)

### 11. SettingsTab.jsx
Project settings form with danger zone.

**Props:**
- `project` - Project object with:
  - `name`, `startCommand`, `autoStart`
- `onSave` - Save settings callback (receives form data)
- `onRemove` - Remove project callback

**Features:**
- Form fields: name, start command, auto-start toggle
- Danger zone with remove button

### 12. ProjectDetailView.jsx
Full detail view that assembles all ProjectDetail components.

**Props:**
- `project` - Full project object
- `onBack` - Back button callback
- `onSave` - Save settings callback
- `onRemove` - Remove project callback

**Features:**
- Tab state management
- Crash banner visibility
- Environment variables state
- Auto-scroll and filter state

---

## Usage Example

```jsx
import { ProjectsView } from './components/Projects';
import { ProjectDetailView } from './components/ProjectDetail';

// Projects view
<ProjectsView
  projects={projectsData}
  onOpenModal={() => setShowModal(true)}
  onConfirmDelete={(name) => confirmDelete(name)}
/>

// Project detail view
<ProjectDetailView
  project={selectedProject}
  onBack={() => setView('projects')}
  onSave={(data) => saveProject(data)}
  onRemove={() => removeProject()}
/>
```

## CSS Classes

All components use **exact CSS classes** from the template:
- Tailwind utility classes
- Custom color tokens (accent, success, danger, warning, ink, surface, border)
- Custom classes: `scan-line`, `pulse-dot`, `shadow-card`, `shadow-glow`, `rounded-xl2`

## Notes

- All SVG icons are inline for consistency with the template
- The `pulse-dot` animation requires the CSS from the template
- The `scan-line` effect requires the repeating gradient CSS
- Components support dark/light themes via `[data-theme]` attribute
