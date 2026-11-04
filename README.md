# <img src="https://tamery.app/logo.png" alt="Tamery logo" width="25"/> Tamery

_The AI-powered database client and MCP server for desktop and web_

<a href="https://tamery.app/download">
  <img src="https://img.shields.io/badge/Download-Tamery-green?style=for-the-badge" alt="Download Tamery" />
</a>

<img src="./screenshot.png" alt="Tamery screenshot" width="100%" />

We built Tamery because we wanted a database client that is fast, simple and nice to look at.

And one that actually helps instead of getting in the way.

It works with **PostgreSQL**, **TimescaleDB**, **MySQL**, **MariaDB**, **SQL Server**, **Oracle**, **ClickHouse**, **MongoDB** and **SQLite** (Turso and Cloudflare D1 too).

## Get started

1. Open [tamery.app](https://tamery.app) or [download the app](https://tamery.app/download).

   ```bash
   brew install --cask tamery   # macOS
   yay -S tamery-bin            # Arch Linux
   ```

2. Sign in. Or skip it on desktop with **Continue without an account**.
3. Paste a connection string. Or an `.env` file, a JDBC URL, a `psql` command. Tamery figures it out.
4. Open a table or run a query.

> [!TIP]
> Start with the desktop app. It connects to `localhost` and private networks out of the box.

## What's inside

- Table browser. Sort, filter, edit right in the cell.
- Query editor with autocomplete that knows your schema.
- AI assistant that writes, explains and fixes SQL. It never changes data without asking.
- Schema visualizer.
- Connections synced across devices, with or without passwords.
- SSH tunnels and SSL.
- MCP server. Claude Code, Cursor and other agents can query your databases. Every write waits for your click.

## Small things we care about

- Anything that changes or deletes data asks first.
- Works offline. Syncs when you are back.
- Connection strings are always encrypted. With **Metadata only** they never leave your machine.
- Everyday features are free. Pro adds the full AI assistant.
- Open source. You can read every line that touches your credentials.

## Run it yourself

You need [pnpm](https://pnpm.io), [Bun](https://bun.sh), and Postgres + Redis (or [Docker](https://docs.docker.com/get-docker/)).

```bash
pnpm install
pnpm run docker:start
pnpm run drizzle:migrate
pnpm run dev
```

The app opens at https://app.local.tamery.app. Tests: `pnpm run test`, and `pnpm run test:e2e` after `pnpm run test:start`.

## Issues

We don't accept pull requests. But we read every issue.

Found a bug or something off by one pixel? [Open an issue](https://github.com/wannabespace/tamery/issues). Our perfectionists will thank you.

<div align="center">
  <sub>Built with ❤️</sub>
</div>
