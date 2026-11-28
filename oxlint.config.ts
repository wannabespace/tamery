import { defineConfig } from 'oxlint'
import core from 'ultracite/oxlint/core'
import react from 'ultracite/oxlint/react'
import tanstack from 'ultracite/oxlint/tanstack'

// @ts-expect-error extension
import { ignorePatterns } from './oxc.ignore.ts'

const callSiteClasses = [
  'layout',
  'motion',
  'opacity',
  'truncate',
  'focus-ring',
  'no-scrollbar',
  'scroll-fade',
  'scroll-fade-x',
  'table-scroller',
  'ph-no-capture',
]

export default defineConfig({
  extends: [core, react, tanstack],
  ignorePatterns: [...(core.ignorePatterns || []), ...ignorePatterns],
  jsPlugins: ['oxlint-tailwindcss', '@shadcn/lint'],
  overrides: [
    {
      files: ['apps/app/src/core/{queries,runtime}/**'],
      // Kysely's case builder spells its branches .then(); no promise involved.
      rules: { 'promise/prefer-await-to-then': 'off' },
    },
    {
      files: ['apps/desktop/src/main/**'],
      // No window here: utility-process and MessagePortMain ports take no target origin.
      rules: { 'unicorn/require-post-message-target-origin': 'off' },
    },
    {
      files: ['packages/ui/src/components/**'],
      rules: {
        'shadcn/no-arbitrary-values': 'off',
        'shadcn/no-restyle': 'off',
        'shadcn/require-static-classes': 'off',
      },
    },
    {
      files: ['packages/ui/src/components/{brand,icons}/**'],
      // Logos keep their own artwork colors.
      rules: { 'shadcn/no-raw-colors': 'off' },
    },
  ],
  rules: {
    // react-compiler memoizes context values; manual useMemo is redundant here.
    'react/jsx-no-constructed-context-values': 'off',

    'shadcn/no-arbitrary-values': [
      'error',
      { allow: ['layout', 'motion', 'stroke-[1.5]'] },
    ],
    'shadcn/no-inline-styles': [
      'error',
      {
        contracts: [
          // Motion drives these through MotionValues; a class cannot.
          {
            allow: ['opacity', 'rotateX', 'scale', 'translateY'],
            pattern: '^motion\\.',
          },
        ],
      },
    ],
    'shadcn/no-raw-colors': ['error', { allow: ['fill-none'] }],
    'shadcn/no-restyle': [
      'error',
      {
        allow: callSiteClasses,
        contracts: [
          { allow: [...callSiteClasses, 'shape'], pattern: '^Skeleton$' },
          { allow: [...callSiteClasses, 'color'], pattern: '^Spinner$' },
          {
            allow: [...callSiteClasses, 'color', 'typography'],
            pattern: '^(NumberFlow|ElapsedSeconds)$',
          },
          {
            allow: [...callSiteClasses, 'spacing'],
            pattern:
              '^(InputGroupTextarea|MessageScrollerContent|MessageScrollerViewport|ResizableGroup|SidebarContent|SidebarMenu)$',
          },
          { allow: [...callSiteClasses, 'divide-y'], pattern: '^Form$' },
          {
            allow: [
              ...callSiteClasses,
              'color',
              'shape',
              'spacing',
              'typography',
            ],
            pattern:
              '^(CommandPrimitive|DropdownMenuTrigger$|ScrollArea$|TooltipTrigger$)',
          },
          // AppContextMenu wraps a complete content element in ContextMenuTrigger, a passthrough that owns no surface, so the element keeps its own effects too.
          {
            allow: [
              ...callSiteClasses,
              'color',
              'effects',
              'shape',
              'spacing',
              'typography',
            ],
            pattern: '^ContextMenuTrigger$',
          },
        ],
      },
    ],
    'shadcn/no-unknown-classes': ['error', { allow: ['ph-no-capture'] }],
    'shadcn/require-static-classes': 'error',

    'tailwindcss/consistent-variant-order': 'error',
    'tailwindcss/enforce-canonical': 'error',
    'tailwindcss/enforce-consistent-important-position': 'error',
    'tailwindcss/enforce-consistent-line-wrapping': 'off',

    // oxfmt sortTailwindcss is the source of truth; this plugin's order disagrees.
    'tailwindcss/enforce-sort-order': 'off',

    'tailwindcss/no-conflicting-classes': 'error',
    'tailwindcss/no-deprecated-classes': 'error',
    'tailwindcss/no-duplicate-classes': 'error',
    'tailwindcss/no-unknown-classes': [
      'error',
      {
        allowlist: [
          'ph-no-capture',
          'toaster',
          'typography',
          'typography-disabled',
          'bg-fd-secondary',
          'text-fd-secondary-foreground',
          'text-fd-muted-foreground',
          'fd-scroll-container',
          'placeholder:text-fd-muted-foreground',
          'text-fd-primary',
          'text-fd-error',
          'bg-fd-overlay',
          'animate-fd-fade-in',
          'animate-fd-fade-out',
          'bg-fd-card',
          'text-fd-card-foreground',
          'animate-fd-dialog-in',
          'animate-fd-dialog-out',
          'text-fd-muted-foreground/80',
          'focus-visible:ring-fd-ring',
        ],
      },
    ],
    'tailwindcss/no-unnecessary-arbitrary-value': 'error',
  },
  settings: {
    'react-hooks': { additionalEffectHooks: '(useMountedEffect)' },
    shadcn: {
      ignoreImports: '^@tamery/ui/components/(brand|icons)/',
      ui: '@tamery/ui/components',
    },
    tailwindcss: { entryPoint: 'packages/ui/src/styles/globals.css' },
  },
})
