import { describe, expect, test } from 'bun:test'

import { coldDialect } from '@tamery/connection/queries/kysely'
import type { SqlDialect } from '@tamery/shared/enums/connection-type'
import { Dialect } from '@tamery/shared/enums/connection-type'
import type { RawBuilder } from 'kysely'

import type { ConstraintShape } from './constraints/shape'
import {
  addConstraint,
  getClickhouseConstraints,
  constraintClause,
} from './constraints/shape'
import { createFunctionStatements } from './functions/shape'
import {
  addSkipIndexStatement,
  createIndexStatement,
  getSkipIndexColumns,
  oracleCreateIndexStatement,
} from './indexes/shape'
import {
  clickhouseRoleList,
  createPolicyStatement,
  policyPredicate,
} from './policies/shape'
import { getAccount, grantCoversSchema, privilegeOn } from './privileges/shape'
import { mssqlModuleBody, mssqlModuleParts } from './shared/definition'
import {
  createTriggerStatements,
  setTriggerEnabledStatements,
} from './triggers/shape'

const compiled = (
  statement: RawBuilder<unknown>,
  dialect: SqlDialect = Dialect.Postgres
) => statement.compile(coldDialect(dialect)).sql.replaceAll(/\s+/gu, ' ').trim()

const routine = (
  overrides: Partial<Parameters<typeof createFunctionStatements>[0]['shape']>
) =>
  createFunctionStatements({
    replace: true,
    schema: 'app',
    shape: {
      args: '',
      behavior: '',
      body: 'BEGIN END',
      extras: '',
      kind: 'function',
      language: 'plpgsql',
      name: 'f',
      returnType: 'integer',
      schemaBound: false,
      securityDefiner: false,
      ...overrides,
    },
  })

const trigger = (
  overrides: Partial<Parameters<typeof createTriggerStatements>[0]['shape']>
) =>
  createTriggerStatements({
    schema: 'app',
    shape: {
      body: 'BEGIN END',
      events: ['INSERT'],
      functionName: 'audit',
      functionSchema: 'app',
      name: 't',
      orientation: 'ROW',
      timing: 'AFTER',
      ...overrides,
    },
    table: 'users',
  })

describe('routine statements', () => {
  test('SQL Server takes procedure parameters without parentheses', () => {
    expect(
      compiled(routine({ kind: 'procedure' }).mssql, Dialect.MSSQL)
    ).not.toInclude('(')
    expect(
      compiled(
        routine({ args: '@id int', kind: 'procedure' }).mssql,
        Dialect.MSSQL
      )
    ).toInclude('"app"."f" @id int AS')
  })

  test('SQL Server functions keep their parentheses and return type', () => {
    expect(compiled(routine({ args: 'id int' }).mssql, Dialect.MSSQL)).toBe(
      'CREATE OR ALTER FUNCTION "app"."f" (id int) RETURNS integer AS BEGIN END'
    )
  })

  test('SQL Server binds a function to its schema before AS', () => {
    expect(
      compiled(
        routine({
          body: 'RETURN (SELECT 1 AS ok)',
          returnType: 'TABLE',
          schemaBound: true,
        }).mssql,
        Dialect.MSSQL
      )
    ).toBe(
      'CREATE OR ALTER FUNCTION "app"."f" () RETURNS TABLE WITH SCHEMABINDING AS RETURN (SELECT 1 AS ok)'
    )
  })

  test('Postgres replaces in place and quotes a body around its own tag', () => {
    expect(compiled(routine({ body: 'SELECT $tamery$' }).postgres)).toBe(
      'CREATE OR REPLACE FUNCTION "app"."f"() RETURNS integer LANGUAGE plpgsql AS $tamery1$SELECT $tamery$$tamery1$'
    )
  })

  test('a procedure returns nothing', () => {
    expect(compiled(routine({ kind: 'procedure' }).postgres)).not.toInclude(
      'RETURNS'
    )
  })
})

describe('trigger statements', () => {
  test('MySQL keeps the definer, splitting at the last @', () => {
    expect(
      compiled(
        createTriggerStatements({
          definer: 'ops@team@%',
          schema: 'app',
          shape: {
            body: 'SET NEW.a = 1',
            events: ['INSERT'],
            functionName: '',
            functionSchema: '',
            name: 't',
            orientation: 'ROW',
            timing: 'BEFORE',
          },
          table: 'users',
        }).mysql,
        Dialect.MySQL
      )
    ).toStartWith("CREATE DEFINER = 'ops@team'@'%' TRIGGER")
  })

  test('Postgres calls the function in the schema it lives in', () => {
    expect(
      compiled(
        trigger({ events: ['INSERT', 'UPDATE'], functionSchema: 'util' })
          .postgres
      )
    ).toBe(
      'CREATE TRIGGER "t" AFTER INSERT OR UPDATE ON "app"."users" FOR EACH ROW EXECUTE FUNCTION "util"."audit"()'
    )
  })

  test('MySQL runs the body for each row', () => {
    expect(compiled(trigger({}).mysql, Dialect.MySQL)).toBe(
      'CREATE TRIGGER `app`.`t` AFTER INSERT ON `app`.`users` FOR EACH ROW BEGIN END'
    )
  })

  test('SQL Server names the table before the timing', () => {
    expect(
      compiled(trigger({ timing: 'INSTEAD OF' }).mssql, Dialect.MSSQL)
    ).toBe(
      'CREATE TRIGGER "app"."t" ON "app"."users" INSTEAD OF INSERT AS BEGIN END'
    )
  })

  test('a replica trigger comes back as a replica trigger', () => {
    const target = { name: 't', schema: 'app', table: 'users' }

    expect(
      compiled(
        setTriggerEnabledStatements({ ...target, enabled: true, mode: 'R' })
          .postgres
      )
    ).toInclude('ENABLE REPLICA TRIGGER')
    expect(
      compiled(
        setTriggerEnabledStatements({ ...target, enabled: false, mode: 'A' })
          .postgres
      )
    ).toInclude('DISABLE TRIGGER')
  })
})

describe('a foreign key names its columns in order', () => {
  const shape: ConstraintShape = {
    columns: ['a', 'b'],
    expression: '',
    foreignColumns: ['x', 'y'],
    foreignSchema: 'ref',
    foreignTable: 'other',
    kind: 'foreignKey',
    name: 'fk',
    onDelete: 'CASCADE',
    onUpdate: 'NO ACTION',
  }

  test.each([
    ['CASCADE', ' on delete cascade'],
    ['NO ACTION', ''],
  ] as const)(
    'through the builder, ON DELETE %s leaves NO ACTION unspelled',
    (onDelete, clause) => {
      expect(
        addConstraint(
          coldDialect(Dialect.Postgres),
          { schema: 's', table: 't' },
          { ...shape, onDelete }
        ).compile().sql
      ).toBe(
        `alter table "s"."t" add constraint "fk" foreign key ("a", "b") references "ref"."other" ("x", "y")${clause}`
      )
    }
  )

  test('as the MySQL clause', () => {
    expect(compiled(constraintClause({ ...shape, onUpdate: 'SET NULL' }))).toBe(
      'CONSTRAINT "fk" FOREIGN KEY ("a", "b") REFERENCES "ref"."other" ("x", "y") ON DELETE CASCADE ON UPDATE SET NULL'
    )
  })
})

describe('a check wraps its condition', () => {
  const shape: ConstraintShape = {
    columns: [],
    expression: 'price > 0',
    foreignColumns: [],
    foreignSchema: '',
    foreignTable: '',
    kind: 'check',
    name: 'ck',
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  }

  test('through the builder', () => {
    expect(
      addConstraint(
        coldDialect(Dialect.Postgres),
        { schema: 's', table: 't' },
        shape
      ).compile().sql
    ).toBe('alter table "s"."t" add constraint "ck" check (price > 0)')
  })

  test('as the MySQL clause', () => {
    expect(compiled(constraintClause(shape))).toBe(
      'CONSTRAINT "ck" CHECK (price > 0)'
    )
  })
})

test('a unique index covers its columns in order', () => {
  expect(
    compiled(
      createIndexStatement({
        columns: ['a', 'b'],
        name: 'i',
        schema: 's',
        table: 't',
        unique: true,
      })
    )
  ).toBe('CREATE UNIQUE INDEX "i" ON "s"."t" ("a", "b")')
})

test("an Oracle index lands in its table's schema", () => {
  expect(
    compiled(
      oracleCreateIndexStatement({
        columns: ['a'],
        name: 'i',
        schema: 's',
        table: 't',
      })
    )
  ).toBe('CREATE INDEX "s"."i" ON "s"."t" ("a")')
})

const policy = (roles: string[], using: string | null) =>
  compiled(
    createPolicyStatement({
      schema: 's',
      shape: {
        check: null,
        command: 'SELECT',
        kind: 'PERMISSIVE',
        name: 'p',
        predicates: [],
        roles,
        using,
      },
      table: 't',
    })
  )

describe('policy statements', () => {
  test('no role means PUBLIC', () => {
    expect(policy([], null)).toBe(
      'CREATE POLICY "p" ON "s"."t" AS PERMISSIVE FOR SELECT TO PUBLIC'
    )
  })

  test('roles are identifiers, keywords are not', () => {
    expect(policy(['reader', 'CURRENT_USER'], null)).toInclude(
      'TO "reader", CURRENT_USER'
    )
  })

  test('an expression is sent as written', () => {
    expect(policy([], "id = current_setting('x')::int")).toInclude(
      "USING (id = current_setting('x')::int)"
    )
  })
})

describe('security predicates', () => {
  const predicate = {
    arguments: 'TenantId',
    functionName: 'fn_tenant',
    functionSchema: 'Security',
    kind: 'BLOCK' as const,
    operation: 'AFTER INSERT' as const,
    schema: 'dbo',
    table: 'Orders',
  }

  test('a block operation follows the table', () => {
    expect(compiled(policyPredicate.add(predicate), Dialect.MSSQL)).toBe(
      'ADD BLOCK PREDICATE "Security"."fn_tenant"(TenantId) ON "dbo"."Orders" AFTER INSERT'
    )
    expect(compiled(policyPredicate.drop(predicate), Dialect.MSSQL)).toBe(
      'DROP BLOCK PREDICATE ON "dbo"."Orders" AFTER INSERT'
    )
  })

  test('parses the definition SQL Server stores', () => {
    expect(
      policyPredicate.parse('([Sec]]urity].[fn.tenant]([TenantId], 1))')
    ).toEqual({
      arguments: '[TenantId], 1',
      functionName: 'fn.tenant',
      functionSchema: 'Sec]urity',
    })
    expect(policyPredicate.parse('[dbo].[fn]([TenantId])')).toEqual({
      arguments: '[TenantId]',
      functionName: 'fn',
      functionSchema: 'dbo',
    })
    expect(policyPredicate.parse('(Security.fn_tenant(TenantId))')).toEqual({
      arguments: 'TenantId',
      functionName: 'fn_tenant',
      functionSchema: 'Security',
    })
    expect(policyPredicate.parse('(1 = 1)')).toBeNull()
  })
})

describe('mssqlModuleBody', () => {
  test('a body starts after the AS that closes the header', () => {
    expect(mssqlModuleBody('CREATE PROCEDURE dbo.p @a int AS SELECT 1')).toBe(
      'SELECT 1'
    )
  })

  test('EXECUTE AS is not the header end', () => {
    expect(
      mssqlModuleBody(
        'CREATE PROCEDURE dbo.p WITH EXECUTE AS OWNER AS BEGIN SELECT 1 END'
      )
    ).toBe('BEGIN SELECT 1 END')
  })

  test('a parameter declared with AS is not the header end', () => {
    expect(
      mssqlModuleBody(
        'CREATE FUNCTION dbo.f (@a AS int) RETURNS int AS BEGIN RETURN @a END'
      )
    ).toBe('BEGIN RETURN @a END')
  })

  test('a lowercase as closes the header too', () => {
    expect(
      mssqlModuleBody('create trigger t on dbo.x after insert\nas\nselect 1')
    ).toBe('select 1')
  })

  test('a header that never closes reads back as nothing', () => {
    expect(mssqlModuleBody('CREATE PROCEDURE dbo.p')).toBeNull()
    expect(mssqlModuleBody(null)).toBeNull()
  })

  test('the header keeps a parameter default and a WITH option', () => {
    expect(
      mssqlModuleParts(
        'CREATE FUNCTION dbo.f (@a int = 5) RETURNS int WITH SCHEMABINDING AS BEGIN RETURN @a END'
      )?.header
    ).toBe(
      'CREATE FUNCTION dbo.f (@a int = 5) RETURNS int WITH SCHEMABINDING AS '
    )
  })

  test('a plain header carries neither', () => {
    expect(
      mssqlModuleParts('CREATE PROCEDURE dbo.p @a int AS SELECT 1')?.header
    ).toBe('CREATE PROCEDURE dbo.p @a int AS ')
  })
})

describe('ClickHouse', () => {
  test('reads constraints out of the table DDL', () => {
    expect(
      getClickhouseConstraints(
        "CREATE TABLE db.t (`id` UInt64, `note` String DEFAULT 'a, b', CONSTRAINT positive CHECK id > 0, CONSTRAINT `odd name` ASSUME length(note) < (10)) ENGINE = MergeTree ORDER BY id"
      )
    ).toEqual([
      { assume: false, expression: 'id > 0', name: 'positive' },
      { assume: true, expression: 'length(note) < (10)', name: 'odd name' },
    ])
  })

  test('adds a skip index over a tuple of columns', () => {
    expect(
      compiled(
        addSkipIndexStatement({
          columns: ['a', 'b'],
          granularity: 4,
          name: 'i',
          schema: 's',
          skipType: 'minmax',
          table: 't',
        }),
        Dialect.ClickHouse
      )
    ).toBe(
      'ALTER TABLE `s`.`t` ADD INDEX `i` (`a`, `b`) TYPE minmax GRANULARITY 4'
    )
  })

  test('reads skip index columns back, or none for an expression', () => {
    expect(getSkipIndexColumns('tuple(a, `b c`)')).toEqual(['a', 'b c'])
    expect(getSkipIndexColumns('lower(a)')).toBeNull()
  })

  test('round-trips a row policy audience', () => {
    expect(
      compiled(clickhouseRoleList(['ALL', 'EXCEPT bob']), Dialect.ClickHouse)
    ).toBe('ALL EXCEPT `bob`')
    expect(compiled(clickhouseRoleList([]), Dialect.ClickHouse)).toBe('ALL')
  })
})

describe('a MySQL privilege', () => {
  test('reads the account the way the catalog and a user write it', () => {
    expect(compiled(getAccount("'bob'@'%'"), Dialect.MySQL)).toBe("'bob'@'%'")
    expect(compiled(getAccount('bob@localhost'), Dialect.MySQL)).toBe(
      "'bob'@'localhost'"
    )
    expect(compiled(getAccount('bob'), Dialect.MySQL)).toBe("'bob'@'%'")
  })

  test('covers a database or one table', () => {
    const target = { grantee: 'bob', privilege: 'SELECT', schema: 'app' }

    expect(
      compiled(privilegeOn({ ...target, table: '*' }), Dialect.MySQL)
    ).toBe('SELECT ON `app`.*')
    expect(
      compiled(privilegeOn({ ...target, table: 't' }), Dialect.MySQL)
    ).toBe('SELECT ON `app`.`t`')
  })

  test('on a whole database matches it as a LIKE pattern', () => {
    expect(grantCoversSchema(String.raw`qa\_tx`, 'qa_tx')).toBe(true)
    expect(grantCoversSchema(String.raw`qa\_tx`, 'qaXtx')).toBe(false)
    expect(grantCoversSchema('qa_tx', 'qaXtx')).toBe(true)
    expect(grantCoversSchema('app%', 'app_staging')).toBe(true)
    expect(grantCoversSchema('app%', 'my_app')).toBe(false)
    expect(grantCoversSchema('a.b', 'aXb')).toBe(false)
  })
})
