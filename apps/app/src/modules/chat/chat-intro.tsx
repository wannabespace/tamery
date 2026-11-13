import {
  ChartBarLineIcon,
  CheckmarkBadge01Icon,
  DatabaseIcon,
  UserShield01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@tamery/ui/components/item'
import { Toolbar, ToolbarButton } from '@tamery/ui/components/toolbar'

import { useConnectionContext } from '~/core/connection/route'
import { posthog } from '~/lib/posthog'

const STARTERS = [
  {
    description: 'Main tables and links',
    icon: DatabaseIcon,
    label: 'Database overview',
    prompt:
      'Give me an overview of this database: its main tables, how they relate and what they hold.',
  },
  {
    description: 'By rows and disk size',
    icon: ChartBarLineIcon,
    label: 'Largest tables',
    prompt:
      'Which tables are the largest by rows and size, and what do they store?',
  },
  {
    description: 'Emails, phones, names',
    icon: UserShield01Icon,
    label: 'Personal data',
    prompt:
      'Find columns that likely hold personal data, such as names, emails, phones or addresses.',
  },
  {
    description: 'Gaps and duplicates',
    icon: CheckmarkBadge01Icon,
    label: 'Data quality',
    prompt:
      'Check the main tables for data quality issues: missing values where they are expected, duplicates and rows that point at nothing.',
  },
] as const

/** The empty chat's heading, above the composer. */
export const ChatIntro = () => {
  const { connectionResource } = useConnectionContext()

  return (
    <div className="flex flex-col items-center gap-1.5 px-4 pb-4 text-center">
      <h2 className="text-xl font-medium tracking-tight text-balance">
        What should we look into?
      </h2>
      <p className="text-muted-foreground text-sm text-balance">
        Query <span data-mask>{connectionResource.name}</span>, change it, or @
        another connection to compare.
      </p>
    </div>
  )
}

/** Ways to start, under the empty chat's composer; each sends a fuller prompt than its label. */
export const ChatStarters = ({
  onStart,
}: {
  onStart: (prompt: string) => void
}) => (
  <Toolbar
    aria-label="Ways to start"
    className="mx-auto mt-2 w-[min(31rem,calc(100%-1rem))]"
  >
    <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2">
      {STARTERS.map(({ description, icon, label, prompt }) => (
        <ToolbarButton
          key={label}
          render={
            <Item
              variant="card"
              size="sm"
              className="items-start"
              render={<button type="button" aria-label={label} />}
            />
          }
          onClick={() => {
            posthog.capture('ai_chat_starter_used', { starter: label })
            onStart(prompt)
          }}
        >
          <ItemMedia variant="icon">
            <HugeiconsIcon icon={icon} strokeWidth={2} />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{label}</ItemTitle>
            <ItemDescription>{description}</ItemDescription>
          </ItemContent>
        </ToolbarButton>
      ))}
    </div>
  </Toolbar>
)
