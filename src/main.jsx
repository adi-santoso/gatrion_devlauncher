import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/tailwind.css'
import './styles/index.css'

// Capture uncaught renderer errors and forward them to the main process so
// they land in main.log (no-op in plain-browser mode without Electron).
const reportRendererError = (payload) => {
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
  reportRendererError({
    type: 'unhandledrejection',
    message: String(event.reason?.message || event.reason || 'Unhandled rejection'),
    stack: event.reason?.stack || '',
  })
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
