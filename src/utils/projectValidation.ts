/** Shared rules for form feedback and persisted project validation. */
export function environmentErrors(values: Array<{ key: string; value: string; unchanged?: boolean }>): Record<string, string> {
  const errors: Record<string, string> = {}
  const seen = new Set<string>()
  values.forEach((item, index) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(item.key)) errors[`env.${index}`] = 'Use a valid environment variable name'
    else if (seen.has(item.key)) errors[`env.${index}`] = 'Environment variable names must be unique'
    seen.add(item.key)
  })
  return errors
}

export function dependencyError(projectId: string, dependsOn: string[], projects: Array<{ id: string; dependsOn?: string[] }>): string | null {
  const graph = new Map(projects.map(p => [p.id, p.dependsOn || []]))
  graph.set(projectId, dependsOn)
  const visiting = new Set<string>(), visited = new Set<string>()
  const visit = (id: string): string | null => {
    if (!graph.has(id)) return 'A dependency project no longer exists'
    if (visiting.has(id)) return 'Project dependencies cannot contain a cycle'
    if (visited.has(id)) return null
    visiting.add(id)
    for (const dep of graph.get(id) || []) { const error = visit(dep); if (error) return error }
    visiting.delete(id); visited.add(id)
    return null
  }
  return visit(projectId)
}
