import {
  CloudIcon,
  ComputerIcon,
  LaptopIcon,
  ServerStack01Icon,
  SquareLock02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { ConnectionIcon } from '@tamery/ui/components/icons/connection-icon'
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@tamery/ui/components/table'
import { Tabs, TabsList, TabsTrigger } from '@tamery/ui/components/tabs'
import { cn } from '@tamery/ui/lib/utils'
import { useRef, useState } from 'react'

import { DocsLink } from '~/components/docs-link'
import { FactRow } from '~/components/fact-row'
import { Reveal } from '~/components/reveal'
import { SectionHeading } from '~/components/section-heading'
import { posthog } from '~/lib/posthog'
import { pageCardClass, stageClass } from '~/utils/card'

import { useLoop } from './use-loop'

const SYNC_TYPES = ['Full', 'No password', 'Metadata only'] as const

type SyncType = (typeof SYNC_TYPES)[number]

const FIELDS: {
  encrypted?: boolean
  label: string
  syncedIn: SyncType[]
  value: string
}[] = [
  { label: 'Name', syncedIn: [...SYNC_TYPES], value: 'storefront' },
  {
    encrypted: true,
    label: 'Host',
    syncedIn: ['Full', 'No password'],
    value: 'db.acme.io',
  },
  {
    encrypted: true,
    label: 'User',
    syncedIn: ['Full', 'No password'],
    value: 'admin',
  },
  {
    encrypted: true,
    label: 'Password',
    syncedIn: ['Full'],
    value: '••••••••••••',
  },
  {
    encrypted: true,
    label: 'SSH key',
    syncedIn: ['Full'],
    value: 'id_ed25519',
  },
]

const FACTS = [
  {
    description:
      'Connection strings are encrypted before they sync. On desktop the key sits in the keychain.',
    icon: SquareLock02Icon,
    title: 'Encrypted on your device',
  },
  {
    description:
      'On desktop your computer connects to it directly, not through us.',
    icon: ComputerIcon,
    title: 'Queries go straight to your database',
  },
  {
    description: 'The web app’s proxy uses fixed IPs your firewall can let in.',
    icon: ServerStack01Icon,
    title: 'Three addresses to allowlist',
  },
]

const CYCLE_MS = SYNC_TYPES.map(() => 3200)

const SyncCard = () => {
  const ref = useRef<HTMLDivElement>(null)
  const cycled = useLoop(ref, CYCLE_MS)
  const [picked, setPicked] = useState<SyncType | null>(null)
  const syncType = picked ?? SYNC_TYPES[cycled ?? 0] ?? 'Full'

  return (
    <div ref={ref} className={cn(pageCardClass, 'overflow-hidden')}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <span className="flex items-center gap-2 text-sm font-medium">
          <ConnectionIcon type={ConnectionType.Postgres} className="size-4" />
          storefront
        </span>
        <Tabs
          value={syncType}
          onValueChange={(value: SyncType) => {
            setPicked(value)
            posthog.capture('sync_demo_switched', { sync_type: value })
          }}
        >
          <TabsList aria-label="Sync type">
            {SYNC_TYPES.map((type) => (
              <TabsTrigger key={type} value={type}>
                {type}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <Table>
        <TableBody>
          {FIELDS.map((field) => {
            const synced = field.syncedIn.includes(syncType)
            return (
              <TableRow key={field.label}>
                <TableCell className="w-24">
                  <span className="text-muted-foreground">{field.label}</span>
                </TableCell>
                <TableCell>
                  <span className="font-mono">{field.value}</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <HugeiconsIcon
                      icon={synced ? CloudIcon : LaptopIcon}
                      strokeWidth={2}
                      className="text-muted-foreground size-3.5"
                    />
                    {synced
                      ? `In Tamery cloud${field.encrypted ? ', encrypted' : ''}`
                      : 'Stays on this device'}
                  </span>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

export const Security = () => (
  <section
    id="security"
    aria-labelledby="security-heading"
    className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24"
  >
    <Reveal>
      <SectionHeading
        id="security-heading"
        number="05"
        label="Security"
        title="Your connections on every device."
        description="Tamery keeps your connections in its cloud, so every device you sign in on has them. Per connection, store everything, everything but the secrets, or just the name."
        actions={
          <DocsLink path="/connections/security" source="security">
            Where your data goes
          </DocsLink>
        }
      >
        You decide if passwords sync.
      </SectionHeading>
    </Reveal>
    <Reveal className={cn(stageClass, 'mt-12 px-2 py-6 sm:px-12 sm:py-16')}>
      <div className="mx-auto max-w-2xl rounded-2xl shadow-xl">
        <SyncCard />
      </div>
    </Reveal>
    <FactRow facts={FACTS} />
  </section>
)
