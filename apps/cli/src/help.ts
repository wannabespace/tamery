import type {
  ArgDef,
  ArgsDef,
  CommandDef,
  CommandMeta,
  Resolvable,
  SubCommandsDef,
} from 'citty'

import { env } from './env'
import { paint } from './paint'

const { accent, bold, brand, dim, flag, link } = paint

const DOCS_URL = 'https://docs.tamery.app/cli'
const COLUMN_GAP = 3
const USAGE_LABEL = 'Usage  '

interface Row {
  description: string
  label: string
}

const resolve = <T extends ArgsDef | CommandDef | CommandMeta | SubCommandsDef>(
  value: Resolvable<T>
) => (typeof value === 'function' ? value() : value)

const renderSection = (
  title: string,
  rows: Row[],
  style: (text: string) => string,
  width: number
) =>
  rows.length === 0
    ? []
    : [
        '',
        bold(title),
        ...rows.map(
          ({ description, label }) =>
            `  ${style(label.padEnd(width))}${description}`
        ),
      ]

/** The command a command line names, the way citty picks it: each level's first argument that is not a flag. */
export const findCommand = async (
  command: CommandDef,
  rawArgs: string[]
): Promise<CommandDef> => {
  const index = rawArgs.findIndex((arg) => !arg.startsWith('-'))
  const subCommands = await resolve(command.subCommands ?? {})
  const sub = subCommands[rawArgs[index] ?? '']
  return sub
    ? findCommand(await resolve(sub), rawArgs.slice(index + 1))
    : command
}

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
          : [{ description: subMeta.description ?? '', label }]
      }
    )
  )
  const commands = commandRows.flat()
  const positionals = args.flatMap(
    ([arg, { description = '', required, type }]) =>
      type === 'positional'
        ? [{ description, label: required === false ? `[${arg}]` : `<${arg}>` }]
        : []
  )
  const flags = args.filter(([, { type }]) => type !== 'positional')
  const options: Row[] = [
    ...flags.map(([option, arg]) => {
      const valueHint =
        arg.valueHint ?? (arg.type === 'enum' ? arg.options?.join('|') : null)
      return {
        description: [
          arg.description,
          arg.default !== undefined && dim(`(default ${arg.default})`),
        ]
          .filter(Boolean)
          .join(' '),
        label: `--${option}${valueHint ? ` <${valueHint}>` : ''}`,
      }
    }),
    ...(meta.version
      ? [{ description: 'Print the version', label: '-v, --version' }]
      : []),
    { description: 'Print this help', label: '-h, --help' },
  ]
  const width =
    Math.max(
      ...[...positionals, ...commands, ...options].map(
        ({ label }) => label.length
      )
    ) + COLUMN_GAP
  const usages = [
    ...(args.length > 0 || commands.length === 0
      ? [
          [
            name,
            ...positionals.map(({ label }) => accent(label)),
            ...(flags.length > 0 ? [flag('[options]')] : []),
          ].join(' '),
        ]
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
      ...renderSection('Arguments', positionals, accent, width),
      ...renderSection('Commands', commands, accent, width),
      ...renderSection('Options', options, flag, width),
      '',
      `${dim('Docs')} ${link(DOCS_URL)}`,
    ].join('\n')
  )
}
