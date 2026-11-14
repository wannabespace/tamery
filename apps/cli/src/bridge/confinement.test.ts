import { describe, expect, test } from 'bun:test'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { databaseFile } from '@tamery/connection/database-file'
import { ConnectionType } from '@tamery/shared/enums/connection-type'

import { confinement } from './confinement'

describe('confinement', () => {
  test.each([
    ['~/.mozilla/firefox/default/cookies.sqlite', false],
    ['~/Library/Messages/chat.db', false],
    [
      `${os.homedir().toUpperCase()}/LIBRARY/Messages/chat.db`,
      process.platform === 'linux',
    ],
    [path.join(os.homedir(), 'Projects', '..', '.ssh', 'notes.db'), false],
    ['~/Projects/app/dev.db', true],
    ['/srv/data/app.db', true],
  ])('a SQLite file at %s opens: %p', (file, opens) => {
    expect(
      confinement.getRefusal(
        databaseFile.connectionString(ConnectionType.SQLite, file)
      ) === null
    ).toBe(opens)
  })

  test.each([
    ['mongodb+srv://c0.abc.mongodb.net/app?authMechanism=MONGODB-AWS', true],
    [
      'mongodb://c0.abc.mongodb.net/app?authMechanism=MONGODB-AWS&tls=true',
      true,
    ],
    ['mongodb://c0.abc.mongodb.net/app?authMechanism=MONGODB-AWS', false],
    [
      'mongodb+srv://c0.abc.mongodb.net/app?authMechanism=MONGODB-AWS&tls=false',
      false,
    ],
    [
      'mongodb+srv://c0.abc.mongodb.net/app?authMechanism=MONGODB-AWS&tlsInsecure=true',
      false,
    ],
    [
      'mongodb+srv://c0.abc.mongodb.net.evil.example/app?authMechanism=MONGODB-OIDC',
      false,
    ],
    ['mongodb://db.example.com/app?authMechanism=GSSAPI&tls=true', false],
    ['mongodb://db.example.com/app', true],
  ])('%s opens: %p', (connectionString, opens) => {
    expect(confinement.getRefusal(connectionString) === null).toBe(opens)
  })
})
