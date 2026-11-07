import { DUCKDB_FILES_ON_DESKTOP } from '@tamery/connection/database-file'
import { SSH_ELSEWHERE } from '@tamery/connection/ssh/params'
import { SyncType } from '@tamery/shared/enums/sync-type'

import type { ConnectionString } from '~/core/connection/connection-strings'
import type { Connection } from '~/core/connection/sync'
import type { BridgeRoute } from '~/core/runtime/bridge/pairing'

type FetchingType =
  | 'bridge'
  | 'cloud-proxy'
  | 'local'
  | 'resolving-password'
  | 'waiting-for-details'
  | 'waiting-for-password'

export interface FetchingConfig {
  type: FetchingType
  canSend: boolean
  reason: string | null
}

/** `null` for a string no saved connection holds, such as one under test: it carries everything it needs. */
type FetchingConnection = Pick<
  Connection,
  'syncType' | 'isPasswordExists'
> | null

interface FetchingOptions {
  bridge: BridgeRoute | null
  /** `null` while the row loads leaves the password unresolved. */
  connectionString: Pick<
    ConnectionString,
    | 'desktopOnly'
    | 'isInternal'
    | 'isPasswordPopulated'
    | 'missingSecrets'
    | 'usesSsh'
  > | null
  /** A string under test: the bridge runs saved connections only, never a string it is sent. */
  draft?: boolean
}

const REASONS = {
  connectionStringNotStored:
    'Only the name and color of this connection sync. Add its server details on this device to use it here.',
  passwordMissing: 'Enter the password to query this connection.',
  notInWeb:
    'You cannot reach this connection from the web app. Run `tamery bridge` or open this connection in the desktop app.',
  secretsMissing:
    'Enter the SSH or SSL credentials this device has not saved yet to query this connection.',
  secretsNotStoredInWeb:
    'This connection was saved without its credentials, so the web app cannot reach it. Run `tamery bridge` or open this connection in the desktop app.',
}

const allowed = (type: FetchingType): FetchingConfig => ({
  canSend: true,
  reason: null,
  type,
})

const blocked = (
  type: FetchingType,
  reason: string | null = null
): FetchingConfig => ({
  canSend: false,
  reason,
  type,
})

const resolveFlags = (
  connection: FetchingConnection,
  options: FetchingOptions
) => {
  const isElectron = !!window.electron
  const { connectionString } = options
  const isPasswordPopulated = connectionString?.isPasswordPopulated

  return {
    connectionStringMissing:
      connection?.syncType === SyncType.CloudWithoutConnectionString &&
      !connectionString,
    isElectron,
    isInternal: !!connectionString?.isInternal,
    missingSecrets: connectionString?.missingSecrets ?? [],
    needsPassword:
      !!connection?.isPasswordExists && isPasswordPopulated === false,
    passwordUnresolved:
      !!connection?.isPasswordExists && isPasswordPopulated === undefined,
    usesSsh: !!connectionString?.usesSsh,
  }
}

const routedConfig = (
  connection: FetchingConnection,
  options: FetchingOptions
): FetchingConfig => {
  const {
    connectionStringMissing,
    isElectron,
    isInternal,
    missingSecrets,
    needsPassword,
    passwordUnresolved,
    usesSsh,
  } = resolveFlags(connection, options)

  if (connectionStringMissing) {
    return blocked('waiting-for-details', REASONS.connectionStringNotStored)
  }

  if (options.bridge) {
    const { asks, name } = options.bridge
    if (options.draft) {
      return blocked(
        'bridge',
        `Saved connections run on ${name}, so save it to try it.`
      )
    }
    if (asks === 'all') {
      return blocked('waiting-for-details', REASONS.connectionStringNotStored)
    }
    if (asks) {
      return blocked(
        'waiting-for-password',
        asks.includes('password')
          ? REASONS.passwordMissing
          : REASONS.secretsMissing
      )
    }
    return allowed('bridge')
  }

  if (usesSsh && !isElectron) {
    return blocked('local', SSH_ELSEWHERE)
  }

  if (passwordUnresolved) {
    return blocked('resolving-password')
  }

  if ((needsPassword || missingSecrets.length > 0) && !isElectron) {
    return blocked('cloud-proxy', REASONS.secretsNotStoredInWeb)
  }

  if (needsPassword) {
    return blocked('waiting-for-password', REASONS.passwordMissing)
  }

  if (missingSecrets.length > 0) {
    return blocked('waiting-for-password', REASONS.secretsMissing)
  }

  if (isElectron) {
    return allowed('local')
  }

  if (isInternal || (connection && connection.syncType !== SyncType.Cloud)) {
    return blocked('cloud-proxy', REASONS.notInWeb)
  }

  return allowed('cloud-proxy')
}

/** Ahead of the bridge too, which refuses these: its binary ships without their driver. */
export const fetchingConfig = (
  connection: FetchingConnection,
  options: FetchingOptions
): FetchingConfig =>
  options.connectionString?.desktopOnly && !window.electron
    ? blocked('local', DUCKDB_FILES_ON_DESKTOP)
    : routedConfig(connection, options)
