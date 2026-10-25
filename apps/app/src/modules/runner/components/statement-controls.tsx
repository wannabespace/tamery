import {
  AiIdeaIcon,
  Cancel01Icon,
  PlayIcon,
  SaveIcon,
  SparklesIcon,
  ViewIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  acceptGhostText,
  dismissGhostText,
} from '@tamery/monaco/query-language'
import { Button } from '@tamery/ui/components/button'
import { Group } from '@tamery/ui/components/group'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import type { editor } from 'monaco-editor'
import type { CSSProperties, RefObject } from 'react'

import { AppMenuButton } from '~/components/app-context-menu'
import type { AppMenuNode } from '~/components/app-menu'
import { getCapabilities } from '~/core/catalog/capabilities'
import { useTabContext } from '~/core/connection/route'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { useIsAnonymous } from '~/lib/auth'

import type { RunnerActions } from '../lib/actions'
import { useRunnerActions } from '../lib/actions'
import type { FailedRunnerResult } from '../lib/run'
import type { RunAnchor } from '../lib/statement-band'
import { RUN_SLOT_GAP, sameSpot } from '../lib/statement-band'

const statementMenuItems = (
  actions: RunnerActions,
  canExplain: boolean
): AppMenuNode[] => [
  ...(canExplain
    ? [
        {
          icon: ViewIcon,
          label: 'Explain',
          onSelect: () => actions.explainCurrent(),
        },
      ]
    : []),
  {
    icon: SparklesIcon,
    label: 'Edit with AI',
    onSelect: () => actions.askAi(),
    shortcut: 'editWithAi',
  },
  {
    icon: SaveIcon,
    label: 'Save statement',
    onSelect: () => actions.saveCurrent(),
    shortcut: 'saveStatement',
  },
]

export const openMenuFromKeyboard = (trigger: HTMLButtonElement | null) => {
  if (!trigger) {
    return
  }
  const observer = new MutationObserver(() => {
    const id = trigger.getAttribute('aria-controls')
    if (id) {
      observer.disconnect()
      document.querySelector<HTMLElement>(`#${CSS.escape(id)}`)?.focus()
    }
  })
  observer.observe(trigger, { attributeFilter: ['aria-controls'] })
  trigger.click()
}

const SuggestionControls = ({
  editorRef,
}: {
  editorRef: RefObject<editor.IStandaloneCodeEditor | null>
}) => (
  <Group>
    <Tooltip shortcut={<ShortcutKbd shortcut="acceptSuggestion" />}>
      <TooltipTrigger
        render={
          <Button
            size="icon-2xs"
            aria-label="Accept suggestion"
            onClick={() => {
              const codeEditor = editorRef.current
              if (codeEditor) {
                acceptGhostText(codeEditor)
                codeEditor.focus()
              }
            }}
          />
        }
      >
        <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
      </TooltipTrigger>
      <TooltipContent>Accept suggestion</TooltipContent>
    </Tooltip>
    <Tooltip shortcut={<ShortcutKbd shortcut="stepBack" />}>
      <TooltipTrigger
        render={
          <Button
            size="icon-2xs"
            variant="outline"
            aria-label="Dismiss suggestion"
            onClick={() => {
              const codeEditor = editorRef.current
              if (codeEditor) {
                dismissGhostText(codeEditor)
                codeEditor.focus()
              }
            }}
          />
        }
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
      </TooltipTrigger>
      <TooltipContent>Dismiss suggestion</TooltipContent>
    </Tooltip>
  </Group>
)

export const StatementControls = ({
  anchor,
  editorRef,
  failed,
  menuRef,
}: {
  anchor: RunAnchor
  editorRef: RefObject<editor.IStandaloneCodeEditor | null>
  failed: FailedRunnerResult | undefined
  menuRef: RefObject<HTMLButtonElement | null>
}) => {
  const { dialect } = useTabContext()
  const actions = useRunnerActions()
  const isAnonymous = useIsAnonymous()
  const suggestionHere = sameSpot(anchor.suggestion, anchor)

  return (
    <>
      {anchor.suggestion && !suggestionHere && (
        <div
          className="absolute top-(--top) left-(--left)"
          style={
            {
              '--left': `${anchor.suggestion.left + RUN_SLOT_GAP}px`,
              '--top': `${anchor.suggestion.top}px`,
            } as CSSProperties
          }
        >
          <SuggestionControls editorRef={editorRef} />
        </div>
      )}
      <div
        className="absolute top-(--top) left-(--left) flex gap-1.5"
        style={
          {
            '--left': `${anchor.left + RUN_SLOT_GAP}px`,
            '--top': `${anchor.top}px`,
          } as CSSProperties
        }
      >
        {anchor.suggestion && suggestionHere && (
          <SuggestionControls editorRef={editorRef} />
        )}
        <Group>
          {failed && (
            <Tooltip shortcut={<ShortcutKbd shortcut="fixWithAi" />}>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-2xs"
                    variant="outline"
                    aria-label="Fix with AI"
                    className={isAnonymous ? 'opacity-50' : undefined}
                    onClick={() => actions.fixWithAi(failed)}
                  />
                }
              >
                <HugeiconsIcon
                  icon={AiIdeaIcon}
                  strokeWidth={2}
                  className="size-3"
                />
              </TooltipTrigger>
              <TooltipContent>Fix with AI</TooltipContent>
            </Tooltip>
          )}
          <Tooltip shortcut={<ShortcutKbd shortcut="runStatement" />}>
            <TooltipTrigger
              render={
                <Button
                  size="icon-2xs"
                  variant="outline"
                  aria-label="Run statement"
                  onClick={() => actions.runCurrent()}
                />
              }
            >
              <HugeiconsIcon icon={PlayIcon} strokeWidth={2} />
            </TooltipTrigger>
            <TooltipContent>Run statement</TooltipContent>
          </Tooltip>
          <Tooltip shortcut={<ShortcutKbd shortcut="contextMenu" />}>
            <AppMenuButton
              render={
                <TooltipTrigger
                  render={
                    <Button ref={menuRef} size="icon-2xs" variant="outline" />
                  }
                />
              }
              contentProps={{
                align: 'start',
                finalFocus: () => editorRef.current?.focus(),
              }}
              items={() =>
                statementMenuItems(
                  actions,
                  getCapabilities(dialect).flags.includes('explain')
                )
              }
            />
            <TooltipContent>More actions</TooltipContent>
          </Tooltip>
        </Group>
      </div>
    </>
  )
}
