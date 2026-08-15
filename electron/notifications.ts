import type { AppConfig } from '../src/types/shared'
import type { ProcessManager as ProcessManagerType } from './managers/ProcessManager'
import type { StorageManager as StorageManagerType } from './managers/StorageManager'
import type { TrayManager as TrayManagerType } from './managers/TrayManager'
import Logger from './utils/logger'

const { Notification } = require('electron') as typeof import('electron')

export interface NotificationDeps {
  processManager: ProcessManagerType
  storageManager: StorageManagerType
  getWindow: () => InstanceType<typeof import('electron').BrowserWindow> | null
  focusAppWindow: () => void
}

/**
 * Restart a project from a notification action: reload the persisted project
 * and delegate to ProcessManager (state/status events keep flowing to the
 * renderer as usual).
 */
export async function restartProjectFromNotification(processManager: ProcessManagerType, storageManager: StorageManagerType, projectId: string) {
  try {
    const projects = await storageManager.loadProjects()
    const project = projects.find((item) => item.id === projectId)
    if (!project) return
    const { resolveLaunchConfig } = require('./handlers/processHandlers')
    const launch = resolveLaunchConfig(project)
    await processManager.restartProcess(
      project.id,
      project.path,
      launch.command,
      Object.fromEntries((project.envVars || []).map((item) => [item.key, item.value])),
      launch.port,
      () => {},
      () => {},
      () => {},
      () => {}
    )
  } catch (error) {
    Logger.error('Notify', 'Failed to restart project from notification', { projectId, error: (error as Error).message })
  }
}

/**
 * Native Windows toasts for project lifecycle events (crash → Restart action,
 * start → info toast). Also refreshes the tray context menu on every change.
 */
export function setupProjectNotifications({ processManager, storageManager, getWindow, focusAppWindow }: NotificationDeps, trayManager: TrayManagerType) {
  processManager.on('status-change', async (data: { projectId: string; status: string }) => {
    trayManager.updateContextMenu()
    const currentConfig = await storageManager.loadConfig().catch(() => null)
    const notifications: AppConfig['notifications'] = currentConfig?.notifications || { onStart: false, onError: false, sound: true }
    if (!Notification.isSupported()) return

    const projects = await storageManager.loadProjects().catch(() => [])
    const projectName = projects.find((p) => p.id === data.projectId)?.name || data.projectId

    if (data.status === 'error' && notifications.onError) {
      // Windows toast action button: restart the project without opening the
      // app. Clicking the toast body focuses the app and opens the project.
      const notification = new Notification({
        title: 'Gatrion - Project Crash',
        body: `Project "${projectName}" encountered an error.`,
        silent: !notifications.sound,
        actions: [{ type: 'button', text: 'Restart' }],
        timeoutType: 'never',
      })
      notification.on('action', (event) => {
        if (event.actionIndex === 0) restartProjectFromNotification(processManager, storageManager, data.projectId)
      })
      notification.on('click', () => {
        focusAppWindow()
        getWindow()?.webContents.send('navigate-to-project', data.projectId)
      })
      notification.show()
    } else if (data.status === 'running' && notifications.onStart) {
      new Notification({
        title: 'Gatrion - Project Started',
        body: `Project "${projectName}" is now running.`,
        silent: !notifications.sound
      }).show()
    }
  })
}
