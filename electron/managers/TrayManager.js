const { app, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

class TrayManager {
  constructor(mainWindow, processManager, storageManager) {
    this.mainWindow = mainWindow;
    this.processManager = processManager;
    this.storageManager = storageManager;
    this.tray = null;
  }

  init() {
    try {
      // Find valid icon file or create native fallback image
      let iconPath = path.join(__dirname, '../../build/icon.png');
      if (!fs.existsSync(iconPath)) {
        iconPath = path.join(__dirname, '../../public/vite.svg');
      }

      let image;
      if (fs.existsSync(iconPath)) {
        image = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
      } else {
        // Fallback transparent/1x1 icon if no asset exists yet
        image = nativeImage.createEmpty();
      }

      this.tray = new Tray(image);
      this.tray.setToolTip('DevLauncher - Local Development Workspace');

      // Double-click tray icon to toggle window
      this.tray.on('double-click', () => {
        this.toggleWindow();
      });

      this.updateContextMenu();
    } catch (error) {
      console.error('[TrayManager] Failed to initialize tray:', error);
    }
  }

  toggleWindow() {
    if (!this.mainWindow) return;
    if (this.mainWindow.isVisible()) {
      this.mainWindow.hide();
    } else {
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  async updateContextMenu() {
    if (!this.tray) return;

    try {
      const projects = await this.storageManager.loadProjects();
      const runningProjects = projects.filter(p => {
        const status = this.processManager.getStatus(p.id);
        return status && (status.status === 'running' || status.status === 'starting');
      });

      const menuTemplate = [
        {
          label: this.mainWindow?.isVisible() ? 'Hide DevLauncher' : 'Show DevLauncher',
          click: () => this.toggleWindow()
        },
        { type: 'separator' },
        {
          label: `Running Projects (${runningProjects.length})`,
          enabled: false
        }
      ];

      if (runningProjects.length > 0) {
        runningProjects.forEach(p => {
          menuTemplate.push({
            label: `  ⚡ ${p.name}`,
            click: () => {
              if (this.mainWindow) {
                this.mainWindow.show();
                this.mainWindow.focus();
              }
            }
          });
        });
      } else {
        menuTemplate.push({
          label: '  (No projects running)',
          enabled: false
        });
      }

      menuTemplate.push(
        { type: 'separator' },
        {
          label: '▶ Start All Projects',
          click: async () => {
            for (const p of projects) {
              if (p.path && p.startCommand) {
                const envObj = {};
                if (Array.isArray(p.envVars)) {
                  p.envVars.forEach(e => { if (e.key) envObj[e.key] = e.value || ''; });
                }
                await this.processManager.startProcess(p.id, p.path, p.startCommand, envObj, p.port);
              }
            }
            this.updateContextMenu();
          }
        },
        {
          label: '⏹ Stop All Projects',
          click: async () => {
            await this.processManager.stopAllProcesses();
            this.updateContextMenu();
          }
        },
        { type: 'separator' },
        {
          label: 'Quit DevLauncher',
          click: () => {
            app.isQuitting = true;
            app.quit();
          }
        }
      );

      const contextMenu = Menu.buildFromTemplate(menuTemplate);
      this.tray.setContextMenu(contextMenu);
    } catch (error) {
      console.error('[TrayManager] Error updating context menu:', error);
    }
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = TrayManager;
