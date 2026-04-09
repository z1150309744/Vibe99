const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const pty = require('node-pty');

const isCaptureMode = process.env.VIBE99_CAPTURE === '1';
const captureOutputPath = path.join('/tmp', 'vibe99-prototype.png');
const terminalSessions = new Map();

function ensurePtyHelperExecutable() {
  if (process.platform !== 'darwin') {
    return;
  }

  const helperPath = path.join(
    path.dirname(require.resolve('node-pty/package.json')),
    'prebuilds',
    process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64',
    'spawn-helper'
  );

  try {
    fs.chmodSync(helperPath, 0o755);
  } catch {}
}

function getShellLaunchConfig() {
  if (process.platform === 'win32') {
    return {
      shell: 'powershell.exe',
      args: [],
    };
  }

  return {
    shell: process.env.SHELL || '/bin/zsh',
    args: ['-il'],
  };
}

function destroyTerminalSession(paneId) {
  const session = terminalSessions.get(paneId);
  if (!session) {
    return;
  }

  try {
    session.pty.kill();
  } catch {}

  terminalSessions.delete(paneId);
}

function destroyAllTerminalSessions() {
  for (const paneId of terminalSessions.keys()) {
    destroyTerminalSession(paneId);
  }
}

ipcMain.handle('vibe99:terminal-create', (event, payload) => {
  const { paneId, cols, rows, cwd } = payload;
  destroyTerminalSession(paneId);

  const { shell, args } = getShellLaunchConfig();
  const webContents = event.sender;
  const terminalPty = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols: Math.max(20, cols || 80),
    rows: Math.max(8, rows || 24),
    cwd: cwd || process.cwd(),
    env: {
      ...process.env,
      COLORTERM: 'truecolor',
      TERM: 'xterm-256color',
    },
  });

  terminalPty.onData((data) => {
    if (!webContents.isDestroyed()) {
      webContents.send('vibe99:terminal-data', { paneId, data });
    }
  });

  terminalPty.onExit((exitEvent) => {
    terminalSessions.delete(paneId);
    if (!webContents.isDestroyed()) {
      webContents.send('vibe99:terminal-exit', { paneId, exitCode: exitEvent.exitCode });
    }
  });

  terminalSessions.set(paneId, {
    pty: terminalPty,
    webContentsId: webContents.id,
  });

  return { paneId };
});

ipcMain.handle('vibe99:terminal-write', (_event, payload) => {
  const { paneId, data } = payload;
  const session = terminalSessions.get(paneId);
  if (session) {
    session.pty.write(data);
  }
});

ipcMain.handle('vibe99:terminal-resize', (_event, payload) => {
  const { paneId, cols, rows } = payload;
  const session = terminalSessions.get(paneId);
  if (session) {
    session.pty.resize(Math.max(20, cols || 80), Math.max(8, rows || 24));
  }
});

ipcMain.handle('vibe99:terminal-destroy', (_event, payload) => {
  destroyTerminalSession(payload.paneId);
});

function createWindow() {
  const window = new BrowserWindow({
    width: 1600,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#111111',
    autoHideMenuBar: true,
    show: !isCaptureMode,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`renderer-console[level=${level}] ${sourceId}:${line} ${message}`);
  });

  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`preload-error ${preloadPath}`, error);
  });

  window.loadFile(path.join(__dirname, 'src', 'index.html'));

  if (isCaptureMode) {
    window.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const snapshot = await window.webContents.executeJavaScript(`
            (() => ({
              tabs: document.getElementById('tabs-list')?.childElementCount ?? -1,
              status: document.getElementById('status-label')?.textContent ?? null,
              bodyText: document.body.innerText.slice(0, 200),
              hasRendererApi: typeof window.vibe99 !== 'undefined'
            }))()
          `);
          console.log('capture-snapshot', JSON.stringify(snapshot));
        } catch (error) {
          console.error('capture-snapshot-error', error);
        }
        const image = await window.webContents.capturePage();
        fs.writeFileSync(captureOutputPath, image.toPNG());
        app.quit();
      }, 2500);
    });
  }
}

app.whenReady().then(() => {
  ensurePtyHelperExecutable();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  destroyAllTerminalSessions();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
