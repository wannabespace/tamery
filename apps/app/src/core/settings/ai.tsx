import type { AiKeyProvider } from '@tamery/shared/ai-key'
import {
  AI_KEY_PROVIDERS,
  DICTATION_MODELS,
  getDictationModel,
} from '@tamery/shared/ai-key'
import { objectEntries } from '@tamery/shared/utils'
import { Alert, AlertDescription } from '@tamery/ui/components/alert'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { Input } from '@tamery/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tamery/ui/components/select'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useSubscription } from 'seitu/react'

import { dictationModelValue, useAiKey } from '~/core/user/ai-key'
import { useHasAccount } from '~/lib/auth'
import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'
import { queryClient } from '~/lib/query-client'
import { AiCredits } from '~/modules/account/ai-credits'

const providers = objectEntries(AI_KEY_PROVIDERS).map(([value, label]) => ({
  label,
  value,
}))

const refreshAi = () =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: orpc.account.aiKey.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.ai.models.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.usage.key() }),
  ])

const SavedKey = ({
  end,
  provider,
}: {
  end: string
  provider: AiKeyProvider
}) => {
  const { isPending, mutate } = useMutation({
    ...orpc.account.aiKey.remove.mutationOptions(),
    meta: { event: 'ai_key_removed' },
    onSuccess: refreshAi,
  })

  return (
    <SettingsGroup title="Your key">
      <SettingsRow
        title={
          <span>
            {AI_KEY_PROVIDERS[provider]} key ending in{' '}
            <span data-mask className="font-mono">
              {end}
            </span>
          </span>
        }
        description={`The AI chat runs on your ${AI_KEY_PROVIDERS[provider]} account and is billed by ${AI_KEY_PROVIDERS[provider]}, with no Tamery budget or credits.`}
      >
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => mutate()}
        >
          <LoadingContent loading={isPending}>Remove</LoadingContent>
        </Button>
      </SettingsRow>
      <DictationModelRow provider={provider} />
    </SettingsGroup>
  )
}

const DictationModelRow = ({ provider }: { provider: AiKeyProvider }) => {
  const picked = useSubscription(dictationModelValue)
  const items = DICTATION_MODELS[provider].map(({ id, name }) => ({
    label: name,
    value: id,
  }))
  if (items.length === 0) {
    return null
  }
  return (
    <SettingsRow
      title="Dictation model"
      description="Turns what you say into a chat message, on this device."
    >
      <Select
        items={items}
        value={getDictationModel(provider, picked)}
        onValueChange={(next) => {
          if (next) {
            dictationModelValue.set(next)
            posthog.capture('ai_dictation_model_picked', {
              model: next,
              provider,
            })
          }
        }}
      >
        <SelectTrigger size="sm" aria-label="Dictation model" className="w-48">
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
  )
}

const KeyForm = () => {
  const [provider, setProvider] = useState<AiKeyProvider>('anthropic')
  const [key, setKey] = useState('')
  const { error, isPending, mutate } = useMutation({
    ...orpc.account.aiKey.set.mutationOptions(),
    meta: { event: 'ai_key_saved' },
    onSuccess: refreshAi,
  })

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        mutate({ key, provider })
      }}
    >
      <SettingsGroup title="Use your own key">
        <SettingsRow
          title="Provider"
          description="The AI chat runs on its models, billed by the provider instead of Tamery, on any plan."
        >
          <Select
            items={providers}
            value={provider}
            onValueChange={(next) => next && setProvider(next)}
          >
            <SelectTrigger size="sm" aria-label="Provider" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent size="sm">
              {providers.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow
          title="API key"
          description="Stored encrypted and never shown again."
        >
          <Input
            data-mask
            type="password"
            variant="code"
            autoComplete="off"
            aria-label="API key"
            className="w-56"
            value={key}
            onChange={(event) => setKey(event.target.value)}
          />
        </SettingsRow>
        <SettingsRow
          title="Check and save"
          description="Saving sends the provider one short request, billed to the key."
        >
          <Button type="submit" disabled={isPending || !key.trim()}>
            <LoadingContent loading={isPending}>Save</LoadingContent>
          </Button>
        </SettingsRow>
      </SettingsGroup>
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="wrap-anywhere">
            {error.message}
          </AlertDescription>
        </Alert>
      )}
    </form>
  )
}

export const AiSettings = () => {
  const { aiKey, isLoading } = useAiKey()
  const hasAccount = useHasAccount()

  if (isLoading) {
    return null
  }

  return (
    <>
      {aiKey ? <SavedKey {...aiKey} /> : <KeyForm />}
      {hasAccount && <AiCredits />}
    </>
  )
}
