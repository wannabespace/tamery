import { markdownComponents } from '@tamery/ui/components/custom/markdown'
import type { ComponentProps } from 'react'

import { CloudDiagram } from './cloud-diagram'

export const mdxComponents = {
  ...markdownComponents,
  CloudDiagram,
  a: ({ href = '', children, ...props }: ComponentProps<'a'>) =>
    /^https?:/u.test(href) ? (
      <a href={href} rel="noopener noreferrer" target="_blank" {...props}>
        {children}
      </a>
    ) : (
      <a href={href} {...props}>
        {children}
      </a>
    ),
}
