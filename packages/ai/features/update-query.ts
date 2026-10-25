import type { TelemetryOptions } from 'ai'
import { generateText } from 'ai'

import { models } from '../models/list'
import { EDITOR_CONTEXT, section, sqlOutputRules } from './prompt'

const updateSqlInstructions = (data: {
  connectionType: string
  context: string
}) =>
  [
    'You are an assistant that updates SQL queries.',
    'Given the selected SQL and a request, return the updated query.',
    'When only a minor change is needed (a WHERE clause, a column, a value), change just that part.',
    'The selection can contain several queries; update all of them.',
    'Attached images are screenshots the user refers to; with no written prompt, they are the request.',
    EDITOR_CONTEXT,
    ...sqlOutputRules(data.connectionType),
    '',
    'Database context:',
    data.context,
  ].join('\n')

export const updateSql = async (data: {
  connectionType: string
  context: string
  editor: string
  images: File[]
  prompt: string
  signal?: AbortSignal
  sql: string
  telemetry?: TelemetryOptions
}) => {
  const { text } = await generateText({
    abortSignal: data.signal,
    instructions: updateSqlInstructions(data),
    model: models.sql,
    prompt: [
      {
        content: [
          {
            text: [
              section('WHOLE EDITOR', data.editor),
              section('SELECTED SQL QUERY', data.sql),
              section('PROMPT', data.prompt),
            ].join('\n'),
            type: 'text',
          },
          ...(await Promise.all(
            data.images.map(async (image) => ({
              data: new Uint8Array(await image.arrayBuffer()),
              mediaType: image.type,
              type: 'file' as const,
            }))
          )),
        ],
        role: 'user',
      },
    ],
    telemetry: data.telemetry,
  })
  return text
}
