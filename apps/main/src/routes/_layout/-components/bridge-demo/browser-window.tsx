import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { AppLogo } from '@tamery/ui/components/brand/app-logo'
import { ConnectionIcon } from '@tamery/ui/components/icons/connection-icon'
import { cn } from '@tamery/ui/lib/utils'
import { motion } from 'motion/react'

import { OrdersTable } from '../agent-demo/orders-table'
import { WindowButtons } from '../window-buttons'
import { BRIDGE_NAME, PAIRED_STEP, RAN_STEP } from './script'

export const BrowserWindow = ({ step }: { step: number }) => (
  <div className="bg-body ring-foreground/4 absolute top-60 right-0 left-6 flex flex-col overflow-hidden rounded-xl shadow-2xl ring sm:top-16 sm:left-auto sm:w-[58%]">
    <div className="bg-card relative flex h-9 shrink-0 items-center border-b px-3">
      <WindowButtons />
      <span className="bg-muted text-muted-foreground absolute inset-x-0 mx-auto w-fit rounded-md px-3 py-0.5 text-xs">
        app.tamery.app
      </span>
    </div>
    <div className="flex h-9 shrink-0 items-center gap-3 border-b px-3 text-xs">
      <AppLogo className="text-primary size-4" />
      <span className="flex min-w-0 items-center gap-1.5">
        <ConnectionIcon type={ConnectionType.Postgres} className="size-3.5" />
        localhost
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          strokeWidth={2}
          className="text-muted-foreground/40 size-3.5"
        />
        orders
      </span>
      <span className="text-muted-foreground ml-auto flex items-center gap-1.5">
        <span
          className={cn(
            'bg-muted-foreground/40 size-1.5 rounded-full transition-colors',
            step >= PAIRED_STEP && 'bg-success'
          )}
        />
        Runs on {BRIDGE_NAME}
      </span>
    </div>
    <div className="p-1.5">
      {step >= RAN_STEP ? (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        >
          <OrdersTable refunded={false} />
        </motion.div>
      ) : (
        <p className="text-muted-foreground flex h-64 items-center justify-center text-xs">
          {step >= PAIRED_STEP ? 'Running…' : 'Waiting for the bridge'}
        </p>
      )}
    </div>
  </div>
)
