import { glob, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

import type { LocalSkill } from '@tamery/shared/local-skills'
import { Result } from 'better-result'

const SOURCES = [
  { kind: 'skill', pattern: '.claude/skills/*/SKILL.md', source: 'Claude' },
  { kind: 'command', pattern: '.claude/commands/*.md', source: 'Claude' },
  { kind: 'skill', pattern: '.agents/skills/*/SKILL.md', source: 'Agents' },
  { kind: 'skill', pattern: '.codex/skills/*/SKILL.md', source: 'Codex' },
] as const

// A skill is sent to the model with every message that uses it, so a huge file would eat the turn's budget.
const MAX_SKILL_BYTES = 32 * 1024

const FRONTMATTER = /^---\r?\n(?<head>[\s\S]*?)\r?\n---\r?\n?(?<body>[\s\S]*)$/u

const QUOTED = /^(?<quote>["'])(?<text>.*)\k<quote>$/u

const unquote = (value: string) => {
  const trimmed = value.trim()
  return QUOTED.exec(trimmed)?.groups?.text ?? trimmed
}

/** Reads `key: value` and `key: >`/`|` block scalars from YAML frontmatter, enough for a skill's name and description. */
const frontmatterField = (head: string, key: string) => {
  const lines = head.split(/\r?\n/u)
  const index = lines.findIndex((line) => line.startsWith(`${key}:`))
  if (index === -1) {
    return null
  }
  const inline = lines[index]?.slice(key.length + 1).trim() ?? ''
  if (!/^[>|][+-]?$/u.test(inline)) {
    return unquote(inline) || null
  }
  const block = []
  for (const line of lines.slice(index + 1)) {
    if (line.trim() && !/^\s/u.test(line)) {
      break
    }
    block.push(line.trim())
  }
  return block.join(' ').trim() || null
}

const readSkill = async (
  file: string,
  { kind, source }: (typeof SOURCES)[number]
): Promise<LocalSkill | null> => {
  const { size } = await stat(file)
  if (size > MAX_SKILL_BYTES) {
    return null
  }
  const text = await readFile(file, 'utf-8')
  const match = FRONTMATTER.exec(text)
  const fallbackName =
    kind === 'skill'
      ? path.basename(path.dirname(file))
      : path.basename(file, '.md')
  const name =
    (match?.groups?.head && frontmatterField(match.groups.head, 'name')) ||
    fallbackName
  return {
    description:
      (match?.groups?.head &&
        frontmatterField(match.groups.head, 'description')) ||
      null,
    instructions: (match?.groups?.body ?? text).trim(),
    kind,
    name,
    path: file,
    source,
  }
}

/** The user's own agent skills and commands from their home folder, read fresh on every call so an edit shows up without a restart. */
export const localSkills = {
  list: async () => {
    const found = await Promise.all(
      SOURCES.map(async (source) => {
        const files = await Array.fromAsync(
          glob(path.join(homedir(), source.pattern))
        )
        return Promise.all(
          files.map(async (file) => {
            const skill = await Result.tryPromise(() => readSkill(file, source))
            return skill.unwrapOr(null)
          })
        )
      })
    )
    // One skill is often linked into several of these folders; the `/` menu can hold one row per name, the first source's.
    const byName = new Map<string, LocalSkill>()
    for (const skill of found.flat()) {
      if (skill?.instructions && !byName.has(skill.name)) {
        byName.set(skill.name, skill)
      }
    }
    return [...byName.values()].toSorted((a, b) => a.name.localeCompare(b.name))
  },
}
