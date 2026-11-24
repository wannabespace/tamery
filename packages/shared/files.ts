import { csvFormatRows } from 'd3-dsv'

import { valueToText } from './value-text'

export const downloadFile = (
  content: string,
  fileName: string,
  mimeType: string
) => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)

  try {
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.style.display = 'none'

    document.body.append(link)
    link.click()
    link.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const toCSV = (
  columns: {
    key: string
    header?: string
  }[],
  data: Record<string, unknown>[]
): string =>
  csvFormatRows([
    columns.map((c) => c.header ?? c.key),
    ...data.map((row) => columns.map((c) => valueToText(row[c.key]))),
  ])

const escapeMarkdownTableCell = (raw: string): string =>
  raw
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replaceAll('\r\n', ' ')
    .replaceAll('\n', ' ')
    .replaceAll('\r', ' ')
    .trim()

export const recordToMarkdownTable = (
  row: Record<string, unknown>,
  columns: {
    key: string
    header?: string
  }[]
): string => {
  const headers = columns.map((c) =>
    escapeMarkdownTableCell(String(c.header ?? c.key))
  )
  const values = columns.map((c) =>
    escapeMarkdownTableCell(valueToText(row[c.key]))
  )
  const rule = columns.map(() => '---').join(' | ')
  return [
    `| ${headers.join(' | ')} |`,
    `| ${rule} |`,
    `| ${values.join(' | ')} |`,
  ].join('\n')
}

export const recordsToMarkdownTable = (
  columns: {
    key: string
    header?: string
  }[],
  data: Record<string, unknown>[]
): string => {
  const headers = columns.map((c) =>
    escapeMarkdownTableCell(String(c.header ?? c.key))
  )
  const rule = columns.map(() => '---').join(' | ')
  const rows = data.map(
    (row) =>
      `| ${columns.map((c) => escapeMarkdownTableCell(valueToText(row[c.key]))).join(' | ')} |`
  )
  return [`| ${headers.join(' | ')} |`, `| ${rule} |`, ...rows].join('\n')
}

const sizeFormats = {
  gigabyte: new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    style: 'unit',
    unit: 'gigabyte',
  }),
  kilobyte: new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
    style: 'unit',
    unit: 'kilobyte',
  }),
  megabyte: new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    style: 'unit',
    unit: 'megabyte',
  }),
}

export const fileSize = (bytes: number) => {
  if (bytes < 1_000_000) {
    return sizeFormats.kilobyte.format(Math.max(1, bytes / 1000))
  }
  return bytes < 1_000_000_000
    ? sizeFormats.megabyte.format(bytes / 1_000_000)
    : sizeFormats.gigabyte.format(bytes / 1_000_000_000)
}
