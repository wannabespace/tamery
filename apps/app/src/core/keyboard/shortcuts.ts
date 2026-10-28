import type { HotkeyChord } from '@tanstack/react-hotkeys'

export interface Shortcut {
  description: string
  desktopOnly?: boolean
  hotkeys: HotkeyChord[]
  title: string
}

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const

export const SHORTCUTS = {
  acceptSuggestion: {
    description: 'Take the AI suggestion shown after the caret.',
    hotkeys: ['Tab'],
    title: 'Accept suggestion',
  },
  addItem: {
    description: 'Add an item to the open list.',
    desktopOnly: true,
    hotkeys: ['Mod+N'],
    title: 'Add',
  },
  agentMode: {
    description:
      'Turn the connection into one big chat with the AI agent, or back.',
    hotkeys: ['Mod+Shift+L'],
    title: 'Agent mode',
  },
  aiChat: {
    description: 'Open or close the AI assistant.',
    hotkeys: ['Mod+L'],
    title: 'AI chat',
  },
  applyEdit: {
    description: 'Save the cell you are editing into every selected cell.',
    hotkeys: ['Mod+Enter'],
    title: 'Apply edit',
  },
  closeTab: {
    description: 'Close the current tab.',
    desktopOnly: true,
    hotkeys: ['Mod+W'],
    title: 'Close tab',
  },
  commandPalette: {
    description: 'Find any command or connection and run it.',
    hotkeys: ['Mod+P'],
    title: 'Command palette',
  },
  contextMenu: {
    description:
      'Open the right-click menu of whatever has focus: a tab, a cell or a Navigator row.',
    hotkeys: ['Mod+.'],
    title: 'Context menu',
  },
  copy: {
    description: 'Copy the selection as tab-separated text for a spreadsheet.',
    hotkeys: ['Mod+C'],
    title: 'Copy',
  },
  deleteRows: {
    description: 'Delete the ticked rows, after you confirm.',
    hotkeys: ['Mod+Backspace'],
    title: 'Delete rows',
  },
  dropItem: {
    description: 'Drop the highlighted item, after you confirm.',
    hotkeys: ['Mod+D'],
    title: 'Drop',
  },
  editCell: {
    description:
      'Edit the cell under the cursor. Typing starts an edit too, and Backspace clears the value.',
    hotkeys: ['Enter', 'F2'],
    title: 'Edit cell',
  },
  editWithAi: {
    description: 'Describe a change and let AI rewrite the statement in place.',
    hotkeys: ['Mod+K'],
    title: 'Edit with AI',
  },
  extendSelection: {
    description: 'Grow the selection from the cursor.',
    hotkeys: ARROWS.map((arrow) => `Shift+${arrow}` as const),
    title: 'Extend selection',
  },
  fillDown: {
    description: 'Give every selected cell the value at the top of its column.',
    hotkeys: ['Mod+D'],
    title: 'Fill down',
  },
  fixWithAi: {
    description: 'Let AI correct the statement whose last run failed.',
    hotkeys: ['Mod+I'],
    title: 'Fix with AI',
  },
  jumpToEdge: {
    description: 'Jump to the first or last row or column.',
    hotkeys: ARROWS.map((arrow) => `Mod+${arrow}` as const),
    title: 'Jump to edge',
  },
  moveCursor: {
    description: 'Move the cell cursor. It stops at the edges.',
    hotkeys: [...ARROWS],
    title: 'Move cursor',
  },
  navigatorCollapse: {
    description:
      'Collapse a schema, jump from a table up to its schema, or go back from Definitions to Tables.',
    hotkeys: ['ArrowLeft'],
    title: 'Collapse',
  },
  navigatorMove: {
    description:
      'Walk the list from the search field, starting on the open table.',
    hotkeys: ['ArrowUp', 'ArrowDown'],
    title: 'Move',
  },
  navigatorOpen: {
    description:
      'Open the highlighted table with the grid ready for the arrows, or expand a schema. Right on an expanded schema steps into its tables.',
    hotkeys: ['Enter', 'ArrowRight'],
    title: 'Open',
  },
  newConnection: {
    description: 'Open the new connection page from the connections list.',
    desktopOnly: true,
    hotkeys: ['Mod+N'],
    title: 'New connection',
  },
  newTab: {
    description: 'Open a new query, a schema page or any table.',
    desktopOnly: true,
    hotkeys: ['Mod+T'],
    title: 'New tab',
  },
  newWindow: {
    description: 'Open another window.',
    desktopOnly: true,
    hotkeys: ['Mod+Shift+N'],
    title: 'New window',
  },
  nextArea: {
    description:
      'Move between the Navigator, the tab bar, the toolbar and the grid. Arrows move within each.',
    hotkeys: ['Tab'],
    title: 'Next area',
  },
  paste: {
    description: 'Paste a block from a spreadsheet, starting at the cursor.',
    hotkeys: ['Mod+V'],
    title: 'Paste',
  },
  peek: {
    description:
      "Peek at the row a reference points to, or the cell's full value.",
    hotkeys: ['Space'],
    title: 'Peek',
  },
  queryLogger: {
    description: 'Show or hide the log of every query this connection ran.',
    hotkeys: ['Mod+J'],
    title: 'Query logger',
  },
  redo: {
    description: 'Redo the change you undid.',
    hotkeys: ['Mod+Shift+Z'],
    title: 'Redo',
  },
  refresh: {
    description: "Load the current tab's data again.",
    desktopOnly: true,
    hotkeys: ['Mod+R'],
    title: 'Refresh',
  },
  runAll: {
    description: 'Run every statement in the tab.',
    hotkeys: ['Mod+Shift+Enter'],
    title: 'Run all',
  },
  runStatement: {
    description: 'Run the selection, or the statement under the caret.',
    hotkeys: ['Mod+Enter'],
    title: 'Run statement',
  },
  saveChanges: {
    description: 'Apply the changes staged in the current tab.',
    hotkeys: ['Mod+S'],
    title: 'Save changes',
  },
  saveStatement: {
    description:
      'Save the selection, or the statement under the caret, as a query.',
    hotkeys: ['Mod+S'],
    title: 'Save statement',
  },
  saveTab: {
    description: 'Save the whole tab as a query.',
    hotkeys: ['Mod+Shift+S'],
    title: 'Save tab',
  },
  search: {
    description:
      'Focus the search field of the page: the connections list, the table filter, the diagram search or these settings.',
    hotkeys: ['Mod+F'],
    title: 'Search',
  },
  selectAll: {
    description: 'Select every cell.',
    hotkeys: ['Mod+A'],
    title: 'Select all',
  },
  selectRows: {
    description: 'Tick the rows under the selection.',
    hotkeys: ['Shift+Space'],
    title: 'Select rows',
  },
  settings: {
    description: 'Open these settings.',
    hotkeys: ['Mod+,'],
    title: 'Settings',
  },
  stepBack: {
    description:
      'Close or clear the innermost thing that is open, one step per press, until you land in the Navigator search.',
    hotkeys: ['Escape'],
    title: 'Step back',
  },
  submit: {
    description: 'Save the open form or confirm the open dialog.',
    hotkeys: ['Mod+Enter'],
    title: 'Submit',
  },
  switchTabs: {
    description: 'Move between tabs while the tab bar has focus.',
    hotkeys: ['ArrowLeft', 'ArrowRight'],
    title: 'Switch tabs',
  },
  toggleNavigator: {
    description: 'Hide or show the Navigator.',
    hotkeys: ['Mod+B'],
    title: 'Navigator',
  },
  toggleView: {
    description: 'Switch the table between the grid and the documents view.',
    hotkeys: ['Mod+Shift+E'],
    title: 'Grid or documents',
  },
  undo: {
    description: 'Undo the last staged change.',
    hotkeys: ['Mod+Z'],
    title: 'Undo',
  },
} satisfies Record<string, Shortcut>

export type ShortcutId = keyof typeof SHORTCUTS

export const isShortcutAvailable = (id: ShortcutId) => {
  const { desktopOnly }: Shortcut = SHORTCUTS[id]
  return !desktopOnly || !!window.electron
}
