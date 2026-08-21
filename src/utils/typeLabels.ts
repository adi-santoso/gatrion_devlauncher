import type { ProjectType } from '../types/shared'

export const TYPE_LABELS: Record<ProjectType, string> = {
  LARAVEL: 'Laravel',
  NEXTJS: 'Next.js',
  VUE: 'Vue.js',
  REACT_VITE: 'React (Vite)',
  REACT: 'React',
  GOLANG: 'Go',
  PYTHON: 'Python',
  NODEJS: 'Node.js',
  CUSTOM: 'Custom',
}

export const typeLabel = (type: string | null | undefined): string =>
  (type && TYPE_LABELS[type as ProjectType]) || type || 'CUSTOM'
