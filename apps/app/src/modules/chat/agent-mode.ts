import { checkOrUpgrade } from '~/core/user/permissions'
import { posthog } from '~/lib/posthog'

import { agentModeValue } from './stores'

export const toggleAgentMode = () => {
  const enabled = !agentModeValue.get()
  if (enabled && !checkOrUpgrade('ai.chat.use')) {
    return
  }
  agentModeValue.set(enabled)
  posthog.capture('agent_mode_toggled', { enabled })
}
