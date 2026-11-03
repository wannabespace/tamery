import { InlineCode } from '@tamery/ui/components/custom/inline-code'

export const FetchingReason = ({ reason }: { reason: string }) =>
  reason
    .split('`')
    .map((part, index) =>
      index % 2 ? <InlineCode key={index}>{part}</InlineCode> : part
    )
