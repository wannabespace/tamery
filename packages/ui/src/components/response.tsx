import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import { CodeBlock } from '@tamery/ui/components/custom/code-block'
import { CopyButton } from '@tamery/ui/components/custom/copy-button'
import { Mermaid } from '@tamery/ui/components/custom/mermaid'
import { cn } from '@tamery/ui/lib/utils'
import type { VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { createContext, use } from 'react'
import { Streamdown } from 'streamdown'
import type { ExtraProps } from 'streamdown'

import { responseVariants } from './response.utils'

interface ResponseSlots {
  /** Turns an inline code span into a button led by `icon`, such as a table name the app can open; null keeps the plain span. */
  inlineCodeAction?: (
    text: string
  ) => { icon: IconSvgElement; open: () => void } | null
  /** Draws a Markdown table from its header cells and body rows as plain text; unset keeps the HTML table. */
  table?: (table: { columns: string[]; rows: string[][] }) => React.ReactNode
}

type HastNode = NonNullable<ExtraProps['node']>
type HastChild = HastNode['children'][number]

const textOf = (node: HastChild): string => {
  if (node.type === 'text') {
    return node.value
  }
  return node.type === 'element' ? node.children.map(textOf).join('') : ''
}

const rowsOf = (node: HastNode): string[][] =>
  node.children.flatMap((child) => {
    if (child.type !== 'element') {
      return []
    }
    return child.tagName === 'tr'
      ? [
          child.children
            .filter((cell) => cell.type === 'element')
            .map((cell) => textOf(cell).trim()),
        ]
      : rowsOf(child)
  })

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
        className="text-muted-foreground size-5 [&_svg]:size-3"
        size="icon-sm"
        text={code}
        variant="ghost"
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
    <button
      type="button"
      className={codeClassName}
      data-mask
      onClick={() => action.open()}
    >
      <HugeiconsIcon icon={action.icon} strokeWidth={2} className="size-3" />
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
  node,
  ...props
}: React.ComponentProps<'table'> & ExtraProps) => {
  const { table } = use(ResponseSlotsContext)
  const [columns, ...rows] = table && node ? rowsOf(node) : []
  if (table && columns) {
    return <div className="my-4">{table({ columns, rows })}</div>
  }
  return (
    <div className="bg-background ring-foreground/4 my-4 overflow-x-auto rounded-xl ring">
      <table
        className={cn('w-full text-xs whitespace-nowrap', className)}
        data-mask
        {...props}
      />
    </div>
  )
}

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
  inlineCodeAction,
  table,
  variant,
  ...props
}: React.ComponentProps<typeof Streamdown> &
  ResponseSlots &
  VariantProps<typeof responseVariants>) => (
  <ResponseSlotsContext value={{ inlineCodeAction, table }}>
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
