// @ts-check
/**
 * Render a conversation transcript as readable Markdown for export.
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} title
 * @returns {string}
 */
function messagesToMarkdown(messages, title = 'Conversation') {
  const lines = [`# ${title}`, '', `_Exported ${new Date().toLocaleString()}_`, '', '---', '']
  for (const message of messages || []) {
    if (!message || typeof message !== 'object') continue
    const label = message.role === 'user' ? '**User**' : '**Assistant**'
    lines.push(`## ${label}`, '', message.content || '', '', '---', '')
  }
  return lines.join('\n')
}

module.exports = { messagesToMarkdown }
