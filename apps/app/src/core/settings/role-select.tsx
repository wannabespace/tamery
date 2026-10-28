import type { WorkspaceRole } from '@tamery/shared/workspace'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tamery/ui/components/select'
import { capitalCase } from 'change-case'

export const RoleSelect = <TRole extends WorkspaceRole>({
  disabled,
  label,
  onChange,
  roles,
  size,
  value,
}: {
  disabled?: boolean
  label: string
  onChange: (role: TRole) => void
  roles: readonly TRole[]
  size: 'sm' | 'default'
  value: TRole
}) => (
  <Select
    items={roles.map((role) => ({ label: capitalCase(role), value: role }))}
    value={value}
    disabled={disabled}
    onValueChange={(next) => next && onChange(next)}
  >
    <SelectTrigger size={size} aria-label={label} className="w-24">
      <SelectValue />
    </SelectTrigger>
    <SelectContent size={size}>
      {roles.map((role) => (
        <SelectItem key={role} value={role}>
          {capitalCase(role)}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)
