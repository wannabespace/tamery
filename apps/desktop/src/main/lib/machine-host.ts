import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { configFiles } from '@tamery/cli/src/config-files'
import type { VaultAccount } from '@tamery/cli/src/vault'
import { PORTS } from '@tamery/shared/ports'
import { silently } from '@tamery/shared/utils'
import { Result } from 'better-result'
import type { UtilityProcess } from 'electron'
import {
  app,
  BrowserWindow,
  dialog,
  safeStorage,
  utilityProcess,
} from 'electron'

import type {
  MachineAccount,
  MachineProcessReply,
  MachineProcessRequest,
} from '../machine'
import { createPrivateStore } from './private-store'

const KEY_BYTES = 32

const store = createPrivateStore<{
  enabled: boolean
  /** What a tunnel on this computer serves the machine at, as `tamery machine --public-url`. */
  publicUrl: string | null
  /** Bumped by sign-out: a window's request naming an older one was sent for the account that left. */
  session: number
  /** The user's **Turn off**, kept across sign-out: sign-in starts the machine unless it is set. */
  turnedOff: boolean
  wrappedKey?: string
}>({
  defaults: { enabled: false, publicUrl: null, session: 0, turnedOff: false },
  name: 'machine',
})

export type MachineState =
  | { status: 'off' | 'starting' }
  | { status: 'failed'; message: string }
  | { status: 'on'; registerError: string | null; url: string }

let state: MachineState = { status: 'off' }
let child: UtilityProcess | null = null

/** Its own folder, never the CLI's: a `tamery logout` there must not sign this app's machine out. */
const getConfigDir = () => path.join(app.getPath('userData'), 'machine')

const getVaultKey = async () => {
  const wrapped = store.get('wrappedKey')
  if (wrapped) {
    return safeStorage
      .decryptStringAsync(Buffer.from(wrapped, 'base64'))
      .then(({ result }) => result)
  }
  const key = randomBytes(KEY_BYTES).toString('base64')
  const sealed = await safeStorage.encryptStringAsync(key)
  store.set('wrappedKey', sealed.toString('base64'))
  return key
}

const askApproval = async ({
  code,
  label,
}: {
  code: string
  label: string
}) => {
  app.focus({ steal: true })
  const { response } = await dialog.showMessageBox({
    buttons: ['Don’t Allow', 'Allow'],
    cancelId: 0,
    defaultId: 0,
    detail: `Allow ${label} to run queries on this computer, with its files, SSH keys and credentials? Only if Tamery shows ${code}.`,
    message: 'Allow a browser to use this computer?',
    type: 'question',
  })
  return response === 1
}

const send = (forked: UtilityProcess, request: MachineProcessRequest) =>
  forked.postMessage(request)

const getStatus = async () => {
  // Read, never minted here: `null` until the machine first starts.
  const savedId = await Result.tryPromise(() =>
    readFile(
      path.join(getConfigDir(), path.basename(configFiles.machineId)),
      'utf-8'
    )
  )
  return {
    enabled: store.get('enabled'),
    id: (savedId.isOk() && savedId.value.trim()) || null,
    publicUrl: store.get('publicUrl'),
    session: store.get('session'),
    turnedOff: store.get('turnedOff'),
    ...state,
  }
}

/** Every window shows this computer's machine, so each hears every change, not only the one that asked. */
const publish = async () => {
  const status = await getStatus()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('machine.status', status)
  }
  return status
}

const setState = (next: MachineState) => {
  state = next
  void publish()
}

const assertSession = (session: number) => {
  if (session !== store.get('session')) {
    throw new Error(
      'You signed out since this window opened. Reload it and try again.'
    )
  }
}

/** Settles once the latest started process listens, failed or exited. */
let ready = Promise.resolve(null)

const start = async (account: MachineAccount) => {
  if (child) {
    return
  }
  setState({ status: 'starting' })
  const key = await Result.tryPromise(getVaultKey)
  if (key.isErr() || !key.value) {
    setState({
      message:
        'The keychain refused this computer’s machine key. Unlock it, then restart Tamery.',
      status: 'failed',
    })
    return
  }
  const settled = Promise.withResolvers<null>()
  ready = settled.promise
  const forked = utilityProcess.fork(
    path.join(import.meta.dirname, './machine.js'),
    [],
    {
      env: {
        ...process.env,
        // A utility process ignores `execArgv: ['--use-system-ca']`; without the keychain its `fetch` refuses portless's dev CA.
        NODE_USE_SYSTEM_CA: '1',
        TAMERY_CONFIG_DIR: getConfigDir(),
      },
      serviceName: 'Tamery Machine',
    }
  )
  child = forked
  forked.on('message', async (reply: MachineProcessReply) => {
    // A reply that lands after this process exited or was stopped would overwrite the state of the one that replaced it.
    if (child !== forked) {
      return
    }
    if (reply.type === 'approval') {
      send(forked, {
        allowed: await askApproval(reply),
        id: reply.id,
        type: 'answer',
      })
    } else if (reply.type === 'started') {
      setState({
        registerError: reply.registerError,
        status: 'on',
        url: reply.url,
      })
      settled.resolve(null)
    } else {
      setState({ message: reply.message, status: 'failed' })
      forked.kill()
      settled.resolve(null)
    }
  })
  forked.on('error', (type, location) => {
    console.error('[Machine process]', type, location)
  })
  // A restart forks the next process before this one exits, which must not reset the next one's state.
  forked.once('exit', () => {
    settled.resolve(null)
    if (child !== forked) {
      return
    }
    child = null
    if (state.status !== 'failed') {
      setState({
        message:
          'This computer’s machine stopped unexpectedly. Turn it off and on again.',
        status: 'failed',
      })
    }
  })
  send(forked, {
    account,
    key: key.value,
    name: `${os.hostname().replace(/\.local$/u, '')} (desktop app)`,
    port: PORTS.DESKTOP_MACHINE,
    publicUrl: store.get('publicUrl'),
    type: 'start',
  })
}

/** Resolves once the process exited, so a restart never finds the port still taken. */
const stop = async () => {
  const running = child
  child = null
  setState({ status: 'off' })
  if (running) {
    const exited = once(running, 'exit')
    running.kill()
    await exited
  }
}

let lifecycle: Promise<unknown> = Promise.resolve()

/** `start` awaits the keychain before it holds `child`, so a change running alongside would fork a second process. */
const inTurn = <T>(change: () => Promise<T>) => {
  const turn = lifecycle.then(change)
  lifecycle = silently(() => turn)
  return turn
}

const restart = async (account: MachineAccount) => {
  await stop()
  store.set('enabled', true)
  await start(account)
}

export const machineHost = {
  /** On sign-in: starts the machine unless the user turned it off. */
  enable: ({ account, session }: { account: VaultAccount; session: number }) =>
    inTurn(async () => {
      assertSession(session)
      if (!store.get('turnedOff')) {
        await restart({ account, kind: 'switch' })
      }
      return publish()
    }),
  setPublicUrl: ({
    publicUrl,
    session,
  }: {
    publicUrl: string | null
    session: number
  }) => {
    const parsed = publicUrl === null ? null : URL.parse(publicUrl)
    if (
      publicUrl !== null &&
      (parsed?.protocol !== 'https:' || parsed.username || parsed.password)
    ) {
      throw new Error(
        'The address must be an https:// URL, such as https://my-mac.tail1234.ts.net.'
      )
    }
    return inTurn(async () => {
      assertSession(session)
      store.set('publicUrl', parsed?.origin ?? null)
      if (child) {
        await restart({ kind: 'keep' })
      }
      return publish()
    })
  },
  turnOff: () =>
    inTurn(async () => {
      store.set({ enabled: false, turnedOff: true })
      await stop()
      return publish()
    }),
  /** Resolves once the worker listens or failed: a turn waiting on startup would hold sign-out behind the network. */
  turnOn: async ({
    account,
    session,
  }: {
    account: VaultAccount
    session: number
  }) => {
    await inTurn(async () => {
      assertSession(session)
      store.set('turnedOff', false)
      await restart({ account, kind: 'switch' })
    })
    await ready
    return getStatus()
  },
  /** On sign-out: the pairings, secrets, account and address it kept belong to the account leaving. */
  forget: () =>
    inTurn(async () => {
      await stop()
      store.set({
        enabled: false,
        publicUrl: null,
        session: store.get('session') + 1,
      })
      store.delete('wrappedKey')
      rmSync(getConfigDir(), { force: true, recursive: true })
      await publish()
    }),
  status: getStatus,
}

/** At launch, with the account the machine kept: it serves other devices with no window open. */
export const restoreMachine = () =>
  inTurn(async () => {
    if (store.get('enabled')) {
      await start({ kind: 'keep' })
    }
  })
