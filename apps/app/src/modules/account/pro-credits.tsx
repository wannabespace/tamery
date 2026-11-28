import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { Progress } from '@tamery/ui/components/progress'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'

import { orpc } from '~/lib/orpc'

import { AddCreditsDialog } from './add-credits-dialog'
import { AutoTopUp } from './auto-top-up'
import { formatDollars } from './format-dollars'

export const ProCredits = () => {
  const { data } = useQuery(orpc.account.credits.get.queryOptions())

  if (!data) {
    return null
  }

  return (
    <>
      <SettingsGroup title="This month" action={<AddCreditsDialog />}>
        <SettingsRow
          title="Included with Pro"
          description={`${formatDollars(data.included.spent)} of ${formatDollars(data.included.budget)} used since ${format(data.included.since, 'MMMM d')}. Every AI feature spends this first.`}
        >
          <Progress
            className="w-32"
            value={(data.included.spent / data.included.budget) * 100}
          />
        </SettingsRow>
        <SettingsRow
          title="Credits"
          description="Spent once the included amount is used. They never expire."
        >
          <span className="text-sm font-medium tabular-nums">
            {formatDollars(Math.max(0, data.balance))}
          </span>
        </SettingsRow>
      </SettingsGroup>
      <AutoTopUp settings={data.autoTopUp} />
      {data.topUps.length > 0 && (
        <SettingsGroup title="Top-ups">
          {data.topUps.map((topUp) => (
            <SettingsRow
              key={topUp.id}
              title={format(topUp.createdAt, 'MMMM d, yyyy')}
              description={topUp.automatic ? 'Automatic' : 'Added by you'}
            >
              <span className="text-sm tabular-nums">
                {formatDollars(topUp.amount)}
              </span>
            </SettingsRow>
          ))}
        </SettingsGroup>
      )}
    </>
  )
}
