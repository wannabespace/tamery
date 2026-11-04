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

export const CreateWorkspaceDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const navigate = useNavigate()
  const [name, setName] = useState('')

  const { mutate, isPending: loading } = useMutation({
    meta: { event: 'workspace_created' },
    mutationFn: createWorkspace,
    onSuccess: async () => {
      toast.success('Workspace created')
      onOpenChange(false)
      await navigate({ to: '/' })
    },
    onError: (err: Error) => {
      console.error(err)
      toast.error(
        err.message || 'Failed to create workspace. Please try again later.'
      )
    },
  })

  const handleSubmit = (e: React.SubmitEvent) => {
    e.preventDefault()
    mutate(name.trim())
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(nextOpen) => !nextOpen && setName('')}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription>
            Workspaces keep your connections organized in separate groups.
          </DialogDescription>
        </DialogHeader>
        <form id="create-workspace-form" onSubmit={handleSubmit}>
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
            form="create-workspace-form"
            disabled={loading || !name.trim()}
          >
            <LoadingContent loading={loading}>Create</LoadingContent>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
