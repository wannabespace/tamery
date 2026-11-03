# Tamery CLI

The command-line companion to [Tamery](https://tamery.app), the database client for PostgreSQL, MySQL, SQL Server, Oracle, ClickHouse, MongoDB and SQLite.

Its main job is `tamery bridge`: it lets the [Tamery web app](https://web.tamery.app) run your saved connections on your own computer or server. Use it for:

- databases on localhost or a private network
- SQLite files
- SSH tunnels that use the computer's keys and `~/.ssh/config`
- connections whose password never goes to Tamery's servers

The desktop app doesn't need it, because it already runs queries on your computer.

## Install

macOS and Linux:

```bash
curl -fsSL https://tamery.app/cli/install.sh | sh
```

Windows (PowerShell):

```powershell
irm https://tamery.app/cli/install.ps1 | iex
```

With a package manager:

```bash
npm i -g tamery      # or: pnpm add -g tamery, bun add -g tamery
```

Builds for macOS (Apple silicon, Intel), Linux (x64, arm64, glibc and musl) and Windows (x64, arm64). It's a single binary that doesn't need Node.js or any other runtime.

## Quick start

```bash
tamery bridge
```

1. The first time, it signs you in through the browser.
2. It opens **Settings → Bridge** in the web app. Click **Connect**.
3. Check that the code in the terminal matches the one in the browser, and allow it.

From then on, the web app sends this browser's queries through the bridge for as long as it runs.

## Commands

| Command | What it does |
| --- | --- |
| `tamery bridge` | Run the web app's queries on this computer. `--port` changes the port (default `26380`), and `--public-url` serves it through a tunnel or reverse proxy. |
| `tamery bridge approve` | Allow a browser from another terminal when the bridge runs as a service or in a container. |
| `tamery bridge unpair-all` | Disconnect every paired browser. |
| `tamery login` | Sign this computer in to your Tamery account. |
| `tamery whoami` | Show which account this computer is signed in to. |
| `tamery update` | Update the CLI the same way you installed it. |
| `tamery logout` | Sign out, and delete the saved secrets and paired browsers. |

`tamery --help` lists them, and `tamery <command> --help` shows a command's options.

## Security

- The bridge listens only on `127.0.0.1`.
- It accepts only browsers signed in to your own account, and only after you approve them in the terminal.
- Secrets it keeps are encrypted with a key in the system keychain. On a Linux server without a keychain, the key goes in a file only your user can read.
- It asks before a connection uses a local file, an SSH tunnel or the computer's own credentials.

## Docs

- [Overview and setup](https://docs.tamery.app/cli/overview)
- [All commands](https://docs.tamery.app/cli/commands)
- [Reach a bridge on another computer](https://docs.tamery.app/cli/remote)
