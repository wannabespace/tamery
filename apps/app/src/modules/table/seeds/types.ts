import type { Dialect } from '@tamery/shared/enums/connection-type'

import type { Column } from '~/core/table/cell/utils'

export const SKIP_GENERATOR = 'skip-generator'
export const NULL_GENERATOR = 'null'
export const REFERENCE_GENERATOR = 'reference-generator'
export const ENUM_GENERATOR = 'enum-generator'
// The id stays 'custom-generator': per-table seed configs persist it in localStorage, so renaming the value orphans a saved selection.
export const SQL_EXPRESSION_GENERATOR = 'custom-generator'

export interface GeneratorDef {
  label: string
  category: string
  generate: (column: Column) => unknown
}

export type GeneratorMap<D extends Dialect | '' = ''> = Record<
  D extends '' ? string : `${D}.${string}`,
  GeneratorDef
>
