import {
  AiChat02Icon,
  Alert02Icon,
  Calendar03Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { CREDIT_TOP_UP, topUpChargeCents } from '@tamery/shared/credits'
import { Alert, AlertDescription } from '@tamery/ui/components/alert'
import { Button } from '@tamery/ui/components/button'
import { ButtonGroup } from '@tamery/ui/components/button-group'
import type { DateRange } from '@tamery/ui/components/calendar'
import { Calendar } from '@tamery/ui/components/calendar'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tamery/ui/components/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@tamery/ui/components/empty'
import { Field, FieldLabel } from '@tamery/ui/components/field'
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
} from '@tamery/ui/components/number-field'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@tamery/ui/components/popover'
import { Progress } from '@tamery/ui/components/progress'
import { Switch } from '@tamery/ui/components/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tamery/ui/components/table'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { format, parse } from 'date-fns'
import { useState } from 'react'

import { useSubscription } from '~/core/user/use-subscription'
import type { ORPCOutputs } from '~/lib/orpc'
import { orpc } from '~/lib/orpc'
import { queryClient } from '~/lib/query-client'

import { openStripe, stripeReturnUrl } from './browser'

type Credits = ORPCOutputs['account']['credits']['get']

const formatDollars = (amount: number) =>
  new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(
    amount
  )

const AddCreditsDialog = () => {
  const [amount, setAmount] = useState<number | null>(CREDIT_TOP_UP.amounts[1])
  const valid =
    amount !== null &&
    Number.isInteger(amount) &&
    amount >= CREDIT_TOP_UP.min &&
    amount <= CREDIT_TOP_UP.max
  const { isPending, mutate: checkout } = useMutation({
    meta: { event: 'ai_credits_checkout_started' },
    mutationFn: (dollars: number) =>
      orpc.account.credits.topUp.call({
        amount: dollars,
        cancelUrl: stripeReturnUrl('ai'),
        successUrl: stripeReturnUrl('ai'),
      }),
    onSuccess: openStripe,
  })

  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        Add credits
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Credits</DialogTitle>
          <DialogDescription>
            Credits pay for AI once the month&apos;s included amount is used, at
            what the model costs us. Each top-up adds a{' '}
            {CREDIT_TOP_UP.fee * 100}% fee. Credits never expire.
          </DialogDescription>
        </DialogHeader>
        <ButtonGroup>
          {CREDIT_TOP_UP.amounts.map((preset) => (
            <Button
              key={preset}
              variant={amount === preset ? 'default' : 'outline'}
              onClick={() => setAmount(preset)}
            >
              {formatDollars(preset)}
            </Button>
          ))}
        </ButtonGroup>
        <Field>
          <FieldLabel htmlFor="credits-amount">Amount in US dollars</FieldLabel>
          <NumberField
            id="credits-amount"
            value={amount}
            min={CREDIT_TOP_UP.min}
            max={CREDIT_TOP_UP.max}
            step={1}
            onValueChange={setAmount}
          >
            <NumberFieldGroup>
              <NumberFieldInput />
            </NumberFieldGroup>
          </NumberField>
        </Field>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            disabled={!valid || isPending}
            onClick={() => amount !== null && checkout(amount)}
          >
            <LoadingContent loading={isPending}>
              {valid
                ? `Pay ${formatDollars(topUpChargeCents(amount) / 100)}`
                : 'Pay'}
            </LoadingContent>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const DollarsField = ({
  id,
  min,
  onCommit,
  value,
}: {
  id: string
  min: number
  onCommit: (value: number) => void
  value: number
}) => (
  <NumberField
    id={id}
    size="sm"
    className="w-24"
    defaultValue={value}
    min={min}
    max={CREDIT_TOP_UP.max}
    step={1}
    format={{ currency: 'USD', maximumFractionDigits: 0, style: 'currency' }}
    onValueCommitted={(next) => next !== null && onCommit(next)}
  >
    <NumberFieldGroup>
      <NumberFieldInput />
    </NumberFieldGroup>
  </NumberField>
)

/** Off until the user turns it on; a failed charge turns it off and says so here. */
const AutoTopUp = ({ settings }: { settings: Credits['autoTopUp'] }) => {
  const saved = {
    amount: settings.amount ?? CREDIT_TOP_UP.autoTopUpAmount,
    enabled: settings.enabled,
    threshold: settings.threshold ?? CREDIT_TOP_UP.autoTopUpThreshold,
  }
  const { mutate: save } = useMutation({
    meta: { event: 'ai_credits_auto_top_up_changed' },
    mutationFn: (change: Partial<typeof saved>) =>
      orpc.account.credits.setAutoTopUp.call({ ...saved, ...change }),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: orpc.account.credits.get.key(),
      }),
  })

  return (
    <SettingsGroup title="Auto top-up">
      {settings.failedAt && !settings.enabled && (
        <Alert variant="destructive">
          <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
          <AlertDescription>
            Auto top-up turned off because the last payment didn&apos;t go
            through. Check your card under Plan → Manage, then turn it back on.
          </AlertDescription>
        </Alert>
      )}
      <SettingsRow
        htmlFor="auto-top-up"
        title="Top up automatically"
        description="Charges the card you paid with, so the chat never stops mid-answer."
      >
        <Switch
          id="auto-top-up"
          size="sm"
          checked={saved.enabled}
          onCheckedChange={(enabled) => save({ enabled })}
        />
      </SettingsRow>
      <SettingsRow
        htmlFor="auto-top-up-threshold"
        title="When credits fall below"
      >
        <DollarsField
          id="auto-top-up-threshold"
          min={0}
          value={saved.threshold}
          onCommit={(threshold) => save({ threshold })}
        />
      </SettingsRow>
      <SettingsRow htmlFor="auto-top-up-amount" title="Add">
        <DollarsField
          id="auto-top-up-amount"
          min={CREDIT_TOP_UP.min}
          value={saved.amount}
          onCommit={(amount) => save({ amount })}
        />
      </SettingsRow>
    </SettingsGroup>
  )
}

const ProCredits = () => {
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

const formatTokens = (value: number) => value.toLocaleString('en-US')

const formatMonth = (month: string) =>
  format(parse(month, 'yyyy-MM', new Date()), 'MMMM yyyy')

const formatRange = (range: DateRange | undefined) => {
  if (!range?.from) {
    return 'All time'
  }
  if (!range.to) {
    return `From ${format(range.from, 'MMM d, yyyy')}`
  }
  return `${format(range.from, 'MMM d, yyyy')} to ${format(range.to, 'MMM d, yyyy')}`
}

const Usage = () => {
  const [range, setRange] = useState<DateRange>()
  const { data: usage = [] } = useQuery(
    orpc.account.aiUsage.queryOptions({
      input: { from: range?.from, to: range?.to },
    })
  )

  return (
    <SettingsGroup
      title="Usage"
      action={
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline" size="sm">
                <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} />
                {formatRange(range)}
              </Button>
            }
          />
          <PopoverContent align="end" className="w-auto">
            <Calendar
              autoFocus
              mode="range"
              numberOfMonths={2}
              onSelect={setRange}
              selected={range}
            />
          </PopoverContent>
        </Popover>
      }
    >
      {usage.length === 0 ? (
        <Empty size="sm">
          <EmptyHeader>
            <EmptyMedia variant="muted">
              <HugeiconsIcon icon={AiChat02Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No AI usage in this period</EmptyTitle>
            <EmptyDescription>
              Requests you make with AI in Tamery are counted here by month.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="w-1/6 text-right">Requests</TableHead>
              <TableHead className="w-1/5 text-right">Input tokens</TableHead>
              <TableHead className="w-1/5 text-right">Output tokens</TableHead>
              <TableHead className="w-1/6 text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usage.map((row) => (
              <TableRow key={`${row.month}:${row.ownKey}`}>
                <TableCell>
                  {formatMonth(row.month)}
                  {row.ownKey && (
                    <span className="text-muted-foreground"> · Your key</span>
                  )}
                </TableCell>
                <TableCell variant="numeric">
                  {formatTokens(row.calls)}
                </TableCell>
                <TableCell variant="numeric">
                  {formatTokens(row.inputTokens ?? 0)}
                </TableCell>
                <TableCell variant="numeric">
                  {formatTokens(row.outputTokens ?? 0)}
                </TableCell>
                <TableCell variant="numeric">
                  {row.cost === null && (
                    <span className="text-muted-foreground">Unknown</span>
                  )}
                  {row.cost !== null && row.ownKey && (
                    <span className="text-muted-foreground">
                      ≈ {formatDollars(row.cost)}
                    </span>
                  )}
                  {row.cost !== null && !row.ownKey && formatDollars(row.cost)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SettingsGroup>
  )
}

export const AiCredits = () => {
  const { subscription, isLoading } = useSubscription()

  if (isLoading) {
    return null
  }

  return (
    <>
      {subscription ? (
        <ProCredits />
      ) : (
        <SettingsGroup title="AI credits">
          <SettingsRow
            title="AI credits come with Pro"
            description="Pro includes AI every month, and credits keep it going past that."
          >
            <Button
              variant="outline"
              size="sm"
              render={
                <Link to="/settings/$section" params={{ section: 'plan' }} />
              }
            >
              See Pro
            </Button>
          </SettingsRow>
        </SettingsGroup>
      )}
      <Usage />
    </>
  )
}
