import { type } from 'arktype'

const workspaceMetadataSchema = type({
  'default?': 'boolean',
}).narrow((value) => !Array.isArray(value))

const workspaceMetadataParser = type('string.json.parse').to(
  workspaceMetadataSchema
)

const parseWorkspaceMetadata = (
  metadata: string | null
): typeof workspaceMetadataSchema.infer => {
  if (!metadata) {
    return {}
  }

  const parsed = workspaceMetadataParser(metadata)

  return parsed instanceof type.errors ? {} : parsed
}

export const serializeWorkspaceMetadata = (
  metadata: typeof workspaceMetadataSchema.infer
) => JSON.stringify(metadata)

export const isDefaultWorkspaceMetadata = (metadata: string | null) =>
  parseWorkspaceMetadata(metadata).default === true

export const INVITABLE_ROLES = ['editor', 'viewer'] as const

export const invitableRole = type.enumerated(...INVITABLE_ROLES)

export type InvitableRole = typeof invitableRole.infer

export const WORKSPACE_ROLES = ['owner', ...INVITABLE_ROLES] as const

export const workspaceRole = type.enumerated(...WORKSPACE_ROLES)

export type WorkspaceRole = typeof workspaceRole.infer

export const EDITOR_ROLES: readonly WorkspaceRole[] = ['owner', 'editor']

export const describeInvitation = ({
  inviterName,
  role,
}: {
  inviterName: string | null
  role: InvitableRole
}) =>
  role === 'viewer'
    ? `${inviterName ?? 'A member'} invited you as a viewer. You will be able to open and query its connections, but not change them.`
    : `${inviterName ?? 'A member'} invited you as an editor. You will be able to open, add and edit its connections, and invite others.`
