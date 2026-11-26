import { ArrowUpRight01Icon, GlobeIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import { CodeBlock } from '@tamery/ui/components/custom/code-block'
import { CopyButton } from '@tamery/ui/components/custom/copy-button'
import { Mermaid } from '@tamery/ui/components/custom/mermaid'
import { Favicon } from '@tamery/ui/components/favicon'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@tamery/ui/components/popover'
import { cn } from '@tamery/ui/lib/utils'
import type { VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { createContext, use } from 'react'
import { Streamdown } from 'streamdown'
import type { ExtraProps } from 'streamdown'

import { responseVariants } from './response.utils'

/** A Markdown column's alignment; undefined is the start edge. */
export type ColumnAlign = 'center' | 'right' | undefined

export interface ResponseSlots {
  /** Turns an inline code span into a button led by `icon`, such as a table name the app can peek; `render` places that button, as a popover's trigger for one. Null keeps the plain span. */
  inlineCodeAction?: (text: string) => {
    icon: IconSvgElement
    render: (button: React.ReactElement) => React.ReactNode
  } | null
  /** Web links lead with their site's favicon, read at full ink, and show their address on hover; unset keeps plain links. */
  linkPreview?: boolean
  /** Draws a Markdown table from its header cells and body rows as plain text, with each column's alignment; unset keeps the HTML table. */
  table?: (table: {
    aligns: ColumnAlign[]
    columns: string[]
    rows: string[][]
  }) => React.ReactNode
}

type HastNode = NonNullable<ExtraProps['node']>
type HastChild = HastNode['children'][number]

const textOf = (node: HastChild): string => {
  if (node.type === 'text') {
    return node.value
  }
  return node.type === 'element' ? node.children.map(textOf).join('') : ''
}

const rowsOf = (node: HastNode): HastNode[][] =>
  node.children.flatMap((child) => {
    if (child.type !== 'element') {
      return []
    }
    return child.tagName === 'tr'
      ? [child.children.filter((cell) => cell.type === 'element')]
      : rowsOf(child)
  })

const textsOf = (cells: HastNode[]) => cells.map((cell) => textOf(cell).trim())

const alignOf = ({ properties: { align } }: HastNode): ColumnAlign =>
  align === 'center' || align === 'right' ? align : undefined

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

const Table = ({
  className,
  node,
  ...props
}: React.ComponentProps<'table'> & ExtraProps) => {
  const { table } = use(ResponseSlotsContext)
  const [header, ...rows] = table && node ? rowsOf(node) : []
  if (table && header) {
    return (
      <div className="my-4">
        {table({
          aligns: header.map(alignOf),
          columns: textsOf(header),
          rows: rows.map(textsOf),
        })}
      </div>
    )
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

const hostOf = (href: string | undefined) => {
  const url = href && URL.canParse(href) ? new URL(href) : null
  return url?.protocol.startsWith('http') ? url.hostname : null
}

const Link = ({
  children,
  href,
  node: _node,
  ...props
}: React.ComponentProps<'a'> & ExtraProps) => {
  const { linkPreview } = use(ResponseSlotsContext)
  const host = hostOf(href)
  if (!(linkPreview && host && href)) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  }
  const site = host.replace(/^www\./u, '')
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={300}
        render={
          // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- the trigger renders the link's text inside this anchor
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-foreground decoration-foreground/30 hover:decoration-foreground underline underline-offset-4 transition-colors"
          />
        }
      >
        <Favicon host={host} className="mr-1 inline size-4 align-text-bottom" />
        {typeof children === 'string' && URL.canParse(children)
          ? site
          : children}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        padding="none"
        className="w-auto"
      >
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground flex max-w-80 items-center gap-2 px-3 py-2 text-xs transition-colors"
        >
          <HugeiconsIcon
            icon={GlobeIcon}
            strokeWidth={2}
            className="size-3.5 shrink-0"
          />
          <span className="truncate">
            {href.replace(/^https?:\/\//u, '').replace(/\/$/u, '')}
          </span>
          <HugeiconsIcon
            icon={ArrowUpRight01Icon}
            strokeWidth={2}
            className="size-3.5 shrink-0"
          />
        </a>
      </PopoverContent>
    </Popover>
  )
}

const components = {
  a: Link,
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
