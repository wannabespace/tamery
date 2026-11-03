import { ArrowUpRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { CodeBlock } from '@tamery/ui/components/custom/code-block'
import { CopyIconButton } from '@tamery/ui/components/custom/copy-button'
import { InlineCode } from '@tamery/ui/components/custom/inline-code'
import { SettingsGroup } from '@tamery/ui/components/custom/settings-group'
import { smallItemInsetClassName } from '@tamery/ui/components/item'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@tamery/ui/components/tabs'
import { cn } from '@tamery/ui/lib/utils'

import { posthog } from '~/lib/posthog'

import type { McpEndpoint } from './clients'
import { maskedToken, MCP_CLIENTS } from './clients'

export const ClientSetup = ({ server }: { server: McpEndpoint }) => (
  <SettingsGroup title="Add to a client">
    <Tabs defaultValue={MCP_CLIENTS[0]?.id}>
      <div className={cn(smallItemInsetClassName, 'pt-3.5')}>
        <TabsList className="w-full">
          {MCP_CLIENTS.map(({ id, label }) => (
            <TabsTrigger key={id} value={id}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {MCP_CLIENTS.map((client) => {
        const installLink = client.installLink?.(server)

        return (
          <TabsContent key={client.id} value={client.id}>
            <div
              className={cn(
                smallItemInsetClassName,
                'flex min-h-12 items-center gap-2 py-3'
              )}
            >
              <p className="text-muted-foreground min-w-0 flex-1 truncate">
                {client.instruction}{' '}
                {client.file && <InlineCode>{client.file}</InlineCode>}
              </p>
              {installLink && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    posthog.capture('mcp_client_install_opened', {
                      client: client.id,
                    })
                    window.open(installLink, '_blank')
                  }}
                >
                  Add to {client.label}
                  <HugeiconsIcon
                    icon={ArrowUpRight01Icon}
                    strokeWidth={2}
                    data-icon="inline-end"
                  />
                </Button>
              )}
              <CopyIconButton
                label="Copy"
                text={client.code(server)}
                onClick={() =>
                  posthog.capture('mcp_config_copied', { client: client.id })
                }
              />
            </div>
            <CodeBlock
              code={client.code({
                ...server,
                token: maskedToken(server.token),
              })}
              data-mask
              language={client.language}
              padding="item"
              size="xs"
              variant="inset"
              wrap
            />
          </TabsContent>
        )
      })}
    </Tabs>
  </SettingsGroup>
)
