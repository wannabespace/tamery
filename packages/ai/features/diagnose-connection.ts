import { ConnectionType } from '@tamery/shared/enums/connection-type'
import type { TelemetryOptions } from 'ai'
import { generateText, Output } from 'ai'
import { type } from 'arktype'

import { models } from '../models/list'
import { section } from './prompt'

const diagnosisOutput = type({
  explanation: 'string',
  /** Every key is required and nullable: an optional key has no JSON Schema form once `exactOptionalPropertyTypes` is off (`@tamery/shared/arktype-config`). */
  fix: type({
    database: 'string | null',
    label: 'string',
    port: 'string | null',
    sshEnabled: 'boolean | null',
    ssl: "'off' | 'on' | 'unverified' | null",
    type: type.valueOf(ConnectionType).or('null'),
  }).or('null'),
  steps: 'string[]',
})

const PLACEHOLDER = /[<>]/u
const PORT = /^\d{1,5}$/u

const INSTRUCTIONS = [
  "You help someone whose database client couldn't connect to their database.",
  'You get the engine (null when the client could not tell), the settings with identifying values replaced by placeholders (<host>, <user>, <database>, <password>, <ssh-host>, <ssh-user>, <ip>, <redacted>), where the client runs, and the driver error.',
  'The desktop app connects directly and can open SSH tunnels; the web app connects through a proxy and cannot tunnel.',
  'Explain the most likely cause in one or two plain sentences, naming the provider or tool when the settings show one.',
  'Then give at most three short, concrete steps the person can take, most likely first.',
  'Propose a fix only when you are confident it resolves the error. A fix may change only: port, ssl (on to require TLS, off to turn it off, unverified to keep TLS but skip certificate checks; PostgreSQL, MySQL, SQL Server and MongoDB, and on or off only for Oracle, not ClickHouse), the engine type, database (empty for the default), or turning on an SSH tunnel (desktop only, never for Oracle). A MongoDB login that fails while the server is reachable is often checked against the wrong database: its options need authSource=admin. Its label is a short imperative button text, e.g. "Use port 5432"; every field it does not change is null. Otherwise fix is null.',
  'Never ask for or repeat a password, never invent hostnames, and never put a placeholder or <redacted> in a fix.',
].join('\n')

export const diagnoseConnection = async (data: {
  error: string
  settings: Record<string, unknown>
  signal?: AbortSignal
  telemetry?: TelemetryOptions
}) => {
  const { output } = await generateText({
    abortSignal: data.signal,
    instructions: INSTRUCTIONS,
    model: models.structured,
    output: Output.object({ schema: diagnosisOutput }),
    prompt: [
      section('SETTINGS', JSON.stringify(data.settings, null, 2)),
      section('ERROR', data.error),
    ].join('\n'),
    telemetry: data.telemetry,
  })
  const { fix } = output
  const unsafe =
    !!fix &&
    ((!!fix.database && PLACEHOLDER.test(fix.database)) ||
      (!!fix.port && !PORT.test(fix.port)))
  return unsafe ? { ...output, fix: null } : output
}
