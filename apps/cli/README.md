# Tamery CLI

Tamery from your terminal. `tamery bridge` lets the [Tamery](https://tamery.app) web app run your saved connections on your own computer: databases on localhost or a private network, SQLite files, and connections whose password stays off Tamery's servers.

## Install

```bash
npm i -g tamery
```

Or without Node.js:

```bash
curl -fsSL https://tamery.app/cli/install.sh | sh     # macOS, Linux
irm https://tamery.app/cli/install.ps1 | iex          # Windows PowerShell
```

## Use

```bash
tamery bridge
```

The first time, it signs you in through the browser. Then it opens Tamery: click **Connect**, allow the browser in the terminal, and the web app runs your queries on this computer while the bridge runs.

Docs: [docs.tamery.app/cli](https://docs.tamery.app/cli/overview)
