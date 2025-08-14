const { app, BrowserWindow, Menu, ipcMain, dialog, shell, screen } = require('electron');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');
const path = require('path');
const isDev = require('electron-is-dev');

// Initialize secure storage
const store = new Store({
  encryptionKey: 'myconfapp-secure-key-2025',
  schema: {
    serverUrl: {
      type: 'string',
      default: 'https://localhost:8000'
    },
    autoConnect: {
      type: 'boolean',
      default: true
    },
    windowBounds: {
      type: 'object',
      default: { width: 1200, height: 800 }
    },
    userPreferences: {
      type: 'object',
      default: {
        theme: 'light',
        notifications: true,
        autoStart: false,
        minimizeToTray: true
      }
    }
  }
});

let mainWindow;
let splashWindow;

// Enable live reload for development
if (isDev) {
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit'
  });
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function createMainWindow() {
  // Get saved window bounds or use defaults
  const bounds = store.get('windowBounds');
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  
  // Ensure window fits on screen
  const windowBounds = {
    width: Math.min(bounds.width, primaryDisplay.workAreaSize.width),
    height: Math.min(bounds.height, primaryDisplay.workAreaSize.height),
    x: bounds.x || undefined,
    y: bounds.y || undefined
  };

  mainWindow = new BrowserWindow({
    ...windowBounds,
    minWidth: 800,
    minHeight: 600,
    show: false, // Don't show until ready
    icon: path.join(__dirname, '..', 'assets', 'icons', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: !isDev
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default'
  });

  // Load the main application
  const serverUrl = store.get('serverUrl');
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(serverUrl);
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.close();
    }
    mainWindow.show();
    
    // Focus window on creation
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Save window bounds on resize/move
  mainWindow.on('resize', saveWindowBounds);
  mainWindow.on('move', saveWindowBounds);

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Create application menu
  createApplicationMenu();
}

function saveWindowBounds() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    store.set('windowBounds', mainWindow.getBounds());
  }
}

function createApplicationMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Meeting',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-action', 'new-meeting');
          }
        },
        {
          label: 'Join Meeting',
          accelerator: 'CmdOrCtrl+J',
          click: () => {
            mainWindow.webContents.send('menu-action', 'join-meeting');
          }
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow.webContents.send('menu-action', 'settings');
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Meeting',
      submenu: [
        {
          label: 'Toggle Microphone',
          accelerator: 'CmdOrCtrl+M',
          click: () => {
            mainWindow.webContents.send('menu-action', 'toggle-mic');
          }
        },
        {
          label: 'Toggle Video',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            mainWindow.webContents.send('menu-action', 'toggle-video');
          }
        },
        {
          label: 'Share Screen',
          accelerator: 'CmdOrCtrl+D',
          click: () => {
            mainWindow.webContents.send('menu-action', 'share-screen');
          }
        },
        {
          label: 'Start Recording',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow.webContents.send('menu-action', 'toggle-recording');
          }
        },
        { type: 'separator' },
        {
          label: 'Leave Meeting',
          accelerator: 'CmdOrCtrl+L',
          click: () => {
            mainWindow.webContents.send('menu-action', 'leave-meeting');
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
        { type: 'separator' },
        {
          label: 'Always on Top',
          type: 'checkbox',
          click: (menuItem) => {
            mainWindow.setAlwaysOnTop(menuItem.checked);
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About MyConfApp',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About MyConfApp Client',
              message: 'MyConfApp Client v1.0.0',
              detail: 'Professional Video Conferencing Desktop Application\n\n© 2025 MyConfApp Inc. All rights reserved.',
              buttons: ['OK']
            });
          }
        },
        {
          label: 'Check for Updates',
          click: () => {
            autoUpdater.checkForUpdatesAndNotify();
          }
        },
        { type: 'separator' },
        {
          label: 'Support',
          click: () => {
            shell.openExternal('https://support.myconfapp.com');
          }
        },
        {
          label: 'Documentation',
          click: () => {
            shell.openExternal('https://docs.myconfapp.com');
          }
        }
      ]
    }
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });

    // Window menu
    template[4].submenu = [
      { role: 'close' },
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' }
    ];
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-settings', () => {
  return {
    serverUrl: store.get('serverUrl'),
    autoConnect: store.get('autoConnect'),
    userPreferences: store.get('userPreferences')
  };
});

ipcMain.handle('save-settings', (event, settings) => {
  Object.keys(settings).forEach(key => {
    store.set(key, settings[key]);
  });
  return true;
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

ipcMain.handle('show-message-box', async (event, options) => {
  const result = await dialog.showMessageBox(mainWindow, options);
  return result;
});

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available.');
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: `A new version (${info.version}) is available. It will be downloaded in the background.`,
    buttons: ['OK']
  });
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Update not available.');
});

autoUpdater.on('error', (err) => {
  console.log('Error in auto-updater. ' + err);
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  console.log(log_message);
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded');
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: 'Update downloaded. Application will restart to apply the update.',
    buttons: ['Restart Now', 'Later']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

// App event handlers
app.whenReady().then(() => {
  // Create splash screen
  createSplashWindow();
  
  // Create main window after a delay
  setTimeout(() => {
    createMainWindow();
  }, 2000);

  // Check for updates
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
});

// Handle certificate errors
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDev) {
    // In development, ignore certificate errors
    event.preventDefault();
    callback(true);
  } else {
    // In production, use default behavior
    callback(false);
  }
});

// Set app user model ID for Windows
if (process.platform === 'win32') {
  app.setAppUserModelId('com.myconfapp.client');
}
