import {
  BookOpen01Icon,
  DiscordIcon,
  GitBranchIcon,
  GithubIcon,
  HierarchySquare02Icon,
  LayoutTable02Icon,
  News01Icon,
  RoboticIcon,
  SourceCodeIcon,
  SparklesIcon,
  SquareLock02Icon,
} from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { DOCS_URL, SOCIAL_LINKS } from '@tamery/shared/constants'
import { Badge } from '@tamery/ui/components/badge'
import { Button } from '@tamery/ui/components/button'
import { ConnectionIcon } from '@tamery/ui/components/icons/connection-icon'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@tamery/ui/components/navigation-menu'
import type { LinkProps } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useId } from 'react'

import { useHomePath } from '~/hooks/use-home-path'
import { useLatestVersion } from '~/hooks/use-latest-version'
import { posthog } from '~/lib/posthog'
import { shownEngines } from '~/utils/engines'

type Destination =
  | { docs: string }
  | { href: string }
  | { hash?: string; to: LinkProps['to'] }

const renderDestination = (
  destination: Destination,
  label: string,
  descriptionId: string
) => {
  if ('docs' in destination) {
    return (
      <a
        href={`${DOCS_URL}${destination.docs}`}
        onClick={() => posthog.capture('docs_opened', { source: 'navbar' })}
        aria-label={label}
        aria-describedby={descriptionId}
      />
    )
  }
  if ('href' in destination) {
    return (
      <a
        href={destination.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        aria-describedby={descriptionId}
      />
    )
  }
  return (
    <Link
      to={destination.to}
      hash={destination.hash}
      aria-label={label}
      aria-describedby={descriptionId}
    />
  )
}

const MenuLink = ({
  aside,
  description,
  destination,
  icon,
  title,
}: {
  aside?: ReactNode
  description: string
  destination: Destination
  icon: IconSvgElement
  title: string
}) => {
  const id = useId()

  return (
    <NavigationMenuLink render={renderDestination(destination, title, id)}>
      <span className="bg-background ring-foreground/6 flex size-8 shrink-0 items-center justify-center rounded-lg shadow-xs ring">
        <HugeiconsIcon
          icon={icon}
          strokeWidth={2}
          className="text-muted-foreground size-4"
        />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 font-medium">
          {title}
          {aside}
        </span>
        <span id={id} className="text-muted-foreground text-xs text-pretty">
          {description}
        </span>
      </span>
    </NavigationMenuLink>
  )
}

const ProductPanel = () => {
  const home = useHomePath()

  return (
    <div className="flex w-136 flex-col">
      <div className="grid grid-cols-2 gap-0.5">
        <MenuLink
          icon={SparklesIcon}
          title="AI assistant"
          description="Ask in plain English, get the query and the answer."
          destination={{ docs: '/features/ai-assistant' }}
        />
        <MenuLink
          icon={RoboticIcon}
          title="Agents and MCP"
          description="Claude Code and Cursor query, you approve the writes."
          destination={{ hash: 'agents', to: home }}
        />
        <MenuLink
          icon={LayoutTable02Icon}
          title="Table browser"
          description="Filter, edit and paste rows like a spreadsheet."
          destination={{ docs: '/features/table-browser' }}
        />
        <MenuLink
          icon={SourceCodeIcon}
          title="SQL editor"
          description="Completion that knows your schema and values."
          destination={{ docs: '/features/query-editor' }}
        />
        <MenuLink
          icon={HierarchySquare02Icon}
          title="Schema diagram"
          description="Every table and relation, drawn for you."
          destination={{ docs: '/features/schema-visualizer' }}
        />
        <MenuLink
          icon={SquareLock02Icon}
          title="Security"
          description="Choose what each connection syncs."
          destination={{ hash: 'security', to: home }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-4 border-t px-2.5 pt-3 pb-1.5">
        <span className="text-muted-foreground text-xs">
          Works with {shownEngines.length} engines
        </span>
        <span className="flex items-center gap-2">
          {shownEngines.map(({ label, provider, type }) => (
            <ConnectionIcon
              key={label}
              type={type}
              provider={provider}
              aria-label={label}
              className="size-4"
            />
          ))}
        </span>
      </div>
    </div>
  )
}

const ResourcesPanel = () => {
  const version = useLatestVersion()

  return (
    <div className="flex w-76 flex-col gap-0.5">
      <MenuLink
        icon={BookOpen01Icon}
        title="Docs"
        description="Guides for every feature and engine."
        destination={{ docs: '' }}
      />
      <MenuLink
        icon={News01Icon}
        title="Blog"
        description="Connecting to each database, step by step."
        destination={{ to: '/blog' }}
      />
      <MenuLink
        icon={GitBranchIcon}
        title="Releases"
        description="What changed in every version."
        aside={version && <Badge variant="secondary">{version}</Badge>}
        destination={{ to: '/releases' }}
      />
      <MenuLink
        icon={GithubIcon}
        title="GitHub"
        description="Read the code, star it, send a fix."
        destination={{ href: SOCIAL_LINKS.GITHUB }}
      />
      <MenuLink
        icon={DiscordIcon}
        title="Discord"
        description="Ask the team and other users."
        destination={{ href: SOCIAL_LINKS.DISCORD }}
      />
    </div>
  )
}

export const NavbarMenu = () => {
  const home = useHomePath()

  return (
    <NavigationMenu className="hidden md:flex">
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Product</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ProductPanel />
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Resources</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ResourcesPanel />
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <Button
            variant="ghost-muted"
            size="sm"
            render={<Link to={home} hash="pricing" />}
          >
            Pricing
          </Button>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  )
}
