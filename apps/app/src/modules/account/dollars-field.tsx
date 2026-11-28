import { CREDIT_TOP_UP } from '@tamery/shared/credits'
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
} from '@tamery/ui/components/number-field'

export const DollarsField = ({
  id,
  min,
  onCommit,
  value,
}: {
  id: string
  min: number
  onCommit: (value: number) => void
  value: number
}) => (
  <NumberField
    id={id}
    size="sm"
    className="w-24"
    defaultValue={value}
    min={min}
    max={CREDIT_TOP_UP.max}
    step={1}
    format={{ currency: 'USD', maximumFractionDigits: 0, style: 'currency' }}
    onValueCommitted={(next) => next !== null && onCommit(next)}
  >
    <NumberFieldGroup>
      <NumberFieldInput />
    </NumberFieldGroup>
  </NumberField>
)
