import { parseArgs } from 'node:util'

// The features barrel opens Redis on import; the eval needs only one step.
import { streamChatStep } from '@tamery/ai/features/chat-step'
import { AGENT_LIMITS } from '@tamery/ai/limits'
import type { AppUIMessage } from '@tamery/ai/message'
import { usageTelemetry } from '@tamery/ai/usage/record'
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai'
import { v7 } from 'uuid'

import type { EvalCase } from './cases'
import { cases } from './cases'
import { seed } from './fixtures'
import { matches } from './grade'
import { CONNECTION_NAMES, answerToolCalls, read } from './tools'

const { values } = parseArgs({
  options: {
    concurrency: { default: '4', type: 'string' },
    only: { type: 'string' },
    'skip-seed': { type: 'boolean' },
  },
})

const selected = cases.filter(
  ({ id }) => !values.only || id.includes(values.only)
)

const runStep = async (
  evalCase: EvalCase,
  messages: AppUIMessage[],
  telemetry: ReturnType<typeof usageTelemetry>
) => {
  const ended = Promise.withResolvers<AppUIMessage>()
  const stream = await streamChatStep({
    connection: {
      id: evalCase.engine,
      name: CONNECTION_NAMES[evalCase.engine],
      notes: [],
      resource: 'shop',
      type: evalCase.engine,
    },
    limits: AGENT_LIMITS.pro.message,
    messages,
    onEnd: (message) => ended.resolve(message),
    onError: (error) => {
      ended.reject(error)
      return 'failed'
    },
    telemetry,
  })
  await stream.pipeTo(new WritableStream())
  return ended.promise
}

const lastQueryRows = (message: AppUIMessage | undefined) => {
  const part = message?.parts.findLast(
    (candidate) =>
      candidate.type === 'tool-query' && candidate.state === 'output-available'
  )
  return part?.type === 'tool-query' && part.state === 'output-available'
    ? (part.output[0]?.rows ?? [])
    : null
}

interface CaseResult {
  cacheRead: number
  error: string | null
  id: string
  input: number
  output: number
  pass: boolean
  steps: number
}

const runCase = async (evalCase: EvalCase): Promise<CaseResult> => {
  const usage = { cacheRead: 0, input: 0, output: 0 }
  const telemetry = usageTelemetry((_model, step) => {
    usage.cacheRead += step.inputTokenDetails.cacheReadTokens ?? 0
    usage.input += step.inputTokens ?? 0
    usage.output += step.outputTokens ?? 0
    return Promise.resolve()
  })
  let messages: AppUIMessage[] = [
    {
      id: v7(),
      parts: [{ text: evalCase.question, type: 'text' }],
      role: 'user',
    },
  ]
  let steps = 0
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop
    const answer = await runStep(evalCase, messages, telemetry)
    steps += 1
    messages = [...messages.filter(({ id }) => id !== answer.id), answer]
    if (!lastAssistantMessageIsCompleteWithToolCalls({ messages })) {
      break
    }
    // oxlint-disable-next-line no-await-in-loop
    await answerToolCalls(answer)
  }
  const [expected] = await read(evalCase.engine, evalCase.expected)
  const actual = lastQueryRows(messages.at(-1))
  return {
    ...usage,
    error: null,
    id: evalCase.id,
    pass:
      !!actual &&
      matches({
        actual,
        expected: expected?.rows ?? [],
        ordered: evalCase.ordered,
      }),
    steps,
  }
}

if (!values['skip-seed']) {
  for (const engine of new Set(selected.map((item) => item.engine))) {
    // oxlint-disable-next-line no-await-in-loop
    await seed(engine)
  }
}

const results: CaseResult[] = []
const queue = [...selected]
await Promise.all(
  Array.from({ length: Number(values.concurrency) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const evalCase = next
      // oxlint-disable-next-line no-await-in-loop
      const result = await runCase(evalCase).catch(
        (error: unknown): CaseResult => ({
          cacheRead: 0,
          error: error instanceof Error ? error.message : String(error),
          id: evalCase.id,
          input: 0,
          output: 0,
          pass: false,
          steps: 0,
        })
      )
      results.push(result)
      console.log(
        `${result.pass ? 'PASS' : 'FAIL'}  ${result.id.padEnd(36)} steps ${String(result.steps).padStart(2)}  tokens ${String(result.input + result.output).padStart(7)}  cached ${String(result.cacheRead).padStart(7)}${result.error ? `  ${result.error}` : ''}`
      )
    }
  })
)

const total = (pick: (result: CaseResult) => number) =>
  results.reduce((sum, result) => sum + pick(result), 0)
const passed = results.filter(({ pass }) => pass).length
const input = total(({ input: tokens }) => tokens)

console.log(`
Accuracy      ${passed}/${results.length} (${Math.round((passed / results.length) * 100)}%)
Steps         ${(total(({ steps }) => steps) / results.length).toFixed(1)} per case
Tokens        ${total(({ output }) => output) + input} (${Math.round((input + total(({ output }) => output)) / results.length)} per case)
Cache reads   ${input ? Math.round((total(({ cacheRead }) => cacheRead) / input) * 100) : 0}% of input tokens`)
for (const engine of new Set(selected.map((item) => item.engine))) {
  const own = results.filter(({ id }) => id.startsWith(`${engine}/`))
  if (own.length > 0) {
    console.log(
      `  ${engine.padEnd(10)} ${own.filter(({ pass }) => pass).length}/${own.length}`
    )
  }
}
process.exit(0)
