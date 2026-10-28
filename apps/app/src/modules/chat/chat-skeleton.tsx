import { Skeleton } from '@tamery/ui/components/skeleton'
import { cn } from '@tamery/ui/lib/utils'

import { chatHeaderClassName } from './chat-header'

const skeletonTurns = [
  { bubble: 'w-40', lines: ['w-full', 'w-11/12', 'w-3/5'] },
  { bubble: 'w-28', lines: ['w-10/12', 'w-full', 'w-2/3'] },
]

export const ChatSkeleton = ({ isPage = false }: { isPage?: boolean }) => (
  <>
    {!isPage && (
      <div className={chatHeaderClassName}>
        <Skeleton className="h-2.5 w-28 rounded-full" />
        <Skeleton className="ml-auto size-6 rounded-md" />
      </div>
    )}
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-3 py-3',
        isPage && 'mx-auto w-full max-w-3xl'
      )}
    >
      {skeletonTurns.map(({ bubble, lines }) => (
        <div key={bubble} className="flex flex-col gap-4">
          <div className={cn('self-end', bubble)}>
            <Skeleton className="h-9 rounded-3xl" />
          </div>
          <div className="flex flex-col gap-2">
            {lines.map((line) => (
              <div key={line} className={line}>
                <Skeleton className="h-2.5 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
    <div
      className={cn('shrink-0 p-2', isPage && 'mx-auto w-full max-w-3xl pb-4')}
    >
      <Skeleton className="h-20 w-full rounded-xl" />
    </div>
  </>
)
