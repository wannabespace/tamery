// Copies apps/app's connection workspace chrome (title bar, navigator, tab bar, table toolbar, grid, visualizer, chat tab); keep in sync when it changes.

import { AnimatePresence, motion } from 'motion/react'
import { useRef } from 'react'

import { useLoop } from '../use-loop'
import { ChatTab } from './chat-tab'
import { Grid } from './grid'
import { Navigator } from './navigator'
import { FRAME_MS, FRAMES, REST_FRAME } from './playback'
import { Schema } from './schema'
import { TabBar } from './tab-bar'
import { TitleBar } from './title-bar'
import { Toolbar } from './toolbar'

export const Showcase = () => {
  const ref = useRef<HTMLElement>(null)
  const frame = FRAMES[useLoop(ref, FRAME_MS) ?? 0] ?? REST_FRAME
  const chatTitle = frame.conversation.title

  return (
    <figure ref={ref} className="w-full min-w-5xl">
      <figcaption className="sr-only">
        Tamery switching between its tabs: the AI chat answering a question
        about the data with its SQL and rows, an orders table filtered through a
        foreign key with an unsaved edit, and the schema diagram.
      </figcaption>
      <div
        inert
        className="bg-body ring-foreground/4 flex h-150 flex-col overflow-hidden rounded-2xl mask-b-from-90% shadow-2xl ring select-none sm:h-164"
      >
        <TitleBar />
        <div className="flex min-h-0 flex-1 p-2">
          <Navigator tab={frame.tab} chatTitle={chatTitle} />
          <div className="bg-background ring-foreground/4 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl ring">
            <TabBar tab={frame.tab} chatTitle={chatTitle} />
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                key={frame.tab}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex min-h-0 flex-1 flex-col"
              >
                {frame.tab === 'table' && (
                  <>
                    <Toolbar />
                    <Grid />
                  </>
                )}
                {frame.tab === 'schema' && <Schema />}
                {frame.tab === 'chat' && <ChatTab frame={frame} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </figure>
  )
}
