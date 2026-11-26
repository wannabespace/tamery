import {
  AiBrain01Icon,
  ArrowDown01Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { matchesSearch } from '@tamery/shared/utils'
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
import { useRef, useState } from 'react'
import { useSubscription } from 'seitu/react'

import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'
import { ActionItem, ListEmpty } from '~/modules/runner/components/popover-list'

import {
  CONTROLS,
  EFFORT_LABELS,
  ModelOptions,
  formatContext,
} from './model-options'
import type { ChatModelOptions } from './stores'
import {
  chatModelOptionsValue,
  chatModelValue,
  modelPickerOpenStore,
  recentChatModelsValue,
} from './stores'

const RECENT_LIMIT = 4

const matchesName = (value: string, search: string, keywords?: string[]) =>
  matchesSearch(search, [value, ...(keywords ?? [])].join(' ')) ? 1 : 0

const forget = (id: string) => {
  recentChatModelsValue.set((recent) => recent.filter((other) => other !== id))
  posthog.capture('ai_chat_recent_model_removed')
}

const choose = (id: string | null) => {
  chatModelValue.set(id)
  if (id) {
    recentChatModelsValue.set((recent) =>
      [id, ...recent.filter((other) => other !== id)].slice(0, RECENT_LIMIT)
    )
  }
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
  const searchRef = useRef<HTMLInputElement>(null)
  const optionsRef = useRef<HTMLDivElement>(null)
  const [activeRow, setActiveRow] = useState<HTMLElement | null>(null)
  const models = data?.models ?? []
  const current = models.find((model) => model.id === picked)
  const recent = recentIds.flatMap(
    (id) => models.find((model) => model.id === id) ?? []
  )
  const currentRow =
    current &&
    (recentIds.includes(current.id) ? `recent:${current.id}` : current.id)
  const active = highlighted || currentRow || 'auto'
  const activeModel = models.find(
    (model) => model.id === active.replace(/^recent:/u, '')
  )
  const providers = [...new Set(models.map((model) => model.provider))]

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

  const setOpen = (next: boolean) => {
    modelPickerOpenStore.set(next)
    if (!next) {
      setSearch('')
      setHighlighted('')
    }
  }

  const select = (id: string | null) => {
    choose(id)
    setOpen(false)
    posthog.capture('ai_chat_model_changed', { model: id ?? 'auto' })
  }

  // cmdk scrolls before a controlled value reaches the DOM, so it would bring the previous row into view; the row scrolls itself once highlighted.
  const showRow = (row: HTMLElement | null) => {
    setActiveRow(row)
    if (!row || row.matches(':hover')) {
      return
    }
    if (row.parentElement?.firstElementChild === row) {
      row
        .closest('[cmdk-group]')
        ?.querySelector('[cmdk-group-heading]')
        ?.scrollIntoView({ block: 'nearest' })
    }
    row.scrollIntoView({ block: 'nearest' })
  }

  const rowRef = (value: string) => (value === active ? showRow : undefined)

  const modelRow = (model: (typeof models)[number]) => (
    <>
      {model.name}
      {model.id === current?.id && (
        <span className="text-muted-foreground flex-1 truncate text-xs">
          {summary(model)}
        </span>
      )}
    </>
  )

  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        // Escape is one step of the ladder: the options panel hands focus back to the search first, then the picker closes.
        if (
          !next &&
          details.reason === 'escape-key' &&
          details.event.target instanceof Node &&
          optionsRef.current?.contains(details.event.target)
        ) {
          details.cancel()
          return
        }
        setOpen(next)
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
        {current && <AiProviderIcon provider={current.provider} />}
        <span className="text-foreground truncate">
          {current?.name ?? 'Auto model'}
        </span>
        <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" padding="none" className="w-80">
        <Command
          loop
          filter={matchesName}
          value={active}
          onValueChange={setHighlighted}
          onKeyDown={(event) => {
            const caretAtEnd =
              !(event.target instanceof HTMLInputElement) ||
              event.target.selectionStart === event.target.value.length
            if (event.key === 'ArrowRight' && activeModel && caretAtEnd) {
              event.preventDefault()
              optionsRef.current?.querySelector<HTMLElement>(CONTROLS)?.focus()
            } else if (
              (event.key === 'Backspace' || event.key === 'Delete') &&
              !search &&
              activeModel &&
              active.startsWith('recent:')
            ) {
              event.preventDefault()
              const index = recent.indexOf(activeModel)
              const neighbour = recent[index + 1] ?? recent[index - 1]
              setHighlighted(neighbour ? `recent:${neighbour.id}` : 'auto')
              forget(activeModel.id)
            }
          }}
        >
          <CommandInput
            ref={searchRef}
            placeholder="Search models"
            autoFocus
            value={search}
            onValueChange={setSearch}
          />
          {/* A fixed height, not a cap: the popover opens upward from its bottom edge, so a list that resized with the results would move the search field under the caret. */}
          <CommandList className="h-72">
            <ListEmpty icon={AiBrain01Icon}>No matching models</ListEmpty>
            <CommandGroup>
              <CommandItem
                ref={rowRef('auto')}
                value="auto"
                keywords={['Auto']}
                data-checked={!current}
                onSelect={() => select(null)}
              >
                Auto
                <span className="text-muted-foreground flex-1 truncate text-xs">
                  Picks a model for each message
                </span>
              </CommandItem>
            </CommandGroup>
            {!search && recent.length > 0 && (
              <CommandGroup heading="Recent">
                {recent.map((model) => (
                  <ActionItem
                    key={model.id}
                    ref={rowRef(`recent:${model.id}`)}
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
                    <AiProviderIcon provider={model.provider} />
                    {modelRow(model)}
                  </ActionItem>
                ))}
              </CommandGroup>
            )}
            {providers.map((provider) => (
              <CommandGroup
                key={provider}
                heading={
                  <span className="flex items-center gap-1.5">
                    <AiProviderIcon provider={provider} className="size-3.5" />
                    {provider}
                  </span>
                }
              >
                {models
                  .filter((model) => model.provider === provider)
                  .map((model) => (
                    <CommandItem
                      key={model.id}
                      ref={rowRef(model.id)}
                      value={model.id}
                      keywords={[model.name, provider]}
                      data-checked={model.id === current?.id}
                      onSelect={() => select(model.id)}
                    >
                      {modelRow(model)}
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        <Popover
          open={open && !!activeModel}
          onOpenChange={(next, details) => {
            if (next || details.reason !== 'escape-key') {
              return
            }
            if (
              details.event.target instanceof Node &&
              optionsRef.current?.contains(details.event.target)
            ) {
              searchRef.current?.focus()
            } else {
              setOpen(false)
            }
          }}
        >
          <PopoverContent
            side="right"
            align="start"
            alignOffset={-4}
            padding="none"
            className="w-64 in-data-anchor-hidden:hidden"
            anchor={activeRow}
            initialFocus={false}
            finalFocus={false}
          >
            {activeModel && data && (
              <ModelOptions
                ref={optionsRef}
                contexts={activeModel.contexts}
                efforts={data.efforts}
                options={optionsOf(activeModel)}
                onChange={(option) => setOption(activeModel.id, option)}
                onLeave={() => searchRef.current?.focus()}
              />
            )}
          </PopoverContent>
        </Popover>
      </PopoverContent>
    </Popover>
  )
}
