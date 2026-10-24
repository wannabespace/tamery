import { Dialect, isSqlDialect } from '@tamery/shared/enums/connection-type'
import { formatForDisplay } from '@tanstack/react-hotkeys'

import type { ShortcutId } from '~/core/keyboard/shortcuts'
import { SHORTCUTS } from '~/core/keyboard/shortcuts'

const keys = (shortcut: ShortcutId) =>
  SHORTCUTS[shortcut].hotkeys
    .map((hotkey) => formatForDisplay(hotkey))
    .join(' or ')

const STEP_BY_STEP =
  'Run BEGIN on its own to go step by step, then Commit or Rollback in the toolbar.'
const EXPLAIN = "Explain is in a statement's ⋯ menu."

interface Example {
  title: string
  query: string
}

const DIALECT_STARTERS: Record<
  Dialect,
  { examples: Example[]; notes: string[] }
> = {
  [Dialect.ClickHouse]: {
    examples: [
      {
        query: `SELECT toStartOfHour(timestamp) AS hour, count() AS events, uniq(user_id) AS users
FROM events
WHERE timestamp > now() - INTERVAL 1 DAY
GROUP BY hour
ORDER BY hour;`,
        title: 'Events and unique users per hour, last 24 hours',
      },
      {
        query: `SELECT path, quantile(0.95)(duration_ms) AS p95, count() AS hits
FROM requests
WHERE timestamp > now() - INTERVAL 7 DAY
GROUP BY path
ORDER BY p95 DESC
LIMIT 20;`,
        title: 'Slowest endpoints this week',
      },
      {
        query: 'ALTER TABLE events DELETE WHERE user_id = 42;',
        title: "Remove one user's events",
      },
    ],
    notes: [
      'ClickHouse has no transactions, so each statement applies as it runs.',
    ],
  },
  [Dialect.MongoDB]: {
    examples: [
      {
        query: `db.users.find({ status: 'active' }).sort({ createdAt: -1 }).limit(50)`,
        title: 'Newest active users',
      },
      {
        query: `db.orders.aggregate([
  { $group: { _id: '$status', orders: { $sum: 1 }, revenue: { $sum: '$total' } } },
  { $sort: { revenue: -1 } },
])`,
        title: 'Orders and revenue per status',
      },
      {
        query: `db.orders.updateOne({ _id: 42 }, { $set: { status: 'shipped' } })`,
        title: 'Ship an order',
      },
    ],
    notes: [
      'Tamery runs db calls only, not other JavaScript.',
      "Use db.getSiblingDB('name') to reach another database.",
    ],
  },
  [Dialect.MSSQL]: {
    examples: [
      {
        query: `SELECT TOP 50 id, email, created_at
FROM users
WHERE created_at > DATEADD(day, -7, SYSUTCDATETIME())
ORDER BY created_at DESC;`,
        title: "Last week's signups",
      },
      {
        query: `SELECT CAST(created_at AS date) AS day, SUM(total) AS revenue
FROM orders
GROUP BY CAST(created_at AS date)
ORDER BY day DESC;`,
        title: 'Revenue per day',
      },
      {
        query: `BEGIN TRAN;
UPDATE orders SET status = 'shipped'
OUTPUT inserted.*
WHERE id = 42;
COMMIT;`,
        title: 'Ship an order and see the updated row',
      },
    ],
    notes: [
      'Run BEGIN TRAN on its own to go step by step, then Commit or Rollback in the toolbar.',
    ],
  },
  [Dialect.MySQL]: {
    examples: [
      {
        query: `SELECT id, email, created_at
FROM users
WHERE created_at > NOW() - INTERVAL 7 DAY
ORDER BY created_at DESC;`,
        title: "Last week's signups",
      },
      {
        query: `INSERT INTO cart_items (cart_id, product_id, quantity)
VALUES (7, 101, 1)
ON DUPLICATE KEY UPDATE quantity = quantity + 1;`,
        title: 'Add to cart, or bump the quantity',
      },
      {
        query: `START TRANSACTION;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;`,
        title: 'Move money between accounts',
      },
    ],
    notes: [
      STEP_BY_STEP,
      'Schema changes commit right away, even inside a transaction.',
      EXPLAIN,
    ],
  },
  [Dialect.Oracle]: {
    examples: [
      {
        query: `SELECT id, email, created_at
FROM users
WHERE created_at > SYSDATE - 7
ORDER BY created_at DESC
FETCH FIRST 50 ROWS ONLY;`,
        title: "Last week's signups",
      },
      {
        query: `MERGE INTO products p
USING (SELECT 101 AS id, 25 AS stock FROM DUAL) s
ON (p.id = s.id)
WHEN MATCHED THEN UPDATE SET p.stock = s.stock
WHEN NOT MATCHED THEN INSERT (id, stock) VALUES (s.id, s.stock);`,
        title: 'Set stock, adding the product if it is new',
      },
      {
        query: `BEGIN
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  UPDATE accounts SET balance = balance + 100 WHERE id = 2;
  COMMIT;
END;`,
        title: 'Move money between accounts',
      },
    ],
    notes: [
      'Each statement commits as it runs. BEGIN starts a PL/SQL block,',
      'so put statements in one BEGIN ... END; block to run them together.',
    ],
  },
  [Dialect.Postgres]: {
    examples: [
      {
        query: `SELECT id, email, created_at
FROM users
WHERE created_at > now() - interval '7 days'
ORDER BY created_at DESC;`,
        title: "Last week's signups",
      },
      {
        query: `SELECT date_trunc('day', created_at) AS day, sum(total) AS revenue
FROM orders
GROUP BY day
ORDER BY day DESC;`,
        title: 'Revenue per day',
      },
      {
        query: `UPDATE orders SET status = 'shipped'
WHERE id = 42
RETURNING *;`,
        title: 'Ship an order and see the updated row',
      },
    ],
    notes: [STEP_BY_STEP, EXPLAIN],
  },
  [Dialect.SQLite]: {
    examples: [
      {
        query: `SELECT id, email, created_at
FROM users
WHERE created_at > datetime('now', '-7 days')
ORDER BY created_at DESC;`,
        title: "Last week's signups",
      },
      {
        query: `INSERT INTO settings (key, value)
VALUES ('theme', 'dark')
ON CONFLICT (key) DO UPDATE SET value = excluded.value;`,
        title: 'Save a setting, replacing the old value',
      },
      {
        query: `UPDATE orders SET status = 'shipped'
WHERE id = 42
RETURNING *;`,
        title: 'Ship an order and see the updated row',
      },
    ],
    notes: [
      STEP_BY_STEP,
      'Turso and D1 need the whole BEGIN ... COMMIT block in one Run all.',
    ],
  },
}

export const starterQuery = (dialect: Dialect) => {
  const { examples, notes } = DIALECT_STARTERS[dialect]
  const commentPrefix = isSqlDialect(dialect) ? '--' : '//'
  const comment = (text: string) =>
    text
      .split('\n')
      .map((line) => `${commentPrefix} ${line}`)
      .join('\n')
  return `${[
    comment(
      [
        `${keys('runStatement')} runs the statement under the caret, or the selection.`,
        `${keys('runAll')} runs every statement in this tab.`,
        `${keys('saveStatement')} saves the statement as a query, ${keys('saveTab')} the whole tab.`,
        `${keys('editWithAi')} edits with AI, ${keys('fixWithAi')} fixes a statement that failed.`,
        isSqlDialect(dialect)
          ? 'Tamery asks before running UPDATE, DELETE, DROP or ALTER.'
          : 'Tamery asks before a call that updates, deletes or drops.',
        ...notes,
      ].join('\n')
    ),
    comment('Examples to start from: uncomment one and change the names.'),
    ...examples.map(({ query, title }) => comment(`${title}\n${query}`)),
  ].join('\n\n')}\n`
}
