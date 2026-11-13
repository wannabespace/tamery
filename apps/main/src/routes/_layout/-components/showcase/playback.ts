const CONVERSATIONS = [
  {
    answer:
      'Pro customers bring in the most, more than three times the team plan. I joined orders to users and summed this month’s totals:',
    columns: ['plan', 'sum'],
    question: 'Which plan brings the most revenue this month?',
    rows: [
      ['pro', '$9,412.40'],
      ['team', '$2,768.15'],
      ['free', '$1,205.90'],
    ],
    sql: `SELECT u.plan, sum(o.total)
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE o.created_at >=
  date_trunc('month', now())
GROUP BY 1 ORDER BY 2 DESC`,
    title: 'Revenue by plan',
  },
  {
    answer:
      'Four orders are still pending. The oldest has waited since September 12:',
    columns: ['id', 'created_at'],
    question: 'Which orders are still pending?',
    rows: [
      ['58303', '2026-09-12'],
      ['58309', '2026-09-15'],
      ['58328', '2026-09-24'],
      ['58334', '2026-09-27'],
    ],
    sql: `SELECT id, created_at
FROM orders
WHERE status = 'pending'
ORDER BY created_at`,
    title: 'Pending orders',
  },
  {
    answer:
      '4.1% of orders were refunded this quarter, up from 3.2% in the last one. I averaged refunds per quarter:',
    columns: ['quarter', 'rate'],
    question: 'Are refunds going up?',
    rows: [
      ['2026-07-01', '0.041'],
      ['2026-04-01', '0.032'],
      ['2026-01-01', '0.029'],
    ],
    sql: `SELECT date_trunc('quarter', created_at),
  avg((status = 'refunded')::int)
FROM orders
GROUP BY 1 ORDER BY 1 DESC
LIMIT 3`,
    title: 'Refund rate',
  },
] as const

type Conversation = (typeof CONVERSATIONS)[number]

const SEND_PAUSE_MS = 600
const WORD_MS = 80
const SQL_DELAY_MS = 160
const RESULT_DELAY_MS = 400
const HOLD_MS = 5000
const TAB_HOLD_MS = 3500

export type ShowcaseTab = 'chat' | 'schema' | 'table'

const held = (conversation: Conversation) => ({
  conversation,
  ms: HOLD_MS,
  result: true,
  sql: true,
  tab: 'chat' as ShowcaseTab,
  words: conversation.answer.split(' ').length,
})

const visit = (conversation: Conversation, tab: ShowcaseTab) => ({
  ...held(conversation),
  ms: TAB_HOLD_MS,
  tab,
})

export type Frame = ReturnType<typeof held>

const lead = (conversation: Conversation): Frame[] => {
  const done = held(conversation)
  const streaming = { ...done, result: false, sql: false }
  return [
    { ...streaming, ms: SEND_PAUSE_MS, words: 0 },
    ...Array.from({ length: done.words }, (_, index) => ({
      ...streaming,
      ms: index + 1 < done.words ? WORD_MS : SQL_DELAY_MS,
      words: index + 1,
    })),
    { ...done, ms: RESULT_DELAY_MS, result: false },
  ]
}

const [first, ...later] = CONVERSATIONS

export const REST_FRAME = held(first)

export const CHAT_TITLES = CONVERSATIONS.map(({ title }) => title)

export const FRAMES = [
  REST_FRAME,
  visit(first, 'table'),
  visit(first, 'schema'),
  ...later.flatMap((conversation) => [
    ...lead(conversation),
    held(conversation),
    visit(conversation, 'table'),
    visit(conversation, 'schema'),
  ]),
  ...lead(first),
]

export const FRAME_MS = FRAMES.map((frame) => frame.ms)
