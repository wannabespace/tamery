import {
  ConnectionType,
  getDialect,
} from '@tamery/shared/enums/connection-type'
import {
  Select,
  SelectContent,
  SelectEmpty,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@tamery/ui/components/select'
import { and, eq, inArray, not, useLiveQuery } from '@tanstack/react-db'

import { getCapabilities } from '~/core/catalog/capabilities'
import { useCollections } from '~/core/collections'
import { canQueryConnection } from '~/core/connection/fetching'
import { ResourceLabel } from '~/core/connection/resource-label'
import { useActiveWorkspace } from '~/core/workspace/hooks'

import type { CopyEnd } from './copy-end-label'
import { CopyEndLabel } from './copy-end-label'

const COPYABLE_TYPES = Object.values(ConnectionType).filter((type) =>
  getCapabilities(getDialect(type)).flags.includes('copyDatabase')
)

export const TargetSelect = ({
  onTargetChange,
  source,
  target,
}: {
  onTargetChange: (target: CopyEnd) => void
  source: CopyEnd
  target: CopyEnd | null
}) => {
  const { connectionsCollection, connectionsResourcesCollection } =
    useCollections()
  const { data: activeWorkspace } = useActiveWorkspace()
  const { data: candidates } = useLiveQuery({
    query: (q) =>
      q
        .from({ c: connectionsCollection })
        .innerJoin({ r: connectionsResourcesCollection }, ({ c, r }) =>
          eq(r.connectionId, c.id)
        )
        .where(({ c, r }) =>
          and(
            inArray(c.type, COPYABLE_TYPES),
            not(eq(r.id, source.resource.id)),
            activeWorkspace ? eq(c.workspaceId, activeWorkspace.id) : true
          )
        )
        .select(({ c, r }) => ({ connection: c, resource: r }))
        .orderBy(({ c }) => c.name)
        .orderBy(({ r }) => r.name),
  })
  const targets = candidates.filter(({ connection }) =>
    canQueryConnection(connection)
  )
  const groups = Map.groupBy(targets, ({ connection }) => connection.id)

  return (
    <Select
      value={target?.resource.id ?? null}
      onValueChange={(resourceId) => {
        const picked = targets.find(
          ({ resource }) => resource.id === resourceId
        )
        if (picked) {
          onTargetChange(picked)
        }
      }}
    >
      <SelectTrigger aria-label="Copy to" className="w-full">
        <SelectValue placeholder="Choose a database">
          {target && <CopyEndLabel {...target} />}
        </SelectValue>
      </SelectTrigger>
      <SelectContent data-mask>
        {targets.length === 0 && (
          <SelectEmpty>No other database to copy to</SelectEmpty>
        )}
        {[...groups].map(([connectionId, group]) => (
          <SelectGroup key={connectionId}>
            <SelectLabel>{group[0]?.connection.name}</SelectLabel>
            {group.map(({ connection, resource }) => (
              <SelectItem key={resource.id} value={resource.id}>
                <ResourceLabel connection={connection} name={resource.name} />
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
