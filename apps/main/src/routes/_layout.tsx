import { silently } from '@tamery/shared/utils'
import { createFileRoute, Outlet } from '@tanstack/react-router'

import { Footer } from '~/components/footer'
import { Navbar } from '~/components/navbar'
import { ReleaseBar } from '~/components/release-bar'
import { orpc } from '~/lib/orpc'
import { getOSIsomorphic } from '~/utils/os'

const MainLayout = () => (
  <div className="flex min-h-dvh flex-col overflow-x-clip">
    <ReleaseBar />
    <Navbar />
    <div className="flex-1">
      <Outlet />
    </div>
    <Footer />
  </div>
)

export const Route = createFileRoute('/_layout')({
  component: MainLayout,
  loader: async ({ context }) => {
    const [os] = await Promise.all([
      getOSIsomorphic(),
      silently(() =>
        context.queryClient.query({
          ...orpc.releases.queryOptions(),
          staleTime: 'static',
        })
      ),
    ])
    return os
  },
})
