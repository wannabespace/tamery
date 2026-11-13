import {
  AiChat02Icon,
  HierarchyIcon,
  LayoutTable02Icon,
  PlusSignIcon,
  Refresh01Icon,
  SidebarLeftIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { Separator } from '@tamery/ui/components/separator'
import { cn } from '@tamery/ui/lib/utils'

import type { ShowcaseTab } from './playback'

export const TabBar = ({
  chatTitle,
  tab,
}: {
  chatTitle: string
  tab: ShowcaseTab
}) => {
  const tabs = [
    { icon: LayoutTable02Icon, name: 'users' },
    { icon: LayoutTable02Icon, id: 'table', name: 'orders' },
    { icon: HierarchyIcon, id: 'schema', name: 'Visualizer' },
    { icon: AiChat02Icon, id: 'chat', name: chatTitle },
  ]

  return (
    <div className="bg-body/50 flex h-8 shrink-0 items-stretch">
      <div className="flex shrink-0 items-center gap-0.5 border-r border-b px-1">
        <Button variant="ghost-muted" size="icon-xs">
          <HugeiconsIcon icon={SidebarLeftIcon} strokeWidth={2} />
        </Button>
        <Separator orientation="vertical" className="mx-0.5 h-4!" />
        <Button variant="ghost-muted" size="icon-xs">
          <HugeiconsIcon icon={Refresh01Icon} strokeWidth={2} />
        </Button>
      </div>
      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
        {tabs.map(({ icon, id, name }) => (
          <span
            key={id ?? name}
            className={cn(
              'text-muted-foreground font-row flex h-full shrink-0 items-center gap-1.5 border-r border-b pr-8 pl-3 text-sm whitespace-nowrap transition-colors duration-200',
              id === tab && 'bg-background text-foreground border-b-transparent'
            )}
          >
            <HugeiconsIcon
              icon={icon}
              strokeWidth={2}
              className={cn(
                'size-3.5 shrink-0 transition-colors duration-200',
                id === tab ? 'text-primary' : 'text-muted-foreground/60'
              )}
            />
            {name}
          </span>
        ))}
        <div className="flex-1 border-b" />
      </div>
      <div className="flex shrink-0 items-center gap-0.5 border-b border-l px-1">
        <Button variant="ghost-muted" size="icon-xs">
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
        </Button>
      </div>
    </div>
  )
}
