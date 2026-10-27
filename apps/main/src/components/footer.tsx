import { DOCS_URL, SOCIAL_LINKS } from '@tamery/shared/constants'
import { Link } from '@tanstack/react-router'

import { useHomePath } from '~/hooks/use-home-path'

import { Brand } from './brand'
import { FooterColumn } from './footer-column'

const linkClassName =
  'text-muted-foreground hover:text-foreground text-sm transition-colors'

const COMMUNITY_LINKS = [
  { href: SOCIAL_LINKS.GITHUB, label: 'GitHub' },
  { href: SOCIAL_LINKS.DISCORD, label: 'Discord' },
  { href: SOCIAL_LINKS.TWITTER, label: 'X' },
]

const COPYRIGHT_YEAR = new Date().getFullYear()

export const Footer = () => {
  const home = useHomePath()

  return (
    <footer className="bg-muted sticky bottom-0 -mt-8">
      <div className="mx-auto w-full max-w-6xl px-4 pt-32 pb-10 sm:px-6">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="col-span-2 flex flex-col gap-3 md:col-span-1">
            <Brand to={home} />
            <p className="text-muted-foreground max-w-xs text-sm text-pretty">
              The AI database client for Postgres, MySQL, MariaDB, SQL Server,
              Oracle, ClickHouse, MongoDB, SQLite, Turso and Cloudflare D1.
            </p>
          </div>
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
            <Link to="/blog" className={linkClassName}>
              Blog
            </Link>
            <a href={DOCS_URL} className={linkClassName}>
              Docs
            </a>
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
        <p className="text-muted-foreground mt-16 text-xs">
          © {COPYRIGHT_YEAR} Tamery
        </p>
      </div>
    </footer>
  )
}
