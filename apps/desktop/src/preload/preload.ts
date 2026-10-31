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

const invokeChannel = (channel: string) =>
  handleElectronError((arg?: unknown) => ipcRenderer.invoke(channel, arg))

// A method's channel is its key path, so a typo becomes a `satisfies ElectronPreload`
// error here instead of a runtime failure — the main side derives the same path in `registerHandlers`.
const namespaceBridge = <K extends string>(
  prefix: string,
  methods: readonly K[]
) =>
  Object.fromEntries(
    methods.map((method) => [method, invokeChannel(`${prefix}.${method}`)])
  ) as Record<K, ReturnType<typeof invokeChannel>>

const dialectQueryBridge = (dialect: string) =>
  namespaceBridge(`query.${dialect}`, [
    'beginTransaction',
    'cancel',
    'commitTransaction',
    'execute',
    'executeTransaction',
    'openSession',
    'rollbackTransaction',
    'transactionStatus',
  ])

contextBridge.exposeInMainWorld('electron', {
  app: {
    ...namespaceBridge('app', [
      'checkForUpdates',
      'openWindow',
      'quitAndInstall',
      'relaunch',
      'setNativeTheme',
    ]),
    onFocusChange: (onMessage) => onEvent('focus-changed', onMessage),
    onFullscreenChange: (onMessage) => onEvent('fullscreen-changed', onMessage),
    onSendToast: (onMessage) => onEvent('toast', onMessage),
    onUpdatesStatus: (onMessage) => onEvent('updates-status', onMessage),
    onUrlOpened: (onMessage) => onEvent('url-opened', onMessage),
  },
  appIcon: namespaceBridge('appIcon', ['get', 'set']),
  connectionLinks: namespaceBridge('connectionLinks', [
    'isDefault',
    'setDefault',
    'take',
  ]),
  copyDatabase: {
    ...namespaceBridge('copyDatabase', ['cancel', 'start']),
    onLog: (onMessage) => onEvent('copyDatabase.log', onMessage),
  },
  deviceEncryption: namespaceBridge('deviceEncryption', [
    'createKey',
    'decrypt',
    'encrypt',
    'reset',
  ]),
  localDatabases: namespaceBridge('localDatabases', ['find', 'unlock']),
  mcp: {
    ...namespaceBridge('mcp', [
      'calls',
      'clients',
      'connectionAccess',
      'forgetClient',
      'regenerateToken',
      'setAccess',
      'setEnabled',
      'status',
    ]),
    serve: (source) => {
      mcpSource = source
      return () => {
        mcpSource = null
      }
    },
  },
  menu: namespaceBridge('menu', ['popup']),
  notifications: namespaceBridge('notifications', ['notify']),
  openAtLogin: namespaceBridge('openAtLogin', ['get', 'set']),
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
    ...namespaceBridge('sqlite', ['pickFile']),
    getPath: (file: File) => webUtils.getPathForFile(file),
  },
  ssh: namespaceBridge('ssh', ['pickKeyFile']),
  versions: {
    ...namespaceBridge('versions', ['app']),
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
    node: () => process.versions.node,
  },
} satisfies ElectronPreload)
