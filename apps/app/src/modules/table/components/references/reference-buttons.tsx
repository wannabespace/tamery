import {
  ArrowDownLeft01Icon,
  ArrowUpRight01Icon,
} from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import { silently } from '@tamery/shared/utils'
import { IconButton } from '@tamery/ui/components/custom/icon-button'

import { useConnectionContext } from '~/core/connection/route'
import { matchingRowsQueryOptions } from '~/core/queries/rows/list'
import type { Column } from '~/core/table/cell/utils'
import { queryClient } from '~/lib/query-client'
import { plural } from '~/utils/plural'

import type { Hop } from './hops'
import { followReference } from './hops'

export type OpenPeek = (anchor: Element, hop: Hop) => void

const ReferenceTrigger = ({
  hop,
  icon,
  label,
  onPeek,
}: {
  hop: Hop
  icon: IconSvgElement
  label: string
  onPeek: OpenPeek
}) => {
  const { connectionResource } = useConnectionContext()

  return (
    <IconButton
      variant="ghost-faint-muted"
      size="icon-2xs"
      icon={icon}
      label={label}
      side="bottom"
      tabIndex={-1}
      onClick={({ currentTarget }) =>
        onPeek(currentTarget.closest('[role="gridcell"]') ?? currentTarget, hop)
      }
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerEnter={() => {
        if (hop.kind === 'rows') {
          void silently(() =>
            queryClient.infiniteQuery(
              matchingRowsQueryOptions({ connectionResource, ...hop })
            )
          )
        }
      }}
    />
  )
}

export const ReferenceButtons = ({
  column,
  onPeek,
  value,
}: {
  column: Column
  onPeek: OpenPeek
  value: unknown
}) => {
  const references = column.references ?? []
  if (
    value === null ||
    value === undefined ||
    (!column.foreign && references.length === 0)
  ) {
    return null
  }

  return (
    <span className="ml-auto flex shrink-0">
      {column.foreign && (
        <ReferenceTrigger
          hop={followReference(column.foreign, value)}
          icon={ArrowUpRight01Icon}
          label={`Show the referenced ${column.foreign.table} row`}
          onPeek={onPeek}
        />
      )}
      {references.length > 0 && (
        <ReferenceTrigger
          hop={{ kind: 'references', references, value }}
          icon={ArrowDownLeft01Icon}
          label={`Show rows pointing here from ${plural(references.length, 'table')}`}
          onPeek={onPeek}
        />
      )}
    </span>
  )
}
