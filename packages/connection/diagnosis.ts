import type { ConnectionType } from '@tamery/shared/enums/connection-type'

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
  title: string
}

export interface DiagnosisContext {
  desktop: boolean
  message: string
  online: boolean
  parts: ConnectionParts
}

export interface DiagnosisRule {
  match: RegExp
  diagnose: (context: DiagnosisContext) => Diagnosis
  /** Only this engine's errors carry the matched text. */
  engine?: ConnectionType
  /** A device with no network fails this way too. */
  offline?: true
  tunnel?: true
}
