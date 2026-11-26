import { ArrowUpRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { uppercaseFirst } from '@tamery/shared/utils'
import { Button } from '@tamery/ui/components/button'
import { SettingsGroup } from '@tamery/ui/components/custom/settings-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tamery/ui/components/table'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'

import { orpc } from '~/lib/orpc'

import { formatDollars } from './format-dollars'

export const Invoices = () => {
  const { data: invoices = [] } = useQuery(orpc.account.invoices.queryOptions())

  if (invoices.length === 0) {
    return null
  }

  return (
    <SettingsGroup title="Invoices">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-2/5">Date</TableHead>
            <TableHead className="w-1/4 text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow key={invoice.id}>
              <TableCell>{format(invoice.createdAt, 'MMMM d, yyyy')}</TableCell>
              <TableCell variant="numeric">
                {formatDollars(invoice.amount / 100)}
              </TableCell>
              <TableCell>
                {uppercaseFirst(invoice.status ?? 'unknown')}
              </TableCell>
              <TableCell className="text-right">
                {invoice.url && (
                  <Button
                    variant="ghost-muted"
                    size="xs"
                    render={
                      <a
                        href={invoice.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="View invoice"
                      />
                    }
                  >
                    View
                    <HugeiconsIcon
                      icon={ArrowUpRight01Icon}
                      strokeWidth={2}
                      data-icon="inline-end"
                    />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SettingsGroup>
  )
}
