import { afterAll, beforeEach, expect, mock, test } from 'bun:test'

import type { AppUIMessage } from '@tamery/ai/message'
import {
  attachmentKey,
  attachmentRef,
  parseAttachmentRef,
} from '@tamery/shared/attachments'

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

let chatExists = true
mock.module('@tamery/db', () => ({
  db: {
    query: {
      chats: {
        findFirst: () => Promise.resolve(chatExists ? { id: 'chat' } : null),
      },
    },
  },
}))
mock.module('~/env', () => ({
  env: {
    API_URL: 'https://api.test',
    ENCRYPTION_SECRET: 'test-encryption-secret-of-32-chars',
    S3_ACCESS_KEY_ID: 'key',
    S3_BUCKET: 'bucket',
    S3_ENDPOINT: s3.url.origin,
    S3_SECRET_ACCESS_KEY: 'secret',
  },
  nodeEnv: 'test',
}))
const { FRESH_ATTACHMENTS, attachmentLink, attachments } =
  await import('./attachments')
const { attachmentsRouter } = await import('../routers/attachments')

const CHAT_ID = '019a0000-0000-7000-8000-000000000000'
const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='

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
  files: { filename: string; mediaType: string; url: string }[]
): AppUIMessage => ({
  id: `turn-${(turns += 1)}`,
  parts: [
    { text: 'look', type: 'text' },
    ...files.map((file) => ({ ...file, type: 'file' as const })),
  ],
  role: 'user',
})

const putFile = (id: string, size: number, type = 'image/png') => {
  const ref = { chatId: CHAT_ID, id }
  objects.set(attachmentKey(ref), { body: new Uint8Array(size), type })
  return { filename: `${id}.png`, mediaType: type, url: attachmentRef(ref) }
}

const storeOne = async (mediaType: string, bytes: Uint8Array) => {
  const stored = await attachments.store(
    CHAT_ID,
    userTurn([{ filename: 'file', mediaType, url: dataUrl(mediaType, bytes) }])
  )
  const [, part] = stored.parts
  const ref = part?.type === 'file' ? parseAttachmentRef(part.url) : null
  if (!ref || part?.type !== 'file') {
    throw new Error('no stored file')
  }
  return { id: ref.id, url: part.url }
}

const filePart = (message: AppUIMessage | undefined) => message?.parts[1]

beforeEach(() => {
  objects.clear()
  chatExists = true
})

test('a large image is stored as sent beside a copy scaled to a 1568px long edge', async () => {
  const original = await png(3000, 2000)
  const { id } = await storeOne('image/png', original)
  const key = attachmentKey({ chatId: CHAT_ID, id })

  expect(objects.get(key)?.body).toEqual(new Uint8Array(original))
  const copy = objects.get(`${key}.model`)
  expect(copy?.type).toBe('image/png')
  expect(
    await new Bun.Image(copy?.body ?? new Uint8Array()).metadata()
  ).toEqual({ format: 'png', height: 1045, width: 1568 })
})

test('a small image, or bytes that are no image, get no copy and still store', async () => {
  await storeOne('image/png', await png(800, 600))
  await storeOne('image/png', new Uint8Array([1, 2, 3]))

  expect([...objects.keys()].filter((key) => key.endsWith('.model'))).toEqual(
    []
  )
  expect(objects.size).toBe(2)
})

test('a PDF with text keeps it beside the file, and the model reads that text', async () => {
  const text = 'Quarterly revenue by region '.repeat(4)
  const { url } = await storeOne('application/pdf', pdf(text))

  const [message] = await attachments.forModel([
    userTurn([{ filename: 'report.pdf', mediaType: 'application/pdf', url }]),
  ])

  expect(filePart(message)).toEqual({
    text: `[File "report.pdf", the text of a PDF]\n${text.trim()}`,
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

test('only the last turns send their files; older ones become a stub naming the file', async () => {
  const messages = Array.from(
    { length: FRESH_ATTACHMENTS.turns + 1 },
    (_, index) =>
      userTurn([putFile(`019a0000-0000-7000-8000-00000000000${index}`, 2000)])
  )

  const [oldest, ...recent] = await attachments.forModel(messages)

  expect(filePart(oldest)).toEqual({
    text: '[File "019a0000-0000-7000-8000-000000000000.png", image/png, 2 kB, shown earlier in this chat]',
    type: 'text',
  })
  for (const message of recent) {
    expect(filePart(message)).toMatchObject({
      type: 'file',
      url: expect.stringMatching(/^data:image\/png;base64,/u),
    })
  }
})

test('the newest files fill the byte budget and the older ones past it become stubs', async () => {
  const size = FRESH_ATTACHMENTS.bytes / 2 - 1
  const messages = [
    userTurn([putFile('019a0000-0000-7000-8000-00000000000a', size)]),
    userTurn([
      putFile('019a0000-0000-7000-8000-00000000000b', size),
      putFile('019a0000-0000-7000-8000-00000000000c', size),
    ]),
  ]

  const [older, newest] = await attachments.forModel(messages)

  expect(filePart(older)?.type).toBe('text')
  expect(newest?.parts.slice(1).map((part) => part.type)).toEqual([
    'file',
    'file',
  ])
})

test('a file no longer in the bucket becomes a stub saying so', async () => {
  const ref = attachmentRef({
    chatId: CHAT_ID,
    id: '019a0000-0000-7000-8000-0000000000ff',
  })

  const [message] = await attachments.forModel([
    userTurn([{ filename: 'gone.png', mediaType: 'image/png', url: ref }]),
  ])

  expect(filePart(message)).toEqual({
    text: '[File "gone.png", image/png, no longer stored]',
    type: 'text',
  })
})

const fetchLink = (link: string) =>
  attachmentsRouter.request(link.replace('https://api.test/attachments', ''))
const statusOf = async (link: string) => {
  const response = await fetchLink(link)
  return response.status
}

test('a signed link serves the model copy without letting anything cache it', async () => {
  const { id } = await storeOne('image/png', await png(3000, 2000))
  const key = attachmentKey({ chatId: CHAT_ID, id })

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

test('a link signed for another file, or not signed, answers 404', async () => {
  const { id } = await storeOne('image/png', await png(10, 10))
  const other = attachmentLink(
    { chatId: CHAT_ID, id: '019a0000-0000-7000-8000-0000000000ee' },
    'image/png'
  )
  const forged = attachmentLink({ chatId: CHAT_ID, id }, 'image/png').replace(
    /sig=.*/u,
    other.slice(other.indexOf('sig='))
  )

  expect(await statusOf(forged)).toBe(404)
  expect(await statusOf(`/${CHAT_ID}/${id}.png`)).toBe(404)
})

test('a link answers 404 once its chat or its file is deleted', async () => {
  const { id } = await storeOne('image/png', await png(10, 10))
  const link = attachmentLink({ chatId: CHAT_ID, id }, 'image/png')
  expect(await statusOf(link)).toBe(200)

  chatExists = false
  expect(await statusOf(link)).toBe(404)

  chatExists = true
  objects.delete(attachmentKey({ chatId: CHAT_ID, id }))
  expect(await statusOf(link)).toBe(404)
})
