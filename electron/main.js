import { app, BrowserWindow, session } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'
import { startBridge } from '../server/ws-bridge.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PREFERRED_PORT = 5180
let mainWindow = null

function findAvailablePort(start = PREFERRED_PORT, maxTries = 20) {
  return new Promise(resolve => {
    const tryPort = (p, remaining) => {
      const srv = net.createServer().once('error', () => {
        if (remaining <= 0) resolve(0)
        else tryPort(p + 1, remaining - 1)
      }).once('listening', () => {
        srv.close(() => resolve(p))
      }).listen(p, '0.0.0.0')
    }
    tryPort(start, maxTries)
  })
}

async function createWindow(chosenPort) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  mainWindow = win

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'midi' || permission === 'midiSysex') {
      callback(true)
      return
    }
    callback(true)
  })

  const url = `file://${path.join(__dirname, '../dist/web/index.html')}?mode=host&bridgeHost=localhost&bridgePort=${chosenPort}`
  win.loadURL(url)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
  const port = await findAvailablePort(PREFERRED_PORT)
  startBridge(port || PREFERRED_PORT)
  await createWindow(port || PREFERRED_PORT)
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
