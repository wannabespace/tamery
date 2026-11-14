import {
  ArrowUp02Icon,
  Mic01Icon,
  PlusSignIcon,
  StopIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { AttachmentGroup } from '@tamery/ui/components/attachment'
import { EnterIcon } from '@tamery/ui/components/custom/shortcuts'
import {
  InputGroup,
  InputGroupAddon,
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
import type { FileUIPart } from 'ai'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'

import { useConnectionContext } from '~/core/connection/route'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { posthog } from '~/lib/posthog'
import { useIsOnline } from '~/store'

import { ApprovalModePicker } from './approval-mode-picker'
import {
  ATTACHMENT_ACCEPT,
  AttachmentChip,
  readAttachments,
} from './attachments'
import { useDictation } from './dictation'
import { ModelPicker } from './model-picker'
import type { ChatCommand, PromptMention } from './prompt-mentions'
import { commandOf, usePromptMentions } from './prompt-mentions'
import { PromptMenu } from './prompt-menu'
import { chatDraftsValue, setChatDraft } from './stores'

const DictationButton = ({
  dictation,
}: {
  dictation: ReturnType<typeof useDictation>
}) => {
  const label = dictation.isRecording ? 'Stop dictation' : 'Dictate'
  if (dictation.isTranscribing) {
    return <Spinner className="text-muted-foreground m-1.25 size-3.5" />
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <InputGroupButton
            size="icon-round"
            variant={dictation.isRecording ? 'destructive' : 'ghost-muted'}
            aria-label={label}
            aria-pressed={dictation.isRecording}
            onClick={dictation.isRecording ? dictation.stop : dictation.start}
          />
        }
      >
        <HugeiconsIcon icon={Mic01Icon} strokeWidth={2} />
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

export const ChatInput = ({
  chatId,
  isActive,
  isWorking,
  lastPrompt,
  meter,
  onCommand,
  onSend,
  onStop,
}: {
  /** Whose draft the composer keeps; the draft survives tabs and reloads until it is sent or emptied. */
  chatId: string
  /** Focuses the composer whenever it turns true. */
  isActive: boolean
  /** While it is true, Enter queues the message for when the turn ends; the send button and ⌘↩ stop the agent and send it at once. */
  isWorking: boolean
  /** What ArrowUp brings back into an empty composer. */
  lastPrompt?: string
  meter?: ReactNode
  onCommand: (command: ChatCommand) => void
  /** `now` asks to send at once even while the agent works. */
  onSend: (
    text: string,
    mentions: PromptMention[],
    files: FileUIPart[],
    now: boolean
  ) => void
  onStop: () => void
}) => {
  const isOnline = useIsOnline()
  const { connectionResource } = useConnectionContext()
  const [value, setValue] = useState(
    () => chatDraftsValue.get()[chatId]?.text ?? ''
  )
  const [files, setFiles] = useState<FileUIPart[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const menu = usePromptMentions({ setValue, textareaRef, value })
  const dictation = useDictation((text) => {
    setValue((current) =>
      current.trim() ? `${current.trimEnd()} ${text}` : text
    )
    textareaRef.current?.focus()
  })

  useEffect(() => {
    setChatDraft(chatId, connectionResource.id, value)
  }, [chatId, connectionResource.id, value])

  useEffect(() => {
    const textarea = textareaRef.current
    if (isActive && textarea) {
      textarea.focus()
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    }
  }, [isActive])

  const attach = async (picked: File[]) => {
    const parts = await readAttachments(picked, files.length)
    setFiles((current) => [...current, ...parts])
  }

  const canSend = (!!value.trim() || files.length > 0) && isOnline
  const showStop = isWorking && !canSend
  let sendLabel = 'Send message'
  if (showStop) {
    sendLabel = 'Stop generating'
  } else if (isWorking) {
    sendLabel = 'Send now'
  }
  const submit = (now = false) => {
    const command = commandOf(value)
    if (command) {
      onCommand(command)
      menu.reset()
      setValue('')
      return
    }
    if (!canSend) {
      return
    }
    onSend(value.trim(), menu.sentMentions(), files, now)
    menu.reset()
    setValue('')
    setFiles([])
  }

  return (
    <form
      className="relative shrink-0 px-3 py-2"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <PromptMenu menu={menu} />
      <InputGroup variant="composer">
        {files.length > 0 && (
          <InputGroupAddon align="block-start">
            <AttachmentGroup className="flex-1">
              {files.map((file, index) => (
                <AttachmentChip
                  key={file.url}
                  part={file}
                  onRemove={() =>
                    setFiles((current) => current.toSpliced(index, 1))
                  }
                />
              ))}
            </AttachmentGroup>
          </InputGroupAddon>
        )}
        <InputGroupTextarea
          ref={textareaRef}
          data-mask
          aria-label="Message"
          placeholder={
            dictation.isRecording
              ? 'Listening…'
              : 'Ask, @ to mention, / for commands'
          }
          rows={2}
          className="field-sizing-content max-h-64 min-h-14 px-3 pt-2.5"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onSelect={(event) => menu.onSelect(event)}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) {
              event.preventDefault()
            }
          }}
          onDrop={(event) => {
            if (event.dataTransfer.files.length > 0) {
              event.preventDefault()
              void attach([...event.dataTransfer.files])
            }
          }}
          onPaste={(event) => {
            if (event.clipboardData.files.length > 0) {
              event.preventDefault()
              void attach([...event.clipboardData.files])
            }
          }}
          onKeyDown={(event) => {
            if (menu.onKeyDown(event)) {
              return
            }
            if (event.key === 'Escape' && dictation.isRecording) {
              event.preventDefault()
              dictation.cancel()
            } else if (event.key === 'ArrowUp' && !value && lastPrompt) {
              event.preventDefault()
              posthog.capture('ai_chat_prompt_recalled')
              setValue(lastPrompt)
            } else if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              submit(event.metaKey || event.ctrlKey)
            }
          }}
        />
        <InputGroupAddon align="block-end">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <InputGroupButton
                    size="icon-round"
                    variant="secondary"
                    aria-label="Attach files"
                    onClick={() => fileInputRef.current?.click()}
                  />
                }
              >
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
              </TooltipTrigger>
              <TooltipContent side="top">Attach images or PDFs</TooltipContent>
            </Tooltip>
            <ModelPicker />
            <ApprovalModePicker />
            <div className="ml-auto flex items-center gap-1">
              {meter}
              <DictationButton dictation={dictation} />
              <Tooltip
                shortcut={
                  canSend &&
                  (isWorking ? (
                    <ShortcutKbd shortcut="chatSendNow" />
                  ) : (
                    <Kbd>
                      <EnterIcon />
                    </Kbd>
                  ))
                }
              >
                <TooltipTrigger
                  render={
                    <InputGroupButton
                      size="icon-round"
                      variant="default"
                      aria-label={sendLabel}
                      {...(showStop
                        ? { onClick: onStop }
                        : {
                            disabled: !canSend,
                            onClick: (event) => {
                              event.preventDefault()
                              submit(isWorking)
                            },
                          })}
                    />
                  }
                >
                  <HugeiconsIcon
                    icon={showStop ? StopIcon : ArrowUp02Icon}
                    strokeWidth={2}
                  />
                </TooltipTrigger>
                <TooltipContent side="top">{sendLabel}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </InputGroupAddon>
      </InputGroup>
      <input
        ref={fileInputRef}
        type="file"
        hidden
        multiple
        accept={ATTACHMENT_ACCEPT}
        onChange={(event) => {
          void attach([...(event.target.files ?? [])])
          event.target.value = ''
        }}
      />
    </form>
  )
}
