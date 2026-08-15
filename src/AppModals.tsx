import {
  ProjectModal,
  ConfirmDialog,
  CommandPalette,
  ShortcutsModal,
  ToastContainer,
  PresetModal,
} from './components/Modals'
import PortConflictModal from './components/Modals/PortConflictModal'
import type { PresetFormData } from './components/Modals/PresetModal'
import type { Project, Preset } from './types/shared'
import type { ProjectRuntime } from './hooks/useProjects'
import type { Toast } from './hooks/useToasts'
import type { DroppedProjectData } from './useAppDrop'
import type { PaletteCommand, PortConflictTarget } from './AppTypes'

export interface AppModalsProps {
  openModal: string | null
  onCloseAll: () => void
  onSaveProject: (data: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
  editingProject: ProjectRuntime | null
  droppedProject: DroppedProjectData | null
  projects: ProjectRuntime[]
  confirmTarget: Project | Project[] | null
  onConfirmDelete: () => Promise<void>
  presetToDelete: Preset | null
  onConfirmDeletePreset: () => Promise<void>
  onCancelPresetDelete: () => void
  presets: Preset[]
  onSelectCommand: (command: PaletteCommand) => void
  portConflictTarget: PortConflictTarget | null
  onClosePortConflict: () => void
  onEditPort: () => void
  presetModalOpen: boolean
  presetModalInitial: Preset | null
  presetModalPreselect: string[] | null
  onClosePresetModal: () => void
  onSubmitPreset: (data: PresetFormData) => void
  toasts: Toast[]
  onDismissToast: (id: number) => void
}

/** All app-global modal dialogs, rendered outside the layout chrome. */
export default function AppModals({
  openModal,
  onCloseAll,
  onSaveProject,
  editingProject,
  droppedProject,
  projects,
  confirmTarget,
  onConfirmDelete,
  presetToDelete,
  onConfirmDeletePreset,
  onCancelPresetDelete,
  presets,
  onSelectCommand,
  portConflictTarget,
  onClosePortConflict,
  onEditPort,
  presetModalOpen,
  presetModalInitial,
  presetModalPreselect,
  onClosePresetModal,
  onSubmitPreset,
  toasts,
  onDismissToast,
}: AppModalsProps) {
  return (
    <>
      {/* Project Modal */}
      <ProjectModal
        isOpen={openModal === 'project'}
        onClose={onCloseAll}
        onSave={onSaveProject}
        project={editingProject}
        droppedProject={droppedProject}
        allProjects={projects}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={openModal === 'confirm'}
        title="Delete Project"
        message={Array.isArray(confirmTarget)
          ? `Are you sure you want to remove ${confirmTarget.length} selected project(s)? This will not delete any files on disk.`
          : `Are you sure you want to remove "${confirmTarget?.name || 'this project'}" from your projects? This will not delete the files.`}
        confirmLabel={Array.isArray(confirmTarget) && confirmTarget.length > 1 ? `Delete ${confirmTarget.length} Projects` : 'Delete'}
        confirmVariant="danger"
        onConfirm={onConfirmDelete}
        onCancel={onCloseAll}
      />

      {/* Confirm Dialog for preset delete */}
      <ConfirmDialog
        isOpen={presetToDelete !== null}
        title="Delete Preset"
        message={`Are you sure you want to delete the preset "${presetToDelete?.name || 'this preset'}"?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={onConfirmDeletePreset}
        onCancel={onCancelPresetDelete}
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={openModal === 'command'}
        onClose={onCloseAll}
        projects={projects}
        presets={presets}
        onSelectCommand={onSelectCommand}
      />

      {/* Shortcuts Modal */}
      <ShortcutsModal
        isOpen={openModal === 'shortcuts'}
        onClose={onCloseAll}
      />

      {/* Port Conflict Modal */}
      <PortConflictModal
        isOpen={!!portConflictTarget}
        conflictData={portConflictTarget ? {
          ...portConflictTarget.conflictData,
          skippedCount: portConflictTarget.skippedCount || 0,
          skippedNames: portConflictTarget.skippedNames || [],
        } : null}
        onClose={onClosePortConflict}
        onEditPort={onEditPort}
      />

      {/* Preset create/edit modal */}
      <PresetModal
        isOpen={presetModalOpen}
        onClose={onClosePresetModal}
        projects={projects}
        initialPreset={presetModalInitial}
        initialSelected={presetModalPreselect}
        onSubmit={onSubmitPreset}
      />

      <ToastContainer toasts={toasts} onDismiss={onDismissToast} />
    </>
  )
}
