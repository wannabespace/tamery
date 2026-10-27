import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import type { ConnectionPatch } from '@tamery/connection/diagnosis'
import type { GuessFix, GuessFormat } from '@tamery/connection/guess'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import { ScrollArea } from '@tamery/ui/components/custom/scroll-area'
import { FieldGroup } from '@tamery/ui/components/field'
import { Form } from '@tamery/ui/components/tanstack-form'
import { useSelector } from '@tanstack/react-form'
import type { Variants } from 'motion/react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import { NavigationGuard } from '~/components/navigation-guard'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { useShortcut } from '~/core/keyboard/use-shortcuts'
import { useGoBack } from '~/hooks/use-go-back'
import { posthog } from '~/lib/posthog'

import { getMissing, getParts, useConnectionForm } from '../lib/connection-form'
import { getEngineFields } from '../lib/engine-fields'
import type { FormMode } from '../lib/form-mode'
import { getFormPolicy } from '../lib/form-mode'
import { usePasteConnection } from '../lib/use-paste-connection'
import { usePickLocalDatabase } from '../lib/use-pick-local-database'
import type { OnSave } from '../lib/use-test-then-save'
import { useTestThenSave } from '../lib/use-test-then-save'
import { AgentPanel } from './agent-panel'
import { ColorField } from './color-field'
import { ConnectionFields } from './connection-fields'
import { DropOverlay } from './drop-overlay'
import { FormFooter } from './form-footer'
import { LabelField } from './label-field'
import { NameField } from './name-field'
import { PageColumns } from './page-columns'
import { PasteHero } from './paste-hero'
import { PasteNotes } from './paste-notes'
import { SshFields } from './ssh-fields'
import { SyncField } from './sync-field'
import type { FixSource } from './test-alert'
import { TestAlert } from './test-alert'

const REVEAL: Variants = {
  animate: {
    opacity: 1,
    transition: { duration: 0.25, ease: [0.32, 0.72, 0, 1] },
    y: 0,
  },
  initial: { opacity: 0, y: 8 },
}

const FORM_ID = 'connection-form'

const focusField = (id: string) =>
  document.querySelector<HTMLElement>(`#${CSS.escape(id)}`)?.focus()

export const ConnectionPage = ({
  mode,
  onSave,
}: {
  mode: FormMode
  onSave: OnSave
}) => {
  const goBack = useGoBack()
  const [filled, setFilled] = useState<{
    fixes: GuessFix[]
    origin?: GuessFormat
  }>()
  const [stage, setStage] = useState<'agent' | 'form'>('form')
  const pageRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const back = () => {
    if (stage === 'agent') {
      setStage('form')
    } else {
      goBack()
    }
  }
  const focusPage = () => pageRef.current?.focus()
  const { getDraft, runTest, save, testError } = useTestThenSave(mode, onSave)
  const policy = getFormPolicy(mode)

  const { form, paste, patch } = useConnectionForm({
    defaultValues: mode.kind === 'edit' ? mode.values : undefined,
    onFill: ({ fixes, format }, pasted) => {
      setFilled((current) => ({
        fixes,
        origin: pasted ? format : current?.origin,
      }))
    },
    onSubmit: () => save(form, filled?.origin),
    unfilledSecrets: policy.unfilledSecrets,
  })
  // Through the form element, not `form.handleSubmit()`: the kit Form's submit handler then focuses the first invalid field.
  const submit = () => formRef.current?.requestSubmit()

  // Declared before usePasteConnection: a connection link's paste then focuses its first missing field after this.
  useEffect(() => {
    if (policy.firstField) {
      focusField(policy.firstField)
    } else {
      pageRef.current?.focus()
    }
  }, [policy.firstField])

  const { dragging, flash, read, readClipboard } = usePasteConnection({
    enabled: policy.pasteable,
    onPaste: (guess, via) => {
      paste(guess, via)
      if (stage === 'agent') {
        flushSync(() => setStage('form'))
      }
      const [missing] = getMissing(form.state.values)
      focusField(missing ?? 'name')
    },
    pitchShown: stage === 'form',
  })

  const { passwordWithheldBy, pick: pickLocalDatabase } = usePickLocalDatabase({
    form,
    read,
  })

  const values = useSelector(form.store, (state) => state.values)
  const engineFields = getEngineFields(values)
  const submitting = useSelector(form.store, (state) => state.isSubmitting)
  const { canSend, reason, testStatus } = getDraft(values)

  const applyFix = (fix: ConnectionPatch, source: FixSource) => {
    posthog.capture('connection_fix_applied', {
      fields: Object.entries(fix)
        .flatMap(([field, value]) => (value === undefined ? [] : [field]))
        .toSorted()
        .join(','),
      source,
    })
    if (fix.sshEnabled) {
      flushSync(() => patch(fix))
      focusField('ssh.host')
      return
    }
    patch(fix)
    focusPage()
    void runTest(form.state.values)
  }

  useShortcut('submit', submit, {
    enabled: stage === 'form' && !submitting,
    requireReset: true,
    target: pageRef,
  })
  useShortcut(
    'stepBack',
    () => {
      const focused = document.activeElement
      if (focused?.getAttribute('aria-expanded') === 'true') {
        return
      }
      if (focused === pageRef.current) {
        back()
      } else {
        pageRef.current?.focus()
      }
    },
    { preventDefault: false, stopPropagation: false, target: pageRef }
  )

  return (
    <div
      ref={pageRef}
      tabIndex={-1}
      className="relative flex h-full min-h-0 flex-col outline-none"
    >
      <DropOverlay shown={dragging} />
      {policy.guardsUnsaved && (
        <NavigationGuard
          title="Discard changes?"
          description="Your edits aren’t saved."
          cancel="Keep editing"
          confirm="Discard"
          shouldBlock={() => !form.state.isDefaultValue}
          onConfirm={() => posthog.capture('unsaved_changes_discarded')}
        />
      )}
      <IconButton
        variant="ghost-faint"
        size="icon-sm"
        icon={ArrowLeft01Icon}
        label="Back"
        shortcut={<ShortcutKbd shortcut="stepBack" />}
        side="right"
        className="absolute top-4 left-4 z-20"
        onClick={back}
      />
      <ScrollArea className="min-h-0 flex-1">
        <Form
          ref={formRef}
          id={FORM_ID}
          form={form}
          className="flex min-h-full flex-col"
        >
          {stage === 'form' ? (
            <motion.div
              key="form"
              className="py-16"
              variants={{ animate: { transition: { staggerChildren: 0.04 } } }}
              initial="initial"
              animate="animate"
            >
              <PageColumns
                aside={
                  <PasteHero
                    flash={flash}
                    mode={mode}
                    pasteable={policy.pasteable}
                    onClipboard={readClipboard}
                    onLocalDatabase={pickLocalDatabase}
                    onAgent={() => {
                      posthog.capture('connection_agent_opened')
                      setStage('agent')
                      pageRef.current?.focus()
                    }}
                  />
                }
              >
                <motion.div className="flex flex-col gap-5" variants={REVEAL}>
                  <ConnectionFields
                    form={form}
                    locked={policy.locked}
                    values={values}
                  />
                  {filled && (
                    <PasteNotes
                      fixes={filled.fixes}
                      form={form}
                      passwordWithheldBy={passwordWithheldBy}
                    />
                  )}
                </motion.div>
                {engineFields.sshTunnel && (
                  <motion.div className="flex flex-col gap-5" variants={REVEAL}>
                    <SshFields form={form} locked={policy.locked} />
                  </motion.div>
                )}
                {policy.showsMeta && (
                  <motion.div variants={REVEAL}>
                    <FieldGroup variant="card">
                      <NameField form={form} />
                      <LabelField form={form} />
                      <ColorField form={form} />
                      {mode.kind === 'create' && <SyncField form={form} />}
                    </FieldGroup>
                  </motion.div>
                )}
                {testStatus === 'error' && testError && (
                  <TestAlert
                    key={testError.message}
                    error={testError}
                    parts={getParts(values)}
                    engineFields={engineFields}
                    onAsk={focusPage}
                    onFix={applyFix}
                    onFocus={(field) => {
                      posthog.capture('connection_fix_focused', { field })
                      focusField(field)
                    }}
                  />
                )}
              </PageColumns>
            </motion.div>
          ) : (
            <motion.div
              key="agent"
              className="mx-auto my-auto w-full max-w-xl px-6 py-16"
              variants={REVEAL}
              initial="initial"
              animate="animate"
            >
              <AgentPanel />
            </motion.div>
          )}
        </Form>
      </ScrollArea>
      {stage === 'form' && (
        <FormFooter
          canTest={canSend}
          editing={mode.kind === 'edit'}
          formId={FORM_ID}
          reason={values[engineFields.field].trim() ? reason : null}
          submitting={submitting}
          testStatus={testStatus}
          onTest={() => runTest(values)}
        />
      )}
    </div>
  )
}
