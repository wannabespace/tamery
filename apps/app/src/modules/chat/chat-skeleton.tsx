import { Skeleton } from '@tamery/ui/components/skeleton'
import { cn } from '@tamery/ui/lib/utils'

const skeletonTurns = [
  { bubble: 'w-40', lines: ['w-full', 'w-11/12', 'w-3/5'] },
  { bubble: 'w-28', lines: ['w-10/12', 'w-full', 'w-2/3'] },
]

export const ChatSkeleton = () => (
  <>
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-3 py-3">
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
    <div className="mx-auto w-[min(32rem,100%)] shrink-0 p-2">
      <Skeleton className="h-24 rounded-xl" />
    </div>
  </>
)
