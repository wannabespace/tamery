import { Spinner } from '@tamery/ui/components/spinner'

import type { ChatToolPart } from './chat-tool-types'

export const getStatus = (part: ChatToolPart, isLast: boolean) => {
  if (part.state === 'output-error') {
    return <span className="text-destructive">Failed</span>
  }
  if (part.state === 'output-available') {
    return null
  }
  return isLast ? (
    <Spinner className="size-3" />
  ) : (
    <span className="text-muted-foreground">Not run</span>
  )
}
