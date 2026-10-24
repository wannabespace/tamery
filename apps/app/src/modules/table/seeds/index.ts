import { faker } from '@faker-js/faker/locale/en'
import { Dialect, isSqlDialect } from '@tamery/shared/enums/connection-type'
import { sql } from 'kysely'
import { memoize } from 'memoza'

import { getCapabilities } from '~/core/catalog/capabilities'
import type { Column } from '~/core/table/cell/utils'
import { formatColumnTime, TIME_FORMATS } from '~/core/table/cell/utils'

import { BASE_GENERATORS, columnMaxLength, columnTypeName } from './base'
import { clickhouseSeedConfig } from './clickhouse.ts'
import { detectGenerator } from './detect'
import { mssqlSeedConfig } from './mssql'
import { mysqlSeedConfig } from './mysql'
import { oracleSeedConfig } from './oracle'
import { pgSeedConfig } from './postgres'
import type { DialectSeedConfig, Generator, GeneratorId } from './registry'
import { sqliteSeedConfig } from './sqlite'
import type { GeneratorDef } from './types'
import {
  CUSTOM_GENERATOR,
  ENUM_GENERATOR,
  NULL_GENERATOR,
  REFERENCE_GENERATOR,
  SKIP_GENERATOR,
} from './types'

const DIALECT_CONFIGS: Record<Dialect, DialectSeedConfig> = {
  clickhouse: clickhouseSeedConfig,
  mongodb: { generators: {}, types: { objectId: SKIP_GENERATOR } },
  mssql: mssqlSeedConfig,
  mysql: mysqlSeedConfig,
  oracle: oracleSeedConfig,
  postgres: pgSeedConfig,
  sqlite: sqliteSeedConfig,
}

export interface GeneratorGroup {
  value: string
  items: GeneratorId[]
}

export type Generators = Partial<Record<GeneratorId, GeneratorDef>>

export const getGenerators = memoize((dialect: Dialect): Generators => ({
  ...BASE_GENERATORS,
  ...DIALECT_CONFIGS[dialect].generators,
}))

export const getGeneratorGroups = memoize(
  (dialect: Dialect): GeneratorGroup[] =>
    Object.entries(
      Object.groupBy(
        Object.entries(getGenerators(dialect)),
        ([, def]) => def.category
      )
    ).map(([value, entries]) => ({
      items: (entries ?? []).map(([id]) => id as GeneratorId),
      value,
    }))
)

const canSkipColumn = (column: Column, dialect: Dialect) =>
  dialect === Dialect.ClickHouse ||
  !!column.isNullable ||
  !!column.defaultValue ||
  !!column.isGenerated

const AVAILABILITY: Partial<
  Record<GeneratorId, (column: Column, dialect: Dialect) => boolean>
> = {
  // A custom value is a SQL expression the insert splices in.
  [CUSTOM_GENERATOR]: (_column, dialect) => isSqlDialect(dialect),
  [ENUM_GENERATOR]: (column) => !!column.availableValues?.length,
  [NULL_GENERATOR]: (column) => !!column.isNullable,
  [REFERENCE_GENERATOR]: (column) => !!column.foreign,
  [SKIP_GENERATOR]: canSkipColumn,
}

export const isGeneratorAvailable = (
  id: GeneratorId,
  column: Column,
  dialect: Dialect
) => AVAILABILITY[id]?.(column, dialect) ?? true

export const autoDetectGenerator = (
  column: Column,
  dialect: Dialect
): GeneratorId => {
  if (column.foreign) {
    return REFERENCE_GENERATOR
  }
  if (column.availableValues?.length) {
    return ENUM_GENERATOR
  }
  if (column.isGenerated || column.defaultValue) {
    return SKIP_GENERATOR
  }

  const type = columnTypeName(column)
  return DIALECT_CONFIGS[dialect].types[type] ?? detectGenerator(column, type)
}

const NULL_SHARE = 0.25
const ARRAY_LENGTH = { max: 5, min: 1 }
const produceNull = (): unknown => null

const multipleIfArray = (column: Column, one: () => unknown) =>
  column.isArray
    ? () => faker.helpers.multiple(one, { count: ARRAY_LENGTH })
    : one

const valueProducer = ({
  column,
  generator: { customExpression, generatorId },
  generators,
  referenceValues,
}: {
  column: Column
  generator: Generator
  generators: Generators
  referenceValues?: unknown[]
}): (() => unknown) | undefined => {
  const def = generators[generatorId]

  if (!def || generatorId === SKIP_GENERATOR) {
    return undefined
  }

  if (generatorId === NULL_GENERATOR) {
    return produceNull
  }

  if (generatorId === CUSTOM_GENERATOR) {
    const expression = customExpression?.trim()
    const raw = expression && sql.raw(`(${expression})`)
    return raw ? () => raw : undefined
  }

  if (generatorId === REFERENCE_GENERATOR) {
    if (referenceValues?.length) {
      return multipleIfArray(column, () =>
        faker.helpers.arrayElement(referenceValues)
      )
    }
    if (column.isNullable) {
      return produceNull
    }
    throw new Error(
      `"${column.foreign?.schema}.${column.foreign?.table}" has no rows to reference for "${column.id}".`
    )
  }

  if (generatorId === ENUM_GENERATOR) {
    const values = column.availableValues ?? []
    return column.isArray
      ? () =>
          faker.helpers.arrayElements(values, {
            max: Math.min(ARRAY_LENGTH.max, values.length),
            min: 1,
          })
      : () => faker.helpers.arrayElement(values)
  }

  return multipleIfArray(column, () => def.generate(column))
}

const DISTINCT_ATTEMPTS = 100

const distinctProducer = (produce: () => unknown, column: Column) => {
  const seen = new Set<unknown>()

  return () => {
    for (let attempt = 0; attempt < DISTINCT_ATTEMPTS; attempt += 1) {
      const value = produce()
      if (!seen.has(value)) {
        seen.add(value)
        return value
      }
    }
    throw new Error(
      `"${column.id}" must be unique, but its generator ran out of distinct values.`
    )
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  Object.getPrototypeOf(value) === Object.prototype

// Only a JSON column keeps its parsed value: `bindValue` stringifies it, and no driver binds a plain object otherwise.
const finalizeValue = (value: unknown, column: Column, dialect: Dialect) => {
  if (getCapabilities(dialect).columnTypes.json.test(column.type ?? '')) {
    return value
  }
  const timeFormat = TIME_FORMATS[column.uiType]
  if (value instanceof Date && timeFormat) {
    return formatColumnTime(value, timeFormat, column, dialect)
  }
  if (Array.isArray(value)) {
    return column.isArray
      ? (DIALECT_CONFIGS[dialect].transformArray?.(value, column) ?? value)
      : JSON.stringify(value)
  }
  if (isPlainObject(value)) {
    return JSON.stringify(value)
  }
  const maxLength = columnMaxLength(column)
  return typeof value === 'string' && maxLength
    ? value.slice(0, maxLength)
    : value
}

export const generateRows = ({
  columns,
  columnGenerators,
  count,
  dialect,
  referenceData,
}: {
  columns: Column[]
  columnGenerators: Record<string, Generator>
  count: number
  dialect: Dialect
  referenceData?: Record<string, unknown[]>
}) => {
  const generators = getGenerators(dialect)

  const columnProducers = columns.flatMap((column) => {
    const generator = columnGenerators[column.id]
    const produce =
      generator &&
      valueProducer({
        column,
        generator,
        generators,
        referenceValues: referenceData?.[column.id],
      })
    if (!produce) {
      return []
    }

    const next =
      (column.unique || column.primaryKey) &&
      generator.generatorId !== CUSTOM_GENERATOR
        ? distinctProducer(produce, column)
        : produce
    const nullable = generator.isNullable && column.isNullable

    return [
      [
        column.id,
        () =>
          finalizeValue(
            nullable && faker.datatype.boolean(NULL_SHARE) ? null : next(),
            column,
            dialect
          ),
      ] as const,
    ]
  })

  return Array.from({ length: count }, () =>
    Object.fromEntries(columnProducers.map(([id, next]) => [id, next()]))
  )
}
