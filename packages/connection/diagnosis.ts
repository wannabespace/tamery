import type {
  ConnectionType,
  Provider,
} from '@tamery/shared/enums/connection-type'

import type { ConnectionParts } from './connection-parts'
import type { SSH_FIELD_AT_FAULT } from './ssh/params'

export interface ConnectionPatch {
  database?: string
  host?: string
  https?: boolean
  options?: string
  port?: string
  sshEnabled?: boolean
  type?: ConnectionType
}

export interface Diagnosis {
  fix?: { label: string; patch: ConnectionPatch }
  focus?: 'database' | 'password' | 'user' | (typeof SSH_FIELD_AT_FAULT)[string]
  hint: string
  /** Only on `OFFLINE_DIAGNOSIS`, so a cached copy still tells `adviseRetry` what it is. */
  offline?: true
  title: string
}

export interface DiagnosisContext {
  desktop: boolean
  message: string
  /** This device's network when the attempt failed; true for an error the cloud proxy or a machine answered with. */
  online: boolean
  parts: ConnectionParts
}

export interface DiagnosisRule {
  match: RegExp
  diagnose: (context: DiagnosisContext) => Diagnosis
  /** Only this engine's errors carry the matched text. */
  engine?: ConnectionType
  /** Only these providers' transports raise the matched text; a file's own error never means a network failure. */
  providers?: Provider[]
  /** A device with no network fails this way too: reaching a public database host (`host`), or its own request to the cloud proxy (`device`). */
  offline?: 'device' | 'host'
  tunnel?: true
}
