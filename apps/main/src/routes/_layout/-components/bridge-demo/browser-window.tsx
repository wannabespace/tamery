import { ArrowRight01Icon, ComputerIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { BRIDGE_URL } from '@tamery/shared/bridge'
import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { AppLogo } from '@tamery/ui/components/brand/app-logo'
import { Button } from '@tamery/ui/components/button'
import { InlineCode } from '@tamery/ui/components/custom/inline-code'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { ConnectionIcon } from '@tamery/ui/components/icons/connection-icon'
import { Input } from '@tamery/ui/components/input'
import { cn } from '@tamery/ui/lib/utils'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { OrdersTable } from '../agent-demo/orders-table'
import { WindowButtons } from '../window-buttons'
import {
  BRIDGE_NAME,
  codeMatchClass,
  CONNECT_STEP,
  focusClass,
  LOADED_STEP,
  PAIR_CODE,
} from './script'

const Crumbs = ({
  icon,
  page,
  section,
}: {
  icon?: ReactNode
  page: string
  section: string
}) => (
  <span className="flex min-w-0 items-center gap-1.5">
    {icon}
    {section}
    <HugeiconsIcon
      icon={ArrowRight01Icon}
      strokeWidth={2}
      className="text-muted-foreground/40 size-3.5"
    />
    {page}
  </span>
)

const PairSettings = ({ step }: { step: number }) => (
  <div className="p-4">
    <SettingsGroup title="Connect this browser">
      <SettingsRow
        title="Bridge URL"
        description="Queries run on the computer at this address."
      >
        <Input
          readOnly
          variant="code"
          aria-label="Bridge URL"
          className="hidden w-56 sm:flex"
          value={BRIDGE_URL}
        />
      </SettingsRow>
      <SettingsRow
        title="Allow it at the bridge"
        description={
          step >= CONNECT_STEP ? (
            <>
              Allow this browser in the terminal only if it shows{' '}
              <span className={codeMatchClass(step)}>
                <InlineCode>{PAIR_CODE}</InlineCode>
              </span>
              .
            </>
          ) : (
            <>
              Connect asks the terminal running{' '}
              <InlineCode>tamery bridge</InlineCode>.
            </>
          )
        }
      >
        <Button>
          <LoadingContent loading={step >= CONNECT_STEP}>
            Connect
          </LoadingContent>
        </Button>
      </SettingsRow>
    </SettingsGroup>
  </div>
)

export const BrowserWindow = ({
  active,
  step,
}: {
  active: boolean
  step: number
}) => {
  const allowed = step >= LOADED_STEP

  return (
    <div
      className={cn(
        'bg-body ring-foreground/4 flex flex-col overflow-hidden rounded-xl shadow-2xl ring sm:col-span-7',
        focusClass(active)
      )}
    >
      <div className="bg-card relative flex h-9 shrink-0 items-center border-b px-3">
        <WindowButtons />
        <span className="bg-muted text-muted-foreground absolute inset-x-0 mx-auto w-fit rounded-md px-3 py-0.5 text-xs">
          app.tamery.app
        </span>
      </div>
      <div className="flex h-9 shrink-0 items-center gap-3 border-b px-3 text-xs">
        <AppLogo className="text-primary size-4" />
        {allowed ? (
          <Crumbs
            icon={
              <ConnectionIcon
                type={ConnectionType.SQLite}
                className="size-3.5"
              />
            }
            section="storefront.db"
            page="orders"
          />
        ) : (
          <Crumbs section="Settings" page="Bridge" />
        )}
        <span className="text-muted-foreground ml-auto flex items-center gap-1.5">
          <span className="relative">
            <HugeiconsIcon
              icon={ComputerIcon}
              strokeWidth={2}
              className="size-3.5"
            />
            <span
              className={cn(
                'bg-muted-foreground/40 absolute -top-0.5 -right-0.5 size-1.5 rounded-full transition-colors',
                allowed && 'bg-success'
              )}
            />
          </span>
          {BRIDGE_NAME}
        </span>
      </div>
      <motion.div
        key={allowed ? 'table' : 'settings'}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        className="h-72 overflow-hidden"
      >
        {allowed ? (
          <div className="p-1.5">
            <OrdersTable refunded={false} />
          </div>
        ) : (
          <PairSettings step={step} />
        )}
      </motion.div>
    </div>
  )
}
