import { afterAll, describe, expect, spyOn, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { databaseFile } from '@tamery/connection/database-file'
import { ConnectionType } from '@tamery/shared/enums/connection-type'

import { confinement } from './confinement'

const folder = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), 'tamery-confinement-'))
)
const home = path.join(folder, 'home')
const linkedHome = path.join(folder, 'linked-home')
const homedir = spyOn(os, 'homedir').mockReturnValue(home)

const create = (file: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '')
  return file
}

for (const file of [
  '.mozilla/firefox/default/cookies.sqlite',
  '..private/cookies.sqlite',
  'Library/Messages/chat.db',
  '.ssh/notes.db',
  '.secret/x.db',
  'Projects/app/dev.db',
]) {
  create(path.join(home, file))
}
fs.mkdirSync(path.join(home, '.secret', 'sub'))
fs.symlinkSync(
  path.join(home, '.secret', 'sub'),
  path.join(home, 'Projects', 'link')
)
fs.symlinkSync(home, linkedHome)
const windowsCookies = create(
  path.join(folder, 'mnt/c/Users/me/AppData/Roaming/Mozilla/cookies.sqlite')
)

afterAll(() => {
  homedir.mockRestore()
  fs.rmSync(folder, { force: true, recursive: true })
})

describe('confinement', () => {
  test.each([
    ['~/.mozilla/firefox/default/cookies.sqlite', false],
    ['~/..private/cookies.sqlite', false],
    ['~/Library/Messages/chat.db', false],
    [
      `${home.toUpperCase()}/LIBRARY/Messages/chat.db`,
      process.platform === 'linux',
    ],
    [path.join(home, 'Projects', '..', '.ssh', 'notes.db'), false],
    [path.join(linkedHome, '.ssh', 'notes.db'), false],
    [windowsCookies, false],
    ['~/Projects', false],
    [path.join(linkedHome, 'Projects', 'app', 'dev.db'), true],
    ['~/Projects/app/dev.db', true],
  ])('a SQLite file at %s opens: %p', (file, opens) => {
    expect(
      confinement.getRefusal(
        databaseFile.connectionString(ConnectionType.SQLite, file)
      ) === null
    ).toBe(opens)
  })

  test.each([
    [`sqlite://${home}/Projects/link%2F..%2Fx.db`, false],
    [`postgresql://db.example.com/app?sslkey=${folder}`, false],
    [
      `postgresql://db.example.com/app?ssh_host=bastion.example.com&ssh_auth=keyPath&ssh_key_path=${folder}`,
      false,
    ],
    ['postgresql://db.example.com/app?sslkey=/missing/client.key', true],
    ['mongodb+srv://c0.abc.mongodb.net/app?authMechanism=MONGODB-AWS', true],
    ['mongodb+srv://c0.abc.mongodb.net/app?authMechanism=aws', true],
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
      'mongodb+srv://c0.abc.mongodb.net/app?authMechanism=MONGODB-AWS&tlsCAFile=/tmp/ca.pem',
      false,
    ],
    [
      'mongodb+srv://c0.abc.mongodb.net.evil.example/app?authMechanism=MONGODB-OIDC',
      false,
    ],
    [
      'mongodb://evil.example.com,c0.abc.mongodb.net/app?authMechanism=MONGODB-AWS&tls=true',
      false,
    ],
    ['mongodb://db.example.com/app?authMechanism=AWS&tls=true', false],
    ['mongodb://db.example.com/app?authMechanism=oidc&tls=true', false],
    ['mongodb://db.example.com/app?authMechanism=A.S&tls=true', false],
    ['mongodb://db.example.com/app?authMechanism=GSSAPI&tls=true', false],
    ['mongodb://db.example.com/app?authMechanism=SCRAM-SHA-256', true],
    ['mongodb://db.example.com/app', true],
  ])('%s opens: %p', (connectionString, opens) => {
    expect(confinement.getRefusal(connectionString) === null).toBe(opens)
  })
})
