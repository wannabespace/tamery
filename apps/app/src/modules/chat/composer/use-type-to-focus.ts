import type { RefObject } from 'react'

import { useTypedCharacter } from '~/core/keyboard/use-typed-character'

const TAKES_TYPING =
  'input, textarea, select, [contenteditable], [role=textbox], [role=combobox], [role=grid]'

/** Typing with the focus elsewhere in the chat, or nowhere, goes to the composer. */
export const useTypeToFocus = ({
  composerRef,
  focus,
  isActive,
}: {
  composerRef: RefObject<HTMLElement | null>
  focus: () => void
  isActive: boolean
}) =>
  useTypedCharacter((event) => {
    const focused = document.activeElement
    if (
      isActive &&
      focused &&
      // A question card in an answer takes its own letter keys.
      !event.defaultPrevented &&
      !focused.closest(TAKES_TYPING) &&
      (focused === document.body ||
        composerRef.current
          ?.closest('[data-slot=chat-conversation]')
          ?.contains(focused))
    ) {
      // Never preventDefault: the browser types the character into what is focused by now.
      focus()
    }
  })
