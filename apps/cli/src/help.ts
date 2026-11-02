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

export const printHelp = async <T extends ArgsDef>(command: CommandDef<T>) => {
  const meta = await resolve(command.meta ?? {})
  const args = Object.entries<ArgDef>(await resolve(command.args ?? {}))
  const name = meta.name ?? 'tamery'
  const commandRows = await Promise.all(
    Object.entries(await resolve(command.subCommands ?? {})).map(
      async ([label, resolvable]) => {
        const subCommand = await resolve(resolvable)
        const subMeta = await resolve(subCommand.meta ?? {})
        return subMeta.hidden
          ? []
          : [{ description: subMeta.description ?? '', label, style: accent }]
      }
    )
  )
  const commands = commandRows.flat()
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

  console.log(
    [
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
  )
}
