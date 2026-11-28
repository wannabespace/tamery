import { silently } from '@tamery/shared/utils'
import { createFileRoute, redirect } from '@tanstack/react-router'

import { orpc } from '~/lib/orpc'

import { homeHead } from './-home-head'
import { HomePage } from './-home-page'

export const Route = createFileRoute('/_layout/')({
  component: HomePage,
  head: homeHead,
  loader: async ({ context }) => {
    if (context.session) {
      throw redirect({ href: import.meta.env.VITE_PUBLIC_WEB_URL })
    }

    await silently(() =>
      context.queryClient.query({
        ...orpc.userCount.queryOptions(),
        staleTime: 'static',
      })
    )
  },
})
