import {
  File01Icon,
  HashtagIcon,
  Search01Icon,
  TextAlignLeftIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandPaletteFooter,
  CommandPaletteInput,
  CommandShortcut,
} from '@tamery/ui/components/command'
import { KbdHotkey } from '@tamery/ui/components/custom/shortcuts'
import { Spinner } from '@tamery/ui/components/spinner'
import { useHotkey } from '@tanstack/react-hotkeys'
import { useRouter } from '@tanstack/react-router'
import { useFetchSearch, useHighlightQuery } from 'fumadocs-core/search/client'
import type { SearchResultRecord } from 'fumadocs-core/search/client'
import { useState } from 'react'

import { SEARCH_KEYWORDS_ANCHOR } from '~/constants'
import { nav } from '~/lib/nav'
import { getUserAgent } from '~/utils/user-agent'

import { docsLinkProps } from './docs-link'

const MAX_RESULTS = 30

interface HastNode {
  type: string
  tagName?: string
  value?: string
  children?: HastNode[]
}

const hastText = (node: HastNode): string =>
  node.value ?? node.children?.map(hastText).join('') ?? ''

const findAll = (node: HastNode, tagName: string): HastNode[] =>
  node.tagName === tagName
    ? [node]
    : (node.children?.flatMap((child) => findAll(child, tagName)) ?? [])

// A table row is indexed as a Markdown table with its header; only the row's own cells are the match.
const resultText = (record: SearchResultRecord) => {
  const cells = findAll(record.hastContent, 'td')

  return cells.length > 0
    ? cells.map(hastText).join(' · ')
    : hastText(record.hastContent)
}

const groupByPage = (records: SearchResultRecord[]) =>
  Map.groupBy(records, (record) => record.url.split('#')[0] ?? record.url)

export const Search = () => {
  const [open, setOpen] = useState(false)
  const userAgent = getUserAgent()
  const router = useRouter()
  const { data, isLoading, onSearchChange, search } = useFetchSearch()
  const highlight = useHighlightQuery(data?.query ?? '')
  const records = (data?.items ?? [])
    .flatMap((item) => (item.type === 'table' ? item.rows : [item]))
    .slice(0, MAX_RESULTS)

  const setOpenAndReset = (next: boolean) => {
    setOpen(next)
    if (!next) {
      onSearchChange('')
    }
  }

  const go = (href: string) => {
    setOpenAndReset(false)
    void router.navigate(docsLinkProps(href))
  }

  useHotkey('Mod+K', (event) => {
    event.preventDefault()
    setOpenAndReset(!open)
  })

  return (
    <>
      <Button
        aria-label="Search"
        className="sm:w-52 sm:justify-start"
        onClick={() => setOpen(true)}
        size="sm"
        variant="outline-muted"
      >
        <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
        <span className="hidden flex-1 text-left sm:inline">Search</span>
        {userAgent && (
          <KbdHotkey
            className="hidden sm:inline-flex"
            hotkey="Mod+K"
            userAgent={userAgent}
          />
        )}
      </Button>
      <CommandDialog
        description="Search the documentation"
        onOpenChange={setOpenAndReset}
        open={open}
        title="Search docs"
      >
        <Command
          className="min-h-0 flex-1"
          loop
          shouldFilter={false}
          variant="transparent"
        >
          <CommandPaletteInput
            end={
              isLoading && (
                <span className="animate-in fade-in fill-mode-both flex delay-300">
                  <Spinner className="text-muted-foreground" />
                </span>
              )
            }
            onValueChange={onSearchChange}
            placeholder="Search docs…"
            value={search}
          />
          <CommandList className="scroll-fade max-h-none flex-1 scroll-py-2">
            <div key={data?.query} ref={highlight} className="p-1">
              {!data &&
                nav.groups.map((group) => (
                  <CommandGroup key={group.title} heading={group.title}>
                    {group.pages.map((page) => (
                      <CommandItem
                        key={page.href}
                        onSelect={() => go(page.href)}
                        value={page.href}
                      >
                        <HugeiconsIcon icon={File01Icon} strokeWidth={2} />
                        {page.title}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              {data &&
                [...groupByPage(records)].map(([href, pageRecords]) => (
                  <CommandGroup key={href}>
                    <CommandItem onSelect={() => go(href)} value={href}>
                      <HugeiconsIcon icon={File01Icon} strokeWidth={2} />
                      <span className="truncate">
                        {nav.getPage(href)?.title ??
                          pageRecords.find((record) => record.type === 'page')
                            ?.content ??
                          href}
                      </span>
                      <CommandShortcut>
                        {nav.getGroup(href)?.title}
                      </CommandShortcut>
                    </CommandItem>
                    {pageRecords
                      .filter(
                        (record) =>
                          record.type !== 'page' &&
                          !record.url.endsWith(`#${SEARCH_KEYWORDS_ANCHOR}`)
                      )
                      .map((record) => (
                        <CommandItem
                          key={record.id}
                          onSelect={() => go(record.url)}
                          value={record.id}
                        >
                          <span aria-hidden="true" className="w-4 shrink-0" />
                          <HugeiconsIcon
                            icon={
                              record.type === 'heading'
                                ? HashtagIcon
                                : TextAlignLeftIcon
                            }
                            strokeWidth={2}
                          />
                          <span
                            className={
                              record.type === 'text'
                                ? 'text-muted-foreground truncate'
                                : 'truncate'
                            }
                          >
                            {resultText(record)}
                          </span>
                        </CommandItem>
                      ))}
                  </CommandGroup>
                ))}
            </div>
            {!isLoading && (
              <CommandEmpty>No results for “{search}”</CommandEmpty>
            )}
          </CommandList>
        </Command>
        <CommandPaletteFooter />
      </CommandDialog>
    </>
  )
}
