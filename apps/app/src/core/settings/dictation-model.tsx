import type { AiKeyProvider } from '@tamery/shared/ai-key'
import {
  AI_KEY_PROVIDERS,
  getDictationModel,
  getDictationModels,
} from '@tamery/shared/ai-key'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tamery/ui/components/select'
import { useSubscription } from 'seitu/react'

import { dictationModelValue } from '~/core/user/ai-key'
import { posthog } from '~/lib/posthog'

export const DictationModel = ({
  providers,
}: {
  providers: AiKeyProvider[]
}) => {
  const picked = useSubscription(dictationModelValue)
  const models = getDictationModels(providers)
  const current = getDictationModel(providers, picked)
  if (!current) {
    return null
  }
  const items = models.map(({ id, name, provider }) => ({
    label: models.every((model) => model.provider === provider)
      ? name
      : `${name} (${AI_KEY_PROVIDERS[provider]})`,
    provider,
    value: id,
  }))
  return (
    <SettingsGroup title="Dictation">
      <SettingsRow
        title="Dictation model"
        description="Turns what you say into a chat message, on this device."
      >
        <Select
          items={items}
          value={current.id}
          onValueChange={(next) => {
            const item = items.find(({ value }) => value === next)
            if (item) {
              dictationModelValue.set(item.value)
              posthog.capture('ai_dictation_model_picked', {
                model: item.value,
                provider: item.provider,
              })
            }
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label="Dictation model"
            className="w-64"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent size="sm">
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
    </SettingsGroup>
  )
}
