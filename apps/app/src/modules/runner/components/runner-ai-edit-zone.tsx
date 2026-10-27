import { AiIdeaIcon, SparklesIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { AI_QUERY_LIMITS } from '@tamery/ai/limits'
import { AttachmentGroup } from '@tamery/ui/components/attachment'
import { Button } from '@tamery/ui/components/button'
import { EnterIcon } from '@tamery/ui/components/custom/shortcuts'
import {
  InputGroup,
  InputGroupButton,
  InputGroupTextarea,
} from '@tamery/ui/components/input-group'
import { Kbd } from '@tamery/ui/components/kbd'
import { Spinner } from '@tamery/ui/components/spinner'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { cn } from '@tamery/ui/lib/utils'
import { useHotkeys } from '@tanstack/react-hotkeys'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useSubscription } from 'seitu/react'
import { createElementSize } from 'seitu/web'
import { toast } from 'sonner'

import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'

import { PastedImage } from './pasted-image'

export type Phase =
  | { kind: 'prompt'; busy: boolean }
  | { kind: 'fixing'; error: string }
  | { kind: 'review'; original: string; applied: string; fix: boolean }

const RejectButton = ({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) => (
  <Tooltip shortcut={<ShortcutKbd shortcut="stepBack" />}>
    <TooltipTrigger
      render={<Button size="xs" variant="ghost" onClick={onClick} />}
    >
      {label}
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
)

export const AiEditZone = ({
  phase,
  onAccept,
  onClose,
  onResize,
  onSubmit,
}: {
  phase: Phase
  onAccept: () => void
  onClose: () => void
  onResize: (height: number) => void
  onSubmit: (prompt: string, images: File[]) => void
}) => {
  const [images, setImages] = useState<{ file: File; id: string }[]>([])
  const [form, setForm] = useState<HTMLFormElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const resize = useEffectEvent(onResize)

  useHotkeys(
    [
      { callback: onClose, hotkey: 'Escape' },
      {
        callback: (event) => {
          if (!event.isComposing) {
            event.preventDefault()
            form?.requestSubmit()
          }
        },
        hotkey: 'Enter',
        options: { preventDefault: false },
      },
    ],
    { ignoreInputs: false, target: inputRef }
  )

  useEffect(() => {
    if (phase.kind === 'prompt') {
      inputRef.current?.focus()
    }
  }, [phase.kind])

  const { height } = useSubscription(
    () => createElementSize({ element: form }),
    { deps: [form] }
  )

  useEffect(() => {
    if (height > 0) {
      resize(height)
    }
  }, [height])

  const icon = (
    <HugeiconsIcon
      icon={
        phase.kind === 'fixing' || (phase.kind === 'review' && phase.fix)
          ? AiIdeaIcon
          : SparklesIcon
      }
      strokeWidth={2}
      className="text-muted-foreground size-3.5 shrink-0"
    />
  )

  return (
    <form
      ref={setForm}
      className={cn(
        'mt-1.5 ml-3 w-lg max-w-[calc(100%-2.5rem)]',
        phase.kind !== 'prompt' &&
          'bg-popover ring-foreground/4 flex h-8 items-center gap-2 rounded-xl pr-1.5 pl-2.5 shadow-md ring'
      )}
      onSubmit={(event) => {
        event.preventDefault()
        const prompt = inputRef.current?.value.trim() ?? ''
        if (prompt || images.length > 0) {
          onSubmit(
            prompt,
            images.map(({ file }) => file)
          )
        }
      }}
    >
      {phase.kind === 'prompt' && (
        <InputGroup variant="floating">
          <InputGroupTextarea
            ref={inputRef}
            data-mask
            rows={1}
            className={cn(
              'max-h-32 min-h-8 py-1.5 pr-10 pl-8 read-only:opacity-50',
              // Sync with the xs AttachmentGroup's height: the images overlay this padding.
              images.length > 0 && 'max-h-46 pb-14'
            )}
            placeholder="Describe how to change this statement…"
            // Read-only, not disabled: a disabled input drops focus, and Esc must still cancel the request.
            readOnly={phase.busy}
            spellCheck={false}
            onPaste={(event) => {
              const pasted = [...event.clipboardData.files].filter((file) =>
                file.type.startsWith('image/')
              )
              if (pasted.length === 0) {
                return
              }
              event.preventDefault()
              const fitting = pasted.filter(
                (file) => file.size <= AI_QUERY_LIMITS.imageBytes
              )
              if (fitting.length < pasted.length) {
                toast.error('Images over 5 MB are left out')
              }
              setImages((current) =>
                [
                  ...current,
                  ...fitting.map((file) => ({ file, id: crypto.randomUUID() })),
                ].slice(0, AI_QUERY_LIMITS.images)
              )
            }}
          />
          <div className="pointer-events-none absolute top-2.25 left-2.5 flex">
            {icon}
          </div>
          <div className="pointer-events-none absolute inset-x-1 bottom-1 flex items-center gap-1.5 pl-7">
            {images.length > 0 && (
              <AttachmentGroup
                className="pointer-events-none flex-1 *:pointer-events-auto"
                // Monaco scrolls the editor on any wheel inside it, view zones included.
                onWheel={(event) => event.stopPropagation()}
              >
                {images.map(({ file, id }) => (
                  <PastedImage
                    key={id}
                    image={file}
                    onRemove={() =>
                      setImages((current) =>
                        current.filter((item) => item.id !== id)
                      )
                    }
                  />
                ))}
              </AttachmentGroup>
            )}
            <div className="pointer-events-auto ml-auto flex">
              {phase.busy ? (
                <Spinner className="text-muted-foreground m-1.25 size-3.5" />
              ) : (
                <Tooltip
                  shortcut={
                    <Kbd>
                      <EnterIcon />
                    </Kbd>
                  }
                >
                  <TooltipTrigger
                    render={
                      <InputGroupButton
                        type="submit"
                        size="icon-xs"
                        aria-label="Send"
                        variant="ghost-muted"
                      />
                    }
                  >
                    <EnterIcon />
                  </TooltipTrigger>
                  <TooltipContent>Send</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </InputGroup>
      )}
      {phase.kind === 'fixing' && (
        <>
          {icon}
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
            Fixing <span data-mask>{phase.error}</span>
          </span>
          <Spinner className="text-muted-foreground size-3.5" />
          <RejectButton label="Cancel" onClick={onClose} />
        </>
      )}
      {phase.kind === 'review' && (
        <>
          {icon}
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
            {phase.fix ? 'Review the fix' : 'Review the rewrite'}
          </span>
          <RejectButton label="Reject" onClick={onClose} />
          <Tooltip shortcut={<ShortcutKbd shortcut="runStatement" />}>
            <TooltipTrigger render={<Button size="xs" onClick={onAccept} />}>
              Accept
            </TooltipTrigger>
            <TooltipContent>Accept</TooltipContent>
          </Tooltip>
        </>
      )}
    </form>
  )
}
