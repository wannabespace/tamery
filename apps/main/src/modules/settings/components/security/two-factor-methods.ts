import { queryOptions, useQueryClient } from '@tanstack/react-query'

import { authClient, useReloadSession } from '~/lib/auth'

export const twoFactorMethodsQueryOptions = queryOptions({
  queryFn: async () => {
    const { data, error } = await authClient.$fetch<{
      hasAuthenticator: boolean
      hasPasskey: boolean
    }>('/passkey/two-factor-methods', { method: 'GET' })

    if (error) {
      throw error
    }

    return data
  },
  queryKey: ['two-factor-methods'],
})

export const useReloadTwoFactor = () => {
  const reloadSession = useReloadSession()
  const queryClient = useQueryClient()

  return () =>
    Promise.all([
      reloadSession(),
      queryClient.invalidateQueries(twoFactorMethodsQueryOptions),
    ])
}
