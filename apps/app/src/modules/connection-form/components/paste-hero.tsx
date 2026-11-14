import { Ctrl } from '@tamery/ui/components/custom/shortcuts'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { isMac } from '@tamery/ui/lib/os'
import { useKeyHold } from '@tanstack/react-hotkeys'
import {
  AnimatePresence,
  motion,
  useAnimate,
  useReducedMotion,
} from 'motion/react'
import { useEffect } from 'react'

import { getFileType } from '../lib/engine-fields'
import type { FormMode } from '../lib/form-mode'
import type { PasteFlash } from '../lib/use-paste-connection'
import { PASTE_FORMATS } from '../lib/use-paste-connection'
import type { LocalDatabase } from '../lib/use-pick-local-database'
import { AgentButton } from './agent-button'
import { Keycap } from './keycap'
import { LocalDatabases } from './local-databases'

const ROLL = {
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: '-100%' },
  initial: { opacity: 0, y: '100%' },
  transition: { duration: 0.25, ease: [0.32, 0.72, 0, 1] },
} as const

const EDIT_SUBTITLES = {
  all: 'Edit it or paste a new one.',
  credentials: 'Fill in what’s missing here.',
  details: 'Add its server details here.',
}

const FLASH_COPY = {
  hit: { subtitle: 'Review and save.', title: 'Got it.' },
  miss: { subtitle: 'Try another one.', title: 'That’s not a connection.' },
}

export const PasteHero = ({
  flash,
  mode,
  onAgent,
  onClipboard,
  onLocalDatabase,
  pasteable,
}: {
  flash: PasteFlash
  mode: FormMode
  onAgent: () => void
  onClipboard: () => void
  onLocalDatabase: (database: LocalDatabase) => void
  pasteable: boolean
}) => {
  const reduceMotion = useReducedMotion()
  const modifierHeld = useKeyHold(isMac ? 'Meta' : 'Control')
  const pasteHeld = useKeyHold('V') && modifierHeld
  const [shakeScope, shake] = useAnimate<HTMLDivElement>()
  const idle =
    mode.kind === 'edit'
      ? {
          subtitle:
            mode.scope === 'details' && getFileType(mode.values)
              ? 'Choose its file here.'
              : EDIT_SUBTITLES[mode.scope],
          title: (
            <span data-mask className="block">
              {mode.name}
            </span>
          ),
        }
      : { subtitle: 'We’ll figure it out.', title: 'Paste anything.' }
  const { subtitle, title } = flash.shown ? FLASH_COPY[flash.result] : idle

  useEffect(() => {
    if (flash.count && flash.result === 'miss' && !reduceMotion) {
      void shake(
        shakeScope.current,
        { x: [0, -6, 6, -3, 0] },
        { duration: 0.3 }
      )
    }
  }, [flash.count, flash.result, reduceMotion, shake, shakeScope])

  return (
    <div className="flex flex-col gap-7 lg:sticky lg:top-16 lg:col-span-2 lg:self-start">
      <div ref={shakeScope} className="flex flex-col gap-7">
        <h1 className="relative overflow-hidden text-3xl font-semibold tracking-tight wrap-break-word">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={flash.shown ? flash.result : 'prompt'}
              className="block"
              {...ROLL}
            >
              {title}
              <span className="text-muted-foreground block">{subtitle}</span>
            </motion.span>
          </AnimatePresence>
        </h1>
        {pasteable && (
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label="Paste from clipboard"
                    className="focus-visible:focus-ring flex gap-1.5 rounded-xl outline-none"
                    onClick={onClipboard}
                  />
                }
              >
                <Keycap pressed={modifierHeld}>
                  <Ctrl userAgent={navigator.userAgent} />
                </Keycap>
                <Keycap pressed={pasteHeld}>V</Keycap>
              </TooltipTrigger>
              <TooltipContent>Paste from clipboard</TooltipContent>
            </Tooltip>
            <span className="text-muted-foreground text-sm">
              or drop a file on the window
            </span>
          </div>
        )}
      </div>
      {pasteable && (
        <p className="text-muted-foreground text-sm text-pretty">
          {PASTE_FORMATS}
        </p>
      )}
      {mode.kind === 'create' && (
        <>
          {window.electron && <AgentButton onClick={onAgent} />}
          <LocalDatabases onPick={onLocalDatabase} />
        </>
      )}
    </div>
  )
}
