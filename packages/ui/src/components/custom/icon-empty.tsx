import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import type { ComponentProps, ReactNode } from 'react'

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../empty'

export const IconEmpty = ({
  children,
  description,
  icon,
  size = 'sm',
  title,
  variant = 'muted',
}: {
  children?: ReactNode
  description: ReactNode
  icon: IconSvgElement
  size?: ComponentProps<typeof Empty>['size']
  title: ReactNode
  variant?: ComponentProps<typeof EmptyMedia>['variant']
}) => (
  <Empty size={size} className="min-h-0 flex-1 overflow-y-auto">
    <EmptyHeader>
      <EmptyMedia variant={variant}>
        <HugeiconsIcon icon={icon} strokeWidth={2} />
      </EmptyMedia>
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyDescription className="group-data-[size=sm]/empty:max-w-64">
        {description}
      </EmptyDescription>
    </EmptyHeader>
    {children}
  </Empty>
)
