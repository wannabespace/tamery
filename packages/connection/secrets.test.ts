import { describe, expect, it } from 'bun:test'

import { connectionSecrets } from './secrets'

const LOCAL =
  'postgres://app:db-pass@db.internal:5432/app?sslkey=%2Fkeys%2Fclient.key&sslpassword=key-pass&sslpfx=bundle&ssh_host=bastion&ssh_auth=password&ssh_password=ssh-pass'

describe('connectionSecrets', () => {
  it('keeps every secret off the synced string but marks which ones it had', () => {
    const synced = new URL(connectionSecrets.strip(LOCAL))

    expect(synced.password).toBe('')
    expect(synced.searchParams.get('ssh_password')).toBe('')
    expect(synced.searchParams.get('sslpassword')).toBe('')
    expect(synced.searchParams.get('sslkey')).toBe('/keys/client.key')
    expect(connectionSecrets.missing(synced.searchParams)).toEqual([
      'ssh_password',
      'sslpassword',
      'sslpfx',
    ])
  })

  it('keeps a ClickHouse access token and Authorization header off the synced string', () => {
    const synced = new URL(
      connectionSecrets.strip(
        'https://default@ch.example.com:8443/?access_token=jwt-secret&http_header_authorization=Basic%20abc'
      )
    )

    expect(synced.searchParams.get('access_token')).toBe('')
    expect(synced.searchParams.get('http_header_authorization')).toBe('')
    expect(connectionSecrets.missing(synced.searchParams)).toEqual([
      'access_token',
      'http_header_authorization',
    ])
  })

  it('keeps a MongoDB AWS session token and the fragment off the synced string', () => {
    const stripped = connectionSecrets.strip(
      'mongodb://AKIA:aws-secret@db.example.com/app?authMechanism=MONGODB-AWS&authMechanismProperties=AWS_SESSION_TOKEN:aws-token#ssh_password=x'
    )

    expect(stripped).not.toContain('aws-token')
    expect(stripped).not.toContain('#')
    expect(connectionSecrets.missing(new URL(stripped).searchParams)).toEqual([
      'authmechanismproperties',
    ])
  })

  it('copies a string that still connects but carries no tunnel secret', () => {
    const copied = new URL(connectionSecrets.copyable(LOCAL))

    expect(copied.password).toBe('db-pass')
    expect(copied.searchParams.get('sslpassword')).toBe('key-pass')
    expect(copied.searchParams.get('ssh_host')).toBe('bastion')
    expect(copied.searchParams.has('ssh_password')).toBe(false)
  })

  it('strips a secret pasted in any case', () => {
    const synced = new URL(
      connectionSecrets.strip(
        'postgres://app@db.internal/app?sslPassword=key-pass&SSH_PASSWORD=ssh-pass'
      )
    )

    expect(connectionSecrets.missing(synced.searchParams)).toEqual([
      'ssh_password',
      'sslpassword',
    ])
  })

  it('restores the stripped secrets from the local copy', () => {
    expect(
      connectionSecrets.restore(connectionSecrets.strip(LOCAL), {
        isPasswordExists: true,
        local: LOCAL,
      })
    ).toBe(LOCAL)
  })

  it('never restores a password another device removed', () => {
    const restored = new URL(
      connectionSecrets.restore(connectionSecrets.strip(LOCAL), {
        isPasswordExists: false,
        local: LOCAL,
      })
    )

    expect(restored.password).toBe('')
  })

  it.each([
    ['another scheme', 'postgres:', 'mysql:'],
    ['another host', '@db.internal', '@x.example'],
    ['another port', ':5432', ':6543'],
    ['another user', 'app@', 'admin@'],
    ['another SSH hop', 'ssh_host=bastion', 'ssh_host=x.example'],
    ['a MongoDB proxy', 'ssh_auth=', 'proxyHost=x.example&ssh_auth='],
    ['TLS turned off', 'ssh_auth=', 'sslmode=disable&ssh_auth='],
  ])('never restores a secret onto %s', (_, from, to) => {
    const restored = connectionSecrets.restore(
      connectionSecrets.strip(LOCAL).replace(from, to),
      { isPasswordExists: true, local: LOCAL }
    )

    expect(restored).not.toContain('db-pass')
    expect(restored).not.toContain('ssh-pass')
  })

  it('restores the secrets onto another database of the same server', () => {
    const restored = connectionSecrets.restore(
      connectionSecrets.strip(LOCAL).replace(':5432/app', ':5432/other'),
      { isPasswordExists: true, local: LOCAL }
    )

    expect(restored).toBe(LOCAL.replace(':5432/app', ':5432/other'))
  })

  it('never restores a secret the synced string dropped', () => {
    const switchedToAgent =
      'postgres://app@db.internal:5432/app?ssh_host=bastion&ssh_auth=agent'
    const restored = new URL(
      connectionSecrets.restore(switchedToAgent, {
        isPasswordExists: true,
        local: LOCAL,
      })
    )

    expect(restored.searchParams.has('ssh_password')).toBe(false)
  })
})
