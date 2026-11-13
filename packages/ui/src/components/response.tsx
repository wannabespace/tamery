import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { CodeBlock } from '@tamery/ui/components/custom/code-block'
import { CopyButton } from '@tamery/ui/components/custom/copy-button'
import { Mermaid } from '@tamery/ui/components/custom/mermaid'
import { cn } from '@tamery/ui/lib/utils'
import type { VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { createContext, use, useState } from 'react'
import { Streamdown } from 'streamdown'
import type { ExtraProps } from 'streamdown'

import { responseVariants } from './response.utils'

const COLLAPSED_LINES = 10

interface ResponseSlots {
  /** Extra buttons in a fenced block's header, beside Copy. */
  codeActions?: (code: string, language: string) => React.ReactNode
  /** Turns an inline code span into a button, such as a table name the app can open; null keeps the plain span. */
  inlineCodeAction?: (text: string) => (() => void) | null
}

// A context, not per-render `components`: Streamdown remounts every block whose component identity changes, so a streaming answer would lose collapsed states each chunk.
const ResponseSlotsContext = createContext<ResponseSlots>({})

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
}) => {
  const { codeActions } = use(ResponseSlotsContext)
  const [expanded, setExpanded] = useState(false)
  const lines = code.split('\n')
  const hidden = lines.length - COLLAPSED_LINES
  const collapsed = hidden > 0 && !expanded

  return (
    <div
      className={cn(
        'bg-foreground/3 my-2 min-w-0 overflow-hidden rounded-lg',
        className
      )}
      {...props}
    >
      <div className="text-muted-foreground text-2xs flex h-6 items-center gap-0.5 pr-0.5 pl-2">
        <span className="min-w-0 flex-1 truncate">
          {LANGUAGE_LABELS[language] ?? language}
        </span>
        {codeActions?.(code, language)}
        <CopyButton
          className="text-muted-foreground size-5 [&_svg]:size-3"
          size="icon-sm"
          text={code}
          variant="ghost"
        />
      </div>
      <CodeBlock
        className={collapsed ? 'pb-0' : 'max-h-72 pb-2'}
        code={collapsed ? lines.slice(0, COLLAPSED_LINES).join('\n') : code}
        language={language}
      />
      {hidden > 0 && (
        <button
          className="text-muted-foreground hover:bg-foreground/3 hover:text-foreground text-2xs flex h-6 w-full items-center gap-1 px-2 transition-colors"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            className={cn(
              'size-3 transition-transform',
              expanded && 'rotate-180'
            )}
          />
          {expanded
            ? 'Show less'
            : `Show ${hidden} more ${hidden === 1 ? 'line' : 'lines'}`}
        </button>
      )}
    </div>
  )
}

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
    const block = <ResponseCodeBlock code={code} language={language} />
    return language === 'mermaid' ? (
      <Mermaid chart={code} className="my-2" fallback={block} />
    ) : (
      block
    )
  }
  const action =
    typeof children === 'string' ? inlineCodeAction?.(children) : null
  const codeClassName = cn(
    'bg-foreground/5 rounded-md px-1 py-px font-mono text-[0.9em]',
    action && 'text-primary hover:bg-foreground/10 transition-colors',
    className
  )
  return action ? (
    <button type="button" className={codeClassName} data-mask onClick={action}>
      {children}
    </button>
  ) : (
    <code className={codeClassName} data-mask {...props}>
      {children}
    </code>
  )
}

const Table = ({
  className,
  node: _node,
  ...props
}: React.ComponentProps<'table'> & ExtraProps) => (
  <div className="bg-background ring-foreground/4 my-2 overflow-x-auto rounded-xl ring">
    <table
      className={cn('w-full text-xs whitespace-nowrap', className)}
      data-mask
      {...props}
    />
  </div>
)

const TableHead = ({
  className,
  node: _node,
  ...props
}: React.ComponentProps<'th'> & ExtraProps) => (
  <th
    className={cn(
      'h-8 border-b px-2 text-left font-medium not-last:border-r first:pl-4',
      className
    )}
    {...props}
  />
)

const TableCell = ({
  className,
  node: _node,
  ...props
}: React.ComponentProps<'td'> & ExtraProps) => (
  <td
    className={cn(
      'h-8 border-b px-2 not-last:border-r first:pl-4 in-[tr:last-child]:border-b-0',
      className
    )}
    {...props}
  />
)

const TableHeader = ({
  node: _node,
  ...props
}: React.ComponentProps<'thead'> & ExtraProps) => <thead {...props} />

const TableBody = ({
  node: _node,
  ...props
}: React.ComponentProps<'tbody'> & ExtraProps) => <tbody {...props} />

const components = {
  code: Code,
  table: Table,
  tbody: TableBody,
  td: TableCell,
  th: TableHead,
  thead: TableHeader,
}

export const Response = ({
  className,
  codeActions,
  inlineCodeAction,
  variant,
  ...props
}: React.ComponentProps<typeof Streamdown> &
  ResponseSlots &
  VariantProps<typeof responseVariants>) => (
  <ResponseSlotsContext value={{ codeActions, inlineCodeAction }}>
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
