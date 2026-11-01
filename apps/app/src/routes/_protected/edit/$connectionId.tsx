import { SyncType } from '@tamery/shared/enums/sync-type'
import { isKeychainLocked } from '@tamery/shared/keychain'
import { title } from '@tamery/shared/title'
import { EDITOR_ROLES } from '@tamery/shared/workspace'
import { Spinner } from '@tamery/ui/components/spinner'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute, getRouteApi, redirect } from '@tanstack/react-router'
import { Result } from 'better-result'
import { toast } from 'sonner'

import type { ConnectionDetails } from '~/core/connection/save'
import { updateConnection } from '~/core/connection/save'
import { useGoBack } from '~/hooks/use-go-back'
import { ConnectionPage } from '~/modules/connection-form/components/connection-page'
import { getEditMode } from '~/modules/connection-form/lib/form-mode'

const { useLoaderData } = getRouteApi('/_protected/edit/$connectionId')

const EditConnectionPage = () => {
  const { connection, mode } = useLoaderData()
  const goBack = useGoBack({ ignoreBlocker: true })
  const { mutateAsync } = useMutation({
    meta: { event: 'connection_updated' },
    mutationFn: async (saved: ConnectionDetails) => {
      await updateConnection(connection.id, saved)
      goBack()
      toast.success('Connection saved')
    },
  })
  return <ConnectionPage mode={mode} onSave={(saved) => mutateAsync(saved)} />
}

export const Route = createFileRoute('/_protected/edit/$connectionId')({
  loader: async ({ context: { collections }, params }) => {
    const connection = collections.connectionsCollection.get(
      params.connectionId
    )
    const workspace =
      connection && collections.workspacesCollection.get(connection.workspaceId)
    if (!(connection && workspace && EDITOR_ROLES.includes(workspace.role))) {
      throw redirect({ to: '/' })
    }
    const decrypted = await Result.tryPromise(() =>
      collections.connectionStringsCollection.utils.decrypt(connection.id)
    )
    if (decrypted.isErr() && isKeychainLocked(decrypted.error.cause)) {
      throw decrypted.error.cause
    }
    const connectionString = decrypted.unwrapOr(null)
    if (
      connectionString === null &&
      connection.syncType !== SyncType.CloudWithoutConnectionString
    ) {
      toast.error(`Couldn't edit ${connection.name}`, {
        description: 'Its server details aren’t on this device.',
      })
      throw redirect({ to: '/' })
    }
    return {
      connection,
      mode: getEditMode(
        connection,
        connectionString,
        collections.connectionStringsCollection.get(connection.id),
        'all'
      ),
    }
  },
  component: EditConnectionPage,
  // The form reads its values once, so a cached match would reopen it on the values before the last save.
  gcTime: 0,
  pendingComponent: () => (
    <div className="text-muted-foreground flex h-full items-center justify-center">
      <Spinner />
    </div>
  ),
  pendingMs: 150,
  head: () => ({
    meta: [{ title: title('Edit connection') }],
  }),
})
