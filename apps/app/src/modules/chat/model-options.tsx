import { DashboardSpeed01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ChatEffort } from '@tamery/ai/models'
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@tamery/ui/components/command'
import { Field, FieldLabel, FieldTitle } from '@tamery/ui/components/field'
import { Separator } from '@tamery/ui/components/separator'
import { Slider } from '@tamery/ui/components/slider'
import { Switch } from '@tamery/ui/components/switch'
import { useHotkeys } from '@tanstack/react-hotkeys'
import type { RefObject } from 'react'
import { useId, useRef, useState } from 'react'

import type { ChatModelOptions } from './stores'

export const EFFORT_LABELS: Record<ChatEffort, string> = {
  high: 'High',
  low: 'Low',
  medium: 'Medium',
  xhigh: 'Max',
}

export const formatContext = (tokens: number) =>
  tokens >= 1_000_000
    ? `${Math.floor(tokens / 1_000_000)}M`
    : `${Math.round(tokens / 1000)}K`

export const CONTROLS = 'input[type="range"], [cmdk-root], [role="switch"]'

// Any value naming no row: an empty one makes cmdk highlight the first row while focus is elsewhere.
const NO_CONTEXT = '-'

/** The model picker's options submenu: the highlighted model's Effort, Context and Fast. Up and Down move between its controls; Escape hands focus back through `onLeave`. */
export const ModelOptions = ({
  contexts,
  efforts,
  options,
  onChange,
  onLeave,
  ref,
}: {
  contexts: number[]
  efforts: readonly ChatEffort[]
  options: Required<ChatModelOptions>
  onChange: (option: ChatModelOptions) => void
  onLeave: () => void
  ref: RefObject<HTMLDivElement | null>
}) => {
  const fastId = useId()
  const contextListRef = useRef<HTMLDivElement>(null)
  const [contextRow, setContextRow] = useState(NO_CONTEXT)
  const effortIndex = efforts.indexOf(options.effort)

  const move = (step: 1 | -1) => {
    if (document.activeElement === contextListRef.current) {
      const next = contexts[contexts.indexOf(Number(contextRow)) + step]
      if (next !== undefined) {
        setContextRow(String(next))
        return
      }
    }
    const controls = [
      ...(ref.current?.querySelectorAll<HTMLElement>(CONTROLS) ?? []),
    ]
    const to = controls.indexOf(document.activeElement as HTMLElement) + step
    controls[Math.min(Math.max(to, 0), controls.length - 1)]?.focus()
  }

  useHotkeys(
    [
      { callback: () => move(1), hotkey: 'ArrowDown' },
      { callback: () => move(-1), hotkey: 'ArrowUp' },
      { callback: onLeave, hotkey: 'Escape' },
    ],
    // Capture with stopPropagation: a slider would take Up and Down as a step, and the window's Escape-to-Navigator would pull focus out and close the picker.
    { capture: true, ignoreInputs: false, stopPropagation: true, target: ref }
  )
  return (
    <div ref={ref} className="flex flex-col gap-4 p-3">
      {efforts.length > 1 && (
        <>
          <Field>
            <Field orientation="horizontal">
              <FieldLabel>Effort</FieldLabel>
              <span className="text-muted-foreground text-sm">
                {EFFORT_LABELS[options.effort]}
              </span>
            </Field>
            <Slider
              variant="steps"
              aria-label="Effort"
              min={0}
              max={efforts.length - 1}
              value={effortIndex}
              onValueChange={(index) => {
                const effort = efforts[index as number]
                if (effort) {
                  onChange({ effort })
                }
              }}
            />
          </Field>
          <Separator />
        </>
      )}
      <div>
        <FieldTitle>Context</FieldTitle>
        {/* Pulled out to the popover's edge so the rows' text lines up with the titles while their highlight keeps a menu's inset, and up by the group's bottom padding so the gaps around the separators match. */}
        <Command
          ref={contextListRef}
          variant="transparent"
          aria-label="Context"
          tabIndex={0}
          className="-mx-3 -mb-1 w-auto"
          value={contextRow}
          onValueChange={setContextRow}
          onFocus={() => setContextRow(String(options.context))}
          onBlur={() => setContextRow(NO_CONTEXT)}
        >
          <CommandList>
            <CommandGroup>
              {contexts.map((tokens) => (
                <CommandItem
                  key={tokens}
                  value={String(tokens)}
                  data-checked={options.context === tokens}
                  onSelect={() => onChange({ context: tokens })}
                >
                  {formatContext(tokens)}
                  <span className="text-muted-foreground flex-1 truncate text-xs">
                    {tokens === contexts.at(-1)
                      ? 'Remembers more, costs more'
                      : 'Cheaper, forgets sooner'}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
      <Separator />
      <Field orientation="horizontal">
        <FieldLabel htmlFor={fastId}>
          <HugeiconsIcon
            icon={DashboardSpeed01Icon}
            strokeWidth={2}
            className="text-muted-foreground size-4"
          />
          Fast mode
        </FieldLabel>
        <Switch
          id={fastId}
          size="sm"
          checked={options.fast}
          onCheckedChange={(fast) => onChange({ fast })}
        />
      </Field>
    </div>
  )
}
