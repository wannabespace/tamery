import {
  AiChat02Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  HierarchyIcon,
  HistoryIcon,
  FlashIcon,
  Key01Icon,
  Layers01Icon,
  LayoutTable02Icon,
  LeftToRightListDashIcon,
  Refresh01Icon,
  Search01Icon,
  SecurityCheckIcon,
  SourceCodeIcon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@tamery/ui/components/input-group'
import {
  SidebarGroupLabel,
  SidebarMenuButton,
} from '@tamery/ui/components/sidebar'

import type { ShowcaseTab } from './playback'
import { CHAT_TITLES } from './playback'

const SECTIONS: Record<ShowcaseTab, { icon: IconSvgElement; label: string }> = {
  chat: { icon: AiChat02Icon, label: 'Chats' },
  schema: { icon: Layers01Icon, label: 'Schema' },
  table: { icon: LayoutTable02Icon, label: 'Tables' },
}

const TABLES = [
  { name: 'customers' },
  { name: 'invoices' },
  { name: 'orders', active: true },
  { name: 'products' },
  { name: 'sessions', secured: true },
  { name: 'users', secured: true },
]

const SCHEMA_GROUPS = [
  {
    items: [{ active: true, icon: HierarchyIcon, label: 'Visualizer' }],
    label: 'Overview',
  },
  {
    items: [
      { icon: LeftToRightListDashIcon, label: 'Indexes' },
      { icon: Key01Icon, label: 'Constraints' },
    ],
    label: 'Structure',
  },
  {
    items: [
      { icon: SourceCodeIcon, label: 'Functions' },
      { icon: FlashIcon, label: 'Triggers' },
    ],
    label: 'Logic',
  },
]

const TablesList = () => (
  <>
    <SidebarGroupLabel className="mb-1">
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        strokeWidth={2}
        className="rotate-90"
      />
      <span className="text-2xs text-foreground font-semibold tracking-wider uppercase">
        public
      </span>
    </SidebarGroupLabel>
    {TABLES.map((table) => (
      <SidebarMenuButton key={table.name} isActive={table.active}>
        <HugeiconsIcon
          icon={LayoutTable02Icon}
          strokeWidth={2}
          className="text-primary/75"
        />
        <span className="flex min-w-0 flex-1 items-center gap-1">
          <span className="truncate">{table.name}</span>
          {table.secured && (
            <HugeiconsIcon
              icon={SecurityCheckIcon}
              strokeWidth={2}
              className="text-muted-foreground size-3!"
            />
          )}
        </span>
      </SidebarMenuButton>
    ))}
    <SidebarMenuButton>
      <HugeiconsIcon
        icon={ViewIcon}
        strokeWidth={2}
        className="text-primary/75"
      />
      <span>revenue_daily</span>
    </SidebarMenuButton>
  </>
)

const SchemaList = () =>
  SCHEMA_GROUPS.map((group) => (
    <div key={group.label} className="flex flex-col gap-0.5 pb-2">
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      {group.items.map((item) => (
        <SidebarMenuButton key={item.label} isActive={'active' in item}>
          <HugeiconsIcon icon={item.icon} strokeWidth={2} />
          <span>{item.label}</span>
        </SidebarMenuButton>
      ))}
    </div>
  ))

const ChatsList = ({ chatTitle }: { chatTitle: string }) =>
  CHAT_TITLES.map((title) => (
    <SidebarMenuButton key={title} isActive={title === chatTitle}>
      <HugeiconsIcon icon={AiChat02Icon} strokeWidth={2} />
      <span className="truncate">{title}</span>
    </SidebarMenuButton>
  ))

export const Navigator = ({
  chatTitle,
  tab,
}: {
  chatTitle: string
  tab: ShowcaseTab
}) => {
  const section = SECTIONS[tab]

  return (
    <div className="text-foreground flex h-full w-52 shrink-0 flex-col pr-1.5">
      <div className="mb-1.5 flex h-8 shrink-0 items-center justify-between gap-1 pl-2">
        <Button variant="ghost-faint" size="sm">
          <HugeiconsIcon
            icon={section.icon}
            strokeWidth={2}
            data-icon="inline-start"
            className="text-muted-foreground"
          />
          <span className="font-semibold">{section.label}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            data-icon="inline-end"
            className="text-muted-foreground size-3.5"
          />
        </Button>
        <Button variant="ghost-faint-muted" size="icon-sm">
          <HugeiconsIcon icon={HistoryIcon} strokeWidth={2} />
        </Button>
      </div>
      <div className="flex shrink-0 items-center gap-1 pb-1.5 pl-2">
        <InputGroup size="sm">
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search" readOnly />
        </InputGroup>
        {tab === 'table' && (
          <Button variant="outline-muted" size="icon-sm">
            <HugeiconsIcon icon={Refresh01Icon} strokeWidth={2} />
          </Button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 pl-2">
        {tab === 'table' && <TablesList />}
        {tab === 'schema' && <SchemaList />}
        {tab === 'chat' && <ChatsList chatTitle={chatTitle} />}
      </div>
    </div>
  )
}
