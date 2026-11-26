import { SSH_ELSEWHERE } from '@tamery/connection/ssh/params'
import { SyncType } from '@tamery/shared/enums/sync-type'
import { ALL_SECRET_FIELDS } from '@tamery/shared/machine'

import type { ConnectionString } from '~/core/connection/connection-strings'
import type { Connection } from '~/core/connection/sync'
import { getNotPairedMessage } from '~/core/runtime/machine/not-paired'
import type { MachineRoute, RunsOn } from '~/core/runtime/machine/pairing'
import { CLOUD, THIS_COMPUTER } from '~/core/runtime/machine/pairing'

type FetchingType =
  | 'machine'
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
  runsOn: RunsOn
  machine: MachineRoute | null
  /** `null` while the row loads leaves the password unresolved. */
  connectionString: Pick<
    ConnectionString,
    'isInternal' | 'isPasswordPopulated' | 'missingSecrets' | 'usesSsh'
  > | null
  /** A string under test: the machine runs saved connections only, never a string it is sent. */
  draft?: boolean
}

const REASONS = {
  connectionStringNotStored:
    'Only the name and color of this connection sync. Add its server details on this device to use it here.',
  passwordMissing: 'Enter the password to query this connection.',
  notInCloud:
    'Tamery Cloud cannot reach this connection. Set Runs on to This computer to query it.',
  notInWeb:
    'You cannot reach this connection from the web app. Run it on a machine (Edit → Runs on) or open it in the desktop app.',
  secretsMissing:
    'Enter the SSH or SSL credentials this device has not saved yet to query this connection.',
  secretsNotStoredInWeb:
    'This connection was saved without its credentials, so the web app cannot reach it. Run it on a machine (Edit → Runs on) or open it in the desktop app.',
}

export const isReachableFromWeb = (
  { syncType }: Pick<Connection, 'syncType'>,
  connectionString: Pick<ConnectionString, 'isInternal' | 'usesSsh'> | null
) =>
  syncType === SyncType.Cloud &&
  !connectionString?.isInternal &&
  !connectionString?.usesSsh

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
  const { connectionString } = options
  const isPasswordPopulated = connectionString?.isPasswordPopulated

  return {
    connectionStringMissing:
      connection?.syncType === SyncType.CloudWithoutConnectionString &&
      !connectionString,
    isCloudOnDesktop: !!window.electron && options.runsOn === CLOUD,
    isInternal: !!connectionString?.isInternal,
    isThisComputer: options.runsOn === THIS_COMPUTER,
    missingSecrets: connectionString?.missingSecrets ?? [],
    needsPassword:
      !!connection?.isPasswordExists && isPasswordPopulated === false,
    passwordUnresolved:
      !!connection?.isPasswordExists && isPasswordPopulated === undefined,
    usesSsh: !!connectionString?.usesSsh,
  }
}

const machineConfig = (
  { asks, name, pairing }: MachineRoute,
  draft: boolean
): FetchingConfig => {
  if (draft) {
    return blocked(
      'machine',
      `Saved connections run on ${name}, so save it to try it.`
    )
  }
  if (!pairing) {
    return blocked('machine', getNotPairedMessage(name))
  }
  if (asks === ALL_SECRET_FIELDS) {
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
  return allowed('machine')
}

export const fetchingConfig = (
  connection: FetchingConnection,
  options: FetchingOptions
): FetchingConfig => {
  const {
    connectionStringMissing,
    isCloudOnDesktop,
    isInternal,
    isThisComputer,
    missingSecrets,
    needsPassword,
    passwordUnresolved,
    usesSsh,
  } = resolveFlags(connection, options)

  if (connectionStringMissing) {
    return blocked('waiting-for-details', REASONS.connectionStringNotStored)
  }

  if (options.machine) {
    return machineConfig(options.machine, !!options.draft)
  }

  if (
    isCloudOnDesktop &&
    (needsPassword ||
      missingSecrets.length > 0 ||
      (connection && !isReachableFromWeb(connection, options.connectionString)))
  ) {
    return blocked('cloud-proxy', REASONS.notInCloud)
  }

  if (usesSsh && !isThisComputer) {
    return blocked('local', SSH_ELSEWHERE)
  }

  if (passwordUnresolved) {
    return blocked('resolving-password')
  }

  if ((needsPassword || missingSecrets.length > 0) && !isThisComputer) {
    return blocked('cloud-proxy', REASONS.secretsNotStoredInWeb)
  }

  if (needsPassword) {
    return blocked('waiting-for-password', REASONS.passwordMissing)
  }

  if (missingSecrets.length > 0) {
    return blocked('waiting-for-password', REASONS.secretsMissing)
  }

  if (isThisComputer) {
    return allowed('local')
  }

  if (isInternal || (connection && connection.syncType !== SyncType.Cloud)) {
    return blocked('cloud-proxy', REASONS.notInWeb)
  }

  return allowed('cloud-proxy')
}
