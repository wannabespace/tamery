import type { AiKeyProvider } from '@tamery/shared/ai-key'
import { AI_KEY_PROVIDERS } from '@tamery/shared/ai-key'
import { Alert, AlertDescription } from '@tamery/ui/components/alert'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tamery/ui/components/dialog'
import { Field, FieldLabel } from '@tamery/ui/components/field'
import { Input } from '@tamery/ui/components/input'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { orpc } from '~/lib/orpc'

import { refreshAi } from './refresh-ai'

export const AiKeyForm = ({
  onSaved,
  provider,
  replaces,
}: {
  onSaved: () => void
  provider: AiKeyProvider
  replaces: boolean
}) => {
  const [key, setKey] = useState('')
  const name = AI_KEY_PROVIDERS[provider]
  const { error, isPending, mutate } = useMutation({
    ...orpc.account.aiKey.set.mutationOptions(),
    meta: { event: 'ai_key_saved' },
    onSuccess: async () => {
      await refreshAi()
      onSaved()
    },
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {replaces ? `Replace ${name} key` : `Connect ${name}`}
        </DialogTitle>
        <DialogDescription>
          {name} gets one short request to check the key, billed to it. The key
          is stored encrypted and never shown again.
        </DialogDescription>
      </DialogHeader>
      <form
        id="ai-key-form"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          mutate({ key, provider })
        }}
      >
        <Field>
          <FieldLabel htmlFor="ai-key">API key</FieldLabel>
          <Input
            autoFocus
            data-mask
            id="ai-key"
            type="password"
            variant="code"
            autoComplete="off"
            value={key}
            onChange={(event) => setKey(event.target.value)}
          />
        </Field>
        {error && (
          <Alert variant="destructive">
            <AlertDescription className="wrap-anywhere">
              {error.message}
            </AlertDescription>
          </Alert>
        )}
      </form>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button
          type="submit"
          form="ai-key-form"
          disabled={isPending || !key.trim()}
        >
          <LoadingContent loading={isPending}>
            {replaces ? 'Replace' : 'Connect'}
          </LoadingContent>
        </Button>
      </DialogFooter>
    </>
  )
}
