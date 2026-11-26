import { PROXY_ERROR_MESSAGE } from '@tamery/shared/constants'
import {
  ConnectionType,
  getDialect,
} from '@tamery/shared/enums/connection-type'

import {
  CLICKHOUSE_HTTP_PORT_OF_NATIVE,
  connectionParts,
  DEFAULT_PORTS,
} from './connection-parts'
import type { Diagnosis, DiagnosisContext, DiagnosisRule } from './diagnosis'
import { getHostHint, getHostKind, isLocalHost, TYPE_OF_PORT } from './hosts'

export const PRIVATE_HOST_MESSAGE =
  'The cloud proxy reaches only public hosts. Run `tamery machine` or open this connection in the desktop app.'

const SUPABASE_IPV6_ONLY_HINT =
  "Supabase's direct host is IPv6-only. On an IPv4 network, paste the Session pooler string from Supabase → Connect."

const tunnelFix = ({ desktop, parts }: DiagnosisContext): Diagnosis['fix'] =>
  desktop && !parts.ssh
    ? { label: 'Set up an SSH tunnel', patch: { sshEnabled: true } }
    : undefined

export const NETWORK_RULES: DiagnosisRule[] = [
  {
    diagnose: (context) => {
      const { host, ssh } = context.parts
      if (ssh) {
        return {
          hint: `The SSH host looked up "${host}" and found nothing. Use the name or address the SSH host knows the database by.`,
          title: `The SSH host can't find "${host}"`,
        }
      }
      const kind = getHostKind(host)
      if (kind === 'ipv6-only') {
        return {
          hint: SUPABASE_IPV6_ONLY_HINT,
          title: "This network can't reach Supabase's direct host",
        }
      }
      if (kind === 'service') {
        return {
          fix: { label: 'Use localhost', patch: { host: 'localhost' } },
          hint: `"${host}" looks like a Docker Compose service, which only resolves inside Docker. From this machine, connect to the port Docker publishes on localhost.`,
          title: `"${host}" isn't reachable from here`,
        }
      }
      if (kind === 'private') {
        return {
          fix: tunnelFix(context),
          hint: 'It only resolves inside a private network: connect through a bastion host, or over your VPN.',
          title: `"${host}" is a private name`,
        }
      }
      return {
        hint: `No DNS record for "${host}". Check the spelling and your internet connection.`,
        title: 'Host not found',
      }
    },
    match:
      /enotfound|eai_again|getaddrinfo|could not translate host name|name or service not known|name does not resolve|nodename nor servname/iu,
    offline: 'host',
  },
  {
    diagnose: ({ parts }) => {
      const port = connectionParts.port(parts)
      const clickHousePort = CLICKHOUSE_HTTP_PORT_OF_NATIVE[port]
      if (parts.type === ConnectionType.ClickHouse && clickHousePort) {
        return {
          fix: {
            label: `Use port ${clickHousePort}`,
            patch: { port: clickHousePort },
          },
          hint: `${port} is ClickHouse's native protocol; Tamery talks to its HTTP interface.`,
          title: "That's ClickHouse's native port",
        }
      }
      const portType = TYPE_OF_PORT[port]
      if (
        portType &&
        parts.type &&
        getDialect(portType) !== getDialect(parts.type) &&
        port === String(DEFAULT_PORTS[portType])
      ) {
        return {
          fix: { label: 'Switch the engine', patch: { type: portType } },
          hint: `${port} is the usual port for another engine. Check the engine and the port.`,
          title: 'Wrong engine for this port?',
        }
      }
      return isLocalHost(parts.host)
        ? {
            hint: `Nothing answers on port ${port}. Start the database, or with Docker, use the port it publishes (the left side of "${port}:${port}").`,
            title: "The database isn't running here",
          }
        : {
            hint: `Port ${port} refused the connection: check the port, and that the server listens on outside addresses (listen_addresses, bind-address).`,
            title: 'Connection refused',
          }
    },
    match:
      /econnrefused|connection refused|actively refused|could not connect \(sequence\)|expected http|parse error/iu,
  },
  {
    diagnose: (context) => {
      const { host } = context.parts
      const provider = getHostHint(host)?.label
      if (getHostKind(host) === 'private') {
        return {
          fix: tunnelFix(context),
          hint: 'That address is on a private network: connect through a bastion host, or over your VPN.',
          title: "The server didn't answer",
        }
      }
      return {
        hint: provider
          ? `Allow your IP address in ${provider}'s network settings (firewall, security group or allowlist).`
          : "A firewall is probably dropping the connection, or the server's allowlist doesn't include your IP address.",
        title: "The server didn't answer",
      }
    },
    match: /etimedout|timed? ?out|esockettimedout|err_timed_out/iu,
    offline: 'host',
  },
  {
    diagnose: (context) => ({
      fix: tunnelFix(context),
      hint:
        getHostKind(context.parts.host) === 'ipv6-only'
          ? SUPABASE_IPV6_ONLY_HINT
          : 'No network route to that address: it may be IPv6-only, or need your VPN.',
      title: "This network can't reach the server",
    }),
    match: /enetunreach|ehostunreach|no route to host/iu,
    offline: 'host',
  },
  {
    diagnose: ({ desktop }) => ({
      hint: desktop
        ? 'Its proxy did not answer. Try again, or set Runs on to This computer to query it from here.'
        : 'The web app reaches databases through it. Check your internet connection, then try again.',
      title: "Couldn't reach Tamery's cloud proxy",
    }),
    match: new RegExp(RegExp.escape(PROXY_ERROR_MESSAGE), 'u'),
    offline: 'device',
    tunnel: true,
  },
  {
    diagnose: () => ({
      hint: 'The web app reaches databases through a cloud proxy, which only connects to public hosts. Run this connection on a machine (Edit → Runs on), or open it in the desktop app.',
      title: "The web app can't reach a private host",
    }),
    match: /cloud proxy reaches only public hosts/u,
    tunnel: true,
  },
]
