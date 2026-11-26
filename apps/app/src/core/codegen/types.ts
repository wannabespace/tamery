import type { Dialect } from '@tamery/shared/enums/connection-type'
import type { ActiveFilter } from '@tamery/shared/filters'

import type { Column } from '~/core/table/cell/utils'

export type GeneratorFormat =
  | 'ts'
  | 'zod'
  | 'prisma'
  | 'sql'
  | 'drizzle'
  | 'kysely'

export type TypedColumn = Column & { type: string }

export interface Index {
  type?: string
  schema: string
  table: string
  name: string
  column: string | null
  customExpression?: string | null
  custom?: boolean
  definition?: string | null
  isUnique: boolean
  isPrimary: boolean
}

export interface QueryParams {
  table: string
  schema: string
  defaultSchema: string | null
  filters: ActiveFilter[]
  dialect: Dialect
}

export interface SchemaParams {
  table: string
  schema: string
  defaultSchema: string | null
  columns: Column[]
  dialect: Dialect
  indexes?: Index[]
}
