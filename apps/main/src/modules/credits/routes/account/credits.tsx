import { Coins01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@tamery/ui/components/empty'
import { Progress } from '@tamery/ui/components/progress'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { type } from 'arktype'
import { format } from 'date-fns'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { AccountPage } from '~/components/account-page'
import { useSubscription } from '~/hooks/use-subscription'
import { orpc } from '~/lib/orpc'

import { AddCreditsDialog } from '../../components/add-credits-dialog'
import { AutoTopUp } from '../../components/auto-top-up'
import { formatDollars } from '../../format'

const RouteComponent = () => {
  const subscription = useSubscription()
  const { data } = useSuspenseQuery(orpc.account.credits.get.queryOptions())
  const { credits: returned } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (returned === 'success') {
      toast.success('Payment received. Your credits show up in a moment.')
    }
    if (returned) {
      void navigate({ replace: true, search: {} })
    }
  }, [navigate, returned])

  if (!subscription) {
    return (
      <AccountPage title="AI credits">
        <Empty size="sm">
          <EmptyHeader>
            <EmptyMedia variant="muted">
              <HugeiconsIcon icon={Coins01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>AI credits come with Pro</EmptyTitle>
            <EmptyDescription>
              Pro includes AI chat every month, and credits keep it going past
              that.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" render={<Link to="/account" />}>
              See Pro
            </Button>
          </EmptyContent>
        </Empty>
      </AccountPage>
    )
  }

  return (
    <AccountPage
      title="AI credits"
      action={
        <Button size="sm" onClick={() => setAdding(true)}>
          Add credits
        </Button>
      }
    >
      <AddCreditsDialog open={adding} onOpenChange={setAdding} />
      <SettingsGroup title="This month">
        <SettingsRow
          title="Included with Pro"
          description={`${formatDollars(data.included.spent)} of ${formatDollars(data.included.budget)} used since ${format(data.included.since, 'MMMM d')}. The AI chat spends this first.`}
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
    </AccountPage>
  )
}

export const Route = createFileRoute('/account/credits')({
  component: RouteComponent,
  loader: async ({ context }) => {
    await context.queryClient.query({
      ...orpc.account.credits.get.queryOptions(),
      staleTime: 'static',
    })
  },
  validateSearch: type({ 'credits?': '"success" | "cancel"' }),
})
