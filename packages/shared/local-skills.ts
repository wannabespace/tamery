import { glob, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

import { type } from 'arktype'
import { Result } from 'better-result'
import { parse } from 'yaml'

/** An agent skill or command from the user's home folder, offered in the chat's `/` menu by the desktop app and the bridge. */
export interface LocalSkill {
  description: string | null
  instructions: string
  kind: 'command' | 'skill'
  name: string
  path: string
  source: 'Agents' | 'Claude' | 'Codex'
}

const SOURCES = [
  { kind: 'skill', pattern: '.claude/skills/*/SKILL.md', source: 'Claude' },
  { kind: 'command', pattern: '.claude/commands/*.md', source: 'Claude' },
  { kind: 'skill', pattern: '.agents/skills/*/SKILL.md', source: 'Agents' },
  { kind: 'skill', pattern: '.codex/skills/*/SKILL.md', source: 'Codex' },
] as const

// A skill is sent to the model with every message that uses it, so a huge file would eat the turn's budget.
const MAX_SKILL_BYTES = 32 * 1024

const FRONTMATTER = /^---\r?\n(?<head>[\s\S]*?)\r?\n---\r?\n?(?<body>[\s\S]*)$/u

const frontmatterType = type({ 'description?': 'string', 'name?': 'string' })

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
  // A skill whose frontmatter does not parse still offers its body, named after its file.
  const frontmatter = frontmatterType(
    Result.try(() => parse(match?.groups?.head ?? '')).unwrapOr(null)
  )
  const { description, name } =
    frontmatter instanceof type.errors ? {} : frontmatter
  return {
    description: description?.trim() || null,
    instructions: (match?.groups?.body ?? text).trim(),
    kind,
    name:
      name?.trim() ||
      (kind === 'skill'
        ? path.basename(path.dirname(file))
        : path.basename(file, '.md')),
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
