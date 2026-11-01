import { PORTS } from '@tamery/shared/ports'

import { env } from './env'
import { paint } from './paint'

const { accent, bold, brand, dim, flag, link } = paint

export const HELP = `${brand('◆ Tamery')} ${dim(env.VERSION)}
  Run the Tamery web app's queries on this computer.

${bold('Usage')}  tamery ${accent('<command>')} ${flag('[options]')}

${bold('Commands')}
  ${accent('bridge')}              Let the web app run your connections here (signs in first if needed)
  ${accent('bridge unpair-all')}   Disconnect every paired browser
  ${accent('logout')}              Sign out, forgetting saved secrets and paired browsers

${bold('Options')}
  ${flag('--port <port>')}        Port on 127.0.0.1 ${dim(`(default ${PORTS.BRIDGE})`)}
  ${flag('--public-url <url>')}   The HTTPS URL a tunnel on this computer serves the bridge at
  ${flag('-v, --version')}        Print the version
  ${flag('-h, --help')}           Print this help

${dim('Docs')} ${link('https://docs.tamery.app/cli')}`
