import { Mistral } from '@mistralai/mistralai'
import type { LanguageModelUsage } from 'ai'
import { generateText } from 'ai'

import { env } from '../env'
import { models } from '../models/list'
import { usageTelemetry } from '../usage/record'
import { MATCH_USER_STYLE, section } from './prompt'

const CARET = '<CARET>'

const completeSqlInstructions = (data: {
  connectionType: string
  context: string
}) =>
  [
    'You are an inline SQL completion engine inside a SQL editor.',
    `The database type is "${data.connectionType}".`,
    "Values are the user's job, structure is yours. You complete SQL structure only: keywords, operators, functions, and table, column and enum names from the schema. A string, number, date or time value may appear in your text only if it is an enum value from the schema or the user already wrote it; any other value is unknown to you, so end your text right before it, without its opening quote, and let the user type it.",
    `You get the text before the caret and the text after it, each marked with ${CARET} on the caret side.`,
    `Return only the text to insert at ${CARET}: no explanations, markdown or fences.`,
    `Never repeat text that is already before or after ${CARET}; your text goes between them.`,
    MATCH_USER_STYLE,
    `Your text is inserted at ${CARET} exactly as returned, character for character, and the editor adds no whitespace: when the character right before ${CARET} ends a token and your text starts the next one, begin with the whitespace the user puts between tokens.`,
    'Finish only the current statement, at most a few lines, and stop at its end: never start another statement. Use only tables and columns from the schema.',
    'Never use placeholders or bind parameters.',
    'Return an empty response when nothing useful can be suggested.',
    '',
    'Database schema:',
    data.context,
  ].join('\n')

interface CompleteSqlInput {
  connectionType: string
  context: string
  onUsage: (modelId: string, usage: LanguageModelUsage) => Promise<void>
  prefix: string
  signal?: AbortSignal
  suffix: string
}

const chatCompleteSql = async (data: CompleteSqlInput) => {
  const { text } = await generateText({
    abortSignal: data.signal,
    instructions: {
      content: completeSqlInstructions(data),
      providerOptions: {
        openrouter: { cacheControl: { type: 'ephemeral' } },
      },
      role: 'system',
    },
    maxOutputTokens: 200,
    model: models.fast,
    prompt: [
      section('TEXT BEFORE CARET', `${data.prefix}${CARET}`),
      section('TEXT AFTER CARET', `${CARET}${data.suffix}`),
    ].join('\n'),
    telemetry: usageTelemetry(data.onUsage),
  })
  return text
}

const FIM_MODEL = 'codestral-latest'

const mistral = new Mistral({ apiKey: env.MISTRAL_API_KEY })

const TABLE_LINE = /^(?<name>[^\s(]+)(?:\((?<columns>.*)\))?$/u

/** Codestral takes a bare word under comment-only context for the start of Lua or JS; DDL makes the file read as SQL. */
const schemaAsDdl = (context: string) =>
  context.split('\n').map((line) => {
    const table = TABLE_LINE.exec(line)?.groups
    return table
      ? `create table ${table.name} (${table.columns ?? ''});`
      : `-- ${line}`
  })

const fimCompleteSql = async (data: CompleteSqlInput) => {
  const { choices, usage } = await mistral.fim.complete(
    {
      maxTokens: 200,
      model: FIM_MODEL,
      prompt: [
        `-- Database: ${data.connectionType}`,
        ...schemaAsDdl(data.context),
        '',
        data.prefix,
      ].join('\n'),
      stop: ['\n\n'],
      suffix: data.suffix,
      temperature: 0,
    },
    { signal: data.signal }
  )
  const inputTokens = usage.promptTokens ?? 0
  const outputTokens = usage.completionTokens ?? 0
  void data.onUsage(FIM_MODEL, {
    inputTokenDetails: {
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      noCacheTokens: inputTokens,
    },
    inputTokens,
    outputTokenDetails: {
      reasoningTokens: 0,
      textTokens: outputTokens,
    },
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  })
  const content = choices[0]?.message?.content
  return typeof content === 'string' ? content : ''
}

export const completeSql = async (data: CompleteSqlInput) => {
  try {
    return await fimCompleteSql(data)
  } catch (error) {
    if (data.signal?.aborted) {
      throw error
    }
    return chatCompleteSql(data)
  }
}
