import { ArrowDown02Icon, ArrowUp02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@tamery/ui/components/item'
import { cn } from '@tamery/ui/lib/utils'
import type { ReactNode } from 'react'

const Node = ({ title, note }: { title: ReactNode; note?: ReactNode }) => (
  <Item size="xs" variant="card">
    <ItemContent>
      <ItemTitle>{title}</ItemTitle>
      {note && <ItemDescription>{note}</ItemDescription>}
    </ItemContent>
  </Item>
)

const Arrow = ({
  icon = ArrowDown02Icon,
  className,
}: {
  icon?: IconSvgElement
  className?: string
}) => (
  <HugeiconsIcon
    aria-hidden
    className={cn('text-muted-foreground shrink-0 self-center', className)}
    icon={icon}
    size={16}
    strokeWidth={2}
  />
)

const Column = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col gap-2">{children}</div>
)

export const CloudDiagram = () => (
  <figure className="bg-muted/50 my-8 flex flex-col gap-2 rounded-2xl p-3">
    <div className="flex flex-col gap-2 sm:flex-row">
      <Node title="You" />
      <Arrow className="sm:-rotate-90" />
      <Node title="Cloudflare" />
      <Arrow className="sm:-rotate-90" />
      <Node
        note="Accepts Cloudflare's certificate only"
        title="Google load balancer"
      />
    </div>
    <Arrow />
    <div className="grid gap-2 sm:grid-cols-3">
      <Column>
        <Node note="Cloud Run" title="tamery-api" />
        <Arrow />
        <Node note="Private network" title="Cloud SQL + Redis" />
        <Arrow icon={ArrowUp02Icon} />
        <Node note="Cloud KMS key only we hold" title="Secret Manager" />
      </Column>
      <Column>
        <Node note="Cloud Run" title="tamery-proxy" />
        <Arrow />
        <Node note="From two fixed IPs" title="Your database" />
      </Column>
      <Column>
        <Node note="Cloud Run" title="Website, app, docs, share" />
      </Column>
    </div>
  </figure>
)
