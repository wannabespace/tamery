import type { ChatToolPart } from './chat-tool-types'
import { DECLINED } from './chat-tools'

export const isDeclined = (part: ChatToolPart) =>
  part.state === 'output-error' && part.errorText === DECLINED

/** While its turn still works an unsettled call is running; once the turn ended or was stopped, it never ran. */
export const isRunning = (part: ChatToolPart, isLive: boolean) =>
  isLive && part.state !== 'output-available' && part.state !== 'output-error'

export const getStatus = (part: ChatToolPart, isLive: boolean) => {
  if (isDeclined(part)) {
    return <span className="text-muted-foreground">Declined</span>
  }
  if (part.state === 'output-error') {
    return <span className="text-destructive">Failed</span>
  }
  if (part.state === 'output-available') {
    return null
  }
  return isLive ? (
    <span className="shimmer">Running</span>
  ) : (
    <span className="text-muted-foreground">Not run</span>
  )
}
