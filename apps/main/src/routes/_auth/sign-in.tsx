import { createFileRoute, redirect } from '@tanstack/react-router'

import { authClient } from '~/lib/auth'

import { AuthForm } from './-components/auth-form'

const SignInPage = () => <AuthForm />

export const Route = createFileRoute('/_auth/sign-in')({
  component: SignInPage,
  loader: async () => {
    const { data } = await authClient.getSession()

    if (data?.user) {
      throw redirect({ to: '/account' })
    }
  },
})
