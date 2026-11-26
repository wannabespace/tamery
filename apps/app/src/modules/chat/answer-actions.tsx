import {
  Copy01Icon,
  RepeatIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from '@hugeicons/core-free-icons'
import type { AppUIMessage } from '@tamery/ai/message'
import { textFromMessage } from '@tamery/ai/message'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { copy } from '@tamery/ui/lib/copy'
import { cn } from '@tamery/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useState } from 'react'

import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'

import { MESSAGE_ACTIONS_CLASS } from './message-actions'

const formatDuration = (ms: number) => {
  const seconds = Math.max(1, Math.round(ms / 1000))
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export const AnswerActions = ({
  isLatest,
  message,
  onRegenerate,
}: {
  isLatest: boolean
  message: AppUIMessage
  onRegenerate?: () => void
}) => {
  const { data } = useQuery(
    orpc.ai.models.queryOptions({ staleTime: Infinity })
  )
  const { finishedAt, model, startedAt } = message.metadata ?? {}
  const [rating, setRating] = useState(message.metadata?.rating)
  const modelName = data?.models.find(({ id }) => id === model)?.name
  const rate = (pressed: 'down' | 'up') => {
    const next = pressed === rating ? undefined : pressed
    const { rating: _, ...metadata } = message.metadata ?? {}
    setRating(next)
    posthog.capture('ai_chat_answer_rated', { model, rating: next ?? 'none' })
    void orpc.chatsMessages.update.call({
      id: message.id,
      metadata: next ? { ...metadata, rating: next } : metadata,
    })
  }

  return (
    <div
      className={cn(
        MESSAGE_ACTIONS_CLASS,
        '-mt-3 -ml-1',
        !isLatest && 'opacity-0'
      )}
    >
      <IconButton
        variant="ghost-muted"
        size="icon-xs"
        icon={Copy01Icon}
        label="Copy answer"
        onClick={() => {
          posthog.capture('ai_chat_message_copied', { role: 'assistant' })
          void copy(textFromMessage(message), 'Copied')
        }}
      />
      {onRegenerate && (
        <IconButton
          variant="ghost-muted"
          size="icon-xs"
          icon={RepeatIcon}
          label="Regenerate"
          onClick={onRegenerate}
        />
      )}
      <IconButton
        variant={rating === 'up' ? 'ghost' : 'ghost-muted'}
        size="icon-xs"
        icon={ThumbsUpIcon}
        label="Good answer"
        aria-pressed={rating === 'up'}
        onClick={() => rate('up')}
      />
      <IconButton
        variant={rating === 'down' ? 'ghost' : 'ghost-muted'}
        size="icon-xs"
        icon={ThumbsDownIcon}
        label="Bad answer"
        aria-pressed={rating === 'down'}
        onClick={() => rate('down')}
      />
      <span className="text-muted-foreground ml-1.5 text-xs">
        {modelName}
        {modelName && startedAt && finishedAt && ' · '}
        {startedAt && finishedAt && (
          <Tooltip>
            <TooltipTrigger render={<span />}>
              {formatDuration(finishedAt - startedAt)}
            </TooltipTrigger>
            <TooltipContent side="top">
              {format(startedAt, 'MMMM d, yyyy, HH:mm')}
            </TooltipContent>
          </Tooltip>
        )}
      </span>
    </div>
  )
}
