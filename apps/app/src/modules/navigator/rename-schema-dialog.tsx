import { Dialog, DialogContent } from '@tamery/ui/components/dialog'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useParams, useRouter } from '@tanstack/react-router'
import { useImperativeHandle, useState } from 'react'

import { useConnectionContext } from '~/core/connection/route'
import { getConnectionResourceStore } from '~/core/connection/stores'
import { renameSchemaQuery } from '~/core/queries/schemas/rename'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { connectionResourceToQueryParams } from '~/core/runtime/query'
import { removeTabs } from '~/core/tabs/actions'
import { parseTableTabId } from '~/core/tabs/ids'
import { queryClient } from '~/lib/query-client'

import { SchemaForm } from './create-schema-dialog'

export const RenameSchemaDialog = ({
  ref,
}: {
  ref: React.RefObject<{ rename: (schema: string) => void } | null>
}) => {
  const { connectionResource } = useConnectionContext()
  const { tabId } = useParams({ strict: false })
  const router = useRouter()
  const [schema, setSchema] = useState('')
  const [open, setOpen] = useState(false)
  const { data: tablesAndSchemas } = useQuery(
    resourceTablesAndSchemasQueryOptions({ connectionResource })
  )

  const {
    error,
    isPending,
    mutate: renameSchema,
    reset,
  } = useMutation({
    meta: { event: 'schema_renamed' },
    mutationFn: async (name: string) => {
      await renameSchemaQuery({ name, schema }).run(
        await connectionResourceToQueryParams(connectionResource)
      )
    },
    onSuccess: async () => {
      setOpen(false)
      queryClient.invalidateQueries({
        queryKey: ['connection-resource', connectionResource.id],
      })
      // Before navigating: the resource index redirects back to the active tab while it is still listed.
      removeTabs(
        connectionResource.id,
        getConnectionResourceStore(connectionResource.id)
          .get()
          .tabs.map((tab) => tab.id)
          .filter((id) => parseTableTabId(id)?.schema === schema)
      )
      if (tabId && parseTableTabId(tabId)?.schema === schema) {
        await router.navigate({
          params: { resourceId: connectionResource.id },
          to: '/connection/$resourceId',
        })
      }
    },
  })

  useImperativeHandle(ref, () => ({
    rename: (next) => {
      reset()
      setSchema(next)
      setOpen(true)
    },
  }))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <SchemaForm
          key={schema}
          schema={schema}
          error={error}
          isTaken={(name) =>
            !!tablesAndSchemas?.schemas.some((other) => other.name === name)
          }
          pending={isPending}
          onSubmit={renameSchema}
        />
      </DialogContent>
    </Dialog>
  )
}
