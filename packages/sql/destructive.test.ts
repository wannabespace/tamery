import { describe, expect, it } from 'bun:test'

import { Dialect } from '@tamery/shared/enums/connection-type'

import {
  destructiveKeywords,
  invalidatesCatalog,
  readsOnly,
  writesData,
} from './destructive'
import { dialects } from './dialects'

const mysql = dialects[Dialect.MySQL]
const pg = dialects[Dialect.Postgres]
const clickhouse = dialects[Dialect.ClickHouse]

describe('destructiveKeywords', () => {
  it('flags statements that change or remove existing data', () => {
    expect(destructiveKeywords('REPLACE INTO t VALUES (1)', mysql)).toEqual([
      'REPLACE',
    ])
    expect(
      destructiveKeywords(
        'MERGE INTO t USING s ON t.id = s.id',
        dialects[Dialect.MSSQL]
      )
    ).toEqual(['MERGE'])
    expect(
      destructiveKeywords('update t set a = 1; delete from t', mysql)
    ).toEqual(['UPDATE', 'DELETE'])
  })

  it('flags code it cannot see into', () => {
    expect(
      destructiveKeywords('DO $$ BEGIN DROP TABLE users; END $$', pg)
    ).toEqual(['DO'])
    expect(
      destructiveKeywords("EXEC('DROP TABLE users')", dialects[Dialect.MSSQL])
    ).toEqual(['EXEC'])
    expect(
      destructiveKeywords('INSERT INTO t VALUES (1) ON CONFLICT DO NOTHING', pg)
    ).toEqual([])
  })

  it('ignores reads, additive writes, strings, comments and the REPLACE function', () => {
    expect(
      destructiveKeywords(
        "SELECT REPLACE(name, 'a', 'b') FROM t WHERE x = 'DROP'; -- DELETE\nINSERT INTO t VALUES (1)",
        mysql
      )
    ).toEqual([])
  })

  it('ignores row locks, referential actions, trigger events, privileges and a plain EXPLAIN', () => {
    expect(
      destructiveKeywords(
        'SELECT * FROM t FOR UPDATE; SELECT * FROM t FOR NO KEY UPDATE',
        pg
      )
    ).toEqual([])
    expect(
      destructiveKeywords(
        'CREATE TABLE c (p int REFERENCES p ON DELETE CASCADE ON UPDATE SET NULL)',
        pg
      )
    ).toEqual([])
    expect(
      destructiveKeywords(
        'GRANT SELECT, UPDATE, DELETE ON t TO u; REVOKE DELETE ON t FROM u',
        pg
      )
    ).toEqual([])
    expect(
      destructiveKeywords(
        'SET NOCOUNT ON DELETE FROM users',
        dialects[Dialect.MSSQL]
      )
    ).toEqual(['DELETE'])
    expect(
      destructiveKeywords(
        'CREATE TABLE t (ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)',
        mysql
      )
    ).toEqual([])
    expect(
      destructiveKeywords(
        'CREATE RULE r AS ON UPDATE TO t DO INSTEAD NOTHING',
        pg
      )
    ).toEqual([])
    expect(
      destructiveKeywords(
        'CREATE TRIGGER g AFTER INSERT OR UPDATE OR DELETE ON t FOR EACH ROW EXECUTE FUNCTION f()',
        pg
      )
    ).toEqual([])
    expect(
      destructiveKeywords(
        'CREATE OR REPLACE TRIGGER g INSTEAD OF DELETE ON v FOR EACH ROW BEGIN NULL; END;',
        dialects[Dialect.Oracle]
      )
    ).toEqual([])
    expect(
      destructiveKeywords(
        'CREATE TRIGGER g BEFORE INSERT ON t FOR EACH ROW UPDATE c SET n = n + 1',
        mysql
      )
    ).toEqual(['UPDATE'])
    expect(destructiveKeywords('EXPLAIN DELETE FROM t', pg)).toEqual([])
    expect(destructiveKeywords('EXPLAIN ANALYZE DELETE FROM t', pg)).toEqual([
      'DELETE',
    ])
    expect(destructiveKeywords('EXPLAIN ANALYSE DELETE FROM t', pg)).toEqual([
      'DELETE',
    ])
    expect(
      destructiveKeywords('EXPLAIN ("analyze") DELETE FROM t', pg)
    ).toEqual(['DELETE'])
    expect(writesData('EXPLAIN ("analyze") DELETE FROM t', pg)).toBe(true)
  })

  it('flags upserts that overwrite rows', () => {
    expect(
      destructiveKeywords(
        'INSERT INTO t VALUES (1) ON CONFLICT (id) DO UPDATE SET a = 1',
        pg
      )
    ).toEqual(['UPDATE'])
    expect(
      destructiveKeywords(
        'INSERT INTO t VALUES (1) ON DUPLICATE KEY UPDATE a = 1',
        mysql
      )
    ).toEqual(['UPDATE'])
  })

  it('tells schema changes from data changes', () => {
    expect(invalidatesCatalog('create table t (id int)', mysql)).toBe(true)
    expect(invalidatesCatalog('SELECT 1; ALTER TABLE t ADD c int', mysql)).toBe(
      true
    )
    expect(invalidatesCatalog("UPDATE t SET a = 'DROP'", mysql)).toBe(false)
    expect(invalidatesCatalog("COMMENT ON COLUMN t.a IS 'x'", pg)).toBe(true)
    expect(
      invalidatesCatalog('DO $$ BEGIN CREATE TABLE t (); END $$', pg)
    ).toBe(true)
    expect(invalidatesCatalog('EXPLAIN CREATE TABLE t AS SELECT 1', pg)).toBe(
      false
    )
    expect(
      invalidatesCatalog('EXPLAIN ANALYZE CREATE TABLE t AS SELECT 1', pg)
    ).toBe(true)
  })

  it('tells data writes from reads', () => {
    expect(writesData('INSERT INTO t VALUES (1)', pg)).toBe(true)
    expect(writesData('SELECT 1; UPDATE t SET a = 1', mysql)).toBe(true)
    expect(
      writesData(
        'WITH gone AS (DELETE FROM t RETURNING id) SELECT * FROM gone',
        pg
      )
    ).toBe(true)
    expect(
      writesData("EXEC('INSERT INTO t VALUES (1)')", dialects[Dialect.MSSQL])
    ).toBe(true)
    expect(writesData('SELECT * FROM t FOR UPDATE', pg)).toBe(false)
    expect(writesData("SELECT 'DELETE' FROM t", mysql)).toBe(false)
    expect(writesData('EXPLAIN UPDATE t SET a = 1', pg)).toBe(false)
    expect(writesData('SELECT copy FROM t', pg)).toBe(false)
  })
})

describe('readsOnly', () => {
  const mssql = dialects[Dialect.MSSQL]

  it('accepts one reading statement', () => {
    expect(readsOnly('select * from users where id = 1;', pg)).toBe(true)
    expect(readsOnly('WITH t AS (SELECT 1) SELECT * FROM t', pg)).toBe(true)
    expect(readsOnly("select 'drop table users'", pg)).toBe(true)
    expect(readsOnly('SELECT comment FROM posts', pg)).toBe(true)
    expect(readsOnly('SHOW TABLES', mysql)).toBe(true)
    expect(readsOnly('SHOW CREATE TABLE users', mysql)).toBe(true)
    expect(readsOnly('SHOW CREATE TABLE users', clickhouse)).toBe(true)
    expect(
      readsOnly('SELECT * FROM t USE INDEX (i) JOIN u ON u.id = t.id', mysql)
    ).toBe(true)
    expect(
      readsOnly("SELECT CAST('a' AS CHAR CHARACTER SET utf8mb4)", mysql)
    ).toBe(true)
    expect(
      readsOnly(
        'SELECT * FROM t ORDER BY id OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY',
        mssql
      )
    ).toBe(true)
    expect(readsOnly('SELECT 1 /* note */', mysql)).toBe(true)
  })

  it('rejects writes hidden in or after a read', () => {
    expect(readsOnly('select 1; delete from users', pg)).toBe(false)
    expect(
      readsOnly('WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d', pg)
    ).toBe(false)
    expect(readsOnly('SELECT * INTO copy FROM users', mssql)).toBe(false)
    expect(readsOnly('SELECT 1 COMMIT DROP TABLE users', mssql)).toBe(false)
    expect(readsOnly("SELECT 1 EXEC('DROP TABLE users')", mssql)).toBe(false)
    expect(readsOnly('EXPLAIN ANALYZE DELETE FROM users', pg)).toBe(false)
    expect(readsOnly('EXPLAIN ANALYSE DELETE FROM users', pg)).toBe(false)
    expect(readsOnly('EXPLAIN DELETE FROM users', pg)).toBe(false)
    expect(readsOnly('SHOW DELETE FROM t', mysql)).toBe(false)
  })

  it('rejects writes hidden by text the engine does not read as a quote or comment', () => {
    for (const glue of ['€', '²', ' ']) {
      expect(
        readsOnly(
          `SELECT 1 ${glue}$a$; COMMIT; DELETE FROM users; SELECT $a$`,
          pg
        )
      ).toBe(false)
    }
    expect(readsOnly("SELECT 1--1 INTO OUTFILE '/tmp/x'", mysql)).toBe(false)
    expect(readsOnly('SELECT 1 -- note', mysql)).toBe(true)
  })

  it('rejects a SQL Server batch that opens with a procedure call', () => {
    for (const text of [
      'EXPLAIN 1 DELETE FROM t COMMIT',
      'EXPLAIN 1 SHUTDOWN',
      'EXPLAIN 1 KILL 55',
      'SHOW KILL 55',
      'SHOW SHUTDOWN WITH NOWAIT',
      'SHOW DELETE FROM t',
      'SHOW DROP TABLE t',
      'EXPLAIN SELECT 1',
      'SHOW TABLES',
    ]) {
      expect(readsOnly(text, mssql)).toBe(false)
    }
  })

  it('rejects a write after a SQL Server setting that ends in ON', () => {
    expect(
      readsOnly(
        'SELECT 1 SET NOCOUNT ON COMMIT SET XACT_ABORT ON DELETE FROM users',
        mssql
      )
    ).toBe(false)
  })

  it('rejects what outlives the rollback', () => {
    expect(readsOnly('SELECT 1 SET ROWCOUNT 1', mssql)).toBe(false)
    expect(readsOnly('SELECT 1 SET IMPLICIT_TRANSACTIONS ON', mssql)).toBe(
      false
    )
    expect(readsOnly('SELECT 1 USE master', mssql)).toBe(false)
    expect(readsOnly('SELECT 1 BEGIN TRAN', mssql)).toBe(false)
    expect(readsOnly("SELECT 1 WAITFOR DELAY '00:10'", mssql)).toBe(false)
    expect(readsOnly('SELECT NEXT VALUE FOR dbo.seq', mssql)).toBe(false)
    expect(readsOnly('SELECT NEXT VALUE FOR seq', mysql)).toBe(false)
    expect(readsOnly('SELECT next, value FROM t', pg)).toBe(true)
  })

  it('rejects functions that act outside the transaction or outlive it', () => {
    expect(
      readsOnly("SELECT dblink_exec('dbname=x', 'DROP TABLE users')", pg)
    ).toBe(false)
    expect(readsOnly('SELECT pg_advisory_lock(1)', pg)).toBe(false)
    expect(readsOnly('SELECT pg_terminate_backend(42)', pg)).toBe(false)
    expect(readsOnly("SELECT lo_export(16384, '/tmp/x')", pg)).toBe(false)
    expect(readsOnly("SELECT pg_file_write('/tmp/x', 'a', false)", pg)).toBe(
      false
    )
    expect(readsOnly("SELECT pg_file_unlink('/tmp/x')", pg)).toBe(false)
    expect(readsOnly("SELECT pg_file_rename('/tmp/x', '/tmp/y')", pg)).toBe(
      false
    )
    expect(readsOnly(String.raw`SELECT U&"lo_\0065xport"(1, '/x')`, pg)).toBe(
      false
    )
    expect(
      readsOnly(
        String.raw`SELECT u&"pg_file_!0077rite" UESCAPE '!'('/x', 'a')`,
        pg
      )
    ).toBe(false)
    expect(readsOnly("SELECT GET_LOCK('a', 10)", mysql)).toBe(false)
    expect(
      readsOnly("SELECT * FROM OPENQUERY(srv, 'DELETE FROM users')", mssql)
    ).toBe(false)
    expect(readsOnly("SELECT 1 SETUSER 'dbo'", mssql)).toBe(false)
    expect(
      readsOnly(
        'SELECT 1 OPEN SYMMETRIC KEY k DECRYPTION BY PASSWORD = 1',
        mssql
      )
    ).toBe(false)
    expect(readsOnly('SELECT 1 REVERT', mssql)).toBe(false)
    expect(readsOnly('SELECT get_lock FROM t', mysql)).toBe(true)
  })

  it('rejects MySQL executable comments', () => {
    expect(readsOnly("SELECT 1 /*! INTO DUMPFILE '/tmp/x' */", mysql)).toBe(
      false
    )
    expect(
      readsOnly("SELECT 1 /*!50000 INTO OUTFILE '/tmp/mcp-write' */", mysql)
    ).toBe(false)
    expect(readsOnly("SELECT 1 /*M! INTO OUTFILE '/tmp/x' */", mysql)).toBe(
      false
    )
  })

  it('rejects a SQL Server batch that ends the transaction and writes', () => {
    expect(
      readsOnly(
        'SELECT 1 ROLLBACK TRANSACTION GRANT CONTROL SERVER TO public',
        mssql
      )
    ).toBe(false)
    expect(
      readsOnly("SELECT 1 ROLLBACK RESTORE DATABASE db FROM DISK = 'x'", mssql)
    ).toBe(false)
    expect(readsOnly('SELECT 1 DBCC SHRINKDATABASE(db)', mssql)).toBe(false)
  })

  it('rejects anything that is not a read', () => {
    expect(readsOnly('COMMIT', pg)).toBe(false)
    expect(readsOnly('SET search_path TO evil', pg)).toBe(false)
    expect(readsOnly('', pg)).toBe(false)
  })
})
