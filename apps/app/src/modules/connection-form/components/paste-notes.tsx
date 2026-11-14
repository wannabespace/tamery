import type { GuessFix } from '@tamery/connection/guess'
import { MotionCollapse } from '@tamery/ui/components/collapse.motion'
import { useSelector } from '@tanstack/react-form'
import { AnimatePresence } from 'motion/react'

import { useLocalMachine } from '~/core/local-machine'

import type { ConnectionForm } from '../lib/connection-form'
import { getMissing } from '../lib/connection-form'
import { getEngineFields, getFieldNoun } from '../lib/engine-fields'
import { Footnote } from './footnote'

const FIX_NOTES: Record<GuessFix, string> = {
  'clickhouse-http':
    "Using ClickHouse's HTTP port, since Tamery connects over HTTP, not the native protocol.",
  'neon-direct':
    'Using the direct endpoint, since the pooler drops transactions between queries.',
  'pooler-port':
    'Using port 5432, since the transaction pooler drops transactions between queries.',
  'prisma-options':
    'Dropped the Prisma-only options, which the database would reject.',
  'ssh-forward': 'Connecting to the forwarded server through the SSH tunnel.',
}

const FIELD_LIST = new Intl.ListFormat('en', { type: 'conjunction' })

export const PasteNotes = ({
  fixes,
  form,
  passwordWithheldBy,
}: {
  fixes: GuessFix[]
  form: ConnectionForm
  passwordWithheldBy?: string
}) => {
  const missing = useSelector(form.store, ({ values }) => getMissing(values))
  const engineFields = useSelector(form.store, ({ values }) =>
    getEngineFields(values)
  )
  const foundDatabase = useSelector(form.store, ({ values }) =>
    values.password ? null : values.foundDatabase
  )
  const machine = useLocalMachine()
  const withheld =
    passwordWithheldBy && missing.includes('password')
      ? ` (${passwordWithheldBy} keeps it in the Keychain)`
      : ''

  const note = [
    ...(missing.length > 0
      ? [
          `Add the ${FIELD_LIST.format(missing.map((field) => getFieldNoun(engineFields, field)))}${withheld}.`,
        ]
      : []),
    ...(foundDatabase && machine
      ? [
          `Uses the password saved in ${foundDatabase.source} on ${machine.name}, which stays there.`,
        ]
      : []),
    ...fixes.map((fix) => FIX_NOTES[fix]),
  ].join(' ')

  return (
    <AnimatePresence initial={false}>
      {note && (
        <MotionCollapse key={note}>
          <Footnote>{note}</Footnote>
        </MotionCollapse>
      )}
    </AnimatePresence>
  )
}
