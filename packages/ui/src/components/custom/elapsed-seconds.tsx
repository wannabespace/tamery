import { NumberFlow } from '@tamery/ui/components/custom/number-flow'
import { cn } from '@tamery/ui/lib/utils'
import { useEffect, useState } from 'react'

const elapsedSeconds = (since: number) =>
  Math.round((Date.now() - since) / 1000)

export const Duration = ({
  seconds,
  className,
}: {
  seconds: number
  className?: string
}) => (
  <span className={cn('inline-flex gap-1 tabular-nums', className)}>
    <NumberFlow value={Math.floor(seconds / 60)} suffix=" min" />
    <NumberFlow value={seconds % 60} suffix=" sec" />
  </span>
)

export const ElapsedSeconds = ({
  since,
  className,
}: {
  since: number
  className?: string
}) => {
  const [seconds, setSeconds] = useState(() => elapsedSeconds(since))

  useEffect(() => {
    const interval = setInterval(() => setSeconds(elapsedSeconds(since)), 1000)

    return () => clearInterval(interval)
  }, [since])

  return <Duration seconds={seconds} className={className} />
}
