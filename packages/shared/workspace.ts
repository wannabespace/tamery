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

export const INVITABLE_ROLES = ['admin', 'editor', 'viewer'] as const

export const invitableRole = type.enumerated(...INVITABLE_ROLES)

export type InvitableRole = typeof invitableRole.infer

export const WORKSPACE_ROLES = ['owner', ...INVITABLE_ROLES] as const

export const workspaceRole = type.enumerated(...WORKSPACE_ROLES)

export type WorkspaceRole = typeof workspaceRole.infer

export const EDITOR_ROLES: readonly WorkspaceRole[] = [
  'owner',
  'admin',
  'editor',
]

export const MEMBER_MANAGER_ROLES: readonly WorkspaceRole[] = ['owner', 'admin']

const INVITATION_ROLE_DESCRIPTIONS: Record<InvitableRole, string> = {
  admin:
    'as an admin. You will be able to open, add and edit its connections, and invite and manage its members.',
  editor:
    'as an editor. You will be able to open, add and edit its connections.',
  viewer:
    'as a viewer. You will be able to open and query its connections, but not change them.',
}

export const describeInvitation = ({
  inviterName,
  role,
}: {
  inviterName: string | null
  role: InvitableRole
}) =>
  `${inviterName ?? 'A member'} invited you ${INVITATION_ROLE_DESCRIPTIONS[role]}`
