import {
  ChartBarLineIcon,
  CheckmarkBadge01Icon,
  DatabaseAddIcon,
  DatabaseIcon,
  TestTube01Icon,
  UserShield01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { Toolbar, ToolbarButton } from '@tamery/ui/components/toolbar'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useQuery } from '@tanstack/react-query'

import { useCollections } from '~/core/collections'
import { useConnectionContext } from '~/core/connection/route'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { posthog } from '~/lib/posthog'

const EMPTY_DATABASE_STARTERS = [
  {
    icon: DatabaseAddIcon,
    label: 'Design tables',
    prompt:
      'This database has no tables yet. Ask me what it will store, then propose the tables.',
  },
  {
    icon: TestTube01Icon,
    label: 'Sample data',
    prompt:
      'Create a small sample schema with realistic data that I can practise queries on.',
  },
] as const

const FIRST_CHAT_STARTERS = [
  {
    icon: DatabaseIcon,
    label: 'Database overview',
    prompt:
      'Give me an overview of this database: its main tables, how they relate and what they hold.',
  },
  {
    icon: ChartBarLineIcon,
    label: 'Largest tables',
    prompt:
      'Which tables are the largest by rows and size, and what do they store?',
  },
  {
    icon: UserShield01Icon,
    label: 'Personal data',
    prompt:
      'Find columns that likely hold personal data, such as names, emails, phones or addresses.',
  },
  {
    icon: CheckmarkBadge01Icon,
    label: 'Data quality',
    prompt:
      'Check the main tables for data quality issues: missing values where they are expected, duplicates and rows that point at nothing.',
  },
] as const

const useStarters = () => {
  const { connectionResource } = useConnectionContext()
  const { chatsCollection } = useCollections()
  const { data: tablesAndSchemas } = useQuery(
    resourceTablesAndSchemasQueryOptions({ connectionResource })
  )
  const { data: chats, isLoading } = useLiveQuery({
    query: (q) =>
      q
        .from({ chats: chatsCollection })
        .where(({ chats: chat }) =>
          eq(chat.connectionResourceId, connectionResource.id)
        )
        .select(({ chats: chat }) => ({ id: chat.id })),
  })
  if (tablesAndSchemas?.schemas.every((schema) => !schema.tables.length)) {
    return EMPTY_DATABASE_STARTERS
  }
  return isLoading || chats.length ? [] : FIRST_CHAT_STARTERS
}

/** Ways to start, under the empty chat's composer, until the user has chatted about this database; each sends a fuller prompt than its label. */
export const ChatStarters = ({
  onStart,
}: {
  onStart: (prompt: string) => void
}) => {
  const starters = useStarters()

  return (
    starters.length > 0 && (
      <Toolbar
        aria-label="Ways to start"
        className="mx-3 mt-3 flex-wrap justify-center"
      >
        {starters.map(({ icon, label, prompt }) => (
          <ToolbarButton
            key={label}
            render={<Button variant="secondary" size="xs" />}
            onClick={() => {
              posthog.capture('ai_chat_starter_used', { starter: label })
              onStart(prompt)
            }}
          >
            <HugeiconsIcon
              icon={icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {label}
          </ToolbarButton>
        ))}
      </Toolbar>
    )
  )
}
