import { createFileRoute, redirect } from '@tanstack/react-router'
import { type } from 'arktype'

export const Route = createFileRoute('/deep/share')({
  validateSearch: type({
    // Without the leading slash, `@host` appended to the share origin names another host.
    path: /^\//u,
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
