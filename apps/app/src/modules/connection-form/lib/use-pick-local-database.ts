import type { LocalDatabase as FoundDatabase } from '@tamery/connection/local-databases/local-database'
import { useSelector } from '@tanstack/react-form'
import { Result } from 'better-result'
import { useRef, useState } from 'react'

import { localMachine } from '~/core/local-machine'

import type { ConnectionForm } from './connection-form'
import type { PasteVia } from './use-paste-connection'

export type LocalDatabase = Omit<FoundDatabase, 'unlock'>

export const usePickLocalDatabase = ({
  form,
  read,
}: {
  form: ConnectionForm
  read: (text: string, via: PasteVia) => void
}) => {
  const unlocking = useRef<string>(null)
  const [withheld, setWithheld] = useState<{ host: string; source: string }>()
  const host = useSelector(form.store, ({ values }) => values.host)

  const pick = async ({
    connectionString,
    name,
    source,
    type,
  }: LocalDatabase) => {
    setWithheld(undefined)
    // Replaces the form rather than merging like a paste: another pick on the same host would keep the previous password, database and options.
    form.reset()
    read(connectionString, 'found')
    form.setFieldValue('name', name)
    form.setFieldValue('type', type)
    if (unlocking.current === connectionString) {
      return
    }
    unlocking.current = connectionString
    const unlock = await Result.tryPromise(
      async () => await localMachine.unlockDatabase(connectionString)
    )
    const unlocked = unlock.unwrapOr(null)
    if (unlocking.current !== connectionString) {
      return
    }
    unlocking.current = null
    if (unlocked?.password) {
      form.setFieldValue('password', unlocked.password)
    }
    if (unlocked?.withheld) {
      setWithheld({ host: form.state.values.host, source })
    }
  }

  return {
    passwordWithheldBy: withheld?.host === host ? withheld.source : undefined,
    pick,
  }
}
