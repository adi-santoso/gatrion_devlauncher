import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/tailwind.css'
import './styles/index.css'

/** Payload forwarded to the main process for logging. */
interface RendererErrorPayload {
  type: 'error' | 'unhandledrejection'
  message: string
  source?: string
  line?: number
  column?: number
  stack?: string
}

// Capture uncaught renderer errors and forward them to the main process so
// they land in main.log (no-op in plain-browser mode without Electron).
const reportRendererError = (payload: RendererErrorPayload): void => {
  window.electron?.reportRendererError?.(payload)
}

window.addEventListener('error', (event) => {
  reportRendererError({
    type: 'error',
    message: event.message || 'Unknown error',
    source: event.filename || '',
    line: event.lineno,
    column: event.colno,
    stack: event.error?.stack || '',
  })
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as { message?: string; stack?: string } | null | undefined
  reportRendererError({
    type: 'unhandledrejection',
    message: String(reason?.message || event.reason || 'Unhandled rejection'),
    stack: reason?.stack || '',
  })
})

const root = document.getElementById('root')
if (!root) throw new Error('#root element not found')

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
