import { describe, expect, it } from 'bun:test'

import { sanitizeLogData } from './sanitize-log'

const logged = (data: unknown) => JSON.stringify(sanitizeLogData(data))

describe('sanitizeLogData', () => {
  it('redacts the input a failed validation carries inside its error', () => {
    const cause = Object.assign(new Error('Input validation failed'), {
      invalidData: {
        connectionString: 'postgres://u:hunter2@h/db',
        password: 'pin1',
      },
    })
    const text = logged({ error: { cause } })
    expect(text).toContain('Input validation failed')
    expect(text).not.toContain('hunter2')
    expect(text).not.toContain('pin1')
  })

  it('redacts credentials inside free text', () => {
    const text = logged({
      input: {
        messages: [
          {
            text: 'connect to postgres://admin:s3cr%2Ft@db.example.com:5432/app',
          },
        ],
        sql: "CREATE USER MAPPING FOR me SERVER s OPTIONS (password 'x'); -- Server=h;User Id=sa;Password=Pa55;",
        url: 'libsql://db.turso.io?authToken=eyJtoken&tls=1',
      },
    })
    expect(text).not.toContain('s3cr')
    expect(text).not.toContain('Pa55')
    expect(text).not.toContain('eyJtoken')
    expect(text).toContain('db.example.com')
  })

  it('redacts every secret a string carries, not only the first kind', () => {
    const text = logged({
      error:
        'postgres://u:hun@ter2@db.example.com/app?ssh_password=SSHPW&ssh_key=PRIVKEY&ssh_passphrase=PP&sslpassphrase=SP&sslpfx=PFX&http_header_authorization=Basic%20AUTH&authMechanismProperties=AWS_SESSION_TOKEN:AWSTOK',
    })
    for (const secret of [
      'hun',
      'ter2',
      'SSHPW',
      'PRIVKEY',
      'PP',
      'SP',
      'PFX',
      'AUTH',
      'AWSTOK',
    ]) {
      expect(text).not.toContain(secret)
    }
    expect(text).toContain('db.example.com/app')
  })

  it('keeps an email after a connection string', () => {
    const text = logged({
      error: 'postgres://u:pw@h failed for me@example.com',
    })
    expect(text).not.toContain('pw@')
    expect(text).toContain('me@example.com')
  })
})
