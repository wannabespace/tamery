import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useConnectionContext } from '~/core/connection/route'
import type { DiagramDraft, diagramDrafts } from '~/core/drafts/diagram'
import {
  connectionResourceToQueryParams,
  transaction,
} from '~/core/runtime/query'
import { useSaveHotkey } from '~/hooks/use-save-hotkey'
import { queryClient } from '~/lib/query-client'
import { plural } from '~/utils/plural'

import { getGates } from './context'
import { draftQuery } from './queries'
import { inApplyOrder, isDrop } from './statements'

export const applyConsequence = (
  drafts: DiagramDraft[],
  ddlRollback: boolean
) => {
  const drops = drafts.filter(
    (draft) => draft.kind === 'dropTable' || draft.kind === 'dropColumn'
  ).length
  if (drops > 0) {
    return {
      description: `${drops === 1 ? 'A drop deletes' : `${drops} drops delete`} data permanently${ddlRollback ? '' : '; earlier statements stay applied if a later one fails'}.`,
      variant: 'destructive' as const,
    }
  }
  if (!ddlRollback) {
    return {
      description:
        'This engine commits each statement on its own, so a failure leaves the earlier ones applied.',
      variant: 'warning' as const,
    }
  }
  return {
    description: 'Runs every statement in one transaction.',
    variant: 'default' as const,
  }
}

export const useApplyDrafts = ({
  drafts,
  edit,
  onApplied,
  reviewOpen,
  setReviewOpen,
}: {
  drafts: DiagramDraft[]
  edit: ReturnType<typeof diagramDrafts>
  onApplied: (applied: DiagramDraft[]) => void
  reviewOpen: boolean
  setReviewOpen: (open: boolean) => void
}) => {
  const { connectionResource, dialect } = useConnectionContext()
  const { ddlRollback } = getGates(dialect)
  const mutation = useMutation({
    meta: { event: 'diagram_changes_applied' },
    mutationFn: async (pending: DiagramDraft[]) => {
      const params = await connectionResourceToQueryParams(connectionResource)
      const ordered = inApplyOrder(pending)
      if (ddlRollback) {
        await transaction(params).execute(async (tx) => {
          for (const draft of ordered) {
            // oxlint-disable-next-line no-await-in-loop
            await draftQuery(draft).run(params, tx)
          }
        })
        return ordered
      }
      const committed: DiagramDraft[] = []
      try {
        for (const draft of ordered) {
          // oxlint-disable-next-line no-await-in-loop
          await draftQuery(draft).run(params)
          committed.push(draft)
        }
      } catch (error) {
        onApplied(committed)
        edit.settle(committed)
        throw error
      }
      return ordered
    },
    onError: () => setReviewOpen(true),
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ['connection-resource', connectionResource.id],
      })
    },
    onSuccess: (applied) => {
      onApplied(applied)
      edit.settle(applied)
      setReviewOpen(false)
      toast.success(`Applied ${plural(applied.length, 'change')}`)
    },
  })
  const request = () => {
    if (drafts.some(isDrop) && !reviewOpen) {
      setReviewOpen(true)
      return
    }
    mutation.mutate(drafts)
  }

  useSaveHotkey(request, drafts.length === 0 || mutation.isPending)

  return {
    applying: mutation.isPending,
    error: mutation.error,
    request,
    reset: mutation.reset,
  }
}
