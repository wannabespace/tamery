import { styleText } from 'node:util'

type Style = Parameters<typeof styleText>[0]

const style = (format: Style) => (text: string) => styleText(format, text)

/** `styleText` drops the colours itself when the output is not a terminal or `NO_COLOR` is set. */
export const paint = {
  accent: style('cyan'),
  bold: style('bold'),
  brand: style(['bold', 'cyan']),
  dim: style('dim'),
  flag: style('yellow'),
  link: style(['cyan', 'underline']),
}
