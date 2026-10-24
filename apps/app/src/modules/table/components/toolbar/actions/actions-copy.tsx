import { enabledFilters } from '@tamery/shared/filters'
import { CodeBlock } from '@tamery/ui/components/custom/code-block'
import { CopyIconButton } from '@tamery/ui/components/custom/copy-button'
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogTitle,
} from '@tamery/ui/components/dialog'
import { Tabs, TabsList, TabsTrigger } from '@tamery/ui/components/tabs'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSubscription } from 'seitu/react'

import { GENERATOR_COMPATIBILITY } from '~/core/codegen/compatibility'
import {
  generateQueryDrizzle,
  generateSchemaDrizzle,
} from '~/core/codegen/formats/drizzle'
import {
  generateQueryKysely,
  generateSchemaKysely,
} from '~/core/codegen/formats/kysely'
import {
  generateQueryPrisma,
  generateSchemaPrisma,
} from '~/core/codegen/formats/prisma'
import { generateQuerySQL, generateSchemaSQL } from '~/core/codegen/formats/sql'
import { generateSchemaTypeScript } from '~/core/codegen/formats/typescript'
import { generateSchemaZod } from '~/core/codegen/formats/zod'
import type {
  GeneratorFormat,
  QueryParams,
  SchemaParams,
} from '~/core/codegen/types'
import { useConnectionContext } from '~/core/connection/route'
import { resourceIndexesQueryOptions } from '~/core/queries/indexes/list'

import { useTableColumnsContext } from '../../../lib/columns'
import { useTablePageStore } from '../../../lib/store'

type Kind = 'schema' | 'query'

interface Format {
  type: GeneratorFormat
  label: string
  language: string
  generator: (params: SchemaParams & QueryParams) => string
}

const FORMATS: Record<Kind, Format[]> = {
  query: [
    { generator: generateQuerySQL, label: 'SQL', language: 'sql', type: 'sql' },
    {
      generator: generateQueryPrisma,
      label: 'Prisma',
      language: 'typescript',
      type: 'prisma',
    },
    {
      generator: generateQueryDrizzle,
      label: 'Drizzle',
      language: 'typescript',
      type: 'drizzle',
    },
    {
      generator: generateQueryKysely,
      label: 'Kysely',
      language: 'typescript',
      type: 'kysely',
    },
  ],
  schema: [
    {
      generator: generateSchemaSQL,
      label: 'SQL',
      language: 'sql',
      type: 'sql',
    },
    {
      generator: generateSchemaTypeScript,
      label: 'TypeScript',
      language: 'typescript',
      type: 'ts',
    },
    {
      generator: generateSchemaZod,
      label: 'Zod',
      language: 'typescript',
      type: 'zod',
    },
    {
      generator: generateSchemaPrisma,
      label: 'Prisma',
      language: 'prisma',
      type: 'prisma',
    },
    {
      generator: generateSchemaDrizzle,
      label: 'Drizzle',
      language: 'typescript',
      type: 'drizzle',
    },
    {
      generator: generateSchemaKysely,
      label: 'Kysely',
      language: 'typescript',
      type: 'kysely',
    },
  ],
}

export const ActionsCopy = ({
  table,
  schema,
  open,
  onOpenChange,
}: {
  table: string
  schema: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const { connectionResource, defaultSchema, dialect } = useConnectionContext()
  const store = useTablePageStore()
  const filters = useSubscription(store, {
    selector: (state) => state.filters,
  })
  const { columns } = useTableColumnsContext()
  const { data: indexes } = useQuery({
    ...resourceIndexesQueryOptions({ connectionResource }),
    throwOnError: false,
  })
  const [kind, setKind] = useState<Kind>('schema')
  const [formatType, setFormatType] = useState<GeneratorFormat>('sql')

  const active = enabledFilters(filters)
  const throughKeys = kind === 'query' && active.some((filter) => filter.via)
  const formats = FORMATS[kind].filter((f) => {
    const compatible = GENERATOR_COMPATIBILITY[f.type]
    return (
      (!compatible || compatible.includes(dialect)) &&
      (!throughKeys || f.type === 'sql')
    )
  })
  const format = formats.find((f) => f.type === formatType) ?? formats[0]

  if (!format) {
    return null
  }

  const code = format.generator({
    columns,
    defaultSchema,
    dialect,
    filters: active,
    indexes: indexes ?? [],
    schema,
    table,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange} variant="panel">
      <DialogContent showCloseButton={false}>
        <div className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b px-2">
          <DialogTitle className="mx-2 truncate" data-mask>
            {table}
          </DialogTitle>
          <Tabs value={kind} onValueChange={setKind}>
            <TabsList>
              <TabsTrigger value="schema" className="min-w-20">
                Schema
              </TabsTrigger>
              <TabsTrigger value="query" className="min-w-20">
                Query
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <DialogCloseButton className="justify-self-end" />
        </div>
        <Tabs
          value={format.type}
          onValueChange={setFormatType}
          className="min-h-0 flex-1"
        >
          <TabsList variant="bar" className="shrink-0 after:hidden">
            {formats.map((f) => (
              <TabsTrigger
                key={f.type}
                value={f.type}
                className="flex-none transition-none"
              >
                {f.label}
              </TabsTrigger>
            ))}
            <div className="flex flex-1 items-center justify-end border-b px-1">
              <CopyIconButton label={`Copy ${format.label}`} text={code} />
            </div>
          </TabsList>
          <CodeBlock
            // oxlint-disable-next-line shadcn/no-restyle -- the block sits flush under the tab strip
            className="no-scrollbar scroll-fade min-h-0 flex-1 py-2"
            code={code}
            language={format.language}
            lineNumbers
            size="xs"
            wrap
          />
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
