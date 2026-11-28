import { createFileRoute, redirect } from '@tanstack/react-router'

import { settingsSections } from '~/core/settings/sections'
import { isAnonymous } from '~/lib/auth'

export const Route = createFileRoute('/_protected/settings/')({
  loader: () => {
    const first = settingsSections.find(
      ({ needsAccount }) => !(needsAccount && isAnonymous())
    )
    if (first) {
      throw redirect({
        params: { section: first.slug },
        replace: true,
        to: '/settings/$section',
      })
    }
  },
})
