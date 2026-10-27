/** The driver reads these from the string itself; turning TLS off drops them with it. */
export const TLS_PARAMS = [
  'ssl',
  'tlsallowinvalidcertificates',
  'tlsallowinvalidhostnames',
  'tlscafile',
  'tlscertificatekeyfile',
  'tlscertificatekeyfilepassword',
  'tlsinsecure',
]
