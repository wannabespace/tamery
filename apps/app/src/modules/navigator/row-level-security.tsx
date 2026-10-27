import {
  SecurityBlockIcon,
  SecurityCheckIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import type { AppMenuNode } from '~/components/app-menu'
import { useConnectionContext } from '~/core/connection/route'
import { resourcePoliciesQueryOptions } from '~/core/queries/policies/list'
import { setRowLevelSecurityQuery } from '~/core/queries/policies/set-row-level-security'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { connectionResourceToQueryParams } from '~/core/runtime/query'
import { queryClient } from '~/lib/query-client'

import type { TreeRow } from './tree-row'

export const useRowLevelSecurityItems = ({
  schema,
  table,
}: Extract<TreeRow, { kind: 'table' }>): AppMenuNode[] => {
  const { connectionResource } = useConnectionContext()
  const mutation = useMutation({
    meta: { event: 'row_level_security_toggled' },
    mutationFn: async (enabled: boolean) =>
      setRowLevelSecurityQuery({
        enabled,
        name: table.name,
        schema,
        table: table.name,
      }).run(await connectionResourceToQueryParams(connectionResource)),
    onError: (error, enabled) =>
      toast.error(
        `Failed to ${enabled ? 'enable' : 'disable'} row level security on "${table.name}"`,
        { description: error.message }
      ),
    onSuccess: async (_result, enabled) => {
      await Promise.all([
        queryClient.invalidateQueries(
          resourceTablesAndSchemasQueryOptions({ connectionResource })
        ),
        queryClient.invalidateQueries(
          resourcePoliciesQueryOptions({ connectionResource })
        ),
      ])
      toast.success(
        `Row level security ${enabled ? 'enabled' : 'disabled'} on "${table.name}"`
      )
    },
  })

  if (table.type !== 'table' || table.rowLevelSecurity === undefined) {
    return []
  }

  return [
    {
      disabled: mutation.isPending,
      icon: table.rowLevelSecurity ? SecurityBlockIcon : SecurityCheckIcon,
      label: table.rowLevelSecurity ? 'Disable RLS' : 'Enable RLS',
      onSelect: () => mutation.mutate(!table.rowLevelSecurity),
    },
  ]
}

export const RowLevelSecurityMark = () => (
  <Tooltip>
    <TooltipTrigger render={<span className="shrink-0" />}>
      <HugeiconsIcon
        icon={SecurityCheckIcon}
        strokeWidth={2}
        className="text-muted-foreground size-3!"
      />
    </TooltipTrigger>
    <TooltipContent>Row level security enabled</TooltipContent>
  </Tooltip>
)
