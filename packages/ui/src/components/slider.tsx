import { Slider as SliderPrimitive } from '@base-ui/react/slider'
import { DitherFill } from '@tamery/ui/components/custom/dither-fill'
import { cn } from '@tamery/ui/lib/utils'
import type { CSSProperties } from 'react'

const Slider = ({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  step = 1,
  variant = 'default',
  ...props
}: SliderPrimitive.Root.Props & {
  /** `steps` is a 24px track with a tick per step and a fill that dithers toward the thumb, for picking one of a few levels. */
  variant?: 'default' | 'steps'
}) => {
  const initial = value ?? defaultValue
  const thumbCount = Array.isArray(initial) ? initial.length : 1
  const stepCount = Math.round((max - min) / step)

  return (
    <SliderPrimitive.Root
      className={cn(
        'group/slider data-horizontal:w-full data-vertical:h-full',
        className
      )}
      data-slot="slider"
      data-variant={variant}
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      step={step}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(
            'relative grow overflow-hidden select-none',
            variant === 'default' &&
              'bg-input/90 rounded-2xl data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1',
            variant === 'steps' && 'bg-muted h-6 w-full rounded-lg'
          )}
        >
          {variant === 'steps' &&
            Array.from({ length: stepCount }, (_, index) => (
              <span
                key={index}
                className="bg-foreground/20 absolute top-1/2 left-[calc(var(--thumb-width)/2+(100%-var(--thumb-width))*var(--tick))] h-2 w-px -translate-y-1/2 [--thumb-width:--spacing(4)]"
                style={{ '--tick': (index + 1) / stepCount } as CSSProperties}
              />
            ))}
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className={cn(
              'select-none',
              variant === 'default' &&
                'bg-primary data-horizontal:h-full data-vertical:w-full',
              variant === 'steps' &&
                'text-primary ease-house h-full transition-[width] duration-150 group-data-dragging/slider:transition-none motion-reduce:transition-none'
            )}
          >
            {variant === 'steps' && <DitherFill />}
          </SliderPrimitive.Indicator>
        </SliderPrimitive.Track>
        {Array.from({ length: thumbCount }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className={cn(
              'block shrink-0 select-none disabled:pointer-events-none disabled:opacity-50',
              variant === 'default' &&
                'hover:ring-ring/30 has-focus-visible:ring-ring/30 size-4 rounded-2xl bg-white shadow-md ring-1 ring-black/10 transition-[color,box-shadow] duration-200 not-dark:bg-clip-padding hover:ring-4 has-focus-visible:ring-4',
              variant === 'steps' &&
                'border-primary has-focus-visible:ring-ring/50 ease-house h-5 w-4 rounded-md border-2 bg-white shadow-sm transition-[inset-inline-start] duration-150 group-data-dragging/slider:transition-none has-focus-visible:ring-3 motion-reduce:transition-none'
            )}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
