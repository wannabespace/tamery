import { HugeiconsIcon } from '@hugeicons/react'
import { CodeBlock } from '@tamery/ui/components/custom/code-block'
import { CopyButton } from '@tamery/ui/components/custom/copy-button'
import { Mermaid } from '@tamery/ui/components/custom/mermaid'
import { ResponseLink } from '@tamery/ui/components/custom/response-link'
import {
  ResponseTable,
  ResponseTableBody,
  ResponseTableCell,
  ResponseTableHead,
  ResponseTableHeader,
} from '@tamery/ui/components/custom/response-table'
import { cn } from '@tamery/ui/lib/utils'
import type { VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { use } from 'react'
import { Streamdown } from 'streamdown'
import type { ExtraProps } from 'streamdown'

import type { ResponseSlots } from './custom/response-slots'
import { ResponseSlotsContext } from './custom/response-slots'
import { responseVariants } from './response.utils'

export type { ColumnAlign, ResponseSlots } from './custom/response-slots'

const LANGUAGE_LABELS: Record<string, string> = {
  bash: 'Bash',
  css: 'CSS',
  html: 'HTML',
  js: 'JavaScript',
  json: 'JSON',
  jsx: 'JSX',
  py: 'Python',
  sh: 'Shell',
  sql: 'SQL',
  ts: 'TypeScript',
  tsx: 'TSX',
  yaml: 'YAML',
}

export const ResponseCodeBlock = ({
  className,
  code,
  language,
  ...props
}: React.ComponentProps<'div'> & {
  code: string
  language: string
}) => (
  <div
    className={cn(
      'bg-popover ring-foreground/4 min-w-0 overflow-hidden rounded-xl shadow-xs ring',
      className
    )}
    {...props}
  >
    <div className="text-muted-foreground text-2xs flex h-6 items-center gap-0.5 pr-0.5 pl-2">
      <span className="min-w-0 flex-1 truncate">
        {LANGUAGE_LABELS[language] ?? language}
      </span>
      <CopyButton
        aria-label="Copy code"
        size="icon-2xs"
        text={code}
        variant="ghost-muted"
      />
    </div>
    <CodeBlock className="max-h-72 pb-2" code={code} language={language} />
  </div>
)

const Code = ({
  children,
  className,
  node: _node,
  ...props
}: React.ComponentProps<'code'> & ExtraProps) => {
  const { inlineCodeAction } = use(ResponseSlotsContext)
  if ('data-block' in props) {
    const code = String(children).replace(/\n$/u, '')
    const language =
      /language-(?<language>\S+)/u.exec(className ?? '')?.groups?.language ??
      'text'
    const block = (
      <ResponseCodeBlock className="my-4" code={code} language={language} />
    )
    return language === 'mermaid' ? (
      <Mermaid chart={code} className="my-4" fallback={block} />
    ) : (
      block
    )
  }
  const action =
    typeof children === 'string' ? inlineCodeAction?.(children) : null
  const codeClassName = cn(
    'bg-foreground/5 rounded-md px-1 py-px font-mono text-[0.9em]',
    action &&
      'text-primary hover:bg-foreground/10 inline-flex items-center gap-1 transition-colors',
    className
  )
  return action ? (
    action.render(
      <button type="button" className={codeClassName} data-mask>
        <HugeiconsIcon icon={action.icon} strokeWidth={2} className="size-3" />
        {children}
      </button>
    )
  ) : (
    <code className={codeClassName} data-mask {...props}>
      {children}
    </code>
  )
}

const components = {
  a: ResponseLink,
  code: Code,
  table: ResponseTable,
  tbody: ResponseTableBody,
  td: ResponseTableCell,
  th: ResponseTableHead,
  thead: ResponseTableHeader,
}

export const Response = ({
  className,
  inlineCodeAction,
  linkPreview,
  table,
  variant,
  ...props
}: React.ComponentProps<typeof Streamdown> &
  ResponseSlots &
  VariantProps<typeof responseVariants>) => (
  <ResponseSlotsContext value={{ inlineCodeAction, linkPreview, table }}>
    <Streamdown
      className={cn(responseVariants({ variant }), className)}
      components={components}
      controls={false}
      data-slot="response"
      linkSafety={{ enabled: false }}
      {...props}
    />
  </ResponseSlotsContext>
)
