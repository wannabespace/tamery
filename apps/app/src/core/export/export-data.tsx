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
}

export const useExportMutation = ({
  filename,
  getData,
}: {
  filename: string
  getData: ExportDataProps['getData']
}) =>
  useMutation({
    meta: { event: 'data_exported' },
    mutationFn: async ({ type, format, limit }: ExportProps) => {
      const data = await getData({ limit })
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

const EXPORT_TYPES = [
  { icon: Download01Icon, label: 'Download', type: 'download' },
  { icon: Copy01Icon, label: 'Copy', type: 'copy' },
] satisfies {
  icon: IconSvgElement
  label: string
  type: ContentGeneratorType
}[]

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
  }: {
    limit?: (typeof EXPORT_LIMITS)[number]
  }) => Promise<Record<string, unknown>[]>
  disabled?: boolean
  canExportAll?: boolean
}

export const ExportFormatItems = ({
  onExport,
}: {
  onExport: (props: Omit<ExportProps, 'limit'>) => void
}) =>
  FORMAT_ITEMS.map(({ format, label, icon }) => (
    <DropdownMenuSub key={format}>
      <DropdownMenuSubTrigger>
        <HugeiconsIcon icon={icon} strokeWidth={2} />
        {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {EXPORT_TYPES.map((item) => (
          <DropdownMenuItem
            key={item.type}
            onClick={() => onExport({ format, type: item.type })}
          >
            <HugeiconsIcon icon={item.icon} strokeWidth={2} />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  ))

const ExportRowsSub = ({
  limit,
  onExport,
}: {
  limit?: ExportProps['limit']
  onExport: (props: ExportProps) => void
}) => (
  <DropdownMenuSub>
    <DropdownMenuSubTrigger>
      {limit ? `First ${limit} rows` : 'All rows'}
    </DropdownMenuSubTrigger>
    <DropdownMenuSubContent>
      <ExportFormatItems onExport={(props) => onExport({ ...props, limit })} />
    </DropdownMenuSubContent>
  </DropdownMenuSub>
)

const ExportItems = ({
  canExportAll = true,
  onExport,
}: {
  canExportAll?: boolean
  onExport: (props: ExportProps) => void
}) => (
  <>
    {EXPORT_LIMITS.map((limit) => (
      <ExportRowsSub key={limit} limit={limit} onExport={onExport} />
    ))}
    {canExportAll && (
      <>
        <DropdownMenuSeparator />
        <ExportRowsSub onExport={onExport} />
      </>
    )}
  </>
)

export const ExportDataMenu = ({
  canExportAll,
  filename,
  getData,
  disabled,
}: ExportDataProps) => {
  const { mutate } = useExportMutation({ filename, getData })

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={disabled}>
        <HugeiconsIcon icon={Download01Icon} strokeWidth={2} />
        Export
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <ExportItems canExportAll={canExportAll} onExport={mutate} />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

export const ExportData = ({
  filename,
  getData,
  trigger,
  tooltip,
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
        <ExportItems onExport={mutate} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
