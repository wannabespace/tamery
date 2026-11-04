import { Dialect } from '@tamery/shared/enums/connection-type'
import type { ActiveFilter, FilterOperator } from '@tamery/shared/filters'
import { camelCase, pascalCase } from 'change-case'

import { prismaType } from '~/core/codegen/column-types'
import { explicitIndexes } from '~/core/codegen/indexes'
import type {
  QueryParams,
  SchemaParams,
  TypedColumn,
} from '~/core/codegen/types'
import {
  claimRelationName,
  hasType,
  isNowDefault,
  isSerialDefault,
  isSingleColumnConstraint,
} from '~/core/codegen/utils'

type PrismaFilterValue =
  | string
  | number
  | boolean
  | Date
  | null
  | { [key: string]: PrismaFilterValue }
  | PrismaFilterValue[]

const isPrismaFilterValue = (v: unknown): v is PrismaFilterValue =>
  v !== undefined && typeof v !== 'symbol' && typeof v !== 'function'

const PRISMA_OPERATORS: Record<FilterOperator, string | null> = {
  eq: 'equals',
  gt: 'gt',
  gte: 'gte',
  ilike: null,
  in: 'in',
  isNotNull: 'not',
  isNull: 'equals',
  like: null,
  lt: 'lt',
  lte: 'lte',
  ne: 'not',
  notIn: 'notIn',
  notLike: null,
}

const likePatternToPrisma = (pattern: string): Record<string, string> => {
  const leading = pattern.startsWith('%')
  const trailing = pattern.length > 1 && pattern.endsWith('%')
  const text = pattern.slice(leading ? 1 : 0, trailing ? -1 : undefined)
  if (leading && trailing) {
    return { contains: text }
  }
  if (leading) {
    return { endsWith: text }
  }
  return trailing ? { startsWith: text } : { equals: text }
}

const likeFilterToPrisma = ({
  ref,
  values: [pattern],
}: ActiveFilter): PrismaFilterValue => {
  const match = likePatternToPrisma(String(pattern))
  if (ref.operator === 'notLike') {
    return { not: match }
  }
  return ref.operator === 'ilike' ? { ...match, mode: 'insensitive' } : match
}

const singleFilterToPrisma = (
  filter: ActiveFilter
): PrismaFilterValue | null => {
  const prismaOp = PRISMA_OPERATORS[filter.ref.operator]
  if (!prismaOp) {
    return likeFilterToPrisma(filter)
  }
  if (filter.ref.hasValue === false) {
    return { [prismaOp]: null }
  }
  if (filter.ref.isArray) {
    return { [prismaOp]: filter.values.filter(isPrismaFilterValue) }
  }
  const [value] = filter.values
  if (!isPrismaFilterValue(value)) {
    return null
  }
  return prismaOp === 'equals' ? value : { [prismaOp]: value }
}

export const generateQueryPrisma = ({ table, filters }: QueryParams) => {
  const findMany = `await prisma.${camelCase(table)}.findMany`
  const conditions = filters.flatMap((f) => {
    const value = singleFilterToPrisma(f)
    return value === null ? [] : [{ [camelCase(f.column)]: value }]
  })
  if (conditions.length === 0) {
    return `${findMany}()`
  }

  const fields = conditions.flatMap(Object.keys)
  const where =
    new Set(fields).size === fields.length
      ? Object.assign({}, ...conditions)
      : { AND: conditions }
  const whereLiteral = JSON.stringify(where, null, 2)
    .replaceAll(/"(?<key>[^"]+)":/gu, '$<key>:')
    .replaceAll('\n', '\n  ')

  return `${findMany}({\n  where: ${whereLiteral}\n})`
}

const FK_ACTION_MAP: Record<string, string> = {
  CASCADE: 'Cascade',
  'NO ACTION': 'NoAction',
  RESTRICT: 'Restrict',
  'SET DEFAULT': 'SetDefault',
  'SET NULL': 'SetNull',
}

const foreignActionToPrisma = (
  action: string,
  kind: 'onDelete' | 'onUpdate'
): string => {
  const value = FK_ACTION_MAP[action.toUpperCase()]
  return value ? `, ${kind}: ${value}` : ''
}

interface PrismaField {
  name: string
  type: string
  attributes: string[]
}

const block = (header: string, body: string, attributes: string[]) =>
  [
    `${header} {`,
    body,
    ...(attributes.length
      ? ['', ...attributes.map((attribute) => `  ${attribute}`)]
      : []),
    '}',
  ].join('\n')

const prismaDefault = (c: TypedColumn): string | null => {
  if (c.isIdentity || isSerialDefault(c.defaultValue)) {
    return 'autoincrement()'
  }
  if (typeof c.defaultValue !== 'string') {
    return null
  }
  if (isNowDefault(c.defaultValue)) {
    return 'now()'
  }
  const literal = c.defaultValue.replaceAll(/^\(+|\)+$/gu, '')
  if (
    /^-?\d+(?:\.\d+)?$/u.test(literal) ||
    /^(?:true|false)$/iu.test(literal)
  ) {
    return literal.toLowerCase()
  }
  return `dbgenerated("${c.defaultValue.replaceAll('"', '\\"')}")`
}

const SIZED_STRING_TYPES: Record<string, string> = {
  char: 'Char',
  character: 'Char',
  'character varying': 'VarChar',
  nchar: 'NChar',
  nvarchar: 'NVarChar',
  varchar: 'VarChar',
}

const NATIVE_TYPES: Record<Dialect, Record<string, string>> = {
  clickhouse: {},
  mongodb: {},
  mssql: { date: '@db.Date' },
  mysql: { date: '@db.Date' },
  oracle: {},
  postgres: {
    date: '@db.Date',
    'time without time zone': '@db.Time',
    'timestamp with time zone': '@db.Timestamptz',
    uuid: '@db.Uuid',
  },
  sqlite: {},
}

const buildFieldAttributes = (
  c: TypedColumn,
  fieldType: string,
  needsMap: boolean,
  { columns, dialect }: Pick<SchemaParams, 'columns' | 'dialect'>
): string[] => {
  const attributes: string[] = []
  if (isSingleColumnConstraint(c, columns, 'primaryKey')) {
    attributes.push('@id')
  } else if (isSingleColumnConstraint(c, columns, 'unique')) {
    attributes.push('@unique')
  }

  const defaultValue = prismaDefault(c)
  if (defaultValue) {
    attributes.push(`@default(${defaultValue})`)
  }

  const sizedString = SIZED_STRING_TYPES[c.type]
  if (fieldType === 'String' && sizedString && c.maxLength) {
    attributes.push(
      `@db.${sizedString}(${c.maxLength === -1 ? 'Max' : c.maxLength})`
    )
  }

  const nativeType = NATIVE_TYPES[dialect][c.type]
  if (nativeType) {
    attributes.push(nativeType)
  }

  if (fieldType === 'Decimal' && c.precision) {
    attributes.push(`@db.Decimal(${c.precision}, ${c.scale || 0})`)
  }

  if (needsMap) {
    attributes.push(`@map("${c.id}")`)
  }

  return attributes
}

const enumBlock = (
  enumName: string,
  values: string[],
  schemaAttributes: string[]
) => {
  const name = pascalCase(enumName)
  const members = values.map((v) =>
    /^[a-z]\w*$/iu.test(v)
      ? `  ${v}`
      : `  ${v.replaceAll(/\W/gu, '_')} @map("${v}")`
  )
  return block(`enum ${name}`, members.join('\n'), [
    ...(name === enumName ? [] : [`@@map("${enumName}")`]),
    ...schemaAttributes,
  ])
}

const relationFields = (
  c: TypedColumn,
  fieldName: string,
  usedNames: Set<string>
) => {
  const fields: PrismaField[] = []
  if (c.foreign) {
    const onDelete = foreignActionToPrisma(c.foreign.onDelete ?? '', 'onDelete')
    const onUpdate = foreignActionToPrisma(c.foreign.onUpdate ?? '', 'onUpdate')
    fields.push({
      attributes: [
        `@relation(fields: [${fieldName}], references: [${camelCase(c.foreign.column)}]${onDelete}${onUpdate})`,
      ],
      name: claimRelationName(usedNames, c.foreign.table, c.foreign.column),
      type: pascalCase(c.foreign.table),
    })
  }

  for (const ref of c.references ?? []) {
    const refType = pascalCase(ref.table)
    fields.push({
      attributes: [],
      name: claimRelationName(usedNames, ref.table, ref.column),
      type: ref.isUnique ? `${refType}?` : `${refType}[]`,
    })
  }
  return fields
}

export const generateSchemaPrisma = ({
  table,
  schema,
  defaultSchema,
  columns,
  dialect,
  indexes,
}: SchemaParams) => {
  const scalarFields: PrismaField[] = []
  const relations: PrismaField[] = []
  const enumBlocks = new Set<string>()
  const usedNames = new Set<string>()
  const schemaAttributes =
    schema === defaultSchema ? [] : [`@@schema("${schema}")`]

  for (const c of columns.filter(hasType)) {
    let fieldType: string = prismaType(c.type, dialect)
    if (c.enumName && c.availableValues?.length) {
      fieldType = pascalCase(c.enumName)
      enumBlocks.add(enumBlock(c.enumName, c.availableValues, schemaAttributes))
    }

    const fieldName = camelCase(c.id)
    usedNames.add(fieldName)

    const isList = c.isArray && dialect === Dialect.Postgres
    scalarFields.push({
      attributes: buildFieldAttributes(c, fieldType, fieldName !== c.id, {
        columns,
        dialect,
      }),
      name: fieldName,
      type: isList ? `${fieldType}[]` : fieldType + (c.isNullable ? '?' : ''),
    })
    relations.push(...relationFields(c, fieldName, usedNames))
  }

  const fields = [...scalarFields, ...relations]
  const maxNameLen = Math.max(...fields.map((f) => f.name.length), 0)
  const maxTypeLen = Math.max(...fields.map((f) => f.type.length), 0)
  const fieldLines = fields.map((f) => {
    const parts = [
      f.name.padEnd(maxNameLen),
      f.type.padEnd(maxTypeLen),
      ...f.attributes,
    ]
    return `  ${parts.join(' ').trimEnd()}`
  })

  const primaryFields = columns
    .filter((c) => c.primaryKey)
    .map((c) => camelCase(c.id))
  const indexAttributes = explicitIndexes({ columns, indexes, schema, table })
    .filter((idx) => idx.keys.every((key) => 'column' in key))
    .map((idx) => {
      const fieldNames = idx.columns.map((col) => camelCase(col))
      const type = idx.isUnique ? '@@unique' : '@@index'
      return `${type}([${fieldNames.join(', ')}], map: "${idx.name}")`
    })
  const modelName = pascalCase(table)
  const model = block(`model ${modelName}`, fieldLines.join('\n'), [
    ...(primaryFields.length > 1
      ? [`@@id([${primaryFields.join(', ')}])`]
      : []),
    ...indexAttributes,
    ...schemaAttributes,
    ...(modelName === table ? [] : [`@@map("${table}")`]),
  ])

  return [model, ...enumBlocks].join('\n\n')
}
