import type { DiagnosisRule } from '../diagnosis'
import { SSH_ELSEWHERE, SSH_FIELD_AT_FAULT, SSH_TUNNEL_ERROR } from './params'

const SSH_TUNNEL_TITLE = "Couldn't open the SSH tunnel"

export const SSH_RULES: DiagnosisRule[] = [
  {
    diagnose: ({ message }) => {
      const hint = message.slice(SSH_TUNNEL_ERROR.length)
      const focus = SSH_FIELD_AT_FAULT[hint]
      return { ...(focus && { focus }), hint, title: SSH_TUNNEL_TITLE }
    },
    match: new RegExp(`^${RegExp.escape(SSH_TUNNEL_ERROR)}`, 'u'),
    tunnel: true,
  },
  {
    diagnose: () => ({ hint: SSH_ELSEWHERE, title: SSH_TUNNEL_TITLE }),
    match: new RegExp(`^${RegExp.escape(SSH_ELSEWHERE)}$`, 'u'),
    tunnel: true,
  },
  {
    diagnose: () => ({
      hint: 'Its sshd forbids forwarding to the database (AllowTcpForwarding or PermitOpen). Ask its admin to allow it for your SSH user.',
      title: "The SSH host doesn't allow port forwarding",
    }),
    // OpenSSH describes a forbidden forward only as `open failed`; the reason code is gone by the time the message gets here.
    match:
      /channel open failure: (?:administratively prohibited|open failed)/iu,
    tunnel: true,
  },
]
