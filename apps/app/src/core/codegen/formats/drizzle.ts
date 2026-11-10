import { Dialect } from '@tamery/shared/enums/connection-type'
import type { FilterOperator } from '@tamery/shared/filters'
import { camelCase } from 'change-case'

import { drizzleType } from '~/core/codegen/column-types'
import { isDrizzleDialect } from '~/core/codegen/compatibility'
import type { DrizzleDialect } from '~/core/codegen/compatibility'
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
  isValidIdentifier,
  toLiteralKey,
  toStringLiteral,
} from '~/core/codegen/utils'

const dialectConfig: Record<
  DrizzleDialect,
  {
    anyColumn: string
    schemaFunc?: string
    tableFunc: string
    dialectImportPath: string
    enumFunc?: string
  }
> = {
  mssql: {
    anyColumn: 'AnyMsSqlColumn',
    dialectImportPath: 'drizzle-orm/mssql-core',
    schemaFunc: 'mssqlSchema',
    tableFunc: 'mssqlTable',
  },
  mysql: {
    anyColumn: 'AnyMySqlColumn',
    dialectImportPath: 'drizzle-orm/mysql-core',
    enumFunc: 'mysqlEnum',
    schemaFunc: 'mysqlSchema',
    tableFunc: 'mysqlTable',
  },
  postgres: {
    anyColumn: 'AnyPgColumn',
    dialectImportPath: 'drizzle-orm/pg-core',
    enumFunc: 'pgEnum',
    schemaFunc: 'pgSchema',
    tableFunc: 'pgTable',
  },
  sqlite: {
    anyColumn: 'AnySQLiteColumn',
    dialectImportPath: 'drizzle-orm/sqlite-core',
    tableFunc: 'sqliteTable',
  },
}

const FK_SUFFIX_RE = /(?:_id|Id)$/u

const SERIAL_BY_INT_TYPE: Record<string, string> = {
  bigint: 'bigserial',
  integer: 'serial',
  smallint: 'smallserial',
}

const DRIZZLE_FUNCTIONS: Record<FilterOperator, string> = {
  eq: 'eq',
  gt: 'gt',
  gte: 'gte',
  ilike: 'ilike',
  in: 'inArray',
  isNotNull: 'isNotNull',
  isNull: 'isNull',
  like: 'like',
  lt: 'lt',
  lte: 'lte',
  ne: 'ne',
  notIn: 'notInArray',
  notLike: 'notLike',
  sql: 'sql',
}

export const generateQueryDrizzle = ({ table, filters }: QueryParams) => {
  const varName = camelCase(table)

  if (filters.length === 0) {
    return `await db.select().from(${varName})`
  }

  const conditions = filters.map((f) => {
    const fn = DRIZZLE_FUNCTIONS[f.ref.operator]
    const col = `${varName}.${camelCase(f.column)}`
    if (f.ref.hasValue === false) {
      return `${fn}(${col})`
    }
    const value = f.ref.isArray ? f.values : f.values[0]
    return `${fn}(${col}, ${JSON.stringify(value)})`
  })

  return [
    'await db.select()',
    `  .from(${varName})`,
    '  .where(and(',
    `    ${conditions.join(',\n    ')}`,
    '  ))',
  ].join('\n')
}

const buildColumnOptions = (c: TypedColumn, typeFunc: string) => {
  if (
    c.maxLength &&
    c.maxLength !== -1 &&
    ['varchar', 'char', 'nvarchar'].includes(typeFunc)
  ) {
    return `{ length: ${c.maxLength} }`
  }
  if (typeFunc === 'integer' && /bool/iu.test(c.type)) {
    return "{ mode: 'boolean' }"
  }
  if (['bigint', 'bigserial'].includes(typeFunc)) {
    return "{ mode: 'number' }"
  }
  if (typeFunc === 'timestamp' && /with time zone|timestamptz/iu.test(c.type)) {
    return '{ withTimezone: true }'
  }
  if (['decimal', 'numeric'].includes(typeFunc) && c.precision) {
    return `{ precision: ${c.precision}${c.scale ? `, scale: ${c.scale}` : ''} }`
  }
  return null
}

const buildGeneratedChain = (
  c: TypedColumn,
  dialect: Dialect,
  coreImports: Set<string>
): string => {
  if (c.isIdentity && dialect === Dialect.Postgres) {
    return '.generatedByDefaultAsIdentity()'
  }
  if (c.isIdentity && dialect === Dialect.MSSQL) {
    return '.identity()'
  }
  if (typeof c.defaultValue !== 'string' || isSerialDefault(c.defaultValue)) {
    return ''
  }
  if (dialect !== Dialect.SQLite && isNowDefault(c.defaultValue)) {
    return '.defaultNow()'
  }
  coreImports.add('sql')
  return `.default(sql\`${c.defaultValue}\`)`
}

const buildColumnChain = (
  c: TypedColumn,
  typeFunc: string,
  options: string | null,
  { columns, dialect }: Pick<SchemaParams, 'columns' | 'dialect'>,
  selfReferenceType: string | null,
  foreignKeyImports: Set<string>,
  coreImports: Set<string>
): string => {
  const name = camelCase(c.id) === c.id ? '' : toStringLiteral(c.id)
  let chain = `${typeFunc}(${[name, options].filter(Boolean).join(', ')})`

  if (c.isArray && dialect === Dialect.Postgres) {
    chain += '.array()'
  }
  chain += buildGeneratedChain(c, dialect, coreImports)
  if (!c.isNullable) {
    chain += '.notNull()'
  }
  if (isSingleColumnConstraint(c, columns, 'primaryKey')) {
    chain += '.primaryKey()'
  }
  if (isSingleColumnConstraint(c, columns, 'unique') && !c.primaryKey) {
    chain += '.unique()'
  }

  if (c.foreign) {
    const refTable = camelCase(c.foreign.table)
    const fkOptions = []
    if (c.foreign.onDelete) {
      fkOptions.push(`onDelete: '${c.foreign.onDelete.toLowerCase()}'`)
    }
    if (c.foreign.onUpdate) {
      fkOptions.push(`onUpdate: '${c.foreign.onUpdate.toLowerCase()}'`)
    }

    const optionStr = fkOptions.length ? `, { ${fkOptions.join(', ')} }` : ''
    const returnType = selfReferenceType ? `: ${selfReferenceType}` : ''
    chain += `.references(()${returnType} => ${refTable}.${camelCase(c.foreign.column)}${optionStr})`

    foreignKeyImports.add(`import { ${refTable} } from './${c.foreign.table}';`)
  }

  return chain
}

const tableColumn = (column: string) => {
  const key = camelCase(column)
  return isValidIdentifier(key) ? `t.${key}` : `t[${toStringLiteral(key)}]`
}

const buildRelationships = (
  columns: SchemaParams['columns'],
  varName: string
) => {
  const relationships: string[] = []
  const relationshipFkImports = new Set<string>()
  const usedNames = new Set<string>()

  for (const c of columns) {
    if (c.foreign) {
      const refTable = camelCase(c.foreign.table)
      const fieldName = camelCase(c.id.replace(FK_SUFFIX_RE, ''))
      usedNames.add(fieldName)
      relationships.push(
        `  ${fieldName}: one(${refTable}, {\n    fields: [${varName}.${camelCase(c.id)}],\n    references: [${refTable}.${camelCase(c.foreign.column)}],\n  }),`
      )
    }

    for (const ref of c.references ?? []) {
      const refTable = camelCase(ref.table)
      const fieldName = claimRelationName(usedNames, ref.table, ref.column)
      relationships.push(
        `  ${fieldName}: ${ref.isUnique ? 'one' : 'many'}(${refTable}),`
      )
      relationshipFkImports.add(`import { ${refTable} } from './${ref.table}';`)
    }
  }

  return { relationshipFkImports, relationships }
}

export const generateSchemaDrizzle = ({
  table,
  schema,
  defaultSchema,
  columns,
  dialect,
  indexes,
}: SchemaParams) => {
  if (!isDrizzleDialect(dialect)) {
    return ''
  }
  const { anyColumn, dialectImportPath, enumFunc, schemaFunc } =
    dialectConfig[dialect]
  let { tableFunc } = dialectConfig[dialect]

  const coreImports = new Set<string>()
  const dialectImports = new Set<string>()
  const foreignKeyImports = new Set<string>()
  const extras: string[] = []

  const varName = camelCase(table)

  const cols = columns
    .filter(hasType)
    .map((c) => {
      let typeFunc = drizzleType(c.type, dialect)
      if (dialect === Dialect.Postgres && isSerialDefault(c.defaultValue)) {
        typeFunc = SERIAL_BY_INT_TYPE[typeFunc] ?? 'serial'
      }

      let options: string | null = null
      if (enumFunc && c.enumName && c.availableValues?.length) {
        const values = `[${c.availableValues.map(toStringLiteral).join(', ')}]`
        dialectImports.add(enumFunc)
        if (dialect === Dialect.MySQL) {
          typeFunc = enumFunc
          options = values
        } else {
          typeFunc = `${camelCase(c.enumName)}Enum`
          extras.push(
            `export const ${typeFunc} = ${enumFunc}(${toStringLiteral(c.enumName)}, ${values});`
          )
        }
      } else {
        dialectImports.add(typeFunc)
        options = buildColumnOptions(c, typeFunc)
      }

      const isSelfReference = c.foreign?.table === table
      if (isSelfReference) {
        dialectImports.add(anyColumn)
      }

      const safeKey = toLiteralKey(camelCase(c.id))
      const chain = buildColumnChain(
        c,
        typeFunc,
        options,
        { columns, dialect },
        isSelfReference ? anyColumn : null,
        foreignKeyImports,
        coreImports
      )

      return `  ${safeKey}: ${chain},`
    })
    .join('\n')

  const { relationships, relationshipFkImports } = buildRelationships(
    columns,
    varName
  )

  const allFkImports = new Set([...foreignKeyImports, ...relationshipFkImports])
  allFkImports.delete(`import { ${varName} } from './${table}';`)

  if (relationships.length > 0) {
    coreImports.add('relations')
  }

  const config: string[] = []
  const primaryColumns = columns.filter((c) => c.primaryKey)
  if (primaryColumns.length > 1) {
    dialectImports.add('primaryKey')
    config.push(
      `  primaryKey({ columns: [${primaryColumns.map((c) => tableColumn(c.id)).join(', ')}] }),`
    )
  }
  for (const idx of explicitIndexes({ columns, indexes, schema, table })) {
    const func = idx.isUnique ? 'uniqueIndex' : 'index'
    dialectImports.add(func)
    const on = idx.keys.map((key) => {
      if ('column' in key) {
        return tableColumn(key.column)
      }
      coreImports.add('sql')
      return `sql\`${key.expression}\``
    })
    config.push(`  ${func}(${toStringLiteral(idx.name)}).on(${on.join(', ')}),`)
  }

  if (schema !== defaultSchema && schemaFunc) {
    const schemaVar = `${camelCase(schema)}Schema`
    dialectImports.add(schemaFunc)
    extras.unshift(
      `export const ${schemaVar} = ${schemaFunc}(${toStringLiteral(schema)});`
    )
    tableFunc = `${schemaVar}.table`
  } else {
    dialectImports.add(tableFunc)
  }

  const imports = [
    ...allFkImports,
    ...(coreImports.size > 0
      ? [`import { ${[...coreImports].join(', ')} } from 'drizzle-orm';`]
      : []),
    `import { ${[...dialectImports].join(', ')} } from '${dialectImportPath}';`,
  ]
  const tableConfig =
    config.length > 0 ? `, (t) => [\n${config.join('\n')}\n]` : ''
  const definitions = [
    [...new Set(extras)].join('\n\n'),
    `export const ${varName} = ${tableFunc}(${toStringLiteral(table)}, {\n${cols}\n}${tableConfig});`,
    relationships.length > 0
      ? `export const ${varName}Relations = relations(${varName}, ({ one, many }) => ({\n${relationships.join('\n')}\n}));`
      : '',
  ]

  return `${imports.join('\n')}\n\n${definitions.filter(Boolean).join('\n\n')}`
}
