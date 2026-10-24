import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'

import { useCollections } from '~/core/collections'
import { useConnectionContext } from '~/core/connection/route'
import { saveConnectionString } from '~/core/connection/save'
import { ConnectionPage } from '~/modules/connection-form/components/connection-page'
import { getEditMode } from '~/modules/connection-form/lib/form-mode'

export const UnlockForm = ({ scope }: { scope: 'credentials' | 'details' }) => {
  const { connection, connectionResource } = useConnectionContext()
  const { connectionStringsCollection } = useCollections()
  const router = useRouter()
  const { data: connectionString } = useQuery({
    // The decrypted string holds this device's other secrets, so it leaves the cache with the form.
    gcTime: 0,
    queryFn: () =>
      scope === 'details'
        ? null
        : connectionStringsCollection.utils.decrypt(connection.id),
    queryKey: ['connection', connection.id, 'unlock', scope],
  })
  const { mutateAsync } = useMutation({
    meta: { event: `connection_${scope}_saved` },
    mutationFn: async (saved: { connectionString: string }) => {
      // The string keeps the row's `updatedAt`: an unlock never touches the synced row.
      const opened = await saveConnectionString({
        connectionId: connection.id,
        connectionString: saved.connectionString,
        updatedAt: connection.updatedAt,
      })
      toast.success(scope === 'details' ? 'Details saved' : 'Credentials saved')
      if (
        scope === 'details' &&
        opened.resource &&
        opened.resourceId !== connectionResource.id
      ) {
        await router.navigate({
          params: { resourceId: opened.resourceId },
          to: '/connection/$resourceId',
        })
      }
    },
  })

  if (connectionString === undefined) {
    return null
  }

  return (
    <ConnectionPage
      mode={getEditMode(
        connection,
        connectionString,
        connectionStringsCollection.get(connection.id),
        scope
      )}
      onSave={(saved) => mutateAsync(saved)}
    />
  )
}
