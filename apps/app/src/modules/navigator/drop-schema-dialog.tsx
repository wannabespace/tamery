import { useMutation } from '@tanstack/react-query'
import { useParams, useRouter } from '@tanstack/react-router'
import { useImperativeHandle, useState } from 'react'

import { getCapabilities } from '~/core/catalog/capabilities'
import { DropDialog } from '~/core/catalog/drop-dialog'
import { useConnectionContext } from '~/core/connection/route'
import { getConnectionResourceStore } from '~/core/connection/stores'
import { dropSchemaQuery } from '~/core/queries/schemas/drop'
import { connectionResourceToQueryParams } from '~/core/runtime/query'
import { removeTabs } from '~/core/tabs/actions'
import { parseTableTabId } from '~/core/tabs/ids'
import { queryClient } from '~/lib/query-client'

export const DropSchemaDialog = ({
  ref,
}: {
  ref: React.RefObject<{ drop: (schema: string) => void } | null>
}) => {
  const { connectionResource, dialect } = useConnectionContext()
  const { tabId } = useParams({ strict: false })
  const router = useRouter()
  const [schema, setSchema] = useState('')
  const [open, setOpen] = useState(false)
  const [cascade, setCascade] = useState(false)

  const { mutate, isPending, error, reset } = useMutation({
    meta: { event: 'schema_dropped' },
    mutationFn: async () => {
      await dropSchemaQuery({ cascade, schema }).run(
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
    drop: (next) => {
      setSchema(next)
      setCascade(false)
      reset()
      setOpen(true)
    },
  }))

  return (
    <DropDialog
      cascadable={getCapabilities(dialect).flags.includes('cascade')}
      cascade={cascade}
      error={error}
      name={schema}
      noun="schema"
      open={open}
      pending={isPending}
      onCascadeChange={setCascade}
      onDrop={() => mutate()}
      onOpenChange={setOpen}
    />
  )
}
