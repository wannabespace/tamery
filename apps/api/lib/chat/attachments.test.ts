import {
  afterAll,
  afterEach,
  beforeEach,
  expect,
  mock,
  setSystemTime,
  test,
} from 'bun:test'

import type { AppUIMessage } from '@tamery/ai/message'
import {
  attachmentRef,
  chatAttachmentsPrefix,
  parseAttachmentRef,
} from '@tamery/shared/attachments'
import { UNTRUSTED_FILE_NOTE } from '@tamery/shared/mcp'

const BROKEN_ID = '019a0000-0000-7000-8000-0000000000bb'
const CHAT_ID = '019a0000-0000-7000-8000-000000000000'
const CHAT = { createdAt: new Date(1_700_000_000_000), id: CHAT_ID }
const keyOf = (ref: { chatId: string; id: string }) =>
  `${chatAttachmentsPrefix(CHAT)}${ref.id}`

const objects = new Map<
  string,
  { body: Uint8Array<ArrayBuffer>; type: string }
>()
const s3 = Bun.serve({
  async fetch(request) {
    const key = decodeURIComponent(new URL(request.url).pathname).replace(
      /^\/bucket\//u,
      ''
    )
    if (request.method === 'PUT') {
      objects.set(key, {
        body: new Uint8Array(await request.arrayBuffer()),
        type: request.headers.get('content-type') ?? '',
      })
      return new Response(null, { headers: { etag: '"etag"' } })
    }
    if (key.includes(BROKEN_ID)) {
      return new Response(null, { status: 503 })
    }
    const object = objects.get(key)
    if (!object) {
      return new Response(null, { status: 404 })
    }
    return new Response(request.method === 'HEAD' ? null : object.body, {
      headers: {
        'content-length': String(object.body.length),
        'content-type': object.type,
        etag: '"etag"',
        'last-modified': new Date(0).toUTCString(),
      },
    })
  },
  port: 0,
})
afterAll(() => s3.stop(true))
const inChat = new Set<string>()
mock.module('@tamery/db', () => ({
  db: {
    query: {
      chats: { findFirst: () => Promise.resolve(CHAT) },
      chatsMessages: {
        findMany: () =>
          Promise.resolve([
            {
              id: 'message',
              parts: [...inChat].map((url) => ({
                part: { type: 'file', url },
              })),
            },
          ]),
      },
    },
  },
}))
const mockEnv = (nodeEnv: 'production' | 'test') =>
  mock.module('~/env', () => ({
    env: {
      API_URL: 'https://api.test',
      ENCRYPTION_SECRET: 'test-encryption-secret-of-32-chars',
      S3_ACCESS_KEY_ID: 'key',
      S3_BUCKET: 'bucket',
      S3_ENDPOINT: s3.url.origin,
      S3_SECRET_ACCESS_KEY: 'secret',
    },
    nodeEnv,
  }))
mockEnv('test')
const { FRESH_ATTACHMENTS, attachmentLink, attachments } =
  await import('./attachments')
const { attachmentsRouter } = await import('../../routers/attachments')

const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
const MB = 1024 * 1024

const png = (width: number, height: number) =>
  new Bun.Image(Buffer.from(ONE_PIXEL_PNG, 'base64'))
    .resize(width, height)
    .png()
    .bytes()

/** A one-page PDF whose only content is `text`, with a valid cross-reference table. */
const pdf = (text: string) => {
  const stream = `BT /F1 6 Tf 10 700 Td (${text}) Tj ET`
  const bodies = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets = bodies.map((body, index) => {
    const offset = out.length
    out += `${index + 1} 0 obj\n${body}\nendobj\n`
    return offset
  })
  const xref = out.length
  out += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new TextEncoder().encode(out)
}

const dataUrl = (mediaType: string, bytes: Uint8Array) =>
  `data:${mediaType};base64,${Buffer.from(bytes).toString('base64')}`

let turns = 0
const userTurn = (
  files: { filename: string; mediaType: string; url: string }[],
  text = 'look'
): AppUIMessage => ({
  id: `turn-${(turns += 1)}`,
  parts: [
    { text, type: 'text' },
    ...files.map((file) => ({ ...file, type: 'file' as const })),
  ],
  role: 'user',
})

const putFile = (id: string, size: number, type = 'image/png') => {
  const ref = { chatId: CHAT_ID, id }
  objects.set(keyOf(ref), { body: new Uint8Array(size), type })
  return { filename: `${id}.png`, mediaType: type, url: attachmentRef(ref) }
}

const storeOne = async (mediaType: string, bytes: Uint8Array) => {
  const { copy, message } = await attachments.store(
    CHAT_ID,
    userTurn([{ filename: 'file', mediaType, url: dataUrl(mediaType, bytes) }])
  )
  await copy()
  const [, part] = message.parts
  const ref = part?.type === 'file' ? parseAttachmentRef(part.url) : null
  if (!ref || part?.type !== 'file') {
    throw new Error('no stored file')
  }
  inChat.add(part.url)
  return { id: ref.id, url: part.url }
}

const filePart = (message: AppUIMessage | undefined) => message?.parts[1]
const isCopied = () => [...objects.keys()].some((key) => key.endsWith('.model'))
const notSent = (filename: string, mediaType = 'image/png') => ({
  text: `[File "${filename}", ${mediaType}, not sent with this request: ask the user to attach it again if you need it]`,
  type: 'text' as const,
})

beforeEach(() => {
  objects.clear()
  inChat.clear()
})
afterEach(() => {
  mockEnv('test')
  setSystemTime()
})

test('a large image is stored as sent beside a copy scaled to a 1568px long edge', async () => {
  const original = await png(3000, 2000)
  const { id } = await storeOne('image/png', original)
  const key = keyOf({ chatId: CHAT_ID, id })

  expect(objects.get(key)?.body).toEqual(new Uint8Array(original))
  const copy = objects.get(`${key}.model`)
  expect(copy?.type).toBe('image/png')
  expect(
    await new Bun.Image(copy?.body ?? new Uint8Array()).metadata()
  ).toEqual({ format: 'png', height: 1045, width: 1568 })
})

test('the copy is made only once copy runs, so the turn attaching a file sends it as stored', async () => {
  const { copy, message } = await attachments.store(
    CHAT_ID,
    userTurn([
      {
        filename: 'big.png',
        mediaType: 'image/png',
        url: dataUrl('image/png', await png(3000, 2000)),
      },
    ])
  )
  expect(isCopied()).toBe(false)
  await copy()
  expect(isCopied()).toBe(true)
  expect(message.parts[1]).toMatchObject({ type: 'file' })
})

test('a small image, or bytes that are no image, get no copy and still store', async () => {
  await storeOne('image/png', await png(800, 600))
  await storeOne('image/png', new Uint8Array([1, 2, 3]))

  expect([...objects.keys()].filter((key) => key.endsWith('.model'))).toEqual(
    []
  )
  expect(objects.size).toBe(2)
})

test('a PDF with text keeps it beside the file, and the model reads that text framed as data', async () => {
  const text = 'Quarterly revenue by region '.repeat(4)
  const { url } = await storeOne('application/pdf', pdf(text))

  const [message] = await attachments.forModel([
    userTurn([{ filename: 'report.pdf', mediaType: 'application/pdf', url }]),
  ])

  expect(filePart(message)).toEqual({
    text: `[File "report.pdf", the text of a PDF]\n${UNTRUSTED_FILE_NOTE}\n=======FILE=======\n${text.trim()}\n=======END OF FILE=======`,
    type: 'text',
  })
})

test('a PDF with too little text for its pages reaches the model as the file', async () => {
  const { url } = await storeOne('application/pdf', pdf('Scan'))

  const [message] = await attachments.forModel([
    userTurn([{ filename: 'scan.pdf', mediaType: 'application/pdf', url }]),
  ])

  expect(filePart(message)).toMatchObject({
    type: 'file',
    url: expect.stringMatching(/^data:application\/pdf;base64,/u),
  })
})

test('only the last turns send their files; older ones become a line naming the file', async () => {
  const messages = Array.from(
    { length: FRESH_ATTACHMENTS.turns + 1 },
    (_, index) =>
      userTurn([putFile(`019a0000-0000-7000-8000-00000000000${index}`, 2000)])
  )

  const [oldest, ...recent] = await attachments.forModel(messages)

  expect(filePart(oldest)).toEqual(
    notSent('019a0000-0000-7000-8000-000000000000.png')
  )
  for (const message of recent) {
    expect(filePart(message)).toMatchObject({
      type: 'file',
      url: expect.stringMatching(/^data:image\/png;base64,/u),
    })
  }
})

test('a file attached again lately is not sent again where it first appeared', async () => {
  const file = putFile('019a0000-0000-7000-8000-00000000000d', 2000)
  const messages = [
    userTurn([file]),
    ...Array.from({ length: FRESH_ATTACHMENTS.turns - 1 }, () => userTurn([])),
    userTurn([file]),
  ]

  const sent = await attachments.forModel(messages)

  expect(filePart(sent[0])).toEqual(notSent(file.filename))
  expect(filePart(sent.at(-1))?.type).toBe('file')
})

test('a SQL run or a Continue does not push a file out of the window', async () => {
  const file = putFile('019a0000-0000-7000-8000-00000000000e', 2000)
  const continued = userTurn([], 'Continue')
  const sqlRun: AppUIMessage = {
    id: 'sql-run',
    parts: [
      {
        data: {
          connectionId: 'connection',
          error: null,
          output: [],
          resource: null,
          statement: 'select 1',
          toolCallId: null,
        },
        type: 'data-sql',
      },
    ],
    role: 'user',
  }

  const [message] = await attachments.forModel([
    userTurn([file]),
    ...Array.from({ length: FRESH_ATTACHMENTS.turns }, () => continued),
    sqlRun,
  ])

  expect(filePart(message)?.type).toBe('file')
})

test('every file of the latest message is sent, even past the byte budget', async () => {
  const files = ['1', '2', '3', '4'].map((digit) =>
    putFile(`019a0000-0000-7000-8000-00000000001${digit}`, 4 * MB)
  )

  const [message] = await attachments.forModel([userTurn(files)])

  expect(message?.parts.slice(1).map((part) => part.type)).toEqual([
    'file',
    'file',
    'file',
    'file',
  ])
})

test('older files are sent only while they fit the byte budget with the newer ones', async () => {
  const size = FRESH_ATTACHMENTS.bytes / 2 - 1
  const older = putFile('019a0000-0000-7000-8000-00000000000a', size)
  const messages = [
    userTurn([older]),
    userTurn([
      putFile('019a0000-0000-7000-8000-00000000000b', size),
      putFile('019a0000-0000-7000-8000-00000000000c', size),
    ]),
  ]

  const [first, latest] = await attachments.forModel(messages)

  expect(filePart(first)).toEqual(notSent(older.filename))
  expect(latest?.parts.slice(1).map((part) => part.type)).toEqual([
    'file',
    'file',
  ])
})

test('a file no longer in the bucket becomes a line naming it', async () => {
  const url = attachmentRef({
    chatId: CHAT_ID,
    id: '019a0000-0000-7000-8000-0000000000ff',
  })

  const [message] = await attachments.forModel([
    userTurn([{ filename: 'gone.png', mediaType: 'image/png', url }]),
  ])

  expect(filePart(message)).toEqual(notSent('gone.png'))
})

test('a bucket failure fails the request instead of passing for a deleted file', async () => {
  const url = attachmentRef({ chatId: CHAT_ID, id: BROKEN_ID })

  await expect(
    attachments.forModel([
      userTurn([{ filename: 'file.png', mediaType: 'image/png', url }]),
    ])
  ).rejects.toThrow()
})

const fetchLink = (link: string) =>
  attachmentsRouter.request(link.replace('https://api.test/attachments', ''))
const statusOf = async (link: string) => {
  const response = await fetchLink(link)
  return response.status
}

test('in production a fresh file goes as a link that serves the model copy without letting anything cache it', async () => {
  mockEnv('production')
  const { id, url } = await storeOne('image/png', await png(3000, 2000))
  const key = keyOf({ chatId: CHAT_ID, id })

  const [message] = await attachments.forModel([
    userTurn([{ filename: 'big.png', mediaType: 'image/png', url }]),
  ])
  expect(filePart(message)).toMatchObject({
    url: attachmentLink({ chatId: CHAT_ID, id }, 'image/png'),
  })

  const response = await fetchLink(
    attachmentLink({ chatId: CHAT_ID, id }, 'image/png')
  )
  expect(response.status).toBe(200)
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(
    objects.get(`${key}.model`)?.body ?? new Uint8Array()
  )
  expect(response.headers.get('content-type')).toBe('image/png')
  expect(response.headers.get('cache-control')).toBe('no-store')
})

test('a link stays the same through its week and answers 404 once it expires', async () => {
  const { id } = await storeOne('image/png', await png(10, 10))
  const ref = { chatId: CHAT_ID, id }
  const week = 7 * 24 * 60 * 60 * 1000
  const start = Math.floor(Date.now() / week) * week
  setSystemTime(start + 1000)
  const link = attachmentLink(ref, 'image/png')

  setSystemTime(start + week - 1000)
  expect(attachmentLink(ref, 'image/png')).toBe(link)
  setSystemTime(start + 3 * week - 1000)
  expect(await statusOf(link)).toBe(200)
  setSystemTime(start + 3 * week + 1000)
  expect(await statusOf(link)).toBe(404)
})

test('a link signed for another file, with its expiry changed, or not signed, answers 404', async () => {
  const { id } = await storeOne('image/png', await png(10, 10))
  const link = attachmentLink({ chatId: CHAT_ID, id }, 'image/png')
  const other = attachmentLink(
    { chatId: CHAT_ID, id: '019a0000-0000-7000-8000-0000000000ee' },
    'image/png'
  )
  const forged = link.replace(/sig=.*/u, other.slice(other.indexOf('sig=')))
  const extended = new URL(link)
  extended.searchParams.set(
    'expires',
    String(Number(extended.searchParams.get('expires')) + 7 * 24 * 60 * 60)
  )

  expect(await statusOf(forged)).toBe(404)
  expect(await statusOf(extended.href)).toBe(404)
  expect(await statusOf(`/${CHAT_ID}/${id}.png`)).toBe(404)
})

test('a link answers 404 once its file leaves the chat or the bucket', async () => {
  const { id, url } = await storeOne('image/png', await png(3000, 2000))
  const link = attachmentLink({ chatId: CHAT_ID, id }, 'image/png')
  expect(await statusOf(link)).toBe(200)

  inChat.delete(url)
  expect(await statusOf(link)).toBe(404)

  inChat.add(url)
  objects.delete(keyOf({ chatId: CHAT_ID, id }))
  expect(await statusOf(link)).toBe(404)
})
