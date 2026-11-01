import { createFileRoute, redirect } from '@tanstack/react-router'
import { type } from 'arktype'

import { SITE_PATH } from '~/lib/site-path'

export const Route = createFileRoute('/deep/share')({
  validateSearch: type({
    path: SITE_PATH,
  }),
  beforeLoad: ({ context, search: { path } }) => {
    if (context.session) {
      throw redirect({
        href: `${import.meta.env.VITE_PUBLIC_SHARE_URL}${path}`,
      })
    }

    throw redirect({
      to: '/sign-in',
      search: {
        redirectPath: `/deep/share?${new URLSearchParams({ path })}`,
      },
    })
  },
})
