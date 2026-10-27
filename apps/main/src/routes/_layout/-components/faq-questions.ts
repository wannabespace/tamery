import { FREE_WEEKLY_LIMITS } from '@tamery/shared/usage'

import { PRO_PLAN } from '~/utils/pricing'

export const FAQ_QUESTIONS = [
  {
    answer:
      'PostgreSQL, TimescaleDB, MySQL, MariaDB, Microsoft SQL Server, Oracle, ClickHouse, MongoDB and SQLite, including SQLite on Turso and Cloudflare D1, in the desktop app, the web app and the CLI. A local SQLite file opens in the desktop app, or on the web through tamery proxy.',
    question: 'Which databases does Tamery support?',
  },
  {
    answer:
      'Every connection string is encrypted with a key unique to your workspace. Per connection you choose what syncs: the full string, everything but the password, or only its name.',
    question: 'Where are my connection passwords stored?',
  },
  {
    answer:
      'Yes. The desktop app runs a local proxy, so localhost and private-network databases work without setup. In the browser, run tamery proxy from the CLI.',
    question: 'Can I connect to localhost and private databases?',
  },
  {
    answer: `Every database feature, unlimited synced connections, AI diagnosis of a failed connection, ${FREE_WEEKLY_LIMITS.filters} AI filters and ${FREE_WEEKLY_LIMITS.mcp} MCP agent queries a week. Pro is $${PRO_PLAN.price.monthly} a month or $${PRO_PLAN.price.yearly} a year and starts with a 7-day free trial.`,
    question: 'What does the free plan include?',
  },
  {
    answer:
      'The desktop app runs a local MCP server for Claude Code, Cursor and other clients. Per connection you decide whether agents can read, write, or ask you before every write.',
    question: 'Can AI agents use my databases?',
  },
  {
    answer:
      'Yes, under AGPL-3.0. The code, encryption included, is on GitHub for anyone to audit.',
    question: 'Is Tamery open source?',
  },
]
