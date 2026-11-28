import { authClient } from '~/lib/auth'
import { API_QUERY_KEY } from '~/lib/query-client'

export const twoFactorMethodsQuery = {
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
  queryKey: [API_QUERY_KEY, 'auth', 'two-factor-methods'],
}
