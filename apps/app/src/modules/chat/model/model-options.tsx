import { DashboardSpeed01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ChatEffort } from '@tamery/ai/models'
import { Field, FieldLabel } from '@tamery/ui/components/field'
import { Separator } from '@tamery/ui/components/separator'
import { Slider } from '@tamery/ui/components/slider'
import { Switch } from '@tamery/ui/components/switch'
import { useHotkeys } from '@tanstack/react-hotkeys'
import type { RefObject } from 'react'
import { useId } from 'react'

import type { ChatModelOptions } from '../stores'

export const EFFORT_LABELS: Record<ChatEffort, string> = {
  high: 'High',
  low: 'Low',
  max: 'Max',
  medium: 'Medium',
  xhigh: 'Extra high',
}

export const CONTROLS = 'input[type="range"], [role="switch"]'

/** The model picker's options submenu: the highlighted model's Effort and Fast. Up and Down move between its controls; Escape hands focus back through `onLeave`. */
export const ModelOptions = ({
  efforts,
  options,
  onChange,
  onLeave,
  ref,
}: {
  efforts: readonly ChatEffort[]
  options: Required<ChatModelOptions>
  onChange: (option: ChatModelOptions) => void
  onLeave: () => void
  ref: RefObject<HTMLDivElement | null>
}) => {
  const fastId = useId()
  const effortIndex = efforts.indexOf(options.effort)

  const move = (step: 1 | -1) => {
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
