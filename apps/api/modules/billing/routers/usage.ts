import { type } from 'arktype'

import { orpc, permissionsMiddleware } from '~/orpc'

import { usage } from '../usage'

export const get = orpc
  .use(permissionsMiddleware)
  .handler(async ({ context }) => {
    const [filters, mcp] = await Promise.all([
      usage.get(context, 'filters'),
      usage.get(context, 'mcp'),
    ])
    return { filters, mcp }
  })

export const record = orpc
  .use(permissionsMiddleware)
  .input(type({ feature: "'mcp'" }))
  .handler(({ context, input }) => usage.record(context, input.feature))
