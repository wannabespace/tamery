import type { ChatToolPart } from './chat-tool-types'
import { DECLINED } from './chat-tools'

export const isDeclined = (part: ChatToolPart) =>
  part.state === 'output-error' && part.errorText === DECLINED

/** On the last turn an unsettled call is still running; on an earlier one it never ran. */
export const isRunning = (part: ChatToolPart, isLast: boolean) =>
  isLast && part.state !== 'output-available' && part.state !== 'output-error'

export const getStatus = (part: ChatToolPart, isLast: boolean) => {
  if (isDeclined(part)) {
    return <span className="text-muted-foreground">Declined</span>
  }
  if (part.state === 'output-error') {
    return <span className="text-destructive">Failed</span>
  }
  if (part.state === 'output-available') {
    return null
  }
  return isLast ? (
    <span className="shimmer">Running</span>
  ) : (
    <span className="text-muted-foreground">Not run</span>
  )
}
