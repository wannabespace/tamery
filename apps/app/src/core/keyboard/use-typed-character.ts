import { useEffect, useEffectEvent } from 'react'

const isTypedCharacter = (event: KeyboardEvent) =>
  event.key.length === 1 &&
  event.key !== ' ' &&
  !event.ctrlKey &&
  !event.metaKey &&
  !event.isComposing

/** Hears every typed character in the document, so `onTyped` decides whether the focus makes it its own. */
export const useTypedCharacter = (onTyped: (event: KeyboardEvent) => void) => {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (isTypedCharacter(event)) {
      onTyped(event)
    }
  })
  useEffect(() => {
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}
