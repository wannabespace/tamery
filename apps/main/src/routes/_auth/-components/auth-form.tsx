import { GithubIcon, GoogleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  EARLY_ACCESS_ERROR_CODE,
  SOCIAL_PROVIDER_LABELS,
} from '@tamery/shared/constants'
import { Badge } from '@tamery/ui/components/badge'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { FieldSeparator, FieldSet } from '@tamery/ui/components/field'
import { Form, useAppForm } from '@tamery/ui/components/tanstack-form'
import { useIsMutating, useMutation } from '@tanstack/react-query'
import { getRouteApi, useRouter } from '@tanstack/react-router'
import { type } from 'arktype'

import { authClient, getLastUsedLoginMethod } from '~/lib/auth'
import { posthog } from '~/lib/posthog'
import { handleError } from '~/utils/error'

import { sendSignInCode } from '../-lib/sign-in'

const { useSearch } = getRouteApi('/_auth')

const emailSchema = type({
  email: type('string.email').configure({ message: 'Invalid email address' }),
})

const earlyAccessErrorSchema = type({
  error: { code: `'${EARLY_ACCESS_ERROR_CODE}'` },
})

const SOCIAL_PROVIDERS = [
  {
    icon: (
      <HugeiconsIcon icon={GoogleIcon} strokeWidth={2} className="size-4" />
    ),
    id: 'google',
    label: SOCIAL_PROVIDER_LABELS.google,
  },
  {
    icon: (
      <HugeiconsIcon icon={GithubIcon} strokeWidth={2} className="size-4" />
    ),
    id: 'github',
    label: SOCIAL_PROVIDER_LABELS.github,
  },
]

const Last = () => (
  <Badge
    variant="secondary"
    className="pointer-events-none absolute -top-2 -right-2"
  >
    Last
  </Badge>
)

const SocialButton = ({
  provider,
}: {
  provider: (typeof SOCIAL_PROVIDERS)[number]
}) => {
  const { redirectPath } = useSearch()
  const router = useRouter()
  const { href } = router.buildLocation({ to: '/account' })
  const { href: signInHref } = router.buildLocation({
    to: '/sign-in',
    search: { redirectPath },
  })
  const isAnyPending = useIsMutating({ mutationKey: ['social'] }) > 0
  const { mutate, isPending } = useMutation({
    mutationKey: ['social', provider.id],
    mutationFn: async () => {
      void posthog.capture('social_sign_in_started', { provider: provider.id })
      const callbackUrl = new URL(location.origin + (redirectPath || href))
      const newUserCallbackUrl = new URL(callbackUrl)

      newUserCallbackUrl.searchParams.set('newUser', 'true')

      const { error } = await authClient.signIn.social({
        provider: provider.id,
        callbackURL: callbackUrl.href,
        newUserCallbackURL: newUserCallbackUrl.href,
        errorCallbackURL: location.origin + signInHref,
      })

      if (error) {
        throw error
      }
    },
    onError: handleError,
  })

  return (
    <Button
      variant="outline"
      className="relative w-full"
      onClick={() => mutate()}
      disabled={isAnyPending}
    >
      <LoadingContent loading={isPending}>
        {provider.icon}
        {provider.label}
      </LoadingContent>
      {getLastUsedLoginMethod() === provider.id && <Last />}
    </Button>
  )
}

const SocialAuthForm = () => (
  <div className="grid grid-cols-2 gap-3">
    {SOCIAL_PROVIDERS.map((provider) => (
      <SocialButton key={provider.id} provider={provider} />
    ))}
  </div>
)

export const AuthForm = () => {
  const search = useSearch()
  const lastMethod = getLastUsedLoginMethod()
  const router = useRouter()

  const { mutate: sendCode, isPending } = useMutation({
    meta: { event: 'sign_in_code_sent' },
    mutationFn: sendSignInCode,
    onSuccess: (_, email) =>
      router.navigate({ to: '/email-code', search: { ...search, email } }),
    onError: (error) =>
      earlyAccessErrorSchema.allows(error)
        ? router.navigate({ to: '/early-access' })
        : handleError(error),
  })

  const form = useAppForm({
    defaultValues: { email: '' },
    validators: { onChange: emailSchema },
    onSubmit: ({ value }) => sendCode(value.email),
  })

  return (
    <>
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Sign in to Tamery
        </h1>
        <p className="text-muted-foreground text-sm">
          Tamery is in early access. Sign in or request access below.
        </p>
        <p className="text-muted-foreground text-sm">
          Conar is still available at{' '}
          <a
            href="https://conar.app"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => posthog.capture('legacy_app_opened')}
          >
            conar.app
          </a>
          .
        </p>
      </div>
      <Form form={form}>
        <FieldSet className="w-full">
          <form.AppField name="email">
            {(field) => (
              <field.Field>
                <field.Label>Email</field.Label>
                <field.Input
                  placeholder="you@company.com"
                  type="email"
                  autoCapitalize="none"
                  autoComplete="email"
                  spellCheck={false}
                  required
                  autoFocus
                />
              </field.Field>
            )}
          </form.AppField>
          <Button
            className="relative w-full"
            type="submit"
            disabled={isPending}
          >
            <LoadingContent loading={isPending}>
              Continue with email
            </LoadingContent>
            {lastMethod === 'email-otp' && <Last />}
          </Button>
        </FieldSet>
      </Form>
      <FieldSeparator>Or continue with</FieldSeparator>
      <SocialAuthForm />
    </>
  )
}
