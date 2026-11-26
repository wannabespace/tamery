import {
  ArrowUp02Icon,
  PlusSignIcon,
  StopIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { AttachmentGroup } from '@tamery/ui/components/attachment'
import { Badge } from '@tamery/ui/components/badge'
import { EnterIcon } from '@tamery/ui/components/custom/shortcuts'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
} from '@tamery/ui/components/input-group'
import { Kbd } from '@tamery/ui/components/kbd'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import type { FileUIPart } from 'ai'
import type { editor } from 'monaco-editor'
import type { ComponentRef, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useSubscription } from 'seitu/react'

import { useConnectionContext, useTabContext } from '~/core/connection/route'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { getQueryLanguage } from '~/core/runtime/language'
import { posthog } from '~/lib/posthog'
import { RunnerAlertDialog } from '~/modules/runner/components/runner-alert-dialog'
import { useIsOnline } from '~/store'

import { ApprovalModePicker } from './approval-mode-picker'
import { AttachmentChip } from './attachment-chip'
import { ATTACHMENT_ACCEPT, readAttachments } from './attachments'
import {
  CHAT_COMPOSER_FIELD,
  CHAT_COMPOSER_FORM,
  CHAT_PLACEHOLDER,
  ComposerTextarea,
  releaseStandIn,
  standInText,
} from './composer-stand-in'
import { useDictation } from './dictation'
import { DictationButton } from './dictation-button'
import { MentionHighlight } from './mention-highlight'
import { ModelPicker } from './model-picker'
import type { ChatCommand, PromptMention } from './prompt-mentions'
import { commandOf, usePromptMentions } from './prompt-mentions'
import { PromptMenu } from './prompt-menu'
import { SqlComposer } from './sql-composer'
import { sqlOf } from './sql-run'
import {
  chatDraftsValue,
  composerFocusRequestStore,
  setChatDraft,
} from './stores'
import { useTypeToFocus } from './use-type-to-focus'

const draftOf = (chatId: string) => {
  const text = standInText() ?? chatDraftsValue.get()[chatId]?.text ?? ''
  const statement = sqlOf(text)
  return { isSql: statement !== null, value: statement ?? text }
}

const sendLabelOf = ({
  isSql,
  isWorking,
  sendsNow,
  showStop,
}: {
  isSql: boolean
  isWorking: boolean
  sendsNow: boolean
  showStop: boolean
}) => {
  if (showStop) {
    return 'Stop generating'
  }
  if (sendsNow) {
    return 'Send now'
  }
  if (isWorking) {
    return 'Queue message'
  }
  return isSql ? 'Run SQL' : 'Send message'
}

const placeholderOf = ({
  isRecording,
  suggestion,
}: {
  isRecording: boolean
  suggestion: string | undefined
}) => (isRecording ? 'Listening…' : (suggestion ?? CHAT_PLACEHOLDER))

export const ChatInput = ({
  canInterrupt = true,
  chatId,
  isActive,
  isWorking,
  lastPrompt,
  meter,
  onCommand,
  onSend,
  onStop,
  suggestion,
}: {
  /** False for a subagent: a message while it works always waits for its turn, since stopping it would fail its report. */
  canInterrupt?: boolean
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
  /** The placeholder of an empty composer, which Tab takes as the message. */
  suggestion?: string
}) => {
  const isOnline = useIsOnline()
  const { connectionResource } = useConnectionContext()
  const { dialect } = useTabContext()
  const [isSql, setIsSql] = useState(() => draftOf(chatId).isSql)
  const [value, setValue] = useState(() => draftOf(chatId).value)
  const [files, setFiles] = useState<FileUIPart[]>([])
  const formRef = useRef<HTMLFormElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sqlEditorRef = useRef<editor.IStandaloneCodeEditor>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<ComponentRef<typeof RunnerAlertDialog>>(null)
  const menu = usePromptMentions({
    setValue,
    textareaRef,
    value: isSql ? '' : value,
  })
  const dictation = useDictation((text) => {
    setValue((current) =>
      current.trim() ? `${current.trimEnd()} ${text}` : text
    )
    textareaRef.current?.focus()
  })

  useTypeToFocus({
    composerRef: formRef,
    focus: () => (sqlEditorRef.current ?? textareaRef.current)?.focus(),
    isActive,
  })

  const focusRequest = useSubscription(composerFocusRequestStore)

  useEffect(releaseStandIn, [])

  useEffect(() => {
    setChatDraft(
      chatId,
      connectionResource.id,
      isSql && value.trim() ? `!${value}` : value
    )
  }, [chatId, connectionResource.id, isSql, value])

  useEffect(() => {
    const textarea = textareaRef.current
    const sqlEditor = sqlEditorRef.current
    if (!isActive) {
      return
    }
    if (sqlEditor) {
      sqlEditor.focus()
      sqlEditor.setPosition(
        sqlEditor.getModel()?.getFullModelRange().getEndPosition() ?? {
          column: 1,
          lineNumber: 1,
        }
      )
    } else if (textarea) {
      textarea.focus()
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- isSql swaps the textarea and the SQL editor, and the one that mounts takes focus; focusRequest is New chat landing on the chat that is already open
  }, [focusRequest, isActive, isSql])

  const attach = async (picked: File[]) => {
    const parts = await readAttachments(picked, files.length)
    setFiles((current) => [...current, ...parts])
  }

  const isDictating = dictation.isRecording || dictation.isTranscribing
  const canSend =
    (!!value.trim() || (!isSql && files.length > 0)) && isOnline && !isDictating
  const showStop = isWorking && !canSend
  const sendsNow = isWorking && canInterrupt
  const sendLabel = sendLabelOf({ isSql, isWorking, sendsNow, showStop })
  const submit = (now = false) => {
    const command = isSql ? null : commandOf(value)
    if (command) {
      onCommand(command)
      menu.reset()
      setValue('')
      return
    }
    if (!canSend) {
      return
    }
    const send = () => {
      if (isSql) {
        onSend(`!${value.trim()}`, [], [], now)
        setIsSql(false)
      } else {
        onSend(value.trim(), menu.sentMentions(), files, now)
        setFiles([])
      }
      menu.reset()
      setValue('')
    }
    const keywords = isSql ? getQueryLanguage(dialect).destructive(value) : []
    if (keywords.length > 0) {
      confirmRef.current?.confirm(keywords, send)
      return
    }
    send()
  }

  return (
    <form
      ref={formRef}
      className={CHAT_COMPOSER_FORM}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <PromptMenu menu={menu} />
      <InputGroup variant="composer">
        {isSql && (
          <InputGroupAddon align="block-start">
            <Badge>SQL</Badge>
            Runs on this database, the agent sees the result
          </InputGroupAddon>
        )}
        {!isSql && files.length > 0 && (
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
        <div className={CHAT_COMPOSER_FIELD}>
          {isSql ? (
            <SqlComposer
              editorRef={sqlEditorRef}
              value={value}
              onChange={setValue}
              onLeave={() => setIsSql(false)}
              onSubmit={(now) => submit(canInterrupt && now)}
            />
          ) : (
            <>
              <MentionHighlight
                ref={highlightRef}
                labels={menu.sentMentions().map(({ label }) => label)}
                value={value}
              />
              <ComposerTextarea
                ref={textareaRef}
                placeholder={placeholderOf({
                  isRecording: dictation.isRecording,
                  suggestion,
                })}
                value={value}
                onChange={(event) => {
                  const next = event.target.value
                  if (!value && next.startsWith('!')) {
                    setIsSql(true)
                    setValue(next.slice(1))
                    return
                  }
                  setValue(next)
                }}
                onScroll={(event) => {
                  if (highlightRef.current) {
                    highlightRef.current.scrollTop =
                      event.currentTarget.scrollTop
                  }
                }}
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
                    event.key === 'Tab' &&
                    !event.shiftKey &&
                    !value &&
                    suggestion
                  ) {
                    event.preventDefault()
                    posthog.capture('ai_chat_suggestion_taken')
                    setValue(suggestion)
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
                    submit(canInterrupt && (event.metaKey || event.ctrlKey))
                  }
                }}
              />
            </>
          )}
        </div>
        <InputGroupAddon align="block-end">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {!isSql && (
              <>
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
                  <TooltipContent side="top">
                    Attach images or PDFs
                  </TooltipContent>
                </Tooltip>
                <ModelPicker />
                <ApprovalModePicker />
              </>
            )}
            <div className="ml-auto flex items-center gap-1">
              {meter}
              <DictationButton dictation={dictation} />
              <Tooltip
                shortcut={
                  canSend &&
                  (sendsNow ? (
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
                              submit(sendsNow)
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
      <RunnerAlertDialog ref={confirmRef} />
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
