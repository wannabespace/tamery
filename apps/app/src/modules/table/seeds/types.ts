import type { Dialect } from '@tamery/shared/enums/connection-type'

import type { Column } from '~/core/table/cell/utils'

export const SKIP_GENERATOR = 'skip-generator'
export const NULL_GENERATOR = 'null'
export const REFERENCE_GENERATOR = 'reference-generator'
export const ENUM_GENERATOR = 'enum-generator'
export const SQL_EXPRESSION_GENERATOR = 'sql-expression'

export interface GeneratorDef {
  label: string
  category: string
  generate: (column: Column) => unknown
}

export type GeneratorMap<D extends Dialect | '' = ''> = Record<
  D extends '' ? string : `${D}.${string}`,
  GeneratorDef
>
