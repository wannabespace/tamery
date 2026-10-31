import { DOCS_URL, SOCIAL_LINKS } from '@tamery/shared/constants'
import { Link } from '@tanstack/react-router'

import { useHomePath } from '~/hooks/use-home-path'

import { Brand } from './brand'
import { FooterColumn } from './footer-column'
import { ThemeButton } from './theme-button'

const linkClassName =
  'text-muted-foreground hover:text-foreground transition-colors'

const COMMUNITY_LINKS = [
  { href: SOCIAL_LINKS.GITHUB, label: 'GitHub' },
  { href: SOCIAL_LINKS.DISCORD, label: 'Discord' },
  { href: SOCIAL_LINKS.TWITTER, label: 'X' },
]

const COPYRIGHT_YEAR = new Date().getFullYear()

export const Footer = () => {
  const home = useHomePath()

  return (
    <footer className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <div className="grid gap-x-6 gap-y-12 border-t pt-12 pb-16 md:grid-cols-12">
        <div className="flex flex-col gap-4 md:col-span-4">
          <Brand to={home} />
          <p className="text-muted-foreground max-w-xs text-sm text-pretty">
            The AI database client for Postgres, MySQL, MariaDB, SQL Server,
            Oracle, ClickHouse, MongoDB, SQLite, Turso and Cloudflare D1.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 md:col-span-8">
          <FooterColumn title="Product">
            <Link to="/download" className={linkClassName}>
              Download
            </Link>
            <Link to={home} hash="pricing" className={linkClassName}>
              Pricing
            </Link>
            <Link to="/releases" className={linkClassName}>
              Releases
            </Link>
          </FooterColumn>
          <FooterColumn title="Resources">
            <a href={DOCS_URL} className={linkClassName}>
              Docs
            </a>
            <Link to="/blog" className={linkClassName}>
              Blog
            </Link>
          </FooterColumn>
          <FooterColumn title="Community">
            {COMMUNITY_LINKS.map(({ href, label }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClassName}
              >
                {label}
              </a>
            ))}
          </FooterColumn>
          <FooterColumn title="Legal">
            <Link to="/terms-of-service" className={linkClassName}>
              Terms of Service
            </Link>
            <Link to="/privacy-policy" className={linkClassName}>
              Privacy Policy
            </Link>
          </FooterColumn>
        </div>
      </div>
      <div className="flex items-center justify-between border-t py-6">
        <p className="text-muted-foreground text-xs">
          © {COPYRIGHT_YEAR} Tamery
        </p>
        <ThemeButton />
      </div>
    </footer>
  )
}
