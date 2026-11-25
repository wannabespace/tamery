import { describe, expect, it } from 'bun:test'

import { Dialect } from '@tamery/shared/enums/connection-type'

import { dialects } from './dialects'
import {
  endsTransaction,
  leavesTransactionOpen,
  splitStatements,
  statementAt,
  unwrapTransaction,
} from './statements'

const pg = dialects[Dialect.Postgres]
const mssql = dialects[Dialect.MSSQL]
const mysql = dialects[Dialect.MySQL]
const clickhouse = dialects[Dialect.ClickHouse]
const sqlite = dialects[Dialect.SQLite]
const oracle = dialects[Dialect.Oracle]
const texts = (sql: string, dialect = pg) =>
  splitStatements(sql, dialect).map((statement) => statement.text)

describe('splitStatements', () => {
  it('splits on semicolons and drops comments between statements', () => {
    expect(texts('SELECT 1; SELECT 2')).toEqual(['SELECT 1', 'SELECT 2'])
    expect(
      texts(`-- lead
SELECT *
FROM users; /* mid */
SELECT 2; -- trail`)
    ).toEqual(['SELECT *\nFROM users', 'SELECT 2'])
    expect(texts('-- only\n/* comments */')).toEqual([])
  })

  it('keeps semicolons inside strings, dollar bodies and BEGIN…END blocks', () => {
    expect(texts("SELECT 'a;b'; SELECT 2")).toEqual([
      "SELECT 'a;b'",
      'SELECT 2',
    ])
    const fn = `CREATE FUNCTION f() RETURNS int AS $$
BEGIN
  RETURN 1;
END;
$$ LANGUAGE plpgsql`
    expect(texts(`${fn};\nSELECT f()`)).toEqual([fn, 'SELECT f()'])
    const block = `CREATE PROCEDURE p AS
BEGIN
  SELECT CASE WHEN 1 = 1 THEN 'a' ELSE 'b' END;
  IF 1 = 1 BEGIN SELECT 1; END
END`
    expect(texts(`${block};\nSELECT 2`, mssql)).toEqual([block, 'SELECT 2'])
    const trigger = `CREATE TRIGGER t AFTER INSERT ON a FOR EACH ROW WHEN new.b > 1
BEGIN
  INSERT INTO log VALUES (new.id);
  UPDATE a SET c = CASE WHEN c IS NULL THEN 0 ELSE c END;
END`
    expect(texts(`${trigger};\nSELECT 2`, sqlite)).toEqual([
      trigger,
      'SELECT 2',
    ])
  })

  it('groups a transaction into one statement', () => {
    const tx = `BEGIN;
UPDATE users SET a = 1;
COMMIT`
    expect(texts(`${tx};\nSELECT 1`)).toEqual([tx, 'SELECT 1'])
    expect(texts('START TRANSACTION; DELETE FROM t; ROLLBACK;')).toEqual([
      'START TRANSACTION; DELETE FROM t; ROLLBACK',
    ])
  })

  it('takes a transaction group apart for the driver', () => {
    expect(
      unwrapTransaction(
        'BEGIN;\nUPDATE a SET x = 1;\nDELETE FROM b;\nCOMMIT',
        pg
      )
    ).toMatchObject({
      commit: true,
      statements: ['UPDATE a SET x = 1', 'DELETE FROM b'],
    })
    expect(
      unwrapTransaction('START TRANSACTION; DELETE FROM t; ROLLBACK', pg)
    ).toMatchObject({ commit: false, statements: ['DELETE FROM t'] })
    expect(unwrapTransaction('SELECT 1', pg)).toBeNull()
    expect(unwrapTransaction('BEGIN; SELECT 1', pg)).toBeNull()
  })

  it('keeps the isolation level and access mode the opener asks for', () => {
    expect(
      unwrapTransaction(
        'BEGIN ISOLATION LEVEL READ COMMITTED, READ ONLY; SELECT 1; COMMIT',
        pg
      )
    ).toMatchObject({
      accessMode: 'read only',
      isolationLevel: 'read committed',
    })
    expect(
      unwrapTransaction('START TRANSACTION READ WRITE; SELECT 1; COMMIT', mysql)
    ).toMatchObject({ accessMode: 'read write', isolationLevel: undefined })
  })

  it('reads an unreserved begin as a column, not a block', () => {
    expect(texts('SELECT begin, end FROM t; SELECT 2', mysql)).toEqual([
      'SELECT begin, end FROM t',
      'SELECT 2',
    ])
    for (const statement of [
      'SELECT e.begin, e.end FROM events e',
      'SELECT * FROM events WHERE begin > now()',
      'UPDATE events SET begin = 1',
      'SELECT * FROM events ORDER BY begin DESC',
      'SELECT 1 AS begin, 2 AS c',
    ]) {
      expect(texts(`${statement}; UPDATE t SET x = 2`, sqlite)).toEqual([
        statement,
        'UPDATE t SET x = 2',
      ])
    }
    const procedure =
      'CREATE PROCEDURE p() BEGIN SELECT e.end FROM events e; END'
    expect(texts(`${procedure}; SELECT 2`, mysql)).toEqual([
      procedure,
      'SELECT 2',
    ])
  })

  it('keeps a rollback to a savepoint inside its transaction', () => {
    const tx =
      'BEGIN; UPDATE a SET x=1; SAVEPOINT s; UPDATE b SET y=1; ROLLBACK TO SAVEPOINT s; UPDATE c SET z=1; COMMIT'
    expect(texts(`${tx};`)).toEqual([tx])
    expect(unwrapTransaction(`${tx};`, pg)).toMatchObject({
      commit: true,
      statements: [
        'UPDATE a SET x=1',
        'SAVEPOINT s',
        'UPDATE b SET y=1',
        'ROLLBACK TO SAVEPOINT s',
        'UPDATE c SET z=1',
      ],
    })
  })

  it('opens a transaction with every BEGIN form, not a block', () => {
    for (const opener of [
      'BEGIN WORK',
      'begin transaction',
      'BEGIN ISOLATION LEVEL SERIALIZABLE',
      'BEGIN READ ONLY',
      'BEGIN NOT DEFERRABLE',
    ]) {
      const tx = `${opener}; DELETE FROM t; COMMIT WORK`
      expect(texts(`${tx};\nSELECT 1`)).toEqual([tx, 'SELECT 1'])
    }
    const distributed = 'BEGIN DISTRIBUTED TRAN; DELETE FROM t; ROLLBACK WORK'
    expect(texts(`${distributed};\nSELECT 1`, mssql)).toEqual([
      distributed,
      'SELECT 1',
    ])
    for (const mode of ['DEFERRED', 'IMMEDIATE', 'EXCLUSIVE TRANSACTION']) {
      const tx = `BEGIN ${mode}; DELETE FROM t; COMMIT`
      expect(texts(`${tx};\nSELECT 1`, sqlite)).toEqual([tx, 'SELECT 1'])
      expect(unwrapTransaction(tx, sqlite)?.statements).toEqual([
        'DELETE FROM t',
      ])
    }
    const atomic = 'BEGIN NOT ATOMIC SELECT 1; SELECT 2; END'
    expect(texts(`${atomic};\nSELECT 3`, mysql)).toEqual([atomic, 'SELECT 3'])
  })

  it('closes a Postgres transaction with END or ABORT, not a block END', () => {
    expect(texts('BEGIN; DELETE FROM t; END;\nSELECT 1')).toEqual([
      'BEGIN; DELETE FROM t; END',
      'SELECT 1',
    ])
    expect(texts('BEGIN; DELETE FROM t; ABORT;\nSELECT 1')).toEqual([
      'BEGIN; DELETE FROM t; ABORT',
      'SELECT 1',
    ])
    expect(
      unwrapTransaction('BEGIN; DELETE FROM t; END TRANSACTION', pg)
    ).toMatchObject({ commit: true, statements: ['DELETE FROM t'] })
    expect(unwrapTransaction('BEGIN; DELETE FROM t; ABORT', pg)).toMatchObject({
      commit: false,
      statements: ['DELETE FROM t'],
    })
    const tx = 'BEGIN TRAN; IF 1 = 1 BEGIN ROLLBACK; END; COMMIT'
    expect(texts(`${tx};\nSELECT 1`, mssql)).toEqual([tx, 'SELECT 1'])
  })

  it('runs an unclosed transaction statement by statement', () => {
    expect(texts('BEGIN; SELECT 1; SELECT 2')).toEqual([
      'BEGIN',
      'SELECT 1',
      'SELECT 2',
    ])
    expect(texts('BEGIN; SELECT 1; COMMIT')).toEqual([
      'BEGIN; SELECT 1; COMMIT',
    ])
  })

  it('never groups on a dialect without transactions', () => {
    const tx = 'BEGIN TRANSACTION; SELECT 1; COMMIT'
    expect(texts(tx, clickhouse)).toEqual([
      'BEGIN TRANSACTION',
      'SELECT 1',
      'COMMIT',
    ])
    expect(unwrapTransaction(tx, clickhouse)).toBeNull()
  })

  it('tells a transaction left open from a block or a closed batch', () => {
    expect(leavesTransactionOpen('-- lead\nBEGIN', pg)).toBe(true)
    expect(
      leavesTransactionOpen('begin isolation level serializable', pg)
    ).toBe(true)
    expect(leavesTransactionOpen('START TRANSACTION; SELECT 1', mysql)).toBe(
      true
    )
    expect(leavesTransactionOpen('BEGIN TRAN', mssql)).toBe(true)
    expect(leavesTransactionOpen('BEGIN SELECT 1; END', mssql)).toBe(false)
    expect(leavesTransactionOpen('SELECT 1; BEGIN', pg)).toBe(false)
    expect(
      leavesTransactionOpen('BEGIN TRAN\nUPDATE t SET a = 1\nCOMMIT', mssql)
    ).toBe(false)
  })

  it('tells a statement ending the transaction from a savepoint rollback', () => {
    expect(endsTransaction('-- done\ncommit work', pg)).toBe(true)
    expect(endsTransaction('ROLLBACK', mysql)).toBe(true)
    expect(endsTransaction('END', pg)).toBe(true)
    expect(endsTransaction('ROLLBACK TO SAVEPOINT s1', pg)).toBe(false)
    expect(endsTransaction('CREATE TABLE t (id int)', mysql)).toBe(false)
  })

  it('splits SQL Server batches on GO', () => {
    expect(texts('SELECT 1\nGO\nSELECT 2', mssql)).toEqual([
      'SELECT 1',
      'SELECT 2',
    ])
    expect(texts('SELECT 1\nGO 2\nSELECT 2', mssql)).toEqual([
      'SELECT 1',
      'SELECT 2',
    ])
  })

  it('runs an Oracle PL/SQL unit to its slash line', () => {
    const procedure = `CREATE OR REPLACE PROCEDURE p AS
  total NUMBER;
BEGIN
  CASE WHEN total > 0 THEN total := 1; END CASE;
END;`
    expect(texts(`${procedure}\n/\nSELECT 1 FROM dual;`, oracle)).toEqual([
      procedure,
      'SELECT 1 FROM dual',
    ])
    expect(texts('DECLARE n NUMBER; BEGIN n := 1; END;', oracle)).toEqual([
      'DECLARE n NUMBER; BEGIN n := 1; END;',
    ])
    expect(
      texts('SELECT 4 / 2 FROM dual\n/\nSELECT 2 FROM dual', oracle)
    ).toEqual(['SELECT 4 / 2 FROM dual', 'SELECT 2 FROM dual'])
  })

  it('closes a MySQL CASE statement at END CASE', () => {
    const procedure =
      'CREATE PROCEDURE p() BEGIN CASE x WHEN 1 THEN SELECT 1; END CASE; END'
    expect(texts(`${procedure}; SELECT 2`, mysql)).toEqual([
      procedure,
      'SELECT 2',
    ])
  })

  it('closes MySQL loops at END LOOP, END WHILE and END REPEAT', () => {
    for (const loop of [
      'l: LOOP LEAVE l; END LOOP',
      'WHILE i < 3 DO SET i = i + 1; END WHILE',
      'REPEAT SET i = i + 1; UNTIL i > 3 END REPEAT',
    ]) {
      const procedure = `CREATE PROCEDURE p() BEGIN ${loop}; END`
      expect(texts(`${procedure}; SELECT 2`, mysql)).toEqual([
        procedure,
        'SELECT 2',
      ])
    }
  })

  it('ends a SQL Server block before the next statement IF', () => {
    const batch = 'IF 1 = 1 BEGIN SELECT 1 END IF 2 = 2 BEGIN SELECT 2 END'
    expect(texts(`${batch}; SELECT 3`, mssql)).toEqual([batch, 'SELECT 3'])
  })

  it('keeps semicolons inside Oracle q-quoted strings', () => {
    for (const literal of ["q'[it's; fine]'", "Q'{a; b}'", "nq'!x; y!'"]) {
      expect(
        texts(`SELECT ${literal} FROM dual; SELECT 2 FROM dual`, oracle)
      ).toEqual([`SELECT ${literal} FROM dual`, 'SELECT 2 FROM dual'])
    }
    expect(texts("SELECT q'[a]' FROM t; SELECT 2", pg)).toEqual([
      "SELECT q'[a]' FROM t",
      'SELECT 2',
    ])
  })

  it('finds the statement at an offset', () => {
    const text = 'SELECT 1;\n\nSELECT 2;'
    const statements = splitStatements(text, pg)
    expect(statementAt(statements, 3, text)?.text).toBe('SELECT 1')
    expect(statementAt(statements, 9, text)?.text).toBe('SELECT 1')
    expect(statementAt(statements, 10, text)).toBeUndefined()
    expect(statementAt(statements, 11, text)?.text).toBe('SELECT 2')
    const line = 'SELECT 5; SELECT 6;'
    const onLine = splitStatements(line, pg)
    expect(statementAt(onLine, 9, line)?.text).toBe('SELECT 5')
    expect(statementAt(onLine, 12, line)?.text).toBe('SELECT 6')
    expect(statementAt(onLine, line.length, line)?.text).toBe('SELECT 6')
    const split = 'SELECT 1\n;\n\nSELECT 2;'
    expect(statementAt(splitStatements(split, pg), 10, split)?.text).toBe(
      'SELECT 1'
    )
  })
})
