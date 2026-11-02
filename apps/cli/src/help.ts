import type { ArgDef, ArgsDef, CommandDef, Resolvable } from 'citty'

import { env } from './env'
import { paint } from './paint'

const { accent, bold, brand, dim, flag, link } = paint

const DOCS_URL = 'https://docs.tamery.app/cli'
const COLUMN_GAP = 3
const USAGE_LABEL = 'Usage  '

interface Row {
  description: string
  label: string
  style: (text: string) => string
}

/** citty lets each part of a command be a value, a promise, or a function returning either. */
const resolve = <T>(value: Resolvable<T>) =>
  typeof value === 'function' ? (value as () => T | Promise<T>)() : value

const getCommandRows = async (subCommands: CommandDef['subCommands']) => {
  const rows = await Promise.all(
    Object.entries(await resolve(subCommands ?? {})).map(
      async ([label, resolvable]) => {
        const subCommand = await resolve(resolvable)
        const meta = await resolve(subCommand.meta ?? {})
        return meta.hidden
          ? []
          : [{ description: meta.description ?? '', label, style: accent }]
      }
    )
  )
  return rows.flat()
}

const renderSection = (title: string, rows: Row[], width: number) =>
  rows.length === 0
    ? []
    : [
        '',
        bold(title),
        ...rows.map(
          ({ description, label, style }) =>
            `  ${style(label.padEnd(width))}${description}`
        ),
      ]

const renderHelp = async <T extends ArgsDef>(command: CommandDef<T>) => {
  const meta = await resolve(command.meta ?? {})
  const args = Object.entries<ArgDef>(await resolve(command.args ?? {}))
  const name = meta.name ?? 'tamery'
  const commands = await getCommandRows(command.subCommands)
  const options: Row[] = [
    ...args.map(([option, arg]) => ({
      description: [
        arg.description,
        arg.default !== undefined && dim(`(default ${arg.default})`),
      ]
        .filter(Boolean)
        .join(' '),
      label: `--${option}${arg.valueHint ? ` <${arg.valueHint}>` : ''}`,
      style: flag,
    })),
    ...(meta.version
      ? [
          {
            description: 'Print the version',
            label: '-v, --version',
            style: flag,
          },
        ]
      : []),
    { description: 'Print this help', label: '-h, --help', style: flag },
  ]
  const width =
    Math.max(...[...commands, ...options].map(({ label }) => label.length)) +
    COLUMN_GAP
  const usages = [
    ...(args.length > 0 || commands.length === 0
      ? [`${name}${args.length > 0 ? ` ${flag('[options]')}` : ''}`]
      : []),
    ...(commands.length > 0 ? [`${name} ${accent('<command>')}`] : []),
  ]

  return [
    `${brand(`◆ ${name}`)} ${dim(env.VERSION)}`,
    `  ${meta.description ?? ''}`,
    '',
    ...usages.map(
      (usage, index) =>
        `${index === 0 ? bold(USAGE_LABEL) : ' '.repeat(USAGE_LABEL.length)}${usage}`
    ),
    ...renderSection('Commands', commands, width),
    ...renderSection('Options', options, width),
    '',
    `${dim('Docs')} ${link(DOCS_URL)}`,
  ].join('\n')
}

export const printHelp = async <T extends ArgsDef>(command: CommandDef<T>) => {
  console.log(await renderHelp(command))
}
