/** In the order the menu lists them. */
export const COMMANDS = [
  ['new', 'Start a new chat'],
  ['model', 'Choose the model'],
  ['retry', 'Ask the last message again'],
  ['copy', 'Copy the last answer'],
  ['compact', 'Summarize the chat so far to free up context'],
] as const

export type ChatCommand = (typeof COMMANDS)[number][0]

/** The command a message runs instead of being sent: the whole text is one `/command`. */
export const getSlashCommand = (text: string) =>
  COMMANDS.find(([command]) => text.trim() === `/${command}`)?.[0] ?? null
