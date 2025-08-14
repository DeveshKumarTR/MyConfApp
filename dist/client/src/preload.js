const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App information
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Settings management
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  
  // Dialog operations
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),
  
  // Menu actions listener
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', (event, action) => callback(action));
  },
  
  // Remove menu action listener
  removeMenuActionListener: () => {
    ipcRenderer.removeAllListeners('menu-action');
  },
  
  // Platform information
  platform: process.platform,
  
  // File system operations (secure)
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  
  // Notification system
  showNotification: (title, body, icon) => {
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon });
    }
  },
  
  // Request notification permission
  requestNotificationPermission: async () => {
    return await Notification.requestPermission();
  }
});

// Expose a limited set of Node.js APIs
contextBridge.exposeInMainWorld('nodeAPI', {
  // Process information
  platform: process.platform,
  arch: process.arch,
  
  // Environment variables (filtered)
  env: {
    NODE_ENV: process.env.NODE_ENV,
    ELECTRON_IS_DEV: process.env.ELECTRON_IS_DEV
  }
});

// Security: Remove Node.js global objects in renderer
delete global.require;
delete global.exports;
delete global.module;
delete global.__filename;
delete global.__dirname;
delete global.Buffer;
delete global.process;
