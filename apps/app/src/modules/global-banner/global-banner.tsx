import {
  Alert02Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { RouterOutputs } from '@tamery/api/orpc/routers'
import { Button } from '@tamery/ui/components/button'
import { ElapsedSeconds } from '@tamery/ui/components/custom/elapsed-seconds'
import { NumberFlow } from '@tamery/ui/components/custom/number-flow'
import { Spinner } from '@tamery/ui/components/spinner'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useDelay } from '@tamery/ui/hooks/use-delay'
import { cn } from '@tamery/ui/lib/utils'
import { useLiveQuery } from '@tanstack/react-db'
import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { type } from 'arktype'
import {
  animate,
  AnimatePresence,
  motion,
  useReducedMotion,
} from 'motion/react'
import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { useSubscription } from 'seitu/react'
import { createWebStorageValue } from 'seitu/web'

import { Link } from '~/components/link'
import { useCollections } from '~/core/collections'
import {
  MAX_RECONNECTION_ATTEMPTS,
  reconnectingPromises,
} from '~/core/runtime/query'
import { slowQueries } from '~/core/runtime/slow-queries'
import {
  openedInvitationId,
  useInvitations,
} from '~/core/workspace/invitations'
import { useIsAnonymous } from '~/lib/auth'
import { orpc } from '~/lib/orpc'
import { appStore, useIsOnline } from '~/store'

type BannerItem = NonNullable<RouterOutputs['banner']>[number]

const typeConfig = {
  error: {
    className: 'bg-red-500/5 border-red-500/20 text-red-400',
    icon: (
      <HugeiconsIcon
        icon={Alert02Icon}
        strokeWidth={2}
        className="size-4 shrink-0"
      />
    ),
  },
  info: {
    className: 'bg-blue-500/5 border-blue-500/20 text-blue-400',
    icon: (
      <HugeiconsIcon
        icon={InformationCircleIcon}
        strokeWidth={2}
        className="size-4 shrink-0"
      />
    ),
  },
  success: {
    className: 'bg-green-500/5 border-green-500/20 text-green-400',
    icon: (
      <HugeiconsIcon
        icon={CheckmarkCircle02Icon}
        strokeWidth={2}
        className="size-4 shrink-0"
      />
    ),
  },
  warning: {
    className: 'bg-orange-500/5 border-orange-500/20 text-orange-400',
    icon: (
      <HugeiconsIcon
        icon={Alert02Icon}
        strokeWidth={2}
        className="size-4 shrink-0"
      />
    ),
  },
} satisfies Record<BannerItem['type'], { icon: ReactNode; className: string }>

const INITIAL_DELAY = 1000

const GUEST_TEXT = 'Many features are disabled until you sign in.'

const bannerDismissedValue = createWebStorageValue({
  defaultValue: [],
  key: 'banner-dismissed',
  schema: type('string[]'),
  type: 'localStorage',
})

const lastBannersValue = createWebStorageValue({
  defaultValue: [],
  key: 'banner-last',
  schema: type('object[]').as<BannerItem[]>(),
  type: 'localStorage',
})

const listQueryOptions = orpc.banner.queryOptions({
  placeholderData: () => lastBannersValue.get(),
})

const bannerQueryOptions = {
  ...listQueryOptions,
  queryFn: async (context: Parameters<typeof listQueryOptions.queryFn>[0]) => {
    const items = await listQueryOptions.queryFn(context)
    lastBannersValue.set(items)
    return items
  },
}

const Banner = ({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) => (
  <motion.div
    initial={{ height: 0, opacity: 0 }}
    animate={{ height: '2rem', opacity: 1 }}
    exit={{ height: 0, opacity: 0 }}
    className={cn('relative shrink-0 border-b text-sm', className)}
  >
    <div className="absolute inset-0 flex h-full items-center gap-2 px-4 py-1">
      {children}
    </div>
  </motion.div>
)

const SHAKE = { x: [0, -4, 4, -2, 2, 0] }

const GuestBannerContent = ({
  prompt,
}: {
  prompt: { at: number; hint: string | null }
}) => {
  const reduceMotion = useReducedMotion()
  const flashRef = useRef<HTMLSpanElement>(null)
  const shakeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!prompt.at || !flashRef.current || !shakeRef.current) {
      return
    }

    animate(flashRef.current, { opacity: [1, 0] }, { duration: 0.9 })

    if (!reduceMotion) {
      animate(shakeRef.current, SHAKE, { duration: 0.3 })
    }
  }, [prompt.at, reduceMotion])

  return (
    <div className="relative flex min-w-0 flex-1 items-center self-stretch">
      <span
        ref={flashRef}
        className="bg-info/20 pointer-events-none absolute -inset-x-4 -inset-y-1 opacity-0"
      />
      <div
        ref={shakeRef}
        className="relative flex min-w-0 flex-1 items-center gap-2"
      >
        {typeConfig.info.icon}
        <span className="min-w-0 flex-1 truncate leading-none">
          <span className="font-medium">{GUEST_TEXT}</span>
          {prompt.hint && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="ml-3"
            >
              {prompt.hint}
            </motion.span>
          )}
        </span>
        <Button variant="ghost-tint" size="xs" render={<Link to="/auth" />}>
          Sign in
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={2}
            data-icon="inline-end"
          />
        </Button>
      </div>
    </div>
  )
}

const DismissButton = ({ id }: { id: string }) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          variant="ghost-tint"
          size="icon-xs"
          aria-label="Dismiss banner"
          onClick={() => bannerDismissedValue.set((state) => [...state, id])}
        />
      }
    >
      <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
    </TooltipTrigger>
    <TooltipContent side="bottom">Dismiss</TooltipContent>
  </Tooltip>
)

const EditConnectionAction = ({ connectionId }: { connectionId: string }) => (
  <Button
    variant="ghost-tint"
    size="xs"
    render={<Link to="/edit/$connectionId" params={{ connectionId }} />}
  >
    Edit connection
    <HugeiconsIcon
      icon={ArrowRight01Icon}
      strokeWidth={2}
      data-icon="inline-end"
    />
  </Button>
)

export const GlobalBanner = () => {
  const { resourceId } = useParams({ strict: false })
  const { connectionsResourcesCollection } = useCollections()
  const { data: resourceRows } = useLiveQuery({
    query: (q) =>
      q
        .from({ r: connectionsResourcesCollection })
        .select(({ r }) => ({ connectionId: r.connectionId, id: r.id })),
  })
  const connectionId = resourceRows.find(
    (row) => row.id === resourceId
  )?.connectionId
  const reconnectingData = useSubscription(reconnectingPromises, {
    selector: (state) =>
      (resourceId &&
        Object.values(state).find((p) => p.resourceId === resourceId)) ||
      null,
  })
  const waitingSince = useSubscription(slowQueries, {
    selector: (state) => (resourceId ? state[resourceId]?.[0] : undefined),
  })
  const isOnline = useIsOnline()
  const signInPrompt = useSubscription(appStore, {
    selector: (state) => state.signInPrompt,
  })
  const isGuest = useIsAnonymous()
  const dismissed = useSubscription(bannerDismissedValue)
  const delayPassed = useDelay(INITIAL_DELAY)
  const invitation = useInvitations().find(({ id }) => !dismissed.includes(id))

  const { data: serverItems = [] } = useQuery({
    ...bannerQueryOptions,
    enabled: delayPassed,
    refetchInterval: 1000 * 60 * 5,
    select: (bannerItems) =>
      bannerItems.filter((item) => !dismissed.includes(item.text)),
    staleTime: 1000 * 60 * 5,
  })
  const data = isOnline
    ? serverItems
    : [
        {
          dismissible: false,
          text: "You're offline. Your changes are saved and will sync once you're back online. AI features are unavailable.",
          type: 'info',
        } satisfies BannerItem,
        ...serverItems,
      ]

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {data.map((item) => (
        <Banner key={item.text} className={typeConfig[item.type].className}>
          {typeConfig[item.type].icon}
          <span className="flex-1 leading-none">{item.text}</span>
          {item.dismissible && <DismissButton id={item.text} />}
        </Banner>
      ))}
      {invitation && (
        <Banner key={invitation.id} className={typeConfig.info.className}>
          {typeConfig.info.icon}
          <span className="min-w-0 flex-1 truncate leading-none">
            <span data-mask>{invitation.inviterName ?? 'A member'}</span>{' '}
            invited you to{' '}
            <span data-mask className="font-medium">
              {invitation.workspaceName}
            </span>
            .
          </span>
          <Button
            variant="ghost-tint"
            size="xs"
            onClick={() => openedInvitationId.set(invitation.id)}
          >
            View invitation
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              strokeWidth={2}
              data-icon="inline-end"
            />
          </Button>
          <DismissButton id={invitation.id} />
        </Banner>
      )}
      {isGuest && (
        <Banner key="guest" className={typeConfig.info.className}>
          <GuestBannerContent prompt={signInPrompt} />
        </Banner>
      )}
      {!reconnectingData && waitingSince !== undefined && (
        <Banner key="slow-query" className={typeConfig.info.className}>
          {typeConfig.info.icon}
          <span className="flex flex-1 items-center gap-2 leading-none">
            <span>The database is taking longer than usual to respond.</span>
            <ElapsedSeconds className="opacity-70" since={waitingSince} />
            <Spinner className="size-3.5" />
          </span>
          {connectionId && <EditConnectionAction connectionId={connectionId} />}
        </Banner>
      )}
      {reconnectingData && (
        <Banner className={typeConfig.warning.className}>
          {typeConfig.warning.icon}
          <span className="flex flex-1 items-center gap-2 leading-none">
            <span>
              Could not connect to the connection. Reconnection attempt{' '}
              <NumberFlow
                value={reconnectingData.attempt}
                suffix={`/${MAX_RECONNECTION_ATTEMPTS}`}
              />
            </span>
            <Spinner className="size-3.5" />
          </span>
          {connectionId && <EditConnectionAction connectionId={connectionId} />}
        </Banner>
      )}
    </AnimatePresence>
  )
}
