import { describe, expect, it } from 'bun:test'

import {
  AUTO_CHAT_EFFORTS,
  AUTO_CHAT_MODELS,
  chatModels,
  chatModelVariations,
  DEFAULT_CHAT_MODEL,
  resolveChatEffort,
  resolveCompactAt,
} from './list'

describe('chatModelVariations', () => {
  it('offers every model its default effort', () => {
    for (const { id } of chatModels) {
      const { defaultEffort, efforts } = chatModelVariations(id)
      expect(efforts).toContain(defaultEffort)
    }
  })

  it('gives a model without its own list the shared efforts and default', () => {
    expect(chatModelVariations('anthropic/claude-opus-5.5')).toEqual({
      context: 1_000_000,
      defaultEffort: 'medium',
      efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    })
  })

  it('gives a model its own efforts and default', () => {
    expect(chatModelVariations('mistralai/mistral-large-4-0')).toMatchObject({
      defaultEffort: 'high',
      efforts: ['high'],
    })
  })
})

it("runs each of Auto's levels at an effort its model supports", () => {
  expect(AUTO_CHAT_EFFORTS).toHaveLength(AUTO_CHAT_MODELS.length)
  for (const [level, effort] of AUTO_CHAT_EFFORTS.entries()) {
    const model = AUTO_CHAT_MODELS[level] ?? DEFAULT_CHAT_MODEL
    expect(chatModelVariations(model).efforts).toContain(effort)
  }
})

describe('resolveChatEffort', () => {
  it('keeps an effort the model supports', () => {
    expect(resolveChatEffort('google/gemini-4-argon', 'high')).toBe('high')
    expect(resolveChatEffort('z-ai/glm-5.3', 'max')).toBe('max')
  })

  it("falls back to the model's default for one it does not", () => {
    expect(resolveChatEffort('google/gemini-4-argon', 'xhigh')).toBe('medium')
    expect(resolveChatEffort('x-ai/grok-4.7', 'max')).toBe('medium')
    expect(resolveChatEffort('z-ai/glm-5.3', 'medium')).toBe('high')
    expect(resolveChatEffort('z-ai/glm-5.3')).toBe('high')
  })
})

describe('resolveCompactAt', () => {
  it("compacts at 80% of the model's window when nothing is picked", () => {
    expect(resolveCompactAt('x-ai/grok-4.7', null)).toBe(400_000)
  })

  it('keeps a picked threshold below that', () => {
    expect(resolveCompactAt('x-ai/grok-4.7', 200_000)).toBe(200_000)
  })

  it("caps a picked threshold at 80% of the model's window", () => {
    expect(resolveCompactAt('x-ai/grok-4.7', 1_000_000)).toBe(400_000)
  })
})
