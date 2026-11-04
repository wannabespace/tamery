import {
  Mail01Icon,
  PlusSignIcon,
  Settings02Icon,
  Tick02Icon,
  UnfoldMoreIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { isDefaultWorkspaceMetadata } from '@tamery/shared/workspace'
import { Button } from '@tamery/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tamery/ui/components/dropdown-menu'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { NameGlyph } from '~/components/name-glyph'
import { checkOrUpgrade } from '~/core/user/permissions'
import { useActiveWorkspace } from '~/core/workspace/hooks'
import {
  openedInvitationId,
  useInvitations,
} from '~/core/workspace/invitations'
import { workspaceSelection } from '~/core/workspace/utils'
import { WorkspaceNameDialog } from '~/core/workspace/workspace-name-dialog'
import { useIsAnonymous } from '~/lib/auth'
import { posthog } from '~/lib/posthog'
import { useIsOnline } from '~/store'

export const WorkspaceSwitcher = () => {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const isAnonymous = useIsAnonymous()
  const [createOpen, setCreateOpen] = useState(false)
  const { data: activeWorkspace, workspaces } = useActiveWorkspace()
  const isOnline = useIsOnline()
  const invitations = useInvitations()

  const switchWorkspace = async (id: string) => {
    setOpen(false)

    if (id === activeWorkspace?.id) {
      return
    }

    workspaceSelection.set(id)
    posthog.capture('workspace_switched')
    await navigate({ to: '/' })
  }

  const handleCreate = () => {
    setOpen(false)

    if (checkOrUpgrade('workspace.create')) {
      setCreateOpen(true)
    }
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              aria-label="Switch workspace"
              // oxlint-disable-next-line shadcn/no-restyle -- title-bar pickers sit tighter than a toolbar button
              className="max-w-56 gap-1.5 px-2"
            />
          }
        >
          {activeWorkspace ? (
            <>
              <NameGlyph name={activeWorkspace.name} />
              <span data-mask className="truncate">
                {activeWorkspace.name}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground truncate">Workspace</span>
          )}
          {invitations.length > 0 && (
            <span
              aria-label="Pending invitations"
              className="bg-primary size-1.5 shrink-0 rounded-full"
            />
          )}
          <HugeiconsIcon
            icon={UnfoldMoreIcon}
            strokeWidth={2}
            className="text-muted-foreground/70 size-3 shrink-0"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          {invitations.length > 0 && (
            <>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Invitations</DropdownMenuLabel>
                {invitations.map((pending) => (
                  <DropdownMenuItem
                    key={pending.id}
                    onClick={() => openedInvitationId.set(pending.id)}
                  >
                    <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} />
                    <span data-mask className="truncate">
                      {pending.workspaceName}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}
          {workspaces
            .toSorted(
              (a, b) =>
                Number(isDefaultWorkspaceMetadata(b.metadata)) -
                Number(isDefaultWorkspaceMetadata(a.metadata))
            )
            .map((workspace) => (
              <DropdownMenuItem
                key={workspace.id}
                onClick={() => switchWorkspace(workspace.id)}
              >
                <NameGlyph name={workspace.name} />
                <span data-mask className="truncate">
                  {workspace.name}
                </span>
                {workspace.id === activeWorkspace?.id && (
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    strokeWidth={2}
                    className="ml-auto"
                  />
                )}
              </DropdownMenuItem>
            ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() =>
              navigate({
                params: { section: 'workspace' },
                to: '/settings/$section',
              })
            }
          >
            <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} />
            <span className="truncate">
              Manage{' '}
              {activeWorkspace ? (
                <span data-mask>{activeWorkspace.name}</span>
              ) : (
                'workspace'
              )}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className={isAnonymous ? 'opacity-50' : undefined}
            disabled={!isOnline}
            onClick={handleCreate}
          >
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            Create workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <WorkspaceNameDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}
