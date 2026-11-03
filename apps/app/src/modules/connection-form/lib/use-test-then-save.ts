import { connectionParts } from '@tamery/connection/connection-parts'
import type { GuessFormat } from '@tamery/connection/guess'
import { describeConnectionString } from '@tamery/connection/utils'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import { getDialect } from '@tamery/shared/enums/connection-type'
import type { SyncType } from '@tamery/shared/enums/sync-type'
import { toError } from '@tamery/shared/utils'
import { useMutation } from '@tanstack/react-query'
import { Result } from 'better-result'
import { useRef } from 'react'
import { toast } from 'sonner'

import { fetchingConfig } from '~/core/connection/fetching-config'
import type { ConnectionDetails } from '~/core/connection/save'
import { testConnectionQuery } from '~/core/queries/connection/test'
import { useBridgeRoute } from '~/core/runtime/bridge/pairing'
import { generateRandomName } from '~/utils/faker'

import type { ConnectionForm, ConnectionFormValues } from './connection-form'
import { getParts } from './connection-form'
import type { FormMode } from './form-mode'

export type OnSave = (
  connection: ConnectionDetails,
  created: {
    origin: GuessFormat | undefined
    syncType: SyncType
    testFailed: boolean
  }
) => Promise<unknown>

export const useTestThenSave = (mode: FormMode, onSave: OnSave) => {
  const bridge = useBridgeRoute(null)
  const test = useMutation({
    meta: { event: 'connection_tested' },
    mutationFn: (params: { connectionString: string; dialect: Dialect }) =>
      testConnectionQuery.run(params),
  })
  const inFlight = useRef<Promise<Result<unknown, unknown>>>(null)

  const getDraft = (values: ConnectionFormValues) => {
    const editing = mode.kind === 'edit' ? mode : null
    const connectionString = Result.try(() =>
      connectionParts.format(getParts(values), editing?.missingSecrets ?? [])
    ).unwrapOr(null)
    const described = connectionString
      ? Result.try(() => describeConnectionString(connectionString)).unwrapOr(
          null
        )
      : null
    if (!connectionString || !described) {
      return {
        canSend: false as const,
        connectionString: null,
        reason: null,
        testStatus: 'idle' as const,
      }
    }
    const { canSend, reason } = fetchingConfig(
      {
        isPasswordExists:
          described.isPasswordPopulated || !!editing?.passwordElsewhere,
        syncType: values.syncType,
      },
      {
        bridge,
        connectionString: editing
          ? described
          : { ...described, missingSecrets: [] },
        draft: true,
      }
    )
    const tested =
      test.variables?.connectionString === connectionString &&
      test.variables.dialect === getDialect(values.type)
    return {
      canSend,
      connectionString,
      reason,
      testStatus: tested ? test.status : 'idle',
    }
  }

  const runTest = (values: ConnectionFormValues) => {
    const { canSend, connectionString } = getDraft(values)
    if (!canSend) {
      return null
    }
    inFlight.current = Result.tryPromise(() =>
      test.mutateAsync({
        connectionString,
        dialect: getDialect(values.type),
      })
    )
    return inFlight.current
  }

  const save = async (
    form: ConnectionForm,
    origin: GuessFormat | undefined
  ): Promise<void> => {
    const draft = getDraft(form.state.values)
    if (
      draft.canSend &&
      (draft.testStatus === 'idle' || draft.testStatus === 'pending')
    ) {
      const result = await (draft.testStatus === 'pending'
        ? inFlight.current
        : runTest(form.state.values))
      if (result?.isErr()) {
        return
      }
      if (
        getDraft(form.state.values).connectionString !== draft.connectionString
      ) {
        return save(form, origin)
      }
    }
    const { values } = form.state
    const { connectionString } = draft
    const saved = await Result.tryPromise(() => {
      if (!connectionString) {
        throw new Error("The host isn't a valid address.")
      }
      return onSave(
        {
          color: values.color,
          connectionString,
          label: values.label.trim() || null,
          name: values.name.trim() || generateRandomName(),
          provider: values.provider,
          type: values.type,
        },
        {
          origin,
          syncType: values.syncType,
          testFailed: draft.testStatus === 'error',
        }
      )
    })
    if (saved.isErr()) {
      toast.error("Couldn't save the connection", {
        description: toError(saved.error.cause).message,
      })
    }
  }

  return { getDraft, runTest, save, testError: test.error }
}
