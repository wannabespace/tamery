import { Link01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cardClass } from '@tamery/ui/components/card.utils'
import { CodeBlock } from '@tamery/ui/components/custom/code-block'
import { CopyIconButton } from '@tamery/ui/components/custom/copy-button'
import { InlineCode } from '@tamery/ui/components/custom/inline-code'
import { Kbd } from '@tamery/ui/components/kbd'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tamery/ui/components/table'
import { cn } from '@tamery/ui/lib/utils'
import { isValidElement } from 'react'
import type { ReactNode } from 'react'

const headingText = (children: ReactNode): string => {
  if (typeof children === 'string') {
    return children
  }
  if (Array.isArray(children)) {
    return children.map(headingText).join('')
  }
  if (isValidElement<{ children?: ReactNode }>(children)) {
    return headingText(children.props.children)
  }
  return ''
}

const slugify = (children: ReactNode) =>
  headingText(children)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-|-$/gu, '')

export const Fence = ({ children }: { children?: ReactNode }) => {
  if (!isValidElement<{ children: string; className?: string }>(children)) {
    return null
  }

  const code = children.props.children.trimEnd()
  const language = children.props.className?.replace('language-', '') ?? 'text'

  return (
    <div className={cn(cardClass, 'my-6 flex items-start')}>
      <CodeBlock
        className="max-h-96 min-w-0 flex-1"
        code={code}
        language={language}
        padding="popup"
        size="xs"
      />
      <CopyIconButton
        className="m-2 ml-0"
        label="Copy"
        side="left"
        text={code}
      />
    </div>
  )
}

// Fumadocs passes `id`; a bare MDX pipeline does not, so derive it from the text.
export const SectionHeading = ({
  children,
  id,
  level: Tag,
}: {
  children?: ReactNode
  id?: string
  level: 'h2' | 'h3'
}) => {
  const anchor = id ?? slugify(children)

  return (
    <Tag className="group/heading" id={anchor}>
      {children}
      <a
        aria-label="Link to this section"
        className="text-muted-foreground hover:text-foreground focus-visible:focus-ring ml-2 inline-flex rounded-sm align-middle opacity-0 transition-opacity group-hover/heading:opacity-100 focus-visible:opacity-100"
        href={`#${anchor}`}
      >
        <HugeiconsIcon className="size-4" icon={Link01Icon} strokeWidth={2} />
      </a>
    </Tag>
  )
}

export const markdownComponents = {
  code: ({ children }: { children?: ReactNode }) => (
    <InlineCode>{children}</InlineCode>
  ),
  h2: (props: { children?: ReactNode; id?: string }) => (
    <SectionHeading level="h2" {...props} />
  ),
  h3: (props: { children?: ReactNode; id?: string }) => (
    <SectionHeading level="h3" {...props} />
  ),
  kbd: ({ children }: { children?: ReactNode }) => (
    <Kbd variant="keycap">{children}</Kbd>
  ),
  pre: Fence,
  table: Table,
  tbody: TableBody,
  td: TableCell,
  th: TableHead,
  thead: TableHeader,
  tr: TableRow,
}
