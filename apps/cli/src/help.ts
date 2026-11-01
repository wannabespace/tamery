import { PORTS } from '@tamery/shared/ports'

import { env } from './env'
import { paint } from './paint'

const { accent, bold, brand, dim, flag, link } = paint

export const HELP = `${brand('◆ Tamery')} ${dim(env.VERSION)}
  Tamery from your terminal.

${bold('Usage')}  tamery ${accent('<command>')} ${flag('[options]')}

${bold('Commands')}
  ${accent('login')}               Sign this computer in to your Tamery account
  ${accent('logout')}              Sign out, forgetting saved secrets and paired browsers
  ${accent('whoami')}              Show which account this computer is signed in to
  ${accent('bridge')}              Let the web app run your connections on this computer
  ${accent('bridge approve')}      Allow a browser waiting to connect, when the bridge has no terminal
  ${accent('bridge unpair-all')}   Disconnect every browser

${bold('Options')}
  ${flag('--port <port>')}        Port on 127.0.0.1 ${dim(`(default ${PORTS.BRIDGE})`)}
  ${flag('--public-url <url>')}   The HTTPS URL a tunnel on this computer serves the bridge at
  ${flag('-v, --version')}        Print the version
  ${flag('-h, --help')}           Print this help

${dim('Docs')} ${link('https://docs.tamery.app/cli')}`
