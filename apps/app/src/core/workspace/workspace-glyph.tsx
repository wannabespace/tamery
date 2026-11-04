import type { Workspace } from './sync'

export const WorkspaceGlyph = ({
  workspace,
}: {
  workspace: Pick<Workspace, 'name'>
}) => (
  <span
    aria-hidden
    data-mask
    className="bg-muted text-2xs text-accent-foreground flex size-4 shrink-0 items-center justify-center rounded font-medium"
  >
    {[...workspace.name][0]?.toUpperCase() ?? ''}
  </span>
)
