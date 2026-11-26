import { createStore } from 'seitu'
import { useSubscription } from 'seitu/react'

import { posthog } from '~/lib/posthog'

const noSignInPrompt: { at: number; hint: string | null } = {
  at: 0,
  hint: null,
}

export const appStore = createStore({
  isOnline: window.navigator.onLine,
  isSubscriptionDialogOpen: false,
  offerAiKey: false,
  signInPrompt: noSignInPrompt,
  upgradeHint: null as string | null,
})

const updateOnline = () => {
  appStore.set(
    (state) =>
      ({ ...state, isOnline: window.navigator.onLine }) satisfies typeof state
  )
}

window.addEventListener('online', () => updateOnline())
window.addEventListener('offline', () => updateOnline())

export const useIsOnline = () =>
  useSubscription(appStore, { selector: (state) => state.isOnline })

export const promptSignIn = (hint: string) => {
  void posthog.capture('guest_feature_blocked', { hint })
  appStore.set(
    (state) =>
      ({
        ...state,
        signInPrompt: { at: Date.now(), hint },
      }) satisfies typeof state
  )
}

export const setIsSubscriptionDialogOpen = (
  isOpen: boolean,
  hint: string | null = null,
  { offerAiKey = false } = {}
) => {
  if (isOpen) {
    posthog.capture('subscription_dialog_opened', { hint })
  }
  appStore.set(
    (state) =>
      ({
        ...state,
        isSubscriptionDialogOpen: isOpen,
        // Kept on close, so the dialog fades out with the text it showed.
        upgradeHint: isOpen ? hint : state.upgradeHint,
        offerAiKey: isOpen ? offerAiKey : state.offerAiKey,
      }) satisfies typeof state
  )
}
