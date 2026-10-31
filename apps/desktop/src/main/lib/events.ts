import type { QueryExecutor } from '@tamery/connection/queries'
import type {
  MenuPopupRequest,
  MenuPopupResult,
} from '@tamery/shared/context-menu'
import { Dialect } from '@tamery/shared/enums/connection-type'
import type { IpcMainInvokeEvent } from 'electron'
import { app, ipcMain, nativeTheme } from 'electron'

import type { CopyDatabaseRequest } from '../copy-database'
import { popupNativeContextMenu } from './context-menu'
import { connectionLinks } from './deep-link'
import { deviceEncryption } from './device-encryption'
import { mcp } from './mcp'
import { notifyUnfocused } from './notify'
import { queryProcess } from './query-process'
import { pickSqliteFile } from './sqlite-file'
import { pickSshKeyFile } from './ssh-key-file'
import { autoUpdater } from './todesktop'

// Stays lazy so the native keyring addon and the finders' parsers don't load at startup.
const loadLocalDatabases = () => import('./local-databases/find')

const openAtLogin = {
  get: () => {
    const settings = app.getLoginItemSettings()
    // `openAtLogin` stays true after the user disables Tamery in Task Manager's Startup tab.
    return process.platform === 'win32'
      ? settings.executableWillLaunchAtLogin
      : settings.openAtLogin
  },
  set: (enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
    return openAtLogin.get()
  },
}

export const electron = {
  app: {
    checkForUpdates: () => autoUpdater?.checkForUpdates(),
    quitAndInstall: () => {
      autoUpdater?.restartAndInstall()
    },
    relaunch: () => {
      app.relaunch()
      app.exit(0)
    },
    setNativeTheme: (theme: 'light' | 'dark' | 'system') => {
      nativeTheme.themeSource = theme
    },
  },
  connectionLinks,
  copyDatabase: {
    cancel: queryProcess.cancelCopy,
    start: ((request: CopyDatabaseRequest, event?: IpcMainInvokeEvent) =>
      queryProcess.copyDatabase(request, (line) =>
        event?.sender.send('copyDatabase.log', { copyId: request.id, line })
      )) as (request: CopyDatabaseRequest) => Promise<null>,
  },
  deviceEncryption,
  localDatabases: {
    find: async () => {
      const { localDatabases } = await loadLocalDatabases()

      return localDatabases.find()
    },
    unlock: async (connectionString: string) => {
      const { localDatabases } = await loadLocalDatabases()

      return localDatabases.unlock(connectionString)
    },
  },
  mcp,
  menu: {
    popup: ((arg: MenuPopupRequest, event?: IpcMainInvokeEvent) =>
      popupNativeContextMenu(arg, event)) as (
      arg: MenuPopupRequest
    ) => Promise<MenuPopupResult>,
  },
  notifications: {
    notify: notifyUnfocused,
  },
  openAtLogin,
  query: {
    clickhouse: queryProcess.executor(Dialect.ClickHouse),
    mongodb: queryProcess.executor(Dialect.MongoDB),
    mssql: queryProcess.executor(Dialect.MSSQL),
    mysql: queryProcess.executor(Dialect.MySQL),
    oracle: queryProcess.executor(Dialect.Oracle),
    postgres: queryProcess.executor(Dialect.Postgres),
    sqlite: queryProcess.executor(Dialect.SQLite),
  } satisfies Record<Dialect, QueryExecutor>,
  sqlite: {
    pickFile: pickSqliteFile,
  },
  ssh: {
    pickKeyFile: pickSshKeyFile,
  },
  versions: {
    app: () => app.getVersion(),
  },
}

export const registerHandlers = (
  prefix: string,
  value: unknown,
  isAppUrl: (url: string) => boolean
) => {
  if (typeof value === 'function') {
    ipcMain.handle(prefix, (event, arg) => {
      if (!isAppUrl(event.senderFrame?.url ?? '')) {
        throw new Error(`Refused ${prefix} from outside the app`)
      }
      return value(arg, event)
    })
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      registerHandlers(`${prefix}.${key}`, nested, isAppUrl)
    }
  }
}

export const initElectronEvents = (isAppUrl: (url: string) => boolean) => {
  for (const [key, value] of Object.entries(electron)) {
    registerHandlers(key, value, isAppUrl)
  }
}
