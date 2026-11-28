import { db } from '@tamery/db'

import { authMiddleware, orpc } from '~/orpc'

export const list = orpc.use(authMiddleware).handler(({ context }) =>
  db.query.chats.findMany({
    orderBy: {
      createdAt: 'desc',
    },
    where: {
      userId: context.user.id,
    },
    with: {
      messages: {
        orderBy: { createdAt: 'desc' },
        with: {
          parts: {
            orderBy: { order: 'asc' },
          },
        },
      },
    },
  })
)
