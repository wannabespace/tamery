import { useQuery } from '@tanstack/react-query'

import { orpc } from '~/lib/orpc'

export const useLatestVersion = () => {
  const { data: releases } = useQuery(orpc.releases.queryOptions())
  const latest = releases?.[0]
  return latest ? latest.name || latest.tagName : null
}
