import { Spinner } from '@tamery/ui/components/spinner'

import type { ChatToolPart } from './chat-tool-types'

const isSettled = (part: ChatToolPart) =>
  part.state === 'output-available' || part.state === 'output-error'

export const getStatus = (part: ChatToolPart, isLast: boolean) => {
  if (part.state === 'output-error') {
    return <span className="text-destructive">Failed</span>
  }
  if (isSettled(part)) {
    return null
  }
  return isLast ? (
    <Spinner className="size-3" />
  ) : (
    <span className="text-muted-foreground">Not run</span>
  )
}
