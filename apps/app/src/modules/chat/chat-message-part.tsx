import {
  ArrowRight01Icon,
  BrainIcon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import type { AppMessagePart } from '@tamery/ai/message'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tamery/ui/components/collapsible'
import { Response, ResponseCodeBlock } from '@tamery/ui/components/response'
import { Spinner } from '@tamery/ui/components/spinner'
import { getToolName, isDynamicToolUIPart, isToolUIPart } from 'ai'
import type { DynamicToolUIPart, ToolUIPart } from 'ai'
import type * as React from 'react'

const Disclosure = ({
  children,
  icon: Icon,
  label,
  status,
}: {
  children: React.ReactNode
  icon: IconSvgElement
  label: string
  status?: React.ReactNode
}) => (
  <Collapsible>
    <CollapsibleTrigger variant="disclosure" className="group">
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        strokeWidth={2}
        className="size-3.5 transition-transform duration-200 group-data-panel-open:rotate-90"
      />
      <HugeiconsIcon icon={Icon} strokeWidth={2} className="size-3.5" />
      <span className="truncate">{label}</span>
      {status}
    </CollapsibleTrigger>
    <CollapsibleContent variant="disclosure" className="mt-1 ml-1.5">
      {children}
    </CollapsibleContent>
  </Collapsible>
)

const ToolPart = ({ part }: { part: DynamicToolUIPart | ToolUIPart }) => (
  <Disclosure
    icon={Wrench01Icon}
    label={getToolName(part)}
    status={
      part.state === 'output-available' ||
      part.state === 'output-error' ? null : (
        <Spinner className="size-3" />
      )
    }
  >
    {part.input !== undefined && (
      <ResponseCodeBlock
        code={JSON.stringify(part.input, null, 2)}
        language="json"
      />
    )}
    {part.state === 'output-available' && part.output !== undefined && (
      <ResponseCodeBlock
        code={JSON.stringify(part.output, null, 2)}
        language="json"
      />
    )}
    {part.state === 'output-error' && (
      <ResponseCodeBlock code={part.errorText} language="text" />
    )}
  </Disclosure>
)

// A model-written image loads on render, so its URL could carry chat text to any host.
const MODEL_DISALLOWED_ELEMENTS = ['img']

export const MessagePart = ({ part }: { part: AppMessagePart }) => {
  if (isToolUIPart(part) || isDynamicToolUIPart(part)) {
    return <ToolPart part={part} />
  }

  switch (part.type) {
    case 'text': {
      return part.text.trim() ? (
        <Response disallowedElements={MODEL_DISALLOWED_ELEMENTS}>
          {part.text}
        </Response>
      ) : null
    }
    case 'reasoning': {
      return part.text.trim() ? (
        <Disclosure icon={BrainIcon} label="Reasoning">
          <div className="text-muted-foreground">
            <Response disallowedElements={MODEL_DISALLOWED_ELEMENTS}>
              {part.text}
            </Response>
          </div>
        </Disclosure>
      ) : null
    }
    default: {
      return null
    }
  }
}
