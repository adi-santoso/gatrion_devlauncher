/**
 * Render a conversation transcript as readable Markdown for export.
 */
function messagesToMarkdown(messages: Array<{ role: string; content: string }> | null | undefined, title = 'Conversation'): string {
  const lines = [`# ${title}`, '', `_Exported ${new Date().toLocaleString()}_`, '', '---', '']
  for (const message of messages || []) {
    if (!message || typeof message !== 'object') continue
    const label = message.role === 'user' ? '**User**' : '**Assistant**'
    lines.push(`## ${label}`, '', message.content || '', '', '---', '')
  }
  return lines.join('\n')
}

export { messagesToMarkdown }

