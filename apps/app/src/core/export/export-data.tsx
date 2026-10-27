import {
  BracesIcon,
  Copy01Icon,
  Download01Icon,
  LayoutTable02Icon,
  Note01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import {
  downloadFile,
  recordsToMarkdownTable,
  toCSV,
} from '@tamery/shared/files'
import type { ActiveFilter } from '@tamery/shared/filters'
import { EQUAL_FILTER } from '@tamery/shared/filters'
import { valueToText } from '@tamery/shared/value-text'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@tamery/ui/components/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { copy } from '@tamery/ui/lib/copy'
import { useMutation } from '@tanstack/react-query'
import { formatDate } from 'date-fns'
import { toast } from 'sonner'

import { useObjectNames } from '~/core/catalog/names'
import { handleError } from '~/utils/error'

const EXPORT_LIMITS = [50, 100, 500, 1000, 5000] as const
const EXPORT_TOAST_ID = 'export-data'

type ContentGeneratorType = 'download' | 'copy'
type ContentFormatType = 'csv' | 'json' | 'markdown'

const generateContent = ({
  data,
  format,
}: {
  data: Record<string, unknown>[]
  format: ContentFormatType
}) => {
  if (format === 'json') {
    return valueToText(data, 2)
  }

  if (data[0] === undefined) {
    return null
  }

  const columns = Object.keys(data[0]).map((key) => ({ key }))

  return format === 'csv'
    ? toCSV(columns, data)
    : recordsToMarkdownTable(columns, data)
}

const FILE_META = {
  csv: { extension: 'csv', mime: 'text/csv;charset=utf-8;' },
  json: { extension: 'json', mime: 'application/json' },
  markdown: { extension: 'md', mime: 'text/markdown;charset=utf-8;' },
} satisfies Record<ContentFormatType, { extension: string; mime: string }>

interface ExportProps {
  type: ContentGeneratorType
  format: ContentFormatType
  limit?: (typeof EXPORT_LIMITS)[number]
  filters?: ActiveFilter[]
  selected?: Record<string, unknown>[]
}

const isSelected = (
  row: Record<string, unknown>,
  selected: Record<string, unknown>[]
) =>
  selected.some((keys) =>
    Object.entries(keys).every(
      ([column, value]) => String(row[column]) === String(value)
    )
  )

const ExportDataDropdownMenuSubContent = ({
  format,
  type,
  onExport,
  selected,
}: {
  format: ContentFormatType
  type: ContentGeneratorType
  onExport: (props: ExportProps) => void
  selected?: Record<string, unknown>[]
}) => {
  const names = useObjectNames()
  const filters = selected?.flatMap((row) =>
    Object.entries(row).map(
      ([column, value]) =>
        ({ column, ref: EQUAL_FILTER, values: [value] }) satisfies ActiveFilter
    )
  )

  let selectedLabel = `Selected ${names.row}s`
  if (selected && selected.length === 1) {
    selectedLabel = `1 selected ${names.row}`
  } else if (selected && selected.length > 1) {
    selectedLabel = `${selected.length} selected ${names.row}s`
  }

  return (
    <DropdownMenuSubContent>
      {!!selected && (
        <>
          <DropdownMenuItem
            disabled={selected.length === 0}
            onClick={() => onExport({ filters, format, selected, type })}
          >
            {selectedLabel}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      {EXPORT_LIMITS.map((limit) => (
        <DropdownMenuItem
          key={limit}
          onClick={() => onExport({ format, limit, type })}
        >
          First {limit} rows
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => onExport({ format, type })}>
        All rows
      </DropdownMenuItem>
    </DropdownMenuSubContent>
  )
}

const useExportMutation = ({
  filename,
  getData,
}: {
  filename: string
  getData: ExportDataProps['getData']
}) =>
  useMutation({
    meta: { event: 'data_exported' },
    mutationFn: async ({
      type,
      format,
      filters,
      limit,
      selected,
    }: ExportProps) => {
      // Selected rows go out as one OR of every key column, so a composite key matches more than it should.
      const fetched = await getData({ filters, limit })
      const data = selected
        ? fetched.filter((row) => isSelected(row, selected))
        : fetched
      const content = generateContent({ data, format })

      if (content === null) {
        return { count: 0, format, type }
      }

      if (type === 'download') {
        const { extension, mime } = FILE_META[format]
        const stamp = formatDate(new Date(), 'yyyy-MM-dd_HH-mm-ss')
        downloadFile(
          content,
          `${filename}${limit ? `_${limit}` : ''}_${stamp}.${extension}`,
          mime
        )
      } else {
        copy(content)
      }

      return { count: data.length, format, type }
    },
    onError: (error) => {
      toast.dismiss(EXPORT_TOAST_ID)
      handleError(error)
    },
    onMutate: () => {
      toast.loading('Preparing data…', { id: EXPORT_TOAST_ID })
    },
    onSuccess: ({ count, type, format }) => {
      if (count === 0) {
        toast.info('Nothing to export — no rows matched', {
          id: EXPORT_TOAST_ID,
        })
        return
      }

      const label = format === 'markdown' ? 'Markdown' : format.toUpperCase()
      toast.success(
        type === 'download'
          ? `Downloaded ${count} row${count === 1 ? '' : 's'} as ${label}`
          : `Copied ${count} row${count === 1 ? '' : 's'} as ${label}`,
        { id: EXPORT_TOAST_ID }
      )
    },
  })

const FORMAT_ITEMS = [
  { format: 'csv', icon: LayoutTable02Icon, label: 'CSV' },
  { format: 'json', icon: BracesIcon, label: 'JSON' },
  { format: 'markdown', icon: Note01Icon, label: 'Markdown' },
] satisfies {
  format: ContentFormatType
  label: string
  icon: IconSvgElement
}[]

export interface ExportDataProps {
  filename: string
  getData: ({
    limit,
    filters,
  }: {
    limit?: (typeof EXPORT_LIMITS)[number]
    filters?: ActiveFilter[]
  }) => Promise<Record<string, unknown>[]>
  selected?: Record<string, unknown>[]
  disabled?: boolean
}

const ExportItems = ({
  onExport,
  selected,
  disabled,
}: {
  onExport: (props: ExportProps) => void
  selected?: Record<string, unknown>[]
  disabled?: boolean
}) => (
  <>
    {(['download', 'copy'] as const).map((type) => (
      <DropdownMenuSub key={type}>
        <DropdownMenuSubTrigger disabled={disabled}>
          <HugeiconsIcon
            icon={type === 'download' ? Download01Icon : Copy01Icon}
            strokeWidth={2}
          />
          {type === 'download' ? 'Export' : 'Copy'}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {FORMAT_ITEMS.map(({ format, label, icon: Icon }) => (
            <DropdownMenuSub key={format}>
              <DropdownMenuSubTrigger>
                <HugeiconsIcon icon={Icon} strokeWidth={2} />
                {type === 'download' ? 'Export' : 'Copy'} as {label}
              </DropdownMenuSubTrigger>
              <ExportDataDropdownMenuSubContent
                type={type}
                format={format}
                onExport={onExport}
                selected={selected}
              />
            </DropdownMenuSub>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    ))}
  </>
)

export const ExportDataMenu = ({
  filename,
  getData,
  selected,
  disabled,
}: ExportDataProps) => {
  const { mutate } = useExportMutation({ filename, getData })

  return (
    <ExportItems onExport={mutate} selected={selected} disabled={disabled} />
  )
}

export const ExportData = ({
  filename,
  getData,
  trigger,
  tooltip,
  selected,
}: ExportDataProps & {
  trigger: (props: { isExporting: boolean }) => React.ReactElement
  tooltip?: string
}) => {
  const { mutate, isPending } = useExportMutation({ filename, getData })

  return (
    <DropdownMenu>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={trigger({ isExporting: isPending })}
              />
            }
          />
          <TooltipContent side="top">{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger render={trigger({ isExporting: isPending })} />
      )}
      <DropdownMenuContent align="end">
        <ExportItems onExport={mutate} selected={selected} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
