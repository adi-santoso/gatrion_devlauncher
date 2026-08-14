import type { Project } from '../types/shared'

export const upsertProject = (projects: Project[], project: Project): Project[] => {
  const index = projects.findIndex((item) => item.id === project.id)
  if (index === -1) return [...projects, project]

  const nextProjects = [...projects]
  nextProjects[index] = { ...projects[index], ...project }
  return nextProjects
}
