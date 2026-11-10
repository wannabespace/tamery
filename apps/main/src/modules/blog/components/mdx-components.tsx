import {
  Fence,
  markdownComponents,
} from '@tamery/ui/components/custom/markdown'
import { isValidElement } from 'react'
import type { ComponentProps } from 'react'

import { Mermaid } from './mermaid'

export const mdxComponents = {
  ...markdownComponents,
  pre: ({ children }: ComponentProps<'pre'>) =>
    isValidElement<{ children: string; className?: string }>(children) &&
    children.props.className === 'language-mermaid' ? (
      <Mermaid chart={children.props.children} />
    ) : (
      <Fence>{children}</Fence>
    ),
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
