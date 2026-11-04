import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tamery/ui/components/dialog'
import { Field, FieldLabel } from '@tamery/ui/components/field'
import { Input } from '@tamery/ui/components/input'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { createWorkspace } from '~/core/workspace/create'
import type { Workspace } from '~/core/workspace/sync'
import { orpc } from '~/lib/orpc'

const WorkspaceNameForm = ({
  workspace,
  onClose,
}: {
  workspace?: Workspace
  onClose: VoidFunction
}) => {
  const navigate = useNavigate()
  const [name, setName] = useState(workspace?.name ?? '')
  const trimmedName = name.trim()

  const { mutate, isPending: loading } = useMutation({
    meta: { event: workspace ? 'workspace_renamed' : 'workspace_created' },
    mutationFn: async () => {
      await (workspace
        ? orpc.workspaces.rename.call({
            name: trimmedName,
            workspaceId: workspace.id,
          })
        : createWorkspace(trimmedName))
    },
    onSuccess: async () => {
      toast.success(workspace ? 'Workspace renamed' : 'Workspace created')
      onClose()
      if (!workspace) {
        await navigate({ to: '/' })
      }
    },
    onError: (err: Error) => {
      console.error(err)
      toast.error(err.message || 'Failed to save. Please try again later.')
    },
  })

  const handleSubmit = (e: React.SubmitEvent) => {
    e.preventDefault()
    mutate()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {workspace ? 'Rename workspace' : 'Create workspace'}
        </DialogTitle>
        <DialogDescription>
          {workspace
            ? 'Everyone in this workspace sees the new name.'
            : 'Workspaces keep your connections organized in separate groups.'}
        </DialogDescription>
      </DialogHeader>
      <form id="workspace-name-form" onSubmit={handleSubmit}>
        <Field>
          <FieldLabel htmlFor="workspace-name">Name</FieldLabel>
          <Input
            id="workspace-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="My workspace"
            data-mask
          />
        </Field>
      </form>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button
          type="submit"
          form="workspace-name-form"
          disabled={loading || !trimmedName || trimmedName === workspace?.name}
        >
          <LoadingContent loading={loading}>
            {workspace ? 'Rename' : 'Create'}
          </LoadingContent>
        </Button>
      </DialogFooter>
    </>
  )
}

export const WorkspaceNameDialog = ({
  workspace,
  open,
  onOpenChange,
}: {
  /** Renames this workspace; without it the dialog creates one. */
  workspace?: Workspace
  open: boolean
  onOpenChange: (open: boolean) => void
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <WorkspaceNameForm
        workspace={workspace}
        onClose={() => onOpenChange(false)}
      />
    </DialogContent>
  </Dialog>
)
