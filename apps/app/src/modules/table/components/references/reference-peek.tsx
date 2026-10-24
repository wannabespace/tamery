import { ArrowRight01Icon, CornerRightUpIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { ScrollArea } from '@tamery/ui/components/custom/scroll-area'
import { Popover, PopoverContent } from '@tamery/ui/components/popover'
import { AnimatePresence, motion } from 'motion/react'
import type { RefObject } from 'react'
import { Fragment, useEffect, useRef, useState } from 'react'

import { Link } from '~/components/link'
import { useConnectionContext } from '~/core/connection/route'
import { tableTabId } from '~/core/tabs/ids'
import { posthog } from '~/lib/posthog'

import { tablePageStore } from '../../lib/store'
import type { Hop } from './hops'
import { tableView } from './hops'
import { RowsView } from './reference-rows'
import { FollowList, RecordView } from './reference-views'

const SLIDE_OFFSET = 12
const slide = {
  center: { opacity: 1, x: 0 },
  enter: (direction: number) => ({ opacity: 0, x: direction * SLIDE_OFFSET }),
  exit: { opacity: 0, transition: { duration: 0 } },
}

const hopTitle = (hop: Hop) => {
  if (hop.kind === 'references') {
    return { detail: String(hop.value), table: 'Referenced by' }
  }
  if (hop.kind === 'record') {
    return {
      detail:
        hop.primaryKeys
          .map((key) => `${key} = ${String(hop.row[key])}`)
          .join(', ') || undefined,
      table: hop.table,
    }
  }
  return { detail: `${hop.column} = ${String(hop.value)}`, table: hop.table }
}

const hopKey = (hop: Hop) => {
  const { detail, table } = hopTitle(hop)
  return `${hop.kind}:${table}:${detail}`
}

const HopView = ({
  hop,
  onFollow,
}: {
  hop: Hop
  onFollow: (hop: Hop) => void
}) => {
  if (hop.kind === 'references') {
    return (
      <FollowList
        heading="Tables pointing at this value"
        items={hop.references.map((reference) => ({
          reference,
          value: hop.value,
        }))}
        onFollow={onFollow}
      />
    )
  }
  if (hop.kind === 'record') {
    return <RecordView {...hop} onFollow={onFollow} />
  }
  return <RowsView hop={hop} onFollow={onFollow} />
}

const Trail = ({
  direction,
  hops,
  onFollow,
  onJump,
  ref,
}: {
  direction: number
  hops: Hop[]
  onFollow: (hop: Hop) => void
  onJump: (index: number) => void
  ref: RefObject<HTMLDivElement | null>
}) => {
  const { connectionResource } = useConnectionContext()
  const hop = hops.at(-1)
  if (!hop) {
    return null
  }
  const { detail, table } = hopTitle(hop)
  const view = tableView(hop)

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b px-1.5">
        <div
          // The compiler memoizes the ref callback, so remounting per hop is what re-runs it.
          key={hops.length}
          ref={(node) => node?.scrollTo({ left: node.scrollWidth })}
          className="no-scrollbar flex min-w-0 flex-1 items-center overflow-x-auto"
        >
          {hops.slice(0, -1).map((previous, index) => (
            <Fragment key={`${index}:${hopKey(previous)}`}>
              <Button
                variant="ghost-muted"
                size="xs"
                className="shrink-0"
                onClick={() => onJump(index)}
              >
                <span data-mask>{hopTitle(previous).table}</span>
              </Button>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                className="text-muted-foreground/60 size-3 shrink-0"
              />
            </Fragment>
          ))}
          <span className="shrink-0 px-2.5 text-xs whitespace-nowrap">
            <span data-mask className="font-medium">
              {table}
            </span>
            {detail && (
              <span data-mask className="text-muted-foreground">
                {' '}
                {detail}
              </span>
            )}
          </span>
        </div>
        {view && (
          <Button
            variant="ghost-muted"
            size="xs"
            className="shrink-0"
            render={
              <Link
                to="/connection/$resourceId/$tabId"
                params={{
                  resourceId: connectionResource.id,
                  tabId: tableTabId(view.schema, view.table),
                }}
                onClick={() =>
                  tablePageStore({
                    id: connectionResource.id,
                    schema: view.schema,
                    table: view.table,
                  }).set((state) => ({
                    ...state,
                    filters: view.filters,
                    orderBy: {},
                  }))
                }
              />
            }
          >
            <HugeiconsIcon icon={CornerRightUpIcon} strokeWidth={2} />
            Open in Table
          </Button>
        )}
      </div>
      <ScrollArea
        ref={ref}
        tabIndex={-1}
        className="relative max-h-[min(32rem,60vh)] min-h-0 overflow-x-hidden outline-none"
      >
        <AnimatePresence initial={false} mode="popLayout" custom={direction}>
          <motion.div
            key={`${hops.length}:${hopKey(hop)}`}
            custom={direction}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.16, ease: [0.32, 0.72, 0, 1] }}
          >
            <HopView hop={hop} onFollow={onFollow} />
          </motion.div>
        </AnimatePresence>
      </ScrollArea>
    </div>
  )
}

export const useReferencePeek = (
  scrollRef: RefObject<HTMLDivElement | null>
) => {
  const [target, setTarget] = useState<{ anchor: Element; hop: Hop } | null>(
    null
  )

  useEffect(() => {
    const scroller = scrollRef.current
    if (!target || !scroller) {
      return
    }
    const close = () => setTarget(null)
    scroller.addEventListener('scroll', close, { once: true })
    return () => scroller.removeEventListener('scroll', close)
  }, [target, scrollRef])

  return {
    close: () => setTarget(null),
    open: (anchor: Element, hop: Hop) => {
      if (target?.anchor === anchor && target.hop.kind === hop.kind) {
        setTarget(null)
        return
      }
      posthog.capture('reference_peek_opened')
      setTarget({ anchor, hop })
    },
    target,
  }
}

export const ReferencePeek = ({
  onClose,
  target,
}: {
  onClose: () => void
  target: { anchor: Element; hop: Hop } | null
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(target)
  if (target && target !== shown) {
    setShown(target)
  }
  const [trail, setTrail] = useState({
    direction: 1,
    hops: [] as Hop[],
    target,
  })
  const current =
    trail.target === shown
      ? trail
      : { direction: 1, hops: shown ? [shown.hop] : [] }
  const { hops } = current

  const step = (next: Hop[], direction: number) => {
    setTrail({ direction, hops: next, target: shown })
    ref.current?.focus()
  }

  return (
    <Popover
      open={!!target}
      onOpenChange={(open, details) => {
        if (open) {
          return
        }
        const pressed = details.event.target
        if (
          details.reason === 'outside-press' &&
          pressed instanceof Element &&
          target?.anchor.contains(pressed.closest('button'))
        ) {
          details.cancel()
          return
        }
        if (details.reason === 'escape-key' && hops.length > 1) {
          details.cancel()
          step(hops.slice(0, -1), -1)
          return
        }
        onClose()
      }}
      onOpenChangeComplete={(open) => {
        if (!open) {
          setShown(null)
        }
      }}
    >
      {shown && (
        <PopoverContent
          anchor={shown.anchor}
          align="start"
          collisionAvoidance={{ align: 'shift' }}
          collisionPadding={16}
          padding="none"
          initialFocus={ref}
          className="w-3xl overflow-hidden"
          // React bubbles portal events to the grid, whose context menu would open over the popover.
          onContextMenu={(event) => event.stopPropagation()}
        >
          <Trail
            ref={ref}
            hops={hops}
            direction={current.direction}
            onFollow={(next) => step([...hops, next], 1)}
            onJump={(index) => step(hops.slice(0, index + 1), -1)}
          />
        </PopoverContent>
      )}
    </Popover>
  )
}
