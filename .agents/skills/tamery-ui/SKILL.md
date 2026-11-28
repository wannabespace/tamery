---
name: tamery-ui
description: Tamery's UI design system and hard rules — native macOS look, three-level color system, typography tokens, motion recipes, and the kit's known gotchas. Use whenever building, restyling, or reviewing any UI in this repo (components, pages, popovers, menus, animations), before writing the first className.
---

# Tamery UI

Native-feeling macOS database client (Electron + React + Tailwind v4 + base-ui kit in `packages/ui`). Every screen reads like an Apple app, not a web page. Owner-established rules; hard rules are review blockers.

Topic files — read what the task touches; record new decisions in the matching file:

| File | When |
|---|---|
| [colors.md](colors.md) | Colors, surfaces, glass, shadows, cell highlights |
| [typography.md](typography.md) | Fonts, type scale, row heights, radius |
| [patterns.md](patterns.md) | Chrome: menus, tabs, panes, tooltips, toasts, icons, filter field, forms, shortcuts |
| [motion.md](motion.md) | Any animation |
| [gotchas.md](gotchas.md) | Before debugging kit components |

## Hard rules

0. **Search the registry before writing markup.** `pnpm dlx shadcn@latest search @shadcn -q <term>`, and `@ai-elements` (shadcn's AI Elements) for anything in the chat. A `div` stack re-implementing a registry component (`Item`, `Empty`, `InputGroup`, `Field`, `ButtonGroup`, `Attachment`…) is a review blocker, including "just this once". Missing from `packages/ui` → vendor it (`shadcn view @shadcn/<name>`), rewrite imports to kit conventions, then use. `packages/ui/src/components/` holds registry components only; a component we write ourselves goes in `components/custom/`. Registry components carry the density, focus rings, hover states and data-slots the app relies on. Long-form text is never hand-parsed: prose via kit `Response`, fenced code via `CodeBlock` or `ResponseCodeBlock`.
1. **No `dark:` selectors.** Theme tokens resolve in both themes; no new theme-pair vars. A token pair lacking contrast → cross-theme constructions in [colors.md](colors.md). Test: **several call sites each dialing their own alpha on one token = the token is wrong.**
2. **No pixel font sizes.** Tokens only (`text-2xs`…`text-base`+); a missing size gets a rem token in `@theme`.
3. **No `cursor-pointer`.** `cursor-default` on link-based controls; I-beam and col-resize are the only exceptions. The docs site is a website and keeps the pointer on links ([patterns.md](patterns.md) → Docs).
4. **Kit-level fixes** in `packages/ui` for systemic sizing or color problems; page overrides only for page-specific design. Sizes via size props, never per-page `h-*`.
5. **No bare interactive icons.** Hover bg + color shift + tooltip, always ([patterns.md](patterns.md)).
6. **No `sidebar-*` color tokens.** Regular tokens everywhere.
7. **Global anchor rule:** `a { text-primary }` in globals — row-styled `Link`s must set `text-foreground` or render blue.
8. **`data-mask` on all user data.** Any element rendering user values (connection names, hosts, connection strings, schema/table/column names, cell values, SQL, filter values) gets it so screen-recording tools can blur it. App chrome never. Put it on the closest element wrapping only the user value.
9. **Verify heights in a row.** After touching any control sharing a line with others, measure every element's `getBoundingClientRect().height` in the browser — equal to the pixel. Classic traps: `py-*` plus fixed-height children exceeding `min-h`, borders without `bg-clip-padding`, hand-set `h-*` instead of size props.
10. **Refresh belongs to the tab bar, never to the page.** `TabRefresh` owns refreshing the active tab: a refreshable tab type gets a branch there (invalidate its query keys, `useRefreshHotkey`, render the button) and its page ships **no** refresh control. A tab type that cannot refresh keeps the button mounted and `disabled`. Two buttons for one dataset read as two refreshes and both fire on ⌘R.
11. **A className on a kit component is a missing prop.** Call sites pass `size`/`variant` and own only layout — position, flex sizing, `min-h-0`, a width, an animation, a behaviour utility. The moment a page re-dials a kit component's *surface* (padding, radius, background, border, font size, height) the kit is wrong for that context and gets a variant. One override is a smell; a stack of them on one element, or the same override at two call sites, is a review blocker. Rule 4 says where a fix lives; this says what a call site may write. `shadcn/no-restyle` enforces it ([code-style.md](../../rules/code-style.md)).
12. **Every feature is operable from the keyboard, and Escape always walks back to the Navigator.** A new surface ships its keyboard flow in the same task: arrows move *within* a surface, Enter (or Right, into a detail pane) descends, Escape ascends. **Tab moves *between* surfaces, never through one**: a list, tree, strip or grid is a single Tab stop, and everything inside it — rows, hover actions (⋯, pin), header buttons, checkboxes, grips — is `tabIndex={-1}`, reached by its arrows, ⌘. or its own shortcut. A surface never hands focus to a sibling surface from an arrow at its edge: holding an arrow stops at the edge, and leaving is Tab or Escape. Focus is never invisible — a surface that takes focus shows where it is (the grid places its cursor). **Escape is a ladder, never a jump** — it undoes the innermost state first (clear a search, then leave the field, then close the panel), one step per press, so enough presses from anywhere land on the Navigator. A handler that swallows Escape must have consumed a step (`stopPropagation` only after handling it), or the ladder breaks above it. An opening surface puts focus somewhere useful (`initialFocus`) and closing returns it to the trigger; nothing traps focus in a leaf with no way out. **Keys are registered with `useHotkey`/`useHotkeys` from `@tanstack/react-hotkeys`** (a shortcut listed in `core/keyboard/shortcuts.ts` through `useShortcut`/`useShortcuts`, which wrap them) — never a hand-rolled `addEventListener` and never a container's `onKeyDown` (which also drags a11y roles onto plain wrappers). `target` scopes a binding to one element's ref, so in-surface navigation and app-wide shortcuts use the same hook and show up together in its devtools.
13. **Holding ⌘ reveals the shortcuts.** Every shortcut a surface answers to becomes visible when the user holds ⌘ for a beat and disappears on release — hints sit on the controls they fire, drawn with `ShortcutKbd` from the shortcut's id. A shortcut with nowhere to appear is undiscoverable. Settings → Keyboard also lists every shortcut with what it does (`core/keyboard/shortcuts.ts`, ordered by `core/settings/shortcut-groups.ts`), as a reference, never a substitute for the on-control hint: a new or changed shortcut updates its row in the same task. Show only what fires in the current context (gate Electron-only ones on `window.electron`, hide what is disabled), and reserve or overlay the space — revealing a hint must not reflow its row.
14. **A popup driven by nullable data closes with its fade.** A dialog, drawer or popover whose `open` derives from a nullable value (`open={!!item}`) never renders its content from that live value: `item && <DialogContent>` unmounts the popup the moment it closes, so it vanishes with no exit animation, and `item?.x` in the body fades out an empty box. Copy the last non-null value into state during render and clear it in the root's `onOpenChangeComplete(false)`, once the exit animation has finished:

   ```tsx
   const [shown, setShown] = useState(item)
   if (item && item !== shown) {
     setShown(item)
   }
   <Dialog open={!!item} onOpenChangeComplete={(open) => !open && setShown(null)}>
     {shown && <DialogContent>…</DialogContent>}
   ```

   `open`, closing and actions read the live `item`; everything the user sees reads `shown`.
15. **Minimum UI, full power.** Tamery is a modern database tool: every surface handles every case with the fewest controls. Before adding a control, make an existing one smarter: parse what is pasted or typed, infer from context, default sensibly, expose power through shortcuts and parsing rather than extra fields. Two controls for one job (a second button for what the first already does) is a review blocker; so is a control the user cannot actually use for its job.
