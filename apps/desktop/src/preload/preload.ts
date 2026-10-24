import { replaceErrorPrefix } from '@tamery/connection/queries'
import type { McpReply, McpRequest, McpSource } from '@tamery/shared/mcp'
import type { UpdatesStatus } from '@tamery/shared/updates'
import type { AnyFunction } from '@tamery/shared/utils'
import { toError } from '@tamery/shared/utils'
import { Result } from 'better-result'
import { contextBridge, ipcRenderer, webUtils } from 'electron'

import type { electron } from '../main/lib/events'
import type { sendToast } from '../main/main'

type Promisified<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : Promisified<T[K]>
}

export type ElectronPreload = Promisified<typeof electron> & {
  app: {
    onUpdatesStatus: (
      callback: (params: { status: UpdatesStatus; message?: string }) => void
    ) => () => void
    onSendToast: (
      callback: (params: Parameters<typeof sendToast>[0]) => void
    ) => () => void
    onFullscreenChange: (
      callback: (isFullscreen: boolean) => void
    ) => () => void
    onFocusChange: (callback: (isFocused: boolean) => void) => () => void
    onUrlOpened: (callback: () => void) => () => void
    openWindow: (route: string) => Promise<void>
  }
  copyDatabase: {
    onLog: (
      callback: (params: { copyId: string; line: string }) => void
    ) => () => void
  }
  mcp: {
    serve: (source: McpSource) => () => void
  }
  sqlite: {
    getPath: (file: File) => string
  }
  versions: {
    node: () => string
    chrome: () => string
    electron: () => string
  }
}

const handleElectronError =
  <T extends AnyFunction>(
    fn: T
  ): ((...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>) =>
  async (...args: Parameters<T>) => {
    try {
      return await fn(...args)
    } catch (error) {
      if (error instanceof Error) {
        const message = replaceErrorPrefix(
          error.message.replace(/^Error invoking remote method '[^']+': /u, '')
        )

        throw new Error(message, { cause: error })
      }
      throw error
    }
  }

const onEvent = <T>(
  channel: string,
  onMessage: (params: T) => void
): (() => void) => {
  const listener = (_event: Electron.IpcRendererEvent, params: T) => {
    onMessage(params)
  }
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.off(channel, listener)
}

let mcpSource: McpSource | null = null

ipcRenderer.on('mcp.request', async (event, request: McpRequest) => {
  const [port] = event.ports
  if (!port) {
    return
  }
  const reply = (message: McpReply) => port.postMessage(message)
  if (!mcpSource) {
    reply({ idle: true })
    return
  }
  // TS cannot correlate `request.method` with `request.args` across the union.
  const method = mcpSource[request.method] as (
    args: McpRequest['args'],
    onAbort: (listener: () => void) => void
  ) => unknown
  const result = await Result.tryPromise(() =>
    Promise.resolve(
      method(request.args, (listener) => {
        port.addEventListener('message', listener)
        port.start()
      })
    )
  )
  reply(
    result.match<McpReply>({
      err: ({ cause }) => ({ error: toError(cause).message }),
      ok: (value) => ({ result: value }),
    })
  )
})

const dialectQueryBridge = (dialect: string) => ({
  beginTransaction: handleElectronError((arg: unknown) =>
    ipcRenderer.invoke(`query.${dialect}.beginTransaction`, arg)
  ),
  cancel: handleElectronError((arg: unknown) =>
    ipcRenderer.invoke(`query.${dialect}.cancel`, arg)
  ),
  commitTransaction: handleElectronError((arg: unknown) =>
    ipcRenderer.invoke(`query.${dialect}.commitTransaction`, arg)
  ),
  execute: handleElectronError((arg: unknown) =>
    ipcRenderer.invoke(`query.${dialect}.execute`, arg)
  ),
  executeTransaction: handleElectronError((arg: unknown) =>
    ipcRenderer.invoke(`query.${dialect}.executeTransaction`, arg)
  ),
  openSession: handleElectronError((arg: unknown) =>
    ipcRenderer.invoke(`query.${dialect}.openSession`, arg)
  ),
  rollbackTransaction: handleElectronError((arg: unknown) =>
    ipcRenderer.invoke(`query.${dialect}.rollbackTransaction`, arg)
  ),
  transactionStatus: handleElectronError((arg: unknown) =>
    ipcRenderer.invoke(`query.${dialect}.transactionStatus`, arg)
  ),
})

contextBridge.exposeInMainWorld('electron', {
  app: {
    checkForUpdates: handleElectronError(() =>
      ipcRenderer.invoke('app.checkForUpdates')
    ),
    onFocusChange: (onMessage) => onEvent('focus-changed', onMessage),
    onFullscreenChange: (onMessage) => onEvent('fullscreen-changed', onMessage),
    onSendToast: (onMessage) => onEvent('toast', onMessage),
    onUpdatesStatus: (onMessage) => onEvent('updates-status', onMessage),
    onUrlOpened: (onMessage) => onEvent('url-opened', onMessage),
    openWindow: handleElectronError((route: string) =>
      ipcRenderer.invoke('app.openWindow', route)
    ),
    quitAndInstall: handleElectronError(() =>
      ipcRenderer.invoke('app.quitAndInstall')
    ),
    relaunch: handleElectronError(() => ipcRenderer.invoke('app.relaunch')),
    setNativeTheme: handleElectronError((arg: unknown) =>
      ipcRenderer.invoke('app.setNativeTheme', arg)
    ),
  },
  connectionLinks: {
    isDefault: handleElectronError(() =>
      ipcRenderer.invoke('connectionLinks.isDefault')
    ),
    setDefault: handleElectronError((arg: unknown) =>
      ipcRenderer.invoke('connectionLinks.setDefault', arg)
    ),
    take: handleElectronError(() => ipcRenderer.invoke('connectionLinks.take')),
  },
  copyDatabase: {
    cancel: handleElectronError((copyId: string) =>
      ipcRenderer.invoke('copyDatabase.cancel', copyId)
    ),
    onLog: (onMessage) => onEvent('copyDatabase.log', onMessage),
    start: handleElectronError((arg: unknown) =>
      ipcRenderer.invoke('copyDatabase.start', arg)
    ),
  },
  deviceEncryption: {
    createKey: handleElectronError(() =>
      ipcRenderer.invoke('deviceEncryption.createKey')
    ),
    decrypt: handleElectronError((encrypted: string) =>
      ipcRenderer.invoke('deviceEncryption.decrypt', encrypted)
    ),
    encrypt: handleElectronError((text: string) =>
      ipcRenderer.invoke('deviceEncryption.encrypt', text)
    ),
    reset: handleElectronError(() =>
      ipcRenderer.invoke('deviceEncryption.reset')
    ),
  },
  localDatabases: {
    find: handleElectronError(() => ipcRenderer.invoke('localDatabases.find')),
    unlock: handleElectronError((connectionString: string) =>
      ipcRenderer.invoke('localDatabases.unlock', connectionString)
    ),
  },
  mcp: {
    calls: handleElectronError(() => ipcRenderer.invoke('mcp.calls')),
    clients: handleElectronError(() => ipcRenderer.invoke('mcp.clients')),
    connectionAccess: handleElectronError(() =>
      ipcRenderer.invoke('mcp.connectionAccess')
    ),
    forgetClient: handleElectronError((arg: unknown) =>
      ipcRenderer.invoke('mcp.forgetClient', arg)
    ),
    regenerateToken: handleElectronError(() =>
      ipcRenderer.invoke('mcp.regenerateToken')
    ),
    serve: (source) => {
      mcpSource = source
      return () => {
        mcpSource = null
      }
    },
    setAccess: handleElectronError((arg: unknown) =>
      ipcRenderer.invoke('mcp.setAccess', arg)
    ),
    setEnabled: handleElectronError((arg: unknown) =>
      ipcRenderer.invoke('mcp.setEnabled', arg)
    ),
    status: handleElectronError(() => ipcRenderer.invoke('mcp.status')),
  },
  menu: {
    popup: handleElectronError((arg: unknown) =>
      ipcRenderer.invoke('menu.popup', arg)
    ),
  },
  notifications: {
    notify: handleElectronError((arg: unknown) =>
      ipcRenderer.invoke('notifications.notify', arg)
    ),
  },
  openAtLogin: {
    get: handleElectronError(() => ipcRenderer.invoke('openAtLogin.get')),
    set: handleElectronError((arg: unknown) =>
      ipcRenderer.invoke('openAtLogin.set', arg)
    ),
  },
  query: {
    clickhouse: dialectQueryBridge('clickhouse'),
    mongodb: dialectQueryBridge('mongodb'),
    mssql: dialectQueryBridge('mssql'),
    mysql: dialectQueryBridge('mysql'),
    oracle: dialectQueryBridge('oracle'),
    postgres: dialectQueryBridge('postgres'),
    sqlite: dialectQueryBridge('sqlite'),
  },
  sqlite: {
    getPath: (file: File) => webUtils.getPathForFile(file),
    pickFile: handleElectronError(() => ipcRenderer.invoke('sqlite.pickFile')),
  },
  ssh: {
    pickKeyFile: handleElectronError(() =>
      ipcRenderer.invoke('ssh.pickKeyFile')
    ),
  },
  versions: {
    app: () => ipcRenderer.invoke('versions.app'),
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
    node: () => process.versions.node,
  },
} satisfies ElectronPreload)
