import { AiChat02Icon, Calendar03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import type { DateRange } from '@tamery/ui/components/calendar'
import { Calendar } from '@tamery/ui/components/calendar'
import { SettingsGroup } from '@tamery/ui/components/custom/settings-group'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@tamery/ui/components/empty'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@tamery/ui/components/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tamery/ui/components/table'
import { useQuery } from '@tanstack/react-query'
import { format, parse } from 'date-fns'
import { useState } from 'react'

import { orpc } from '~/lib/orpc'

export const aiUsageQueryOptions = (range?: DateRange) =>
  orpc.account.aiUsage.queryOptions({
    input: { from: range?.from, to: range?.to },
  })

const formatTokens = (value: number) => value.toLocaleString('en-US')

const formatCost = (value: number) =>
  new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 4,
    style: 'currency',
  }).format(value)

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

export const AiUsage = () => {
  const [range, setRange] = useState<DateRange>()
  const { data: usage = [] } = useQuery(aiUsageQueryOptions(range))

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
        <Table className="min-w-lg table-fixed">
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
                      ≈ {formatCost(row.cost)}
                    </span>
                  )}
                  {row.cost !== null && !row.ownKey && formatCost(row.cost)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SettingsGroup>
  )
}
