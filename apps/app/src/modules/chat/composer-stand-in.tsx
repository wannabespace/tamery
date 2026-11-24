import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from '@tamery/ui/components/input-group'
import { cn } from '@tamery/ui/lib/utils'
import type { ComponentProps } from 'react'

import { CHAT_COLUMN } from './chat-column'

export const CHAT_LAYOUT = 'flex min-h-0 flex-1 flex-col'

export const CHAT_EMPTY_LAYOUT = 'overflow-y-auto before:flex-2 after:flex-3'

export const CHAT_COMPOSER_FORM = 'relative shrink-0 px-3 py-2'

export const CHAT_COMPOSER_FIELD = 'relative flex w-full'

export const CHAT_PLACEHOLDER =
  'Ask, @ to mention, / for commands, ! to run SQL'

export const ComposerTextarea = (props: ComponentProps<'textarea'>) => (
  <InputGroupTextarea
    data-mask
    aria-label="Message"
    rows={2}
    className="relative field-sizing-content max-h-64 min-h-14 px-3 pt-2.5"
    {...props}
  />
)

export const ChatIntroHeading = () => (
  <h2
    className={cn(
      CHAT_COLUMN,
      'px-4 pb-7 text-center text-3xl font-medium tracking-tight text-balance'
    )}
  >
    What should we look into?
  </h2>
)

/** The unsent chat's intro and composer, drawn before the chat can load; hook-free, since the boot shell renders it in Node. */
export const ComposerStandIn = (props: ComponentProps<'textarea'>) => (
  <div className={cn(CHAT_LAYOUT, CHAT_EMPTY_LAYOUT)}>
    <ChatIntroHeading />
    <div className={cn(CHAT_COLUMN, CHAT_COMPOSER_FORM)}>
      <InputGroup variant="composer">
        <div className={CHAT_COMPOSER_FIELD}>
          <ComposerTextarea placeholder={CHAT_PLACEHOLDER} {...props} />
        </div>
        <InputGroupAddon align="block-end">
          <div className="h-6" />
        </InputGroupAddon>
      </InputGroup>
    </div>
  </div>
)

/** Undefined until something looks: until then the boot shell's composer, if shown, is the one typed into. */
let typedInto: HTMLTextAreaElement | null | undefined

const currentStandIn = () =>
  typedInto === undefined
    ? document.querySelector<HTMLTextAreaElement>(
        '.shell-chat [data-shell-composer]'
      )
    : typedInto

/** Call before the boot shell goes: the removed textarea still holds what was typed into it. */
export const holdShellComposer = () => {
  typedInto = currentStandIn()
}

/** Ref for a stand-in shown while the chat loads: it takes over the text and focus of the one before it. */
export const adoptStandIn =
  (draft: string) => (textarea: HTMLTextAreaElement | null) => {
    if (!textarea) {
      return
    }
    textarea.value = currentStandIn()?.value || draft
    typedInto = textarea
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
  }

/** What the user typed before the composer mounted; null when nothing was, so a saved draft still wins. */
export const standInText = () => currentStandIn()?.value || null

export const releaseStandIn = () => {
  typedInto = null
}
