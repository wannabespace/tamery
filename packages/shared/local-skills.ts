/** An agent skill or command from the user's home folder, offered in the chat's `/` menu on desktop. */
export interface LocalSkill {
  description: string | null
  instructions: string
  kind: 'command' | 'skill'
  name: string
  path: string
  source: 'Agents' | 'Claude' | 'Codex'
}
