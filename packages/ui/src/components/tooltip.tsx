import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'
import { useShortcutReveal } from '@tamery/ui/hooks/use-shortcut-reveal'
import { cn } from '@tamery/ui/lib/utils'
import type { ReactNode } from 'react'
import { createContext, use, useState } from 'react'

const TooltipProvider = ({
  delay = 600,
  ...props
}: TooltipPrimitive.Provider.Props) => (
  <TooltipPrimitive.Provider
    data-slot="tooltip-provider"
    delay={delay}
    {...props}
  />
)

const noShortcut = { isGlyphOnly: false, shortcut: null }

const ShortcutContext = createContext<{
  isGlyphOnly: boolean
  setTrigger?: (trigger: HTMLElement | null) => void
  shortcut: ReactNode
}>(noShortcut)

const ShortcutTooltip = ({
  onOpenChange,
  onOpenChangeComplete,
  open,
  shortcut,
  ...props
}: TooltipPrimitive.Root.Props & { shortcut: ReactNode }) => {
  const [isHovered, setIsHovered] = useState(false)
  const [trigger, setTrigger] = useState<HTMLElement | null>(null)
  const isRevealed = useShortcutReveal(trigger)
  const [isClosingReveal, setIsClosingReveal] = useState(false)
  const isOpenByReveal = isRevealed && !isHovered
  if (isOpenByReveal && !isClosingReveal) {
    setIsClosingReveal(true)
  }

  return (
    <ShortcutContext
      value={{
        isGlyphOnly: isOpenByReveal || (isClosingReveal && !isHovered),
        setTrigger,
        shortcut,
      }}
    >
      <TooltipPrimitive.Root
        data-slot="tooltip"
        open={open ?? (isHovered || isRevealed)}
        onOpenChange={(next, details) => {
          setIsHovered(next)
          if (next) {
            setIsClosingReveal(false)
          }
          onOpenChange?.(next, details)
        }}
        onOpenChangeComplete={(next) => {
          if (!next) {
            setIsClosingReveal(false)
          }
          onOpenChangeComplete?.(next)
        }}
        {...props}
      />
    </ShortcutContext>
  )
}

/** `shortcut`: pass nothing while the control is disabled or the key does not fire here. */
const Tooltip = ({
  shortcut,
  ...props
}: TooltipPrimitive.Root.Props & { shortcut?: ReactNode }) =>
  shortcut ? (
    <ShortcutTooltip shortcut={shortcut} {...props} />
  ) : (
    <ShortcutContext value={noShortcut}>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </ShortcutContext>
  )

const TooltipTrigger = (props: TooltipPrimitive.Trigger.Props) => {
  const { setTrigger } = use(ShortcutContext)
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      ref={setTrigger}
      {...props}
    />
  )
}

const TooltipContent = ({
  className,
  side = 'top',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'side' | 'sideOffset'
  >) => {
  const { isGlyphOnly, shortcut } = use(ShortcutContext)
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="pointer-events-none isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            `bg-foreground text-background data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs`,
            className
          )}
          {...props}
        >
          {!isGlyphOnly && children}
          {shortcut}
          <TooltipPrimitive.Arrow className="bg-foreground fill-foreground z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-xs data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:translate-x-[1.5px] data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:translate-x-[-1.5px] data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:translate-x-[-1.5px] data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:translate-x-[1.5px] data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
