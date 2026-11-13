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
import { useEffect, useRef, useState } from 'react'

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
import { usePromptMentions } from './prompt-mentions'
import { PromptMenu } from './prompt-menu'

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
  isActive,
  isStreaming,
  onCommand,
  onSend,
  onStop,
}: {
  /** Focuses the composer whenever it turns true. */
  isActive: boolean
  isStreaming: boolean
  onCommand: (command: ChatCommand) => void
  onSend: (text: string, mentions: PromptMention[], files: FileUIPart[]) => void
  onStop: () => void
}) => {
  const isOnline = useIsOnline()
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<FileUIPart[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const menu = usePromptMentions({ onCommand, setValue, textareaRef, value })
  const dictation = useDictation((text) => {
    setValue((current) =>
      current.trim() ? `${current.trimEnd()} ${text}` : text
    )
    textareaRef.current?.focus()
  })

  useEffect(() => {
    if (isActive) {
      textareaRef.current?.focus()
    }
  }, [isActive])

  const attach = async (picked: File[]) => {
    const parts = await readAttachments(picked, files.length)
    setFiles((current) => [...current, ...parts])
  }

  const canSend = (!!value.trim() || files.length > 0) && isOnline
  const submit = () => {
    if (!canSend || isStreaming) {
      return
    }
    onSend(value.trim(), menu.sentMentions(), files)
    menu.reset()
    setValue('')
    setFiles([])
  }

  return (
    <form
      className="relative mx-auto w-[min(32rem,100%)] shrink-0 p-2"
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
            } else if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              submit()
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
              <DictationButton dictation={dictation} />
              <Tooltip
                shortcut={
                  !isStreaming &&
                  canSend && (
                    <Kbd>
                      <EnterIcon />
                    </Kbd>
                  )
                }
              >
                <TooltipTrigger
                  render={
                    <InputGroupButton
                      size="icon-round"
                      variant="default"
                      aria-label={
                        isStreaming ? 'Stop generating' : 'Send message'
                      }
                      {...(isStreaming
                        ? { onClick: onStop }
                        : { disabled: !canSend, type: 'submit' })}
                    />
                  }
                >
                  <HugeiconsIcon
                    icon={isStreaming ? StopIcon : ArrowUp02Icon}
                    strokeWidth={2}
                  />
                </TooltipTrigger>
                <TooltipContent side="top">
                  {isStreaming ? 'Stop generating' : 'Send message'}
                </TooltipContent>
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
