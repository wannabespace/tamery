import type { Passkey } from '@better-auth/passkey/client'
import { PASSKEY_ERROR_CODES } from '@better-auth/passkey/client'
import {
  FingerPrintIcon,
  GithubIcon,
  GoogleIcon,
  Mail01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { WebAuthnErrorCode } from '@simplewebauthn/browser'
import { SOCIAL_PROVIDER_LABELS } from '@tamery/shared/constants'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tamery/ui/components/dialog'
import { Field, FieldLabel } from '@tamery/ui/components/field'
import { Input } from '@tamery/ui/components/input'
import { useMutation, useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { format } from 'date-fns'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { authClient } from '~/lib/auth'
import { API_QUERY_KEY } from '~/lib/query-client'
import { handleError } from '~/utils/error'

import { BrowserMark, inBrowser } from './browser'
import { ConfirmAction } from './confirm-action'
import { TwoFactor } from './two-factor'

const { useNavigate, useSearch } = getRouteApi('/_protected/settings/$section')

// Never compare against authClient.$ERROR_CODES: it exists only in Better Auth's types, at runtime it is a path proxy and no code ever equals it.
const SESSION_NOT_FRESH_CODE = 'SESSION_NOT_FRESH'

// A dismissed or timed-out browser prompt reports NotAllowedError, which arrives as the passthrough code, not AUTH_CANCELLED.
const PASSKEY_DISMISSED_CODES = new Set<string>([
  PASSKEY_ERROR_CODES.AUTH_CANCELLED.code,
  ...([
    'ERROR_CEREMONY_ABORTED',
    'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY',
  ] satisfies WebAuthnErrorCode[]),
])

const ALREADY_REGISTERED: WebAuthnErrorCode =
  'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED'

const accountsQuery = {
  queryFn: () => authClient.listAccounts({ fetchOptions: { throw: true } }),
  queryKey: [API_QUERY_KEY, 'auth', 'accounts'],
}

const passkeysQuery = {
  queryFn: () =>
    authClient.passkey.listUserPasskeys({ fetchOptions: { throw: true } }),
  queryKey: [API_QUERY_KEY, 'auth', 'passkeys'],
}

const SOCIAL_PROVIDERS = [
  { icon: GoogleIcon, id: 'google', label: SOCIAL_PROVIDER_LABELS.google },
  { icon: GithubIcon, id: 'github', label: SOCIAL_PROVIDER_LABELS.github },
] as const

const SocialRow = ({
  accountId,
  autoConnect,
  icon,
  id,
  label,
  onChange,
}: (typeof SOCIAL_PROVIDERS)[number] & {
  accountId?: string
  autoConnect: boolean
  onChange: () => void
}) => {
  const { mutate: connect, isPending: isConnecting } = useMutation({
    meta: { event: 'sign_in_method_connected' },
    mutationFn: () => {
      const url = location.origin + location.pathname

      return authClient.linkSocial({
        callbackURL: url,
        errorCallbackURL: url,
        fetchOptions: { throw: true },
        provider: id,
      })
    },
    onError: (error) => handleError(error),
  })

  useEffect(() => {
    if (autoConnect) {
      connect()
    }
  }, [autoConnect, connect])

  const { mutate: disconnect, isPending: isDisconnecting } = useMutation({
    meta: { event: 'sign_in_method_disconnected' },
    mutationFn: (idToUnlink: string) =>
      authClient.unlinkAccount({
        accountId: idToUnlink,
        fetchOptions: { throw: true },
      }),
    onError: (error: { code?: string }) => {
      if (error.code === SESSION_NOT_FRESH_CODE) {
        toast.error(`Sign in again to disconnect ${label}.`)
      } else {
        void handleError(error)
      }
    },
    onSuccess: () => {
      onChange()
      toast.success(`${label} disconnected`)
    },
  })

  return (
    <SettingsRow
      icon={<HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />}
      title={label}
      description={accountId ? 'Connected' : 'Not connected'}
    >
      {accountId ? (
        <ConfirmAction
          action="Disconnect"
          title={`Disconnect ${label}?`}
          description={`You can no longer sign in with ${label}. Email sign-in keeps working.`}
          isPending={isDisconnecting}
          onConfirm={(close) => disconnect(accountId, { onSuccess: close })}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => (inBrowser ? inBrowser(id) : connect())}
          disabled={isConnecting}
        >
          <LoadingContent loading={isConnecting}>Connect</LoadingContent>
          <BrowserMark />
        </Button>
      )}
    </SettingsRow>
  )
}

const RenamePasskeyForm = ({
  currentName,
  id,
  onRenamed,
}: {
  currentName: string
  id: string
  onRenamed: () => void
}) => {
  const [name, setName] = useState(currentName)
  const { mutate: rename, isPending } = useMutation({
    meta: { event: 'passkey_renamed' },
    mutationFn: () =>
      authClient.passkey.updatePasskey({
        fetchOptions: { throw: true },
        id,
        name: name.trim(),
      }),
    onError: (error) => handleError(error),
    onSuccess: onRenamed,
  })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        rename()
      }}
    >
      <Field>
        <FieldLabel htmlFor={`passkey-name-${id}`}>Name</FieldLabel>
        <Input
          id={`passkey-name-${id}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
          required
        />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={isPending || !name.trim()}>
          <LoadingContent loading={isPending}>Save</LoadingContent>
        </Button>
      </DialogFooter>
    </form>
  )
}

const PasskeyRow = ({
  createdAt,
  id,
  name,
  onChange,
}: Pick<Passkey, 'createdAt' | 'id' | 'name'> & { onChange: () => void }) => {
  const [isRenaming, setIsRenaming] = useState(false)
  const { mutate: deletePasskey, isPending } = useMutation({
    meta: { event: 'passkey_deleted' },
    // Not fetchOptions.throw: its error carries only the HTTP status text, and the server's refusal has to reach the toast.
    mutationFn: async () => {
      const { error } = await authClient.passkey.deletePasskey({ id })

      if (error) {
        throw error
      }
    },
    onError: (error) => handleError(error),
    onSuccess: () => {
      onChange()
      toast.success('Passkey deleted')
    },
  })

  return (
    <SettingsRow
      icon={<span className="size-4" />}
      title={<span data-mask>{name || 'Passkey'}</span>}
      description={`Added ${format(createdAt, 'PP')}`}
    >
      <Dialog open={isRenaming} onOpenChange={setIsRenaming}>
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          Rename
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename passkey</DialogTitle>
          </DialogHeader>
          <RenamePasskeyForm
            id={id}
            currentName={name ?? ''}
            onRenamed={() => {
              onChange()
              setIsRenaming(false)
            }}
          />
        </DialogContent>
      </Dialog>
      <ConfirmAction
        action="Delete"
        title="Delete this passkey?"
        description="You can no longer sign in with it. Remove it from your password manager too."
        isPending={isPending}
        onConfirm={(close) => deletePasskey(undefined, { onSuccess: close })}
      />
    </SettingsRow>
  )
}

const Passkeys = ({
  onChange,
  passkeys,
}: {
  onChange: () => void
  passkeys: Passkey[]
}) => {
  const { mutate: addPasskey, isPending } = useMutation({
    meta: { event: 'passkey_added' },
    mutationFn: async () => {
      const { error } = await authClient.passkey.addPasskey()

      if (error) {
        throw error
      }
    },
    onError: (error: { code?: string }) => {
      if (error.code === SESSION_NOT_FRESH_CODE) {
        toast.error('Sign in again to add a passkey.')
      } else if (error.code === ALREADY_REGISTERED) {
        toast.error(
          'This device or password manager already has a passkey for your account.'
        )
      } else if (!(error.code && PASSKEY_DISMISSED_CODES.has(error.code))) {
        void handleError(error)
      }
    },
    onSuccess: () => {
      onChange()
      toast.success('Passkey added')
    },
  })

  return (
    <>
      <SettingsRow
        icon={
          <HugeiconsIcon
            icon={FingerPrintIcon}
            strokeWidth={2}
            className="size-4"
          />
        }
        title="Passkeys"
        description={
          passkeys.length > 0
            ? `${passkeys.length} registered`
            : 'Sign in with your fingerprint, face or device PIN instead of an email code.'
        }
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => (inBrowser ? inBrowser() : addPasskey())}
          disabled={isPending}
        >
          <LoadingContent loading={isPending}>Add</LoadingContent>
          <BrowserMark />
        </Button>
      </SettingsRow>
      {passkeys.map((passkey) => (
        <PasskeyRow key={passkey.id} {...passkey} onChange={onChange} />
      ))}
    </>
  )
}

const SignInMethods = ({
  email,
  onPasskeysChange,
  passkeys,
}: {
  email: string
  onPasskeysChange: () => void
  passkeys: Passkey[]
}) => {
  const { connect, error } = useSearch()
  const navigate = useNavigate()
  const { data: accounts, refetch } = useQuery(accountsQuery)

  useEffect(() => {
    if (connect && accounts) {
      void navigate({ replace: true, search: {} })
    }
  }, [accounts, connect, navigate])

  useEffect(() => {
    if (error) {
      toast.error(
        "Couldn't connect that account. It must use your Tamery email and not belong to another Tamery account."
      )
      void navigate({ replace: true, search: {} })
    }
  }, [error, navigate])

  return (
    <SettingsGroup title="Sign-in methods">
      <SettingsRow
        icon={
          <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} className="size-4" />
        }
        title="Email"
        description={<span data-mask>{email}</span>}
      />
      <Passkeys passkeys={passkeys} onChange={onPasskeysChange} />
      {SOCIAL_PROVIDERS.map((provider) => (
        <SocialRow
          key={provider.id}
          {...provider}
          accountId={
            accounts?.find(({ providerId }) => providerId === provider.id)?.id
          }
          autoConnect={
            connect === provider.id &&
            !!accounts?.every(({ providerId }) => providerId !== provider.id)
          }
          onChange={refetch}
        />
      ))}
    </SettingsGroup>
  )
}

export const SecuritySettings = () => {
  const { data: session } = authClient.useSession()
  const { data: passkeys, refetch: refetchPasskeys } = useQuery(passkeysQuery)

  if (!(session && passkeys)) {
    return null
  }

  return (
    <>
      <SignInMethods
        email={session.user.email}
        passkeys={passkeys}
        onPasskeysChange={refetchPasskeys}
      />
      <TwoFactor
        hasPasskey={passkeys.length > 0}
        twoFactorEnabled={session.user.twoFactorEnabled ?? false}
      />
    </>
  )
}
