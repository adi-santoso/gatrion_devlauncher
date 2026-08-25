/**
 * Render a conversation transcript as readable Markdown for export.
 */
type TranscriptContent = string | Array<{ text?: unknown }>

// Tool calls are only informational in an export — flatten to the readable text
// of each content part (tool parts usually carry no text, so they become blank).
const contentText = (content: TranscriptContent): string => {
  if (typeof content === 'string') return content
  return (content || []).map((part) => (typeof part?.text === 'string' ? part.text : '')).filter(Boolean).join('\n')
}

function messagesToMarkdown(messages: Array<{ role: string; content: TranscriptContent }> | null | undefined, title = 'Conversation'): string {
  const lines = [`# ${title}`, '', `_Exported ${new Date().toLocaleString()}_`, '', '---', '']
  for (const message of messages || []) {
    if (!message || typeof message !== 'object') continue
    const label = message.role === 'user' ? '**User**' : '**Assistant**'
    lines.push(`## ${label}`, '', contentText(message.content), '', '---', '')
  }
  return lines.join('\n')
}

export { messagesToMarkdown }

