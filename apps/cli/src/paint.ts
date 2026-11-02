import { styleText } from 'node:util'

const style = (format: Parameters<typeof styleText>[0]) => (text: string) =>
  styleText(format, text)

export const paint = {
  accent: style('cyan'),
  bold: style('bold'),
  brand: style(['bold', 'cyan']),
  dim: style('dim'),
  flag: style('yellow'),
  link: style(['cyan', 'underline']),
}
