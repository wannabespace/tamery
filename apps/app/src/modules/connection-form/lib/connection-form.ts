import type { ConnectionParts } from '@tamery/connection/connection-parts'
import { connectionParts } from '@tamery/connection/connection-parts'
import type { ConnectionPatch } from '@tamery/connection/diagnosis'
import type { ConnectionGuess } from '@tamery/connection/guess'
import { guessConnection } from '@tamery/connection/guess'
import type { GuessedParts } from '@tamery/connection/guess/types'
import { isLocalHost } from '@tamery/connection/hosts'
import type { SshTunnel } from '@tamery/connection/ssh/params'
import { EMPTY_SSH_TUNNEL } from '@tamery/connection/ssh/params'
import { ConnectionType, Provider } from '@tamery/shared/enums/connection-type'
import { SyncType } from '@tamery/shared/enums/sync-type'
import { pick } from '@tamery/shared/utils'
import { useAppForm } from '@tamery/ui/components/tanstack-form'
import { type } from 'arktype'
import { useState } from 'react'

import type { Connection } from '~/core/connection/sync'
import { posthog } from '~/lib/posthog'
import { generateRandomName } from '~/utils/faker'

import type { Engine } from './engine-fields'
import { getEngineFields, isSqliteFile } from './engine-fields'
import type { PasteVia } from './use-paste-connection'

export interface ConnectionFormValues extends Omit<
  ConnectionParts,
  'ssh' | 'type'
> {
  color: string | null
  label: string
  name: string
  ssh: SshTunnel
  sshEnabled: boolean
  syncType: SyncType
  type: ConnectionType
}

const DEFAULT_VALUES: ConnectionFormValues = {
  color: null,
  database: '',
  host: '',
  https: null,
  label: '',
  name: '',
  options: '',
  password: '',
  port: '',
  provider: null,
  ssh: EMPTY_SSH_TUNNEL,
  sshEnabled: false,
  syncType: SyncType.Cloud,
  type: ConnectionType.Postgres,
  user: '',
}

const SERVER_FIELDS = [
  'database',
  'host',
  'options',
  'password',
  'port',
  'user',
] as const

const port = type(/^\d{0,5}$/u).configure({ message: 'Use a port number' })

const FULL_PATH = /^\s*(?:\/|~\/|[a-z]:[\\/])/iu

const connectionFormSchema = type({
  database: 'string',
  host: 'string',
  options: 'string',
  password: 'string',
  port,
  provider: type.valueOf(Provider).or('null'),
  ssh: { host: 'string', port },
  sshEnabled: 'boolean',
  type: type.valueOf(ConnectionType),
  user: 'string',
})
  .narrow((values, ctx) => {
    const { field, message, rows } = getEngineFields(values)
    const empty = [
      { message, name: field },
      ...rows.flatMap(({ name, required }) =>
        required ? [{ message: required, name }] : []
      ),
    ].filter(({ name }) => !/\S/u.test(values[name]))
    for (const row of empty) {
      ctx.reject({ message: row.message, path: [row.name] })
    }
    return empty.length === 0
  })
  .narrow(
    (values, ctx) =>
      !isSqliteFile(values) ||
      !/\S/u.test(values.database) ||
      FULL_PATH.test(values.database) ||
      ctx.reject({
        message: "Use the file's full path, like /Users/me/app.db",
        path: ['database'],
      })
  )
  .narrow(
    (values, ctx) =>
      !values.sshEnabled ||
      !getEngineFields(values).sshTunnel ||
      /\S/u.test(values.ssh.host) ||
      ctx.reject({ message: 'Enter the SSH host', path: ['ssh', 'host'] })
  )

export const getFormValues = (
  connection: Connection,
  connectionString: string | null
): ConnectionFormValues => {
  const parts =
    connectionString === null ? null : connectionParts.parse(connectionString)
  return {
    ...DEFAULT_VALUES,
    ...(parts && pick(parts, [...SERVER_FIELDS, 'https'])),
    color: connection.color,
    label: connection.label ?? '',
    name: connection.name,
    provider: parts ? parts.provider : connection.provider,
    ssh: parts?.ssh ?? EMPTY_SSH_TUNNEL,
    sshEnabled: !!parts?.ssh,
    syncType: connection.syncType,
    type: connection.type,
  }
}

export const getParts = (values: ConnectionFormValues): ConnectionParts => {
  const engineFields = getEngineFields(values)
  const shown = new Set(
    engineFields.rows.flatMap((row) =>
      row.port ? [row.name, 'port'] : [row.name]
    )
  )
  const keep = (field: (typeof SERVER_FIELDS)[number]) =>
    shown.has(field) ? values[field] : ''
  return {
    database: keep('database'),
    host: engineFields.fixedHost ?? keep('host'),
    https: values.https,
    options: keep('options'),
    password: keep('password'),
    port: keep('port'),
    provider: values.provider,
    ssh: engineFields.sshTunnel && values.sshEnabled ? values.ssh : null,
    type: values.type,
    user: keep('user'),
  }
}

export const getMissing = (values: ConnectionFormValues) =>
  getEngineFields(values).rows.flatMap(({ name, optional }) =>
    optional ||
    values[name].trim() ||
    (name === 'password' && isLocalHost(values.host.trim()))
      ? []
      : [name]
  )

/** Starts every field over, so a password or token never travels to another engine's host. */
const clearFields = (form: ConnectionForm) => {
  for (const field of SERVER_FIELDS) {
    form.setFieldValue(field, '')
  }
  form.setFieldValue('https', null)
  form.setFieldValue('ssh', EMPTY_SSH_TUNNEL)
  form.setFieldValue('sshEnabled', false)
}

const sharesFields = (from: Engine, to: Engine) =>
  from.provider === to.provider && isSqliteFile(from) === isSqliteFile(to)

export const switchEngine = (form: ConnectionForm, engine: Engine) => {
  if (!sharesFields(form.state.values, engine)) {
    clearFields(form)
  }
  form.setFieldValue('type', engine.type)
  form.setFieldValue('provider', engine.provider)
}

const getGuessedEngine = (
  values: ConnectionFormValues,
  parts: GuessedParts
): Engine =>
  parts.type
    ? {
        provider: parts.provider ?? null,
        type: parts.type,
      }
    : values

const BARE_HOST = /^[\w.:%[\]-]+$/u

const fill = (form: ConnectionForm, { format, parts }: ConnectionGuess) => {
  const { values } = form.state
  if (parts.host && BARE_HOST.test(values.host) && parts.host !== values.host) {
    clearFields(form)
  }
  switchEngine(form, getGuessedEngine(values, parts))
  if (format === 'jdbc' || format === 'url') {
    form.setFieldValue('options', parts.options ?? '')
  }
  for (const field of SERVER_FIELDS) {
    const value = parts[field]
    if (value) {
      form.setFieldValue(field, value)
    }
  }
  if (parts.https !== undefined) {
    form.setFieldValue('https', parts.https)
  }
  if (parts.ssh) {
    form.setFieldValue('ssh', parts.ssh)
    form.setFieldValue('sshEnabled', true)
  }
}

const expandField = (
  form: ConnectionForm,
  onFill: (guess: ConnectionGuess, pasted: boolean) => void
) => {
  const { values } = form.state
  const { field } = getEngineFields(values)
  const value = values[field]
  const guess = guessConnection(value, true)
  const read = guess?.parts[field]
  if (
    guess &&
    ((read !== undefined && read !== value) ||
      !sharesFields(values, getGuessedEngine(values, guess.parts)))
  ) {
    fill(form, guess)
    onFill(guess, false)
  }
}

export const useConnectionForm = ({
  defaultValues,
  onFill,
  onSubmit,
  unfilledSecrets,
}: {
  defaultValues?: ConnectionFormValues
  onFill: (guess: ConnectionGuess, pasted: boolean) => void
  onSubmit: () => Promise<void>
  unfilledSecrets: (values: ConnectionFormValues) => Record<string, string>
}) => {
  // oxlint-disable-next-line react/hook-use-state -- frozen at mount, never set
  const [initialValues] = useState(
    () => defaultValues ?? { ...DEFAULT_VALUES, name: generateRandomName() }
  )
  const form = useAppForm({
    defaultValues: initialValues,
    listeners: {
      onBlur: ({ fieldApi }) => {
        if (fieldApi.name === getEngineFields(form.state.values).field) {
          expandField(form, onFill)
        }
      },
    },
    onSubmit: () => {
      expandField(form, onFill)
      return onSubmit()
    },
    validators: {
      onChange: connectionFormSchema,
      onMount: connectionFormSchema,
      onSubmit: ({ value }) => ({ fields: unfilledSecrets(value) }),
    },
  })

  return {
    form,
    paste: (guess: ConnectionGuess, via: PasteVia) => {
      posthog.capture('connection_pasted', { format: guess.format, via })
      fill(form, guess)
      onFill(guess, true)
    },
    patch: (patch: ConnectionPatch) => {
      if (patch.type && patch.type !== form.state.values.type) {
        switchEngine(form, { provider: null, type: patch.type })
      }
      for (const field of ['database', 'host', 'options', 'port'] as const) {
        const value = patch[field]
        if (value !== undefined) {
          form.setFieldValue(field, value)
        }
      }
      if (patch.https !== undefined) {
        form.setFieldValue('https', patch.https)
      }
      if (patch.sshEnabled) {
        form.setFieldValue('sshEnabled', true)
      }
    },
  }
}

export type ConnectionForm = ReturnType<typeof useConnectionForm>['form']
