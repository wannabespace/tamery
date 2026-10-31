import '@tamery/shared/arktype-config'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH } from '@tamery/shared/constants'
import type { UpdatesStatus } from '@tamery/shared/updates'
import { Result } from 'better-result'
import type { Rectangle } from 'electron'
import { app, BrowserWindow, screen, session, shell } from 'electron'
import Store from 'electron-store'

import { setupProtocolHandler } from './lib/deep-link'
import { initElectronEvents, registerHandlers } from './lib/events'
import { restoreMcpServer } from './lib/mcp'
import { buildMenu } from './lib/menu'
import { queryProcess } from './lib/query-process'
import { autoUpdater } from './lib/todesktop'

const DEBUGGING_SWITCHES = ['remote-debugging-port', 'remote-debugging-pipe']
if (
  app.isPackaged &&
  DEBUGGING_SWITCHES.some((name) => app.commandLine.hasSwitch(name))
) {
  app.exit(1)
}

const RENDERER_INDEX = path.join(import.meta.dirname, './renderer/index.html')

// The preload runs in whatever page a window navigates to, so anything that is not the app itself must never reach it or IPC.
const isAppUrl = (url: string) => {
  const parsed = URL.parse(url)
  if (!parsed) {
    return false
  }
  if (!app.isPackaged) {
    return parsed.origin === URL.parse(`${process.env.WEB_URL}`)?.origin
  }
  return (
    parsed.protocol === 'file:' &&
    path.relative(fileURLToPath(parsed), RENDERER_INDEX) === ''
  )
}

initElectronEvents(isAppUrl)

export const store = new Store<{
  bounds?: Rectangle
  fullscreen?: boolean
  maximized?: boolean
}>()

const NEW_WINDOW_OFFSET = 28

let mainWindow: BrowserWindow | null = null

// Allowlist: any other scheme hands the renderer a way to launch arbitrary local apps. cursor: and vscode: carry the MCP install links.
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'cursor:', 'vscode:'])

// With no handler Electron grants every web permission, so this allowlist is the only gate. Clipboard must stay — grid and connection-string paste read it; nothing behind the rest (camera, mic, geolocation, midi, web notifications: desktop notifies natively over IPC).
const ALLOWED_PERMISSIONS = new Set([
  'clipboard-read',
  'clipboard-sanitized-write',
])

const restrictPermissions = () => {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, grant) =>
      grant(ALLOWED_PERMISSIONS.has(permission))
  )
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) =>
    ALLOWED_PERMISSIONS.has(permission)
  )
}

const openExternal = async (win: BrowserWindow, url: string) => {
  const opened = await Result.tryPromise(() => shell.openExternal(url))
  if (opened.isErr()) {
    win.webContents.send('toast', {
      description:
        'No app on this computer opens it. Install the app, or copy the config instead.',
      message: "Couldn't open the link",
      type: 'error',
    })
  }
}

export const createWindow = (route?: string) => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  const isMac = process.platform === 'darwin'
  const isFirstWindow = BrowserWindow.getAllWindows().length === 0

  const win = new BrowserWindow({
    focusable: true,
    height,
    minHeight: MIN_WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 13 },
    width,
    ...(!isMac && {
      titleBarOverlay: {
        color: '#00000000',
        height: 40,
        symbolColor: '#a1a1aa',
      },
    }),
    ...(isMac && {
      backgroundColor: '#00000000',
      vibrancy: 'under-window',
      visualEffectState: 'active',
    }),
    webPreferences: {
      preload: path.join(import.meta.dirname, './preload.mjs'),
      sandbox: false,
    },
  })

  mainWindow = win

  const bounds = store.get('bounds')

  if (bounds) {
    win.setBounds(
      isFirstWindow
        ? bounds
        : {
            ...bounds,
            x: bounds.x + NEW_WINDOW_OFFSET,
            y: bounds.y + NEW_WINDOW_OFFSET,
          }
    )
  }

  if (isFirstWindow) {
    if (store.get('maximized', false)) {
      win.maximize()
    }

    if (store.get('fullscreen', false)) {
      win.setFullScreen(true)
    }
  }

  win.webContents.on('will-navigate', (event) => {
    if (!isAppUrl(event.url)) {
      event.preventDefault()
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL_PROTOCOLS.has(new URL(url).protocol)) {
      void openExternal(win, url)
    }
    return { action: 'deny' }
  })

  let saveBoundsTimeout: NodeJS.Timeout | null = null
  const saveBounds = () => {
    if (saveBoundsTimeout) {
      clearTimeout(saveBoundsTimeout)
    }

    saveBoundsTimeout = setTimeout(() => {
      if (win.isDestroyed()) {
        return
      }

      if (!win.isFullScreen() && !win.isMinimized()) {
        store.set('bounds', win.getNormalBounds())
        store.set('maximized', win.isMaximized())
      }
      store.set('fullscreen', win.isFullScreen())
    }, 300)
  }

  if (isFirstWindow) {
    win.on('move', saveBounds)
    win.on('resize', saveBounds)
    win.on('enter-full-screen', saveBounds)
    win.on('leave-full-screen', saveBounds)
  }

  const sendFullscreen = () =>
    win.webContents.send('fullscreen-changed', win.isFullScreen())
  win.on('enter-full-screen', sendFullscreen)
  win.on('leave-full-screen', sendFullscreen)
  win.webContents.on('did-finish-load', sendFullscreen)

  const sendFocus = () => win.webContents.send('focus-changed', win.isFocused())
  win.on('blur', sendFocus)
  win.webContents.on('did-finish-load', sendFocus)

  win.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) {
      queryProcess.resetTransactions()
    }
  })

  win.on('close', () => {
    if (saveBoundsTimeout) {
      clearTimeout(saveBoundsTimeout)
    }

    if (isFirstWindow) {
      if (!win.isFullScreen() && !win.isMinimized()) {
        store.set('bounds', win.getNormalBounds())
        store.set('maximized', win.isMaximized())
      }
      store.set('fullscreen', win.isFullScreen())
    }

    if (mainWindow === win) {
      mainWindow = null
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.on('focus', () => {
    mainWindow = win
    buildMenu({ onNewWindow: createWindow })
    sendFocus()
  })

  if (app.isPackaged) {
    win.loadFile(RENDERER_INDEX, route ? { hash: route } : undefined)
  } else {
    win.webContents.openDevTools()
    win.loadURL(`${process.env.WEB_URL}${route ? `#${route}` : ''}`)
  }

  return win
}

app.on('ready', () => {
  restrictPermissions()
  createWindow()

  registerHandlers(
    'app.openWindow',
    (route: string) => {
      createWindow(route)
    },
    isAppUrl
  )

  setupProtocolHandler(createWindow)

  void restoreMcpServer()

  setInterval(() => autoUpdater?.checkForUpdates(), 1000 * 60 * 10)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length === 0) {
    createWindow()
  } else if (!windows.some((win) => win.isVisible())) {
    windows[0]?.show()
  }
})

export const sendToast = ({
  message,
  description,
  type,
  duration,
}: {
  message: string
  description?: string
  type: 'success' | 'error' | 'info' | 'warning'
  duration?: number
}) => {
  mainWindow?.webContents.send('toast', {
    description,
    duration,
    message,
    type,
  })
}

const sendUpdatesStatus = (status: UpdatesStatus, message?: string) => {
  mainWindow?.webContents.send('updates-status', { message, status })
}

autoUpdater?.on('checking-for-update', () => {
  sendUpdatesStatus('checking')
})
autoUpdater?.on('update-available', () => {
  sendUpdatesStatus('downloading')
})
autoUpdater?.on('update-not-available', () => {
  sendUpdatesStatus('no-updates')
})
autoUpdater?.on('error', (e) => {
  sendUpdatesStatus('error', e.message.split('\n')[0])
})
autoUpdater?.on('download-progress', () => {
  sendUpdatesStatus('downloading')
})
autoUpdater?.on('update-downloaded', () => {
  sendUpdatesStatus('ready')
})
