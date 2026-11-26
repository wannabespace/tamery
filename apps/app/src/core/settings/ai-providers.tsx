import { PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { AiKeyProvider } from '@tamery/shared/ai-key'
import { AI_KEY_PROVIDERS } from '@tamery/shared/ai-key'
import { objectEntries } from '@tamery/shared/utils'
import { Button } from '@tamery/ui/components/button'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { useState } from 'react'

import { useHasAccount } from '~/lib/auth'
import { promptSignIn } from '~/store'

import { AddProvider } from './add-ai-provider'
import { AiKeyDialog } from './ai-key-dialog'
import type { SavedAiKey } from './ai-provider-row'
import { ProviderRow } from './ai-provider-row'

export const AiProviders = ({ aiKeys }: { aiKeys: SavedAiKey[] }) => {
  const hasAccount = useHasAccount()
  const [editing, setEditing] = useState<AiKeyProvider | null>(null)
  const isSaved = (provider: AiKeyProvider) =>
    aiKeys.some((aiKey) => aiKey.provider === provider)
  const available = objectEntries(AI_KEY_PROVIDERS).filter(
    ([provider]) => !isSaved(provider)
  )
  const add = (provider: AiKeyProvider) =>
    hasAccount
      ? setEditing(provider)
      : promptSignIn('AI features need an account.')

  return (
    <>
      <SettingsGroup
        title="Your providers"
        action={
          aiKeys.length > 0 &&
          available.length > 0 && (
            <AddProvider
              providers={available}
              onPick={add}
              trigger={
                <Button
                  size="icon-xs"
                  variant="ghost-muted"
                  aria-label="Add provider"
                />
              }
            >
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            </AddProvider>
          )
        }
      >
        {aiKeys.map((aiKey) => (
          <ProviderRow
            key={aiKey.provider}
            aiKey={aiKey}
            onReplace={() => setEditing(aiKey.provider)}
          />
        ))}
        {aiKeys.length === 0 && (
          <SettingsRow
            title="No providers yet"
            description="Connect one with your API key, and the AI chat runs on its models, billed by the provider instead of Tamery, on any plan."
          >
            <AddProvider
              providers={available}
              onPick={add}
              trigger={<Button size="sm" variant="outline" />}
            >
              Add provider
            </AddProvider>
          </SettingsRow>
        )}
      </SettingsGroup>
      <AiKeyDialog
        provider={editing}
        replaces={!!editing && isSaved(editing)}
        onClose={() => setEditing(null)}
      />
    </>
  )
}
