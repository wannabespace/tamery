import type { ShortcutId } from '~/core/keyboard/shortcuts'

export const SHORTCUT_GROUPS: { shortcuts: ShortcutId[]; title: string }[] = [
  {
    shortcuts: [
      'commandPalette',
      'settings',
      'stepBack',
      'nextArea',
      'contextMenu',
      'search',
      'submit',
      'saveChanges',
      'refresh',
      'newWindow',
      'newConnection',
    ],
    title: 'App',
  },
  {
    shortcuts: [
      'newTab',
      'closeTab',
      'switchTabs',
      'toggleNavigator',
      'queryLogger',
      'aiChat',
      'agentMode',
    ],
    title: 'Tabs and panels',
  },
  {
    shortcuts: ['navigatorMove', 'navigatorOpen', 'navigatorCollapse'],
    title: 'Navigator',
  },
  {
    shortcuts: [
      'moveCursor',
      'extendSelection',
      'jumpToEdge',
      'selectAll',
      'editCell',
      'applyEdit',
      'peek',
      'selectRows',
      'copy',
      'paste',
      'fillDown',
      'deleteRows',
      'undo',
      'redo',
      'toggleView',
    ],
    title: 'Table',
  },
  {
    shortcuts: [
      'runStatement',
      'runAll',
      'saveStatement',
      'saveTab',
      'acceptSuggestion',
      'editWithAi',
      'fixWithAi',
    ],
    title: 'Query',
  },
  {
    shortcuts: ['addItem', 'dropItem'],
    title: 'Schema',
  },
]
