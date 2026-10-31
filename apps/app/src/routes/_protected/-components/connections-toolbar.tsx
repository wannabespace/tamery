import {
  Layers01Icon,
  PlusSignIcon,
  SortByDown01Icon,
  SortByUp01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tamery/ui/components/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useSubscription } from 'seitu/react'

import { Link } from '~/components/link'
import { useIsViewOnlyWorkspace } from '~/core/workspace/hooks'
import {
  checkCanAddConnection,
  VIEW_ONLY_MESSAGE,
} from '~/core/workspace/utils'
import { plural } from '~/utils/plural'

import {
  groupOptions,
  groupValue,
  sortOptions,
  sortValue,
} from './connections-view'

export const ConnectionsToolbar = ({ count }: { count: number }) => {
  const sort = useSubscription(sortValue)
  const grouping = useSubscription(groupValue)
  const viewOnly = useIsViewOnlyWorkspace()

  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-2xs text-muted-foreground px-2 font-semibold tracking-wider uppercase">
        {plural(count, 'connection')}
      </span>
      <div className="flex items-center gap-2">
        <Select
          items={groupOptions}
          value={grouping}
          onValueChange={(value) => {
            if (value) {
              groupValue.set(value)
            }
          }}
        >
          <SelectTrigger size="sm" className="shrink-0">
            <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} />
            <SelectValue />
          </SelectTrigger>
          <SelectContent size="sm">
            {groupOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={sortOptions}
          value={sort}
          onValueChange={(value) => {
            if (value) {
              sortValue.set(value)
            }
          }}
        >
          <SelectTrigger size="sm" className="shrink-0">
            <HugeiconsIcon
              icon={sort.includes('asc') ? SortByUp01Icon : SortByDown01Icon}
              strokeWidth={2}
            />
            <SelectValue />
          </SelectTrigger>
          <SelectContent size="sm">
            {sortOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tooltip disabled={!viewOnly}>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                disabled={viewOnly}
                focusableWhenDisabled
                render={
                  viewOnly ? undefined : (
                    <Link
                      to="/create"
                      onClick={(event) => {
                        if (!checkCanAddConnection(count)) {
                          event.preventDefault()
                        }
                      }}
                    />
                  )
                }
              />
            }
          >
            <HugeiconsIcon
              icon={PlusSignIcon}
              strokeWidth={2}
              className="text-muted-foreground size-4"
            />
            New
          </TooltipTrigger>
          <TooltipContent>{VIEW_ONLY_MESSAGE}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
