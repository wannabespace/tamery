import {
  BREW_INSTALL_COMMAND,
  DOCS_URL,
  SOCIAL_LINKS,
} from '@tamery/shared/constants'
import { createFileRoute } from '@tanstack/react-router'

import { publishedPosts } from '~/modules/blog/posts'
import { SITE_URL } from '~/utils/seo'

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: () => {
        const posts = publishedPosts().map(
          (post) =>
            `- [${post.title}](${SITE_URL}/blog/${post.slug}): ${post.description}`
        )

        return new Response(
          `# Tamery

> Tamery is an AI-powered, open-source database client for PostgreSQL, TimescaleDB, MySQL, MariaDB, Microsoft SQL Server, Oracle, ClickHouse, MongoDB and SQLite, including Turso and Cloudflare D1. It lets developers write queries, explore and edit data, and manage databases with AI doing the heavy lifting. Available as a native desktop app for macOS, Windows and Linux, a web app and a CLI, with a local MCP server for AI agents.

## Key facts

- Supported databases: PostgreSQL, TimescaleDB, MySQL, MariaDB, Microsoft SQL Server (MSSQL), Oracle, ClickHouse, MongoDB (including Atlas), SQLite, Turso, Cloudflare D1
- Platforms: macOS (Apple Silicon and Intel), Windows, Linux (DEB, RPM, AppImage), web
- Open source under AGPL-3.0: ${SOCIAL_LINKS.GITHUB}
- Install via Homebrew: \`${BREW_INSTALL_COMMAND}\`

## Pages

- [Home](${SITE_URL}/): Product overview, features, pricing and FAQ
- [Download](${SITE_URL}/download): Download links for macOS, Windows and Linux
- [Releases](${SITE_URL}/releases): Changelog and version history
- [Blog](${SITE_URL}/blog): Guides and how-tos from the people building Tamery
- [Privacy Policy](${SITE_URL}/privacy-policy): How Tamery handles your data
- [Terms of Service](${SITE_URL}/terms-of-service): Terms and conditions

## Blog

${posts.join('\n')}

## Docs

- [Documentation](${DOCS_URL}): Setup, connections, features, CLI and MCP
- [Docs for LLMs](${DOCS_URL}/llms.txt): The documentation index in llms.txt format

## Links

- GitHub: ${SOCIAL_LINKS.GITHUB}
- X / Twitter: ${SOCIAL_LINKS.TWITTER}
- Discord: ${SOCIAL_LINKS.DISCORD}
`,
          { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        )
      },
    },
  },
})
