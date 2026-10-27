import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { challenge } from '@tamery/shared/challenge'
import { title } from '@tamery/shared/title'
import { Button } from '@tamery/ui/components/button'
import { AuthSidePanel } from '@tamery/ui/components/custom/auth-side-panel'
import { skipToken, useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'

import { TitleBar } from '~/components/title-bar'
import { resetGuestState } from '~/core/user/permissions'
import {
  authClient,
  bearerToken,
  isSignedIn,
  successAuthToast,
} from '~/lib/auth'
import { lastLocationStorageValue } from '~/lib/last-location'
import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'

const signInUrl = (type: 'web' | 'desktop') => {
  const verifier = challenge.generateVerifier()
  const codeChallenge = challenge.generateCode(verifier)

  return {
    verifier,
    codeChallenge,
    url: `${import.meta.env.VITE_PUBLIC_MAIN_URL}/deep/sign-in?codeChallenge=${codeChallenge}&type=${type}`,
  }
}

const AuthPage = () => {
  const router = useRouter()
  const { data: session, refetch } = authClient.useSession()
  const [verifier, setVerifier] = useState<string | null>(null)
  const [codeChallenge, setCodeChallenge] = useState<string | null>(null)

  const signInWithChallenge = () => {
    const {
      verifier: nextVerifier,
      codeChallenge: nextCodeChallenge,
      url,
    } = signInUrl(window.electron ? 'desktop' : 'web')

    setVerifier(nextVerifier)
    setCodeChallenge(nextCodeChallenge)

    if (window.electron) {
      window.open(url, '_blank')
    } else {
      location.assign(url)
    }
  }

  const { data, error } = useQuery(
    orpc.account.challenge.listen.liveOptions({
      input: codeChallenge ? { codeChallenge } : skipToken,
    })
  )

  const isWaiting = !!codeChallenge && !data?.ready && !error

  const cancelSignIn = () => {
    setVerifier(null)
    setCodeChallenge(null)
    posthog.capture('sign_in_cancelled')
  }

  const { mutate: exchange } = useMutation(
    orpc.account.challenge.exchange.mutationOptions({
      onSuccess: async (exchangeData) => {
        const wasGuest = !!session?.user.isAnonymous
        bearerToken.set(exchangeData.token)
        await refetch()

        if (wasGuest) {
          await resetGuestState()
        }

        await router.navigate({ href: lastLocationStorageValue.get() ?? '/' })
        posthog.capture('signed_in')
        successAuthToast(!!exchangeData.newUser)
      },
    })
  )

  useEffect(() => {
    if (!data?.ready || !codeChallenge || !verifier) {
      return
    }

    exchange({ codeChallenge, verifier })
  }, [data, exchange, codeChallenge, verifier])

  return (
    <>
      {window.electron && (
        <TitleBar className="traffic-lights:mb-0 -mb-10.25" />
      )}
      <div className="relative grid flex-1 overflow-hidden lg:grid-cols-2">
        <AuthSidePanel />
        <div className="relative flex flex-col overflow-hidden px-4 py-6">
          <div className="relative m-auto flex w-full max-w-87.5 flex-1 flex-col justify-center">
            <motion.img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt=""
              className="mb-8 size-12 will-change-transform"
              initial={{
                opacity: 0,
                transform: 'translateY(10px)',
                filter: 'blur(4px)',
              }}
              animate={{
                opacity: 1,
                transform: 'translateY(0)',
                filter: 'none',
              }}
              transition={{ duration: 0.4, delay: 0.5 }}
            />
            <motion.div
              className="will-change-transform"
              initial={{
                opacity: 0,
                transform: 'translateY(10px)',
                filter: 'blur(4px)',
              }}
              animate={{
                opacity: 1,
                transform: 'translateY(0)',
                filter: 'none',
              }}
              transition={{ duration: 0.4, delay: 0.35 }}
            >
              <h1 className="text-foreground text-2xl font-semibold tracking-tight">
                Sign in to continue
              </h1>
              <p className="text-muted-foreground mt-2 mb-8">
                Tamery is in early access. Sign in to request access. We’ll
                email you when it’s ready.
              </p>
            </motion.div>
            <motion.div
              className="will-change-transform"
              initial={{
                opacity: 0,
                transform: 'translateY(10px)',
                filter: 'blur(4px)',
              }}
              animate={{
                opacity: 1,
                transform: 'translateY(0)',
                filter: 'none',
              }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <Button
                className="mb-2 w-full"
                size="lg"
                onClick={() => signInWithChallenge()}
              >
                {isWaiting ? (
                  <span className="animate-pulse">Waiting for sign in...</span>
                ) : (
                  'Sign In'
                )}
              </Button>
              {isWaiting ? (
                <div className="mb-2 flex justify-center">
                  <Button variant="link-muted" size="xs" onClick={cancelSignIn}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground mb-4 text-center text-xs">
                  If you already have access, sign in as usual.
                </p>
              )}
            </motion.div>
            {!!error && (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <HugeiconsIcon
                  icon={Alert02Icon}
                  strokeWidth={2}
                  className="text-destructive size-4"
                />
                {error.message}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export const Route = createFileRoute('/auth')({
  component: AuthPage,
  head: () => ({
    meta: [{ title: title('Sign in') }],
  }),
  beforeLoad: async () => {
    if (window.electron) {
      return
    }

    if (await isSignedIn()) {
      throw redirect({ to: '/' })
    }

    throw redirect({ href: signInUrl('web').url })
  },
})
