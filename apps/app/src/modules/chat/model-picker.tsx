import {
  AiBrain01Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tamery/ui/components/command'
import { AiProviderIcon } from '@tamery/ui/components/icons/ai-provider-icon'
import { InputGroupButton } from '@tamery/ui/components/input-group'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@tamery/ui/components/popover'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSubscription } from 'seitu/react'

import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'
import { ActionItem, ListEmpty } from '~/modules/runner/components/popover-list'

import type { ChatEffort, ChatModelOptions } from './stores'
import {
  chatModelOptionsValue,
  chatModelValue,
  modelPickerOpenStore,
  recentChatModelsValue,
} from './stores'

const EFFORT_LABELS: Record<ChatEffort, string> = {
  high: 'High',
  low: 'Low',
  medium: 'Medium',
  xhigh: 'Max',
}

const RECENT_LIMIT = 4

const matchesName = (value: string, search: string, keywords?: string[]) =>
  [value, ...(keywords ?? [])]
    .join(' ')
    .toLowerCase()
    .includes(search.trim().toLowerCase())
    ? 1
    : 0

const formatContext = (tokens: number) =>
  tokens >= 1_000_000
    ? `${Math.floor(tokens / 1_000_000)}M`
    : `${Math.round(tokens / 1000)}K`

const setOpen = (next: boolean) => modelPickerOpenStore.set(next)

const remember = (id: string) =>
  recentChatModelsValue.set((recent) =>
    [id, ...recent.filter((other) => other !== id)].slice(0, RECENT_LIMIT)
  )

const forget = (id: string) => {
  recentChatModelsValue.set((recent) => recent.filter((other) => other !== id))
  posthog.capture('ai_chat_recent_model_removed')
}

const choose = (id: string) => {
  chatModelValue.set(id)
  remember(id)
}

const setOption = (id: string, option: ChatModelOptions) => {
  chatModelOptionsValue.set((all) => ({
    ...all,
    [id]: { ...all[id], ...option },
  }))
  choose(id)
  posthog.capture('ai_chat_model_option_changed', {
    option: Object.keys(option)[0],
  })
}

const modelId = (value: string) => value.replace(/^recent:/u, '')

const caretAtEnd = (target: EventTarget) =>
  !(target instanceof HTMLInputElement) ||
  target.selectionStart === target.value.length

export const ModelPicker = () => {
  const { data } = useQuery(
    orpc.ai.models.queryOptions({ staleTime: Infinity })
  )
  const picked = useSubscription(chatModelValue)
  const recentIds = useSubscription(recentChatModelsValue)
  const allOptions = useSubscription(chatModelOptionsValue)
  const open = useSubscription(modelPickerOpenStore)
  const [search, setSearch] = useState('')
  const [highlighted, setHighlighted] = useState('')
  const [configuringId, setConfiguringId] = useState<string | null>(null)
  const models = data?.models ?? []
  const current =
    models.find((model) => model.id === picked) ??
    models.find((model) => model.id === data?.defaultId)
  const configuring = models.find((model) => model.id === configuringId)
  const recent = recentIds.flatMap(
    (id) => models.find((model) => model.id === id) ?? []
  )
  const listed = search
    ? models
    : models.filter((model) => model.featured || model.id === current?.id)
  const providers = [...new Set(listed.map((model) => model.provider))]

  const optionsOf = (model: (typeof models)[number]) => ({
    context: allOptions[model.id]?.context ?? model.contexts.at(-1) ?? 0,
    effort: allOptions[model.id]?.effort ?? data?.defaultEffort ?? 'medium',
    fast: allOptions[model.id]?.fast ?? false,
  })

  const summary = (model: (typeof models)[number]) => {
    const options = optionsOf(model)
    return [
      EFFORT_LABELS[options.effort],
      formatContext(options.context),
      options.fast && 'Fast',
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const configure = (id: string) => {
    setConfiguringId(id)
    setSearch('')
    setHighlighted('')
  }

  const back = () => {
    setHighlighted(configuringId ?? '')
    setConfiguringId(null)
    setSearch('')
  }

  const select = (id: string) => {
    choose(id)
    setOpen(false)
    setSearch('')
    posthog.capture('ai_chat_model_changed', { model: id })
  }

  const modelRow = (model: (typeof models)[number], value: string) => (
    <>
      <span className="flex-1 truncate">{model.name}</span>
      {model.id === current?.id && (
        <span className="text-muted-foreground text-xs">{summary(model)}</span>
      )}
      <Button
        variant="ghost-muted"
        size="icon-xs"
        aria-label="Effort, context and speed"
        tabIndex={-1}
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onClick={(event) => {
          event.stopPropagation()
          setHighlighted(value)
          configure(model.id)
        }}
      >
        <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
      </Button>
    </>
  )

  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        // Escape is one step of the ladder: out of a model's options first, then the picker.
        if (!next && details.reason === 'escape-key' && configuringId) {
          details.cancel()
          back()
          return
        }
        setOpen(next)
        if (!next) {
          setSearch('')
          setConfiguringId(null)
        }
      }}
    >
      <PopoverTrigger
        render={
          <InputGroupButton
            variant="ghost-muted"
            className="min-w-0"
            disabled={!data}
          />
        }
      >
        <span className="text-foreground truncate">
          {current?.name ?? 'Model'}
        </span>
        {current && <span className="shrink-0">{summary(current)}</span>}
        <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" padding="none" className="w-80">
        <Command
          loop
          filter={matchesName}
          value={highlighted}
          onValueChange={setHighlighted}
          onKeyDown={(event) => {
            const id = modelId(highlighted)
            if (
              event.key === 'ArrowRight' &&
              !configuring &&
              models.some((model) => model.id === id) &&
              caretAtEnd(event.target)
            ) {
              event.preventDefault()
              configure(id)
            } else if (
              configuring &&
              ((event.key === 'ArrowLeft' && !search) || event.key === 'Escape')
            ) {
              // preventDefault also keeps the window's Escape-to-Navigator from pulling focus out, which would close the picker.
              event.preventDefault()
              event.stopPropagation()
              back()
            }
          }}
        >
          <CommandInput
            placeholder={configuring ? 'Search options' : 'Search all models'}
            autoFocus
            value={search}
            onValueChange={setSearch}
          />
          {configuring ? (
            <CommandList className="max-h-104">
              <CommandGroup>
                <CommandItem value="back" onSelect={back}>
                  <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
                  <span className="flex-1 truncate">{configuring.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {summary(configuring)}
                  </span>
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="Effort">
                {data?.efforts.map((level) => (
                  <CommandItem
                    key={level}
                    value={`effort:${level}`}
                    keywords={['effort', EFFORT_LABELS[level]]}
                    data-checked={optionsOf(configuring).effort === level}
                    onSelect={() =>
                      setOption(configuring.id, { effort: level })
                    }
                  >
                    {EFFORT_LABELS[level]}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="Context">
                {configuring.contexts.map((tokens) => (
                  <CommandItem
                    key={tokens}
                    value={`context:${tokens}`}
                    keywords={['context', formatContext(tokens)]}
                    data-checked={optionsOf(configuring).context === tokens}
                    onSelect={() =>
                      setOption(configuring.id, { context: tokens })
                    }
                  >
                    {formatContext(tokens)}
                    <span className="text-muted-foreground text-xs">
                      {tokens === configuring.contexts.at(-1)
                        ? 'The whole chat'
                        : 'Older turns drop off'}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="Speed">
                <CommandItem
                  value="fast"
                  keywords={['fast', 'speed']}
                  data-checked={optionsOf(configuring).fast}
                  onSelect={() =>
                    setOption(configuring.id, {
                      fast: !optionsOf(configuring).fast,
                    })
                  }
                >
                  Fast
                  <span className="text-muted-foreground text-xs">
                    Fastest providers, may cost more
                  </span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          ) : (
            // A fixed height, not a cap: the popover opens upward from its bottom edge, so a list that resized with the results would move the search field under the caret.
            <CommandList className="h-72">
              <ListEmpty icon={AiBrain01Icon}>No matching models</ListEmpty>
              {!search && recent.length > 0 && (
                <CommandGroup heading="Recent">
                  {recent.map((model) => (
                    <ActionItem
                      key={model.id}
                      value={`recent:${model.id}`}
                      data-checked={model.id === current?.id}
                      onSelect={() => select(model.id)}
                      actions={[
                        {
                          icon: Cancel01Icon,
                          label: 'Remove from Recent',
                          onSelect: () => forget(model.id),
                        },
                      ]}
                    >
                      {modelRow(model, `recent:${model.id}`)}
                    </ActionItem>
                  ))}
                </CommandGroup>
              )}
              {providers.map((provider) => (
                <CommandGroup
                  key={provider}
                  heading={
                    <span className="flex items-center gap-1.5">
                      <AiProviderIcon
                        provider={provider}
                        className="size-3.5"
                      />
                      {provider}
                    </span>
                  }
                >
                  {listed
                    .filter((model) => model.provider === provider)
                    .map((model) => (
                      <CommandItem
                        key={model.id}
                        value={model.id}
                        keywords={[model.name, provider]}
                        data-checked={model.id === current?.id}
                        onSelect={() => select(model.id)}
                      >
                        {modelRow(model, model.id)}
                      </CommandItem>
                    ))}
                </CommandGroup>
              ))}
            </CommandList>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
