# DevLauncher Components

All components created based on the exact CSS classes from `template/devlauncher-template.html`.

## 📁 Directory Structure

```
src/components/
├── Settings/
│   ├── ThemeSelector.jsx       # Lines 822-839 (Theme selection cards)
│   ├── ToggleSwitch.jsx        # Lines 843-852 (Reusable toggle)
│   ├── TerminalSettings.jsx    # Lines 855-870 (Terminal config)
│   ├── SettingsView.jsx        # Lines 821-873 (Full settings view)
│   └── index.js
├── States/
│   ├── EmptyState.jsx          # Lines 878-890 (First-run state)
│   ├── LoadingSkeleton.jsx     # Lines 895-911 (Skeleton loader)
│   └── index.js
├── Modals/
│   ├── ProjectModal.jsx        # Lines 920-970 (Add/edit project)
│   ├── ConfirmDialog.jsx       # Lines 975-990 (Delete confirmation)
│   ├── CommandPalette.jsx      # Lines 995-1017 (Ctrl+K search)
│   ├── ShortcutsModal.jsx      # Lines 1022-1040 (Keyboard shortcuts)
│   ├── PortConflictModal.jsx   # Lines 1045-1070 (Port resolver)
│   ├── ToastContainer.jsx      # Lines 1074-1075 + JS 1182-1199 (Notifications)
│   └── index.js
├── Demo/
│   ├── TrayIcon.jsx            # Lines 1080-1083 (Tray button)
│   ├── TrayPopup.jsx           # Lines 1084-1101 (Tray menu)
│   ├── DemoPanel.jsx           # Lines 1106-1128 (Quick-nav panel)
│   └── index.js
└── index.js                    # Master export file
```

## 🎨 Settings Components

### ThemeSelector
**Lines 822-839** | Theme selection with preview cards

```jsx
import { ThemeSelector } from '@/components';

<ThemeSelector
  currentTheme="dark"          // 'dark' | 'light'
  onThemeChange={(theme) => {}}
/>
```

**Features:**
- Grid of theme cards with mini UI preview
- Dark theme: `#12151A` background with `#20242C` elements
- Light theme: `#FFFFFF` background with `#EEF0F3` elements
- Checkmark icon on selected theme
- Border: `border-2 border-accent` when selected, `border-border` otherwise

---

### ToggleSwitch
**Lines 843-852** | Reusable toggle switch component

```jsx
import { ToggleSwitch } from '@/components';

<ToggleSwitch
  enabled={true}
  onChange={() => {}}
  label="Start on app launch"
  description="Auto-run when DevLauncher opens" // optional
/>
```

**Features:**
- Classes: `w-9 h-5 rounded-full`
- Background: `bg-accent` (on), `bg-surface-3 border border-border` (off)
- Inner dot: `w-4 h-4 rounded-full bg-white`
- Position: `right-0.5` (on), `left-0.5` (off)

---

### TerminalSettings
**Lines 855-870** | Terminal configuration panel

```jsx
import { TerminalSettings } from '@/components';

<TerminalSettings
  fontSize={14}
  onFontSizeChange={(size) => {}}
  maxLines={1000}
  onMaxLinesChange={(lines) => {}}
  autoScroll={true}
  onAutoScrollChange={() => {}}
/>
```

**Features:**
- Font size controls: minus/plus buttons with value display
- Max log lines: input field with right alignment
- Auto-scroll toggle: uses ToggleSwitch pattern
- Range: 8-24px for font size

---

### SettingsView
**Lines 821-873** | Complete settings view assembly

```jsx
import { SettingsView } from '@/components';

<SettingsView
  settings={{
    theme: 'dark',
    sidebarExpanded: true,
    startOnBoot: false,
    minimizeToTray: true,
    notifyOnStart: true,
    notifyOnCrash: true,
    notificationSound: false,
    terminalFontSize: 14,
    terminalMaxLines: 1000,
    terminalAutoScroll: true
  }}
  onSave={() => {}}
  onSettingsChange={(newSettings) => {}}
/>
```

**Sections:**
1. **Appearance**: ThemeSelector
2. **General**: 3 toggles (sidebar, boot, tray)
3. **Notifications**: 3 toggles (start, crash, sound)
4. **Terminal**: TerminalSettings
5. Save button at bottom

---

## 🎯 States Components

### EmptyState
**Lines 878-890** | First-run empty state

```jsx
import { EmptyState } from '@/components';

<EmptyState
  onAddProject={() => {}}
  onImportFolder={() => {}}
/>
```

**Features:**
- Centered layout with `py-24 px-4`
- Icon: `w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20`
- Title: `font-display font-bold text-xl`
- Description: `text-sm text-ink-faint mt-2 max-w-sm`
- Two action buttons: primary (accent) + secondary (surface-3)

---

### LoadingSkeleton
**Lines 895-911** | Animated skeleton loader

```jsx
import { LoadingSkeleton } from '@/components';

<LoadingSkeleton />
```

**Features:**
- Class: `animate-pulse`
- Matches dashboard layout:
  - 4-column grid of stat cards (h-24)
  - 2:1 grid for chart + activity (h-48)
  - 3-column grid for project cards (h-40)
- Skeleton blocks: `bg-surface-3 rounded`

---

## 🪟 Modals Components

### ProjectModal
**Lines 920-970** | Add/edit project form

```jsx
import { ProjectModal } from '@/components';

<ProjectModal
  isOpen={true}
  onClose={() => {}}
  onSave={(formData) => {}}
  project={null}  // or project object for edit mode
/>
```

**Form Fields:**
- Name: text input
- Path: text input + Browse button
- Type: select (React, Next.js, Vue, Laravel, Go, Node.js, Custom)
- Port: text input
- Start command: text input
- Environment variables: dynamic key-value pairs with add/remove
- Auto-start toggle

**Classes:**
- Backdrop: `bg-black/60 backdrop-blur-sm`
- Modal: `max-w-lg bg-surface border border-border rounded-xl2`
- Body: `overflow-y-auto` with `max-h-[85vh]`

---

### ConfirmDialog
**Lines 975-990** | Deletion confirmation

```jsx
import { ConfirmDialog } from '@/components';

<ConfirmDialog
  isOpen={true}
  onClose={() => {}}
  onConfirm={() => {}}
  projectName="storefront-web"
/>
```

**Features:**
- Icon: trash icon in `bg-danger/10` circle
- Title: `font-display font-bold text-sm`
- Warning text: `text-xs text-ink-faint`
- Buttons: Cancel (ghost) + Remove (danger)

---

### CommandPalette
**Lines 995-1017** | Keyboard-driven search (Ctrl+K)

```jsx
import { CommandPalette } from '@/components';

<CommandPalette
  isOpen={true}
  onClose={() => {}}
  onItemSelect={(item) => {}}
  projects={[
    { id: '1', name: 'storefront-web', icon: '⚛️', label: 'storefront-web react' }
  ]}
  actions={[
    { id: 'start-all', name: 'Start All Projects', icon: '▶', label: 'start all projects' }
  ]}
/>
```

**Features:**
- Search input with live filtering via `data-label` attribute
- Sections: Projects + Actions
- Keyboard shortcuts: Ctrl+K (open), Esc (close)
- Items: `hover:bg-surface-3 text-sm`
- Auto-focus input on open

---

### ShortcutsModal
**Lines 1022-1040** | Keyboard shortcuts cheat sheet

```jsx
import { ShortcutsModal } from '@/components';

<ShortcutsModal
  isOpen={true}
  onClose={() => {}}
/>
```

**Shortcuts List:**
- Ctrl K: Open command palette
- Ctrl N: Add new project
- Ctrl Shift S: Start all projects
- Ctrl Shift X: Stop all projects
- ?: Show shortcuts
- Esc: Close dialog

**Layout:** `space-y-2.5 text-xs` with kbd elements on right

---

### PortConflictModal
**Lines 1045-1070** | Port conflict resolver

```jsx
import { PortConflictModal } from '@/components';

<PortConflictModal
  isOpen={true}
  onClose={() => {}}
  port={3000}
  onResolve={({ action, port }) => {}}
/>
```

**Options:**
1. Kill process using :port
2. Use different port (with input)

**Features:**
- Warning icon: `bg-warning/10`
- Radio buttons: `accent-accent`
- Labels: `border border-border hover:border-accent/50`
- Resolve button: accent primary

---

### ToastContainer
**Lines 1074-1075 + JS 1182-1199** | Notification toasts

```jsx
import { ToastContainer } from '@/components';

<ToastContainer
  toasts={[
    { id: '1', type: 'success', message: 'Project started' },
    { id: '2', type: 'error', message: 'Port conflict' },
    { id: '3', type: 'warning', message: 'High memory usage' }
  ]}
  onDismiss={(id) => {}}
/>
```

**Features:**
- Position: `fixed bottom-5 right-5 z-[60]`
- Layout: `flex flex-col gap-2 w-80`
- Auto-dismiss after 4 seconds
- Animation: `animate-[fadeIn_.15s_ease-out]`

**Variants:**
- **success**: `border-success/30`, checkmark icon
- **error**: `border-danger/30`, alert circle icon
- **warning**: `border-warning/30`, triangle icon

---

## 🎪 Demo Components

### TrayIcon
**Lines 1080-1083** | System tray indicator

```jsx
import { TrayIcon } from '@/components';

<TrayIcon onClick={() => {}} />
```

**Features:**
- Position: `fixed bottom-4 left-4 z-40`
- Size: `w-11 h-11 rounded-full`
- Pulse badge: `w-2.5 h-2.5 rounded-full bg-success border-2 border-base`
- Play icon in `#6D5EF5`

---

### TrayPopup
**Lines 1084-1101** | Tray menu with running projects

```jsx
import { TrayPopup } from '@/components';

<TrayPopup
  isOpen={true}
  runningProjects={[
    { id: '1', name: 'storefront-web' }
  ]}
  onClose={() => {}}
  onStopProject={(id) => {}}
  onQuit={() => {}}
/>
```

**Layout:**
1. Running projects count header
2. List of running projects with Stop buttons
3. Divider
4. Open DevLauncher action
5. Quit action (danger text)

---

### DemoPanel
**Lines 1106-1128** | Template preview quick-nav

```jsx
import { DemoPanel } from '@/components';

<DemoPanel
  onNavigate={(view) => {}}       // 'dashboard', 'projects', etc.
  onOpenModal={(modal) => {}}     // 'portConflict', 'commandPalette', etc.
  onToggleTray={() => {}}
/>
```

**Features:**
- Toggle button: `w-11 h-11 rounded-full bg-accent shadow-glow`
- Panel: `w-64 bg-surface-2 rounded-xl2`
- Grid buttons: 2 columns for view navigation
- Divider + modal triggers

---

## 🎨 CSS Classes Reference

### Key Classes Used

**Borders:**
- `rounded-xl2` → `1.1rem` (custom)
- `border-border` → `#232830`
- `border-accent` → `#6D5EF5`

**Backgrounds:**
- `bg-surface` → `#12151A`
- `bg-surface-2` → `#191D24`
- `bg-surface-3` → `#20242C`
- `bg-accent` → `#6D5EF5`

**Text:**
- `text-ink` → `#EDEFF2`
- `text-ink-soft` → `#9199A6`
- `text-ink-faint` → `#5C6472`

**Shadows:**
- `shadow-card` → Custom card shadow
- `shadow-glow` → Accent glow effect

**Transitions:**
- All buttons: `transition-colors`
- Toggle dots: `transition-transform`

---

## 🚀 Usage Example

```jsx
import React, { useState } from 'react';
import {
  SettingsView,
  EmptyState,
  LoadingSkeleton,
  ProjectModal,
  ConfirmDialog,
  CommandPalette,
  ToastContainer
} from '@/components';

function App() {
  const [settings, setSettings] = useState({
    theme: 'dark',
    sidebarExpanded: true,
    // ... other settings
  });

  const [toasts, setToasts] = useState([]);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);

  const showToast = (type, message) => {
    const id = Date.now().toString();
    setToasts([...toasts, { id, type, message }]);
  };

  return (
    <>
      <SettingsView
        settings={settings}
        onSettingsChange={setSettings}
        onSave={() => showToast('success', 'Settings saved')}
      />

      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        onSave={(project) => {
          // Save project
          showToast('success', 'Project added');
        }}
      />

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts(toasts.filter(t => t.id !== id))}
      />
    </>
  );
}
```

---

## ✅ Implementation Checklist

- [x] **Settings/** (4 components)
  - [x] ThemeSelector
  - [x] ToggleSwitch
  - [x] TerminalSettings
  - [x] SettingsView

- [x] **States/** (2 components)
  - [x] EmptyState
  - [x] LoadingSkeleton

- [x] **Modals/** (6 components)
  - [x] ProjectModal
  - [x] ConfirmDialog
  - [x] CommandPalette
  - [x] ShortcutsModal
  - [x] PortConflictModal
  - [x] ToastContainer

- [x] **Demo/** (3 components)
  - [x] TrayIcon
  - [x] TrayPopup
  - [x] DemoPanel

- [x] **Index files** (5 files)
  - [x] Settings/index.js
  - [x] States/index.js
  - [x] Modals/index.js
  - [x] Demo/index.js
  - [x] components/index.js

**Total: 15 components + 5 index files = 20 files**

---

## 📝 Notes

1. **Exact CSS classes** from template used throughout
2. **State management** props-based for flexibility
3. **Animations** match template (fadeIn, pulse, transitions)
4. **Accessibility** maintained with proper ARIA patterns
5. **TypeScript** ready (add PropTypes or convert to .tsx)
6. **Keyboard shortcuts** implemented in CommandPalette
7. **Auto-dismiss** built into Toast (4 seconds)
8. **Click outside** handled in modals via backdrop

---

## 🔄 Next Steps

1. Integrate with existing Dashboard/Projects components
2. Add keyboard shortcut handler to App.js
3. Implement toast queue management hook
4. Connect settings to theme provider
5. Wire up project CRUD operations
6. Add form validation to ProjectModal
7. Implement file browser for path selection
