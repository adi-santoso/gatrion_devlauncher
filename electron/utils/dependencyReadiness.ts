import type { Project } from '../../src/types/shared'

export function collectDependencies(project: Project, all: Project[]): Project[] {
  const byId = new Map(all.map(p => [p.id, p]))
  const visiting = new Set<string>(), visited = new Set<string>(), result: Project[] = []
  const visit = (p: Project) => {
    if (visiting.has(p.id)) throw new Error('Project dependencies cannot contain a cycle')
    if (visited.has(p.id)) return
    visiting.add(p.id)
    for (const id of p.dependsOn || []) {
      const dep = byId.get(id)
      if (!dep) throw new Error(`Dependency ${id} no longer exists`)
      visit(dep)
    }
    visiting.delete(p.id); visited.add(p.id)
    if (p.id !== project.id) result.push(p)
  }
  visit(project)
  return result
}

export async function waitForDependency(project: Project, getStatus: (id: string) => { status: string; error?: string | null; errorMessage?: string | null }, timeoutMs = 125000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    const state = getStatus(project.id)
    const status = state.status.toLowerCase()
    if (status === 'running') return
    const error = state.error || state.errorMessage
    if (status !== 'starting') throw new Error(`Dependency ${project.name} is ${status}${error ? `: ${error}` : ''}`)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for dependency ${project.name}`)
}
