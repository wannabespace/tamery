import { Menu01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DOCS_URL } from '@tamery/shared/constants'
import { Button } from '@tamery/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tamery/ui/components/dropdown-menu'
import type { LinkProps } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import { useMotionValueEvent, useScroll } from 'motion/react'
import { useState } from 'react'

import { useHomePath } from '~/hooks/use-home-path'
import { authClient } from '~/lib/auth'
import { posthog } from '~/lib/posthog'

import { Brand } from './brand'
import { NavbarMenu } from './navbar-menu'

export const Navbar = () => {
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 0))
  const { data: session } = authClient.useSession()
  const home = useHomePath()
  const links: {
    label: string
    link: LinkProps
    onClick?: () => void
  }[] = [
    { label: 'Features', link: { hash: 'features', to: home } },
    { label: 'Pricing', link: { hash: 'pricing', to: home } },
    { label: 'Releases', link: { to: '/releases' } },
    { label: 'Blog', link: { to: '/blog' } },
    {
      label: 'Docs',
      link: { href: DOCS_URL },
      onClick: () => posthog.capture('docs_opened', { source: 'navbar' }),
    },
  ]
  const account = session?.user
    ? { label: 'Account', to: '/account' as const }
    : { label: 'Sign in', to: '/sign-in' as const }

  return (
    <header
      data-scrolled={scrolled || undefined}
      className="bg-body data-scrolled:border-border sticky top-0 z-40 h-16 border-b border-transparent transition-colors duration-300 motion-reduce:transition-none"
    >
      <nav
        aria-label="Main"
        className="mx-auto flex h-full max-w-6xl items-center gap-6 px-4 sm:px-6"
      >
        <Brand to={home} />
        <NavbarMenu />
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
            render={<Link to={account.to} />}
          >
            {account.label}
          </Button>
          <Button size="sm" render={<Link to="/download" />}>
            Download
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost-muted"
                  size="icon-sm"
                  className="md:hidden"
                  aria-label="Menu"
                />
              }
            >
              <HugeiconsIcon icon={Menu01Icon} strokeWidth={2} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              {links.map(({ label, link, onClick }) => (
                <DropdownMenuItem
                  key={label}
                  onClick={onClick}
                  render={<Link {...link} />}
                >
                  {label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem render={<Link to={account.to} />}>
                {account.label}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </header>
  )
}
