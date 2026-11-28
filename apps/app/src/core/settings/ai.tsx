import { useAiKeys } from '~/core/user/ai-key'
import { useHasAccount } from '~/lib/auth'
import { AiCredits } from '~/modules/account/ai-credits'

import { AiProviders } from './ai-providers'
import { ChatCompaction } from './chat-compaction'
import { DictationModel } from './dictation-model'

export const AiSettings = () => {
  const { aiKeys, isLoading } = useAiKeys()
  const hasAccount = useHasAccount()

  if (isLoading) {
    return null
  }

  return (
    <>
      <AiProviders aiKeys={aiKeys} />
      <ChatCompaction />
      <DictationModel
        providers={aiKeys
          .filter(({ enabled }) => enabled)
          .map(({ provider }) => provider)}
      />
      {hasAccount && <AiCredits />}
    </>
  )
}
