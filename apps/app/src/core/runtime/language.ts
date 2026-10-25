import * as mongo from '@tamery/mongo/effects'
import { splitStatements as splitMongoStatements } from '@tamery/mongo/statements'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import {
  dialectLanguage,
  isSqlDialect,
  QueryLanguage as QueryLang,
} from '@tamery/shared/enums/connection-type'
import type { DialectSpec, Statement } from '@tamery/sql'
import {
  destructiveKeywords,
  dialects,
  endsTransaction,
  invalidatesCatalog,
  leavesTransactionOpen,
  readsOnly,
  splitStatements,
  unwrapTransaction,
  writesData,
} from '@tamery/sql'

export interface QueryLanguage {
  destructive: (text: string) => string[]
  endsTransaction: (text: string) => boolean
  highlight: 'javascript' | 'sql'
  invalidatesCatalog: (text: string) => boolean
  leavesTransactionOpen: (text: string) => boolean
  name: 'mongosh' | 'SQL'
  readsOnly: (text: string) => boolean
  split: (
    text: string,
    options?: { groupTransactions?: boolean }
  ) => Statement[]
  transactions: boolean
  unwrapTransaction: (text: string) => ReturnType<typeof unwrapTransaction>
  writesData: (text: string) => boolean
}

const sql = (spec: DialectSpec): QueryLanguage => ({
  destructive: (text) => destructiveKeywords(text, spec),
  endsTransaction: (text) => endsTransaction(text, spec),
  highlight: 'sql',
  invalidatesCatalog: (text) => invalidatesCatalog(text, spec),
  leavesTransactionOpen: (text) => leavesTransactionOpen(text, spec),
  name: 'SQL',
  readsOnly: (text) => readsOnly(text, spec),
  split: (text, options) => splitStatements(text, spec, options),
  transactions: spec.transactions,
  unwrapTransaction: (text) => unwrapTransaction(text, spec),
  writesData: (text) => writesData(text, spec),
})

const mongosh: QueryLanguage = {
  destructive: mongo.destructiveMethods,
  endsTransaction: () => false,
  highlight: 'javascript',
  invalidatesCatalog: mongo.invalidatesCatalog,
  leavesTransactionOpen: () => false,
  name: 'mongosh',
  readsOnly: mongo.readsOnly,
  split: (text) =>
    splitMongoStatements(text).map((statement) => ({
      ...statement,
      tokens: [],
    })),
  transactions: false,
  unwrapTransaction: () => null,
  writesData: mongo.writesData,
}

export const getQueryLanguage = (dialect: Dialect): QueryLanguage => {
  if (isSqlDialect(dialect)) {
    return sql(dialects[dialect])
  }
  const language = dialectLanguage[dialect]
  switch (language) {
    case QueryLang.Mongosh: {
      return mongosh
    }
    default: {
      return language satisfies never
    }
  }
}
