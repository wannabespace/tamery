import type { TelemetryOptions } from 'ai'
import { generateText } from 'ai'

import { models } from '../models/list'
import { EDITOR_CONTEXT, section, queryOutputRules } from './prompt'

const updateQueryInstructions = (data: {
  connectionType: string
  context: string
}) =>
  [
    'You are an assistant that updates database queries.',
    'Given the selected query and a request, return the updated query.',
    'When only a minor change is needed (a WHERE clause, a column, a value), change just that part.',
    'The selection can contain several queries; update all of them.',
    'Attached images are screenshots the user refers to; with no written prompt, they are the request.',
    EDITOR_CONTEXT,
    ...queryOutputRules(data.connectionType),
    '',
    'Database context:',
    data.context,
  ].join('\n')

export const updateQuery = async (data: {
  connectionType: string
  context: string
  editor: string
  images: File[]
  prompt: string
  signal?: AbortSignal
  query: string
  telemetry?: TelemetryOptions
}) => {
  const { text } = await generateText({
    abortSignal: data.signal,
    instructions: updateQueryInstructions(data),
    model: models.query,
    prompt: [
      {
        content: [
          {
            text: [
              section('WHOLE EDITOR', data.editor),
              section('SELECTED QUERY', data.query),
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
