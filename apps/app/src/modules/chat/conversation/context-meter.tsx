import type { AppUIMessage } from '@tamery/ai/message'
import {
  chatModelVariations,
  MIN_COMPACT_AT,
  resolveCompactAt,
} from '@tamery/ai/models/list'
import { Button } from '@tamery/ui/components/button'
import {
  Field,
  FieldDescription,
  FieldLabel,
} from '@tamery/ui/components/field'
import { InputGroupButton } from '@tamery/ui/components/input-group'
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
} from '@tamery/ui/components/number-field'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@tamery/ui/components/popover'
import { Progress } from '@tamery/ui/components/progress'
import { Spinner } from '@tamery/ui/components/spinner'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { useCollections } from '~/core/collections'
import { authClient } from '~/lib/auth'
import { orpc } from '~/lib/orpc'

import { chatActions } from '../list/chat-actions'

const RING_RADIUS = 6
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

const formatTokens = (tokens: number) =>
  tokens >= 1_000_000
    ? `${(tokens / 1_000_000).toFixed(1)}M`
    : `${Math.round(tokens / 1000)}K`

const formatCost = (usd: number) =>
  usd < 0.01 && usd > 0 ? '< $0.01' : `$${usd.toFixed(2)}`

export const ContextMeter = ({
  chatId,
  isWorking,
  messages,
}: {
  chatId: string
  isWorking: boolean
  messages: AppUIMessage[]
}) => {
  const [open, setOpen] = useState(false)
  const { chatsCollection } = useCollections()
  const { data: chat } = useLiveQuery(
    (q) =>
      q
        .from({ row: chatsCollection })
        .where(({ row }) => eq(row.id, chatId))
        .findOne(),
    [chatId]
  )
  const userCompactAt = authClient.useSession().data?.user.chatCompactAt
  const { data: cost } = useQuery(
    orpc.ai.chatCost.queryOptions({
      enabled: open,
      input: { chatId },
      staleTime: 0,
    })
  )
  const compact = useMutation(
    orpc.ai.compact.mutationOptions({
      meta: { event: 'ai_chat_compacted' },
      onSuccess: () => toast.success('Chat compacted'),
    })
  )
  const answer = messages.findLast(
    (message) => message.role === 'assistant' && message.metadata?.context
  )
  const { context = 0, model } = answer?.metadata ?? {}
  if (!(context && model)) {
    return null
  }
  const window = chatModelVariations(model).context
  const limit = resolveCompactAt(model, null)
  const threshold = resolveCompactAt(
    model,
    chat?.compactAt ?? userCompactAt ?? null
  )
  const share = Math.min(context / threshold, 1)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <InputGroupButton
            size="icon-round"
            variant="ghost-muted"
            aria-label={`Context ${Math.round(share * 100)}% of the way to compacting`}
          />
        }
      >
        <svg viewBox="0 0 16 16" className="size-4 -rotate-90">
          <circle
            cx="8"
            cy="8"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="2"
            className="stroke-foreground/15"
          />
          <circle
            cx="8"
            cy="8"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={RING_LENGTH * (1 - share)}
            className={share >= 0.9 ? 'stroke-warning' : 'stroke-current'}
          />
        </svg>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-72">
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <span className="font-medium">Context</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {formatTokens(context)} of {formatTokens(threshold)}
              </span>
            </div>
            <Progress value={share * 100} />
            <p className="text-muted-foreground text-xs">
              {`At ${formatTokens(threshold)} of the model's ${formatTokens(window)}, earlier messages are summarized before your next one.`}
            </p>
          </div>
          <Field>
            <FieldLabel>Compact at</FieldLabel>
            <NumberField
              size="sm"
              min={MIN_COMPACT_AT}
              max={limit}
              step={10_000}
              defaultValue={chat?.compactAt ?? undefined}
              onValueCommitted={(value) =>
                value !== (chat?.compactAt ?? null) &&
                chatActions.setCompactAt(chatId, value)
              }
            >
              <NumberFieldGroup>
                <NumberFieldInput
                  placeholder={`Default, ${formatTokens(
                    resolveCompactAt(model, userCompactAt ?? null)
                  )}`}
                />
              </NumberFieldGroup>
            </NumberField>
            <FieldDescription>
              Tokens, up to {formatTokens(limit)}. Empty follows your default.
            </FieldDescription>
          </Field>
          <div className="flex items-baseline justify-between">
            <span className="font-medium">Spent in this chat</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {cost === undefined ? (
                <Spinner className="size-3" />
              ) : (
                formatCost(cost)
              )}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isWorking || compact.isPending}
            onClick={() => compact.mutate({ chatId })}
          >
            {compact.isPending && <Spinner />}
            Compact now
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
