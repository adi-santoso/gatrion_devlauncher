import { create } from 'zustand'

const useAppStore = create((set, get) => ({
  // Projects
  projects: [],
  currentProject: null,

  // Process statuses
  processStatuses: {}, // { projectId: { status, pid, logs, etc } }

  // UI State
  currentPage: 'projects',
  sidebarExpanded: true,
  addProjectModalOpen: false,

  // Config
  config: {
    theme: 'dark',
    autoStartProjects: false,
  },

  // Actions
  setProjects: (projects) => set({ projects }),

  addProject: (project) => set((state) => ({
    projects: [...state.projects, project],
  })),

  updateProject: (projectId, updates) => set((state) => ({
    projects: state.projects.map((p) =>
      p.id === projectId ? { ...p, ...updates } : p
    ),
  })),

  removeProject: (projectId) => set((state) => ({
    projects: state.projects.filter((p) => p.id !== projectId),
  })),

  setCurrentProject: (project) => set({ currentProject: project }),

  // Process status
  setProcessStatus: (projectId, status) => set((state) => ({
    processStatuses: {
      ...state.processStatuses,
      [projectId]: { ...state.processStatuses[projectId], ...status },
    },
  })),

  addProcessLog: (projectId, log) => set((state) => {
    const currentStatus = state.processStatuses[projectId] || { logs: [] }
    const logs = [...(currentStatus.logs || []), log]

    // Keep only last 1000 logs
    if (logs.length > 1000) {
      logs.shift()
    }

    return {
      processStatuses: {
        ...state.processStatuses,
        [projectId]: {
          ...currentStatus,
          logs,
        },
      },
    }
  }),

  clearProcessLogs: (projectId) => set((state) => ({
    processStatuses: {
      ...state.processStatuses,
      [projectId]: {
        ...state.processStatuses[projectId],
        logs: [],
      },
    },
  })),

  // UI actions
  setCurrentPage: (page) => set({ currentPage: page }),

  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),

  setAddProjectModalOpen: (open) => set({ addProjectModalOpen: open }),

  // Config
  setConfig: (config) => set({ config }),

  updateConfig: (updates) => set((state) => ({
    config: { ...state.config, ...updates },
  })),
}))

export default useAppStore
