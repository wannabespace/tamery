import {
  AiChat02Icon,
  ArrowRight01Icon,
  FolderAddIcon,
  HierarchyIcon,
  FlashIcon,
  Key01Icon,
  LayoutTable02Icon,
  LeftToRightListDashIcon,
  PencilEdit02Icon,
  PlusSignIcon,
  Refresh01Icon,
  Search01Icon,
  SecurityCheckIcon,
  SourceCodeIcon,
  ArrowDown01Icon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import {
  SidebarGroupLabel,
  SidebarMenuButton,
} from '@tamery/ui/components/sidebar'

import type { ShowcaseTab } from './playback'
import { CHAT_TITLES } from './playback'

const SECTIONS: Record<ShowcaseTab, string> = {
  chat: 'Chats',
  schema: 'Schema',
  table: 'Tables',
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
      <span className="text-foreground">public</span>
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

const ACTIONS = {
  chat: [{ icon: PencilEdit02Icon, label: 'New chat' }],
  schema: [],
  table: [
    { icon: PlusSignIcon, label: 'New table' },
    { icon: ViewIcon, label: 'New view' },
    { icon: FolderAddIcon, label: 'New schema' },
  ],
} satisfies Record<ShowcaseTab, { icon: typeof ViewIcon; label: string }[]>

export const Navigator = ({
  chatTitle,
  tab,
}: {
  chatTitle: string
  tab: ShowcaseTab
}) => (
  <div className="text-foreground flex h-full w-52 shrink-0 flex-col pr-1.5">
    <div className="flex h-8 shrink-0 items-center pl-2">
      <Button variant="heading" size="sm">
        {SECTIONS[tab]}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          data-icon="inline-end"
          className="text-muted-foreground size-4"
        />
      </Button>
      <div className="ml-auto flex items-center">
        {tab === 'table' && (
          <Button variant="ghost-muted" size="icon-sm">
            <HugeiconsIcon
              icon={Refresh01Icon}
              strokeWidth={2}
              className="size-4"
            />
          </Button>
        )}
        <Button variant="ghost-muted" size="icon-sm">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="size-4"
          />
        </Button>
      </div>
    </div>
    <div className="mt-2 mb-3 flex shrink-0 flex-col pl-2">
      {ACTIONS[tab].map(({ icon, label }) => (
        <SidebarMenuButton key={label}>
          <HugeiconsIcon icon={icon} strokeWidth={2} />
          <span>{label}</span>
        </SidebarMenuButton>
      ))}
    </div>
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 pl-2">
      {tab === 'table' && <TablesList />}
      {tab === 'schema' && <SchemaList />}
      {tab === 'chat' && <ChatsList chatTitle={chatTitle} />}
    </div>
  </div>
)
