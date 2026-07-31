import React, { useEffect, useRef, useState, useCallback } from 'react'
import Button from '../Common/Button'
import Badge from '../Common/Badge'

const stripAnsi = (str) =>
  typeof str === 'string'
    ? str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    : str;

function TerminalViewer({ logs = [], projectName, onClearLogs, config }) {
  const terminalRef = useRef(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  
  const fontSize = config?.terminal?.fontSize || 14
  const maxLines = config?.terminal?.maxLines || 1000
  const useAutoScroll = config?.terminal?.autoScroll !== undefined ? config.terminal.autoScroll : true
  
  useEffect(() => {
    if (config?.terminal?.fontSize) {
      setPrevFontSize(config.terminal.fontSize)
    }
  }, [config?.terminal?.fontSize])

  const [prevFontSize, setPrevFontSize] = useState(fontSize)

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.style.fontSize = `${fontSize}px`
    }
  }, [fontSize])

  useEffect(() => {
    if (useAutoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs, useAutoScroll])

  // Detect manual scroll
  const handleScroll = () => {
    if (terminalRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = terminalRef.current
      const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10
      setAutoScroll(isAtBottom)
    }
  }

  const getLogColor = (type) => {
    switch (type) {
      case 'stderr':
        return 'text-red-400'
      case 'error':
        return 'text-red-500 font-semibold'
      case 'system':
        return 'text-blue-400'
      case 'warn':
      case 'warning':
        return 'text-yellow-400'
      case 'success':
        return 'text-green-400'
      default:
        return 'text-gray-300'
    }
  }

  const getLogIcon = (type) => {
    switch (type) {
      case 'stderr':
      case 'error':
        return '❌'
      case 'warn':
      case 'warning':
        return '⚠️'
      case 'success':
        return '✅'
      case 'system':
        return 'ℹ️'
      default:
        return '▶'
    }
  }

  const highlightText = (text) => {
    if (!searchTerm) return text
    const regex = new RegExp(`(${searchTerm})`, 'gi')
    return text.split(regex).map((part, i) =>
      regex.test(part) ? (
        <span key={i} className="bg-yellow-500 text-black px-1 rounded">
          {part}
        </span>
      ) : (
        part
      )
    )
  }

  const filteredLogs = searchTerm
    ? logs.filter(log => log.message.toLowerCase().includes(searchTerm.toLowerCase()))
    : logs
  
  const finalLogs = maxLines && filteredLogs.length > maxLines
    ? filteredLogs.slice(-maxLines)
    : filteredLogs

  const copyLogs = () => {
    const text = logs.map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] ${stripAnsi(log.message)}`).join('\n')
    navigator.clipboard.writeText(text)
  }

  const downloadLogs = () => {
    const text = logs.map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] ${stripAnsi(log.message)}`).join('\n')
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName ? projectName.toLowerCase().replace(/\s+/g, '-') : 'project'}-logs-${Date.now()}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  const clearLogs = () => {
    if (onClearLogs) {
      onClearLogs();
    }
  }

  const scrollToBottom = () => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
      setAutoScroll(true)
    }
  }

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden border border-gray-800 shadow-2xl bg-gray-950">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 cursor-pointer transition-colors" />
            <div className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400 cursor-pointer transition-colors" />
            <div className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 cursor-pointer transition-colors" />
          </div>
          <span className="text-sm font-bold text-gray-300">Terminal</span>
          {projectName && (
            <>
              <span className="text-gray-600">—</span>
              <span className="text-sm text-gray-400 font-semibold">{projectName}</span>
            </>
          )}
          <Badge variant="default" size="sm">
            {finalLogs.length} {finalLogs.length === 1 ? 'line' : 'lines'}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-1 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-40"
          />
          <Button variant="icon" icon="📋" onClick={copyLogs} title="Copy logs to clipboard" />
          <Button variant="icon" icon="📥" onClick={downloadLogs} title="Download .log file" />
          <Button variant="icon" icon="🗑️" onClick={clearLogs} title="Clear logs" />
        </div>
      </div>

      {/* Terminal Output */}
      <div
        ref={terminalRef}
        onScroll={handleScroll}
        className="flex-1 bg-black p-4 overflow-auto font-mono scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900"
        style={{ fontSize: `${fontSize}px` }}
      >
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3">
            <div className="text-4xl">📟</div>
            <div className="text-center">
              <p className="font-semibold mb-1">No logs yet</p>
              <p className="text-xs">Start the project to see output...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            {finalLogs.map((log, index) => (
              <div
                key={index}
                className="flex gap-3 hover:bg-gray-900/50 px-2 py-1 rounded transition-colors group"
              >
                <span className="text-gray-700 text-xs select-none flex-shrink-0 font-semibold group-hover:text-gray-600 transition-colors">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className="text-gray-700 select-none flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity">
                  {getLogIcon(log.type)}
                </span>
                <span className={`flex-1 ${getLogColor(log.type)} whitespace-pre-wrap break-words leading-relaxed`}
                     style={{ fontSize: `${fontSize}px` }}>
                  {highlightText(stripAnsi(log.message))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auto-scroll indicator */}
      {!useAutoScroll && !autoScroll && finalLogs.length > 0 && (
        <div className="absolute bottom-6 right-6 z-10">
          <Button
            variant="primary"
            size="sm"
            icon="⬇"
            onClick={scrollToBottom}
            className="shadow-xl animate-bounce"
          >
            Jump to Bottom
          </Button>
        </div>
      )}
    </div>
  )
}

export default TerminalViewer
