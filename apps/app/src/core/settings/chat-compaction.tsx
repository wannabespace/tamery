import { MIN_COMPACT_AT } from '@tamery/ai/models/list'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
} from '@tamery/ui/components/number-field'
import { toast } from 'sonner'

import { authClient } from '~/lib/auth'
import { posthog } from '~/lib/posthog'

export const ChatCompaction = () => {
  const { data: session } = authClient.useSession()
  if (!session) {
    return null
  }
  const current = session.user.chatCompactAt ?? null

  return (
    <SettingsGroup title="Chats">
      <SettingsRow
        title="Compact at"
        description="Tokens a chat reaches before its earlier messages are summarized, up to 80% of the model's window. Empty compacts at 80%. A chat can set its own."
      >
        <NumberField
          size="sm"
          className="w-32"
          defaultValue={current ?? undefined}
          min={MIN_COMPACT_AT}
          step={10_000}
          onValueCommitted={async (next) => {
            if (next === current) {
              return
            }
            posthog.capture('ai_compact_at_default_set', {
              custom: next !== null,
            })
            const { error } = await authClient.updateUser({
              chatCompactAt: next,
            })
            if (error) {
              toast.error(error.message)
            }
          }}
        >
          <NumberFieldGroup>
            <NumberFieldInput aria-label="Compact at" placeholder="80%" />
          </NumberFieldGroup>
        </NumberField>
      </SettingsRow>
    </SettingsGroup>
  )
}
