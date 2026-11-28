import { SidebarMenuButton } from '@tamery/ui/components/sidebar'
import { useRouterState } from '@tanstack/react-router'

import { nav } from '~/lib/nav'

import { DocsLink } from './docs-link'

export const Sidebar = ({ onNavigate }: { onNavigate?: () => void }) => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <nav aria-label="Documentation" className="flex flex-col gap-5">
      {nav.groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-0.5">
          <p className="text-muted-foreground px-2 pb-1 text-xs font-medium">
            {group.title}
          </p>
          {group.pages.map((page) => {
            const current = page.href === pathname

            return (
              <SidebarMenuButton
                key={page.href}
                isActive={current}
                render={
                  <DocsLink
                    aria-current={current ? 'page' : undefined}
                    href={page.href}
                    onClick={onNavigate}
                  />
                }
              >
                {page.title}
              </SidebarMenuButton>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
